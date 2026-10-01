namespace Keytography.Domain.PasswordEvaluation;

/// <summary>
/// Um criterio individual de avaliacao de forca de senha (mini-diagnostico).
/// Novos criterios sao adicionados implementando esta interface e registrando-a
/// na injecao de dependencia, sem alterar os ja existentes.
/// </summary>
public interface IPasswordEvaluationCriterion
{
    string Key { get; }
    CriterionEvaluation Evaluate(PasswordEvaluationContext context);
}
