using System.Security.Cryptography;
using Keytography.Domain;
using Microsoft.Extensions.Caching.Memory;

namespace Keytography.Infrastructure;

/// <summary>
/// Cache de DEK em memoria do processo (ADR-0002/0006). Cada entrada guarda a PROPRIA copia da
/// DEK e a zera quando e removida, substituida ou expira; <see cref="Get"/> devolve copias.
/// </summary>
public class MemoryDekCache : IDekCache
{
    private readonly IMemoryCache _cache;

    public MemoryDekCache(IMemoryCache cache)
    {
        _cache = cache;
    }

    /// <summary>Entrada do cache: a DEK e o travamento que impede copiar e zerar ao mesmo tempo.</summary>
    public sealed class Entry
    {
        private readonly object _gate = new();
        private readonly byte[] _dek;

        internal Entry(byte[] dek)
        {
            _dek = (byte[])dek.Clone();
        }

        public bool IsZeroed { get; private set; }

        internal byte[]? Copy()
        {
            lock (_gate)
            {
                return IsZeroed ? null : (byte[])_dek.Clone();
            }
        }

        internal void Zero()
        {
            lock (_gate)
            {
                CryptographicOperations.ZeroMemory(_dek);
                IsZeroed = true;
            }
        }
    }

    private static string Key(Guid sessionId) => $"dek:{sessionId}";

    public void Set(Guid sessionId, byte[] dek, TimeSpan ttl)
    {
        var key = Key(sessionId);
        _cache.TryGetValue(key, out Entry? previous);

        var options = new MemoryCacheEntryOptions { AbsoluteExpirationRelativeToNow = ttl };
        // Expiracao e remocoes internas do cache tambem zeram a DEK (idempotente com o Remove abaixo).
        options.RegisterPostEvictionCallback((_, value, _, _) => (value as Entry)?.Zero());
        _cache.Set(key, new Entry(dek), options);

        previous?.Zero();
    }

    public byte[]? Get(Guid sessionId) =>
        _cache.TryGetValue(Key(sessionId), out Entry? entry) ? entry!.Copy() : null;

    public void Remove(Guid sessionId)
    {
        var key = Key(sessionId);
        _cache.TryGetValue(key, out Entry? entry);
        _cache.Remove(key);
        entry?.Zero();
    }
}
