namespace Keytography.Api.Auth;

/// <summary>
/// Origens de navegador permitidas (CORS e verificacao de Origin dos endpoints com cookie).
/// Fonte unica: Cors:AllowedOrigins; padrao = servidor de desenvolvimento do Vite (web/).
/// </summary>
public static class AllowedOrigins
{
    /// <summary>Origens configuradas, sem a barra final (o navegador nunca a envia em Origin).</summary>
    public static string[] Resolve(IConfiguration configuration) =>
        (configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["http://localhost:5173", "http://127.0.0.1:5173"])
        .Select(origin => origin.Trim().TrimEnd('/'))
        .ToArray();

    /// <summary>
    /// Protecao CSRF dos endpoints que aceitam o cookie de refresh: alem de SameSite=Strict,
    /// um Origin presente precisa ser de uma origem permitida (inclusive "null" e origens
    /// estranhas sao recusados). Sem Origin = cliente que nao e navegador, que nao sofre CSRF.
    /// </summary>
    public static bool IsRequestOriginAllowed(HttpRequest request, IConfiguration configuration)
    {
        if (!request.Headers.TryGetValue("Origin", out var origin) || origin.Count == 0)
        {
            return true;
        }

        return Resolve(configuration).Contains(origin.ToString().TrimEnd('/'), StringComparer.OrdinalIgnoreCase);
    }
}
