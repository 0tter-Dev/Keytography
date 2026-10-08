import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import { REFRESHED, signInForTest, stubApi } from '@/test/api-stub'
import { SessionController } from './SessionController'
import {
  MAX_SHORT_RENEWALS,
  MIN_RENEW_DELAY_MS,
  REFRESH_LEAD_MS,
  RETRY_AFTER_UNREACHABLE_MS,
} from './session'
import { useSessionStore } from './session-store'

function setup() {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <SessionController />
    </QueryClientProvider>,
  )
  return client
}

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()
const ana = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }
const bia = { id: 'u2', login: 'bia', email: 'bia@example.com', role: 'Member' }

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

describe('SessionController', () => {
  it('esvazia o cache de consultas no logout', () => {
    stubApi({})
    const client = setup()
    act(() => useSessionStore.getState().signIn('jwt', inOneHour()))
    client.setQueryData(['cofre'], { itens: 1 })

    act(() => useSessionStore.getState().signOut())

    expect(client.getQueryData(['cofre'])).toBeUndefined()
  })

  it('esvazia o cache quando a sessão expira (renovação rejeitada ou vencimento)', () => {
    stubApi({})
    const client = setup()
    act(() => useSessionStore.getState().signIn('jwt', inOneHour()))
    client.setQueryData(['cofre'], { itens: 1 })

    act(() => useSessionStore.getState().expire())

    expect(client.getQueryData(['cofre'])).toBeUndefined()
  })

  it('não mexe no cache ao renovar o token da MESMA conta', () => {
    stubApi({})
    const client = setup()
    act(() => {
      useSessionStore.getState().signIn('jwt-1', inOneHour())
      useSessionStore.getState().setUser(ana)
    })
    client.setQueryData(['cofre'], { itens: 1 })

    act(() => useSessionStore.getState().signIn('jwt-2', inOneHour()))

    expect(client.getQueryData(['cofre'])).toEqual({ itens: 1 })
  })

  it('esvazia o cache quando a conta muda (outra conta passou a valer neste navegador)', () => {
    stubApi({})
    const client = setup()
    act(() => {
      useSessionStore.getState().signIn('jwt-1', inOneHour())
      useSessionStore.getState().setUser(ana)
    })
    client.setQueryData(['cofre'], { itens: 1 })

    act(() => {
      useSessionStore.getState().signIn('jwt-2', inOneHour())
      useSessionStore.getState().setUser(bia)
    })

    expect(client.getQueryData(['cofre'])).toBeUndefined()
  })

  it('não mexe no cache ao entrar (sessão anterior vazia)', () => {
    stubApi({})
    const client = setup()
    client.setQueryData(['saude'], { ok: true })

    act(() => useSessionStore.getState().signIn('jwt', inOneHour()))

    expect(client.getQueryData(['saude'])).toEqual({ ok: true })
  })

  describe('renovação agendada', () => {
    it('renova 30 s antes do vencimento', async () => {
      vi.useFakeTimers()
      const { calls } = stubApi({
        'POST /auth/refresh': REFRESHED('t2'),
        'GET /auth/me': { body: ana },
      })
      signInForTest('t1', 90_000, ana)
      setup()

      await advance(90_000 - REFRESH_LEAD_MS - 1)
      expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(0)

      await advance(2)
      expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(1)
      expect(useSessionStore.getState().token).toBe('t2')
    })

    it('tenta de novo a cada 15 s enquanto a API não responde, sem encerrar a sessão', async () => {
      vi.useFakeTimers()
      let up = false
      const { calls } = stubApi({
        'POST /auth/refresh': () => (up ? REFRESHED('t2') : { status: 503 }),
        'GET /auth/me': { body: ana },
      })
      signInForTest('t1', 90_000, ana)
      setup()
      const refreshes = () => calls.filter((call) => call.path === '/auth/refresh').length

      await advance(90_000 - REFRESH_LEAD_MS + 1)
      expect(refreshes()).toBe(1)
      expect(useSessionStore.getState().token).toBe('t1')

      await advance(RETRY_AFTER_UNREACHABLE_MS - 10)
      expect(refreshes()).toBe(1)
      await advance(20)
      expect(refreshes()).toBe(2)
      expect(useSessionStore.getState().token).toBe('t1')

      up = true
      await advance(RETRY_AFTER_UNREACHABLE_MS)
      expect(refreshes()).toBe(3)
      expect(useSessionStore.getState().token).toBe('t2')
    })

    it('um token que já nasce dentro da janela de renovação não gera laço: espaça as renovações e desiste', async () => {
      vi.useFakeTimers()
      // Vida útil de 10 s < 30 s de antecedência (relógio adiantado, ou Sessions:AccessTokenMinutes
      // muito curto): sem o espaçamento, cada renovação reagendaria a próxima com atraso 0.
      let n = 0
      const { calls } = stubApi({
        'POST /auth/refresh': () => REFRESHED(`t${++n}`, 10_000),
        'GET /auth/me': { body: ana },
      })
      signInForTest('t0', 10_000, ana)
      setup()
      const refreshes = () => calls.filter((call) => call.path === '/auth/refresh').length

      await advance(MIN_RENEW_DELAY_MS - 1)
      expect(refreshes()).toBe(0)
      await advance(2)
      expect(refreshes()).toBe(1)

      await advance(60 * 60_000)

      expect(refreshes()).toBe(MAX_SHORT_RENEWALS) // desistiu: não renova mais em segundo plano
      await advance(60 * 60_000)
      expect(refreshes()).toBe(MAX_SHORT_RENEWALS)
    })

    it('o intervalo entre renovações de tokens já na janela dobra: 5 s, 10 s, 20 s…', async () => {
      vi.useFakeTimers()
      let n = 0
      const { calls } = stubApi({
        'POST /auth/refresh': () => REFRESHED(`t${++n}`, 10_000),
        'GET /auth/me': { body: ana },
      })
      const refreshes = () => calls.filter((call) => call.path === '/auth/refresh').length
      signInForTest('t0', 10_000, ana)
      setup()

      await advance(MIN_RENEW_DELAY_MS + 500) // 1ª em 5 s
      expect(refreshes()).toBe(1)
      await advance(MIN_RENEW_DELAY_MS) // 10 s: a 2ª só viria em 15 s
      expect(refreshes()).toBe(1)
      await advance(MIN_RENEW_DELAY_MS) // 15 s
      expect(refreshes()).toBe(2)
      await advance(MIN_RENEW_DELAY_MS * 2) // 25 s: a 3ª só viria em 35 s
      expect(refreshes()).toBe(2)
    })

    it('refazer o efeito para o MESMO token (conferência pendente que vai e volta) não conta como renovação curta', async () => {
      vi.useFakeTimers()
      const { calls } = stubApi({
        'POST /auth/refresh': () => REFRESHED('novo', 120_000),
        'GET /auth/me': { body: ana },
      })
      signInForTest('t0', 20_000, ana) // já dentro da janela de 30 s
      setup()
      for (let i = 0; i < MAX_SHORT_RENEWALS + 2; i++) {
        act(() => useSessionStore.setState({ unverified: true }))
        act(() => useSessionStore.setState({ unverified: false }))
      }

      await advance(MIN_RENEW_DELAY_MS + 500)

      expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(1)
    })

    it('depois de desistir, um token normal volta a ser renovado (o contador zera)', async () => {
      vi.useFakeTimers()
      let n = 0
      stubApi({
        'POST /auth/refresh': () => REFRESHED(`t${++n}`, n > MAX_SHORT_RENEWALS ? 120_000 : 10_000),
        'GET /auth/me': { body: ana },
      })
      signInForTest('t0', 10_000, ana)
      setup()
      await advance(60 * 60_000)
      expect(useSessionStore.getState().token).toBe(`t${MAX_SHORT_RENEWALS}`)

      // O usuário entra de novo (token longo): a renovação em segundo plano volta.
      act(() => signInForTest('novo-login', 120_000, ana))
      await advance(120_000 - REFRESH_LEAD_MS + 1)

      expect(useSessionStore.getState().token).toBe(`t${MAX_SHORT_RENEWALS + 1}`)
    })

    it('renovou mas não conseguiu conferir a conta: tenta só a conferência a cada 15 s, sem novo refresh, e segue renovando', async () => {
      vi.useFakeTimers()
      let meOk = false
      const { calls } = stubApi({
        'POST /auth/refresh': () => REFRESHED('t2', 120_000),
        'GET /auth/me': () => (meOk ? { body: ana } : { status: 503 }),
      })
      signInForTest('t1', 90_000, ana)
      setup()
      const count = (path: string) => calls.filter((call) => call.path === path).length

      await advance(90_000 - REFRESH_LEAD_MS + 1)
      expect(count('/auth/refresh')).toBe(1)
      expect(useSessionStore.getState()).toMatchObject({ token: 't2', unverified: true })

      await advance(RETRY_AFTER_UNREACHABLE_MS + 500) // ainda falha
      expect(count('/auth/refresh')).toBe(1) // não rotaciona o cookie à toa
      expect(useSessionStore.getState().unverified).toBe(true)

      meOk = true
      await advance(RETRY_AFTER_UNREACHABLE_MS + 500)
      expect(useSessionStore.getState().unverified).toBe(false)
      expect(count('/auth/refresh')).toBe(1)

      await advance(120_000) // a renovação normal do token segue agendada
      expect(count('/auth/refresh')).toBe(2)
    })

    it('outra conta no refresh: o cache é esvaziado e o aviso de troca fica pendente', async () => {
      vi.useFakeTimers()
      stubApi({
        'POST /auth/refresh': REFRESHED('t2'),
        'GET /auth/me': { body: bia },
      })
      signInForTest('t1', 90_000, ana)
      const client = setup()
      client.setQueryData(['cofre'], { itens: 1 })

      await advance(90_000 - REFRESH_LEAD_MS + 1)

      expect(useSessionStore.getState().user).toEqual(bia)
      expect(useSessionStore.getState().accountChanged).toBe(true)
      expect(client.getQueryData(['cofre'])).toBeUndefined()
    })
  })

  describe('telas já montadas', () => {
    function Screen({ owner }: { owner: { current: string } }) {
      const { data } = useQuery({
        queryKey: ['tela'],
        queryFn: async () => `dados de ${owner.current}`,
      })
      return <p>{data ?? 'carregando'}</p>
    }

    function mount() {
      const client = new QueryClient()
      const owner = { current: 'ana' }
      render(
        <QueryClientProvider client={client}>
          <SessionController />
          <Screen owner={owner} />
        </QueryClientProvider>,
      )
      return { client, owner }
    }

    it('troca de conta: a tela montada deixa de mostrar o dado da conta anterior e recarrega como a nova', async () => {
      stubApi({})
      act(() => signInForTest('t1', undefined, ana))
      const { owner } = mount()
      expect(await screen.findByText('dados de ana')).toBeInTheDocument()

      owner.current = 'bia'
      act(() => {
        useSessionStore.getState().signIn('t2', inOneHour())
        useSessionStore.getState().setUser(bia)
      })

      expect(await screen.findByText('dados de bia')).toBeInTheDocument()
      expect(screen.queryByText('dados de ana')).not.toBeInTheDocument()
    })

    it('renovar o token da MESMA conta não recarrega a tela', async () => {
      stubApi({})
      act(() => signInForTest('t1', undefined, ana))
      const { owner } = mount()
      expect(await screen.findByText('dados de ana')).toBeInTheDocument()

      owner.current = 'outro'
      act(() => useSessionStore.getState().signIn('t2', inOneHour()))
      await Promise.resolve()

      expect(screen.getByText('dados de ana')).toBeInTheDocument()
    })
  })

  describe('restauração ao abrir a aplicação', () => {
    it('API fora do ar: avisa e libera a tela, sem sessão', async () => {
      const warn = vi.spyOn(toast, 'warning')
      stubApi({ 'POST /auth/refresh': { status: 503 } })

      setup()
      await vi.waitFor(() => expect(useSessionStore.getState().restored).toBe(true))

      expect(useSessionStore.getState().token).toBeNull()
      expect(warn).toHaveBeenCalledWith(ptBR.auth.restoreUnreachable, expect.anything())
    })

    it('sem cookie de sessão (401) não avisa nada: só não há sessão', async () => {
      const warn = vi.spyOn(toast, 'warning')
      stubApi({ 'POST /auth/refresh': { status: 401 } })

      setup()
      await vi.waitFor(() => expect(useSessionStore.getState().restored).toBe(true))

      expect(warn).not.toHaveBeenCalled()
    })
  })
})
