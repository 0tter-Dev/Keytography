import { useSessionStore } from '@/features/auth/session-store'
import { VaultError } from './vault-api'

/**
 * Um `401` do cofre só "se explica sozinho" quando a sessão terminou (o cliente leva ao login) ou a
 * conta trocou (o cliente avisa e volta ao início). Fora disso — chamada recusada porque a conta
 * ainda não foi conferida, refresh que não respondeu — a tela precisa dizer que nada foi feito.
 */
export function unauthorizedNeedsNotice(): boolean {
  const { token, accountChanged } = useSessionStore.getState()
  return token !== null && !accountChanged
}

/** `true` se `error` é um `401` que a tela deve explicar (ver `unauthorizedNeedsNotice`). */
export function isUnexplainedUnauthorized(error: unknown): boolean {
  return (
    error instanceof VaultError && error.failure === 'unauthorized' && unauthorizedNeedsNotice()
  )
}
