import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { PasswordInput } from './PasswordInput'
import type { VaultFailure } from './vault-api'
import { entrySchema, type EntryFormValues } from './vault-schemas'

type EntryFormProps = {
  defaultValues: EntryFormValues
  mode: 'create' | 'edit'
  onSubmit: (values: EntryFormValues) => Promise<void>
  onCancel: () => void
  /** Falha da última tentativa de salvar (os dados digitados continuam no formulário). */
  failure: VaultFailure | null
  /** Erro de validação do servidor para o título, quando houver. */
  titleServerError?: string
}

/**
 * Formulário de criar/editar entrada. Os valores vivem só na memória do formulário (nunca em
 * storage); campos de login e título com `autoComplete="off"` e a senha com `new-password`.
 */
export function EntryForm({
  defaultValues,
  mode,
  onSubmit,
  onCancel,
  failure,
  titleServerError,
}: EntryFormProps) {
  const { t } = useTranslation()
  const schema = useMemo(() => entrySchema(t), [t])
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntryFormValues>({ resolver: zodResolver(schema), defaultValues })
  const { fields, append, remove } = useFieldArray({ control, name: 'fields' })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
      {failure && !(failure === 'validation' && titleServerError) && (
        <Alert variant="destructive">
          {failure === 'network'
            ? t('vault.form.errors.network')
            : failure === 'notFound'
              ? t('vault.form.errors.notFound')
              : failure === 'unauthorized'
                ? t('vault.errors.unauthorized')
                : t('vault.form.errors.unknown')}
        </Alert>
      )}

      <FormField
        label={t('vault.form.fields.title')}
        error={errors.title?.message ?? titleServerError}
      >
        <Input autoComplete="off" {...register('title')} />
      </FormField>
      <FormField label={t('vault.form.fields.login')}>
        <Input autoComplete="off" {...register('login')} />
      </FormField>
      <FormField label={t('vault.form.fields.password')} error={errors.password?.message}>
        <PasswordInput {...register('password')} />
      </FormField>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">
          {t('vault.form.fields.additionalFields')}
        </legend>
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-start gap-2">
            <FormField
              className="flex-1"
              label={t('vault.form.fields.fieldName')}
              error={errors.fields?.[index]?.name?.message}
            >
              <Input autoComplete="off" {...register(`fields.${index}.name`)} />
            </FormField>
            <FormField className="flex-1" label={t('vault.form.fields.fieldValue')}>
              <Input autoComplete="off" {...register(`fields.${index}.value`)} />
            </FormField>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-7"
              aria-label={t('vault.form.removeField', { position: index + 1 })}
              onClick={() => remove(index)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => append({ name: '', value: '' })}
        >
          <Plus aria-hidden="true" />
          {t('vault.form.addField')}
        </Button>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? t('vault.form.submitting')
            : mode === 'create'
              ? t('vault.form.submitCreate')
              : t('vault.form.submitUpdate')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('vault.form.cancel')}
        </Button>
      </div>
    </form>
  )
}
