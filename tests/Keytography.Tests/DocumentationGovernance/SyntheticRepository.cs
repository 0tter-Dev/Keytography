using System.Text;

namespace Keytography.Tests.DocumentationGovernance;

/// <summary>
/// Repositório mínimo e válido em um diretório temporário, para provar que cada regra detecta o erro
/// (verificação por mutação) em vez de apenas confirmar que o repositório real está limpo.
/// </summary>
internal sealed class SyntheticRepository : IDisposable
{
    public SyntheticRepository()
    {
        Root = Path.Combine(Path.GetTempPath(), "keytography-governance-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Root);

        Write("README.md", "# Demo\n\nVeja o [status](./docs/STATUS.md).\n");
        Write("AGENTS.md", "# AGENTS\n");

        Write(
            "docs/STATUS.md",
            """
            # Status

            - [demo-001](./plans/completed/demo-001-first-thing.md) concluído.

            | Capability | Status | Canonical source |
            | --- | --- | --- |
            | Alfa | implemented | [alpha](./capabilities/alpha/README.md) |
            """);

        Write(
            "docs/ROADMAP.md",
            """
            # Roadmap

            | Priority | Item |
            | --- | --- |
            | high | [demo-002](./plans/backlog/demo-002-next-thing.md) |
            """);

        Write("docs/capabilities/alpha/README.md", "# Alfa\n\n## Current Status\n\n`implemented` — pronto.\n");
        Write("docs/plans/backlog/README.md", "# Backlog\n");
        Write("docs/plans/active/README.md", "# Active\n");
        Write("docs/plans/review/README.md", "# Review\n");
        Write("docs/plans/completed/README.md", "# Completed\n");

        Write("docs/plans/completed/demo-001-first-thing.md", PlanText("demo-001", "completed", actual: "minor", outcome: "Entregue via PR #1."));
        Write("docs/plans/backlog/demo-002-next-thing.md", PlanText("demo-002", "backlog", dependsOn: "[demo-001]"));
    }

    public string Root { get; }

    public void Write(string relativePath, string content)
    {
        var path = Path.Combine(Root, relativePath);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content.Replace("\r\n", "\n"));
    }

    public string Read(string relativePath) => File.ReadAllText(Path.Combine(Root, relativePath));

    public void Replace(string relativePath, string oldValue, string newValue)
    {
        var text = Read(relativePath);
        Assert.Contains(oldValue, text);
        Write(relativePath, text.Replace(oldValue, newValue));
    }

    public void Delete(string relativePath) => File.Delete(Path.Combine(Root, relativePath));

    public IReadOnlyList<Violation> Check() => new GovernanceChecker(Root).Check();

    public void Dispose()
    {
        try
        {
            Directory.Delete(Root, recursive: true);
        }
        catch (IOException)
        {
            // limpeza do diretório temporário é melhor esforço
        }
    }

    public static string PlanText(
        string id,
        string status,
        string type = "feat",
        string actual = "pending",
        string dependsOn = "[]",
        string approval = "",
        string outcome = "",
        string documentationUpdates = "- `README.md` (raiz): sem mudança.",
        string? without = null)
    {
        var sections = new (string Name, string Content)[]
        {
            ("Objective", "Fazer a coisa."),
            ("Context", "Porque sim."),
            ("Scope", "- tudo"),
            ("Out Of Scope", "- nada"),
            ("Approval", approval),
            ("Acceptance Criteria", "- funciona"),
            ("Validation", "- testes"),
            ("Documentation Updates", documentationUpdates),
            ("Outcome", outcome),
        };

        var builder = new StringBuilder();
        builder.Append("---\n");
        builder.Append($"id: {id}\nstatus: {status}\ntype: {type}\nrequires_pull_request: true\n");
        builder.Append($"expected_version_impact: minor\nactual_version_impact: {actual}\npriority: medium\nsequence: 1\n");
        builder.Append($"depends_on: {dependsOn}\nauthorized_capabilities: []\ndecision_records: []\nvalidation: []\ndocumentation_updates: []\n");
        builder.Append("---\n\n# Plano\n\n");

        foreach (var (name, content) in sections.Where(section => section.Name != without))
        {
            builder.Append($"## {name}\n\n{content}\n\n");
        }

        return builder.ToString();
    }
}
