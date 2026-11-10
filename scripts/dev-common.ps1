# Shared helpers for start-dev.ps1 and stop-dev.ps1 (Windows PowerShell 5.1).
Set-StrictMode -Version Latest

function Read-DevEnvironment {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'backend/.env 파일이 없습니다. backend/.env.example을 backend/.env로 복사하고 GEMINI_API_KEY를 입력하세요.'
    }
    $allowed = @('GEMINI_API_KEY', 'GEMINI_CURATOR_MODEL', 'GEMINI_CURATOR_TIMEOUT_SECONDS', 'OPENAI_IMAGE_ENABLED')
    $values = @{}
    $lineNumber = 0
    foreach ($line in [IO.File]::ReadAllLines($Path, [Text.Encoding]::UTF8)) {
        $lineNumber++
        if ($line -match '^\s*(#.*)?$') { continue }
        if ($line -notmatch '^\s*(?:export\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?<value>.*)$') {
            throw "backend/.env의 ${lineNumber}번째 줄을 확인하세요. 이름=값 형식으로 작성하세요."
        }
        $name = $Matches.name
        $value = $Matches.value.Trim()
        if ($allowed -cnotcontains $name) { continue }
        if ($values.ContainsKey($name)) { throw "backend/.env에 $name 항목이 중복되어 있습니다." }
        if ($value.StartsWith('"') -or $value.StartsWith("'")) {
            if ($value -notmatch '^(?<quote>[''"])(?<text>.*?)\k<quote>\s*(?:#.*)?$') {
                throw "backend/.env의 ${lineNumber}번째 줄에서 따옴표를 확인하세요."
            }
            $value = $Matches.text
        } else {
            $value = ($value -replace '\s+#.*$', '').Trim()
        }
        # Parse text only: never evaluate .env as PowerShell or expand $variables.
        $values[$name] = $value
    }
    if (-not $values.ContainsKey('GEMINI_API_KEY') -or [string]::IsNullOrWhiteSpace($values.GEMINI_API_KEY)) {
        throw 'backend/.env의 GEMINI_API_KEY가 비어 있습니다. 발급받은 키를 입력하고 저장하세요. 키는 화면에 출력하지 않습니다.'
    }
    if (-not $values.ContainsKey('OPENAI_IMAGE_ENABLED') -or [string]::IsNullOrWhiteSpace($values.OPENAI_IMAGE_ENABLED)) {
        $values.OPENAI_IMAGE_ENABLED = '0'
    }
    if ($values.OPENAI_IMAGE_ENABLED -notin @('0', '1')) {
        throw 'backend/.env의 OPENAI_IMAGE_ENABLED는 0(이미지 생성 OFF) 또는 1이어야 합니다. 기본값은 0입니다.'
    }
    if ($values.ContainsKey('GEMINI_CURATOR_TIMEOUT_SECONDS') -and $values.GEMINI_CURATOR_TIMEOUT_SECONDS) {
        $timeoutValue = 0.0
        if (-not [double]::TryParse($values.GEMINI_CURATOR_TIMEOUT_SECONDS, [Globalization.NumberStyles]::Float,
                [Globalization.CultureInfo]::InvariantCulture, [ref]$timeoutValue) -or
                [double]::IsNaN($timeoutValue) -or [double]::IsInfinity($timeoutValue) -or $timeoutValue -le 0) {
            throw 'GEMINI_CURATOR_TIMEOUT_SECONDS에는 0보다 큰 초 단위 숫자를 입력하세요.'
        }
    }
    return $values
}

function Initialize-DevJobApi {
    if ('ExcuseMe.DevJob' -as [type]) { return }
    # Windows jobs keep each server and all descendants in one process group.
    # Closing its PowerShell window or stopping its job cannot kill unrelated apps.
    Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
namespace ExcuseMe {
    public static class DevJob {
        [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
            public long ProcessTime, JobTime;
            public uint Flags;
            public UIntPtr MinWorkingSet, MaxWorkingSet;
            public uint ActiveProcesses;
            public UIntPtr Affinity;
            public uint Priority, Scheduling;
        }
        [StructLayout(LayoutKind.Sequential)] struct IoCounters {
            public ulong ReadOperations, WriteOperations, OtherOperations;
            public ulong ReadBytes, WriteBytes, OtherBytes;
        }
        [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
            public BasicLimits Basic;
            public IoCounters Io;
            public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
        }
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern IntPtr CreateJobObject(IntPtr security, string name);
        [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
        static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
        [DllImport("kernel32.dll", SetLastError=true)]
        static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint size);
        [DllImport("kernel32.dll", SetLastError=true)]
        static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
        [DllImport("kernel32.dll", SetLastError=true)]
        static extern bool TerminateJobObject(IntPtr job, uint code);
        [DllImport("kernel32.dll", SetLastError=true)]
        static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool inside);
        [DllImport("kernel32.dll", SetLastError=true)]
        static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
        public static IntPtr Join(string name) {
            IntPtr job = CreateJobObject(IntPtr.Zero, name);
            if (job == IntPtr.Zero) throw new Win32Exception();
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)) ||
                !AssignProcessToJobObject(job, GetCurrentProcess())) {
                int error = Marshal.GetLastWin32Error();
                CloseHandle(job);
                throw new Win32Exception(error);
            }
            return job; // Keep open for the lifetime of the worker PowerShell.
        }
        public static bool Contains(string name, int pid) {
            IntPtr job = OpenJobObject(4, false, name);
            if (job == IntPtr.Zero) return false;
            IntPtr process = OpenProcess(0x1000, false, pid);
            try {
                bool inside;
                return process != IntPtr.Zero && IsProcessInJob(process, job, out inside) && inside;
            } finally {
                if (process != IntPtr.Zero) CloseHandle(process);
                CloseHandle(job);
            }
        }
        public static bool Stop(string name) {
            IntPtr job = OpenJobObject(8, false, name);
            if (job == IntPtr.Zero) {
                int error = Marshal.GetLastWin32Error();
                if (error == 2) return false;
                throw new Win32Exception(error);
            }
            try {
                if (!TerminateJobObject(job, 0)) throw new Win32Exception();
                return true;
            } finally { CloseHandle(job); }
        }
    }
}
'@
}

function Get-DevListeners {
    @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in @(5173, 8000) })
}

function Enter-DevLock {
    param([string]$Root)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant()))).Replace('-', '') }
    finally { $sha.Dispose() }
    $mutex = New-Object Threading.Mutex($false, "Local\ExcuseMeDevControl-$hash")
    try { $acquired = $mutex.WaitOne(0) }
    catch [Threading.AbandonedMutexException] { $acquired = $true }
    if (-not $acquired) {
        $mutex.Dispose()
        throw '다른 start-dev.ps1 또는 stop-dev.ps1이 실행 중입니다. 잠시 후 다시 실행하세요.'
    }
    return $mutex
}

function Write-DevState {
    param([object]$State, [string]$Path)
    $temporaryPath = "$Path.tmp"
    $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

function Get-DevWorker {
    param([object]$Entry, [object]$State, [string]$Root, [string]$Launcher)
    if ($State.Root -ne $Root -or $State.Token -notmatch '^[a-f0-9]{32}$' -or
            $Entry.Role -notin @('Frontend', 'Backend') -or
            $Entry.Job -cne "Local\ExcuseMeDev-$($State.Token)-$($Entry.Role)") {
        throw '개발 서버 기록을 확인할 수 없어 종료하지 않았습니다. 각 서버 창에서 Ctrl+C로 종료하세요.'
    }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$Entry.Pid)" -ErrorAction Stop
    if ($null -eq $processInfo) { return $null }
    $expectedShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $tokenArgument = '(?i)(?:^|\s)-SessionToken\s+"?' + [regex]::Escape($State.Token) + '"?(?:\s|$)'
    $roleArgument = '(?i)(?:^|\s)-Worker\s+"?' + $Entry.Role + '"?(?:\s|$)'
    if ($processInfo.ExecutablePath -ne $expectedShell -or
            $processInfo.CreationDate.ToUniversalTime().ToString('yyyyMMddHHmmss.ffffff') -ne $Entry.CreatedUtcStamp -or
            -not $processInfo.CommandLine.Contains('"' + $Launcher + '"') -or
            $processInfo.CommandLine -notmatch $tokenArgument -or $processInfo.CommandLine -notmatch $roleArgument) {
        throw '기록된 PID가 현재 다른 프로세스이거나 확인할 수 없습니다. 안전을 위해 종료하지 않았습니다.'
    }
    return $processInfo
}

function Stop-DevSession {
    param([object]$State, [string]$Root, [string]$Launcher)
    Initialize-DevJobApi
    if ($State.Version -ne 1 -or $State.Root -ne $Root -or $State.Token -notmatch '^[a-f0-9]{32}$') {
        throw '개발 서버 기록 형식이 올바르지 않아 종료하지 않았습니다.'
    }
    # Validate every identity before terminating any process. PID alone is insufficient.
    $workers = @($State.Workers)
    foreach ($entry in $workers) { $null = Get-DevWorker $entry $State $Root $Launcher }
    foreach ($entry in $workers) {
        $processInfo = Get-DevWorker $entry $State $Root $Launcher
        if ($null -eq $processInfo) { continue }
        if (-not [ExcuseMe.DevJob]::Stop($entry.Job)) {
            # The worker may still be compiling the job helper before joining it.
            # Get a process handle and compare its creation time before killing it.
            $workerProcess = Get-Process -Id ([int]$entry.Pid) -ErrorAction SilentlyContinue
            if ($null -ne $workerProcess) {
                try {
                    $null = $workerProcess.Handle
                    if ($workerProcess.StartTime.ToUniversalTime().ToString('yyyyMMddHHmmss.ffffff') -ne $entry.CreatedUtcStamp) {
                        throw '프로세스가 변경되어 종료하지 않았습니다.'
                    }
                    $workerProcess.Kill()
                    $null = $workerProcess.WaitForExit(5000)
                } finally { $workerProcess.Dispose() }
            }
        }
    }
}
