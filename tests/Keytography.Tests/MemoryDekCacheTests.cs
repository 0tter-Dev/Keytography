using Keytography.Domain;
using Keytography.Domain.Security;
using Keytography.Infrastructure;
using Microsoft.Extensions.Caching.Memory;

namespace Keytography.Tests;

/// <summary>A DEK em cache e zerada ao sair (remocao, substituicao, expiracao) e so circula em copias.</summary>
public class MemoryDekCacheTests
{
    private static byte[] NewDek() => Enumerable.Range(1, 32).Select(i => (byte)i).ToArray();

    private static (MemoryCache Memory, MemoryDekCache Cache) Create()
    {
        var memory = new MemoryCache(new MemoryCacheOptions());
        return (memory, new MemoryDekCache(memory));
    }

    private static MemoryDekCache.Entry StoredEntry(MemoryCache memory, Guid sessionId)
    {
        Assert.True(memory.TryGetValue($"dek:{sessionId}", out MemoryDekCache.Entry? entry));
        return entry!;
    }

    [Fact]
    public void Get_returns_a_copy_that_the_caller_can_zero_without_touching_the_cache()
    {
        var (_, cache) = Create();
        var id = Guid.NewGuid();
        cache.Set(id, NewDek(), TimeSpan.FromMinutes(5));

        var first = cache.Get(id)!;
        Array.Clear(first); // o chamador zera a sua copia...

        Assert.Equal(NewDek(), cache.Get(id)); // ...e o cache continua intacto
    }

    [Fact]
    public void Set_keeps_its_own_copy_so_the_caller_can_zero_the_array_it_passed()
    {
        var (_, cache) = Create();
        var id = Guid.NewGuid();
        var dek = NewDek();

        cache.Set(id, dek, TimeSpan.FromMinutes(5));
        Array.Clear(dek);

        Assert.Equal(NewDek(), cache.Get(id));
    }

    [Fact]
    public void Remove_zeroes_the_stored_dek_immediately_and_is_idempotent()
    {
        var (memory, cache) = Create();
        var id = Guid.NewGuid();
        cache.Set(id, NewDek(), TimeSpan.FromMinutes(5));
        var stored = StoredEntry(memory, id);

        cache.Remove(id);
        cache.Remove(id);

        Assert.True(stored.IsZeroed);
        Assert.Null(cache.Get(id));
    }

    [Fact]
    public void Replacing_an_entry_zeroes_the_old_one()
    {
        var (memory, cache) = Create();
        var id = Guid.NewGuid();
        cache.Set(id, NewDek(), TimeSpan.FromMinutes(5));
        var old = StoredEntry(memory, id);

        cache.Set(id, NewDek(), TimeSpan.FromMinutes(5));

        Assert.True(old.IsZeroed);
        Assert.Equal(NewDek(), cache.Get(id));
    }

    [Fact]
    public async Task Expiration_zeroes_the_stored_dek()
    {
        var (memory, cache) = Create();
        var id = Guid.NewGuid();
        cache.Set(id, NewDek(), TimeSpan.FromMilliseconds(50));
        var stored = StoredEntry(memory, id);

        await Task.Delay(150);
        Assert.Null(cache.Get(id)); // o acesso detecta a expiracao e dispara o callback de remocao

        for (var i = 0; i < 40 && !stored.IsZeroed; i++)
        {
            await Task.Delay(50); // callbacks de remocao rodam no ThreadPool
        }

        Assert.True(stored.IsZeroed);
    }

    [Fact]
    public async Task A_copy_taken_while_the_entry_is_being_removed_is_never_half_zeroed()
    {
        var (_, cache) = Create();
        var expected = NewDek();

        for (var round = 0; round < 300; round++)
        {
            var id = Guid.NewGuid();
            cache.Set(id, expected, TimeSpan.FromMinutes(5));
            var readers = Enumerable.Range(0, 4).Select(_ => Task.Run(() =>
            {
                for (var i = 0; i < 50; i++)
                {
                    var copy = cache.Get(id);
                    Assert.True(copy is null || copy.SequenceEqual(expected), "Copia parcialmente zerada.");
                }
            })).ToArray();

            cache.Remove(id);
            await Task.WhenAll(readers);
        }
    }

    [Fact]
    public void Lease_hands_out_a_copy_that_is_zeroed_on_dispose()
    {
        var (_, cache) = Create();
        var id = Guid.NewGuid();
        cache.Set(id, NewDek(), TimeSpan.FromMinutes(5));

        byte[] leased;
        using (var secret = cache.Lease(id)!)
        {
            leased = secret.Value;
            Assert.Equal(NewDek(), leased);
        }

        Assert.All(leased, b => Assert.Equal(0, b));
        Assert.Equal(NewDek(), cache.Get(id)); // a entrada do cache nao foi afetada
        Assert.Null(cache.Lease(Guid.NewGuid()));
    }

    [Fact]
    public void SecretBytes_zeroes_its_value_when_disposed()
    {
        var value = NewDek();

        new SecretBytes(value).Dispose();

        Assert.All(value, b => Assert.Equal(0, b));
    }
}
