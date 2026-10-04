import { CircleAlert } from 'lucide-react'
import { cloneElement, useId, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type FormFieldProps = {
  label: string
  /** Mensagem de erro já traduzida; quando presente, o campo é marcado como inválido. */
  error?: string
  className?: string
  /** O controle (ex.: `<Input />`); recebe `id`, `aria-invalid` e `aria-describedby`. */
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>
}

/** Rótulo + controle + mensagem de erro, ligados por ARIA. Agnóstico de domínio. */
export function FormField({ label, error, className, children }: FormFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
      })}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-foreground">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      )}
    </div>
  )
}

/** Ajuda curta sob um campo ou formulário. */
export function FormHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}
