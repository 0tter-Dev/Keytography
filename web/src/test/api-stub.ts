import { vi } from 'vitest'
import { useSessionStore, type CurrentUser } from '@/features/auth/session-store'

/**
 * Coloca uma sessão válida (access token fictício, 1 hora) no store, como se o usuário já tivesse
 * entrado — ou já a tivesse restaurado. Com `user`, a identidade também já está carregada.
 */
export function signInForTest(
  token = 'jwt-de-teste',
  lifetimeMs = 60 * 60 * 1000,
  user?: CurrentUser,
) {
  useSessionStore.getState().signIn(token, new Date(Date.now() + lifetimeMs).toISOString())
  if (user) {
    useSessionStore.getState().setUser(user)
  }
}

export type StubbedCall = {
  method: string
  path: string
  headers: Headers
  body: unknown
  credentials: RequestCredentials
}
export type StubReply = { status?: number; body?: unknown }
type Handler = StubReply | ((call: StubbedCall) => StubReply | Promise<StubReply>)

/**
 * Substitui o `fetch` global por respostas por rota (`"POST /auth/login"`). Rotas sem handler
 * respondem 404. Devolve as chamadas recebidas, para asserções.
 */
export function stubApi(handlers: Record<string, Handler>) {
  const calls: StubbedCall[] = []
  const fetchMock = vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    const text = await request.clone().text()
    const call: StubbedCall = {
      method: request.method,
      path: url.pathname,
      headers: request.headers,
      body: text ? JSON.parse(text) : undefined,
      credentials: request.credentials,
    }
    calls.push(call)
    const handler = handlers[`${call.method} ${call.path}`]
    if (!handler) {
      return new Response(null, { status: 404 })
    }
    const reply = typeof handler === 'function' ? await handler(call) : handler
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

/** Resposta de `POST /auth/refresh` (ou do login) com um access token novo. */
export const REFRESHED = (token: string, lifetimeMs = 60 * 60 * 1000) => ({
  body: { token, expiresAt: new Date(Date.now() + lifetimeMs).toISOString() },
})
