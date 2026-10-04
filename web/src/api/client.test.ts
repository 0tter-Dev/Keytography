import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session-store'
import { signInForTest, stubApi } from '@/test/render'
import { api } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('middleware de sessão do cliente da API', () => {
  it('anexa o JWT da sessão às chamadas', async () => {
    signInForTest('meu-jwt')
    const { calls } = stubApi({ 'GET /auth/me': { body: {} } })

    await api.GET('/auth/me')

    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer meu-jwt')
  })

  it('não envia Authorization sem sessão', async () => {
    const { calls } = stubApi({ 'GET /health': { body: {} } })

    await api.GET('/health')

    expect(calls[0]?.headers.has('Authorization')).toBe(false)
  })

  it('não envia o JWT a endpoints anônimos, nem com sessão ativa', async () => {
    signInForTest('meu-jwt')
    const { calls } = stubApi({
      'POST /auth/login': { body: {} },
      'POST /auth/forgot-password': { body: {} },
      'GET /health': { body: {} },
    })

    await api.POST('/auth/login', { body: { login: 'a', password: 'b' } })
    await api.POST('/auth/forgot-password', { body: { email: 'a@b' } })
    await api.GET('/health')

    expect(calls).toHaveLength(3)
    expect(calls.every((call) => !call.headers.has('Authorization'))).toBe(true)
  })

  it('um 401 de endpoint anônimo não derruba a sessão ativa', async () => {
    signInForTest('meu-jwt')
    stubApi({ 'POST /auth/login': { status: 401 } })

    await api.POST('/auth/login', { body: { login: 'a', password: 'b' } })

    expect(useSessionStore.getState().token).toBe('meu-jwt')
  })

  it('encerra a sessão (como expirada) quando a API responde 401 ao token atual', async () => {
    signInForTest('meu-jwt')
    stubApi({ 'GET /auth/me': { status: 401 } })

    await api.GET('/auth/me')

    expect(useSessionStore.getState()).toMatchObject({ token: null, expired: true })
  })

  it('um 401 tardio de um token antigo não derruba a sessão nova', async () => {
    signInForTest('token-antigo')
    stubApi({
      'GET /auth/me': () => {
        // A resposta chega depois que o usuário já entrou de novo.
        signInForTest('token-novo')
        return { status: 401 }
      },
    })

    await api.GET('/auth/me')

    expect(useSessionStore.getState().token).toBe('token-novo')
  })

  it('um 401 sem sessão (login inválido) não marca expiração', async () => {
    stubApi({ 'POST /auth/login': { status: 401 } })

    await api.POST('/auth/login', { body: { login: 'a', password: 'b' } })

    expect(useSessionStore.getState().expired).toBe(false)
  })
})
