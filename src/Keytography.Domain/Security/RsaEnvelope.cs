using System.Security.Cryptography;

namespace Keytography.Domain.Security;

/// <summary>
/// Cifra/decifra a DEK com a chave de recuperacao do sistema (RSA-OAEP), conforme ADR-0001.
/// </summary>
public static class RsaEnvelope
{
    public static byte[] Wrap(RSA publicOrPrivateKey, byte[] data) =>
        publicOrPrivateKey.Encrypt(data, RSAEncryptionPadding.OaepSHA256);

    public static byte[] Unwrap(RSA privateKey, byte[] wrapped) =>
        privateKey.Decrypt(wrapped, RSAEncryptionPadding.OaepSHA256);
}
