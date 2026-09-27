# Security Policy

O Keytography armazena credenciais de terceiros (contas e senhas). Reportar uma vulnerabilidade de forma responsável é levado a sério, mesmo nesta fase inicial e pessoal do projeto.

## Reportando uma vulnerabilidade

Não abra uma issue pública para uma vulnerabilidade de segurança. Em vez disso, use a aba **Security** > **Report a vulnerability** deste repositório no GitHub (GitHub Security Advisories). Isso cria um canal privado entre você e o mantenedor até que a vulnerabilidade seja corrigida e divulgada de forma responsável.

Inclua, quando possível:

- Passos para reproduzir o problema
- Versão/commit afetado
- Impacto potencial (ex.: exposição de credenciais, bypass de autenticação, escalonamento de role)

## Escopo

Como o projeto ainda está em fase de planejamento/pré-implementação (ver [docs/STATUS.md](./docs/STATUS.md)), esta política cobre principalmente o design documentado em `docs/capabilities/` — em particular os pontos já sinalizados como críticos e ainda em aberto (esquema de criptografia, recuperação de acesso) em [authentication-and-users](./docs/capabilities/authentication-and-users/README.md) e [vault-entries](./docs/capabilities/vault-entries/README.md).
