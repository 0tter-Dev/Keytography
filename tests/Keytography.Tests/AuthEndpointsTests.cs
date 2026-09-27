using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.Auth;
using Keytography.Tests.TestSupport;

namespace Keytography.Tests;

public class AuthEndpointsTests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ApiFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Register_creates_user_pending_verification_and_returns_201()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("alice", "alice@example.com", "supersecret1"));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<RegisterResponse>(JsonOptions);
        Assert.NotNull(body);
        Assert.False(body!.EmailVerified);
    }

    [Fact]
    public async Task First_registered_user_becomes_admin_and_subsequent_users_become_member()
    {
        var client = _factory.CreateClient();

        var firstResponse = await client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("admin-user", "admin@example.com", "supersecret1"));
        var first = await firstResponse.Content.ReadFromJsonAsync<RegisterResponse>(JsonOptions);

        var secondResponse = await client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("member-user", "member@example.com", "supersecret1"));
        var second = await secondResponse.Content.ReadFromJsonAsync<RegisterResponse>(JsonOptions);

        Assert.Equal("Admin", first!.Role);
        Assert.Equal("Member", second!.Role);
    }

    [Fact]
    public async Task Login_before_email_verification_returns_403()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("bob", "bob@example.com", "supersecret1"));

        var response = await client.PostAsJsonAsync("/auth/login", new LoginRequest("bob", "supersecret1"));

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Verify_email_then_login_returns_200_with_jwt()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("carol", "carol@example.com", "supersecret1"));
        var verificationToken = ExtractToken(_factory.EmailSender.SentEmails.Single(e => e.ToEmail == "carol@example.com").Body);

        var verifyResponse = await client.PostAsJsonAsync("/auth/verify-email", new VerifyEmailRequest(verificationToken));
        Assert.Equal(HttpStatusCode.OK, verifyResponse.StatusCode);

        var loginResponse = await client.PostAsJsonAsync("/auth/login", new LoginRequest("carol", "supersecret1"));
        Assert.Equal(HttpStatusCode.OK, loginResponse.StatusCode);

        var login = await loginResponse.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);
        Assert.False(string.IsNullOrWhiteSpace(login!.Token));
    }

    [Fact]
    public async Task Me_endpoint_requires_valid_jwt()
    {
        var client = _factory.CreateClient();

        var unauthenticated = await client.GetAsync("/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, unauthenticated.StatusCode);

        await client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("dave", "dave@example.com", "supersecret1"));
        var token = ExtractToken(_factory.EmailSender.SentEmails.Single(e => e.ToEmail == "dave@example.com").Body);
        await client.PostAsJsonAsync("/auth/verify-email", new VerifyEmailRequest(token));
        var loginResponse = await client.PostAsJsonAsync("/auth/login", new LoginRequest("dave", "supersecret1"));
        var login = await loginResponse.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);

        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login!.Token);
        var authenticated = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.OK, authenticated.StatusCode);
        var me = await authenticated.Content.ReadFromJsonAsync<MeResponse>(JsonOptions);
        Assert.Equal("dave", me!.Login);
    }

    [Fact]
    public async Task Forgot_password_generates_token_without_revealing_existence()
    {
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync("/auth/register",
            new RegisterRequest("erin", "erin@example.com", "supersecret1"));

        var existingResponse = await client.PostAsJsonAsync("/auth/forgot-password", new ForgotPasswordRequest("erin@example.com"));
        var missingResponse = await client.PostAsJsonAsync("/auth/forgot-password", new ForgotPasswordRequest("nobody@example.com"));

        Assert.Equal(HttpStatusCode.OK, existingResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, missingResponse.StatusCode);
        Assert.Equal(await existingResponse.Content.ReadAsStringAsync(), await missingResponse.Content.ReadAsStringAsync());

        var resetEmail = Assert.Single(_factory.EmailSender.SentEmails, e => e.Subject.Contains("Redefinição"));
        Assert.False(string.IsNullOrWhiteSpace(ExtractToken(resetEmail.Body)));
    }

    private static string ExtractToken(string emailBody) => emailBody[(emailBody.LastIndexOf(": ", StringComparison.Ordinal) + 2)..];
}
