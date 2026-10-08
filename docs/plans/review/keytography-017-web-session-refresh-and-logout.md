---
id: keytography-017
status: review
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
  - docs/decisions/ADR-0006-backend-managed-sessions.md
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
- **Refresh silencioso:** renova o access token pouco antes de vencer e, ao receber 401 em uma chamada autenticada, tenta um refresh e **repete a chamada original uma vez**. Chamadas simultâneas compartilham **um único** refresh (single-flight) dentro da aba. Se o refresh é rejeitado (401), a sessão termina como expirada (login com o aviso já existente); falhas de rede ou `5xx` não a derrubam (ver `Implementation Clarifications`).
- **Cofre sem DEK em cache:** um 401 de cofre que persiste depois de um refresh bem-sucedido (por exemplo, após reinício do servidor) encerra a sessão e leva ao login, sem entrar em laço de tentativas.
- **Troca de conta entre abas (achado da discussão de S1 do `016`):** como o cookie de refresh é compartilhado pelo navegador e o login passa a **substituir** a sessão do cookie anterior, uma aba que ficou aberta com a conta A recebe 401 e, ao renovar com o cookie novo, passaria a operar como a conta B sem avisar. O cliente detecta isso: depois de um refresh que restaura ou renova a sessão, compara o usuário (`GET /auth/me`) com o que a aba já tinha; se mudou, descarta o estado e o cache locais, mostra um aviso claro (por exemplo, "Você entrou com outra conta em outra aba ou janela") e leva ao início já como a conta atual — como GitHub e outros sistemas fazem. Se for a mesma conta, nada muda para o usuário.
- **401 de refresh de uma requisição antiga:** o servidor (`016`) não apaga mais o cookie num 401 de refresh, então a corrida entre abas (resposta antiga chegando depois do login novo) não derruba a sessão nova; o cliente só precisa tratar o 401 como fim de sessão da aba.
- **Sessão encerrada pelo servidor:** um 401 que persiste depois do refresh (sessão revogada por `logout-all`, reset de senha ou teto de sessões) leva ao login com o aviso de sessão encerrada.
- **Logout real:** o botão "Sair" chama `POST /auth/logout`, e então limpa o estado local e o cache de consultas. Se a chamada falhar (rede), o estado local é limpo mesmo assim e o usuário é avisado de que a sessão no servidor pode continuar até expirar.
- **Cliente tipado:** `credentials: 'include'` nas chamadas de `login`, `refresh` e `logout` (sem ele no `login` o navegador ignora o `Set-Cookie` da resposta, pois a web e a API são origens diferentes, e a substituição de sessão do `016` nunca dispara); funções de acesso para `refresh`, `logout` e `logout-all` (a UI de "sair de todos os dispositivos" fica para `keytography-012`).
- **Testes** (Vitest + RTL, API mockada): restauração por refresh, single-flight, repetição única da chamada, fim de sessão por falha de refresh, ausência de token em qualquer storage, logout com sucesso e com falha de rede, laço evitado no cofre.
- **ADR-0005:** os temas de armazenamento e logout passam a ser decididos pelo ADR-0006 (criado no `016`); este plano ajusta as referências para o novo modelo.

## Out Of Scope

- Qualquer mudança na API, no banco ou no contrato (`keytography-016`).
- UI de "sair de todos os dispositivos" e de gestão de sessões (`keytography-012` consome `logout-all`).
- Sincronização de logout entre abas em tempo real (`BroadcastChannel`): as outras abas descobrem no próximo refresh ou 401.
- Telas de cofre, avaliação, geração e administração.

## Approval

Aprovado pelo usuário em 2026-10-06, ao pedir explicitamente a ativação e a implementação deste plano (o próximo da fila do `ROADMAP.md`). Este plano não altera a API, o banco nem o contrato (só consome os endpoints do `016`) e não muda criptografia, autenticação do backend nem controle de acesso por role; toca o **lado cliente** da sessão, cujas decisões já foram aprovadas no `016` e registradas no [ADR-0006](../../decisions/ADR-0006-backend-managed-sessions.md).

Os esclarecimentos de implementação (ajustes de meio, não previstos no `Scope`) estão na seção seguinte; foram apresentados ao usuário no relatório da primeira `project-audit` deste PR e **aceitos por ele em 2026-10-07**, com a decisão de mantê-los numa seção própria em vez de dentro desta.

## Implementation Clarifications

Ajustes de meio, sem alterar o objetivo nem os critérios de aceite. Dois divergem do texto do `Scope` e prevalecem sobre ele: **(a)** só um `401` do refresh encerra a sessão (rede, `403` e `5xx` não); **(b)** após um `401` persistente o cliente também avisa a API (`logout`, em segundo plano).

- **Identidade no store, não no TanStack Query:** o usuário da sessão (`GET /auth/me`) passa a viver no store da sessão e `useCurrentUser()` o lê de lá (carregado sob demanda; se a leitura falha, tenta de novo a cada 15 s, até 5 tentativas). A verificação de troca de conta compara a conta que a aba mostrava com a que o cookie compartilhado agora representa, e isso precisa acontecer fora do React. Consequência: as consultas deixam de incluir o token na `queryKey`, e o cache só é esvaziado quando a sessão termina e redefinido quando a **conta muda** (renovar o token da mesma conta não limpa nada; as telas já montadas recarregam como a conta nova). A leitura de `/auth/me` é compartilhada só entre chamadas do **mesmo token**, e a identidade lida com um token que já foi trocado é descartada.
- **Quando a sessão NÃO é derrubada:** um refresh que falha por rede, `403` ou `5xx` não encerra a sessão (só um `401` do refresh a encerra); a renovação em segundo plano tenta de novo a cada 15 s, e se o access token vence sem renovação a sessão termina. Um refresh que ainda está em andamento no vencimento é **esperado** antes de a sessão ser encerrada (computador que volta de suspensão, API lenta).
- **Parâmetros do cliente:** renovação 30 s antes do vencimento, com **piso de 5 s** no atraso até a próxima renovação; quando o servidor devolve tokens que o relógio do dispositivo já considera dentro da janela (relógio adiantado, vida útil menor que 30 s), o intervalo **dobra** a cada renovação seguida e, na quinta, o cliente **desiste** de renovar em segundo plano (as chamadas e o 401 ainda renovam; um token normal zera a conta) — um relógio adiantado por mais que a vida útil do token continua inutilizando a sessão, o que o cliente não tem como corrigir sem o horário do servidor; um token com menos de 5 s restantes é renovado antes de a chamada sair; `/auth/me` e `/auth/logout` nunca disparam renovação (evita esperar por si mesmos); o `POST /auth/refresh` tem **tempo limite de 20 s**, implementado com `AbortController` próprio (não depende de `AbortSignal.timeout`); os caminhos públicos são comparados por igualdade com o caminho base da API.
- **Fim de sessão durante um refresh em voo:** logout (desde o início da chamada) ou expiração durante um refresh descarta a resposta dele, para uma resposta tardia não reabrir a sessão encerrada nem marcá-la como expirada depois de um logout. Um refresh de uma sessão que já terminou não é compartilhado com quem pede depois de um novo login.
- **Restauração com a API fora do ar:** a tela é liberada (login) e um aviso informa que não foi possível falar com o servidor; um `401` (sem cookie) não avisa nada.
- **Nenhuma chamada sai com o token de outra conta:** se a renovação feita antes de uma chamada revela outra conta, a chamada **não sai** (o chamador recebe o 401 que o servidor daria); se `GET /auth/me` falha depois de uma renovação e a aba já mostrava uma conta, a conta fica *por conferir* (`unverified`) e as chamadas autenticadas não saem até a conferência dar certo (nova tentativa a cada 15 s, sem novo refresh). Um 401 com a conta por conferir não repete a chamada.
- **`logout-all`:** o cliente ganha `logoutAllSessions()` (`POST /auth/logout-all`, com `credentials: 'include'` porque a API apaga o cookie), com o mesmo tratamento local do logout; a tela que o usa é do `keytography-012`.
- **Troca de conta:** quando o refresh devolve outra conta, a chamada original **não** é repetida (devolveria dados da conta nova à tela da anterior); o aviso é mostrado pelo `RequireAuth`, que cobre qualquer tela protegida (numa rota pública com sessão ativa, como `/verify-email`, ele aparece ao entrar numa rota protegida).
- **Após 401 persistente:** além de encerrar a sessão como expirada, o cliente avisa a API (`logout`, em segundo plano) para o cookie não restaurar uma sessão sem DEK no próximo F5.
- **Verificação manual do "toque no cofre":** ainda não existe tela de cofre (`keytography-009`), então o critério de reinício da API só é coberto por teste automatizado; o restante foi verificado manualmente no navegador, **repetido em 2026-10-08 sobre o código já endurecido** (API local com banco descartável e `Sessions__AccessTokenMinutes=1`, web em `localhost:5173`): login sem nada em `localStorage`/`sessionStorage`; F5 restaura a sessão (`POST /auth/refresh` no carregamento); renovação silenciosa a cada 30 s, cada uma seguida de `GET /auth/me`, sem sair da tela; "Sair" responde `POST /auth/logout` 204 e leva ao login; F5 depois do logout recebe 401 no refresh e fica no login. A troca de conta entre abas e o reinício da API são cobertos por teste automatizado.
- **Auxiliares de teste** reorganizados: `src/test/api-stub.ts` (`stubApi`, `signInForTest`, `REFRESHED`) e `src/test/render.tsx` (`renderRoutes`, que agora inclui os avisos e, por padrão, uma aba que já restaurou a sessão).

## Acceptance Criteria

- Depois de entrar, recarregar a página (F5) mantém o usuário logado sem tela de login: o cliente restaura a sessão por `POST /auth/refresh`; abrir o Keytography em outra aba também entra direto enquanto a sessão do servidor for válida.
- Em nenhum momento o access token ou o refresh token aparecem em `localStorage` ou `sessionStorage` (verificado em teste).
- Uma chamada autenticada que recebe 401 por access token vencido dispara um único refresh, repete a chamada uma vez e o usuário não percebe; várias chamadas simultâneas nessa situação geram **uma** chamada a `/auth/refresh`.
- Quando o refresh responde 401, o usuário é levado ao login com o aviso "Sua sessão expirou"; o 401 persistente de uma chamada de cofre após um refresh bem-sucedido também termina em login, sem laço de requisições.
- Com a aba 1 logada como A, um login como B na aba 2 do mesmo navegador faz a aba 1, na próxima chamada ou renovação, mostrar o aviso de troca de conta e passar a exibir a conta B (nenhum dado da conta A permanece na tela nem no cache); um login da mesma conta A na aba 2 não mostra aviso.
- "Sair" chama `POST /auth/logout`, limpa a sessão e o cache locais e leva ao login; com o servidor inacessível, o estado local também é limpo e o aviso é exibido; depois do logout, uma tentativa de restaurar a sessão (F5) cai no login.
- Verificação manual ponta a ponta contra a API real com `Sessions:AccessTokenMinutes` curto: sessão renova sozinha; logout invalida o access token antigo (a API responde 401). O critério "reinício da API leva ao login ao tocar no cofre" só pode ser exercitado manualmente depois da tela de cofre (`keytography-009`); até lá é coberto por teste automatizado.
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
