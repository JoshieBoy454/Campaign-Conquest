namespace Models;

public class GameEvent
{
    public Guid GameId { get; set; }

    public long Sequence { get; set; }

    public string EventId { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public DateTime OccurredAtUtc { get; set; }

    public string PayloadJson { get; set; } = string.Empty;
}
