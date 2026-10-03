/** Utilitários de cor só para testes: contraste WCAG a partir de valores `oklch(...)` do CSS. */

export type Oklch = [l: number, c: number, h: number]

export function parseOklch(value: string): Oklch {
  const match = value.match(/oklch\(\s*([\d.]+)\s+([\d.]+)(?:\s+([\d.]+))?\s*\)/)
  if (!match) {
    throw new Error(`Não é um oklch(): ${value}`)
  }
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
}

function toLinearSrgb([l, c, h]: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180)
  const b = c * Math.sin((h * Math.PI) / 180)
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6)

/** Como o CSS faz com cores fora do sRGB: reduz o croma mantendo luminosidade e matiz. */
function gamutMapped([l, c, h]: Oklch): [number, number, number] {
  if (inGamut(toLinearSrgb([l, c, h]))) {
    return toLinearSrgb([l, c, h])
  }
  let low = 0
  let high = c
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2
    if (inGamut(toLinearSrgb([l, mid, h]))) low = mid
    else high = mid
  }
  return toLinearSrgb([l, low, h])
}

/** Luminância relativa (WCAG) de uma cor oklch. */
export function luminance(color: Oklch): number {
  const [r, g, b] = gamutMapped(color).map((v) => Math.min(1, Math.max(0, v))) as [
    number,
    number,
    number,
  ]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: Oklch, b: Oklch): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

export const BLACK: Oklch = [0, 0, 0]
export const WHITE: Oklch = [1, 0, 0]
