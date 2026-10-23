---
id: keytography-011
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 11
depends_on: [keytography-009, keytography-010]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records:
  - docs/decisions/ADR-0006-backend-managed-sessions.md
  - docs/decisions/ADR-0007-web-client-secret-handling.md
validation: []
documentation_updates: []
---

# UI de geração de senha

## Objective

Integrar o gerador de senha (`keytography-006`) aos formulários de entrada de cofre, como uma ferramenta acessível no momento de criar/editar uma entrada.

## Context

`POST /passwords/generate` já existe e não muda: aceita tamanho (1 a 128), uso de símbolos, exclusão de caracteres ambíguos e nota mínima (0 a 100; ausente vale 70); retorna a senha gerada com a nota e o detalhamento (mesmo formato exibido pelo `keytography-010`). Exige autenticação, não persiste nada e não acessa a DEK.

**Revisão do plano (2026-10-23, contra a API real, aprovada pelo usuário antes da ativação).** Achados e decisões:

- O contrato OpenAPI declara só o `200`; na prática o endpoint responde **400** (`ValidationProblem` com erros de campo, para tamanho ou nota mínima fora da faixa) e **422** (`{ message }`, não ProblemDetails, quando 50 tentativas não atingem a nota mínima). O cliente trata os dois à mão, com mensagens próprias em `pt-BR` (não o texto do servidor).
- O gerador avalia a senha **sem histórico**, então o critério de reuso sempre aprova: a nota mostrada no modal pode ser maior que a da entrada depois de salva (limitação registrada).
- O [ADR-0007](../../decisions/ADR-0007-web-client-secret-handling.md) manda que mutações devolvam só o `id`; aqui a resposta é a própria senha. **Esta entrega emenda o ADR-0007 com uma exceção explícita** para o gerador: o valor existe só no estado do modal, a mutação usa `gcTime: 0` e `reset()` ao fechar, e nada vai para o cache de consultas (aprovada pelo usuário em 2026-10-23).
- A senha gerada aparece **oculta por padrão** no modal, com revelar e copiar pelas mesmas peças do `009` (`SecretValue` e a limpeza do clipboard do ADR-0007); "Usar esta senha" aplica o valor ao campo e "Cancelar" não altera nada (aprovado em 2026-10-23).
- O modal mostra a nota e o detalhamento reaproveitando o componente do `keytography-010`, por isso `depends_on` passa a incluir o `010` (aprovado em 2026-10-23).
- Sobrescrever uma senha já digitada ocorre só pelo clique explícito em "Usar esta senha", sem diálogo extra de confirmação (aprovado em 2026-10-23); na edição, a senha anterior continua no histórico depois de salvar.

## Scope

- Um botão "Gerar senha" ao lado do campo de senha do formulário de entrada do `keytography-009` (criar e editar) que abre um modal (`components/ui/dialog`) com os parâmetros: tamanho (1 a 128; padrão 20), símbolos (padrão ligado), excluir caracteres ambíguos (padrão desligado) e nota mínima (0 a 100; vazio equivale ao padrão 70 do servidor). Os parâmetros são validados no cliente com os mesmos limites e, se o servidor ainda responder 400, os erros de campo aparecem junto aos campos. Os parâmetros **não** são persistidos (valores padrão a cada abertura).
- Botão "Gerar" (e "Gerar novamente" depois do primeiro resultado) sem fechar o modal; desabilitado enquanto uma geração está em andamento. A senha gerada aparece oculta, com revelar (ocultação automática do `009`), copiar e o `PasswordStrength` do `010` com a nota e o detalhamento devolvidos.
- "Usar esta senha" preenche o campo de senha do formulário (valor, marcado como alterado e validado) e fecha o modal; "Cancelar", Esc e clique fora fecham sem alterar o campo e descartam o valor gerado.
- Tratamento dos erros: **422** com mensagem própria (tente um tamanho maior ou uma nota mínima menor); **400** como erros dos campos; rede, 5xx e demais falhas com mensagem genérica, sem perder os parâmetros escolhidos; **401** que a sessão não explica avisa que nada foi feito, e o que a sessão explica (fim de sessão, troca de conta) fica só com os avisos do `017` (mesma regra `captureSessionContext`/`isUnexplainedUnauthorized` do `009`).
- Camada de API tipada própria do gerador (`features/vault/` ou módulo irmão), no padrão de `vault-api.ts`: a mutação usa `gcTime: 0`, `reset()` ao fechar o modal e ao desmontar, e uma resposta que chega depois de o modal fechar é descartada.
- Emenda ao ADR-0007 (exceção do gerador) e atualização do guia de convenções, na mesma entrega.

## Out Of Scope

- Qualquer mudança na lógica de geração, no endpoint ou no contrato OpenAPI (já implementados em `keytography-006`); declarar os erros 400 e 422 no OpenAPI seria mudança de backend e exigiria plano próprio.
- Novos critérios de avaliação.
- Persistir preferências do gerador ou um histórico de senhas geradas.
- Frases-senha, pronunciáveis ou outros modos de geração.
- Gerador fora do formulário de entrada (por exemplo, uma tela avulsa).

## Approval

## Acceptance Criteria

- Gerar uma senha com parâmetros válidos mostra-a oculta no modal, com a nota e o detalhamento; "Usar esta senha" preenche o campo de senha do formulário e fecha o modal.
- Cancelar, Esc ou clique fora fecham o modal sem alterar o campo de senha, e reabrir o modal não mostra o valor anterior.
- Gerar com parâmetros que tornam a força mínima inatingível (422) mostra uma mensagem específica, com os parâmetros mantidos para ajustar.
- Tamanho ou nota mínima fora da faixa são recusados no cliente e, se o servidor responder 400, os erros aparecem nos campos correspondentes.
- "Gerar novamente" com os mesmos parâmetros produz uma senha diferente, sem fechar o modal, e nunca reaproveita a resposta anterior.
- Copiar a senha gerada segue a política de clipboard do ADR-0007 (limpeza programada).
- Fim de sessão ou troca de conta com o modal aberto descarta o valor gerado e o clipboard pendente.

## Validation

- Testes de componente cobrindo o modal (parâmetros, sucesso, aplicar, cancelar, 422, 400, rede/5xx, 401 com e sem explicação da sessão, gerar de novo, resposta que chega depois de fechar) com a API mockada.
- Teste de que o valor gerado não vai para storage, URL, título nem `console`, e não fica no cache de consultas depois de fechar o modal.
- Verificação manual gerando senhas com parâmetros variados contra a API local, incluindo o caso de força mínima inatingível e o aplicar em criar e em editar.
- `npm run api:types` sem diferença (nenhum endpoint alterado) e CI verde.

## Invariants And Failure Modes

Revisada contra a API real e aprovada pelo usuário em 2026-10-23 (revisão do plano); a aprovação formal do plano acontece na ativação.

Invariantes (devem valer sempre):

- **A senha gerada só existe na memória do modal e, depois de aplicada, do campo do formulário:** nunca em URL, log, storage, título nem cache de consultas; fechar o modal sem aplicar a descarta (a mutação é redefinida).
- **Cancelar não altera o campo de senha** do formulário; aplicar só acontece pelo clique em "Usar esta senha".
- **Uma geração por vez:** o botão fica desabilitado durante a chamada; uma resposta que chega depois de o modal fechar (ou de a tela ser deixada) é descartada e nunca preenche o campo.
- **422 tem mensagem própria; 400 vira erro de campo;** qualquer outra falha mostra mensagem genérica sem perder os parâmetros escolhidos; um 401 sem explicação da sessão avisa que nada foi feito, e um 401 explicado pela sessão (fim, troca de conta) deixa só o aviso do `017`.
- **Gerar de novo produz uma chamada nova e um valor novo:** a aleatoriedade vem do backend; a UI não reaproveita resposta anterior nem cache.
- **Fim de sessão ou troca de conta** com o modal aberto desmonta o modal e descarta o valor; o clipboard pendente é limpo pelo `SessionController` (ADR-0007).
- **A senha gerada é tratada como qualquer segredo do `009`:** oculta por padrão, revelar com ocultação automática em 30 s, valor renderizado como texto e campos sem corretor ortográfico nem preenchimento automático.
- **A nota do modal não é a nota final:** o gerador não avalia reuso; o modal não promete a nota que a entrada terá depois de salva.

## Known Limitations

- A senha gerada trafega pela API (TLS na implantação real; HTTP local em desenvolvimento).
- **O contrato OpenAPI declara só o `200` do gerador:** o cliente trata 400 e 422 à mão; se o backend declarar os erros no futuro, o schema deve ser regenerado e o tratamento revisto.
- **A nota do modal ignora o reuso** (o gerador avalia sem histórico), então pode ser maior que a nota da entrada salva.
- O valor da senha gerada está no atributo `value` do campo oculto do modal (visível em "copiar como HTML" e a extensões do navegador), como a senha revelada do `009`.
- O gerador usa um conjunto fixo de caracteres e não garante uma de cada classe; nota mínima baixa com tamanho curto pode gerar senhas fracas por escolha do usuário.
- Uma resposta de rede perdida deixa o modal em erro genérico; gerar de novo é inofensivo (nada é salvo).

## Verification Matrix

| Invariante ou critério | Teste (a definir na implementação) | Prova de que o teste falha sem o comportamento |
| --- | --- | --- |
| Cancelar, Esc e clique fora não alteram o campo; reabrir não mostra o valor anterior | teste do modal | mutações: aplicar ao abrir; manter o estado ao fechar |
| Aplicar preenche o campo (valor, alterado, validado) e fecha | teste do formulário com o modal | mutação: fechar sem preencher |
| 422 tem mensagem própria e mantém os parâmetros | teste com API 422 | mutação: tratar como erro genérico |
| 400 vira erro de campo; limites validados no cliente | testes com 400 e com valores fora da faixa | mutações: ignorar `fieldErrors`; remover o limite |
| Gerar de novo chama a API outra vez e muda a senha | teste com duas chamadas | mutação: cache da primeira resposta |
| Uma geração por vez; resposta tardia descartada | testes com resposta lenta e modal fechado | mutações: não desabilitar o botão; aplicar a resposta tardia |
| 401 sem explicação avisa; com explicação só o aviso do `017` | testes de `unauthorized` (refresh 503 e 401; troca de conta) | mutações: aviso sempre e nunca; sem comparar `epoch`/`accountVersion` |
| Fim de sessão e troca de conta descartam o valor e o clipboard | teste com `signOut` e troca de conta com o modal aberto | mutação: manter o estado |
| Segredo fora de storage, URL, título, `console` e cache | teste de vazamento (padrão do `vault-secrets`) | mutação: gravar o valor no storage |
| Oculta por padrão, valor como texto, sem corretor | testes por papel e atributos | mutações: campo visível; `dangerouslySetInnerHTML`; remover atributos |
| Nota do modal vem do `PasswordStrength` do `010` | teste com notas e detalhes mockados | mutação: omitir o componente |

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar a ferramenta de geração integrada, as limitações (nota sem reuso, contrato OpenAPI só com o `200`) e a emenda ao ADR-0007.
- `docs/decisions/ADR-0007-web-client-secret-handling.md`: acrescentar a exceção do gerador (resposta com a senha só no estado do modal, `gcTime: 0` e `reset()`), com a data e a forma de aprovação.
- `docs/guides/web-frontend-conventions.md`: seção "Segredos e dados sensíveis" cobre o gerador.
- `docs/guides/running-locally.md`: acrescentar ao roteiro "Verificando o cofre na interface web" a geração, o 422 e o aplicar/cancelar.
- `README.md` (raiz): Current Scope passa a listar o gerador de senhas na interface web; Quick Start e Stack: constatação deliberada de que não mudam.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
