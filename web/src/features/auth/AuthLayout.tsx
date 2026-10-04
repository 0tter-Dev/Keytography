import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { Wordmark } from '@/components/layout/Brand'

/** Moldura das telas de autenticação: marca + tagline acima de um cartão centralizado. */
export function AuthLayout() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-4 md:p-8">
      <header className="flex flex-col items-center gap-1 text-center">
        <Wordmark className="text-2xl" />
        <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
      </header>
      <Outlet />
    </main>
  )
}
