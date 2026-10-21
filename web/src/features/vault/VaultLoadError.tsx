import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** Falha ao carregar uma lista ou um detalhe, com nova tentativa. */
export function VaultLoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <Alert variant="destructive" className="flex flex-col items-start gap-2">
      <p className="font-medium">{t('vault.loadError.title')}</p>
      <p>{t('vault.loadError.description')}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('vault.loadError.retry')}
      </Button>
    </Alert>
  )
}
