import createClient, { type Middleware } from 'openapi-fetch'
import { isSessionActive, useSessionStore } from '@/features/auth/session-store'
import type { paths } from './schema'

/** URL base da API; padrão = `dotnet run` local (ver web/.env.example). */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5247'

/** Endpoints anônimos: nunca levam o JWT, para que um 401 deles não possa derrubar a sessão. */
const PUBLIC_PATHS = [
  '/health',
  '/auth/register',
  '/auth/verify-email',
  '/auth/login',
  '/auth/forgot-password',
  '/auth/reset-password',
]

function isPublic(request: Request): boolean {
  const { pathname } = new URL(request.url)
  return PUBLIC_PATHS.some((path) => pathname.endsWith(path))
}

/**
 * Anexa o JWT da sessão às chamadas e encerra a sessão quando a API responde 401 a uma chamada
 * feita com o token atual (expirado ou inválido). As rotas protegidas redirecionam ao login.
 */
const sessionMiddleware: Middleware = {
  onRequest({ request }) {
    const session = useSessionStore.getState()
    if (isSessionActive(session) && !isPublic(request)) {
      request.headers.set('Authorization', `Bearer ${session.token}`)
    }
    return request
  },
  onResponse({ request, response }) {
    const { token, expire } = useSessionStore.getState()
    // Compara com o token da própria requisição: um 401 tardio de uma sessão antiga não pode
    // derrubar uma sessão nova.
    if (
      response.status === 401 &&
      token &&
      request.headers.get('Authorization') === `Bearer ${token}`
    ) {
      expire()
    }
    return response
  },
}

/**
 * Cliente tipado gerado do contrato OpenAPI da API (docs/reference/openapi.json).
 * Regenerar os tipos: `npm run api:types`.
 */
export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  // Resolve o fetch global a cada chamada (permite stub em testes).
  fetch: (request) => globalThis.fetch(request),
})

api.use(sessionMiddleware)
