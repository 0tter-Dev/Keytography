using Keytography.Domain.PasswordEvaluation;

namespace Keytography.Api.Vault;

public record CreateVaultEntryRequest(string Title, string? Login, string Password, Dictionary<string, string>? AdditionalFields);

public record UpdateVaultEntryRequest(string Title, string? Login, string Password, Dictionary<string, string>? AdditionalFields);

public record VaultEntryListItemResponse(Guid Id, string Title, string? Login, DateTimeOffset UpdatedAt);

public record VaultEntryDetailResponse(
    Guid Id,
    string Title,
    string? Login,
    string Password,
    Dictionary<string, string>? AdditionalFields,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    double? PasswordScore,
    Dictionary<string, CriterionEvaluation>? PasswordScoreDetail);

public record VaultEntryHistoryItemResponse(Guid Id, string Password, DateTimeOffset ChangedAt);
