import { beforeEach, describe, expect, it } from 'vitest'
import { APPEARANCE_STORAGE_KEY } from './appearance'
import { useAppearanceStore } from './theme-store'

beforeEach(() => {
  useAppearanceStore.setState({ theme: 'system', accent: 'green' })
})

describe('useAppearanceStore', () => {
  it('persiste tema e destaque em localStorage', () => {
    useAppearanceStore.getState().setTheme('dark-high-contrast')
    useAppearanceStore.getState().setAccent('orange')

    const saved = JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)
    expect(saved.state).toEqual({ theme: 'dark-high-contrast', accent: 'orange' })
  })

  it('restaura a preferência salva ao reidratar', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ state: { theme: 'light', accent: 'blue' }, version: 0 }),
    )

    await useAppearanceStore.persist.rehydrate()

    expect(useAppearanceStore.getState().theme).toBe('light')
    expect(useAppearanceStore.getState().accent).toBe('blue')
  })

  it('ignora valores inválidos no storage e mantém os padrões', async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ state: { theme: 'neon', accent: 'brown' }, version: 0 }),
    )

    await useAppearanceStore.persist.rehydrate()

    expect(useAppearanceStore.getState().theme).toBe('system')
    expect(useAppearanceStore.getState().accent).toBe('green')
  })
})
