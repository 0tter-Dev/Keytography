using Microsoft.EntityFrameworkCore;

namespace Keytography.Infrastructure;

public class KeytographyDbContext : DbContext
{
    public KeytographyDbContext(DbContextOptions<KeytographyDbContext> options)
        : base(options)
    {
    }
}
