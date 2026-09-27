# Autenticação e Usuários

## Purpose

Gerenciar identidade, autenticação e controle de acesso por role dos usuários do Keytography.

## Current Status

`planned`

## Key Rules

- Login via JWT com expiração, seguindo padrão geral de mercado, sem conceito de "master password" separada.
- Cadastro exige validação por e-mail, além de Login e senha próprios.
- Duas roles: `Admin` e `Member`. `Admin` tem acesso total ao próprio cofre pessoal e, adicionalmente, pode **consultar** (somente leitura) os cofres de todos os outros usuários. `Member` tem acesso total apenas ao próprio cofre.
- Somente o dono de um cofre pode adicionar ou editar suas próprias contas/senhas — a permissão de leitura do `Admin` sobre outros cofres nunca inclui escrita.
- O primeiro usuário registrado no sistema recebe a role `Admin` automaticamente. Todos os cadastros seguintes recebem `Member` por padrão.
- Fluxo de "Esqueci minha senha" baseado na validação por e-mail feita no cadastro. A conclusão da troca de senha depende do esquema de recuperação de chave definido em [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md): a senha de login pode ser trocada sem perda de acesso ao cofre.

## Cross-Cutting Decisions

- [ADR-0001: Criptografia do cofre com chave dupla e recuperação de acesso](../../decisions/ADR-0001-vault-encryption-and-recovery.md) — define como o acesso de supervisão do `Admin` e a recuperação de senha funcionam sem exigir uma "master password" separada.

## Main Relationships

- is used by [vault-entries](../vault-entries/README.md): todo acesso a uma conta/senha passa por autenticação e checagem de role.
