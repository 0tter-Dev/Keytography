import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Combina classes condicionais e resolve conflitos do Tailwind (a última vence). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
