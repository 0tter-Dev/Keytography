# ADR-0005: Modelo de sessão do cliente web e direção para sessões gerenciadas pelo backend

> **Status: substituído pelo [ADR-0006](./ADR-0006-backend-managed-sessions.md).** A "direção desejada" foi implementada no servidor pelo `keytography-016` e o cliente web foi adaptado pelo `keytography-017` (access token só em memória, restauração por refresh, logout real). O modelo de cliente descrito abaixo (JWT em `sessionStorage`, logout local) é histórico.

## Context

A API emite um JWT de 1 hora no login (`POST /auth/login`) e não tem refresh token, endpoint de logout nem registro de sessões: a validação é puramente stateless (assinatura e validade do token). Ao mesmo tempo, o servidor guarda a DEK decifrada do usuário em um cache em memória, com expiração igual à do JWT ([ADR-0002](./ADR-0002-dek-session-cache.md)). Quando o JWT vence, o cache vence junto e o usuário precisa informar a senha de novo — é a única forma de reconstruir a DEK, porque o servidor não guarda a senha.

A interface web (`keytography-008`) precisou decidir onde o cliente guarda o token, quando considera a sessão encerrada e o que significa "sair". Isso é política de autenticação que atravessa o cliente, a API e o ADR-0002, e é onde moram as consequências de segurança mais relevantes de um cofre de senhas.

## Decision

**Modelo atual (vigente), restrito ao cliente web e ao que a API já oferece:**

1. **O JWT e seu `expiresAt` ficam em `sessionStorage`** (`keytography.session`), não em `localStorage`. O token some ao fechar a aba ou a janela; a janela de exposição é menor, e o ganho de persistir entre sessões do navegador seria pequeno, já que o token dura 1 hora e não há refresh. Contrapartida aceita: abrir o Keytography em outra aba exige novo login.
2. **A sessão termina** (a) ao reidratar, se o `expiresAt` já passou; (b) por um temporizador no instante do vencimento; (c) quando a API responde 401 a uma chamada feita com o token atual. Em qualquer término, o cache de consultas do cliente é esvaziado e as rotas protegidas redirecionam ao login (com aviso, quando foi expiração).
3. **O JWT só acompanha chamadas autenticadas.** Endpoints anônimos (`/auth/login`, `/auth/register`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`, `/health`) nunca o recebem, e o 401 de um deles nunca encerra a sessão.
4. **"Sair" é local:** limpa o token e o cache no navegador. Não existe revogação no servidor, então o token continua válido até vencer e a DEK segue em cache no servidor até o fim do tempo de vida do JWT (consequência direta do ADR-0002).

**Direção desejada (implementada no servidor pelo ADR-0006; a adaptação do cliente web é o `keytography-017`):** sessões **gerenciadas e controladas pelo backend, persistidas no banco**, com validação do estado da sessão nos endpoints, refresh de token e logout/revogação reais (inclusive de todas as sessões do usuário). Isso resolve as limitações acima: "Sair" passaria a invalidar de fato a sessão e a remover a DEK do cache; o token de acesso poderia ser de vida curta com refresh controlado; e a política de onde o cliente guarda o token poderia ser revista (por exemplo, cookie `HttpOnly` para o refresh).

Esta direção **não faz parte da entrega que originou este ADR**: está implementada no servidor pelo `keytography-016` ([ADR-0006](./ADR-0006-backend-managed-sessions.md)) e será adotada pela interface web no `keytography-017` (ainda em `backlog`, dependente de aprovação humana). Ela depende de um plano próprio com aprovação humana explícita, porque:

- altera o contrato público da API (novos endpoints e respostas) e o esquema do banco (migration de sessões);
- altera o fluxo de autenticação e o controle de sessão do backend, o que o `AGENTS.md` classifica como mudança que sempre exige revisão humana;
- exige reavaliar o [ADR-0002](./ADR-0002-dek-session-cache.md): um refresh sem senha não consegue reconstruir a DEK, que só existe em memória; será preciso decidir se o TTL do cache da DEK passa a acompanhar a sessão renovada, ou se a DEK passa a ser guardada de forma protegida e vinculada à sessão, ou se o refresh passa a exigir a senha para o cofre — uma decisão de criptografia, que também exige aprovação humana;
- foge de `authorized_capabilities` e do `Scope` de `keytography-008`, que só consome endpoints existentes.

## Consequences

- Hoje, o roubo de um token válido (por exemplo, por XSS) dá acesso ao cofre do dono até o token vencer, e o logout do usuário não encurta isso. Mitigações atuais: token de vida curta (1 hora), `sessionStorage` em vez de `localStorage`, sem `dangerouslySetInnerHTML` e sem scripts carregados de outras origens na interface.
- Não há "sair de todos os dispositivos", nem como encerrar uma sessão comprometida antes do vencimento, nem como o backend saber quais sessões estão ativas.
- Rotas e telas novas da interface herdam este modelo: usam o cliente tipado (que anexa o token e trata o 401), ficam sob `RequireAuth` e consultas dependentes do usuário incluem o token na `queryKey` (ver [web-frontend-conventions.md](../guides/web-frontend-conventions.md#sessão-e-rotas-protegidas)).
- Quando as sessões passarem ao backend, o `session-store` e o middleware do cliente tipado são os únicos pontos do cliente a adaptar, e este ADR deve ser substituído por um novo.

## Alternatives Considered

- **JWT em `localStorage`:** rejeitado — sobrevive ao fechamento do navegador e fica exposto por muito mais tempo; para um cofre, preferimos o novo login.
- **Token só em memória (sem `sessionStorage`):** rejeitado por ora — recarregar a página (F5) derrubaria a sessão, uma experiência ruim para um ganho pequeno de segurança sobre `sessionStorage`; vale revisitar junto com a sessão do backend.
- **Cookie `HttpOnly` emitido pela API:** protege o token contra leitura por script, mas exige mudar a API (emissão do cookie, CORS com credenciais, proteção CSRF); entra na direção desejada, não neste plano.
- **Implementar as sessões do backend no mesmo plano da interface:** rejeitado — mistura uma mudança de segurança do backend, de contrato e de banco com uma entrega de interface, e depende de uma decisão sobre a DEK ([ADR-0002](./ADR-0002-dek-session-cache.md)).

## Canonical Links

- [docs/decisions/ADR-0002-dek-session-cache.md](./ADR-0002-dek-session-cache.md)
- [docs/capabilities/web-interface/README.md](../capabilities/web-interface/README.md)
- [docs/guides/web-frontend-conventions.md](../guides/web-frontend-conventions.md)
