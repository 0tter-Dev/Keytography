import { afterEach, describe, expect, it, vi } from 'vitest'
import { REFRESHED, signInForTest, stubApi } from '@/test/api-stub'
import {
  confirmAccount,
  loadIdentity,
  logoutAllSessions,
  logoutSession,
  renewSession,
  restoreSession,
} from './session'
import { useSessionStore } from './session-store'

const ana = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }
const bia = { id: 'u2', login: 'bia', email: 'bia@example.com', role: 'Member' }

afterEach(() => {
  vi.useRealTimers()
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
  it('um servidor que nunca responde não trava a restauração: estourado o tempo limite, a API conta como inalcançável', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (request: Request) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(new TypeError('aborted')))
          }),
      ),
    )

    const restoring = restoreSession()
    await vi.advanceTimersByTimeAsync(19_999)
    expect(useSessionStore.getState().restored).toBe(false)
    await vi.advanceTimersByTimeAsync(2)

    expect(await restoring).toBe('unreachable')
    expect(useSessionStore.getState().restored).toBe(true)
  })

  it('o tempo limite só vale para o refresh que passou dele: uma resposta rápida não é abortada', async () => {
    vi.useFakeTimers()
    stubApi({ 'POST /auth/refresh': REFRESHED('t2'), 'GET /auth/me': { body: ana } })

    expect(await restoreSession()).toBe('renewed')
    await vi.advanceTimersByTimeAsync(40_000)

    expect(useSessionStore.getState().token).toBe('t2')
  })
})

describe('tempo limite da conferência de conta', () => {
  it('um /auth/me que nunca responde não trava a renovação: estourado o tempo, a conta fica por conferir', async () => {
    vi.useFakeTimers()
    signInForTest('t1', undefined, ana)
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) => {
        if (request.url.endsWith('/auth/refresh')) {
          return Promise.resolve(
            new Response(JSON.stringify(REFRESHED('t2').body), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }),
          )
        }
        return new Promise<Response>((_resolve, reject) => {
          request.signal.addEventListener('abort', () => reject(new TypeError('aborted')))
        })
      }),
    )

    const renewing = renewSession()
    await vi.advanceTimersByTimeAsync(19_999)
    expect(useSessionStore.getState().unverified).toBe(true)
    await vi.advanceTimersByTimeAsync(2)

    expect(await renewing).toBe('unverified')
    expect(useSessionStore.getState()).toMatchObject({ token: 't2', unverified: true })
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

describe('refresh de uma sessão que já terminou', () => {
  it('não é compartilhado com quem pede depois de um novo login: este recebe o próprio refresh', async () => {
    signInForTest('t1', undefined, ana)
    const oldGate = gate()
    let n = 0
    const { calls } = stubApi({
      'POST /auth/refresh': async () => {
        if (++n === 1) {
          await oldGate.opened
          return REFRESHED('velho')
        }
        return REFRESHED('do-novo-login')
      },
      'POST /auth/logout': { status: 204 },
      'GET /auth/me': { body: ana },
    })

    const first = renewSession()
    await logoutSession()
    signInForTest('login-novo', undefined, ana)
    const second = renewSession()
    oldGate.open()

    expect(await first).toBe('discarded')
    expect(await second).toBe('renewed')
    expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(2)
    expect(useSessionStore.getState().token).toBe('do-novo-login')
  })
})

describe('conferência da conta depois de renovar', () => {
  it('não conseguir ler /auth/me com uma conta já exibida deixa a conta por conferir', async () => {
    signInForTest('t1', undefined, ana)
    stubApi({ 'POST /auth/refresh': REFRESHED('t2'), 'GET /auth/me': { status: 503 } })

    expect(await renewSession()).toBe('unverified')
    expect(useSessionStore.getState()).toMatchObject({ token: 't2', user: ana, unverified: true })
  })

  it('sem conta exibida ainda, falhar a leitura não bloqueia nada (não há com o que comparar)', async () => {
    signInForTest('t1')
    stubApi({ 'POST /auth/refresh': REFRESHED('t2'), 'GET /auth/me': { status: 503 } })

    expect(await renewSession()).toBe('renewed')
    expect(useSessionStore.getState().unverified).toBe(false)
  })

  it('confirmAccount: mesma conta limpa a pendência; outra conta marca a troca; falha mantém', async () => {
    signInForTest('t1', undefined, ana)
    useSessionStore.setState({ unverified: true })

    stubApi({ 'GET /auth/me': { status: 503 } })
    expect(await confirmAccount()).toBe('unverified')
    expect(useSessionStore.getState().unverified).toBe(true)

    stubApi({ 'GET /auth/me': { body: ana } })
    expect(await confirmAccount()).toBe('renewed')
    expect(useSessionStore.getState().unverified).toBe(false)

    stubApi({ 'GET /auth/me': { body: bia } })
    expect(await confirmAccount()).toBe('accountChanged')
    expect(useSessionStore.getState()).toMatchObject({ user: bia, accountChanged: true })
  })
})

describe('logoutAllSessions ("sair de todos os dispositivos")', () => {
  it('chama POST /auth/logout-all com o cookie (a API o apaga) e limpa a sessão local', async () => {
    signInForTest('t1', undefined, ana)
    const { calls } = stubApi({ 'POST /auth/logout-all': { status: 204 } })

    expect(await logoutAllSessions()).toBe('server')

    const call = calls.find((c) => c.path === '/auth/logout-all')
    expect(call?.credentials).toBe('include')
    expect(call?.headers.get('Authorization')).toBe('Bearer t1')
    expect(useSessionStore.getState()).toMatchObject({ token: null, user: null, expired: false })
  })

  it('com a API fora do ar, limpa a sessão local mesmo assim e informa', async () => {
    signInForTest('t1', undefined, ana)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    expect(await logoutAllSessions()).toBe('unreachable')
    expect(useSessionStore.getState().token).toBeNull()
  })

  it('um refresh em voo não reabre a sessão', async () => {
    signInForTest('t1', undefined, ana)
    const refreshGate = gate()
    stubApi({
      'POST /auth/refresh': async () => {
        await refreshGate.opened
        return REFRESHED('t2')
      },
      'POST /auth/logout-all': { status: 204 },
      'GET /auth/me': { body: ana },
    })

    const renewal = renewSession()
    await logoutAllSessions()
    refreshGate.open()

    expect(await renewal).toBe('discarded')
    expect(useSessionStore.getState().token).toBeNull()
  })
})

describe('encerramento da sessão: tempo limite e tipos de resposta', () => {
  const silentServer = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (request: Request) =>
          new Promise<Response>((_resolve, reject) => {
            request.signal.addEventListener('abort', () => reject(new TypeError('aborted')))
          }),
      ),
    )

  it('logout com o servidor mudo: depois de 20 s limpa o estado local e informa que não avisou o servidor', async () => {
    vi.useFakeTimers()
    signInForTest('t1', undefined, ana)
    silentServer()

    const loggingOut = logoutSession()
    await vi.advanceTimersByTimeAsync(19_999)
    expect(useSessionStore.getState().token).toBe('t1')
    await vi.advanceTimersByTimeAsync(2)

    expect(await loggingOut).toBe('unreachable')
    expect(useSessionStore.getState().token).toBeNull()
  })

  it('logout-all com o servidor mudo: o mesmo tempo limite', async () => {
    vi.useFakeTimers()
    signInForTest('t1', undefined, ana)
    silentServer()

    const loggingOut = logoutAllSessions()
    await vi.advanceTimersByTimeAsync(20_001)

    expect(await loggingOut).toBe('unreachable')
    expect(useSessionStore.getState().token).toBeNull()
  })

  it('401 (a sessão já não existe no servidor, ex.: encerrada em outra aba) conta como servidor avisado, sem alarme', async () => {
    signInForTest('t1', undefined, ana)
    stubApi({ 'POST /auth/logout-all': { status: 401 }, 'POST /auth/refresh': { status: 401 } })

    expect(await logoutAllSessions()).toBe('server')
    expect(useSessionStore.getState().token).toBeNull()
  })

  it.each([403, 500, 503])(
    '%i do servidor: o estado local é limpo, mas informa que a sessão pode continuar',
    async (status) => {
      signInForTest('t1', undefined, ana)
      stubApi({ 'POST /auth/logout': { status } })

      expect(await logoutSession()).toBe('unreachable')
      expect(useSessionStore.getState().token).toBeNull()
    },
  )
})
