import 'i18next'
import type { resources, DEFAULT_LANGUAGE } from './index'

// Torna as chaves de `t()` tipadas a partir do arquivo de tradução padrão.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: (typeof resources)[typeof DEFAULT_LANGUAGE]
  }
}
