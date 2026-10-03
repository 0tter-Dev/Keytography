---
id: keytography-009
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 9
depends_on: [keytography-008]
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

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar as telas de cofre implementadas.
- `docs/capabilities/vault-entries/README.md`: registrar tags/favoritos/grupos-subgrupos como evolução futura (constatação deliberada de que não fazem parte do schema atual).
- `README.md` (raiz): Current Scope passa a listar o cofre (CRUD de contas e senhas) como entregue na interface web; Quick Start só muda se o primeiro uso passar a depender de algum passo novo.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
