# Campaign Conquest — AWS deploy (af-south-1)

Cheap v1 topology aimed at Cape Town latency and your $100 credit.

## Stack

| Piece | Service | Notes |
|---|---|---|
| Frontend | S3 + CloudFront | Vite `npm run build` → upload `frontend/dist` |
| API + SignalR | Lightsail or EC2 t3.small in **af-south-1** | Single instance first (no Redis backplane yet) |
| Database | MongoDB Atlas `Campaign-Conquest-DB` | Replica set; allowlist the instance IP |
| Secrets | SSM Parameter Store / Secrets Manager | `MongoDb__ConnectionString`, `LLM__ApiKey` |
| Commentary | Google Gemini Flash | Free tier; optional |

## Local secrets (do not commit)

```powershell
cd backend
dotnet user-secrets init
dotnet user-secrets set "MongoDb:ConnectionString" "mongodb+srv://USER:PASS@HOST/"
dotnet user-secrets set "MongoDb:DatabaseName" "Campaign-Conquest-DB"
dotnet user-secrets set "LLM:ApiKey" "YOUR_GEMINI_KEY"
```

Rotate any password that was pasted into chat.

## API host setup (Lightsail sketch)

1. Create Ubuntu Lightsail in `af-south-1`.
2. Open ports 80/443 (and 22 for you).
3. Install .NET 9 runtime + nginx.
4. Publish:

```powershell
dotnet publish backend/CampaignConquest.Api.csproj -c Release -o ./publish
```

5. Run as a systemd service with env vars for Mongo + LLM.
6. nginx reverse-proxy `/api` and `/hubs` (WebSocket upgrade headers required).

## Frontend

```powershell
cd frontend
npm ci
npm run build
# upload dist/ to S3; point CloudFront origin at the bucket
# set VITE_API_BASE_URL at build time to the public API origin
```

## CORS

Production `Cors:AllowedOrigins` must list the CloudFront HTTPS origin exactly. Dev keeps `http://localhost:5173`.

## Smoke checklist

- [ ] `/health` returns ok
- [ ] Create game from CloudFront URL
- [ ] Host cookie survives refresh on same browser
- [ ] Spectator link loads read-only
- [ ] SignalR updates both clients
- [ ] Atlas shows a `games` document after create
- [ ] Restart API; game still loads

## Cost notes

- Prefer one small Cape Town instance over multi-AZ App Runner until traffic exists.
- Atlas M0 is fine for early playtests.
- CloudFront + S3 is near-free at this scale.
