---
id: keytography-009
status: review
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 9
depends_on: [keytography-008, keytography-017]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
  - docs/capabilities/vault-entries/README.md
decision_records:
  - docs/decisions/ADR-0001-vault-encryption-and-recovery.md
  - docs/decisions/ADR-0002-dek-session-cache.md
  - docs/decisions/ADR-0006-backend-managed-sessions.md
  - docs/decisions/ADR-0007-web-client-secret-handling.md
validation: []
documentation_updates: []
---

# UI de cofre (CRUD núcleo)

## Objective

Implementar a experiência central do produto: listar, criar, editar, excluir (lixeira/restauração/exclusão definitiva) e consultar o histórico de entradas de cofre, tratando a senha como o segredo que ela é.

## Context

`keytography-008` entrega a UI de autenticação e `keytography-017` a sessão gerenciada pelo backend (access token só em memória, nenhuma chamada autenticada com o token de outra conta, aviso de troca de conta). Este plano consome os endpoints de `vault-entries` já existentes (`GET/POST /vault/entries`, `GET/PUT/DELETE /vault/entries/{id}`, `GET /vault/entries/{id}/history`, `GET /vault/entries/trash`, `POST /vault/entries/{id}/restore`, `DELETE /vault/entries/{id}/permanent`), que não mudam.

Fatos da API que moldam a interface (verificados no código e no contrato):

- **Só a senha é cifrada** (ADR-0001); título, login e campos adicionais ficam em texto no banco. A senha volta decifrada em criar, editar, detalhe e histórico.
- **`PUT` substitui a entrada inteira:** campos adicionais ausentes apagam os existentes, e a senha vai sempre junto. A API aceita senha vazia e só valida o título.
- **Sem cofre em cache (reinício da API) a resposta é 401** com a sessão ainda válida; o cliente do `017` encerra a sessão como expirada.
- A API aceita `GET`, `PUT` e histórico de entradas **na lixeira** e exclusão definitiva de entradas **fora da lixeira**; a lixeira não devolve a data de exclusão; as listas não têm paginação nem filtro.

O tratamento de segredos no cliente web (cache, revelar, clipboard, formulários) atravessa os planos 009 a 013 e vira o ADR-0007 (`docs/decisions/ADR-0007-web-client-secret-handling.md`), criado nesta entrega.

## Scope

- **Rotas** sob `RequireAuth`: `/vault` (lista), `/vault/new`, `/vault/:id` (detalhe), `/vault/:id/edit` e `/vault/trash`; o item "Cofre" da navegação passa a apontar para `/vault`.
- **Listagem** de entradas (título, login, data de atualização, na ordem da API) em uma única visualização padrão — a preferência de densidade configurável (Tabela/Lista/Cards/Blocos) fica para `keytography-012`. Estados de carregamento (skeleton), vazio e erro tratados explicitamente.
- **Criação e edição** (react-hook-form + zod; a edição usa uma **consulta própria**, nunca o dado em cache do detalhe): título obrigatório, login opcional, **senha obrigatória e não vazia** (a API aceita vazia; a interface não), campos adicionais livres com **nome obrigatório e único**. A **edição abre sempre com o detalhe buscado na hora** (nunca com dado da lista ou do cache) e envia todos os campos. Título, login e demais campos com `autocomplete="off"` e a senha com `autocomplete="new-password"` (o navegador ignora `off` em senha), para não oferecer salvar nem preencher credenciais de cofre como se fossem do Keytography. Erros de validação do servidor (título) aparecem no campo.
- **Detalhe** com a senha oculta por padrão e revelação sob ação do usuário; a senha revelada **volta a ocultar sozinha** em 30 segundos, quando a aba fica oculta e ao sair da tela.
- **Copiar login e senha** para a área de transferência com a política do ADR-0007: limpeza em cerca de 20 segundos se a página tem foco, lendo antes (por no máximo 2 segundos) e só limpando se o conteúdo ainda for o copiado (se a leitura for negada, indisponível ou ficar pendente, limpa assim mesmo); sem foco, a limpeza fica pendente e roda uma vez quando a aba volta a ter foco; um novo copiar substitui a pendente; logout e expiração limpam a pendente. Clipboard indisponível (contexto não seguro, permissão negada) mostra mensagem clara, nunca falha em silêncio.
- **Mover para a lixeira** (a partir do detalhe) **exige confirmação direta** em diálogo (sem palavra digitada: a ação é reversível). **Lixeira** (`/vault/trash`): listar entradas excluídas, **restaurar** e **excluir definitivamente**. A exclusão definitiva só é oferecida **a partir da lixeira**, com confirmação "digite para confirmar" (ação irreversível, único caso que foge do soft-delete padrão). A lixeira não abre detalhe nem edição de entradas excluídas.
- **Histórico de senha** de uma entrada ativa, com as senhas anteriores ocultas por padrão e reveladas uma a uma (mesmas regras de revelação).
- **Camada de dados** em `features/vault/` (TanStack Query): consultas que trazem senha (detalhe, histórico) com `gcTime: 0`; mutações invalidam as listas e **nunca** gravam senha no cache (nada de `setQueryData` com dado sensível); restaurar e excluir definitivamente tratam `404` (já alterado em outra aba) como sucesso idempotente seguido de recarga.
- Novo primitivo `ui/dialog` (Radix, já nas dependências) para as confirmações; textos em `pt-BR` via i18n.
- **ADR-0007** (`web-client-secret-handling`) com a política de segredos no cliente web, criado e referenciado nesta entrega; convenções correspondentes em `docs/guides/web-frontend-conventions.md`.

## Out Of Scope

- Preferência de densidade de exibição configurável (Tabela/Lista/Cards/Blocos) — `keytography-012`.
- Indicador de força de senha nos formulários — `keytography-010`.
- Geração de senha integrada ao formulário — `keytography-011`.
- Busca, filtro e paginação da lista (a API não os oferece) — a busca rápida fica para a command palette do `keytography-014`.
- Qualquer mudança de API, de contrato ou de criptografia; cifrar título, login e campos adicionais (decisão do usuário: só a senha é o dado sensível, e a interface não avisa sobre isso).
- Tags, favoritos, grupos/subgrupos — não existem no schema do backend; registrados como evolução futura em `docs/capabilities/vault-entries/README.md`.

## Approval

Ativado e aprovado pelo usuário em 2026-10-21, ao pedir explicitamente a ativação e a implementação deste plano (o próximo da fila do `ROADMAP.md`), depois da revisão do Design Gate registrada no PR #33. **A seção `Invariants And Failure Modes` (com `Known Limitations` e `Verification Matrix`) foi revisada e aprovada pelo usuário em 2026-10-21 antes da ativação**, com as decisões: sem aviso nem cifragem dos demais campos (só a senha é o dado sensível), política de clipboard como descrita, revelar com auto-ocultar, plano mantido inteiro (sem divisão), ADR-0007 criado nesta entrega e `vault-entries` autorizada em `authorized_capabilities`. Este plano não altera API, banco nem contrato (só consome os endpoints de cofre existentes) e não muda criptografia nem controle de acesso por role; toca o tratamento de segredos no cliente web, registrado no ADR-0007.

## Implementation Clarifications

Ajustes de meio, derivados das invariantes aprovadas em 2026-10-21. Cada item traz a forma da aprovação; os de 2026-10-22 foram decididos pelo usuário no chat em resposta ao relatório da 1ª `project-audit`.

- **`autocomplete` da senha** (aprovado em 2026-10-22: "`new-password` na senha, ajustando para evitar a contradição"): o campo de senha dos formulários usa `new-password` (os navegadores ignoram `off` em campos de senha); os demais campos, e a senha mostrada no detalhe e no histórico, usam `off`. O texto do `Scope`, dos critérios de aceite e das invariantes foi ajustado para dizer isso (antes dizia "desligado" para login e senha). Registrado no ADR-0007.
- **Resultado das mutações** (aprovado em 2026-10-22): além de `gcTime: 0`, a camada de acesso devolve de criar e editar **só o `id`**; a resposta do servidor traz a senha e o cache de mutações a reteria.
- **Palavra `EXCLUIR` sem diferenciar maiúsculas e ignorando espaços nas pontas** (aprovado em 2026-10-22).
- **Histórico só quando a pessoa o abre** (aprovado em 2026-10-22).
- **Mover para a lixeira exige confirmação direta** (decidido em 2026-10-22: o usuário preferiu exigir a confirmação, em vez de mover direto como o rascunho desta clarificação propunha): diálogo com "Mover para a lixeira" e "Cancelar", sem palavra digitada. Mover algo que já não existe (`404`) conta como feito.
- **Link direto para uma entrada da lixeira** (aprovado em 2026-10-22, por estar no escopo atual): a API devolve o detalhe de entradas excluídas e o detalhe não informa que ela está na lixeira, então `/vault/:id` abre o detalhe; a interface só não **oferece** esse caminho. Registrado em `Known Limitations`.
- **Edição com consulta própria** (decorrência da invariante "edição segura", corrigida na 1ª auditoria): a edição e o detalhe tinham a mesma chave de consulta e o formulário nascia com o dado em cache; agora a edição tem chave própria, é buscada na hora e não refaz a busca em segundo plano, e mudar uma entrada descarta as consultas de detalhe, edição e histórico em cache.
- **Um refetch que falha não apaga a tela** (decorrência da invariante "rede/5xx mantém os dados digitados"): erro de carregamento só aparece quando não há dado.
- **Chamada recusada sem explicação da sessão** (aprovado em 2026-10-22, "mantemos o aviso"): quando o cliente do `017` recusa ou não consegue completar a chamada sem encerrar a sessão nem trocar a conta (conta ainda por conferir, refresh sem resposta), a tela avisa "não foi possível confirmar a sua sessão agora e nada foi feito" (no formulário, ou em toast na lixeira e no detalhe); se a sessão terminou ou a conta trocou, valem os avisos do `017`.
- **Clipboard** (aprovado em 2026-10-22: "seguir a recomendação"): a leitura do clipboard tem tempo limite de 2 segundos (pendente conta como negada), uma cópia que ainda estava sendo escrita quando a sessão terminou é apagada assim que a escrita termina, e só a cópia mais recente agenda a limpeza; o aviso diz "cerca de 20 segundos". A limitação foi reescrita (ver `Known Limitations`).
- **Pequenos ajustes de acessibilidade e navegação:** título de nível 1 no detalhe e nos formulários; botões do histórico com o nome da troca (ex.: "Mostrar senha (trocada em ...)"); sem `aria-pressed` redundante; campos de senha sem corretor ortográfico (`spellCheck={false}`); o item "Cofre" da navegação fica ativo nas sub-rotas.
- **Verificação manual (2026-10-21)**, contra a API real (banco descartável) no navegador, pelo roteiro de `docs/guides/running-locally.md`: lista vazia, criar com campo adicional, detalhe com a senha oculta, revelar e voltar a ocultar sozinha em 30 s (medido: visível aos 15 s, oculta aos 32 s), recarregar a página (F5) na edição restaura a sessão e abre o formulário com os dados do servidor, editar a senha e ver a anterior no histórico (oculta), mover para a lixeira, restaurar, excluir definitivamente com a palavra digitada, nada em `localStorage`/`sessionStorage` e URL só com o id, reinício da API (cofre sem DEK): ao salvar, a interface leva ao login com "Sua sessão expirou", sem a senha na tela, e avisa a API (logout 204). **Não verificado manualmente:** o caminho de sucesso do clipboard e sua limpeza (o painel do navegador usado nega a permissão de escrita, e a interface mostrou corretamente a mensagem de indisponibilidade), nem o comportamento em Firefox e Safari; esse comportamento e a troca de conta entre abas são cobertos por teste automatizado (clipboard simulado; o mecanismo de troca de conta foi verificado manualmente no `017`). A verificação manual não foi repetida depois das correções da 1ª auditoria (confirmação ao mover para a lixeira, edição com consulta própria): estão cobertas por teste automatizado.

## Acceptance Criteria

- Criar uma entrada de cofre e vê-la aparecer na listagem imediatamente, sem recarregar a página; criar com senha vazia ou com nomes de campo adicional vazios ou duplicados é recusado no formulário.
- Editar uma entrada abre com o detalhe que o servidor tem **naquele momento** (inclusive se mudou depois de o detalhe ter sido aberto) e persiste a mudança, que se reflete na listagem e no detalhe sem mostrar, nem por um instante, o dado de antes de salvar; uma edição não apaga os campos adicionais que o formulário exibia; um refetch que falha com o formulário aberto não o apaga.
- Mover uma entrada para a lixeira pede uma confirmação direta (cancelar não move nada) e, confirmada, a remove da listagem padrão e a faz aparecer na lixeira; restaurar a devolve à listagem; restaurar, mover ou excluir definitivamente uma entrada que já foi alterada em outra aba (resposta `404`) termina sem erro, com a lista atualizada.
- Excluir definitivamente só é oferecido na lixeira, exige digitar a palavra de confirmação antes de prosseguir e remove a entrada de vez (não aparece mais nem na lixeira); a lixeira não abre detalhe nem edição.
- Consultar o histórico de uma entrada que já teve a senha trocada mostra a senha anterior (oculta até ser revelada) e o timestamp da troca.
- A senha revelada volta a ficar oculta em 30 segundos, quando a aba fica oculta e ao sair da tela.
- Copiar a senha coloca o valor no clipboard; com o foco na página, o clipboard é limpo em cerca de 20 segundos **somente se ainda tiver o conteúdo copiado** (e limpo mesmo assim se a leitura for negada, indisponível ou pendente por mais de 2 segundos); sem foco, a limpeza roda quando o foco volta; um novo copiar substitui a limpeza pendente; logout ou expiração limpam a pendente (e uma cópia ainda em escrita); sem clipboard disponível aparece a mensagem de indisponibilidade (verificável com relógio falso e clipboard simulado nos testes).
- Nenhuma senha em `localStorage`, `sessionStorage`, URL, título da página, `console.*` ou cache de consultas depois de sair da tela (verificado em teste).
- Um duplo clique em criar, mover para a lixeira, restaurar ou excluir definitivamente envia uma única requisição.
- Com a sessão ativa mas sem poder confirmá-la (conta por conferir, refresh sem resposta), salvar, mover ou restaurar avisa que nada foi feito e mantém os dados na tela.
- Com a sessão encerrada, a conta trocada em outra aba ou o cofre sem DEK (`401` persistente), nenhuma senha permanece na tela, o formulário em edição se perde sem ser reenviado e o aviso correspondente aparece (sessão expirada ou conta trocada), sem mostrar sucesso.
- Abrir o detalhe de um id inexistente, inválido ou de outro usuário mostra uma tela "não encontrada" que não distingue o motivo.
- Uma listagem vazia mostra um estado vazio explícito (não uma tela em branco); uma listagem carregando mostra skeleton e uma falha mostra erro com nova tentativa.
- Título, login e campos adicionais têm `autocomplete="off"` e a senha dos formulários `autocomplete="new-password"`; nenhum valor da entrada é renderizado como HTML nem vira link automático (verificado em teste).
- `npm run lint`, `format:check`, `build` e `npm test` passam, e o CI (`web` e `build`) permanece verde.

## Validation

- Testes de componente e de fluxo (Vitest + React Testing Library) cobrindo formulários, estados vazio/carregando/erro, o fluxo de confirmação de exclusão definitiva, a revelação com auto-ocultar, a política de clipboard (relógio falso e clipboard simulado) e as falhas de sessão e conta.
- Cada invariante da `Verification Matrix` provada por mutação ou caso negativo (o teste observado falhando sem o comportamento).
- Verificação manual do CRUD completo contra a API local, incluindo lixeira, histórico, reinício da API (cofre sem DEK) e troca de conta entre abas, com roteiro repetível em `docs/guides/running-locally.md`; o resultado entra no `Outcome`.
- `project-audit` antes do merge, em subagente, seguindo o protocolo de rodadas de `docs/plans/README.md`.
- CI permanece verde.

## Invariants And Failure Modes

Invariantes (devem valer sempre):

- **Segredos só na memória da aba:** a senha (detalhe, histórico, formulário, resposta de mutação) nunca vai para `localStorage`/`sessionStorage`/URL/título da página/`console.*`, e só está no DOM dentro do campo de senha ou do elemento de revelação.
- **Cache sem senha:** consultas que trazem senha usam `gcTime: 0`, e mutações não gravam senha no cache; depois de sair da tela não resta senha no cache de consultas.
- **Fim de sessão, troca de conta e saída da tela limpam tudo:** valores revelados voltam a ocultos, formulários e rascunhos são descartados, diálogos fecham e o clipboard pendente é limpo no logout ou na expiração (o cache de consultas já é esvaziado/redefinido pelo `keytography-017`).
- **Revelar é temporário:** auto-ocultar em 30 s, ao ocultar a aba e ao sair da tela.
- **Clipboard (ADR-0007):** limpa em cerca de 20 s se a página tem foco, lendo antes (no máximo 2 s) e só limpando se o conteúdo ainda for o copiado (leitura negada, indisponível ou pendente → limpa assim mesmo); sem foco, a limpeza fica pendente e roda uma vez quando o foco volta; novo copiar substitui a pendente; logout e expiração limpam a pendente e uma cópia ainda em escrita.
- **Mutações não duplicam:** criar, restaurar e excluir não são reenviados por duplo clique; a repetição automática do cliente só ocorre depois de um 401 (chamada não processada); uma chamada recusada pelo cliente (conta trocada) nunca é exibida como sucesso.
- **Edição segura:** abre sempre com o detalhe buscado agora, por consulta própria (nunca o dado em cache do detalhe); o `PUT` envia todos os campos (os omitidos seriam apagados); a senha nunca é vazia; um refetch que falha não apaga o formulário.
- **Exclusão definitiva só da lixeira e só com confirmação digitada;** a lixeira não abre detalhe nem edição.
- **Renderização segura:** valores como texto (sem `dangerouslySetInnerHTML`, sem link automático); `autocomplete="off"` nos campos e `new-password` na senha dos formulários; senha sem corretor ortográfico.
- **Nada é dado como feito sem ser:** uma chamada que o cliente recusou ou não completou sem encerrar a sessão nem trocar a conta avisa que nada foi feito; mover para a lixeira só acontece depois da confirmação.
- **Falhas nunca viram tela em branco:** carregando, vazio e erro são estados distintos.

Modos de falha a tratar explicitamente:

- **`401` persistente depois do refresh** (cofre sem DEK após reinício da API): a sessão termina como expirada e o formulário em edição se perde, sem guardar rascunho com segredos.
- **Chamada recusada por troca de conta** (`017`): o formulário não exibe sucesso nem reenvia; mostra o aviso de conta trocada.
- **Rede/5xx ao criar ou editar:** o usuário vê o erro e o formulário mantém os dados digitados (só em memória) para tentar de novo.
- **Edição simultânea em duas abas:** vale a última gravação; uma entrada editada depois de ir para a lixeira em outra aba é gravada e continua na lixeira.
- **Restaurar ou excluir definitivamente algo que outra aba já alterou (`404`):** sucesso idempotente, com a lista recarregada.
- **Id inválido (`404`) ou de outro usuário (`403`):** tela "não encontrada" sem distinguir o motivo.
- **Validação do servidor (título):** o erro por campo aparece no campo.
- **Clipboard indisponível** (contexto não seguro, permissão negada) ou escrita recusada por falta de foco: mensagem clara ou limpeza pendente; nunca falha em silêncio. **Leitura que não responde** (prompt de permissão): conta como negada depois de 2 s.
- **Refetch em segundo plano que falha** com o detalhe ou o formulário na tela: a tela continua como está.
- **Lista grande ou lenta:** carregada inteira (sem paginação), com skeleton; falha mostra erro com nova tentativa.

## Known Limitations

Aceitas pelo usuário em 2026-10-21 (revisão do plano antes da ativação) e em 2026-10-22 (resposta à 1ª `project-audit`):

- **Só a senha é cifrada** (ADR-0001): título, login e campos adicionais ficam em texto no banco, e a interface não avisa sobre isso (decisão do usuário: a senha é o dado sensível).
- **Sem controle de concorrência:** a última gravação vence (o backend não versiona entradas).
- **Exclusão definitiva por uma lista velha:** a API não exige que a entrada esteja na lixeira, então uma lista da lixeira desatualizada em outra aba pode excluir de vez uma entrada que já foi restaurada.
- **Clipboard é melhor esforço** (decisão de 2026-10-22):
  - com a leitura negada, indisponível ou pendente por mais de 2 s a limpeza não confere o conteúdo e pode sobrescrever uma cópia feita pelo usuário;
  - sem foco, a limpeza só roda quando a janela volta a ter foco, **sem limite de tempo**: se a leitura também for negada, pode apagar uma cópia feita horas depois em outro aplicativo;
  - Firefox e Safari tendem a recusar a escrita sem gesto do usuário, então a promessa de "cerca de 20 s" só vale de fato em navegadores baseados em Chromium (não verificado em navegador real);
  - fechar a aba antes da limpeza deixa o conteúdo no clipboard, e outros aplicativos podem lê-lo nesse intervalo.
- **Sem busca, filtro nem paginação:** a lista vem inteira, na ordem de atualização da API; a lixeira não mostra a data de exclusão (a API não a devolve); não há limite de tamanho dos campos (nem no cliente nem na API).
- **Rascunho de formulário não sobrevive** ao fim da sessão (deliberado: não persistir segredos).
- A senha revelada fica visível por até 30 s, e o valor da senha está no atributo `value` do campo mesmo oculta (visível em "copiar como HTML" e a extensões do navegador).
- Um link direto para uma entrada da lixeira abre o detalhe (a API o devolve e não informa que a entrada está excluída); a interface só não oferece esse caminho.

## Verification Matrix

Testes em `web/src/features/vault/` (`vault-flows.test.tsx`, `vault-secrets.test.tsx`, `vault-resilience.test.tsx`) e `web/src/lib/secret-clipboard.test.ts`; cada linha foi provada observando o teste falhar com a mutação indicada.

| Invariante ou critério | Teste | Prova de que o teste falha sem o comportamento |
| --- | --- | --- |
| Nada de senha em storage, URL, título ou `console.*` | `vault-secrets`: criar, ver, revelar, copiar, histórico e editar sem vazar | mutações: gravar a senha em `sessionStorage`; `console.log` dos valores |
| Cache sem senha (detalhe e histórico `gcTime: 0`; mutações devolvem só o `id`, `gcTime: 0`) | `vault-secrets`: sai do cache ao deixar a tela; resultado das mutações; cache de mutações | mutações: sem `gcTime: 0` (detalhe, histórico, mutações); a mutação devolver a resposta inteira |
| Fim de sessão, expiração e troca de conta limpam a tela | `vault-secrets`: senha some com `401` persistente, sessão rejeitada, troca de conta; chamada recusada pelo cliente | mutações do `017` e remoção do reset de consultas |
| Revelar é temporário (30 s, aba oculta, sair da tela, trocar de entrada) | `vault-secrets` (relógio falso, `visibilitychange` para oculto e para visível, navegação); `vault-resilience` (trocar de entrada) | mutações: 60 s; sem timer; sem o listener; ocultar em qualquer mudança; sem `key` por id |
| Clipboard: limpa só o que copiou; leitura negada ou pendente limpa; sem foco fica pendente e roda uma vez; copiar de novo substitui; cópia em escrita no logout é apagada; só a cópia mais nova agenda; logout e expiração limpam | `secret-clipboard.test.ts` e `vault-secrets` | mutações: limpar sempre; não ler antes; limpar sem foco; não cancelar a pendente; sem tempo limite de leitura (e 5 s); sem geração; sem sequência; `SessionController` sem a limpeza |
| Mutação não duplica | `vault-flows` e `vault-resilience`: duplo clique em criar, mover para a lixeira, restaurar e confirmar a exclusão; restaurar desabilita as outras linhas | mutações: remover as defesas de cada operação |
| Mover para a lixeira só depois de confirmar; `404` conta como feito | `vault-flows` | mutações: mover direto; `404` como erro |
| Edição abre com detalhe fresco (consulta própria) e envia todos os campos | `vault-resilience`: servidor mudou entre o detalhe e a edição; `vault-flows`: remover campos envia `null` | mutações: chave de edição igual à do detalhe; sem `refetchOnMount`; não enviar `additionalFields` |
| Depois de salvar, o detalhe não mostra o dado antigo | `vault-resilience` | mutação: chave de edição igual à do detalhe (as consultas têm chaves distintas e `gcTime: 0`) |
| Refetch que falha não apaga o formulário nem o detalhe | `vault-resilience` | mutação: erro com dado presente troca a tela |
| Chamada sem explicação da sessão avisa que nada foi feito | `vault-resilience`: formulário, restaurar, mover; sessão encerrada mostra o login e não o aviso | mutações: aviso nunca, sempre, sem toast em cada tela, sem texto no formulário |
| Senha vazia, título só com espaços e nomes de campo vazios, repetidos ou repetidos com espaços recusados | `vault-flows` e `vault-resilience` | mutações: remover cada validação ou o `trim` |
| Exclusão definitiva só na lixeira e só com a palavra digitada (sem diferenciar caixa, ignorando espaços nas pontas) | `vault-flows` e `vault-resilience`: diálogo, ausência do botão na lista e no detalhe; diálogo vazio ao reabrir | mutações: confirmação sempre válida; sem `trim`; sem caixa |
| `404` idempotente em restaurar e excluir definitivamente | `vault-flows` | mutação: tratar `404` como erro |
| Id inexistente, inválido ou de outro usuário → "não encontrada" | `vault-flows` (`404`, `403`, id que não é GUID) | mutação: distinguir o `403` |
| Valores como texto, `autocomplete` correto, sem corretor ortográfico | `vault-secrets` e `vault-resilience` | mutações: `dangerouslySetInnerHTML`; remover cada atributo |
| Histórico só quando pedido; botões do histórico com nomes distintos | `vault-flows` | mutações: buscar sempre; sem o contexto |
| Estados carregando, vazio e erro (lista, detalhe, edição, histórico, lixeira) | `vault-flows` e `vault-resilience` | mutações: remover cada esqueleto e o ramo de erro da lixeira |
| Mensagens de rede e de `400` sem título | `vault-resilience` | mutações: rede como erro desconhecido; `400` sem título calado |
| Navegação ativa nas sub-rotas e título de nível 1 | `vault-resilience` | mutações: `end` no item; `h2` no lugar do `h1` |

**Mutantes equivalentes ou inofensivos conhecidos** (sobrevivem sem indicar lacuna): cada operação de mutação tem mais de uma defesa contra duplo clique (botão desabilitado e guarda no handler, e na exclusão definitiva ainda o diálogo e a página): remover uma só não altera o resultado, remover todas é detectado. O descarte explícito de detalhe e histórico depois de uma mudança, o `refetchOnMount: 'always'` e o `end` do `NavLink` foram **removidos** depois de a mutação mostrar que eram redundantes (`gcTime: 0` com chaves distintas, `staleTime: 0` e o comportamento do `NavLink` para a raiz).

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar as telas de cofre implementadas e a política de segredos do cliente.
- `docs/capabilities/vault-entries/README.md`: registrar tags/favoritos/grupos-subgrupos como evolução futura (constatação deliberada de que não fazem parte do schema atual).
- `docs/decisions/ADR-0007-web-client-secret-handling.md` e `docs/decisions/README.md`: criar o ADR e o item do índice.
- `docs/guides/web-frontend-conventions.md`: convenções de segredos (cache, revelar, clipboard, formulários) e do primitivo `ui/dialog`.
- `docs/guides/running-locally.md`: roteiro repetível de verificação manual do cofre.
- `README.md` (raiz): Current Scope passa a listar o cofre (CRUD de contas e senhas) como entregue na interface web; Quick Start só muda se o primeiro uso passar a depender de algum passo novo.
- `docs/STATUS.md`: refletir o novo status.
- `docs/reference/` (contrato): constatação deliberada de que não muda — nenhum endpoint ou DTO é alterado.

## Outcome
