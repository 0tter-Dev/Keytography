using System.Security.Cryptography;
using Keytography.Domain.PasswordEvaluation;

namespace Keytography.Api.PasswordGeneration;

/// <summary>
/// Gerador de senhas fortes configuraveis (ver capabilities/password-generation).
/// Toda senha gerada e avaliada pelo motor de keytography-005 antes de ser
/// retornada; o gerador tenta novamente, com um limite de tentativas, ate
/// atingir a nota minima exigida.
/// </summary>
public static class PasswordGenerationEndpoints
{
    private const int MinLength = 1;
    private const int MaxLength = 128;
    private const double DefaultMinimumScore = 70.0;
    private const int MaxAttempts = 50;

    private const string LowercaseChars = "abcdefghijklmnopqrstuvwxyz";
    private const string UppercaseChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private const string DigitChars = "0123456789";
    private const string SymbolChars = "!@#$%^&*()-_=+[]{}";
    private const string AmbiguousChars = "0O1lI";

    public static void MapPasswordGenerationEndpoints(this WebApplication app)
    {
        app.MapPost("/passwords/generate", GenerateAsync).RequireAuthorization().Produces<GeneratePasswordResponse>();
    }

    private static IResult GenerateAsync(
        GeneratePasswordRequest request,
        IEnumerable<IPasswordEvaluationCriterion> criteria)
    {
        if (request.Length < MinLength || request.Length > MaxLength)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["length"] = [$"Tamanho deve ser entre {MinLength} e {MaxLength}."]
            });
        }

        var minimumScore = request.MinimumScore ?? DefaultMinimumScore;
        if (minimumScore is < 0 or > 100)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["minimumScore"] = ["Nota mínima deve ser entre 0 e 100."]
            });
        }

        var pool = BuildCharacterPool(request.IncludeSymbols, request.ExcludeAmbiguousCharacters);
        var criteriaList = criteria.ToList();

        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            var candidate = GenerateCandidate(pool, request.Length);
            var evaluation = PasswordEvaluator.Evaluate(
                new PasswordEvaluationContext(candidate, [], []), criteriaList);

            if (evaluation.AverageScore >= minimumScore)
            {
                return Results.Ok(new GeneratePasswordResponse(candidate, evaluation.AverageScore, evaluation.ScoresByCriterion.ToDictionary(kv => kv.Key, kv => kv.Value)));
            }
        }

        return Results.UnprocessableEntity(new
        {
            message = "Não foi possível gerar uma senha que atinja a força mínima com os parâmetros fornecidos. Tente um tamanho maior ou uma nota mínima menor."
        });
    }

    private static string BuildCharacterPool(bool includeSymbols, bool excludeAmbiguousCharacters)
    {
        var pool = LowercaseChars + UppercaseChars + DigitChars + (includeSymbols ? SymbolChars : string.Empty);
        return excludeAmbiguousCharacters
            ? new string(pool.Where(c => !AmbiguousChars.Contains(c)).ToArray())
            : pool;
    }

    private static string GenerateCandidate(string pool, int length)
    {
        var chars = new char[length];
        for (var i = 0; i < length; i++)
        {
            chars[i] = pool[RandomNumberGenerator.GetInt32(pool.Length)];
        }

        return new string(chars);
    }
}
