# ADR-0004: Contrato OpenAPI versionado como fonte dos clientes, com guarda contra drift

## Context

A API HTTP passa a ter clientes além dos testes: a interface web (`keytography-007` em diante) e, depois, Mobile e Desktop. Sem um contrato explícito, cada cliente reescreveria à mão os tipos dos DTOs, e qualquer mudança de endpoint na API quebraria os clientes só em tempo de execução — o tipo de deriva silenciosa que o modelo documental do projeto existe para evitar.

Havia restrições práticas: a API só inicia com segredos locais configurados (`Jwt:Key`, `Recovery:PrivateKeyPem`, via user-secrets), o que impede gerar o documento OpenAPI em tempo de build ou em um CI "limpo" subindo a aplicação de verdade; e os handlers retornam `IResult`, então o OpenAPI não descreve nenhuma resposta sem metadados explícitos.

## Decision

1. **A API é a fonte do contrato.** Ela expõe o documento OpenAPI (`Microsoft.AspNetCore.OpenApi`, em `GET /openapi/v1.json`, somente em ambiente `Development`). Todo endpoint declara seus tipos de resposta (`Produces<T>()`), e um schema transformer (`NumericSchemaTransformer`) mantém os campos numéricos como `number`/`integer` — o JSON padrão do ASP.NET Core aceita números como string na leitura, mas a API nunca os emite assim.
2. **O contrato é versionado no repositório** em [`docs/reference/openapi.json`](../reference/openapi.json) (sem o campo `servers`, que varia por host).
3. **Os clientes são gerados a partir dele.** Na interface web, `web/src/api/schema.d.ts` (tipos do `openapi-typescript`) é versionado e consumido pelo cliente tipado; nenhum DTO é escrito à mão.
4. **Duas guardas impedem drift, e ambas quebram o build:** um teste do backend (`WebClientSupportTests`) compara `openapi.json` com o documento que a API realmente serve, e o job `web` do CI regenera `schema.d.ts` e falha se houver diferença.
5. **Manter o contrato é obrigação de quem muda a API.** Toda mudança em endpoint, DTO, metadado de resposta ou no transformer **precisa** regenerar e commitar `docs/reference/openapi.json` e `web/src/api/schema.d.ts` na mesma entrega (procedimento em [docs/reference/README.md](../reference/README.md)). Isso vale para humanos e agentes e faz parte da definição de "pronto" de qualquer plano que toque a API.

## Consequences

- Qualquer PR que mude a API passa a incluir arquivos gerados; o diff do contrato vira parte natural da revisão (mostra exatamente o que mudou para os clientes).
- Esquecer de regenerar não passa despercebido: o teste do backend e o CI do frontend falham com instrução de como corrigir.
- Novos clientes (Mobile/Desktop) consomem o mesmo contrato, em vez de reinterpretar a API.
- O contrato descreve hoje só as respostas de sucesso (e `/health` com 200/503); respostas de erro (400/401/403/404/409/422) ainda não são tipadas — evolução possível sem mudar esta decisão.
- Como o documento só é exposto em `Development`, o artefato versionado é o contrato "oficial"; produção não serve o OpenAPI.
- O gerador `openapi-typescript` ainda declara `typescript@^5` como peer; o `package.json` do `web/` tem um `overrides` escopado a ele (ver [web-frontend-conventions.md](../guides/web-frontend-conventions.md#notas-de-manutenção)).

## Alternatives Considered

- **Gerar o OpenAPI em tempo de build** (`Microsoft.Extensions.ApiDescription.Server`): rejeitado — exige iniciar a aplicação, que falha sem os segredos locais.
- **Subir a API no CI para baixar o contrato:** rejeitado — exigiria provisionar segredos de teste no pipeline e acrescenta fragilidade; o teste de drift no backend dá a mesma garantia usando a infraestrutura de testes já existente.
- **Tipos de DTO escritos à mão no frontend:** rejeitado — é exatamente a deriva silenciosa que se quer evitar.
- **Geração de cliente a partir do código (ex.: NSwag):** rejeitado por ora — mais ferramenta e acoplamento ao .NET, sem ganho sobre um contrato OpenAPI neutro que qualquer cliente (inclusive MAUI) pode consumir.

## Canonical Links

- [docs/reference/README.md](../reference/README.md)
- [docs/guides/web-frontend-conventions.md](../guides/web-frontend-conventions.md)
- [docs/capabilities/web-interface/README.md](../capabilities/web-interface/README.md)
