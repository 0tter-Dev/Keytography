using Keytography.Domain.PasswordEvaluation;

namespace Keytography.Api.PasswordGeneration;

public record GeneratePasswordRequest(int Length, bool IncludeSymbols, bool ExcludeAmbiguousCharacters, double? MinimumScore);

public record GeneratePasswordResponse(string Password, double Score, Dictionary<string, CriterionEvaluation> ScoreDetail);
