import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const SESSION_STORAGE_KEY = 'keytography.session'

type SessionState = {
  token: string | null
  /** Instante de expiração do JWT (ms desde a época), vindo do `expiresAt` do login. */
  expiresAt: number | null
  /** `true` quando a sessão terminou por expiração/401 (não por logout); só em memória. */
  expired: boolean
  signIn: (token: string, expiresAt: string) => void
  signOut: () => void
  expire: () => void
}

/**
 * Sessão do usuário. O JWT fica em `sessionStorage` (some ao fechar a aba/janela), e não em
 * `localStorage`: é um cofre de senhas, então preferimos reduzir a janela de exposição do token
 * a poupar um novo login — o JWT dura 1 hora e a API não tem refresh token.
 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      token: null,
      expiresAt: null,
      expired: false,
      signIn: (token, expiresAt) =>
        set({ token, expiresAt: new Date(expiresAt).getTime(), expired: false }),
      signOut: () => set({ token: null, expiresAt: null, expired: false }),
      expire: () => set({ token: null, expiresAt: null, expired: true }),
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ token, expiresAt }) => ({ token, expiresAt }),
      // Conteúdo inválido ou já vencido no storage nunca vira uma sessão.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<Pick<SessionState, 'token' | 'expiresAt'>>
        const valid =
          typeof stored.token === 'string' &&
          typeof stored.expiresAt === 'number' &&
          stored.expiresAt > Date.now()
        return valid ? { ...current, token: stored.token!, expiresAt: stored.expiresAt! } : current
      },
    },
  ),
)

/** `true` se há token e ele ainda não venceu. */
export function isSessionActive(state: Pick<SessionState, 'token' | 'expiresAt'>): boolean {
  return state.token !== null && state.expiresAt !== null && state.expiresAt > Date.now()
}
