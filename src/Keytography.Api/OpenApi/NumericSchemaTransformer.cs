using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace Keytography.Api.OpenApi;

/// <summary>
/// O JSON padrao do ASP.NET Core aceita numeros escritos como string na LEITURA, e o gerador de
/// OpenAPI reflete isso como "number | string" (com um pattern). A API sempre EMITE numeros, e os
/// clientes devem enviar numeros: remover a alternativa "string" mantem o contrato (e os tipos
/// gerados a partir dele) fiel ao que realmente trafega, sem mudar o comportamento da API.
/// </summary>
public sealed class NumericSchemaTransformer : IOpenApiSchemaTransformer
{
    public Task TransformAsync(
        OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        if (schema.Type is { } type
            && (type.HasFlag(JsonSchemaType.Number) || type.HasFlag(JsonSchemaType.Integer))
            && type.HasFlag(JsonSchemaType.String))
        {
            schema.Type = type & ~JsonSchemaType.String;
            schema.Pattern = null;
        }

        return Task.CompletedTask;
    }
}
