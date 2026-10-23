import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** Bloco pulsante de carregamento; decorativo (o estado é anunciado pelo contêiner). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('h-5 animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  )
}
