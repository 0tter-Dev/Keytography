import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { VaultError, type EntryInput, type VaultFailure } from './vault-api'
import { toEntryInput, type EntryFormValues } from './vault-schemas'

type Save = { mutateAsync: (input: EntryInput) => Promise<{ id: string }>; isPending: boolean }

/**
 * Envio do formulário de entrada (criar ou editar): um envio por vez, falha mantida na tela (os
 * dados continuam no formulário) e, no sucesso, vai ao detalhe. `unauthorized` não mostra erro:
 * a sessão terminou ou a conta trocou, e o cliente já leva ao login ou avisa.
 */
export function useEntrySubmit(save: Save) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [failure, setFailure] = useState<VaultFailure | null>(null)
  const [titleError, setTitleError] = useState<string | undefined>()

  async function submit(values: EntryFormValues) {
    if (save.isPending) {
      return
    }
    setFailure(null)
    setTitleError(undefined)
    try {
      const { id } = await save.mutateAsync(toEntryInput(values))
      navigate(`/vault/${id}`)
    } catch (error) {
      const cause = error instanceof VaultError ? error : new VaultError('unknown')
      if (cause.failure === 'validation' && cause.fieldErrors.title) {
        setTitleError(t('vault.form.validation.titleRequired'))
      }
      setFailure(cause.failure === 'unauthorized' ? null : cause.failure)
    }
  }

  return { submit, failure, titleError }
}
