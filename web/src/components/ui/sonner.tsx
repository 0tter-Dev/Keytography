import type { CSSProperties } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

// Única exceção a "sem estilo inline": a biblioteca expõe suas cores só via variáveis CSS
// em `style`; apontamos para os tokens do design system, então segue tema e destaque sozinha.
const toastTokens = {
  '--normal-bg': 'var(--surface)',
  '--normal-text': 'var(--surface-foreground)',
  '--normal-border': 'var(--border)',
  '--success-bg': 'var(--surface)',
  '--success-text': 'var(--surface-foreground)',
  '--success-border': 'var(--success)',
  '--error-bg': 'var(--surface)',
  '--error-text': 'var(--surface-foreground)',
  '--error-border': 'var(--destructive)',
} as CSSProperties

export function Toaster() {
  return <SonnerToaster style={toastTokens} />
}
