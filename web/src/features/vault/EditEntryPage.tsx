import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { Card } from '@/components/ui/card'
import { EntryForm } from './EntryForm'
import { EntryNotFound } from './EntryNotFound'
import { useEntrySubmit } from './use-entry-submit'
import { VaultError } from './vault-api'
import { VaultLoadError } from './VaultLoadError'
import { VaultLoading } from './VaultLoading'
import { useEntryForEdit, useUpdateEntry } from './vault-queries'

/** Edição: abre SEMPRE com o detalhe buscado agora (consulta própria, nunca o dado em cache do detalhe). */
export function EditEntryPage() {
  const { id = '' } = useParams()
  return <EditEntry key={id} id={id} />
}

function EditEntry({ id }: { id: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const entry = useEntryForEdit(id)
  const update = useUpdateEntry(id)
  const { submit, failure, titleError } = useEntrySubmit(update)

  if (entry.isPending) {
    return <VaultLoading rows={4} />
  }
  // Só é erro de carregamento se NÃO há dado: um refetch que falha com o formulário já aberto não
  // pode trocá-lo pela tela de erro (os dados digitados se perderiam).
  if (!entry.data) {
    return entry.error instanceof VaultError && entry.error.failure === 'notFound' ? (
      <EntryNotFound />
    ) : (
      <VaultLoadError onRetry={() => void entry.refetch()} />
    )
  }

  const { title, login, password, additionalFields } = entry.data
  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">{t('vault.form.editTitle')}</h1>
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
