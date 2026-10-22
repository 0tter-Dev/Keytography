import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/**
 * Falha ao carregar uma lista ou um detalhe, com nova tentativa. `heading`: é a tela inteira (detalhe
 * ou edição, que não têm outro título), então o título da falha vira o `h1`.
 */
export function VaultLoadError({
  onRetry,
  heading = false,
}: {
  onRetry: () => void
  heading?: boolean
}) {
  const { t } = useTranslation()

  return (
    <Alert variant="destructive" className="flex flex-col items-start gap-2">
      {heading ? (
        <h1 className="font-medium">{t('vault.loadError.title')}</h1>
      ) : (
        <p className="font-medium">{t('vault.loadError.title')}</p>
      )}
      <p>{t('vault.loadError.description')}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('vault.loadError.retry')}
      </Button>
    </Alert>
  )
}
