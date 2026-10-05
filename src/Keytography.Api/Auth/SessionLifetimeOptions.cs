namespace Keytography.Api.Auth;

/// <summary>
/// Tempos de vida das sessoes (secao "Sessions" da configuracao). Os padroes sao os
/// propostos em keytography-016 e aprovados pelo usuario; todos sao configuraveis.
/// </summary>
public class SessionLifetimeOptions
{
    public const string SectionName = "Sessions";

    // Tetos: valores absurdos estourariam TimeSpan/DateTimeOffset so no primeiro login.
    private const int MaxAccessTokenMinutes = 24 * 60;
    private const int MaxIdleHours = 24 * 30;
    private const int MaxAbsoluteDays = 365;
    private const int MaxRotationGraceSeconds = 300;
    private const int MaxSessionsLimit = 100;

    /// <summary>Vida do access token (JWT). Curto: a sessao e quem manda, o JWT so a representa.</summary>
    public int AccessTokenMinutes { get; set; } = 15;

    /// <summary>Expiracao por inatividade: avanca a cada refresh (e o TTL da DEK em cache acompanha).</summary>
    public int IdleHours { get; set; } = 12;

    /// <summary>Limite absoluto da sessao, mesmo com atividade continua.</summary>
    public int AbsoluteDays { get; set; } = 7;

    /// <summary>
    /// Janela em que o refresh token anterior ainda e aceito, para requisicoes simultaneas. Minimo 1 s:
    /// com 0, refreshes simultaneos legitimos seriam tratados como reuso e derrubariam a sessao.
    /// </summary>
    public int RotationGraceSeconds { get; set; } = 10;

    /// <summary>
    /// Marca o cookie de refresh como Secure mesmo quando a requisicao chega como HTTP (ex.: atras
    /// de um proxy que termina TLS). Sem isso, Secure so e usado em requisicoes HTTPS.
    /// </summary>
    public bool ForceSecureCookie { get; set; }

    /// <summary>
    /// Teto de sessoes ativas simultaneas de um usuario <c>Member</c>. Ao criar uma nova alem dele, a
    /// sessao menos recentemente usada e encerrada. Um novo login no mesmo navegador ja substitui a
    /// sessao do cookie anterior; este teto limita varios dispositivos/navegadores.
    /// </summary>
    public int MaxSessionsPerMember { get; set; } = 5;

    /// <summary>Teto de sessoes ativas simultaneas de um <c>Admin</c> (mais folga: administra de varios lugares).</summary>
    public int MaxSessionsPerAdmin { get; set; } = 10;

    public int SessionLimitFor(Keytography.Domain.UserRole role) =>
        role == Keytography.Domain.UserRole.Admin ? MaxSessionsPerAdmin : MaxSessionsPerMember;

    public TimeSpan AccessTokenLifetime => TimeSpan.FromMinutes(AccessTokenMinutes);
    public TimeSpan IdleLifetime => TimeSpan.FromHours(IdleHours);
    public TimeSpan AbsoluteLifetime => TimeSpan.FromDays(AbsoluteDays);
    public TimeSpan RotationGrace => TimeSpan.FromSeconds(RotationGraceSeconds);

    /// <summary>Falha cedo, no startup, se algum valor estiver fora do intervalo aceito.</summary>
    public void Validate()
    {
        if (AccessTokenMinutes is < 1 or > MaxAccessTokenMinutes
            || IdleHours is < 1 or > MaxIdleHours
            || AbsoluteDays is < 1 or > MaxAbsoluteDays
            || RotationGraceSeconds is < 1 or > MaxRotationGraceSeconds
            || MaxSessionsPerMember is < 1 or > MaxSessionsLimit
            || MaxSessionsPerAdmin is < 1 or > MaxSessionsLimit)
        {
            throw new InvalidOperationException(
                $"Sessions inválido: AccessTokenMinutes deve ficar entre 1 e {MaxAccessTokenMinutes}, " +
                $"IdleHours entre 1 e {MaxIdleHours}, AbsoluteDays entre 1 e {MaxAbsoluteDays}, " +
                $"RotationGraceSeconds entre 1 e {MaxRotationGraceSeconds} " +
                $"e MaxSessionsPerMember e MaxSessionsPerAdmin entre 1 e {MaxSessionsLimit}.");
        }
    }
}
