namespace Keytography.Domain;

/// <summary>
/// Cache em memoria, por sessao, da DEK ja decifrada (ADR-0002, ADR-0006). Existe porque a
/// derivacao Argon2id (ADR-0001) e propositalmente lenta - refazer a cada requisicao ao
/// cofre nao e viavel, e a senha em texto puro so existe no momento do login. Indexado
/// pelo Id da sessao (e nao do usuario) para que varias sessoes simultaneas coexistam e
/// encerrar uma nao afete as outras. Nunca persistido em disco.
/// </summary>
public interface IDekCache
{
    void Set(Guid sessionId, byte[] dek, TimeSpan ttl);
    byte[]? Get(Guid sessionId);
    void Remove(Guid sessionId);
}
