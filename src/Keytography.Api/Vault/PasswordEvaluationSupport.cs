using System.Text.Json;
using Keytography.Domain;
using Keytography.Domain.PasswordEvaluation;
using Keytography.Domain.Security;
using Keytography.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Keytography.Api.Vault;

/// <summary>
/// Helpers de avaliacao de senha que precisam de acesso ao banco - a logica pura
/// dos criterios fica em Keytography.Domain.PasswordEvaluation.
/// </summary>
public static class PasswordEvaluationSupport
{
    public static async Task<List<string>> GetOtherPasswordsForUserAsync(
        KeytographyDbContext db, Guid userId, Guid excludeEntryId, byte[] dek, CancellationToken cancellationToken)
    {
        var otherEntries = await db.VaultEntries
            .Where(e => e.UserId == userId && e.Id != excludeEntryId)
            .ToListAsync(cancellationToken);

        var otherEntryIds = otherEntries.Select(e => e.Id).ToList();
        var otherHistories = await db.VaultEntryHistories
            .Where(h => otherEntryIds.Contains(h.VaultEntryId))
            .ToListAsync(cancellationToken);

        var passwords = otherEntries.Select(e => AesGcmCipher.DecryptString(dek, e.EncryptedPassword)).ToList();
        passwords.AddRange(otherHistories.Select(h => AesGcmCipher.DecryptString(dek, h.EncryptedPassword)));
        return passwords;
    }

    public static void ApplyEvaluation(VaultEntry entry, PasswordEvaluationResult result)
    {
        entry.PasswordScore = result.AverageScore;
        entry.PasswordScoreDetailJson = JsonSerializer.Serialize(result.ScoresByCriterion);
    }

    public static Dictionary<string, CriterionEvaluation>? DeserializeScoreDetail(string? json) =>
        json is null ? null : JsonSerializer.Deserialize<Dictionary<string, CriterionEvaluation>>(json);
}
