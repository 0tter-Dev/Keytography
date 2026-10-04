---
id: keytography-017
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 17
depends_on: [keytography-016]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records:
  - docs/decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md
validation: []
documentation_updates: []
---

# Interface web: sessão com refresh e logout real

## Objective

Adaptar o cliente web ao modelo de sessão gerenciado pelo backend (`keytography-016`): access token só em memória, refresh silencioso via cookie `HttpOnly`, restauração da sessão ao recarregar a página ou abrir outra aba, e logout que de fato revoga a sessão no servidor.

## Context

A `keytography-008` guarda o JWT em `sessionStorage` e trata o logout como local ([ADR-0005](../../decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md)). Com a `keytography-016`, a API passa a emitir um access token curto, um refresh token rotativo em cookie `HttpOnly` e endpoints de refresh e logout. Sem este plano, o cliente da `008` desloga a cada fim de access token. Este plano vem antes da UI de cofre (`keytography-009`) e deve ser mergeado logo depois do `016`.

## Scope

- **Access token só em memória:** o `session-store` deixa de persistir o token (nada de `sessionStorage`/`localStorage` para credenciais); o cliente guarda apenas o access token e seu `expiresAt` em memória.
- **Restauração da sessão:** ao iniciar a aplicação, tenta `POST /auth/refresh` (cookie, `credentials: 'include'`); com sucesso, entra sem pedir login (recarregar a página e abrir outra aba funcionam); sem sucesso, vai ao login. Enquanto isso, as rotas protegidas mostram um estado de carregamento, sem piscar a tela de login.
- **Refresh silencioso:** renova o access token pouco antes de vencer e, ao receber 401 em uma chamada autenticada, tenta um refresh e **repete a chamada original uma vez**. Chamadas simultâneas compartilham **um único** refresh (single-flight) dentro da aba. Se o refresh falha, a sessão termina como expirada (login com o aviso já existente).
- **Cofre sem DEK em cache:** um 401 de cofre que persiste depois de um refresh bem-sucedido (por exemplo, após reinício do servidor) encerra a sessão e leva ao login, sem entrar em laço de tentativas.
- **Logout real:** o botão "Sair" chama `POST /auth/logout`, e então limpa o estado local e o cache de consultas. Se a chamada falhar (rede), o estado local é limpo mesmo assim e o usuário é avisado de que a sessão no servidor pode continuar até expirar.
- **Cliente tipado:** `credentials: 'include'` apenas nas chamadas de `refresh` e `logout`; funções de acesso para `refresh`, `logout` e `logout-all` (a UI de "sair de todos os dispositivos" fica para `keytography-012`).
- **Testes** (Vitest + RTL, API mockada): restauração por refresh, single-flight, repetição única da chamada, fim de sessão por falha de refresh, ausência de token em qualquer storage, logout com sucesso e com falha de rede, laço evitado no cofre.
- **ADR-0005:** os temas de armazenamento e logout passam a ser decididos pelo ADR-0006 (criado no `016`); este plano ajusta as referências para o novo modelo.

## Out Of Scope

- Qualquer mudança na API, no banco ou no contrato (`keytography-016`).
- UI de "sair de todos os dispositivos" e de gestão de sessões (`keytography-012` consome `logout-all`).
- Sincronização de logout entre abas em tempo real (`BroadcastChannel`): as outras abas descobrem no próximo refresh ou 401.
- Telas de cofre, avaliação, geração e administração.

## Approval

## Acceptance Criteria

- Depois de entrar, recarregar a página (F5) mantém o usuário logado sem tela de login: o cliente restaura a sessão por `POST /auth/refresh`; abrir o Keytography em outra aba também entra direto enquanto a sessão do servidor for válida.
- Em nenhum momento o access token ou o refresh token aparecem em `localStorage` ou `sessionStorage` (verificado em teste).
- Uma chamada autenticada que recebe 401 por access token vencido dispara um único refresh, repete a chamada uma vez e o usuário não percebe; várias chamadas simultâneas nessa situação geram **uma** chamada a `/auth/refresh`.
- Quando o refresh responde 401, o usuário é levado ao login com o aviso "Sua sessão expirou"; o 401 persistente de uma chamada de cofre após um refresh bem-sucedido também termina em login, sem laço de requisições.
- "Sair" chama `POST /auth/logout`, limpa a sessão e o cache locais e leva ao login; com o servidor inacessível, o estado local também é limpo e o aviso é exibido; depois do logout, uma tentativa de restaurar a sessão (F5) cai no login.
- Verificação manual ponta a ponta contra a API real com `Sessions:AccessTokenMinutes` curto: sessão renova sozinha; logout invalida o access token antigo (a API responde 401); reinício da API leva ao login ao tocar no cofre.
- `npm run lint`, `format:check`, `build` e `npm test` passam, e o CI (`web` e `build`) permanece verde.

## Validation

- Testes de componente e de fluxo (Vitest + React Testing Library) com a API mockada, cobrindo cada critério acima.
- Verificação manual no navegador contra a API local (cookies `HttpOnly` não são visíveis ao script; conferir no painel de rede e nas ferramentas de armazenamento).
- `project-audit` antes do merge, em subagente.

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: substituir a descrição de sessão (JWT em `sessionStorage`, logout local) pelo novo modelo (access token em memória, refresh por cookie, restauração, single-flight, logout real).
- `docs/guides/web-frontend-conventions.md`: seção "Sessão e rotas protegidas" atualizada (nada de token em storage, refresh e repetição de chamada centralizados no cliente tipado).
- `docs/guides/running-locally.md`: origem do frontend precisa estar em `Cors:AllowedOrigins` por causa do cookie, e `Sessions:*` para testar renovação.
- `docs/decisions/ADR-0005-*` e `docs/decisions/ADR-0006-*`: ajustes de referência ao modelo implementado, se necessário.
- `README.md` (raiz): Current Scope e Quick Start passam a refletir a sessão renovável e o logout real; Stack: constatação deliberada de que não muda.
- `docs/STATUS.md` e `docs/ROADMAP.md`: refletir o novo status.
- `docs/reference/` (contrato): constatação deliberada de que não muda — nenhum endpoint ou DTO é alterado aqui.
- Capabilities de backend (`authentication-and-users`, `vault-entries`): constatação deliberada de que não são tocadas — fora de `authorized_capabilities` e já atualizadas no `016`.

## Outcome
