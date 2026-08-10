# ─────────────────────────────────────────────────────────────────────────────
# try-on-phone.ps1  —  one command to run the app on your phone, no backend.
#
#   1. Install Node.js 20 LTS from https://nodejs.org (once).
#   2. Right-click this file → "Run with PowerShell"   (or run it from a terminal)
#   3. Install "Expo Go" on your phone, then scan the QR code that appears.
#
# It starts in DEMO mode (local-only, no login, no Supabase) so you can try
# starting/finishing a shift, GPS, the timer, hours and settings right away.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "`n== Tööaeg — try on phone (demo mode) ==`n" -ForegroundColor Cyan

# check node
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "Node.js is not installed." -ForegroundColor Red
  Write-Host "Install Node 20 LTS from https://nodejs.org, reopen the terminal, and run this again."
  exit 1
}
Write-Host ("Node " + (node -v)) -ForegroundColor Green

# force demo mode regardless of any .env
$env:EXPO_PUBLIC_DEMO = "1"

# install deps if needed
if (-not (Test-Path ".\node_modules")) {
  Write-Host "`nInstalling dependencies (first run, ~1-3 min)...`n" -ForegroundColor Yellow
  npm install
}

Write-Host "`nStarting Expo. Scan the QR below with Expo Go (Android) or the Camera app (iPhone)." -ForegroundColor Cyan
Write-Host "Phone and PC must be on the same Wi-Fi. If it won't connect, press Ctrl+C and run:  npx expo start --tunnel`n" -ForegroundColor DarkGray

npx expo start
