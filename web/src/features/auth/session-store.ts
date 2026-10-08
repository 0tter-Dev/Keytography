import { create } from 'zustand'
import type { components } from '@/api/schema'

export type CurrentUser = components['schemas']['MeResponse']

type SessionState = {
  /** Access token (JWT curto). Só em memória: nunca vai para `localStorage`/`sessionStorage`. */
  token: string | null
  /** Instante de expiração do access token (ms desde a época), vindo do `expiresAt` da API. */
  expiresAt: number | null
  /** Usuário da sessão (`GET /auth/me`), quando já carregado. */
  user: CurrentUser | null
  /** `true` quando a sessão terminou por expiração/revogação (não por logout); só em memória. */
  expired: boolean
  /** `true` depois da tentativa de restaurar a sessão por refresh ao abrir a aplicação. */
  restored: boolean
  /** `true` quando a conta mudou em outra aba/janela e o aviso ainda não foi mostrado. */
  accountChanged: boolean
  /** Sobe a cada fim de sessão: um refresh iniciado numa época anterior é descartado ao chegar. */
  epoch: number
  signIn: (token: string, expiresAt: string) => void
  setUser: (user: CurrentUser) => void
  markRestored: () => void
  clearAccountChanged: () => void
  signOut: () => void
  expire: () => void
}

/**
 * Sessão do usuário no cliente (ADR-0006). O refresh token vive só em cookie `HttpOnly` gerido
 * pela API; aqui fica apenas o access token, em memória: recarregar a página ou abrir outra aba
 * restaura a sessão por `POST /auth/refresh` (ver `session.ts`).
 */
export const useSessionStore = create<SessionState>()((set) => ({
  token: null,
  expiresAt: null,
  user: null,
  expired: false,
  restored: false,
  accountChanged: false,
  epoch: 0,
  // Uma renovação (refresh) também passa por aqui: mantém o usuário já carregado.
  signIn: (token, expiresAt) =>
    set({ token, expiresAt: new Date(expiresAt).getTime(), expired: false, restored: true }),
  setUser: (user) =>
    set((state) => ({
      user,
      accountChanged: state.accountChanged || (state.user !== null && state.user.id !== user.id),
    })),
  markRestored: () => set({ restored: true }),
  clearAccountChanged: () => set({ accountChanged: false }),
  signOut: () =>
    set((state) => ({
      token: null,
      expiresAt: null,
      user: null,
      expired: false,
      accountChanged: false,
      restored: true,
      epoch: state.epoch + 1,
    })),
  expire: () =>
    set((state) => ({
      token: null,
      expiresAt: null,
      user: null,
      expired: true,
      accountChanged: false,
      restored: true,
      epoch: state.epoch + 1,
    })),
}))

/** `true` se há token e ele ainda não venceu. */
export function isSessionActive(state: Pick<SessionState, 'token' | 'expiresAt'>): boolean {
  return state.token !== null && state.expiresAt !== null && state.expiresAt > Date.now()
}
