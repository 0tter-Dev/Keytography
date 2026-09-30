namespace Keytography.Domain.PasswordEvaluation;

/// <summary>
/// Nota media (0-100) entre todos os criterios registrados, e o detalhamento
/// individual por criterio (chave do criterio -> nota + aprovado/reprovado).
/// </summary>
public record PasswordEvaluationResult(double AverageScore, IReadOnlyDictionary<string, CriterionEvaluation> ScoresByCriterion);
