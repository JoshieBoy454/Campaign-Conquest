# Campaign Conquest

Turn-based, Risk-inspired strategy game: **1 human + 9 NPCs** fight over **10 countries** on a MapLibre world map. Friends can spectate live over SignalR. The C# backend owns all rules, dice, combat, NPC decisions, and victory — the React client is presentation only.

---

## Features

- Interactive world map (MapLibre) with country selection, troop markers, and faction fly-to
- Five-phase turns: Upkeep → Reinforce → Combat → post-combat Reinforce → End
- Risk-style combat dice (1–3 attacker dice, up to 2 defender) with CSS dice UI and Pixi clash effects
- NPC autoplay hosted service with adjustable speed (1× / 2×)
- Live spectator mode via game id / shareable URL
- Host-only mutations via HttpOnly cookie (spectators are read-only)
- Optional MongoDB persistence (in-memory fallback when unset)
- Optional Gemini battle commentary after combat rounds
- GitHub Actions deploy to AWS (S3/CloudFront frontend, EC2 API)

---

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8, MapLibre GL, Pixi.js, SignalR client |
| Backend | ASP.NET Core (.NET 10), SignalR, OpenAPI |
| Data | Optional MongoDB Atlas; otherwise in-memory |
| LLM (optional) | Google Gemini (`gemini-2.0-flash`) |
| CI/CD | GitHub Actions → S3 + CloudFront (UI), EC2 (API) |

---

## Repository layout

```
Campaign-Conquest/
├── frontend/          # Vite + React + MapLibre client
├── backend/           # ASP.NET Core Web API + SignalR
│   ├── Controllers/   # REST game endpoints
│   ├── Hubs/          # SignalR GameHub
│   ├── Rules/         # Population + combat dice rules
│   ├── Services/      # Init, turns, combat, NPCs, host auth, LLM
│   ├── Repositories/  # In-memory + Mongo implementations
│   └── Data/          # Population CSV + supported country ids
├── .github/workflows/ # deploy-api.yml, deploy-frontend.yml
├── scripts/           # Deploy / IAM helpers
├── tools/             # Asset + geo processing
├── CHANGELOG.md
└── CampaignConquest.sln
```

---

## Prerequisites

- [.NET SDK 10](https://dotnet.microsoft.com/download) (see `global.json` — currently `10.0.403`)
- [Node.js 22+](https://nodejs.org/) and npm
- (Optional) [MongoDB](https://www.mongodb.com/) connection string for persistence
- (Optional) Gemini API key for battle commentary

---

## Local development

### 1. Backend

```powershell
cd backend

# Optional — persist games to MongoDB (empty = in-memory)
dotnet user-secrets set "MongoDb:ConnectionString" "<atlas-uri>"

# Optional — Gemini commentary
dotnet user-secrets set "LLM:ApiKey" "<gemini-api-key>"

dotnet run --launch-profile http
```

API listens at **http://localhost:5212**

- Health: `GET /health`
- OpenAPI (Development): mapped when `ASPNETCORE_ENVIRONMENT=Development`
- SignalR hub: `/hubs/games`

Mongo details: [`backend/README-MONGODB.md`](backend/README-MONGODB.md)

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev
```

App: **http://localhost:5173**

Vite proxies `/api` and `/hubs` to `http://localhost:5212`, so you normally do **not** need `VITE_API_BASE_URL` locally. In production, leave it empty so the browser hits the same CloudFront origin for API and hubs.

---

## Configuration

`backend/appsettings.json` (secrets stay out of source control):

| Key | Purpose |
| --- | --- |
| `MongoDb:ConnectionString` | Empty → in-memory store; set for Mongo |
| `MongoDb:DatabaseName` | Default `Campaign-Conquest-DB` |
| `Cors:AllowedOrigins` | Local Vite + production CloudFront origin |
| `LLM:Provider` / `LLM:Model` / `LLM:ApiKey` | Battle commentary (optional) |
| `Npc:BaseDelayMs` | Base delay between NPC steps (default `3600`) |
| `ForceHttpsRedirection` | Production HTTPS redirect (usually `false` behind CloudFront/nginx) |

Environment variable equivalents use `__` (e.g. `MongoDb__ConnectionString`, `LLM__ApiKey`).

**Never commit Mongo or LLM secrets.**

---

## How to play

1. Open the landing page, enter a player name, start a **New Game**.
2. Pick your starting country on the map. The backend creates **10 factions** (you + 9 NPCs), each with one territory, rolls turn order (D20), and starts the match.
3. On your turn, move through phases with **Continue**:
   - **Reinforce** — spend pool armies onto countries you own; left-click source / right-click destination to transfer (leave ≥1 behind).
   - **Combat** — left-click your country (2+ soldiers), right-click an enemy, commit attackers, roll or retreat. When an NPC attacks you, the combat panel opens for defense.
4. Conquer all territories to win. Share the game id / `/game/{id}` link so others can **spectate** live (read-only).

Full in-game rules: Rules panel in the HUD.

### Core rules (backend-authoritative)

- Exactly **10** active territories per game
- Soldier values derive from population (`PopulationRules`)
- Conquest reinforcements: `max(2, soldierValue / 2)`
- Combat dice: Risk-style high→low pairing; ties favor neither side (no loss)
- Optimistic concurrency via `version` + optional `actionId` on mutations
- Host cookie authorises write actions; spectator URLs are public game ids only

---

## Architecture notes

```
Browser (host) ──cookie──► REST /api/games/... ──► GameActionService / Rules
Browser (any)  ──────────► SignalR /hubs/games  ◄── GameRealtimePublisher
NPCTurnHostedService ────► same action pipeline as the human host
```

- **Authoritative server** — dice, combat resolution, NPC AI, and victory are never trusted from the client.
- **Host sessions** — create-game sets an HttpOnly host cookie; session tokens are stored hashed (SHA-256) in `HostSessions`.
- **Realtime** — clients join a SignalR group per `gameId` and receive state / event updates.
- **Persistence** — Mongo collections `Games`, `GameEvents`, `HostSessions`, or process-lifetime in-memory equivalents.

---

## API overview

Base route: `/api/games`

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/countries` | Playable catalogue + soldier values |
| `POST` | `/` | Create game (`selectedCountryId`, optional `playerName`) → sets host cookie |
| `GET` | `/{gameId}` | Current `GameState` |
| `GET` | `/{gameId}/host-status` | Whether this browser is the host |
| `GET` | `/{gameId}/events` | Action / event log |
| `POST` | `/{gameId}/actions/advance-phase` | Host |
| `POST` | `/{gameId}/actions/allocate-reinforcements` | Host |
| `POST` | `/{gameId}/actions/transfer-soldiers` | Host |
| `POST` | `/{gameId}/actions/combat/start` | Host |
| `POST` | `/{gameId}/actions/combat/roll` | Host (or defending human) |
| `POST` | `/{gameId}/actions/combat/retreat` | Host |
| `POST` | `/{gameId}/settings/npc-speed` | Host |

SignalR: connect to `/hubs/games`, then `JoinGame(gameId)`.

---

## Scripts & checks

```powershell
# Backend tests (xUnit combat + population rules)
dotnet test CampaignConquest.sln

# Frontend typecheck + production build
cd frontend
npx tsc -b
npm run build

# Lint
npm run lint
```

---

## Deployment

Push to `main` (path-filtered) or run the workflows manually:

| Workflow | Deploys |
| --- | --- |
| `.github/workflows/deploy-frontend.yml` | `npm ci` + build → S3 sync (+ CloudFront) |
| `.github/workflows/deploy-api.yml` | `dotnet publish` → SCP to EC2 → restart `campaign-api` |

Required GitHub secrets typically include AWS credentials / region / bucket for the frontend, and `EC2_SSH_KEY`, `EC2_HOST`, optional `EC2_USER` / `LLM_API_KEY` for the API.

CORS already includes the CloudFront origin configured in `appsettings.json`.

---

## Routes (frontend)

| Path | Purpose |
| --- | --- |
| `/` | Landing — name entry, new game, spectate by id |
| `/play` | Country selection / game bootstrap |
| `/game/{gameId}` | Live play or spectator view |

---

## Rollback

If you need the pre-completion baseline:

- Branch: `backup/pre-completion`
- Tag: `v0-playable-baseline`

See [`CHANGELOG.md`](CHANGELOG.md) for milestone notes.

---

## License / status

Private project — playable completion baseline as of 2026-11-06. Contributions and deploy secrets stay out of the repo; use user-secrets / GitHub Actions secrets for credentials.
