# Campaign Conquest

Turn-based Risk-inspired strategy game: 1 human + 9 NPCs on a MapLibre world map. Spectators watch live over SignalR. C# owns all rules and dice.

## Repo layout

- `frontend/` — Vite + React + MapLibre
- `backend/` — ASP.NET Core Web API + SignalR
- `docs/DEPLOY.md` — AWS Cape Town deploy notes
- `backup/pre-completion` / tag `v0-playable-baseline` — pre-completion rollback

## Local run

### Backend

```powershell
cd backend
dotnet user-secrets set "MongoDb:ConnectionString" "<atlas-uri>"   # optional; empty = in-memory
dotnet run --launch-profile http
```

API: `http://localhost:5212`

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

App: `http://localhost:5173`

## Tests

```powershell
dotnet test CampaignConquest.sln
cd frontend
npx tsc -b
npm run build
```

## Important rules

- Exactly 10 active territories
- Backend is authoritative for dice, combat, NPC decisions, victory
- Host cookie authorises mutations; spectator URLs are public game ids only
- Never commit Mongo / LLM secrets
