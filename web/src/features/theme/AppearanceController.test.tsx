import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppearanceController } from './AppearanceController'
import { useAppearanceStore } from './theme-store'

function stubSystemPrefersDark(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: prefersDark,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeEach(() => {
  useAppearanceStore.setState({ theme: 'system', accent: 'green' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppearanceController', () => {
  it('no modo "system", reflete o prefers-color-scheme do navegador', () => {
    stubSystemPrefersDark(true)

    render(<AppearanceController />)

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.accent).toBe('green')
  })

  it('aplica imediatamente mudanças de tema e de destaque', () => {
    stubSystemPrefersDark(false)
    render(<AppearanceController />)
    expect(document.documentElement.dataset.theme).toBe('light')

    act(() => {
      useAppearanceStore.getState().setTheme('dark-high-contrast')
      useAppearanceStore.getState().setAccent('pink')
    })

    expect(document.documentElement.dataset.theme).toBe('dark-high-contrast')
    expect(document.documentElement.dataset.accent).toBe('pink')
  })
})
