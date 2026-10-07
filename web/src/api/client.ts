import createClient, { type Middleware } from 'openapi-fetch'
import { endSessionAsExpired, renewSession } from '@/features/auth/session'
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

function matches(request: Request, paths: string[]): boolean {
  const { pathname } = new URL(request.url)
  return paths.some((path) => pathname.endsWith(path))
}

/** Antecedência mínima: abaixo disso o token é renovado antes de a chamada sair. */
const MIN_REMAINING_MS = 5_000

const bearer = (token: string) => `Bearer ${token}`

/** Cópia de cada requisição autenticada, para repeti-la uma vez depois de uma renovação. */
const originals = new Map<string, Request>()

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
    if (
      before.restored &&
      before.token !== null &&
      (before.expiresAt ?? 0) - Date.now() < MIN_REMAINING_MS &&
      !matches(request, NO_RENEWAL_PATHS)
    ) {
      await renewSession()
    }

    const session = useSessionStore.getState()
    if (isSessionActive(session)) {
      request.headers.set('Authorization', bearer(session.token!))
      if (!matches(request, NO_RENEWAL_PATHS)) {
        originals.set(id, request.clone())
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

    const sentWith = request.headers.get('Authorization')
    const current = useSessionStore.getState().token
    // Sem sessão (logout em andamento ou sessão já encerrada): não há o que renovar.
    if (current === null) {
      return response
    }

    // Um 401 tardio de um token que já foi trocado: basta repetir com o token atual.
    if (sentWith === bearer(current)) {
      const result = await renewSession()
      if (result !== 'renewed') {
        // `accountChanged`: a aba passa a mostrar outra conta; repetir devolveria dados dela para a
        // tela da anterior. Rejeitada/inalcançável: a sessão já foi tratada pelo `renewSession`.
        return response
      }
    }

    const token = useSessionStore.getState().token
    if (token === null) {
      return response
    }
    const retry = original.clone()
    retry.headers.set('Authorization', bearer(token))
    const retried = await globalThis.fetch(retry)
    if (retried.status === 401) {
      endSessionAsExpired()
    }
    return retried
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
