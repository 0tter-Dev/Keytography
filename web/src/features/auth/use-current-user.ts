import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'
import { isSessionActive, useSessionStore } from './session-store'

export type CurrentUser = components['schemas']['MeResponse']

/** Usuário da sessão atual (`GET /auth/me`). Um 401 encerra a sessão via middleware do cliente. */
export function useCurrentUser() {
  const token = useSessionStore((state) => state.token)
  const expiresAt = useSessionStore((state) => state.expiresAt)

  return useQuery({
    // O token na chave isola o cache por sessão: outro login nunca enxerga o usuário anterior.
    queryKey: ['me', token],
    enabled: isSessionActive({ token, expiresAt }),
    queryFn: async () => {
      const { data, response } = await api.GET('/auth/me')
      if (!data) {
        throw new Error(`GET /auth/me falhou (${response.status})`)
      }
      return data
    },
  })
}
