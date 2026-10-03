namespace Keytography.Api.Health;

public record HealthCheckEntryResponse(string Name, string Status);

public record HealthResponse(string Status, List<HealthCheckEntryResponse> Checks);
