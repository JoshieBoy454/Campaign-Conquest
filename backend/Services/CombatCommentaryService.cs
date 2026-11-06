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
    public required int AttackerSoldiersRemaining { get; init; }
    public required int DefenderSoldiersRemaining { get; init; }
    public required bool BattleFinished { get; init; }
    public string? Outcome { get; init; }
}

// Gemini adapter — missing key falls back to colourful factual lines (still posts to Battle AI)
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
            logger.LogInformation("LLM:ApiKey missing — using narrative fallback for Battle AI");
            return FactualLine(context);
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
                                "You are Battle AI, a dry holo tactical commentator for a sci-fi conquest game. " +
                                "Speak in 1-2 sharp sentences with personality (wry, tense, or triumphant). " +
                                "ONLY use the structured facts below — never invent dice, losses, captures, or future plans. " +
                                "Mention force sizes when relevant. Do not use markdown.\n\n" +
                                JsonSerializer.Serialize(context)
                        }
                    }
                }
            },
            generationConfig = new
            {
                temperature = 0.9,
                maxOutputTokens = 160,
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
                string body = await response.Content.ReadAsStringAsync(cancellationToken);
                logger.LogWarning(
                    "Gemini commentary failed: {Status} {Body}",
                    response.StatusCode,
                    body.Length > 240 ? body[..240] : body);
                return FactualLine(context);
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
                return FactualLine(context);
            }

            return text.Trim();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gemini commentary blew up — gameplay continues");
            return FactualLine(context);
        }
    }

    private static string FactualLine(CombatCommentaryContext context)
    {
        string atkDice = string.Join("·", context.AttackerDice);
        string defDice = string.Join("·", context.DefenderDice);
        string forces =
            $"{context.AttackerSoldiersRemaining} vs {context.DefenderSoldiersRemaining} still in the fight";

        if (context.BattleFinished)
        {
            string end = string.IsNullOrWhiteSpace(context.Outcome)
                ? "Battle resolved."
                : context.Outcome!;
            return $"Round {context.Round}: {context.AttackerCountry} [{atkDice}] into " +
                   $"{context.DefenderCountry} [{defDice}] — losses {context.AttackerCasualties}/" +
                   $"{context.DefenderCasualties}. {end}";
        }

        if (context.DefenderCasualties > context.AttackerCasualties)
        {
            return $"Round {context.Round}: {context.AttackerCountry} punches through — dice {atkDice} " +
                   $"vs {defDice}, defender bleeds {context.DefenderCasualties}. {forces}.";
        }

        if (context.AttackerCasualties > context.DefenderCasualties)
        {
            return $"Round {context.Round}: {context.DefenderCountry} holds the line — {defDice} answers " +
                   $"{atkDice}. Attackers drop {context.AttackerCasualties}. {forces}.";
        }

        return $"Round {context.Round}: steel meets steel over {context.AttackerCountry} → " +
               $"{context.DefenderCountry}. Dice {atkDice} / {defDice}, even trade " +
               $"{context.AttackerCasualties}/{context.DefenderCasualties}. {forces}.";
    }
}

//-----------------------------------------------------------------End of File----------------------------------------------------------------->
