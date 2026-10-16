# Plans

Planos são registros de trabalho focados, com ciclo de vida `backlog → active → review → completed`; `cancelled` é a alternativa terminal explícita.

## Plan Template

```yaml
---
id: area-001
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: patch
actual_version_impact: pending
priority: medium
sequence: 0
depends_on: []
authorized_capabilities: []
decision_records: []
validation: []
documentation_updates: []
---
```

Todo corpo de plano deve conter `Objective`, `Context`, `Scope`, `Out Of Scope`, `Acceptance Criteria`, `Validation`, `Documentation Updates`, e `Outcome`. Um plano ativo também deve registrar a aprovação explícita do usuário.

Planos ainda não concluídos (`backlog`, `active`, `review`) também devem conter as seções abaixo (verificado em `dotnet test`; planos concluídos antes desta regra ficam isentos):

- **`Invariants And Failure Modes`:** o que deve valer **sempre** (consistência, segurança, nenhum vazamento entre contas ou sessões, idempotência) e os modos de falha a tratar: concorrência e corridas, rede lenta ou fora do ar, resposta perdida, reinício do servidor, relógio, falha parcial, resposta antiga chegando tarde, entrada hostil. Um plano que realmente não tem nenhum escreve `Não se aplica: <justificativa>`.
- **`Known Limitations`:** limitações aceitas, cada uma com a aprovação registrada (ou "nenhuma conhecida até aqui").
- **`Verification Matrix`:** para cada invariante e critério de aceite, o teste que o cobre e como se prova que o teste falha quando o comportamento é removido (mutação ou caso negativo).

Decisões e ajustes de meio tomados durante a implementação entram em uma seção `Implementation Clarifications` (opcional), cada um com data e com a forma como foi aprovado; o `Approval` original não é reescrito. Veja também [Design Gate](#design-gate) e [Audit Rounds](#audit-rounds).

`Documentation Updates` deve cobrir **toda** a documentação afetada (checklist em [DOCUMENTATION-GUIDE.md](../DOCUMENTATION-GUIDE.md#definição-de-pronto-para-a-documentação-de-uma-entrega)): cada capability autorizada cujo comportamento muda, o `README.md` da raiz (Quick Start, Current Scope, Stack) quando a entrega muda o que o projeto roda/oferece/usa, `STATUS.md`/`ROADMAP.md`, guias, e — se a API muda — o contrato em `docs/reference/`. Cada item é atualizado ou registrado como "não precisa mudar", de forma deliberada. O `Acceptance Criteria` de um plano que muda o que o projeto oferece deve incluir que o `README.md` da raiz reflete o estado real.

O front matter completo, a concordância entre pasta e `status`, as seções obrigatórias, o `Outcome` dos planos concluídos, o `Approval` dos planos ativos e em revisão e a menção ao `README.md` da raiz nos planos `feat` ainda não concluídos são verificados automaticamente em `dotnet test` e no CI (ver [DOCUMENTATION-GUIDE.md](../DOCUMENTATION-GUIDE.md#verificação-automática-de-governança)).

## Design Gate

Um plano que toca o que o [AGENTS.md](../../AGENTS.md) classifica como sensível (criptografia, armazenamento de senhas, autenticação, controle de acesso entre roles) — ou que trata estado compartilhado, concorrência ou rede de forma central — tem a seção `Invariants And Failure Modes` **revisada e aprovada pelo usuário antes da ativação**: o `Approval` precisa citá-la (a governança verifica). A revisão é onde invariantes e modos de falha faltantes são descobertos, antes de virarem código e rodadas de auditoria. Os demais planos aprovam a seção junto com o plano. Mudanças nessas seções depois da aprovação passam pelo usuário e entram em `Implementation Clarifications`.

## Ordering And Eligibility

`docs/ROADMAP.md` é a fila ordenada canônica. `priority` sinaliza urgência e não sobrepõe `sequence`. `depends_on` lista apenas pré-requisitos obrigatórios. Por padrão, somente o primeiro plano elegível pode virar `active`; ativação em paralelo exige aprovação explícita do usuário e segue as regras de [Parallel Execution](#parallel-execution).

## Delivery Semantics

Um plano ativo aprovado pelo usuário autoriza a sequência de entrega documentada: branch, implementação, validação, Conventional Commit, push, e pull request. Ele vira `review` naquele PR, e `completed` só depois do merge. A branch segue `<type>/<id>-<slug>` com o `type` do plano; o fechamento (`chore/close-<id>`) também apaga as branches locais já mergeadas, depois do merge real (ver [DEVELOPMENT-GUIDE.md](../DEVELOPMENT-GUIDE.md#nomes-de-branches-prs-e-planos)).

**Verificações manuais:** o resultado de toda verificação manual listada em `Validation` (o que foi executado e o que se observou) é registrado no `Outcome` ao fechar o plano. Quando o roteiro for repetível, ele vive em um guia (por exemplo, a seção "Verificando as sessões com curl" de [running-locally.md](../guides/running-locally.md)) e o plano o referencia, para que auditorias e mudanças futuras o repitam.

## Pre-Merge Audit

A `project-audit` roda como portão antes do merge de entregas relevantes. A decisão de **como** executá-la é uma configuração do projeto, lida pela skill desta linha:

**Modo de execução da project-audit:** subagente

Valores aceitos: `perguntar` (a skill pergunta a cada auditoria), `subagente` (sempre em um subagente de contexto limpo, sem o histórico da implementação) ou `sessão atual` (na própria conversa). O padrão anterior era `perguntar`; em 2026-10-03 o usuário fixou `subagente` (revisão independente, em contexto limpo). Para mudar a decisão, troque o valor acima em um PR revisado. A auditoria em subagente é a recomendada para entregas complexas ou críticas (revisão independente do próprio autor); em qualquer modo ela só reporta, nunca corrige.

### Audit Rounds

1. **Pré-voo:** antes de abrir o PR, quem implementa roda o checklist da `project-audit` sobre a própria branch (status do plano × pasta, links, capability, README raiz, ADR e índice, contratos gerados, números da descrição do PR) e confere a `Verification Matrix`.
2. **1ª rodada:** além do checklist, percorre as categorias de falha (concorrência e corridas, tempo e limites, falha parcial e resposta perdida, reinício, idempotência, vazamento entre contas e sessões).
3. **Correção em lote:** os achados de uma rodada são corrigidos juntos, cada um com a **varredura dos casos irmãos** (a mesma falha em outros pontos), um teste que falha sem a correção e a documentação ajustada no mesmo commit.
4. **Rodadas seguintes:** cobrem o que mudou desde a anterior, regressões e a verificação das varreduras. A 3ª rodada em diante só acontece se a anterior achou crítico ou importante **em código novo**; menores e sugestões vão para o `Outcome` ou para o backlog, por padrão.
5. **Relatório:** cada achado traz a categoria da causa-raiz e se foi introduzido por uma correção anterior; o usuário decide o que bloqueia o merge.

## Parallel Execution

O padrão é **um plano ativo por vez**. Executar planos em paralelo (cada um com sua branch, seu worktree e seu PR) só acontece com **autorização explícita do usuário, dada antes de começar e por conjunto de planos**; aprovação de um conjunto não vale para outro. O objetivo das regras abaixo é evitar conflitos entre os PRs.

**Quando faz sentido:** planos realmente independentes (nenhum depende do outro, direta ou indiretamente, e nenhum precisa do resultado do outro), em número pequeno (no máximo 3 ao mesmo tempo), em que cada PR fica revisável sozinho.

**Pedido de autorização.** Antes de executar, o agente apresenta ao usuário e espera um sim explícito para:
1. os planos do conjunto e por que são independentes;
2. os arquivos compartilhados que provavelmente vão conflitar (lista abaixo), e como cada conflito será evitado;
3. a ordem de merge sugerida.

A aprovação é registrada no `Approval` de cada plano do conjunto (data e os ids dos planos executados juntos).

**Como evitar conflitos:**
- Cada plano roda em um worktree próprio (`git worktree`, ou um subagente com worktree isolado), partindo da mesma `main`, em uma branch `<type>/<id>-<slug>`.
- **Arquivos compartilhados** que costumam conflitar neste projeto: `docs/STATUS.md`, `docs/ROADMAP.md`, `README.md` da raiz, o README da capability `web-interface` (autorizado por vários planos da interface), `web/package.json` e `web/package-lock.json`, `web/src/app/router.tsx`, `web/src/components/layout/NavList.tsx`, `web/src/i18n/locales/pt-BR.json`, e os arquivos gerados `docs/reference/openapi.json` e `web/src/api/schema.d.ts`.
- Em execução paralela, o PR de implementação **não edita** `STATUS.md` nem `ROADMAP.md`: essas atualizações vão para os PRs de fechamento, que são feitos e mergeados um de cada vez.
- Para os demais arquivos compartilhados, edite o mínimo (acrescentar entradas em vez de reescrever trechos) e deixe os conflitos previsíveis anotados no PR.
- Arquivos gerados (`openapi.json`, `schema.d.ts`, lockfile) nunca se resolvem à mão: em conflito, descarte a versão do PR, sincronize com a `main` e regenere.

**Merge e sincronização:**
- O usuário mergeia **um PR por vez**. Depois de cada merge, os PRs restantes sincronizam com a `main`, repetem a validação e só então voltam para revisão.
- Nenhum agente faz merge, nem de um PR "sem conflito" (regra de `AGENTS.md`).
- Se uma sincronização produzir conflito que não seja trivial (texto de documentação, ou arquivo gerado), o agente para e consulta o usuário em vez de arbitrar.

**Fechamento.** Cada plano do conjunto tem seu próprio PR de fechamento, depois do merge do respectivo PR de implementação, e os PRs de fechamento também são mergeados um de cada vez. Depois do merge, remova o worktree (`git worktree remove`, e `git worktree prune`) junto com a limpeza de branches locais descrita em [DEVELOPMENT-GUIDE.md](../DEVELOPMENT-GUIDE.md#limpeza-depois-do-merge).

