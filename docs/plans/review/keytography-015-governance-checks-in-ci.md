---
id: keytography-015
status: review
type: chore
requires_pull_request: true
expected_version_impact: none
actual_version_impact: pending
priority: high
sequence: 15
depends_on: []
authorized_capabilities: []
decision_records: []
validation: []
documentation_updates: []
---

# Verificação automática de governança documental e de convenções de PR

## Objective

Transformar em checagens automáticas, executadas no CI e localmente, as regras de governança que hoje só são verificadas à mão (ou descobertas depois do fato): consistência dos planos, links internos, concordância entre dashboards e planos, cobertura do `README.md` da raiz nos planos, e nomes de branches e PRs.

## Context

Quase todos os desvios encontrados até aqui nasceram de verificação manual: pasta do plano diferente do campo `status` (já se repetiu entre entregas), links internos quebrados (os 101 links de uma entrega foram conferidos à mão), `README.md` da raiz congelado no estágio de kickoff porque nenhum plano o listava, e agora uma convenção nova de nomes de branches e PRs (`<type>/<id>-<slug>`, ver [DEVELOPMENT-GUIDE.md](../../DEVELOPMENT-GUIDE.md#nomes-de-branches-prs-e-planos)). Cada regra já existe em texto; falta a guarda que impede a regressão, no mesmo espírito do teste de drift do contrato OpenAPI ([ADR-0004](../../decisions/ADR-0004-versioned-openapi-contract.md)).

Decisão de forma: a verificação mora na suíte de testes .NET existente (`tests/Keytography.Tests`), como o teste de drift. Assim ela roda em `dotnet test` localmente e no job `build` do CI, que já é o check obrigatório da branch protegida, sem toolchain nem dependência nova. A alternativa (um script Node em um job novo) foi descartada porque o job novo não seria obrigatório sem ajuste manual da branch protection e acrescentaria uma segunda forma de rodar verificações. Esta decisão pode ser revista na aprovação do plano.

## Scope

- **Verificador de documentação** em `tests/Keytography.Tests` (por exemplo `DocumentationGovernance/`), escrito como uma classe que recebe a raiz do repositório e devolve a lista de violações, para ser testável com árvores de arquivos sintéticas. Mensagens de erro dizem qual arquivo, qual regra e como corrigir. Regras:
  1. **Planos:** todo arquivo em `docs/plans/{backlog,active,review,completed}/` tem o front matter completo (`id`, `status`, `type`, `requires_pull_request`, `expected_version_impact`, `actual_version_impact`, `priority`, `sequence`, `depends_on`, `authorized_capabilities`, `decision_records`, `validation`, `documentation_updates`); `status` é igual ao nome da pasta; `id` é o prefixo do nome do arquivo; `type` é um tipo de Conventional Commits válido; o corpo contém as seções `Objective`, `Context`, `Scope`, `Out Of Scope`, `Acceptance Criteria`, `Validation`, `Documentation Updates` e `Outcome`; `depends_on` só referencia ids existentes.
  2. **Ciclo de vida:** plano em `completed/` tem `Outcome` não vazio e `actual_version_impact` diferente de `pending`; plano em `active/` ou `review/` tem `Approval` não vazio; plano em `review/` e `active/` mantém `actual_version_impact: pending`.
  3. **Dashboards:** todo plano em `backlog/`, `active/` ou `review/` aparece em `docs/ROADMAP.md`; todo plano em `completed/` aparece em `docs/STATUS.md`; toda capability em `docs/capabilities/` aparece no Capability Dashboard de `STATUS.md` com o mesmo status do seu `Current Status`.
  4. **Links internos:** todo link relativo em `README.md`, `AGENTS.md` e `docs/**/*.md` aponta para um arquivo existente, e links com âncora apontam para um título existente no destino (regra de geração de âncoras do GitHub, coberta por testes próprios, incluindo acentos).
  5. **`README.md` da raiz nos planos:** todo plano `feat` ainda não concluído (em `backlog/`, `active/` ou `review/`) menciona o `README.md` da raiz em `Documentation Updates` (atualização ou constatação deliberada de que não muda), conforme a [definição de pronto](../../DOCUMENTATION-GUIDE.md#definição-de-pronto-para-a-documentação-de-uma-entrega). Planos concluídos antes desta regra ficam isentos.
  6. **Resíduos de template:** nenhum `{{...}}` esquecido em arquivos de `docs/`, `README.md` e `AGENTS.md`.
- **Verificação de nomes no CI** (passo condicional a `pull_request` no job `build`, ou job leve equivalente): o nome da branch segue `<type>/<slug>` com `type` válido (exceções explícitas e documentadas, como branches de `dependabot/`); quando a branch tem a forma `<type>/<id>-<slug>`, o título do PR é `<type>: <resumo> (<id>)` e o `type` do título coincide com o da branch.
- **Ajuste dos planos em `backlog/`** para atender à regra 5: os planos `keytography-008` a `013` ganham a linha do `README.md` da raiz em `Documentation Updates` (o `014` já a tem), com o texto específico de cada um (por exemplo, o que passa a constar no Quick Start ou no Current Scope quando a tela existir).
- **Documentação do próprio verificador:** como rodar localmente, o que cada regra protege, e como proceder quando uma regra precisar de exceção legítima (nunca silenciando a regra: exceção explícita, documentada e revisada).

## Out Of Scope

- Verificar semanticamente se o texto do `README.md` ou de uma capability descreve o comportamento real (continua sendo papel do `project-audit`); as regras acima só garantem que o plano considerou o README.
- Hooks do Claude Code, memória persistente e uso de subagentes (itens seguintes da análise de otimização de processo, tratados em planos ou ajustes próprios).
- Marcar o job do CI como obrigatório na configuração de branch protection (ação do administrador do repositório; o job `build`, que já é obrigatório, passa a incluir as verificações).
- Mudanças em skills compartilhadas, que ficam fora do repositório.
- Qualquer verificação de código de aplicação (backend ou frontend), cobertas pelos testes e pelo CI já existentes.

## Approval

Aprovado pelo usuário em 2026-10-03, ao responder "Sim, vamos definir as regras do `015` antes de continuar para o `008`", depois de ter o plano (revisado no PR #18), sua decisão de forma (verificador na suíte .NET existente) e a recomendação de ativá-lo antes do `008` apresentados. Ativação fora da ordem de `sequence`, já que o `008` também é elegível: aprovada explicitamente pelo mesmo motivo. Este plano não toca criptografia, autenticação nem controle de acesso por role, e não altera contratos públicos da API; adiciona apenas testes, um passo de CI e documentação.

**Esclarecimentos de implementação (2026-10-03)** — ajustes de meio, sem alterar o objetivo nem os critérios de aceite:

- **Primeira execução no repositório real achou desvios de verdade**, como pretendido: o link do `ROADMAP.md` para este plano ainda apontava para `backlog/` depois da ativação, e os planos `008` a `013` não citavam o `README.md` da raiz. Ambos foram corrigidos nesta entrega (o segundo está em `Scope`).
- **Lacuna adicional corrigida nos planos:** o `012` introduz `POST /auth/change-password`, o que altera o contrato da API; faltavam a linha em `Documentation Updates` e o critério de aceite para regenerar `docs/reference/openapi.json` e `web/src/api/schema.d.ts` (obrigação do ADR-0004). Foram acrescentados. Hoje nenhuma regra automática cobre isso nos planos; o teste de drift do backend e o CI do `web` pegam o esquecimento na implementação.
- **Regra 6 ignora código:** `{{...}}` dentro de código inline e de blocos de código não conta como resíduo de template (`style={{...}}` aparece legitimamente em `web-frontend-conventions.md`).
- **Identificador de plano na verificação de nomes:** só ids no formato `keytography-NNN` ativam a exigência de `(<id>)` no título; slugs de trabalho sem plano nunca começam assim. Outros projetos que reaproveitem o verificador ajustam o prefixo em `BranchNaming.cs`.
- **Execução no CI:** o passo de nomes é o próprio teste `BranchNamingTests`, alimentado por variáveis de ambiente no passo `Test` do job `build`, e o gatilho `pull_request` ganhou o tipo `edited` para reexecutar quando o título muda.
- **`README.md` da raiz:** constatação deliberada de que não precisa mudar — esta entrega não altera o que o projeto roda, oferece ou usa, nem o Quick Start, o Current Scope ou a Stack.
- **Capabilities:** `authorized_capabilities` está vazio e nenhuma capability teve comportamento alterado.

## Acceptance Criteria

- `dotnet test` roda o verificador contra o repositório real e passa; cada uma das seis regras de documentação tem um teste com árvore sintética que viola a regra e falha com mensagem que cita o arquivo e a correção (verificação por mutação: o teste prova que a regra detecta o erro, não só que o repositório atual está limpo).
- O gerador de âncoras tem testes cobrindo acentos, pontuação e títulos repetidos, e todos os links com âncora do repositório atual resolvem.
- A verificação de nomes rejeita, em teste ou execução de demonstração documentada, uma branch fora do padrão e um título de PR que não casa com a branch; aceita `chore/close-keytography-015`, `feat/keytography-008-web-authentication-ui` e `docs/branch-and-pr-naming-convention`.
- Os planos `keytography-008` a `013` mencionam o `README.md` da raiz em `Documentation Updates`, e a regra 5 passa sobre eles.
- O PR desta entrega prova o funcionamento no CI: o job `build` executa as verificações, e a documentação descreve como rodá-las localmente e como tratar uma exceção.
- O `README.md` da raiz e os guias refletem o estado real após a entrega, ou o plano registra, em `Documentation Updates`, que o `README.md` não precisa mudar.

## Validation

- `dotnet build` e `dotnet test` (Debug e Release) localmente, com todas as suítes existentes ainda passando.
- Mutação manual: remover um link, trocar o `status` de um plano, apagar uma linha do `ROADMAP.md` e confirmar que o verificador falha com mensagem útil em cada caso; restaurar em seguida.
- CI do PR passando; confirmar no log do job `build` que as verificações rodaram.

## Documentation Updates

- `docs/DOCUMENTATION-GUIDE.md`: descrever o verificador, as regras e o procedimento de exceção; apontar a regra de documentação que cada uma protege.
- `docs/DEVELOPMENT-GUIDE.md`: registrar que `dotnet test` também valida a governança documental e as convenções de nomes.
- `docs/guides/running-locally.md`: como rodar só as verificações de governança (`dotnet test --filter`).
- `docs/plans/README.md`: referenciar as regras de front matter e de ciclo de vida que passam a ser verificadas.
- `docs/plans/backlog/keytography-008` a `013`: linha do `README.md` da raiz em `Documentation Updates` (ver `Scope`).
- `README.md` (raiz): constatação deliberada — não muda o que o projeto roda, oferece ou usa; registrar isso aqui na entrega.
- `docs/STATUS.md` e `docs/ROADMAP.md`: refletir o novo status.

## Outcome
