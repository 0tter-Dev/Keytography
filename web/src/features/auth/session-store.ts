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
  /**
   * `true` quando a sessão foi renovada, mas não foi possível conferir (`GET /auth/me`) se o cookie
   * ainda representa a conta que a aba mostra: nenhuma chamada autenticada sai até a conferência.
   */
  unverified: boolean
  /** Sobe a cada fim de sessão: um refresh iniciado numa época anterior é descartado ao chegar. */
  epoch: number
  /**
   * Sobe quando a conta exibida muda para OUTRA (o usuário carregado troca de id). Uma chamada só é
   * repetida depois de um 401 se a conta continua a mesma que a enviou.
   */
  accountVersion: number
  /** `unverified`: o token vem de uma renovação e a conta dele ainda não foi conferida. */
  signIn: (token: string, expiresAt: string, unverified?: boolean) => void
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
  unverified: false,
  epoch: 0,
  accountVersion: 0,
  // Uma renovação (refresh) também passa por aqui: mantém o usuário já carregado, e como o token
  // novo pode ser de outra conta (cookie compartilhado), já nasce `unverified` até a conferência.
  signIn: (token, expiresAt, unverified = false) =>
    set({
      token,
      expiresAt: new Date(expiresAt).getTime(),
      expired: false,
      restored: true,
      unverified,
    }),
  setUser: (user) =>
    set((state) => {
      const switched = state.user !== null && state.user.id !== user.id
      return {
        user,
        unverified: false,
        accountChanged: state.accountChanged || switched,
        accountVersion: state.accountVersion + (switched ? 1 : 0),
      }
    }),
  markRestored: () => set({ restored: true }),
  clearAccountChanged: () => set({ accountChanged: false }),
  signOut: () =>
    set((state) => ({
      token: null,
      expiresAt: null,
      user: null,
      expired: false,
      accountChanged: false,
      unverified: false,
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
      unverified: false,
      restored: true,
      epoch: state.epoch + 1,
    })),
}))

/** `true` se há token e ele ainda não venceu. */
export function isSessionActive(state: Pick<SessionState, 'token' | 'expiresAt'>): boolean {
  return state.token !== null && state.expiresAt !== null && state.expiresAt > Date.now()
}
