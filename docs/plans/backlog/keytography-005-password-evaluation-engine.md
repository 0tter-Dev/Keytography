---
id: keytography-005
status: backlog
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
decision_records: []
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

## Acceptance Criteria

- Avaliar uma senha fraca (curta, comum, sem variação de caracteres) retorna uma nota baixa e o detalhamento indica quais critérios reprovaram.
- Avaliar uma senha forte (longa, alta entropia, sem repetição no histórico) retorna uma nota alta.
- Cadastrar uma senha idêntica a uma já usada anteriormente na mesma conta (presente no histórico) reduz a nota do critério de reuso especificamente.
- Editar uma entrada de cofre dispara o recálculo da nota automaticamente, sem chamada manual adicional.
- Adicionar um novo critério (via um teste que registra um critério de exemplo) e disparar o recálculo retroativo atualiza a nota de entradas pré-existentes de mais de um usuário, sem exigir edição manual de cada uma.
- O job `build` do CI permanece verde com os testes deste plano incluídos, sem exigir nenhuma mudança no workflow.

## Validation

- `dotnet test` cobrindo cada critério isoladamente, o cálculo da nota média, o recálculo automático em criação/edição, e o recálculo retroativo com múltiplos usuários.
- Confirmar no GitHub Actions que o job `build` passou no PR desta entrega.

## Documentation Updates

- `docs/capabilities/password-evaluation/README.md`: `Current Status` para `implemented`; documentar os critérios efetivamente implementados se algum detalhe mudar em relação ao planejado.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
