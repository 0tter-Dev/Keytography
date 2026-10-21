import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'

/** Entrada inexistente, id inválido ou de outro usuário: a mesma tela, sem distinguir o motivo. */
export function EntryNotFound() {
  const { t } = useTranslation()

  return (
    <Card className="flex max-w-xl flex-col gap-3">
      <CardTitle>{t('vault.notFound.title')}</CardTitle>
      <CardDescription>{t('vault.notFound.description')}</CardDescription>
      <Button asChild variant="outline" className="self-start">
        <Link to="/vault">{t('vault.notFound.back')}</Link>
      </Button>
    </Card>
  )
}
