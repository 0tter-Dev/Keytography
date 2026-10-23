import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

type ConfirmPermanentDeleteDialogProps = {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Exclusão definitiva: irreversível, então só habilita a ação depois de digitar a palavra de
 * confirmação. O texto digitado vive no conteúdo do diálogo, que o Radix desmonta ao fechar: ele não
 * sobrevive ao diálogo, feche ele por onde fechar (Esc, cancelar, fim da ação).
 */
export function ConfirmPermanentDeleteDialog({
  open,
  pending,
  onOpenChange,
  onConfirm,
}: ConfirmPermanentDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <ConfirmBody pending={pending} onConfirm={onConfirm} />
      </DialogContent>
    </Dialog>
  )
}

function ConfirmBody({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  const { t } = useTranslation()
  const word = t('vault.confirmDelete.word')
  const [typed, setTyped] = useState('')
  const confirmed = typed.trim().toLowerCase() === word.toLowerCase()

  return (
    <>
      <DialogTitle className="text-lg font-semibold">{t('vault.confirmDelete.title')}</DialogTitle>
      <DialogDescription className="text-sm text-muted-foreground">
        {t('vault.confirmDelete.description', { word })}
      </DialogDescription>
      <FormField label={t('vault.confirmDelete.label')}>
        <Input
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button variant="ghost">{t('vault.confirmDelete.cancel')}</Button>
        </DialogClose>
        <Button
          variant="destructive"
          disabled={!confirmed || pending}
          onClick={() => {
            if (confirmed && !pending) {
              onConfirm()
            }
          }}
        >
          {pending ? t('vault.confirmDelete.deleting') : t('vault.confirmDelete.confirm')}
        </Button>
      </div>
    </>
  )
}
