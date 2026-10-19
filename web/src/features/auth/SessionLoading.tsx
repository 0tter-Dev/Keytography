import { useTranslation } from 'react-i18next'

/** Tela mínima enquanto a sessão é restaurada ao abrir a aplicação (evita piscar o login). */
export function SessionLoading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center p-4">
      <p className="animate-pulse text-sm text-muted-foreground">{t('auth.restoring')}</p>
    </div>
  )
}
