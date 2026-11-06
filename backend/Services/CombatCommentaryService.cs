using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Services;

public interface ICombatCommentaryService
{
    Task<string?> GenerateAsync(CombatCommentaryContext context, CancellationToken cancellationToken);
}

public sealed class CombatCommentaryContext
{
    public required string AttackerCountry { get; init; }
    public required string DefenderCountry { get; init; }
    public required int Round { get; init; }
    public required IReadOnlyList<int> AttackerDice { get; init; }
    public required IReadOnlyList<int> DefenderDice { get; init; }
    public required int AttackerCasualties { get; init; }
    public required int DefenderCasualties { get; init; }
    public required bool BattleFinished { get; init; }
}

// Gemini adapter — no key means we quietly skip and the UI keeps factual combat text
public class GeminiCombatCommentaryService(
    IConfiguration configuration,
    ILogger<GeminiCombatCommentaryService> logger,
    IHttpClientFactory httpClientFactory
) : ICombatCommentaryService
{
    public async Task<string?> GenerateAsync(
        CombatCommentaryContext context,
        CancellationToken cancellationToken)
    {
        string? apiKey = configuration["LLM:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            return null;
        }

        string model = configuration["LLM:Model"] ?? "gemini-2.0-flash";
        string url =
            $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";

        var prompt = new
        {
            contents = new[]
            {
                new
                {
                    parts = new[]
                    {
                        new
                        {
                            text =
                                "You narrate a turn-based strategy game's battle. Only describe facts in " +
                                "provided structured event data. Never invent dice, casualties, country captures, " +
                                "future outcomes, or strategy decisions. Keep it vivid and concise (1-3 sentences).\n\n" +
                                JsonSerializer.Serialize(context)
                        }
                    }
                }
            }
        };

        try
        {
            HttpClient client = httpClientFactory.CreateClient("llm");
            using var request = new HttpRequestMessage(HttpMethod.Post, url);
            request.Content = new StringContent(
                JsonSerializer.Serialize(prompt),
                Encoding.UTF8,
                "application/json");
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using HttpResponseMessage response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Gemini commentary failed: {Status}", response.StatusCode);
                return null;
            }

            using JsonDocument doc = JsonDocument.Parse(
                await response.Content.ReadAsStringAsync(cancellationToken));

            string? text = doc.RootElement
                .GetProperty("candidates")[0]
                .GetProperty("content")
                .GetProperty("parts")[0]
                .GetProperty("text")
                .GetString();

            if (string.IsNullOrWhiteSpace(text) || text.Length > 800)
            {
                return null;
            }

            return text.Trim();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gemini commentary blew up — gameplay continues");
            return null;
        }
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
