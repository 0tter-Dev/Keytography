using Keytography.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Keytography.Infrastructure;

public class KeytographyDbContext : DbContext
{
    public KeytographyDbContext(DbContextOptions<KeytographyDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<UserToken> UserTokens => Set<UserToken>();
    public DbSet<UserSession> UserSessions => Set<UserSession>();
    public DbSet<UserPasswordHistory> UserPasswordHistories => Set<UserPasswordHistory>();
    public DbSet<VaultKey> VaultKeys => Set<VaultKey>();
    public DbSet<VaultEntry> VaultEntries => Set<VaultEntry>();
    public DbSet<VaultEntryHistory> VaultEntryHistories => Set<VaultEntryHistory>();

    private static readonly ValueConverter<DateTimeOffset, long> UtcTicks = new(
        value => value.UtcTicks,
        ticks => new DateTimeOffset(ticks, TimeSpan.Zero));

    private static readonly ValueConverter<DateTimeOffset?, long?> NullableUtcTicks = new(
        value => value.HasValue ? value.Value.UtcTicks : null,
        ticks => ticks.HasValue ? new DateTimeOffset(ticks.Value, TimeSpan.Zero) : null);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasIndex(u => u.Login).IsUnique();
            entity.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<UserToken>(entity =>
        {
            entity.HasIndex(t => t.Token).IsUnique();
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(t => t.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasIndex(s => s.UserId);
            entity.HasIndex(s => s.RefreshTokenHash);
            entity.HasIndex(s => s.PreviousRefreshTokenHash);
            entity.Property(s => s.RevokedReason).HasConversion<string>();

            // SQLite nao compara DateTimeOffset no banco; guardar como ticks UTC (inteiro)
            // permite a limpeza e as consultas por data serem feitas no proprio banco.
            entity.Property(s => s.CreatedAt).HasConversion(UtcTicks);
            entity.Property(s => s.LastRefreshedAt).HasConversion(UtcTicks);
            entity.Property(s => s.IdleExpiresAt).HasConversion(UtcTicks);
            entity.Property(s => s.AbsoluteExpiresAt).HasConversion(UtcTicks);
            entity.Property(s => s.RefreshRotatedAt).HasConversion(NullableUtcTicks);
            entity.Property(s => s.RevokedAt).HasConversion(NullableUtcTicks);

            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<UserPasswordHistory>(entity =>
        {
            entity.HasIndex(h => h.UserId);
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(h => h.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VaultKey>(entity =>
        {
            entity.HasKey(k => k.UserId);
            entity.HasOne<User>()
                .WithOne()
                .HasForeignKey<VaultKey>(k => k.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VaultEntry>(entity =>
        {
            entity.HasIndex(e => new { e.UserId, e.IsDeleted });
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<VaultEntryHistory>(entity =>
        {
            entity.HasIndex(h => h.VaultEntryId);
            entity.HasOne<VaultEntry>()
                .WithMany()
                .HasForeignKey(h => h.VaultEntryId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
