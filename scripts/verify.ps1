# quick smoke for local work
$ErrorActionPreference = "Stop"
Set-Location "$PSScriptRoot\.."

Write-Host "dotnet build..."
dotnet build CampaignConquest.sln
Write-Host "dotnet test..."
dotnet test CampaignConquest.sln --no-build

Write-Host "frontend tsc + build..."
Set-Location frontend
npm install
npx tsc -b --pretty false
npm run build

Write-Host "ok"
