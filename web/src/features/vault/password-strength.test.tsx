import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ptBR from '@/i18n/locales/pt-BR.json'
import { displayScore, strengthBand } from './password-strength'
import { PasswordStrength } from './PasswordStrength'

const { strength } = ptBR.vault

const ALL_PASSED = {
  length: { score: 100, passed: true },
  entropy: { score: 90, passed: true },
  reuse: { score: 100, passed: true },
  complexity: { score: 80, passed: true },
}

describe('faixas e fronteiras da nota', () => {
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
    expect([39, 40, 69, 70].map(strengthBand)).toEqual(['weak', 'medium', 'medium', 'strong'])
    expect(displayScore(Number.NaN)).toBeNull()
    expect(displayScore(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('nota ausente', () => {
  it.each([null, undefined, Number.NaN])(
    'a nota %s é "Ainda não avaliada", nunca fraca nem forte, e não há medidor',
    (score) => {
      render(<PasswordStrength score={score} />)

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

  it('o estado de cada critério está em texto (atende ou não atende), com a nota do critério', () => {
    render(
      <PasswordStrength
        score={50}
        detail={{ length: { score: 100, passed: true }, reuse: { score: 0, passed: false } }}
      />,
    )

    const length = screen.getByText('Tamanho').closest('li') as HTMLElement
    const reuse = screen.getByText('Senha não reutilizada').closest('li') as HTMLElement
    expect(within(length).getByText(/Atende/)).toHaveTextContent('Atende · nota 100')
    expect(within(reuse).getByText(/Não atende/)).toHaveTextContent('Não atende · nota 0')
  })

  it('um critério desconhecido aparece com o rótulo genérico, sem a chave técnica e sem quebrar', () => {
    render(
      <PasswordStrength
        score={60}
        detail={{ ...ALL_PASSED, dictionaryWords: { score: 10, passed: false } }}
      />,
    )

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

    const length = screen.getByText('Tamanho').closest('li') as HTMLElement
    const entropy = screen.getByText('Variedade de caracteres').closest('li') as HTMLElement
    expect(length).toHaveTextContent('Não atende · nota 100')
    expect(entropy).toHaveTextContent('Atende')
    expect(entropy).not.toHaveTextContent('nota')
  })
})
