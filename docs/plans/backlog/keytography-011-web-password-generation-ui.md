---
id: keytography-011
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 11
depends_on: [keytography-009]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# UI de geração de senha

## Objective

Integrar o gerador de senha (`keytography-006`) aos formulários de entrada de cofre, como uma ferramenta acessível no momento de criar/editar uma entrada.

## Context

`POST /passwords/generate` já existe e não muda: aceita tamanho, uso de símbolos, exclusão de caracteres ambíguos e nota mínima; retorna a senha gerada com a nota e o detalhamento (mesmo formato de `keytography-010`).

## Scope

- Um controle (ex.: botão "Gerar senha" dentro do formulário de entrada de `keytography-009`) que abre um modal/painel com os parâmetros configuráveis (tamanho, símbolos, exclusão de ambíguos, nota mínima) e um botão de gerar.
- Preencher o campo de senha do formulário com o resultado, sem exigir que o usuário copie/cole manualmente.
- Tratamento do caso de erro (422 — parâmetros tornam a força mínima inatingível) com uma mensagem clara, não um erro genérico.
- Botão de "gerar novamente" sem fechar o modal, para o usuário tentar outra variação rapidamente.

## Out Of Scope

- Qualquer mudança na lógica de geração (já implementada em `keytography-006`).
- Novos critérios de avaliação.

## Approval

## Acceptance Criteria

- Gerar uma senha com parâmetros válidos preenche o campo de senha do formulário de entrada automaticamente.
- Gerar com parâmetros que tornam a força mínima inatingível mostra uma mensagem de erro específica, não um erro genérico ou uma tela quebrada.
- Gerar novamente (mesmos parâmetros) produz uma senha diferente da anterior, sem fechar o modal.

## Validation

- Testes de componente cobrindo o modal de geração (parâmetros, sucesso, erro 422) com a API mockada.
- Verificação manual gerando senhas com parâmetros variados contra a API local, incluindo o caso de força mínima inatingível.
- CI permanece verde.

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar a ferramenta de geração integrada.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
