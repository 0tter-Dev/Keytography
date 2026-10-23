import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/features/auth/session-store'
import ptBR from '@/i18n/locales/pt-BR.json'
import {
  ENTRY,
  ID,
  PASSWORD,
  callsTo,
  detailHandler,
  listItem,
  renderVault,
} from './vault-test-support'

const { vault } = ptBR

const PASSED = { score: 100, passed: true }

/** Senha longa e variada: todos os critérios atendem. */
const STRONG = {
  ...ENTRY,
  passwordScore: 100,
  passwordScoreDetail: { length: PASSED, entropy: PASSED, reuse: PASSED, complexity: PASSED },
}

/** Os valores reais que a API devolveu para `abc` na verificação manual (2026-10-23). */
const SHORT = {
  ...ENTRY,
  passwordScore: 59,
  passwordScoreDetail: {
    length: { score: 18.75, passed: false },
    entropy: { score: 17.6, passed: false },
    reuse: PASSED,
    complexity: PASSED,
  },
}

/** E para a mesma senha forte em outra entrada: só o reuso reprova, e a média ainda dá 75. */
const REPEATED = {
  ...ENTRY,
  passwordScore: 75,
  passwordScoreDetail: {
    length: PASSED,
    entropy: PASSED,
    reuse: { score: 0, passed: false },
    complexity: PASSED,
  },
}

describe('força da senha no detalhe da entrada', () => {
  it('uma senha forte mostra a faixa, a nota e os critérios todos atendidos', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}`)

    expect(await screen.findByText('Forte · 100 de 100')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: vault.strength.meterLabel })).toHaveAttribute(
      'aria-valuenow',
      '100',
    )
    expect(screen.getByText('Critérios atendidos: 4 de 4')).toBeInTheDocument()
  })

  it('uma senha curta e simples é "fraca" mesmo com a média da API em 59, e mostra o que reprovou', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(SHORT) }, `/vault/${ID}`)

    expect(await screen.findByText('Fraca · 59 de 100')).toBeInTheDocument()
    expect(screen.getByText('Critérios atendidos: 2 de 4')).toBeInTheDocument()
    const items = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(items.find((text) => text?.startsWith('Tamanho'))).toContain('Não atende')
    expect(items.find((text) => text?.startsWith('Senha não reutilizada'))).toContain('Atende')
  })

  it('uma senha forte repetida é "média" e não "forte", apesar da nota 75', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(REPEATED) }, `/vault/${ID}`)

    expect(await screen.findByText('Média · 75 de 100')).toBeInTheDocument()
    expect(screen.getByText('Critérios atendidos: 3 de 4')).toBeInTheDocument()
  })

  it('uma entrada sem nota mostra "Ainda não avaliada", nunca "0" nem "forte"', async () => {
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler({
          ...ENTRY,
          passwordScore: null,
          passwordScoreDetail: null,
        }),
      },
      `/vault/${ID}`,
    )

    expect(await screen.findByText(vault.strength.notEvaluated)).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByText(/de 100/)).not.toBeInTheDocument()
  })

  it('a senha só está no campo da senha, nunca na seção de força', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}`)
    const region = await screen.findByRole('region', { name: vault.strength.title })

    expect(region.innerHTML).not.toContain(PASSWORD)
    expect(region.innerHTML).not.toContain(ENTRY.login as string)
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(screen.getByDisplayValue(PASSWORD)).toBeInTheDocument()
  })

  it('não faz nenhuma chamada além do detalhe', async () => {
    const { calls } = renderVault(
      { [`GET /vault/entries/${ID}`]: detailHandler(STRONG) },
      `/vault/${ID}`,
    )
    await screen.findByRole('meter')

    const apiCalls = calls.filter(
      (call) => !call.path.startsWith('/auth/') && call.path !== '/health',
    )
    expect(apiCalls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `GET /vault/entries/${ID}`,
    ])
  })

  it('se o detalhe não carrega, não há indicador (a tela é a de erro)', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: { status: 500 } }, `/vault/${ID}`)

    expect(await screen.findByText(vault.loadError.title)).toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByText(vault.strength.notEvaluated)).not.toBeInTheDocument()
  })

  it('a hierarquia de títulos do detalhe: título da entrada (h1), força (h2) e critérios (h3)', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Banco' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: vault.strength.title }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 3, name: vault.strength.criteriaTitle }),
    ).toBeInTheDocument()
  })
})

describe('a nota exibida é a da senha salva', () => {
  it('depois de editar e salvar, o detalhe mostra a nota nova e nunca a de antes', async () => {
    let saved = false
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => ({ body: saved ? STRONG : SHORT }),
        [`PUT /vault/entries/${ID}`]: () => {
          saved = true
          return { body: ENTRY }
        },
        'GET /vault/entries': { body: [] },
      },
      `/vault/${ID}`,
    )
    await screen.findByText('Fraca · 59 de 100')
    await userEvent.click(screen.getByRole('link', { name: vault.detail.edit }))
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))

    expect(await screen.findByText('Forte · 100 de 100')).toBeInTheDocument()
    expect(screen.queryByText('Fraca · 59 de 100')).not.toBeInTheDocument()
  })

  it('logo depois do clique que salva, a nota de antes não está na tela, nem por um instante', async () => {
    let reads = 0
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => {
          reads += 1
          return { body: reads <= 2 ? SHORT : STRONG }
        },
        [`PUT /vault/entries/${ID}`]: { body: ENTRY },
        'GET /vault/entries': { body: [] },
      },
      `/vault/${ID}`,
    )
    await screen.findByText('Fraca · 59 de 100')
    await userEvent.click(screen.getByRole('link', { name: vault.detail.edit }))
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))

    expect(screen.queryByText('Fraca · 59 de 100')).not.toBeInTheDocument()
    expect(await screen.findByText('Forte · 100 de 100')).toBeInTheDocument()
  })

  it('reabrir o detalhe busca a nota de novo (nada de nota guardada de antes)', async () => {
    let current = SHORT
    const { calls } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => ({ body: current }),
        'GET /vault/entries': { body: [listItem(ENTRY)] },
      },
      `/vault/${ID}`,
    )
    await screen.findByText('Fraca · 59 de 100')
    await userEvent.click(screen.getByRole('link', { name: vault.detail.back }))
    current = REPEATED
    await userEvent.click(await screen.findByRole('link', { name: /Banco/ }))

    expect(await screen.findByText('Média · 75 de 100')).toBeInTheDocument()
    expect(callsTo(calls, 'GET', `/vault/entries/${ID}`).length).toBeGreaterThanOrEqual(2)
  })
})

describe('onde a força não aparece', () => {
  it('o formulário de criação não mostra medidor nem nota', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, '/vault/new')
    await screen.findByLabelText(vault.form.fields.title)

    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByText(vault.strength.title)).not.toBeInTheDocument()
  })

  it('o formulário de edição também não, mesmo com a nota da entrada carregada', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}/edit`)
    await screen.findByLabelText(vault.form.fields.title)

    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByText(vault.strength.title)).not.toBeInTheDocument()
  })
})

describe('fim de sessão', () => {
  it('o fim da sessão tira a nota da tela (o cache de consultas é esvaziado pelo `SessionController`)', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}`)
    await screen.findByRole('meter')

    act(() => useSessionStore.getState().signOut())

    await waitFor(() => expect(screen.queryByRole('meter')).not.toBeInTheDocument())
    expect(screen.queryByText('Forte · 100 de 100')).not.toBeInTheDocument()
  })
})
