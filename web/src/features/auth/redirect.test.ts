import { describe, expect, it } from 'vitest'
import { loginRedirectTarget } from './redirect'

describe('loginRedirectTarget', () => {
  it('devolve o destino interno guardado', () => {
    expect(loginRedirectTarget({ from: '/vault?aba=lixeira' })).toBe('/vault?aba=lixeira')
  })

  it('cai no início sem destino ou com estado inesperado', () => {
    expect(loginRedirectTarget(null)).toBe('/')
    expect(loginRedirectTarget({})).toBe('/')
    expect(loginRedirectTarget({ from: 42 })).toBe('/')
  })

  it('recusa destinos externos (URL absoluta ou "//host")', () => {
    expect(loginRedirectTarget({ from: 'https://exemplo.test/' })).toBe('/')
    expect(loginRedirectTarget({ from: '//exemplo.test/' })).toBe('/')
    expect(loginRedirectTarget({ from: 'javascript:alert(1)' })).toBe('/')
  })
})
