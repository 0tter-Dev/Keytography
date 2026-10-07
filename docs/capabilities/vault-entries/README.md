# Entradas de Cofre (Contas/Senhas)

## Purpose

CRUD das contas e senhas armazenadas no cofre pessoal de cada usuário.

## Current Status

`implemented` — CRUD completo, criptografia de envelope (DEK + chave dupla, ADR-0001), histórico de senhas por entrada, soft delete/lixeira, e leitura de supervisão do Admin implementados em `keytography-003`. O histórico da senha de *login* do próprio usuário (mencionado nas Key Rules abaixo) passou a existir em `keytography-004`, populado a cada redefinição de senha.

## Key Rules

- Uma conta possui três campos fixos: título de referência, Login e Senha.
- Suporte a campos adicionais de definição livre, sem schema fixo (ex.: URL, email, descrição), a critério do usuário no momento do cadastro.
- Para as operações do dono, a DEK decifrada vem do cache em memória **da sessão** (id no claim `sid` do access token): cada login tem a sua entrada, o TTL é renovado a cada refresh e logout/revogação a removem — encerrar uma sessão não afeta as outras do mesmo usuário. A DEK em cache é zerada ao ser removida ou substituída e, ao expirar, no próximo acesso ao cache (a expiração é preguiçosa; a sessão expirada já é recusada), e os endpoints a usam em cópias que são zeradas ao fim da requisição. Sem DEK em cache (sessão revogada ou servidor reiniciado), as operações de cofre respondem 401 e exigem novo login ([ADR-0002](../../decisions/ADR-0002-dek-session-cache.md), [ADR-0006](../../decisions/ADR-0006-backend-managed-sessions.md)).
- Senhas são armazenadas de forma criptografada, nunca em texto puro, usando o esquema de chave dupla (DEK simétrica por usuário + duas cópias cifradas dela) definido em [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md).
- Histórico é mantido tanto para a senha de login do próprio usuário (hash da senha anterior + timestamp, a cada redefinição via `POST /auth/reset-password`) quanto para as senhas de cada conta cadastrada, permitindo consultar quando ela mudou.
- O histórico de senhas alimenta os critérios de [password-evaluation](../password-evaluation/README.md) (ex.: repetição de senha/padrão já usado antes, na mesma conta ou em outras). Desde `keytography-005`, cada entrada guarda a nota de força resultante e o detalhamento por critério, recalculados automaticamente a cada criação/edição.
- Exclusão usa soft delete por padrão: o registro vai para uma lixeira restaurável. Exclusão definitiva é uma ação manual disparada a partir da lixeira. Período de retenção antes de qualquer limpeza automática ainda não foi definido.
- **Evolução futura (não implementada):** organização por tags, favoritos, e um esquema de grupos/subgrupos, discutidos durante o planejamento da interface web (ver [web-interface](../web-interface/README.md#future-considerations)). Exigem schema novo neste módulo — registrados aqui só para não se perderem.

## Main Relationships

- depends on [authentication-and-users](../authentication-and-users/README.md): toda entrada de cofre pertence a um usuário autenticado, e o acesso de leitura/escrita segue as regras de role definidas lá.
- is used by [password-evaluation](../password-evaluation/README.md): fornece a senha atual e o histórico a avaliar.
- is used by [password-generation](../password-generation/README.md): senhas geradas são salvas como entradas deste módulo.
- is used by [web-interface](../web-interface/README.md): telas de listagem, criação, edição, lixeira e histórico de entradas.

## Cross-Cutting Decisions

- [ADR-0001: Criptografia do cofre com chave dupla e recuperação de acesso](../../decisions/ADR-0001-vault-encryption-and-recovery.md) — define o esquema de criptografia usado por este módulo.
- [ADR-0002: Cache em memória da DEK por sessão](../../decisions/ADR-0002-dek-session-cache.md) — define como este módulo obtém a DEK já decifrada para operações do dono (via cache) e da supervisão do Admin (via chave de recuperação, sem cache).
- [ADR-0006: Sessões gerenciadas pelo backend, com refresh em cookie `HttpOnly` e DEK atrelada à sessão](../../decisions/ADR-0006-backend-managed-sessions.md) — o cache da DEK passa a ser por sessão (TTL renovado no refresh, removido no logout/revogação).
- [ADR-0003: Recálculo retroativo de avaliação de senha via decifragem em lote pela chave de recuperação](../../decisions/ADR-0003-retroactive-evaluation-bulk-recovery-decrypt.md) — define como [password-evaluation](../password-evaluation/README.md) acessa em lote as senhas deste módulo para recalcular notas de usuários não logados.
