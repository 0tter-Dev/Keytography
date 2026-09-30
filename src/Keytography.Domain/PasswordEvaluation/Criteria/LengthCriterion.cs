namespace Keytography.Domain.PasswordEvaluation.Criteria;

/// <summary>
/// Nota cresce linearmente com o comprimento ate 16 caracteres, onde satura em 100.
/// </summary>
public class LengthCriterion : IPasswordEvaluationCriterion
{
    private const double FullScoreLength = 16.0;

    public string Key => "length";

    public CriterionEvaluation Evaluate(PasswordEvaluationContext context)
    {
        var score = Math.Clamp(context.Password.Length / FullScoreLength, 0.0, 1.0) * 100.0;
        return CriterionEvaluation.FromScore(score);
    }
}
