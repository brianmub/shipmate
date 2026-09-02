# ShipMate Production Web Deployment Script
# Target: https://shipmate.co.zw (212.90.121.97)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ShipMate Live Web Deployment (212.90.121.97)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Ensure dist exists
if (-not (Test-Path "web-admin\dist")) {
    Write-Host "Building web-admin..." -ForegroundColor Yellow
    npm --prefix web-admin run build
}

Write-Host "`nTransferring production bundle to /var/www/shipmate/..." -ForegroundColor Yellow
scp -r "web-admin\dist\*" root@212.90.121.97:/var/www/shipmate/

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully deployed to https://shipmate.co.zw" -ForegroundColor Green
} else {
    Write-Host "`n❌ SCP transfer failed. Please check your SSH password or connection." -ForegroundColor Red
}
