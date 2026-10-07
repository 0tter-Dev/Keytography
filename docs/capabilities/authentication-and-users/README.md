# Autenticação e Usuários

## Purpose

Gerenciar identidade, autenticação e controle de acesso por role dos usuários do Keytography.

## Current Status

`implemented` — registro, verificação de e-mail, login com JWT, bootstrap do Admin, e o ciclo completo de redefinição de senha (solicitação e conclusão) implementados em `keytography-002` e `keytography-004`. Desde `keytography-003`, registro e login também disparam o ciclo de vida da DEK do cofre (ver Key Rules abaixo e [ADR-0002](../../decisions/ADR-0002-dek-session-cache.md)). Desde `keytography-016`, o login cria uma sessão controlada pelo backend (access token curto, refresh rotativo em cookie, logout e revogação) — ver [ADR-0006](../../decisions/ADR-0006-backend-managed-sessions.md).

## Key Rules

- Login via JWT de vida curta (access token), seguindo padrão geral de mercado, sem conceito de "master password" separada. O login cria uma **sessão** persistida no banco; o JWT carrega o id dela (claim `sid`).
- Cadastro exige validação por e-mail, além de Login e senha próprios.
- Duas roles: `Admin` e `Member`. `Admin` tem acesso total ao próprio cofre pessoal e, adicionalmente, pode **consultar** (somente leitura) os cofres de todos os outros usuários. `Member` tem acesso total apenas ao próprio cofre.
- Somente o dono de um cofre pode adicionar ou editar suas próprias contas/senhas — a permissão de leitura do `Admin` sobre outros cofres nunca inclui escrita.
- O primeiro usuário registrado no sistema recebe a role `Admin` automaticamente. Todos os cadastros seguintes recebem `Member` por padrão.
- Fluxo de "Esqueci minha senha": `POST /auth/forgot-password` emite um token de redefinição (1h de validade) por e-mail sem revelar se o e-mail existe; `POST /auth/reset-password` consome esse token (uma única vez) e troca a senha de login. A troca usa o esquema de recuperação de chave definido em [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md): a cópia de recuperação da DEK (chave RSA do sistema) é desfeita e uma nova cópia "do dono" é cifrada com a chave derivada (Argon2id) da nova senha — a DEK em si nunca muda, então a senha de login é trocada sem perda de acesso ao cofre.
- No registro, a senha em texto puro (disponível só neste momento e no login) é usada para gerar a DEK do cofre e cifrar sua cópia "do dono" — ver [vault-entries](../vault-entries/README.md) e [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md).
- No login, a mesma senha é usada para desfazer a cópia "do dono" da DEK, que fica em cache em memória (nunca em disco), **atrelada à sessão criada**, para as operações de cofre dela — ver [ADR-0002](../../decisions/ADR-0002-dek-session-cache.md) e [ADR-0006](../../decisions/ADR-0006-backend-managed-sessions.md).
- **Sessões (ADR-0006):** o access token (padrão 15 min) só vale enquanto a sessão dele existir, não estiver revogada e não tiver expirado — conferido no banco em toda requisição autenticada; revogar vale na hora. O **refresh token** (opaco, 256 bits; só o hash fica no banco) vai em cookie `keytography_refresh` (`HttpOnly`, `SameSite=Strict`, `Path=/auth`, `Secure` em HTTPS). A sessão tem expiração por inatividade (padrão 12 h, renovada a cada refresh) e limite absoluto (padrão 7 dias); tudo configurável em `Sessions:*` (incluindo os tetos por perfil `MaxSessionsPerMember` e `MaxSessionsPerAdmin`; valores fora do intervalo aceito falham no startup; o JWT é validado sem tolerância de relógio; `Sessions:ForceSecureCookie` marca o cookie como `Secure` atrás de proxy TLS).
- `POST /auth/refresh` (cookie): rotaciona o refresh token (de forma atômica: refreshes simultâneos com o mesmo cookie rotacionam uma só vez), emite novo access token, renova a inatividade e o TTL da DEK. O token anterior é aceito por `Sessions:RotationGraceSeconds` (padrão 10 s; requisições simultâneas, sem nova rotação); fora disso, **reuso revoga a sessão** (só o token imediatamente anterior é lembrado). Qualquer falha: 401 sem revelar o motivo e sem mexer no cookie. O cookie é persistente, com `Expires` igual à expiração por inatividade da sessão.
- `POST /auth/logout` (idempotente, 204) revoga a sessão atual e apaga o cookie; identifica a sessão pelo cookie ou, sem ele, por um access token **válido** (só com um access token vencido não revoga nada: o cookie é o canal confiável); `POST /auth/logout-all` (autenticado) revoga todas as sessões do usuário. **Concluir `POST /auth/reset-password` revoga todas as sessões** do usuário, na mesma transação da troca de senha. Toda revogação remove a DEK da sessão do cache.
- **Um navegador, uma sessão; teto por usuário e por perfil:** o login revoga a sessão do cookie de refresh enviado (`Superseded`, na mesma transação do insert da sessão nova), inclusive se for de outro usuário; um login recusado nunca revoga nada. O teto de sessões simultâneas (`Sessions:MaxSessionsPerMember`, padrão 5, e `Sessions:MaxSessionsPerAdmin`, padrão 10, de 1 a 100) revoga a menos recentemente usada (`SessionLimit`); expiradas e revogadas não contam. Ambas as revogações removem a DEK da sessão.
- **Carimbo de segurança:** `User.SecurityStamp` é renovado no `reset-password`; a sessão guarda o carimbo lido antes de verificar a senha e só vale enquanto ele for o do usuário (access token e refresh). Uma sessão com carimbo divergente é revogada, com a DEK, no primeiro uso; e o login confere o carimbo de novo logo após criar a sessão (a que perdeu a corrida nasce revogada e o login responde 401). Fecha a corrida entre um login com a senha antiga e o reset.
- `refresh` e `logout` conferem o cabeçalho `Origin`: se presente, precisa estar em `Cors:AllowedOrigins` (comparação exata — sem diferenciar maiúsculas de minúsculas e sem a barra final —; 403 caso contrário; ausente é aceito, pois não vem de navegador). O CORS permite credenciais, sempre com origens explícitas.

## Cross-Cutting Decisions

- [ADR-0001: Criptografia do cofre com chave dupla e recuperação de acesso](../../decisions/ADR-0001-vault-encryption-and-recovery.md) — define como o acesso de supervisão do `Admin` e a recuperação de senha funcionam sem exigir uma "master password" separada.
- [ADR-0002: Cache em memória da DEK por sessão](../../decisions/ADR-0002-dek-session-cache.md) — define como o registro e o login deste módulo entregam a DEK decifrada para as operações de cofre da sessão.
- [ADR-0006: Sessões gerenciadas pelo backend, com refresh em cookie `HttpOnly` e DEK atrelada à sessão](../../decisions/ADR-0006-backend-managed-sessions.md) — modelo de sessão, refresh, revogação, CSRF e a DEK por sessão.

## Main Relationships

- is used by [vault-entries](../vault-entries/README.md): todo acesso a uma conta/senha passa por autenticação e checagem de role.
- is used by [web-interface](../web-interface/README.md): telas de login, registro e redefinição de senha.
