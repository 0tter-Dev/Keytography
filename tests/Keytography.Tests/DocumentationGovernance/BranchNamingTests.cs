namespace Keytography.Tests.DocumentationGovernance;

/// <summary>Convenção de nomes de branches e PRs (docs/DEVELOPMENT-GUIDE.md, "Nomes de branches, PRs e planos").</summary>
public class BranchNamingTests
{
    public const string BranchVariable = "KEYTOGRAPHY_PR_BRANCH";
    public const string TitleVariable = "KEYTOGRAPHY_PR_TITLE";

    [Theory]
    [InlineData("chore/close-keytography-015", "chore: close keytography-015 (governance checks)")]
    [InlineData("feat/keytography-008-web-authentication-ui", "feat: web authentication UI (keytography-008)")]
    [InlineData("docs/branch-and-pr-naming-convention", "docs: adopt <type>/<id>-<slug> naming and post-merge branch cleanup")]
    [InlineData("chore/claude-code-project-hooks", "chore: add project-only Claude Code hooks")]
    [InlineData("fix/keytography-009-vault-pagination", "fix(web): vault pagination (keytography-009)")]
    [InlineData("dependabot/npm_and_yarn/web/vite-8.1.0", "Bump vite from 8.0.0 to 8.1.0 in /web")]
    public void Accepts_branches_and_titles_that_follow_the_convention(string branch, string title)
    {
        Assert.Null(BranchNaming.Validate(branch, title));
    }

    [Theory]
    [InlineData("keytography-008-web-authentication-ui", "feat: web authentication UI (keytography-008)", "<type>/<slug>")]
    [InlineData("Feat/Keytography-008", "feat: x (keytography-008)", "<type>/<slug>")]
    [InlineData("feature/keytography-008-web-auth", "feat: x (keytography-008)", "<type>/<slug>")]
    [InlineData("feat/keytography-008-web-auth", "Web authentication UI", "Conventional Commits")]
    [InlineData("feat/keytography-008-web-auth", "fix: web authentication UI (keytography-008)", "difere do tipo da branch")]
    [InlineData("feat/keytography-008-web-auth", "feat: web authentication UI", "(keytography-008)")]
    [InlineData("feat/keytography-008-web-auth", "feat: web authentication UI (keytography-009)", "(keytography-008)")]
    [InlineData("chore/close-keytography-015", "chore: finish governance work", "chore: close keytography-015")]
    public void Rejects_branches_and_titles_that_break_the_convention(string branch, string title, string expectedHint)
    {
        var problem = BranchNaming.Validate(branch, title);

        Assert.NotNull(problem);
        Assert.Contains(expectedHint, problem);
    }

    /// <summary>
    /// No CI de pull request o workflow define as duas variáveis; localmente (e em pushes) elas não existem e o
    /// teste não tem o que verificar. Para reproduzir um PR: defina as variáveis e rode este teste.
    /// </summary>
    [Fact]
    public void Pull_request_branch_and_title_follow_the_convention()
    {
        var branch = Environment.GetEnvironmentVariable(BranchVariable);
        var title = Environment.GetEnvironmentVariable(TitleVariable);
        if (string.IsNullOrWhiteSpace(branch) || title is null)
        {
            return;
        }

        var problem = BranchNaming.Validate(branch, title);

        Assert.True(problem is null, $"Convenção de nomes de branches e PRs (docs/DEVELOPMENT-GUIDE.md): {problem}");
    }
}
