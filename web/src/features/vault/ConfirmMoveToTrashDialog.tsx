import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

type ConfirmMoveToTrashDialogProps = {
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/** Confirmação direta (sem palavra digitada) para mover uma entrada para a lixeira, que é reversível. */
export function ConfirmMoveToTrashDialog({
  open,
  pending,
  onOpenChange,
  onConfirm,
}: ConfirmMoveToTrashDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-lg font-semibold">
          {t('vault.detail.confirmTrash.title')}
        </DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">
          {t('vault.detail.confirmTrash.description')}
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">{t('vault.detail.confirmTrash.cancel')}</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() => {
              if (!pending) {
                onConfirm()
              }
            }}
          >
            {pending
              ? t('vault.detail.confirmTrash.moving')
              : t('vault.detail.confirmTrash.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
