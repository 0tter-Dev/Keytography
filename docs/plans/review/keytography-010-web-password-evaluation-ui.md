---
id: keytography-010
status: review
type: feat
requires_pull_request: true
expected_version_impact: patch
actual_version_impact: pending
priority: medium
sequence: 10
depends_on: [keytography-009]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records:
  - docs/decisions/ADR-0007-web-client-secret-handling.md
validation: []
documentation_updates: []
---

# UI de avaliação de força de senha

## Objective

Exibir, na tela de detalhe de uma entrada de cofre, a nota de força e o detalhamento por critério que a API já calcula e retorna — sem nenhuma lógica de avaliação nova no frontend.

## Context

`vault-entries` já retorna `passwordScore` e `passwordScoreDetail` (nota 0-100 + aprovado/reprovado por critério) no detalhe de uma entrada, recalculados automaticamente a cada criação/edição (`keytography-005`). Este plano é puramente de superfície.

**Revisão do plano (2026-10-23, contra a API real, aprovada pelo usuário antes da ativação).** A API **não** tem um endpoint que avalie uma senha digitada: a nota só é calculada ao criar ou editar uma entrada, e `POST /vault/password-evaluation/recalculate` é restrito ao `Admin` e reavalia tudo. Por isso o plano original ("atualizado em tempo real conforme o usuário digita") não é viável sem backend novo. Decisões do usuário nesta revisão:

- a nota é mostrada **só onde a API a entrega** (o detalhe da entrada, que é a tela aberta logo depois de criar ou editar), sem pré-visualização nos formulários; um endpoint de avaliação sem persistência ou uma avaliação local no frontend ficam fora (o primeiro seria mudança de backend e de contrato público, e exigiria um plano próprio; a segunda duplicaria a lógica e não calcularia o critério de reuso, que depende das demais contas);
- faixas de apresentação: **0 a 39 fraca, 40 a 69 média, 70 a 100 forte** (alinhadas ao padrão 70 do gerador), sempre com texto, nunca só com cor;
- invariantes adicionais para nota ausente, critério desconhecido e valores fora da faixa (seção `Invariants And Failure Modes`).

## Scope

- Componente de força (`PasswordStrength`), usado no detalhe da entrada (`EntryDetailPage`), que recebe **apenas** a nota e o detalhamento (nunca a senha):
  - medidor com `role="meter"` (`aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow` e `aria-valuetext` com a faixa e a nota, por exemplo "Forte, 82 de 100"), barra com cor da faixa **e** o nome da faixa em texto (o resumo visível fica oculto para o leitor de tela, que já tem o `aria-valuetext`);
  - faixa pela nota (0–39 fraca, 40–69 média, 70–100 forte) **rebaixada pelos critérios** (ver `Implementation Clarifications`): metade ou mais dos critérios reprovados é fraca, e forte exige todos atendidos; o resumo "Critérios atendidos: N de M" acompanha a lista;
  - lista de critérios com rótulo legível em português (`length`, `entropy`, `reuse` e `complexity` mapeados em `pt-BR.json`) e o estado "atende" ou "não atende" em texto e ícone, não só em cor; a nota do critério pode aparecer ao lado;
  - critério com chave desconhecida (a lista de critérios é aberta) aparece com um rótulo genérico ("Critério adicional"), sem exibir a chave técnica nem quebrar a tela.
- Estados: nota ausente (`passwordScore` nulo) mostra "Ainda não avaliada" (sem medidor); nota presente com detalhamento nulo mostra só o medidor.
- Dados estranhos não quebram a tela: uma nota fora de 0 a 100 é limitada; uma nota que não é número finito conta como ausente; entradas de critério que não são objetos (ou um detalhamento que não é um mapa) são ignoradas.
- Nenhuma chamada nova à API: o componente lê o que o detalhe já traz (consulta de `gcTime: 0` do `keytography-009`).

## Out Of Scope

- Qualquer novo critério de avaliação ou mudança na lógica de cálculo (já implementada em `keytography-005`).
- Pré-visualização da força durante a digitação nos formulários, endpoint de avaliação sem persistência, ou avaliação no frontend.
- Nota na lista do cofre, na lixeira ou no histórico (a API só devolve a nota no detalhe).
- Recálculo retroativo (restrito ao `Admin`).
- Geração de senha (`keytography-011`), que reaproveita o componente.

## Approval

Ativado e aprovado pelo usuário em 2026-10-23, ao pedir explicitamente a ativação e a implementação deste plano (o próximo da fila do `ROADMAP.md`), depois da revisão registrada no PR #36. **A seção `Invariants And Failure Modes` (com `Known Limitations` e `Verification Matrix`) foi revisada contra a API real e aprovada pelo usuário em 2026-10-23 antes da ativação**, com as decisões: nota mostrada só no detalhe (sem pré-visualização nos formulários, sem endpoint novo nem avaliação no frontend), faixas 0–39 fraca, 40–69 média e 70–100 forte sempre com texto, e invariantes de nota nula, critério desconhecido e valor fora da faixa. Este plano não altera API, banco nem contrato (`expected_version_impact: patch`), não toca em criptografia, autenticação nem controle de acesso, e a única capability autorizada é `web-interface`.

## Implementation Clarifications

Ajustes de meio durante a implementação e na 1ª `project-audit`, sem reescrever o `Approval`. **Todos foram vistos e aprovados pelo usuário em 2026-10-23, ao responder à 1ª auditoria** ("ajustar todos estes pontos [...] seguindo suas recomendações para cada caso") com as recomendações apresentadas; a forma de cada aprovação vem em cada item.

- **Faixa rebaixada pelos critérios** (decisão do usuário, recomendação (b) da 1ª auditoria; muda a regra de faixa que constava no `Approval` — 0–39, 40–69 e 70–100 só pela nota —, sem mudar escopo, API nem contrato): a média da API esconde reprovações (a verificação manual e o cálculo do auditor mostraram `abc` com 59, `password` com 74, `Password1` com 81 e uma senha forte repetida com 75). A faixa parte da nota e é rebaixada pelos critérios: **metade ou mais dos critérios reprovados é fraca; forte exige todos atendidos; sem detalhamento vale só a nota; os critérios nunca elevam a faixa**. Decorrências de apresentação: o resumo "Critérios atendidos: N de M" (explica o rebaixamento) e o resumo da faixa e da nota oculto para o leitor de tela (o `aria-valuetext` já os anuncia).
- **`Verification Matrix`: duas linhas trocaram de prova** (aprovado pelo usuário em 2026-10-23; as demais linhas ganharam testes e mutações): "o componente não recebe a senha" não tem mutação possível sem mudar a assinatura (as props são só nota e detalhamento), então a prova é por tipo mais o teste de que a seção não contém a senha; "fim de sessão descarta a nota" é comportamento do `SessionController` e do `RequireAuth` do `017`, provado pelos testes de `SessionController.test.tsx` ("esvazia o cache de consultas no logout", "esvazia o cache quando a sessão expira (...)" e "esvazia o cache quando a conta muda (...)") e de `auth-flows.test.tsx` ("troca de conta entre abas"), que o auditor confirmou removendo `queryClient.clear()` e `resetQueries()` do `SessionController`; o teste desta entrega só prova que a nota sai da tela.
- **Largura da barra com `style`** (exceção registrada no guia de convenções, aprovada em 2026-10-23, recomendação da 1ª auditoria): a largura em porcentagem não se expressa em classes estáticas; `docs/guides/web-frontend-conventions.md`, regra 3, passou a listá-la como a única exceção de geometria dinâmica, além do `sonner`.
- **Dados estranhos** (aprovado em 2026-10-23): um detalhamento que não é um mapa, ou uma entrada de critério que não é um objeto, é ignorado (antes um critério `null` derrubava a tela); uma nota que não é número finito conta como ausente.
- **Arredondamento antes da faixa** (decorrência da invariante "a informação não depende só de cor" e do critério de que o número e a faixa nunca discordem; confirmado em 2026-10-23): a nota é arredondada para inteiro e limitada a 0–100 antes de definir a faixa e de ser exibida (39,6 vira 40 e "Média").
- **Token de cor `warning`** (detalhe de implementação, confirmado em 2026-10-23): o tema só tinha `success` e `destructive`; a faixa "média" ganhou `--warning` nos valores comuns do tema (`styles/index.css`), usado como `bg-warning`. O contraste foi medido na 1ª auditoria e fica registrado em `Known Limitations`; a correção nos temas claros fica para o `keytography-014`.
- **Documentos além dos listados em `Documentation Updates`** (lacunas do plano, confirmadas em 2026-10-23): `docs/guides/web-frontend-conventions.md`, o `README.md` raiz (o Quick Start ainda dizia que a tela de cofre estava em desenvolvimento desde o `009`), `docs/ROADMAP.md` e `docs/STATUS.md` (a frase sobre os planos em `backlog` e o status do 010).
- **Impacto de versão** (aprovado em 2026-10-23, recomendação da 1ª auditoria): a entrega é um recurso visível novo do cliente web e segue o precedente do `008`, `009` e `017` (`minor`); o `expected_version_impact: patch` do plano fica como foi aprovado e o fechamento registra `actual_version_impact: minor` com essa justificativa.

## Acceptance Criteria

- O detalhe de uma entrada com senha curta e simples (ex.: `abc`, média 59 com tamanho e variedade reprovados) mostra a faixa "fraca", a nota e quais critérios não atendem; uma senha forte repetida de outra entrada (média 75, só o reuso reprova) mostra "média", e só uma senha com todos os critérios atendidos e nota alta mostra "forte".
- Logo depois de criar ou editar uma entrada, o detalhe mostra a nota da senha salva (nunca a de antes da edição).
- Os rótulos de cada critério são legíveis em português, não as chaves técnicas da API; um critério desconhecido aparece com o rótulo genérico, sem quebrar.
- Entrada sem nota mostra "Ainda não avaliada", nunca "0" nem "forte".
- O medidor é acessível (`role="meter"` com valor e texto) e a faixa e o estado de cada critério aparecem em texto, não só em cor.
- Os formulários de criação e edição não mostram medidor nem nota.
- O `README.md` raiz (Quick Start e Current Scope) reflete o que o projeto oferece depois da entrega, e o roteiro de `docs/guides/running-locally.md` reproduz o que a tela mostra com a API real.

## Validation

- Testes de componente cobrindo o medidor e a lista de critérios com notas nas três faixas, nas fronteiras (0, 39, 40, 69, 70, 100), com os quatro critérios, com um critério desconhecido e com nota ou detalhamento nulos.
- Teste de fluxo: criar e editar uma entrada e ver, no detalhe, a nota devolvida pela API depois de salvar (e não a de antes).
- Verificação manual criando entradas com senhas fracas e fortes contra a API local, conferindo faixa, critérios e acessibilidade básica (leitor de tela ou árvore de acessibilidade).
- CI permanece verde.

## Invariants And Failure Modes

Revisada contra a API real e aprovada pelo usuário em 2026-10-23 (revisão do plano); a aprovação formal do plano acontece na ativação.

Invariantes (devem valer sempre):

- **A API é a fonte da verdade:** o frontend não calcula nem estima nota; as faixas (fraca, média, forte) são só apresentação sobre o número e os `passed` devolvidos.
- **"Forte" exige todos os critérios atendidos e metade ou mais reprovados é "fraca":** a média da API esconde reprovações (a senha curta e simples e a forte repetida), então um critério reprovado nunca fica sem efeito na faixa; sem detalhamento, vale só a nota; os critérios nunca elevam a faixa.
- **Nunca "forte" sem nota recebida:** nota nula é "Ainda não avaliada"; falha ao carregar o detalhe segue a tela de erro do `keytography-009` (sem indicador); nota nula nunca vira 0, fraca nem forte.
- **A nota exibida é a da senha salva:** depois de criar ou editar, o detalhe vem sempre da API (consulta sem cache do `009`), nunca de dado anterior à edição.
- **O componente nunca recebe a senha:** props só de nota e detalhamento; a senha não é copiada para atributos, títulos nem textos de acessibilidade do medidor.
- **Critério desconhecido, detalhamento nulo, critério que não é objeto ou valor fora da faixa não quebram a tela:** rótulo genérico, entrada ignorada, medidor limitado a 0 a 100 e ausência do bloco que falta.
- **A informação não depende só de cor:** faixa e estado de cada critério em texto e ícone; medidor com `role="meter"`.
- **Fim de sessão ou troca de conta** descarta a nota junto com o detalhe (cache esvaziado pelo `017`/`SessionController`).

## Known Limitations

- **Sem pré-visualização:** a força só aparece depois de salvar, no detalhe (decisão do usuário em 2026-10-23: a API é a fonte única da verdade e não oferece avaliação sem persistência).
- **A nota é a do último salvamento:** o critério de reuso olha as outras contas no momento em que a entrada foi salva e não é recalculado quando outras contas mudam; um critério novo só vale para entradas antigas depois do recálculo retroativo do `Admin`.
- **As faixas (40 e 70) e o rebaixamento pelos critérios são apresentação do cliente:** se o backend mudar a escala ou os critérios, devem ser revistos junto.
- A nota e o detalhamento só existem no detalhe; lista, lixeira e histórico não os mostram.
- **O número continua sendo a média da API** (aceita pelo usuário em 2026-10-23, resposta à 1ª `project-audit`): a faixa é rebaixada pelos critérios, mas a nota exibida não muda; uma senha forte repetida mostra "Média · 75 de 100" e `password` ou `Password1` ficam com notas acima de 70 (o auditor calculou 74 e 81 pela fórmula dos critérios; são "fortes" só se nenhum critério reprovar). Mudar a agregação (por exemplo, limitar a nota quando tamanho ou variedade reprovam) seria assunto de um plano de backend, com contrato e recálculo retroativo.
- **Contraste da barra nos temas claros:** medido na revisão (razão contra a trilha `muted`): tema claro, fraca 3,22, média 1,49, forte 1,97; claro de alto contraste, 3,52, 1,63 e 2,16; nos temas escuros todas passam de 3,3 (média 7,2 e 10,0). Nos temas claros a barra das faixas média e forte fica abaixo de 3:1; como a informação está sempre em texto, o impacto é visual e a correção fica para a revisão de contraste do `keytography-014`.

## Verification Matrix

Testes: `password-strength.test.tsx` (componente e funções puras) e `vault-strength.test.tsx` (fluxos no detalhe). **49 mutações manuais** (scripts que editam o código, rodam `src/features/vault` e restauram o arquivo): **47 mortas pelos testes** e **2 equivalentes** (as duas últimas linhas abaixo); duas delas (a faixa que "eleva" por critério reprovado e a contagem de atendidos por `!== false`) sobreviveram na 1ª tentativa e ganharam teste.

| Invariante ou critério | Teste | Prova de que o teste falha sem o comportamento (mutação) |
| --- | --- | --- |
| Nota nula ou que não é número é "Ainda não avaliada", nunca fraca nem forte | componente (`null`, `undefined`, `NaN`, texto, objeto) e detalhe com `passwordScore` nulo | nota ausente vira 0 |
| Faixas e fronteiras da nota (0, 39, 40, 69, 70, 100) | componente por nota (resumo, nome acessível e valor do medidor) e funções puras | `>` no lugar de `>=` nas duas fronteiras; limiares 71 e 41 |
| Arredondamento antes da faixa; valor fora de 0 a 100 limitado | componente com 39,6, -5 e 150 | sem arredondar; sem limitar |
| A faixa é rebaixada pelos critérios: metade ou mais reprovados é fraca, forte exige todos atendidos, os critérios nunca elevam | componente (todos atendidos, um reprovado, metade, 1 de 3, um único critério, nota baixa com critérios atendidos e com um reprovado, desconhecido que reprova, detalhamento nulo ou vazio) e detalhe com os valores reais de `abc` (59) e da senha forte repetida (75) | `>` no lugar de `>=` na metade; sem a regra de metade; forte sem exigir todos; qualquer reprovação rebaixa a média; sem o retorno antecipado sem critérios; `=== false` no lugar de `!== true`; faixa sem os critérios (no cálculo e na passagem) |
| Resumo "Critérios atendidos: N de M" | componente com e sem detalhamento; contagem só de `passed: true` | sem o resumo; contagem por `!== false` |
| Rótulos legíveis; critério desconhecido com rótulo genérico; toda chave conhecida traduzida | componente com os quatro critérios, uma chave nova e `__proto__`/`constructor`/`toString` | exibir a chave técnica; todo critério conhecido |
| Só `passed` verdadeiro conta como atende; nota do critério limitada | componente com `passed` não booleano e nota 250 e `NaN` | conversão por verdade (`Boolean`); nota do critério sem limite; nota do critério oculta |
| Dados estranhos não quebram a tela | componente com critério `null`, detalhamento lista, texto, número e booleano | critério nulo não filtrado; lista aceita como detalhamento; guarda de `null` removida |
| A nota exibida é a da senha salva | fluxo: editar, salvar e ver o detalhe com a nota nova; **nem por um instante** a de antes; reabrir o detalhe e ver a nota atual | detalhe com `gcTime` e `staleTime` de 60 s; **só o `gcTime` removido** (mantendo `staleTime: 0`) |
| O componente não recebe nem exibe a senha | HTML da seção de força sem a senha nem o login; as props só têm nota e detalhamento | sem mutação possível sem mudar a assinatura (garantia por tipo; ver `Implementation Clarifications`) |
| Acessibilidade: `role="meter"` com valor, mínimo, máximo, nome e texto; resumo visível sem repetição no leitor | componente por papel e nome | sem `role`; sem `aria-valuetext`, `aria-valuenow`, `aria-valuemin` ou nome; `aria-valuemax` errado; resumo sem `aria-hidden` |
| Estado em texto e ícone; ordem da API; barra com cor e largura da faixa | componente (ícones `lucide-check` e `lucide-x`, ordem, classes e largura) | sem estado em texto; ícones trocados; ordem alfabética; largura fixa; cores trocadas; sem resumo em texto |
| Estrutura: região nomeada, h1 (título) → h2 (força) → h3 (critérios) | componente e detalhe | sem `aria-labelledby`; h2 vira h4; h3 vira h5; sem texto do subtítulo |
| Formulários sem medidor | formulários de criar e editar | componente renderizado no formulário |
| Detalhe sem o componente; detalhamento nulo | detalhe (forte, curta, repetida) e componente com `detail` nulo | detalhe sem o componente |
| Sem chamadas além do detalhe; erro de carga sem indicador | fluxo com a lista de chamadas e detalhe com 500 | asserção direta (a ausência de chamada é a própria prova) |
| Fim de sessão tira a nota da tela | fluxo com `signOut`; o descarte do cache é do `SessionController` | provado pelos testes de `SessionController.test.tsx` e `auth-flows.test.tsx` (ver `Implementation Clarifications`) |

**Mutantes equivalentes conhecidos** (sobrevivem sem indicar lacuna): o `aria-hidden="true"` explícito nos ícones (o `lucide-react` já o aplica por padrão; fica como defesa) e a `key` das linhas de critério (linhas sem estado: a `key` só serve à reconciliação).

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar o indicador de força no detalhe da entrada, as faixas e as limitações (sem pré-visualização, nota do último salvamento).
- `docs/guides/running-locally.md`: acrescentar ao roteiro "Verificando o cofre na interface web" a conferência da força com senha fraca e forte.
- `README.md` (raiz): Current Scope passa a listar o indicador de força de senha na interface web; o Quick Start também é corrigido (dizia que as telas de cofre ainda estavam em desenvolvimento desde o `009`); Stack: constatação deliberada de que não muda.
- `docs/guides/web-frontend-conventions.md`: utilitários de cor `bg-success` e `bg-warning` (lacuna do plano, ver `Implementation Clarifications`).
- `docs/STATUS.md` e `docs/ROADMAP.md`: refletir o novo status (e a frase sobre os planos em `backlog`).

## Outcome
