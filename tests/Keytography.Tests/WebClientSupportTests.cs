using System.Net;
using System.Text.Json;
using System.Text.Json.Nodes;
using Keytography.Tests.TestSupport;

namespace Keytography.Tests;

public class WebClientSupportTests : IDisposable
{
    private const string UpdateEnvironmentVariable = "KEYTOGRAPHY_UPDATE_OPENAPI";

    private readonly ApiFactory _factory = new();

    public void Dispose() => _factory.Dispose();

    [Fact]
    public async Task Preflight_from_the_vite_dev_server_origin_is_allowed()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Options, "/auth/login");
        request.Headers.Add("Origin", "http://localhost:5173");
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "authorization,content-type");

        var response = await client.SendAsync(request);

        Assert.True(response.IsSuccessStatusCode, $"Preflight falhou com {response.StatusCode}");
        Assert.Equal("http://localhost:5173", response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task Preflight_from_an_unknown_origin_is_not_allowed()
    {
        var client = _factory.CreateClient();
        var request = new HttpRequestMessage(HttpMethod.Options, "/auth/login");
        request.Headers.Add("Origin", "http://evil.example");
        request.Headers.Add("Access-Control-Request-Method", "POST");

        var response = await client.SendAsync(request);

        Assert.False(response.Headers.Contains("Access-Control-Allow-Origin"));
    }

    [Fact]
    public async Task Openapi_document_describes_the_response_dtos_used_by_the_web_client()
    {
        var document = await FetchNormalizedOpenApiAsync();
        var schemas = document["components"]!["schemas"]!.AsObject();

        foreach (var expected in new[]
                 {
                     "LoginResponse", "MeResponse", "RegisterResponse", "MessageResponse",
                     "VaultEntryDetailResponse", "VaultEntryListItemResponse", "VaultEntryHistoryItemResponse",
                     "GeneratePasswordResponse", "RecalculationResponse", "CriterionEvaluation", "HealthResponse"
                 })
        {
            Assert.True(schemas.ContainsKey(expected), $"Schema {expected} ausente no OpenAPI.");
        }
    }

    [Fact]
    public async Task Openapi_numeric_fields_are_not_described_as_number_or_string()
    {
        var document = await FetchNormalizedOpenApiAsync();
        var offenders = new List<string>();
        CollectNumberOrStringSchemas(document, "#", offenders);

        Assert.True(
            offenders.Count == 0,
            "Campos numericos descritos como number|string (a API so emite numeros): " + string.Join(", ", offenders));

        // Sanidade: os campos continuam descritos como numericos, nao removidos.
        var score = document["components"]!["schemas"]!["CriterionEvaluation"]!["properties"]!["score"]!;
        Assert.Equal("number", score["type"]!.GetValue<string>());
    }

    [Fact]
    public async Task Committed_openapi_contract_matches_the_running_api()
    {
        var actual = await FetchNormalizedOpenApiAsync();
        var path = Path.Combine(FindRepositoryRoot(), "docs", "reference", "openapi.json");
        var actualText = Serialize(actual);

        if (Environment.GetEnvironmentVariable(UpdateEnvironmentVariable) == "1")
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            await File.WriteAllTextAsync(path, actualText);
        }

        Assert.True(File.Exists(path), $"docs/reference/openapi.json ausente. Gere com {UpdateEnvironmentVariable}=1 dotnet test.");
        var committed = (await File.ReadAllTextAsync(path)).Replace("\r\n", "\n");
        Assert.True(
            committed == actualText,
            $"docs/reference/openapi.json esta desatualizado em relacao a API. Regenere com {UpdateEnvironmentVariable}=1 dotnet test e depois `npm run api:types` em web/.");
    }

    private async Task<JsonNode> FetchNormalizedOpenApiAsync()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        var document = JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
        // O servidor reportado varia conforme o host em que a API roda - nao faz parte do contrato.
        document.AsObject().Remove("servers");
        return document;
    }

    private static void CollectNumberOrStringSchemas(JsonNode? node, string path, List<string> offenders)
    {
        switch (node)
        {
            case JsonObject obj:
                if (obj["type"] is JsonArray types)
                {
                    var names = types.Select(t => t?.GetValue<string>()).ToList();
                    if (names.Contains("string") && (names.Contains("number") || names.Contains("integer")))
                    {
                        offenders.Add(path);
                    }
                }

                foreach (var (key, value) in obj)
                {
                    CollectNumberOrStringSchemas(value, $"{path}/{key}", offenders);
                }

                break;
            case JsonArray array:
                for (var i = 0; i < array.Count; i++)
                {
                    CollectNumberOrStringSchemas(array[i], $"{path}/{i}", offenders);
                }

                break;
        }
    }

    private static string Serialize(JsonNode node) =>
        node.ToJsonString(new JsonSerializerOptions { WriteIndented = true }).Replace("\r\n", "\n") + "\n";

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Keytography.slnx")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("Raiz do repositorio (Keytography.slnx) nao encontrada.");
    }
}
