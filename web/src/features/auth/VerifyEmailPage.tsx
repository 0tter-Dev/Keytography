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
import { verifyEmail, type AuthFailure } from './auth-api'
import { verifyEmailSchema } from './auth-schemas'
import { AuthError } from './AuthError'

type VerifyEmailValues = { token: string }

export function VerifyEmailPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const schema = useMemo(() => verifyEmailSchema(t), [t])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerifyEmailValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: VerifyEmailValues) {
    setFailure(null)
    const result = await verifyEmail(values)
    if (!result.ok) {
      setFailure(result.failure)
      return
    }
    toast.success(t('auth.verifyEmail.success'))
    navigate('/login')
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('auth.verifyEmail.title')}</CardTitle>
        <CardDescription>{t('auth.verifyEmail.description')}</CardDescription>
      </div>

      {failure && <AuthError failure={failure} />}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField label={t('auth.fields.verificationToken')} error={errors.token?.message}>
          <Input autoComplete="one-time-code" {...register('token')} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('auth.verifyEmail.submitting') : t('auth.verifyEmail.submit')}
        </Button>
      </form>

      <Link to="/login" className="text-sm underline underline-offset-4">
        {t('auth.backToLogin')}
      </Link>
    </Card>
  )
}
