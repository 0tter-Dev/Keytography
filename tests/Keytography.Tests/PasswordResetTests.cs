using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.Auth;
using Keytography.Api.Vault;
using Keytography.Infrastructure;
using Keytography.Tests.TestSupport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Keytography.Tests;

public class PasswordResetTests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ApiFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    private async Task<string> RegisterAndRequestResetTokenAsync(HttpClient client, string login, string email, string password)
    {
        await client.PostAsJsonAsync("/auth/register", new RegisterRequest(login, email, password));
        var verificationToken = AuthTestHelper.ExtractToken(_factory.EmailSender.SentEmails.Single(e => e.ToEmail == email).Body);
        await client.PostAsJsonAsync("/auth/verify-email", new VerifyEmailRequest(verificationToken));

        await client.PostAsJsonAsync("/auth/forgot-password", new ForgotPasswordRequest(email));
        return AuthTestHelper.ExtractToken(_factory.EmailSender.SentEmails.Last(e => e.Subject.Contains("Redefinição")).Body);
    }

    [Fact]
    public async Task Reset_password_with_valid_token_allows_login_with_new_password_and_not_old()
    {
        var client = _factory.CreateClient();
        var resetToken = await RegisterAndRequestResetTokenAsync(client, "heidi", "heidi@example.com", "old-password1");

        var resetResponse = await client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "new-password1"));
        Assert.Equal(HttpStatusCode.OK, resetResponse.StatusCode);

        var oldLoginResponse = await client.PostAsJsonAsync("/auth/login", new LoginRequest("heidi", "old-password1"));
        Assert.Equal(HttpStatusCode.Unauthorized, oldLoginResponse.StatusCode);

        var newLoginResponse = await client.PostAsJsonAsync("/auth/login", new LoginRequest("heidi", "new-password1"));
        Assert.Equal(HttpStatusCode.OK, newLoginResponse.StatusCode);
    }

    [Fact]
    public async Task Vault_entries_remain_readable_and_identical_after_password_reset()
    {
        var client = _factory.CreateClient();
        var (_, loginToken) = await AuthTestHelper.RegisterVerifyAndLoginAsync(client, _factory.EmailSender, "ivan", "ivan@example.com", "old-password1");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", loginToken);

        var createResponse = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta", "ivan.login", "vault-secret", null));
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        await client.PostAsJsonAsync("/auth/forgot-password", new ForgotPasswordRequest("ivan@example.com"));
        var resetToken = AuthTestHelper.ExtractToken(_factory.EmailSender.SentEmails.Last(e => e.Subject.Contains("Redefinição")).Body);
        var resetResponse = await client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "new-password1"));
        Assert.Equal(HttpStatusCode.OK, resetResponse.StatusCode);

        var newLoginResponse = await client.PostAsJsonAsync("/auth/login", new LoginRequest("ivan", "new-password1"));
        var newLogin = await newLoginResponse.Content.ReadFromJsonAsync<LoginResponse>(JsonOptions);

        var newClient = _factory.CreateClient();
        newClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", newLogin!.Token);
        var entryAfterReset = await newClient.GetFromJsonAsync<VaultEntryDetailResponse>($"/vault/entries/{created!.Id}", JsonOptions);

        Assert.Equal("vault-secret", entryAfterReset!.Password);
    }

    [Fact]
    public async Task Reset_password_records_previous_password_hash_in_history()
    {
        var client = _factory.CreateClient();
        var resetToken = await RegisterAndRequestResetTokenAsync(client, "liam", "liam@example.com", "old-password1");

        Guid userId;
        string oldPasswordHash;
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
            var user = await db.Users.FirstAsync(u => u.Login == "liam");
            userId = user.Id;
            oldPasswordHash = user.PasswordHash;
        }

        var resetResponse = await client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "new-password1"));
        Assert.Equal(HttpStatusCode.OK, resetResponse.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
            var historyEntry = await db.UserPasswordHistories.SingleAsync(h => h.UserId == userId);
            Assert.Equal(oldPasswordHash, historyEntry.PasswordHash);
        }
    }

    [Fact]
    public async Task Reset_password_with_expired_token_returns_error_and_does_not_change_password()
    {
        var client = _factory.CreateClient();
        var resetToken = await RegisterAndRequestResetTokenAsync(client, "judy", "judy@example.com", "old-password1");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
            var tokenEntity = await db.UserTokens.FirstAsync(t => t.Token == resetToken);
            tokenEntity.ExpiresAt = DateTimeOffset.UtcNow.AddHours(-1);
            await db.SaveChangesAsync();
        }

        var resetResponse = await client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "new-password1"));
        Assert.Equal(HttpStatusCode.BadRequest, resetResponse.StatusCode);

        var loginWithOldPassword = await client.PostAsJsonAsync("/auth/login", new LoginRequest("judy", "old-password1"));
        Assert.Equal(HttpStatusCode.OK, loginWithOldPassword.StatusCode);
    }

    [Fact]
    public async Task Reset_password_with_already_used_token_returns_error()
    {
        var client = _factory.CreateClient();
        var resetToken = await RegisterAndRequestResetTokenAsync(client, "kyle", "kyle@example.com", "old-password1");

        var firstReset = await client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "new-password1"));
        Assert.Equal(HttpStatusCode.OK, firstReset.StatusCode);

        var secondReset = await client.PostAsJsonAsync("/auth/reset-password", new ResetPasswordRequest(resetToken, "another-password1"));
        Assert.Equal(HttpStatusCode.BadRequest, secondReset.StatusCode);
    }
}
