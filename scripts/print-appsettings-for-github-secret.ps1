# Copy output into GitHub → Settings → Secrets → Actions → APPSETTINGS_JSON
$path = Join-Path $PSScriptRoot '..\appsettings.json'
if (-not (Test-Path $path)) {
  Write-Error "Missing $path — create appsettings.json locally first."
  exit 1
}
Get-Content $path -Raw
