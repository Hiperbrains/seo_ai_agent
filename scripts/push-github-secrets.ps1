# Upload local appsettings.json to GitHub Actions secrets (requires gh CLI + auth).
# Usage: .\scripts\push-github-secrets.ps1
#        .\scripts\push-github-secrets.ps1 -Repo Hiperbrains/seo_ai_agent
param(
  [string]$Repo = 'Hiperbrains/seo_ai_agent'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$appsettings = Join-Path $root 'appsettings.json'
$envFile = Join-Path $root '.env'

if (-not (Test-Path $appsettings)) {
  Write-Error "Missing $appsettings"
}

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  Write-Host 'Installing GitHub CLI (winget)...'
  winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
  $gh = Get-Command gh -ErrorAction SilentlyContinue
}
if (-not $gh) {
  Write-Error 'gh CLI not found. Install from https://cli.github.com/ then run: gh auth login'
}

$auth = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
  Write-Error "Not logged in to GitHub. Run: gh auth login`n$auth"
}

Write-Host "Setting APPSETTINGS_JSON on $Repo ..."
Get-Content $appsettings -Raw | gh secret set APPSETTINGS_JSON --repo $Repo

if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*HIPERBRAINS_DATABASE=' } | Select-Object -First 1
  if ($line) {
    $val = $line -replace '^\s*HIPERBRAINS_DATABASE=', ''
    Write-Host 'Setting HIPERBRAINS_DATABASE (backup secret) ...'
    $val | gh secret set HIPERBRAINS_DATABASE --repo $Repo
  }
}

Write-Host 'Done. Re-run Actions workflow on DEV branch.'
