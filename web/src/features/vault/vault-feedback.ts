import { useSessionStore } from '@/features/auth/session-store'
import { VaultError } from './vault-api'

/** A sessão e a conta sob as quais uma ação do cofre começou (ver `isUnexplainedUnauthorized`). */
export type SessionContext = { epoch: number; accountVersion: number }

/** Guarda a sessão e a conta no começo de uma ação, para compará-las quando ela falhar. */
export function captureSessionContext(): SessionContext {
  const { epoch, accountVersion } = useSessionStore.getState()
  return { epoch, accountVersion }
}

/**
 * `true` se `error` é um `401` que a sessão NÃO explica e a tela precisa explicar ("nada foi feito").
 * Um `401` se explica sozinho quando a sessão terminou (o cliente leva ao login) ou a conta trocou
 * (o cliente avisa e volta ao início): isso se vê comparando a sessão (`epoch`) e a conta
 * (`accountVersion`) de AGORA com as do começo da ação, e não lendo um estado que o aviso do cliente
 * já pode ter limpado. Fora disso — conta ainda por conferir, refresh que não respondeu — a chamada
 * não saiu e a tela tem que dizer.
 */
export function isUnexplainedUnauthorized(error: unknown, startedIn: SessionContext): boolean {
  if (!(error instanceof VaultError) || error.failure !== 'unauthorized') {
    return false
  }
  const { epoch, accountVersion } = useSessionStore.getState()
  return epoch === startedIn.epoch && accountVersion === startedIn.accountVersion
}
