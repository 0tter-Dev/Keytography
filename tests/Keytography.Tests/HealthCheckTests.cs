using System.Net;
using Keytography.Tests.TestSupport;

namespace Keytography.Tests;

public class HealthCheckTests : IClassFixture<ApiFactory>
{
    private readonly ApiFactory _factory;

    public HealthCheckTests(ApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Health_endpoint_returns_200_with_healthy_status()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/health");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"status\":\"healthy\"", body);
        Assert.Contains("\"database\"", body);
    }
}
