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
  - medidor com `role="meter"` (`aria-valuemin` 0, `aria-valuemax` 100, `aria-valuenow` e `aria-valuetext` com a faixa e a nota, por exemplo "Forte, 82 de 100"), barra com cor da faixa **e** o nome da faixa em texto;
  - lista de critérios com rótulo legível em português (`length`, `entropy`, `reuse` e `complexity` mapeados em `pt-BR.json`) e o estado "atende" ou "não atende" em texto e ícone, não só em cor; a nota do critério pode aparecer ao lado;
  - critério com chave desconhecida (a lista de critérios é aberta) aparece com um rótulo genérico ("Critério adicional"), sem exibir a chave técnica nem quebrar a tela.
- Estados: nota ausente (`passwordScore` nulo) mostra "Ainda não avaliada" (sem medidor); nota presente com detalhamento nulo mostra só o medidor.
- Valores fora de 0 a 100 ou não numéricos são limitados à faixa para exibição (o medidor nunca extrapola a barra).
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

Ajustes de meio durante a implementação, sem reescrever o `Approval` (nenhum muda escopo, contrato ou política):

- **Arredondamento antes da faixa** (decorrência da invariante "a informação não depende só de cor" e do critério de que o número e a faixa nunca discordem; decidido na implementação em 2026-10-23, sem consulta por ser detalhe de apresentação dentro do aprovado): a nota é arredondada para inteiro e limitada a 0–100 antes de definir a faixa e de ser exibida (39,6 vira 40 e "Média"); as fronteiras 39/40 e 69/70 valem para o inteiro exibido.
- **Token de cor `warning`** (detalhe de implementação do plano aprovado, 2026-10-23): o tema só tinha `success` e `destructive`; a faixa "média" ganhou `--warning` nos valores comuns do tema (`styles/index.css`), usado como `bg-warning`. A cor só reforça o texto da faixa, então o contraste do token não carrega informação; a conferência do contraste da barra nos cinco temas fica para o `keytography-014` (revisão de contraste).
- **Documentos além dos listados em `Documentation Updates`** (lacunas do plano, corrigidas na entrega): `docs/guides/web-frontend-conventions.md` (lista de utilitários semânticos de cor ganhou `bg-success` e `bg-warning`) e o `README.md` raiz, cujo Quick Start ainda dizia que a tela de cofre estava em desenvolvimento desde o `009` (corrigido junto com o Current Scope).

## Acceptance Criteria

- O detalhe de uma entrada com senha fraca mostra a faixa "fraca", a nota e quais critérios não atendem; com senha forte, a faixa "forte" e a nota alta.
- Logo depois de criar ou editar uma entrada, o detalhe mostra a nota da senha salva (nunca a de antes da edição).
- Os rótulos de cada critério são legíveis em português, não as chaves técnicas da API; um critério desconhecido aparece com o rótulo genérico, sem quebrar.
- Entrada sem nota mostra "Ainda não avaliada", nunca "0" nem "forte".
- O medidor é acessível (`role="meter"` com valor e texto) e a faixa e o estado de cada critério aparecem em texto, não só em cor.
- Os formulários de criação e edição não mostram medidor nem nota.

## Validation

- Testes de componente cobrindo o medidor e a lista de critérios com notas nas três faixas, nas fronteiras (0, 39, 40, 69, 70, 100), com os quatro critérios, com um critério desconhecido e com nota ou detalhamento nulos.
- Teste de fluxo: criar e editar uma entrada e ver, no detalhe, a nota devolvida pela API depois de salvar (e não a de antes).
- Verificação manual criando entradas com senhas fracas e fortes contra a API local, conferindo faixa, critérios e acessibilidade básica (leitor de tela ou árvore de acessibilidade).
- CI permanece verde.

## Invariants And Failure Modes

Revisada contra a API real e aprovada pelo usuário em 2026-10-23 (revisão do plano); a aprovação formal do plano acontece na ativação.

Invariantes (devem valer sempre):

- **A API é a fonte da verdade:** o frontend não calcula nem estima nota; as faixas (fraca, média, forte) são só apresentação sobre o número devolvido.
- **Nunca "forte" sem nota recebida:** nota nula é "Ainda não avaliada"; falha ao carregar o detalhe segue a tela de erro do `keytography-009` (sem indicador); nota nula nunca vira 0, fraca nem forte.
- **A nota exibida é a da senha salva:** depois de criar ou editar, o detalhe vem sempre da API (consulta sem cache do `009`), nunca de dado anterior à edição.
- **O componente nunca recebe a senha:** props só de nota e detalhamento; a senha não é copiada para atributos, títulos nem textos de acessibilidade do medidor.
- **Critério desconhecido, detalhamento nulo ou valor fora da faixa não quebram a tela:** rótulo genérico, medidor limitado a 0 a 100 e ausência do bloco que falta.
- **A informação não depende só de cor:** faixa e estado de cada critério em texto e ícone; medidor com `role="meter"`.
- **Fim de sessão ou troca de conta** descarta a nota junto com o detalhe (cache esvaziado pelo `017`/`SessionController`).

## Known Limitations

- **Sem pré-visualização:** a força só aparece depois de salvar, no detalhe (decisão do usuário em 2026-10-23: a API é a fonte única da verdade e não oferece avaliação sem persistência).
- **A nota é a do último salvamento:** o critério de reuso olha as outras contas no momento em que a entrada foi salva e não é recalculado quando outras contas mudam; um critério novo só vale para entradas antigas depois do recálculo retroativo do `Admin`.
- **As faixas (40 e 70) são apresentação do cliente:** se o backend mudar a escala, as faixas precisam ser revistas junto.
- A nota e o detalhamento só existem no detalhe; lista, lixeira e histórico não os mostram.
- **A faixa é a da média da API e pode esconder um critério reprovado** (observado na verificação manual de 2026-10-23, **decisão do usuário pendente**): `abc` recebe 59 ("Média", com tamanho e variedade reprovados e reuso e previsibilidade com 100) e uma senha forte repetida de outra entrada recebe 75 ("Forte", com "Senha não reutilizada: Não atende"). O frontend não recalcula (invariante); os critérios reprovados aparecem logo abaixo, em texto.

## Verification Matrix

Testes: `password-strength.test.tsx` (componente e funções puras) e `vault-strength.test.tsx` (fluxos no detalhe). 23 mutações manuais, todas mortas pelos testes de `features/vault` (a mutação que o teste observou falhar vem na terceira coluna).

| Invariante ou critério | Teste | Prova de que o teste falha sem o comportamento |
| --- | --- | --- |
| Nota nula é "Ainda não avaliada", nunca fraca nem forte | componente (`null`, `undefined`, `NaN`) e detalhe com `passwordScore` nulo | mutação: nota ausente vira 0 |
| Faixas e fronteiras (0, 39, 40, 69, 70, 100) | componente por nota (resumo, nome acessível e valor do medidor) e funções puras | mutações: `>` no lugar de `>=` nas duas fronteiras; fronteiras 71 e 41 |
| Arredondamento antes da faixa; valor fora de 0 a 100 limitado | componente com 39,6, -5 e 150 | mutações: sem arredondar; sem limitar |
| Rótulos legíveis; critério desconhecido com rótulo genérico | componente com os quatro critérios, uma chave nova e nota do critério fora da faixa | mutações: exibir a chave técnica; todo critério conhecido; nota do critério sem limite |
| Só `passed` verdadeiro conta como "atende" | componente com `passed` não booleano | mutação: conversão por verdade (`Boolean`) |
| A nota exibida é a da senha salva | fluxo: editar, salvar e ver o detalhe com a nota nova; reabrir o detalhe e ver a nota atual | mutação: detalhe com `gcTime`/`staleTime` de 60 s |
| O componente não recebe nem exibe a senha | HTML da seção de força sem a senha nem o login; as props só têm nota e detalhamento (garantia por tipo) | sem mutação possível sem mudar a assinatura do componente (equivalente por construção) |
| Acessibilidade: `role="meter"` com valor e texto; estado em texto | componente por papel e nome; barra com cor e largura da faixa | mutações: sem `role`; sem `aria-valuetext`; sem `aria-valuenow`; largura fixa; cores trocadas; sem resumo em texto; sem estado "atende"/"não atende" |
| Formulários sem medidor | formulários de criar e editar | mutação: componente renderizado no formulário |
| Detalhe sem o componente e detalhamento nulo | detalhe (forte, fraca) e componente com `detail` nulo | mutações: detalhe sem o componente; `Object.entries(null)` |
| Sem chamadas além do detalhe; erro de carga sem indicador | fluxo com a lista de chamadas e detalhe com 500 | coberto pela mesma suíte (a ausência de chamada é uma asserção direta) |
| Fim de sessão descarta a nota | fluxo com `signOut` na tela de detalhe | comportamento herdado do `SessionController`/`RequireAuth` do `017` (a asserção falha se o detalhe sobreviver) |

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar o indicador de força no detalhe da entrada, as faixas e as limitações (sem pré-visualização, nota do último salvamento).
- `docs/guides/running-locally.md`: acrescentar ao roteiro "Verificando o cofre na interface web" a conferência da força com senha fraca e forte.
- `README.md` (raiz): Current Scope passa a listar o indicador de força de senha na interface web; o Quick Start também é corrigido (dizia que as telas de cofre ainda estavam em desenvolvimento desde o `009`); Stack: constatação deliberada de que não muda.
- `docs/guides/web-frontend-conventions.md`: utilitários de cor `bg-success` e `bg-warning` (lacuna do plano, ver `Implementation Clarifications`).
- `docs/STATUS.md`: refletir o novo status.

## Outcome
