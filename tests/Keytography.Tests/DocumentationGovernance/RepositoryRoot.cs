namespace Keytography.Tests.DocumentationGovernance;

internal static class RepositoryRoot
{
    /// <summary>Sobe a partir do diretório dos binários até achar <c>Keytography.slnx</c>.</summary>
    public static string Find()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Keytography.slnx")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("Raiz do repositorio (Keytography.slnx) nao encontrada.");
    }
}
