/** Faixas de apresentação da nota (0 a 100) devolvida pela API; o cálculo é sempre do backend. */
export type StrengthBand = 'weak' | 'medium' | 'strong'

export const MEDIUM_FROM = 40
export const STRONG_FROM = 70

/** Os critérios que a interface sabe nomear; qualquer outra chave da API aparece com um rótulo genérico. */
export const KNOWN_CRITERIA = ['length', 'entropy', 'reuse', 'complexity'] as const
export type KnownCriterion = (typeof KNOWN_CRITERIA)[number]

export function isKnownCriterion(key: string): key is KnownCriterion {
  return (KNOWN_CRITERIA as readonly string[]).includes(key)
}

/**
 * A nota como será exibida: inteira e limitada a 0 a 100, ou `null` se não há nota (ausente ou não
 * numérica). A faixa sai deste valor, para o número e o nome da faixa nunca discordarem.
 */
export function displayScore(score: number | null | undefined): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return null
  }
  return Math.min(100, Math.max(0, Math.round(score)))
}

/** Resultado de um critério como a API o devolve. */
export type CriterionResult = { score: number; passed: boolean }

/**
 * Os critérios que a tela pode mostrar: só objetos (o detalhamento da API é um mapa de critério para
 * resultado; qualquer outra forma, ou uma entrada nula, é ignorada em vez de quebrar a tela).
 */
export function validCriteria(detail: unknown): [string, CriterionResult][] {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
    return []
  }
  return Object.entries(detail).filter(
    (entry): entry is [string, CriterionResult] =>
      typeof entry[1] === 'object' && entry[1] !== null,
  )
}

/**
 * A faixa de apresentação. Parte da nota (já pela média da API) e a rebaixa pelos critérios que
 * reprovaram, porque a média esconde reprovações (ex.: uma senha de 3 caracteres que não se repete
 * passa em reuso e previsibilidade e sai com nota média):
 *
 * - metade ou mais dos critérios reprovados: fraca;
 * - forte exige todos os critérios atendidos;
 * - sem detalhamento, vale só a nota.
 *
 * É regra de apresentação sobre o que a API devolveu (`passed`), não uma avaliação nova.
 */
export function strengthBand(
  score: number,
  criteria: readonly CriterionResult[] = [],
): StrengthBand {
  const byScore: StrengthBand =
    score >= STRONG_FROM ? 'strong' : score >= MEDIUM_FROM ? 'medium' : 'weak'
  if (criteria.length === 0) {
    return byScore
  }
  const failed = criteria.filter((criterion) => criterion.passed !== true).length
  if (failed * 2 >= criteria.length) {
    return 'weak'
  }
  return failed > 0 && byScore === 'strong' ? 'medium' : byScore
}
