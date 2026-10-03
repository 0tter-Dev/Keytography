import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { AppearanceController } from '@/features/theme/AppearanceController'

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AppearanceController />
      {children}
      <Toaster />
    </QueryClientProvider>
  )
}
