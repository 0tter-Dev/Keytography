using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Keytography.Tests;

public class HealthCheckTests : IClassFixture<HealthCheckTests.ApiFactory>
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

    public class ApiFactory : WebApplicationFactory<Program>, IDisposable
    {
        private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"keytography-test-{Guid.NewGuid():N}.db");

        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            builder.ConfigureAppConfiguration((_, configBuilder) =>
            {
                configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ConnectionStrings:Keytography"] = $"Data Source={_dbPath}"
                });
            });
        }

        public new void Dispose()
        {
            base.Dispose();
            if (File.Exists(_dbPath))
            {
                File.Delete(_dbPath);
            }
        }
    }
}
