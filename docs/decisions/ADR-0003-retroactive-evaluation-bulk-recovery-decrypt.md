# ADR-0003: Recálculo retroativo de avaliação de senha via decifragem em lote pela chave de recuperação

## Context

`capabilities/password-evaluation` exige que, quando um novo critério de avaliação é registrado no sistema, a nota de **todas as entradas de cofre de todos os usuários** seja recalculada retroativamente — não só as de quem estiver logado no momento (`keytography-005`, Acceptance Criteria).

Isso entra em tensão direta com o modelo de acesso à DEK definido em `ADR-0001`/`ADR-0002`: a cópia "do dono" da DEK só existe decifrada em memória durante a sessão de um usuário autenticado (cache por JWT). Um usuário que não está logado no momento em que o novo critério é registrado não tem essa cópia disponível — não há senha de login em texto puro para derivar a chave Argon2id.

`ADR-0001` já previu um segundo caminho de acesso à DEK — a **cópia de recuperação**, cifrada com a chave RSA do sistema — mas até aqui ela só era usada para dois fluxos pontuais e explicitamente humanos: consulta de supervisão do `Admin` a **um** cofre por vez, e conclusão de troca de senha do **próprio** dono. Usar essa mesma chave para decifrar a DEK de **todos os usuários de uma vez**, disparado por um evento de sistema (registro de um novo critério) sem nenhuma ação humana por usuário, é um uso qualitativamente diferente — maior superfície de uso da chave privada de recuperação, o segredo de maior valor do sistema (`ADR-0001`, Consequences).

## Decision

O recálculo retroativo é implementado como um processo em lote que, ao registrar um novo critério de avaliação:

1. Itera todos os `VaultKey` existentes.
2. Para cada um, desfaz a DEK usando a cópia de recuperação (`RsaEnvelope.Unwrap` com a chave RSA do sistema) — o mesmo mecanismo já usado na supervisão do Admin e na conclusão de troca de senha, aplicado agora em lote a todos os usuários em vez de a um usuário por vez.
3. Com a DEK de cada usuário, decifra as senhas de suas entradas de cofre (atuais e, quando aplicável, do histórico) o tempo suficiente para rodar os critérios de avaliação em memória, sem persistir a senha decifrada em nenhum momento.
4. Grava a nota recalculada por entrada; a DEK decifrada em memória é descartada ao final do processamento de cada usuário (nunca cacheada, ao contrário do cache de sessão do dono definido em `ADR-0002`).

O mesmo mecanismo (decifragem em lote pela chave de recuperação) passa a ser o caminho padrão para qualquer recálculo retroativo futuro de avaliação, não só para o conjunto inicial de critérios deste plano.

## Consequences

- Qualquer usuário tem sua nota de força de senha recalculada imediatamente quando um novo critério é registrado, mesmo sem estar logado — cumpre o Acceptance Criteria de `keytography-005` sem exigir login prévio.
- A chave privada de recuperação passa a ser exercitada em um fluxo automatizado que toca o cofre de **todos** os usuários de uma só vez, não só consultas pontuais de um Admin humano a um usuário por vez. Isso amplia a superfície de uso desse segredo crítico: um processo comprometido que dispare esse recálculo indevidamente teria, na prática, o mesmo alcance de decifragem que já era tecnicamente possível com a chave (ADR-0001 já reconhece que quem possui essa chave "pode decifrar qualquer cofre"), mas agora exercitado em lote por um caminho de código novo. Esse caminho deve ser tratado com o mesmo cuidado de proteção que qualquer outro uso da chave de recuperação quando a infraestrutura de produção for desenhada (ver `ADR-0001`, Consequences).
- O processo de recálculo retroativo pode ser custoso (decifra e reavalia todas as entradas de todos os usuários); isso é aceitável para o volume atual do projeto, mas deve ser revisitado (ex.: processamento assíncrono/em fila) se o número de usuários/entradas crescer o suficiente para tornar o recálculo síncrono impraticável.
- Nenhuma senha decifrada em lote é persistida ou logada em nenhum momento — só a nota resultante e o detalhamento por critério.

## Alternatives Considered

- **Recálculo preguiçoso (só no próximo login do dono):** rejeitado nesta entrega — o usuário decidiu explicitamente que o recálculo deve ser imediato para todos, inclusive usuários offline, conforme o Acceptance Criteria já escrito em `keytography-005`. Evitaria o uso em lote da chave de recuperação, mas divergiria do critério de aceite sem emendar o plano.
- **Exigir um segredo administrativo adicional (fora da chave de recuperação já existente) só para recálculo em lote:** rejeitado por ora — introduziria um novo segredo de infraestrutura sem benefício claro sobre reutilizar a chave de recuperação já existente e já qualificada como o segredo de maior sensibilidade do sistema; revisitar se a separação de responsabilidades exigir isso no futuro.

## Canonical Links

- [docs/decisions/ADR-0001-vault-encryption-and-recovery.md](./ADR-0001-vault-encryption-and-recovery.md)
- [docs/decisions/ADR-0002-dek-session-cache.md](./ADR-0002-dek-session-cache.md)
- [docs/capabilities/password-evaluation/README.md](../capabilities/password-evaluation/README.md)
- [docs/capabilities/vault-entries/README.md](../capabilities/vault-entries/README.md)
