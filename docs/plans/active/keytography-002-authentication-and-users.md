---
id: keytography-002
status: active
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: high
sequence: 2
depends_on: [keytography-001]
authorized_capabilities:
  - docs/capabilities/authentication-and-users/README.md
decision_records:
  - docs/decisions/ADR-0001-vault-encryption-and-recovery.md
validation: []
documentation_updates: []
---

# Autenticação e cadastro de usuários

## Objective

Implementar autenticação e gestão de usuários: cadastro com verificação de e-mail, login com emissão de JWT, controle de acesso por role (`Admin`/`Member`) com a regra de bootstrap do primeiro Admin, e a etapa de solicitação de redefinição de senha.

## Context

`docs/capabilities/authentication-and-users/README.md` define as regras de negócio deste módulo. A promoção a `Admin` (primeiro usuário registrado) foi decidida durante o `project-plans`. A conclusão da troca de senha (etapa que re-cifra a DEK conforme `ADR-0001`) depende da criptografia de `vault-entries`, que ainda não existe — por isso fica fora de escopo aqui e vira o plano `keytography-004`.

## Scope

- Endpoint de registro: recebe título/login, e-mail e senha; cria o usuário; primeiro usuário registrado no sistema recebe role `Admin`, todos os demais recebem `Member`.
- Verificação de e-mail: gera um token de verificação associado ao cadastro; usuário só pode fazer login após confirmar. O envio real do e-mail fica abstraído atrás de uma interface (`IEmailSender` ou equivalente), com uma implementação de desenvolvimento que registra o conteúdo em log — a integração com um provedor real de e-mail (SMTP/serviço) é uma decisão técnica futura, fora de escopo aqui.
- Endpoint de login: valida credenciais (e verificação de e-mail concluída) e emite um JWT com expiração.
- Middleware/policy de autorização por role, aplicável a endpoints futuros que precisem diferenciar `Admin` de `Member`.
- Endpoint de solicitação de redefinição de senha: recebe o e-mail, gera um token de reset (mesma abstração de envio de e-mail), sem ainda efetivar a troca de senha.

## Out Of Scope

- Conclusão do fluxo de redefinição de senha (troca efetiva + re-wrap da DEK) — plano `keytography-004`.
- Qualquer endpoint ou regra de `vault-entries`, `password-evaluation` ou `password-generation`.
- Integração real com provedor de e-mail (SMTP/serviço terceiro).
- Refresh tokens ou revogação de sessão (pode ser adicionado depois sem quebrar este escopo).

## Approval

Aprovado pelo usuário em 2026-09-27, ao confirmar a conclusão de `keytography-001` e pedir explicitamente para prosseguir com a implementação deste plano.

## Acceptance Criteria

- `POST /auth/register` com dados válidos cria o usuário com status "aguardando verificação de e-mail" e retorna 201.
- O primeiro usuário jamais registrado no banco recebe a role `Admin`; o segundo registro em diante recebe `Member` — verificável consultando o registro criado.
- Tentar fazer login (`POST /auth/login`) antes de confirmar o e-mail retorna 403 (ou equivalente) com uma mensagem indicando e-mail não verificado.
- Confirmar o e-mail via o endpoint/token de verificação, e então logar com sucesso, retorna 200 com um JWT válido no corpo.
- Um endpoint protegido de teste (ex.: `GET /auth/me`) retorna 401 sem token, e 200 com os dados do usuário autenticado quando um JWT válido é enviado.
- `POST /auth/forgot-password` com um e-mail existente gera um token de reset (verificável em log, dado que o envio real está abstraído) e retorna 200 sem revelar se o e-mail existe (para não vazar quais e-mails estão cadastrados).
- O job `build` do CI (já executando `dotnet build`/`dotnet test` desde `keytography-001`) permanece verde com os testes deste plano incluídos, sem exigir nenhuma mudança no workflow.

## Validation

- `dotnet test` cobrindo os cenários de registro, bootstrap do Admin, verificação de e-mail, login (sucesso e falha), autorização por role, e solicitação de reset.
- Testes de integração (in-memory ou SQLite de teste) exercitando os endpoints ponta a ponta.
- Confirmar no GitHub Actions que o job `build` passou no PR desta entrega.

## Documentation Updates

- `docs/capabilities/authentication-and-users/README.md`: atualizar `Current Status` para `in_progress` (a conclusão de reset fica no plano `keytography-004`, então o módulo não fecha como `implemented` ainda).
- `docs/STATUS.md`: refletir o novo status da capability no dashboard.

## Outcome
