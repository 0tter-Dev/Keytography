using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Keytography.Domain;
using Keytography.Infrastructure;
using Microsoft.EntityFrameworkCore;
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
        Microsoft.Extensions.Options.IOptions<SessionLifetimeOptions> options)
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

    /// <summary>Cria a sessao do login, guarda a DEK dela em cache e emite os tokens.</summary>
    public async Task<IssuedSession> CreateAsync(User user, byte[]? dek, CancellationToken cancellationToken)
    {
        var now = _time.GetUtcNow();
        await RemoveStaleSessionsAsync(now, cancellationToken);

        var refreshToken = NewRefreshToken();
        var session = new UserSession
        {
            UserId = user.Id,
            RefreshTokenHash = Hash(refreshToken),
            CreatedAt = now,
            LastRefreshedAt = now,
            AbsoluteExpiresAt = now + _options.AbsoluteLifetime
        };
        session.IdleExpiresAt = IdleExpiryFrom(now, session);

        _db.UserSessions.Add(session);
        await _db.SaveChangesAsync(cancellationToken);

        if (dek is not null)
        {
            _dekCache.Set(session.Id, dek, session.IdleExpiresAt - now);
        }

        var (accessToken, accessExpiresAt) = IssueAccessToken(user, session, now);
        return new IssuedSession(session, refreshToken, accessToken, accessExpiresAt);
    }

    /// <summary>
    /// Valida e consome um refresh token. Rotaciona o token (novo valor, expiracao por
    /// inatividade renovada, TTL da DEK renovado); o token anterior ainda e aceito por uma
    /// janela curta (sem nova rotacao) e, fora dela, o reuso revoga a sessao inteira.
    /// </summary>
    public async Task<RefreshResult> RefreshAsync(string? refreshToken, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            return new RefreshResult(RefreshOutcome.Invalid);
        }

        var now = _time.GetUtcNow();
        var hash = Hash(refreshToken);
        var session = await _db.UserSessions.FirstOrDefaultAsync(
            s => s.RefreshTokenHash == hash || s.PreviousRefreshTokenHash == hash, cancellationToken);

        if (session is null || !session.IsActive(now))
        {
            return new RefreshResult(RefreshOutcome.Invalid);
        }

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == session.UserId, cancellationToken);
        if (user is null || !user.EmailVerified)
        {
            return new RefreshResult(RefreshOutcome.Invalid);
        }

        // Comparacao do hash atual primeiro: se os dois coincidirem (nao deveriam), vale o atual.
        if (session.RefreshTokenHash != hash)
        {
            if (session.RefreshRotatedAt is { } rotatedAt && now - rotatedAt <= _options.RotationGrace)
            {
                return new RefreshResult(RefreshOutcome.WithinGrace, session, user);
            }

            await RevokeAsync(session, SessionRevocationReason.ReuseDetected, cancellationToken);
            return new RefreshResult(RefreshOutcome.ReuseDetected);
        }

        var newToken = NewRefreshToken();
        session.PreviousRefreshTokenHash = session.RefreshTokenHash;
        session.RefreshTokenHash = Hash(newToken);
        session.RefreshRotatedAt = now;
        session.LastRefreshedAt = now;
        session.IdleExpiresAt = IdleExpiryFrom(now, session);
        await _db.SaveChangesAsync(cancellationToken);

        RenewDek(session, now);
        return new RefreshResult(RefreshOutcome.Rotated, session, user, newToken);
    }

    /// <summary>Renova o TTL da DEK da sessao (se ainda estiver em cache) a partir da expiracao atual dela.</summary>
    public void RenewDek(UserSession session, DateTimeOffset now)
    {
        if (_dekCache.Get(session.Id) is { } dek)
        {
            _dekCache.Set(session.Id, dek, session.IdleExpiresAt - now);
        }
    }

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
    public async Task RevokeAsync(UserSession session, SessionRevocationReason reason, CancellationToken cancellationToken)
    {
        if (session.RevokedAt is null)
        {
            session.RevokedAt = _time.GetUtcNow();
            session.RevokedReason = reason;
            await _db.SaveChangesAsync(cancellationToken);
        }

        _dekCache.Remove(session.Id);
    }

    /// <summary>Revoga todas as sessoes ainda nao revogadas do usuario e remove as DEKs delas.</summary>
    public async Task RevokeAllAsync(Guid userId, SessionRevocationReason reason, CancellationToken cancellationToken)
    {
        var now = _time.GetUtcNow();
        var sessions = await _db.UserSessions
            .Where(s => s.UserId == userId && s.RevokedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var session in sessions)
        {
            session.RevokedAt = now;
            session.RevokedReason = reason;
            _dekCache.Remove(session.Id);
        }

        await _db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Sessao ativa referente ao access token (claim sid), ou null.</summary>
    public async Task<UserSession?> FindActiveAsync(Guid sessionId, Guid userId, CancellationToken cancellationToken)
    {
        var session = await _db.UserSessions.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.UserId == userId, cancellationToken);
        return session is not null && session.IsActive(_time.GetUtcNow()) ? session : null;
    }

    /// <summary>Sessao (qualquer estado) cujo refresh token atual ou anterior e o informado.</summary>
    public async Task<UserSession?> FindByRefreshTokenAsync(string? refreshToken, CancellationToken cancellationToken)
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
        _db.UserSessions.FirstOrDefaultAsync(s => s.Id == sessionId, cancellationToken);

    public void WriteRefreshCookie(HttpContext context, string refreshToken, UserSession session) =>
        context.Response.Cookies.Append(RefreshCookieName, refreshToken, CookieOptions(context, session.IdleExpiresAt));

    public void ClearRefreshCookie(HttpContext context) =>
        context.Response.Cookies.Delete(RefreshCookieName, CookieOptions(context, null));

    private static CookieOptions CookieOptions(HttpContext context, DateTimeOffset? expires) => new()
    {
        HttpOnly = true,
        SameSite = SameSiteMode.Strict,
        Secure = context.Request.IsHttps,
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
