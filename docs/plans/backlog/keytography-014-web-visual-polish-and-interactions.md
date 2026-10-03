---
id: keytography-014
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 14
depends_on: [keytography-010, keytography-011, keytography-012, keytography-013]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# Polimento visual, responsividade e interação

## Objective

Consolidar a interface web construída em `keytography-007` a `013` com uma passada final de identidade visual, animações/microinterações, atalhos de teclado, e QA de responsividade — fechando o ciclo desta fase antes de a interface ser considerada pronta para consolidação.

## Context

Cada plano anterior já entrega estilo básico (nada fica sem estilo por padrão). Este plano é a consolidação cross-cutting: revisar todas as telas construídas com o mesmo olhar, em vez de polimento disperso plano a plano.

## Scope

- Paleta de cores final aplicada de forma consistente em todas as telas (ajustes sobre os tokens definidos em `keytography-007`, não uma reestruturação do sistema de tema).
- Command palette (`cmdk`, atalho Cmd/Ctrl+K) para busca rápida de entradas de cofre por título/login.
- Atalhos de teclado adicionais: `/` foca a busca, `n` cria nova entrada (quando aplicável ao contexto da tela).
- Microinterações e transições (Framer Motion) em modais, toasts, e troca de tela; animações de entrada/saída/reordenação em listas (`@formkit/auto-animate`).
- Toasts (`sonner`) para feedback de ações assíncronas (salvar, excluir, copiar, erro) em todas as telas que ainda não os usam de forma consistente.
- QA de responsividade em breakpoints mobile/tablet/desktop para todas as telas de `keytography-008` a `013`.
- Revisão de acessibilidade básica: navegação por teclado em todos os fluxos principais, contraste de texto nos 5 temas × 9 cores de destaque (validação amostral, não exaustiva).

## Out Of Scope

- Qualquer funcionalidade nova de domínio (isso já foi todo construído nos planos anteriores).
- i18n além de `pt-BR` (política já documentada para depois desta consolidação).

## Approval

## Acceptance Criteria

- Abrir a command palette (Cmd/Ctrl+K) e buscar por título/login de uma entrada existente a encontra e permite navegar até ela.
- Todas as ações assíncronas principais (salvar, excluir, copiar, gerar senha, trocar senha) mostram um toast de sucesso ou erro.
- Todas as telas de `keytography-008` a `013` são utilizáveis sem quebra de layout em larguras mobile (ex.: 375px), tablet (ex.: 768px) e desktop (ex.: 1280px+).
- Navegação completa de um fluxo principal (ex.: criar uma entrada de cofre) é possível só com teclado, sem mouse.
- Uma amostra de combinações tema×cor de destaque (incluindo os dois modos de alto contraste) mantém o texto legível sobre os elementos de destaque.

## Validation

- Testes de componente cobrindo a command palette e os atalhos de teclado.
- Verificação manual de responsividade nos três breakpoints citados, para cada tela construída nos planos anteriores.
- Verificação manual de navegação por teclado em pelo menos um fluxo completo (criar entrada de cofre).
- CI permanece verde.

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: `Current Status` para `implemented` — a interface web está funcionalmente completa para esta fase.
- `README.md` (raiz): Quick Start e Current Scope finais, com a interface web como funcionalmente completa para esta fase.
- `docs/STATUS.md`: refletir o novo status; marcar a interface web como concluída para esta fase.
- `docs/PROJECT-ARCHITECTURE.md`: confirmar, na Architectural Direction, que a interface web está consolidada e que Mobile/Desktop (e i18n `en`/`es`) podem ser planejados a partir daqui.

## Outcome
