import type { RouteObject } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { AuthLayout } from '@/features/auth/AuthLayout'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { GuestOnly, RequireAuth } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage'
import { HealthPage } from '@/features/health/HealthPage'

/** Árvore de rotas; separada do roteador para os testes poderem renderizá-la em memória. */
export const routes: RouteObject[] = [
  {
    element: <AuthLayout />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Token chega por e-mail; funcionam com ou sem sessão.
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
    ],
  },
  {
    // Tudo que não é autenticação exige sessão válida.
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppShell />,
        children: [{ index: true, element: <HealthPage /> }],
      },
    ],
  },
]
