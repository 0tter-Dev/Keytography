import { createBrowserRouter } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { HealthPage } from '@/features/health/HealthPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [{ index: true, element: <HealthPage /> }],
  },
])
