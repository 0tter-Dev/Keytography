using System.Text.RegularExpressions;

namespace Keytography.Tests.DocumentationGovernance;

/// <summary>Um arquivo de plano (<c>docs/plans/&lt;pasta&gt;/&lt;id&gt;-&lt;slug&gt;.md</c>) lido por partes: front matter e corpo.</summary>
internal sealed partial class PlanDocument
{
    private readonly Dictionary<string, string> _fields;
    private readonly string _body;

    private PlanDocument(string relativePath, string folder, string fileName, bool hasFrontMatter, Dictionary<string, string> fields, List<string> dependsOn, string body)
    {
        RelativePath = relativePath;
        Folder = folder;
        FileName = fileName;
        HasFrontMatter = hasFrontMatter;
        _fields = fields;
        DependsOn = dependsOn;
        _body = body;
    }

    public string RelativePath { get; }

    public string Folder { get; }

    public string FileName { get; }

    public bool HasFrontMatter { get; }

    public IReadOnlyList<string> DependsOn { get; }

    public string? Field(string name) => _fields.GetValueOrDefault(name);

    public bool HasField(string name) => _fields.ContainsKey(name);

    public string? Id => Field("id");

    /// <summary>Conteúdo da seção <c>## Nome</c> (sem o título), ou null se a seção não existe.</summary>
    public string? Section(string name)
    {
        var heading = Regex.Match(_body, $@"^##[ \t]+{Regex.Escape(name)}[ \t]*$", RegexOptions.Multiline);
        if (!heading.Success)
        {
            return null;
        }

        var start = heading.Index + heading.Length;
        var next = NextHeading().Match(_body, start);
        var end = next.Success ? next.Index : _body.Length;
        return _body[start..end].Trim();
    }

    public static PlanDocument Load(string repositoryRoot, string path)
    {
        var relativePath = Path.GetRelativePath(repositoryRoot, path).Replace('\\', '/');
        var folder = Path.GetFileName(Path.GetDirectoryName(path)) ?? string.Empty;
        var text = MarkdownText.Normalize(File.ReadAllText(path));

        var fields = new Dictionary<string, string>(StringComparer.Ordinal);
        var dependsOn = new List<string>();

        if (!text.StartsWith("---\n", StringComparison.Ordinal))
        {
            return new PlanDocument(relativePath, folder, Path.GetFileName(path), false, fields, dependsOn, text);
        }

        var closing = text.IndexOf("\n---", 4, StringComparison.Ordinal);
        if (closing < 0)
        {
            return new PlanDocument(relativePath, folder, Path.GetFileName(path), false, fields, dependsOn, text);
        }

        var header = text[4..closing];
        var body = text[(closing + 4)..];
        string? currentKey = null;

        foreach (var line in header.Split('\n'))
        {
            var field = Field().Match(line);
            if (field.Success)
            {
                currentKey = field.Groups[1].Value;
                var value = field.Groups[2].Value.Trim();
                fields[currentKey] = value;
                if (currentKey == "depends_on")
                {
                    dependsOn.AddRange(ParseInlineList(value));
                }

                continue;
            }

            var item = ListItem().Match(line);
            if (item.Success && currentKey == "depends_on")
            {
                dependsOn.Add(item.Groups[1].Value.Trim());
            }
        }

        return new PlanDocument(relativePath, folder, Path.GetFileName(path), true, fields, dependsOn, body);
    }

    private static IEnumerable<string> ParseInlineList(string value)
    {
        if (!value.StartsWith('[') || !value.EndsWith(']'))
        {
            return [];
        }

        return value[1..^1].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    [GeneratedRegex(@"^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$")]
    private static partial Regex Field();

    [GeneratedRegex(@"^[ \t]*-[ \t]+(.+)$")]
    private static partial Regex ListItem();

    [GeneratedRegex(@"^##[ \t]", RegexOptions.Multiline)]
    private static partial Regex NextHeading();
}
