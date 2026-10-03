export const THEME_PREFERENCES = [
  'system',
  'light',
  'light-high-contrast',
  'dark',
  'dark-high-contrast',
] as const

export const ACCENTS = [
  'green',
  'lime',
  'purple',
  'red',
  'blue',
  'light-blue',
  'orange',
  'yellow',
  'pink',
] as const

export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = Exclude<ThemePreference, 'system'>
export type Accent = (typeof ACCENTS)[number]

export const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system'
export const DEFAULT_ACCENT: Accent = 'green'

/** Chave do localStorage — mantida em sincronia com o script anti-flash de index.html. */
export const APPEARANCE_STORAGE_KEY = 'keytography.appearance'

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference)
}

export function isAccent(value: unknown): value is Accent {
  return ACCENTS.includes(value as Accent)
}

/** "system" segue prefers-color-scheme; os demais já são temas concretos. */
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }
  return preference
}

export function applyAppearance(
  root: HTMLElement,
  preference: ThemePreference,
  accent: Accent,
  systemPrefersDark: boolean,
) {
  root.dataset.theme = resolveTheme(preference, systemPrefersDark)
  root.dataset.accent = accent
}
