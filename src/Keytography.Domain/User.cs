namespace Keytography.Domain;

public class User
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Login { get; set; }
    public required string Email { get; set; }
    public required string PasswordHash { get; set; }
    public UserRole Role { get; set; } = UserRole.Member;
    public bool EmailVerified { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// Carimbo do estado das credenciais. Cada sessao guarda o carimbo lido ANTES de verificar a
    /// senha, e so vale enquanto ele for igual ao do usuario: trocar a senha renova o carimbo e,
    /// assim, invalida inclusive sessoes criadas por um login concorrente com a credencial antiga.
    /// </summary>
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();
}
