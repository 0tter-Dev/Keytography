namespace Keytography.Tests.TestSupport;

/// <summary>Relogio controlavel: comeca no instante real e so avanca quando o teste manda.</summary>
public class TestTimeProvider : TimeProvider
{
    private DateTimeOffset _now = DateTimeOffset.UtcNow;

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;
}
