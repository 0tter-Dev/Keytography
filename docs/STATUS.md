# Status

## Current Stage

O Keytography está em fase de planejamento inicial (pré-implementação) desde 2026-09-25 — nenhum código foi escrito ainda. O `PROJECT-BRIEF.md` do kickoff foi consumido e sua documentação agora vive em `docs/`. A identidade do projeto (nome, tagline, direção visual) foi definida em 2026-09-26 e está registrada em [docs/guides/identity.md](./guides/identity.md). O repositório remoto foi criado e o scaffolding básico (`LICENSE` MIT, `.gitignore`, `.gitattributes`, `.editorconfig`, `SECURITY.md`, template de Pull Request) foi estabelecido em seguida, antes do primeiro PR. A stack técnica (C# / ASP.NET Core, EF Core + SQLite) e o esquema de criptografia do cofre ([ADR-0001](./decisions/ADR-0001-vault-encryption-and-recovery.md)) foram decididos, e o trabalho de implementação foi quebrado em planos sequenciados (ver [ROADMAP.md](./ROADMAP.md) e `docs/plans/backlog/`). Um workflow de CI placeholder (`.github/workflows/ci.yml`, sem validações reais) foi adicionado só para permitir configurar branch protection no GitHub com um check já reconhecido; será substituído por build/test real a partir de `keytography-001`. Esta base completa (documentação, scaffolding do repositório, decisões e planos) foi enviada diretamente para `main` por decisão explícita do usuário, como marco zero do projeto — a partir daqui, entregas seguem o fluxo normal de PR. Branch protection na `main` foi configurada pelo usuário em seguida. Em 2026-09-27, [keytography-001](./plans/review/keytography-001-bootstrap-backend.md) (bootstrap do backend, incluindo a evolução do CI de placeholder para `dotnet build`/`dotnet test` reais) foi promovido a `active` e sua implementação está em `review` (PR aberto). Sua implementação estabeleceu o esqueleto do backend (.NET 10, solução `Keytography.slnx` com os projetos `Keytography.Api`, `Keytography.Domain`, `Keytography.Infrastructure` e `Keytography.Tests`), EF Core com provider SQLite e a migration inicial, o endpoint `GET /health`, e o job `build` do CI evoluído de placeholder para `dotnet restore`/`build`/`test` reais — a primeira linha de código do projeto (ver [docs/guides/running-locally.md](./guides/running-locally.md) para rodar localmente).

## Capability Dashboard

| Capability | Status | Canonical source |
| --- | --- | --- |
| Autenticação e Usuários | planned | [authentication-and-users](./capabilities/authentication-and-users/README.md) |
| Entradas de Cofre (Contas/Senhas) | planned | [vault-entries](./capabilities/vault-entries/README.md) |
| Avaliação de Senha | planned | [password-evaluation](./capabilities/password-evaluation/README.md) |
| Geração de Senha | planned | [password-generation](./capabilities/password-generation/README.md) |
