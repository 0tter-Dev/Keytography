import { routes } from '@/app/routes'
import { REFRESHED, signInForTest, stubApi } from '@/test/api-stub'
import { renderRoutes } from '@/test/render'
import type { EntryDetail, EntryListItem } from './vault-api'

/** Dados e auxiliares compartilhados pelos testes do cofre (não é um teste). */

export const ME = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }
export const OTHER = { id: 'u2', login: 'bia', email: 'bia@example.com', role: 'Member' }

export const ID = '11111111-1111-4111-8111-111111111111'
export const ID2 = '22222222-2222-4222-8222-222222222222'
export const PASSWORD = 'S3nha-do-banco!'

export const ENTRY: EntryDetail = {
  id: ID,
  title: 'Banco',
  login: 'ana@banco',
  password: PASSWORD,
  additionalFields: { URL: 'https://banco.example', Agência: '0001' },
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-02T11:30:00Z',
  passwordScore: 80,
  passwordScoreDetail: null,
}

export const listItem = (entry: EntryDetail): EntryListItem => ({
  id: entry.id,
  title: entry.title,
  login: entry.login ?? null,
  updatedAt: entry.updatedAt,
})

export const detailHandler = (entry: EntryDetail) => ({ body: entry })

type Handlers = Parameters<typeof stubApi>[0]

/** Sessão válida da ana (identidade já carregada) + API simulada + a árvore real de rotas. */
export function renderVault(handlers: Handlers, route = '/vault') {
  signInForTest('jwt-da-ana', undefined, ME)
  const stub = stubApi({
    'GET /health': { body: { status: 'healthy', checks: [] } },
    'GET /auth/me': { body: ME },
    ...handlers,
  })
  const view = renderRoutes(routes, route)
  return { ...view, ...stub }
}

export { REFRESHED, signInForTest, stubApi }

/** Quantas chamadas `method path` o servidor simulado recebeu. */
export const callsTo = <T extends { method: string; path: string }>(
  calls: T[],
  method: string,
  path: string,
): T[] => calls.filter((call) => call.method === method && call.path === path)
