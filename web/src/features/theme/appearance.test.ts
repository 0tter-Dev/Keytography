import { describe, expect, it } from 'vitest'
import {
  ACCENTS,
  THEME_PREFERENCES,
  applyAppearance,
  isAccent,
  isThemePreference,
  resolveTheme,
} from './appearance'

describe('resolveTheme', () => {
  it('resolve "system" conforme prefers-color-scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('mantém temas explícitos independentemente do sistema', () => {
    expect(resolveTheme('light-high-contrast', true)).toBe('light-high-contrast')
    expect(resolveTheme('dark-high-contrast', false)).toBe('dark-high-contrast')
  })
})

describe('applyAppearance', () => {
  it('escreve data-theme e data-accent no elemento raiz', () => {
    const root = document.createElement('html')

    applyAppearance(root, 'dark', 'purple', false)

    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.accent).toBe('purple')
  })
})

describe('catálogo de aparência', () => {
  it('expõe 5 temas e 9 cores de destaque válidos', () => {
    expect(THEME_PREFERENCES).toHaveLength(5)
    expect(ACCENTS).toHaveLength(9)
    expect(isThemePreference('dark')).toBe(true)
    expect(isThemePreference('neon')).toBe(false)
    expect(isAccent('pink')).toBe(true)
    expect(isAccent('brown')).toBe(false)
  })
})
