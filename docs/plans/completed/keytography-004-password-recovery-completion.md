---
id: keytography-004
status: completed
type: feat
requires_pull_request: true
expected_version_impact: patch
actual_version_impact: patch
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
- Registro do hash da senha de login anterior em um histórico dedicado a cada troca, com timestamp — `docs/capabilities/vault-entries/README.md` já afirmava que esse histórico "só passa a existir quando keytography-004 implementar a troca efetiva dessa senha", mas isso não estava no `Scope` original deste plano. Emenda registrada em 2026-09-29 após o gap ser identificado durante a implementação; ver `Approval`.

## Out Of Scope

- Qualquer mudança na geração/estrutura da DEK em si (já feita em `keytography-003`).
- Notificação por e-mail de que a senha foi alterada (pode ser adicionado depois, não bloqueia o ciclo funcional).

## Approval

Aprovado pelo usuário em 2026-09-29, ao pedir explicitamente para prosseguir com o próximo passo do `ROADMAP.md` (este plano). Por tocar autenticação e a criptografia da DEK, a ativação foi confirmada separadamente via pergunta explícita (per `AGENTS.md`), com o usuário aprovando a implementação exatamente como escrita neste `Scope` — mecanismo de re-wrap já definido em `ADR-0001`, sem decisão de design nova além do já especificado ali.

**Emenda de escopo (2026-09-29):** durante a implementação, identifiquei que `docs/capabilities/vault-entries/README.md` já descrevia um histórico da senha de login como parte da entrega deste plano, mas o `Scope` original não incluía essa persistência. Perguntei ao usuário como proceder (emendar e implementar, ou deixar fora e corrigir a documentação); o usuário aprovou explicitamente emendar o `Scope` agora e implementar o histórico (`UserPasswordHistory`) como parte desta mesma entrega.

## Acceptance Criteria

- `POST /auth/reset-password` com um token válido e uma nova senha retorna 200, e o login subsequente com a nova senha funciona.
- Após a troca, todas as entradas de cofre criadas antes da troca continuam legíveis e idênticas (mesmo conteúdo decifrado) — validado comparando o conteúdo decifrado antes e depois da troca.
- Um token de reset expirado ou já usado retorna 400/410 (não permite a troca).
- Tentar logar com a senha antiga após a troca falha (401).
- Após uma troca de senha bem-sucedida, existe um registro de histórico com o hash da senha anterior e o timestamp da troca.
- O job `build` do CI permanece verde com os testes deste plano incluídos, sem exigir nenhuma mudança no workflow.

## Validation

- `dotnet test` cobrindo: reset com token válido, token expirado, token já usado, a preservação do conteúdo decifrado do cofre antes/depois da troca, e a criação do registro de histórico da senha de login.
- Confirmar no GitHub Actions que o job `build` passou no PR desta entrega.

## Documentation Updates

- `docs/capabilities/authentication-and-users/README.md`: `Current Status` para `implemented` (o módulo de autenticação fica completo com este plano).
- `docs/capabilities/vault-entries/README.md`: atualizar a nota do `Current Status` e a Key Rule sobre histórico de senha de login, que passa a existir de fato com este plano.
- `docs/STATUS.md`: refletir o novo status.

## Outcome

Entregue via [PR #8](https://github.com/0tter-Dev/Keytography/pull/8), mergeada em `main` no commit `2ceda3e` em 2026-09-30. Commit de implementação: `929b419` (endpoint `POST /auth/reset-password`, re-wrap da DEK via chave de recuperação RSA, e o histórico de senha de login `UserPasswordHistory` incluído via emenda de escopo aprovada durante a implementação — ver `Approval`). CI (`build`) passou. Auditado via `project-audit` antes do merge, sem achados bloqueantes (Acceptance Criteria, fidelidade documental, metadados do plano, escopo, links e ADRs implícitas todos `PASS`). Validação local: `dotnet test` com 21/21 testes passando (Debug e Release), cobrindo reset com token válido/expirado/já usado, preservação do conteúdo decifrado do cofre após a troca, e criação do registro de histórico. `actual_version_impact: patch` — coerente com `expected_version_impact`, sem divergência a justificar (novo endpoint completando um fluxo parcial já existente, sem breaking changes).
