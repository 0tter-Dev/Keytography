namespace Keytography.Domain;

/// <summary>
/// Sessao de um usuario autenticado, controlada pelo backend (ADR-0006). O access token
/// (JWT) carrega o Id desta sessao no claim "sid" e so vale enquanto ela estiver ativa;
/// o refresh token nunca e guardado - so o hash SHA-256 dele.
/// </summary>
public class UserSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required Guid UserId { get; set; }

    /// <summary>Hash do refresh token atual.</summary>
    public required string RefreshTokenHash { get; set; }

    /// <summary>Hash do refresh token anterior, aceito por uma tolerancia curta apos a rotacao.</summary>
    public string? PreviousRefreshTokenHash { get; set; }

    public DateTimeOffset? RefreshRotatedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset LastRefreshedAt { get; set; }

    /// <summary>Expiracao por inatividade; avanca a cada refresh, ate <see cref="AbsoluteExpiresAt"/>.</summary>
    public DateTimeOffset IdleExpiresAt { get; set; }

    /// <summary>Limite maximo de vida da sessao, independente de atividade.</summary>
    public DateTimeOffset AbsoluteExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }
    public SessionRevocationReason? RevokedReason { get; set; }

    public bool IsActive(DateTimeOffset now) =>
        RevokedAt is null && now < IdleExpiresAt && now < AbsoluteExpiresAt;
}

public enum SessionRevocationReason
{
    Logout,
    LogoutAll,
    PasswordReset,
    ReuseDetected
}
