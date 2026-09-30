namespace Keytography.Domain.PasswordEvaluation.Criteria;

/// <summary>
/// Reprova (nota 0) se a senha ja apareceu no historico da mesma conta ou em
/// qualquer outra conta (atual ou historica) do mesmo usuario; aprova (100) caso
/// contrario.
/// </summary>
public class ReuseCriterion : IPasswordEvaluationCriterion
{
    public string Key => "reuse";

    public CriterionEvaluation Evaluate(PasswordEvaluationContext context)
    {
        var reused = context.PasswordHistoryForThisEntry.Contains(context.Password)
            || context.OtherPasswordsForUser.Contains(context.Password);

        return CriterionEvaluation.FromScore(reused ? 0.0 : 100.0);
    }
}
