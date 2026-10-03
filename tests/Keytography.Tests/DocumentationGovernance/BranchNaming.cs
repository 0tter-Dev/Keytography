using System.Text.RegularExpressions;

namespace Keytography.Tests.DocumentationGovernance;

/// <summary>
/// Convenção de nomes de branches e títulos de PR (docs/DEVELOPMENT-GUIDE.md, "Nomes de branches, PRs e planos"):
/// branch <c>&lt;type&gt;/&lt;slug&gt;</c>; entrega de plano <c>&lt;type&gt;/&lt;id&gt;-&lt;slug&gt;</c> com título
/// <c>&lt;type&gt;: &lt;resumo&gt; (&lt;id&gt;)</c>; fechamento <c>chore/close-&lt;id&gt;</c> com título
/// <c>chore: close &lt;id&gt; (&lt;resumo&gt;)</c>.
/// </summary>
internal static partial class BranchNaming
{
    public static readonly IReadOnlyList<string> ConventionalTypes =
        ["feat", "fix", "docs", "chore", "refactor", "perf", "test", "ci", "build", "style", "revert"];

    /// <summary>Prefixos de branch geridos por ferramentas e, por isso, isentos da convenção.</summary>
    public static readonly IReadOnlyList<string> ExemptPrefixes = ["dependabot/", "renovate/"];

    /// <summary>Devolve null se branch e título seguem a convenção; senão, a mensagem de como corrigir.</summary>
    public static string? Validate(string branch, string title)
    {
        if (ExemptPrefixes.Any(prefix => branch.StartsWith(prefix, StringComparison.Ordinal)))
        {
            return null;
        }

        var types = string.Join("|", ConventionalTypes);
        var branchMatch = Regex.Match(branch, $"^({types})/([a-z0-9][a-z0-9._-]*)$");
        if (!branchMatch.Success)
        {
            return $"a branch `{branch}` não segue `<type>/<slug>` (type: {string.Join(", ", ConventionalTypes)}; slug em minúsculas, números, `.`, `_` ou `-`). Renomeie a branch (ex.: `feat/keytography-008-web-authentication-ui`).";
        }

        var type = branchMatch.Groups[1].Value;
        var slug = branchMatch.Groups[2].Value;

        var titleMatch = Regex.Match(title, $@"^({types})(\([^)]+\))?(!)?: (.+)$");
        if (!titleMatch.Success)
        {
            return $"o título `{title}` não segue Conventional Commits (`<type>: <resumo>`). Edite o título do PR.";
        }

        if (titleMatch.Groups[1].Value != type)
        {
            return $"o tipo do título (`{titleMatch.Groups[1].Value}`) difere do tipo da branch (`{type}`). Alinhe os dois: o tipo vem do plano.";
        }

        var close = CloseSlug().Match(slug);
        if (type == "chore" && close.Success)
        {
            var id = close.Groups[1].Value;
            return title.StartsWith($"chore: close {id}", StringComparison.Ordinal)
                ? null
                : $"o título do PR de fechamento deve começar com `chore: close {id}` (ex.: `chore: close {id} (<resumo>)`).";
        }

        var plan = PlanSlug().Match(slug);
        if (plan.Success)
        {
            var id = plan.Groups[1].Value;
            return title.EndsWith($"({id})", StringComparison.Ordinal)
                ? null
                : $"o título do PR de entrega do plano deve terminar com `({id})` (ex.: `{type}: <resumo> ({id})`).";
        }

        return null;
    }

    // O id de um plano deste projeto é `keytography-NNN`; slugs de trabalho sem plano nunca começam assim.
    // Outros projetos que reaproveitem este verificador ajustam o prefixo nos dois padrões abaixo.
    [GeneratedRegex(@"^close-(keytography-\d+)$")]
    private static partial Regex CloseSlug();

    [GeneratedRegex(@"^(keytography-\d+)-[a-z0-9]")]
    private static partial Regex PlanSlug();
}
