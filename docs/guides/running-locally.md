# Rodando o backend localmente

## Purpose

Passos para compilar, testar e rodar o backend do Keytography localmente. São os mesmos comandos usados pelo CI (`.github/workflows/ci.yml`).

## Pré-requisitos

- .NET SDK 10 (a versão exata é fixada em [global.json](../../global.json)).
- Uma chave de assinatura JWT configurada localmente via user-secrets (nunca commitada) — ver seção [Segredos locais (JWT)](#segredos-locais-jwt) abaixo. Sem isso, a API falha ao iniciar com um erro claro.

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

## Ferramentas locais (dotnet-ef)

O projeto usa um [manifesto de ferramentas locais](../../.config/dotnet-tools.json) para o `dotnet-ef` (usado para gerar novas migrations). Restaure com:

```
dotnet tool restore
```

Para gerar uma nova migration depois de alterar o modelo em `Keytography.Infrastructure`:

```
dotnet ef migrations add <Nome> --project src/Keytography.Infrastructure --startup-project src/Keytography.Api --output-dir Migrations
```
