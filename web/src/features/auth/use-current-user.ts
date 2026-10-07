import { useEffect } from 'react'
import { loadIdentity } from './session'
import { useSessionStore } from './session-store'

/**
 * Usuário da sessão atual (`GET /auth/me`, carregado sob demanda e conferido a cada renovação da
 * sessão). Fica no store da sessão, e não no cache de consultas, para que a verificação de troca
 * de conta compare a conta que esta aba mostra com a que o cookie compartilhado agora representa.
 */
export function useCurrentUser() {
  const user = useSessionStore((state) => state.user)
  const hasToken = useSessionStore((state) => state.token !== null)

  useEffect(() => {
    if (hasToken && user === null) {
      void loadIdentity()
    }
  }, [hasToken, user])

  return { data: user }
}
