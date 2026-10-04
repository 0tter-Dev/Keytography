using System.Security.Claims;
using System.Security.Cryptography;
using Keytography.Domain;
using Keytography.Domain.Security;
using Keytography.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Keytography.Api.Auth;

public static class AuthEndpoints
{
    private const int EmailVerificationTokenLifetimeHours = 24;
    private const int PasswordResetTokenLifetimeHours = 1;

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth");

        group.MapPost("/register", RegisterAsync).Produces<RegisterResponse>(StatusCodes.Status201Created);
        group.MapPost("/verify-email", VerifyEmailAsync).Produces<MessageResponse>();
        group.MapPost("/login", LoginAsync).Produces<LoginResponse>();
        group.MapPost("/refresh", RefreshAsync).Produces<LoginResponse>();
        group.MapPost("/logout", LogoutAsync).Produces(StatusCodes.Status204NoContent);
        group.MapPost("/logout-all", LogoutAllAsync).RequireAuthorization().Produces(StatusCodes.Status204NoContent);
        group.MapPost("/forgot-password", ForgotPasswordAsync).Produces<MessageResponse>();
        group.MapPost("/reset-password", ResetPasswordAsync).Produces<MessageResponse>();
        group.MapGet("/me", GetMeAsync).RequireAuthorization().Produces<MeResponse>();
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request,
        KeytographyDbContext db,
        IEmailSender emailSender,
        IRecoveryKeyProvider recoveryKeyProvider,
        CancellationToken cancellationToken)
    {
        var login = request.Login?.Trim() ?? string.Empty;
        var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        if (login.Length == 0 || email.Length == 0 || !email.Contains('@'))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["login"] = login.Length == 0 ? ["Login é obrigatório."] : [],
                ["email"] = email.Length == 0 || !email.Contains('@') ? ["E-mail inválido."] : []
            });
        }

        if (password.Length < 8)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["password"] = ["Senha deve ter ao menos 8 caracteres."]
            });
        }

        var loginTaken = await db.Users.AnyAsync(u => u.Login == login, cancellationToken);
        var emailTaken = await db.Users.AnyAsync(u => u.Email == email, cancellationToken);
        if (loginTaken || emailTaken)
        {
            return Results.Conflict(new { message = "Login ou e-mail já cadastrado." });
        }

        var isFirstUser = !await db.Users.AnyAsync(cancellationToken);

        var user = new User
        {
            Login = login,
            Email = email,
            PasswordHash = PasswordHasher.Hash(password),
            Role = isFirstUser ? UserRole.Admin : UserRole.Member,
            EmailVerified = false
        };

        db.Users.Add(user);

        var verificationToken = CreateToken(user.Id, UserTokenPurpose.EmailVerification, EmailVerificationTokenLifetimeHours);
        db.UserTokens.Add(verificationToken);

        // Geracao da DEK e das duas copias cifradas conforme ADR-0001. Feito aqui porque
        // a senha em texto puro so existe neste momento (e no login); apos autenticado via
        // JWT, o servidor nunca mais a ve.
        var dek = RandomNumberGenerator.GetBytes(AesGcmCipher.KeySizeBytes);
        var salt = Argon2IdKdf.GenerateSalt();
        var ownerKey = Argon2IdKdf.DeriveKey(password, salt);
        db.VaultKeys.Add(new VaultKey
        {
            UserId = user.Id,
            Argon2Salt = salt,
            OwnerWrappedDek = AesGcmCipher.Encrypt(ownerKey, dek),
            RecoveryWrappedDek = RsaEnvelope.Wrap(recoveryKeyProvider.Key, dek)
        });

        await db.SaveChangesAsync(cancellationToken);

        await emailSender.SendAsync(
            user.Email,
            "Confirme seu e-mail - Keytography",
            $"Use o token a seguir para confirmar seu e-mail: {verificationToken.Token}",
            cancellationToken);

        return Results.Created(
            $"/auth/users/{user.Id}",
            new RegisterResponse(user.Id, user.Login, user.Email, user.Role.ToString(), user.EmailVerified));
    }

    private static async Task<IResult> VerifyEmailAsync(
        VerifyEmailRequest request,
        KeytographyDbContext db,
        CancellationToken cancellationToken)
    {
        var token = await db.UserTokens.FirstOrDefaultAsync(
            t => t.Token == request.Token && t.Purpose == UserTokenPurpose.EmailVerification,
            cancellationToken);

        if (token is null || !token.IsValid(DateTimeOffset.UtcNow))
        {
            return Results.BadRequest(new { message = "Token de verificação inválido ou expirado." });
        }

        var user = await db.Users.FirstAsync(u => u.Id == token.UserId, cancellationToken);
        user.EmailVerified = true;
        token.UsedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new MessageResponse("E-mail verificado com sucesso."));
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        HttpContext httpContext,
        KeytographyDbContext db,
        SessionService sessions,
        CancellationToken cancellationToken)
    {
        var login = request.Login?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Login == login, cancellationToken);

        if (user is null || !PasswordHasher.Verify(password, user.PasswordHash))
        {
            return Results.Unauthorized();
        }

        if (!user.EmailVerified)
        {
            return Results.Problem(
                title: "E-mail não verificado.",
                detail: "Confirme seu e-mail antes de fazer login.",
                statusCode: StatusCodes.Status403Forbidden);
        }

        // Desfaz a DEK usando a copia "do dono" (unica vez em que a senha em texto puro
        // esta disponivel); ela fica em cache em memoria, atrelada a sessao criada abaixo,
        // para as operacoes de cofre (ADR-0001, ADR-0002 e ADR-0006).
        byte[]? dek = null;
        var vaultKey = await db.VaultKeys.FirstOrDefaultAsync(k => k.UserId == user.Id, cancellationToken);
        if (vaultKey is not null)
        {
            var ownerKey = Argon2IdKdf.DeriveKey(password, vaultKey.Argon2Salt);
            dek = AesGcmCipher.Decrypt(ownerKey, vaultKey.OwnerWrappedDek);
        }

        var issued = await sessions.CreateAsync(user, dek, cancellationToken);
        sessions.WriteRefreshCookie(httpContext, issued.RefreshToken, issued.Session);

        return Results.Ok(new LoginResponse(issued.AccessToken, issued.AccessTokenExpiresAt));
    }

    /// <summary>
    /// Renova o access token a partir do cookie de refresh (rotacionando-o). 401 sem revelar o
    /// motivo (cookie ausente, desconhecido, de sessao revogada/expirada ou reutilizado).
    /// </summary>
    private static async Task<IResult> RefreshAsync(
        HttpContext httpContext,
        IConfiguration configuration,
        SessionService sessions,
        CancellationToken cancellationToken)
    {
        if (!AllowedOrigins.IsRequestOriginAllowed(httpContext.Request, configuration))
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        httpContext.Request.Cookies.TryGetValue(SessionService.RefreshCookieName, out var refreshToken);
        var result = await sessions.RefreshAsync(refreshToken, cancellationToken);

        if (result.Outcome is SessionService.RefreshOutcome.Invalid or SessionService.RefreshOutcome.ReuseDetected)
        {
            sessions.ClearRefreshCookie(httpContext);
            return Results.Unauthorized();
        }

        if (result.Outcome == SessionService.RefreshOutcome.Rotated)
        {
            sessions.WriteRefreshCookie(httpContext, result.NewRefreshToken!, result.Session!);
        }

        var (accessToken, expiresAt) = sessions.IssueAccessToken(result.User!, result.Session!);
        return Results.Ok(new LoginResponse(accessToken, expiresAt));
    }

    /// <summary>
    /// Encerra a sessao atual (identificada pelo cookie de refresh ou, sem ele, pelo access
    /// token): revoga, remove a DEK dela do cache e apaga o cookie. Idempotente (204 sempre).
    /// </summary>
    private static async Task<IResult> LogoutAsync(
        HttpContext httpContext,
        ClaimsPrincipal principal,
        IConfiguration configuration,
        SessionService sessions,
        CancellationToken cancellationToken)
    {
        if (!AllowedOrigins.IsRequestOriginAllowed(httpContext.Request, configuration))
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        httpContext.Request.Cookies.TryGetValue(SessionService.RefreshCookieName, out var refreshToken);
        var session = await sessions.FindByRefreshTokenAsync(refreshToken, cancellationToken);
        if (session is null && principal.TryGetSessionId(out var sessionId))
        {
            session = await sessions.FindByIdAsync(sessionId, cancellationToken);
        }

        if (session is not null)
        {
            await sessions.RevokeAsync(session.Id, SessionRevocationReason.Logout, cancellationToken);
        }

        sessions.ClearRefreshCookie(httpContext);
        return Results.NoContent();
    }

    /// <summary>Encerra todas as sessoes do usuario autenticado ("sair de todos os dispositivos").</summary>
    private static async Task<IResult> LogoutAllAsync(
        HttpContext httpContext,
        ClaimsPrincipal principal,
        SessionService sessions,
        CancellationToken cancellationToken)
    {
        await sessions.RevokeAllAsync(principal.GetUserId(), SessionRevocationReason.LogoutAll, cancellationToken);
        sessions.ClearRefreshCookie(httpContext);
        return Results.NoContent();
    }

    private static async Task<IResult> ForgotPasswordAsync(
        ForgotPasswordRequest request,
        KeytographyDbContext db,
        IEmailSender emailSender,
        CancellationToken cancellationToken)
    {
        var email = request.Email?.Trim().ToLowerInvariant() ?? string.Empty;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, cancellationToken);

        if (user is not null)
        {
            var resetToken = CreateToken(user.Id, UserTokenPurpose.PasswordReset, PasswordResetTokenLifetimeHours);
            db.UserTokens.Add(resetToken);
            await db.SaveChangesAsync(cancellationToken);

            await emailSender.SendAsync(
                user.Email,
                "Redefinição de senha - Keytography",
                $"Use o token a seguir para redefinir sua senha: {resetToken.Token}",
                cancellationToken);
        }

        // Resposta identica exista ou nao o e-mail, para nao revelar quais e-mails estao cadastrados.
        return Results.Ok(new MessageResponse("Se o e-mail existir, um token de redefinição foi enviado."));
    }

    private static async Task<IResult> ResetPasswordAsync(
        ResetPasswordRequest request,
        KeytographyDbContext db,
        IRecoveryKeyProvider recoveryKeyProvider,
        SessionService sessions,
        CancellationToken cancellationToken)
    {
        var newPassword = request.NewPassword ?? string.Empty;
        if (newPassword.Length < 8)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["newPassword"] = ["Senha deve ter ao menos 8 caracteres."]
            });
        }

        var token = await db.UserTokens.FirstOrDefaultAsync(
            t => t.Token == request.Token && t.Purpose == UserTokenPurpose.PasswordReset,
            cancellationToken);

        if (token is null || !token.IsValid(DateTimeOffset.UtcNow))
        {
            return Results.BadRequest(new { message = "Token de redefinição inválido ou expirado." });
        }

        var user = await db.Users.FirstAsync(u => u.Id == token.UserId, cancellationToken);
        var vaultKey = await db.VaultKeys.FirstAsync(k => k.UserId == user.Id, cancellationToken);

        // Desfaz a DEK pela copia de recuperacao (chave RSA do sistema) e gera uma nova
        // copia "do dono" cifrada com a chave derivada da nova senha - o mesmo material de
        // DEK e preservado, entao o conteudo ja cifrado do cofre continua legivel (ADR-0001).
        var dek = RsaEnvelope.Unwrap(recoveryKeyProvider.Key, vaultKey.RecoveryWrappedDek);
        var newSalt = Argon2IdKdf.GenerateSalt();
        var newOwnerKey = Argon2IdKdf.DeriveKey(newPassword, newSalt);
        vaultKey.Argon2Salt = newSalt;
        vaultKey.OwnerWrappedDek = AesGcmCipher.Encrypt(newOwnerKey, dek);

        db.UserPasswordHistories.Add(new UserPasswordHistory
        {
            UserId = user.Id,
            PasswordHash = user.PasswordHash
        });
        user.PasswordHash = PasswordHasher.Hash(newPassword);
        token.UsedAt = DateTimeOffset.UtcNow;

        // A credencial mudou: nenhuma sessao aberta com a senha antiga continua valendo. A
        // revogacao entra na MESMA transacao da troca de senha (um unico SaveChanges); so as
        // DEKs em memoria sao removidas depois do commit.
        var revokedSessions = await sessions.MarkAllRevokedAsync(user.Id, SessionRevocationReason.PasswordReset, cancellationToken);

        await db.SaveChangesAsync(cancellationToken);
        sessions.ForgetDeks(revokedSessions);

        return Results.Ok(new MessageResponse("Senha redefinida com sucesso."));
    }

    private static async Task<IResult> GetMeAsync(ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        return user is null
            ? Results.NotFound()
            : Results.Ok(new MeResponse(user.Id, user.Login, user.Email, user.Role.ToString()));
    }

    private static UserToken CreateToken(Guid userId, UserTokenPurpose purpose, int lifetimeHours)
    {
        return new UserToken
        {
            UserId = userId,
            Purpose = purpose,
            Token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)),
            ExpiresAt = DateTimeOffset.UtcNow.AddHours(lifetimeHours)
        };
    }
}
