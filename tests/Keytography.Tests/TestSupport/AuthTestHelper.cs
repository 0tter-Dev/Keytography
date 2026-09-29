using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.Auth;

namespace Keytography.Tests.TestSupport;

public static class AuthTestHelper
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task<(Guid UserId, string Token)> RegisterVerifyAndLoginAsync(
        HttpClient client, FakeEmailSender emailSender, string login, string email, string password)
    {
        var registerResponse = await client.PostAsJsonAsync("/auth/register", new RegisterRequest(login, email, password));
        registerResponse.EnsureSuccessStatusCode();
        var registered = await registerResponse.Content.ReadFromJsonAsync<RegisterResponse>(JsonOptions);

        var verificationToken = ExtractToken(emailSender.SentEmails.Last(e => e.ToEmail == email).Body);
        var verifyResponse = await client.PostAsJsonAsync("/auth/verify-email", new VerifyEmailRequest(verificationToken));
        verifyResponse.EnsureSuccessStatusCode();

        var loginResponse = await client.PostAsJsonAsync("/auth/login", new LoginRequest(login, password));
        loginResponse.EnsureSuccessStatusCode();
        var loggedIn = await loginResponse.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);

        return (registered!.Id, loggedIn!.Token);
    }

    public static string ExtractToken(string emailBody) =>
        emailBody[(emailBody.LastIndexOf(": ", StringComparison.Ordinal) + 2)..];
}
