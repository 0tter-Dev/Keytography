import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Card } from '@/components/ui/card'
import { EntryForm } from './EntryForm'
import { useEntrySubmit } from './use-entry-submit'
import { useCreateEntry } from './vault-queries'

const EMPTY = { title: '', login: '', password: '', fields: [] }

export function NewEntryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateEntry()
  const { submit, failure, titleError } = useEntrySubmit(create)

  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <h1 className="text-lg font-semibold tracking-tight">{t('vault.form.newTitle')}</h1>
      <EntryForm
        mode="create"
        defaultValues={EMPTY}
        onSubmit={submit}
        onCancel={() => navigate('/vault')}
        failure={failure}
        titleServerError={titleError}
      />
    </Card>
  )
}
