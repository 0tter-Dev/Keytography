using System.Security.Claims;
using System.Text.Json;
using Keytography.Domain;
using Keytography.Domain.Security;
using Keytography.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Keytography.Api.Vault;

public static class VaultEndpoints
{
    public static void MapVaultEndpoints(this WebApplication app)
    {
        var entries = app.MapGroup("/vault/entries").RequireAuthorization();

        entries.MapPost("/", CreateAsync);
        entries.MapGet("/", ListAsync);
        entries.MapGet("/trash", ListTrashAsync);
        entries.MapGet("/{id:guid}", GetAsync);
        entries.MapPut("/{id:guid}", UpdateAsync);
        entries.MapGet("/{id:guid}/history", GetHistoryAsync);
        entries.MapDelete("/{id:guid}", SoftDeleteAsync);
        entries.MapPost("/{id:guid}/restore", RestoreAsync);
        entries.MapDelete("/{id:guid}/permanent", PermanentDeleteAsync);

        // Supervisao do Admin: somente leitura, nunca escrita (ver ADR-0001 e
        // capabilities/authentication-and-users). As rotas de escrita abaixo
        // existem so para responder 403 de forma explicita, em vez de deixar
        // o roteamento cair num 404 generico para quem tentar escrever aqui.
        var supervision = app.MapGroup("/vault/users/{userId:guid}/entries")
            .RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.Admin)));

        supervision.MapGet("/", ListForSupervisionAsync);
        supervision.MapGet("/{id:guid}", GetForSupervisionAsync);
        supervision.MapPost("/", () => Results.StatusCode(StatusCodes.Status403Forbidden));
        supervision.MapPut("/{id:guid}", () => Results.StatusCode(StatusCodes.Status403Forbidden));
        supervision.MapDelete("/{id:guid}", () => Results.StatusCode(StatusCodes.Status403Forbidden));
    }

    private static async Task<IResult> CreateAsync(
        CreateVaultEntryRequest request,
        ClaimsPrincipal claimsPrincipal,
        KeytographyDbContext db,
        IDekCache dekCache,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var dek = dekCache.Get(userId);
        if (dek is null)
        {
            return SessionExpired();
        }

        if (ValidateTitle(request.Title) is { } invalidTitle)
        {
            return invalidTitle;
        }

        var entry = new VaultEntry
        {
            UserId = userId,
            Title = request.Title,
            Login = request.Login,
            EncryptedPassword = AesGcmCipher.EncryptString(dek, request.Password ?? string.Empty),
            AdditionalFieldsJson = SerializeFields(request.AdditionalFields)
        };

        db.VaultEntries.Add(entry);
        await db.SaveChangesAsync(cancellationToken);

        return Results.Created($"/vault/entries/{entry.Id}", ToDetail(entry, request.Password ?? string.Empty));
    }

    private static async Task<IResult> ListAsync(
        ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        // Ordenacao feita apos materializar: o provider SQLite do EF Core nao
        // suporta ORDER BY em colunas DateTimeOffset.
        var items = (await db.VaultEntries
            .Where(e => e.UserId == userId && !e.IsDeleted)
            .ToListAsync(cancellationToken))
            .OrderByDescending(e => e.UpdatedAt)
            .Select(e => new VaultEntryListItemResponse(e.Id, e.Title, e.Login, e.UpdatedAt));

        return Results.Ok(items);
    }

    private static async Task<IResult> ListTrashAsync(
        ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var items = (await db.VaultEntries
            .Where(e => e.UserId == userId && e.IsDeleted)
            .ToListAsync(cancellationToken))
            .OrderByDescending(e => e.DeletedAt)
            .Select(e => new VaultEntryListItemResponse(e.Id, e.Title, e.Login, e.UpdatedAt));

        return Results.Ok(items);
    }

    private static async Task<IResult> GetAsync(
        Guid id, ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, IDekCache dekCache, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var entry = await db.VaultEntries.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        if (entry.UserId != userId)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        var dek = dekCache.Get(userId);
        if (dek is null)
        {
            return SessionExpired();
        }

        return Results.Ok(ToDetail(entry, AesGcmCipher.DecryptString(dek, entry.EncryptedPassword)));
    }

    private static async Task<IResult> UpdateAsync(
        Guid id,
        UpdateVaultEntryRequest request,
        ClaimsPrincipal claimsPrincipal,
        KeytographyDbContext db,
        IDekCache dekCache,
        CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var entry = await db.VaultEntries.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        if (entry.UserId != userId)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        var dek = dekCache.Get(userId);
        if (dek is null)
        {
            return SessionExpired();
        }

        if (ValidateTitle(request.Title) is { } invalidTitle)
        {
            return invalidTitle;
        }

        var newPassword = request.Password ?? string.Empty;
        var currentPassword = AesGcmCipher.DecryptString(dek, entry.EncryptedPassword);

        if (currentPassword != newPassword)
        {
            db.VaultEntryHistories.Add(new VaultEntryHistory
            {
                VaultEntryId = entry.Id,
                EncryptedPassword = entry.EncryptedPassword
            });
            entry.EncryptedPassword = AesGcmCipher.EncryptString(dek, newPassword);
        }

        entry.Title = request.Title;
        entry.Login = request.Login;
        entry.AdditionalFieldsJson = SerializeFields(request.AdditionalFields);
        entry.UpdatedAt = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(ToDetail(entry, newPassword));
    }

    private static async Task<IResult> GetHistoryAsync(
        Guid id, ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, IDekCache dekCache, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var entry = await db.VaultEntries.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        if (entry.UserId != userId)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        var dek = dekCache.Get(userId);
        if (dek is null)
        {
            return SessionExpired();
        }

        var history = (await db.VaultEntryHistories
            .Where(h => h.VaultEntryId == id)
            .ToListAsync(cancellationToken))
            .OrderByDescending(h => h.ChangedAt);

        var result = history.Select(h =>
            new VaultEntryHistoryItemResponse(h.Id, AesGcmCipher.DecryptString(dek, h.EncryptedPassword), h.ChangedAt));

        return Results.Ok(result);
    }

    private static async Task<IResult> SoftDeleteAsync(
        Guid id, ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var entry = await db.VaultEntries.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        if (entry.UserId != userId)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        entry.IsDeleted = true;
        entry.DeletedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> RestoreAsync(
        Guid id, ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var entry = await db.VaultEntries.FirstOrDefaultAsync(e => e.Id == id && e.IsDeleted, cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        if (entry.UserId != userId)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        entry.IsDeleted = false;
        entry.DeletedAt = null;
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> PermanentDeleteAsync(
        Guid id, ClaimsPrincipal claimsPrincipal, KeytographyDbContext db, CancellationToken cancellationToken)
    {
        var userId = claimsPrincipal.GetUserId();
        var entry = await db.VaultEntries.FirstOrDefaultAsync(e => e.Id == id, cancellationToken);

        if (entry is null)
        {
            return Results.NotFound();
        }

        if (entry.UserId != userId)
        {
            return Results.StatusCode(StatusCodes.Status403Forbidden);
        }

        db.VaultEntries.Remove(entry);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    private static async Task<IResult> ListForSupervisionAsync(
        Guid userId, KeytographyDbContext db, IRecoveryKeyProvider recoveryKeyProvider, CancellationToken cancellationToken)
    {
        var vaultKey = await db.VaultKeys.FirstOrDefaultAsync(k => k.UserId == userId, cancellationToken);
        if (vaultKey is null)
        {
            return Results.NotFound();
        }

        var dek = RsaEnvelope.Unwrap(recoveryKeyProvider.Key, vaultKey.RecoveryWrappedDek);

        var items = (await db.VaultEntries
            .Where(e => e.UserId == userId && !e.IsDeleted)
            .ToListAsync(cancellationToken))
            .OrderByDescending(e => e.UpdatedAt);

        return Results.Ok(items.Select(e => new VaultEntryListItemResponse(e.Id, e.Title, e.Login, e.UpdatedAt)));
    }

    private static async Task<IResult> GetForSupervisionAsync(
        Guid userId, Guid id, KeytographyDbContext db, IRecoveryKeyProvider recoveryKeyProvider, CancellationToken cancellationToken)
    {
        var vaultKey = await db.VaultKeys.FirstOrDefaultAsync(k => k.UserId == userId, cancellationToken);
        var entry = await db.VaultEntries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == userId, cancellationToken);

        if (vaultKey is null || entry is null)
        {
            return Results.NotFound();
        }

        var dek = RsaEnvelope.Unwrap(recoveryKeyProvider.Key, vaultKey.RecoveryWrappedDek);
        return Results.Ok(ToDetail(entry, AesGcmCipher.DecryptString(dek, entry.EncryptedPassword)));
    }

    private static IResult? ValidateTitle(string? title) =>
        string.IsNullOrWhiteSpace(title)
            ? Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["title"] = ["Título é obrigatório."]
            })
            : null;

    private static IResult SessionExpired() => Results.Problem(
        title: "Sessão de cofre expirada.",
        detail: "Faça login novamente para acessar o cofre.",
        statusCode: StatusCodes.Status401Unauthorized);

    private static VaultEntryDetailResponse ToDetail(VaultEntry entry, string password) => new(
        entry.Id,
        entry.Title,
        entry.Login,
        password,
        DeserializeFields(entry.AdditionalFieldsJson),
        entry.CreatedAt,
        entry.UpdatedAt);

    private static string? SerializeFields(Dictionary<string, string>? fields) =>
        fields is null || fields.Count == 0 ? null : JsonSerializer.Serialize(fields);

    private static Dictionary<string, string>? DeserializeFields(string? json) =>
        json is null ? null : JsonSerializer.Deserialize<Dictionary<string, string>>(json);
}
