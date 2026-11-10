[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')
$statePath = Join-Path $PSScriptRoot 'logs\dev-session.json'
$mutex = $null
try {
    $mutex = Enter-DevLock $PSScriptRoot
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        Write-Host 'start-dev.ps1로 실행한 서버 기록이 없습니다. 다른 프로세스는 종료하지 않았습니다.'
        return
    }
    $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    Stop-DevSession $state $PSScriptRoot (Join-Path $PSScriptRoot 'start-dev.ps1')
    Remove-Item -LiteralPath $statePath -Force
    Write-Host 'EXCUSE ME! 개발 서버를 종료했습니다. 다른 Node/Python 프로세스는 종료하지 않았습니다.'
} catch {
    Write-Host ('종료 중단: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() }
}
