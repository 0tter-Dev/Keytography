import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import { renderRoutes, signInForTest, stubApi } from '@/test/render'
import { AppShell } from './AppShell'

function renderShell() {
  return renderRoutes([
    {
      path: '/',
      element: <AppShell />,
      children: [{ index: true, element: <p>conteúdo da página</p> }],
    },
    { path: '/login', element: <p>tela de login</p> },
  ])
}

beforeEach(() => {
  signInForTest()
  stubApi({
    'GET /auth/me': {
      body: { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' },
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppShell', () => {
  it('renderiza a navegação lateral e o conteúdo da rota', () => {
    renderShell()

    const nav = screen.getByRole('navigation', { name: ptBR.nav.label })
    expect(within(nav).getByRole('link', { name: ptBR.nav.home })).toHaveAttribute('href', '/')
    expect(screen.getByText('conteúdo da página')).toBeInTheDocument()
  })

  it('marca os itens sem tela ainda como placeholders desabilitados (não são links)', () => {
    renderShell()

    expect(screen.queryByRole('link', { name: ptBR.nav.vault })).not.toBeInTheDocument()
    expect(screen.getByText(ptBR.nav.vault).closest('[aria-disabled="true"]')).not.toBeNull()
  })

  it('recolhe e expande a sidebar', async () => {
    renderShell()

    await userEvent.click(screen.getByRole('button', { name: ptBR.nav.collapse }))

    expect(screen.getByRole('button', { name: ptBR.nav.expand })).toBeInTheDocument()
  })

  it('abre o drawer de navegação pelo botão hambúrguer e o fecha ao navegar', async () => {
    renderShell()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: ptBR.nav.openMenu }))

    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('link', { name: ptBR.nav.home }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mostra o usuário logado na navegação', async () => {
    renderShell()

    expect(await screen.findByText('ana')).toBeInTheDocument()
  })
})
