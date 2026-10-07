import { api } from '@/api/client'
import { useSessionStore, type CurrentUser } from './session-store'

/**
 * Ciclo de vida da sessão no cliente (ADR-0006), fora do React: renovação por refresh
 * (single-flight), restauração ao abrir a aplicação, verificação de troca de conta, logout real.
 *
 * Este módulo e `api/client.ts` se importam; cada um só usa o outro dentro de funções (nunca na
 * avaliação do módulo), então o ciclo é seguro.
 */

/** Quanto antes do vencimento o access token é renovado, em ms. */
export const REFRESH_LEAD_MS = 30_000

type RefreshOutcome = 'renewed' | 'rejected' | 'unreachable'

/** Resultado de uma renovação completa. `accountChanged`: outra conta passou a valer neste navegador. */
export type RenewResult = 'renewed' | 'accountChanged' | 'rejected' | 'unreachable'

let refreshInflight: Promise<RefreshOutcome> | null = null
let identityInflight: Promise<CurrentUser | null> | null = null

/** `POST /auth/refresh` com o cookie; uma única chamada em andamento por aba, compartilhada por todos. */
function refreshToken(): Promise<RefreshOutcome> {
  refreshInflight ??= (async (): Promise<RefreshOutcome> => {
    try {
      const { data, response } = await api.POST('/auth/refresh', { credentials: 'include' })
      if (response.ok && data) {
        useSessionStore.getState().signIn(data.token, data.expiresAt)
        return 'renewed'
      }
      // 401: cookie ausente, desconhecido ou de sessão encerrada. Outros status (403 de Origin,
      // 5xx) não dizem que a sessão acabou: não a derrubamos por isso.
      return response.status === 401 ? 'rejected' : 'unreachable'
    } catch {
      return 'unreachable'
    }
  })().finally(() => {
    refreshInflight = null
  })
  return refreshInflight
}

/** `GET /auth/me`, uma chamada por vez; `null` se falhar (identidade desconhecida). */
function fetchIdentity(): Promise<CurrentUser | null> {
  identityInflight ??= (async () => {
    try {
      const { data } = await api.GET('/auth/me')
      return data ?? null
    } catch {
      return null
    }
  })().finally(() => {
    identityInflight = null
  })
  return identityInflight
}

/**
 * Carrega o usuário da sessão se ainda não foi carregado. A conta só muda de um refresh para
 * outro (ver `renewSession`); aqui a primeira leitura nunca é "troca".
 */
export async function loadIdentity(): Promise<void> {
  const state = useSessionStore.getState()
  if (state.user !== null || state.token === null) {
    return
  }
  const user = await fetchIdentity()
  if (user && useSessionStore.getState().user === null) {
    useSessionStore.getState().setUser(user)
  }
}

/**
 * Renova o access token pelo cookie de refresh e confere se a conta continua a mesma. Se o
 * refresh é rejeitado e havia sessão, ela termina como expirada; ao restaurar (`restoring`) a
 * rejeição só significa "não há sessão".
 */
export async function renewSession({ restoring = false } = {}): Promise<RenewResult> {
  const outcome = await refreshToken()
  const store = useSessionStore.getState()

  if (outcome === 'rejected') {
    if (restoring) {
      store.markRestored()
    } else {
      store.expire()
    }
    return 'rejected'
  }
  if (outcome === 'unreachable') {
    if (restoring) {
      store.markRestored()
    }
    return 'unreachable'
  }

  // Outra aba pode ter entrado com outra conta: o cookie é compartilhado, então este refresh já
  // devolve a sessão da conta nova. Comparamos com o usuário que esta aba mostrava.
  const previous = useSessionStore.getState().user
  const user = await fetchIdentity()
  if (user) {
    useSessionStore.getState().setUser(user)
    if (previous !== null && previous.id !== user.id) {
      return 'accountChanged'
    }
  }
  return 'renewed'
}

/** Ao abrir a aplicação: tenta restaurar a sessão pelo cookie (F5, nova aba). Nunca lança. */
export async function restoreSession(): Promise<void> {
  const state = useSessionStore.getState()
  if (state.restored) {
    return
  }
  await renewSession({ restoring: true })
  useSessionStore.getState().markRestored()
}

/**
 * Logout real: avisa a API (que revoga a sessão e remove a DEK dela) e então limpa o estado local.
 * Se a API não responde, o estado local é limpo mesmo assim e o resultado é `unreachable`.
 */
export async function logoutSession(): Promise<'server' | 'unreachable'> {
  let result: 'server' | 'unreachable' = 'server'
  try {
    const { response } = await api.POST('/auth/logout', { credentials: 'include' })
    if (!response.ok) {
      result = 'unreachable'
    }
  } catch {
    result = 'unreachable'
  }
  useSessionStore.getState().signOut()
  return result
}

/**
 * Encerra a sessão porque o servidor a recusa de forma persistente (ex.: cofre sem DEK em cache
 * depois de um reinício): avisa a API em segundo plano, para o cookie não restaurar uma sessão
 * morta no próximo F5, e leva ao login como expirada.
 */
export function endSessionAsExpired(): void {
  void api.POST('/auth/logout', { credentials: 'include' }).catch(() => undefined)
  useSessionStore.getState().expire()
}
