---
id: keytography-003
status: backlog
type: feat
requires_pull_request: true
expected_version_impact: minor
actual_version_impact: pending
priority: high
sequence: 3
depends_on: [keytography-002]
authorized_capabilities:
  - docs/capabilities/vault-entries/README.md
  - docs/capabilities/authentication-and-users/README.md
decision_records:
  - docs/decisions/ADR-0001-vault-encryption-and-recovery.md
validation: []
documentation_updates: []
---

# Entradas de cofre: CRUD e criptografia de envelope

## Objective

Implementar o CRUD de entradas de cofre (contas/senhas) com o esquema de criptografia de envelope definido em `ADR-0001`, histórico de senhas, soft delete, e leitura de supervisão do Admin.

## Context

`docs/capabilities/vault-entries/README.md` e `ADR-0001` definem as regras. Depende de `keytography-002` para autenticação/roles já existirem.

## Scope

- Geração de uma DEK (AES-256-GCM) por usuário na primeira vez que ele precisa de uma (ex.: no registro, ou lazy na primeira entrada de cofre).
- Cifragem da DEK em duas cópias: uma com chave derivada da senha de login (Argon2id), outra com a chave pública de recuperação do sistema (RSA-OAEP) — conforme `ADR-0001`.
- CRUD de entradas de cofre: criar, listar, ler, atualizar, soft-delete (lixeira) e restaurar/excluir definitivamente. Campos fixos (título, Login, Senha) + suporte a campos adicionais de schema livre.
- Persistência do histórico de senhas (login do usuário e de cada conta) a cada alteração.
- Endpoint de leitura de supervisão para `Admin`: lista/lê entradas de cofre de outro usuário, decifrando via a cópia de recuperação da DEK, sem nunca expor ou exigir a senha de login do dono. Sem permissão de escrita.

## Out Of Scope

- Conclusão do fluxo de recuperação de senha de login (plano `keytography-004`) — aqui só a infraestrutura de duas cópias da DEK é criada.
- Avaliação ou geração de senha (planos seguintes).
- Período de retenção automática da lixeira (fica manual por enquanto, exclusão definitiva é sempre uma ação explícita do usuário).

## Approval

## Acceptance Criteria

- Criar uma entrada de cofre (`POST /vault/entries`) com título, Login e Senha retorna 201, e a senha nunca aparece em texto puro em nenhuma resposta da API subsequente (só um indicador de que existe, nunca o valor decifrado fora do endpoint de leitura autenticado do próprio dono).
- Inspecionar diretamente o banco SQLite confirma que o campo de senha armazenado é ciphertext (não o texto original).
- Editar a senha de uma entrada existente preserva a versão anterior no histórico, consultável via um endpoint de histórico.
- Soft delete (`DELETE /vault/entries/{id}`) marca a entrada como excluída (não some da tabela); ela não aparece na listagem padrão mas aparece em uma listagem de lixeira; um endpoint de exclusão definitiva a remove de vez.
- Um usuário `Member` tentando ler o cofre de outro usuário via os endpoints normais recebe 403.
- Um usuário `Admin` consegue ler (não escrever) as entradas de cofre de outro usuário via o endpoint de supervisão; uma tentativa de escrita nesse mesmo endpoint (criar/editar/excluir) retorna 403.
- Trocar a senha de login do usuário não invalida o acesso às entradas já cifradas — validado por teste que gera uma nova cópia "do dono" da DEK e confirma que a DEK decifrada continua idêntica.
- O job `build` do CI permanece verde com os testes deste plano incluídos, sem exigir nenhuma mudança no workflow.

## Validation

- `dotnet test` cobrindo criação/leitura/edição/histórico/soft-delete/exclusão definitiva, controle de acesso por role, e o ciclo de cifragem/decifragem das duas cópias da DEK.
- Inspeção manual do arquivo SQLite confirmando ausência de texto puro nos campos sensíveis.
- Confirmar no GitHub Actions que o job `build` passou no PR desta entrega.

## Documentation Updates

- `docs/capabilities/vault-entries/README.md`: `Current Status` para `implemented`.
- `docs/STATUS.md`: refletir o novo status.

## Outcome
