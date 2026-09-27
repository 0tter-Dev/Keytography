namespace Keytography.Domain;

public class UserToken
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required Guid UserId { get; set; }
    public required UserTokenPurpose Purpose { get; set; }
    public required string Token { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }

    public bool IsValid(DateTimeOffset now) => UsedAt is null && now < ExpiresAt;
}
