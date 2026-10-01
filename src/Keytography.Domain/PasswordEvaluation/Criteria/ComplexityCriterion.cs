using System.Text.RegularExpressions;

namespace Keytography.Domain.PasswordEvaluation.Criteria;

/// <summary>
/// Penaliza padroes previsiveis: caracteres repetidos em sequencia, sequencias
/// crescentes/decrescentes de codigo de caractere (ex.: "abcd", "4321"), e anos
/// de 4 digitos (padrao de data, um dos exemplos mais comuns de senha fraca).
/// </summary>
public partial class ComplexityCriterion : IPasswordEvaluationCriterion
{
    private const int RepeatedCharacterRunLength = 3;
    private const int SequentialRunLength = 4;
    private const double PenaltyPerViolation = 60.0;

    public string Key => "complexity";

    public CriterionEvaluation Evaluate(PasswordEvaluationContext context)
    {
        var password = context.Password;
        var violations = 0;

        if (HasRepeatedCharacterRun(password)) violations++;
        if (HasSequentialRun(password)) violations++;
        if (YearPattern().IsMatch(password)) violations++;

        var score = Math.Clamp(100.0 - violations * PenaltyPerViolation, 0.0, 100.0);
        return CriterionEvaluation.FromScore(score);
    }

    private static bool HasRepeatedCharacterRun(string password)
    {
        var run = 1;
        for (var i = 1; i < password.Length; i++)
        {
            run = password[i] == password[i - 1] ? run + 1 : 1;
            if (run >= RepeatedCharacterRunLength)
            {
                return true;
            }
        }

        return false;
    }

    private static bool HasSequentialRun(string password)
    {
        var ascending = 1;
        var descending = 1;
        for (var i = 1; i < password.Length; i++)
        {
            var diff = password[i] - password[i - 1];
            ascending = diff == 1 ? ascending + 1 : 1;
            descending = diff == -1 ? descending + 1 : 1;
            if (ascending >= SequentialRunLength || descending >= SequentialRunLength)
            {
                return true;
            }
        }

        return false;
    }

    [GeneratedRegex(@"(19|20)\d{2}")]
    private static partial Regex YearPattern();
}
