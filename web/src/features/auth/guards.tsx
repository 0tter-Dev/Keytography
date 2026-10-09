import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { AccountChangeNotice } from './AccountChangeNotice'
import { loginRedirectTarget, type LoginRedirectState } from './redirect'
import { SessionLoading } from './SessionLoading'
import { settleRefresh } from './session'
import { isSessionActive, useSessionStore } from './session-store'

/** Maior atraso que `setTimeout` aceita (~24,8 dias). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

/**
 * Rotas que exigem sessão válida; sem ela, redireciona ao login guardando o destino. Enquanto a
 * sessão é restaurada ao abrir a aplicação, mostra um estado de carregamento (sem piscar o login).
 */
export function RequireAuth() {
  const token = useSessionStore((state) => state.token)
  const expiresAt = useSessionStore((state) => state.expiresAt)
  const restored = useSessionStore((state) => state.restored)
  const expire = useSessionStore((state) => state.expire)
  const location = useLocation()
  const active = isSessionActive({ token, expiresAt })

  // Rede de segurança: se o access token vence sem ter sido renovado (API fora do ar), encerra a
  // sessão. A renovação normal acontece antes, no `SessionController`, e troca `expiresAt`. Se uma
  // renovação ainda está em voo no vencimento (ex.: o computador voltou de suspensão), espera por
  // ela: derrubar a sessão agora a reabriria logo depois, sem usuário carregado.
  useEffect(() => {
    if (!active || expiresAt === null) {
      return
    }
    const timer = setTimeout(
      () => {
        void settleRefresh().then(() => {
          if (useSessionStore.getState().expiresAt === expiresAt) {
            expire()
          }
        })
      },
      Math.min(expiresAt - Date.now(), MAX_TIMEOUT_MS),
    )
    return () => clearTimeout(timer)
  }, [active, expiresAt, expire])

  if (!restored) {
    return <SessionLoading />
  }
  if (!active) {
    const state: LoginRedirectState = { from: location.pathname + location.search }
    return <Navigate to="/login" replace state={state} />
  }
  return (
    <>
      <AccountChangeNotice />
      <Outlet />
    </>
  )
}

/** Telas só para quem ainda não entrou (login, registro, esqueci a senha). */
export function GuestOnly() {
  const token = useSessionStore((state) => state.token)
  const expiresAt = useSessionStore((state) => state.expiresAt)
  const restored = useSessionStore((state) => state.restored)
  const location = useLocation()

  if (!restored) {
    return <SessionLoading />
  }
  // Ao entrar, este guarda reage ao `signIn` antes de qualquer `navigate` do login: é ele que
  // precisa levar ao destino guardado, senão o usuário sempre cairia no início.
  return isSessionActive({ token, expiresAt }) ? (
    <Navigate to={loginRedirectTarget(location.state)} replace />
  ) : (
    <Outlet />
  )
}
