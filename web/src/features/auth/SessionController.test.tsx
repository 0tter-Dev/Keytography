import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import { REFRESHED, signInForTest, stubApi } from '@/test/api-stub'
import { SessionController } from './SessionController'
import { MIN_RENEW_DELAY_MS, REFRESH_LEAD_MS, RETRY_AFTER_UNREACHABLE_MS } from './session'
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

    it('um token que já nasce dentro da janela de renovação não gera laço de refresh', async () => {
      vi.useFakeTimers()
      // Vida útil de 10 s < 30 s de antecedência (relógio adiantado, ou Sessions:AccessTokenMinutes
      // muito curto): sem o piso, cada renovação reagendaria a próxima com atraso 0.
      let n = 0
      const { calls } = stubApi({
        'POST /auth/refresh': () => REFRESHED(`t${++n}`, 10_000),
        'GET /auth/me': { body: ana },
      })
      signInForTest('t0', 10_000, ana)
      setup()

      await advance(60_000)

      const refreshes = calls.filter((call) => call.path === '/auth/refresh').length
      expect(refreshes).toBeGreaterThanOrEqual(2)
      expect(refreshes).toBeLessThanOrEqual(60_000 / MIN_RENEW_DELAY_MS + 1)
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
