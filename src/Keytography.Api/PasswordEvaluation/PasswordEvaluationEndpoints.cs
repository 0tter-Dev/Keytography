using System.Text.Json;
using Keytography.Domain;
using Keytography.Domain.PasswordEvaluation;
using Keytography.Domain.Security;
using Keytography.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Keytography.Api.PasswordEvaluation;

/// <summary>
/// Recalculo retroativo da nota de senha para todos os usuarios - usado quando um
/// novo criterio de avaliacao e registrado no sistema. Ver ADR-0003: decifra a DEK
/// de cada usuario pela copia de recuperacao (chave RSA do sistema), em lote, sem
/// exigir login de ninguem. Restrito ao Admin, o mesmo papel que ja exerce
/// supervisao sobre os cofres.
/// </summary>
public static class PasswordEvaluationEndpoints
{
    public static void MapPasswordEvaluationEndpoints(this WebApplication app)
    {
        app.MapPost("/vault/password-evaluation/recalculate", RecalculateAllAsync)
            .RequireAuthorization(policy => policy.RequireRole(nameof(UserRole.Admin)))
            .Produces<RecalculationResponse>();
    }

    private static async Task<IResult> RecalculateAllAsync(
        KeytographyDbContext db,
        IRecoveryKeyProvider recoveryKeyProvider,
        IEnumerable<IPasswordEvaluationCriterion> criteria,
        CancellationToken cancellationToken)
    {
        var criteriaList = criteria.ToList();
        var vaultKeys = await db.VaultKeys.ToListAsync(cancellationToken);
        var updatedEntries = 0;

        foreach (var vaultKey in vaultKeys)
        {
            var dek = RsaEnvelope.Unwrap(recoveryKeyProvider.Key, vaultKey.RecoveryWrappedDek);

            var entries = await db.VaultEntries
                .Where(e => e.UserId == vaultKey.UserId && !e.IsDeleted)
                .ToListAsync(cancellationToken);
            var entryIds = entries.Select(e => e.Id).ToList();
            var histories = await db.VaultEntryHistories
                .Where(h => entryIds.Contains(h.VaultEntryId))
                .ToListAsync(cancellationToken);

            var currentPasswordByEntry = entries.ToDictionary(
                e => e.Id,
                e => AesGcmCipher.DecryptString(dek, e.EncryptedPassword));
            var historyPasswordsByEntry = histories
                .GroupBy(h => h.VaultEntryId)
                .ToDictionary(g => g.Key, g => g.Select(h => AesGcmCipher.DecryptString(dek, h.EncryptedPassword)).ToList());

            foreach (var entry in entries)
            {
                var thisEntryHistory = historyPasswordsByEntry.GetValueOrDefault(entry.Id, []);
                var otherPasswords = currentPasswordByEntry
                    .Where(kv => kv.Key != entry.Id)
                    .Select(kv => kv.Value)
                    .Concat(historyPasswordsByEntry.Where(kv => kv.Key != entry.Id).SelectMany(kv => kv.Value))
                    .ToList();

                var evaluation = PasswordEvaluator.Evaluate(
                    new PasswordEvaluationContext(currentPasswordByEntry[entry.Id], thisEntryHistory, otherPasswords),
                    criteriaList);

                entry.PasswordScore = evaluation.AverageScore;
                entry.PasswordScoreDetailJson = JsonSerializer.Serialize(evaluation.ScoresByCriterion);
                updatedEntries++;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        return Results.Ok(new RecalculationResponse(updatedEntries));
    }
}

public record RecalculationResponse(int UpdatedEntries);
