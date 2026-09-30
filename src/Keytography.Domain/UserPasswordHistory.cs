namespace Keytography.Domain;

/// <summary>
/// Hash da senha de login anterior de um usuario, preservado a cada troca
/// (ex.: reset de senha). Guarda apenas o hash (nunca a senha em texto puro).
/// </summary>
public class UserPasswordHistory
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required Guid UserId { get; set; }
    public required string PasswordHash { get; set; }
    public DateTimeOffset ChangedAt { get; set; } = DateTimeOffset.UtcNow;
}
