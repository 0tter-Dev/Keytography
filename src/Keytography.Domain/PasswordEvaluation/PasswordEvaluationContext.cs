namespace Keytography.Domain.PasswordEvaluation;

/// <summary>
/// Dados necessarios para avaliar uma senha: o valor em si, o historico da mesma
/// conta/entrada, e as senhas (atuais e historicas) de outras entradas do mesmo
/// usuario - usados pelo criterio de reuso/repeticao.
/// </summary>
public record PasswordEvaluationContext(
    string Password,
    IReadOnlyList<string> PasswordHistoryForThisEntry,
    IReadOnlyList<string> OtherPasswordsForUser);
