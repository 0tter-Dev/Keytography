import { api } from '@/api/client'
import type { components } from '@/api/schema'

export type EntryListItem = components['schemas']['VaultEntryListItemResponse']
export type EntryDetail = components['schemas']['VaultEntryDetailResponse']
export type HistoryItem = components['schemas']['VaultEntryHistoryItemResponse']

/** O que o formulário envia: `PUT` substitui a entrada inteira, então vai sempre tudo. */
export type EntryInput = {
  title: string
  login: string | null
  password: string
  additionalFields: Record<string, string> | null
}

/** Falhas que a interface sabe explicar. 403 e 404 não se distinguem: nada vaza sobre ids alheios. */
export type VaultFailure = 'notFound' | 'unauthorized' | 'validation' | 'network' | 'unknown'

export class VaultError extends Error {
  readonly failure: VaultFailure
  /** Erros por campo de um `ValidationProblem` do servidor (ex.: `title`). */
  readonly fieldErrors: Record<string, string[]>

  constructor(failure: VaultFailure, fieldErrors: Record<string, string[]> = {}) {
    super(failure)
    this.name = 'VaultError'
    this.failure = failure
    this.fieldErrors = fieldErrors
  }
}

type Outcome<T> = { data?: T; error?: unknown; response: Response }

function failureFor(status: number): VaultFailure {
  if (status === 401) {
    return 'unauthorized'
  }
  if (status === 403 || status === 404) {
    return 'notFound'
  }
  return status === 400 ? 'validation' : 'unknown'
}

function fieldErrorsOf(error: unknown): Record<string, string[]> {
  if (typeof error === 'object' && error !== null && 'errors' in error) {
    const errors = (error as { errors?: unknown }).errors
    if (typeof errors === 'object' && errors !== null) {
      return errors as Record<string, string[]>
    }
  }
  return {}
}

/** Executa a chamada e converte qualquer falha em `VaultError`. `notFoundIsOk`: 404 conta como feito. */
async function execute<T>(
  run: () => Promise<Outcome<T>>,
  { notFoundIsOk = false }: { notFoundIsOk?: boolean } = {},
): Promise<T | undefined> {
  let outcome: Outcome<T>
  try {
    outcome = await run()
  } catch {
    throw new VaultError('network')
  }
  const { data, error, response } = outcome
  if (response.ok) {
    return data
  }
  if (notFoundIsOk && response.status === 404) {
    return undefined
  }
  throw new VaultError(failureFor(response.status), fieldErrorsOf(error))
}

function required<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new VaultError('unknown')
  }
  return value
}

export async function listEntries(): Promise<EntryListItem[]> {
  return required(await execute(() => api.GET('/vault/entries')))
}

export async function listTrash(): Promise<EntryListItem[]> {
  return required(await execute(() => api.GET('/vault/entries/trash')))
}

/** Traz a senha decifrada: só o detalhe e o histórico carregam segredo (ver `vault-queries.ts`). */
export async function getEntry(id: string): Promise<EntryDetail> {
  return required(await execute(() => api.GET('/vault/entries/{id}', { params: { path: { id } } })))
}

export async function getHistory(id: string): Promise<HistoryItem[]> {
  return required(
    await execute(() => api.GET('/vault/entries/{id}/history', { params: { path: { id } } })),
  )
}

/** Devolve só o `id`: a resposta traz a senha em texto e não pode ficar no cache de mutações. */
export async function createEntry(body: EntryInput): Promise<{ id: string }> {
  const detail = required(await execute(() => api.POST('/vault/entries', { body })))
  return { id: detail.id }
}

/** Devolve só o `id`, pelo mesmo motivo de `createEntry`. */
export async function updateEntry(id: string, body: EntryInput): Promise<{ id: string }> {
  const detail = required(
    await execute(() => api.PUT('/vault/entries/{id}', { params: { path: { id } }, body })),
  )
  return { id: detail.id }
}

/** 404 (a entrada já não existe: excluída de vez em outra aba) conta como feito. */
export async function softDeleteEntry(id: string): Promise<void> {
  await execute(() => api.DELETE('/vault/entries/{id}', { params: { path: { id } } }), {
    notFoundIsOk: true,
  })
}

/** 404 (já restaurada ou excluída em outra aba) conta como feito. */
export async function restoreEntry(id: string): Promise<void> {
  await execute(() => api.POST('/vault/entries/{id}/restore', { params: { path: { id } } }), {
    notFoundIsOk: true,
  })
}

/** 404 (já excluída em outra aba) conta como feito. */
export async function permanentlyDeleteEntry(id: string): Promise<void> {
  await execute(() => api.DELETE('/vault/entries/{id}/permanent', { params: { path: { id } } }), {
    notFoundIsOk: true,
  })
}
