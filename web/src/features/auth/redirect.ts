export type LoginRedirectState = { from?: string }

/**
 * Destino pós-login guardado por `RequireAuth`. Só aceita caminhos internos (`/...`, nunca
 * `//host` nem URLs absolutas): o estado do histórico não é confiável o bastante para um redirect.
 */
export function loginRedirectTarget(state: unknown): string {
  const from = (state as LoginRedirectState | null)?.from
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/'
}
