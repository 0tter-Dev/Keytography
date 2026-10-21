import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  createEntry,
  getEntry,
  getHistory,
  listEntries,
  listTrash,
  permanentlyDeleteEntry,
  restoreEntry,
  softDeleteEntry,
  updateEntry,
  type EntryInput,
} from './vault-api'

/**
 * Chaves das consultas do cofre. As listas (título, login, data) não têm segredo; o detalhe e o
 * histórico trazem a senha decifrada e por isso vivem só enquanto estão na tela (`gcTime: 0`).
 */
export const vaultKeys = {
  entries: ['vault', 'entries'] as const,
  trash: ['vault', 'trash'] as const,
  entry: (id: string) => ['vault', 'entry', id] as const,
  history: (id: string) => ['vault', 'history', id] as const,
}

export function useEntries() {
  return useQuery({ queryKey: vaultKeys.entries, queryFn: listEntries })
}

export function useTrash() {
  return useQuery({ queryKey: vaultKeys.trash, queryFn: listTrash })
}

/** Detalhe com a senha: `gcTime: 0` e sempre fresco (a edição nunca abre com dado velho). */
export function useEntry(id: string) {
  return useQuery({
    queryKey: vaultKeys.entry(id),
    queryFn: () => getEntry(id),
    gcTime: 0,
    staleTime: 0,
  })
}

/** Histórico com as senhas anteriores: carregado só quando `enabled`, e com `gcTime: 0`. */
export function useHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: vaultKeys.history(id),
    queryFn: () => getHistory(id),
    gcTime: 0,
    staleTime: 0,
    enabled,
  })
}

/**
 * Depois de qualquer mudança, recarrega as listas. Detalhe e histórico (com senha) não precisam ser
 * descartados aqui: com `gcTime: 0` já saem da memória quando a tela é deixada.
 */
async function refreshAfterChange(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: vaultKeys.entries }),
    queryClient.invalidateQueries({ queryKey: vaultKeys.trash }),
  ])
}

/**
 * Mutações do cofre. `gcTime: 0` e retorno reduzido ao `id` (ver `vault-api.ts`): nem o resultado
 * da mutação guarda a senha na memória do cache de mutações.
 */
function useVaultMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    gcTime: 0,
    onSuccess: () => refreshAfterChange(queryClient),
  })
}

export function useCreateEntry() {
  return useVaultMutation((body: EntryInput) => createEntry(body))
}

export function useUpdateEntry(id: string) {
  return useVaultMutation((body: EntryInput) => updateEntry(id, body))
}

export function useSoftDeleteEntry() {
  return useVaultMutation((id: string) => softDeleteEntry(id))
}

export function useRestoreEntry() {
  return useVaultMutation((id: string) => restoreEntry(id))
}

export function usePermanentlyDeleteEntry() {
  return useVaultMutation((id: string) => permanentlyDeleteEntry(id))
}
