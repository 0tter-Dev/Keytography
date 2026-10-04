# Roadmap

Índice compacto e ordenado do trabalho futuro. Cada linha linka para o plano com o detalhe real — este arquivo nunca carrega a narrativa completa.

`keytography-001` a `keytography-006` foram concluídos — ver [docs/plans/completed/](./plans/completed/) — e fecham o roadmap original das 4 capabilities definidas no `PROJECT-BRIEF.md` (autenticação, cofre, avaliação e geração de senha). `keytography-007` (fundação da interface web), `keytography-008` (UI de autenticação) e `keytography-015` (governança automatizada) também estão concluídos.

## Interface Web (fase atual)

Decidido em 2026-10-01/02: React + TypeScript + Vite (ver [PROJECT-ARCHITECTURE.md](./PROJECT-ARCHITECTURE.md#selected-technology-direction)). A interface web é construída, consolidada e evoluída antes de qualquer portabilidade para Mobile/Desktop (ver [web-interface](./capabilities/web-interface/README.md)).

| Priority | Item | Notes |
| --- | --- | --- |
| medium | Sessões gerenciadas pelo backend (API) | [keytography-016](./plans/backlog/keytography-016-backend-managed-sessions.md) — depende de keytography-008; precisa de aprovação humana (autenticação, sessão e DEK) |
| medium | Interface web: sessão com refresh e logout real | [keytography-017](./plans/backlog/keytography-017-web-session-refresh-and-logout.md) — depende de keytography-016; deve ser mergeado logo após ele |
| medium | UI de cofre (CRUD núcleo) | [keytography-009](./plans/backlog/keytography-009-web-vault-entries-ui.md) — depende de keytography-008 e keytography-017 |
| medium | UI de avaliação de força | [keytography-010](./plans/backlog/keytography-010-web-password-evaluation-ui.md) — depende de keytography-009 |
| medium | UI de geração de senha | [keytography-011](./plans/backlog/keytography-011-web-password-generation-ui.md) — depende de keytography-009 |
| medium | Configurações de conta + troca de senha autenticada | [keytography-012](./plans/backlog/keytography-012-web-account-settings-and-password-change.md) — depende de keytography-009 |
| medium | UI de supervisão do Admin (mínima) | [keytography-013](./plans/backlog/keytography-013-web-admin-supervision-ui.md) — depende de keytography-008, keytography-009 |
| medium | Polimento visual, responsividade e interação | [keytography-014](./plans/backlog/keytography-014-web-visual-polish-and-interactions.md) — depende de keytography-010, 011, 012, 013 |

`keytography-007` foi concluído em 2026-10-03 e `keytography-008` em 2026-10-04. Os planos acima permanecem em `backlog` (`keytography-016` e `017` foram acrescentados em 2026-10-03, antes da UI de cofre, a pedido do usuário, para trazer as sessões gerenciadas pelo backend descritas no [ADR-0005](./decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md)) — promoção para `active` exige aprovação explícita do usuário, registrada no corpo do plano correspondente (ver `docs/plans/README.md`).

## Processo e governança

Melhorias do próprio fluxo de trabalho, independentes da interface web (nenhuma depende de `keytography-007` a `014`).

Nenhum item aberto no momento. `keytography-015` (verificação automática de governança documental e de convenções de PR) está concluído.

## Evolução futura (não planejada ainda)

Ideias discutidas durante o planejamento da interface web, deliberadamente fora do escopo atual — ver [web-interface](./capabilities/web-interface/README.md#future-considerations) e [vault-entries](./capabilities/vault-entries/README.md) para o detalhe de cada uma:

- Mobile e Desktop (via .NET MAUI) — só começam após a consolidação da interface web.
- i18n (`en`, `es`) — após a consolidação da interface web, antes de Mobile/Desktop.
- Configurações de conta completas (nome de exibição editável, upload de imagem real).
- Painel de Admin completo (diretório de usuários, métricas/saúde do sistema).
- Cor de destaque customizada.
- Organização de entradas de cofre (tags, favoritos, grupos/subgrupos).
