# Geração de Senha

## Purpose

Gerar senhas fortes configuráveis para uso em novas contas ou trocas de senha.

## Current Status

`planned`

## Key Rules

- Parâmetros configuráveis iniciais: tamanho, uso de símbolos, exclusão de caracteres ambíguos. A lista de parâmetros é aberta a novas opções.
- Toda senha gerada deve atender a uma força mínima obrigatória, usando a nota média produzida por [password-evaluation](../password-evaluation/README.md) como critério de corte — uma senha gerada que não atinja a força mínima não pode ser aceita como está.

## Main Relationships

- depends on [password-evaluation](../password-evaluation/README.md): valida a força mínima antes de uma senha gerada ser aceita.
- is used by [vault-entries](../vault-entries/README.md): senhas geradas aqui podem ser salvas como uma entrada de cofre.
