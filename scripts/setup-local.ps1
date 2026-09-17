$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localDir = Join-Path $projectRoot '.local'
New-Item -ItemType Directory -Force -Path $localDir | Out-Null
function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return [Convert]::ToBase64String($bytes).Replace('+','-').Replace('/','_').TrimEnd('=')
}
$envPath = Join-Path $projectRoot 'backend/.env'
if (Test-Path -LiteralPath $envPath) { throw 'backend/.env zaten var; mevcut ayarlar korunuyor.' }
$dbPassword = New-Secret
$adminPassword = New-Secret
$agentPassword = New-Secret
$secret = New-Secret
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $localDir 'pg-password.txt'), $dbPassword, $utf8)
$envText = @"
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://helpdesk:${dbPassword}@127.0.0.1:55432/helpdesk?schema=public
JWT_ACCESS_SECRET=$secret
FRONTEND_URL=http://localhost:5173
SEED_ADMIN_EMAIL=admin@helpdesk.local
SEED_ADMIN_PASSWORD=$adminPassword
SEED_AGENT_EMAIL=agent@helpdesk.local
SEED_AGENT_PASSWORD=$agentPassword
"@
[IO.File]::WriteAllText($envPath, $envText, $utf8)
[IO.File]::WriteAllText((Join-Path $localDir 'accounts.txt'), "Admin: admin@helpdesk.local`nPassword: $adminPassword`n`nAgent: agent@helpdesk.local`nPassword: $agentPassword`n", $utf8)
Write-Output 'Yerel ayarlar oluşturuldu. Hesaplar .local/accounts.txt dosyasında.'
