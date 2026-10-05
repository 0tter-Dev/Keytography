using Keytography.Domain.Security;

namespace Keytography.Domain;

/// <summary>
/// Cache em memoria, por sessao, da DEK ja decifrada (ADR-0002, ADR-0006). Existe porque a
/// derivacao Argon2id (ADR-0001) e propositalmente lenta - refazer a cada requisicao ao
/// cofre nao e viavel, e a senha em texto puro so existe no momento do login. Indexado
/// pelo Id da sessao (e nao do usuario) para que varias sessoes simultaneas coexistam e
/// encerrar uma nao afete as outras. Nunca persistido em disco.
/// </summary>
/// <remarks>
/// O cache guarda a sua propria copia da DEK e a zera ao remover, substituir ou expirar a
/// entrada. Por isso <see cref="Get"/> devolve uma COPIA: quem a recebe e dono dela e deve
/// zera-la depois do uso (prefira <see cref="DekCacheExtensions.Lease"/>), e entradas em uso por
/// uma requisicao nao sao corrompidas por uma revogacao concorrente.
/// </remarks>
public interface IDekCache
{
    /// <summary>Guarda uma copia de <paramref name="dek"/>; o chamador continua dono do vetor que passou.</summary>
    void Set(Guid sessionId, byte[] dek, TimeSpan ttl);

    /// <summary>Copia da DEK da sessao (o chamador deve zera-la), ou null se nao houver.</summary>
    byte[]? Get(Guid sessionId);

    /// <summary>Remove a entrada e zera a DEK guardada. Idempotente.</summary>
    void Remove(Guid sessionId);
}

public static class DekCacheExtensions
{
    /// <summary>DEK da sessao como <see cref="SecretBytes"/> (zerado no <c>Dispose</c>), ou null.</summary>
    public static SecretBytes? Lease(this IDekCache cache, Guid sessionId) =>
        cache.Get(sessionId) is { } dek ? new SecretBytes(dek) : null;
}
