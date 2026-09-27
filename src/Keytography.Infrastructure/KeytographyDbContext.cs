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
    }
}
