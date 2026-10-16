import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { RouterProvider, createMemoryRouter, type RouteObject } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { SessionController } from '@/features/auth/SessionController'
import { useSessionStore } from '@/features/auth/session-store'

/**
 * Renderiza rotas num roteador em memória, com TanStack Query e avisos (toasts), a partir de `route`.
 * Por padrão a aba já "restaurou" a sessão (como depois do primeiro carregamento); passe
 * `{ restored: false }` para testar a restauração por refresh ao abrir a aplicação.
 */
export function renderRoutes(routes: RouteObject[], route = '/', { restored = true } = {}) {
  if (restored) {
    useSessionStore.getState().markRestored()
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(routes, { initialEntries: [route] })
  const view = render(
    <QueryClientProvider client={client}>
      <SessionController />
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  )
  return { ...view, router, client }
}
