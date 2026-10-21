import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Card, CardTitle } from '@/components/ui/card'
import { EntryForm } from './EntryForm'
import { EntryNotFound } from './EntryNotFound'
import { useEntrySubmit } from './use-entry-submit'
import { VaultError } from './vault-api'
import { VaultLoadError } from './VaultLoadError'
import { VaultLoading } from './VaultLoading'
import { useEntry, useUpdateEntry } from './vault-queries'

/** Edição: abre SEMPRE com o detalhe buscado agora (nunca com dado da lista ou do cache). */
export function EditEntryPage() {
  const { id = '' } = useParams()
  return <EditEntry key={id} id={id} />
}

function EditEntry({ id }: { id: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const entry = useEntry(id)
  const update = useUpdateEntry(id)
  const { submit, failure, titleError } = useEntrySubmit(update)

  if (entry.isPending) {
    return <VaultLoading rows={4} />
  }
  if (entry.isError) {
    return entry.error instanceof VaultError && entry.error.failure === 'notFound' ? (
      <EntryNotFound />
    ) : (
      <VaultLoadError onRetry={() => void entry.refetch()} />
    )
  }

  const { title, login, password, additionalFields } = entry.data
  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <CardTitle>{t('vault.form.editTitle')}</CardTitle>
      <EntryForm
        mode="edit"
        defaultValues={{
          title,
          login: login ?? '',
          password,
          fields: Object.entries(additionalFields ?? {}).map(([name, value]) => ({ name, value })),
        }}
        onSubmit={submit}
        onCancel={() => navigate(`/vault/${id}`)}
        failure={failure}
        titleServerError={titleError}
      />
    </Card>
  )
}
