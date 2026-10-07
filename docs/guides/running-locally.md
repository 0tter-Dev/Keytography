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
| `Sessions:MaxSessionsPerMember` | 5 | teto de sessões simultâneas de um `Member`, de 1 a 100 (a menos recentemente usada é encerrada ao passar dele) |
| `Sessions:MaxSessionsPerAdmin` | 10 | teto de sessões simultâneas de um `Admin`, de 1 a 100 |
| `Sessions:ForceSecureCookie` | `false` | marca o cookie de refresh como `Secure` mesmo em requisições HTTP (proxy que termina TLS) |

Valores fora do intervalo aceito (todos de no mínimo 1, com tetos de 1 dia para o access token, 30 dias de inatividade, 365 dias absolutos e 5 minutos de tolerância) fazem a API falhar ao iniciar. Para testar a renovação sem esperar, use `Sessions__AccessTokenMinutes=1`. O CORS da API permite credenciais apenas para as origens listadas em `Cors:AllowedOrigins` (por padrão, o servidor do Vite em `localhost:5173`), e `refresh`/`logout` recusam (403) um `Origin` presente que não esteja nessa lista; quem decide se o cookie é enviado é o navegador (`SameSite=Strict`, host e `Path=/auth`); com `curl`, use um cookie jar (`-c` e `-b`).

### Verificando as sessões com curl

Roteiro repetível para conferir o modelo de sessão (`keytography-016`, [ADR-0006](../decisions/ADR-0006-backend-managed-sessions.md)) contra uma API de verdade, sem mexer no seu banco: use um banco descartável e um access token curto para ver a renovação rápido. Em um terminal POSIX (Git Bash, WSL, macOS, Linux), na raiz do repositório (o `dotnet run` pode abrir o navegador, pelo perfil de execução; basta fechá-lo):

```bash
# 1. API com banco descartável e access token de 1 minuto (deixe rodando; use outro terminal para o resto)
ConnectionStrings__Keytography="Data Source=keytography-manual.db" \
  Sessions__AccessTokenMinutes=1 dotnet run --project src/Keytography.Api
# (o banco é criado em src/Keytography.Api/keytography-manual.db, ignorado pelo git; apague-o ao terminar)
```

```bash
B=http://localhost:5247; J=/tmp/kt-jar.txt; H='content-type: application/json'
code() { curl -s -o /dev/null -w "%{http_code}\n" "$@"; }

# 2. Cadastro + verificação (o token aparece no log da API: "Use o token a seguir para confirmar seu e-mail: <TOKEN>")
curl -s -X POST $B/auth/register -H "$H" -d '{"login":"manual","email":"manual@example.test","password":"Senha-Manual-1"}'
curl -s -X POST $B/auth/verify-email -H "$H" -d '{"token":"<TOKEN DO LOG>"}'

# 3. Login (o cookie de refresh vai para o jar; o access token vem no corpo)
TOKEN=$(curl -s -c $J -X POST $B/auth/login -H "$H" -d '{"login":"manual","password":"Senha-Manual-1"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
code $B/auth/me -H "Authorization: Bearer $TOKEN"            # esperado: 200
grep keytography_refresh $J                                    # cookie HttpOnly, Path=/auth

# 4. Refresh: rotaciona o cookie e devolve um novo access token
cp $J /tmp/kt-jar-old.txt
code -b $J -c $J -X POST $B/auth/refresh                       # esperado: 200
sleep 11                                                       # passa da tolerância de rotação (10 s)
code -b /tmp/kt-jar-old.txt -X POST $B/auth/refresh            # reuso do cookie antigo: 401 e a sessão é revogada
code $B/auth/me -H "Authorization: Bearer $TOKEN"              # esperado: 401 (sessão revogada na hora)

# 5. Logout, logout-all, CSRF e CORS
curl -s -c $J -X POST $B/auth/login -H "$H" -d '{"login":"manual","password":"Senha-Manual-1"}' >/dev/null
code -b $J -X POST $B/auth/refresh -H 'Origin: http://evil.example'     # esperado: 403
code -b $J -c $J -X POST $B/auth/logout -H 'Origin: http://localhost:5173'  # esperado: 204
code -X POST $B/auth/logout                                    # esperado: 204 (idempotente)
code -X POST $B/auth/logout-all                                # esperado: 401 (exige access token)

# 6. Refreshes simultâneos com o mesmo cookie: todos 200, exatamente um cookie novo
curl -s -c $J -o /dev/null -X POST $B/auth/login -H "$H" -d '{"login":"manual","password":"Senha-Manual-1"}'
for i in 1 2 3 4 5 6; do curl -s -b $J -o /dev/null -D /tmp/kt-h$i.txt -w "%{http_code}\n" -X POST $B/auth/refresh & done; wait
grep -il "set-cookie: keytography_refresh=[A-Za-z0-9_-]" /tmp/kt-h?.txt | wc -l   # esperado: 1

# 7. Novo login no mesmo navegador (mesmo cookie jar) substitui a sessão anterior (independe do passo 6)
OLD=$(curl -s -c $J -X POST $B/auth/login -H "$H" -d '{"login":"manual","password":"Senha-Manual-1"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
NEW=$(curl -s -b $J -c $J -X POST $B/auth/login -H "$H" -d '{"login":"manual","password":"Senha-Manual-1"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
code $B/auth/me -H "Authorization: Bearer $OLD"               # esperado: 401 (sessão substituída)
code $B/auth/me -H "Authorization: Bearer $NEW"               # esperado: 200
```

Registre no `Outcome` do plano o que foi executado e o resultado (ver [docs/plans/README.md](../plans/README.md#delivery-semantics)). Em PowerShell, use `curl.exe` e adapte `sed`/`grep`; a suíte automática (`dotnet test`) cobre os mesmos cenários.

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

A interface guarda só o access token (15 minutos), **em memória**; a sessão vive na API e o refresh token em um cookie `HttpOnly`. Recarregar a página (F5) ou abrir outra aba restaura a sessão sozinho, o token é renovado em segundo plano e "Sair" encerra a sessão no servidor. Por causa do cookie, a origem da interface precisa estar em `Cors:AllowedOrigins` (padrão: `http://localhost:5173`). Para ver a renovação sem esperar, suba a API com `Sessions__AccessTokenMinutes=1` (a interface renova ~30 s antes do vencimento).

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

