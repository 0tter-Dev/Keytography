import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { routes } from '@/app/routes'
import ptBR from '@/i18n/locales/pt-BR.json'
import { REFRESHED, signInForTest, stubApi } from '@/test/api-stub'
import { renderRoutes } from '@/test/render'
import { RequireAuth } from './guards'
import { MIN_RENEW_DELAY_MS, REFRESH_LEAD_MS } from './session'
import { useSessionStore } from './session-store'

const { auth } = ptBR
const ME = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }
const HEALTH = { 'GET /health': { body: { status: 'healthy', checks: [] } } }
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Deixa as promessas e os temporizadores falsos (já vencidos) correrem até o fim. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

async function fill(label: string, value: string) {
  await userEvent.type(screen.getByLabelText(label), value)
}

/** Tela de teste que faz uma chamada autenticada (o shell só chama endpoints sem renovação). */
function VaultProbe() {
  const { data } = useQuery({
    queryKey: ['cofre'],
    queryFn: async () => {
      const { data, response } = await api.GET('/vault/entries')
      if (!data) {
        throw new Error(`falhou (${response.status})`)
      }
      return data
    },
  })
  return <p>{data ? 'cofre carregado' : 'carregando cofre'}</p>
}

const withProbe = [
  ...routes,
  { element: <RequireAuth />, children: [{ path: '/probe', element: <VaultProbe /> }] },
]

describe('rotas protegidas e sessão', () => {
  it('sem sessão (e sem cookie de refresh), uma rota protegida leva ao login, sem aviso de expiração', async () => {
    stubApi({ 'POST /auth/refresh': { status: 401 } })
    renderRoutes(routes, '/', { restored: false })

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(screen.queryByText(auth.login.sessionExpired)).not.toBeInTheDocument()
  })

  it('com sessão válida, a rota protegida abre e mostra o usuário', async () => {
    signInForTest()
    stubApi({ ...HEALTH, 'GET /auth/me': { body: ME } })
    renderRoutes(routes, '/')

    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
    expect(await screen.findByText('ana')).toBeInTheDocument()
  })

  it('quem já tem sessão não vê o login: vai para o início', async () => {
    signInForTest()
    stubApi({ ...HEALTH, 'GET /auth/me': { body: ME } })
    renderRoutes(routes, '/login')

    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
  })

  it('access token vencido no store não vale como sessão', async () => {
    useSessionStore.getState().signIn('jwt', new Date(Date.now() - 1000).toISOString())
    stubApi({})
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
  })

  it('uma chamada autenticada com 401 cujo refresh também é rejeitado leva ao login, avisando que a sessão expirou', async () => {
    signInForTest('velho', undefined, ME)
    stubApi({ 'GET /vault/entries': { status: 401 }, 'POST /auth/refresh': { status: 401 } })
    renderRoutes(withProbe, '/probe')

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(screen.getByText(auth.login.sessionExpired)).toBeInTheDocument()
  })

  it('a sessão se renova sozinha antes de o access token vencer, sem o usuário perceber', async () => {
    vi.useFakeTimers()
    // A renovação é agendada para MIN_RENEW_DELAY_MS depois de abrir (piso do atraso).
    signInForTest('curto', REFRESH_LEAD_MS + MIN_RENEW_DELAY_MS + 300, ME)
    const { calls } = stubApi({
      ...HEALTH,
      'GET /auth/me': { body: ME },
      'POST /auth/refresh': REFRESHED('renovado'),
    })
    renderRoutes(routes, '/')
    await advance(0)
    expect(screen.getByText(ptBR.health.title)).toBeInTheDocument()

    await advance(MIN_RENEW_DELAY_MS + 400)

    expect(useSessionStore.getState().token).toBe('renovado')
    expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(1)
    expect(screen.getByText(ptBR.health.title)).toBeInTheDocument() // continua na mesma tela
    expect(screen.queryByText(auth.login.sessionExpired)).not.toBeInTheDocument()
  })

  it('se a API não responde até o vencimento, a sessão termina em vez de seguir com token morto', async () => {
    signInForTest('curto', 200, ME)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(screen.getByText(auth.login.sessionExpired)).toBeInTheDocument()
  })

  it('no vencimento, a rede de segurança espera um refresh em andamento em vez de derrubar a sessão', async () => {
    vi.useFakeTimers()
    // Vence em 40 s; a renovação começa em 10 s e só termina depois do vencimento (API lenta,
    // ou computador que voltou de suspensão).
    signInForTest('curto', 40_000, ME)
    let finishRefresh: () => void = () => {}
    const slowRefresh = new Promise<void>((resolve) => {
      finishRefresh = resolve
    })
    stubApi({
      'GET /auth/me': { body: ME },
      'POST /auth/refresh': async () => {
        await slowRefresh
        return REFRESHED('renovado')
      },
    })
    const guarded = [
      { path: '/login', element: <p>tela de login</p> },
      { element: <RequireAuth />, children: [{ path: '/', element: <p>area protegida</p> }] },
    ]
    renderRoutes(guarded, '/')

    await advance(41_000) // passou do vencimento, com o refresh ainda pendente
    expect(screen.getByText('area protegida')).toBeInTheDocument()
    expect(useSessionStore.getState().expired).toBe(false)

    finishRefresh()
    await advance(0)

    expect(useSessionStore.getState().token).toBe('renovado')
    expect(screen.getByText('area protegida')).toBeInTheDocument()
    expect(screen.queryByText('tela de login')).not.toBeInTheDocument()
  })

  it('logout chama a API, limpa a sessão local e torna as rotas protegidas inacessíveis', async () => {
    signInForTest('jwt-de-teste')
    const { calls } = stubApi({
      ...HEALTH,
      'GET /auth/me': { body: ME },
      'POST /auth/logout': { status: 204 },
      'POST /auth/refresh': { status: 401 },
    })
    const { router } = renderRoutes(routes, '/')
    await screen.findByText('ana')

    await userEvent.click(screen.getByRole('button', { name: ptBR.nav.logout }))

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    const logout = calls.find((call) => call.path === '/auth/logout')
    expect(logout?.credentials).toBe('include')
    expect(logout?.headers.get('Authorization')).toBe('Bearer jwt-de-teste')
    expect(useSessionStore.getState()).toMatchObject({ token: null, user: null })
    expect(screen.queryByText(auth.login.sessionExpired)).not.toBeInTheDocument()

    await act(() => router.navigate('/'))
    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
  })

  it('logout com a API inacessível limpa a sessão local mesmo assim e avisa o usuário', async () => {
    signInForTest('jwt-de-teste', undefined, ME)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderRoutes(routes, '/')
    await screen.findByText('ana')

    await userEvent.click(screen.getByRole('button', { name: ptBR.nav.logout }))

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(useSessionStore.getState()).toMatchObject({ token: null, user: null })
    expect(await screen.findByText(auth.logoutUnreachable)).toBeInTheDocument()
  })
})

describe('restauração da sessão ao abrir a aplicação', () => {
  it('com cookie válido, recarregar a página (F5) entra direto, sem passar pela tela de login', async () => {
    const { calls } = stubApi({
      ...HEALTH,
      'POST /auth/refresh': REFRESHED('restaurado'),
      'GET /auth/me': { body: ME },
    })
    renderRoutes(routes, '/', { restored: false })

    expect(screen.getByRole('status')).toHaveTextContent(auth.restoring) // sem piscar o login
    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: auth.login.title })).not.toBeInTheDocument()
    expect(useSessionStore.getState().token).toBe('restaurado')
    expect(calls.find((call) => call.path === '/auth/refresh')?.credentials).toBe('include')
    expect(calls.filter((call) => call.path === '/auth/refresh')).toHaveLength(1)
  })

  it('o login também é pulado quando se abre diretamente /login com cookie válido', async () => {
    stubApi({
      ...HEALTH,
      'POST /auth/refresh': REFRESHED('restaurado'),
      'GET /auth/me': { body: ME },
    })
    renderRoutes(routes, '/login', { restored: false })

    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
  })

  it('sem cookie (refresh 401), vai ao login sem aviso de sessão expirada', async () => {
    stubApi({ 'POST /auth/refresh': { status: 401 } })
    renderRoutes(routes, '/', { restored: false })

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(screen.queryByText(auth.login.sessionExpired)).not.toBeInTheDocument()
  })

  it('o access token não aparece em localStorage nem em sessionStorage em nenhum momento', async () => {
    stubApi({
      ...HEALTH,
      'POST /auth/refresh': REFRESHED('token-que-nao-pode-vazar'),
      'GET /auth/me': { body: ME },
    })
    renderRoutes(routes, '/', { restored: false })
    await screen.findByText('ana')

    for (const storage of [localStorage, sessionStorage]) {
      expect(JSON.stringify(Object.entries(storage))).not.toContain('token-que-nao-pode-vazar')
    }
    expect(useSessionStore.getState().token).toBe('token-que-nao-pode-vazar')
  })
})

describe('troca de conta entre abas', () => {
  it('quando outra conta entrou no navegador, avisa, volta ao início e mostra só a conta atual', async () => {
    const BIA = { id: 'u2', login: 'bia', email: 'bia@example.com', role: 'Member' }
    signInForTest('da-ana', undefined, ME)
    stubApi({
      'GET /vault/entries': (call) =>
        call.headers.get('Authorization') === 'Bearer da-ana' ? { status: 401 } : { body: [] },
      'POST /auth/refresh': REFRESHED('da-bia'),
      'GET /auth/me': { body: BIA },
      ...HEALTH,
    })
    const { router, client } = renderRoutes(withProbe, '/probe')
    client.setQueryData(['dados-da-ana'], { segredo: true })

    expect(await screen.findByText(auth.accountChanged)).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(await screen.findByText('bia')).toBeInTheDocument()
    expect(screen.queryByText('ana')).not.toBeInTheDocument()
    expect(client.getQueryData(['dados-da-ana'])).toBeUndefined() // nada da conta anterior no cache
    expect(useSessionStore.getState().accountChanged).toBe(false) // aviso consumido
  })

  it('quando a mesma conta entra em outra aba, nada é avisado', async () => {
    signInForTest('velho', undefined, ME)
    stubApi({
      'GET /vault/entries': (call) =>
        call.headers.get('Authorization') === 'Bearer velho' ? { status: 401 } : { body: [] },
      'POST /auth/refresh': REFRESHED('novo'),
      'GET /auth/me': { body: ME },
    })
    renderRoutes(withProbe, '/probe')

    expect(await screen.findByText('cofre carregado')).toBeInTheDocument()
    expect(screen.queryByText(auth.accountChanged)).not.toBeInTheDocument()
  })
})

describe('LoginPage', () => {
  it('entra com credenciais válidas, guarda a sessão e vai para o início', async () => {
    const { calls } = stubApi({
      ...HEALTH,
      'POST /auth/login': { body: { token: 'jwt-novo', expiresAt: inOneHour() } },
      'GET /auth/me': { body: ME },
    })
    renderRoutes(routes, '/login')

    await fill(auth.fields.login, 'ana')
    await fill(auth.fields.password, 'senha-forte-123')
    await userEvent.click(screen.getByRole('button', { name: auth.login.submit }))

    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()
    expect(calls.find((call) => call.path === '/auth/login')?.body).toEqual({
      login: 'ana',
      password: 'senha-forte-123',
    })
    expect(calls.find((call) => call.path === '/auth/login')?.credentials).toBe('include')
    expect(useSessionStore.getState().token).toBe('jwt-novo')
    await waitFor(() =>
      expect(calls.find((call) => call.path === '/auth/me')?.headers.get('Authorization')).toBe(
        'Bearer jwt-novo',
      ),
    )
  })

  it('depois de entrar, volta ao destino protegido que o usuário tentou abrir', async () => {
    stubApi({
      ...HEALTH,
      'POST /auth/login': { body: { token: 'jwt-novo', expiresAt: inOneHour() } },
      'GET /auth/me': { body: ME },
    })
    const withVault = [
      ...routes,
      { element: <RequireAuth />, children: [{ path: '/vault', element: <p>tela do cofre</p> }] },
    ]
    renderRoutes(withVault, '/vault?aba=lixeira')
    await screen.findByRole('heading', { name: auth.login.title })

    await fill(auth.fields.login, 'ana')
    await fill(auth.fields.password, 'senha-forte-123')
    await userEvent.click(screen.getByRole('button', { name: auth.login.submit }))

    expect(await screen.findByText('tela do cofre')).toBeInTheDocument()
    expect(screen.queryByText(ptBR.health.title)).not.toBeInTheDocument()
  })

  it('o redirecionamento ao login guarda o destino original', async () => {
    stubApi({})
    const { router } = renderRoutes(routes, '/')
    await screen.findByRole('heading', { name: auth.login.title })
    expect(router.state.location.state).toEqual({ from: '/' })
  })

  it('mostra a mesma mensagem genérica para credenciais inválidas, sem dizer o que errou', async () => {
    stubApi({ 'POST /auth/login': { status: 401 } })
    renderRoutes(routes, '/login')

    await fill(auth.fields.login, 'ana')
    await fill(auth.fields.password, 'senha-errada')
    await userEvent.click(screen.getByRole('button', { name: auth.login.submit }))

    expect(await screen.findByText(auth.errors.invalidCredentials)).toBeInTheDocument()
    expect(auth.errors.invalidCredentials).not.toMatch(/senha incorreta|login inexistente/i)
    expect(useSessionStore.getState().expired).toBe(false)
  })

  it('mostra uma mensagem específica quando o e-mail ainda não foi verificado', async () => {
    stubApi({ 'POST /auth/login': { status: 403, body: { title: 'E-mail não verificado.' } } })
    renderRoutes(routes, '/login')

    await fill(auth.fields.login, 'ana')
    await fill(auth.fields.password, 'senha-forte-123')
    await userEvent.click(screen.getByRole('button', { name: auth.login.submit }))

    expect(await screen.findByText(auth.errors.emailNotVerified)).toBeInTheDocument()
    expect(screen.queryByText(auth.errors.invalidCredentials)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: auth.login.verifyEmailLink })).toHaveAttribute(
      'href',
      '/verify-email',
    )
  })

  it('valida o formulário no cliente sem chamar a API', async () => {
    const { fetchMock } = stubApi({})
    renderRoutes(routes, '/login')

    await userEvent.click(screen.getByRole('button', { name: auth.login.submit }))

    expect(await screen.findByText(auth.validation.loginRequired)).toBeInTheDocument()
    expect(screen.getByText(auth.validation.passwordRequired)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('indica falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    renderRoutes(routes, '/login')

    await fill(auth.fields.login, 'ana')
    await fill(auth.fields.password, 'senha-forte-123')
    await userEvent.click(screen.getByRole('button', { name: auth.login.submit }))

    expect(await screen.findByText(auth.errors.network)).toBeInTheDocument()
  })
})

describe('RegisterPage', () => {
  async function fillRegister(overrides: Partial<Record<'password' | 'confirm', string>> = {}) {
    await fill(auth.fields.login, 'ana')
    await fill(auth.fields.email, 'ana@example.com')
    await fill(auth.fields.password, overrides.password ?? 'senha-forte-123')
    await fill(auth.fields.confirmPassword, overrides.confirm ?? 'senha-forte-123')
  }

  it('registra e leva para a verificação de e-mail', async () => {
    const { calls } = stubApi({
      'POST /auth/register': {
        status: 201,
        body: {
          id: 'u1',
          login: 'ana',
          email: 'ana@example.com',
          role: 'Admin',
          emailVerified: false,
        },
      },
    })
    renderRoutes(routes, '/register')

    await fillRegister()
    await userEvent.click(screen.getByRole('button', { name: auth.register.submit }))

    expect(await screen.findByRole('heading', { name: auth.verifyEmail.title })).toBeInTheDocument()
    expect(calls[0]?.body).toEqual({
      login: 'ana',
      email: 'ana@example.com',
      password: 'senha-forte-123',
    })
  })

  it('espelha as regras da API: senha curta, e-mail sem "@" e confirmação divergente', async () => {
    const { fetchMock } = stubApi({})
    renderRoutes(routes, '/register')

    await fill(auth.fields.login, 'ana')
    await fill(auth.fields.email, 'sem-arroba')
    await fill(auth.fields.password, 'curta')
    await fill(auth.fields.confirmPassword, 'outra')
    await userEvent.click(screen.getByRole('button', { name: auth.register.submit }))

    expect(await screen.findByText(auth.validation.emailInvalid)).toBeInTheDocument()
    expect(
      screen.getByText(auth.validation.passwordMin.replace('{{min}}', '8')),
    ).toBeInTheDocument()
    expect(screen.getByText(auth.validation.passwordMismatch)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('avisa quando login ou e-mail já estão cadastrados', async () => {
    stubApi({ 'POST /auth/register': { status: 409, body: { message: 'já existe' } } })
    renderRoutes(routes, '/register')

    await fillRegister()
    await userEvent.click(screen.getByRole('button', { name: auth.register.submit }))

    expect(await screen.findByText(auth.errors.conflict)).toBeInTheDocument()
  })
})

describe('VerifyEmailPage', () => {
  it('verifica o e-mail com o token e leva ao login', async () => {
    const { calls } = stubApi({ 'POST /auth/verify-email': { body: { message: 'ok' } } })
    renderRoutes(routes, '/verify-email')

    await fill(auth.fields.verificationToken, 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: auth.verifyEmail.submit }))

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(calls[0]?.body).toEqual({ token: 'ABC123' })
  })

  it('explica token inválido ou expirado', async () => {
    stubApi({ 'POST /auth/verify-email': { status: 400, body: { message: 'inválido' } } })
    renderRoutes(routes, '/verify-email')

    await fill(auth.fields.verificationToken, 'errado')
    await userEvent.click(screen.getByRole('button', { name: auth.verifyEmail.submit }))

    expect(await screen.findByText(auth.errors.invalidToken)).toBeInTheDocument()
  })

  it('exige o token', async () => {
    const { fetchMock } = stubApi({})
    renderRoutes(routes, '/verify-email')

    await userEvent.click(screen.getByRole('button', { name: auth.verifyEmail.submit }))

    expect(await screen.findByText(auth.validation.tokenRequired)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ForgotPasswordPage', () => {
  it('pede o token e mostra a mesma confirmação, sem revelar se o e-mail existe', async () => {
    const { calls } = stubApi({ 'POST /auth/forgot-password': { body: { message: 'x' } } })
    renderRoutes(routes, '/forgot-password')

    await fill(auth.fields.email, 'ana@example.com')
    await userEvent.click(screen.getByRole('button', { name: auth.forgotPassword.submit }))

    expect(await screen.findByText(auth.forgotPassword.sent)).toBeInTheDocument()
    expect(calls[0]?.body).toEqual({ email: 'ana@example.com' })
    expect(screen.getByRole('link', { name: auth.forgotPassword.haveToken })).toHaveAttribute(
      'href',
      '/reset-password',
    )
  })

  it('um novo envio que falha não mantém o aviso de sucesso do envio anterior', async () => {
    let attempt = 0
    stubApi({
      'POST /auth/forgot-password': () =>
        ++attempt === 1 ? { body: { message: 'x' } } : { status: 500 },
    })
    renderRoutes(routes, '/forgot-password')
    await fill(auth.fields.email, 'ana@example.com')
    await userEvent.click(screen.getByRole('button', { name: auth.forgotPassword.submit }))
    expect(await screen.findByText(auth.forgotPassword.sent)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: auth.forgotPassword.submit }))

    expect(await screen.findByText(auth.errors.unknown)).toBeInTheDocument()
    expect(screen.queryByText(auth.forgotPassword.sent)).not.toBeInTheDocument()
  })

  it('valida o e-mail no cliente', async () => {
    const { fetchMock } = stubApi({})
    renderRoutes(routes, '/forgot-password')

    await fill(auth.fields.email, 'sem-arroba')
    await userEvent.click(screen.getByRole('button', { name: auth.forgotPassword.submit }))

    expect(await screen.findByText(auth.validation.emailInvalid)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('ResetPasswordPage', () => {
  it('redefine a senha com o token e leva ao login', async () => {
    const { calls } = stubApi({ 'POST /auth/reset-password': { body: { message: 'ok' } } })
    renderRoutes(routes, '/reset-password')

    await fill(auth.fields.resetToken, 'TOKEN')
    await fill(auth.fields.newPassword, 'nova-senha-123')
    await fill(auth.fields.confirmPassword, 'nova-senha-123')
    await userEvent.click(screen.getByRole('button', { name: auth.resetPassword.submit }))

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(calls[0]?.body).toEqual({ token: 'TOKEN', newPassword: 'nova-senha-123' })
  })

  it('valida senha mínima e confirmação antes de chamar a API', async () => {
    const { fetchMock } = stubApi({})
    renderRoutes(routes, '/reset-password')

    await fill(auth.fields.resetToken, 'TOKEN')
    await fill(auth.fields.newPassword, 'curta')
    await fill(auth.fields.confirmPassword, 'diferente')
    await userEvent.click(screen.getByRole('button', { name: auth.resetPassword.submit }))

    expect(
      await screen.findByText(auth.validation.passwordMin.replace('{{min}}', '8')),
    ).toBeInTheDocument()
    expect(screen.getByText(auth.validation.passwordMismatch)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explica token inválido ou expirado', async () => {
    stubApi({ 'POST /auth/reset-password': { status: 400, body: { message: 'inválido' } } })
    renderRoutes(routes, '/reset-password')

    await fill(auth.fields.resetToken, 'TOKEN')
    await fill(auth.fields.newPassword, 'nova-senha-123')
    await fill(auth.fields.confirmPassword, 'nova-senha-123')
    await userEvent.click(screen.getByRole('button', { name: auth.resetPassword.submit }))

    expect(await screen.findByText(auth.errors.invalidToken)).toBeInTheDocument()
  })
})
