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

    // Nota de forca da senha (ver capabilities/password-evaluation). Nunca deriva de
    // dado sensivel exposto diretamente - so o resultado numerico/detalhamento por
    // criterio e persistido aqui, nunca a senha em si.
    public double? PasswordScore { get; set; }
    public string? PasswordScoreDetailJson { get; set; }
}
