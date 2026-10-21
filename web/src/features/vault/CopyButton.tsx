import { Copy } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { CLIPBOARD_CLEAR_MS, copySecret } from '@/lib/secret-clipboard'

type CopyButtonProps = {
  /** O que está sendo copiado, já traduzido (ex.: "senha"): vai para o nome acessível. */
  what: string
  value: string
}

/** Copia `value` pela política de segredos do clipboard (limpeza programada; ver ADR-0007). */
export function CopyButton({ what, value }: CopyButtonProps) {
  const { t } = useTranslation()

  async function copy() {
    const result = await copySecret(value)
    if (result === 'copied') {
      toast.success(t('vault.copy.done', { seconds: CLIPBOARD_CLEAR_MS / 1000 }))
    } else {
      toast.warning(t('vault.copy.unavailable'))
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={t('vault.copy.label', { what })}
      onClick={copy}
    >
      <Copy aria-hidden="true" />
    </Button>
  )
}
