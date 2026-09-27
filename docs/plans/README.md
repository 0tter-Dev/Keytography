# Plans

Planos são registros de trabalho focados, com ciclo de vida `backlog → active → review → completed`; `cancelled` é a alternativa terminal explícita.

## Plan Template

```yaml
---
id: area-001
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: patch
actual_version_impact: pending
priority: medium
sequence: 0
depends_on: []
authorized_capabilities: []
decision_records: []
validation: []
documentation_updates: []
---
```

Todo corpo de plano deve conter `Objective`, `Context`, `Scope`, `Out Of Scope`, `Acceptance Criteria`, `Validation`, `Documentation Updates`, e `Outcome`. Um plano ativo também deve registrar a aprovação explícita do usuário.

## Ordering And Eligibility

`docs/ROADMAP.md` é a fila ordenada canônica. `priority` sinaliza urgência e não sobrepõe `sequence`. `depends_on` lista apenas pré-requisitos obrigatórios. Por padrão, somente o primeiro plano elegível pode virar `active`; ativação em paralelo exige aprovação explícita do usuário.

## Delivery Semantics

Um plano ativo aprovado pelo usuário autoriza a sequência de entrega documentada: branch, implementação, validação, Conventional Commit, push, e pull request. Ele vira `review` naquele PR, e `completed` só depois do merge.
