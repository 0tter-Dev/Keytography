# Keytography

> A arte de guardar suas chaves.

Gerenciador pessoal de contas e senhas: armazena credenciais com segurança, avalia a força de cada senha através de critérios modulares, e gera senhas fortes sob demanda.

Nome, tagline e direção visual estão documentados em [docs/guides/identity.md](./docs/guides/identity.md).

## Quick Start

Ainda não há build executável — o core do backend está em fase de planejamento, nenhuma stack foi decidida. Veja [docs/STATUS.md](./docs/STATUS.md) para o estágio atual.

## Current Scope

- Autenticação de usuários multiusuário (roles `Admin` e `Member`)
- CRUD de contas e senhas com criptografia e histórico
- Avaliação de força de senha por critérios modulares
- Geração de senhas fortes com exigência de força mínima

Out of scope for now: sincronização em nuvem, compartilhamento de senhas entre usuários, 2FA/TOTP embutido, extensão de navegador. Interfaces web, mobile e um shell desktop estão na visão do projeto, mas virão depois do core/backend.

## Documentation

Para documentação completa, comece por [Start Here](./docs/START-HERE.md).

## Stack

Nenhuma decisão de stack foi tomada até o momento. Ver [Selected Technology Direction](./docs/PROJECT-ARCHITECTURE.md#selected-technology-direction).

## License

[MIT](./LICENSE)
