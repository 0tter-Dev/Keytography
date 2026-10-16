---
id: keytography-013
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: medium
sequence: 13
depends_on: [keytography-008, keytography-009]
authorized_capabilities:
  - docs/capabilities/web-interface/README.md
decision_records: []
validation: []
documentation_updates: []
---

# UI de supervisão do Admin (mínima)

## Objective

Dar ao usuário `Admin` uma interface para o que o backend já permite hoje: consultar (somente leitura) o cofre de outros usuários, e disparar o recálculo retroativo de avaliação de senha. Sem nenhum endpoint novo.

## Context

Os endpoints `GET /vault/users/{userId}/entries`, `GET /vault/users/{userId}/entries/{id}` e `POST /vault/password-evaluation/recalculate` já existem e são restritos a `Admin`. A visão completa de um painel de Admin (diretório de usuários, métricas/saúde do sistema) foi deliberadamente adiada e está documentada como evolução futura em `docs/capabilities/web-interface/README.md` — este plano implementa só a fatia já suportada pelo backend.

## Scope

- Uma área/rota visível apenas para usuários com role `Admin` (oculta para `Member`).
- Um campo para informar/selecionar o ID (ou identificar) de outro usuário e visualizar a listagem somente-leitura do cofre dele.
- Visualização de detalhe de uma entrada de outro usuário (somente leitura — sem botões de editar/excluir).
- Um botão para disparar `POST /vault/password-evaluation/recalculate`, com feedback claro do resultado (quantas entradas foram atualizadas).
- Tentativas de escrita (editar/excluir uma entrada supervisionada) não são expostas na UI — a API já responde 403, mas a interface nem oferece a ação.

## Out Of Scope

- Diretório/listagem de todos os usuários do sistema — evolução futura (exige endpoint novo).
- Métricas/saúde agregada do sistema — evolução futura (exige endpoint novo).
- Qualquer ação de escrita no cofre de outro usuário.

## Approval

## Acceptance Criteria

- Um usuário `Member` não vê nem consegue acessar a área de supervisão (rota protegida por role, não só escondida visualmente).
- Um usuário `Admin` consegue visualizar a listagem e o detalhe do cofre de outro usuário, com a senha visível (dado que a API já retorna decifrado para o Admin).
- A interface não oferece nenhum controle de edição/exclusão nas entradas supervisionadas.
- Disparar o recálculo retroativo mostra o número de entradas atualizadas retornado pela API.

## Validation

- Testes de componente cobrindo o controle de acesso por role (renderização condicional) e a chamada ao endpoint de recálculo.
- Verificação manual logada como Admin e como Member, confirmando a diferença de acesso.
- CI permanece verde.

## Invariants And Failure Modes

*Rascunho para o portão de design (plano sensível: controle de acesso entre roles e dados de terceiros).*

Invariantes:

- **O controle de acesso está no servidor** (403 para `Member`); a interface só reflete: a rota de supervisão decide pelo papel de `GET /auth/me` (conferido a cada renovação), nunca por dado guardado no navegador.
- **Somente leitura:** nenhum caminho de código monta `PUT`/`DELETE`/`POST` contra `/vault/users/...` (além do recálculo); a UI não oferece o controle.
- **Dados de terceiros não sobram na memória:** a lista e o detalhe saem do cache de consultas no fim da sessão/troca de conta (`017`); nada em storage.
- **Senhas de terceiros só sob ação explícita** (revelar), nunca por padrão; sem copiar automático. *A decidir na aprovação.*
- **Perda de privilégio durante a sessão** (role alterado): a próxima conferência de conta/401 derruba o acesso; a UI não continua exibindo a área.

Modos de falha:

- **Recálculo retroativo (operação em lote):** duplo clique/duas abas não podem disparar duas execuções concorrentes sem aviso; falha parcial mostra o resultado real devolvido pela API, não "sucesso".
- **ID de usuário inexistente/inválido:** mensagem específica, sem expor detalhes internos.
- **API lenta:** estado de carregamento e cancelamento ao sair da tela.

## Known Limitations

- O backend não registra trilha de auditoria do acesso de Admin ao cofre de outro usuário (fora deste plano; candidata a plano próprio).
- Sem diretório de usuários: o Admin precisa saber o ID (evolução futura já documentada).

## Verification Matrix

| Invariante ou critério | Teste (a definir na implementação) | Prova de que o teste falha sem o comportamento |
| --- | --- | --- |
| `Member` não acessa a rota | teste de rota com role `Member` | mutação: decidir pelo estado local, não por `/auth/me` |
| Somente leitura | teste que varre as chamadas feitas pela área | mutação: expor um botão de editar |
| Dados saem do cache na troca de conta | teste com tela montada | mutação: remover o reset |
| Recálculo não duplica | teste de duplo clique | mutação: não desabilitar o controle |
| Perda de privilégio fecha a área | teste com `/auth/me` devolvendo `Member` | mutação: manter a área aberta |

## Documentation Updates

- `docs/capabilities/web-interface/README.md`: documentar a área de supervisão implementada e reafirmar que o painel completo (diretório de usuários, métricas) segue como evolução futura.
- `README.md` (raiz): Current Scope passa a listar a supervisão mínima do Admin na interface web, mantendo o painel completo como fora do escopo atual; Quick Start e Stack: constatação deliberada de que não mudam.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
