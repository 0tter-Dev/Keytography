---
id: keytography-005
status: review
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 5
depends_on: [keytography-003]
authorized_capabilities:
  - docs/capabilities/password-evaluation/README.md
  - docs/capabilities/vault-entries/README.md
decision_records:
  - docs/decisions/ADR-0001-vault-encryption-and-recovery.md
  - docs/decisions/ADR-0003-retroactive-evaluation-bulk-recovery-decrypt.md
validation: []
documentation_updates: []
---

# Motor de avaliação de força de senha

## Objective

Implementar o motor de avaliação de força de senha: mini-diagnóstico modular por critério, nota média, e recálculo retroativo quando novos critérios forem adicionados.

## Context

`docs/capabilities/password-evaluation/README.md` define os critérios iniciais cogitados (comprimento, entropia, reuso/repetição contra o histórico, complexidade/previsibilidade) e a regra de recálculo. Depende de `keytography-003` para acessar entradas e histórico de senha.

## Scope

- Interface/abstração de "critério de avaliação", permitindo adicionar novos critérios sem alterar os já existentes (modularidade exigida pela capability).
- Implementação dos critérios iniciais: comprimento, entropia, reuso/repetição (contra o histórico da mesma conta e de outras contas do mesmo usuário), complexidade/previsibilidade (sequências, repetição de caracteres, padrões óbvios como datas).
- Cálculo da nota média a partir dos critérios individuais, com o detalhamento por critério disponível para consulta.
- Recálculo automático da nota ao criar/editar uma entrada de cofre (integração com `keytography-003`).
- Mecanismo de recálculo retroativo: ao registrar um novo critério no sistema, todas as entradas de todos os usuários são reavaliadas.

## Out Of Scope

- Geração de senha (plano `keytography-006`).
- Critérios além dos quatro iniciais listados (podem ser adicionados depois, a arquitetura só precisa suportar a extensão).

## Approval

Aprovado pelo usuário em 2026-09-30, ao pedir explicitamente para prosseguir com o próximo passo do `ROADMAP.md` (este plano).

**Decisão de arquitetura formalizada antes da implementação:** o `Acceptance Criteria` deste plano exige recálculo retroativo da nota de senha para entradas de todos os usuários, inclusive os que não estão logados no momento — o que exige decifrar a DEK de todos os usuários via a cópia de recuperação (chave RSA do sistema) em lote, um uso mais amplo dessa chave do que o previsto em `ADR-0001` (que cobria só consultas pontuais do Admin ou troca de senha do próprio dono). Por tocar criptografia/controle de acesso, perguntei ao usuário como proceder antes de implementar; o usuário aprovou explicitamente o recálculo em lote via chave de recuperação, formalizado em [ADR-0003](../../decisions/ADR-0003-retroactive-evaluation-bulk-recovery-decrypt.md).

## Acceptance Criteria

- Avaliar uma senha fraca (curta, comum, sem variação de caracteres) retorna uma nota baixa e o detalhamento indica quais critérios reprovaram.
- Avaliar uma senha forte (longa, alta entropia, sem repetição no histórico) retorna uma nota alta.
- Cadastrar uma senha idêntica a uma já usada anteriormente na mesma conta (presente no histórico) reduz a nota do critério de reuso especificamente.
- Editar uma entrada de cofre dispara o recálculo da nota automaticamente, sem chamada manual adicional.
- Adicionar um novo critério (via um teste que registra um critério de exemplo) e disparar o recálculo retroativo atualiza a nota de entradas pré-existentes de mais de um usuário, sem exigir edição manual de cada uma.
- O recálculo retroativo é restrito ao `Admin` (`POST /vault/password-evaluation/recalculate`); um `Member` tentando disparar recebe 403.
- O job `build` do CI permanece verde com os testes deste plano incluídos, sem exigir nenhuma mudança no workflow.

## Validation

- `dotnet test` cobrindo cada critério isoladamente, o cálculo da nota média, o recálculo automático em criação/edição, e o recálculo retroativo com múltiplos usuários.
- Confirmar no GitHub Actions que o job `build` passou no PR desta entrega.

## Documentation Updates

- `docs/capabilities/password-evaluation/README.md`: `Current Status` para `implemented`; documentar os critérios efetivamente implementados se algum detalhe mudar em relação ao planejado.
- `docs/capabilities/vault-entries/README.md`: documentar que cada entrada passa a guardar a nota de força e o detalhamento por critério, recalculados em criação/edição — código desta capability autorizada mudou (integração em `CreateAsync`/`UpdateAsync`), não só a capability principal do plano.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
