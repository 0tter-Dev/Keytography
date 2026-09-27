using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Keytography.Domain;
using Keytography.Domain.Security;
using Keytography.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace Keytography.Api.Auth;

public static class AuthEndpoints
{
    private const int EmailVerificationTokenLifetimeHours = 24;
    private const int PasswordResetTokenLifetimeHours = 1;

    public static void MapAuthEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/auth");

        group.MapPost("/register", RegisterAsync);
        group.MapPost("/verify-email", VerifyEmailAsync);
        group.MapPost("/login", LoginAsync);
        group.MapPost("/forgot-password", ForgotPasswordAsync);
        group.MapGet("/me", GetMeAsync).RequireAuthorization();
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request,
        KeytographyDbContext db,
        IEmailSender emailSender,
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

        return Results.Ok(new { message = "E-mail verificado com sucesso." });
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        KeytographyDbContext db,
        IConfiguration configuration,
        CancellationToken cancellationToken)
    {
        var login = request.Login?.Trim() ?? string.Empty;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Login == login, cancellationToken);

        if (user is null || !PasswordHasher.Verify(request.Password ?? string.Empty, user.PasswordHash))
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

        var (token, expiresAt) = IssueJwt(user, configuration);
        return Results.Ok(new LoginResponse(token, expiresAt));
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
        return Results.Ok(new { message = "Se o e-mail existir, um token de redefinição foi enviado." });
    }

    private static async Task<IResult> GetMeAsync(ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(claimsPrincipal.FindFirstValue(JwtRegisteredClaimNames.Sub)!);
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

    private static (string Token, DateTimeOffset ExpiresAt) IssueJwt(User user, IConfiguration configuration)
    {
        var key = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key não configurado. Veja docs/guides/running-locally.md.");
        var issuer = configuration["Jwt:Issuer"] ?? "Keytography";
        var audience = configuration["Jwt:Audience"] ?? "Keytography";
        var expiresAt = DateTimeOffset.UtcNow.AddHours(1);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
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
}
