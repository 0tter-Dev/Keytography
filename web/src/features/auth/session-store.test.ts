import { describe, expect, it } from 'vitest'
import { SESSION_STORAGE_KEY, isSessionActive, useSessionStore } from './session-store'

const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

describe('useSessionStore', () => {
  it('guarda o token em sessionStorage, nunca em localStorage', () => {
    useSessionStore.getState().signIn('jwt', inOneHour())

    const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)
    expect(saved.state.token).toBe('jwt')
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(isSessionActive(useSessionStore.getState())).toBe(true)
  })

  it('restaura uma sessão válida ao reidratar', async () => {
    const expiresAt = Date.now() + 60_000
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ state: { token: 'jwt', expiresAt }, version: 0 }),
    )

    await useSessionStore.persist.rehydrate()

    expect(useSessionStore.getState().token).toBe('jwt')
  })

  it('descarta do storage uma sessão já vencida', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ state: { token: 'jwt', expiresAt: Date.now() - 1 }, version: 0 }),
    )

    await useSessionStore.persist.rehydrate()

    expect(useSessionStore.getState().token).toBeNull()
  })

  it('ignora conteúdo inválido no storage', async () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ state: { token: 42, expiresAt: 'amanhã' }, version: 0 }),
    )

    await useSessionStore.persist.rehydrate()

    expect(useSessionStore.getState().token).toBeNull()
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

  it('o motivo da expiração não é persistido', () => {
    useSessionStore.getState().expire()

    const saved = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!)
    expect(saved.state).not.toHaveProperty('expired')
  })

  it('isSessionActive rejeita token vencido', () => {
    expect(isSessionActive({ token: 'jwt', expiresAt: Date.now() - 1 })).toBe(false)
    expect(isSessionActive({ token: null, expiresAt: null })).toBe(false)
  })
})
