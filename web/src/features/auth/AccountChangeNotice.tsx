import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useSessionStore } from './session-store'

/**
 * Quando outra aba/janela do navegador entra com OUTRA conta, o cookie de refresh compartilhado faz
 * esta aba renovar já como a conta nova. Avisa e volta ao início (os dados da conta anterior já
 * foram descartados do cache); mesma conta não gera aviso. Não renderiza nada.
 */
export function AccountChangeNotice() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const accountChanged = useSessionStore((state) => state.accountChanged)
  const clear = useSessionStore((state) => state.clearAccountChanged)

  useEffect(() => {
    if (!accountChanged) {
      return
    }
    toast.info(t('auth.accountChanged'))
    navigate('/', { replace: true })
    clear()
  }, [accountChanged, clear, navigate, t])

  return null
}
