# Development Guide

## Development Priorities

1. Construir o core/backend (autenticação, cofre de contas/senhas, avaliação de força, geração de senha) antes de qualquer interface.
2. Preservar o escopo e os non-goals documentados em `PROJECT-ARCHITECTURE.md` em vez de expandir funcionalidades por conveniência de implementação.
3. Tratar decisões que afetam segurança dos dados armazenados (criptografia, autenticação, controle de acesso por role) como decisões que sempre exigem revisão humana explícita.

## Scope Control

Mudanças são aceitáveis quando:

- Implementam uma regra de negócio já registrada em uma `capabilities/<slug>/README.md`.
- Ficam dentro do core/backend definido como escopo da fase atual.
- Não introduzem uma das funcionalidades listadas como Non-Goal em `PROJECT-ARCHITECTURE.md`.

Mudanças exigem revisão explícita quando:

- Alteram o esquema de criptografia de senhas ou o fluxo de autenticação/recuperação de acesso.
- Alteram o modelo de roles (`Admin` / `Member`) ou o que cada role pode ler/escrever.
- Introduzem uma dependência técnica nova ou uma decisão de stack ainda pendente em `PROJECT-ARCHITECTURE.md`.
- Expandem o escopo além do que está descrito como objetivo atual.

## Documentation Rules

- Comportamento novo de uma capability vai em `docs/capabilities/<slug>/README.md`.
- Mudanças de escopo ou política vão em `docs/PROJECT-ARCHITECTURE.md`.
- Mudanças de fluxo de uso voltadas ao usuário final vão em `docs/guides/`.
- Convenções de código de interface (componentes, estilo, tokens, i18n, testes) vivem em [docs/guides/web-frontend-conventions.md](./guides/web-frontend-conventions.md) e valem como padrão geral para qualquer implementação de interface do projeto.
- O contrato da API consumido pelos clientes vive em `docs/reference/` (ver [docs/reference/README.md](./reference/README.md)); mudou endpoint ou DTO, regenere-o.
- Decisões duráveis que atravessam múltiplas capabilities vão em `docs/decisions/`.
- Atualize `docs/STATUS.md` junto de qualquer mudança de implementação relevante.

## Git Direction

- Use Conventional Commits.
- Declare o impacto de SemVer (major/minor/patch/none) explicitamente em toda descrição de PR.
- Mantenha mudanças pequenas e revisáveis.
