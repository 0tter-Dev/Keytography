import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Card, CardTitle } from '@/components/ui/card'
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
      <CardTitle>{t('vault.form.newTitle')}</CardTitle>
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
