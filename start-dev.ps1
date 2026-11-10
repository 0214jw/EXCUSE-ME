[CmdletBinding()]
param(
    [ValidateSet('Frontend', 'Backend')][string]$Worker,
    [string]$SessionToken
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\dev-common.ps1')
$root = $PSScriptRoot
$launcher = Join-Path $root 'start-dev.ps1'
$statePath = Join-Path $root 'logs\dev-session.json'
$environmentPath = Join-Path $root 'backend\.env'
$mutex = $null
$startedState = $null

try {
    if ($Worker) {
        if ($SessionToken -notmatch '^[a-f0-9]{32}$') { throw '이 내부 실행 옵션은 start-dev.ps1이 자동으로 지정합니다.' }
        Initialize-DevJobApi
        $script:devJobHandle = [ExcuseMe.DevJob]::Join("Local\ExcuseMeDev-$SessionToken-$Worker")
        $Host.UI.RawUI.WindowTitle = "EXCUSE ME! - $Worker (Ctrl+C: 종료)"
        if ($Worker -eq 'Frontend') {
            # Backend .env is never loaded into this process or the frontend build.
            foreach ($name in @('GEMINI_API_KEY', 'OPENAI_API_KEY')) {
                [Environment]::SetEnvironmentVariable($name, $null, 'Process')
            }
            Set-Location -LiteralPath (Join-Path $root 'frontend')
            & npm.cmd run dev
        } else {
            $settings = Read-DevEnvironment $environmentPath
            foreach ($name in @('GEMINI_API_KEY', 'GEMINI_CURATOR_MODEL', 'GEMINI_CURATOR_TIMEOUT_SECONDS', 'OPENAI_IMAGE_ENABLED')) {
                $value = $null
                if ($settings.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($settings[$name])) { $value = $settings[$name] }
                [Environment]::SetEnvironmentVariable($name, $value, 'Process')
            }
            $settings.Clear()
            Set-Location -LiteralPath (Join-Path $root 'backend')
            & (Join-Path $root 'backend\.venv\Scripts\python.exe') -m uvicorn main:app --host 127.0.0.1 --port 8000
        }
        if ($LASTEXITCODE -ne 0) { throw "$Worker 서버 실행에 실패했습니다. 이 창의 오류 메시지를 확인하세요." }
        exit 0
    }

    $mutex = Enter-DevLock $root
    # Inspect .env without printing it or changing the parent shell's environment.
    $settings = Read-DevEnvironment $environmentPath
    $settings.Clear()

    $listeners = @(Get-DevListeners)
    if ($listeners.Count -gt 0) {
        $ports = ($listeners.LocalPort | Sort-Object -Unique) -join ', '
        throw "이미 사용 중인 포트: $ports. 기존 서버를 종료하지 않았습니다. 기존 서버 창을 확인하고 종료한 뒤 다시 실행하세요."
    }

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    $node = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $npm -or $null -eq $node) { throw 'Node.js를 설치한 후 PowerShell을 다시 여세요. 이 프로젝트는 Node.js 22.12 이상을 사용할 수 있습니다.' }
    $nodeText = & $node.Source --version
    if ($LASTEXITCODE -ne 0) { throw 'Node.js 실행을 확인할 수 없습니다.' }
    $nodeVersion = [version]($nodeText.TrimStart('v'))
    if (-not (($nodeVersion -ge [version]'20.19.0' -and $nodeVersion -lt [version]'21.0.0') -or $nodeVersion -ge [version]'22.12.0')) {
        throw 'Node.js 버전이 맞지 않습니다. Node.js 22.12 이상을 설치하세요.'
    }
    $frontend = Join-Path $root 'frontend'
    if (-not (Test-Path -LiteralPath (Join-Path $frontend 'node_modules\.bin\vite.cmd'))) {
        throw '프론트엔드 패키지가 없습니다. 프로젝트 루트에서 npm.cmd --prefix frontend ci 를 한 번 실행하세요.'
    }
    $dependencyStatus = & {
        $ErrorActionPreference = 'Continue'
        & $npm.Source --prefix $frontend ls --depth=0 --json 2>&1 | Out-Null
        $LASTEXITCODE
    }
    if ($dependencyStatus -ne 0) {
        throw '프론트엔드 패키지가 누락되었거나 버전이 맞지 않습니다. 프로젝트 루트에서 npm.cmd --prefix frontend ci 를 실행하세요.'
    }
    $python = Join-Path $root 'backend\.venv\Scripts\python.exe'
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        throw 'backend/.venv가 없습니다. 프로젝트 루트에서 python -m venv backend/.venv 를 실행한 뒤 백엔드 패키지를 설치하세요.'
    }
    $backendStatus = & {
        $ErrorActionPreference = 'Continue'
        & $python -B -c 'import uvicorn, fastapi, PIL' 2>&1 | Out-Null
        $LASTEXITCODE
    }
    if ($backendStatus -ne 0) {
        throw '백엔드 패키지가 없습니다. .\backend\.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt 를 실행하세요.'
    }

    Initialize-DevJobApi
    if (Test-Path -LiteralPath $statePath) {
        $previous = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        foreach ($entry in @($previous.Workers)) {
            if ($null -ne (Get-DevWorker $entry $previous $root $launcher)) {
                throw '이전에 실행한 개발 서버 창이 남아 있습니다. .\stop-dev.ps1 실행 후 다시 시작하세요.'
            }
        }
    }
    $null = New-Item -ItemType Directory -Path (Join-Path $root 'logs') -Force
    $token = [guid]::NewGuid().ToString('N')
    $startedState = [pscustomobject]@{ Version = 1; Root = $root; Token = $token; Workers = @() }
    Write-DevState $startedState $statePath
    $shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($role in @('Frontend', 'Backend')) {
        # Only paths, role and a random session ID are placed on the command line.
        $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "{0}" -Worker {1} -SessionToken {2}' -f $launcher, $role, $token
        $process = Start-Process -FilePath $shell -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Normal -PassThru
        try {
            $entry = [pscustomobject]@{
                Role = $role; Pid = $process.Id
                # CIM reports microseconds; use the same precision as process checks.
                CreatedUtcStamp = $process.StartTime.ToUniversalTime().ToString('yyyyMMddHHmmss.ffffff')
                Job = "Local\ExcuseMeDev-$token-$role"
            }
            $startedState.Workers += $entry
            Write-DevState $startedState $statePath
        } finally { $process.Dispose() }
    }

    Write-Host '서버가 시작될 때까지 확인 중입니다...'
    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    $ready = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        $listeners = @(Get-DevListeners)
        $ready = $true
        foreach ($entry in $startedState.Workers) {
            if ($null -eq (Get-DevWorker $entry $startedState $root $launcher)) { throw "$($entry.Role) 서버 창이 종료되었습니다. 실행 오류를 확인하세요." }
            $port = if ($entry.Role -eq 'Frontend') { 5173 } else { 8000 }
            $matching = @($listeners | Where-Object { $_.LocalPort -eq $port })
            if ($matching.Count -eq 0) { $ready = $false; continue }
            foreach ($listener in $matching) {
                if (-not [ExcuseMe.DevJob]::Contains($entry.Job, [int]$listener.OwningProcess)) {
                    throw "$port 포트를 다른 프로세스가 사용하기 시작했습니다. 기존 프로세스는 종료하지 않았습니다."
                }
            }
        }
        if ($ready) { break }
        Start-Sleep -Milliseconds 300
    }
    if (-not $ready) { throw '30초 안에 서버 시작을 확인하지 못했습니다. Node/Python 설치 상태와 서버 오류를 확인하세요.' }
    Write-Host ''
    Write-Host 'EXCUSE ME! 개발 서버 실행 완료'
    Write-Host '프론트엔드: http://localhost:5173/'
    Write-Host '백엔드:     http://127.0.0.1:8000/'
    Write-Host '백엔드 연결 확인: http://127.0.0.1:8000/api/health'
    Write-Host '종료: 프로젝트 루트에서 .\stop-dev.ps1 (또는 각 서버 창에서 Ctrl+C)'
} catch {
    $failureMessage = $_.Exception.Message
    if ($null -ne $startedState) {
        try {
            Stop-DevSession $startedState $root $launcher
            Remove-Item -LiteralPath $statePath -Force -ErrorAction SilentlyContinue
        } catch { Write-Host ('자동 정리 안내: ' + $_.Exception.Message) -ForegroundColor Yellow }
    }
    Write-Host ('실행 중단: ' + $failureMessage) -ForegroundColor Red
    if ($Worker) { $null = Read-Host '오류를 확인한 뒤 Enter를 누르면 이 창을 닫습니다' }
    exit 1
} finally {
    if ($null -ne $mutex) { $mutex.ReleaseMutex(); $mutex.Dispose() }
}
