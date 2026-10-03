# Referência: contrato da API

## Purpose

Contrato estável da API HTTP do Keytography, consumido pelos clientes (hoje, a interface web). A fonte é o próprio código da API: o arquivo [`openapi.json`](./openapi.json) é o documento OpenAPI gerado por ela e versionado aqui.

## Como o contrato é usado

- **Cliente da interface web:** `web/src/api/schema.d.ts` (tipos TypeScript) é gerado a partir deste arquivo — ver [convenções da interface](../guides/web-frontend-conventions.md#dados-da-api).
- **Proteção contra drift:** um teste do backend (`WebClientSupportTests`) compara este arquivo com o documento que a API realmente serve em `/openapi/v1.json`, e o CI do frontend verifica que `schema.d.ts` corresponde a ele. Mudar um endpoint ou DTO sem regenerar quebra o build.

## Regenerar depois de mudar a API

Na raiz do repositório:

```bash
KEYTOGRAPHY_UPDATE_OPENAPI=1 dotnet test
```

No PowerShell: `$env:KEYTOGRAPHY_UPDATE_OPENAPI = "1"; dotnet test` (e `Remove-Item Env:KEYTOGRAPHY_UPDATE_OPENAPI` depois).

Em seguida, regenerar os tipos do cliente:

```bash
cd web
npm run api:types
```

Comite `docs/reference/openapi.json` e `web/src/api/schema.d.ts` juntos com a mudança da API.

## Notas

- O documento é exposto pela API apenas em ambiente `Development` (`GET /openapi/v1.json`).
- O campo `servers` é removido do arquivo versionado (varia conforme o host em que a API roda e não faz parte do contrato).
- Segurança: o contrato descreve rotas e DTOs; autenticação continua sendo `Authorization: Bearer <JWT>` obtido em `POST /auth/login`.
