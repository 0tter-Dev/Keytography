import { useTranslation } from 'react-i18next'
import { Card, CardTitle } from '@/components/ui/card'
import { ACCENTS, THEME_PREFERENCES, isAccent, isThemePreference } from './appearance'
import { useAppearanceStore } from './theme-store'

const selectClasses =
  'h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground'

/**
 * Seletor TEMPORÁRIO, só para desenvolvimento (renderizado apenas em `import.meta.env.DEV`).
 * A UI definitiva de tema/cor é entregue em keytography-012, sobre a mesma store.
 */
export function DevAppearanceControls() {
  const { t } = useTranslation()
  const { theme, accent, setTheme, setAccent } = useAppearanceStore()

  return (
    <Card className="mt-auto flex flex-col gap-4 sm:flex-row sm:items-end">
      <CardTitle className="sm:mr-auto">{t('appearance.title')}</CardTitle>
      <label className="flex flex-col gap-1 text-sm">
        {t('appearance.theme')}
        <select
          className={selectClasses}
          value={theme}
          onChange={(event) =>
            isThemePreference(event.target.value) && setTheme(event.target.value)
          }
        >
          {THEME_PREFERENCES.map((option) => (
            <option key={option} value={option}>
              {t(`appearance.themes.${option}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('appearance.accent')}
        <select
          className={selectClasses}
          value={accent}
          onChange={(event) => isAccent(event.target.value) && setAccent(event.target.value)}
        >
          {ACCENTS.map((option) => (
            <option key={option} value={option}>
              {t(`appearance.accents.${option}`)}
            </option>
          ))}
        </select>
      </label>
    </Card>
  )
}
