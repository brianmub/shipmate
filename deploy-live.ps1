# ShipMate Production Web Deployment Script
# Target: https://shipmate.co.zw (212.90.121.97)

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  ShipMate Live Web Deployment (212.90.121.97)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

Write-Host "Building web-admin production bundle..." -ForegroundColor Yellow
npm --prefix web-admin run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Aborting deployment." -ForegroundColor Red
    exit 1
}

Write-Host "`nCompressing bundle into deploy.zip..." -ForegroundColor Yellow
Compress-Archive -Path "web-admin\dist\*" -DestinationPath "deploy.zip" -Force

Write-Host "Uploading deploy.zip to live server via SSH..." -ForegroundColor Yellow
scp deploy.zip root@212.90.121.97:/tmp/deploy.zip

Write-Host "Extracting into /var/www/shipmate/ and reloading Nginx..." -ForegroundColor Yellow
ssh root@212.90.121.97 "unzip -qo /tmp/deploy.zip -d /var/www/shipmate/ && rm -f /tmp/deploy.zip && systemctl reload nginx"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Successfully deployed live! Visit: https://shipmate.co.zw" -ForegroundColor Green
} else {
    Write-Host "`n❌ Deployment failed. Please check server logs." -ForegroundColor Red
}
