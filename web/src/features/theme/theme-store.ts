import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_ACCENT,
  DEFAULT_THEME_PREFERENCE,
  isAccent,
  isThemePreference,
  type Accent,
  type ThemePreference,
} from './appearance'

type AppearanceState = {
  theme: ThemePreference
  accent: Accent
  setTheme: (theme: ThemePreference) => void
  setAccent: (accent: Accent) => void
}

/** Preferência de aparência do usuário, persistida em localStorage (sem backend). */
export const useAppearanceStore = create<AppearanceState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME_PREFERENCE,
      accent: DEFAULT_ACCENT,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
    }),
    {
      name: APPEARANCE_STORAGE_KEY,
      partialize: ({ theme, accent }) => ({ theme, accent }),
      // Valores inválidos/antigos no storage nunca devem quebrar a aplicação.
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<Pick<AppearanceState, 'theme' | 'accent'>>
        return {
          ...current,
          theme: isThemePreference(stored.theme) ? stored.theme : current.theme,
          accent: isAccent(stored.accent) ? stored.accent : current.accent,
        }
      },
    },
  ),
)
