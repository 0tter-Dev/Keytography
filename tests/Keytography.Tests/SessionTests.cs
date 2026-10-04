using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.Auth;
using Keytography.Api.Vault;
using Keytography.Domain;
using Keytography.Infrastructure;
using Keytography.Tests.TestSupport;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;

namespace Keytography.Tests;

/// <summary>
/// Sessoes gerenciadas pelo backend (keytography-016, ADR-0006): access token curto validado
/// contra a sessao, refresh rotativo em cookie HttpOnly, logout/revogacao e DEK por sessao.
/// Os clientes aqui nao guardam cookies sozinhos (HandleCookies = false): cada teste mostra
/// explicitamente qual cookie de refresh esta enviando.
/// </summary>
public class SessionTests : IDisposable
{
    private const string Password = "supersecret1";
    private const string AllowedOrigin = "http://localhost:5173";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ApiFactory _factory = new();
    private readonly HttpClient _client;

    public SessionTests()
    {
        _client = _factory.CreateClient(new WebApplicationFactoryClientOptions { HandleCookies = false });
    }

    public void Dispose() => _factory.Dispose();

    private sealed record Login(string AccessToken, DateTimeOffset ExpiresAt, string RefreshCookie, string SetCookie)
    {
        public Guid SessionId => Guid.Parse(new JwtSecurityTokenHandler().ReadJwtToken(AccessToken).Claims
            .First(c => c.Type == JwtRegisteredClaimNames.Sid).Value);
    }

    private async Task RegisterAsync(string login, string email)
    {
        (await _client.PostAsJsonAsync("/auth/register", new RegisterRequest(login, email, Password))).EnsureSuccessStatusCode();
        var token = AuthTestHelper.ExtractToken(_factory.EmailSender.SentEmails.Last(e => e.ToEmail == email).Body);
        (await _client.PostAsJsonAsync("/auth/verify-email", new VerifyEmailRequest(token))).EnsureSuccessStatusCode();
    }

    private async Task<Login> LoginAsync(string login)
    {
        var response = await _client.PostAsJsonAsync("/auth/login", new LoginRequest(login, Password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);
        var (cookie, setCookie) = ReadRefreshCookie(response);
        return new Login(body!.Token, body.ExpiresAt, cookie!, setCookie!);
    }

    private static (string? Value, string? Raw) ReadRefreshCookie(HttpResponseMessage response)
    {
        var raw = response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.FirstOrDefault(v => v.StartsWith(SessionService.RefreshCookieName + "=", StringComparison.Ordinal))
            : null;
        var value = raw?[(SessionService.RefreshCookieName.Length + 1)..].Split(';')[0];
        return (string.IsNullOrEmpty(value) ? null : value, raw);
    }

    private Task<HttpResponseMessage> SendAsync(
        HttpMethod method, string url, string? accessToken = null, string? refreshCookie = null, string? origin = null)
    {
        var request = new HttpRequestMessage(method, url);
        if (accessToken is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        }

        if (refreshCookie is not null)
        {
            request.Headers.Add("Cookie", $"{SessionService.RefreshCookieName}={refreshCookie}");
        }

        if (origin is not null)
        {
            request.Headers.Add("Origin", origin);
        }

        return _client.SendAsync(request);
    }

    private Task<HttpResponseMessage> MeAsync(Login login) => SendAsync(HttpMethod.Get, "/auth/me", login.AccessToken);

    private async Task<UserSession> LoadSessionAsync(Guid sessionId)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
        return await db.UserSessions.AsNoTracking().SingleAsync(s => s.Id == sessionId);
    }

    private async Task<HttpResponseMessage> CreateVaultEntryAsync(Login login) =>
        await SendWithBodyAsync(HttpMethod.Post, "/vault/entries", login.AccessToken,
            new CreateVaultEntryRequest("titulo", "login", "senha-da-conta", null));

    private Task<HttpResponseMessage> SendWithBodyAsync<T>(HttpMethod method, string url, string accessToken, T body)
    {
        var request = new HttpRequestMessage(method, url) { Content = JsonContent.Create(body) };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return _client.SendAsync(request);
    }

    // --- login -----------------------------------------------------------------------------

    [Fact]
    public async Task Login_returns_short_access_token_and_httponly_strict_refresh_cookie_and_stores_only_a_hash()
    {
        await RegisterAsync("ana", "ana@example.com");

        var login = await LoginAsync("ana");

        Assert.Contains("httponly", login.SetCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", login.SetCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("path=/auth", login.SetCookie, StringComparison.OrdinalIgnoreCase);
        Assert.InRange(login.ExpiresAt - _factory.Time.GetUtcNow(), TimeSpan.FromMinutes(14), TimeSpan.FromMinutes(15));

        var session = await LoadSessionAsync(login.SessionId);
        Assert.NotEqual(login.RefreshCookie, session.RefreshTokenHash);
        Assert.DoesNotContain(login.RefreshCookie, session.RefreshTokenHash, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.OK, (await MeAsync(login)).StatusCode);
    }

    [Fact]
    public async Task Token_without_a_session_claim_is_rejected()
    {
        // JWT assinado com a chave certa, mas sem "sid" (como os emitidos antes das sessoes).
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var handler = new JwtSecurityTokenHandler();
        var original = handler.ReadJwtToken(login.AccessToken);
        var withoutSid = new JwtSecurityToken(
            original.Issuer, original.Audiences.First(),
            original.Claims.Where(c => c.Type != JwtRegisteredClaimNames.Sid),
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: new Microsoft.IdentityModel.Tokens.SigningCredentials(
                new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(
                    System.Text.Encoding.UTF8.GetBytes("test-only-signing-key-0123456789-0123456789-0123456789")),
                Microsoft.IdentityModel.Tokens.SecurityAlgorithms.HmacSha256));

        var response = await SendAsync(HttpMethod.Get, "/auth/me", handler.WriteToken(withoutSid));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    // --- validacao por sessao ----------------------------------------------------------------

    [Fact]
    public async Task Access_token_stops_working_the_moment_its_session_expires_by_inactivity()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        Assert.Equal(HttpStatusCode.OK, (await MeAsync(login)).StatusCode);

        _factory.Time.Advance(TimeSpan.FromHours(12).Add(TimeSpan.FromSeconds(1)));

        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(login)).StatusCode);
        var refresh = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
    }

    [Fact]
    public async Task Session_ends_at_the_absolute_limit_even_with_continuous_refresh()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var cookie = login.RefreshCookie;

        // Refresh a cada 11 horas mantem a sessao viva por inatividade...
        for (var i = 0; i < 16; i++)
        {
            _factory.Time.Advance(TimeSpan.FromHours(11));
            var refresh = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: cookie);
            if (refresh.StatusCode != HttpStatusCode.OK)
            {
                // ...ate o limite absoluto de 7 dias (168 h): o refresh deixa de funcionar.
                Assert.True((i + 1) * 11 >= 168 - 11, $"Sessão terminou cedo demais (iteração {i + 1}).");
                Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
                var session = await LoadSessionAsync(login.SessionId);
                Assert.True(_factory.Time.GetUtcNow() >= session.AbsoluteExpiresAt || session.IdleExpiresAt <= _factory.Time.GetUtcNow());
                return;
            }

            cookie = ReadRefreshCookie(refresh).Value!;
        }

        Assert.Fail("A sessão não terminou no limite absoluto.");
    }

    [Fact]
    public async Task Revoked_session_makes_the_access_token_fail_immediately_before_the_jwt_expires()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        Assert.True(login.ExpiresAt > _factory.Time.GetUtcNow().AddMinutes(10));

        await SendAsync(HttpMethod.Post, "/auth/logout", login.AccessToken);

        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(login)).StatusCode);
    }

    // --- refresh -----------------------------------------------------------------------------

    [Fact]
    public async Task Refresh_rotates_the_cookie_and_issues_a_working_access_token()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");

        var refresh = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie, origin: AllowedOrigin);

        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        var body = await refresh.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);
        var (newCookie, setCookie) = ReadRefreshCookie(refresh);
        Assert.NotNull(newCookie);
        Assert.NotEqual(login.RefreshCookie, newCookie);
        Assert.Contains("httponly", setCookie!, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(HttpStatusCode.OK, (await SendAsync(HttpMethod.Get, "/auth/me", body!.Token)).StatusCode);
    }

    [Fact]
    public async Task Old_refresh_token_after_the_grace_window_is_rejected_and_revokes_the_session()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var rotated = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);
        var newCookie = ReadRefreshCookie(rotated).Value!;
        _factory.Time.Advance(TimeSpan.FromSeconds(11));

        var reuse = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);

        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);
        var session = await LoadSessionAsync(login.SessionId);
        Assert.NotNull(session.RevokedAt);
        Assert.Equal(SessionRevocationReason.ReuseDetected, session.RevokedReason);
        // Nem o access token da sessao nem o refresh token "novo" valem mais.
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(login)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: newCookie)).StatusCode);
    }

    [Fact]
    public async Task Old_refresh_token_within_the_grace_window_gets_an_access_token_without_rotating_again()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var first = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);
        var currentCookie = ReadRefreshCookie(first).Value!;
        _factory.Time.Advance(TimeSpan.FromSeconds(5));

        var simultaneous = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);

        Assert.Equal(HttpStatusCode.OK, simultaneous.StatusCode);
        Assert.Null(ReadRefreshCookie(simultaneous).Value);
        var session = await LoadSessionAsync(login.SessionId);
        Assert.Null(session.RevokedAt);
        // O cookie atual (o que o navegador recebeu da primeira resposta) continua valendo.
        Assert.Equal(HttpStatusCode.OK,
            (await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: currentCookie)).StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("valor-que-nao-existe")]
    public async Task Refresh_without_a_valid_cookie_returns_401(string? cookie)
    {
        var response = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: cookie);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Refresh_of_a_revoked_session_returns_401_with_the_same_empty_answer()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: login.RefreshCookie);

        var revoked = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);
        var unknown = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: "desconhecido");

        Assert.Equal(HttpStatusCode.Unauthorized, revoked.StatusCode);
        Assert.Equal(await unknown.Content.ReadAsStringAsync(), await revoked.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Refresh_renews_the_idle_expiry_and_the_dek_ttl()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var before = await LoadSessionAsync(login.SessionId);
        _factory.Time.Advance(TimeSpan.FromHours(6));

        await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);

        var after = await LoadSessionAsync(login.SessionId);
        Assert.Equal(before.IdleExpiresAt + TimeSpan.FromHours(6), after.IdleExpiresAt);
        var renewals = _factory.DekCache.SetCalls.Where(c => c.SessionId == login.SessionId).ToList();
        Assert.Equal(2, renewals.Count);
        Assert.InRange(renewals[1].Ttl, TimeSpan.FromHours(11.9), TimeSpan.FromHours(12.01));
    }

    // --- logout --------------------------------------------------------------------------------

    [Fact]
    public async Task Logout_returns_204_revokes_the_session_clears_the_cookie_and_locks_the_vault()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        Assert.Equal(HttpStatusCode.Created, (await CreateVaultEntryAsync(login)).StatusCode);

        var logout = await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: login.RefreshCookie, origin: AllowedOrigin);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var (cleared, setCookie) = ReadRefreshCookie(logout);
        Assert.Null(cleared);
        Assert.Contains("expires=", setCookie!, StringComparison.OrdinalIgnoreCase);
        var session = await LoadSessionAsync(login.SessionId);
        Assert.Equal(SessionRevocationReason.Logout, session.RevokedReason);
        Assert.Null(_factory.DekCache.Get(login.SessionId));
        Assert.Equal(HttpStatusCode.Unauthorized, (await SendAsync(HttpMethod.Get, "/vault/entries", login.AccessToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await CreateVaultEntryAsync(login)).StatusCode);
    }

    [Fact]
    public async Task Logout_is_idempotent_and_also_works_with_only_the_access_token()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");

        var withToken = await SendAsync(HttpMethod.Post, "/auth/logout", accessToken: login.AccessToken);
        var again = await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: login.RefreshCookie);
        var anonymous = await SendAsync(HttpMethod.Post, "/auth/logout");

        Assert.Equal(HttpStatusCode.NoContent, withToken.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, again.StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, anonymous.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(login)).StatusCode);
    }

    [Fact]
    public async Task Logging_out_one_session_keeps_the_vault_of_the_other_one_open()
    {
        await RegisterAsync("ana", "ana@example.com");
        var first = await LoginAsync("ana");
        var second = await LoginAsync("ana");
        Assert.NotEqual(first.SessionId, second.SessionId);

        await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: first.RefreshCookie);

        Assert.Equal(HttpStatusCode.Unauthorized, (await CreateVaultEntryAsync(first)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await CreateVaultEntryAsync(second)).StatusCode);
    }

    [Fact]
    public async Task Each_login_gets_an_independent_dek_in_cache()
    {
        await RegisterAsync("ana", "ana@example.com");
        var first = await LoginAsync("ana");
        var second = await LoginAsync("ana");

        var dekFirst = _factory.DekCache.Get(first.SessionId);
        var dekSecond = _factory.DekCache.Get(second.SessionId);

        Assert.NotNull(dekFirst);
        Assert.Equal(dekFirst, dekSecond); // mesma DEK do usuario...
        _factory.DekCache.Remove(first.SessionId);
        Assert.NotNull(_factory.DekCache.Get(second.SessionId)); // ...em entradas de cache independentes
    }

    [Fact]
    public async Task Logout_all_revokes_every_session_of_the_user_and_leaves_other_users_alone()
    {
        await RegisterAsync("ana", "ana@example.com");
        await RegisterAsync("bia", "bia@example.com");
        var anaOne = await LoginAsync("ana");
        var anaTwo = await LoginAsync("ana");
        var bia = await LoginAsync("bia");

        var response = await SendAsync(HttpMethod.Post, "/auth/logout-all", anaOne.AccessToken);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(anaOne)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(anaTwo)).StatusCode);
        Assert.Null(_factory.DekCache.Get(anaTwo.SessionId));
        Assert.Equal(HttpStatusCode.OK, (await MeAsync(bia)).StatusCode);
        Assert.NotNull(_factory.DekCache.Get(bia.SessionId));
        Assert.Equal(SessionRevocationReason.LogoutAll, (await LoadSessionAsync(anaTwo.SessionId)).RevokedReason);
    }

    [Fact]
    public async Task Logout_all_requires_authentication()
    {
        var response = await SendAsync(HttpMethod.Post, "/auth/logout-all");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Completing_a_password_reset_revokes_all_sessions_of_the_user()
    {
        await RegisterAsync("ana", "ana@example.com");
        var one = await LoginAsync("ana");
        var two = await LoginAsync("ana");
        await _client.PostAsJsonAsync("/auth/forgot-password", new ForgotPasswordRequest("ana@example.com"));
        var resetToken = AuthTestHelper.ExtractToken(
            _factory.EmailSender.SentEmails.Last(e => e.Subject.Contains("Redefinição")).Body);

        var reset = await _client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "nova-senha-123"));

        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(one)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(two)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: one.RefreshCookie)).StatusCode);
        Assert.Equal(SessionRevocationReason.PasswordReset, (await LoadSessionAsync(one.SessionId)).RevokedReason);
    }

    // --- CSRF e CORS ---------------------------------------------------------------------------

    [Theory]
    [InlineData("/auth/refresh")]
    [InlineData("/auth/logout")]
    public async Task Cookie_endpoints_reject_an_origin_outside_the_allowed_list(string url)
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");

        var evil = await SendAsync(HttpMethod.Post, url, refreshCookie: login.RefreshCookie, origin: "http://evil.example");
        var nullOrigin = await SendAsync(HttpMethod.Post, url, refreshCookie: login.RefreshCookie, origin: "null");

        Assert.Equal(HttpStatusCode.Forbidden, evil.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, nullOrigin.StatusCode);
        // Nada aconteceu com a sessao.
        Assert.Equal(HttpStatusCode.OK, (await MeAsync(login)).StatusCode);
    }

    [Fact]
    public async Task Preflight_with_credentials_is_accepted_for_an_allowed_origin()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/auth/refresh");
        request.Headers.Add("Origin", AllowedOrigin);
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await _client.SendAsync(request);

        Assert.True(response.IsSuccessStatusCode);
        Assert.Equal(AllowedOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Credentials").Single());
    }

    // --- banco ---------------------------------------------------------------------------------

    [Fact]
    public async Task Sessions_ended_more_than_thirty_days_ago_are_removed_when_a_new_session_is_created()
    {
        await RegisterAsync("ana", "ana@example.com");
        var old = await LoginAsync("ana");
        await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: old.RefreshCookie);
        _factory.Time.Advance(TimeSpan.FromDays(31));

        var fresh = await LoginAsync("ana");

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
        var ids = await db.UserSessions.Select(s => s.Id).ToListAsync();
        Assert.Equal([fresh.SessionId], ids);
    }

    [Fact]
    public async Task Migration_applies_over_an_existing_database_without_losing_data()
    {
        var path = Path.Combine(Path.GetTempPath(), $"keytography-migration-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<KeytographyDbContext>()
                .UseSqlite($"Data Source={path}").Options;

            await using (var before = new KeytographyDbContext(options))
            {
                // Estado do banco antes das sessoes (ultima migration anterior a AddUserSessions).
                await before.GetService<IMigrator>().MigrateAsync("20260930051940_AddVaultEntryPasswordScore");
                await before.Database.ExecuteSqlRawAsync(
                    "INSERT INTO Users (Id, Login, Email, PasswordHash, Role, EmailVerified, CreatedAt) " +
                    "VALUES ('11111111-1111-1111-1111-111111111111', 'antigo', 'antigo@example.com', 'hash', 0, 1, '2026-09-30 00:00:00')");
            }

            await using (var after = new KeytographyDbContext(options))
            {
                await after.Database.MigrateAsync();

                Assert.Equal("antigo", (await after.Users.SingleAsync()).Login);
                Assert.Empty(await after.UserSessions.ToListAsync());
            }
        }
        finally
        {
            Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
            File.Delete(path);
        }
    }
}
