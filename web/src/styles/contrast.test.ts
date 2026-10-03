import { describe, expect, it } from 'vitest'
import { ACCENTS, THEME_PREFERENCES } from '@/features/theme/appearance'
import { BLACK, WHITE, contrastRatio, parseOklch, type Oklch } from '@/test/oklch'
import css from './index.css?raw'

/**
 * Guarda dos tokens de design: lê os valores REAIS de index.css e verifica o contraste mínimo
 * (WCAG) das combinações tema x destaque. Se alguém mexer num token e quebrar a legibilidade,
 * este teste falha. Medições visuais no navegador continuam necessárias para o que o CSS
 * calcula em runtime, mas os limiares abaixo são lidos do próprio CSS.
 */

const THEMES = THEME_PREFERENCES.filter((theme) => theme !== 'system')

type Theme = {
  name: string
  background: Oklch
  surface: Oklch
  foreground: Oklch
  muted: Oklch
  mutedForeground: Oklch
  inkMaxL: number
}

function blockFor(selector: RegExp): string {
  const match = [...css.matchAll(/(:root[^{]*)\{([^}]*)\}/g)].find(([, sel]) => selector.test(sel!))
  if (!match) throw new Error(`Bloco CSS não encontrado: ${selector}`)
  return match[2]!
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`Token --${name} não encontrado`)
  return match[1]!.trim()
}

function themeTokens(name: (typeof THEMES)[number]): Theme {
  // O tema "light" é o padrão do :root e também aparece como [data-theme='light'].
  const block = blockFor(
    name === 'light' ? /data-theme='light'\]/ : new RegExp(`data-theme='${name}'`),
  )
  return {
    name,
    background: parseOklch(token(block, 'background')),
    surface: parseOklch(token(block, 'surface')),
    foreground: parseOklch(token(block, 'foreground')),
    muted: parseOklch(token(block, 'muted')),
    mutedForeground: parseOklch(token(block, 'muted-foreground')),
    inkMaxL: Number(token(block, 'ink-max-l')),
  }
}

function accentValue(accent: (typeof ACCENTS)[number]): Oklch {
  const block =
    accent === 'green'
      ? blockFor(/^:root,\s*:root\[data-accent='green'\]/)
      : blockFor(new RegExp(`data-accent='${accent}'`))
  return parseOklch(token(block, 'accent'))
}

/** Limiar de luminosidade lido de `--primary-foreground: oklch(from ... clamp(0, (T - l) * 1000, 1) 0 0)`. */
function primaryForegroundThreshold(): number {
  const match = css.match(
    /--primary-foreground:\s*oklch\(from var\(--accent\) clamp\(0, \(([\d.]+) - l\)/,
  )
  if (!match) throw new Error('Fórmula de --primary-foreground não encontrada em index.css')
  return Number(match[1])
}

const themes = THEMES.map(themeTokens)

describe('tokens de design — contraste mínimo (WCAG)', () => {
  it('cobre os 4 temas concretos e os 9 destaques', () => {
    expect(themes).toHaveLength(4)
    expect(ACCENTS).toHaveLength(9)
  })

  it.each(themes.map((theme) => [theme.name, theme] as const))(
    'tema %s: texto e texto secundário legíveis (>= 4.5:1)',
    (_name, theme) => {
      expect(contrastRatio(theme.foreground, theme.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(theme.foreground, theme.surface)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(theme.mutedForeground, theme.background)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(theme.mutedForeground, theme.muted)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(ACCENTS.map((accent) => [accent] as const))(
    'destaque %s: texto sobre o destaque (primary-foreground) >= 4.5:1',
    (accent) => {
      const color = accentValue(accent)
      const foreground = (primaryForegroundThreshold() - color[0]) * 1000 > 0.5 ? WHITE : BLACK
      expect(contrastRatio(color, foreground)).toBeGreaterThanOrEqual(4.5)
    },
  )

  it.each(themes.flatMap((theme) => ACCENTS.map((accent) => [theme.name, accent, theme] as const)))(
    '%s + %s: accent-ink (foco, ícones) >= 3:1 contra fundo e superfície',
    (_themeName, accent, theme) => {
      const [l, c, h] = accentValue(accent)
      const ink: Oklch = [Math.min(l, theme.inkMaxL), c, h]
      expect(contrastRatio(ink, theme.background)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(ink, theme.surface)).toBeGreaterThanOrEqual(3)
    },
  )
})
