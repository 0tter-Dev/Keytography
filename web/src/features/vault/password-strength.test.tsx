import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import {
  KNOWN_CRITERIA,
  displayScore,
  strengthBand,
  validCriteria,
  type CriterionResult,
} from './password-strength'
import { PasswordStrength } from './PasswordStrength'

const { strength } = ptBR.vault

const pass = (score = 100): CriterionResult => ({ score, passed: true })
const fail = (score = 10): CriterionResult => ({ score, passed: false })

const ALL_PASSED = {
  length: pass(),
  entropy: pass(90),
  reuse: pass(),
  complexity: pass(80),
}

/** Os dois casos reais que a verificação manual mostrou (a média da API esconde reprovações). */
const ABC = { length: fail(18.75), entropy: fail(17.6), reuse: pass(), complexity: pass() }
const REPEATED_STRONG = { length: pass(), entropy: pass(), reuse: fail(0), complexity: pass() }

/** A linha da lista de critérios com o rótulo dado. */
function row(label: string): HTMLElement {
  const item = screen.getAllByRole('listitem').find((li) => within(li).queryByText(label))
  if (!item) {
    throw new Error(`critério não encontrado: ${label}`)
  }
  return item
}

describe('faixas e fronteiras da nota (sem detalhamento, vale só a nota)', () => {
  it.each([
    [0, 'Fraca'],
    [39, 'Fraca'],
    [40, 'Média'],
    [69, 'Média'],
    [70, 'Forte'],
    [100, 'Forte'],
  ])('nota %i é %s (no resumo, no nome acessível e no valor do medidor)', (score, band) => {
    render(<PasswordStrength score={score} />)

    expect(screen.getByText(`${band} · ${score} de 100`)).toBeInTheDocument()
    const meter = screen.getByRole('meter', { name: strength.meterLabel })
    expect(meter).toHaveAttribute('aria-valuenow', String(score))
    expect(meter).toHaveAttribute('aria-valuemin', '0')
    expect(meter).toHaveAttribute('aria-valuemax', '100')
    expect(meter).toHaveAttribute('aria-valuetext', `${band}, ${score} de 100`)
  })

  it('a nota é arredondada antes da faixa, para o número e o nome nunca discordarem', () => {
    render(<PasswordStrength score={39.6} />)

    expect(screen.getByText('Média · 40 de 100')).toBeInTheDocument()
  })

  it.each([
    [-5, 'Fraca · 0 de 100', '0'],
    [150, 'Forte · 100 de 100', '100'],
  ])('a nota %i fora da faixa é limitada a 0 a 100', (score, summary, now) => {
    render(<PasswordStrength score={score} />)

    expect(screen.getByText(summary)).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', now)
  })

  it('a barra tem a cor da faixa e a largura da nota (só reforço: a informação está em texto)', () => {
    const { rerender } = render(<PasswordStrength score={20} />)
    const bar = () => screen.getByRole('meter').firstElementChild as HTMLElement

    expect(bar()).toHaveClass('bg-destructive')
    expect(bar()).toHaveStyle({ width: '20%' })
    rerender(<PasswordStrength score={55} />)
    expect(bar()).toHaveClass('bg-warning')
    rerender(<PasswordStrength score={90} />)
    expect(bar()).toHaveClass('bg-success')
  })

  it('as funções puras seguem as mesmas fronteiras', () => {
    expect([39, 40, 69, 70].map((score) => strengthBand(score))).toEqual([
      'weak',
      'medium',
      'medium',
      'strong',
    ])
    expect(displayScore(Number.NaN)).toBeNull()
    expect(displayScore(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('a faixa é rebaixada pelos critérios que reprovaram', () => {
  it('todos os critérios atendidos e nota alta: forte', () => {
    render(<PasswordStrength score={82} detail={ALL_PASSED} />)

    expect(screen.getByText('Forte · 82 de 100')).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Forte, 82 de 100')
  })

  it('um critério reprovado impede "forte" mesmo com nota alta (a senha forte repetida)', () => {
    render(<PasswordStrength score={75} detail={REPEATED_STRONG} />)

    expect(screen.getByText('Média · 75 de 100')).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Média, 75 de 100')
    expect(screen.getByRole('meter').firstElementChild).toHaveClass('bg-warning')
  })

  it('metade dos critérios reprovada é fraca, mesmo com a nota média (a senha curta e simples)', () => {
    render(<PasswordStrength score={59} detail={ABC} />)

    expect(screen.getByText('Fraca · 59 de 100')).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Fraca, 59 de 100')
    expect(screen.getByRole('meter').firstElementChild).toHaveClass('bg-destructive')
  })

  it('o limite é "metade ou mais": 2 de 4 reprovados é fraca e 1 de 3 não é', () => {
    const { rerender } = render(
      <PasswordStrength score={90} detail={{ a: pass(), b: pass(), c: fail(), d: fail() }} />,
    )
    expect(screen.getByText('Fraca · 90 de 100')).toBeInTheDocument()

    rerender(<PasswordStrength score={90} detail={{ a: pass(), b: pass(), c: fail() }} />)
    expect(screen.getByText('Média · 90 de 100')).toBeInTheDocument()
  })

  it('com um único critério: atendido é forte e reprovado é fraca', () => {
    const { rerender } = render(<PasswordStrength score={85} detail={{ length: pass() }} />)
    expect(screen.getByText('Forte · 85 de 100')).toBeInTheDocument()

    rerender(<PasswordStrength score={85} detail={{ length: fail() }} />)
    expect(screen.getByText('Fraca · 85 de 100')).toBeInTheDocument()
  })

  it('os critérios nunca elevam a faixa: nota baixa continua fraca e nota média continua média', () => {
    const { rerender } = render(<PasswordStrength score={30} detail={ALL_PASSED} />)
    expect(screen.getByText('Fraca · 30 de 100')).toBeInTheDocument()

    rerender(<PasswordStrength score={55} detail={ALL_PASSED} />)
    expect(screen.getByText('Média · 55 de 100')).toBeInTheDocument()

    // Um critério reprovado (menos da metade) com nota baixa também não eleva a faixa.
    rerender(<PasswordStrength score={30} detail={{ a: pass(), b: pass(), c: fail() }} />)
    expect(screen.getByText('Fraca · 30 de 100')).toBeInTheDocument()
  })

  it('um critério desconhecido que reprova conta como qualquer outro', () => {
    render(<PasswordStrength score={90} detail={{ ...ALL_PASSED, dictionaryWords: fail() }} />)

    expect(screen.getByText('Média · 90 de 100')).toBeInTheDocument()
  })

  it('detalhamento nulo ou vazio: vale só a nota', () => {
    const { rerender } = render(<PasswordStrength score={85} detail={null} />)
    expect(screen.getByText('Forte · 85 de 100')).toBeInTheDocument()

    rerender(<PasswordStrength score={85} detail={{}} />)
    expect(screen.getByText('Forte · 85 de 100')).toBeInTheDocument()
  })

  it('a função pura aplica as mesmas regras', () => {
    expect(strengthBand(75, [pass(), pass(), fail(), pass()])).toBe('medium')
    expect(strengthBand(59, [fail(), fail(), pass(), pass()])).toBe('weak')
    expect(strengthBand(30, [pass()])).toBe('weak')
    expect(strengthBand(85, [])).toBe('strong')
  })

  it('o resumo de critérios atendidos aparece com o detalhamento e não sem ele', () => {
    const { rerender } = render(<PasswordStrength score={59} detail={ABC} />)
    expect(screen.getByText('Critérios atendidos: 2 de 4')).toBeInTheDocument()

    rerender(<PasswordStrength score={59} />)
    expect(screen.queryByText(/Critérios atendidos/)).not.toBeInTheDocument()
  })

  it('o resumo visível não é repetido pelo leitor de tela (o medidor já anuncia a faixa e a nota)', () => {
    render(<PasswordStrength score={59} detail={ABC} />)

    expect(screen.getByText('Fraca · 59 de 100')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuetext', 'Fraca, 59 de 100')
  })
})

describe('nota ausente', () => {
  it.each([null, undefined, Number.NaN, '75', {}])(
    'a nota %s é "Ainda não avaliada", nunca fraca nem forte, e não há medidor',
    (score) => {
      render(<PasswordStrength score={score as number | null} />)

      expect(screen.getByText(strength.notEvaluated)).toBeInTheDocument()
      expect(screen.queryByRole('meter')).not.toBeInTheDocument()
      for (const band of Object.values(strength.bands)) {
        expect(screen.queryByText(new RegExp(band))).not.toBeInTheDocument()
      }
    },
  )

  it('nota presente com detalhamento nulo mostra só o medidor, sem lista de critérios', () => {
    render(<PasswordStrength score={80} detail={null} />)

    expect(screen.getByRole('meter')).toBeInTheDocument()
    expect(screen.queryByText(strength.criteriaTitle)).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('detalhamento sem a nota mostra os critérios e o aviso de não avaliada', () => {
    render(<PasswordStrength score={null} detail={ALL_PASSED} />)

    expect(screen.getByText(strength.notEvaluated)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })
})

describe('critérios', () => {
  it('mostram rótulos legíveis em português e nunca as chaves técnicas da API', () => {
    render(<PasswordStrength score={80} detail={ALL_PASSED} />)

    for (const label of [
      'Tamanho',
      'Variedade de caracteres',
      'Senha não reutilizada',
      'Previsibilidade',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    for (const key of ['length', 'entropy', 'reuse', 'complexity']) {
      expect(screen.queryByText(new RegExp(`\\b${key}\\b`))).not.toBeInTheDocument()
    }
  })

  it('todo critério conhecido tem rótulo traduzido', () => {
    for (const key of KNOWN_CRITERIA) {
      const label = (strength.criteria as Record<string, string>)[key]
      expect(label, key).toBeTruthy()
      expect(label).not.toBe(key)
    }
  })

  it('o estado de cada critério está em texto e em ícone, com a nota do critério', () => {
    render(<PasswordStrength score={50} detail={{ length: pass(), reuse: fail(0) }} />)

    const length = row('Tamanho')
    const reuse = row('Senha não reutilizada')
    expect(length).toHaveTextContent('Atende · nota 100')
    expect(reuse).toHaveTextContent('Não atende · nota 0')
    expect(length.querySelector('svg.lucide-check')).not.toBeNull()
    expect(length.querySelector('svg.lucide-x')).toBeNull()
    expect(reuse.querySelector('svg.lucide-x')).not.toBeNull()
    expect(reuse.querySelector('svg.lucide-check')).toBeNull()
    expect(length.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('seguem a ordem em que a API os devolveu', () => {
    render(
      <PasswordStrength score={80} detail={{ reuse: pass(), length: pass(), entropy: pass() }} />,
    )

    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.split('Atende')[0])).toEqual(
      ['Senha não reutilizada', 'Tamanho', 'Variedade de caracteres'],
    )
  })

  it('um critério desconhecido aparece com o rótulo genérico, sem a chave técnica e sem quebrar', () => {
    render(<PasswordStrength score={60} detail={{ ...ALL_PASSED, dictionaryWords: fail() }} />)

    expect(screen.getByText(strength.criteria.unknown)).toBeInTheDocument()
    expect(screen.queryByText(/dictionaryWords/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('só "passed" verdadeiro conta como atende, e a nota do critério fora da faixa é limitada', () => {
    render(
      <PasswordStrength
        score={60}
        detail={{
          length: { score: 250, passed: 'sim' as unknown as boolean },
          entropy: { score: Number.NaN, passed: true },
        }}
      />,
    )

    expect(screen.getByText('Fraca · 60 de 100')).toBeInTheDocument() // 1 de 2 reprovado
    expect(row('Tamanho')).toHaveTextContent('Não atende · nota 100')
    expect(row('Variedade de caracteres')).toHaveTextContent('Atende')
    expect(row('Variedade de caracteres')).not.toHaveTextContent('nota')
    expect(screen.getByText('Critérios atendidos: 1 de 2')).toBeInTheDocument() // só `passed: true`
  })
})

describe('dados estranhos da API não quebram a tela', () => {
  it('um critério nulo é ignorado e não entra na conta', () => {
    render(
      <PasswordStrength
        score={90}
        detail={{ length: null, reuse: pass() } as unknown as Record<string, CriterionResult>}
      />,
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByText('Critérios atendidos: 1 de 1')).toBeInTheDocument()
    expect(screen.getByText('Forte · 90 de 100')).toBeInTheDocument()
  })

  it.each([
    ['uma lista', [pass()]],
    ['um texto', 'abc'],
    ['um número', 7],
    ['um booleano', true],
  ])('um detalhamento que é %s não mostra critérios e não quebra', (_name, detail) => {
    render(
      <PasswordStrength score={80} detail={detail as unknown as Record<string, CriterionResult>} />,
    )

    expect(screen.getByRole('meter')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })

  it('chaves que são nomes especiais de objeto viram o rótulo genérico', () => {
    const detail = JSON.parse(
      '{"__proto__": {"score": 1, "passed": false}, "constructor": {"score": 1, "passed": true}, "toString": {"score": 1, "passed": true}}',
    ) as Record<string, CriterionResult>

    render(<PasswordStrength score={80} detail={detail} />)

    expect(screen.getAllByText(strength.criteria.unknown)).toHaveLength(3)
  })

  it('as funções puras ignoram o que não é critério', () => {
    expect(validCriteria(null)).toEqual([])
    expect(validCriteria([pass()])).toEqual([])
    expect(validCriteria({ a: null, b: 3, c: pass() })).toEqual([['c', pass()]])
  })
})

describe('estrutura e acessibilidade', () => {
  it('é uma região com o nome da seção, com título de nível 2 e subtítulo de nível 3', () => {
    render(<PasswordStrength score={59} detail={ABC} />)

    const region = screen.getByRole('region', { name: strength.title })
    expect(
      within(region).getByRole('heading', { level: 2, name: strength.title }),
    ).toBeInTheDocument()
    expect(
      within(region).getByRole('heading', { level: 3, name: strength.criteriaTitle }),
    ).toBeInTheDocument()
  })
})
