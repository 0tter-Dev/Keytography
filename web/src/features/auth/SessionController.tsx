import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  MAX_SHORT_RENEWALS,
  MIN_RENEW_DELAY_MS,
  REFRESH_LEAD_MS,
  RETRY_AFTER_UNREACHABLE_MS,
  confirmAccount,
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
  // Renovada, mas sem conferir de quem é a sessão (`/auth/me` falhou): a conferência vem antes da
  // próxima renovação. É lida como dependência porque só vira `true` depois que o token já mudou.
  const unverified = useSessionStore((state) => state.unverified)
  // Renovações seguidas cujo token já nasceu dentro da janela de renovação (ver `MAX_SHORT_RENEWALS`).
  const shortRenewals = useRef({ expiresAt: 0, count: 0 })

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
        if (ended) {
          queryClient.clear()
        } else if (accountSwitched) {
          // `clear()` não alcança telas já montadas: elas continuariam exibindo o dado da conta
          // anterior. `resetQueries` apaga o dado e refaz as consultas ativas já como a conta nova.
          void queryClient.resetQueries()
        }
      }),
    [queryClient],
  )

  useEffect(() => {
    if (token === null || expiresAt === null) {
      return
    }
    const remaining = expiresAt - Date.now()
    const tracker = shortRenewals.current
    if (tracker.expiresAt !== expiresAt) {
      tracker.expiresAt = expiresAt
      tracker.count = remaining <= REFRESH_LEAD_MS ? tracker.count + 1 : 0
    }
    if (tracker.count > MAX_SHORT_RENEWALS) {
      // O servidor só devolve tokens que o relógio deste dispositivo já considera quase vencidos:
      // renovar de novo só rotacionaria o refresh token à toa. Chamadas e o 401 ainda renovam.
      return
    }

    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    const floor = MIN_RENEW_DELAY_MS * 2 ** Math.max(0, tracker.count - 1)
    const nextDelay = () => Math.max(floor, expiresAt - Date.now() - REFRESH_LEAD_MS)

    const schedule = (delay: number) => {
      timer = setTimeout(async () => {
        // Conta por conferir (renovação anterior sem `/auth/me`): só repete a conferência.
        const result = useSessionStore.getState().unverified
          ? await confirmAccount()
          : await renewSession()
        const now = useSessionStore.getState()
        if (cancelled || now.token !== token) {
          return // a renovação trocou o token: este efeito é refeito com o novo
        }
        if (result === 'unreachable' || result === 'unverified') {
          // API fora do ar: o token atual ainda pode valer; tenta de novo em instantes. (Conta
          // conferida: `unverified` vira false e este efeito é refeito, voltando à renovação.)
          schedule(RETRY_AFTER_UNREACHABLE_MS)
        }
      }, delay)
    }
    schedule(unverified ? RETRY_AFTER_UNREACHABLE_MS : nextDelay())

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [token, expiresAt, unverified])

  return null
}
