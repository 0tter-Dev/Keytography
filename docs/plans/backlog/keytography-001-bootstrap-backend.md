---
id: keytography-001
status: backlog
type: chore
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
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

## Out Of Scope

- Qualquer regra de negócio de autenticação, cofre, avaliação ou geração de senha (planos seguintes).
- CI/CD, Docker, ou qualquer infraestrutura além do ambiente local de desenvolvimento.
- Autenticação/autorização do endpoint de health-check (fica público, sem necessidade de token).

## Approval

## Acceptance Criteria

- `dotnet build` compila a solução inteira sem erros nem warnings de configuração.
- `dotnet test` executa o projeto de testes sem falhas (mesmo que contenha só um teste de exemplo/placeholder).
- Rodar a API localmente e fazer `GET /health` retorna HTTP 200 com um corpo indicando status "ok" (ou equivalente) e que a conexão com o banco SQLite foi validada.
- O arquivo de banco SQLite é criado automaticamente (via migration do EF Core) na primeira execução, sem passo manual.
- A estrutura de pastas/projetos reflete a separação entre API, domínio/aplicação, e dados (não um único projeto monolítico misturando tudo).

## Validation

- `dotnet build`
- `dotnet test`
- Execução manual local + `curl http://localhost:<porta>/health` (ou equivalente) confirmando 200.

## Documentation Updates

- `docs/STATUS.md`: marcar o marco de bootstrap concluído.
- Criar `docs/guides/running-locally.md` com os passos para rodar o backend localmente (comandos de build/run/test, pré-requisitos de SDK .NET).

## Outcome
