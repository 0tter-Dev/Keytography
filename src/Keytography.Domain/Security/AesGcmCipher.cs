using System.Security.Cryptography;

namespace Keytography.Domain.Security;

/// <summary>
/// AES-256-GCM com nonce e tag combinados em um unico blob: nonce(12) + ciphertext(N) + tag(16).
/// </summary>
public static class AesGcmCipher
{
    private const int NonceSizeBytes = 12;
    private const int TagSizeBytes = 16;
    public const int KeySizeBytes = 32;

    public static byte[] Encrypt(byte[] key, byte[] plaintext)
    {
        var nonce = RandomNumberGenerator.GetBytes(NonceSizeBytes);
        var ciphertext = new byte[plaintext.Length];
        var tag = new byte[TagSizeBytes];

        using var aes = new AesGcm(key, TagSizeBytes);
        aes.Encrypt(nonce, plaintext, ciphertext, tag);

        var combined = new byte[NonceSizeBytes + ciphertext.Length + TagSizeBytes];
        Buffer.BlockCopy(nonce, 0, combined, 0, NonceSizeBytes);
        Buffer.BlockCopy(ciphertext, 0, combined, NonceSizeBytes, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, combined, NonceSizeBytes + ciphertext.Length, TagSizeBytes);
        return combined;
    }

    public static byte[] Decrypt(byte[] key, byte[] combined)
    {
        var ciphertextLength = combined.Length - NonceSizeBytes - TagSizeBytes;
        var nonce = combined.AsSpan(0, NonceSizeBytes);
        var ciphertext = combined.AsSpan(NonceSizeBytes, ciphertextLength);
        var tag = combined.AsSpan(NonceSizeBytes + ciphertextLength, TagSizeBytes);

        var plaintext = new byte[ciphertextLength];
        using var aes = new AesGcm(key, TagSizeBytes);
        aes.Decrypt(nonce, ciphertext, tag, plaintext);
        return plaintext;
    }

    public static byte[] EncryptString(byte[] key, string plaintext) =>
        Encrypt(key, System.Text.Encoding.UTF8.GetBytes(plaintext));

    public static string DecryptString(byte[] key, byte[] combined) =>
        System.Text.Encoding.UTF8.GetString(Decrypt(key, combined));
}
