import type { TFunction } from 'i18next'
import { z } from 'zod'

/** Mesmo mínimo aplicado pela API (`POST /auth/register` e `/auth/reset-password`). */
export const MIN_PASSWORD_LENGTH = 8

/**
 * Os schemas espelham as regras da API e recebem `t` para que as mensagens saiam traduzidas
 * (nenhuma string literal de interface fora do arquivo de tradução).
 */
export function loginSchema(t: TFunction) {
  return z.object({
    login: z.string().trim().min(1, t('auth.validation.loginRequired')),
    password: z.string().min(1, t('auth.validation.passwordRequired')),
  })
}

// A API só exige um "@"; um endereço que não existe simplesmente nunca é verificado.
function emailRule(t: TFunction) {
  return z
    .string()
    .trim()
    .min(1, t('auth.validation.emailRequired'))
    .refine((value) => value.includes('@'), t('auth.validation.emailInvalid'))
}

function passwordRule(t: TFunction) {
  return z
    .string()
    .min(MIN_PASSWORD_LENGTH, t('auth.validation.passwordMin', { min: MIN_PASSWORD_LENGTH }))
}

export function registerSchema(t: TFunction) {
  return z
    .object({
      login: z.string().trim().min(1, t('auth.validation.loginRequired')),
      email: emailRule(t),
      password: passwordRule(t),
      confirmPassword: z.string(),
    })
    .refine((values) => values.password === values.confirmPassword, {
      path: ['confirmPassword'],
      message: t('auth.validation.passwordMismatch'),
    })
}

export function verifyEmailSchema(t: TFunction) {
  return z.object({ token: z.string().trim().min(1, t('auth.validation.tokenRequired')) })
}

export function forgotPasswordSchema(t: TFunction) {
  return z.object({ email: emailRule(t) })
}

export function resetPasswordSchema(t: TFunction) {
  return z
    .object({
      token: z.string().trim().min(1, t('auth.validation.tokenRequired')),
      newPassword: passwordRule(t),
      confirmPassword: z.string(),
    })
    .refine((values) => values.newPassword === values.confirmPassword, {
      path: ['confirmPassword'],
      message: t('auth.validation.passwordMismatch'),
    })
}
