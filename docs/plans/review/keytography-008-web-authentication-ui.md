---
id: keytography-008
status: review
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 8
depends_on: [keytography-007]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records:
  - docs/decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md
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

Aprovado pelo usuário em 2026-10-03, ao pedir explicitamente a ativação e a implementação do próximo passo do `ROADMAP.md` (este plano). Este plano não altera a API, a criptografia, as regras de autenticação do backend nem o controle de acesso por role: só consome os endpoints existentes. Como toca o **lado cliente** da autenticação (onde o JWT fica guardado), a escolha abaixo é registrada para revisão humana no PR.

**Esclarecimentos de implementação (2026-10-03)** — ajustes de meio, sem alterar o objetivo nem os critérios de aceite:

- **Armazenamento do JWT: `sessionStorage`** (e não `localStorage`; decisão formalizada no [ADR-0005](../../decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md)). O token some ao fechar a aba/janela; para um cofre de senhas, preferimos reduzir a janela de exposição a poupar um novo login. O JWT dura 1 hora e a API não tem refresh token, então o ganho de persistir entre sessões do navegador seria pequeno. Contrapartida: abrir o Keytography em outra aba exige novo login.
- **Expiração**: a sessão é encerrada (a) ao reidratar, se o `expiresAt` já passou; (b) por um temporizador no instante do vencimento; e (c) quando a API responde 401 a uma chamada feita com o token atual (middleware do cliente tipado). Nos três casos as rotas protegidas redirecionam ao login, que avisa "sessão expirou" quando o motivo foi expiração.
- **Logout é só local**: não existe endpoint de logout na API, então sair limpa o token e o cache de consultas no navegador; a cópia da DEK em memória no servidor (ADR-0002) segue até o fim do tempo de vida do JWT. Não é alterado aqui (mudaria a API).
- **Campo "Confirmar senha"** no registro e na redefinição (não estava no `Scope`): evita uma senha digitada errada trancar o cofre do usuário; é só validação de cliente e não muda o contrato da API.
- **Telas de verificação e redefinição** (`/verify-email`, `/reset-password`) funcionam com ou sem sessão; login, registro e "esqueci a senha" redirecionam para o início quem já está logado.
- **Dependências**: entram `react-hook-form`, `zod` e `@hookform/resolvers`, conforme a tabela de [web-frontend-conventions.md](../../guides/web-frontend-conventions.md).
- **E-mail em desenvolvimento**: a API não envia e-mail de verdade (`LoggingEmailSender`); os tokens de verificação e de redefinição aparecem no log da API, e o usuário os cola nas telas.

**Ajustes após a `project-audit` (2026-10-03), aprovados pelo usuário:**

- **I-1:** o destino guardado ao redirecionar para o login agora é restaurado de fato (`GuestOnly` reage ao `signIn` antes do `navigate` do login; ambos usam `loginRedirectTarget`, que só aceita caminhos internos). Teste com uma segunda rota protegida.
- **M-1:** em "esqueci minha senha", um novo envio limpa o aviso de sucesso do anterior.
- **M-2:** o cache de consultas é esvaziado em qualquer fim de sessão (logout, expiração por temporizador ou 401, troca de login) por um `SessionController`, e não só no logout.
- **M-3:** o JWT não é anexado a endpoints anônimos, e o 401 deles não encerra a sessão.
- **M-4:** texto residual deste plano corrigido (link do ROADMAP aponta para `review/`).
- **[ADR-0005](../../decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md):** registra o modelo de sessão atual e a direção desejada. O usuário preferiria sessões **gerenciadas e persistidas pelo backend** (validação nos endpoints, refresh, logout e revogação). Isso **não cabe neste plano**: muda o contrato público e o banco, altera o fluxo de autenticação do backend, exige reavaliar o [ADR-0002](../../decisions/ADR-0002-dek-session-cache.md) (um refresh sem senha não reconstrói a DEK) e foge de `authorized_capabilities`. Ficou documentado como evolução futura (ADR-0005, `ROADMAP.md` e a capability `web-interface`), para um plano próprio com aprovação humana.

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

- `docs/capabilities/web-interface/README.md`: documentar as telas de autenticação implementadas e a estratégia de sessão/rotas protegidas (atualizado).
- `README.md` (raiz): Current Scope passa a listar autenticação (registro, verificação de e-mail, login e redefinição de senha) como entregue na interface web; Quick Start descreve o que a interface passa a exigir (login) em vez da tela de estado do sistema.
- `docs/STATUS.md`: refletir o novo status (atualizado).
- `docs/ROADMAP.md`: link do plano aponta para `review/` (atualizado); "Evolução futura" ganha as sessões gerenciadas pelo backend.
- `docs/decisions/ADR-0005-client-session-model-and-backend-managed-sessions.md` (novo) e `docs/decisions/README.md`: registram o modelo de sessão do cliente e a direção desejada de sessões no backend.
- `docs/guides/web-frontend-conventions.md`: tabela de dependências (React Hook Form + Zod passam a existir), convenção de formulários e de armazenamento da sessão (atualizado).
- `docs/guides/running-locally.md`: passos do primeiro acesso (registrar, pegar o token no log da API, verificar, entrar) (atualizado).
- `docs/reference/` (contrato OpenAPI) e `web/src/api/schema.d.ts`: constatação deliberada de que **não** mudam — nenhum endpoint, DTO ou metadado de resposta foi alterado.
- Capabilities de backend (`authentication-and-users` etc.): constatação deliberada de que não precisam mudar — nenhum comportamento da API mudou (e estão fora de `authorized_capabilities`).

## Outcome
