import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

type RevealButtonProps = {
  /** Nome do segredo, já traduzido (ex.: "senha"). */
  label: string
  revealed: boolean
  onToggle: () => void
}

/** Alterna mostrar/ocultar um segredo (o estado e o auto-ocultar vivem em `useReveal`). */
export function RevealButton({ label, revealed, onToggle }: RevealButtonProps) {
  const { t } = useTranslation()

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={revealed ? t('vault.secret.hide', { label }) : t('vault.secret.show', { label })}
      onClick={onToggle}
    >
      {revealed ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </Button>
  )
}
