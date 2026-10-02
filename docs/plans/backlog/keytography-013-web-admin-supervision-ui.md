---
id: keytography-013
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 13
depends_on: [keytography-008, keytography-009]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# UI de supervisão do Admin (mínima)

## Objective

Dar ao usuário `Admin` uma interface para o que o backend já permite hoje: consultar (somente leitura) o cofre de outros usuários, e disparar o recálculo retroativo de avaliação de senha. Sem nenhum endpoint novo.

## Context

Os endpoints `GET /vault/users/{userId}/entries`, `GET /vault/users/{userId}/entries/{id}` e `POST /vault/password-evaluation/recalculate` já existem e são restritos a `Admin`. A visão completa de um painel de Admin (diretório de usuários, métricas/saúde do sistema) foi deliberadamente adiada e está documentada como evolução futura em `docs/capabilities/web-interface/README.md` — este plano implementa só a fatia já suportada pelo backend.

## Scope

- Uma área/rota visível apenas para usuários com role `Admin` (oculta para `Member`).
- Um campo para informar/selecionar o ID (ou identificar) de outro usuário e visualizar a listagem somente-leitura do cofre dele.
- Visualização de detalhe de uma entrada de outro usuário (somente leitura — sem botões de editar/excluir).
- Um botão para disparar `POST /vault/password-evaluation/recalculate`, com feedback claro do resultado (quantas entradas foram atualizadas).
- Tentativas de escrita (editar/excluir uma entrada supervisionada) não são expostas na UI — a API já responde 403, mas a interface nem oferece a ação.

## Out Of Scope

- Diretório/listagem de todos os usuários do sistema — evolução futura (exige endpoint novo).
- Métricas/saúde agregada do sistema — evolução futura (exige endpoint novo).
- Qualquer ação de escrita no cofre de outro usuário.

## Approval

## Acceptance Criteria

- Um usuário `Member` não vê nem consegue acessar a área de supervisão (rota protegida por role, não só escondida visualmente).
- Um usuário `Admin` consegue visualizar a listagem e o detalhe do cofre de outro usuário, com a senha visível (dado que a API já retorna decifrado para o Admin).
- A interface não oferece nenhum controle de edição/exclusão nas entradas supervisionadas.
- Disparar o recálculo retroativo mostra o número de entradas atualizadas retornado pela API.

## Validation

- Testes de componente cobrindo o controle de acesso por role (renderização condicional) e a chamada ao endpoint de recálculo.
- Verificação manual logada como Admin e como Member, confirmando a diferença de acesso.
- CI permanece verde.

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar a área de supervisão implementada e reafirmar que o painel completo (diretório de usuários, métricas) segue como evolução futura.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
