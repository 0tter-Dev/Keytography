using System.Security.Cryptography;
using Keytography.Domain.Security;

namespace Keytography.Tests;

/// <summary>
/// Testa a propriedade central do ADR-0001: trocar a senha de login re-cifra
/// apenas a copia "do dono" da DEK - a DEK em si nunca muda, entao o acesso
/// as entradas de cofre ja cifradas nao se perde. Como o endpoint de troca de
/// senha de login so existe em keytography-004, este teste exercita os
/// primitivos de criptografia diretamente.
/// </summary>
public class VaultKeyRotationTests
{
    [Fact]
    public void Rewrapping_dek_with_a_new_password_preserves_the_same_dek()
    {
        var dek = RandomNumberGenerator.GetBytes(AesGcmCipher.KeySizeBytes);

        var oldSalt = Argon2IdKdf.GenerateSalt();
        var oldOwnerKey = Argon2IdKdf.DeriveKey("senha-antiga", oldSalt);
        var wrappedWithOldPassword = AesGcmCipher.Encrypt(oldOwnerKey, dek);

        var dekUnwrappedWithOldPassword = AesGcmCipher.Decrypt(oldOwnerKey, wrappedWithOldPassword);

        var newSalt = Argon2IdKdf.GenerateSalt();
        var newOwnerKey = Argon2IdKdf.DeriveKey("senha-nova", newSalt);
        var wrappedWithNewPassword = AesGcmCipher.Encrypt(newOwnerKey, dekUnwrappedWithOldPassword);

        var dekUnwrappedWithNewPassword = AesGcmCipher.Decrypt(newOwnerKey, wrappedWithNewPassword);

        Assert.Equal(dek, dekUnwrappedWithOldPassword);
        Assert.Equal(dek, dekUnwrappedWithNewPassword);
    }

    [Fact]
    public void Recovery_key_unwraps_the_same_dek_as_the_owner_key()
    {
        using var recoveryKey = RSA.Create(2048);
        var dek = RandomNumberGenerator.GetBytes(AesGcmCipher.KeySizeBytes);

        var salt = Argon2IdKdf.GenerateSalt();
        var ownerKey = Argon2IdKdf.DeriveKey("senha-do-dono", salt);
        var ownerWrapped = AesGcmCipher.Encrypt(ownerKey, dek);
        var recoveryWrapped = RsaEnvelope.Wrap(recoveryKey, dek);

        var dekFromOwnerCopy = AesGcmCipher.Decrypt(ownerKey, ownerWrapped);
        var dekFromRecoveryCopy = RsaEnvelope.Unwrap(recoveryKey, recoveryWrapped);

        Assert.Equal(dek, dekFromOwnerCopy);
        Assert.Equal(dek, dekFromRecoveryCopy);
    }
}
