import { useCallback, useEffect, useState } from 'react'

/** Por quanto tempo uma senha revelada fica visível antes de voltar a ocultar. */
export const REVEAL_MS = 30_000

/**
 * Estado de "revelar" de um segredo. Voltar a ocultar é automático: depois de `REVEAL_MS`, quando a
 * aba fica oculta e ao sair da tela (o estado some com o componente).
 */
export function useReveal() {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    if (!revealed) {
      return
    }
    const timer = setTimeout(() => setRevealed(false), REVEAL_MS)
    const onVisibilityChange = () => {
      if (document.hidden) {
        setRevealed(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [revealed])

  const toggle = useCallback(() => setRevealed((current) => !current), [])
  return { revealed, toggle }
}
