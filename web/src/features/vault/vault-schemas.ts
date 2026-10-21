import type { TFunction } from 'i18next'
import { z } from 'zod'
import type { EntryInput } from './vault-api'

export type FieldRow = { name: string; value: string }
export type EntryFormValues = {
  title: string
  login: string
  password: string
  fields: FieldRow[]
}

/**
 * Espelha as regras da API (título obrigatório) e acrescenta as da interface: senha não vazia (a API
 * aceita vazia) e nomes de campo adicional obrigatórios e únicos (o servidor guarda um dicionário:
 * nomes repetidos colapsariam em silêncio).
 */
export function entrySchema(t: TFunction) {
  return z
    .object({
      title: z.string().trim().min(1, t('vault.form.validation.titleRequired')),
      login: z.string(),
      password: z.string().min(1, t('vault.form.validation.passwordRequired')),
      fields: z.array(
        z.object({
          name: z.string().trim().min(1, t('vault.form.validation.fieldNameRequired')),
          value: z.string(),
        }),
      ),
    })
    .superRefine((values, context) => {
      const seen = new Set<string>()
      values.fields.forEach((field, index) => {
        const name = field.name.trim()
        if (name !== '' && seen.has(name)) {
          context.addIssue({
            code: 'custom',
            path: ['fields', index, 'name'],
            message: t('vault.form.validation.fieldNameDuplicate'),
          })
        }
        seen.add(name)
      })
    })
}

/** O `PUT` substitui a entrada inteira: sem campos adicionais vai `null`, e o login vazio vira `null`. */
export function toEntryInput(values: EntryFormValues): EntryInput {
  const fields = values.fields.filter((field) => field.name.trim() !== '')
  return {
    title: values.title.trim(),
    login: values.login.trim() === '' ? null : values.login.trim(),
    password: values.password,
    additionalFields:
      fields.length === 0
        ? null
        : Object.fromEntries(fields.map((field) => [field.name.trim(), field.value])),
  }
}
