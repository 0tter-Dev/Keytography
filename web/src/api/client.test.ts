import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session-store'
import { REFRESHED, signInForTest, stubApi, type StubbedCall } from '@/test/api-stub'
import { logoutSession, renewSession } from '@/features/auth/session'
import { api, pendingRequestCount } from './client'

const ana = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }
const bia = { id: 'u2', login: 'bia', email: 'bia@example.com', role: 'Member' }

/** Recurso protegido: aceita só o token `novo`; qualquer outro recebe 401. */
const protectedBy = (token: string) => (call: StubbedCall) =>
  call.headers.get('Authorization') === `Bearer ${token}` ? { body: [] } : { status: 401 }

const countOf = (calls: StubbedCall[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path).length

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('middleware de sessão do cliente da API', () => {
  it('anexa o access token às chamadas autenticadas', async () => {
    signInForTest('meu-jwt')
    const { calls } = stubApi({ 'GET /vault/entries': { body: [] } })

    await api.GET('/vault/entries')

    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer meu-jwt')
  })

  it('não envia Authorization sem sessão', async () => {
    const { calls } = stubApi({ 'GET /health': { body: {} } })

    await api.GET('/health')

    expect(calls[0]?.headers.has('Authorization')).toBe(false)
  })

  it('não envia o JWT a endpoints anônimos nem ao refresh, nem com sessão ativa', async () => {
    signInForTest('meu-jwt')
    const { calls } = stubApi({
      'POST /auth/login': { body: {} },
      'POST /auth/forgot-password': { body: {} },
      'POST /auth/refresh': { status: 401 },
      'GET /health': { body: {} },
    })

    await api.POST('/auth/login', { body: { login: 'a', password: 'b' } })
    await api.POST('/auth/forgot-password', { body: { email: 'a@b' } })
    await api.POST('/auth/refresh')
    await api.GET('/health')

    expect(calls).toHaveLength(4)
    expect(calls.every((call) => !call.headers.has('Authorization'))).toBe(true)
  })

  it('um 401 de endpoint anônimo não derruba a sessão ativa nem dispara renovação', async () => {
    signInForTest('meu-jwt')
    const { calls } = stubApi({ 'POST /auth/login': { status: 401 } })

    await api.POST('/auth/login', { body: { login: 'a', password: 'b' } })

    expect(useSessionStore.getState().token).toBe('meu-jwt')
    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(0)
  })
})

describe('renovação silenciosa e repetição da chamada', () => {
  it('401 com o token vencido: renova pelo cookie e repete a chamada UMA vez, sem o usuário perceber', async () => {
    signInForTest('velho', undefined, ana)
    const { calls } = stubApi({
      'GET /vault/entries': protectedBy('novo'),
      'POST /auth/refresh': REFRESHED('novo'),
      'GET /auth/me': { body: ana },
    })

    const { data, response } = await api.GET('/vault/entries')

    expect(response.status).toBe(200)
    expect(data).toEqual([])
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(2)
    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(1)
    expect(calls.find((call) => call.path === '/auth/refresh')?.credentials).toBe('include')
    expect(useSessionStore.getState().token).toBe('novo')
    expect(useSessionStore.getState().expired).toBe(false)
  })

  it('várias chamadas simultâneas com 401 geram UM refresh e cada uma é repetida uma vez', async () => {
    signInForTest('velho', undefined, ana)
    const { calls } = stubApi({
      'GET /vault/entries': protectedBy('novo'),
      'POST /auth/refresh': async () => {
        await new Promise((resolve) => setTimeout(resolve, 20)) // dá tempo de todas chegarem
        return REFRESHED('novo')
      },
      'GET /auth/me': { body: ana },
    })

    const results = await Promise.all([
      api.GET('/vault/entries'),
      api.GET('/vault/entries'),
      api.GET('/vault/entries'),
    ])

    expect(results.map((result) => result.response.status)).toEqual([200, 200, 200])
    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(1)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(6) // 3 que falharam + 3 repetidas, nunca mais
  })

  it('refresh rejeitado (401): a sessão termina como expirada e a chamada não é repetida', async () => {
    signInForTest('velho', undefined, ana)
    const { calls } = stubApi({
      'GET /vault/entries': { status: 401 },
      'POST /auth/refresh': { status: 401 },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(1)
    expect(useSessionStore.getState()).toMatchObject({ token: null, user: null, expired: true })
  })

  it('401 que persiste depois de um refresh bem-sucedido (cofre sem DEK) encerra a sessão, sem laço', async () => {
    signInForTest('velho', undefined, ana)
    const { calls } = stubApi({
      'GET /vault/entries': { status: 401 }, // sempre 401, mesmo com o token novo
      'POST /auth/refresh': REFRESHED('novo'),
      'GET /auth/me': { body: ana },
      'POST /auth/logout': { status: 204 },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(2) // original + uma repetição, nunca mais
    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(1)
    expect(useSessionStore.getState()).toMatchObject({ token: null, expired: true })
    // O cookie não pode restaurar uma sessão sem DEK no próximo F5: o servidor é avisado.
    await vi.waitFor(() => expect(countOf(calls, 'POST', '/auth/logout')).toBe(1))
  })

  it('um 401 tardio de um token que já foi trocado é repetido com o token atual, sem novo refresh', async () => {
    signInForTest('antigo', undefined, ana)
    const { calls } = stubApi({
      'GET /vault/entries': (call) => {
        if (call.headers.get('Authorization') === 'Bearer antigo') {
          // Enquanto esta resposta "demora", outra renovação já trocou o token.
          signInForTest('atual', undefined, ana)
          return { status: 401 }
        }
        return { body: [] }
      },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(200)
    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(0)
    expect(calls.at(-1)?.headers.get('Authorization')).toBe('Bearer atual')
  })

  it('sem sessão (logout em andamento) um 401 não renova nada nem ressuscita a sessão', async () => {
    const { calls } = stubApi({ 'GET /vault/entries': { status: 401 } })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(0)
    expect(useSessionStore.getState().expired).toBe(false)
  })

  it('token prestes a vencer é renovado ANTES de a chamada sair', async () => {
    signInForTest('quase-vencendo', 1_000, ana)
    const { calls } = stubApi({
      'GET /vault/entries': protectedBy('novo'),
      'POST /auth/refresh': REFRESHED('novo'),
      'GET /auth/me': { body: ana },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(200)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(1) // saiu já com o token novo
    expect(calls.find((call) => call.path === '/vault/entries')?.headers.get('Authorization')).toBe(
      'Bearer novo',
    )
  })

  it('se a rede falha durante a renovação, a sessão NÃO é derrubada', async () => {
    signInForTest('velho', undefined, ana)
    vi.stubGlobal('fetch', async (request: Request) => {
      if (request.url.endsWith('/auth/refresh')) {
        throw new TypeError('Failed to fetch')
      }
      return new Response(null, { status: 401 })
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(useSessionStore.getState()).toMatchObject({ token: 'velho', expired: false })
  })

  it('um erro do servidor no refresh (5xx) também não derruba a sessão', async () => {
    signInForTest('velho', undefined, ana)
    stubApi({ 'GET /vault/entries': { status: 401 }, 'POST /auth/refresh': { status: 503 } })

    await api.GET('/vault/entries')

    expect(useSessionStore.getState()).toMatchObject({ token: 'velho', expired: false })
  })
})

describe('troca de conta em outra aba', () => {
  it('se o refresh devolve OUTRA conta, não repete a chamada e marca a troca (dados da anterior descartados)', async () => {
    signInForTest('velho', undefined, ana)
    const { calls } = stubApi({
      'GET /vault/entries': { status: 401 },
      'POST /auth/refresh': REFRESHED('da-bia'),
      'GET /auth/me': { body: bia },
    })

    await api.GET('/vault/entries')

    expect(countOf(calls, 'GET', '/vault/entries')).toBe(1) // não repete: devolveria dados da bia à tela da ana
    expect(useSessionStore.getState()).toMatchObject({
      token: 'da-bia',
      user: bia,
      accountChanged: true,
    })
  })

  it('se o refresh devolve a MESMA conta, nada muda para o usuário', async () => {
    signInForTest('velho', undefined, ana)
    stubApi({
      'GET /vault/entries': protectedBy('novo'),
      'POST /auth/refresh': REFRESHED('novo'),
      'GET /auth/me': { body: ana },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(200)
    expect(useSessionStore.getState().accountChanged).toBe(false)
  })
})

describe('chamada que não pode sair com o token de outra conta', () => {
  it('token prestes a vencer e o refresh devolve OUTRA conta: a chamada NÃO sai e a troca é marcada', async () => {
    signInForTest('quase-vencendo', 1_000, ana)
    const { calls } = stubApi({
      'GET /vault/entries': { body: [] },
      'POST /auth/refresh': REFRESHED('da-bia'),
      'GET /auth/me': { body: bia },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(0) // nada do que a tela da ana digitou chega à bia
    expect(useSessionStore.getState()).toMatchObject({ user: bia, accountChanged: true })
  })

  it('token prestes a vencer e a conta não pôde ser conferida: a chamada NÃO sai, e fica pendente de conferência', async () => {
    signInForTest('quase-vencendo', 1_000, ana)
    const { calls } = stubApi({
      'GET /vault/entries': { body: [] },
      'POST /auth/refresh': REFRESHED('novo'),
      'GET /auth/me': { status: 503 },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(0)
    expect(useSessionStore.getState()).toMatchObject({ token: 'novo', user: ana, unverified: true })
  })

  it('com a conta por conferir, a próxima chamada confere antes: mesma conta libera, falha segue bloqueando', async () => {
    signInForTest('t1', undefined, ana)
    useSessionStore.setState({ unverified: true })
    let meOk = false
    const { calls } = stubApi({
      'GET /vault/entries': { body: [] },
      'GET /auth/me': () => (meOk ? { body: ana } : { status: 503 }),
    })

    const blocked = await api.GET('/vault/entries')
    expect(blocked.response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(0)
    expect(useSessionStore.getState().unverified).toBe(true)

    meOk = true
    const released = await api.GET('/vault/entries')
    expect(released.response.status).toBe(200)
    expect(useSessionStore.getState().unverified).toBe(false)
  })

  it('com a conta por conferir e agora conferida como OUTRA, a chamada não sai', async () => {
    signInForTest('t1', undefined, ana)
    useSessionStore.setState({ unverified: true })
    const { calls } = stubApi({ 'GET /vault/entries': { body: [] }, 'GET /auth/me': { body: bia } })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(0)
    expect(useSessionStore.getState()).toMatchObject({ user: bia, accountChanged: true })
  })

  it('um 401 tardio de um token já trocado, com a conta por conferir, NÃO é repetido com o token novo', async () => {
    signInForTest('antigo', undefined, ana)
    const { calls } = stubApi({
      'GET /vault/entries': (call) => {
        if (call.headers.get('Authorization') === 'Bearer antigo') {
          signInForTest('atual', undefined, ana) // outra renovação trocou o token...
          useSessionStore.setState({ unverified: true }) // ...e não conseguiu conferir a conta
          return { status: 401 }
        }
        return { body: [] }
      },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(1)
  })
})

describe('chamadas que nunca disparam renovação', () => {
  it('/auth/me e /auth/logout saem mesmo com o token vencido, sem refresh (evita esperar por si mesmos)', async () => {
    signInForTest('vencido', 1_000, ana)
    const { calls } = stubApi({
      'GET /auth/me': { body: ana },
      'POST /auth/logout': { status: 204 },
      'POST /auth/refresh': REFRESHED('novo'),
    })

    await api.GET('/auth/me')
    await api.POST('/auth/logout')

    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(0)
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer vencido')
  })

  it('um 401 de /auth/me não dispara renovação nem repetição', async () => {
    signInForTest('t1', undefined, ana)
    const { calls } = stubApi({
      'GET /auth/me': { status: 401 },
      'POST /auth/refresh': REFRESHED('t2'),
    })

    const { response } = await api.GET('/auth/me')

    expect(response.status).toBe(401)
    expect(calls).toHaveLength(1)
  })
})

describe('falha de rede', () => {
  it('não deixa a cópia da requisição guardada', async () => {
    signInForTest('t1', undefined, ana)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(api.GET('/vault/entries')).rejects.toThrow('Failed to fetch')

    expect(pendingRequestCount()).toBe(0)
  })

  it('uma resposta (mesmo 401) também libera a cópia', async () => {
    signInForTest('t1', undefined, ana)
    stubApi({ 'GET /vault/entries': { body: [] } })

    await api.GET('/vault/entries')

    expect(pendingRequestCount()).toBe(0)
  })
})

describe('conta por conferir com a API instável', () => {
  it('token para vencer + conta por conferir + refresh inalcançável + /auth/me fora: a chamada NÃO sai', async () => {
    signInForTest('quase-vencendo', 1_000, ana)
    useSessionStore.setState({ unverified: true })
    const { calls } = stubApi({
      'GET /vault/entries': { body: [] },
      'POST /auth/refresh': { status: 503 },
      'GET /auth/me': { status: 503 },
    })

    const { response } = await api.GET('/vault/entries')

    expect(response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(0)
  })
})

describe('caminhos públicos', () => {
  it('só o caminho exato é público: um caminho que apenas TERMINA igual a um público leva o token', async () => {
    signInForTest('meu-jwt')
    const { calls } = stubApi({ 'GET /x/health': { body: {} } })

    await api.GET('/x/health' as never)

    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer meu-jwt')
  })
})

/** Resposta que só sai quando o teste mandar. */
function gate() {
  let open: () => void = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

describe('janelas concorrentes na troca de conta', () => {
  it('uma chamada feita enquanto a conferência da conta renovada ainda voa espera por ela (outra conta: não sai)', async () => {
    signInForTest('velho', undefined, ana)
    const meGate = gate()
    const { calls } = stubApi({
      'GET /vault/entries': { body: [] },
      'POST /auth/refresh': REFRESHED('da-bia'),
      'GET /auth/me': async () => {
        await meGate.opened
        return { body: bia }
      },
    })

    const renewing = renewSession()
    await vi.waitFor(() => expect(useSessionStore.getState().token).toBe('da-bia'))
    expect(useSessionStore.getState().unverified).toBe(true) // o token novo nasce por conferir
    const pending = api.GET('/vault/entries')
    meGate.open()

    expect((await pending).response.status).toBe(401)
    await renewing
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(0)
  })

  it('...e se a conta é a mesma, a chamada sai com o token novo', async () => {
    signInForTest('velho', undefined, ana)
    const meGate = gate()
    const { calls } = stubApi({
      'GET /vault/entries': { body: [] },
      'POST /auth/refresh': REFRESHED('novo'),
      'GET /auth/me': async () => {
        await meGate.opened
        return { body: ana }
      },
    })

    const renewing = renewSession()
    await vi.waitFor(() => expect(useSessionStore.getState().token).toBe('novo'))
    const pending = api.GET('/vault/entries')
    meGate.open()

    expect((await pending).response.status).toBe(200)
    await renewing
    expect(calls.find((call) => call.path === '/vault/entries')?.headers.get('Authorization')).toBe(
      'Bearer novo',
    )
  })

  it('o 401 tardio de uma chamada da conta ANTERIOR não é repetido com o token da conta nova', async () => {
    signInForTest('antigo', undefined, ana)
    const lateGate = gate()
    let sent = 0
    const { calls } = stubApi({
      'GET /vault/entries': async (call) => {
        if (call.headers.get('Authorization') !== 'Bearer antigo') {
          return { body: [{ dono: 'bia' }] } // o que uma repetição indevida receberia
        }
        if (++sent === 2) {
          await lateGate.opened // a segunda chamada da ana só responde depois da troca de conta
        }
        return { status: 401 }
      },
      'POST /auth/refresh': REFRESHED('da-bia'),
      'GET /auth/me': { body: bia },
    })

    const first = api.GET('/vault/entries')
    const second = api.GET('/vault/entries')
    expect((await first).response.status).toBe(401) // renovou e detectou a troca para a bia
    expect(useSessionStore.getState().accountChanged).toBe(true)
    lateGate.open()
    const late = await second

    expect(late.response.status).toBe(401)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(2) // nenhuma repetição com 'da-bia'
  })
})

describe('chamadas de uma sessão que já terminou', () => {
  it('um 401 que chega depois de o logout começar não renova nem repete nada', async () => {
    signInForTest('t1', undefined, ana)
    const lateGate = gate()
    const { calls } = stubApi({
      'GET /vault/entries': async () => {
        await lateGate.opened
        return { status: 401 }
      },
      'POST /auth/logout': { status: 204 },
      'POST /auth/refresh': REFRESHED('t2'),
      'GET /auth/me': { body: ana },
    })

    const pending = api.GET('/vault/entries')
    await vi.waitFor(() => expect(countOf(calls, 'GET', '/vault/entries')).toBe(1))
    const loggingOut = logoutSession()
    lateGate.open()

    expect((await pending).response.status).toBe(401)
    await loggingOut
    expect(countOf(calls, 'POST', '/auth/refresh')).toBe(0)
    expect(countOf(calls, 'GET', '/vault/entries')).toBe(1)
  })

  it('o 401 de uma repetição antiga não derruba a sessão NOVA (logout + novo login durante o voo)', async () => {
    signInForTest('velho', undefined, ana)
    const retryGate = gate()
    const { calls } = stubApi({
      'GET /vault/entries': async (call) => {
        if (call.headers.get('Authorization') === 'Bearer velho') {
          return { status: 401 }
        }
        await retryGate.opened // a repetição (token renovado) fica em voo
        return { status: 401 }
      },
      'POST /auth/refresh': REFRESHED('renovado'),
      'GET /auth/me': { body: ana },
      'POST /auth/logout': { status: 204 },
    })

    const pending = api.GET('/vault/entries')
    await vi.waitFor(() => expect(useSessionStore.getState().token).toBe('renovado'))
    await vi.waitFor(() => expect(countOf(calls, 'GET', '/vault/entries')).toBe(2))
    await logoutSession()
    signInForTest('login-novo', undefined, ana)
    retryGate.open()
    await pending

    expect(useSessionStore.getState()).toMatchObject({ token: 'login-novo', expired: false })
    expect(countOf(calls, 'POST', '/auth/logout')).toBe(1) // só o logout explícito
  })
})

describe('base da API com prefixo', () => {
  it('compara os caminhos públicos já com o prefixo (/api/health é público; /api/vault/entries leva o token)', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5247/api')
    const { api: prefixed } = await import('./client')
    const { useSessionStore: store } = await import('@/features/auth/session-store')
    store.getState().signIn('meu-jwt', new Date(Date.now() + 60_000).toISOString())
    store.getState().markRestored()
    const { calls } = stubApi({
      'GET /api/health': { body: {} },
      'GET /api/vault/entries': { body: [] },
    })

    await prefixed.GET('/health')
    await prefixed.GET('/vault/entries')

    expect(calls[0]?.headers.has('Authorization')).toBe(false)
    expect(calls[1]?.headers.get('Authorization')).toBe('Bearer meu-jwt')
    vi.unstubAllEnvs()
  })
})
