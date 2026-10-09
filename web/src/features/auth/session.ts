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

/**
 * Piso do atraso até a próxima renovação agendada, que dobra a cada renovação seguida cujo token já
 * nasce "dentro da janela de renovação" (relógio adiantado, vida útil menor que a antecedência).
 */
export const MIN_RENEW_DELAY_MS = 5_000

/**
 * Quantas renovações seguidas com token já dentro da janela são toleradas; depois disso o cliente
 * para de renovar em segundo plano (cada renovação rotaciona o refresh token no servidor).
 */
export const MAX_SHORT_RENEWALS = 5

/** Espera antes de tentar de novo quando a API não respondeu a uma renovação. */
export const RETRY_AFTER_UNREACHABLE_MS = 15_000

/**
 * Tempo máximo de cada chamada de sessão (`POST /auth/refresh`, `GET /auth/me`); sem isso um
 * servidor mudo travaria toda renovação e toda conferência de conta.
 */
export const SESSION_REQUEST_TIMEOUT_MS = 20_000

/** `discarded`: a sessão terminou (logout/expiração) enquanto o refresh voava; a resposta é ignorada. */
type RefreshOutcome = 'renewed' | 'rejected' | 'unreachable' | 'discarded'

/**
 * Resultado de uma renovação completa. `accountChanged`: outra conta passou a valer neste
 * navegador. `unverified`: o token foi renovado, mas não deu para conferir de quem ele é.
 */
export type RenewResult =
  'renewed' | 'accountChanged' | 'unverified' | 'rejected' | 'unreachable' | 'discarded'

type Inflight<T> = { key: string | number | null; promise: Promise<T> }

let refreshInflight: Inflight<RefreshOutcome> | null = null
let identityInflight: Inflight<CurrentUser | null> | null = null

/** Zera o estado de módulo (chamadas em voo). Só para os testes. */
export function resetSessionRuntime(): void {
  refreshInflight = null
  identityInflight = null
}

/** Resolve quando não há refresh em andamento (imediatamente se não há nenhum). */
export async function settleRefresh(): Promise<void> {
  await refreshInflight?.promise
}

/**
 * `POST /auth/refresh` com o cookie; uma única chamada em andamento por aba e por "época" da
 * sessão, compartilhada por todos. Um refresh de uma sessão que já terminou não é compartilhado
 * com quem pede depois (ex.: novo login durante o voo): ele será descartado ao chegar.
 */
function refreshToken(): Promise<RefreshOutcome> {
  const epoch = useSessionStore.getState().epoch
  if (refreshInflight?.key !== epoch) {
    const entry: Inflight<RefreshOutcome> = {
      key: epoch,
      promise: requestRefresh(epoch).finally(() => {
        if (refreshInflight === entry) {
          refreshInflight = null
        }
      }),
    }
    refreshInflight = entry
  }
  return refreshInflight.promise
}

/** Executa `run` com um sinal que aborta depois de `SESSION_REQUEST_TIMEOUT_MS`. */
async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SESSION_REQUEST_TIMEOUT_MS)
  try {
    return await run(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

async function requestRefresh(epoch: number): Promise<RefreshOutcome> {
  try {
    const { data, response } = await withTimeout((signal) =>
      api.POST('/auth/refresh', { credentials: 'include', signal }),
    )
    // Logout/expiração durante o voo: aceitar a resposta ressuscitaria uma sessão já encerrada.
    if (useSessionStore.getState().epoch !== epoch) {
      return 'discarded'
    }
    if (response.ok && data) {
      // Se a aba já mostra uma conta, o token novo só vale para ela depois da conferência
      // (`checkAccount`): até lá nenhuma chamada autenticada sai com ele.
      const hadUser = useSessionStore.getState().user !== null
      useSessionStore.getState().signIn(data.token, data.expiresAt, hadUser)
      return 'renewed'
    }
    // 401: cookie ausente, desconhecido ou de sessão encerrada. Outros status (403 de Origin,
    // 5xx) não dizem que a sessão acabou: não a derrubamos por isso.
    return response.status === 401 ? 'rejected' : 'unreachable'
  } catch {
    return 'unreachable'
  }
}

/**
 * `GET /auth/me`, uma chamada por vez PARA CADA TOKEN; `null` se falhar ou se o token trocou no
 * meio do voo (a identidade lida com o token antigo não pode ser gravada junto do novo).
 */
function fetchIdentity(): Promise<CurrentUser | null> {
  const token = useSessionStore.getState().token
  if (identityInflight?.key !== token) {
    const entry: Inflight<CurrentUser | null> = {
      key: token,
      promise: (async (): Promise<CurrentUser | null> => {
        try {
          const { data } = await withTimeout((signal) => api.GET('/auth/me', { signal }))
          return useSessionStore.getState().token === token ? (data ?? null) : null
        } catch {
          return null
        }
      })().finally(() => {
        if (identityInflight === entry) {
          identityInflight = null
        }
      }),
    }
    identityInflight = entry
  }
  return identityInflight.promise
}

/**
 * Carrega o usuário da sessão se ainda não foi carregado; `true` se ele está carregado ao final.
 * A conta só muda de um refresh para outro (ver `renewSession`); aqui a primeira leitura nunca é
 * "troca".
 */
export async function loadIdentity(): Promise<boolean> {
  const state = useSessionStore.getState()
  if (state.user !== null) {
    return true
  }
  if (state.token === null) {
    return false
  }
  const user = await fetchIdentity()
  if (user && useSessionStore.getState().user === null) {
    useSessionStore.getState().setUser(user)
  }
  return useSessionStore.getState().user !== null
}

/** Lê a conta do token atual e a grava; devolve se é a mesma que a aba mostrava, outra, ou se não deu. */
async function checkAccount(): Promise<'same' | 'changed' | 'unknown'> {
  const previous = useSessionStore.getState().user
  const user = await fetchIdentity()
  if (!user) {
    return 'unknown'
  }
  useSessionStore.getState().setUser(user)
  return previous !== null && previous.id !== user.id ? 'changed' : 'same'
}

/**
 * Renova o access token pelo cookie de refresh e confere se a conta continua a mesma. Se o
 * refresh é rejeitado e havia sessão, ela termina como expirada; ao restaurar (`restoring`) a
 * rejeição só significa "não há sessão". Se a conta não pôde ser conferida (`GET /auth/me` falhou)
 * e a aba já mostrava uma, o resultado é `unverified`: nenhuma chamada autenticada sai até
 * `confirmAccount` conseguir conferir.
 */
export async function renewSession({ restoring = false } = {}): Promise<RenewResult> {
  const outcome = await refreshToken()
  const store = useSessionStore.getState()

  if (outcome === 'discarded') {
    return 'discarded'
  }
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
  const hadUser = useSessionStore.getState().user !== null
  const check = await checkAccount()
  if (check === 'changed') {
    return 'accountChanged'
  }
  // `unverified` já foi marcado quando o token novo entrou (`requestRefresh`) e só sai com uma
  // leitura bem-sucedida da conta.
  return check === 'unknown' && hadUser ? 'unverified' : 'renewed'
}

/**
 * Tenta de novo a conferência de conta pendente (`unverified`), sem renovar o token. Devolve
 * `renewed` se a conta é a mesma (a pendência some), `accountChanged` se mudou, `unverified` se
 * ainda não deu.
 */
export async function confirmAccount(): Promise<RenewResult> {
  const check = await checkAccount()
  if (check === 'changed') {
    return 'accountChanged'
  }
  return check === 'same' ? 'renewed' : 'unverified'
}

/**
 * Ao abrir a aplicação: tenta restaurar a sessão pelo cookie (F5, nova aba). Nunca lança. Devolve o
 * resultado da renovação (`unreachable` = a API não respondeu), ou `null` se já havia restaurado.
 */
export async function restoreSession(): Promise<RenewResult | null> {
  if (useSessionStore.getState().restored) {
    return null
  }
  const result = await renewSession({ restoring: true })
  useSessionStore.getState().markRestored()
  return result
}

/**
 * Encerra a sessão pela API e então limpa o estado local, mesmo se a API não responde (resultado
 * `unreachable`). Um refresh em voo não pode reabrir a sessão que está sendo encerrada.
 */
async function endSessionVia(
  call: () => Promise<{ response: Response }>,
): Promise<'server' | 'unreachable'> {
  let result: 'server' | 'unreachable' = 'server'
  useSessionStore.setState((state) => ({ epoch: state.epoch + 1 }))
  try {
    const { response } = await call()
    if (!response.ok) {
      result = 'unreachable'
    }
  } catch {
    result = 'unreachable'
  }
  useSessionStore.getState().signOut()
  return result
}

/** Logout real: a API revoga a sessão e remove a DEK dela; depois o estado local é limpo. */
export function logoutSession(): Promise<'server' | 'unreachable'> {
  return endSessionVia(() => api.POST('/auth/logout', { credentials: 'include' }))
}

/**
 * "Sair de todos os dispositivos": a API revoga todas as sessões do usuário (e apaga o cookie, por
 * isso `credentials: 'include'`); depois o estado local é limpo. A tela que usa isto é do
 * `keytography-012`.
 */
export function logoutAllSessions(): Promise<'server' | 'unreachable'> {
  return endSessionVia(() => api.POST('/auth/logout-all', { credentials: 'include' }))
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
