import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubApi } from '@/test/api-stub'
import { SessionController } from './SessionController'
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
  vi.unstubAllGlobals()
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
})
