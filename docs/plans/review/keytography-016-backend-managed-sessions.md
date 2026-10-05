---
id: keytography-016
status: review
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 16
depends_on: [keytography-008]
authorized_capabilities:
  - docs/capabilities/authentication-and-users/README.md
  - docs/capabilities/vault-entries/README.md
decision_records:
  - docs/decisions/ADR-0002-dek-session-cache.md
  - docs/decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md
  - docs/decisions/ADR-0006-backend-managed-sessions.md
validation: []
documentation_updates: []
---

# Sessões gerenciadas pelo backend (backend)

## Objective

Passar o controle da sessão do usuário para o backend: sessões persistidas no banco, access token de vida curta validado contra a sessão em cada requisição, refresh token rotativo entregue em cookie `HttpOnly`, e logout/revogação reais — incluindo a remoção da DEK em cache da sessão encerrada. É a evolução desejada registrada no [ADR-0005](../../decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md); a adaptação da interface web é o plano `keytography-017`.

## Context

Hoje o login emite um JWT de 1 hora, sem refresh, sem registro no servidor e sem logout: um token roubado vale até vencer, "sair" é só local, e a DEK decifrada fica em cache em memória por usuário até o JWT expirar ([ADR-0002](../../decisions/ADR-0002-dek-session-cache.md)). Em 2026-10-03 o usuário pediu que o controle de sessão passe a ser do backend, com persistência em banco, validação nos endpoints, refresh e logout, e confirmou as decisões abaixo antes deste plano ser escrito:

- **DEK:** continua só em memória do servidor (sem mudança no esquema de criptografia do [ADR-0001](../../decisions/ADR-0001-vault-encryption-and-recovery.md)), agora **atrelada à sessão**: o refresh renova o seu TTL e o logout/revogação a remove. Se o servidor reinicia, a sessão continua válida, mas o cofre volta a exigir novo login, como no ADR-0002.
- **Refresh token:** em **cookie `HttpOnly`** emitido pela API; o access token fica só em memória do cliente.

Este plano é o lado servidor (API, banco, contrato) e vem **antes** da UI de cofre (`keytography-009`), para que as telas de cofre já nasçam sobre o modelo final. Toca autenticação, sessão e o ciclo de vida da chave do cofre, então **exige aprovação humana explícita** (`AGENTS.md`) — inclusive dos valores padrão de tempo abaixo.

## Scope

- **Persistência de sessão:** entidade `UserSession` e migration (EF Core + SQLite): `Id`, `UserId`, hash SHA-256 do refresh token atual (nunca o token), hash do refresh token anterior e instante da rotação, `CreatedAt`, `LastRefreshedAt`, expiração por inatividade, expiração absoluta, `RevokedAt` e motivo da revogação (`logout`, `logout-all`, `password-reset`, `reuse-detected`). Sem IP nem User-Agent. Sessões expiradas ou revogadas há mais de 30 dias são removidas de forma oportunista ao criar uma sessão.
- **Login (`POST /auth/login`):** além de validar as credenciais como hoje, cria a sessão e devolve um **access token JWT de vida curta** com o claim `sid` (id da sessão). O corpo mantém os campos `token` e `expiresAt` (agora do access token); o refresh token (256 bits aleatórios) vai em cookie `HttpOnly`, `SameSite=Strict`, `Path=/auth`, `Secure` sempre que a requisição for HTTPS.
- **Validação por sessão:** um handler de validação do JwtBearer rejeita, na hora, token cujo `sid` não exista, tenha sido revogado ou esteja expirado (inatividade ou absoluta). Revogar vale imediatamente, sem esperar o JWT vencer.
- **`POST /auth/refresh`** (cookie): valida o hash e as expirações, **rotaciona** o refresh token de forma atômica (novo cookie), emite novo access token, renova a expiração por inatividade (até o limite absoluto) e o TTL da DEK da sessão. Reuso de um refresh token já rotacionado, fora de uma tolerância curta para requisições simultâneas, **revoga a sessão** (`reuse-detected`), remove a DEK e responde 401. Dentro da tolerância, devolve um access token sem rotacionar de novo.
- **`POST /auth/logout`** (cookie ou access token): revoga a sessão atual, remove a DEK dela, apaga o cookie; idempotente (204 também sem sessão).
- **`POST /auth/logout-all`** (autenticado): revoga todas as sessões do usuário e remove as DEKs delas.
- **`POST /auth/reset-password`:** passa a revogar todas as sessões do usuário (`password-reset`), pois a credencial mudou.
- **DEK por sessão:** o cache (`IDekCache`) passa a ser indexado pelo id da sessão, e não pelo usuário, para que várias sessões simultâneas coexistam e encerrar uma não derrube as outras. Os endpoints de cofre leem a DEK pelo `sid`. Sem DEK em cache (reinício do servidor), o comportamento atual é mantido: 401, exigindo novo login. O TTL da DEK acompanha a expiração por inatividade da sessão e é renovado no refresh.
- **CSRF e CORS dos endpoints que usam cookie** (`refresh`, `logout`): a API passa a permitir credenciais em CORS (origens continuam explícitas em `Cors:AllowedOrigins`), exige que um cabeçalho `Origin` **presente** seja uma origem permitida (403 caso contrário; `Origin` ausente, que não vem de navegador, é aceito — confirmado pelo usuário) e conta com `SameSite=Strict`.
- **Configuração** em `Sessions:*`, com padrões propostos (confirmados na aprovação): access token **15 minutos**, expiração por inatividade **12 horas**, expiração absoluta **7 dias**, tolerância de rotação **10 segundos**.
- **Novo login no mesmo navegador substitui a sessão do cookie anterior (S1):** o `POST /auth/login` lê o cookie de refresh enviado (o `Path=/auth` o inclui) e revoga a sessão dele (`Superseded`, com remoção da DEK) antes de criar a nova; o cookie novo sobrescreve o antigo, que ficaria órfão com a DEK em memória. Vale também quando o novo login é de outro usuário.
- **Teto de sessões simultâneas por usuário (S1):** `Sessions:MaxSessionsPerUser` (padrão **10**, de 1 a 100); ao passar dele, a sessão menos recentemente usada é revogada (`SessionLimit`, com remoção da DEK). Rate limiting continua fora de escopo.
- **Carimbo de segurança — `SecurityStamp` (S2):** novo campo em `User` (Guid, migration), gravado em cada `UserSession` com o valor lido **antes** de verificar a senha. A validação do access token e o refresh exigem que o carimbo da sessão seja o do usuário; `reset-password` o renova na mesma transação da troca de senha. Assim, uma sessão criada por um login concorrente que já tinha verificado a senha antiga nasce inválida, sem corrida (a revogação em lote não a enxerga). O mesmo mecanismo servirá à troca de senha autenticada (`keytography-012`).
- **DEK e chaves derivadas zeradas na memória (S4):** o cache guarda a própria cópia da DEK e a zera ao remover, substituir ou expirar a entrada (e `Get` devolve cópias, que quem usa descarta zeradas, via `SecretBytes`/`Lease`); as DEKs desembrulhadas (login, reset de senha, supervisão do `Admin`, recálculo em lote) e as chaves derivadas do Argon2id também são zeradas ao fim da operação. Strings (como a senha em texto puro) não são zeráveis no .NET: limitação registrada no ADR-0006.
- **Parâmetros endurecidos (S3, ratificados pelo usuário em 2026-10-05):** `ClockSkew` zero na validação do JWT (o access token vale exatamente `Sessions:AccessTokenMinutes`), `Sessions:ForceSecureCookie` (padrão `false`) para forçar `Secure` atrás de proxy que termina TLS, e cookie de refresh persistente com `Expires` igual à expiração por inatividade.
- **Verificação manual documentada (S5):** seção "Verificando as sessões com curl" em `docs/guides/running-locally.md`, com os comandos repetíveis; o resultado da verificação manual vai para o `Outcome`.
- **Contrato:** novos endpoints e respostas no OpenAPI (`docs/reference/openapi.json`) e `web/src/api/schema.d.ts` regenerados na mesma entrega (ADR-0004); o comportamento do cookie (que o OpenAPI não descreve) é documentado em `docs/reference/README.md`.
- **[ADR-0006](../../decisions/ADR-0006-backend-managed-sessions.md) (novo):** formaliza o modelo de sessão do backend e a DEK atrelada à sessão; marca o ADR-0005 como substituído (a "direção desejada" passa a ser decisão implementada) e registra no ADR-0002 que o cache passa a ser por sessão. Redigido nesta entrega a partir das decisões já confirmadas, e sujeito à aprovação humana na revisão do PR.

## Out Of Scope

- Qualquer mudança na interface web (`keytography-017`). Entre o merge deste plano e o do `017`, o cliente atual da `008` não renova o token: a sessão dele acaba ao fim do access token (15 min) e ele volta ao login. Por isso o `017` deve ser mergeado logo em seguida.
- Endpoint de "desbloqueio" do cofre sem novo login, e qualquer forma de guardar a DEK no banco ou fora da memória do servidor (a DEK segue como no ADR-0002).
- Listar ou gerenciar sessões (nome do dispositivo, IP, User-Agent) em tela ou endpoint.
- Limite de tentativas (rate limiting) de login e refresh, 2FA/TOTP e e-mail de alerta de novo login.
- Cache distribuído da DEK (continua por processo, uma instância).
- Mudança de roles ou de regras de acesso do `Admin` (um `Admin` só lê cofres alheios, como hoje).

## Approval

Aprovado pelo usuário em 2026-10-04, ao pedir explicitamente a ativação e a implementação do próximo plano do `ROADMAP.md` (este plano). As decisões de desenho foram confirmadas pelo usuário em 2026-10-03, antes de o plano ser escrito: a DEK continua só em memória do servidor, atrelada à sessão (sem mudar a criptografia do ADR-0001); o refresh token vai em cookie `HttpOnly`; a entrega é dividida em backend (este plano) e web (`keytography-017`), com este plano antes da UI de cofre. Os tempos padrão propostos (access token de 15 minutos, inatividade de 12 horas, limite absoluto de 7 dias, tolerância de rotação de 10 segundos) foram mantidos ao ativar o plano e são configuráveis em `Sessions:*`.

Este plano toca autenticação, sessão e o ciclo de vida da chave do cofre (`AGENTS.md` exige aprovação humana): o PR deve ser revisado com atenção a esses pontos, e a `project-audit` roda em subagente antes do merge.

**Confirmação do usuário (2026-10-04, após a primeira `project-audit`):** o usuário confirmou os dois esclarecimentos abaixo que tocam segurança — `Origin` ausente aceito em `refresh`/`logout` e cookie de refresh persistente (a sessão e a DEK em memória sobrevivem ao fechamento do navegador, até a expiração por inatividade ou o `logout`) — e aprovou as correções dos achados I1, I2 e dos menores.

**Decisões do usuário (2026-10-05), após a segunda `project-audit`:** (S1) adotar a opção C — a substituição da sessão do cookie no novo login mais o teto de sessões simultâneas por usuário; (S2) implementar neste plano o carimbo de segurança (`SecurityStamp`); (S3) ratificar `ClockSkew` zero e `Sessions:ForceSecureCookie`, promovendo-os ao `Scope`; (S4) zerar a DEK e as chaves derivadas na memória o quanto antes, neste plano; (S5) documentar a verificação manual com `curl` e alinhar o processo (resultado no `Outcome`). O comportamento entre abas quando outra conta entra no mesmo navegador (achado da discussão de S1) é uma decisão de interface e foi incorporado ao plano `keytography-017`.

**Esclarecimentos de implementação (2026-10-04)** — ajustes de meio, sem alterar o objetivo nem os critérios de aceite:

- **Cookie persistente, não de sessão do navegador:** o cookie de refresh tem `Expires` igual à expiração por inatividade da sessão (renovada a cada refresh), para que a sessão do navegador e a do servidor tenham a mesma validade; fechar o navegador não encerra a sessão no servidor (só `logout` ou a expiração).
- **`Origin` ausente é aceito** nos endpoints que usam o cookie (`refresh` e `logout`): clientes que não são navegador não enviam `Origin` e não sofrem CSRF; um `Origin` presente precisa estar em `Cors:AllowedOrigins` (inclusive `null` é recusado). `SameSite=Strict` complementa.
- **Datas da sessão como ticks UTC** (inteiros) no SQLite, para permitir limpeza e consultas por data no próprio banco.
- **Refresh dentro da tolerância** devolve só um novo access token, sem rotacionar o cookie (o navegador já recebeu o novo cookie pela resposta da primeira requisição).
- **Rotação atômica (achado I1 da auditoria):** o `refresh` rotaciona com um `UPDATE` condicionado ao hash lido; o requisitante que perde a corrida relê a sessão e cai na tolerância. Sem isso, refreshes simultâneos (várias abas, refresh silencioso do `keytography-017`) rotacionavam todos e deixavam no banco só o último cookie.
- **Troca de senha e revogação numa única transação (achado I2):** `reset-password` marca as sessões como revogadas no mesmo `SaveChanges` da troca de senha; as DEKs em memória saem do cache só depois do commit.
- **Menores da auditoria:** limites superiores em `Sessions:*` (falham no startup), `ClockSkew` zero no JWT (o access token vale exatamente `Sessions:AccessTokenMinutes`), `Sessions:ForceSecureCookie` para proxies que terminam TLS, barra final normalizada nas origens permitidas (CORS e `Origin` usam a mesma lista), proteção contra a DEK "ressuscitar" após logout concorrente no refresh, e limitações de desenho documentadas no ADR-0006 (reuso detectado em uma geração; `logout` só com access token vencido não revoga; `Secure` atrás de proxy).
- **Resposta de `refresh`** reutiliza o DTO `LoginResponse` (`token` e `expiresAt`), e a resposta do login mantém os mesmos campos.

## Acceptance Criteria

- `POST /auth/login` com credenciais válidas responde 200 com `token` e `expiresAt` (cerca de `Sessions:AccessTokenMinutes` à frente) e um `Set-Cookie` de refresh com `HttpOnly` e `SameSite=Strict`; a tabela de sessões ganha uma linha cujo hash de refresh **não** é igual ao valor do cookie.
- Uma chamada autenticada com um access token cuja sessão foi revogada responde 401 **imediatamente**, antes de o JWT vencer; o mesmo vale para sessão expirada por inatividade ou pelo limite absoluto (testado com relógio controlado).
- Um login enviado com o cookie de refresh de uma sessão ativa (do mesmo usuário ou de outro) revoga essa sessão com o motivo `Superseded` e remove a DEK dela; sem cookie, ou com cookie desconhecido, as outras sessões não são afetadas.
- Com `Sessions:MaxSessionsPerUser = 3`, o quarto login ativo do usuário revoga a sessão **menos recentemente usada** (`SessionLimit`), remove a DEK dela e não afeta as sessões de outro usuário; `0` e `101` falham no startup.
- Uma sessão criada com o carimbo de segurança lido antes de um `reset-password` concluído nunca vale: o access token dela e o refresh dela respondem 401, mesmo que a revogação em lote não a tenha enxergado; o reset renova o carimbo do usuário.
- A DEK em cache é zerada ao ser removida, substituída ou expirar; `Get` devolve cópias (uma cópia zerada ou alterada não afeta o cache) e uma cópia tirada durante a remoção nunca vem parcialmente zerada; os endpoints de cofre continuam funcionando (histórico, edição, supervisão do `Admin`, recálculo em lote).
- A seção "Verificando as sessões com curl" existe em `docs/guides/running-locally.md` e os comandos dela reproduzem login, refresh, reuso, logout e a recusa de `Origin` malicioso.
- Seis `POST /auth/refresh` simultâneos com o mesmo cookie respondem todos 200, exatamente um rotaciona o cookie e a sessão continua utilizável com o cookie do vencedor (teste com `Task.WhenAll`).
- `POST /auth/refresh` com o cookie válido responde 200 com novo access token e novo cookie; reapresentar o cookie anterior depois da tolerância responde 401 e **revoga a sessão** (as chamadas com o access token dessa sessão passam a dar 401); dentro da tolerância responde 200 sem rotacionar.
- `POST /auth/refresh` sem cookie, com cookie inválido ou de sessão revogada responde 401, sem revelar o motivo.
- `POST /auth/logout` responde 204, revoga a sessão, apaga o cookie e remove a DEK: as operações de cofre com o access token antigo respondem 401; repetir o logout também responde 204.
- Com duas sessões do mesmo usuário abertas, o logout de uma mantém o acesso ao cofre da outra; `POST /auth/logout-all` revoga as duas e não afeta sessões de outro usuário.
- `POST /auth/reset-password` concluído com sucesso revoga todas as sessões do usuário.
- `refresh` e `logout` com `Origin` fora de `Cors:AllowedOrigins` respondem 403; com origem permitida, funcionam; a requisição de preflight com credenciais é aceita para as origens permitidas.
- Os endpoints de cofre usam a DEK da própria sessão: dois logins do mesmo usuário geram DEKs em cache independentes, e o TTL da DEK é renovado no refresh.
- A migration aplica sobre um banco já existente (com usuários e cofre) sem perder dados, e os testes existentes continuam passando (ajustados só no que o novo modelo exige).
- `docs/reference/openapi.json` e `web/src/api/schema.d.ts` estão regenerados e commitados, e `WebClientSupportTests` e o job `web` do CI passam.
- O ADR-0006 existe, o ADR-0005 está marcado como substituído no lado do servidor (integralmente depois do `keytography-017`) e o ADR-0002 registra o cache por sessão; as capabilities autorizadas descrevem o comportamento real; o `README.md` da raiz reflete o que o projeto passa a oferecer.

## Validation

- Testes de integração do backend (`WebApplicationFactory`, SQLite em arquivo temporário) cobrindo cada critério acima, com `TimeProvider` controlável para as expirações; `dotnet build` e `dotnet test` no CI.
- Verificação manual contra a API local com `curl` e um cookie jar (roteiro em "Verificando as sessões com curl" de `docs/guides/running-locally.md`; o resultado entra no `Outcome`): login, refresh, reuso do cookie antigo, logout, `logout-all`, reset de senha, e chamadas de cofre antes e depois da revogação.
- `project-audit` antes do merge, em subagente (modo definido em `docs/plans/README.md`), com atenção a criptografia, sessão e CSRF/CORS.

## Documentation Updates

- `docs/capabilities/authentication-and-users/README.md`: sessões, access e refresh token, rotação e detecção de reuso, logout, `logout-all`, revogação no reset de senha e novas configurações.
- `docs/capabilities/vault-entries/README.md`: a DEK passa a viver por sessão (TTL renovado no refresh, removida no logout/revogação) e o comportamento sem DEK em cache.
- `docs/decisions/ADR-0006-*` (novo), `docs/decisions/ADR-0005-*` (marcado como substituído), `docs/decisions/ADR-0002-*` (cache por sessão) e `docs/decisions/README.md`.
- `docs/reference/openapi.json`, `web/src/api/schema.d.ts` e `docs/reference/README.md`: contrato regenerado e comportamento do cookie descrito.
- `docs/guides/running-locally.md`: nova seção `Sessions:*`, origens e cookies em desenvolvimento, e a seção "Verificando as sessões com curl".
- `docs/plans/README.md`: regra de processo — o resultado das verificações manuais listadas em `Validation` é registrado no `Outcome` ao fechar o plano.
- `docs/plans/backlog/keytography-017-web-session-refresh-and-logout.md`: ganha a detecção de troca de conta entre abas (achado da discussão de S1).
- `README.md` (raiz): Current Scope passa a citar sessões com refresh e logout real no backend; Quick Start e Stack: constatação deliberada de que não mudam.
- `docs/STATUS.md` e `docs/ROADMAP.md`: refletir o novo status.
- Capability `web-interface` (fora de `authorized_capabilities`): constatação deliberada de que não é tocada aqui — a mudança de interface é o `keytography-017`.

## Outcome
