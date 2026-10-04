import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { isSessionActive, useSessionStore } from './session-store'

/** Maior atraso que `setTimeout` aceita (~24,8 dias). */
const MAX_TIMEOUT_MS = 2 ** 31 - 1

export type LoginRedirectState = { from?: string }

/** Rotas que exigem sessão válida; sem ela, redireciona ao login guardando o destino. */
export function RequireAuth() {
  const token = useSessionStore((state) => state.token)
  const expiresAt = useSessionStore((state) => state.expiresAt)
  const expire = useSessionStore((state) => state.expire)
  const location = useLocation()
  const active = isSessionActive({ token, expiresAt })

  // Encerra a sessão no instante em que o JWT vence, sem esperar a próxima chamada.
  useEffect(() => {
    if (!active || expiresAt === null) {
      return
    }
    const timer = setTimeout(expire, Math.min(expiresAt - Date.now(), MAX_TIMEOUT_MS))
    return () => clearTimeout(timer)
  }, [active, expiresAt, expire])

  if (!active) {
    const state: LoginRedirectState = { from: location.pathname + location.search }
    return <Navigate to="/login" replace state={state} />
  }
  return <Outlet />
}

/** Telas só para quem ainda não entrou (login, registro, esqueci a senha). */
export function GuestOnly() {
  const token = useSessionStore((state) => state.token)
  const expiresAt = useSessionStore((state) => state.expiresAt)

  return isSessionActive({ token, expiresAt }) ? <Navigate to="/" replace /> : <Outlet />
}
