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
import { resetPassword, type AuthFailure } from './auth-api'
import { resetPasswordSchema } from './auth-schemas'
import { AuthError } from './AuthError'

type ResetPasswordValues = { token: string; newPassword: string; confirmPassword: string }

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const schema = useMemo(() => resetPasswordSchema(t), [t])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(schema) })

  async function onSubmit({ token, newPassword }: ResetPasswordValues) {
    setFailure(null)
    const result = await resetPassword({ token, newPassword })
    if (!result.ok) {
      setFailure(result.failure)
      return
    }
    toast.success(t('auth.resetPassword.success'))
    navigate('/login')
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('auth.resetPassword.title')}</CardTitle>
        <CardDescription>{t('auth.resetPassword.description')}</CardDescription>
      </div>

      {failure && <AuthError failure={failure} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField label={t('auth.fields.resetToken')} error={errors.token?.message}>
          <Input autoComplete="one-time-code" {...register('token')} />
        </FormField>
        <FormField label={t('auth.fields.newPassword')} error={errors.newPassword?.message}>
          <Input type="password" autoComplete="new-password" {...register('newPassword')} />
        </FormField>
        <FormField label={t('auth.fields.confirmPassword')} error={errors.confirmPassword?.message}>
          <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('auth.resetPassword.submitting') : t('auth.resetPassword.submit')}
        </Button>
      </form>

      <Link to="/login" className="text-sm underline underline-offset-4">
        {t('auth.backToLogin')}
      </Link>
    </Card>
  )
}
