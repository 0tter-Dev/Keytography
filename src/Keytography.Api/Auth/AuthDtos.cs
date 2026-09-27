namespace Keytography.Api.Auth;

public record RegisterRequest(string Login, string Email, string Password);

public record RegisterResponse(Guid Id, string Login, string Email, string Role, bool EmailVerified);

public record VerifyEmailRequest(string Token);

public record LoginRequest(string Login, string Password);

public record LoginResponse(string Token, DateTimeOffset ExpiresAt);

public record ForgotPasswordRequest(string Email);

public record MeResponse(Guid Id, string Login, string Email, string Role);
