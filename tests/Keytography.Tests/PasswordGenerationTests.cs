using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Keytography.Api.PasswordGeneration;
using Keytography.Tests.TestSupport;

namespace Keytography.Tests;

public class PasswordGenerationTests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string AmbiguousChars = "0O1lI";

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
    public async Task Generating_with_valid_parameters_returns_a_password_meeting_the_minimum_score()
    {
        var client = await AuthenticatedClientAsync("alice", "alice@example.com", "supersecret1");

        var response = await client.PostAsJsonAsync("/passwords/generate",
            new GeneratePasswordRequest(20, true, true, 70.0));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<GeneratePasswordResponse>(JsonOptions);
        Assert.Equal(20, body!.Password.Length);
        Assert.True(body.Score >= 70.0, $"Esperava nota >= 70, obteve {body.Score}");
    }

    [Fact]
    public async Task Excluding_ambiguous_characters_never_includes_them()
    {
        var client = await AuthenticatedClientAsync("bob", "bob@example.com", "supersecret1");

        var response = await client.PostAsJsonAsync("/passwords/generate",
            new GeneratePasswordRequest(100, true, true, 0.0));

        var body = await response.Content.ReadFromJsonAsync<GeneratePasswordResponse>(JsonOptions);
        Assert.All(body!.Password, c => Assert.DoesNotContain(c, AmbiguousChars));
    }

    [Fact]
    public async Task Unreachable_minimum_score_returns_a_clear_error_instead_of_a_weak_password_or_hanging()
    {
        var client = await AuthenticatedClientAsync("carol", "carol@example.com", "supersecret1");

        var response = await client.PostAsJsonAsync("/passwords/generate",
            new GeneratePasswordRequest(1, false, false, 99.0));

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
    }

    [Fact]
    public async Task Generating_the_same_request_twice_returns_different_passwords()
    {
        var client = await AuthenticatedClientAsync("dave", "dave@example.com", "supersecret1");
        var request = new GeneratePasswordRequest(20, true, true, 0.0);

        var firstResponse = await client.PostAsJsonAsync("/passwords/generate", request);
        var secondResponse = await client.PostAsJsonAsync("/passwords/generate", request);

        var first = await firstResponse.Content.ReadFromJsonAsync<GeneratePasswordResponse>(JsonOptions);
        var second = await secondResponse.Content.ReadFromJsonAsync<GeneratePasswordResponse>(JsonOptions);

        Assert.NotEqual(first!.Password, second!.Password);
    }

    [Fact]
    public async Task Generating_without_authentication_returns_401()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/passwords/generate",
            new GeneratePasswordRequest(20, true, true, 70.0));

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
