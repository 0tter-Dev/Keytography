import { describe, expect, it } from 'vitest'
import { isSessionActive, useSessionStore } from './session-store'

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()
const ana = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }
const bia = { id: 'u2', login: 'bia', email: 'bia@example.com', role: 'Member' }

describe('useSessionStore', () => {
  it('guarda o access token só em memória: nada vai para localStorage nem sessionStorage', () => {
    useSessionStore.getState().signIn('jwt-secreto', inOneHour())

    expect(isSessionActive(useSessionStore.getState())).toBe(true)
    for (const storage of [localStorage, sessionStorage]) {
      const everything = JSON.stringify(Object.entries(storage))
      expect(everything).not.toContain('jwt-secreto')
      expect(storage.length).toBe(0)
    }
  })

  it('"expire" encerra a sessão e marca o motivo; "signOut" encerra sem marcar', () => {
    useSessionStore.getState().signIn('jwt', inOneHour())
    useSessionStore.getState().expire()
    expect(useSessionStore.getState()).toMatchObject({ token: null, expired: true })

    useSessionStore.getState().signIn('jwt', inOneHour())
    expect(useSessionStore.getState().expired).toBe(false)
    useSessionStore.getState().signOut()
    expect(useSessionStore.getState()).toMatchObject({ token: null, expired: false })
  })

  it('encerrar a sessão descarta o usuário carregado', () => {
    useSessionStore.getState().signIn('jwt', inOneHour())
    useSessionStore.getState().setUser(ana)

    useSessionStore.getState().signOut()

    expect(useSessionStore.getState().user).toBeNull()
  })

  it('uma renovação (signIn com sessão ativa) mantém o usuário já carregado', () => {
    useSessionStore.getState().signIn('jwt-1', inOneHour())
    useSessionStore.getState().setUser(ana)

    useSessionStore.getState().signIn('jwt-2', inOneHour())

    expect(useSessionStore.getState().user).toEqual(ana)
    expect(useSessionStore.getState().token).toBe('jwt-2')
  })

  it('só marca troca de conta quando o usuário carregado muda de id', () => {
    useSessionStore.getState().signIn('jwt', inOneHour())

    useSessionStore.getState().setUser(ana) // primeira carga: não é troca
    expect(useSessionStore.getState().accountChanged).toBe(false)
    useSessionStore.getState().setUser(ana) // mesma conta
    expect(useSessionStore.getState().accountChanged).toBe(false)

    useSessionStore.getState().setUser(bia)
    expect(useSessionStore.getState().accountChanged).toBe(true)

    useSessionStore.getState().clearAccountChanged()
    expect(useSessionStore.getState().accountChanged).toBe(false)
  })

  it('cada fim de sessão (logout ou expiração) avança a época; entrar e renovar não', () => {
    const epoch = () => useSessionStore.getState().epoch
    const start = epoch()

    useSessionStore.getState().signIn('jwt-1', inOneHour())
    useSessionStore.getState().signIn('jwt-2', inOneHour())
    expect(epoch()).toBe(start)

    useSessionStore.getState().signOut()
    expect(epoch()).toBe(start + 1)

    useSessionStore.getState().expire()
    expect(epoch()).toBe(start + 2)
  })

  it('a conta por conferir (unverified) some ao ler a identidade e ao encerrar a sessão', () => {
    useSessionStore.getState().signIn('jwt', inOneHour())
    useSessionStore.getState().setUser(ana)

    useSessionStore.setState({ unverified: true })
    useSessionStore.getState().setUser(ana)
    expect(useSessionStore.getState().unverified).toBe(false)

    useSessionStore.setState({ unverified: true })
    useSessionStore.getState().signOut()
    expect(useSessionStore.getState().unverified).toBe(false)

    useSessionStore.getState().signIn('jwt', inOneHour())
    useSessionStore.setState({ unverified: true })
    useSessionStore.getState().expire()
    expect(useSessionStore.getState().unverified).toBe(false)
  })

  it('renovar o token (signIn) NÃO apaga a pendência de conferência', () => {
    useSessionStore.getState().signIn('jwt-1', inOneHour())
    useSessionStore.setState({ unverified: true })

    useSessionStore.getState().signIn('jwt-2', inOneHour())

    expect(useSessionStore.getState().unverified).toBe(true)
  })

  it('isSessionActive rejeita token vencido', () => {
    expect(isSessionActive({ token: 'jwt', expiresAt: Date.now() - 1 })).toBe(false)
    expect(isSessionActive({ token: null, expiresAt: null })).toBe(false)
  })
})
