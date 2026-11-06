# Campaign Conquest — AWS deploy (af-south-1)

Cheap v1: **S3 (frontend)** + **EC2 (API/SignalR)** + **MongoDB Atlas** + optional **Gemini**.

## Security reminders

- Never put Mongo / Gemini keys in git, `VITE_*`, or S3.
- Keys pasted in chat are considered exposed — rotate Atlas DB password and Gemini key when you can, then use the new values only in secrets/env.

## Local secrets (your PC)

```powershell
cd backend
dotnet user-secrets init
dotnet user-secrets set "MongoDb:ConnectionString" "mongodb+srv://USER:PASS@HOST/"
dotnet user-secrets set "MongoDb:DatabaseName" "Campaign-Conquest-DB"
dotnet user-secrets set "LLM:ApiKey" "PASTE_GEMINI_KEY_HERE"
dotnet user-secrets set "LLM:Model" "gemini-2.0-flash"
```

Do **not** run `dotnet user-secrets list` in shared screen recordings.

---

## What you need to do with EC2 (API)

Assume Ubuntu in **af-south-1**, public IP or Elastic IP, security group open for **22**, **80**, **443**.

### 1) Atlas network

In MongoDB Atlas → Network Access → allow your **EC2 public IP** (and your home IP for local dev).

### 2) Install runtime on EC2 (SSH in)

```bash
sudo apt update
sudo apt install -y nginx
# Install .NET 10 ASP.NET runtime (Microsoft package feed)
# https://learn.microsoft.com/dotnet/core/install/linux-ubuntu
```

### 3) Publish API from your PC

```powershell
cd "c:\Users\Joshu\Desktop\Campaign Conquest\Campaign-Conquest"
dotnet publish backend/CampaignConquest.Api.csproj -c Release -o .\publish-api
```

Requires the **.NET 10** SDK locally and the **ASP.NET Core 10** runtime on EC2.

Copy `publish-api\` to the server, e.g. `/var/www/campaign-api/`.

### 4) Env vars on EC2 (systemd)

Create `/etc/systemd/system/campaign-api.service`:

```ini
[Unit]
Description=Campaign Conquest API
After=network.target

[Service]
WorkingDirectory=/var/www/campaign-api
ExecStart=/usr/bin/dotnet /var/www/campaign-api/CampaignConquest.Api.dll
Restart=always
Environment=ASPNETCORE_URLS=http://127.0.0.1:5212
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=MongoDb__ConnectionString=mongodb+srv://USER:PASS@HOST/
Environment=MongoDb__DatabaseName=Campaign-Conquest-DB
Environment=LLM__ApiKey=YOUR_GEMINI_KEY
Environment=LLM__Model=gemini-2.0-flash
Environment=Cors__AllowedOrigins__0=https://YOUR_CLOUDFRONT_OR_S3_WEBSITE_ORIGIN

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now campaign-api
sudo systemctl status campaign-api
```

### 5) nginx reverse proxy (HTTP first; add cert later)

`/etc/nginx/sites-available/campaign`:

```nginx
server {
    listen 80;
    server_name YOUR_EC2_PUBLIC_DNS_OR_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:5212;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/campaign /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl http://127.0.0.1/health
```

**SignalR needs** the `Upgrade` / `Connection` headers above.

### 6) Note your API public URL

Example: `http://ec2-xx-xx-xx-xx.af-south-1.compute.amazonaws.com`  
(Prefer HTTPS + your domain when ready.)

---

## What you need to do with S3 (frontend)

### 1) Bucket settings

- Static website hosting **or** CloudFront in front of the bucket (CloudFront preferred).
- Public read for objects (or OAI/OAC if using CloudFront-only).
- CORS on the bucket not required for a pure SPA; the **API** CORS must allow the frontend origin.

### 2) Build frontend against the API URL

On your PC:

```powershell
cd frontend
# replace with your real EC2/API public origin (no trailing slash)
$env:VITE_API_BASE_URL="http://YOUR_EC2_OR_API_ORIGIN"
npm ci
npm run build
```

Upload everything in `frontend/dist/` to the S3 bucket root (`index.html`, `assets/`, `countries.geojson`, etc.).

### 3) SPA routing

S3 website / CloudFront must serve `index.html` for paths like `/play` and `/game/*` (error document / CloudFront custom error → 200 `index.html`).

### 4) Wire CORS on the API

`Cors__AllowedOrigins__0` on EC2 must be exactly your frontend origin, e.g.

- `https://d111111abcdef8.cloudfront.net`  
or  
- `http://your-bucket.s3-website.af-south-1.amazonaws.com`

Restart API after changing it: `sudo systemctl restart campaign-api`.

---

## CloudFront single-host layout (current plan)

Distribution `https://dllta4qw5dvjv.cloudfront.net`:

| Behavior | Origin | Notes |
|---|---|---|
| Default `*` | Private S3 (OAC) | React `dist/`; default root `index.html` |
| `/api/*` | EC2 HTTP:80 | CachingDisabled; all methods |
| `/hubs/*` | EC2 HTTP:80 | **Required for SignalR**; CachingDisabled; all methods; WebSockets on |

SPA fallback: CloudFront custom error responses for **403/404 → 200 `/index.html`** (S3 private buckets often return 403 for missing keys).

### Upload frontend

```powershell
cd frontend
# VITE_API_BASE_URL is empty in .env.production → relative /api + /hubs
npm ci
npm run build
aws s3 sync .\dist\ s3://YOUR_BUCKET_NAME/ --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### EC2 env CORS (optional when same CloudFront origin)

In `/etc/campaign-api.env`:

```text
Cors__AllowedOrigins__0=http://localhost:5173
Cors__AllowedOrigins__1=https://dllta4qw5dvjv.cloudfront.net
```

```bash
sudo systemctl restart campaign-api
```

### SignalR check

Browser console on the CloudFront site should connect to:

```text
wss://dllta4qw5dvjv.cloudfront.net/hubs/games
```

If `/hubs/*` is missing as a CF behavior, negotiate/WebSocket calls fall through to S3 and fail.

## Smoke checklist

- [ ] `https://dllta4qw5dvjv.cloudfront.net/api/games/countries` → JSON
- [ ] CloudFront homepage loads React (not S3 XML / AccessDenied)
- [ ] Map + `countries.geojson` load
- [ ] New Game works; host cookie survives refresh
- [ ] Spectator link in another browser is read-only
- [ ] SignalR connects (`/hubs/games`)
- [ ] Atlas shows game documents after create
- [ ] Gemini commentary works or fails open (factual log still shows)

## Cost notes

- One small EC2 + S3 + Atlas M0 + free Gemini tier fits a $100 credit easily.

