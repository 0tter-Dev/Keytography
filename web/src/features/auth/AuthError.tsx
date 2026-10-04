import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/ui/alert'
import type { AuthFailure } from './auth-api'

/** Mensagem de falha de autenticação, traduzida a partir do tipo da falha. */
export function AuthError({ failure }: { failure: AuthFailure }) {
  const { t } = useTranslation()
  return <Alert variant="destructive">{t(`auth.errors.${failure}`)}</Alert>
}
