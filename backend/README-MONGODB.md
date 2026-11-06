# MongoDB persistence

Campaign Conquest can persist games to MongoDB. When `MongoDb:ConnectionString` is empty, the API uses in-memory storage instead.

## Configuration

`appsettings.json` defines the section (connection string intentionally empty in source control):

```json
"MongoDb": {
  "ConnectionString": "",
  "DatabaseName": "Campaign-Conquest-DB"
}
```

Set the connection string locally with **user secrets** (never commit credentials):

```bash
dotnet user-secrets set "MongoDb:ConnectionString" "<your-mongodb-connection-string>"
```

You can override the database name:

```bash
dotnet user-secrets set "MongoDb:DatabaseName" "Campaign-Conquest-DB"
```

Alternatively, set environment variables `MongoDb__ConnectionString` and `MongoDb__DatabaseName`.

## Collections

| Collection     | Purpose                                      |
|----------------|----------------------------------------------|
| `Games`        | Full `GameState` documents with CAS `Version` |
| `GameEvents`   | Append-only action/event log                 |
| `HostSessions` | SHA-256 hash of host cookie tokens per game  |

## Running without MongoDB

Leave the connection string empty. Games, events, and host sessions stay in memory for the lifetime of the API process.
