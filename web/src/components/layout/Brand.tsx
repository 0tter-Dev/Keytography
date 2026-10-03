import { KeyRound } from 'lucide-react'
import { useId, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/** Emblema hexagonal com a chave em negativo (ver docs/guides/identity.md). Usa a cor de destaque. */
export function Emblem({ className, ...props }: ComponentProps<'svg'>) {
  const maskId = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={cn('size-8 text-accent-ink', className)}
      {...props}
    >
      <mask id={maskId}>
        <rect width="64" height="64" fill="white" />
        <g fill="black">
          <circle cx="26" cy="32" r="7" />
          <rect x="31" y="30" width="19" height="4" />
          <rect x="42" y="34" width="3" height="6" />
          <rect x="47" y="34" width="3" height="5" />
        </g>
        <circle cx="26" cy="32" r="3" fill="white" />
      </mask>
      <path d="M32 4 56 18v28L32 60 8 46V18Z" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  )
}

/** Wordmark: ícone de chave + nome por extenso, para cabeçalhos e telas de login. */
export function Wordmark({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-lg font-semibold tracking-tight',
        className,
      )}
    >
      <KeyRound aria-hidden="true" className="size-5 text-accent-ink" />
      {t('app.name')}
    </span>
  )
}
