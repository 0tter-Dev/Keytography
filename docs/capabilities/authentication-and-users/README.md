# Autenticação e Usuários

## Purpose

Gerenciar identidade, autenticação e controle de acesso por role dos usuários do Keytography.

## Current Status

`implemented` — registro, verificação de e-mail, login com JWT, bootstrap do Admin, e o ciclo completo de redefinição de senha (solicitação e conclusão) implementados em `keytography-002` e `keytography-004`. Desde `keytography-003`, registro e login também disparam o ciclo de vida da DEK do cofre (ver Key Rules abaixo e [ADR-0002](../../decisions/ADR-0002-dek-session-cache.md)).

## Key Rules

- Login via JWT com expiração, seguindo padrão geral de mercado, sem conceito de "master password" separada.
- Cadastro exige validação por e-mail, além de Login e senha próprios.
- Duas roles: `Admin` e `Member`. `Admin` tem acesso total ao próprio cofre pessoal e, adicionalmente, pode **consultar** (somente leitura) os cofres de todos os outros usuários. `Member` tem acesso total apenas ao próprio cofre.
- Somente o dono de um cofre pode adicionar ou editar suas próprias contas/senhas — a permissão de leitura do `Admin` sobre outros cofres nunca inclui escrita.
- O primeiro usuário registrado no sistema recebe a role `Admin` automaticamente. Todos os cadastros seguintes recebem `Member` por padrão.
- Fluxo de "Esqueci minha senha": `POST /auth/forgot-password` emite um token de redefinição (1h de validade) por e-mail sem revelar se o e-mail existe; `POST /auth/reset-password` consome esse token (uma única vez) e troca a senha de login. A troca usa o esquema de recuperação de chave definido em [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md): a cópia de recuperação da DEK (chave RSA do sistema) é desfeita e uma nova cópia "do dono" é cifrada com a chave derivada (Argon2id) da nova senha — a DEK em si nunca muda, então a senha de login é trocada sem perda de acesso ao cofre.
- No registro, a senha em texto puro (disponível só neste momento e no login) é usada para gerar a DEK do cofre e cifrar sua cópia "do dono" — ver [vault-entries](../vault-entries/README.md) e [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md).
- No login, a mesma senha é usada para desfazer a cópia "do dono" da DEK, que fica em cache em memória (nunca em disco) pelo tempo de vida do JWT, para as operações de cofre da sessão — ver [ADR-0002](../../decisions/ADR-0002-dek-session-cache.md).

## Cross-Cutting Decisions

- [ADR-0001: Criptografia do cofre com chave dupla e recuperação de acesso](../../decisions/ADR-0001-vault-encryption-and-recovery.md) — define como o acesso de supervisão do `Admin` e a recuperação de senha funcionam sem exigir uma "master password" separada.
- [ADR-0002: Cache em memória da DEK por sessão](../../decisions/ADR-0002-dek-session-cache.md) — define como o registro e o login deste módulo entregam a DEK decifrada para as operações de cofre da sessão.

## Main Relationships

- is used by [vault-entries](../vault-entries/README.md): todo acesso a uma conta/senha passa por autenticação e checagem de role.
