import { ChevronsLeft, ChevronsRight, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { DevAppearanceControls } from '@/features/theme/DevAppearanceControls'
import { cn } from '@/lib/utils'
import { Emblem, Wordmark } from './Brand'
import { NavList } from './NavList'

/**
 * Casca da aplicação: sidebar recolhível no desktop (md+) e barra superior com menu
 * hambúrguer + drawer no mobile.
 */
export function AppShell() {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3 md:hidden">
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('nav.openMenu')}>
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent aria-describedby={undefined}>
            <div className="flex items-center justify-between">
              <SheetTitle asChild>
                <span>
                  <Wordmark />
                </span>
              </SheetTitle>
              <SheetClose asChild>
                <Button variant="ghost" size="icon" aria-label={t('nav.closeMenu')}>
                  <X />
                </Button>
              </SheetClose>
            </div>
            <SheetDescription className="sr-only">{t('app.tagline')}</SheetDescription>
            <NavList onNavigate={() => setDrawerOpen(false)} />
          </SheetContent>
        </Sheet>
        <Wordmark />
      </header>

      <aside
        className={cn(
          'hidden shrink-0 flex-col gap-4 border-r border-border bg-surface p-3 transition-[width] duration-200 md:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className={cn('flex items-center px-1', collapsed ? 'justify-center' : 'px-3')}>
          {collapsed ? <Emblem /> : <Wordmark />}
        </div>
        <NavList collapsed={collapsed} />
        <Button
          variant="ghost"
          size="icon"
          className="mt-auto self-end"
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
        </Button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-6 p-4 md:p-8">
        <Outlet />
        {import.meta.env.DEV && <DevAppearanceControls />}
      </main>
    </div>
  )
}
