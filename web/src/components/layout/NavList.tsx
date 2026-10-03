import { Home, Settings, Vault, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type NavItem = {
  key: 'home' | 'vault' | 'settings'
  icon: LucideIcon
  /** `undefined` = ainda sem tela (placeholder até os planos seguintes). */
  to?: string
}

const NAV_ITEMS: NavItem[] = [
  { key: 'home', icon: Home, to: '/' },
  { key: 'vault', icon: Vault },
  { key: 'settings', icon: Settings },
]

const itemClasses =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors'

type NavListProps = {
  /** Esconde os rótulos visualmente (sidebar recolhida) sem remover do leitor de tela. */
  collapsed?: boolean
  onNavigate?: () => void
}

export function NavList({ collapsed = false, onNavigate }: NavListProps) {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('nav.label')}>
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map(({ key, icon: Icon, to }) => {
          const label = <span className={cn(collapsed && 'sr-only')}>{t(`nav.${key}`)}</span>

          return (
            <li key={key}>
              {to ? (
                <NavLink
                  to={to}
                  end
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      itemClasses,
                      isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </NavLink>
              ) : (
                <span
                  aria-disabled="true"
                  title={t('nav.comingSoon')}
                  className={cn(itemClasses, 'cursor-not-allowed text-muted-foreground')}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
