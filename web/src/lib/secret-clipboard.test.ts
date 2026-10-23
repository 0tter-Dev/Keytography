import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLIPBOARD_CLEAR_MS,
  READ_TIMEOUT_MS,
  clearPendingClipboard,
  copySecret,
  isClipboardAvailable,
  resetSecretClipboard,
} from './secret-clipboard'

type ClipboardMock = {
  content: string
  writeText: ReturnType<typeof vi.fn>
  readText: ReturnType<typeof vi.fn> | undefined
}

/** Clipboard simulado: guarda o conteúdo, e `writeText`/`readText` podem ser ajustados por teste. */
function installClipboard({ withRead = true }: { withRead?: boolean } = {}): ClipboardMock {
  const mock: ClipboardMock = {
    content: '',
    writeText: vi.fn(async (text: string) => {
      mock.content = text
    }),
    readText: withRead ? vi.fn(async () => mock.content) : undefined,
  }
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mock.writeText, readText: mock.readText },
    configurable: true,
  })
  return mock
}

function setFocus(focused: boolean) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
}

const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms)

beforeEach(() => {
  vi.useFakeTimers()
  setFocus(true)
})

afterEach(() => {
  resetSecretClipboard()
  vi.useRealTimers()
  vi.restoreAllMocks()
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('copiar um segredo', () => {
  it('o tempo até a limpeza é de 20 segundos', () => {
    expect(CLIPBOARD_CLEAR_MS).toBe(20_000)
  })

  it('coloca o valor no clipboard', async () => {
    const clipboard = installClipboard()

    expect(await copySecret('segredo')).toBe('copied')
    expect(clipboard.content).toBe('segredo')
  })

  it('sem clipboard no navegador (ou contexto não seguro), informa indisponível', async () => {
    Reflect.deleteProperty(navigator, 'clipboard')

    expect(isClipboardAvailable()).toBe(false)
    expect(await copySecret('segredo')).toBe('unavailable')
  })

  it('escrita recusada informa indisponível e não agenda limpeza', async () => {
    const clipboard = installClipboard()
    clipboard.writeText.mockRejectedValueOnce(new DOMException('negado', 'NotAllowedError'))

    expect(await copySecret('segredo')).toBe('unavailable')
    await advance(60_000)
    expect(clipboard.writeText).toHaveBeenCalledTimes(1)
  })
})

describe('limpeza programada', () => {
  it('com foco e o conteúdo ainda sendo o copiado, limpa aos 20 s (e não antes)', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')

    await advance(19_999)
    expect(clipboard.content).toBe('segredo')
    await advance(2)

    expect(clipboard.content).toBe('')
  })

  it('se a pessoa copiou OUTRA coisa nesse tempo, não apaga', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')
    clipboard.content = 'outra coisa que a pessoa copiou'

    await advance(20_001)

    expect(clipboard.content).toBe('outra coisa que a pessoa copiou')
  })

  it('leitura negada: limpa assim mesmo', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')
    clipboard.readText?.mockRejectedValue(new DOMException('negado', 'NotAllowedError'))

    await advance(20_001)

    expect(clipboard.content).toBe('')
  })

  it('navegador sem leitura de clipboard: limpa assim mesmo', async () => {
    const clipboard = installClipboard({ withRead: false })
    await copySecret('segredo')

    await advance(20_001)

    expect(clipboard.content).toBe('')
  })

  it('sem foco aos 20 s fica pendente e limpa UMA vez quando a janela volta a ter foco', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')
    setFocus(false)

    await advance(20_001)
    expect(clipboard.content).toBe('segredo')
    expect(clipboard.writeText).toHaveBeenCalledTimes(1)

    setFocus(true)
    window.dispatchEvent(new Event('focus'))
    await advance(0)
    expect(clipboard.content).toBe('')
    expect(clipboard.writeText).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('focus'))
    await advance(0)
    expect(clipboard.writeText).toHaveBeenCalledTimes(2) // não repete
  })

  it('escrita recusada na hora de limpar (perdeu o foco no meio) espera o foco e tenta de novo', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')
    clipboard.writeText.mockRejectedValueOnce(new DOMException('sem foco', 'NotAllowedError'))

    await advance(20_001)
    expect(clipboard.content).toBe('segredo')

    window.dispatchEvent(new Event('focus'))
    await advance(0)
    expect(clipboard.content).toBe('')
  })

  it('copiar de novo substitui a limpeza pendente: só vale o prazo da cópia mais nova', async () => {
    const clipboard = installClipboard()
    await copySecret('primeiro')
    await advance(15_000)
    await copySecret('segundo')

    await advance(10_000) // 25 s desde a primeira, 10 s desde a segunda
    expect(clipboard.content).toBe('segundo')

    await advance(10_001)
    expect(clipboard.content).toBe('')
  })

  it('uma cópia nova cancela a espera de foco da anterior', async () => {
    const clipboard = installClipboard()
    await copySecret('primeiro')
    setFocus(false)
    await advance(20_001) // primeiro fica esperando o foco
    setFocus(true)
    await copySecret('segundo')

    window.dispatchEvent(new Event('focus'))
    await advance(0)

    expect(clipboard.content).toBe('segundo') // o foco não limpou a cópia nova antes do prazo
  })
})

describe('limpar na hora (logout, expiração da sessão)', () => {
  it('limpa o que ainda está pendente e cancela o prazo', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')

    await clearPendingClipboard()
    expect(clipboard.content).toBe('')

    clipboard.content = 'depois'
    await advance(60_000)
    expect(clipboard.content).toBe('depois') // o prazo antigo não roda de novo
  })

  it('sem nada pendente, não mexe no clipboard', async () => {
    const clipboard = installClipboard()

    await clearPendingClipboard()

    expect(clipboard.writeText).not.toHaveBeenCalled()
  })

  it('sem foco, fica esperando o foco (e limpa quando ele volta)', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')
    setFocus(false)

    await clearPendingClipboard()
    expect(clipboard.content).toBe('segredo')

    setFocus(true)
    window.dispatchEvent(new Event('focus'))
    await advance(0)
    expect(clipboard.content).toBe('')
  })
})

describe('leitura do clipboard que não responde', () => {
  it('o tempo de espera pela leitura é de 2 segundos', () => {
    expect(READ_TIMEOUT_MS).toBe(2_000)
  })

  it('leitura pendente (prompt de permissão) é tratada como negada: limpa 2 s depois do prazo', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')
    clipboard.readText?.mockImplementation(() => new Promise<string>(() => undefined)) // nunca resolve

    await advance(21_999)
    expect(clipboard.content).toBe('segredo') // ainda esperando a leitura
    await advance(2)

    expect(clipboard.content).toBe('')
  })

  it('o logout com a leitura pendente também termina (limpa depois do tempo de espera)', async () => {
    const clipboard = installClipboard()
    await copySecret('segredo')
    clipboard.readText?.mockImplementation(() => new Promise<string>(() => undefined))

    const clearing = clearPendingClipboard()
    await advance(2_001)
    await clearing

    expect(clipboard.content).toBe('')
  })
})

describe('cópia em andamento durante o logout ou outra cópia', () => {
  it('uma cópia que ainda estava sendo escrita quando a sessão terminou é apagada assim que a escrita termina', async () => {
    const clipboard = installClipboard()
    let finishWrite: () => void = () => {}
    clipboard.writeText.mockImplementationOnce(async (text: string) => {
      await new Promise<void>((resolve) => {
        finishWrite = resolve
      })
      clipboard.content = text
    })

    const copying = copySecret('segredo')
    await clearPendingClipboard() // o logout acontece enquanto a escrita está em voo
    finishWrite()

    expect(await copying).toBe('cancelled')
    expect(clipboard.content).toBe('') // o segredo não ficou no clipboard
    await advance(60_000)
    expect(clipboard.content).toBe('')
  })

  it('duas cópias seguidas: só a mais nova agenda a limpeza (a que termina depois não a adia)', async () => {
    const clipboard = installClipboard()
    let finishFirst: () => void = () => {}
    clipboard.writeText.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
    })

    const first = copySecret('primeiro') // escrita lenta
    clipboard.content = ''
    await copySecret('segundo') // escrita rápida; o prazo conta daqui
    await advance(10_000)
    finishFirst()
    await first

    await advance(10_001) // 20 s desde a cópia mais nova
    expect(clipboard.content).toBe('')
  })
})

describe('cópias que se sobrepõem', () => {
  it('copiar de novo enquanto a leitura da cópia anterior está pendente: a leitura velha não apaga a nova', async () => {
    const clipboard = installClipboard()
    await copySecret('primeiro')
    let finishRead: (text: string) => void = () => {}
    clipboard.readText?.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finishRead = resolve
        }),
    )

    await advance(20_001) // a limpeza da primeira começa e fica esperando a leitura
    await copySecret('segundo') // outra cópia assume o clipboard
    finishRead('primeiro') // a leitura velha termina com o texto da primeira
    await advance(0)

    expect(clipboard.content).toBe('segundo') // não foi apagada pela limpeza da primeira
  })

  it('a cópia mais nova falha: a anterior, que terminou depois, continua com a limpeza agendada', async () => {
    const clipboard = installClipboard()
    let finishFirst: () => void = () => {}
    clipboard.writeText.mockImplementationOnce(async (text: string) => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      clipboard.content = text
    })
    clipboard.writeText.mockRejectedValueOnce(new DOMException('negado', 'NotAllowedError'))

    const first = copySecret('primeiro') // escrita lenta
    expect(await copySecret('segundo')).toBe('unavailable') // a mais nova é recusada
    finishFirst()
    expect(await first).toBe('copied')

    await advance(20_001)
    expect(clipboard.content).toBe('') // a primeira foi limpa no prazo
  })

  it('a cópia mais nova já foi limpa quando a anterior termina: a anterior volta a ter a limpeza agendada', async () => {
    const clipboard = installClipboard()
    let finishFirst: () => void = () => {}
    clipboard.writeText.mockImplementationOnce(async (text: string) => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve
      })
      clipboard.content = text
    })

    const first = copySecret('primeiro') // escrita muito lenta
    await copySecret('segundo')
    await advance(20_001) // a limpeza da segunda já rodou
    finishFirst()
    expect(await first).toBe('copied')
    expect(clipboard.content).toBe('primeiro')

    await advance(20_001)
    expect(clipboard.content).toBe('') // a primeira não ficou sem limpeza
  })
})
