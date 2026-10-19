---
id: keytography-017
status: completed
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: minor
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

Os esclarecimentos de implementação (ajustes de meio, não previstos no `Scope`) estão na seção seguinte; foram apresentados ao usuário nos relatórios da `project-audit` deste PR e **aceitos por ele em 2026-10-07** (esclarecimentos do primeiro relatório, mantidos numa seção própria em vez de dentro desta) **e em 2026-10-08**, quando o usuário **confirmou no chat, em resposta ao relatório da 4ª auditoria ("Confirmo")**, item a item: o `logout-all`, a política de conta por conferir (`unverified`) que impede chamadas com o token de outra conta, a época de sessão e a versão da conta carimbadas nas chamadas, o espaçamento com desistência das renovações em segundo plano, o teto de 5 leituras de identidade e os tempos limite de 20 s (refresh, `/auth/me`, logout). Todos tocam a autenticação do lado do cliente; os commits `06a0de9` e `6257412` os introduziram durante as rodadas de auditoria, e a confirmação acima é a que cobre esses itens. Em 2026-10-15, na resposta à 5ª auditoria, o usuário confirmou também os dois itens do commit `e156af2` que não estavam enumerados: um 401 **do servidor** no logout conta como sessão já encerrada (sem aviso), e um 401 tardio de token já trocado espera a conferência de conta pendente antes de decidir a repetição; e pediu para revisar o texto consolidado de `Invariants And Failure Modes`. **Em 2026-10-19 o usuário revisou e aprovou o texto de `Invariants And Failure Modes` (Design Gate), incluindo `Known Limitations` e `Verification Matrix`, no estado do commit anterior a este registro.**

A seção `Invariants And Failure Modes` (com `Known Limitations` e `Verification Matrix`) foi consolidada em 2026-10-15 a partir das invariantes validadas nas rodadas de auditoria e já confirmadas pelo usuário item a item (ver `Implementation Clarifications`), para cumprir o Design Gate (seção de `docs/plans/README.md`) introduzido depois do início desta entrega.

## Implementation Clarifications

Ajustes de meio, sem alterar o objetivo nem os critérios de aceite. Dois divergem do texto do `Scope` e prevalecem sobre ele: **(a)** só um `401` do refresh encerra a sessão (rede, `403` e `5xx` não); **(b)** após um `401` persistente o cliente também avisa a API (`logout`, em segundo plano).

- **Identidade no store, não no TanStack Query:** o usuário da sessão (`GET /auth/me`) passa a viver no store da sessão e `useCurrentUser()` o lê de lá (carregado sob demanda; se a leitura falha, tenta de novo a cada 15 s, até 5 tentativas). A verificação de troca de conta compara a conta que a aba mostrava com a que o cookie compartilhado agora representa, e isso precisa acontecer fora do React. Consequência: as consultas deixam de incluir o token na `queryKey`, e o cache só é esvaziado quando a sessão termina e redefinido quando a **conta muda** (renovar o token da mesma conta não limpa nada; as telas já montadas recarregam como a conta nova). A leitura de `/auth/me` é compartilhada só entre chamadas do **mesmo token**, e a identidade lida com um token que já foi trocado é descartada.
- **Quando a sessão NÃO é derrubada:** um refresh que falha por rede, `403` ou `5xx` não encerra a sessão (só um `401` do refresh a encerra); a renovação em segundo plano tenta de novo a cada 15 s, e se o access token vence sem renovação a sessão termina. Um refresh que ainda está em andamento no vencimento é **esperado** antes de a sessão ser encerrada (computador que volta de suspensão, API lenta).
- **Parâmetros do cliente:** renovação 30 s antes do vencimento, com **piso de 5 s** no atraso até a próxima renovação; quando o servidor devolve tokens que o relógio do dispositivo já considera dentro da janela (relógio adiantado, vida útil menor que 30 s), o intervalo **dobra** a cada renovação seguida e, na quinta, o cliente **desiste** de renovar em segundo plano (as chamadas e o 401 ainda renovam; um token normal zera a conta) — um relógio adiantado por mais que a vida útil do token continua inutilizando a sessão, o que o cliente não tem como corrigir sem o horário do servidor; um token com menos de 5 s restantes é renovado antes de a chamada sair; `/auth/me` e `/auth/logout` nunca disparam renovação (evita esperar por si mesmos); o `POST /auth/refresh`, o `GET /auth/me` e o logout (`logout`, `logout-all`) têm **tempo limite de 20 s** (inclusive o logout em segundo plano depois de um 401 persistente; um 401 **do servidor** no logout conta como sessão já encerrada, sem aviso; uma chamada **recusada localmente** — conta por conferir ou trocada — não chegou ao servidor e conta como falha ao avisá-lo, com aviso; rede, tempo esgotado, 403 e 5xx limpam o estado local e avisam), implementado com `AbortController` próprio (não depende de `AbortSignal.timeout`); os caminhos públicos são comparados por igualdade com o caminho base da API.
- **Fim de sessão durante um refresh em voo:** logout (desde o início da chamada) ou expiração durante um refresh descarta a resposta dele, para uma resposta tardia não reabrir a sessão encerrada nem marcá-la como expirada depois de um logout. Um refresh de uma sessão que já terminou não é compartilhado com quem pede depois de um novo login.
- **Restauração com a API fora do ar:** a tela é liberada (login) e um aviso informa que não foi possível falar com o servidor; um `401` (sem cookie) não avisa nada.
- **Nenhuma chamada autenticada sai nem é repetida com o token de outra conta** (enquanto a aba conhece a conta que exibe): o token de uma renovação nasce *por conferir* e a conferência (`GET /auth/me`) é compartilhada por quem precisar dela; uma chamada feita nesse intervalo — ou com a conta ainda por conferir porque a leitura falhou — espera a conferência e, se a conta mudou ou segue desconhecida, não sai (o chamador recebe o mesmo 401 que o servidor daria); e um 401 só leva à repetição da chamada se a sessão e a conta continuam as mesmas sob as quais ela saiu (uma chamada de uma conta anterior, ou de uma sessão que já terminou — inclusive o logout em andamento —, não renova nem repete nada). **Exceções:** `GET /auth/me` (é a própria conferência) e `POST /auth/logout`, que sai com o token e com o cookie mesmo com a conta por conferir — o servidor identifica a sessão pelo cookie, compartilhado pelo navegador, então um "Sair" numa aba defasada encerra a sessão da conta que estiver ativa no navegador (coerente com "um navegador, uma sessão", ADR-0006 item 10). Um 401 tardio de um token já trocado, com a conta ainda sendo conferida, espera a conferência (mesma conta: a chamada é repetida; outra conta: não). Sem conta exibida ainda (primeira carga, restauração, login) não há com o que comparar: a identidade é lida sob demanda, com até 5 tentativas espaçadas de 15 s (a próxima renovação lê de novo). Se a conferência falha, a conta fica por conferir (`unverified`) e é refeita a cada 15 s, sem novo refresh. Se `/auth/me` falha de forma persistente depois de uma renovação, a aba recusa as chamadas autenticadas (a conferência é refeita a cada 15 s, sem novo refresh) até dar certo ou o token vencer.
- **`logout-all`:** o cliente ganha `logoutAllSessions()` (`POST /auth/logout-all`, com `credentials: 'include'` porque a API apaga o cookie), com o mesmo tratamento local do logout; a tela que o usa é do `keytography-012`.
- **Troca de conta:** quando o refresh devolve outra conta, a chamada original **não** é repetida (devolveria dados da conta nova à tela da anterior); o aviso é mostrado pelo `RequireAuth`, que cobre qualquer tela protegida (numa rota pública com sessão ativa, como `/verify-email`, ele aparece ao entrar numa rota protegida).
- **Após 401 persistente:** além de encerrar a sessão como expirada, o cliente avisa a API (`logout`, em segundo plano) para o cookie não restaurar uma sessão sem DEK no próximo F5.
- **Verificação manual do "toque no cofre":** ainda não existe tela de cofre (`keytography-009`), então o critério de reinício da API só é coberto por teste automatizado; o restante foi verificado manualmente no navegador, **repetido em 2026-10-08 sobre o código já endurecido** (API local com banco descartável e `Sessions__AccessTokenMinutes=1`, web em `localhost:5173`): login sem nada em `localStorage`/`sessionStorage`; F5 restaura a sessão (`POST /auth/refresh` no carregamento); renovação silenciosa a cada 30 s, cada uma seguida de `GET /auth/me`, sem sair da tela; "Sair" responde `POST /auth/logout` 204 e leva ao login; F5 depois do logout recebe 401 no refresh e fica no login. O access token anterior recebe 401 depois do logout (conferido com curl, roteiro em `docs/guides/running-locally.md`: 200, 204, 401). **Repetido em 2026-10-15 sobre o código após a 5ª auditoria** (mesmo roteiro, `AccessTokenMinutes=1`): login sem nada em storage, F5 restaura (`refresh` 200 + `/auth/me`), renovação aos 30 s, "Sair" 204 sem aviso e F5 depois do logout com 401 no refresh e no login. A troca de conta entre abas e o reinício da API são cobertos por teste automatizado.
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

## Invariants And Failure Modes

Invariantes (consolidadas das rodadas de `project-audit`; as decisões de sessão estão no ADR-0006, item 13):

- **O access token só vive em memória**; nada de credencial em `localStorage`/`sessionStorage`.
- **Fim de sessão (logout/expiração) nunca é desfeito por uma resposta tardia:** um refresh em voo é descartado (época da sessão).
- **Nenhuma chamada autenticada sai nem é repetida com o token de outra conta**, enquanto a aba conhece a conta exibida: o token renovado nasce *por conferir*; chamadas esperam a conferência; a repetição depois de 401 exige a mesma sessão (época) e a mesma conta (versão). Exceções: `GET /auth/me` e `POST /auth/logout` (por cookie).
- **Cada chamada de sessão tem tempo limite** (refresh, `/auth/me`, logout, logout-all e o logout em segundo plano do 401 persistente: 20 s); nada espera para sempre.
- **Um logout recusado localmente não é dado como feito:** `logout-all` (ou `logout`) que não saiu porque a conta está por conferir ou trocada limpa o estado local e **avisa** que o servidor não foi alcançado; só um 401 real do servidor conta como sessão já encerrada.
- **Renovação em segundo plano não entra em laço** (piso, dobra do intervalo, desistência) e a sessão só termina por logout, 401 do refresh, 401 que persiste depois de uma repetição (cofre sem DEK) ou vencimento sem renovação.
- **Cache de consultas:** esvaziado no fim da sessão, redefinido na troca de conta, intocado na renovação da mesma conta.

Modos de falha cobertos: refresh lento/mudo, `/auth/me` falhando, API fora do ar na restauração, logout com API fora, 401 persistente (cofre sem DEK), logout durante refresh, troca de conta com chamadas em voo, StrictMode, computador voltando de suspensão.

## Known Limitations

- Um relógio do dispositivo adiantado por mais que a vida útil do token inutiliza a sessão (o cliente não tem o horário do servidor).
- `POST /auth/logout` sai com o cookie mesmo com a conta por conferir: um "Sair" numa aba defasada encerra a sessão da conta ativa no navegador ("um navegador, uma sessão").
- Logout não é sincronizado entre abas em tempo real (`BroadcastChannel`, fora do escopo).
- Se `/auth/me` falha de forma persistente depois de uma renovação, a aba recusa chamadas autenticadas até a conferência dar certo ou o token vencer.
- Sem conta exibida ainda (primeira carga, restauração, login), uma troca de conta em outra aba não é detectada e o cache não é redefinido: não há conta anterior para comparar. A leitura de identidade tenta até 5 vezes (15 s entre elas) e a próxima renovação lê de novo.

As limitações acima foram aceitas pelo usuário em 2026-10-15 (decisão sobre M1/M4 da 5ª auditoria) e as duas do cliente de sessão estão registradas também no ADR-0006 (Consequences).- O critério "reinício da API leva ao login ao tocar no cofre" só tem teste automatizado (não há tela de cofre até o `009`).

## Verification Matrix

| Invariante ou critério | Teste | Prova de que o teste falha sem o comportamento |
| --- | --- | --- |
| Token fora de storage | `auth-flows.test.tsx` | mutação conferida (token em storage) |
| Resposta tardia não reabre a sessão | `session.test.ts` (refresh em voo × logout/expiração) | mutação: sem checagem de época |
| Chamada não sai com o token de outra conta | `client.test.ts` (janelas concorrentes, `unverified`) | mutações: sem `unverified` no `signIn`, sem recusa no `onRequest` |
| 401 tardio não repete na conta/sessão errada | `client.test.ts` (carimbos de época e versão) | mutações: sem `accountVersion`/`epoch` |
| Tempo limite nas chamadas de sessão | `session.test.ts` (refresh, `/auth/me`, logout) | mutação: sem `withTimeout` |
| Sem laço de renovação | `SessionController.test.tsx` | mutações: sem piso, sem dobra, sem desistência |
| Cache redefinido na troca de conta | `SessionController.test.tsx` (tela montada) | mutação: `clear()` no lugar de `resetQueries()` |
| Logout recusado localmente não é "servidor avisado" | `session.test.ts` (`logout-all` com conta por conferir/trocada) | mutação: sem a marca de recusa local |
| Logout em segundo plano com cookie e tempo limite | `session.test.ts` (401 persistente) | mutações: sem `signal`, sem `credentials` |
| Parâmetros aprovados (30 s, 5 s, 5, 15 s, 20 s, 5 leituras) | `session.test.ts`, `use-current-user.test.tsx` (valores fixos) | mutações: cada constante alterada |

**Mutantes equivalentes ou inofensivos conhecidos** (sobrevivem sem indicar lacuna): `cancelQueries()` antes de `clear()` (o `clear` já cancela e destrói as consultas em voo); `failures.current = 0` no ramo "carregou" de `useCurrentUser` (o efeito já zera); `unverified` na checagem final do `onResponse` (defesa em profundidade); `clearTimeout` do tempo limite do refresh e dos timers de `RequireAuth` e `useCurrentUser` (não observável); limite de 24,8 dias do `setTimeout` (inalcançável com token de no máximo 1 dia); ausência do estado de carregamento no `RequireAuth` (coberto pelo `GuestOnly`).

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

Entregue via [PR #30](https://github.com/0tter-Dev/Keytography/pull/30), mergeada em `main` (merge commit `8fc1a5b`, sem squash) em 2026-10-19. Commits da branch: `528910f` (cliente web nas sessões gerenciadas: access token só em memória, restauração por refresh, renovação silenciosa single-flight, repetição única da chamada, logout real, troca de conta entre abas), `17d31ac` (1ª auditoria: época da sessão que descarta refresh tardio, `RequireAuth` espera o refresh em voo, piso e tempo limite do refresh, identidade presa ao token), `06a0de9` (2ª: conta por conferir, `logout-all`, desistência das renovações), `6257412` (3ª: o token renovado nasce por conferir, época e versão da conta nas chamadas, tempo limite do `/auth/me`), `e156af2` (4ª: tempo limite do logout, 401 tardio espera a conferência, testes dos mutantes), `e3c06f2`, `49cff3b` e `c09c9e6` (seções `Invariants And Failure Modes`, `Known Limitations` e `Verification Matrix` e citação no `Approval`, exigidas pelo Design Gate do [PR #31](https://github.com/0tter-Dev/Keytography/pull/31)), `1ea1674` (5ª: logout recusado localmente não é "servidor avisado", tempo limite e cookie no logout em segundo plano, parâmetros aprovados fixados em testes) e `6f88240` (registro da aprovação do texto do Design Gate). Sem mudança de API, banco ou contrato OpenAPI; ADR-0005 marcado como substituído e política do cliente web registrada no [ADR-0006](../../decisions/ADR-0006-backend-managed-sessions.md) (item 13).

Auditado cinco vezes via `project-audit` como gate pré-merge, sempre em subagente de contexto limpo, sem achado crítico. Principais achados corrigidos no mesmo PR, com aprovação do usuário a cada rodada: logout durante um refresh em voo ressuscitava a sessão; a rede de segurança do `RequireAuth` derrubava a sessão durante a renovação; renovação em laço com relógio adiantado; janelas em que uma chamada saía ou era repetida com o token de outra conta (conferência `/auth/me` ainda em voo, 401 tardio de chamada da conta anterior); `logout`/`logout-all`/`/auth/me` sem tempo limite; logout recusado localmente contado como feito; mutantes sobreviventes e documentação com afirmações absolutas além do que o código garante. A avaliação do histórico dessas rodadas (e das de 003, 007, 008 e 016) gerou o [PR #31](https://github.com/0tter-Dev/Keytography/pull/31) (seções de invariantes nos planos, Design Gate, protocolo de rodadas, regras de governança `invariantes` e `adr-indice`) e a atualização genérica das skills do fluxo, fora do repositório.

Validação final: `npm run lint`, `format:check` e `build` sem avisos; 209/209 testes do `web/` em 3 execuções e 1 embaralhada; `dotnet test` 174/174 (inclui a governança documental com as regras novas); CI (`build` e `web`) verde; `docs/reference/openapi.json` e `schema.d.ts` sem diferença (nenhum endpoint alterado). Mutação manual de cada comportamento novo e de cada parâmetro aprovado (30 s, 5 s, 5 renovações, 15 s, 20 s, 5 leituras): todas mortas pelos testes, exceto os equivalentes ou inofensivos listados na `Verification Matrix`. Verificação manual contra a API real no navegador (banco descartável, `Sessions__AccessTokenMinutes=1`), executada em 2026-10-06 e repetida em 2026-10-08 e 2026-10-15 (esta depois da última mudança de código): login sem nada em `localStorage`/`sessionStorage`/`document.cookie`; F5 restaura a sessão (`POST /auth/refresh` seguido de `GET /auth/me`); renovação silenciosa a cada ~30 s sem sair da tela; "Sair" responde 204 sem aviso e leva ao login; F5 depois do logout recebe 401 no refresh e fica no login; o access token anterior recebe 401 depois do logout (curl: 200, 204, 401); troca de conta entre abas (aba 1 como `u17`, login como `u17b` na aba 2) mostrou o aviso e passou a exibir a conta nova (verificação de 2026-10-06; depois coberta por teste automatizado). O critério "reinício da API leva ao login ao tocar no cofre" só tem teste automatizado, pois ainda não há tela de cofre (`keytography-009`).

Limitações conhecidas, aceitas e registradas (plano, capability e ADR-0006): (1) um relógio do dispositivo adiantado por mais que a vida útil do token inutiliza a sessão (o cliente não tem o horário do servidor) e a renovação em segundo plano desiste depois de 5 renovações seguidas; (2) `POST /auth/logout` sai com o cookie mesmo com a conta por conferir, então um "Sair" numa aba defasada encerra a sessão da conta ativa no navegador; (3) o logout não é sincronizado entre abas em tempo real; (4) se `/auth/me` falha de forma persistente depois de uma renovação, a aba recusa chamadas autenticadas até a conferência dar certo ou o token vencer; (5) sem conta exibida ainda, uma troca de conta em outra aba não é detectada; (6) a leitura de identidade tenta até 5 vezes. O texto de `Invariants And Failure Modes` foi revisado e aprovado pelo usuário em 2026-10-19.

`actual_version_impact: minor` — coerente com `expected_version_impact`, sem divergência a justificar: capacidade nova do cliente web (sessão renovável e logout real) sem alteração de API, banco ou contrato.
