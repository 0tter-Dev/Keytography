import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

describe('SessionController', () => {
  it('esvazia o cache de consultas no logout', () => {
    const client = setup()
    act(() => useSessionStore.getState().signIn('jwt', inOneHour()))
    client.setQueryData(['me', 'jwt'], { login: 'ana' })

    act(() => useSessionStore.getState().signOut())

    expect(client.getQueryData(['me', 'jwt'])).toBeUndefined()
  })

  it('esvazia o cache quando a sessão expira (401 ou temporizador)', () => {
    const client = setup()
    act(() => useSessionStore.getState().signIn('jwt', inOneHour()))
    client.setQueryData(['me', 'jwt'], { login: 'ana' })

    act(() => useSessionStore.getState().expire())

    expect(client.getQueryData(['me', 'jwt'])).toBeUndefined()
  })

  it('esvazia o cache quando outro login troca o token', () => {
    const client = setup()
    act(() => useSessionStore.getState().signIn('jwt-1', inOneHour()))
    client.setQueryData(['me', 'jwt-1'], { login: 'ana' })

    act(() => useSessionStore.getState().signIn('jwt-2', inOneHour()))

    expect(client.getQueryData(['me', 'jwt-1'])).toBeUndefined()
  })

  it('não mexe no cache ao entrar (sessão anterior vazia)', () => {
    const client = setup()
    client.setQueryData(['health'], { ok: true })

    act(() => useSessionStore.getState().signIn('jwt', inOneHour()))

    expect(client.getQueryData(['health'])).toEqual({ ok: true })
  })
})
