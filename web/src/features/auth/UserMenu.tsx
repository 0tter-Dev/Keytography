import { LogOut } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { logoutSession } from './session'
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
  const { data: user } = useCurrentUser()
  const [leaving, setLeaving] = useState(false)

  async function logout() {
    setLeaving(true)
    // Revoga a sessão na API e só então limpa o estado local (o cache de consultas é limpo pelo
    // `SessionController`). Se a API não responder, o estado local é limpo mesmo assim.
    const result = await logoutSession()
    if (result === 'unreachable') {
      toast.warning(t('auth.logoutUnreachable'))
    }
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
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('nav.logout')}
        disabled={leaving}
        onClick={logout}
      >
        <LogOut />
      </Button>
    </div>
  )
}
