import { useTranslation } from 'react-i18next'
import { formatDateTime } from '@/lib/format-date'
import { SecretValue } from './SecretValue'
import { VaultLoading } from './VaultLoading'
import { useHistory } from './vault-queries'

/** Senhas anteriores de uma entrada: cada uma oculta até ser revelada (mesmas regras da senha atual). */
export function EntryHistory({ id }: { id: string }) {
  const { t } = useTranslation()
  const history = useHistory(id, true)

  if (history.isPending) {
    return <VaultLoading rows={2} />
  }
  if (history.isError) {
    return (
      <p role="alert" className="text-sm">
        {t('vault.history.loadError')}
      </p>
    )
  }
  if (history.data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('vault.history.empty')}</p>
  }

  return (
    <ul className="flex flex-col gap-4">
      {history.data.map((item) => (
        <li key={item.id} className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            {t('vault.history.changedAt', { date: formatDateTime(item.changedAt) })}
          </p>
          <SecretValue label={t('vault.form.fields.password')} value={item.password} />
        </li>
      ))}
    </ul>
  )
}
