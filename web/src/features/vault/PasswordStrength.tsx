import { Check, X } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  displayScore,
  isKnownCriterion,
  strengthBand,
  type StrengthBand,
} from './password-strength'

export type CriterionResult = { score: number; passed: boolean }

type PasswordStrengthProps = {
  /** Nota 0 a 100 devolvida pela API; `null` quando a entrada ainda não foi avaliada. */
  score: number | null | undefined
  /** Resultado por critério devolvido pela API (a lista de critérios é aberta). */
  detail?: Record<string, CriterionResult> | null
}

const BAR_COLOR: Record<StrengthBand, string> = {
  weak: 'bg-destructive',
  medium: 'bg-warning',
  strong: 'bg-success',
}

/**
 * Força de uma senha a partir do que a API devolveu. Recebe só a nota e o detalhamento (nunca a
 * senha) e não calcula nada: as faixas são apresentação. A informação está sempre em texto, a cor
 * só reforça.
 */
export function PasswordStrength({ score, detail }: PasswordStrengthProps) {
  const { t } = useTranslation()
  const titleId = useId()
  const value = displayScore(score)
  const criteria = Object.entries(detail ?? {})

  return (
    <section className="flex flex-col gap-2" aria-labelledby={titleId}>
      <h2 id={titleId} className="text-sm font-medium">
        {t('vault.strength.title')}
      </h2>

      {value === null ? (
        <p className="text-sm text-muted-foreground">{t('vault.strength.notEvaluated')}</p>
      ) : (
        <StrengthMeter value={value} />
      )}

      {criteria.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t('vault.strength.criteriaTitle')}
          </h3>
          <ul className="flex flex-col gap-1 text-sm">
            {criteria.map(([key, result]) => (
              <CriterionRow key={key} criterionKey={key} result={result} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function StrengthMeter({ value }: { value: number }) {
  const { t } = useTranslation()
  const band = t(`vault.strength.bands.${strengthBand(value)}`)

  return (
    <div className="flex flex-col gap-1">
      <div
        role="meter"
        aria-label={t('vault.strength.meterLabel')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={t('vault.strength.valueText', { band, score: value })}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', BAR_COLOR[strengthBand(value)])}
          style={{ width: `${value}%` }}
        />
      </div>
      <p className="text-sm">{t('vault.strength.summary', { band, score: value })}</p>
    </div>
  )
}

function CriterionRow({ criterionKey, result }: { criterionKey: string; result: CriterionResult }) {
  const { t } = useTranslation()
  const passed = result.passed === true
  const score = displayScore(result.score)
  const label = isKnownCriterion(criterionKey)
    ? t(`vault.strength.criteria.${criterionKey}`)
    : t('vault.strength.criteria.unknown')

  return (
    <li className="flex items-center gap-2">
      {passed ? (
        <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
      ) : (
        <X aria-hidden="true" className="size-4 shrink-0 text-destructive" />
      )}
      <span className="min-w-0 flex-1">{label}</span>
      <span className="text-xs text-muted-foreground">
        {passed ? t('vault.strength.passed') : t('vault.strength.failed')}
        {score !== null && ` · ${t('vault.strength.criterionScore', { score })}`}
      </span>
    </li>
  )
}
