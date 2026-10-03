import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import { useHealth } from './use-health'

type StatusKey = 'healthy' | 'degraded' | 'unhealthy' | 'unreachable'

function statusKeyOf(result: ReturnType<typeof useHealth>['data']): StatusKey {
  if (!result?.reachable) {
    return 'unreachable'
  }
  const status = result.report.status
  return status === 'healthy' || status === 'degraded' ? status : 'unhealthy'
}

/** Prova de vida fim a fim: UI -> cliente tipado -> API (`GET /health`). */
export function HealthPage() {
  const { t } = useTranslation()
  const { data, isPending, isFetching, refetch } = useHealth()

  const statusKey = statusKeyOf(data)
  const checks = data?.reachable ? data.report.checks : []

  async function recheck() {
    const { data: result } = await refetch()
    if (statusKeyOf(result) === 'healthy') {
      toast.success(t('health.toast.healthy'))
    } else {
      toast.error(t('health.toast.failed'))
    }
  }

  return (
    <Card className="flex max-w-xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('health.title')}</CardTitle>
        <CardDescription>{t('health.description')}</CardDescription>
      </div>

      {isPending ? (
        <div aria-hidden="true" className="h-6 w-28 animate-pulse rounded-full bg-muted" />
      ) : (
        <div className="flex items-center gap-2">
          <Badge variant={statusKey === 'healthy' ? 'success' : 'destructive'}>
            {t(`health.status.${statusKey}`)}
          </Badge>
        </div>
      )}

      {checks.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">{t('health.checks')}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {checks.map((check) => (
              <li key={check.name} className="flex items-center justify-between gap-4">
                <span>{check.name}</span>
                <Badge variant={check.status === 'healthy' ? 'success' : 'destructive'}>
                  {check.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button variant="outline" className="self-start" disabled={isFetching} onClick={recheck}>
        <RefreshCw className={isFetching ? 'animate-spin' : undefined} />
        {t('health.recheck')}
      </Button>
    </Card>
  )
}
