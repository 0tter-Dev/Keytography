import { focusManager, onlineManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import { useSessionStore } from '@/features/auth/session-store'
import {
  ENTRY,
  ID,
  ID2,
  OTHER,
  callsTo,
  detailHandler,
  listItem,
  renderVault,
} from './vault-test-support'

const { vault } = ptBR
const SECOND = { ...ENTRY, id: ID2, title: 'Streaming', login: null, additionalFields: null }

afterEach(() => {
  vi.unstubAllGlobals()
})

function gate() {
  let open: () => void = () => {}
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

describe('a edição não herda dado velho do detalhe', () => {
  it('abre com o que o servidor tem AGORA, mesmo tendo acabado de ver o detalhe, e salva sobre isso', async () => {
    let reads = 0
    const { calls } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => {
          reads += 1
          if (reads === 1) {
            return { body: { ...ENTRY, title: 'Banco v1', password: 'senha-v1' } }
          }
          // Outra aba mudou a entrada depois de o detalhe ter sido aberto.
          return {
            body: { ...ENTRY, title: reads === 2 ? 'Banco v2' : 'Banco v3', password: 'senha-v2' },
          }
        },
        [`PUT /vault/entries/${ID}`]: { body: ENTRY },
        'GET /vault/entries': { body: [] },
      },
      `/vault/${ID}`,
    )
    expect(await screen.findByRole('heading', { name: 'Banco v1' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: vault.detail.edit }))

    const title = await screen.findByLabelText(vault.form.fields.title)
    expect(title).toHaveValue('Banco v2') // não 'Banco v1', que estava no cache do detalhe
    expect(screen.getByLabelText(vault.form.fields.password)).toHaveValue('senha-v2')

    await userEvent.type(title, ' editado')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitUpdate }))

    await waitFor(() => expect(callsTo(calls, 'PUT', `/vault/entries/${ID}`)).toHaveLength(1))
    expect(callsTo(calls, 'PUT', `/vault/entries/${ID}`)[0]?.body).toMatchObject({
      title: 'Banco v2 editado',
      password: 'senha-v2',
    })
  })

  it('depois de salvar, o detalhe NÃO mostra, nem por um instante, o dado de antes de salvar', async () => {
    let reads = 0
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => {
          reads += 1
          return { body: { ...ENTRY, title: reads <= 2 ? 'Banco antigo' : 'Banco novo' } }
        },
        [`PUT /vault/entries/${ID}`]: { body: ENTRY },
        'GET /vault/entries': { body: [] },
      },
      `/vault/${ID}`,
    )
    await screen.findByRole('heading', { name: 'Banco antigo' })
    await userEvent.click(screen.getByRole('link', { name: vault.detail.edit }))
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))

    // Logo depois do clique que salva, o título antigo não pode estar na tela.
    expect(screen.queryByText('Banco antigo')).not.toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Banco novo' })).toBeInTheDocument()
  })
})

describe('um refetch que falha não apaga o que já está na tela', () => {
  it('formulário de edição aberto com dados digitados continua depois de um refetch com erro', async () => {
    let failing = false
    const { client } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => (failing ? { status: 500 } : { body: ENTRY }),
      },
      `/vault/${ID}/edit`,
    )
    const title = await screen.findByLabelText(vault.form.fields.title)
    await userEvent.type(title, ' digitado')

    failing = true
    await act(async () => {
      await client.refetchQueries({ queryKey: ['vault', 'entry'] })
      await new Promise((resolve) => setTimeout(resolve, 20)) // a tela reage ao erro depois do refetch
    })
    expect(client.getQueryCache().findAll({ queryKey: ['vault', 'entry'] })[0]?.state.status).toBe(
      'error',
    )

    expect(screen.queryByText(vault.loadError.title)).not.toBeInTheDocument()
    expect(screen.getByLabelText(vault.form.fields.title)).toHaveValue('Banco digitado')
  })

  it('o detalhe aberto continua na tela depois de um refetch com erro', async () => {
    let failing = false
    const { client } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: () => (failing ? { status: 500 } : { body: ENTRY }),
      },
      `/vault/${ID}`,
    )
    await screen.findByRole('heading', { name: 'Banco' })

    failing = true
    await act(async () => {
      await client.refetchQueries({ queryKey: ['vault', 'entry'] })
      await new Promise((resolve) => setTimeout(resolve, 20)) // a tela reage ao erro depois do refetch
    })
    expect(client.getQueryCache().findAll({ queryKey: ['vault', 'entry'] })[0]?.state.status).toBe(
      'error',
    )

    expect(screen.queryByText(vault.loadError.title)).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Banco' })).toBeInTheDocument()
  })
})

describe('trocar de entrada na edição reinicia o formulário', () => {
  it('ir da edição de uma entrada para a de outra mostra os dados da outra (e não os da primeira)', async () => {
    const { router } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID2}`]: detailHandler(SECOND),
      },
      `/vault/${ID}/edit`,
    )
    expect(await screen.findByLabelText(vault.form.fields.title)).toHaveValue('Banco')

    await act(async () => {
      await router.navigate(`/vault/${ID2}/edit`)
    })

    await waitFor(() =>
      expect(screen.getByLabelText(vault.form.fields.title)).toHaveValue('Streaming'),
    )
  })
})

describe('o estado de salvar não passa de uma entrada para outra', () => {
  it('o aviso de falha ao salvar uma entrada não aparece na edição de outra', async () => {
    const { router } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID2}`]: detailHandler(SECOND),
        [`PUT /vault/entries/${ID}`]: { status: 503 },
      },
      `/vault/${ID}/edit`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.form.submitUpdate }))
    expect(await screen.findByText(vault.form.errors.unknown)).toBeInTheDocument()

    await act(async () => {
      await router.navigate(`/vault/${ID2}/edit`)
    })

    await waitFor(() =>
      expect(screen.getByLabelText(vault.form.fields.title)).toHaveValue('Streaming'),
    )
    expect(screen.queryByText(vault.form.errors.unknown)).not.toBeInTheDocument()
  })
})

describe('estados de carregamento e de erro de cada tela', () => {
  it('detalhe, edição e histórico mostram o esqueleto enquanto carregam', async () => {
    const detail = gate()
    const history = gate()
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: async () => {
          await detail.opened
          return { body: ENTRY }
        },
        [`GET /vault/entries/${ID}/history`]: async () => {
          await history.opened
          return { body: [] }
        },
      },
      `/vault/${ID}`,
    )
    expect(await screen.findByRole('status', { name: vault.loading })).toBeInTheDocument()
    detail.open()
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.showHistory }))
    expect(await screen.findByRole('status', { name: vault.loading })).toBeInTheDocument()
    history.open()
    expect(await screen.findByText(vault.history.empty)).toBeInTheDocument()
  })

  it('a edição mostra o esqueleto enquanto carrega', async () => {
    const detail = gate()
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: async () => {
          await detail.opened
          return { body: ENTRY }
        },
      },
      `/vault/${ID}/edit`,
    )
    expect(await screen.findByRole('status', { name: vault.loading })).toBeInTheDocument()
    expect(screen.queryByLabelText(vault.form.fields.password)).not.toBeInTheDocument()
    detail.open()
    expect(await screen.findByLabelText(vault.form.fields.password)).toBeInTheDocument()
  })

  it('a lixeira mostra erro com nova tentativa, e o esqueleto enquanto carrega', async () => {
    let up = false
    renderVault(
      {
        'GET /vault/entries/trash': () => (up ? { body: [listItem(SECOND)] } : { status: 500 }),
      },
      '/vault/trash',
    )
    expect(await screen.findByText(vault.loadError.title)).toBeInTheDocument()
    up = true
    await userEvent.click(screen.getByRole('button', { name: vault.loadError.retry }))

    expect(await screen.findByText('Streaming')).toBeInTheDocument()
  })

  it('o item Cofre da navegação fica ativo nas sub-rotas e o Início só na raiz', async () => {
    renderVault({ 'GET /vault/entries/trash': { body: [] } }, '/vault/trash')
    await screen.findByText(vault.trash.empty.title)

    const nav = screen.getByRole('navigation', { name: ptBR.nav.label })
    expect(within(nav).getByRole('link', { name: ptBR.nav.vault })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: ptBR.nav.home })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('as telas de detalhe e de formulário têm um título de nível 1', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Banco' })).toBeInTheDocument()
  })

  it('o formulário de nova entrada tem um título de nível 1', async () => {
    renderVault({}, '/vault/new')
    expect(
      await screen.findByRole('heading', { level: 1, name: vault.form.newTitle }),
    ).toBeInTheDocument()
  })
})

describe('trocar de entrada reinicia o estado da tela', () => {
  it('a senha revelada e o histórico aberto de uma entrada não passam para a outra', async () => {
    const { router } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID2}`]: detailHandler(SECOND),
        [`GET /vault/entries/${ID}/history`]: { body: [] },
        [`GET /vault/entries/${ID2}/history`]: { body: [] },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Mostrar senha' }))
    await userEvent.click(screen.getByRole('button', { name: vault.detail.showHistory }))
    await screen.findByText(vault.history.empty)

    await act(async () => {
      await router.navigate(`/vault/${ID2}`)
    })

    expect(await screen.findByRole('heading', { name: 'Streaming' })).toBeInTheDocument()
    expect(screen.getByLabelText(vault.form.fields.password)).toHaveAttribute('type', 'password')
    expect(screen.queryByText(vault.history.empty)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: vault.detail.showHistory })).toBeInTheDocument()
  })

  it('o campo da senha revelada não é enviado ao corretor ortográfico', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)
    const field = await screen.findByLabelText(vault.form.fields.password)

    expect(field).toHaveAttribute('spellcheck', 'false')
  })
})

describe('validações e mensagens do formulário', () => {
  const fillPassword = () =>
    userEvent.type(screen.getByLabelText(vault.form.fields.password), 'segredo')

  it('um título só com espaços é recusado', async () => {
    const { calls } = renderVault({}, '/vault/new')
    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), '   ')
    await fillPassword()
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByText(vault.form.validation.titleRequired)).toBeInTheDocument()
    expect(callsTo(calls, 'POST', '/vault/entries')).toHaveLength(0)
  })

  it('nomes de campo que só diferem pelos espaços nas pontas contam como repetidos', async () => {
    const { calls } = renderVault({}, '/vault/new')
    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), 'Banco')
    await fillPassword()
    await userEvent.click(screen.getByRole('button', { name: vault.form.addField }))
    await userEvent.click(screen.getByRole('button', { name: vault.form.addField }))
    const names = screen.getAllByLabelText(vault.form.fields.fieldName)
    await userEvent.type(names[0]!, 'URL')
    await userEvent.type(names[1]!, ' URL ')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByText(vault.form.validation.fieldNameDuplicate)).toBeInTheDocument()
    expect(callsTo(calls, 'POST', '/vault/entries')).toHaveLength(0)
  })

  it('falha de rede ao salvar mostra a mensagem de rede e mantém os dados', async () => {
    renderVault(
      {
        'POST /vault/entries': () => {
          throw new TypeError('Failed to fetch')
        },
      },
      '/vault/new',
    )
    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), 'Banco')
    await fillPassword()
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByText(vault.form.errors.network)).toBeInTheDocument()
    expect(screen.getByLabelText(vault.form.fields.title)).toHaveValue('Banco')
  })

  it('um 400 que não é do título também avisa que não salvou', async () => {
    renderVault(
      { 'POST /vault/entries': { status: 400, body: { errors: { outro: ['ruim'] } } } },
      '/vault/new',
    )
    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), 'Banco')
    await fillPassword()
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByText(vault.form.errors.unknown)).toBeInTheDocument()
  })
})

/** Abre o diálogo de exclusão definitiva da linha, digita a palavra de confirmação e confirma. */
async function confirmPermanentDelete(rowButton: RegExp) {
  await userEvent.click(await screen.findByRole('button', { name: rowButton }))
  const dialog = await screen.findByRole('dialog')
  await userEvent.type(
    within(dialog).getByLabelText(vault.confirmDelete.label),
    vault.confirmDelete.word,
  )
  await userEvent.click(within(dialog).getByRole('button', { name: vault.confirmDelete.confirm }))
}

describe('chamada sem resposta do servidor que a sessão não explica', () => {
  it('salvar com a sessão ainda ativa mas sem poder confirmá-la avisa que nada foi feito (e mantém os dados)', async () => {
    const { calls } = renderVault(
      {
        'POST /vault/entries': { status: 401 },
        'POST /auth/refresh': { status: 503 }, // a API não respondeu ao refresh: a sessão não cai
      },
      '/vault/new',
    )
    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), 'Banco')
    await userEvent.type(screen.getByLabelText(vault.form.fields.password), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByText(vault.errors.unauthorized)).toBeInTheDocument()
    expect(screen.getByLabelText(vault.form.fields.title)).toHaveValue('Banco')
    expect(callsTo(calls, 'POST', '/vault/entries')).toHaveLength(1)
  })

  it('restaurar na mesma situação avisa com um toast, e a entrada continua na lixeira', async () => {
    renderVault(
      {
        'GET /vault/entries/trash': { body: [listItem(SECOND)] },
        [`POST /vault/entries/${ID2}/restore`]: { status: 401 },
        'POST /auth/refresh': { status: 503 },
      },
      '/vault/trash',
    )
    await userEvent.click(await screen.findByRole('button', { name: /Restaurar: Streaming/ }))

    expect(await screen.findByText(vault.errors.unauthorized)).toBeInTheDocument()
    expect(screen.getByText('Streaming')).toBeInTheDocument()
  })

  it('mover para a lixeira na mesma situação avisa com um toast', async () => {
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`DELETE /vault/entries/${ID}`]: { status: 401 },
        'POST /auth/refresh': { status: 503 },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.delete }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: vault.detail.confirmTrash.confirm }),
    )

    expect(await screen.findByText(vault.errors.unauthorized)).toBeInTheDocument()
  })

  it('restaurar com a sessão encerrada pelo servidor não deixa o toast de "nada foi feito" no login', async () => {
    renderVault(
      {
        'GET /vault/entries/trash': { body: [listItem(SECOND)] },
        [`POST /vault/entries/${ID2}/restore`]: { status: 401 },
        'POST /auth/refresh': { status: 401 },
      },
      '/vault/trash',
    )
    await userEvent.click(await screen.findByRole('button', { name: /Restaurar: Streaming/ }))

    expect(await screen.findByRole('heading', { name: ptBR.auth.login.title })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(vault.errors.unauthorized)).not.toBeInTheDocument()
    expect(screen.queryByText(vault.trash.restoreFailed)).not.toBeInTheDocument()
  })

  it('mover para a lixeira com a sessão encerrada pelo servidor também não deixa toast no login', async () => {
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`DELETE /vault/entries/${ID}`]: { status: 401 },
        'POST /auth/refresh': { status: 401 },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.delete }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: vault.detail.confirmTrash.confirm }),
    )

    expect(await screen.findByRole('heading', { name: ptBR.auth.login.title })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(vault.errors.unauthorized)).not.toBeInTheDocument()
    expect(screen.queryByText(vault.detail.deleteFailed)).not.toBeInTheDocument()
  })

  it('excluir definitivamente na mesma situação avisa com um toast, e a entrada continua na lixeira', async () => {
    renderVault(
      {
        'GET /vault/entries/trash': { body: [listItem(SECOND)] },
        [`DELETE /vault/entries/${ID2}/permanent`]: { status: 401 },
        'POST /auth/refresh': { status: 503 },
      },
      '/vault/trash',
    )
    await confirmPermanentDelete(/Excluir definitivamente: Streaming/)

    expect(await screen.findByText(vault.errors.unauthorized)).toBeInTheDocument()
    expect(screen.getByText('Streaming')).toBeInTheDocument()
  })

  it('excluir definitivamente com a sessão encerrada pelo servidor não deixa o toast de "nada foi feito" no login', async () => {
    renderVault(
      {
        'GET /vault/entries/trash': { body: [listItem(SECOND)] },
        [`DELETE /vault/entries/${ID2}/permanent`]: { status: 401 },
        'POST /auth/refresh': { status: 401 },
      },
      '/vault/trash',
    )
    await confirmPermanentDelete(/Excluir definitivamente: Streaming/)

    expect(await screen.findByRole('heading', { name: ptBR.auth.login.title })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(vault.errors.unauthorized)).not.toBeInTheDocument()
    expect(screen.queryByText(vault.trash.deleteFailed)).not.toBeInTheDocument()
  })

  it('com a sessão encerrada pelo servidor, o aviso é o do login (não o de "nada foi feito")', async () => {
    renderVault(
      {
        'POST /vault/entries': { status: 401 },
        'POST /auth/refresh': { status: 401 },
      },
      '/vault/new',
    )
    await userEvent.type(await screen.findByLabelText(vault.form.fields.title), 'Banco')
    await userEvent.type(screen.getByLabelText(vault.form.fields.password), 'segredo')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByRole('heading', { name: ptBR.auth.login.title })).toBeInTheDocument()
    expect(screen.queryByText(vault.errors.unauthorized)).not.toBeInTheDocument()
  })
})

describe('lixeira: duplo clique e confirmação', () => {
  it('enquanto uma restauração voa, os botões de restaurar de todas as linhas ficam desabilitados', async () => {
    const slow = gate()
    renderVault(
      {
        'GET /vault/entries/trash': {
          body: [listItem(SECOND), listItem({ ...SECOND, id: ID, title: 'Outra' })],
        },
        [`POST /vault/entries/${ID2}/restore`]: async () => {
          await slow.opened
          return { status: 204 }
        },
      },
      '/vault/trash',
    )
    await userEvent.click(await screen.findByRole('button', { name: /Restaurar: Streaming/ }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Restaurar: Outra/ })).toBeDisabled(),
    )
    expect(screen.getByRole('button', { name: /Restaurar: Streaming/ })).toBeDisabled()
    slow.open()
  })

  it('a palavra de confirmação aceita espaços nas pontas e qualquer caixa', async () => {
    renderVault({ 'GET /vault/entries/trash': { body: [listItem(SECOND)] } }, '/vault/trash')
    await userEvent.click(
      await screen.findByRole('button', { name: /Excluir definitivamente: Streaming/ }),
    )
    const dialog = await screen.findByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText(vault.confirmDelete.label), '  excluir ')

    expect(within(dialog).getByRole('button', { name: vault.confirmDelete.confirm })).toBeEnabled()
  })

  it('depois de excluir de vez, o diálogo reaberto para OUTRA entrada vem vazio e desabilitado', async () => {
    let removed = false
    renderVault(
      {
        'GET /vault/entries/trash': () => ({
          body: removed
            ? [listItem({ ...SECOND, id: ID, title: 'Outra' })]
            : [listItem(SECOND), listItem({ ...SECOND, id: ID, title: 'Outra' })],
        }),
        [`DELETE /vault/entries/${ID2}/permanent`]: () => {
          removed = true
          return { status: 204 }
        },
      },
      '/vault/trash',
    )
    await userEvent.click(
      await screen.findByRole('button', { name: /Excluir definitivamente: Streaming/ }),
    )
    let dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText(vault.confirmDelete.label),
      vault.confirmDelete.word,
    )
    await userEvent.click(within(dialog).getByRole('button', { name: vault.confirmDelete.confirm }))
    await waitFor(() => expect(screen.queryByText('Streaming')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /Excluir definitivamente: Outra/ }))
    dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText(vault.confirmDelete.label)).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: vault.confirmDelete.confirm })).toBeDisabled()
  })
})

/** Espera a tela reagir a um refetch (o `react-query` notifica os observadores depois do `act`). */
async function refetchAndSettle(
  client: { refetchQueries: (filters: { queryKey: string[] }) => Promise<void> },
  key: string[],
) {
  await act(async () => {
    await client.refetchQueries({ queryKey: key })
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

describe('um refetch que falha não apaga listas nem histórico já na tela', () => {
  it('a lista do cofre continua depois de um refetch com erro', async () => {
    let failing = false
    const { client } = renderVault(
      { 'GET /vault/entries': () => (failing ? { status: 500 } : { body: [listItem(ENTRY)] }) },
      '/vault',
    )
    await screen.findByRole('link', { name: /Banco/ })

    failing = true
    await refetchAndSettle(client, ['vault', 'entries'])

    expect(client.getQueryCache().find({ queryKey: ['vault', 'entries'] })?.state.status).toBe(
      'error',
    )
    expect(screen.queryByText(vault.loadError.title)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Banco/ })).toBeInTheDocument()
  })

  it('a lixeira continua depois de um refetch com erro (a invalidação que falha não esconde a lista)', async () => {
    let failing = false
    const { client } = renderVault(
      {
        'GET /vault/entries/trash': () =>
          failing ? { status: 500 } : { body: [listItem(SECOND)] },
      },
      '/vault/trash',
    )
    await screen.findByText('Streaming')

    failing = true
    await refetchAndSettle(client, ['vault', 'trash'])

    expect(client.getQueryCache().find({ queryKey: ['vault', 'trash'] })?.state.status).toBe(
      'error',
    )
    expect(screen.queryByText(vault.loadError.title)).not.toBeInTheDocument()
    expect(screen.getByText('Streaming')).toBeInTheDocument()
  })

  it('o histórico (com uma senha revelada) continua depois de um refetch com erro', async () => {
    let failing = false
    const { client } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID}/history`]: () =>
          failing
            ? { status: 500 }
            : { body: [{ id: 'h1', password: 'senha-antiga', changedAt: '2026-10-01T10:00:00Z' }] },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.showHistory }))
    await userEvent.click(await screen.findByRole('button', { name: /Mostrar senha \(trocada em/ }))

    failing = true
    await refetchAndSettle(client, ['vault', 'history'])

    expect(screen.queryByText(vault.history.loadError)).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('senha-antiga')).toBeInTheDocument()
  })

  it('a edição não refaz a busca em segundo plano ao voltar o foco ou a conexão', async () => {
    const { calls } = renderVault(
      { [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) },
      `/vault/${ID}/edit`,
    )
    await screen.findByLabelText(vault.form.fields.title)
    const reads = () => callsTo(calls, 'GET', `/vault/entries/${ID}`).length

    await act(async () => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
      onlineManager.setOnline(false)
      onlineManager.setOnline(true)
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    focusManager.setFocused(undefined)

    expect(reads()).toBe(1)
  })
})

describe('chamada recusada por troca de conta: só o aviso do cliente de sessão', () => {
  /** A conta ficou "por conferir" e `/auth/me` revela outra conta: o cliente recusa a chamada. */
  const switchAccountUnderneath = () => act(() => useSessionStore.setState({ unverified: true }))

  it('restaurar na lixeira não mostra o aviso de "nada foi feito" (só o da troca de conta)', async () => {
    renderVault(
      {
        'GET /vault/entries/trash': { body: [listItem(SECOND)] },
        [`POST /vault/entries/${ID2}/restore`]: { status: 204 },
        'GET /auth/me': { body: OTHER },
      },
      '/vault/trash',
    )
    const restore = await screen.findByRole('button', { name: /Restaurar: Streaming/ })
    switchAccountUnderneath()
    await userEvent.click(restore)

    expect(await screen.findByText(ptBR.auth.accountChanged)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(vault.errors.unauthorized)).not.toBeInTheDocument()
    expect(screen.queryByText(vault.trash.restoreFailed)).not.toBeInTheDocument()
  })

  it('excluir definitivamente também não mostra o aviso de "nada foi feito"', async () => {
    renderVault(
      {
        'GET /vault/entries/trash': { body: [listItem(SECOND)] },
        [`DELETE /vault/entries/${ID2}/permanent`]: { status: 204 },
        'GET /auth/me': { body: OTHER },
      },
      '/vault/trash',
    )
    await userEvent.click(
      await screen.findByRole('button', { name: /Excluir definitivamente: Streaming/ }),
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(
      within(dialog).getByLabelText(vault.confirmDelete.label),
      vault.confirmDelete.word,
    )
    switchAccountUnderneath()
    await userEvent.click(within(dialog).getByRole('button', { name: vault.confirmDelete.confirm }))

    expect(await screen.findByText(ptBR.auth.accountChanged)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(vault.errors.unauthorized)).not.toBeInTheDocument()
    expect(screen.queryByText(vault.trash.deleteFailed)).not.toBeInTheDocument()
  })

  it('mover para a lixeira também não mostra o aviso de "nada foi feito"', async () => {
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`DELETE /vault/entries/${ID}`]: { status: 204 },
        'GET /auth/me': { body: OTHER },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.delete }))
    const dialog = await screen.findByRole('dialog')
    switchAccountUnderneath()
    await userEvent.click(
      within(dialog).getByRole('button', { name: vault.detail.confirmTrash.confirm }),
    )

    expect(await screen.findByText(ptBR.auth.accountChanged)).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.queryByText(vault.errors.unauthorized)).not.toBeInTheDocument()
  })
})

describe('telas de erro com título de nível 1 e campos de senha sem corretor', () => {
  it('"não encontrada" e a falha de carregar o detalhe ou a edição têm um h1', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: { status: 404 } }, `/vault/${ID}`)
    expect(
      await screen.findByRole('heading', { level: 1, name: vault.notFound.title }),
    ).toBeInTheDocument()
  })

  it('a falha de carregar o detalhe tem um h1', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: { status: 500 } }, `/vault/${ID}`)
    expect(
      await screen.findByRole('heading', { level: 1, name: vault.loadError.title }),
    ).toBeInTheDocument()
  })

  it('a falha de carregar a edição tem um h1', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: { status: 500 } }, `/vault/${ID}/edit`)
    expect(
      await screen.findByRole('heading', { level: 1, name: vault.loadError.title }),
    ).toBeInTheDocument()
  })

  it('o campo de senha do formulário não passa pelo corretor ortográfico', async () => {
    renderVault({}, '/vault/new')

    expect(await screen.findByLabelText(vault.form.fields.password)).toHaveAttribute(
      'spellcheck',
      'false',
    )
  })
})
