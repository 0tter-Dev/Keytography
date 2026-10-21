/**
 * Área de transferência para segredos (ADR-0007). Copiar coloca o valor no clipboard e agenda a
 * limpeza em `CLIPBOARD_CLEAR_MS`:
 *
 * - com a página em foco, lê o clipboard e só o limpa se ele ainda tiver o que foi copiado (se a
 *   pessoa copiou outra coisa nesse tempo, não se apaga); se a leitura for negada, limpa assim mesmo;
 * - sem foco (a pessoa foi colar em outro aplicativo), o navegador recusa escrever: a limpeza fica
 *   pendente e roda uma vez quando a janela volta a ter foco;
 * - copiar de novo substitui a limpeza pendente; `clearPendingClipboard` (logout, expiração) tenta
 *   limpar na hora.
 *
 * É melhor esforço: fechar a aba antes da limpeza deixa o valor no clipboard.
 */

/** Tempo até a limpeza do clipboard depois de copiar. */
export const CLIPBOARD_CLEAR_MS = 20_000

type Pending = {
  text: string
  timer: ReturnType<typeof setTimeout> | null
  waitingForFocus: boolean
}

let pending: Pending | null = null

export function isClipboardAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function'
}

/** Zera o estado de módulo (limpeza pendente). Só para os testes. */
export function resetSecretClipboard(): void {
  if (pending?.timer) {
    clearTimeout(pending.timer)
  }
  pending = null
  window.removeEventListener('focus', onFocus)
}

/** Copia `text` e agenda a limpeza; `unavailable` se o navegador não oferece (ou recusa) o clipboard. */
export async function copySecret(text: string): Promise<'copied' | 'unavailable'> {
  if (!isClipboardAvailable()) {
    return 'unavailable'
  }
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return 'unavailable'
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

/** Lê o clipboard; `null` quando a leitura não é permitida ou não existe. */
async function readClipboard(): Promise<string | null> {
  try {
    if (typeof navigator.clipboard.readText !== 'function') {
      return null
    }
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}

function waitForFocus(entry: Pending): void {
  entry.waitingForFocus = true
  window.removeEventListener('focus', onFocus)
  window.addEventListener('focus', onFocus)
}
