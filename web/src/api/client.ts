import createClient, { type Middleware } from 'openapi-fetch'
import {
  confirmAccount,
  endSessionAsExpired,
  renewSession,
  type RenewResult,
} from '@/features/auth/session'
import { isSessionActive, useSessionStore } from '@/features/auth/session-store'
import type { paths } from './schema'

/** URL base da API; padrão = `dotnet run` local (ver web/.env.example). */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5247'

/** Endpoints anônimos ou de gestão da sessão: nunca levam o JWT nem disparam renovação. */
const PUBLIC_PATHS = [
  '/health',
  '/auth/register',
  '/auth/verify-email',
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/refresh',
]

/**
 * O logout leva o JWT (a API também aceita o cookie) e `/auth/me` é a verificação de identidade feita
 * pela própria renovação: nenhum dos dois dispara renovação (evita esperar por si mesmo).
 */
const NO_RENEWAL_PATHS = [...PUBLIC_PATHS, '/auth/logout', '/auth/me']
// `/auth/logout-all` NÃO está na lista de propósito: é uma chamada autenticada comum, que precisa de
// um token válido (renovado antes, ou repetido uma vez depois do 401) como qualquer outra.

/** Caminho base da API (ex.: `/api` quando ela fica atrás de um prefixo), sem a barra final. */
const API_BASE_PATH = new URL(API_BASE_URL, globalThis.location?.origin).pathname.replace(/\/$/, '')

function matches(request: Request, paths: string[]): boolean {
  const { pathname } = new URL(request.url)
  return paths.some((path) => pathname === API_BASE_PATH + path)
}

/** Antecedência mínima: abaixo disso o token é renovado antes de a chamada sair. */
const MIN_REMAINING_MS = 5_000

const bearer = (token: string) => `Bearer ${token}`

/**
 * Cópia de cada requisição autenticada, para repeti-la uma vez depois de uma renovação, com a
 * sessão (`epoch`) e a conta (`accountVersion`) sob as quais ela saiu: se uma delas mudou até a
 * resposta chegar, a chamada pertence a outra sessão/conta e NÃO é repetida.
 */
const originals = new Map<string, { request: Request; epoch: number; accountVersion: number }>()

/** Quantas cópias ainda estão guardadas e zerar o mapa. Só para os testes. */
export const pendingRequestCount = () => originals.size
export const resetClientRuntime = () => originals.clear()

/**
 * Resposta sintética para uma chamada que NÃO deve sair: depois de uma renovação a aba pode estar
 * com o token de outra conta (ou sem saber de quem é), e enviar a chamada com ele levaria dados da
 * conta anterior para a nova. Equivale ao 401 que o servidor daria, e o chamador trata igual.
 */
const refused = () => new Response(null, { status: 401 })

/**
 * Sessão no cliente tipado (ADR-0006): anexa o access token (renovando-o antes se estiver para
 * vencer) e, ao receber 401 de uma chamada autenticada, renova a sessão e repete a chamada UMA
 * vez. Chamadas simultâneas compartilham um único refresh (ver `renewSession`). Um 401 que
 * persiste depois de uma renovação bem-sucedida (ex.: cofre sem DEK em cache após reinício do
 * servidor) encerra a sessão em vez de entrar em laço.
 */
const sessionMiddleware: Middleware = {
  async onRequest({ request, id }) {
    if (matches(request, PUBLIC_PATHS)) {
      return request
    }

    const before = useSessionStore.getState()
    if (before.restored && before.token !== null && !matches(request, NO_RENEWAL_PATHS)) {
      // Token para vencer: renova antes de sair. Conta ainda por conferir (renovação anterior sem
      // `/auth/me`): confere antes de sair. Em ambos os casos, se a conta mudou ou segue
      // desconhecida, a chamada não sai com o token novo.
      let result: RenewResult = 'renewed'
      if ((before.expiresAt ?? 0) - Date.now() < MIN_REMAINING_MS) {
        result = await renewSession()
      }
      if (
        (result === 'renewed' || result === 'unreachable') &&
        useSessionStore.getState().unverified
      ) {
        result = await confirmAccount()
      }
      if (result === 'accountChanged' || result === 'unverified') {
        return refused()
      }
    }

    const session = useSessionStore.getState()
    if (isSessionActive(session)) {
      request.headers.set('Authorization', bearer(session.token!))
      if (!matches(request, NO_RENEWAL_PATHS)) {
        originals.set(id, {
          request: request.clone(),
          epoch: session.epoch,
          accountVersion: session.accountVersion,
        })
      }
    }
    return request
  },

  async onResponse({ request, response, id }) {
    const original = originals.get(id)
    originals.delete(id)
    if (response.status !== 401 || !original) {
      return response
    }

    // Logout/expiração ou troca de conta desde que a chamada saiu: ela pertence a outra sessão ou
    // conta, então não se renova nem se repete nada por ela (repetir levaria a chamada de uma
    // conta para a outra com o token novo).
    const belongsToCurrent = () => {
      const state = useSessionStore.getState()
      return state.epoch === original.epoch && state.accountVersion === original.accountVersion
    }
    if (!belongsToCurrent()) {
      return response
    }

    const sentWith = request.headers.get('Authorization')
    const current = useSessionStore.getState().token

    // Um 401 tardio de um token que já foi trocado: basta repetir com o token atual. Se o token
    // enviado ainda é o atual, renova antes (sem sessão — logout em andamento — não há o que fazer).
    if (current !== null && sentWith === bearer(current)) {
      const result = await renewSession()
      if (result !== 'renewed') {
        // `accountChanged`: a aba passa a mostrar outra conta; repetir devolveria dados dela para a
        // tela da anterior. Rejeitada/inalcançável: a sessão já foi tratada pelo `renewSession`.
        return response
      }
    }

    const { token, unverified } = useSessionStore.getState()
    if (token === null || unverified) {
      return response
    }
    const retry = original.request.clone()
    retry.headers.set('Authorization', bearer(token))
    const retried = await globalThis.fetch(retry)
    // Só encerra a sessão se ela ainda é a mesma que fez a repetição (um logout e um novo login
    // durante o voo tornariam este 401 irrelevante para a sessão nova).
    if (retried.status === 401 && useSessionStore.getState().token === token) {
      endSessionAsExpired()
    }
    return retried
  },

  // Falha de rede: não há resposta, então `onResponse` nunca roda; solta a cópia guardada.
  onError({ id }) {
    originals.delete(id)
  },
}

/**
 * Cliente tipado gerado do contrato OpenAPI da API (docs/reference/openapi.json).
 * Regenerar os tipos: `npm run api:types`. As chamadas que usam o cookie de refresh
 * (`login`, `refresh` e `logout`) passam `credentials: 'include'`: web e API são origens diferentes.
 */
export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  // Resolve o fetch global a cada chamada (permite stub em testes).
  fetch: (request) => globalThis.fetch(request),
})

api.use(sessionMiddleware)
