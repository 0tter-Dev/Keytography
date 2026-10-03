---
id: keytography-010
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: patch
actual_version_impact: pending
priority: medium
sequence: 10
depends_on: [keytography-009]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# UI de avaliação de força de senha

## Objective

Exibir, nos formulários de entrada de cofre, a nota de força e o detalhamento por critério que a API já calcula e retorna — sem nenhuma lógica de avaliação nova no frontend.

## Context

`vault-entries` já retorna `PasswordScore` e `PasswordScoreDetail` (nota 0-100 + aprovado/reprovado por critério) em toda resposta de detalhe de entrada, recalculados automaticamente a cada criação/edição (`keytography-005`). Este plano é puramente de superfície.

## Scope

- Indicador visual de força (barra/medidor com gradiente de cor) nos formulários de criação/edição de entrada de `keytography-009`, atualizado em tempo real conforme o usuário digita (usando o valor retornado pela última chamada à API, ou uma pré-visualização local se a avaliação for antecipada no frontend — a decidir na implementação, mantendo a fonte da verdade sempre a API).
- Painel de detalhamento por critério (o que passou, o que reprovou), com rótulos legíveis em vez das chaves técnicas (`length`, `entropy`, `reuse`, `complexity`).

## Out Of Scope

- Qualquer novo critério de avaliação ou mudança na lógica de cálculo (já implementada em `keytography-005`).
- Geração de senha (`keytography-011`).

## Approval

## Acceptance Criteria

- Criar ou editar uma entrada com uma senha fraca mostra uma nota baixa e indica visualmente quais critérios reprovaram.
- Criar ou editar uma entrada com uma senha forte mostra uma nota alta.
- Os rótulos exibidos para cada critério são legíveis em português, não as chaves técnicas da API.

## Validation

- Testes de componente cobrindo a renderização do indicador com diferentes notas/detalhamentos (dados mockados cobrindo os quatro critérios existentes).
- Verificação manual criando entradas com senhas fracas e fortes contra a API local.
- CI permanece verde.

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar o indicador de força implementado.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
