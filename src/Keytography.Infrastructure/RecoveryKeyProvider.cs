using System.Security.Cryptography;
using Keytography.Domain;
using Microsoft.Extensions.Configuration;

namespace Keytography.Infrastructure;

public class RecoveryKeyProvider : IRecoveryKeyProvider, IDisposable
{
    private readonly RSA _rsa;

    public RecoveryKeyProvider(IConfiguration configuration)
    {
        var pem = configuration["Recovery:PrivateKeyPem"]
            ?? throw new InvalidOperationException(
                "Recovery:PrivateKeyPem não configurado. Defina via `dotnet user-secrets set \"Recovery:PrivateKeyPem\" \"<pem>\"` (ver docs/guides/running-locally.md).");
        _rsa = RSA.Create();
        _rsa.ImportFromPem(pem);
    }

    public RSA Key => _rsa;

    public void Dispose() => _rsa.Dispose();
}
