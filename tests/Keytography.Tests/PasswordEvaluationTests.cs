using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.Vault;
using Keytography.Domain.PasswordEvaluation;
using Keytography.Tests.TestSupport;
using Microsoft.Extensions.DependencyInjection;

namespace Keytography.Tests;

public class PasswordEvaluationTests : IDisposable
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
    public async Task Weak_password_gets_a_low_score_with_failed_criteria_detailed()
    {
        var client = await AuthenticatedClientAsync("alice", "alice@example.com", "supersecret1");

        var response = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta Fraca", "alice.login", "aaaa", null));
        var entry = await response.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        Assert.NotNull(entry!.PasswordScore);
        Assert.True(entry.PasswordScore < 50, $"Esperava nota baixa, obteve {entry.PasswordScore}");
        Assert.False(entry.PasswordScoreDetail!["length"].Passed);
        Assert.False(entry.PasswordScoreDetail["entropy"].Passed);
        Assert.False(entry.PasswordScoreDetail["complexity"].Passed);
    }

    [Fact]
    public async Task Strong_password_gets_a_high_score()
    {
        var client = await AuthenticatedClientAsync("bob", "bob@example.com", "supersecret1");

        var response = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta Forte", "bob.login", "Xk9#mQ2pL7$vT4wZ", null));
        var entry = await response.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        Assert.NotNull(entry!.PasswordScore);
        Assert.True(entry.PasswordScore >= 80, $"Esperava nota alta, obteve {entry.PasswordScore}");
    }

    [Fact]
    public async Task Reusing_a_password_from_the_same_entrys_history_fails_the_reuse_criterion()
    {
        var client = await AuthenticatedClientAsync("carol", "carol@example.com", "supersecret1");

        var createResponse = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta", "carol.login", "FirstPass123!@#", null));
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        await client.PutAsJsonAsync($"/vault/entries/{created!.Id}",
            new UpdateVaultEntryRequest("Conta", "carol.login", "SecondPass456$%^", null));

        var reusedResponse = await client.PutAsJsonAsync($"/vault/entries/{created.Id}",
            new UpdateVaultEntryRequest("Conta", "carol.login", "FirstPass123!@#", null));
        var reused = await reusedResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        var reuseCriterion = reused!.PasswordScoreDetail!["reuse"];
        Assert.Equal(0.0, reuseCriterion.Score);
        Assert.False(reuseCriterion.Passed);
    }

    [Fact]
    public async Task Updating_password_recalculates_the_score_automatically()
    {
        var client = await AuthenticatedClientAsync("dave", "dave@example.com", "supersecret1");

        var createResponse = await client.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta", "dave.login", "aaaa", null));
        var created = await createResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);
        var initialScore = created!.PasswordScore;

        var updateResponse = await client.PutAsJsonAsync($"/vault/entries/{created.Id}",
            new UpdateVaultEntryRequest("Conta", "dave.login", "Xk9#mQ2pL7$vT4wZ", null));
        var updated = await updateResponse.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);

        Assert.True(updated!.PasswordScore > initialScore);
    }

    private class AlwaysFailCriterion : IPasswordEvaluationCriterion
    {
        public string Key => "always-fail-test-criterion";
        public CriterionEvaluation Evaluate(PasswordEvaluationContext context) => CriterionEvaluation.FromScore(0.0);
    }

    [Fact]
    public async Task Registering_a_new_criterion_and_recalculating_updates_pre_existing_entries_of_multiple_users()
    {
        var registrationClient = _factory.CreateClient();

        // Primeiro usuario registrado vira Admin (ver capabilities/authentication-and-users).
        var (_, adminToken) = await AuthTestHelper.RegisterVerifyAndLoginAsync(
            registrationClient, _factory.EmailSender, "admin", "admin@example.com", "supersecret1");

        var ninaClient = await AuthenticatedClientAsync("nina", "nina@example.com", "supersecret1");
        var ninaCreate = await ninaClient.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta Nina", "nina.login", "Xk9#mQ2pL7$vT4wZ", null));
        var ninaEntry = await ninaCreate.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);
        var ninaScoreBefore = ninaEntry!.PasswordScore;

        var oscarClient = await AuthenticatedClientAsync("oscar", "oscar@example.com", "supersecret1");
        var oscarCreate = await oscarClient.PostAsJsonAsync("/vault/entries",
            new CreateVaultEntryRequest("Conta Oscar", "oscar.login", "Zp3&nR8xW1!qJ5tY", null));
        var oscarEntry = await oscarCreate.Content.ReadFromJsonAsync<VaultEntryDetailResponse>(JsonOptions);
        var oscarScoreBefore = oscarEntry!.PasswordScore;

        using var extendedFactory = _factory.WithWebHostBuilder(builder =>
            builder.ConfigureServices(services =>
                services.AddSingleton<IPasswordEvaluationCriterion, AlwaysFailCriterion>()));

        var adminClientWithNewCriterion = extendedFactory.CreateClient();
        adminClientWithNewCriterion.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);

        var recalcResponse = await adminClientWithNewCriterion.PostAsync("/vault/password-evaluation/recalculate", content: null);
        Assert.Equal(HttpStatusCode.OK, recalcResponse.StatusCode);

        var ninaAfter = await ninaClient.GetFromJsonAsync<VaultEntryDetailResponse>($"/vault/entries/{ninaEntry.Id}", JsonOptions);
        var oscarAfter = await oscarClient.GetFromJsonAsync<VaultEntryDetailResponse>($"/vault/entries/{oscarEntry.Id}", JsonOptions);

        Assert.True(ninaAfter!.PasswordScore < ninaScoreBefore, "Nota da Nina deveria cair apos o novo criterio reprovar sempre.");
        Assert.True(oscarAfter!.PasswordScore < oscarScoreBefore, "Nota do Oscar deveria cair apos o novo criterio reprovar sempre.");
        Assert.False(ninaAfter.PasswordScoreDetail!["always-fail-test-criterion"].Passed);
        Assert.False(oscarAfter.PasswordScoreDetail!["always-fail-test-criterion"].Passed);
    }

    [Fact]
    public async Task Member_cannot_trigger_retroactive_recalculation()
    {
        // Primeiro usuario registrado vira Admin - registra um antes para que
        // "erin" (o alvo deste teste) fique como Member.
        await AuthenticatedClientAsync("admin", "admin@example.com", "supersecret1");
        var client = await AuthenticatedClientAsync("erin", "erin@example.com", "supersecret1");

        var response = await client.PostAsync("/vault/password-evaluation/recalculate", content: null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
