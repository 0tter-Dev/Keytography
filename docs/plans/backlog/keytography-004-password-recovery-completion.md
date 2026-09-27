---
id: keytography-004
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: patch
actual_version_impact: pending
priority: medium
sequence: 4
depends_on: [keytography-002, keytography-003]
authorized_capabilities:
  - docs/capabilities/authentication-and-users/README.md
  - docs/capabilities/vault-entries/README.md
decision_records:
  - docs/decisions/ADR-0001-vault-encryption-and-recovery.md
validation: []
documentation_updates: []
---

# Conclusão da recuperação de senha

## Objective

Concluir o fluxo de "Esqueci minha senha", trocando efetivamente a senha de login e re-cifrando a cópia "do dono" da DEK, sem perda de acesso ao cofre.

## Context

`keytography-002` implementou a solicitação (geração do token de reset); `keytography-003` implementou a DEK e suas duas cópias cifradas. Este plano fecha o ciclo descrito em `ADR-0001`.

## Scope

- Endpoint que recebe o token de reset (gerado em `keytography-002`) e a nova senha.
- Validação do token (existência, validade, não expirado, não usado).
- Uso da cópia de recuperação da DEK (chave privada do sistema) para decifrá-la, e geração de uma nova cópia "do dono" cifrada com a chave derivada da nova senha (Argon2id).
- Invalidação do token de reset após uso.

## Out Of Scope

- Qualquer mudança na geração/estrutura da DEK em si (já feita em `keytography-003`).
- Notificação por e-mail de que a senha foi alterada (pode ser adicionado depois, não bloqueia o ciclo funcional).

## Approval

## Acceptance Criteria

- `POST /auth/reset-password` com um token válido e uma nova senha retorna 200, e o login subsequente com a nova senha funciona.
- Após a troca, todas as entradas de cofre criadas antes da troca continuam legíveis e idênticas (mesmo conteúdo decifrado) — validado comparando o conteúdo decifrado antes e depois da troca.
- Um token de reset expirado ou já usado retorna 400/410 (não permite a troca).
- Tentar logar com a senha antiga após a troca falha (401).

## Validation

- `dotnet test` cobrindo: reset com token válido, token expirado, token já usado, e a preservação do conteúdo decifrado do cofre antes/depois da troca.

## Documentation Updates

- `docs/capabilities/authentication-and-users/README.md`: `Current Status` para `implemented` (o módulo de autenticação fica completo com este plano).
- `docs/STATUS.md`: refletir o novo status.

## Outcome
