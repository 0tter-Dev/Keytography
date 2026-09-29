using System.Security.Cryptography;
using Keytography.Domain;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Keytography.Tests.TestSupport;

public class ApiFactory : WebApplicationFactory<Program>, IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"keytography-test-{Guid.NewGuid():N}.db");

    // 2048 bits por velocidade de geracao em teste - o minimo de 3072 do ADR-0001
    // vale para a chave real de operacao, nao para chaves descartaveis de teste.
    private readonly RSA _testRecoveryKey = RSA.Create(2048);

    public FakeEmailSender EmailSender { get; } = new();
    public string ConnectionString => $"Data Source={_dbPath}";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureAppConfiguration((_, configBuilder) =>
        {
            configBuilder.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Keytography"] = ConnectionString,
                ["Jwt:Key"] = "test-only-signing-key-0123456789-0123456789-0123456789",
                ["Jwt:Issuer"] = "Keytography.Tests",
                ["Jwt:Audience"] = "Keytography.Tests",
                ["Recovery:PrivateKeyPem"] = _testRecoveryKey.ExportRSAPrivateKeyPem()
            });
        });

        builder.ConfigureServices(services =>
        {
            services.RemoveAll<IEmailSender>();
            services.AddSingleton<IEmailSender>(EmailSender);
        });
    }

    public new void Dispose()
    {
        base.Dispose();
        _testRecoveryKey.Dispose();
        SqliteConnection.ClearAllPools();
        if (File.Exists(_dbPath))
        {
            File.Delete(_dbPath);
        }
    }
}
