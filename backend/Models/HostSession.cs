using MongoDB.Bson.Serialization.Attributes;

namespace Models;

public class HostSession
{
    [BsonId]
    public Guid GameId { get; set; }

    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }
}
