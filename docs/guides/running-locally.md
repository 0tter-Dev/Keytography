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
   curl http://localhost:5299/health
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
