import createClient from 'openapi-fetch'
import type { paths } from './schema'

/** URL base da API; padrão = `dotnet run` local (ver web/.env.example). */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5247'

/**
 * Cliente tipado gerado do contrato OpenAPI da API (docs/reference/openapi.json).
 * Regenerar os tipos: `npm run api:types`.
 */
export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  // Resolve o fetch global a cada chamada (permite stub em testes).
  fetch: (request) => globalThis.fetch(request),
})
