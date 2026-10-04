import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const alertVariants = cva('rounded-md border px-3 py-2 text-sm text-foreground', {
  variants: {
    variant: {
      info: 'border-border bg-muted',
      success: 'border-success/40 bg-success/15',
      destructive: 'border-destructive/40 bg-destructive/15',
    },
  },
  defaultVariants: { variant: 'info' },
})

type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>

/** Mensagem de status em bloco. `destructive` anuncia-se como `role="alert"`. */
export function Alert({ className, variant, role, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (variant === 'destructive' ? 'alert' : 'status')}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}
