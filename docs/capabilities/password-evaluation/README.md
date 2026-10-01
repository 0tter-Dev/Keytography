# Avaliação de Senha

## Purpose

Avaliar a força de uma senha através de um conjunto modular de critérios, produzindo tanto um feedback detalhado por critério quanto uma nota média.

## Current Status

`implemented` — motor de avaliação com os quatro critérios iniciais, recálculo automático em criação/edição, e recálculo retroativo sob demanda implementados em `keytography-005`.

## Key Rules

- Cada critério é avaliado separadamente (mini-diagnóstico, nota 0-100 + aprovado/reprovado); os resultados individuais compõem uma nota média final. Novos critérios são adicionados implementando `IPasswordEvaluationCriterion` e registrando a implementação na injeção de dependência, sem alterar os critérios já existentes nem o motor de agregação.
- Critérios iniciais implementados: **comprimento** (satura em 16+ caracteres), **entropia** (estimativa por tamanho do alfabeto usado × comprimento, satura em 80 bits), **reuso/repetição** (reprova se a senha já apareceu no histórico da mesma conta ou em qualquer outra conta, atual ou histórica, do mesmo usuário), e **complexidade/previsibilidade** (penaliza sequências de caracteres repetidos, sequências crescentes/decrescentes, e padrões de ano de 4 dígitos). A lista de critérios é aberta — novos critérios podem ser adicionados conforme o sistema evolui.
- A nota é recalculada automaticamente ao criar (`POST /vault/entries`) ou editar (`PUT /vault/entries/{id}`) uma entrada de cofre — ver [vault-entries](../vault-entries/README.md).
- O recálculo retroativo (quando um novo critério é registrado no sistema) é disparado sob demanda via `POST /vault/password-evaluation/recalculate`, restrito ao `Admin`. Decifra a DEK de todos os usuários pela chave de recuperação em lote e reavalia todas as entradas de todos os usuários, mesmo os que não estão logados — ver [ADR-0003](../../decisions/ADR-0003-retroactive-evaluation-bulk-recovery-decrypt.md).

## Main Relationships

- depends on [vault-entries](../vault-entries/README.md): lê a senha atual e o histórico de uma entrada de cofre para avaliar.
- is used by [password-generation](../password-generation/README.md): a nota média produzida aqui é o critério de corte para a força mínima exigida na geração.

## Cross-Cutting Decisions

- [ADR-0001: Criptografia do cofre com chave dupla e recuperação de acesso](../../decisions/ADR-0001-vault-encryption-and-recovery.md) — define o esquema de DEK que precisa ser desfeito para acessar a senha em texto puro a avaliar.
- [ADR-0003: Recálculo retroativo de avaliação de senha via decifragem em lote pela chave de recuperação](../../decisions/ADR-0003-retroactive-evaluation-bulk-recovery-decrypt.md) — define como o recálculo retroativo acessa a senha de usuários que não estão logados no momento.
