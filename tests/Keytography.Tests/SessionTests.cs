using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.Auth;
using Keytography.Domain;
using Keytography.Infrastructure;
using Keytography.Tests.TestSupport;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.DependencyInjection;
using static Keytography.Tests.TestSupport.SessionTestKit;

namespace Keytography.Tests;

/// <summary>
/// Sessoes gerenciadas pelo backend (keytography-016, ADR-0006): access token curto validado
/// contra a sessao, refresh rotativo em cookie HttpOnly, logout/revogacao e DEK por sessao.
/// </summary>
public class SessionTests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ApiFactory _factory = new();
    private readonly SessionTestKit _kit;

    public SessionTests()
    {
        _kit = new SessionTestKit(_factory);
    }

    public void Dispose() => _factory.Dispose();

    private Task RegisterAsync(string login, string email) => _kit.RegisterAsync(login, email);
    private Task<Login> LoginAsync(string login) => _kit.LoginAsync(login);
    private Task<HttpResponseMessage> MeAsync(Login login) => _kit.MeAsync(login);
    private Task<UserSession> LoadSessionAsync(Guid id) => _kit.LoadSessionAsync(id);

    private Task<HttpResponseMessage> SendAsync(
        HttpMethod method, string url, string? accessToken = null, string? refreshCookie = null, string? origin = null) =>
        _kit.SendAsync(method, url, accessToken, refreshCookie, origin);

    private static string? NewCookieOf(HttpResponseMessage response) => ReadRefreshCookie(response).Value;

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
    public async Task Refresh_cookie_expires_with_the_idle_expiry_of_the_session_and_is_not_secure_over_http()
    {
        await RegisterAsync("ana", "ana@example.com");

        var login = await LoginAsync("ana");

        var session = await LoadSessionAsync(login.SessionId);
        var expires = DateTimeOffset.Parse(
            login.SetCookie.Split(';').Select(p => p.Trim()).First(p => p.StartsWith("expires=", StringComparison.OrdinalIgnoreCase))[8..]);
        Assert.InRange((expires - session.IdleExpiresAt).Duration(), TimeSpan.Zero, TimeSpan.FromSeconds(1));
        Assert.DoesNotContain("secure", login.SetCookie.Replace("samesite", ""), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Refresh_cookie_is_secure_when_the_request_arrives_over_https()
    {
        var httpsKit = new SessionTestKit(_factory, https: true);
        await httpsKit.RegisterAsync("ana", "ana@example.com");

        var login = await httpsKit.LoginAsync("ana");

        Assert.Contains("secure", login.SetCookie.Replace("samesite", ""), StringComparison.OrdinalIgnoreCase);
    }

    // --- validacao por sessao ----------------------------------------------------------------

    [Fact]
    public async Task Token_without_a_session_claim_is_rejected()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var forged = ForgeAccessToken(login.UserId, sessionId: null, DateTime.UtcNow.AddMinutes(5));

        Assert.Equal(HttpStatusCode.Unauthorized, (await SendAsync(HttpMethod.Get, "/auth/me", forged)).StatusCode);
    }

    [Fact]
    public async Task Token_naming_a_session_of_another_user_is_rejected()
    {
        await RegisterAsync("ana", "ana@example.com");
        await RegisterAsync("bia", "bia@example.com");
        var ana = await LoginAsync("ana");
        var bia = await LoginAsync("bia");
        // Assinado com a chave certa, mas com o "sub" de uma e o "sid" de outra.
        var forged = ForgeAccessToken(bia.UserId, ana.SessionId, DateTime.UtcNow.AddMinutes(5));

        Assert.Equal(HttpStatusCode.Unauthorized, (await SendAsync(HttpMethod.Get, "/auth/me", forged)).StatusCode);
    }

    [Fact]
    public async Task Deleting_the_user_ends_its_sessions_immediately()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        await using (var scope = _factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
            await db.Users.Where(u => u.Id == login.UserId).ExecuteDeleteAsync();
        }

        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(login)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie)).StatusCode);
    }

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
    public async Task Idle_expiry_never_goes_past_the_absolute_limit_even_with_continuous_refresh()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var cookie = login.RefreshCookie;

        // Refresh a cada 11 horas mantem a sessao viva por inatividade ate o limite absoluto (168 h).
        for (var i = 0; i < 16; i++)
        {
            _factory.Time.Advance(TimeSpan.FromHours(11));
            var refresh = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: cookie);
            var session = await LoadSessionAsync(login.SessionId);
            Assert.True(session.IdleExpiresAt <= session.AbsoluteExpiresAt, "A inatividade passou do limite absoluto.");

            if (refresh.StatusCode != HttpStatusCode.OK)
            {
                Assert.True(_factory.Time.GetUtcNow() >= session.AbsoluteExpiresAt, "A sessão terminou antes do limite absoluto.");
                Assert.Equal(HttpStatusCode.Unauthorized, refresh.StatusCode);
                return;
            }

            cookie = NewCookieOf(refresh)!;
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

        var response = await MeAsync(login);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        // A resposta nao conta por que a sessao deixou de valer.
        var challenge = string.Join(" ", response.Headers.WwwAuthenticate.Select(h => h.ToString()));
        Assert.DoesNotContain("revog", challenge, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("sess", challenge, StringComparison.OrdinalIgnoreCase);
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
    public async Task Simultaneous_refreshes_with_the_same_cookie_rotate_only_once_and_never_lock_the_user_out()
    {
        await RegisterAsync("ana", "ana@example.com");

        // Varias rodadas: a corrida e probabilistica, e a falha antiga aparecia em quase todas.
        for (var round = 0; round < 5; round++)
        {
            var login = await LoginAsync("ana");

            var responses = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ =>
                SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie)));

            Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
            var rotatedCookies = responses.Select(NewCookieOf).Where(c => c is not null).ToList();
            Assert.Single(rotatedCookies); // so um vencedor rotaciona; os demais caem na tolerancia

            var session = await LoadSessionAsync(login.SessionId);
            Assert.Null(session.RevokedAt);
            // O cookie que o navegador guardaria (o do vencedor) continua funcionando.
            var next = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: rotatedCookies[0]);
            Assert.Equal(HttpStatusCode.OK, next.StatusCode);
        }
    }

    [Fact]
    public async Task Old_refresh_token_after_the_grace_window_is_rejected_and_revokes_the_session_and_the_dek()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var rotated = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);
        var newCookie = NewCookieOf(rotated)!;
        _factory.Time.Advance(TimeSpan.FromSeconds(11));

        var reuse = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);

        Assert.Equal(HttpStatusCode.Unauthorized, reuse.StatusCode);
        var session = await LoadSessionAsync(login.SessionId);
        Assert.NotNull(session.RevokedAt);
        Assert.Equal(SessionRevocationReason.ReuseDetected, session.RevokedReason);
        Assert.Null(_factory.DekCache.Get(login.SessionId));
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
        var currentCookie = NewCookieOf(first)!;
        _factory.Time.Advance(TimeSpan.FromSeconds(5));

        var simultaneous = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);

        Assert.Equal(HttpStatusCode.OK, simultaneous.StatusCode);
        Assert.Null(NewCookieOf(simultaneous));
        Assert.Null((await LoadSessionAsync(login.SessionId)).RevokedAt);
        // O cookie atual (o que o navegador recebeu da primeira resposta) continua valendo.
        Assert.Equal(HttpStatusCode.OK,
            (await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: currentCookie)).StatusCode);
    }

    [Fact]
    public async Task A_logout_that_lands_between_the_dek_renewal_and_its_check_does_not_leave_the_dek_in_memory()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");

        // Simula o pior intercalamento: o logout revoga a sessao (e remove a DEK) ANTES de o refresh
        // recolocar a DEK no cache - o Set do refresh "ressuscitaria" a DEK de uma sessao revogada.
        _factory.DekCache.AfterSet = sessionId =>
        {
            using var scope = _factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
            var now = _factory.Time.GetUtcNow();
            db.UserSessions.Where(s => s.Id == sessionId)
                .ExecuteUpdate(set => set.SetProperty(s => s.RevokedAt, (DateTimeOffset?)now));
            _factory.DekCache.AfterSet = null;
        };

        var refresh = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);

        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        Assert.NotNull((await LoadSessionAsync(login.SessionId)).RevokedAt);
        Assert.Null(_factory.DekCache.Get(login.SessionId));
    }

    [Fact]
    public async Task Concurrent_refresh_and_logout_always_end_with_a_revoked_session_and_no_dek()
    {
        await RegisterAsync("ana", "ana@example.com");

        for (var round = 0; round < 20; round++)
        {
            var login = await LoginAsync("ana");

            await Task.WhenAll(
                SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie),
                SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: login.RefreshCookie),
                SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie));

            Assert.NotNull((await LoadSessionAsync(login.SessionId)).RevokedAt);
            Assert.Null(_factory.DekCache.Get(login.SessionId));
        }
    }

    [Fact]
    public async Task Concurrent_reuse_of_an_old_token_after_the_grace_window_is_rejected_for_everyone_and_revokes_once()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);
        _factory.Time.Advance(TimeSpan.FromSeconds(11));

        var responses = await Task.WhenAll(Enumerable.Range(0, 8).Select(_ =>
            SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie)));

        Assert.All(responses, r => Assert.Equal(HttpStatusCode.Unauthorized, r.StatusCode));
        var session = await LoadSessionAsync(login.SessionId);
        Assert.Equal(SessionRevocationReason.ReuseDetected, session.RevokedReason);
        Assert.Null(_factory.DekCache.Get(login.SessionId));
    }

    [Fact]
    public async Task A_lost_refresh_response_costs_the_session_after_the_grace_window_but_never_grants_access()
    {
        // Documenta a limitacao do ADR-0006: o servidor rotacionou A para B, mas a resposta (e o
        // cookie B) nunca chegou; o cliente segue repetindo com A.
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie); // resposta "perdida"

        var retryWithinGrace = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);
        Assert.Equal(HttpStatusCode.OK, retryWithinGrace.StatusCode);
        Assert.Null(NewCookieOf(retryWithinGrace));

        _factory.Time.Advance(TimeSpan.FromSeconds(11));
        var retryAfterGrace = await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie);

        Assert.Equal(HttpStatusCode.Unauthorized, retryAfterGrace.StatusCode);
        Assert.NotNull((await LoadSessionAsync(login.SessionId)).RevokedAt);
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
        Assert.Equal(HttpStatusCode.Created, (await _kit.CreateVaultEntryAsync(login)).StatusCode);

        var logout = await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: login.RefreshCookie, origin: AllowedOrigin);

        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var (cleared, setCookie) = ReadRefreshCookie(logout);
        Assert.Null(cleared);
        Assert.Contains("expires=", setCookie!, StringComparison.OrdinalIgnoreCase);
        var session = await LoadSessionAsync(login.SessionId);
        Assert.Equal(SessionRevocationReason.Logout, session.RevokedReason);
        Assert.Null(_factory.DekCache.Get(login.SessionId));
        Assert.Equal(HttpStatusCode.Unauthorized, (await SendAsync(HttpMethod.Get, "/vault/entries", login.AccessToken)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _kit.CreateVaultEntryAsync(login)).StatusCode);
    }

    [Fact]
    public async Task Logout_is_idempotent_and_also_works_with_only_a_valid_access_token()
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
    public async Task Logout_with_only_an_expired_access_token_revokes_nothing_but_the_cookie_still_does()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");
        var expired = ForgeAccessToken(login.UserId, login.SessionId, DateTime.UtcNow.AddMinutes(-5));

        // So com o token vencido o endpoint nao sabe quem e: 204, mas a sessao segue ativa.
        var tokenOnly = await SendAsync(HttpMethod.Post, "/auth/logout", accessToken: expired);
        Assert.Equal(HttpStatusCode.NoContent, tokenOnly.StatusCode);
        Assert.Null((await LoadSessionAsync(login.SessionId)).RevokedAt);

        // O cookie e o canal confiavel: revoga mesmo com o access token vencido.
        var withCookie = await SendAsync(HttpMethod.Post, "/auth/logout", accessToken: expired, refreshCookie: login.RefreshCookie);
        Assert.Equal(HttpStatusCode.NoContent, withCookie.StatusCode);
        Assert.NotNull((await LoadSessionAsync(login.SessionId)).RevokedAt);
    }

    [Fact]
    public async Task Logging_out_one_session_keeps_the_vault_of_the_other_one_open()
    {
        await RegisterAsync("ana", "ana@example.com");
        var first = await LoginAsync("ana");
        var second = await LoginAsync("ana");
        Assert.NotEqual(first.SessionId, second.SessionId);

        await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: first.RefreshCookie);

        Assert.Equal(HttpStatusCode.Unauthorized, (await _kit.CreateVaultEntryAsync(first)).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await _kit.CreateVaultEntryAsync(second)).StatusCode);
    }

    [Fact]
    public async Task Each_login_gets_its_own_dek_entry_in_cache()
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
    public async Task Completing_a_password_reset_revokes_all_sessions_and_deks_of_the_user_in_one_save()
    {
        await RegisterAsync("ana", "ana@example.com");
        var one = await LoginAsync("ana");
        var two = await LoginAsync("ana");
        await _kit.Client.PostAsJsonAsync("/auth/forgot-password", new ForgotPasswordRequest("ana@example.com"));
        var resetToken = AuthTestHelper.ExtractToken(
            _factory.EmailSender.SentEmails.Last(e => e.Subject.Contains("Redefinição")).Body);

        var reset = await _kit.Client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "nova-senha-123"));

        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(one)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await MeAsync(two)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: one.RefreshCookie)).StatusCode);
        var revoked = await LoadSessionAsync(one.SessionId);
        Assert.Equal(SessionRevocationReason.PasswordReset, revoked.RevokedReason);
        Assert.Null(_factory.DekCache.Get(one.SessionId));
        Assert.Null(_factory.DekCache.Get(two.SessionId));
    }

    [Fact]
    public async Task A_failed_password_reset_does_not_touch_the_sessions()
    {
        await RegisterAsync("ana", "ana@example.com");
        var login = await LoginAsync("ana");

        var reset = await _kit.Client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest("token-invalido", "nova-senha-123"));

        Assert.Equal(HttpStatusCode.BadRequest, reset.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await MeAsync(login)).StatusCode);
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
        var otherPort = await SendAsync(HttpMethod.Post, url, refreshCookie: login.RefreshCookie, origin: "http://localhost:9999");

        Assert.Equal(HttpStatusCode.Forbidden, evil.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, nullOrigin.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, otherPort.StatusCode);
        // Nada aconteceu com a sessao.
        Assert.Equal(HttpStatusCode.OK, (await MeAsync(login)).StatusCode);
    }

    [Fact]
    public async Task Preflight_with_credentials_is_accepted_for_an_allowed_origin()
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/auth/refresh");
        request.Headers.Add("Origin", AllowedOrigin);
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await _kit.Client.SendAsync(request);

        Assert.True(response.IsSuccessStatusCode);
        Assert.Equal(AllowedOrigin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
        Assert.Equal("true", response.Headers.GetValues("Access-Control-Allow-Credentials").Single());
    }

    // --- banco ---------------------------------------------------------------------------------

    [Fact]
    public async Task Sessions_revoked_more_than_thirty_days_ago_are_removed_when_a_new_session_is_created()
    {
        await RegisterAsync("ana", "ana@example.com");
        var old = await LoginAsync("ana");
        await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: old.RefreshCookie);
        _factory.Time.Advance(TimeSpan.FromDays(31));

        var fresh = await LoginAsync("ana");

        await AssertOnlySessionAsync(fresh.SessionId);
    }

    [Fact]
    public async Task Sessions_expired_more_than_thirty_days_ago_are_removed_even_if_never_revoked()
    {
        await RegisterAsync("ana", "ana@example.com");
        await LoginAsync("ana"); // nunca revogada: so expira (limite de 7 dias)
        _factory.Time.Advance(TimeSpan.FromDays(38)); // 7 dias de vida + mais de 30 dias encerrada

        var fresh = await LoginAsync("ana");

        await AssertOnlySessionAsync(fresh.SessionId);
    }

    [Fact]
    public async Task Sessions_ended_less_than_thirty_days_ago_are_kept()
    {
        await RegisterAsync("ana", "ana@example.com");
        var old = await LoginAsync("ana");
        await SendAsync(HttpMethod.Post, "/auth/logout", refreshCookie: old.RefreshCookie);
        _factory.Time.Advance(TimeSpan.FromDays(10));

        var fresh = await LoginAsync("ana");

        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
        var ids = await db.UserSessions.Select(s => s.Id).ToListAsync();
        Assert.Equal(2, ids.Count);
        Assert.Contains(fresh.SessionId, ids);
    }

    private async Task AssertOnlySessionAsync(Guid expected)
    {
        await using var scope = _factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
        var ids = await db.UserSessions.Select(s => s.Id).ToListAsync();
        Assert.Equal([expected], ids);
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
