import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes } from '@/app/routes'
import ptBR from '@/i18n/locales/pt-BR.json'
import { renderRoutes, signInForTest, stubApi } from '@/test/render'
import { RequireAuth } from './guards'
import { useSessionStore } from './session-store'

const { auth } = ptBR
const ME = { id: 'u1', login: 'ana', email: 'ana@example.com', role: 'Member' }
const HEALTH = { 'GET /health': { body: { status: 'healthy', checks: [] } } }
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString()

afterEach(() => {
  vi.unstubAllGlobals()
})

async function fill(label: string, value: string) {
  await userEvent.type(screen.getByLabelText(label), value)
}

describe('rotas protegidas e sessão', () => {
  it('sem sessão, uma rota protegida redireciona para o login', async () => {
    stubApi({})
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
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

  it('JWT vencido no storage não vale como sessão', async () => {
    useSessionStore.getState().signIn('jwt', new Date(Date.now() - 1000).toISOString())
    stubApi({})
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
  })

  it('uma chamada autenticada com 401 leva ao login, avisando que a sessão expirou', async () => {
    signInForTest()
    stubApi({ ...HEALTH, 'GET /auth/me': { status: 401 } })
    renderRoutes(routes, '/')

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(screen.getByText(auth.login.sessionExpired)).toBeInTheDocument()
  })

  it('a sessão termina sozinha no instante em que o JWT vence', async () => {
    signInForTest('jwt', 150)
    stubApi({ ...HEALTH, 'GET /auth/me': { body: ME } })
    renderRoutes(routes, '/')
    expect(await screen.findByText(ptBR.health.title)).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
  })

  it('logout limpa a sessão local e torna as rotas protegidas inacessíveis', async () => {
    signInForTest()
    stubApi({ ...HEALTH, 'GET /auth/me': { body: ME } })
    const { router, client } = renderRoutes(routes, '/')
    await screen.findByText('ana')
    expect(client.getQueryData(['me', 'jwt-de-teste'])).toBeDefined()

    await userEvent.click(screen.getByRole('button', { name: ptBR.nav.logout }))

    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
    expect(useSessionStore.getState().token).toBeNull()
    expect(client.getQueryData(['me', 'jwt-de-teste'])).toBeUndefined()
    expect(sessionStorage.getItem('keytography.session')).not.toContain('jwt-de-teste')
    expect(screen.queryByText(auth.login.sessionExpired)).not.toBeInTheDocument()

    await act(() => router.navigate('/'))
    expect(await screen.findByRole('heading', { name: auth.login.title })).toBeInTheDocument()
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
