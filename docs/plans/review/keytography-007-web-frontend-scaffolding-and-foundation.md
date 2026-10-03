---
id: keytography-007
status: review
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: high
sequence: 7
depends_on: [keytography-006]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# Scaffolding, design system e fundação de theming da interface web

## Objective

Criar o projeto da interface web (React + TypeScript + Vite) com toda a fundação que os planos seguintes vão depender: tooling, convenções de código, CI, integração com a API, sistema de temas/cores, e scaffolding de i18n — sem ainda construir nenhuma tela funcional além de uma prova de vida do pipeline.

## Context

O core/backend está completo (`keytography-001` a `006`). Esta é a primeira entrega da interface web, decidida em `PROJECT-ARCHITECTURE.md` (Selected Technology Direction, 2026-10-01): React + TypeScript + Vite, nas versões estáveis mais recentes no momento da implementação. A capability `docs/capabilities/web-interface/README.md` (stub `planned`) já documenta o modelo de temas, a política de i18n, e as relações com as capabilities de backend.

## Scope

- Novo projeto em `web/` na raiz do repositório (irmão de `src/` e `tests/` — toolchain Node/npm totalmente separado do .NET), usando Vite + React + TypeScript nas versões estáveis mais recentes compatíveis entre si.
- Tooling: ESLint + Prettier (ou equivalente consolidado), TypeScript em modo estrito, Vitest + React Testing Library para testes de componente.
- **Guia de convenções de código de interface** (`docs/guides/web-frontend-conventions.md`): componentização reutilizável, variantes tipadas (`class-variance-authority`), tokens de design em vez de valores mágicos, proibição de CSS inline/ajustes pontuais fora de casos genuinamente dinâmicos, estrutura de pastas. **Este guia vale como padrão geral do projeto para toda implementação de interface futura, não só para este plano** — `docs/DEVELOPMENT-GUIDE.md` ganha uma referência a ele.
- Instalação e configuração base de: Tailwind CSS, shadcn/ui (sobre Radix UI), `clsx`/`tailwind-merge`, Framer Motion, `@formkit/auto-animate`, `sonner`, `cmdk`, React Hook Form + Zod, TanStack Query, React Router, Zustand, `lucide-react`.
- **Sistema de theming completo**: 5 temas (`system`, `light`, `light-high-contrast`, `dark`, `dark-high-contrast` — mapeando a Sistema/Claro/Claro Alto Contraste/Escuro/Escuro Alto Contraste) × 9 cores de destaque (verde, verde-limão, roxo, vermelho, azul, azul-claro, laranja, amarelo, rosa), implementados via CSS custom properties trocadas por atributos (`data-theme`, `data-accent`) no elemento raiz. `system` detecta `prefers-color-scheme` e é o padrão inicial. A cor de texto sobre elementos de destaque é calculada pela luminosidade da cor escolhida (não fixa), garantindo contraste nos dois modos de alto contraste. Persistência em `localStorage` (sem backend). Nenhuma UI de seleção ainda é construída aqui — só a infraestrutura (tokens + lógica de aplicação/persistência); a superfície de seleção vem em `keytography-012`.
- Scaffolding de i18n (`react-i18next`) com um único arquivo de tradução `pt-BR`. Todo texto de interface passa por essa camada desde já, mesmo sem outro idioma disponível ainda.
- Shell de layout responsivo: sidebar colapsável no desktop, menu hambúrguer/drawer no mobile — navegação ainda sem links reais (placeholders), já que autenticação/cofre não existem nesta entrega.
- CORS habilitado em `src/Keytography.Api/Program.cs` para a origem do servidor de desenvolvimento do Vite (e, futuramente, a origem de produção quando definida).
- Geração de um cliente TypeScript tipado a partir do OpenAPI exposto pela API (ex.: via `Microsoft.AspNetCore.OpenApi` no lado do backend + `openapi-typescript` no frontend), e um stub inicial de `docs/reference/` com o contrato gerado.
- Job de CI novo (ou extensão do `build` existente) rodando `npm ci`, lint, build e testes do frontend em `.github/workflows/ci.yml`.
- Uma tela mínima que consulta `GET /health` e exibe o status, provando o pipeline fim-a-fim (API ↔ cliente tipado ↔ UI).

## Out Of Scope

- Qualquer tela funcional de autenticação, cofre, avaliação, geração ou configurações (planos seguintes).
- UI de seleção de tema/cor (só a infraestrutura; a superfície vem em `keytography-012`).
- Idiomas além de `pt-BR` (política documentada para depois da consolidação da web, antes de Mobile/Desktop).
- Empacotamento de produção (servir o build estático a partir da API, ou qualquer forma de "iniciar o projeto com um clique") — fica como possibilidade a reavaliar, não uma decisão deste plano.

## Approval

Aprovado pelo usuário em 2026-10-03, ao pedir explicitamente a ativação e a implementação do próximo passo do `ROADMAP.md` (este plano). A stack (React + TypeScript + Vite) e a lista de bibliotecas deste `Scope` foram discutidas e aprovadas durante o planejamento (`project-plans`, 2026-10-01/02). Este plano não toca criptografia, autenticação nem controle de acesso por role (a mudança de CORS e a exposição do OpenAPI não alteram nenhuma regra de acesso existente).

**Esclarecimentos de implementação (2026-10-03)** — ajustes de meio, sem alterar o objetivo nem os critérios de aceite, registrados para a revisão:

- **Bibliotecas adiadas** (diretriz do usuário de evitar "usos extras"): `motion`, `@formkit/auto-animate`, `cmdk`, React Hook Form + Zod **não** foram instaladas aqui, pois nenhum código desta entrega as usa; entram no plano que as consome (`008` formulários; `014` animações/command palette). Tabela em `docs/guides/web-frontend-conventions.md`. Foi acrescentado `openapi-fetch`, par oficial do `openapi-typescript` para o cliente tipado.
- **Metadados de resposta nos endpoints existentes**: sem eles o OpenAPI não descreve os DTOs de retorno (os handlers devolvem `IResult`) e o cliente tipado ficaria vazio. Foram adicionados `.Produces<T>()` aos endpoints de `authentication-and-users`, `vault-entries`, `password-evaluation` e `password-generation`, e três respostas anônimas (`{ message }`, `{ updatedEntries }`) viraram records (`MessageResponse`, `RecalculationResponse`) com o **mesmo formato JSON**. Nenhum comportamento mudou, por isso as docs dessas capabilities (fora de `authorized_capabilities`) não foram tocadas.
- **`GET /health` como `MapGet`** (em vez de `MapHealthChecks`): endpoints de health check não entram no OpenAPI. Mesmo caminho, mesmo JSON (`status` + `checks[{name,status}]`), mesmos códigos (200; 503 se `Unhealthy`); coberto pelo teste existente `HealthCheckTests`.
- **Contrato versionado** em `docs/reference/openapi.json` + teste de backend contra drift, em vez de gerar o OpenAPI em tempo de build (a inicialização da API exige segredos locais, indisponíveis no build).
- **`overrides` escopado** no `package.json` do `web/` para `openapi-typescript` (peer `typescript@^5`) usar o TypeScript 6 do projeto.

## Acceptance Criteria

- `npm run build` produz um bundle de produção sem erros; `npm run dev` sobe o servidor de desenvolvimento.
- A API aceita requisições `fetch` da origem do Vite dev server sem erro de CORS.
- O cliente TypeScript gerado reflete os DTOs reais da API (`VaultEntryDetailResponse`, `LoginResponse`, etc. — validado comparando um endpoint real).
- Alternar entre os 5 temas e as 9 cores de destaque (via um toggle temporário de desenvolvimento, não a UI final) muda visivelmente as variáveis CSS aplicadas, persiste após recarregar a página, e o tema `system` reflete `prefers-color-scheme` do navegador.
- Uma string de texto editada no arquivo de tradução `pt-BR` se reflete na tela sem alterar nenhum componente.
- A tela de prova de vida exibe o status de `/health` corretamente nos dois temas (claro/escuro) e em larguras de viewport mobile e desktop.
- O guia `docs/guides/web-frontend-conventions.md` existe e é referenciado por `docs/DEVELOPMENT-GUIDE.md`.
- O CI passa com o novo job/etapa de frontend incluído.

## Validation

- `npm run build`, `npm run lint`, `npm test` (Vitest + React Testing Library) localmente e no CI.
- `dotnet build`/`dotnet test` continuam passando (mudança de CORS não quebra nada existente).
- Verificação manual: abrir o dev server, confirmar troca de tema/cor persistindo, confirmar chamada real à API sem erro de CORS no console do navegador.

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: `Current Status` para `in_progress` (fundação criada, ainda sem telas funcionais); documentar o sistema de theming e i18n efetivamente implementados.
- `docs/DEVELOPMENT-GUIDE.md`: referenciar `docs/guides/web-frontend-conventions.md` nas Documentation Rules.
- `docs/guides/running-locally.md`: adicionar os passos para rodar o frontend localmente (`npm install`, `npm run dev`), e a nova variável de origem/CORS se aplicável.
- `docs/guides/web-frontend-conventions.md` (novo) e `docs/reference/README.md` + `docs/reference/openapi.json` (novos): criados por este plano; `docs/START-HERE.md` deixa de dizer que `reference/` está vazio.
- Capabilities de backend (`authentication-and-users`, `vault-entries`, `password-evaluation`, `password-generation`): constatação deliberada de que **não** precisam de atualização — só ganharam metadados de resposta no OpenAPI, sem mudança de comportamento (ver `Approval`).
- `docs/STATUS.md`: refletir o novo status.

## Outcome
