using MongoDB.Bson.Serialization.Attributes;

namespace Models;

[BsonIgnoreExtraElements]
public class GameEvent
{
    public Guid GameId { get; set; }

    public long Sequence { get; set; }

    public string EventId { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    [BsonDateTimeOptions(Kind = DateTimeKind.Utc)]
    public DateTime OccurredAtUtc { get; set; }

    public string PayloadJson { get; set; } = string.Empty;
}
