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

export function strengthBand(score: number): StrengthBand {
  if (score >= STRONG_FROM) {
    return 'strong'
  }
  return score >= MEDIUM_FROM ? 'medium' : 'weak'
}
