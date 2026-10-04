import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { register as registerUser, type AuthFailure } from './auth-api'
import { registerSchema } from './auth-schemas'
import { AuthError } from './AuthError'

type RegisterValues = { login: string; email: string; password: string; confirmPassword: string }

export function RegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const schema = useMemo(() => registerSchema(t), [t])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(schema) })

  async function onSubmit({ login, email, password }: RegisterValues) {
    setFailure(null)
    const result = await registerUser({ login, email, password })
    if (!result.ok) {
      setFailure(result.failure)
      return
    }
    toast.success(t('auth.register.success'))
    navigate('/verify-email')
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('auth.register.title')}</CardTitle>
        <CardDescription>{t('auth.register.description')}</CardDescription>
      </div>

      {failure && <AuthError failure={failure} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField label={t('auth.fields.login')} error={errors.login?.message}>
          <Input autoComplete="username" {...register('login')} />
        </FormField>
        <FormField label={t('auth.fields.email')} error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <FormField label={t('auth.fields.password')} error={errors.password?.message}>
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </FormField>
        <FormField label={t('auth.fields.confirmPassword')} error={errors.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('auth.register.submitting') : t('auth.register.submit')}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        {t('auth.register.haveAccount')}{' '}
        <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
          {t('auth.register.loginLink')}
        </Link>
      </p>
    </Card>
  )
}
