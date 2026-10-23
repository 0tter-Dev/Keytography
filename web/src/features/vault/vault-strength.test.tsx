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

const DETAIL = {
  length: { score: 100, passed: true },
  entropy: { score: 70, passed: true },
  reuse: { score: 100, passed: true },
  complexity: { score: 40, passed: false },
}
const STRONG = { ...ENTRY, passwordScore: 82, passwordScoreDetail: DETAIL }
const WEAK = {
  ...ENTRY,
  passwordScore: 18,
  passwordScoreDetail: { ...DETAIL, length: { score: 10, passed: false } },
}

describe('força da senha no detalhe da entrada', () => {
  it('uma senha forte mostra a faixa, a nota e os critérios que atendem e os que não', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}`)

    expect(await screen.findByText('Forte · 82 de 100')).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: vault.strength.meterLabel })).toHaveAttribute(
      'aria-valuenow',
      '82',
    )
    expect(screen.getByText('Previsibilidade').closest('li')).toHaveTextContent('Não atende')
    expect(screen.getByText('Tamanho').closest('li')).toHaveTextContent('Atende')
  })

  it('uma senha fraca mostra a faixa "fraca" e quais critérios reprovaram', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(WEAK) }, `/vault/${ID}`)

    expect(await screen.findByText('Fraca · 18 de 100')).toBeInTheDocument()
    expect(screen.getByText('Tamanho').closest('li')).toHaveTextContent('Não atende')
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

  it('a seção de força não carrega a senha (nem em atributos nem em texto)', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}`)
    const meter = await screen.findByRole('meter')

    const section = meter.closest('section') as HTMLElement
    expect(section.innerHTML).not.toContain(PASSWORD)
    expect(section.innerHTML).not.toContain(ENTRY.login as string)
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
})

describe('a nota exibida é a da senha salva', () => {
  it('depois de editar e salvar, o detalhe mostra a nota nova e nunca a de antes', async () => {
    let saved = false
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => ({ body: saved ? STRONG : WEAK }),
        [`PUT /vault/entries/${ID}`]: () => {
          saved = true
          return { body: ENTRY }
        },
        'GET /vault/entries': { body: [] },
      },
      `/vault/${ID}`,
    )
    await screen.findByText('Fraca · 18 de 100')
    await userEvent.click(screen.getByRole('link', { name: vault.detail.edit }))
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))

    expect(await screen.findByText('Forte · 82 de 100')).toBeInTheDocument()
    expect(screen.queryByText('Fraca · 18 de 100')).not.toBeInTheDocument()
  })

  it('reabrir o detalhe busca a nota de novo (nada de nota guardada de antes)', async () => {
    let score = 18
    const { calls } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => ({ body: { ...WEAK, passwordScore: score } }),
        'GET /vault/entries': { body: [listItem(ENTRY)] },
      },
      `/vault/${ID}`,
    )
    await screen.findByText('Fraca · 18 de 100')
    await userEvent.click(screen.getByRole('link', { name: vault.detail.back }))
    score = 75
    await userEvent.click(await screen.findByRole('link', { name: /Banco/ }))

    expect(await screen.findByText('Forte · 75 de 100')).toBeInTheDocument()
    expect(callsTo(calls, 'GET', `/vault/entries/${ID}`).length).toBeGreaterThanOrEqual(2)
  })
})

describe('onde a força não aparece', () => {
  it('os formulários de criação e de edição não mostram medidor nem nota', async () => {
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
  it('o fim da sessão descarta a nota junto com o detalhe', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(STRONG) }, `/vault/${ID}`)
    await screen.findByRole('meter')

    act(() => useSessionStore.getState().signOut())

    await waitFor(() => expect(screen.queryByRole('meter')).not.toBeInTheDocument())
    expect(screen.queryByText('Forte · 82 de 100')).not.toBeInTheDocument()
  })
})
