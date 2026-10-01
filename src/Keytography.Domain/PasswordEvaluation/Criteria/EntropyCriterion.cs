namespace Keytography.Domain.PasswordEvaluation.Criteria;

/// <summary>
/// Estima a entropia em bits a partir do tamanho do "alfabeto" usado (minusculas,
/// maiusculas, digitos, simbolos) e do comprimento da senha - abordagem padrao de
/// estimativa de forca por espaco de busca, nao entropia de Shannon do texto em si.
/// 80 bits satura a nota em 100 (piso razoavel de forca para uso local).
/// </summary>
public class EntropyCriterion : IPasswordEvaluationCriterion
{
    private const double FullScoreBits = 80.0;

    public string Key => "entropy";

    public CriterionEvaluation Evaluate(PasswordEvaluationContext context)
    {
        var password = context.Password;
        var poolSize = 0;
        if (password.Any(char.IsLower)) poolSize += 26;
        if (password.Any(char.IsUpper)) poolSize += 26;
        if (password.Any(char.IsDigit)) poolSize += 10;
        if (password.Any(c => !char.IsLetterOrDigit(c))) poolSize += 32;

        if (poolSize == 0)
        {
            return CriterionEvaluation.FromScore(0.0);
        }

        var bits = password.Length * Math.Log2(poolSize);
        var score = Math.Clamp(bits / FullScoreBits, 0.0, 1.0) * 100.0;
        return CriterionEvaluation.FromScore(score);
    }
}
