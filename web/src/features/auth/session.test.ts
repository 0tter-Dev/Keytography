import { afterEach, describe, expect, it, vi } from 'vitest'
import { REFRESHED, signInForTest, stubApi } from '@/test/api-stub'
import {
  REFRESH_TIMEOUT_MS,
  loadIdentity,
  logoutSession,
  renewSession,
  restoreSession,
} from './session'
import { useSessionStore } from './session-store'

const ana = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Resposta que só sai quando o teste mandar (uma requisição "em voo"). */
function gate() {
  let open: () => void = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

describe('refresh em voo e fim da sessão', () => {
  it('logout durante um refresh em andamento: a resposta tardia não reabre a sessão', async () => {
    signInForTest('t1', undefined, ana)
    const refreshGate = gate()
    stubApi({
      'POST /auth/refresh': async () => {
        await refreshGate.opened
        return REFRESHED('t2')
      },
      'POST /auth/logout': { status: 204 },
      'GET /auth/me': { body: ana },
    })

    const renewal = renewSession()
    await logoutSession()
    refreshGate.open()

    expect(await renewal).toBe('discarded')
    expect(useSessionStore.getState().token).toBeNull()
    expect(useSessionStore.getState().expired).toBe(false)
  })

  it('refresh que responde enquanto o logout ainda espera a API também é descartado', async () => {
    signInForTest('t1', undefined, ana)
    const refreshGate = gate()
    const logoutGate = gate()
    stubApi({
      'POST /auth/refresh': async () => {
        await refreshGate.opened
        return REFRESHED('t2')
      },
      'POST /auth/logout': async () => {
        await logoutGate.opened
        return { status: 204 }
      },
      'GET /auth/me': { body: ana },
    })

    const renewal = renewSession()
    const loggingOut = logoutSession()
    refreshGate.open()

    expect(await renewal).toBe('discarded')
    expect(useSessionStore.getState().token).toBe('t1') // o refresh não trocou o token

    logoutGate.open()
    await loggingOut
    expect(useSessionStore.getState().token).toBeNull()
  })

  it('expiração durante um refresh em andamento: a resposta tardia não reabre a sessão', async () => {
    signInForTest('t1', undefined, ana)
    const refreshGate = gate()
    stubApi({
      'POST /auth/refresh': async () => {
        await refreshGate.opened
        return REFRESHED('t2')
      },
      'GET /auth/me': { body: ana },
    })

    const renewal = renewSession()
    useSessionStore.getState().expire()
    refreshGate.open()

    expect(await renewal).toBe('discarded')
    expect(useSessionStore.getState().token).toBeNull()
    expect(useSessionStore.getState().expired).toBe(true)
  })

  it('refresh rejeitado que chega depois do logout não marca a sessão como expirada', async () => {
    signInForTest('t1', undefined, ana)
    const refreshGate = gate()
    stubApi({
      'POST /auth/refresh': async () => {
        await refreshGate.opened
        return { status: 401 }
      },
      'POST /auth/logout': { status: 204 },
    })

    const renewal = renewSession()
    await logoutSession()
    refreshGate.open()
    await renewal

    expect(useSessionStore.getState().expired).toBe(false)
  })

  it('sem fim de sessão no meio, o refresh é aplicado normalmente', async () => {
    signInForTest('t1', undefined, ana)
    stubApi({ 'POST /auth/refresh': REFRESHED('t2'), 'GET /auth/me': { body: ana } })

    expect(await renewSession()).toBe('renewed')
    expect(useSessionStore.getState().token).toBe('t2')
  })
})

describe('tempo limite do refresh', () => {
  it('o refresh leva um sinal com tempo limite; estourá-lo conta como API inalcançável', async () => {
    const timeout = new AbortController()
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (request: Request) =>
          new Promise<Response>((_resolve, reject) => {
            const fail = () => reject(new TypeError('aborted'))
            if (request.signal.aborted) {
              fail()
            }
            request.signal.addEventListener('abort', fail)
          }),
      ),
    )

    const restoring = restoreSession()
    timeout.abort()

    expect(await restoring).toBe('unreachable')
    expect(spy).toHaveBeenCalledWith(REFRESH_TIMEOUT_MS)
    expect(useSessionStore.getState().restored).toBe(true)
  })
})

describe('identidade da sessão', () => {
  it('a identidade lida com um token que já foi trocado não é gravada', async () => {
    signInForTest('t1')
    const meGate = gate()
    stubApi({
      'GET /auth/me': async () => {
        await meGate.opened
        return { body: ana }
      },
    })

    const loading = loadIdentity()
    useSessionStore.getState().signIn('t2', new Date(Date.now() + 60_000).toISOString())
    meGate.open()

    expect(await loading).toBe(false)
    expect(useSessionStore.getState().user).toBeNull()
  })

  it('com o token trocado, a leitura seguinte não reaproveita a chamada em voo do token antigo', async () => {
    signInForTest('t1')
    const oldGate = gate()
    let n = 0
    const { calls } = stubApi({
      'GET /auth/me': async () => {
        if (++n === 1) {
          await oldGate.opened
        }
        return { body: ana }
      },
    })

    const first = loadIdentity()
    useSessionStore.getState().signIn('t2', new Date(Date.now() + 60_000).toISOString())
    const second = loadIdentity()
    oldGate.open()
    await first

    expect(await second).toBe(true)
    expect(calls).toHaveLength(2)
    expect(useSessionStore.getState().user).toEqual(ana)
  })

  it('loadIdentity informa se a identidade ficou carregada', async () => {
    signInForTest('t1')
    stubApi({ 'GET /auth/me': { status: 500 } })
    expect(await loadIdentity()).toBe(false)

    stubApi({ 'GET /auth/me': { body: ana } })
    expect(await loadIdentity()).toBe(true)
    expect(useSessionStore.getState().user).toEqual(ana)
  })
})
