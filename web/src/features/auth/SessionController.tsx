import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  MIN_RENEW_DELAY_MS,
  REFRESH_LEAD_MS,
  RETRY_AFTER_UNREACHABLE_MS,
  renewSession,
  restoreSession,
} from './session'
import { useSessionStore } from './session-store'

/**
 * Orquestra a sessão no cliente. Não renderiza nada.
 * - Ao abrir a aplicação, tenta restaurar a sessão pelo cookie de refresh.
 * - Renova o access token pouco antes de vencer (e tenta de novo se a API não responder).
 * - Esvazia o cache de consultas quando a sessão termina ou a conta muda, para nada de um usuário
 *   sobrar em memória para o próximo. Renovações da MESMA conta não esvaziam nada.
 */
export function SessionController() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const token = useSessionStore((state) => state.token)
  const expiresAt = useSessionStore((state) => state.expiresAt)

  useEffect(() => {
    void restoreSession().then((result) => {
      if (result === 'unreachable') {
        // `id` fixo: o StrictMode monta duas vezes e o aviso não deve duplicar.
        toast.warning(t('auth.restoreUnreachable'), { id: 'restore-unreachable' })
      }
    })
  }, [t])

  useEffect(
    () =>
      useSessionStore.subscribe((state, previous) => {
        const ended = previous.token !== null && state.token === null
        const accountSwitched =
          previous.user !== null && state.user !== null && previous.user.id !== state.user.id
        if (ended || accountSwitched) {
          queryClient.clear()
        }
      }),
    [queryClient],
  )

  useEffect(() => {
    if (token === null || expiresAt === null) {
      return
    }
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false

    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        const result = await renewSession()
        // API fora do ar: o token atual ainda pode valer; tenta de novo em instantes.
        // (`discarded`: a sessão terminou durante a renovação; não há o que reagendar.)
        if (!cancelled && result === 'unreachable') {
          schedule(RETRY_AFTER_UNREACHABLE_MS)
        }
      }, delay)
    }
    schedule(Math.max(MIN_RENEW_DELAY_MS, expiresAt - Date.now() - REFRESH_LEAD_MS))

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [token, expiresAt])

  return null
}
