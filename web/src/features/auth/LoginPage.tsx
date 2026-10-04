import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { login, type AuthFailure } from './auth-api'
import { loginSchema } from './auth-schemas'
import { AuthError } from './AuthError'
import type { LoginRedirectState } from './guards'
import { useSessionStore } from './session-store'

type LoginValues = { login: string; password: string }

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const signIn = useSessionStore((state) => state.signIn)
  const expired = useSessionStore((state) => state.expired)
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const schema = useMemo(() => loginSchema(t), [t])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: LoginValues) {
    setFailure(null)
    const result = await login(values)
    if (!result.ok) {
      setFailure(result.failure)
      return
    }
    signIn(result.data.token, result.data.expiresAt)
    const from = (location.state as LoginRedirectState | null)?.from
    navigate(from ?? '/', { replace: true })
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('auth.login.title')}</CardTitle>
        <CardDescription>{t('auth.login.description')}</CardDescription>
      </div>

      {expired && !failure && <Alert>{t('auth.login.sessionExpired')}</Alert>}
      {failure && <AuthError failure={failure} />}
      {failure === 'emailNotVerified' && (
        <Link to="/verify-email" className="text-sm font-medium underline underline-offset-4">
          {t('auth.login.verifyEmailLink')}
        </Link>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField label={t('auth.fields.login')} error={errors.login?.message}>
          <Input autoComplete="username" {...register('login')} />
        </FormField>
        <FormField label={t('auth.fields.password')} error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </form>

      <div className="flex flex-col gap-1 text-sm">
        <Link to="/forgot-password" className="underline underline-offset-4">
          {t('auth.login.forgotPasswordLink')}
        </Link>
        <p className="text-muted-foreground">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="font-medium text-foreground underline underline-offset-4">
            {t('auth.login.registerLink')}
          </Link>
        </p>
      </div>
    </Card>
  )
}
