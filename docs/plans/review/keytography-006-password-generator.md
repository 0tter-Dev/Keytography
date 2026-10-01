---
id: keytography-006
status: review
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 6
depends_on: [keytography-005]
authorized_capabilities:
  - docs/capabilities/password-generation/README.md
  - docs/capabilities/password-evaluation/README.md
decision_records: []
validation: []
documentation_updates: []
---

# Gerador de senha

## Objective

Implementar o gerador de senhas fortes configurável, com exigência de força mínima obrigatória validada pelo motor de avaliação.

## Context

`docs/capabilities/password-generation/README.md` define os parâmetros iniciais e a regra de força mínima. Depende de `keytography-005` para o motor de avaliação existir.

## Scope

- Endpoint/serviço de geração de senha com parâmetros configuráveis: tamanho, uso de símbolos, exclusão de caracteres ambíguos.
- Integração com o motor de avaliação (`keytography-005`): toda senha gerada é avaliada antes de ser retornada; se não atingir a força mínima configurada, o gerador tenta novamente (com um limite razoável de tentativas) até atingir o mínimo ou retornar um erro claro se os parâmetros tornarem isso impossível (ex.: tamanho mínimo incompatível com a força exigida).
- Uso de um gerador de números aleatórios criptograficamente seguro (`RandomNumberGenerator` do .NET), não um gerador pseudo-aleatório comum.

## Out Of Scope

- Novos critérios de avaliação (já cobertos por `keytography-005`).
- Parâmetros de geração além dos três iniciais listados (podem ser adicionados depois).

## Approval

Aprovado pelo usuário em 2026-10-01, ao pedir explicitamente para prosseguir com o próximo passo do `ROADMAP.md` (este plano). Este plano não toca criptografia, autenticação, ou controle de acesso por role (gera senhas candidatas via `RandomNumberGenerator` e as avalia com o motor já existente de `keytography-005`, sem persistir nada no cofre) — não se enquadra na regra de `AGENTS.md` que exige aprovação humana separada para mudanças de criptografia/auth/roles, então nenhuma pergunta adicional foi necessária além da ativação do plano.

## Acceptance Criteria

- `POST /passwords/generate` com parâmetros válidos retorna uma senha que, avaliada pelo motor de avaliação, atinge pelo menos a nota mínima configurada.
- Solicitar exclusão de caracteres ambíguos garante que a senha gerada não contém nenhum caractere da lista de ambíguos (ex.: `0`, `O`, `l`, `1`).
- Solicitar parâmetros que tornam a força mínima inatingível (ex.: tamanho muito curto) retorna um erro claro em vez de uma senha fraca ou um loop infinito.
- Gerar a mesma requisição de parâmetros múltiplas vezes retorna senhas diferentes entre si (confirma uso de fonte aleatória, não determinística).
- O job `build` do CI permanece verde com os testes deste plano incluídos, sem exigir nenhuma mudança no workflow.

## Validation

- `dotnet test` cobrindo geração com parâmetros variados, exclusão de caracteres ambíguos, o caso de força mínima inatingível, e verificação estatística básica de não-repetição entre gerações.
- Confirmar no GitHub Actions que o job `build` passou no PR desta entrega.

## Documentation Updates

- `docs/capabilities/password-generation/README.md`: `Current Status` para `implemented`.
- `docs/STATUS.md`: refletir o novo status; capability dashboard completo (todas as 4 capabilities `implemented`).
- `docs/capabilities/password-evaluation/README.md`: constatação deliberada de que **não** precisa de atualização — seu código (critérios, motor de agregação, endpoints) não mudou nesta entrega; o gerador apenas consome `PasswordEvaluator.Evaluate` já existente, e a relação "is used by password-generation" já estava documentada desde `keytography-005`.

## Outcome
