# Status

## Current Stage

Core/backend completo: `keytography-001` a `keytography-006` concluídos — as 4 capabilities do roadmap original (autenticação, cofre, avaliação e geração de senha) estão `implemented`. Interface web em andamento: a fundação (`keytography-007`) está concluída; `008` a `014` seguem em `backlog`. Antes do `008`, `keytography-015` (verificação automática de governança documental e de convenções de PR) está em `review` (PR aberto).

## Milestones

- **2026-09-25** — Kickoff e documentação Nível 3 estabelecidos a partir do `PROJECT-BRIEF.md`.
- **2026-09-26** — Identidade do projeto definida: [docs/guides/identity.md](./guides/identity.md).
- **2026-09-26** — Stack técnica e esquema de criptografia do cofre decididos: [ADR-0001](./decisions/ADR-0001-vault-encryption-and-recovery.md).
- **2026-09-26** — Scaffolding do repositório e base documental completa enviados a `main` (marco zero, push direto autorizado explicitamente pelo usuário); branch protection configurada em seguida.
- **2026-09-27** — [keytography-001](./plans/completed/keytography-001-bootstrap-backend.md) concluído ([PR #2](https://github.com/0tter-Dev/Keytography/pull/2)): bootstrap do backend (.NET 10, EF Core + SQLite, `GET /health`, CI real). Ver [docs/guides/running-locally.md](./guides/running-locally.md).
- **2026-09-27** — [keytography-002](./plans/completed/keytography-002-authentication-and-users.md) concluído ([PR #4](https://github.com/0tter-Dev/Keytography/pull/4)): registro com verificação de e-mail, login JWT, bootstrap automático do `Admin`, solicitação de redefinição de senha. Conclusão da troca de senha fica para `keytography-004`.
- **2026-09-29** — [keytography-003](./plans/completed/keytography-003-vault-entries-crud-and-encryption.md) concluído ([PR #6](https://github.com/0tter-Dev/Keytography/pull/6)): CRUD de entradas de cofre com criptografia de envelope (DEK + chave dupla, ADR-0001), histórico de senhas, soft delete/lixeira, leitura de supervisão do `Admin`, e cache de DEK em sessão ([ADR-0002](./decisions/ADR-0002-dek-session-cache.md)).
- **2026-09-30** — [keytography-004](./plans/completed/keytography-004-password-recovery-completion.md) concluído ([PR #8](https://github.com/0tter-Dev/Keytography/pull/8)): conclusão do fluxo de redefinição de senha (`POST /auth/reset-password`), re-cifragem da cópia "do dono" da DEK sem perda de acesso ao cofre, e histórico da senha de login.
- **2026-10-01** — [keytography-005](./plans/completed/keytography-005-password-evaluation-engine.md) concluído ([PR #10](https://github.com/0tter-Dev/Keytography/pull/10)): motor de avaliação de força de senha (comprimento, entropia, reuso, complexidade), recálculo automático em criação/edição, e recálculo retroativo sob demanda via decifragem em lote pela chave de recuperação ([ADR-0003](./decisions/ADR-0003-retroactive-evaluation-bulk-recovery-decrypt.md)).
- **2026-10-01** — [keytography-006](./plans/completed/keytography-006-password-generator.md) concluído ([PR #12](https://github.com/0tter-Dev/Keytography/pull/12)): gerador de senha configurável (`POST /passwords/generate`) com CSPRNG, exclusão de caracteres ambíguos, e exigência de força mínima validada pelo motor de `keytography-005`. Fecha o roadmap original de 4 capabilities do `PROJECT-BRIEF.md`.
- **2026-10-03** — [keytography-007](./plans/completed/keytography-007-web-frontend-scaffolding-and-foundation.md) concluído ([PR #15](https://github.com/0tter-Dev/Keytography/pull/15)): fundação da interface web (React + TypeScript + Vite em `web/`, tooling, [convenções](./guides/web-frontend-conventions.md), sistema de temas 5 × 9, i18n `pt-BR`, casca de layout responsiva, cliente de API tipado gerado do [contrato OpenAPI](./reference/README.md), CORS e job de CI do frontend).
- **2026-10-03** — [keytography-015](./plans/review/keytography-015-governance-checks-in-ci.md) em `review` (PR aberto): a governança documental (planos, dashboards, links internos, README raiz nos planos) e a convenção de nomes de branches e PRs viram verificações automáticas em `dotnet test` e no CI.

## Capability Dashboard

| Capability | Status | Canonical source |
| --- | --- | --- |
| Autenticação e Usuários | implemented | [authentication-and-users](./capabilities/authentication-and-users/README.md) |
| Entradas de Cofre (Contas/Senhas) | implemented | [vault-entries](./capabilities/vault-entries/README.md) |
| Avaliação de Senha | implemented | [password-evaluation](./capabilities/password-evaluation/README.md) |
| Geração de Senha | implemented | [password-generation](./capabilities/password-generation/README.md) |
| Interface Web | in_progress | [web-interface](./capabilities/web-interface/README.md) |
