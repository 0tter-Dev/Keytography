namespace Keytography.Tests.DocumentationGovernance;

/// <summary>
/// Guarda da governança documental (docs/DOCUMENTATION-GUIDE.md, "Verificação automática"). O primeiro teste roda
/// as regras contra o repositório real; os demais provam, com árvores sintéticas, que cada regra detecta o erro.
/// </summary>
public class DocumentationGovernanceTests
{
    [Fact]
    public void Repository_documentation_follows_the_governance_rules()
    {
        var violations = new GovernanceChecker(RepositoryRoot.Find()).Check();

        Assert.True(
            violations.Count == 0,
            "Violações de governança documental (como corrigir está em cada mensagem; regras em docs/DOCUMENTATION-GUIDE.md):\n"
            + string.Join("\n", violations.Select(violation => "  - " + violation)));
    }

    [Fact]
    public void Synthetic_repository_baseline_has_no_violations()
    {
        using var repository = new SyntheticRepository();

        Assert.Empty(repository.Check());
    }

    // --- Regra 1: planos ------------------------------------------------------------------------------------

    [Fact]
    public void Plan_status_must_match_its_folder()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/plans/backlog/demo-002-next-thing.md", "status: backlog", "status: active");

        AssertSingle(repository, GovernanceChecker.PlanRule, "demo-002-next-thing.md", "status: active");
    }

    [Fact]
    public void Plan_must_have_every_front_matter_field()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/plans/backlog/demo-002-next-thing.md", "priority: medium\n", string.Empty);

        AssertSingle(repository, GovernanceChecker.PlanRule, "demo-002-next-thing.md", "`priority`");
    }

    [Fact]
    public void Plan_without_front_matter_is_reported()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/plans/backlog/demo-002-next-thing.md", "# Plano sem front matter\n");

        AssertSingle(repository, GovernanceChecker.PlanRule, "demo-002-next-thing.md", "front matter ausente");
    }

    [Fact]
    public void Plan_file_name_must_start_with_its_id()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/plans/backlog/demo-002-next-thing.md", "id: demo-002", "id: demo-009");

        var violations = repository.Check();

        Assert.Contains(violations, violation => violation.Rule == GovernanceChecker.PlanRule && violation.Message.Contains("demo-009-"));
    }

    [Fact]
    public void Plan_type_must_be_a_conventional_commit_type()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/plans/backlog/demo-002-next-thing.md", "type: feat", "type: feature");

        AssertSingle(repository, GovernanceChecker.PlanRule, "demo-002-next-thing.md", "type: feature");
    }

    [Fact]
    public void Plan_must_have_every_required_section()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/plans/backlog/demo-002-next-thing.md", SyntheticRepository.PlanText("demo-002", "backlog", without: "Out Of Scope"));

        AssertSingle(repository, GovernanceChecker.PlanRule, "demo-002-next-thing.md", "## Out Of Scope");
    }

    [Fact]
    public void Plan_depends_on_must_reference_existing_plans()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/plans/backlog/demo-002-next-thing.md", "depends_on: [demo-001]", "depends_on: [demo-001, demo-777]");

        AssertSingle(repository, GovernanceChecker.PlanRule, "demo-002-next-thing.md", "demo-777");
    }

    // --- Regra 2: ciclo de vida -----------------------------------------------------------------------------

    [Fact]
    public void Completed_plan_needs_a_filled_outcome()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/plans/completed/demo-001-first-thing.md", SyntheticRepository.PlanText("demo-001", "completed", actual: "minor", outcome: string.Empty));

        AssertSingle(repository, GovernanceChecker.LifecycleRule, "demo-001-first-thing.md", "Outcome");
    }

    [Fact]
    public void Completed_plan_cannot_keep_a_pending_version_impact()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/plans/completed/demo-001-first-thing.md", SyntheticRepository.PlanText("demo-001", "completed", actual: "pending", outcome: "Entregue."));

        AssertSingle(repository, GovernanceChecker.LifecycleRule, "demo-001-first-thing.md", "actual_version_impact: pending");
    }

    [Theory]
    [InlineData("active")]
    [InlineData("review")]
    public void Active_and_review_plans_need_an_approval(string folder)
    {
        using var repository = new SyntheticRepository();
        repository.Write($"docs/plans/{folder}/demo-003-wip.md", SyntheticRepository.PlanText("demo-003", folder, approval: string.Empty));
        repository.Replace("docs/ROADMAP.md", "| high |", "| high | [wip](./plans/" + folder + "/demo-003-wip.md) |\n| high |");

        AssertSingle(repository, GovernanceChecker.LifecycleRule, "demo-003-wip.md", "Approval");
    }

    [Fact]
    public void Review_plan_keeps_the_version_impact_pending()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/plans/review/demo-003-wip.md", SyntheticRepository.PlanText("demo-003", "review", actual: "minor", approval: "Aprovado."));
        repository.Replace("docs/ROADMAP.md", "| high |", "| high | [wip](./plans/review/demo-003-wip.md) |\n| high |");

        AssertSingle(repository, GovernanceChecker.LifecycleRule, "demo-003-wip.md", "actual_version_impact: minor");
    }

    // --- Regra 3: dashboards --------------------------------------------------------------------------------

    [Fact]
    public void Open_plans_must_be_listed_in_the_roadmap()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/ROADMAP.md", "[demo-002](./plans/backlog/demo-002-next-thing.md)", "item sem link");

        AssertSingle(repository, GovernanceChecker.DashboardRule, "docs/ROADMAP.md", "demo-002-next-thing.md");
    }

    [Fact]
    public void Completed_plans_must_be_listed_in_the_status()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/STATUS.md", "- [demo-001](./plans/completed/demo-001-first-thing.md) concluído.", "- nada ainda.");

        AssertSingle(repository, GovernanceChecker.DashboardRule, "docs/STATUS.md", "demo-001-first-thing.md");
    }

    [Fact]
    public void Every_capability_must_be_in_the_capability_dashboard()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/capabilities/beta/README.md", "# Beta\n\n## Current Status\n\n`planned` — ainda não.\n");

        AssertSingle(repository, GovernanceChecker.DashboardRule, "docs/STATUS.md", "`beta`");
    }

    [Fact]
    public void Capability_dashboard_status_must_match_the_capability()
    {
        using var repository = new SyntheticRepository();
        repository.Replace("docs/capabilities/alpha/README.md", "`implemented`", "`in_progress`");

        AssertSingle(repository, GovernanceChecker.DashboardRule, "docs/STATUS.md", "`implemented`");
    }

    // --- Regra 4: links -------------------------------------------------------------------------------------

    [Fact]
    public void Broken_file_links_are_reported_with_file_and_line()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/guides.md", "# Guias\n\nTexto.\n\nVeja [isto](./nao-existe.md).\n");

        var violation = Assert.Single(repository.Check());
        Assert.Equal(GovernanceChecker.LinkRule, violation.Rule);
        Assert.Equal("docs/guides.md:5", violation.Location);
        Assert.Contains("nao-existe.md", violation.Message);
    }

    [Fact]
    public void Broken_anchors_are_reported_and_good_ones_pass_including_accents()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/target.md", "# Alvo\n\n## Definição de \"pronto\" para a entrega\n\n## Repetido\n\n## Repetido\n");
        repository.Write(
            "docs/source.md",
            "[ok](./target.md#definição-de-pronto-para-a-entrega) [repetido](./target.md#repetido-1) [local](#fonte)\n\n# Fonte\n\n[ruim](./target.md#nao-existe)\n");

        var violation = Assert.Single(repository.Check());
        Assert.Equal(GovernanceChecker.LinkRule, violation.Rule);
        Assert.Equal("docs/source.md:5", violation.Location);
        Assert.Contains("#nao-existe", violation.Message);
    }

    [Fact]
    public void Links_inside_code_and_external_links_are_ignored()
    {
        using var repository = new SyntheticRepository();
        repository.Write(
            "docs/code.md",
            "# Código\n\nUse `[x](./nao-existe.md)` assim.\n\n```md\n[y](./tambem-nao-existe.md)\n```\n\n[site](https://example.com/qualquer) [mail](mailto:a@b.c)\n");

        Assert.Empty(repository.Check());
    }

    // --- Regra 5: README.md da raiz nos planos --------------------------------------------------------------

    [Fact]
    public void Open_feat_plan_must_mention_the_root_readme()
    {
        using var repository = new SyntheticRepository();
        repository.Write(
            "docs/plans/backlog/demo-002-next-thing.md",
            SyntheticRepository.PlanText("demo-002", "backlog", dependsOn: "[demo-001]", documentationUpdates: "- `docs/capabilities/alpha/README.md`: atualizar."));

        AssertSingle(repository, GovernanceChecker.ReadmeRule, "demo-002-next-thing.md", "README.md");
    }

    [Fact]
    public void Root_readme_rule_exempts_chore_plans_and_completed_plans()
    {
        using var repository = new SyntheticRepository();
        repository.Write(
            "docs/plans/backlog/demo-002-next-thing.md",
            SyntheticRepository.PlanText("demo-002", "backlog", type: "chore", dependsOn: "[demo-001]", documentationUpdates: "- `docs/DEVELOPMENT-GUIDE.md`: atualizar."));
        repository.Write(
            "docs/plans/completed/demo-001-first-thing.md",
            SyntheticRepository.PlanText("demo-001", "completed", actual: "minor", outcome: "Entregue.", documentationUpdates: "- `docs/STATUS.md`."));

        Assert.Empty(repository.Check());
    }

    // --- Regra 6: resíduos de template ----------------------------------------------------------------------

    [Fact]
    public void Leftover_template_placeholders_are_reported_but_not_inside_code()
    {
        using var repository = new SyntheticRepository();
        repository.Write("docs/guide.md", "# Guia\n\nProjeto {{PROJECT_NAME}} aqui. Em código: `style={{...}}`.\n\n```tsx\n<div style={{a: 1}} />\n```\n");

        var violation = Assert.Single(repository.Check());
        Assert.Equal(GovernanceChecker.TemplateRule, violation.Rule);
        Assert.Equal("docs/guide.md:3", violation.Location);
        Assert.Contains("{{PROJECT_NAME}}", violation.Message);
    }

    // --- Âncoras (gerador de slugs no estilo do GitHub) -----------------------------------------------------

    [Theory]
    [InlineData("Plan Template", "plan-template")]
    [InlineData("Nomes de branches, PRs e planos", "nomes-de-branches-prs-e-planos")]
    [InlineData("Definição de \"pronto\" para a documentação de uma entrega", "definição-de-pronto-para-a-documentação-de-uma-entrega")]
    [InlineData("`Stack` & Tools", "stack--tools")]
    [InlineData("Ver [o guia](./guia.md) agora", "ver-o-guia-agora")]
    [InlineData("Hooks do Claude Code (somente neste projeto)", "hooks-do-claude-code-somente-neste-projeto")]
    [InlineData("snake_case e kebab-case", "snake_case-e-kebab-case")]
    public void Slug_follows_the_github_rules(string heading, string expected)
    {
        Assert.Equal(expected, MarkdownText.Slug(heading));
    }

    [Fact]
    public void Anchors_ignore_headings_inside_code_fences_and_number_duplicates()
    {
        var anchors = MarkdownText.Anchors("# A\n\n```md\n# Dentro\n```\n\n## B\n\n## B\n\n## B\n");

        Assert.Equal(new[] { "a", "b", "b-1", "b-2" }.Order(), anchors.Order());
    }

    private static void AssertSingle(SyntheticRepository repository, string rule, string locationFragment, string messageFragment)
    {
        var violation = Assert.Single(repository.Check());
        Assert.Equal(rule, violation.Rule);
        Assert.Contains(locationFragment, violation.Location);
        Assert.Contains(messageFragment, violation.Message);
    }
}
