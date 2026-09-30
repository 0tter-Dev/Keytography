namespace Keytography.Domain.PasswordEvaluation;

/// <summary>
/// Resultado de um unico criterio: nota de 0 a 100, e se o criterio foi
/// considerado aprovado (nota >= 50, por padrao) - usado para indicar
/// especificamente quais criterios reprovaram.
/// </summary>
public record CriterionEvaluation(double Score, bool Passed)
{
    public const double DefaultPassThreshold = 50.0;

    public static CriterionEvaluation FromScore(double score, double passThreshold = DefaultPassThreshold) =>
        new(score, score >= passThreshold);
}
