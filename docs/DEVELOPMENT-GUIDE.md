# Development Guide

## Development Priorities

1. Construir o core/backend (autenticação, cofre de contas/senhas, avaliação de força, geração de senha) antes de qualquer interface.
2. Preservar o escopo e os non-goals documentados em `PROJECT-ARCHITECTURE.md` em vez de expandir funcionalidades por conveniência de implementação.
3. Tratar decisões que afetam segurança dos dados armazenados (criptografia, autenticação, controle de acesso por role) como decisões que sempre exigem revisão humana explícita.

## Scope Control

Mudanças são aceitáveis quando:

- Implementam uma regra de negócio já registrada em uma `capabilities/<slug>/README.md`.
- Ficam dentro do core/backend definido como escopo da fase atual.
- Não introduzem uma das funcionalidades listadas como Non-Goal em `PROJECT-ARCHITECTURE.md`.

Mudanças exigem revisão explícita quando:

- Alteram o esquema de criptografia de senhas ou o fluxo de autenticação/recuperação de acesso.
- Alteram o modelo de roles (`Admin` / `Member`) ou o que cada role pode ler/escrever.
- Introduzem uma dependência técnica nova ou uma decisão de stack ainda pendente em `PROJECT-ARCHITECTURE.md`.
- Expandem o escopo além do que está descrito como objetivo atual.

## Documentation Rules

- Comportamento novo de uma capability vai em `docs/capabilities/<slug>/README.md`.
- Mudanças de escopo ou política vão em `docs/PROJECT-ARCHITECTURE.md`.
- Mudanças de fluxo de uso voltadas ao usuário final vão em `docs/guides/`.
- Convenções de código de interface (componentes, estilo, tokens, i18n, testes) vivem em [docs/guides/web-frontend-conventions.md](./guides/web-frontend-conventions.md) e valem como padrão geral para qualquer implementação de interface do projeto.
- O contrato da API consumido pelos clientes vive em `docs/reference/` (ver [docs/reference/README.md](./reference/README.md) e [ADR-0004](./decisions/ADR-0004-versioned-openapi-contract.md)). **Mudou endpoint, DTO ou metadado de resposta? Regenerar e commitar `docs/reference/openapi.json` e `web/src/api/schema.d.ts` na mesma entrega é obrigatório** — o CI falha caso contrário.
- Decisões duráveis que atravessam múltiplas capabilities vão em `docs/decisions/`.
- Atualize `docs/STATUS.md` junto de qualquer mudança de implementação relevante.
- **Revise o `README.md` da raiz** (Quick Start, Current Scope, Stack) em toda entrega que mude o que o projeto roda, oferece ou usa, e registre o resultado em `Documentation Updates` do plano. A lista completa do que revisar ao fechar uma entrega está em [DOCUMENTATION-GUIDE.md](./DOCUMENTATION-GUIDE.md#definição-de-pronto-para-a-documentação-de-uma-entrega).

## Git Direction

- Use Conventional Commits.
- Declare o impacto de SemVer (major/minor/patch/none) explicitamente em toda descrição de PR.
- Mantenha mudanças pequenas e revisáveis.

### Nomes de branches, PRs e planos

O `type` do plano (campo do front matter, um tipo de Conventional Commits: `feat`, `fix`, `docs`, `chore`, `refactor`...) descreve o que ele de fato entrega e aparece em tudo que nasce dele:

| Artefato | Padrão | Exemplo |
| --- | --- | --- |
| Arquivo do plano | `<id>-<slug>.md` (o `type` fica no front matter) | `keytography-008-web-authentication-ui.md` |
| Branch de entrega | `<type>/<id>-<slug>` | `feat/keytography-008-web-authentication-ui` |
| Título do PR de entrega | `<type>: <resumo> (<id>)` | `feat: web authentication UI (keytography-008)` |
| Branch e PR de fechamento | `chore/close-<id>` / `chore: close <id> (<resumo>)` | `chore/close-keytography-008` |
| Trabalho sem plano | `<type>/<slug>` | `docs/branch-and-pr-naming-convention` |

- Se o plano mistura tipos, vale o dominante (a fundação da interface web, que também tocou a API e o CI, foi `feat`). Os commits dentro da branch usam o tipo que couber a cada um; ajustes da `project-audit` entram na mesma branch e no mesmo PR.
- Este é o padrão deste projeto e pode ser revisto aqui, com aprovação, sem mexer nas skills: elas apenas mandam seguir o que este guia define.

### Limpeza depois do merge

Depois que o PR de entrega é mergeado (nunca antes), o fechamento sincroniza a `main`, roda `git fetch --prune` e apaga as branches locais cujo remoto já foi removido, **somente com `git branch -d`**, que recusa apagar o que não foi mergeado. Se alguma recusar, ela é mantida e o motivo é reportado; `git branch -D` só com autorização explícita. Os remotos são apagados pelo GitHub ao mergear.

## Hooks do Claude Code (somente neste projeto)

`.claude/settings.json` (versionado) registra hooks que valem para qualquer agente que trabalhe neste repositório; os scripts ficam em `.claude/hooks/` (Node, sem dependências) e são testados com `node --test ".claude/hooks/*.test.mjs"`. Preferências pessoais ficam em `.claude/settings.local.json`, que não é versionado.

| Hook | Quando | O que faz |
| --- | --- | --- |
| `block-process-kill-by-name` | antes de comandos de shell | bloqueia encerrar processos pelo nome da imagem (`taskkill /IM`, `pkill`/`killall`, `Stop-Process -Name`, `Get-Process <nome>` encadeado em `Stop-Process`), que derrubam processos alheios ao projeto; a mensagem ensina a parar pela porta ou pelo PID. Texto que só menciona esses comandos (mensagem de commit, heredoc, aspas) não é bloqueado |
| `web-precommit-checks` | antes de `git commit` com alterações em `web/` | roda `npm run lint` e `npm run format:check` (as mesmas verificações do job `web` do CI) e bloqueia o commit se falharem |
| `remind-api-contract` | depois de editar endpoints, DTOs, `Program.cs` ou `OpenApi/` da API | lembra de regenerar `docs/reference/openapi.json` e `web/src/api/schema.d.ts` ([ADR-0004](./decisions/ADR-0004-versioned-openapi-contract.md)); só avisa, não bloqueia |

Os hooks são guardas de conveniência e não substituem o CI, que continua sendo a barreira que vale. Um hook com defeito nunca trava o trabalho (entrada ilegível significa "sem opinião"). Alterar ou acrescentar hooks é mudança de governança e passa por PR revisado.

