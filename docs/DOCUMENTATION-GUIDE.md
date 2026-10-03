# Documentation Guide

## Purpose

Este guia define o sistema de documentação do Keytography, para que ele sustente um leitor sem contexto prévio, sem arquivos gigantes nem travessia excessiva entre documentos.

## Information Architecture

| Area | Owns | Does not own |
| --- | --- | --- |
| Root documents (`README.md`, `docs/PROJECT-ARCHITECTURE.md`, `docs/STATUS.md`, `docs/ROADMAP.md`, ...) | escopo do produto, regras de engenharia, status, roadmap; o `README.md` da raiz é a porta de entrada (Quick Start, Current Scope, Stack) | narrativa de implementação em nível de feature |
| `capabilities/` | comportamento atual canônico, invariantes, contratos | planejamento temporário ou justificativa cross-cutting |
| `reference/` | contratos e definições estáveis | instruções procedurais |
| `guides/` | instruções orientadas a tarefas | regras canônicas de feature |
| `decisions/` | escolhas duráveis de arquitetura/política | notas normais de implementação |
| `plans/` | trabalho futuro aprovado e resultados concluídos | comportamento atual do produto |

Cada capability tem um único `README.md` canônico. Arquivos-satélite só existem para contratos independentemente grandes.

## Status And Duplication Rules

`STATUS.md` é um dashboard compacto. `ROADMAP.md` é um índice compacto. Cada um linka para sua fonte em vez de duplicar a narrativa completa.

## Plan Lifecycle And Context Authorization

Planos seguem `backlog → active → review → completed`, com `cancelled` como alternativa terminal explícita. Planos só saem de `backlog` para `active` após aprovação explícita do usuário registrada no corpo do plano. `ROADMAP.md` é a fila ordenada canônica. Um plano ativo autoriza apenas os caminhos exatos em `authorized_capabilities`; ele nunca expande o escopo do produto.

## Decision Records

Use um ADR apenas para decisões que afetam múltiplas capabilities, a arquitetura, dependências estratégicas, ou política durável — por exemplo, o esquema de criptografia usado para armazenar senhas, ou o mecanismo de recuperação de acesso, ambos ainda em aberto conforme `PROJECT-ARCHITECTURE.md`.

## Maintenance

Mantenha os links internos válidos. Atualize a capability, guide, plan, ou ADR dona do fato junto de qualquer mudança relevante de comportamento ou governança.

### Definição de "pronto" para a documentação de uma entrega

Uma entrega só está pronta quando **toda** a documentação afetada reflete o que foi implementado — não só a capability principal. Ao fechar uma entrega, revise explicitamente cada item, e registre em `Documentation Updates` do plano ou o que foi atualizado, ou a constatação deliberada de que não precisa mudar (nunca omissão silenciosa):

1. as capabilities em `authorized_capabilities` cujo comportamento mudou;
2. **`README.md` da raiz** — Quick Start (o que dá para rodar e como), Current Scope (o que está implementado vs. planejado) e Stack. É a primeira coisa que um leitor novo vê; já ficou congelado no estágio de kickoff uma vez, e **deve ser revisado em toda entrega que mude o que o projeto roda, oferece ou usa**;
3. `docs/STATUS.md` e `docs/ROADMAP.md`;
4. guias afetados (`docs/guides/`), incluindo `running-locally.md` quando mudar como rodar o projeto;
5. `docs/reference/` — se a API mudou, o contrato versionado e os tipos gerados (ver [ADR-0004](./decisions/ADR-0004-versioned-openapi-contract.md));
6. ADRs, quando a entrega envolver uma decisão durável.

### Verificação automática de governança

Parte destas regras é verificada por código, na suíte de testes (`tests/Keytography.Tests/DocumentationGovernance/`), e portanto roda em `dotnet test` e no job `build` do CI, que é o check obrigatório da branch protegida. Mensagens de erro dizem arquivo (e linha, quando há), a regra violada e como corrigir.

| Regra (id na mensagem) | O que garante | Protege |
| --- | --- | --- |
| `plano` | todo arquivo de plano tem o front matter completo, `status` igual à pasta, nome de arquivo começando pelo `id`, `type` de Conventional Commits, as 8 seções obrigatórias e `depends_on` apontando para planos existentes | o template e o ciclo de vida em [plans/README.md](./plans/README.md) |
| `ciclo-de-vida` | `completed` tem `Outcome` preenchido e `actual_version_impact` real; `active` e `review` têm `Approval` preenchido e `actual_version_impact: pending` | a regra de que a pasta e o campo `status` concordam e de que o impacto real só entra no fechamento |
| `dashboard` | todo plano aberto aparece no `ROADMAP.md`, todo plano concluído aparece no `STATUS.md`, e toda capability está no Capability Dashboard com o mesmo status do seu `Current Status` | `STATUS.md` e `ROADMAP.md` como índices fiéis |
| `link` | todo link relativo de `README.md`, `AGENTS.md` e `docs/**/*.md` aponta para um arquivo existente e, com `#âncora`, para um título existente (âncoras no estilo do GitHub) | "mantenha os links internos válidos" |
| `readme-raiz` | todo plano `feat` ainda não concluído cita o `README.md` da raiz em `Documentation Updates` (atualização ou constatação deliberada de que não muda); planos concluídos antes da regra ficam isentos | a definição de "pronto" acima, item 2 |
| `template` | nenhum placeholder `{{...}}` esquecido (código inline e blocos de código são ignorados) | documentos finais sem resíduo de template |

A mesma suíte tem a verificação de nomes de branches e PRs (`BranchNamingTests`): no CI de pull request, a branch deve seguir `<type>/<slug>` e o título do PR deve casar com ela, conforme a seção "Nomes de branches, PRs e planos" do [DEVELOPMENT-GUIDE.md](./DEVELOPMENT-GUIDE.md#nomes-de-branches-prs-e-planos). Branches de `dependabot/` e `renovate/` são isentas.

**Rodar localmente:** `dotnet test --filter "FullyQualifiedName~DocumentationGovernance"` (regras de documentação, contra o repositório real e contra árvores sintéticas) e `dotnet test --filter "FullyQualifiedName~BranchNaming"`. Para reproduzir a verificação de um PR, defina `KEYTOGRAPHY_PR_BRANCH` e `KEYTOGRAPHY_PR_TITLE` antes de rodar o segundo comando.

**Exceções.** Não existe arquivo de exceções nem forma de silenciar uma regra. Uma exceção legítima é uma mudança explícita no verificador, num PR revisado: uma condição ou lista nomeada no código, com o motivo em comentário e um teste que a cobre (exemplos que já existem: a isenção de planos concluídos na regra `readme-raiz` e a lista de prefixos de branch isentos). O verificador garante a **presença** do cuidado com o README raiz e dos demais itens, não a **fidelidade** do conteúdo; essa continua sendo papel da `project-audit`.
