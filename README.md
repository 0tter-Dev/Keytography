# Keytography

> A arte de guardar suas chaves.

Gerenciador pessoal de contas e senhas: armazena credenciais com segurança, avalia a força de cada senha através de critérios modulares, e gera senhas fortes sob demanda.

Nome, tagline e direção visual estão documentados em [docs/guides/identity.md](./docs/guides/identity.md).

## Quick Start

O core/backend já roda localmente. Veja [docs/guides/running-locally.md](./docs/guides/running-locally.md) para compilar, testar e subir a API (`dotnet run --project src/Keytography.Api`, com `GET /health` disponível). A interface web ainda não existe — está planejada em [docs/plans/backlog/](./docs/plans/backlog/) (`keytography-007` em diante). Veja [docs/STATUS.md](./docs/STATUS.md) para o estágio atual.

## Current Scope

- Autenticação de usuários multiusuário (roles `Admin` e `Member`)
- CRUD de contas e senhas com criptografia e histórico
- Avaliação de força de senha por critérios modulares
- Geração de senhas fortes com exigência de força mínima

As quatro capabilities acima estão **implementadas** no core/backend. A interface web está em planejamento (ver [ROADMAP.md](./docs/ROADMAP.md)), como primeira interface de usuário do projeto, antes de portar para Mobile e Desktop.

Out of scope for now: sincronização em nuvem, compartilhamento de senhas entre usuários, 2FA/TOTP embutido, extensão de navegador.

## Documentation

Para documentação completa, comece por [Start Here](./docs/START-HERE.md).

## Stack

- **Backend:** C# / ASP.NET Core (.NET 10), Entity Framework Core + SQLite.
- **Frontend web:** React + TypeScript + Vite (planejado — ver `keytography-007` em diante).

Ver [Selected Technology Direction](./docs/PROJECT-ARCHITECTURE.md#selected-technology-direction) para o detalhe e o raciocínio de cada escolha.

## License

[MIT](./LICENSE)
