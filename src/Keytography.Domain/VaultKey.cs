namespace Keytography.Domain;

/// <summary>
/// Material de chave do cofre de um usuario: a DEK simetrica em duas copias
/// cifradas independentes, conforme ADR-0001. A DEK em si nunca e persistida
/// em texto puro.
/// </summary>
public class VaultKey
{
    public required Guid UserId { get; set; }
    public required byte[] Argon2Salt { get; set; }
    public required byte[] OwnerWrappedDek { get; set; }
    public required byte[] RecoveryWrappedDek { get; set; }
}
