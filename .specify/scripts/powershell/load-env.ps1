#!/usr/bin/env pwsh
# Load SpecKit environment variables from .env file
# Usage: . .\.specify\scripts\powershell\load-env.ps1
#    or: source .specify/scripts/powershell/load-env.ps1

$repoRoot = git rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0) {
    # Fallback if not in git repo
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
}

$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path $envFile)) {
    Write-Warning "No .env file found at: $envFile"
    Write-Host "Create one by copying .env.example:" -ForegroundColor Yellow
    Write-Host "  cp .env.example .env" -ForegroundColor Cyan
    Write-Host "Then edit .env with your actual values." -ForegroundColor Yellow
    exit 1
}

Write-Host "Loading environment variables from: $envFile" -ForegroundColor Green

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    
    # Skip empty lines and comments
    if ($line -and -not $line.StartsWith('#')) {
        # Parse KEY=VALUE format
        if ($line -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            
            # Remove quotes if present
            $value = $value -replace '^["'']|["'']$', ''
            
            # Set environment variable for current session
            Set-Item -Path "env:$key" -Value $value -Force
            
            # Show loaded variable (mask sensitive values)
            if ($key -match 'TOKEN|SECRET|PASSWORD|KEY') {
                $maskedValue = $value.Substring(0, [Math]::Min(10, $value.Length)) + "..." + $value.Substring([Math]::Max(0, $value.Length - 4))
                Write-Host "  ✓ $key=$maskedValue" -ForegroundColor Gray
            } else {
                Write-Host "  ✓ $key=$value" -ForegroundColor Gray
            }
        }
    }
}

Write-Host "`nEnvironment variables loaded successfully!" -ForegroundColor Green
Write-Host "These variables are available in this PowerShell session only." -ForegroundColor Yellow
