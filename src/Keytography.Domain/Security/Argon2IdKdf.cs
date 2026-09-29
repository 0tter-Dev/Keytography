using System.Security.Cryptography;
using System.Text;
using Konscious.Security.Cryptography;

namespace Keytography.Domain.Security;

/// <summary>
/// Deriva a chave "do dono" a partir da senha de login, conforme ADR-0001.
/// Parametros escolhidos como um piso razoavel de resistencia a forca bruta
/// para uso local; podem ser revisados quando a infraestrutura de producao
/// for desenhada.
/// </summary>
public static class Argon2IdKdf
{
    public const int SaltSizeBytes = 16;
    private const int DegreeOfParallelism = 4;
    private const int Iterations = 4;
    private const int MemorySizeKb = 64 * 1024;

    public static byte[] GenerateSalt() => RandomNumberGenerator.GetBytes(SaltSizeBytes);

    public static byte[] DeriveKey(string password, byte[] salt, int keyLengthBytes = AesGcmCipher.KeySizeBytes)
    {
        using var argon2 = new Argon2id(Encoding.UTF8.GetBytes(password))
        {
            Salt = salt,
            DegreeOfParallelism = DegreeOfParallelism,
            Iterations = Iterations,
            MemorySize = MemorySizeKb
        };
        return argon2.GetBytes(keyLengthBytes);
    }
}
