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
    [InlineData("Sessions:MaxSessionsPerMember", "0")]
    [InlineData("Sessions:MaxSessionsPerMember", "101")]
    [InlineData("Sessions:MaxSessionsPerAdmin", "0")]
    [InlineData("Sessions:MaxSessionsPerAdmin", "101")]
    public void Invalid_session_settings_make_the_api_fail_at_startup(string key, string value)
    {
        using var factory = Factory((key, value));

        Assert.ThrowsAny<Exception>(() => factory.CreateClient());
    }

    [Fact]
    public async Task Exceeding_the_session_limit_ends_the_least_recently_used_session_and_its_dek()
    {
        using var factory = Factory(("Sessions:MaxSessionsPerAdmin", "3"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");
        await kit.RegisterAsync("bia", "bia@example.com");
        var bia = await kit.LoginAsync("bia"); // outro usuario: o teto e por usuario

        var a = await kit.LoginAsync("ana");
        factory.Time.Advance(TimeSpan.FromMinutes(1));
        var b = await kit.LoginAsync("ana");
        factory.Time.Advance(TimeSpan.FromMinutes(1));
        var c = await kit.LoginAsync("ana");
        factory.Time.Advance(TimeSpan.FromMinutes(1));
        // "A" e usada de novo (refresh): deixa de ser a menos recente; a menos recente passa a ser "B".
        (await kit.SendAsync(HttpMethod.Post, "/auth/refresh", refreshCookie: a.RefreshCookie)).EnsureSuccessStatusCode();
        factory.Time.Advance(TimeSpan.FromMinutes(1));

        var d = await kit.LoginAsync("ana");

        Assert.Equal(SessionRevocationReason.SessionLimit, (await kit.LoadSessionAsync(b.SessionId)).RevokedReason);
        Assert.Null(factory.DekCache.Get(b.SessionId));
        Assert.Equal(HttpStatusCode.Unauthorized, (await kit.MeAsync(b)).StatusCode);
        foreach (var kept in new[] { a, c, d })
        {
            Assert.Null((await kit.LoadSessionAsync(kept.SessionId)).RevokedAt);
            Assert.NotNull(factory.DekCache.Get(kept.SessionId));
        }

        Assert.Equal(HttpStatusCode.OK, (await kit.MeAsync(bia)).StatusCode);
    }

    [Fact]
    public async Task A_session_that_replaces_the_one_of_the_cookie_does_not_count_twice_toward_the_limit()
    {
        using var factory = Factory(("Sessions:MaxSessionsPerAdmin", "2"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");
        var other = await kit.LoginAsync("ana");
        var browser = await kit.LoginAsync("ana");

        // Re-login no mesmo navegador: substitui a sessao do cookie, sem encerrar a "other" por teto.
        var relogin = await kit.LoginAsync("ana", browser.RefreshCookie);

        Assert.Equal(HttpStatusCode.OK, (await kit.MeAsync(other)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await kit.MeAsync(relogin)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await kit.MeAsync(browser)).StatusCode);
    }

    [Fact]
    public async Task Members_and_admins_have_their_own_session_limits()
    {
        using var factory = Factory(("Sessions:MaxSessionsPerMember", "2"), ("Sessions:MaxSessionsPerAdmin", "3"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("root", "root@example.com"); // o primeiro usuario cadastrado e Admin
        await kit.RegisterAsync("bia", "bia@example.com");   // os seguintes sao Member

        var admin = new[] { await kit.LoginAsync("root"), await kit.LoginAsync("root"), await kit.LoginAsync("root") };
        var member = new[] { await kit.LoginAsync("bia"), await kit.LoginAsync("bia"), await kit.LoginAsync("bia") };

        // Admin: 3 sessoes cabem no teto 3; Member: a terceira passou do teto 2 e encerrou a primeira.
        Assert.All(admin, s => Assert.Equal(HttpStatusCode.OK, kit.MeAsync(s).GetAwaiter().GetResult().StatusCode));
        Assert.Equal(SessionRevocationReason.SessionLimit, (await kit.LoadSessionAsync(member[0].SessionId)).RevokedReason);
        Assert.Null(factory.DekCache.Get(member[0].SessionId));
        Assert.Equal(HttpStatusCode.OK, (await kit.MeAsync(member[1])).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await kit.MeAsync(member[2])).StatusCode);
    }

    [Fact]
    public async Task Default_limits_are_5_sessions_for_a_member_and_10_for_an_admin()
    {
        using var factory = new ApiFactory();
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("root", "root@example.com");
        await kit.RegisterAsync("bia", "bia@example.com");

        var members = new List<SessionTestKit.Login>();
        for (var i = 0; i < 6; i++)
        {
            members.Add(await kit.LoginAsync("bia"));
            factory.Time.Advance(TimeSpan.FromSeconds(1));
        }

        var admins = new List<SessionTestKit.Login>();
        for (var i = 0; i < 11; i++)
        {
            admins.Add(await kit.LoginAsync("root"));
            factory.Time.Advance(TimeSpan.FromSeconds(1));
        }

        Assert.NotNull((await kit.LoadSessionAsync(members[0].SessionId)).RevokedAt);
        Assert.All(members.Skip(1), m => Assert.Null(kit.LoadSessionAsync(m.SessionId).GetAwaiter().GetResult().RevokedAt));
        Assert.NotNull((await kit.LoadSessionAsync(admins[0].SessionId)).RevokedAt);
        Assert.All(admins.Skip(1), a => Assert.Null(kit.LoadSessionAsync(a.SessionId).GetAwaiter().GetResult().RevokedAt));
    }

    [Fact]
    public async Task Expired_sessions_do_not_count_toward_the_limit()
    {
        using var factory = Factory(("Sessions:MaxSessionsPerAdmin", "2"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com"); // Admin
        var expired = await kit.LoginAsync("ana");
        factory.Time.Advance(TimeSpan.FromHours(13)); // a primeira expirou por inatividade

        var second = await kit.LoginAsync("ana");
        var third = await kit.LoginAsync("ana");

        // Teto 2: so a "second" conta contra a "third"; nada foi encerrado por teto.
        Assert.Null((await kit.LoadSessionAsync(second.SessionId)).RevokedAt);
        Assert.Null((await kit.LoadSessionAsync(third.SessionId)).RevokedAt);
        Assert.Null((await kit.LoadSessionAsync(expired.SessionId)).RevokedReason);
    }

    [Fact]
    public async Task Concurrent_logins_never_exceed_the_limit_and_always_leave_a_session_for_the_user()
    {
        using var factory = Factory(("Sessions:MaxSessionsPerAdmin", "2"));
        var kit = new SessionTestKit(factory);
        await kit.RegisterAsync("ana", "ana@example.com");

        for (var round = 0; round < 3; round++)
        {
            var logins = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => kit.LoginAsync("ana")));
            factory.Time.Advance(TimeSpan.FromSeconds(1));

            var active = 0;
            foreach (var login in logins)
            {
                if ((await kit.LoadSessionAsync(login.SessionId)).RevokedAt is null)
                {
                    active++;
                }
            }

            // Nunca acima do teto; e a falha segura (duas sessoes se encerrando) nunca zera o usuario aqui.
            Assert.InRange(active, 1, 2);
        }
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
