# ADR-0006: Sessões gerenciadas pelo backend, com refresh em cookie `HttpOnly` e DEK atrelada à sessão

## Context

Até `keytography-008`, a API emitia um JWT de 1 hora sem refresh, sem registro no servidor e sem logout: um token roubado valia até vencer, "sair" era só local, e a DEK decifrada ficava em cache em memória por usuário até o JWT expirar ([ADR-0002](./ADR-0002-dek-session-cache.md)). O [ADR-0005](./ADR-0005-client-session-model-and-backend-managed-sessions.md) registrou esse modelo e a direção desejada pelo usuário: sessões controladas e persistidas pelo backend, com validação nos endpoints, refresh e logout reais.

Havia uma restrição de criptografia: a DEK só existe na memória do servidor e só pode ser reconstruída com a senha de login (ADR-0001/0002). Um refresh, por definição, acontece sem a senha, então era preciso decidir o que acontece com a DEK quando a sessão é renovada, encerrada ou o servidor reinicia. Em 2026-10-03 o usuário confirmou as decisões abaixo (plano `keytography-016`).

## Decision

1. **Sessões persistidas no banco** (`UserSession`): id, usuário, **hash SHA-256** do refresh token atual e do anterior (nunca o token), datas de criação, de último refresh, de expiração por inatividade e de expiração absoluta, e revogação (instante e motivo: `Logout`, `LogoutAll`, `PasswordReset`, `ReuseDetected`). Não se guardam IP nem User-Agent. Sessões encerradas há mais de 30 dias são removidas ao criar uma nova.
2. **Access token curto (JWT) com o claim `sid`** (id da sessão), padrão 15 minutos. Em **toda requisição autenticada** o servidor confere no banco que a sessão do `sid` pertence ao usuário do token, não foi revogada e não expirou (inatividade ou limite absoluto). Revogar vale **na hora**, sem esperar o JWT vencer; tokens sem `sid` (anteriores a esta mudança) são recusados.
3. **Refresh token opaco** (256 bits aleatórios) em **cookie `HttpOnly`**, `SameSite=Strict`, `Path=/auth`, `Secure` quando a requisição é HTTPS, com `Expires` igual à expiração por inatividade da sessão. O corpo do login continua devolvendo `token` e `expiresAt` (agora do access token).
4. **`POST /auth/refresh`** rotaciona o refresh token a cada uso, emite novo access token e renova a expiração por inatividade (limitada ao limite absoluto) e o TTL da DEK. O token anterior é aceito por uma **tolerância curta** (padrão 10 s), só para requisições simultâneas (devolve um access token, sem nova rotação); **fora dela, o reuso revoga a sessão inteira** (`ReuseDetected`) e remove a DEK. Cookie ausente, desconhecido ou de sessão revogada/expirada: 401 sem revelar o motivo.
5. **Logout e revogação:** `POST /auth/logout` (cookie ou access token; idempotente, 204) revoga a sessão atual; `POST /auth/logout-all` (autenticado) revoga todas as do usuário; **concluir `POST /auth/reset-password` revoga todas as sessões** do usuário. Toda revogação remove a(s) DEK(s) da(s) sessão(ões) do cache.
6. **A DEK continua só em memória do servidor, agora atrelada à sessão** (sem mudança alguma no esquema de criptografia do [ADR-0001](./ADR-0001-vault-encryption-and-recovery.md)): o cache é indexado pelo **id da sessão**, e não pelo usuário, para que várias sessões simultâneas coexistam e encerrar uma não derrube as outras. O TTL acompanha a expiração por inatividade e é renovado no refresh. **Sem DEK em cache (reinício do servidor), vale o comportamento do ADR-0002:** a sessão continua válida, mas as operações de cofre respondem 401 e exigem novo login. Não há endpoint de "desbloqueio".
7. **CSRF e CORS dos endpoints que usam o cookie** (`refresh`, `logout`): `SameSite=Strict`, mais a exigência de que um `Origin` presente esteja em `Cors:AllowedOrigins` (inclusive `null` é recusado, 403). `Origin` ausente é aceito: clientes que não são navegador não enviam `Origin` e não sofrem CSRF. O CORS passa a permitir credenciais, sempre com origens explícitas.
8. **Tempos configuráveis** em `Sessions:*`, com os padrões aprovados: `AccessTokenMinutes` 15, `IdleHours` 12, `AbsoluteDays` 7, `RotationGraceSeconds` 10. Valores inválidos falham no startup.

Este ADR substitui, no lado do servidor, a "direção desejada" do ADR-0005 e atualiza o ADR-0002 (cache por sessão). O lado do cliente web (access token só em memória, refresh silencioso, logout real) é o plano `keytography-017`; até lá o modelo de cliente do ADR-0005 segue em uso, com a consequência prática de a sessão do cliente acabar junto com o access token (15 minutos).

## Consequences

- Logout, "sair de todos os dispositivos" e a revogação por reset de senha passam a ser reais: o token antigo deixa de funcionar imediatamente e a DEK sai da memória do servidor.
- Roubar um access token dá acesso por no máximo 15 minutos (ou até a revogação); roubar o refresh token por script deixa de ser possível na web (`HttpOnly`), e o reuso de um refresh token rotacionado derruba a sessão.
- **A DEK passa a ficar em memória por até a duração da sessão ativa** (12 horas de inatividade, até 7 dias), e não mais 1 hora. É o preço de ter refresh sem pedir a senha de novo, e é limitado: o `logout`, a expiração e a revogação a removem; a duração é configurável.
- Cada requisição autenticada passa a fazer uma consulta ao banco (sessão). Em SQLite local, com uma instância, isso é desprezível; escalar horizontalmente exigiria revisar isso e o cache de DEK por processo (já registrado no ADR-0002).
- O contrato ganha `POST /auth/refresh`, `/auth/logout` e `/auth/logout-all`; o OpenAPI não descreve o cookie, que é documentado em [docs/reference/README.md](../reference/README.md).
- Até o `keytography-017`, o cliente web da `008` perde a sessão a cada 15 minutos (volta ao login).
- Reiniciar o servidor mantém as sessões válidas, mas esvazia as DEKs: o cofre exige novo login até lá (como antes).
- Clientes que não são navegador (Mobile/Desktop) não podem depender de cookie `HttpOnly` da mesma forma; precisarão de um canal próprio para o refresh token, a definir quando existirem.

## Alternatives Considered

- **DEK embrulhada e guardada no banco por sessão** (sobrevive a reinício): rejeitada — aumenta a superfície de ataque (banco + token comprometidos exporiam a DEK) e muda a criptografia; exigiria revisão bem mais pesada. O custo aceito é o novo login após reinício do servidor.
- **Refresh token no corpo da resposta, guardado pelo cliente:** rejeitado para a web — ficaria acessível a scripts (XSS), anulando o ganho de segurança do refresh; mais simples para clientes nativos, que ficam para quando existirem.
- **JWT sem estado com lista de revogados:** rejeitado — a consulta por sessão já é necessária para expiração por inatividade e por limite absoluto, e dá revogação imediata sem lista paralela.
- **Refresh sem rotação:** rejeitado — a rotação com detecção de reuso limita o estrago de um refresh token vazado; a tolerância curta evita falsos positivos com requisições simultâneas (abas compartilham o cookie).
- **Endpoint de desbloqueio do cofre sem novo login após reinício:** adiado — acrescenta superfície de autenticação; o novo login já resolve.

## Canonical Links

- [docs/decisions/ADR-0001-vault-encryption-and-recovery.md](./ADR-0001-vault-encryption-and-recovery.md)
- [docs/decisions/ADR-0002-dek-session-cache.md](./ADR-0002-dek-session-cache.md)
- [docs/decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md](./ADR-0005-client-session-model-and-backend-managed-sessions.md)
- [docs/capabilities/authentication-and-users/README.md](../capabilities/authentication-and-users/README.md)
- [docs/capabilities/vault-entries/README.md](../capabilities/vault-entries/README.md)
- [docs/reference/README.md](../reference/README.md)
