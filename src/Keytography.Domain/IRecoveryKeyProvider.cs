using System.Security.Cryptography;

namespace Keytography.Domain;

/// <summary>
/// Da acesso ao par de chaves de recuperacao do sistema (ADR-0001). A chave
/// privada e o segredo de maior valor do sistema - ver a nota de protecao no ADR.
/// </summary>
public interface IRecoveryKeyProvider
{
    RSA Key { get; }
}
