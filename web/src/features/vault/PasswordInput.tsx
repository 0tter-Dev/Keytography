import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { RevealButton } from './RevealButton'
import { useReveal } from './use-reveal'

/**
 * Campo de senha do formulário de entrada, com mostrar/ocultar (que se oculta sozinho). Usa
 * `autoComplete="new-password"`: é o valor que os navegadores respeitam para NÃO preencher nem
 * oferecer salvar credenciais (`off` é ignorado em campos de senha) — a senha de uma entrada não é
 * uma credencial do próprio Keytography.
 */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type' | 'autoComplete'>) {
  const { t } = useTranslation()
  const { revealed, toggle } = useReveal()

  return (
    <div className="flex items-center gap-2">
      <Input {...props} type={revealed ? 'text' : 'password'} autoComplete="new-password" />
      <RevealButton
        label={t('vault.form.fields.password').toLowerCase()}
        revealed={revealed}
        onToggle={toggle}
      />
    </div>
  )
}
