---
id: keytography-001
status: completed
type: chore
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: minor
priority: high
sequence: 1
depends_on: []
authorized_capabilities: []
decision_records: []
validation: []
documentation_updates: []
---

# Bootstrap do projeto backend

## Objective

Estabelecer o esqueleto executável do backend do Keytography (solução .NET, projeto de API ASP.NET Core, acesso a dados via EF Core + SQLite), servindo de base para todos os módulos de domínio subsequentes.

## Context

`docs/PROJECT-ARCHITECTURE.md` define a stack (C#/.NET, EF Core + SQLite) e a direção arquitetural (core/backend primeiro). Nenhuma linha de código existe ainda (`docs/STATUS.md`). Este plano não implementa nenhuma regra de negócio — apenas a fundação técnica sobre a qual os planos seguintes (autenticação, cofre, avaliação, geração) serão construídos.

## Scope

- Criar a solução .NET com um projeto de API (ASP.NET Core Web API) e um projeto de testes automatizados.
- Configurar o EF Core com provider SQLite, incluindo a primeira migration (mesmo que vazia/mínima) e criação automática do arquivo de banco na primeira execução.
- Expor um endpoint de health-check (`GET /health`) retornando 200 com um payload mínimo indicando que a API e a conexão com o banco estão operacionais.
- Estrutura de pastas/camadas coerente com a separação de domínio prevista (ex.: separar API, domínio/aplicação, e acesso a dados em projetos ou pastas distintas) — sem implementar nenhuma capability ainda.
- Configuração básica de logging.
- Atualizar `.github/workflows/ci.yml`: substituir o job placeholder por um job real (mantendo o nome `build`, para preservar a configuração de branch protection já feita no GitHub) que executa `dotnet restore`, `dotnet build` e `dotnet test` contra a solução criada neste plano. A partir daqui, esse mesmo job passa a validar automaticamente os planos seguintes (002 a 006) conforme eles adicionam código e testes, sem precisar de nova mudança no workflow a cada plano.

## Out Of Scope

- Qualquer regra de negócio de autenticação, cofre, avaliação ou geração de senha (planos seguintes).
- Docker ou qualquer infraestrutura de deploy além de compilar/testar em CI.
- Autenticação/autorização do endpoint de health-check (fica público, sem necessidade de token).

## Approval

Aprovado pelo usuário em 2026-09-27, ao definir este como o próximo passo do `ROADMAP.md` a ser ativado, imediatamente após a configuração de branch protection no repositório remoto.

## Acceptance Criteria

- `dotnet build` compila a solução inteira sem erros nem warnings de configuração.
- `dotnet test` executa o projeto de testes sem falhas (mesmo que contenha só um teste de exemplo/placeholder).
- Rodar a API localmente e fazer `GET /health` retorna HTTP 200 com um corpo indicando status "ok" (ou equivalente) e que a conexão com o banco SQLite foi validada.
- O arquivo de banco SQLite é criado automaticamente (via migration do EF Core) na primeira execução, sem passo manual.
- A estrutura de pastas/projetos reflete a separação entre API, domínio/aplicação, e dados (não um único projeto monolítico misturando tudo).
- O job `build` do workflow de CI executa `dotnet restore`, `dotnet build` e `dotnet test` de verdade (não mais o placeholder) e passa (verde) no PR desta entrega e no push resultante a `main`.

## Validation

- `dotnet build`
- `dotnet test`
- Execução manual local + `curl http://localhost:<porta>/health` (ou equivalente) confirmando 200.
- Verificar no GitHub Actions que o job `build` rodou com os comandos reais e passou.

## Documentation Updates

- `docs/STATUS.md`: marcar o marco de bootstrap concluído, incluindo que o CI passou a validar de verdade.
- Criar `docs/guides/running-locally.md` com os passos para rodar o backend localmente (comandos de build/run/test, pré-requisitos de SDK .NET) — os mesmos comandos usados pelo CI.

## Outcome

Entregue via [PR #2](https://github.com/0tter-Dev/Keytography/pull/2), mergeado em 2026-09-27T05:57:12Z (commit `253383b`). Branch de implementação: `keytography-001-bootstrap-backend` (commit `f182a08`, único commit).

Validação confirmada duas vezes — na implementação e de forma independente na auditoria pós-merge (`project-audit`), reexecutando tudo a partir do `main` já mergeado:

- `dotnet restore` / `dotnet build --configuration Release`: sem erros nem warnings.
- `dotnet test --configuration Release`: 1/1 passou (teste de integração do `GET /health` via `WebApplicationFactory`).
- Execução manual local: `GET /health` retornou 200 com `{"status":"healthy","checks":[{"name":"database","status":"healthy"}]}`; `keytography.db` criado automaticamente na primeira execução via migration do EF Core.
- Job `build` do CI executando `dotnet restore`/`build`/`test` reais, verde no PR e no push subsequente a `main` (GitHub Actions runs `36298182207` e `36298675952`).

`actual_version_impact: minor` — igual ao `expected_version_impact`, sem divergência a justificar.

Observação não bloqueante da auditoria: a troca de SDK de .NET 9 para .NET 10 (LTS), decidida durante esta entrega, ficou registrada no commit/PR e em `global.json`, mas `docs/PROJECT-ARCHITECTURE.md` ainda não cita a versão exata do .NET na `Selected Technology Direction`. Fica como possível pequeno ajuste futuro, não tratado nesta entrega nem no fechamento.
