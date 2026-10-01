using Keytography.Api.Auth;
using Keytography.Api.PasswordEvaluation;
using Keytography.Api.Vault;
using Keytography.Domain;
using Keytography.Domain.PasswordEvaluation;
using Keytography.Domain.PasswordEvaluation.Criteria;
using Keytography.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json;

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

builder.Services.AddScoped<IEmailSender, LoggingEmailSender>();

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
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey))
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

app.UseAuthentication();
app.UseAuthorization();

app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var payload = JsonSerializer.Serialize(new
        {
            status = report.Status.ToString().ToLowerInvariant(),
            checks = report.Entries.Select(entry => new
            {
                name = entry.Key,
                status = entry.Value.Status.ToString().ToLowerInvariant()
            })
        });
        await context.Response.WriteAsync(payload);
    }
});

app.MapAuthEndpoints();
app.MapVaultEndpoints();
app.MapPasswordEvaluationEndpoints();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<KeytographyDbContext>();
    dbContext.Database.Migrate();
}

app.Run();

public partial class Program;
