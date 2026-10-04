using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Keytography.Api;

public static class ClaimsPrincipalExtensions
{
    public static Guid GetUserId(this ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub)!);

    /// <summary>Id da sessao (claim "sid") do access token; a DEK em cache e indexada por ele.</summary>
    public static Guid GetSessionId(this ClaimsPrincipal principal) =>
        Guid.Parse(principal.FindFirstValue(JwtRegisteredClaimNames.Sid)!);

    public static bool TryGetSessionId(this ClaimsPrincipal principal, out Guid sessionId) =>
        Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sid), out sessionId);
}
