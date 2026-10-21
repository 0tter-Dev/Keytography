import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format-date'
import { VaultLoadError } from './VaultLoadError'
import { VaultLoading } from './VaultLoading'
import { useEntries } from './vault-queries'

/** Lista do cofre (título, login e data; sem segredo). Carregando, vazio e erro são estados distintos. */
export function VaultListPage() {
  const { t } = useTranslation()
  const entries = useEntries()

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('vault.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('vault.list.description')}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/vault/trash">
              <Trash2 aria-hidden="true" />
              {t('vault.list.trash')}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/vault/new">
              <Plus aria-hidden="true" />
              {t('vault.list.new')}
            </Link>
          </Button>
        </div>
      </div>

      {entries.isPending ? (
        <VaultLoading />
      ) : entries.isError ? (
        <VaultLoadError onRetry={() => void entries.refetch()} />
      ) : entries.data.length === 0 ? (
        <Card className="flex flex-col gap-2">
          <CardTitle>{t('vault.list.empty.title')}</CardTitle>
          <CardDescription>{t('vault.list.empty.description')}</CardDescription>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.data.map((entry) => (
            <li key={entry.id}>
              <Link
                to={`/vault/${entry.id}`}
                className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface p-4 text-surface-foreground transition-colors hover:bg-muted"
              >
                <span className="font-medium">{entry.title}</span>
                <span className="text-sm text-muted-foreground">
                  {entry.login ?? t('vault.list.noLogin')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('vault.list.updatedAt', { date: formatDateTime(entry.updatedAt) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
