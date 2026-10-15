---
id: keytography-009
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 9
depends_on: [keytography-008, keytography-017]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# UI de cofre (CRUD núcleo)

## Objective

Implementar a experiência central do produto: listar, criar, editar, excluir (lixeira/restauração/exclusão definitiva) e consultar o histórico de entradas de cofre.

## Context

`keytography-008` entrega sessão/autenticação. Este plano consome os endpoints de `vault-entries` já existentes (`GET/POST /vault/entries`, `GET/PUT/DELETE /vault/entries/{id}`, `GET /vault/entries/{id}/history`, `GET /vault/entries/trash`, `POST /vault/entries/{id}/restore`, `DELETE /vault/entries/{id}/permanent`), que não mudam.

## Scope

- Listagem de entradas de cofre (título, login, data de atualização) em uma única visualização padrão (ex.: lista ou cards) — a preferência de densidade configurável (Tabela/Lista/Cards/Blocos) fica para `keytography-012`.
- Criação de entrada (título, login, senha, campos adicionais livres).
- Edição de entrada, incluindo os mesmos campos.
- Visualização de detalhe de uma entrada, com a senha oculta por padrão e um toggle de visibilidade.
- Copiar login/senha para a área de transferência, com auto-limpeza do clipboard após um intervalo curto (ex.: 20 segundos).
- Lixeira: listar entradas excluídas, restaurar, e excluir definitivamente.
- Exclusão definitiva exige confirmação "digite para confirmar" (ação irreversível, único caso que foge do soft-delete padrão).
- Visualização de histórico de senha de uma entrada.
- Estados de carregamento (skeleton) e vazio (lista sem entradas) tratados explicitamente, não como tela em branco.

## Out Of Scope

- Preferência de densidade de exibição configurável (Tabela/Lista/Cards/Blocos) — `keytography-012`.
- Indicador de força de senha nos formulários — `keytography-010`.
- Geração de senha integrada ao formulário — `keytography-011`.
- Tags, favoritos, grupos/subgrupos — não existem no schema do backend; registrados como evolução futura em `docs/capabilities/vault-entries/README.md`, fora do escopo desta interface.

## Approval

## Acceptance Criteria

- Criar uma entrada de cofre e vê-la aparecer na listagem imediatamente, sem necessidade de recarregar a página.
- Editar uma entrada existente persiste a mudança e reflete na listagem e no detalhe.
- Excluir uma entrada a remove da listagem padrão e a faz aparecer na lixeira.
- Restaurar uma entrada da lixeira a devolve à listagem padrão.
- Excluir definitivamente uma entrada exige digitar uma palavra de confirmação antes de prosseguir, e a remove de vez (não aparece mais nem na lixeira).
- Consultar o histórico de uma entrada que já teve a senha trocada mostra a senha anterior e o timestamp da troca.
- Copiar a senha para a área de transferência funciona, e o clipboard é limpo automaticamente após o intervalo configurado (verificável lendo o clipboard antes/depois do intervalo em teste).
- Uma listagem vazia mostra um estado vazio explícito (não uma tela em branco); uma listagem carregando mostra skeleton, não um spinner genérico sem contexto.

## Validation

- Testes de componente cobrindo formulários, estados vazio/carregando, e o fluxo de confirmação de exclusão definitiva.
- Verificação manual do CRUD completo contra a API local, incluindo lixeira e histórico.
- CI permanece verde.

## Invariants And Failure Modes

*Rascunho: confirmar/ajustar na aprovação do plano.*

Invariantes (devem valer sempre):

- **Nenhum segredo fora da memória da aba:** senha e demais campos sensíveis nunca vão para `localStorage`/`sessionStorage`/URL/título da página/logs; a senha só está no DOM enquanto visível (oculta por padrão).
- **Fim de sessão ou troca de conta limpa a tela:** nenhum valor revelado ou rascunho permanece depois de logout, expiração ou troca de conta em outra aba (o cache de consultas já é esvaziado/redefinido pelo `keytography-017`; as telas montadas recarregam).
- **Clipboard:** a limpeza programada só apaga se o conteúdo ainda for o que a interface copiou; é disparada também no logout/expiração.
- **Mutações não duplicam:** criar, restaurar e excluir não são reenviados por duplo clique (controle desabilitado durante o envio); a repetição automática do cliente só ocorre depois de um 401 (chamada não processada).
- **Exclusão definitiva só com a confirmação digitada**, e a UI não oferece o atalho de repetição.

Modos de falha a tratar explicitamente:

- **401 persistente depois do refresh** (cofre sem DEK após reinício da API): a sessão termina e o formulário em edição se perde; mostrar o aviso de sessão expirada e não tentar guardar rascunho com segredos.
- **Chamada recusada por troca de conta** (`017`): o formulário não pode exibir sucesso nem reenviar; mostra o aviso de conta trocada.
- **Rede/5xx durante criar ou editar:** o usuário vê o erro e o formulário mantém os dados digitados (só em memória) para tentar de novo.
- **Edição simultânea em duas abas:** sem controle de versão no backend, vale a última gravação.
- **Lista grande, vazia ou lenta:** skeleton, estado vazio e erro distintos (nunca tela em branco).

## Known Limitations

- Sem controle de concorrência otimista: a última gravação vence (o backend não versiona entradas).
- O conteúdo copiado fica no clipboard do sistema pelo intervalo configurado e pode ser lido por outros aplicativos nesse tempo.
- Rascunho de formulário não sobrevive ao fim da sessão (decisão deliberada: não persistir segredos).

## Verification Matrix

| Invariante ou critério | Teste (a definir na implementação) | Prova de que o teste falha sem o comportamento |
| --- | --- | --- |
| Nada de segredo em storage/URL | teste de fluxo: criar/editar/copiar e inspecionar `localStorage`, `sessionStorage` e URL | mutação: gravar o rascunho em `sessionStorage` |
| Fim de sessão/troca de conta limpa a tela | teste com tela montada + `signOut`/troca de conta | mutação: remover o reset de consultas |
| Clipboard só limpa o que copiou | teste com relógio falso e clipboard alterado no meio | mutação: limpar sempre |
| Mutação não duplica | teste de duplo clique com API lenta | mutação: não desabilitar o controle |
| Exclusão definitiva exige confirmação | teste do diálogo | mutação: aceitar texto vazio |

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar as telas de cofre implementadas.
- `docs/capabilities/vault-entries/README.md`: registrar tags/favoritos/grupos-subgrupos como evolução futura (constatação deliberada de que não fazem parte do schema atual).
- `README.md` (raiz): Current Scope passa a listar o cofre (CRUD de contas e senhas) como entregue na interface web; Quick Start só muda se o primeiro uso passar a depender de algum passo novo.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
