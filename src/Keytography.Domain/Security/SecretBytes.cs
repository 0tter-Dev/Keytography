using System.Security.Cryptography;

namespace Keytography.Domain.Security;

/// <summary>
/// Material de chave (DEK, chave derivada do Argon2id) que e zerado quando descartado. Use com
/// <c>using</c>: o vetor some da memoria assim que a operacao termina, em vez de esperar o GC.
/// Nao protege strings (como a senha em texto puro), que sao imutaveis no .NET.
/// </summary>
public sealed class SecretBytes : IDisposable
{
    public SecretBytes(byte[] value)
    {
        Value = value;
    }

    public byte[] Value { get; }

    public void Dispose() => CryptographicOperations.ZeroMemory(Value);
}
