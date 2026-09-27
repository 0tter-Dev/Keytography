using Keytography.Domain;
using Microsoft.Extensions.Logging;

namespace Keytography.Infrastructure;

/// <summary>
/// Implementacao de desenvolvimento: registra o e-mail em log em vez de enviar de verdade.
/// Integracao com um provedor real (SMTP/servico) fica para uma decisao tecnica futura.
/// </summary>
public class LoggingEmailSender : IEmailSender
{
    private readonly ILogger<LoggingEmailSender> _logger;

    public LoggingEmailSender(ILogger<LoggingEmailSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
    {
        _logger.LogInformation(
            "E-mail (dev, nao enviado de verdade) para {ToEmail} | Assunto: {Subject} | Corpo: {Body}",
            toEmail, subject, body);
        return Task.CompletedTask;
    }
}
