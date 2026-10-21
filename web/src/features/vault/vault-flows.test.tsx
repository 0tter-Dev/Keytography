import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import {
  ENTRY,
  ID,
  ID2,
  PASSWORD,
  callsTo,
  detailHandler,
  listItem,
  renderVault,
} from './vault-test-support'

const { vault } = ptBR
const OTHER_ENTRY = { ...ENTRY, id: ID2, title: 'Streaming', login: null, additionalFields: null }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lista do cofre', () => {
  it('mostra título, login e data de cada entrada, com link para o detalhe', async () => {
    renderVault({ 'GET /vault/entries': { body: [listItem(ENTRY), listItem(OTHER_ENTRY)] } })

    const link = await screen.findByRole('link', { name: /Banco/ })

    expect(link).toHaveAttribute('href', `/vault/${ID}`)
    expect(within(link).getByText('ana@banco')).toBeInTheDocument()
    expect(screen.getByText(vault.list.noLogin)).toBeInTheDocument() // entrada sem login
    expect(screen.getAllByText(/Atualizada em/).length).toBe(2)
  })

  it('mostra o esqueleto enquanto carrega, como status acessível', async () => {
    let finish: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    renderVault({
      'GET /vault/entries': async () => {
        await gate
        return { body: [] }
      },
    })

    expect(await screen.findByRole('status', { name: vault.loading })).toBeInTheDocument()
    finish()
    expect(await screen.findByText(vault.list.empty.title)).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: vault.loading })).not.toBeInTheDocument()
  })

  it('lista vazia mostra um estado vazio explícito e o caminho para criar a primeira entrada', async () => {
    renderVault({ 'GET /vault/entries': { body: [] } })

    expect(await screen.findByText(vault.list.empty.title)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: vault.list.new })).toHaveAttribute('href', '/vault/new')
  })

  it('falha de carregamento mostra erro (não tela em branco) e tenta de novo', async () => {
    let up = false
    renderVault({
      'GET /vault/entries': () => (up ? { body: [listItem(ENTRY)] } : { status: 500 }),
    })

    expect(await screen.findByText(vault.loadError.title)).toBeInTheDocument()
    up = true
    await userEvent.click(screen.getByRole('button', { name: vault.loadError.retry }))

    expect(await screen.findByRole('link', { name: /Banco/ })).toBeInTheDocument()
  })

  it('o item Cofre da navegação leva à lista e a lixeira tem o seu link', async () => {
    renderVault({ 'GET /vault/entries': { body: [] } })

    expect(await screen.findByRole('link', { name: vault.list.trash })).toHaveAttribute(
      'href',
      '/vault/trash',
    )
  })
})

describe('criar entrada', () => {
  const fillBasics = async (title = 'Banco', password = PASSWORD) => {
    await userEvent.type(screen.getByLabelText(vault.form.fields.title), title)
    await userEvent.type(screen.getByLabelText(vault.form.fields.password), password)
  }

  it('recusa título vazio, senha vazia e nomes de campo vazios ou repetidos, sem enviar nada', async () => {
    const { calls } = renderVault({}, '/vault/new')
    await screen.findByRole('heading', { name: vault.form.newTitle })

    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))
    expect(await screen.findByText(vault.form.validation.titleRequired)).toBeInTheDocument()
    expect(screen.getByText(vault.form.validation.passwordRequired)).toBeInTheDocument()

    await fillBasics()
    await userEvent.click(screen.getByRole('button', { name: vault.form.addField }))
    await userEvent.click(screen.getByRole('button', { name: vault.form.addField }))
    const names = screen.getAllByLabelText(vault.form.fields.fieldName)
    await userEvent.type(names[1]!, 'URL')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))
    expect(await screen.findByText(vault.form.validation.fieldNameRequired)).toBeInTheDocument()

    await userEvent.type(names[0]!, 'URL')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))
    expect(await screen.findByText(vault.form.validation.fieldNameDuplicate)).toBeInTheDocument()

    expect(callsTo(calls, 'POST', '/vault/entries')).toHaveLength(0)
  })

  it('cria, envia tudo (login em branco vira null, sem campos vira null), vai ao detalhe e a lista passa a ter a entrada', async () => {
    let created = false
    const { calls } = renderVault(
      {
        'GET /vault/entries': () => ({ body: created ? [listItem(ENTRY)] : [] }),
        'POST /vault/entries': () => {
          created = true
          return { status: 201, body: ENTRY }
        },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      },
      '/vault',
    )
    await userEvent.click(await screen.findByRole('link', { name: vault.list.new }))
    await fillBasics()
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByRole('heading', { name: 'Banco' })).toBeInTheDocument()
    expect(callsTo(calls, 'POST', '/vault/entries')[0]?.body).toEqual({
      title: 'Banco',
      login: null,
      password: PASSWORD,
      additionalFields: null,
    })

    await userEvent.click(screen.getByRole('link', { name: vault.detail.back }))
    expect(await screen.findByRole('link', { name: /Banco/ })).toBeInTheDocument() // lista recarregada
  })

  it('envia os campos adicionais como dicionário e o login digitado', async () => {
    const { calls } = renderVault(
      {
        'POST /vault/entries': { status: 201, body: ENTRY },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      },
      '/vault/new',
    )
    await fillBasics()
    await userEvent.type(screen.getByLabelText(vault.form.fields.login), '  ana@banco  ')
    await userEvent.click(screen.getByRole('button', { name: vault.form.addField }))
    await userEvent.type(screen.getByLabelText(vault.form.fields.fieldName), 'URL')
    await userEvent.type(screen.getByLabelText(vault.form.fields.fieldValue), 'https://b.example')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    await screen.findByRole('heading', { name: 'Banco' })
    expect(callsTo(calls, 'POST', '/vault/entries')[0]?.body).toEqual({
      title: 'Banco',
      login: 'ana@banco',
      password: PASSWORD,
      additionalFields: { URL: 'https://b.example' },
    })
  })

  it('um duplo clique em criar envia UMA requisição', async () => {
    let finish: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const { calls } = renderVault(
      {
        'POST /vault/entries': async () => {
          await gate
          return { status: 201, body: ENTRY }
        },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      },
      '/vault/new',
    )
    await fillBasics()
    const submit = screen.getByRole('button', { name: vault.form.submitCreate })

    await userEvent.dblClick(submit)
    finish()

    await screen.findByRole('heading', { name: 'Banco' })
    expect(callsTo(calls, 'POST', '/vault/entries')).toHaveLength(1)
  })

  it('falha de rede ou 5xx mostra o erro e MANTÉM o que foi digitado, para tentar de novo', async () => {
    let up = false
    const { calls } = renderVault(
      {
        'POST /vault/entries': () => (up ? { status: 201, body: ENTRY } : { status: 503 }),
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      },
      '/vault/new',
    )
    await fillBasics()
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByText(vault.form.errors.unknown)).toBeInTheDocument()
    expect(screen.getByLabelText(vault.form.fields.title)).toHaveValue('Banco')
    expect(screen.getByLabelText(vault.form.fields.password)).toHaveValue(PASSWORD)

    up = true
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))
    await screen.findByRole('heading', { name: 'Banco' })
    expect(callsTo(calls, 'POST', '/vault/entries')).toHaveLength(2)
  })

  it('validação do servidor para o título aparece no campo (traduzida)', async () => {
    renderVault(
      {
        'POST /vault/entries': {
          status: 400,
          body: { errors: { title: ['Título é obrigatório.'] } },
        },
      },
      '/vault/new',
    )
    await fillBasics()
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitCreate }))

    expect(await screen.findByText(vault.form.validation.titleRequired)).toBeInTheDocument()
    expect(screen.queryByText('Título é obrigatório.')).not.toBeInTheDocument()
  })

  it('cancelar volta à lista sem enviar nada', async () => {
    const { calls } = renderVault({ 'GET /vault/entries': { body: [] } }, '/vault/new')

    await userEvent.click(await screen.findByRole('button', { name: vault.form.cancel }))

    expect(await screen.findByText(vault.list.empty.title)).toBeInTheDocument()
    expect(callsTo(calls, 'POST', '/vault/entries')).toHaveLength(0)
  })
})

describe('editar entrada', () => {
  it('abre com o detalhe buscado agora (não com o da lista) e envia TODOS os campos, inclusive os adicionais', async () => {
    const { calls } = renderVault(
      {
        'GET /vault/entries': { body: [{ ...listItem(ENTRY), title: 'Título velho da lista' }] },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`PUT /vault/entries/${ID}`]: { body: { ...ENTRY, title: 'Banco novo' } },
      },
      '/vault',
    )
    await userEvent.click(await screen.findByRole('link', { name: /Título velho/ }))
    await userEvent.click(await screen.findByRole('link', { name: vault.detail.edit }))

    const title = await screen.findByLabelText(vault.form.fields.title)
    expect(title).toHaveValue('Banco') // do servidor, não da lista
    expect(screen.getByLabelText(vault.form.fields.password)).toHaveValue(PASSWORD)
    expect(screen.getAllByLabelText(vault.form.fields.fieldName)).toHaveLength(2)

    await userEvent.clear(title)
    await userEvent.type(title, 'Banco novo')
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitUpdate }))

    await screen.findByRole('heading', { name: 'Banco novo' }).catch(() => undefined)
    await waitFor(() => expect(callsTo(calls, 'PUT', `/vault/entries/${ID}`)).toHaveLength(1))
    expect(callsTo(calls, 'PUT', `/vault/entries/${ID}`)[0]?.body).toEqual({
      title: 'Banco novo',
      login: 'ana@banco',
      password: PASSWORD,
      additionalFields: { URL: 'https://banco.example', Agência: '0001' },
    })
  })

  it('remover todos os campos adicionais envia null (a API apaga os campos)', async () => {
    const { calls } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`PUT /vault/entries/${ID}`]: { body: ENTRY },
      },
      `/vault/${ID}/edit`,
    )
    await screen.findByLabelText(vault.form.fields.title)
    await userEvent.click(
      screen.getByRole('button', { name: vault.form.removeField.replace('{{position}}', '2') }),
    )
    await userEvent.click(
      screen.getByRole('button', { name: vault.form.removeField.replace('{{position}}', '1') }),
    )
    await userEvent.click(screen.getByRole('button', { name: vault.form.submitUpdate }))

    await waitFor(() => expect(callsTo(calls, 'PUT', `/vault/entries/${ID}`)).toHaveLength(1))
    expect(callsTo(calls, 'PUT', `/vault/entries/${ID}`)[0]?.body).toMatchObject({
      additionalFields: null,
    })
  })

  it('entrada inexistente (404) ou de outro usuário (403) mostra a mesma tela "não encontrada"', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: { status: 404 } }, `/vault/${ID}/edit`)
    expect(await screen.findByText(vault.notFound.title)).toBeInTheDocument()
  })

  it('falha ao carregar a edição mostra erro com nova tentativa, sem formulário', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: { status: 500 } }, `/vault/${ID}/edit`)

    expect(await screen.findByText(vault.loadError.title)).toBeInTheDocument()
    expect(screen.queryByLabelText(vault.form.fields.password)).not.toBeInTheDocument()
  })
})

describe('detalhe da entrada', () => {
  it('mostra título, login, campos adicionais e datas; a senha vem oculta', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)

    expect(await screen.findByRole('heading', { name: 'Banco' })).toBeInTheDocument()
    expect(screen.getByText('ana@banco')).toBeInTheDocument()
    expect(screen.getByText('https://banco.example')).toBeInTheDocument()
    expect(screen.getByText('0001')).toBeInTheDocument()
    const password = screen.getByLabelText(vault.form.fields.password)
    expect(password).toHaveAttribute('type', 'password')
    expect(password).toHaveValue(PASSWORD) // o valor está no campo, mas oculto
  })

  it('revelar e ocultar a senha por ação do usuário', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: detailHandler(ENTRY) }, `/vault/${ID}`)
    const password = await screen.findByLabelText(vault.form.fields.password)

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(password).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('mover para a lixeira chama a API, avisa e volta à lista já sem a entrada', async () => {
    let deleted = false
    const { calls } = renderVault(
      {
        'GET /vault/entries': () => ({ body: deleted ? [] : [listItem(ENTRY)] }),
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`DELETE /vault/entries/${ID}`]: () => {
          deleted = true
          return { status: 204 }
        },
      },
      '/vault',
    )
    await userEvent.click(await screen.findByRole('link', { name: /Banco/ }))
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.delete }))

    expect(await screen.findByText(vault.list.empty.title)).toBeInTheDocument()
    expect(callsTo(calls, 'DELETE', `/vault/entries/${ID}`)).toHaveLength(1)
  })

  it('duplo clique em "mover para a lixeira" envia UMA requisição', async () => {
    let finish: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const { calls } = renderVault(
      {
        'GET /vault/entries': { body: [] },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`DELETE /vault/entries/${ID}`]: async () => {
          await gate
          return { status: 204 }
        },
      },
      `/vault/${ID}`,
    )
    const button = await screen.findByRole('button', { name: vault.detail.delete })

    await userEvent.dblClick(button)
    finish()

    await screen.findByText(vault.list.empty.title)
    expect(callsTo(calls, 'DELETE', `/vault/entries/${ID}`)).toHaveLength(1)
  })

  it('id de entrada que não existe ou não é do usuário: tela "não encontrada", sem distinguir o motivo', async () => {
    renderVault({ [`GET /vault/entries/${ID}`]: { status: 403 } }, `/vault/${ID}`)
    expect(await screen.findByText(vault.notFound.title)).toBeInTheDocument()
  })

  it('id que nem é um GUID também cai em "não encontrada"', async () => {
    renderVault({ 'GET /vault/entries/lixo': { status: 404 } }, '/vault/lixo')
    expect(await screen.findByText(vault.notFound.title)).toBeInTheDocument()
  })

  it('falha do servidor mostra erro com nova tentativa', async () => {
    let up = false
    renderVault(
      { [`GET /vault/entries/${ID}`]: () => (up ? { body: ENTRY } : { status: 500 }) },
      `/vault/${ID}`,
    )
    await screen.findByText(vault.loadError.title)
    up = true
    await userEvent.click(screen.getByRole('button', { name: vault.loadError.retry }))

    expect(await screen.findByRole('heading', { name: 'Banco' })).toBeInTheDocument()
  })
})

describe('histórico de senhas', () => {
  const history = [
    { id: 'h2', password: 'senha-antiga-2', changedAt: '2026-10-02T11:30:00Z' },
    { id: 'h1', password: 'senha-antiga-1', changedAt: '2026-10-01T10:00:00Z' },
  ]

  it('só é buscado quando a pessoa pede; mostra data e senhas anteriores ocultas até serem reveladas', async () => {
    const { calls } = renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID}/history`]: { body: history },
      },
      `/vault/${ID}`,
    )
    await screen.findByRole('heading', { name: 'Banco' })
    expect(callsTo(calls, 'GET', `/vault/entries/${ID}/history`)).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: vault.detail.showHistory }))

    expect(await screen.findAllByText(/Trocada em/)).toHaveLength(2)
    const passwords = screen.getAllByLabelText(vault.form.fields.password)
    expect(passwords).toHaveLength(3) // atual + 2 anteriores
    expect(passwords.every((field) => field.getAttribute('type') === 'password')).toBe(true)
    expect(passwords[1]).toHaveValue('senha-antiga-2')

    await userEvent.click(screen.getAllByRole('button', { name: 'Mostrar senha' })[1]!)
    expect(passwords[1]).toHaveAttribute('type', 'text')
    expect(passwords[2]).toHaveAttribute('type', 'password') // revelar uma não revela as outras
  })

  it('entrada sem troca de senha mostra o aviso de histórico vazio', async () => {
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID}/history`]: { body: [] },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.showHistory }))

    expect(await screen.findByText(vault.history.empty)).toBeInTheDocument()
  })

  it('falha ao carregar o histórico mostra erro e ocultar o histórico o recolhe', async () => {
    renderVault(
      {
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
        [`GET /vault/entries/${ID}/history`]: { status: 500 },
      },
      `/vault/${ID}`,
    )
    await userEvent.click(await screen.findByRole('button', { name: vault.detail.showHistory }))
    expect(await screen.findByText(vault.history.loadError)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: vault.detail.hideHistory }))
    expect(screen.queryByText(vault.history.loadError)).not.toBeInTheDocument()
  })
})

describe('lixeira', () => {
  const trashItem = listItem(OTHER_ENTRY)

  it('lista as entradas excluídas, sem link para detalhe nem edição', async () => {
    renderVault({ 'GET /vault/entries/trash': { body: [trashItem] } }, '/vault/trash')

    expect(await screen.findByText('Streaming')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Streaming/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: vault.detail.edit })).not.toBeInTheDocument()
  })

  it('lixeira vazia mostra o estado vazio e falha mostra erro com nova tentativa', async () => {
    renderVault({ 'GET /vault/entries/trash': { body: [] } }, '/vault/trash')
    expect(await screen.findByText(vault.trash.empty.title)).toBeInTheDocument()
  })

  it('restaurar chama a API e a entrada sai da lixeira', async () => {
    let restored = false
    const { calls } = renderVault(
      {
        'GET /vault/entries/trash': () => ({ body: restored ? [] : [trashItem] }),
        [`POST /vault/entries/${ID2}/restore`]: () => {
          restored = true
          return { status: 204 }
        },
      },
      '/vault/trash',
    )
    await userEvent.click(await screen.findByRole('button', { name: /Restaurar: Streaming/ }))

    expect(await screen.findByText(vault.trash.empty.title)).toBeInTheDocument()
    expect(callsTo(calls, 'POST', `/vault/entries/${ID2}/restore`)).toHaveLength(1)
  })

  it('restaurar algo que outra aba já restaurou (404) conta como feito e a lista é atualizada', async () => {
    let refreshed = false
    renderVault(
      {
        'GET /vault/entries/trash': () => ({ body: refreshed ? [] : [trashItem] }),
        [`POST /vault/entries/${ID2}/restore`]: () => {
          refreshed = true
          return { status: 404 }
        },
      },
      '/vault/trash',
    )
    await userEvent.click(await screen.findByRole('button', { name: /Restaurar: Streaming/ }))

    expect(await screen.findByText(vault.trash.empty.title)).toBeInTheDocument()
    expect(screen.queryByText(vault.trash.restoreFailed)).not.toBeInTheDocument()
  })

  it('duplo clique em restaurar envia UMA requisição', async () => {
    let finish: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const { calls } = renderVault(
      {
        'GET /vault/entries/trash': { body: [trashItem] },
        [`POST /vault/entries/${ID2}/restore`]: async () => {
          await gate
          return { status: 204 }
        },
      },
      '/vault/trash',
    )
    await userEvent.dblClick(await screen.findByRole('button', { name: /Restaurar: Streaming/ }))
    finish()

    await waitFor(() =>
      expect(callsTo(calls, 'POST', `/vault/entries/${ID2}/restore`)).toHaveLength(1),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(callsTo(calls, 'POST', `/vault/entries/${ID2}/restore`)).toHaveLength(1)
  })

  it('duplo clique em confirmar a exclusão definitiva envia UMA requisição', async () => {
    let finish: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      finish = resolve
    })
    const { calls } = renderVault(
      {
        'GET /vault/entries/trash': { body: [trashItem] },
        [`DELETE /vault/entries/${ID2}/permanent`]: async () => {
          await gate
          return { status: 204 }
        },
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

    await userEvent.dblClick(
      within(dialog).getByRole('button', { name: vault.confirmDelete.confirm }),
    )
    finish()

    await waitFor(() =>
      expect(callsTo(calls, 'DELETE', `/vault/entries/${ID2}/permanent`)).toHaveLength(1),
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(callsTo(calls, 'DELETE', `/vault/entries/${ID2}/permanent`)).toHaveLength(1)
  })

  it('falha ao restaurar avisa e mantém a entrada na lixeira', async () => {
    renderVault(
      {
        'GET /vault/entries/trash': { body: [trashItem] },
        [`POST /vault/entries/${ID2}/restore`]: { status: 500 },
      },
      '/vault/trash',
    )
    await userEvent.click(await screen.findByRole('button', { name: /Restaurar: Streaming/ }))

    expect(await screen.findByText(vault.trash.restoreFailed)).toBeInTheDocument()
    expect(screen.getByText('Streaming')).toBeInTheDocument()
  })

  it('excluir definitivamente exige digitar a palavra: o botão só habilita com ela e nada é enviado antes', async () => {
    const { calls } = renderVault(
      {
        'GET /vault/entries/trash': { body: [trashItem] },
        [`DELETE /vault/entries/${ID2}/permanent`]: { status: 204 },
      },
      '/vault/trash',
    )
    await userEvent.click(
      await screen.findByRole('button', { name: /Excluir definitivamente: Streaming/ }),
    )
    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: vault.confirmDelete.confirm })

    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(vault.confirmDelete.label), 'errado')
    expect(confirm).toBeDisabled()
    await userEvent.clear(within(dialog).getByLabelText(vault.confirmDelete.label))
    expect(confirm).toBeDisabled() // texto vazio não confirma
    expect(callsTo(calls, 'DELETE', `/vault/entries/${ID2}/permanent`)).toHaveLength(0)

    await userEvent.type(
      within(dialog).getByLabelText(vault.confirmDelete.label),
      vault.confirmDelete.word,
    )
    expect(confirm).toBeEnabled()
  })

  it('confirmada, remove a entrada de vez; o texto digitado não sobra ao abrir o diálogo de novo', async () => {
    let removed = false
    const { calls } = renderVault(
      {
        'GET /vault/entries/trash': () => ({
          body: removed ? [] : [trashItem, listItem({ ...OTHER_ENTRY, id: ID, title: 'Outra' })],
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

    await waitFor(() =>
      expect(callsTo(calls, 'DELETE', `/vault/entries/${ID2}/permanent`)).toHaveLength(1),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('cancelar o diálogo descarta o texto digitado e não exclui nada', async () => {
    const { calls } = renderVault(
      {
        'GET /vault/entries/trash': { body: [trashItem] },
        [`DELETE /vault/entries/${ID2}/permanent`]: { status: 204 },
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
    await userEvent.click(within(dialog).getByRole('button', { name: vault.confirmDelete.cancel }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(
      screen.getByRole('button', { name: /Excluir definitivamente: Streaming/ }),
    )
    dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText(vault.confirmDelete.label)).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: vault.confirmDelete.confirm })).toBeDisabled()
    expect(callsTo(calls, 'DELETE', `/vault/entries/${ID2}/permanent`)).toHaveLength(0)
  })

  it('excluir de vez algo que outra aba já excluiu (404) conta como feito', async () => {
    let gone = false
    renderVault(
      {
        'GET /vault/entries/trash': () => ({ body: gone ? [] : [trashItem] }),
        [`DELETE /vault/entries/${ID2}/permanent`]: () => {
          gone = true
          return { status: 404 }
        },
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
    await userEvent.click(within(dialog).getByRole('button', { name: vault.confirmDelete.confirm }))

    expect(await screen.findByText(vault.trash.empty.title)).toBeInTheDocument()
    expect(screen.queryByText(vault.trash.deleteFailed)).not.toBeInTheDocument()
  })

  it('a exclusão definitiva só é oferecida na lixeira (nem a lista nem o detalhe a têm)', async () => {
    renderVault(
      {
        'GET /vault/entries': { body: [listItem(ENTRY)] },
        [`GET /vault/entries/${ID}`]: detailHandler(ENTRY),
      },
      '/vault',
    )
    await screen.findByRole('link', { name: /Banco/ })
    expect(
      screen.queryByRole('button', { name: /Excluir definitivamente/ }),
    ).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('link', { name: /Banco/ }))
    await screen.findByRole('heading', { name: 'Banco' })
    expect(
      screen.queryByRole('button', { name: /Excluir definitivamente/ }),
    ).not.toBeInTheDocument()
  })
})
