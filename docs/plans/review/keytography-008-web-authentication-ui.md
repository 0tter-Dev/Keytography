---
id: keytography-008
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 8
depends_on: [keytography-007]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# UI de autenticação

## Objective

Implementar as telas de autenticação da interface web — registro, verificação de e-mail, login, esqueci/redefinir senha — consumindo os endpoints de `authentication-and-users` já existentes, com gestão de sessão e rotas protegidas.

## Context

`keytography-007` entrega a fundação (scaffolding, theming, cliente de API tipado). Este plano constrói a primeira experiência real do usuário. Os endpoints (`POST /auth/register`, `/verify-email`, `/login`, `/forgot-password`, `/reset-password`, `GET /auth/me`) já existem e não mudam.

## Scope

- Tela de registro (login, e-mail, senha) com validação de formulário (React Hook Form + Zod) espelhando as regras já aplicadas pela API (senha ≥ 8 caracteres).
- Tela de verificação de e-mail (campo de token).
- Tela de login, com tratamento de erro claro para credenciais inválidas e e-mail não verificado.
- Fluxo de "esqueci minha senha" (solicitar token) e "redefinir senha" (consumir token + nova senha).
- Armazenamento do JWT (ex.: `localStorage` ou `sessionStorage`) e lógica de expiração — usuário é redirecionado ao login quando o token expira ou uma chamada retorna 401.
- Rotas protegidas: qualquer tela além das de autenticação exige sessão válida; acesso sem sessão redireciona ao login.
- Logout (limpa o token local e redireciona ao login).
- Integração com o shell de navegação de `keytography-007` (links reais de login/logout agora existem).

## Out Of Scope

- Troca de senha autenticada (usuário já logado trocando a própria senha) — isso é `keytography-012`, junto com a tela de configurações de conta.
- Qualquer tela além de autenticação (cofre, avaliação, geração, configurações — planos seguintes).

## Approval

## Acceptance Criteria

- Registrar um novo usuário, verificar o e-mail com o token recebido (via tela de verificação), e logar com sucesso — fluxo completo funcional ponta a ponta contra a API real.
- Tentar logar antes de verificar o e-mail mostra uma mensagem de erro específica (não genérica).
- Tentar logar com credenciais inválidas mostra uma mensagem de erro sem revelar se o problema foi o login ou a senha.
- Solicitar redefinição de senha e completar o fluxo com o token retornado permite logar com a nova senha; a senha antiga para de funcionar.
- Acessar qualquer rota protegida sem sessão redireciona para a tela de login.
- Uma sessão expirada (JWT vencido) força um redirecionamento ao login na próxima chamada autenticada, em vez de uma tela quebrada ou erro silencioso.
- Logout limpa a sessão local e torna rotas protegidas inacessíveis novamente.

## Validation

- Testes de componente (Vitest + React Testing Library) cobrindo cada formulário (validação client-side, estados de erro) com a API mockada.
- Verificação manual do fluxo completo (registro → verificação → login → esqueci senha → redefinição → login com nova senha) contra a API local rodando de verdade.
- CI (frontend + backend) permanece verde.

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar as telas de autenticação implementadas e a estratégia de sessão/rotas protegidas.
- `README.md` (raiz): Current Scope passa a listar autenticação (registro, verificação de e-mail, login e redefinição de senha) como entregue na interface web; Quick Start descreve o que a interface passa a exigir (login) em vez da tela de estado do sistema.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
