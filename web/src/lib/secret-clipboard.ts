/**
 * Área de transferência para segredos (ADR-0007). Copiar coloca o valor no clipboard e agenda a
 * limpeza em `CLIPBOARD_CLEAR_MS`:
 *
 * - com a página em foco, lê o clipboard (por no máximo `READ_TIMEOUT_MS`) e só o limpa se ele ainda
 *   tiver o que foi copiado (se a pessoa copiou outra coisa nesse tempo, não se apaga); se a leitura
 *   for negada, indisponível ou ficar pendente (prompt de permissão), limpa assim mesmo;
 * - sem foco (a pessoa foi colar em outro aplicativo), o navegador recusa escrever: a limpeza fica
 *   pendente e roda uma vez quando a janela volta a ter foco;
 * - copiar de novo substitui a limpeza pendente; `clearPendingClipboard` (logout, expiração) limpa na
 *   hora, inclusive uma cópia que ainda estava sendo escrita.
 *
 * É melhor esforço: fechar a aba antes da limpeza deixa o valor no clipboard, e navegadores que
 * exigem gesto do usuário para escrever só limpam quando a janela volta a ter foco.
 */

/** Tempo até a limpeza do clipboard depois de copiar. */
export const CLIPBOARD_CLEAR_MS = 20_000

/** Quanto esperar pela leitura do clipboard antes de tratá-la como negada. */
export const READ_TIMEOUT_MS = 2_000

type Pending = {
  text: string
  timer: ReturnType<typeof setTimeout> | null
  waitingForFocus: boolean
}

let pending: Pending | null = null
/** Sobe a cada `clearPendingClipboard`: uma cópia iniciada antes dele não deve sobreviver. */
let generation = 0
/** Sobe a cada cópia: só a mais recente agenda a limpeza. */
let copySequence = 0

export function isClipboardAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
}

/** Zera o estado de módulo (limpeza pendente e contadores). Só para os testes. */
export function resetSecretClipboard(): void {
  if (pending?.timer) {
    clearTimeout(pending.timer)
  }
  pending = null
  generation = 0
  copySequence = 0
  window.removeEventListener('focus', onFocus)
}

/** Copia `text` e agenda a limpeza; `unavailable` se o navegador não oferece (ou recusa) o clipboard. */
export async function copySecret(text: string): Promise<'copied' | 'unavailable'> {
  if (!isClipboardAvailable()) {
    return 'unavailable'
  }
  const startedIn = generation
  const sequence = ++copySequence
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return 'unavailable'
  }

  if (generation !== startedIn) {
    // O logout/expiração aconteceu enquanto a cópia era escrita: o segredo não pode ficar.
    await writeEmpty()
    return 'unavailable'
  }
  if (sequence !== copySequence) {
    return 'copied' // uma cópia mais nova assumiu a limpeza
  }

  dropPending()
  const entry: Pending = { text, timer: null, waitingForFocus: false }
  entry.timer = setTimeout(() => {
    entry.timer = null
    void attemptClear(entry)
  }, CLIPBOARD_CLEAR_MS)
  pending = entry
  return 'copied'
}

/** Limpa agora o que foi copiado e ainda não foi limpo (logout, expiração da sessão). */
export async function clearPendingClipboard(): Promise<void> {
  generation += 1
  const entry = pending
  if (!entry) {
    return
  }
  if (entry.timer) {
    clearTimeout(entry.timer)
    entry.timer = null
  }
  await attemptClear(entry)
}

function dropPending(): void {
  if (pending?.timer) {
    clearTimeout(pending.timer)
  }
  pending = null
  window.removeEventListener('focus', onFocus)
}

function onFocus(): void {
  window.removeEventListener('focus', onFocus)
  const entry = pending
  if (entry?.waitingForFocus) {
    void attemptClear(entry)
  }
}

async function writeEmpty(): Promise<void> {
  try {
    await navigator.clipboard.writeText('')
  } catch {
    // sem foco ou sem permissão: não há mais o que fazer para uma cópia sem limpeza agendada
  }
}

async function attemptClear(entry: Pending): Promise<void> {
  if (pending !== entry) {
    return // substituída por uma cópia mais nova
  }
  if (!document.hasFocus()) {
    waitForFocus(entry)
    return
  }

  try {
    const current = await readClipboard()
    if (pending !== entry) {
      return
    }
    // Leitura permitida e conteúdo diferente: a pessoa copiou outra coisa, não apagamos.
    if (current !== null && current !== entry.text) {
      dropPending()
      return
    }
    await navigator.clipboard.writeText('')
    if (pending === entry) {
      dropPending()
    }
  } catch {
    // A escrita falhou (em geral, a janela perdeu o foco no meio): espera o foco voltar.
    if (pending === entry) {
      waitForFocus(entry)
    }
  }
}

/** Lê o clipboard; `null` quando a leitura não é permitida, não existe ou passa de `READ_TIMEOUT_MS`. */
async function readClipboard(): Promise<string | null> {
  if (typeof navigator.clipboard.readText !== 'function') {
    return null
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS)
  })
  try {
    return await Promise.race([navigator.clipboard.readText(), timeout])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function waitForFocus(entry: Pending): void {
  entry.waitingForFocus = true
  window.removeEventListener('focus', onFocus)
  window.addEventListener('focus', onFocus)
}
