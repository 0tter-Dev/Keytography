namespace Keytography.Api.Auth;

/// <summary>
/// Tempos de vida das sessoes (secao "Sessions" da configuracao). Os padroes sao os
/// propostos em keytography-016 e aprovados pelo usuario; todos sao configuraveis.
/// </summary>
public class SessionLifetimeOptions
{
    public const string SectionName = "Sessions";

    /// <summary>Vida do access token (JWT). Curto: a sessao e quem manda, o JWT so a representa.</summary>
    public int AccessTokenMinutes { get; set; } = 15;

    /// <summary>Expiracao por inatividade: avanca a cada refresh (e o TTL da DEK em cache acompanha).</summary>
    public int IdleHours { get; set; } = 12;

    /// <summary>Limite absoluto da sessao, mesmo com atividade continua.</summary>
    public int AbsoluteDays { get; set; } = 7;

    /// <summary>Janela em que o refresh token anterior ainda e aceito, para requisicoes simultaneas.</summary>
    public int RotationGraceSeconds { get; set; } = 10;

    public TimeSpan AccessTokenLifetime => TimeSpan.FromMinutes(AccessTokenMinutes);
    public TimeSpan IdleLifetime => TimeSpan.FromHours(IdleHours);
    public TimeSpan AbsoluteLifetime => TimeSpan.FromDays(AbsoluteDays);
    public TimeSpan RotationGrace => TimeSpan.FromSeconds(RotationGraceSeconds);

    /// <summary>Falha cedo, no startup, se algum valor nao for positivo.</summary>
    public void Validate()
    {
        if (AccessTokenMinutes <= 0 || IdleHours <= 0 || AbsoluteDays <= 0 || RotationGraceSeconds < 0)
        {
            throw new InvalidOperationException(
                "Sessions:AccessTokenMinutes, IdleHours e AbsoluteDays devem ser positivos e RotationGraceSeconds nao pode ser negativo.");
        }
    }
}
