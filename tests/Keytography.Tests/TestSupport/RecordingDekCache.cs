using Keytography.Domain;

namespace Keytography.Tests.TestSupport;

/// <summary>Decorator do cache de DEK que registra as chamadas, para testar o TTL e a remocao por sessao.</summary>
public class RecordingDekCache : IDekCache
{
    private readonly IDekCache _inner;

    public RecordingDekCache(IDekCache inner)
    {
        _inner = inner;
    }

    public List<(Guid SessionId, TimeSpan Ttl)> SetCalls { get; } = [];
    public List<Guid> RemoveCalls { get; } = [];

    /// <summary>Executado logo depois de cada Set: permite simular um logout concorrente nesse instante.</summary>
    public Action<Guid>? AfterSet { get; set; }

    public void Set(Guid sessionId, byte[] dek, TimeSpan ttl)
    {
        SetCalls.Add((sessionId, ttl));
        _inner.Set(sessionId, dek, ttl);
        AfterSet?.Invoke(sessionId);
    }

    public byte[]? Get(Guid sessionId) => _inner.Get(sessionId);

    public void Remove(Guid sessionId)
    {
        RemoveCalls.Add(sessionId);
        _inner.Remove(sessionId);
    }
}
