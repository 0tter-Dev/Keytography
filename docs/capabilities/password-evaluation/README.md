# Avaliação de Senha

## Purpose

Avaliar a força de uma senha através de um conjunto modular de critérios, produzindo tanto um feedback detalhado por critério quanto uma nota média.

## Current Status

`planned`

## Key Rules

- Cada critério é avaliado separadamente (mini-diagnóstico); os resultados individuais compõem uma nota média final.
- Critérios iniciais cogitados: comprimento, entropia, reuso/repetição (incluindo contra o histórico de senhas em [vault-entries](../vault-entries/README.md)), e complexidade/previsibilidade (caracteres repetidos, padrões semanticamente óbvios como nomes ou datas). A lista de critérios é aberta — novos critérios podem ser adicionados conforme o sistema evolui.
- A nota é recalculada sempre que uma conta/senha é cadastrada ou editada.
- Quando um novo critério é incluído no sistema, a nota é recalculada retroativamente para todas as contas de todos os usuários, não só para novos cadastros.

## Main Relationships

- depends on [vault-entries](../vault-entries/README.md): lê a senha atual e o histórico de uma entrada de cofre para avaliar.
- is used by [password-generation](../password-generation/README.md): a nota média produzida aqui é o critério de corte para a força mínima exigida na geração.
