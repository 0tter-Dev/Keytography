import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionStore } from '@/features/auth/session-store'
import ptBR from '@/i18n/locales/pt-BR.json'
import { resetSecretClipboard } from '@/lib/secret-clipboard'
import {
  ENTRY,
  ID,
  ME,
  OTHER,
  PASSWORD,
  REFRESHED,
  callsTo,
  detailHandler,
  listItem,
  renderVault,
  signInForTest,
  stubApi,
} from './vault-test-support'
import { PasswordInput } from './PasswordInput'
import { REVEAL_MS } from './use-reveal'
import { SecretValue } from './SecretValue'

const { vault } = ptBR

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'clipboard')
  resetSecretClipboard()
})

/** Clipboard simulado com o conteúdo à vista, e a página com foco. */
function installClipboard() {
  const mock = { content: '', writeText: vi.fn(), readText: vi.fn() }
  mock.writeText.mockImplementation(async (text: string) => {
    mock.content = text
  })
  mock.readText.mockImplementation(async () => mock.content)
  Object.defineProperty(navigator, 'clipboard', { value: mock, configurable: true })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  return mock
}

function setTabHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('revelar uma senha é temporário', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    setTabHidden(false)
  })

  it('o prazo para ocultar sozinha é de 30 segundos', () => {
    expect(REVEAL_MS).toBe(30_000)
  })

  it('a senha revelada volta a ocultar depois de 30 s (e não antes)', () => {
    render(<SecretValue label="Senha" value="segredo" />)
    const field = screen.getByLabelText('Senha')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(field).toHaveAttribute('type', 'text')

    act(() => {
      vi.advanceTimersByTime(29_999)
    })
    expect(field).toHaveAttribute('type', 'text')

    act(() => {
      vi.advanceTimersByTime(2)
    })
    expect(field).toHaveAttribute('type', 'password')
  })

  it('oculta ao ocultar a aba do navegador', () => {
    render(<SecretValue label="Senha" value="segredo" />)
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))

    act(() => setTabHidden(true))

    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password')
  })

  it('revelar de novo reinicia o prazo', () => {
    render(<SecretValue label="Senha" value="segredo" />)
    const field = screen.getByLabelText('Senha')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    act(() => {
      vi.advanceTimersByTime(20_000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))

    act(() => {
      vi.advanceTimersByTime(20_000) // 40 s desde a primeira vez, 20 s desde a última
    })
    expect(field).toHaveAttribute('type', 'text')
  })

  it('o campo de senha do formulário também volta a ocultar sozinho', () => {
    render(<PasswordInput aria-label="senha do formulário" />)
    const field = screen.getByLabelText('senha do formulário')
    expect(field).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(field).toHaveAttribute('type', 'text')

    act(() => {
      vi.advanceTimersByTime(30_001)
    })
    expect(field).toHaveAttribute('type', 'password')
  })
})

describe('revelar some ao sair da tela', () => {
  it('revelar, ir à lista e voltar mostra a senha oculta de novo', async () => {
    renderVault(
      {
        'GET /vault/entries': { body: [listItem(ENTRY)] },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar senha' }))
    expect(screen.getByLabelText(vault.form.fields.password)).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('link', { name: vault.detail.back }))
    await userEvent.click(await screen.findByRole('link', { name: /Banco/ }))

    expect(await screen.findByLabelText(vault.form.fields.password)).toHaveAttribute(
      'type',
      'password',
    )
  })
})

describe('copiar para a área de transferência', () => {
  it('copia a senha e o login e avisa quando a limpeza vai acontecer', async () => {
    const clipboard = installClipboard()
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar senha' }))
    expect(clipboard.content).toBe(PASSWORD)
    expect(await screen.findByText(/será limpa em 20 segundos/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Copiar login' }))
    expect(clipboard.content).toBe('ana@banco')
  })

  it('sem clipboard disponível, avisa e não finge que copiou', async () => {
    Reflect.deleteProperty(navigator, 'clipboard')
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Copiar senha' }))

    expect(await screen.findByText(vault.copy.unavailable)).toBeInTheDocument()
    expect(screen.queryByText(/será limpa em/)).not.toBeInTheDocument()
  })

  it('o logout limpa o clipboard pendente na hora', async () => {
    const clipboard = installClipboard()
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar senha' }))
    expect(clipboard.content).toBe(PASSWORD)

    act(() => useSessionStore.getState().signOut())

    await waitFor(() => expect(clipboard.content).toBe(''))
  })

  it('a expiração da sessão também limpa o clipboard pendente', async () => {
    const clipboard = installClipboard()
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar senha' }))

    act(() => useSessionStore.getState().expire())

    await waitFor(() => expect(clipboard.content).toBe(''))
  })
})

describe('nenhum segredo fora da memória da aba', () => {
  it('criar, ver, revelar, copiar, ver o histórico e editar não deixam a senha em storage, URL, título, console nem cache', async () => {
    installClipboard()
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    )
    const { router, client } = renderVault(
      {
        'GET /vault/entries': { body: [listItem(ENTRY)] },
        'POST /vault/entries': { status: 201, body: ENTRY },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`PUT /vault/entries/${ID}`]: { body: ENTRY },
        [`GET /vault/entries/${ID}/history`]: {
          body: [{ id: 'h1', password: 'senha-antiga-secreta', changedAt: '2026-10-01T10:00:00Z' }],
        },
      },
      '/vault/new',
    )
    const leaks = ['senha-antiga-secreta', PASSWORD]
    const expectNoLeak = () => {
      for (const secret of leaks) {
        expect(JSON.stringify(Object.entries(localStorage))).not.toContain(secret)
        expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain(secret)
        expect(router.state.location.pathname + router.state.location.search).not.toContain(secret)
        expect(document.title).not.toContain(secret)
        for (const spy of consoleSpies) {
          expect(JSON.stringify(spy.mock.calls)).not.toContain(secret)
        }
      }
    }

    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), 'Banco')
    await userEvent.type(screen.getByLabelText(vault.form.fields.password), PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))
    await screen.findByRole('heading', { name: 'Banco' })
    expectNoLeak()

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    await userEvent.click(screen.getByRole('button', { name: 'Copiar senha' }))
    await userEvent.click(screen.getByRole('button', { name: vault.detail.showHistory }))
    await screen.findAllByText(/Trocada em/)
    expectNoLeak()

    await userEvent.click(screen.getByRole('link', { name: vault.detail.edit }))
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))
    await screen.findByRole('heading', { name: 'Banco' })
    expectNoLeak()

    await userEvent.click(screen.getByRole('link', { name: vault.detail.back }))
    await screen.findByRole('link', { name: /Banco/ })

    // Saiu da tela: nada com senha resta no cache de consultas nem no de mutações.
    await waitFor(() => {
      expect(client.getQueryCache().findAll({ queryKey: ['vault', 'entry'] })).toHaveLength(0)
      expect(client.getQueryCache().findAll({ queryKey: ['vault', 'history'] })).toHaveLength(0)
    })
    for (const secret of leaks) {
      expect(
        JSON.stringify(
          client
            .getQueryCache()
            .getAll()
            .map((query) => query.state.data),
        ),
      ).not.toContain(secret)
      expect(
        JSON.stringify(
          client
            .getMutationCache()
            .getAll()
            .map((mutation) => mutation.state.data),
        ),
      ).not.toContain(secret)
    }
  })

  it('o detalhe e o histórico saem do cache assim que a tela é deixada (gcTime 0)', async () => {
    const { client } = renderVault(
      {
        'GET /vault/entries': { body: [listItem(ENTRY)] },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID}/history`]: { body: [] },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.showHistory }))
    await screen.findByText(vault.history.empty)
    expect(client.getQueryCache().find({ queryKey: ['vault', 'entry', ID] })).toBeDefined()

    await userEvent.click(screen.getByRole('link', { name: vault.detail.back }))

    await waitFor(() => {
      expect(client.getQueryCache().find({ queryKey: ['vault', 'entry', ID] })).toBeUndefined()
      expect(client.getQueryCache().find({ queryKey: ['vault', 'history', ID] })).toBeUndefined()
    })
  })

  it('o resultado de criar/editar não fica no cache de mutações (a resposta traz a senha)', async () => {
    const { client } = renderVault(
      {
        'POST /vault/entries': { status: 201, body: ENTRY },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      },
      '/vault/new',
    )
    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), 'Banco')
    await userEvent.type(screen.getByLabelText(vault.form.fields.password), PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))
    await screen.findByRole('heading', { name: 'Banco' })

    expect(
      JSON.stringify(
        client
          .getMutationCache()
          .getAll()
          .map((m) => m.state.data),
      ),
    ).not.toContain(PASSWORD)
  })
})

describe('sessão e conta mudando com segredos na tela', () => {
  it('sessão rejeitada ao salvar: vai ao login, a senha some da tela e não há sucesso nem reenvio', async () => {
    const { calls } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`PUT /vault/entries/${ID}`]: { status: 401 },
        'POST /auth/refresh': { status: 401 },
      },
      `/vault/${ID}/edit`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))

    expect(await screen.findByRole('heading', { name: ptBR.auth.login.title })).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(PASSWORD)
    expect(screen.queryByRole('heading', { name: 'Banco' })).not.toBeInTheDocument()
    expect(callsTo(calls, 'PUT', `/vault/entries/${ID}`)).toHaveLength(1) // não reenviado
  })

  it('cofre sem DEK (401 que persiste depois do refresh): encerra a sessão e avisa a API, sem mostrar a senha', async () => {
    const { calls } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`PUT /vault/entries/${ID}`]: { status: 401 },
        'POST /auth/refresh': REFRESHED('jwt-renovado'),
        'POST /auth/logout': { status: 204 },
      },
      `/vault/${ID}/edit`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))

    expect(await screen.findByText(ptBR.auth.login.sessionExpired)).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(PASSWORD)
    await waitFor(() => expect(callsTo(calls, 'POST', '/auth/logout')).toHaveLength(1))
  })

  it('troca de conta com a tela aberta: a senha revelada sai da tela e a entrada não é reaberta como a outra conta', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar senha' }))
    expect(screen.getByLabelText(vault.form.fields.password)).toHaveValue(PASSWORD)

    act(() => {
      useSessionStore
        .getState()
        .signIn('jwt-da-bia', new Date(Date.now() + 3_600_000).toISOString())
      useSessionStore.getState().setUser(OTHER)
    })

    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(PASSWORD)
  })

  it('chamada recusada pelo cliente por troca de conta: nada sai e o formulário não mostra sucesso', async () => {
    const stub = stubApi({
      'GET /health': { body: { status: 'healthy', checks: [] } },
      'GET /auth/me': { body: OTHER },
      'POST /auth/refresh': REFRESHED('jwt-da-bia'),
      [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      [`PUT /vault/entries/${ID}`]: { body: ENTRY },
    })
    signInForTest('jwt-quase-vencendo', 1_000, {
      id: 'u1',
      login: 'ana',
      email: 'ana@example.com',
      role: 'Member',
    })
    const { renderRoutes } = await import('@/test/render')
    const { routes } = await import('@/app/routes')
    renderRoutes(routes, `/vault/${ID}/edit`)

    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
    expect(document.body.innerHTML).not.toContain(PASSWORD)
    // Nenhuma chamada do cofre saiu com o token antigo, e nenhuma escrita saiu: a recarga depois da
    // troca de conta é feita como a conta nova.
    const vaultCalls = stub.calls.filter((call) => call.path.startsWith('/vault/'))
    expect(
      vaultCalls.every((call) => call.headers.get('Authorization') === 'Bearer jwt-da-bia'),
    ).toBe(true)
    expect(callsTo(stub.calls, 'PUT', `/vault/entries/${ID}`)).toHaveLength(0)
  })
})

describe('renderização segura e formulários', () => {
  const hostile = {
    ...ENTRY,
    title: '<img src=x onerror=alert(1)>',
    login: '<b>negrito</b>',
    additionalFields: { Link: 'javascript:alert(1)', '<i>nome</i>': 'https://exemplo.com/x' },
  }

  it('título, login e campos adicionais saem como TEXTO: sem HTML interpretado e sem link automático', async () => {
    const { container } = renderVault(
      { [`GET /vault/entries/${ID}`]: detailHandler(hostile) },
      `/vault/${ID}`,
    )

    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(screen.getByText('<b>negrito</b>')).toBeInTheDocument()
    expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(
      container.querySelector('dd a, a[href^="javascript"], a[href^="https://exemplo"]'),
    ).toBeNull()
  })

  it('os campos do formulário não pedem preenchimento nem salvamento de credenciais pelo navegador', async () => {
    renderVault({}, '/vault/new')
    await userEvent.click(await screen.findByRole('button', { name: vault.form.addField }))

    expect(screen.getByLabelText(vault.form.fields.title)).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByLabelText(vault.form.fields.login)).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByLabelText(vault.form.fields.password)).toHaveAttribute(
      'autocomplete',
      'new-password',
    )
    expect(screen.getByLabelText(vault.form.fields.fieldName)).toHaveAttribute(
      'autocomplete',
      'off',
    )
    expect(screen.getByLabelText(vault.form.fields.fieldValue)).toHaveAttribute(
      'autocomplete',
      'off',
    )
  })

  it('a senha mostrada no detalhe e no histórico também não é oferecida ao preenchimento automático', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)

    expect(await screen.findByLabelText(vault.form.fields.password)).toHaveAttribute(
      'autocomplete',
      'off',
    )
  })
})

describe('o resultado das mutações não carrega a senha', () => {
  const detailWithPassword = { ...ENTRY, password: 'senha-que-nao-pode-ficar' }

  it('criar e editar devolvem só o id (a resposta do servidor traz a senha em texto)', async () => {
    stubApi({
      'POST /vault/entries': { status: 201, body: detailWithPassword },
      [`PUT /vault/entries/${ID}`]: { body: detailWithPassword },
    })
    signInForTest('jwt', undefined, ME)
    const { createEntry, updateEntry } = await import('./vault-api')
    const input = { title: 'Banco', login: null, password: 'x', additionalFields: null }

    expect(await createEntry(input)).toEqual({ id: ID })
    expect(await updateEntry(ID, input)).toEqual({ id: ID })
  })

  it('as mutações não ficam retidas no cache depois de terminar (gcTime 0)', async () => {
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    const { renderHook } = await import('@testing-library/react')
    const { useCreateEntry } = await import('./vault-queries')
    stubApi({ 'POST /vault/entries': { status: 201, body: detailWithPassword } })
    signInForTest('jwt', undefined, ME)
    const client = new QueryClient()
    const { result } = renderHook(() => useCreateEntry(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    })

    await act(async () => {
      await result.current.mutateAsync({
        title: 'Banco',
        login: null,
        password: 'x',
        additionalFields: null,
      })
    })

    expect(
      client
        .getMutationCache()
        .getAll()
        .every((mutation) => mutation.gcTime === 0),
    ).toBe(true)
  })
})
