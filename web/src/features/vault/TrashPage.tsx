import { ArrowLeft, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { ConfirmPermanentDeleteDialog } from './ConfirmPermanentDeleteDialog'
import { VaultError, type EntryListItem } from './vault-api'
import {
  captureSessionContext,
  isUnexplainedUnauthorized,
  type SessionContext,
} from './vault-feedback'
import { VaultLoadError } from './VaultLoadError'
import { VaultLoading } from './VaultLoading'
import { usePermanentlyDeleteEntry, useRestoreEntry, useTrash } from './vault-queries'

/**
 * Lixeira: restaurar e excluir definitivamente (só aqui, e só com a palavra digitada). Não abre
 * detalhe nem edição de entradas excluídas.
 */
export function TrashPage() {
  const { t } = useTranslation()
  const trash = useTrash()
  const restore = useRestoreEntry()
  const permanentDelete = usePermanentlyDeleteEntry()
  const [target, setTarget] = useState<EntryListItem | null>(null)

  /**
   * Um `unauthorized` que o cliente já explica (sessão encerrada, conta trocada) não ganha toast;
   * o que ele não explica (conta ainda por conferir) diz que nada foi feito.
   */
  function reportFailure(error: unknown, startedIn: SessionContext, message: string) {
    if (isUnexplainedUnauthorized(error, startedIn)) {
      toast.warning(t('vault.errors.unauthorized'))
    } else if (!(error instanceof VaultError && error.failure === 'unauthorized')) {
      toast.error(message)
    }
  }

  async function restoreEntry(entry: EntryListItem) {
    if (restore.isPending) {
      return
    }
    const startedIn = captureSessionContext()
    try {
      await restore.mutateAsync(entry.id)
      toast.success(t('vault.trash.restored'))
    } catch (error) {
      reportFailure(error, startedIn, t('vault.trash.restoreFailed'))
    }
  }

  async function deleteForever() {
    if (!target || permanentDelete.isPending) {
      return
    }
    const startedIn = captureSessionContext()
    try {
      await permanentDelete.mutateAsync(target.id)
      toast.success(t('vault.trash.deleted'))
    } catch (error) {
      reportFailure(error, startedIn, t('vault.trash.deleteFailed'))
    } finally {
      setTarget(null)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('vault.trash.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('vault.trash.description')}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/vault">
            <ArrowLeft aria-hidden="true" />
            {t('vault.trash.back')}
          </Link>
        </Button>
      </div>

      {trash.isPending ? (
        <VaultLoading />
      ) : !trash.data ? (
        <VaultLoadError onRetry={() => void trash.refetch()} />
      ) : trash.data.length === 0 ? (
        <Card className="flex flex-col gap-2">
          <CardTitle>{t('vault.trash.empty.title')}</CardTitle>
          <CardDescription>{t('vault.trash.empty.description')}</CardDescription>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {trash.data.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-surface-foreground"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{entry.title}</span>
                <span className="truncate text-sm text-muted-foreground">
                  {entry.login ?? t('vault.list.noLogin')}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={restore.isPending}
                  aria-label={`${t('vault.trash.restore')}: ${entry.title}`}
                  onClick={() => restoreEntry(entry)}
                >
                  <RotateCcw aria-hidden="true" />
                  {t('vault.trash.restore')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  aria-label={`${t('vault.trash.deletePermanently')}: ${entry.title}`}
                  onClick={() => setTarget(entry)}
                >
                  <Trash2 aria-hidden="true" />
                  {t('vault.trash.deletePermanently')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmPermanentDeleteDialog
        open={target !== null}
        pending={permanentDelete.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setTarget(null)
          }
        }}
        onConfirm={() => void deleteForever()}
      />
    </div>
  )
}
