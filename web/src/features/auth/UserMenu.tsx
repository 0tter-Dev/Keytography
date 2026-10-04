import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSessionStore } from './session-store'
import { useCurrentUser } from './use-current-user'

type UserMenuProps = {
  /** Sidebar recolhida: só o botão de sair, com o login em `sr-only`. */
  collapsed?: boolean
  onNavigate?: () => void
}

/** Usuário logado e botão de sair, no rodapé da navegação. */
export function UserMenu({ collapsed = false, onNavigate }: UserMenuProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const signOut = useSessionStore((state) => state.signOut)
  const { data: user } = useCurrentUser()

  function logout() {
    // O cache de consultas é limpo pelo `SessionController`, em qualquer fim de sessão.
    signOut()
    onNavigate?.()
    navigate('/login', { replace: true })
  }

  return (
    <div className={cn('flex items-center gap-2', collapsed ? 'justify-center' : 'px-3')}>
      {user && (
        <span
          className={cn('min-w-0 flex-1 truncate text-sm font-medium', collapsed && 'sr-only')}
          title={user.email}
        >
          {user.login}
        </span>
      )}
      <Button variant="ghost" size="icon" aria-label={t('nav.logout')} onClick={logout}>
        <LogOut />
      </Button>
    </div>
  )
}
