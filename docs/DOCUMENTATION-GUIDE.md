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
