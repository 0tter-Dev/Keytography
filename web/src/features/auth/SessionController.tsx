import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSessionStore } from './session-store'

/**
 * Esvazia o cache de consultas sempre que a sessão termina ou troca de token — logout, expiração
 * (temporizador ou 401) ou novo login —, para nada de um usuário sobrar em memória para o próximo.
 * Não renderiza nada.
 */
export function SessionController() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      useSessionStore.subscribe((state, previous) => {
        if (previous.token !== null && state.token !== previous.token) {
          queryClient.clear()
        }
      }),
    [queryClient],
  )

  return null
}
