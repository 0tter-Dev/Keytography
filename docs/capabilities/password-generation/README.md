# Geração de Senha

## Purpose

Gerar senhas fortes configuráveis para uso em novas contas ou trocas de senha.

## Current Status

`implemented` — gerador configurável com os três parâmetros iniciais e exigência de força mínima implementados em `keytography-006`.

## Key Rules

- Parâmetros configuráveis iniciais: tamanho (1-128), uso de símbolos, exclusão de caracteres ambíguos (`0`, `O`, `1`, `l`, `I`). A lista de parâmetros é aberta a novas opções.
- Toda senha gerada deve atender a uma força mínima obrigatória (nota 0-100, padrão 70 se não especificada), usando a nota média produzida por [password-evaluation](../password-evaluation/README.md) como critério de corte — uma senha gerada que não atinja a força mínima não pode ser aceita como está. A senha é avaliada sem histórico (não está vinculada a nenhuma entrada de cofre específica neste momento), então o critério de reuso sempre aprova nesta etapa.
- `POST /passwords/generate`: gera candidatas com `RandomNumberGenerator` (CSPRNG) e tenta novamente, até um limite de tentativas, até atingir a nota mínima; se os parâmetros tornarem isso impossível, retorna 422 em vez de uma senha fraca ou travar em loop. Exige autenticação (qualquer usuário logado), mas não persiste nada no cofre nem acessa a DEK — a senha gerada só é salva se o usuário optar por criar/editar uma entrada de cofre com ela.

## Main Relationships

- depends on [password-evaluation](../password-evaluation/README.md): valida a força mínima antes de uma senha gerada ser aceita.
- is used by [vault-entries](../vault-entries/README.md): senhas geradas aqui podem ser salvas como uma entrada de cofre.
- is used by [web-interface](../web-interface/README.md): ferramenta de geração de senha integrada aos formulários de entrada de cofre.
