import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, vi } from 'vitest'
import { resetClientRuntime } from '@/api/client'
import { resetSessionRuntime } from '@/features/auth/session'
import { useSessionStore } from '@/features/auth/session-store'
import '@/i18n'

afterEach(() => {
  cleanup()
  toast.dismiss() // o estado dos avisos (sonner) é global: não pode vazar para o próximo teste
  localStorage.clear()
  sessionStorage.clear()
  // Estado inicial de verdade (inclui `restored: false`): cada teste começa como uma aba recém-aberta.
  useSessionStore.setState(useSessionStore.getInitialState(), true)
  // Chamadas em voo de um teste (ex.: um que falhou no meio) não podem vazar para o seguinte.
  resetSessionRuntime()
  resetClientRuntime()
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
