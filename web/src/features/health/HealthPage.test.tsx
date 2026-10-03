import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import { HealthPage } from './HealthPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <HealthPage />
    </QueryClientProvider>,
  )
}

function stubHealthResponse(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('HealthPage', () => {
  it('lê os textos do arquivo de tradução pt-BR', async () => {
    stubHealthResponse(200, { status: 'healthy', checks: [] })

    renderPage()

    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
    expect(screen.getByText(ptBR.health.description)).toBeInTheDocument()
  })

  it('exibe o status saudável e as verificações retornadas pela API', async () => {
    stubHealthResponse(200, {
      status: 'healthy',
      checks: [{ name: 'database', status: 'healthy' }],
    })

    renderPage()

    expect(await screen.findByText(ptBR.health.status.healthy)).toBeInTheDocument()
    expect(screen.getByText('database')).toBeInTheDocument()
  })

  it('trata 503 como API com falha (mesmo DTO, status diferente)', async () => {
    stubHealthResponse(503, {
      status: 'unhealthy',
      checks: [{ name: 'database', status: 'unhealthy' }],
    })

    renderPage()

    expect(await screen.findByText(ptBR.health.status.unhealthy)).toBeInTheDocument()
  })

  it('indica API inacessível quando a requisição falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    renderPage()

    expect(await screen.findByText(ptBR.health.status.unreachable)).toBeInTheDocument()
  })

  it('"Verificar novamente" consulta a API outra vez', async () => {
    const fetchMock = stubHealthResponse(200, { status: 'healthy', checks: [] })
    renderPage()
    await screen.findByText(ptBR.health.status.healthy)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: ptBR.health.recheck }))

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
