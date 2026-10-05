# ADR-0002: Cache em memória da DEK por sessão

> **Atualização ([ADR-0006](./ADR-0006-backend-managed-sessions.md), `keytography-016`):** o cache passou a ser indexado pelo **id da sessão** (e não pelo usuário) e o TTL acompanha a expiração por inatividade da sessão, renovado a cada refresh; logout e revogação removem a DEK. O cache também guarda a própria cópia da DEK e a zera ao remover ou substituir a entrada e, quando ela expira, no próximo acesso ao cache (a expiração do `IMemoryCache` é preguiçosa; ver a ressalva no ADR-0006), e `Get` devolve cópias. O restante desta decisão (DEK só em memória, 401 sem DEK em cache, supervisão do `Admin` sem cache) continua valendo. Onde o texto abaixo diz "por usuário" e "tempo de vida do JWT", leia "por sessão" e "tempo de vida da sessão".

## Context

`ADR-0001` define que a cópia "do dono" da DEK é decifrada usando uma chave derivada da senha de login via **Argon2id**. Essa derivação é propositalmente lenta — é o que a torna resistente a força bruta — e não existe hoje nenhum mecanismo de "master password" separada: a senha de login é a única credencial que o usuário fornece.

Isso cria uma lacuna que o `ADR-0001` não cobria: depois que o usuário faz login e recebe um JWT, o servidor nunca mais tem a senha em texto puro (por design — o JWT não carrega a senha, só reivindicações de identidade). Sem a senha, não é possível re-derivar a chave via Argon2id a cada requisição de leitura/escrita no cofre. Ao mesmo tempo, re-derivar a cada requisição seria proibitivo em latência (a lentidão do Argon2id é intencional) e quebraria o modelo de autenticação stateless via JWT já implementado em `keytography-002`.

Era preciso decidir: onde e como o servidor mantém acesso à DEK já decifrada durante uma sessão autenticada, entre o momento do login e o fim da sessão (na decisão original, a expiração do JWT; desde o [ADR-0006](./ADR-0006-backend-managed-sessions.md), o fim da sessão).

## Decision

No login (`POST /auth/login`), imediatamente após validar a senha, o servidor:

1. Desfaz a cópia "do dono" da DEK usando a chave derivada da senha (Argon2id + `Argon2Salt` do usuário).
2. Guarda a DEK decifrada em um **cache em memória do processo**, indexado pelo **id da sessão** (na decisão original, pelo `UserId`; ver o [ADR-0006](./ADR-0006-backend-managed-sessions.md)), com expiração igual à da sessão criada na mesma operação (na decisão original, o tempo de vida do JWT).

Toda operação subsequente de cofre (`/vault/entries/*`) do próprio dono busca a DEK nesse cache pelo id da sessão (claim `sid`) extraído do JWT autenticado (originalmente, pelo `UserId`). Se o cache não tiver uma entrada (expirou, ou o processo reiniciou), a operação retorna 401 pedindo novo login — não há tentativa de reconstruir a DEK sem a senha.

A DEK **nunca** é persistida em disco, nunca aparece em claims do JWT, e nunca é enviada ao cliente. O cache existe inteiramente do lado do servidor, e é por processo (não hor izontalmente compartilhado entre instâncias).

A leitura de supervisão do `Admin` **não usa** esse cache: ela desfaz a DEK sob demanda, a cada requisição, usando a chave privada de recuperação do sistema (sempre disponível no processo, ver `ADR-0001`), sem depender de nenhuma sessão de login do usuário supervisionado.

## Consequences

- O acesso ao cofre do próprio dono fica amarrado à validade da sessão (originalmente, do JWT): quando ela termina ou é revogada, o cache expira ou é limpo junto, e o usuário precisa logar de novo para voltar a acessar o cofre — mesmo que reautenticação sozinha (sem alterar a senha) já resolva isso.
- O servidor mantém material de chave decifrado em memória para sessões ativas. Isso é um trade-off deliberado: dado que não há "master password" separada, e dado que um JWT roubado já concede acesso total à conta via os endpoints autenticados, o cache em memória não amplia a superfície de ataque de forma significativa além do que o próprio roubo do JWT já concede.
- Reinício do processo do servidor invalida todos os caches em memória — usuários com sessão ativa precisam logar novamente para voltar a acessar o cofre (o JWT em si continua válido até expirar, mas as operações de cofre falharão com 401 até novo login).
- Escalar horizontalmente (múltiplas instâncias do servidor) exigiria um cache compartilhado (ex.: Redis) em vez de cache em memória do processo — não necessário na fase atual (implantação local, uma instância), mas fica registrado como revisão necessária caso isso mude.
- Esta decisão não altera nada do esquema de criptografia em repouso definido no `ADR-0001` — afeta apenas como a DEK já decifrada circula durante uma sessão em memória.

## Alternatives Considered

- **Re-derivar a chave via Argon2id a cada requisição de cofre:** rejeitado — a lentidão proposital do Argon2id (na ordem de centenas de milissegundos) tornaria cada leitura/escrita no cofre perceptivelmente lenta, e exigiria reenviar a senha em toda requisição, o que também quebraria o modelo de autenticação via JWT.
- **Embutir a DEK como claim no próprio JWT:** rejeitado — JWTs assinados (JWS) não são criptografados por padrão; qualquer claim é visível a quem possui o token. Embora um JWT roubado já conceda acesso à conta, evitar colocar a DEK explicitamente no token mantém uma camada adicional de defesa em profundidade e evita acoplar a rotação/formato do token ao material de chave do cofre.
- **Exigir a senha em cada requisição de cofre (sem cache nem re-derivação implícita):** rejeitado — pelo mesmo motivo do primeiro item, e por ser uma experiência de uso inviável para um gerenciador de senhas de uso frequente.

## Canonical Links

- [docs/decisions/ADR-0001-vault-encryption-and-recovery.md](./ADR-0001-vault-encryption-and-recovery.md)
- [docs/capabilities/authentication-and-users/README.md](../capabilities/authentication-and-users/README.md)
- [docs/capabilities/vault-entries/README.md](../capabilities/vault-entries/README.md)
