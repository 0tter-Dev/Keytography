# Entradas de Cofre (Contas/Senhas)

## Purpose

CRUD das contas e senhas armazenadas no cofre pessoal de cada usuário.

## Current Status

`planned`

## Key Rules

- Uma conta possui três campos fixos: título de referência, Login e Senha.
- Suporte a campos adicionais de definição livre, sem schema fixo (ex.: URL, email, descrição), a critério do usuário no momento do cadastro.
- Senhas são armazenadas de forma criptografada, nunca em texto puro, usando o esquema de chave dupla (DEK simétrica por usuário + duas cópias cifradas dela) definido em [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md).
- Histórico é mantido tanto para a senha de login do próprio usuário quanto para as senhas de cada conta cadastrada, permitindo desfazer uma alteração ou consultar quando/por que ela mudou.
- O histórico de senhas alimenta os critérios de [password-evaluation](../password-evaluation/README.md) (ex.: repetição de senha/padrão já usado antes, na mesma conta ou em outras).
- Exclusão usa soft delete por padrão: o registro vai para uma lixeira restaurável. Exclusão definitiva é uma ação manual disparada a partir da lixeira. Período de retenção antes de qualquer limpeza automática ainda não foi definido.

## Main Relationships

- depends on [authentication-and-users](../authentication-and-users/README.md): toda entrada de cofre pertence a um usuário autenticado, e o acesso de leitura/escrita segue as regras de role definidas lá.
- is used by [password-evaluation](../password-evaluation/README.md): fornece a senha atual e o histórico a avaliar.
- is used by [password-generation](../password-generation/README.md): senhas geradas são salvas como entradas deste módulo.

## Cross-Cutting Decisions

- [ADR-0001: Criptografia do cofre com chave dupla e recuperação de acesso](../../decisions/ADR-0001-vault-encryption-and-recovery.md) — define o esquema de criptografia usado por este módulo.
