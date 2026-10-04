import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session-store'
import '@/i18n'

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  useSessionStore.getState().signOut()
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-accent')
})

// jsdom não implementa matchMedia; por padrão simulamos "sistema = claro".
if (!window.matchMedia) {
  vi.stubGlobal(
    'matchMedia',
    (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }) as MediaQueryList,
  )
}
