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

## Sessões (`Sessions:*`)

Desde `keytography-016`, o login cria uma sessão no banco: o access token (JWT) é de vida curta e a renovação é feita por um cookie de refresh `HttpOnly` ([ADR-0006](../decisions/ADR-0006-backend-managed-sessions.md)). Os tempos têm padrões e podem ser ajustados por configuração (user-secrets, `appsettings` ou variáveis de ambiente como `Sessions__AccessTokenMinutes`):

| Chave | Padrão | O que controla |
| --- | --- | --- |
| `Sessions:AccessTokenMinutes` | 15 | vida do access token (JWT) |
| `Sessions:IdleHours` | 12 | expiração por inatividade (renovada a cada refresh; também o TTL da DEK em cache) |
| `Sessions:AbsoluteDays` | 7 | limite absoluto da sessão |
| `Sessions:RotationGraceSeconds` | 10 | janela em que o refresh token anterior ainda é aceito (requisições simultâneas) |
| `Sessions:ForceSecureCookie` | `false` | marca o cookie de refresh como `Secure` mesmo em requisições HTTP (proxy que termina TLS) |

Valores fora do intervalo aceito (positivos, com tetos de 1 dia para o access token, 30 dias de inatividade, 365 dias absolutos e 5 minutos de tolerância) fazem a API falhar ao iniciar. Para testar a renovação sem esperar, use `Sessions__AccessTokenMinutes=1`. A API só aceita chamadas de navegador com credenciais, e só confere o `Origin` de `refresh`/`logout`, para origens liberadas em `Cors:AllowedOrigins` (por padrão, o servidor do Vite em `localhost:5173`); o envio do cookie em si segue as regras do navegador (`SameSite=Strict`, host e `Path=/auth`); com `curl`, use um cookie jar (`-c` e `-b`). Até o `keytography-017`, a interface web ainda não renova o token e volta ao login quando o access token vence.

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
3. Abrir `http://localhost:5173`. Sem sessão, a interface mostra o login (ver [Primeiro acesso](#primeiro-acesso-na-interface-web)); depois de entrar, a tela inicial mostra o estado do sistema (`GET /health`).

**Como a interface encontra a API:** por padrão em `http://localhost:5247` (o `dotnet run`). Para outra URL, copie `web/.env.example` para `web/.env.local` e ajuste `VITE_API_BASE_URL`. A API só aceita requisições do navegador vindas de origens liberadas via CORS — por padrão `http://localhost:5173` e `http://127.0.0.1:5173`; para outras origens, configure `Cors:AllowedOrigins` (lista) na API (ex.: via user-secrets).

### Primeiro acesso na interface web

1. Abra `http://localhost:5173`: sem sessão, a interface leva ao login. Clique em **Criar conta** e preencha o formulário (o primeiro usuário cadastrado vira `Admin`).
2. A API não envia e-mail de verdade em desenvolvimento: o token de verificação aparece no **log do `dotnet run`**, em uma linha como `E-mail (dev, nao enviado de verdade) para ... | Corpo: Use o token a seguir para confirmar seu e-mail: <TOKEN>`.
3. Cole o token na tela **Verificar e-mail** (aberta após o cadastro) e, em seguida, entre com o login e a senha.
4. Para redefinir a senha, use **Esqueci minha senha**; o token de redefinição também aparece no log da API (vale 1 hora) e vai na tela **Redefinir senha**.

A sessão da interface fica no `sessionStorage` do navegador (some ao fechar a aba). Desde `keytography-016` o access token dura 15 minutos e a interface ainda não o renova (até `keytography-017`): passado esse tempo, ela volta ao login.

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

