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

`Documentation Updates` deve cobrir **toda** a documentação afetada (checklist em [DOCUMENTATION-GUIDE.md](../DOCUMENTATION-GUIDE.md#definição-de-pronto-para-a-documentação-de-uma-entrega)): cada capability autorizada cujo comportamento muda, o `README.md` da raiz (Quick Start, Current Scope, Stack) quando a entrega muda o que o projeto roda/oferece/usa, `STATUS.md`/`ROADMAP.md`, guias, e — se a API muda — o contrato em `docs/reference/`. Cada item é atualizado ou registrado como "não precisa mudar", de forma deliberada. O `Acceptance Criteria` de um plano que muda o que o projeto oferece deve incluir que o `README.md` da raiz reflete o estado real.

## Ordering And Eligibility

`docs/ROADMAP.md` é a fila ordenada canônica. `priority` sinaliza urgência e não sobrepõe `sequence`. `depends_on` lista apenas pré-requisitos obrigatórios. Por padrão, somente o primeiro plano elegível pode virar `active`; ativação em paralelo exige aprovação explícita do usuário e segue as regras de [Parallel Execution](#parallel-execution).

## Delivery Semantics

Um plano ativo aprovado pelo usuário autoriza a sequência de entrega documentada: branch, implementação, validação, Conventional Commit, push, e pull request. Ele vira `review` naquele PR, e `completed` só depois do merge. A branch segue `<type>/<id>-<slug>` com o `type` do plano; o fechamento (`chore/close-<id>`) também apaga as branches locais já mergeadas, depois do merge real (ver [DEVELOPMENT-GUIDE.md](../DEVELOPMENT-GUIDE.md#nomes-de-branches-prs-e-planos)).

## Pre-Merge Audit

A `project-audit` roda como portão antes do merge de entregas relevantes. A decisão de **como** executá-la é uma configuração do projeto, lida pela skill desta linha:

**Modo de execução da project-audit:** perguntar

Valores aceitos: `perguntar` (a skill pergunta a cada auditoria), `subagente` (sempre em um subagente de contexto limpo, sem o histórico da implementação) ou `sessão atual` (na própria conversa). O padrão deste projeto é `perguntar`; para fixar uma decisão, troque o valor acima em um PR revisado. A auditoria em subagente é a recomendada para entregas complexas ou críticas (revisão independente do próprio autor); em qualquer modo ela só reporta, nunca corrige.

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

