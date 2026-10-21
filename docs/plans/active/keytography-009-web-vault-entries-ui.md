---
id: keytography-009
status: active
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
- **Criação e edição** (react-hook-form + zod): título obrigatório, login opcional, **senha obrigatória e não vazia** (a API aceita vazia; a interface não), campos adicionais livres com **nome obrigatório e único**. A **edição abre sempre com o detalhe buscado na hora** (nunca com dado da lista ou do cache) e envia todos os campos. Campos de senha e login com `autocomplete` desligado, para o navegador não oferecer salvar nem preencher credenciais de cofre como se fossem do Keytography. Erros de validação do servidor (título) aparecem no campo.
- **Detalhe** com a senha oculta por padrão e revelação sob ação do usuário; a senha revelada **volta a ocultar sozinha** em 30 segundos, quando a aba fica oculta e ao sair da tela.
- **Copiar login e senha** para a área de transferência com a política do ADR-0007: limpeza em 20 segundos se a página tem foco, lendo antes e só limpando se o conteúdo ainda for o copiado (se a leitura for negada, limpa assim mesmo); sem foco, a limpeza fica pendente e roda uma vez quando a aba volta a ter foco; um novo copiar substitui a pendente; logout e expiração limpam a pendente. Clipboard indisponível (contexto não seguro, permissão negada) mostra mensagem clara, nunca falha em silêncio.
- **Lixeira** (`/vault/trash`): listar entradas excluídas, **restaurar** e **excluir definitivamente**. A exclusão definitiva só é oferecida **a partir da lixeira**, com confirmação "digite para confirmar" (ação irreversível, único caso que foge do soft-delete padrão). A lixeira não abre detalhe nem edição de entradas excluídas.
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

## Acceptance Criteria

- Criar uma entrada de cofre e vê-la aparecer na listagem imediatamente, sem recarregar a página; criar com senha vazia ou com nomes de campo adicional vazios ou duplicados é recusado no formulário.
- Editar uma entrada abre com o detalhe atual do servidor e persiste a mudança, que se reflete na listagem e no detalhe; uma edição não apaga os campos adicionais que o formulário exibia.
- Excluir uma entrada a remove da listagem padrão e a faz aparecer na lixeira; restaurar a devolve à listagem; restaurar ou excluir definitivamente uma entrada que já foi alterada em outra aba (resposta `404`) termina sem erro, com a lista atualizada.
- Excluir definitivamente só é oferecido na lixeira, exige digitar a palavra de confirmação antes de prosseguir e remove a entrada de vez (não aparece mais nem na lixeira); a lixeira não abre detalhe nem edição.
- Consultar o histórico de uma entrada que já teve a senha trocada mostra a senha anterior (oculta até ser revelada) e o timestamp da troca.
- A senha revelada volta a ficar oculta em 30 segundos, quando a aba fica oculta e ao sair da tela.
- Copiar a senha coloca o valor no clipboard; com o foco na página, o clipboard é limpo em 20 segundos **somente se ainda tiver o conteúdo copiado** (e limpo mesmo assim se a leitura for negada); sem foco, a limpeza roda quando o foco volta; um novo copiar substitui a limpeza pendente; logout ou expiração limpam a pendente; sem clipboard disponível aparece a mensagem de indisponibilidade (verificável com relógio falso e clipboard simulado nos testes).
- Nenhuma senha em `localStorage`, `sessionStorage`, URL, título da página, `console.*` ou cache de consultas depois de sair da tela (verificado em teste).
- Um duplo clique em criar, restaurar ou excluir envia uma única requisição.
- Com a sessão encerrada, a conta trocada em outra aba ou o cofre sem DEK (`401` persistente), nenhuma senha permanece na tela, o formulário em edição se perde sem ser reenviado e o aviso correspondente aparece (sessão expirada ou conta trocada), sem mostrar sucesso.
- Abrir o detalhe de um id inexistente, inválido ou de outro usuário mostra uma tela "não encontrada" que não distingue o motivo.
- Uma listagem vazia mostra um estado vazio explícito (não uma tela em branco); uma listagem carregando mostra skeleton e uma falha mostra erro com nova tentativa.
- Os campos de senha e login têm `autocomplete` desligado, e nenhum valor da entrada é renderizado como HTML nem vira link automático (verificado em teste).
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
- **Clipboard (ADR-0007):** limpa em 20 s se a página tem foco, lendo antes e só limpando se o conteúdo ainda for o copiado (leitura negada → limpa assim mesmo); sem foco, a limpeza fica pendente e roda uma vez quando o foco volta; novo copiar substitui a pendente.
- **Mutações não duplicam:** criar, restaurar e excluir não são reenviados por duplo clique; a repetição automática do cliente só ocorre depois de um 401 (chamada não processada); uma chamada recusada pelo cliente (conta trocada) nunca é exibida como sucesso.
- **Edição segura:** abre sempre com o detalhe fresco do servidor; o `PUT` envia todos os campos (os omitidos seriam apagados); a senha nunca é vazia.
- **Exclusão definitiva só da lixeira e só com confirmação digitada;** a lixeira não abre detalhe nem edição.
- **Renderização segura:** valores como texto (sem `dangerouslySetInnerHTML`, sem link automático) e `autocomplete` desligado em login e senha.
- **Falhas nunca viram tela em branco:** carregando, vazio e erro são estados distintos.

Modos de falha a tratar explicitamente:

- **`401` persistente depois do refresh** (cofre sem DEK após reinício da API): a sessão termina como expirada e o formulário em edição se perde, sem guardar rascunho com segredos.
- **Chamada recusada por troca de conta** (`017`): o formulário não exibe sucesso nem reenvia; mostra o aviso de conta trocada.
- **Rede/5xx ao criar ou editar:** o usuário vê o erro e o formulário mantém os dados digitados (só em memória) para tentar de novo.
- **Edição simultânea em duas abas:** vale a última gravação; uma entrada editada depois de ir para a lixeira em outra aba é gravada e continua na lixeira.
- **Restaurar ou excluir definitivamente algo que outra aba já alterou (`404`):** sucesso idempotente, com a lista recarregada.
- **Id inválido (`404`) ou de outro usuário (`403`):** tela "não encontrada" sem distinguir o motivo.
- **Validação do servidor (título):** o erro por campo aparece no campo.
- **Clipboard indisponível** (contexto não seguro, permissão negada) ou escrita recusada por falta de foco: mensagem clara ou limpeza pendente; nunca falha em silêncio.
- **Lista grande ou lenta:** carregada inteira (sem paginação), com skeleton; falha mostra erro com nova tentativa.

## Known Limitations

Aceitas pelo usuário em 2026-10-21 (revisão do plano antes da ativação):

- **Só a senha é cifrada** (ADR-0001): título, login e campos adicionais ficam em texto no banco, e a interface não avisa sobre isso (decisão do usuário: a senha é o dado sensível).
- **Sem controle de concorrência:** a última gravação vence (o backend não versiona entradas).
- **Clipboard é melhor esforço:** com a leitura negada a limpeza pode sobrescrever uma cópia feita pelo usuário nos 20 s; sem foco, a limpeza só roda quando a aba volta; fechar a aba antes deixa o conteúdo no clipboard; outros aplicativos podem lê-lo nesse intervalo.
- **Sem busca, filtro nem paginação:** a lista vem inteira, na ordem de atualização da API; a lixeira não mostra a data de exclusão (a API não a devolve).
- **Rascunho de formulário não sobrevive** ao fim da sessão (deliberado: não persistir segredos).
- A senha revelada fica visível por até 30 s.

## Verification Matrix

| Invariante ou critério | Teste (a definir na implementação) | Prova de que o teste falha sem o comportamento |
| --- | --- | --- |
| Nada de senha em storage, URL, título ou `console.*` | teste de fluxo: criar, editar, revelar, copiar e inspecionar `localStorage`, `sessionStorage`, URL e `console` | mutação: gravar o rascunho em `sessionStorage`; logar a resposta |
| Cache sem senha | teste que sai da tela e inspeciona o cache | mutação: `gcTime` padrão; `setQueryData` com o detalhe |
| Fim de sessão e troca de conta limpam tudo | teste com tela montada + `signOut`, expiração e troca de conta | mutação: remover o reset de consultas; não descartar o formulário |
| Revelar é temporário (30 s, aba oculta, sair da tela) | teste com relógio falso e `visibilitychange` | mutação: sem timer; sem o listener |
| Clipboard: limpa só o que copiou; leitura negada limpa; sem foco fica pendente; copiar de novo substitui; logout limpa | testes com relógio falso, clipboard e foco simulados | mutações: limpar sempre; não ler antes; limpar sem foco; não cancelar a pendente |
| Mutação não duplica | teste de duplo clique com API lenta | mutação: não desabilitar o controle |
| Edição abre com detalhe fresco e envia todos os campos | teste com lista desatualizada e campos adicionais | mutação: abrir com dado da lista; omitir campos |
| Senha vazia e nomes de campo vazios ou duplicados recusados | teste do formulário | mutação: remover a validação |
| Exclusão definitiva só na lixeira e com confirmação | teste do diálogo e da rota | mutação: oferecer fora da lixeira; aceitar texto vazio |
| `404` idempotente em restaurar e excluir | teste com API respondendo 404 | mutação: tratar como erro |
| Id inválido ou de outro usuário → "não encontrada" | teste de rota com 404 e 403 | mutação: expor o status |
| Valores como texto e `autocomplete` desligado | teste com valor `<img onerror>` e `javascript:` | mutação: `dangerouslySetInnerHTML`; remover o atributo |
| Estados carregando, vazio e erro | testes de componente | mutação: renderizar vazio no erro |

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
