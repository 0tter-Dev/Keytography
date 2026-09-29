namespace Keytography.Domain;

public class VaultEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required Guid UserId { get; set; }
    public required string Title { get; set; }
    public string? Login { get; set; }
    public required byte[] EncryptedPassword { get; set; }
    public string? AdditionalFieldsJson { get; set; }
    public bool IsDeleted { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
