# Rodando o backend localmente

## Purpose

Passos para compilar, testar e rodar o backend do Keytography localmente. São os mesmos comandos usados pelo CI (`.github/workflows/ci.yml`).

## Pré-requisitos

- .NET SDK 10 (a versão exata é fixada em [global.json](../../global.json)).
- Uma chave de assinatura JWT e um par de chaves RSA de recuperação configurados localmente via user-secrets (nunca commitados) — ver seções [Segredos locais (JWT)](#segredos-locais-jwt) e [Segredos locais (chave de recuperação do cofre)](#segredos-locais-chave-de-recuperação-do-cofre) abaixo. Sem isso, a API falha ao iniciar com um erro claro.

## Steps

1. Restaurar dependências:
   ```
   dotnet restore
   ```
2. Compilar a solução:
   ```
   dotnet build
   ```
3. Rodar os testes:
   ```
   dotnet test
   ```
4. Rodar a API (a partir da raiz do repositório):
   ```
   dotnet run --project src/Keytography.Api
   ```
   Na primeira execução, o banco SQLite (`keytography.db`, arquivo local não versionado) é criado automaticamente via migration do EF Core.
5. Verificar que a API está de pé:
   ```
   curl http://localhost:5247/health
   ```
   Deve retornar HTTP 200 com um corpo indicando `"status":"healthy"`, incluindo o check do banco de dados.

## Segredos locais (JWT)

A API usa JWT para autenticação (`keytography-002`). A chave de assinatura nunca é commitada — é configurada via [user-secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets) do .NET, a partir de `src/Keytography.Api`:

```
dotnet user-secrets set "Jwt:Key" "<uma string aleatória longa, ex.: gerada com openssl rand -base64 48>"
dotnet user-secrets set "Jwt:Issuer" "Keytography.Dev"
dotnet user-secrets set "Jwt:Audience" "Keytography.Dev"
```

Sem `Jwt:Key` configurado, a API lança uma exceção clara no startup em vez de subir silenciosamente insegura. Os testes automatizados (`dotnet test`) não precisam disso — usam uma chave de teste fixa via configuração isolada por teste.

## Segredos locais (chave de recuperação do cofre)

O esquema de criptografia do cofre (`keytography-003`, [ADR-0001](../decisions/ADR-0001-vault-encryption-and-recovery.md)) exige um par de chaves RSA-OAEP (mínimo 3072 bits) do sistema. A chave privada nunca é commitada — é configurada via user-secrets como PEM:

```
dotnet user-secrets set "Recovery:PrivateKeyPem" "$(openssl genrsa 3072 2>/dev/null || echo '<cole aqui o PEM gerado por outro meio>')"
```

Ou, sem `openssl`, gere via .NET (`RSA.Create(3072).ExportRSAPrivateKeyPem()`) em um script descartável e cole o resultado no comando acima. Sem `Recovery:PrivateKeyPem` configurado, a API lança uma exceção clara no startup. Os testes automatizados geram sua própria chave descartável a cada execução — não precisam desta configuração.

**Atenção:** esta é a chave mais sensível do sistema — quem a possui pode decifrar o cofre de qualquer usuário (ver "Consequences" no ADR-0001). Em ambiente local isso é aceitável; a proteção adequada dela em produção ainda precisa ser desenhada.

## Ferramentas locais (dotnet-ef)

O projeto usa um [manifesto de ferramentas locais](../../.config/dotnet-tools.json) para o `dotnet-ef` (usado para gerar novas migrations). Restaure com:

```
dotnet tool restore
```

Para gerar uma nova migration depois de alterar o modelo em `Keytography.Infrastructure`:

```
dotnet ef migrations add <Nome> --project src/Keytography.Infrastructure --startup-project src/Keytography.Api --output-dir Migrations
```

## Interface web (`web/`)

A interface web (`keytography-007` em diante) é um projeto separado em `web/` (React + TypeScript + Vite), com toolchain Node/npm.

**Pré-requisitos:** Node.js 22.12 ou superior (o CI usa Node 24) e a API rodando localmente (seção [Steps](#steps)).

1. Instalar dependências (a partir de `web/`):
   ```
   npm install
   ```
2. Subir o servidor de desenvolvimento (porta fixa **5173**):
   ```
   npm run dev
   ```
3. Abrir `http://localhost:5173`. Com a API rodando, a tela inicial mostra o estado do sistema (`GET /health`).

**Como a interface encontra a API:** por padrão em `http://localhost:5247` (o `dotnet run`). Para outra URL, copie `web/.env.example` para `web/.env.local` e ajuste `VITE_API_BASE_URL`. A API só aceita requisições do navegador vindas de origens liberadas via CORS — por padrão `http://localhost:5173` e `http://127.0.0.1:5173`; para outras origens, configure `Cors:AllowedOrigins` (lista) na API (ex.: via user-secrets).

**Scripts úteis (em `web/`):**

| Comando | O que faz |
| --- | --- |
| `npm run build` | Checagem de tipos + build de produção |
| `npm run lint` | Lint (`oxlint`) |
| `npm run format` / `npm run format:check` | Formata / verifica a formatação (Prettier) |
| `npm test` | Testes (Vitest + React Testing Library) |
| `npm run api:types` | Regenera os tipos do cliente a partir de `docs/reference/openapi.json` |

O contrato da API (`docs/reference/openapi.json`) é gerado pela própria API; ver [docs/reference/README.md](../reference/README.md) para regenerá-lo depois de mudar um endpoint. Convenções de código da interface: [web-frontend-conventions.md](./web-frontend-conventions.md).

## Verificações de governança

`dotnet test` também confere a documentação do repositório (planos, `STATUS.md`/`ROADMAP.md`, links internos, README raiz nos planos) e a convenção de nomes de branches e PRs. Para rodar só essas verificações:

```bash
dotnet test --filter "FullyQualifiedName~DocumentationGovernance"
dotnet test --filter "FullyQualifiedName~BranchNaming"
```

Cada falha indica o arquivo, a regra e como corrigir. Detalhes e o procedimento de exceção: [DOCUMENTATION-GUIDE.md](../DOCUMENTATION-GUIDE.md#verificação-automática-de-governança).

