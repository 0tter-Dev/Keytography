import { useEffect } from 'react'
import { applyAppearance } from './appearance'
import { useAppearanceStore } from './theme-store'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Mantém data-theme/data-accent do <html> em sincronia com a preferência (e com o SO, no modo system). */
export function AppearanceController() {
  const theme = useAppearanceStore((state) => state.theme)
  const accent = useAppearanceStore((state) => state.accent)

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const apply = () => applyAppearance(document.documentElement, theme, accent, media.matches)

    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, accent])

  return null
}
