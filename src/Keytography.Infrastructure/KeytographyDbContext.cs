using Keytography.Domain;
using Microsoft.EntityFrameworkCore;

namespace Keytography.Infrastructure;

public class KeytographyDbContext : DbContext
{
    public KeytographyDbContext(DbContextOptions<KeytographyDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<UserToken> UserTokens => Set<UserToken>();
    public DbSet<UserPasswordHistory> UserPasswordHistories => Set<UserPasswordHistory>();
    public DbSet<VaultKey> VaultKeys => Set<VaultKey>();
    public DbSet<VaultEntry> VaultEntries => Set<VaultEntry>();
    public DbSet<VaultEntryHistory> VaultEntryHistories => Set<VaultEntryHistory>();

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
