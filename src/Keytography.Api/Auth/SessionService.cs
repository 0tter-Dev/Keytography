using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Keytography.Domain;
using Keytography.Domain.Security;
using Keytography.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Keytography.Api.Auth;

/// <summary>
/// Ciclo de vida das sessoes controladas pelo backend (keytography-016, ADR-0006): criacao no
/// login, emissao do access token, refresh com rotacao e deteccao de reuso, e revogacao
/// (que tambem remove a DEK da sessao do cache em memoria).
/// </summary>
public class SessionService
{
    public const string RefreshCookieName = "keytography_refresh";
    private const string RefreshCookiePath = "/auth";
    private static readonly TimeSpan RetentionAfterEnd = TimeSpan.FromDays(30);

    private readonly KeytographyDbContext _db;
    private readonly IDekCache _dekCache;
    private readonly IConfiguration _configuration;
    private readonly TimeProvider _time;
    private readonly SessionLifetimeOptions _options;

    public SessionService(
        KeytographyDbContext db,
        IDekCache dekCache,
        IConfiguration configuration,
        TimeProvider time,
        IOptions<SessionLifetimeOptions> options)
    {
        _db = db;
        _dekCache = dekCache;
        _configuration = configuration;
        _time = time;
        _options = options.Value;
    }

    public sealed record IssuedSession(UserSession Session, string RefreshToken, string AccessToken, DateTimeOffset AccessTokenExpiresAt);

    public enum RefreshOutcome { Rotated, WithinGrace, Invalid, ReuseDetected }

    public sealed record RefreshResult(
        RefreshOutcome Outcome,
        UserSession? Session = null,
        User? User = null,
        string? NewRefreshToken = null);

    /// <summary>
    /// Cria a sessao do login, guarda a DEK dela em cache e emite os tokens.
    /// </summary>
    /// <param name="user">
    /// Usuario como lido ANTES de verificar a senha: o <see cref="User.SecurityStamp"/> dele e gravado
    /// na sessao, de modo que uma troca de senha concorrente a invalida (ver ADR-0006).
    /// </param>
    /// <param name="previousRefreshToken">
    /// Cookie de refresh que o navegador enviou no login, se houver: a sessao dele e substituida
    /// (um navegador tem uma sessao so; o cookie novo sobrescreve o antigo, que ficaria orfao).
    /// </param>
    /// <returns>
    /// A sessao e os tokens, ou <c>null</c> se o carimbo de seguranca do usuario mudou entre a
    /// leitura e a criacao (uma troca de senha concluiu no meio do login): a sessao nasce revogada.
    /// </returns>
    public async Task<IssuedSession?> CreateAsync(
        User user, byte[]? dek, string? previousRefreshToken, CancellationToken cancellationToken)
    {
        var now = _time.GetUtcNow();
        await RemoveStaleSessionsAsync(now, cancellationToken);

        // A substituicao entra na MESMA transacao do insert da sessao nova: se o insert falhar, o
        // usuario nao perde a sessao anterior sem ganhar a nova.
        Guid? supersededId = null;
        if (await FindTrackedByRefreshTokenAsync(previousRefreshToken, cancellationToken) is { RevokedAt: null } previous)
        {
            previous.RevokedAt = now;
            previous.RevokedReason = SessionRevocationReason.Superseded;
            supersededId = previous.Id;
        }

        var refreshToken = NewRefreshToken();
        var session = new UserSession
        {
            UserId = user.Id,
            SecurityStamp = user.SecurityStamp,
            RefreshTokenHash = Hash(refreshToken),
            CreatedAt = now,
            LastRefreshedAt = now,
            AbsoluteExpiresAt = now + _options.AbsoluteLifetime
        };
        session.IdleExpiresAt = IdleExpiryFrom(now, session);

        _db.UserSessions.Add(session);
        await _db.SaveChangesAsync(cancellationToken);

        if (supersededId is { } superseded)
        {
            _dekCache.Remove(superseded);
        }

        // Se o reset de senha concluiu depois de lermos o usuario (e antes de a sessao existir), a
        // revogacao em lote nao a enxerga: o carimbo a invalida, e aqui ela ja nasce encerrada, sem
        // deixar DEK em memoria nem devolver tokens.
        if (!await IsStillValidAsync(session.Id, cancellationToken))
        {
            await RevokeAsync(session.Id, SessionRevocationReason.PasswordReset, cancellationToken);
            return null;
        }

        await EnforceSessionLimitAsync(user, session.Id, now, cancellationToken);

        if (dek is not null)
        {
            _dekCache.Set(session.Id, dek, session.IdleExpiresAt - now);

            // Um reset de senha pode ter concluido entre a conferencia acima e este Set: a revogacao
            // em lote ja viu a sessao, mas o ForgetDeks dela rodou ANTES de a DEK entrar no cache e
            // a deixaria em memoria. Reconferir depois do Set fecha a janela (ou o reset remove a DEK
            // depois do Set, ou nos removemos aqui) e o login nao devolve tokens de uma sessao morta.
            if (!await IsStillValidAsync(session.Id, cancellationToken))
            {
                await RevokeAsync(session.Id, SessionRevocationReason.PasswordReset, cancellationToken);
                return null;
            }
        }

        var (accessToken, accessExpiresAt) = IssueAccessToken(user, session, now);
        return new IssuedSession(session, refreshToken, accessToken, accessExpiresAt);
    }

    /// <summary>
    /// Valida e consome um refresh token. Rotaciona o token (novo valor, expiracao por
    /// inatividade renovada, TTL da DEK renovado); o token anterior ainda e aceito por uma
    /// janela curta (sem nova rotacao) e, fora dela, o reuso revoga a sessao inteira.
    /// </summary>
    /// <remarks>
    /// A rotacao e atomica: um UPDATE condicionado ao hash lido. Dois refreshes simultaneos com o
    /// mesmo cookie nao rotacionam duas vezes - o que perde a corrida relê a sessao, encontra o
    /// token como "anterior" e cai na tolerancia (recebe so um access token, sem novo cookie).
    /// </remarks>
    public async Task<RefreshResult> RefreshAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return new RefreshResult(RefreshOutcome.Invalid);
        }

        var hash = Hash(refreshToken);

        // Segunda passada so acontece se a rotacao condicional perdeu a corrida para outro refresh.
        for (var attempt = 0; attempt < 2; attempt++)
        {
            var now = _time.GetUtcNow();
            var session = await _db.UserSessions.AsNoTracking().FirstOrDefaultAsync(
                s => s.RefreshTokenHash == hash || s.PreviousRefreshTokenHash == hash, cancellationToken);

            if (session is null || !session.IsActive(now))
            {
                return new RefreshResult(RefreshOutcome.Invalid);
            }

            var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == session.UserId, cancellationToken);
            if (user is null || !user.EmailVerified)
            {
                return new RefreshResult(RefreshOutcome.Invalid);
            }

            // Credenciais mudaram desde o login (troca de senha): a sessao e encerrada de vez, com a DEK.
            if (user.SecurityStamp != session.SecurityStamp)
            {
                await RevokeAsync(session.Id, SessionRevocationReason.PasswordReset, cancellationToken);
                return new RefreshResult(RefreshOutcome.Invalid);
            }

            if (session.RefreshTokenHash != hash)
            {
                if (session.RefreshRotatedAt is { } rotatedAt && now - rotatedAt <= _options.RotationGrace)
                {
                    return new RefreshResult(RefreshOutcome.WithinGrace, session, user);
                }

                await RevokeAsync(session.Id, SessionRevocationReason.ReuseDetected, cancellationToken);
                return new RefreshResult(RefreshOutcome.ReuseDetected);
            }

            var newToken = NewRefreshToken();
            var newHash = Hash(newToken);
            var idleExpiresAt = IdleExpiryFrom(now, session);

            var rotated = await _db.UserSessions
                .Where(s => s.Id == session.Id && s.RefreshTokenHash == hash && s.RevokedAt == null)
                .ExecuteUpdateAsync(set => set
                    .SetProperty(s => s.PreviousRefreshTokenHash, hash)
                    .SetProperty(s => s.RefreshTokenHash, newHash)
                    .SetProperty(s => s.RefreshRotatedAt, (DateTimeOffset?)now)
                    .SetProperty(s => s.LastRefreshedAt, now)
                    .SetProperty(s => s.IdleExpiresAt, idleExpiresAt), cancellationToken);

            if (rotated == 1)
            {
                session.PreviousRefreshTokenHash = hash;
                session.RefreshTokenHash = newHash;
                session.RefreshRotatedAt = now;
                session.LastRefreshedAt = now;
                session.IdleExpiresAt = idleExpiresAt;

                await RenewDekAsync(session, now, cancellationToken);
                return new RefreshResult(RefreshOutcome.Rotated, session, user, newToken);
            }
        }

        return new RefreshResult(RefreshOutcome.Invalid);
    }

    /// <summary>
    /// Renova o TTL da DEK da sessao (se ainda estiver em cache) a partir da expiracao atual dela.
    /// Se a sessao foi revogada enquanto isso (logout concorrente), a DEK nao pode "ressuscitar":
    /// a conferencia depois do Set garante que ou o logout remove a DEK, ou nos removemos.
    /// </summary>
    public async Task RenewDekAsync(UserSession session, DateTimeOffset now, CancellationToken cancellationToken)
    {
        using var dek = _dekCache.Lease(session.Id);
        if (dek is null)
        {
            return;
        }

        _dekCache.Set(session.Id, dek.Value, session.IdleExpiresAt - now);

        var revoked = await _db.UserSessions.AsNoTracking()
            .AnyAsync(s => s.Id == session.Id && s.RevokedAt != null, cancellationToken);
        if (revoked)
        {
            _dekCache.Remove(session.Id);
        }
    }

    /// <summary>A sessao existe, nao foi revogada e o carimbo dela ainda e o do usuario.</summary>
    private async Task<bool> IsStillValidAsync(Guid sessionId, CancellationToken cancellationToken) =>
        await (
            from s in _db.UserSessions.AsNoTracking()
            join u in _db.Users.AsNoTracking() on s.UserId equals u.Id
            where s.Id == sessionId
            select s.RevokedAt == null && u.SecurityStamp == s.SecurityStamp)
            .FirstOrDefaultAsync(cancellationToken);

    public (string Token, DateTimeOffset ExpiresAt) IssueAccessToken(User user, UserSession session, DateTimeOffset? now = null)
    {
        var issuedAt = now ?? _time.GetUtcNow();
        var key = _configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key não configurado. Veja docs/guides/running-locally.md.");
        var issuer = _configuration["Jwt:Issuer"] ?? "Keytography";
        var audience = _configuration["Jwt:Audience"] ?? "Keytography";
        var expiresAt = issuedAt + _options.AccessTokenLifetime;

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Sid, session.Id.ToString()),
            new Claim("login", user.Login),
            new Claim(ClaimTypes.Role, user.Role.ToString())
        };

        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: expiresAt.UtcDateTime,
            signingCredentials: credentials);

        return (new JwtSecurityTokenHandler().WriteToken(token), expiresAt);
    }

    /// <summary>Revoga a sessao (se ainda ativa) e remove a DEK dela do cache. Idempotente.</summary>
    public async Task RevokeAsync(Guid sessionId, SessionRevocationReason reason, CancellationToken cancellationToken)
    {
        var now = _time.GetUtcNow();
        await _db.UserSessions
            .Where(s => s.Id == sessionId && s.RevokedAt == null)
            .ExecuteUpdateAsync(set => set
                .SetProperty(s => s.RevokedAt, (DateTimeOffset?)now)
                .SetProperty(s => s.RevokedReason, (SessionRevocationReason?)reason), cancellationToken);

        _dekCache.Remove(sessionId);
    }

    /// <summary>
    /// Marca como revogadas, no contexto atual e SEM salvar, todas as sessoes ainda nao
    /// revogadas do usuario. Permite revogar na mesma transacao de outra mudanca (troca de
    /// senha); depois do <c>SaveChanges</c> o chamador remove as DEKs com <see cref="ForgetDeks"/>.
    /// </summary>
    public async Task<IReadOnlyList<Guid>> MarkAllRevokedAsync(Guid userId, SessionRevocationReason reason, CancellationToken cancellationToken)
    {
        var now = _time.GetUtcNow();
        var sessions = await _db.UserSessions
            .Where(s => s.UserId == userId && s.RevokedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var session in sessions)
        {
            session.RevokedAt = now;
            session.RevokedReason = reason;
        }

        return sessions.Select(s => s.Id).ToList();
    }

    /// <summary>Remove do cache as DEKs das sessoes informadas.</summary>
    public void ForgetDeks(IEnumerable<Guid> sessionIds)
    {
        foreach (var sessionId in sessionIds)
        {
            _dekCache.Remove(sessionId);
        }
    }

    /// <summary>Revoga todas as sessoes ainda nao revogadas do usuario e remove as DEKs delas.</summary>
    public async Task RevokeAllAsync(Guid userId, SessionRevocationReason reason, CancellationToken cancellationToken)
    {
        var ids = await MarkAllRevokedAsync(userId, reason, cancellationToken);
        await _db.SaveChangesAsync(cancellationToken);
        ForgetDeks(ids);
    }

    /// <summary>Sessao ativa referente ao access token (claim sid), ou null.</summary>
    public async Task<UserSession?> FindActiveAsync(Guid sessionId, Guid userId, CancellationToken cancellationToken)
    {
        var found = await (
            from s in _db.UserSessions.AsNoTracking()
            join u in _db.Users.AsNoTracking() on s.UserId equals u.Id
            where s.Id == sessionId && s.UserId == userId
            select new { Session = s, UserStamp = u.SecurityStamp })
            .FirstOrDefaultAsync(cancellationToken);

        if (found is null)
        {
            return null;
        }

        // O carimbo precisa ser o mesmo do login: trocar a senha o renova e derruba a sessao. Alem de
        // recusar, encerra-a de vez (e remove a DEK), para nao deixar sessao orfa com chave em memoria.
        if (found.Session.SecurityStamp != found.UserStamp)
        {
            if (found.Session.RevokedAt is null)
            {
                await RevokeAsync(sessionId, SessionRevocationReason.PasswordReset, cancellationToken);
            }

            return null;
        }

        return found.Session.IsActive(_time.GetUtcNow()) ? found.Session : null;
    }

    /// <summary>Sessao (qualquer estado) cujo refresh token atual ou anterior e o informado.</summary>
    public async Task<UserSession?> FindByRefreshTokenAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return null;
        }

        var hash = Hash(refreshToken);
        return await _db.UserSessions.AsNoTracking().FirstOrDefaultAsync(
            s => s.RefreshTokenHash == hash || s.PreviousRefreshTokenHash == hash, cancellationToken);
    }

    /// <summary>Como <see cref="FindByRefreshTokenAsync"/>, mas rastreada pelo contexto (para alterar e salvar junto de outra mudanca).</summary>
    private async Task<UserSession?> FindTrackedByRefreshTokenAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return null;
        }

        var hash = Hash(refreshToken);
        return await _db.UserSessions.FirstOrDefaultAsync(
            s => s.RefreshTokenHash == hash || s.PreviousRefreshTokenHash == hash, cancellationToken);
    }

    public Task<UserSession?> FindByIdAsync(Guid sessionId, CancellationToken cancellationToken) =>
        _db.UserSessions.AsNoTracking().FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

    public void WriteRefreshCookie(HttpContext context, string refreshToken, UserSession session) =>
        context.Response.Cookies.Append(RefreshCookieName, refreshToken, CookieOptions(context, session.IdleExpiresAt));

    public void ClearRefreshCookie(HttpContext context) =>
        context.Response.Cookies.Delete(RefreshCookieName, CookieOptions(context, null));

    private CookieOptions CookieOptions(HttpContext context, DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Strict,
        // Atras de um proxy que termina TLS a requisicao chega como HTTP: ForceSecureCookie cobre esse caso.
        Secure = _options.ForceSecureCookie || context.Request.IsHttps,
        Path = RefreshCookiePath,
        // Cookie persistente, com a mesma validade da sessao por inatividade: recarregar a
        // pagina ou abrir outra aba restaura a sessao, mas ela nao sobrevive a sua expiracao.
        Expires = expires
    };

    private DateTimeOffset IdleExpiryFrom(DateTimeOffset now, UserSession session)
    {
        var idle = now + _options.IdleLifetime;
        return idle < session.AbsoluteExpiresAt ? idle : session.AbsoluteExpiresAt;
    }

    /// <summary>
    /// Teto de sessoes simultaneas por usuario, por perfil (<c>Sessions:MaxSessionsPerMember</c> e
    /// <c>Sessions:MaxSessionsPerAdmin</c>): ao passar dele, as mais antigas (pelo ultimo uso) sao
    /// encerradas. A sessao recem-criada nunca e a escolhida; expiradas e revogadas nao contam.
    /// </summary>
    private async Task EnforceSessionLimitAsync(User user, Guid newSessionId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var limit = _options.SessionLimitFor(user.Role);
        var others = await _db.UserSessions
            .Where(s => s.UserId == user.Id && s.Id != newSessionId && s.RevokedAt == null
                        && s.IdleExpiresAt > now && s.AbsoluteExpiresAt > now)
            .OrderBy(s => s.LastRefreshedAt)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);

        foreach (var oldest in others.Take(Math.Max(0, others.Count - (limit - 1))))
        {
            await RevokeAsync(oldest, SessionRevocationReason.SessionLimit, cancellationToken);
        }
    }

    /// <summary>Remove sessoes encerradas (revogadas ou expiradas) ha mais de 30 dias.</summary>
    private async Task RemoveStaleSessionsAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var cutoff = now - RetentionAfterEnd;
        await _db.UserSessions
            .Where(s => (s.RevokedAt != null && s.RevokedAt < cutoff)
                        || s.IdleExpiresAt < cutoff
                        || s.AbsoluteExpiresAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);
    }

    private static string NewRefreshToken() =>
        Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));

    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
