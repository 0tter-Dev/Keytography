import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type HealthReport = components['schemas']['HealthResponse']

export type HealthResult = { reachable: true; report: HealthReport } | { reachable: false }

async function fetchHealth(): Promise<HealthResult> {
  try {
    // `/health` responde 200 (saudável) ou 503 (com falha); ambos trazem o mesmo DTO.
    const { data, error } = await api.GET('/health')
    const report = data ?? error
    return report ? { reachable: true, report } : { reachable: false }
  } catch {
    return { reachable: false }
  }
}

export function useHealth() {
  return useQuery({ queryKey: ['health'], queryFn: fetchHealth })
}
