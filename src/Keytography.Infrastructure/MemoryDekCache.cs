using Keytography.Domain;
using Microsoft.Extensions.Caching.Memory;

namespace Keytography.Infrastructure;

public class MemoryDekCache : IDekCache
{
    private readonly IMemoryCache _cache;

    public MemoryDekCache(IMemoryCache cache)
    {
        _cache = cache;
    }

    private static string Key(Guid sessionId) => $"dek:{sessionId}";

    public void Set(Guid sessionId, byte[] dek, TimeSpan ttl) =>
        _cache.Set(Key(sessionId), dek, ttl);

    public byte[]? Get(Guid sessionId) =>
        _cache.TryGetValue(Key(sessionId), out byte[]? dek) ? dek : null;

    public void Remove(Guid sessionId) => _cache.Remove(Key(sessionId));
}
