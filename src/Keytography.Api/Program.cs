using Keytography.Api;
using Keytography.Api.Auth;
using Keytography.Api.Health;
using Keytography.Api.OpenApi;
using Keytography.Api.PasswordEvaluation;
using Keytography.Api.PasswordGeneration;
using Keytography.Api.Vault;
using Keytography.Domain;
using Keytography.Domain.PasswordEvaluation;
using Keytography.Domain.PasswordEvaluation.Criteria;
using Keytography.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Text;

const string WebCorsPolicy = "web";

var builder = WebApplication.CreateBuilder(args);

// A leitura da configuracao fica dentro dos callbacks (avaliados na resolucao via DI,
// depois de builder.Build()) para que overrides de configuracao de teste
// (WebApplicationFactory.ConfigureWebHost) sejam respeitados corretamente.
builder.Services.AddDbContext<KeytographyDbContext>((serviceProvider, options) =>
{
    var configuration = serviceProvider.GetRequiredService<IConfiguration>();
    var connectionString = configuration.GetConnectionString("Keytography") ?? "Data Source=keytography.db";
    options.UseSqlite(connectionString);
});

builder.Services.AddHealthChecks()
    .AddDbContextCheck<KeytographyDbContext>("database");

builder.Services.AddOpenApi(options => options.AddSchemaTransformer<NumericSchemaTransformer>());

// Origens permitidas lidas via DI (apos builder.Build()) para respeitar overrides de
// configuracao de teste. Padrao: servidor de desenvolvimento do Vite (web/).
builder.Services.AddCors();
builder.Services.AddOptions<CorsOptions>().Configure<IConfiguration>((options, configuration) =>
{
    // Credenciais (cookie de refresh) exigem origens explicitas: nunca "qualquer origem".
    options.AddPolicy(WebCorsPolicy, policy => policy
        .WithOrigins(AllowedOrigins.Resolve(configuration))
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

builder.Services.AddScoped<IEmailSender, LoggingEmailSender>();

builder.Services.AddSingleton(TimeProvider.System);

// Tempos de vida das sessoes (keytography-016); valores invalidos falham no startup.
builder.Services.AddOptions<SessionLifetimeOptions>()
    .BindConfiguration(SessionLifetimeOptions.SectionName)
    .Validate(options =>
    {
        options.Validate();
        return true;
    })
    .ValidateOnStart();
builder.Services.AddScoped<SessionService>();

builder.Services.AddMemoryCache();
builder.Services.AddSingleton<IDekCache, MemoryDekCache>();
builder.Services.AddSingleton<IRecoveryKeyProvider, RecoveryKeyProvider>();

// Lista aberta de criterios de avaliacao de senha (capabilities/password-evaluation) -
// novos criterios sao adicionados registrando mais implementacoes aqui, sem alterar
// os ja existentes nem o motor de agregacao (Keytography.Domain.PasswordEvaluation).
builder.Services.AddSingleton<IPasswordEvaluationCriterion, LengthCriterion>();
builder.Services.AddSingleton<IPasswordEvaluationCriterion, EntropyCriterion>();
builder.Services.AddSingleton<IPasswordEvaluationCriterion, ReuseCriterion>();
builder.Services.AddSingleton<IPasswordEvaluationCriterion, ComplexityCriterion>();

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var jwtKey = builder.Configuration["Jwt:Key"]
            ?? throw new InvalidOperationException(
                "Jwt:Key não configurado. Defina via `dotnet user-secrets set \"Jwt:Key\" \"<valor>\"` (ver docs/guides/running-locally.md).");
        var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "Keytography";
        var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "Keytography";

        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            // Sem tolerancia de relogio: a sessao (conferida no banco) e quem manda, e o access
            // token vale exatamente o tempo configurado em Sessions:AccessTokenMinutes.
            ClockSkew = TimeSpan.Zero
        };

        // O JWT so vale enquanto a sessao dele (claim "sid") existir, nao estiver revogada e nao
        // tiver expirado: revogar (logout, reset de senha, reuso de refresh) vale na hora.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var principal = context.Principal!;
                var sessions = context.HttpContext.RequestServices.GetRequiredService<SessionService>();
                var userIdClaim = principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;

                if (!principal.TryGetSessionId(out var sessionId)
                    || !Guid.TryParse(userIdClaim, out var userId)
                    || await sessions.FindActiveAsync(sessionId, userId, context.HttpContext.RequestAborted) is null)
                {
                    context.Fail("Sessão inválida, revogada ou expirada.");
                }
            }
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

// Checagem de "fail-fast": falha alto e cedo se a chave nao estiver configurada,
// lendo de app.Configuration (ja com os overrides de teste mesclados).
if (string.IsNullOrEmpty(app.Configuration["Jwt:Key"]))
{
    throw new InvalidOperationException(
        "Jwt:Key não configurado. Defina via `dotnet user-secrets set \"Jwt:Key\" \"<valor>\"` (ver docs/guides/running-locally.md).");
}

// Forca a construcao aqui (fail-fast): valida e faz o parse do PEM logo no startup,
// em vez de falhar de forma tardia e confusa na primeira operacao de cofre.
app.Services.GetRequiredService<IRecoveryKeyProvider>();

app.UseCors(WebCorsPolicy);
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// MapGet (em vez de MapHealthChecks) para o endpoint aparecer no OpenAPI com seu DTO tipado.
app.MapGet("/health", async (HealthCheckService healthCheckService, CancellationToken cancellationToken) =>
    {
        var report = await healthCheckService.CheckHealthAsync(cancellationToken);
        var response = new HealthResponse(
            report.Status.ToString().ToLowerInvariant(),
            report.Entries
                .Select(entry => new HealthCheckEntryResponse(entry.Key, entry.Value.Status.ToString().ToLowerInvariant()))
                .ToList());

        return Results.Json(
            response,
            statusCode: report.Status == HealthStatus.Unhealthy
                ? StatusCodes.Status503ServiceUnavailable
                : StatusCodes.Status200OK);
    })
    .Produces<HealthResponse>()
    .Produces<HealthResponse>(StatusCodes.Status503ServiceUnavailable);

app.MapAuthEndpoints();
app.MapVaultEndpoints();
app.MapPasswordEvaluationEndpoints();
app.MapPasswordGenerationEndpoints();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
    dbContext.Database.Migrate();
}

app.Run();

public partial class Program;
