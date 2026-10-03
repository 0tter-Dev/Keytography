using System.Text;
using System.Text.RegularExpressions;

namespace Keytography.Tests.DocumentationGovernance;

/// <summary>Leitura mínima de Markdown para as regras de governança: código, títulos, âncoras e links.</summary>
internal static partial class MarkdownText
{
    public static string Normalize(string text) => text.Replace("\r\n", "\n");

    /// <summary>
    /// Remove blocos de código cercados (``` ou ~~~) mantendo as quebras de linha, para que o número de
    /// linha de qualquer trecho restante continue igual ao do arquivo original.
    /// </summary>
    public static string StripFences(string markdown)
    {
        var builder = new StringBuilder();
        var inFence = false;
        var fenceChar = '`';
        var fenceLength = 0;

        foreach (var line in Normalize(markdown).Split('\n'))
        {
            var trimmed = line.TrimStart();
            if (TryReadFence(trimmed, out var character, out var length))
            {
                if (!inFence)
                {
                    inFence = true;
                    fenceChar = character;
                    fenceLength = length;
                }
                else if (character == fenceChar && length >= fenceLength && trimmed.TrimStart(character).Trim().Length == 0)
                {
                    inFence = false;
                }

                builder.Append('\n');
                continue;
            }

            builder.Append(inFence ? string.Empty : line).Append('\n');
        }

        return builder.ToString().TrimEnd('\n') + "\n";
    }

    /// <summary>Remove código inline (`...`) e blocos cercados; o que sobra é texto "de verdade".</summary>
    public static string StripCode(string markdown) => InlineCode().Replace(StripFences(markdown), string.Empty);

    /// <summary>Âncoras (slugs no estilo do GitHub) de todos os títulos do documento, com sufixo -1, -2 para repetidos.</summary>
    public static HashSet<string> Anchors(string markdown)
    {
        var anchors = new HashSet<string>(StringComparer.Ordinal);
        var counts = new Dictionary<string, int>(StringComparer.Ordinal);

        foreach (Match match in Heading().Matches(StripFences(markdown)))
        {
            var slug = Slug(match.Groups[1].Value);
            if (counts.TryGetValue(slug, out var seen))
            {
                counts[slug] = seen + 1;
                anchors.Add($"{slug}-{seen}");
            }
            else
            {
                counts[slug] = 1;
                anchors.Add(slug);
            }
        }

        return anchors;
    }

    /// <summary>Gera a âncora de um título como o GitHub: minúsculas, só letras/números/_/-, espaços viram hífens.</summary>
    public static string Slug(string heading)
    {
        var text = LinkSyntax().Replace(heading, "$1").Trim().ToLowerInvariant();
        var builder = new StringBuilder();
        foreach (var character in text)
        {
            if (char.IsLetterOrDigit(character) || character is '_' or '-')
            {
                builder.Append(character);
            }
            else if (character == ' ')
            {
                builder.Append('-');
            }
        }

        return builder.ToString();
    }

    public sealed record Link(string Target, int Line);

    /// <summary>Links <c>[texto](destino)</c> e imagens, fora de blocos e trechos de código.</summary>
    public static IEnumerable<Link> Links(string markdown)
    {
        var text = StripCode(markdown);
        foreach (Match match in InlineLink().Matches(text))
        {
            var line = text.AsSpan(0, match.Index).Count('\n') + 1;
            yield return new Link(match.Groups[1].Value, line);
        }
    }

    public static int LineOf(string text, int index) => text.AsSpan(0, index).Count('\n') + 1;

    private static bool TryReadFence(string trimmedLine, out char character, out int length)
    {
        character = '\0';
        length = 0;
        if (trimmedLine.Length < 3 || (trimmedLine[0] != '`' && trimmedLine[0] != '~'))
        {
            return false;
        }

        character = trimmedLine[0];
        while (length < trimmedLine.Length && trimmedLine[length] == character)
        {
            length++;
        }

        return length >= 3;
    }

    [GeneratedRegex("`[^`\n]*`")]
    private static partial Regex InlineCode();

    [GeneratedRegex(@"^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$", RegexOptions.Multiline)]
    private static partial Regex Heading();

    [GeneratedRegex(@"\[([^\]]*)\]\([^)]*\)")]
    private static partial Regex LinkSyntax();

    [GeneratedRegex("""!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)""")]
    private static partial Regex InlineLink();
}
