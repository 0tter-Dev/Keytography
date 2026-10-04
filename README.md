# Keytography

> A arte de guardar suas chaves.

Gerenciador pessoal de contas e senhas: armazena credenciais com segurança, avalia a força de cada senha através de critérios modulares, e gera senhas fortes sob demanda.

Nome, tagline e direção visual estão documentados em [docs/guides/identity.md](./docs/guides/identity.md).

## Quick Start

Detalhes e pré-requisitos (incluindo os segredos locais exigidos pela API) em [docs/guides/running-locally.md](./docs/guides/running-locally.md).

**API (backend):**

```bash
dotnet run --project src/Keytography.Api
```

Sobe em `http://localhost:5247`; `GET /health` confirma que está de pé.

**Interface web** (em outro terminal, com a API rodando):

```bash
cd web
npm install
npm run dev
```

Abre em `http://localhost:5173`, na tela de login (até o `keytography-017` a interface ainda não renova a sessão e volta ao login a cada 15 minutos, o tempo do access token). Hoje a interface entrega a fundação (layout responsivo, temas, cliente de API tipado) e a autenticação (criar conta, verificar e-mail, entrar, redefinir senha); depois de entrar, a tela inicial ainda mostra só o estado do sistema. Em desenvolvimento a API não envia e-mail: o token de verificação aparece no log do `dotnet run` (passo a passo em [docs/guides/running-locally.md](./docs/guides/running-locally.md#primeiro-acesso-na-interface-web)). As telas de cofre, avaliação e geração de senha ainda estão em desenvolvimento — veja [docs/ROADMAP.md](./docs/ROADMAP.md) e [docs/STATUS.md](./docs/STATUS.md).

## Current Scope

**Core/backend — implementado:**

- Autenticação de usuários multiusuário (roles `Admin` e `Member`), com sessões controladas pelo backend: access token curto, refresh rotativo em cookie `HttpOnly`, logout e revogação reais (a interface web passa a usar isso em `keytography-017`)
- CRUD de contas e senhas com criptografia e histórico
- Avaliação de força de senha por critérios modulares
- Geração de senhas fortes com exigência de força mínima

**Interface web — em andamento:** fundação entregue (React + TypeScript + Vite, sistema de temas, i18n `pt-BR`, casca de layout responsiva, cliente tipado gerado do contrato da API) e autenticação (registro, verificação de e-mail, login, redefinição de senha, sessão e rotas protegidas, logout). As demais telas estão planejadas em sequência (`keytography-009` a `014`). Mobile e Desktop só começam depois que a interface web estiver consolidada.

Out of scope for now: sincronização em nuvem, compartilhamento de senhas entre usuários, 2FA/TOTP embutido, extensão de navegador.

## Documentation

Para documentação completa, comece por [Start Here](./docs/START-HERE.md). O contrato da API consumido pelos clientes está em [docs/reference/](./docs/reference/README.md); as convenções de código de interface, em [docs/guides/web-frontend-conventions.md](./docs/guides/web-frontend-conventions.md).

## Stack

- **Backend:** C# / ASP.NET Core (.NET 10), Entity Framework Core + SQLite.
- **Frontend web:** React + TypeScript + Vite, Tailwind CSS, React Hook Form + Zod (formulários), com cliente de API tipado gerado do contrato OpenAPI versionado.

Ver [Selected Technology Direction](./docs/PROJECT-ARCHITECTURE.md#selected-technology-direction) para o detalhe e o raciocínio de cada escolha.

## License

[MIT](./LICENSE)
