using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.Vault;
using Keytography.Tests.TestSupport;
using Microsoft.Data.Sqlite;

namespace Keytography.Tests;

public class VaultEntriesTests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly ApiFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    private async Task<HttpClient> AuthenticatedClientAsync(string login, string email, string password)
    {
        var client = _factory.CreateClient();
        var (_, token) = await AuthTestHelper.RegisterVerifyAndLoginAsync(client, _factory.EmailSender, login, email, password);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return client;
    }

    [Fact]
    public async Task Create_entry_returns_201_and_list_never_exposes_password()
    {
        var client = await AuthenticatedClientAsync("alice", "alice@example.com", "supersecret1");

        var createResponse = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Banco X", "alice.bank", "entry-password-1", null));

        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);
        Assert.Equal("entry-password-1", created!.Password);

        var listRaw = await client.GetStringAsync("/vault/entries");
        Assert.DoesNotContain("entry-password-1", listRaw);
        Assert.DoesNotContain("\"password\"", listRaw, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Vault_entry_password_is_stored_as_ciphertext_in_the_database()
    {
        var client = await AuthenticatedClientAsync("bob", "bob@example.com", "supersecret1");
        const string plaintextPassword = "extremely-distinctive-plaintext-marker";

        await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta Y", "bob.login", plaintextPassword, null));

        await using var connection = new SqliteConnection(_factory.ConnectionString);
        await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT EncryptedPassword FROM VaultEntries LIMIT 1";
        var raw = (byte[])(await command.ExecuteScalarAsync())!;
        var rawAsText = System.Text.Encoding.UTF8.GetString(raw);

        Assert.DoesNotContain(plaintextPassword, rawAsText);
    }

    [Fact]
    public async Task Editing_password_preserves_previous_version_in_history()
    {
        var client = await AuthenticatedClientAsync("carol", "carol@example.com", "supersecret1");

        var createResponse = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Loja Z", "carol.login", "old-password", null));
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        await client.PutAsJsonAsync($"/vault/entries/{created!.Id}",
            new UpdateVaultEntryRequest("Loja Z", "carol.login", "new-password", null));

        var historyResponse = await client.GetFromJsonAsync<List<VaultEntryHistoryItemResponse>>(
            $"/vault/entries/{created.Id}/history", JsonOptions);

        var previous = Assert.Single(historyResponse!);
        Assert.Equal("old-password", previous.Password);
    }

    [Fact]
    public async Task Soft_delete_moves_to_trash_and_permanent_delete_removes_it()
    {
        var client = await AuthenticatedClientAsync("dave", "dave@example.com", "supersecret1");

        var createResponse = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Fornecedor W", null, "some-password", null));
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        var deleteResponse = await client.DeleteAsync($"/vault/entries/{created!.Id}");
        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);

        var activeList = await client.GetFromJsonAsync<List<VaultEntryListItemResponse>>("/vault/entries", JsonOptions);
        Assert.Empty(activeList!);

        var trashList = await client.GetFromJsonAsync<List<VaultEntryListItemResponse>>("/vault/entries/trash", JsonOptions);
        Assert.Single(trashList!);

        var permanentDeleteResponse = await client.DeleteAsync($"/vault/entries/{created.Id}/permanent");
        Assert.Equal(HttpStatusCode.NoContent, permanentDeleteResponse.StatusCode);

        var trashListAfter = await client.GetFromJsonAsync<List<VaultEntryListItemResponse>>("/vault/entries/trash", JsonOptions);
        Assert.Empty(trashListAfter!);
    }

    [Fact]
    public async Task Member_cannot_read_another_users_vault_via_normal_endpoints()
    {
        var ownerClient = await AuthenticatedClientAsync("erin", "erin@example.com", "supersecret1");
        var createResponse = await ownerClient.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Privado", null, "secret", null));
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        var otherMemberClient = await AuthenticatedClientAsync("frank", "frank@example.com", "supersecret1");
        var response = await otherMemberClient.GetAsync($"/vault/entries/{created!.Id}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_can_read_but_not_write_another_users_vault_via_supervision_endpoint()
    {
        // Primeiro usuario registrado no factory vira Admin.
        var adminClient = await AuthenticatedClientAsync("admin", "admin@example.com", "supersecret1");

        var memberClient = await AuthenticatedClientAsync("grace", "grace@example.com", "supersecret1");
        var (memberUserId, _) = await GetLastRegisteredUserAsync(memberClient);
        var createResponse = await memberClient.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Cofre da Grace", "grace.login", "grace-secret", null));
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        var listResponse = await adminClient.GetAsync($"/vault/users/{memberUserId}/entries");
        Assert.Equal(HttpStatusCode.OK, listResponse.StatusCode);

        var detailResponse = await adminClient.GetFromJsonAsync<VaultEntryDetailResponse>(
            $"/vault/users/{memberUserId}/entries/{created!.Id}", JsonOptions);
        Assert.Equal("grace-secret", detailResponse!.Password);

        var writeAttempt = await adminClient.PostAsJsonAsync($"/vault/users/{memberUserId}/entries",
            new CreateVaultEntryRequest("Tentativa", null, "x", null));
        Assert.Equal(HttpStatusCode.Forbidden, writeAttempt.StatusCode);

        var deleteAttempt = await adminClient.DeleteAsync($"/vault/users/{memberUserId}/entries/{created.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, deleteAttempt.StatusCode);
    }

    private static async Task<(Guid UserId, string Login)> GetLastRegisteredUserAsync(HttpClient client)
    {
        var me = await client.GetFromJsonAsync<Keytography.Api.Auth.MeResponse>("/auth/me", JsonOptions);
        return (me!.Id, me.Login);
    }
}
