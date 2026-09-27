# Documentation Guide

## Purpose

Este guia define o sistema de documentação do Keytography, para que ele sustente um leitor sem contexto prévio, sem arquivos gigantes nem travessia excessiva entre documentos.

## Information Architecture

| Area | Owns | Does not own |
| --- | --- | --- |
| Root documents | escopo do produto, regras de engenharia, status, roadmap | narrativa de implementação em nível de feature |
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
