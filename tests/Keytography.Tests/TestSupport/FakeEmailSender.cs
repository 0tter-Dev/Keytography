using Keytography.Domain;

namespace Keytography.Tests.TestSupport;

public class FakeEmailSender : IEmailSender
{
    public List<(string ToEmail, string Subject, string Body)> SentEmails { get; } = [];

    public Task SendAsync(string toEmail, string subject, string body, CancellationToken cancellationToken = default)
    {
        SentEmails.Add((toEmail, subject, body));
        return Task.CompletedTask;
    }
}
