# ADR-0001: Criptografia do cofre com chave dupla e recuperação de acesso

## Context

Duas regras já confirmadas do domínio entram em tensão direta:

1. Senhas armazenadas nunca podem ficar em texto puro (`PROJECT-ARCHITECTURE.md`, Core Principles).
2. Um usuário com role `Admin` pode **consultar** (somente leitura) o cofre de qualquer outro usuário, sem nunca ter acesso à senha de login desse usuário (`capabilities/authentication-and-users`).

Um esquema de criptografia "zero-knowledge" puro — onde só a senha de login do próprio dono deriva a chave capaz de decifrar seu cofre — torna a regra 2 impossível de cumprir sem compartilhar a senha do usuário com o Admin, o que violaria a própria regra. Ao mesmo tempo, um esquema onde o sistema guarda uma única chave mestra capaz de decifrar tudo remove qualquer proteção real dos dados.

Isso também bloqueava a segunda pendência já sinalizada em `capabilities/authentication-and-users`: como o fluxo de "Esqueci minha senha" pode funcionar sem perder acesso permanente ao cofre, já que não existe uma "master password" separada da senha de login.

## Decision

Cada entrada de cofre é cifrada com uma **chave de dados simétrica (DEK — Data Encryption Key)** por usuário, usando **AES-256-GCM**.

A DEK nunca é armazenada em texto puro. Em vez disso, ela é armazenada em **duas cópias cifradas independentes** (a "chave dupla"):

1. **Cópia do dono:** a DEK é cifrada com uma chave derivada da senha de login do próprio usuário via **Argon2id** (KDF resistente a força bruta). Essa chave derivada nunca é persistida — é recalculada em memória a cada login e descartada ao final da sessão.
2. **Cópia de recuperação:** a DEK é cifrada com uma **chave pública de recuperação do sistema** (par assimétrico, **RSA-OAEP**, mínimo 3072 bits). A chave privada correspondente é mantida sob custódia do sistema/operação (não de um usuário `Admin` individual como pessoa) e usada exclusivamente para dois fluxos:
   - Consulta de supervisão de um `Admin` a um cofre alheio.
   - Conclusão do fluxo de recuperação de senha (`esqueci minha senha`), quando a cópia do dono não pode mais ser desfeita porque a senha de login mudou.

Fluxo de troca/recuperação de senha de login: o sistema desfaz a DEK usando a cópia de recuperação (chave privada do sistema), e gera uma nova cópia do dono cifrando a mesma DEK com a chave derivada da nova senha. A DEK em si nunca muda — só a forma como cada cópia dela é protegida. Nenhuma entrada de cofre precisa ser re-cifrada quando o usuário troca de senha.

## Consequences

- O `Admin` consegue cumprir seu papel de supervisão sem nunca ter acesso à senha de login de outro usuário.
- A recuperação de senha não causa perda permanente de dados — resolve o ponto crítico sinalizado em `capabilities/authentication-and-users`.
- **A chave privada de recuperação do sistema se torna o segredo de maior valor de todo o sistema** — quem a possui pode decifrar qualquer cofre. Sua proteção (armazenamento, rotação, controle de acesso a nível de infraestrutura) é um requisito de segurança crítico a ser desenhado quando a infraestrutura de produção for decidida; até lá, em ambiente de desenvolvimento local, ela pode viver em configuração local não versionada.
- O esquema deixa de ser "zero-knowledge" do ponto de vista do operador do sistema — isso é uma escolha deliberada, decorrente da própria regra de negócio de supervisão do Admin, não uma fraqueza introduzida por esta decisão.
- Uma migração futura para sincronização em nuvem ou hospedagem remota (hoje um Non-Goal) precisará revisitar onde e como a chave privada de recuperação é custodiada.

## Alternatives Considered

- **Zero-knowledge puro (chave derivada só da senha do dono, sem cópia de recuperação):** rejeitado — torna a regra de supervisão do Admin impossível de cumprir, e qualquer esquecimento de senha destruiria o cofre permanentemente.
- **Criptografia assimétrica pura de cada campo (RSA direto sobre o conteúdo da senha/campos), sem uma DEK simétrica intermediária:** rejeitado — RSA não é adequado para cifrar dados de tamanho variável em volume, e é significativamente mais lento que AES-GCM para essa finalidade.
- **Uma única chave mestra do sistema decifrando tudo diretamente (sem chave por usuário):** rejeitado — remove a segmentação por usuário e amplia o dano de um vazamento da chave mestra para a totalidade dos dados sem nenhuma camada intermediária.

## Canonical Links

- [docs/capabilities/authentication-and-users/README.md](../capabilities/authentication-and-users/README.md)
- [docs/capabilities/vault-entries/README.md](../capabilities/vault-entries/README.md)
- [docs/PROJECT-ARCHITECTURE.md](../PROJECT-ARCHITECTURE.md)
