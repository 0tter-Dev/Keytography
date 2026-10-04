import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { forgotPassword, type AuthFailure } from './auth-api'
import { forgotPasswordSchema } from './auth-schemas'
import { AuthError } from './AuthError'

type ForgotPasswordValues = { email: string }

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [failure, setFailure] = useState<AuthFailure | null>(null)
  const [sent, setSent] = useState(false)
  const schema = useMemo(() => forgotPasswordSchema(t), [t])
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: ForgotPasswordValues) {
    setFailure(null)
    setSent(false)
    const result = await forgotPassword(values)
    if (!result.ok) {
      setFailure(result.failure)
      return
    }
    setSent(true)
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('auth.forgotPassword.title')}</CardTitle>
        <CardDescription>{t('auth.forgotPassword.description')}</CardDescription>
      </div>

      {failure && <AuthError failure={failure} />}
      {/* Mesmo texto exista ou não o e-mail: a API também não revela quais estão cadastrados. */}
      {sent && <Alert variant="success">{t('auth.forgotPassword.sent')}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <FormField label={t('auth.fields.email')} error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...register('email')} />
        </FormField>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('auth.forgotPassword.submitting') : t('auth.forgotPassword.submit')}
        </Button>
      </form>

      <div className="flex flex-col gap-1 text-sm">
        <Link to="/reset-password" className="underline underline-offset-4">
          {t('auth.forgotPassword.haveToken')}
        </Link>
        <Link to="/login" className="underline underline-offset-4">
          {t('auth.backToLogin')}
        </Link>
      </div>
    </Card>
  )
}
