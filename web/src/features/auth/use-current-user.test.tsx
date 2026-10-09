import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { signInForTest, stubApi } from '@/test/api-stub'
import { MAX_IDENTITY_ATTEMPTS, useCurrentUser } from './use-current-user'

const ana = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }

function Who() {
  const { data } = useCurrentUser()
  return <p>{data ? data.login : 'sem identidade'}</p>
}

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useCurrentUser', () => {
  it('carrega a identidade da sessão ativa', async () => {
    vi.useFakeTimers()
    signInForTest('t1')
    stubApi({ 'GET /auth/me': { body: ana } })

    render(<Who />)
    await advance(0)

    expect(screen.getByText('ana')).toBeInTheDocument()
  })

  it('se a leitura falha, tenta de novo em instantes em vez de ficar sem identidade', async () => {
    vi.useFakeTimers()
    signInForTest('t1')
    let up = false
    const { calls } = stubApi({
      'GET /auth/me': () => (up ? { body: ana } : { status: 503 }),
    })

    render(<Who />)
    await advance(0)
    expect(screen.getByText('sem identidade')).toBeInTheDocument()
    expect(calls).toHaveLength(1)

    up = true
    await advance(15_000)

    expect(calls).toHaveLength(2)
    expect(screen.getByText('ana')).toBeInTheDocument()
  })

  it('sem sessão não pede a identidade', async () => {
    vi.useFakeTimers()
    const { calls } = stubApi({ 'GET /auth/me': { body: ana } })

    render(<Who />)
    await advance(20_000)

    expect(calls).toHaveLength(0)
  })
})

describe('useCurrentUser: teto de tentativas', () => {
  it('desiste depois de MAX_IDENTITY_ATTEMPTS leituras que falham', async () => {
    vi.useFakeTimers()
    signInForTest('t1')
    const { calls } = stubApi({ 'GET /auth/me': { status: 503 } })

    render(<Who />)
    for (let i = 0; i < MAX_IDENTITY_ATTEMPTS * 2; i++) {
      await advance(15_001) // cada nova tentativa é agendada depois da anterior falhar
    }

    expect(calls).toHaveLength(MAX_IDENTITY_ATTEMPTS)
    expect(screen.getByText('sem identidade')).toBeInTheDocument()
  })

  it('em StrictMode (efeito montado duas vezes) o teto continua sendo de 5 leituras reais', async () => {
    vi.useFakeTimers()
    signInForTest('t1')
    const { calls } = stubApi({ 'GET /auth/me': { status: 503 } })

    render(
      <StrictMode>
        <Who />
      </StrictMode>,
    )
    for (let i = 0; i < MAX_IDENTITY_ATTEMPTS * 2; i++) {
      await advance(15_001)
    }

    expect(calls).toHaveLength(MAX_IDENTITY_ATTEMPTS)
  })
})
