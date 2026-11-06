<#
.SYNOPSIS
  Sets GitHub Actions repository secrets for Campaign Conquest deploy workflows.

.DESCRIPTION
  Requires GitHub CLI (`gh`) authenticated to JoshieBoy454/Campaign-Conquest.
  Prompts for values (or pass -AutoDiscoverAws to fill non-secret IDs via AWS CLI).

  Secrets set:
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
    S3_BUCKET, CLOUDFRONT_DISTRIBUTION_ID
    EC2_HOST, EC2_SSH_KEY, EC2_USER

  Never prints secret values. Mongo/Gemini stay on the EC2 host only.
#>
[CmdletBinding()]
param(
    [string]$Repo = "JoshieBoy454/Campaign-Conquest",
    [string]$AwsRegion = "eu-north-1",
    [string]$CloudFrontDomain = "dllta4qw5dvjv.cloudfront.net",
    [string]$Ec2User = "ec2-user",
    [string]$PemPath = "",
    [switch]$AutoDiscoverAws,
    [switch]$SkipAwsKeys
)

$ErrorActionPreference = "Stop"

function Require-Gh {
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $gh) {
        throw "GitHub CLI not found. Install: winget install GitHub.cli — then reopen the terminal."
    }
    gh auth status 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Run: gh auth login" -ForegroundColor Yellow
        throw "gh is not authenticated."
    }
}

function Set-RepoSecret([string]$Name, [string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        Write-Host "SKIP $Name (empty)" -ForegroundColor DarkYellow
        return
    }
    $Value | gh secret set $Name --repo $Repo | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to set secret $Name" }
    Write-Host "OK  $Name" -ForegroundColor Green
}

function Read-Secret([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

Require-Gh
Write-Host "Setting secrets on $Repo" -ForegroundColor Cyan

$region = $AwsRegion
$bucket = $null
$distId = $null
$ec2Host = $null

if ($AutoDiscoverAws) {
    Write-Host "Discovering AWS resources (region=$region, CF=$CloudFrontDomain)..." -ForegroundColor Cyan
    $distId = aws cloudfront list-distributions `
        --query "DistributionList.Items[?DomainName=='$CloudFrontDomain'].Id | [0]" `
        --output text 2>$null
    if ($distId -eq "None") { $distId = $null }

    if ($distId) {
        $bucket = aws cloudfront get-distribution --id $distId `
            --query "Distribution.DistributionConfig.Origins.Items[?S3OriginConfig!=null].DomainName | [0]" `
            --output text 2>$null
        if ($bucket -and $bucket -match '^([^.]+)\.s3') {
            $bucket = $Matches[1]
        }
        elseif ($bucket -and $bucket -match '^([^.]+)\.s3\.') {
            $bucket = $Matches[1]
        }
    }

    $ec2Host = aws ec2 describe-addresses `
        --region $region `
        --query "Addresses[0].PublicIp" `
        --output text 2>$null
    if ($ec2Host -eq "None") { $ec2Host = $null }

    Write-Host "  CLOUDFRONT_DISTRIBUTION_ID = $distId"
    Write-Host "  S3_BUCKET                  = $bucket"
    Write-Host "  EC2_HOST                   = $ec2Host"
}

if (-not $SkipAwsKeys) {
    $accessKey = Read-Secret "AWS_ACCESS_KEY_ID (IAM user for Actions)"
    $secretKey = Read-Secret "AWS_SECRET_ACCESS_KEY"
    Set-RepoSecret "AWS_ACCESS_KEY_ID" $accessKey
    Set-RepoSecret "AWS_SECRET_ACCESS_KEY" $secretKey
}

Set-RepoSecret "AWS_REGION" $region

if (-not $bucket) {
    $bucket = Read-Host "S3_BUCKET (frontend bucket name)"
}
Set-RepoSecret "S3_BUCKET" $bucket

if (-not $distId) {
    $distId = Read-Host "CLOUDFRONT_DISTRIBUTION_ID (starts with E…)"
}
Set-RepoSecret "CLOUDFRONT_DISTRIBUTION_ID" $distId

if (-not $ec2Host) {
    $ec2Host = Read-Host "EC2_HOST (Elastic IP or public DNS)"
}
Set-RepoSecret "EC2_HOST" $ec2Host

Set-RepoSecret "EC2_USER" $Ec2User

if (-not $PemPath) {
    $PemPath = Read-Host "Path to EC2 .pem private key file"
}
if (-not (Test-Path -LiteralPath $PemPath)) {
    throw "PEM not found: $PemPath"
}
Get-Content -LiteralPath $PemPath -Raw | gh secret set EC2_SSH_KEY --repo $Repo | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Failed to set EC2_SSH_KEY" }
Write-Host "OK  EC2_SSH_KEY" -ForegroundColor Green

Write-Host ""
Write-Host "Done. List (names only):" -ForegroundColor Cyan
gh secret list --repo $Repo
Write-Host ""
Write-Host "Trigger deploys:" -ForegroundColor Cyan
Write-Host "  gh workflow run deploy-frontend.yml --repo $Repo"
Write-Host "  gh workflow run deploy-api.yml --repo $Repo"
