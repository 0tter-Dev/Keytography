import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session-store'
import { REFRESHED, signInForTest, stubApi, type StubbedCall } from '@/test/api-stub'
import { api } from './client'

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
