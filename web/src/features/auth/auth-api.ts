import { api } from '@/api/client'

/** Falhas de autenticação que a interface sabe explicar (cada uma tem um texto em `auth.errors`). */
export type AuthFailure =
  | 'invalidCredentials'
  | 'emailNotVerified'
  | 'conflict'
  | 'invalidToken'
  | 'invalidInput'
  | 'network'
  | 'unknown'

export type AuthResult<T> = { ok: true; data: T } | { ok: false; failure: AuthFailure }

type Outcome<T> = { data?: T; response: Response }

async function run<T>(
  call: () => Promise<Outcome<T>>,
  failureFor: (status: number) => AuthFailure,
): Promise<AuthResult<T>> {
  try {
    const { data, response } = await call()
    if (response.ok && data !== undefined) {
      return { ok: true, data }
    }
    return { ok: false, failure: failureFor(response.status) }
  } catch {
    return { ok: false, failure: 'network' }
  }
}

export function login(body: { login: string; password: string }) {
  return run(
    () => api.POST('/auth/login', { body }),
    (status) =>
      status === 401 ? 'invalidCredentials' : status === 403 ? 'emailNotVerified' : 'unknown',
  )
}

export function register(body: { login: string; email: string; password: string }) {
  return run(
    () => api.POST('/auth/register', { body }),
    (status) => (status === 409 ? 'conflict' : status === 400 ? 'invalidInput' : 'unknown'),
  )
}

export function verifyEmail(body: { token: string }) {
  return run(
    () => api.POST('/auth/verify-email', { body }),
    (status) => (status === 400 ? 'invalidToken' : 'unknown'),
  )
}

export function forgotPassword(body: { email: string }) {
  return run(
    () => api.POST('/auth/forgot-password', { body }),
    () => 'unknown',
  )
}

export function resetPassword(body: { token: string; newPassword: string }) {
  return run(
    () => api.POST('/auth/reset-password', { body }),
    // 400 é token inválido/expirado (a senha já foi validada no cliente).
    (status) => (status === 400 ? 'invalidToken' : 'unknown'),
  )
}
