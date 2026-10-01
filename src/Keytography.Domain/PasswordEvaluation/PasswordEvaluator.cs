namespace Keytography.Domain.PasswordEvaluation;

/// <summary>
/// Agrega os criterios registrados em uma unica nota media, com o detalhamento
/// por criterio preservado. A lista de criterios e aberta - novos criterios sao
/// incluidos aqui automaticamente via injecao de dependencia, sem alterar este tipo.
/// </summary>
public static class PasswordEvaluator
{
    public static PasswordEvaluationResult Evaluate(PasswordEvaluationContext context, IEnumerable<IPasswordEvaluationCriterion> criteria)
    {
        var scoresByCriterion = criteria.ToDictionary(c => c.Key, c => c.Evaluate(context));
        var average = scoresByCriterion.Count == 0 ? 0.0 : scoresByCriterion.Values.Average(r => r.Score);
        return new PasswordEvaluationResult(average, scoresByCriterion);
    }
}
