using System.Net;
using Keytography.Domain;
using Keytography.Tests.TestSupport;
using static Keytography.Tests.TestSupport.SessionTestKit;

namespace Keytography.Tests;

/// <summary>Sessions:* e a configuracao que afeta as sessoes (cada teste sobe a API com a sua).</summary>
public class SessionConfigurationTests
{
    private static ApiFactory Factory(params (string Key, string Value)[] settings) =>
        new(settings.ToDictionary(s => s.Key, s => (string?)s.Value));

    [Fact]
    public async Task Absolute_limit_ends_the_session_even_when_the_idle_window_is_longer()
    {
        using var factory = Factory(("Sessions:IdleHours", "100"), ("Sessions:AbsoluteDays", "1"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");
        var login = await kit.LoginAsync("ana");

        factory.Time.Advance(TimeSpan.FromHours(23));
        Assert.Equal(HttpStatusCode.OK, (await kit.MeAsync(login)).StatusCode);

        factory.Time.Advance(TimeSpan.FromHours(2)); // 25 h: dentro da inatividade (100 h), fora do limite absoluto (24 h)

        Assert.Equal(HttpStatusCode.Unauthorized, (await kit.MeAsync(login)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await kit.SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie)).StatusCode);
    }

    [Fact]
    public async Task Dek_ttl_never_outlives_the_absolute_limit()
    {
        using var factory = Factory(("Sessions:IdleHours", "100"), ("Sessions:AbsoluteDays", "1"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");

        var login = await kit.LoginAsync("ana");

        var ttl = factory.DekCache.SetCalls.Single(c => c.SessionId == login.SessionId).Ttl;
        Assert.InRange(ttl, TimeSpan.FromHours(23.9), TimeSpan.FromHours(24.01));
    }

    [Fact]
    public async Task Access_token_lifetime_follows_the_configuration_without_clock_skew()
    {
        using var factory = Factory(("Sessions:AccessTokenMinutes", "1"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");

        var login = await kit.LoginAsync("ana");

        Assert.InRange(login.ExpiresAt - factory.Time.GetUtcNow(), TimeSpan.FromSeconds(59), TimeSpan.FromSeconds(60));
    }

    [Fact]
    public async Task A_jwt_that_expired_one_second_ago_is_rejected_even_though_its_session_is_valid()
    {
        using var factory = new ApiFactory();
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");
        var login = await kit.LoginAsync("ana");
        var expired = ForgeAccessToken(login.UserId, login.SessionId, DateTime.UtcNow.AddSeconds(-1));

        Assert.Equal(HttpStatusCode.Unauthorized, (await kit.SendAsync(HttpMethod.Get, "/auth/me", expired)).StatusCode);
    }

    [Theory]
    [InlineData("Sessions:AccessTokenMinutes", "0")]
    [InlineData("Sessions:AccessTokenMinutes", "-5")]
    [InlineData("Sessions:AccessTokenMinutes", "100000")]
    [InlineData("Sessions:IdleHours", "0")]
    [InlineData("Sessions:IdleHours", "999999")]
    [InlineData("Sessions:AbsoluteDays", "0")]
    [InlineData("Sessions:AbsoluteDays", "1000000")]
    [InlineData("Sessions:RotationGraceSeconds", "0")]
    [InlineData("Sessions:RotationGraceSeconds", "-1")]
    [InlineData("Sessions:RotationGraceSeconds", "100000")]
    public void Invalid_session_settings_make_the_api_fail_at_startup(string key, string value)
    {
        using var factory = Factory((key, value));

        Assert.ThrowsAny<Exception>(() => factory.CreateClient());
    }

    [Fact]
    public async Task Force_secure_cookie_marks_the_cookie_secure_even_over_http()
    {
        using var factory = Factory(("Sessions:ForceSecureCookie", "true"));
        var kit = new SessionTestKit(factory); // HTTP
        await kit.RegisterAsync("ana", "ana@example.com");

        var login = await kit.LoginAsync("ana");

        Assert.Contains("secure", login.SetCookie.Replace("samesite", ""), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task An_allowed_origin_configured_with_a_trailing_slash_works_for_cors_and_for_the_origin_check()
    {
        using var factory = Factory(("Cors:AllowedOrigins:0", "http://app.example/"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");
        var login = await kit.LoginAsync("ana");

        var refresh = await kit.SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: login.RefreshCookie, origin: "http://app.example");
        var preflight = new HttpRequestMessage(HttpMethod.Options, "/auth/refresh");
        preflight.Headers.Add("Origin", "http://app.example");
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        var preflightResponse = await kit.Client.SendAsync(preflight);

        Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
        Assert.Equal("http://app.example", preflightResponse.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }
}
