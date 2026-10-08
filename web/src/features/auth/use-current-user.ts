import { useEffect, useState } from 'react'
import { loadIdentity } from './session'
import { useSessionStore } from './session-store'

/** Espera antes de pedir a identidade de novo quando `GET /auth/me` falhou. */
const RETRY_IDENTITY_MS = 15_000

/**
 * Usuário da sessão atual (`GET /auth/me`, carregado sob demanda e conferido a cada renovação da
 * sessão). Fica no store da sessão, e não no cache de consultas, para que a verificação de troca
 * de conta compare a conta que esta aba mostra com a que o cookie compartilhado agora representa.
 */
export function useCurrentUser() {
  const user = useSessionStore((state) => state.user)
  const hasToken = useSessionStore((state) => state.token !== null)
  const [attempt, setAttempt] = useState(0)

  // Sem a identidade o aviso de troca de conta não funciona (não há "conta anterior" a comparar):
  // se a leitura falhou, tenta de novo em instantes enquanto houver sessão.
  useEffect(() => {
    if (!hasToken || user !== null) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    void loadIdentity().then((loaded) => {
      if (!loaded && !cancelled) {
        timer = setTimeout(() => setAttempt((count) => count + 1), RETRY_IDENTITY_MS)
      }
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [hasToken, user, attempt])

  return { data: user }
}
