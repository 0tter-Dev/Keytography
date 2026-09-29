namespace Keytography.Domain;

/// <summary>
/// Versao anterior da senha de uma entrada de cofre, preservada a cada edicao.
/// </summary>
public class VaultEntryHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required Guid VaultEntryId { get; set; }
    public required byte[] EncryptedPassword { get; set; }
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
}
