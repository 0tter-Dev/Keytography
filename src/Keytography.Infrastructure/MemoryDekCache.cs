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

    private static string Key(Guid userId) => $"dek:{userId}";

    public void Set(Guid userId, byte[] dek, TimeSpan ttl) =>
        _cache.Set(Key(userId), dek, ttl);

    public byte[]? Get(Guid userId) =>
        _cache.TryGetValue(Key(userId), out byte[]? dek) ? dek : null;

    public void Remove(Guid userId) => _cache.Remove(Key(userId));
}
