# Project Architecture

## Purpose

O Keytography armazena e organiza credenciais de contas (pares login/senha e detalhes relacionados) para seus usuários, avalia a força de cada senha armazenada, e gera senhas fortes sob demanda. Começa como um projeto pessoal e local, mas já nasce com um modelo multiusuário embutido.

## Goals

- Entregar uma experiência central de "cofre": o usuário abre o sistema principalmente para procurar e gerenciar credenciais salvas.
- Suportar múltiplos usuários com controle de acesso por role (`Admin`, `Member`).
- Dar ao usuário um diagnóstico de força de senha modular e explicável, em vez de uma nota única e opaca.
- Gerar senhas que já atendam a uma força mínima exigida.
- Construir o domínio como core/backend primeiro, para que web, mobile e um shell desktop Windows possam ser servidos depois sem retrabalho.

## Non-Goals

- Sincronização em nuvem — não é tentada na fase atual; candidata a uma fase futura.
- Compartilhamento de credenciais entre usuários — cofres são estritamente por usuário; um `Admin` pode ler o cofre de outros usuários para fins de supervisão, mas nunca escrever neles.
- 2FA/TOTP embutido — não é tentado na fase atual; candidato a uma fase futura.
- Extensão de navegador — não é tentada na fase atual; candidata a uma fase futura.

## Core Principles

- Senhas nunca são armazenadas em texto puro; toda credencial salva é criptografada.
- Apenas o usuário dono pode criar ou editar entradas no próprio cofre. Um `Admin` pode ler o cofre de qualquer usuário para supervisão, mas não tem acesso de escrita a cofres além do seu próprio.
- A nota de força de uma senha sempre vem de um conjunto modular e extensível de critérios (ver [password-evaluation](./capabilities/password-evaluation/README.md)), nunca de uma fórmula única fixa no código.
- Exclusões são reversíveis por padrão (soft delete em uma lixeira) antes de qualquer remoção definitiva.

## Selected Technology Direction

Decidido em 2026-09-26, ponderando necessidades funcionais, velocidade de implementação, performance, compatibilidade de framework, suporte a boas soluções de UI/UX futuras, e o alvo explícito de um shell desktop Windows:

- **Backend:** C# / ASP.NET Core (.NET).
- **Acesso a dados:** Entity Framework Core, com provider SQLite (arquivo único, sem necessidade de servidor de banco separado, alinhado ao uso local da fase atual).
- **Criptografia e autenticação:** bibliotecas padrão do .NET (`System.Security.Cryptography`, `Microsoft.AspNetCore.Authentication.JwtBearer`) — ver [ADR-0001](./decisions/ADR-0001-vault-encryption-and-recovery.md) para o esquema de criptografia do cofre.

Razão da escolha: o ecossistema .NET cobre backend, e no futuro o shell desktop Windows (WinUI 3 ou .NET MAUI) e potencialmente mobile (MAUI), sem trocar de linguagem entre essas camadas. O frontend web permanece uma decisão independente (qualquer SPA pode consumir a API).

Infraestrutura é a única exceção que permanece parcial: o projeto hoje roda localmente e de forma majoritariamente manual, sem necessidade de containerização agora. Docker é registrado como candidato para uma fase futura de infraestrutura, não como decisão atual.

## Architectural Direction

O Keytography está sendo construído core/backend primeiro. O core expõe as capacidades de domínio — autenticação e usuários, entradas de cofre (contas/senhas), avaliação de senha e geração de senha — como uma camada de serviço. Web, mobile e um shell desktop Windows estão previstos como consumidores desse core, construídos depois que o core estiver funcional, não em paralelo com ele. Nenhum protocolo de API ou tecnologia de interface foi escolhido ainda.
