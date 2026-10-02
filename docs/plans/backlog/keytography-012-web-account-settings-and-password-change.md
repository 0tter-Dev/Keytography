---
id: keytography-012
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 12
depends_on: [keytography-009]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
  - docs/capabilities/authentication-and-users/README.md
decision_records:
  - docs/decisions/ADR-0001-vault-encryption-and-recovery.md
  - docs/decisions/ADR-0002-dek-session-cache.md
validation: []
documentation_updates: []
---

# Configurações de conta: preferências de interface + troca de senha autenticada

## Objective

Implementar a tela de configurações de conta com o que já está pronto para esta fase (preferência de densidade de exibição, tema/cor de destaque, avatar gerado, perfil somente-leitura), mais um pequeno endpoint novo de troca de senha autenticada — reaproveitando o mecanismo de re-cifragem da DEK já estabelecido, sem nenhuma decisão de criptografia nova.

## Context

A tela completa de configurações de conta (nome de exibição editável, upload de imagem real) foi discutida e deliberadamente adiada para evitar mudanças grandes de backend nesta fase — ficam registradas como evolução futura em `docs/capabilities/web-interface/README.md`. A troca de senha autenticada foi avaliada como pequena o suficiente para entrar nesta mesma entrega: reaproveita exatamente o mecanismo de `POST /auth/reset-password` (`keytography-004`, `ADR-0001`), mas usando a DEK já em cache da sessão (`ADR-0002`) em vez da chave de recuperação, já que o usuário está autenticado e não precisa do fluxo de token por e-mail.

## Scope

**Backend (`authentication-and-users`):**
- `POST /auth/change-password`, autenticado, recebendo senha atual + nova senha.
- Verifica a senha atual (`PasswordHasher.Verify`) antes de qualquer mudança.
- Usa a DEK já decifrada em cache de sessão (`IDekCache`, populada no login) para re-cifrar a cópia "do dono" com a chave derivada da nova senha — a DEK em si não muda, e a entrada em cache continua válida (não precisa de novo login). Se a DEK não estiver em cache (sessão expirada), retorna 401 em vez de prosseguir.
- Registra o hash da senha anterior em `UserPasswordHistory` (mesmo padrão de `keytography-004`).
- Atualiza o hash da senha do usuário.

**Frontend (`web-interface`):**
- Tela de configurações de conta com:
  - Perfil somente-leitura (Login, E-mail, Role) a partir de `GET /auth/me`.
  - Formulário de troca de senha (senha atual + nova senha), consumindo o endpoint novo.
  - Avatar gerado a partir das iniciais do `Login`, com uma cor de fundo escolhida pelo usuário entre as 9 cores de destaque já definidas em `keytography-007` (sem upload de imagem; persistido em `localStorage`).
  - Preferência de densidade de exibição da listagem de cofre (Tabela/Lista/Cards/Blocos), persistida em `localStorage` e aplicada à listagem de `keytography-009`.
  - Seletor de tema (5 opções) e cor de destaque (9 opções), usando a infraestrutura já construída em `keytography-007` — esta é a superfície de UI que faltava.

## Out Of Scope

- Nome de exibição editável e upload de imagem real — evolução futura documentada, exige mudança de schema/armazenamento maior.
- Cor de destaque customizada (seletor livre) — evolução futura documentada.
- Qualquer alteração no esquema de DEK/criptografia além de reaproveitar o mecanismo já existente.

## Approval

## Acceptance Criteria

- Trocar a senha estando logado, informando a senha atual correta e uma nova senha válida, funciona sem exigir logout/login novamente — a sessão continua válida e o cofre continua acessível normalmente após a troca.
- Trocar a senha informando a senha atual incorreta falha com uma mensagem clara, sem alterar nada.
- Após a troca, a senha antiga para de funcionar em um login subsequente, e existe um registro de histórico com o hash anterior (mesmo padrão de `keytography-004`).
- Mudar a preferência de densidade de exibição altera imediatamente a visualização da listagem de cofre (`keytography-009`) e persiste após recarregar a página.
- Mudar o tema ou a cor de destaque na tela de configurações reflete imediatamente em toda a aplicação, não só na própria tela.
- O avatar gerado muda de cor ao selecionar uma cor diferente, e persiste após recarregar a página.
- O job `build` do CI (backend e frontend) permanece verde.

## Validation

- `dotnet test` cobrindo o endpoint novo: troca bem-sucedida (incluindo preservação do acesso ao cofre), senha atual incorreta, sessão sem DEK em cache.
- Testes de componente (frontend) cobrindo o formulário de troca de senha e os seletores de preferência.
- Verificação manual completa: trocar senha, mudar densidade, mudar tema/cor, confirmar persistência após reload.
- CI permanece verde.

## Documentation Updates

- `docs/capabilities/authentication-and-users/README.md`: documentar o novo endpoint `POST /auth/change-password` e seu uso da DEK em cache (sem novo ADR — reaproveita `ADR-0001`/`ADR-0002` sem decisão nova).
- `docs/capabilities/web-interface/README.md`: documentar a tela de configurações, o esquema de avatar gerado, e mover nome de exibição/upload de imagem/cor customizada para a seção de evolução futura (se ainda não estiverem lá).
- `docs/STATUS.md`: refletir o novo status.

## Outcome
