import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { CopyButton } from './CopyButton'
import { RevealButton } from './RevealButton'
import { useReveal } from './use-reveal'

type SecretValueProps = {
  /** Rótulo visível, já traduzido (ex.: "Senha"). */
  label: string
  value: string
}

/**
 * Um segredo somente leitura: oculto por padrão, revelado sob ação do usuário (e ocultado sozinho,
 * ver `useReveal`), com cópia pelo clipboard de segredos. A senha só existe no DOM neste campo.
 */
export function SecretValue({ label, value }: SecretValueProps) {
  const { revealed, toggle } = useReveal()
  const id = useId()
  const what = label.toLowerCase()

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          readOnly
          autoComplete="off"
          type={revealed ? 'text' : 'password'}
          value={value}
        />
        <RevealButton label={what} revealed={revealed} onToggle={toggle} />
        <CopyButton what={what} value={value} />
      </div>
    </div>
  )
}
