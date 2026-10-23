import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'

/** Estado de carregamento de lista ou detalhe: esqueleto, anunciado como `status`. */
export function VaultLoading({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslation()

  return (
    <div role="status" aria-label={t('vault.loading')} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14" />
      ))}
    </div>
  )
}
