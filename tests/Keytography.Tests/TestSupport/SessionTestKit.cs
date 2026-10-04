using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Keytography.Api.Auth;
using Keytography.Api.Vault;
using Keytography.Domain;
using Keytography.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace Keytography.Tests.TestSupport;

/// <summary>
/// Ferramentas dos testes de sessao. O cliente NAO guarda cookies sozinho (HandleCookies = false):
/// cada teste mostra explicitamente qual cookie de refresh esta enviando.
/// </summary>
public sealed class SessionTestKit
{
    public const string Password = "supersecret1";
    public const string AllowedOrigin = "http://localhost:5173";
    public const string TestSigningKey = "test-only-signing-key-0123456789-0123456789-0123456789";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public SessionTestKit(ApiFactory factory, bool https = false)
    {
        Factory = factory;
        Client = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            HandleCookies = false,
            BaseAddress = new Uri(https ? "https://localhost" : "http://localhost")
        });
    }

    public ApiFactory Factory { get; }
    public HttpClient Client { get; }

    public sealed record Login(string AccessToken, DateTimeOffset ExpiresAt, string RefreshCookie, string SetCookie)
    {
        public Guid SessionId => Guid.Parse(new JwtSecurityTokenHandler().ReadJwtToken(AccessToken).Claims
            .First(c => c.Type == JwtRegisteredClaimNames.Sid).Value);

        public Guid UserId => Guid.Parse(new JwtSecurityTokenHandler().ReadJwtToken(AccessToken).Claims
            .First(c => c.Type == JwtRegisteredClaimNames.Sub).Value);
    }

    public async Task RegisterAsync(string login, string email)
    {
        (await Client.PostAsJsonAsync("/auth/register", new RegisterRequest(login, email, Password))).EnsureSuccessStatusCode();
        var token = AuthTestHelper.ExtractToken(Factory.EmailSender.SentEmails.Last(e => e.ToEmail == email).Body);
        (await Client.PostAsJsonAsync("/auth/verify-email", new VerifyEmailRequest(token))).EnsureSuccessStatusCode();
    }

    public async Task<Login> LoginAsync(string login)
    {
        var response = await Client.PostAsJsonAsync("/auth/login", new LoginRequest(login, Password));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);
        var (cookie, setCookie) = ReadRefreshCookie(response);
        return new Login(body!.Token, body.ExpiresAt, cookie!, setCookie!);
    }

    public static (string? Value, string? Raw) ReadRefreshCookie(HttpResponseMessage response)
    {
        var raw = response.Headers.TryGetValues("Set-Cookie", out var values)
            ? values.FirstOrDefault(v => v.StartsWith(SessionService.RefreshCookieName + "=", StringComparison.Ordinal))
            : null;
        var value = raw?[(SessionService.RefreshCookieName.Length + 1)..].Split(';')[0];
        return (string.IsNullOrEmpty(value) ? null : value, raw);
    }

    public Task<HttpResponseMessage> SendAsync(
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

        return Client.SendAsync(request);
    }

    public Task<HttpResponseMessage> MeAsync(Login login) => SendAsync(HttpMethod.Get, "/auth/me", login.AccessToken);

    public async Task<UserSession> LoadSessionAsync(Guid sessionId)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
        return await db.UserSessions.AsNoTracking().SingleAsync(s => s.Id == sessionId);
    }

    public async Task<HttpResponseMessage> CreateVaultEntryAsync(Login login)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/vault/entries")
        {
            Content = JsonContent.Create(new CreateVaultEntryRequest("titulo", "login", "senha-da-conta", null))
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", login.AccessToken);
        return await Client.SendAsync(request);
    }

    /// <summary>JWT assinado com a chave de teste (valido para a API), com os claims informados.</summary>
    public static string ForgeAccessToken(Guid userId, Guid? sessionId, DateTime expiresUtc, string role = "Member")
    {
        var claims = new List<System.Security.Claims.Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new("login", "forjado"),
            new(System.Security.Claims.ClaimTypes.Role, role)
        };
        if (sessionId is { } sid)
        {
            claims.Add(new(JwtRegisteredClaimNames.Sid, sid.ToString()));
        }

        var token = new JwtSecurityToken(
            "Keytography.Tests", "Keytography.Tests", claims,
            notBefore: expiresUtc.AddHours(-1), expires: expiresUtc,
            signingCredentials: new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestSigningKey)), SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
