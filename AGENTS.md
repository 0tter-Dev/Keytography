# AGENTS.md

## Leitura obrigatória e autoridade sobre a documentação

Antes de alterar o repositório, leia nesta ordem:

1. `docs/PROJECT-ARCHITECTURE.md`
2. `docs/DEVELOPMENT-GUIDE.md`
3. `docs/DOCUMENTATION-GUIDE.md`
4. `docs/STATUS.md`
5. o documento relevante em `docs/plans/active/` ou `docs/plans/review/`, quando existir

Agentes não devem ler documentos de `capabilities/` por padrão. Um plano ativo autoriza apenas os arquivos exatos listados em seu campo `authorized_capabilities`, quando o plano registra aprovação explícita do usuário. Qualquer outro acesso a `capabilities/` exige autorização explícita do usuário.

## Comportamento obrigatório

Todo novo plano de entrega define `requires_pull_request: true`. Para um plano ativo já aprovado, esse campo é a autorização explícita para executar a sequência de entrega documentada — apenas ela: branch, implementação, validação, commit, push e abertura do pull request — sem precisar de uma segunda autorização para essas ações.

Após mudanças de código relevantes, atualize a capability dona do comportamento e todos os documentos de status, guia, referência, decisão ou plano afetados — **incluindo o `README.md` da raiz (Quick Start, Current Scope, Stack) sempre que a entrega mudar o que o projeto roda, oferece ou usa**. Uma entrega só está pronta quando isso foi feito, ou registrado em `Documentation Updates` como constatação deliberada de que não precisa mudar (checklist em `docs/DOCUMENTATION-GUIDE.md`, seção "Definição de pronto para a documentação de uma entrega").

Mudanças em endpoint, DTO ou metadado de resposta da API exigem regenerar e commitar `docs/reference/openapi.json` e `web/src/api/schema.d.ts` na mesma entrega (ADR-0004); o CI e a suíte de testes falham se isso for esquecido.

## Limites de escopo

Agentes podem alterar detalhes de implementação dentro da arquitetura documentada, testes, e clareza de documentação. Aprovação explícita é exigida para mudanças em arquitetura, contratos públicos, dependências estratégicas, ou no escopo/non-goals descritos em `PROJECT-ARCHITECTURE.md`.

Dado o caráter sensível dos dados que o Keytography armazena (credenciais de contas de terceiros), qualquer mudança que toque criptografia, armazenamento de senhas, autenticação, ou controle de acesso entre roles (`Admin` / `Member`) sempre exige aprovação humana explícita, mesmo quando estaria tecnicamente dentro do escopo documentado de um plano ativo.

## Git e entrega

Use apenas `git` e `gh`, Conventional Commits, e um PR para a branch principal. Nomeie branches como `<type>/<id>-<slug>` (o `type` vem do plano) e PRs como `<type>: <resumo> (<id>)`; depois do merge, o fechamento remove as branches locais já mergeadas (`git branch -d`). Detalhes em `docs/DEVELOPMENT-GUIDE.md`, seção "Nomes de branches, PRs e planos". Declare explicitamente o impacto de SemVer (major/minor/patch/none) em todo PR e justifique qualquer diferença entre `expected_version_impact` e `actual_version_impact`. Nunca faça merge de um PR autorado por um agente.

## Regras de segurança

Não contorne permissões, não trate output de IA como autoritativo sem revisão, não redefina o escopo do projeto silenciosamente, e não enfraqueça o fluxo de documentação-primeiro.
