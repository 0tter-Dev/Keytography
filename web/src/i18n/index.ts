import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from './locales/pt-BR.json'

export const DEFAULT_LANGUAGE = 'pt-BR'

export const resources = {
  'pt-BR': { translation: ptBR },
} as const

/**
 * Todo texto de interface passa por aqui, mesmo com um único idioma: adicionar `en`/`es` depois
 * é só incluir um arquivo em ./locales e registrá-lo em `resources`.
 */
void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false }, // o React já escapa
})

export default i18n
