import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDateTime } from '@/lib/format-date'
import { ConfirmMoveToTrashDialog } from './ConfirmMoveToTrashDialog'
import { CopyButton } from './CopyButton'
import { EntryHistory } from './EntryHistory'
import { EntryNotFound } from './EntryNotFound'
import { PasswordStrength } from './PasswordStrength'
import { SecretValue } from './SecretValue'
import { captureSessionContext, isUnexplainedUnauthorized } from './vault-feedback'
import { VaultError } from './vault-api'
import { VaultLoadError } from './VaultLoadError'
import { VaultLoading } from './VaultLoading'
import { useEntry, useSoftDeleteEntry } from './vault-queries'

/** Detalhe de uma entrada ativa. `key` por id: trocar de entrada reinicia revelar e histórico. */
export function EntryDetailPage() {
  const { id = '' } = useParams()
  return <EntryDetail key={id} id={id} />
}

function EntryDetail({ id }: { id: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const entry = useEntry(id)
  const softDelete = useSoftDeleteEntry()
  const [showHistory, setShowHistory] = useState(false)
  const [confirmingTrash, setConfirmingTrash] = useState(false)

  if (entry.isPending) {
    return <VaultLoading rows={4} />
  }
  // Só é erro de carregamento se NÃO há dado: um refetch que falha com o detalhe na tela não o apaga.
  if (!entry.data) {
    return entry.error instanceof VaultError && entry.error.failure === 'notFound' ? (
      <EntryNotFound />
    ) : (
      <VaultLoadError heading onRetry={() => void entry.refetch()} />
    )
  }

  const {
    title,
    login,
    password,
    additionalFields,
    createdAt,
    updatedAt,
    passwordScore,
    passwordScoreDetail,
  } = entry.data
  const fieldRows = Object.entries(additionalFields ?? {})

  async function moveToTrash() {
    if (softDelete.isPending) {
      return
    }
    const startedIn = captureSessionContext()
    try {
      await softDelete.mutateAsync(id)
      toast.success(t('vault.detail.deleted'))
      navigate('/vault')
    } catch (error) {
      setConfirmingTrash(false)
      // Um `unauthorized` que o cliente já explica (sessão encerrada, conta trocada) não ganha toast.
      if (isUnexplainedUnauthorized(error, startedIn)) {
        toast.warning(t('vault.errors.unauthorized'))
      } else if (!(error instanceof VaultError && error.failure === 'unauthorized')) {
        toast.error(t('vault.detail.deleteFailed'))
      }
    }
  }

  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/vault/${id}/edit`}>
              <Pencil aria-hidden="true" />
              {t('vault.detail.edit')}
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmingTrash(true)}>
            <Trash2 aria-hidden="true" />
            {t('vault.detail.delete')}
          </Button>
        </div>
      </div>

      {login && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t('vault.form.fields.login')}</span>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{login}</span>
            <CopyButton what={t('vault.form.fields.login').toLowerCase()} value={login} />
          </div>
        </div>
      )}

      <SecretValue label={t('vault.form.fields.password')} value={password} />

      <PasswordStrength score={passwordScore} detail={passwordScoreDetail} />

      {fieldRows.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t('vault.detail.additionalFields')}</h2>
          <dl className="flex flex-col gap-1 text-sm">
            {fieldRows.map(([name, value]) => (
              <div key={name} className="flex gap-2">
                <dt className="font-medium">{name}:</dt>
                <dd className="min-w-0 break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        {t('vault.detail.createdAt', { date: formatDateTime(createdAt) })} ·{' '}
        {t('vault.detail.updatedAt', { date: formatDateTime(updatedAt) })}
      </p>

      <section className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          aria-expanded={showHistory}
          onClick={() => setShowHistory((current) => !current)}
        >
          {showHistory ? t('vault.detail.hideHistory') : t('vault.detail.showHistory')}
        </Button>
        {showHistory && <EntryHistory id={id} />}
      </section>

      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link to="/vault">{t('vault.detail.back')}</Link>
      </Button>

      <ConfirmMoveToTrashDialog
        open={confirmingTrash}
        pending={softDelete.isPending}
        onOpenChange={setConfirmingTrash}
        onConfirm={() => void moveToTrash()}
      />
    </Card>
  )
}
