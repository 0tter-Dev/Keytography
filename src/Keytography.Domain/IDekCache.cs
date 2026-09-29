namespace Keytography.Domain;

/// <summary>
/// Cache em memoria, por usuario, da DEK ja decifrada de uma sessao autenticada.
/// Existe porque a derivacao Argon2id (ADR-0001) e propositalmente lenta - refazer
/// a cada requisicao ao cofre nao e viavel, e a senha em texto puro so existe no
/// momento do login. Nunca persistido em disco.
/// </summary>
public interface IDekCache
{
    void Set(Guid userId, byte[] dek, TimeSpan ttl);
    byte[]? Get(Guid userId);
    void Remove(Guid userId);
}
