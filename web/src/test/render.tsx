import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session-store'

/** Renderiza rotas num roteador em memória, com TanStack Query, a partir de `route`. */
export function renderRoutes(routes: RouteObject[], route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [route] })
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router, client }
}

/** Coloca uma sessão válida (JWT fictício, 1 hora) no store, como se o usuário já tivesse entrado. */
export function signInForTest(token = 'jwt-de-teste', lifetimeMs = 60 * 60 * 1000) {
  useSessionStore.getState().signIn(token, new Date(Date.now() + lifetimeMs).toISOString())
}

export type StubbedCall = { method: string; path: string; headers: Headers; body: unknown }
export type StubReply = { status?: number; body?: unknown }
type Handler = StubReply | ((call: StubbedCall) => StubReply)

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
    }
    calls.push(call)
    const handler = handlers[`${call.method} ${call.path}`]
    if (!handler) {
      return new Response(null, { status: 404 })
    }
    const reply = typeof handler === 'function' ? handler(call) : handler
    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}
