param([ValidateSet('start','stop','status')][string]$Action='start',[string]$PostgresBin='C:/Program Files/PostgreSQL/16/bin')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $projectRoot '.local/pgdata'
$logFile = Join-Path $projectRoot '.local/postgres.log'
$pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
if (!(Test-Path -LiteralPath $pgCtl)) { throw 'pg_ctl bulunamadı. -PostgresBin parametresini PostgreSQL bin klasörüne ayarlayın.' }
if (!(Test-Path -LiteralPath $dataDir)) { throw 'Yerel veritabanı yok. README kurulum adımlarını uygulayın.' }
if ($Action -eq 'start') {
    & $pgCtl -D $dataDir status *> $null
    if ($LASTEXITCODE -eq 0) { Write-Output 'PostgreSQL zaten çalışıyor.'; exit 0 }
    & $pgCtl -D $dataDir -l $logFile -o '-p 55432 -h 127.0.0.1' -w start
} elseif ($Action -eq 'stop') {
    & $pgCtl -D $dataDir -m fast -w stop
} else {
    & $pgCtl -D $dataDir status
}
exit $LASTEXITCODE
