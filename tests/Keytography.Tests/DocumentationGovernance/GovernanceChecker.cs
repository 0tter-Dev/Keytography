using System.Text.RegularExpressions;

namespace Keytography.Tests.DocumentationGovernance;

/// <summary>Uma regra de governança violada: onde, qual regra e como corrigir.</summary>
internal sealed record Violation(string Location, string Rule, string Message)
{
    public override string ToString() => $"[{Rule}] {Location}: {Message}";
}

/// <summary>
/// Verifica, a partir da raiz do repositório, as regras de governança documental descritas em
/// docs/DOCUMENTATION-GUIDE.md. É uma classe sobre um diretório para poder ser testada com árvores sintéticas.
/// </summary>
internal sealed partial class GovernanceChecker(string root)
{
    public const string PlanRule = "plano";
    public const string LifecycleRule = "ciclo-de-vida";
    public const string DashboardRule = "dashboard";
    public const string LinkRule = "link";
    public const string ReadmeRule = "readme-raiz";
    public const string TemplateRule = "template";

    private static readonly string[] PlanFolders = ["backlog", "active", "review", "completed"];

    private static readonly string[] RequiredFields =
    [
        "id", "status", "type", "requires_pull_request", "expected_version_impact", "actual_version_impact",
        "priority", "sequence", "depends_on", "authorized_capabilities", "decision_records", "validation",
        "documentation_updates",
    ];

    private static readonly string[] RequiredSections =
    [
        "Objective", "Context", "Scope", "Out Of Scope", "Acceptance Criteria", "Validation",
        "Documentation Updates", "Outcome",
    ];

    private readonly Dictionary<string, HashSet<string>> _anchorCache = new(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyList<Violation> Check()
    {
        var violations = new List<Violation>();
        var plans = LoadPlans();

        CheckPlans(plans, violations);
        CheckDashboards(plans, violations);
        CheckLinks(violations);
        CheckRootReadmeCoverage(plans, violations);
        CheckTemplateResidue(violations);

        return violations;
    }

    // --- Regras 1 e 2: planos e ciclo de vida -------------------------------------------------------------

    private List<PlanDocument> LoadPlans()
    {
        var plans = new List<PlanDocument>();
        foreach (var folder in PlanFolders)
        {
            var directory = Path.Combine(root, "docs", "plans", folder);
            if (!Directory.Exists(directory))
            {
                continue;
            }

            foreach (var file in Directory.GetFiles(directory, "*.md").Order(StringComparer.Ordinal))
            {
                if (!string.Equals(Path.GetFileName(file), "README.md", StringComparison.OrdinalIgnoreCase))
                {
                    plans.Add(PlanDocument.Load(root, file));
                }
            }
        }

        return plans;
    }

    private static void CheckPlans(List<PlanDocument> plans, List<Violation> violations)
    {
        var knownIds = plans.Select(plan => plan.Id).Where(id => id is not null).ToHashSet(StringComparer.Ordinal);
        var typesPattern = BranchNaming.ConventionalTypes;

        foreach (var plan in plans)
        {
            if (!plan.HasFrontMatter)
            {
                violations.Add(new(plan.RelativePath, PlanRule, "front matter ausente. Comece o arquivo com um bloco `---` ... `---` conforme o template em docs/plans/README.md."));
                continue;
            }

            foreach (var field in RequiredFields.Where(field => !plan.HasField(field)))
            {
                violations.Add(new(plan.RelativePath, PlanRule, $"campo `{field}` ausente no front matter. Acrescente-o (template em docs/plans/README.md)."));
            }

            var status = plan.Field("status");
            if (status is not null && status != plan.Folder)
            {
                violations.Add(new(plan.RelativePath, PlanRule, $"`status: {status}` não corresponde à pasta `{plan.Folder}/`. Mova o arquivo ou corrija o campo para que os dois concordem."));
            }

            if (plan.Id is { } id && !plan.FileName.StartsWith(id + "-", StringComparison.Ordinal))
            {
                violations.Add(new(plan.RelativePath, PlanRule, $"o nome do arquivo deve começar com o `id` ({id}-). Renomeie o arquivo ou corrija o `id`."));
            }

            if (plan.Field("type") is { } type && !typesPattern.Contains(type))
            {
                violations.Add(new(plan.RelativePath, PlanRule, $"`type: {type}` não é um tipo de Conventional Commits ({string.Join(", ", typesPattern)}). Use um deles."));
            }

            foreach (var section in RequiredSections.Where(section => plan.Section(section) is null))
            {
                violations.Add(new(plan.RelativePath, PlanRule, $"seção `## {section}` ausente. Acrescente-a ao corpo do plano."));
            }

            foreach (var dependency in plan.DependsOn.Where(dependency => !knownIds.Contains(dependency)))
            {
                violations.Add(new(plan.RelativePath, PlanRule, $"`depends_on` cita `{dependency}`, que não é o `id` de nenhum plano. Corrija o id ou crie o plano."));
            }

            CheckLifecycle(plan, violations);
        }
    }

    private static void CheckLifecycle(PlanDocument plan, List<Violation> violations)
    {
        var actual = plan.Field("actual_version_impact");

        switch (plan.Folder)
        {
            case "completed":
                if (string.IsNullOrWhiteSpace(plan.Section("Outcome")))
                {
                    violations.Add(new(plan.RelativePath, LifecycleRule, "plano concluído com `## Outcome` vazio. Registre PR, commits, resultado da validação e `actual_version_impact`."));
                }

                if (actual is "pending")
                {
                    violations.Add(new(plan.RelativePath, LifecycleRule, "plano concluído com `actual_version_impact: pending`. Informe o impacto real (major/minor/patch/none)."));
                }

                break;

            case "active" or "review":
                if (string.IsNullOrWhiteSpace(plan.Section("Approval")))
                {
                    violations.Add(new(plan.RelativePath, LifecycleRule, $"plano em `{plan.Folder}/` sem `## Approval` preenchido. Registre a aprovação explícita do usuário (data e contexto)."));
                }

                if (actual is not null and not "pending")
                {
                    violations.Add(new(plan.RelativePath, LifecycleRule, $"plano em `{plan.Folder}/` com `actual_version_impact: {actual}`. O valor real só é preenchido no fechamento; mantenha `pending`."));
                }

                break;
        }
    }

    // --- Regra 3: dashboards ------------------------------------------------------------------------------

    private void CheckDashboards(List<PlanDocument> plans, List<Violation> violations)
    {
        var roadmapPath = Path.Combine(root, "docs", "ROADMAP.md");
        var statusPath = Path.Combine(root, "docs", "STATUS.md");
        var roadmap = File.Exists(roadmapPath) ? File.ReadAllText(roadmapPath) : null;
        var status = File.Exists(statusPath) ? File.ReadAllText(statusPath) : null;

        foreach (var plan in plans)
        {
            if (plan.Folder == "completed")
            {
                if (status is not null && !status.Contains(plan.FileName, StringComparison.Ordinal))
                {
                    violations.Add(new("docs/STATUS.md", DashboardRule, $"o plano concluído `{plan.FileName}` não aparece. Acrescente um marco linkando para docs/plans/completed/{plan.FileName}."));
                }
            }
            else if (roadmap is not null && !roadmap.Contains(plan.FileName, StringComparison.Ordinal))
            {
                violations.Add(new("docs/ROADMAP.md", DashboardRule, $"o plano `{plan.FileName}` (em `{plan.Folder}/`) não aparece. Acrescente uma linha linkando para docs/plans/{plan.Folder}/{plan.FileName}."));
            }
        }

        if (roadmap is null)
        {
            violations.Add(new("docs/ROADMAP.md", DashboardRule, "arquivo ausente."));
        }

        if (status is null)
        {
            violations.Add(new("docs/STATUS.md", DashboardRule, "arquivo ausente."));
            return;
        }

        CheckCapabilityDashboard(status, violations);
    }

    private void CheckCapabilityDashboard(string status, List<Violation> violations)
    {
        var rows = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (Match row in DashboardRow().Matches(MarkdownText.StripFences(status)))
        {
            rows[row.Groups[3].Value] = row.Groups[2].Value.Trim();
        }

        var capabilitiesDirectory = Path.Combine(root, "docs", "capabilities");
        if (!Directory.Exists(capabilitiesDirectory))
        {
            return;
        }

        foreach (var directory in Directory.GetDirectories(capabilitiesDirectory).Order(StringComparer.Ordinal))
        {
            var slug = Path.GetFileName(directory);
            var readme = Path.Combine(directory, "README.md");
            if (!File.Exists(readme))
            {
                continue;
            }

            var declared = CurrentStatus().Match(MarkdownText.Normalize(File.ReadAllText(readme)));
            if (!rows.TryGetValue(slug, out var listed))
            {
                violations.Add(new("docs/STATUS.md", DashboardRule, $"a capability `{slug}` não está no Capability Dashboard. Acrescente uma linha linkando para ./capabilities/{slug}/README.md."));
            }
            else if (declared.Success && listed != declared.Groups[1].Value)
            {
                violations.Add(new("docs/STATUS.md", DashboardRule, $"a capability `{slug}` aparece como `{listed}`, mas docs/capabilities/{slug}/README.md declara `{declared.Groups[1].Value}`. Alinhe os dois (a capability é a fonte)."));
            }
        }
    }

    // --- Regra 4: links internos --------------------------------------------------------------------------

    private void CheckLinks(List<Violation> violations)
    {
        foreach (var file in MarkdownFiles())
        {
            var text = MarkdownText.Normalize(File.ReadAllText(file));
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');

            foreach (var link in MarkdownText.Links(text))
            {
                var problem = CheckLink(file, text, link.Target);
                if (problem is not null)
                {
                    violations.Add(new($"{relative}:{link.Line}", LinkRule, problem));
                }
            }
        }
    }

    private string? CheckLink(string file, string fileText, string target)
    {
        if (target.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            || target.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            || target.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase)
            || target.StartsWith("tel:", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var hash = target.IndexOf('#');
        var pathPart = Uri.UnescapeDataString(hash < 0 ? target : target[..hash]);
        var anchor = hash < 0 ? string.Empty : Uri.UnescapeDataString(target[(hash + 1)..]);

        if (pathPart.Length == 0)
        {
            return anchor.Length == 0 || AnchorsOf(file, fileText).Contains(anchor.ToLowerInvariant())
                ? null
                : $"a âncora `#{anchor}` não existe neste arquivo. Corrija o link ou o título.";
        }

        var resolved = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(file)!, pathPart));
        var isFile = File.Exists(resolved);
        if (!isFile && !Directory.Exists(resolved))
        {
            return $"o link `{target}` aponta para um arquivo que não existe. Corrija o caminho ou remova o link.";
        }

        if (anchor.Length > 0 && isFile && resolved.EndsWith(".md", StringComparison.OrdinalIgnoreCase)
            && !AnchorsOf(resolved, null).Contains(anchor.ToLowerInvariant()))
        {
            return $"o link `{target}` aponta para um título (`#{anchor}`) que não existe em {Path.GetFileName(resolved)}. Corrija a âncora ou o título.";
        }

        return null;
    }

    private HashSet<string> AnchorsOf(string file, string? knownText)
    {
        if (!_anchorCache.TryGetValue(file, out var anchors))
        {
            anchors = MarkdownText.Anchors(knownText ?? File.ReadAllText(file));
            _anchorCache[file] = anchors;
        }

        return anchors;
    }

    // --- Regra 5: README.md da raiz nos planos ------------------------------------------------------------

    private static void CheckRootReadmeCoverage(List<PlanDocument> plans, List<Violation> violations)
    {
        foreach (var plan in plans.Where(plan => plan.Folder != "completed" && plan.Field("type") == "feat"))
        {
            var updates = plan.Section("Documentation Updates");
            if (updates is not null && !RootReadmeMention().IsMatch(updates))
            {
                violations.Add(new(plan.RelativePath, ReadmeRule, "plano `feat` sem menção ao `README.md` da raiz em `Documentation Updates`. Acrescente a linha (o que muda no Quick Start, Current Scope ou Stack, ou a constatação deliberada de que não muda); ver a definição de pronto em docs/DOCUMENTATION-GUIDE.md."));
            }
        }
    }

    // --- Regra 6: resíduos de template --------------------------------------------------------------------

    private void CheckTemplateResidue(List<Violation> violations)
    {
        foreach (var file in MarkdownFiles())
        {
            var text = MarkdownText.StripCode(File.ReadAllText(file));
            var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
            foreach (Match match in TemplatePlaceholder().Matches(text))
            {
                violations.Add(new($"{relative}:{MarkdownText.LineOf(text, match.Index)}", TemplateRule, $"placeholder `{match.Value}` esquecido. Substitua pelo conteúdo real."));
            }
        }
    }

    // --- Arquivos -----------------------------------------------------------------------------------------

    private IEnumerable<string> MarkdownFiles()
    {
        foreach (var name in new[] { "README.md", "AGENTS.md" })
        {
            var path = Path.Combine(root, name);
            if (File.Exists(path))
            {
                yield return path;
            }
        }

        var docs = Path.Combine(root, "docs");
        if (Directory.Exists(docs))
        {
            foreach (var file in Directory.GetFiles(docs, "*.md", SearchOption.AllDirectories).Order(StringComparer.Ordinal))
            {
                yield return file;
            }
        }
    }

    [GeneratedRegex(@"^\|\s*([^|\n]*?)\s*\|\s*([^|\n]*?)\s*\|\s*\[[^\]]*\]\(\./capabilities/([^/)]+)/README\.md\)\s*\|", RegexOptions.Multiline)]
    private static partial Regex DashboardRow();

    [GeneratedRegex(@"^##[ \t]+Current Status[ \t]*\n+`([a-z_]+)`", RegexOptions.Multiline)]
    private static partial Regex CurrentStatus();

    [GeneratedRegex(@"(?<![/\w.-])README\.md")]
    private static partial Regex RootReadmeMention();

    [GeneratedRegex(@"\{\{[^}\n]*\}\}")]
    private static partial Regex TemplatePlaceholder();
}
