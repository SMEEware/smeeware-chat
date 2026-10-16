# Smeeware launcher for Windows (PowerShell) -- mirrors start.sh.
# Usage: powershell -ExecutionPolicy Bypass -File .\start.ps1 [-build] [-shell] [-ollama [MODEL]]
# Or double-click start.bat.

$ErrorActionPreference = "Stop"

function Show-StartUsage {
  Write-Host @"
Usage: start.ps1 [-dev|-build] [-shell] [-ollama [MODEL]]

  -dev     Backend + "next dev"                    (default)
  -build   Backend + "next build && next start"    (use this on a server)
  -shell   SHELL_ENABLED=true for this run: the model may run shell commands.
  -ollama [MODEL]
           OLLAMA_ENABLED=true for this run. A model name after it also sets
           OLLAMA_MODEL, e.g. .\start.ps1 -build -ollama qwen3:8b
           Without one, OLLAMA_MODEL from backend\.env is used. If that is
           empty too, the start is aborted.

Flags can be combined, e.g. .\start.ps1 -build -shell

Do not use -dev behind a domain: the Next.js dev server only serves its
assets to localhost and answers everything else with 403.

The script finds backend\ and frontend\ next to itself. If you run a copy
from somewhere else, set SMEEWARE_ROOT to the project folder.

Without backend\.env the script starts .\install.ps1 first, which asks for
your keys. Every start then checks the dependencies (Python venv, npm,
whisper model for whisper-local, Ollama model) and installs what is missing.

Environment:
  LLM_STREAM_URL   Default: http://127.0.0.1:8000/api/v1/chat/stream
  SKIP_DEPS=1      Skip the dependency check
  PYTHON_BIN       Python used to create the venv (default: python)
  SMEEWARE_ROOT    Project folder, when the script is not inside it
  BACKEND_DIR      Override the backend folder
  FRONTEND_DIR     Override the frontend folder
"@
}

function Has($cmd) {
  return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Test-ProcessAlive($ProcessId) {
  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

$PROJECT_ROOT = $PSScriptRoot
if ((Test-Path (Join-Path $PROJECT_ROOT "backend")) -and (Test-Path (Join-Path $PROJECT_ROOT "frontend"))) {
  # good
}
elseif ($env:SMEEWARE_ROOT) {
  $PROJECT_ROOT = $env:SMEEWARE_ROOT
}
else {
  Write-Host "ERROR: no backend\ and frontend\ next to this script. Set SMEEWARE_ROOT to the project folder." -ForegroundColor Red
  exit 1
}

$BACKEND_DIR  = if ($env:BACKEND_DIR)  { $env:BACKEND_DIR }  else { Join-Path $PROJECT_ROOT "backend" }
$FRONTEND_DIR = if ($env:FRONTEND_DIR) { $env:FRONTEND_DIR } else { Join-Path $PROJECT_ROOT "frontend" }
$ENV_FILE     = Join-Path $BACKEND_DIR ".env"
$MODE = "dev"

$env:LLM_STREAM_URL = if ($env:LLM_STREAM_URL) { $env:LLM_STREAM_URL } else { "http://127.0.0.1:8000/api/v1/chat/stream" }
$SKIP_DEPS = if ($env:SKIP_DEPS) { $env:SKIP_DEPS } else { "0" }

$SHELL_TOOL = 0
$OLLAMA = 0
$OLLAMA_MODEL_ARG = ""

function Get-EnvValue($key) {
  if (-not (Test-Path $ENV_FILE)) { return "" }
  $m = Select-String -Path $ENV_FILE -Pattern "^$([regex]::Escape($key))=" -CaseSensitive | Select-Object -First 1
  if ($null -eq $m) { return "" }
  $raw = $m.Line.Substring($key.Length + 1)
  $ci = $raw.IndexOf("#")
  if ($ci -ge 0) { $raw = $raw.Substring(0, $ci) }
  $raw = $raw.Trim()
  if ($raw.Length -ge 2 -and $raw[0] -eq '"' -and $raw[$raw.Length - 1] -eq '"') { $raw = $raw.Substring(1, $raw.Length - 2) }
  elseif ($raw.Length -ge 2 -and $raw[0] -eq "'" -and $raw[$raw.Length - 1] -eq "'") { $raw = $raw.Substring(1, $raw.Length - 2) }
  return $raw
}

$i = 0
while ($i -lt $args.Count) {
  $a = $args[$i]
  switch ($a) {
    "-dev"    { $MODE = "dev";   $i++ }
    "--dev"   { $MODE = "dev";   $i++ }
    "-build"  { $MODE = "build"; $i++ }
    "--build" { $MODE = "build"; $i++ }
    "-shell"  { $SHELL_TOOL = 1; $i++ }
    "--shell" { $SHELL_TOOL = 1; $i++ }
    "-ollama" {
      $OLLAMA = 1; $i++
      if ($i -lt $args.Count -and $args[$i] -notlike "-*") { $OLLAMA_MODEL_ARG = $args[$i]; $i++ }
    }
    "--ollama" {
      $OLLAMA = 1; $i++
      if ($i -lt $args.Count -and $args[$i] -notlike "-*") { $OLLAMA_MODEL_ARG = $args[$i]; $i++ }
    }
    "-h"      { Show-StartUsage; exit 0 }
    "--help"  { Show-StartUsage; exit 0 }
    default {
      Write-Host "Unknown option: $a" -ForegroundColor Red
      Show-StartUsage
      exit 1
    }
  }
}

foreach ($dir in @($BACKEND_DIR, $FRONTEND_DIR)) {
  if (-not (Test-Path $dir)) {
    Write-Host "ERROR: $dir does not exist" -ForegroundColor Red
    exit 1
  }
}

$installScript = Join-Path $PROJECT_ROOT "install.ps1"

if (-not (Test-Path $ENV_FILE)) {
  if (-not [Console]::IsInputRedirected) {
    Write-Host ">> First start -- running the setup"
    $env:BACKEND_DIR  = $BACKEND_DIR
    $env:FRONTEND_DIR = $FRONTEND_DIR
    & $installScript
    Remove-Item Env:\BACKEND_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:\FRONTEND_DIR -ErrorAction SilentlyContinue
  }
  else {
    Write-Host "ERROR: $ENV_FILE is missing. Run .\install.ps1 first." -ForegroundColor Red
    exit 1
  }
}
elseif ($SKIP_DEPS -ne "1") {
  $env:BACKEND_DIR  = $BACKEND_DIR
  $env:FRONTEND_DIR = $FRONTEND_DIR
  & $installScript --deps
  Remove-Item Env:\BACKEND_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\FRONTEND_DIR -ErrorAction SilentlyContinue
}

$dk = $env:DEEPSEEK_API_KEY
if (-not $dk) { $dk = Get-EnvValue "DEEPSEEK_API_KEY" }
if (-not $dk) {
  Write-Host "ERROR: DEEPSEEK_API_KEY is empty -- run .\install.ps1 --configure" -ForegroundColor Red
  exit 1
}

if ($MODE -eq "build") {
  $env:ENVIRONMENT = if ($env:ENVIRONMENT) { $env:ENVIRONMENT } else { "production" }
}
else {
  $env:ENVIRONMENT = if ($env:ENVIRONMENT) { $env:ENVIRONMENT } else { "development" }
}

if ($MODE -eq "dev") {
  Write-Host ">> WARNING: dev mode. Only reachable via localhost:3000 --"
  Write-Host ">>          behind a domain the dev server blocks its own assets"
  Write-Host ">>          with 403. On a server use: .\start.ps1 -build"
}

if ($SHELL_TOOL -eq 1) {
  $env:SHELL_ENABLED = "true"
  Write-Host ">> SHELL_ENABLED=true -- run_shell is active (it runs with the"
  Write-Host ">>   backend's permissions; every signed-in user can reach it)"
}

if ($OLLAMA -eq 1) {
  $env:OLLAMA_ENABLED = "true"
  if ($OLLAMA_MODEL_ARG) { $env:OLLAMA_MODEL = $OLLAMA_MODEL_ARG }

  $effective = if ($env:OLLAMA_MODEL) { $env:OLLAMA_MODEL } else { Get-EnvValue "OLLAMA_MODEL" }
  if (-not $effective) {
    Write-Host "ERROR: -ollama without a model." -ForegroundColor Red
    Write-Host "       OLLAMA_ENABLED=true alone shows nothing -- the backend"
    Write-Host "       also needs OLLAMA_MODEL."
    Write-Host "       Either:  .\start.ps1 -ollama qwen3:8b"
    Write-Host "       or set OLLAMA_MODEL in $ENV_FILE."
    if (Has "ollama") {
      Write-Host "       Available locally:"
      & ollama list 2>$null | Select-Object -Skip 1 | ForEach-Object { Write-Host "         $((($_ -split '\s+')[0]))" }
    }
    exit 1
  }

  if (Has "ollama") {
    $listed = @(& ollama list 2>$null | Select-Object -Skip 1 | ForEach-Object { ($_ -split '\s+')[0] })
    if ($listed -notcontains $effective) {
      Write-Host ">> Pulling Ollama model: $effective"
      & ollama pull $effective
      if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: 'ollama pull $effective' failed." -ForegroundColor Red
        exit 1
      }
    }
  }
  else {
    Write-Host "WARNING: 'ollama' command not found -- install it from https://ollama.com" -ForegroundColor Yellow
    Write-Host "         The local model will stay hidden until Ollama is running."
  }

  Write-Host ">> OLLAMA_ENABLED=true, model: $effective"
}

$py = Join-Path $BACKEND_DIR ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
  Write-Host "ERROR: backend\.venv not found -- run .\install.ps1 first." -ForegroundColor Red
  exit 1
}

$venvScripts = Join-Path $BACKEND_DIR ".venv\Scripts"
$env:PATH = "$venvScripts;$env:PATH"

Write-Host ">> Project: $PROJECT_ROOT"
Write-Host ">> Backend: $BACKEND_DIR"

$BACKEND_PID = 0
try {
  $backendProc = Start-Process -FilePath $py -ArgumentList "run.py" -WorkingDirectory $BACKEND_DIR -PassThru -NoNewWindow
  $BACKEND_PID = $backendProc.Id
  Write-Host ">> Backend running (PID $BACKEND_PID)"

  Start-Sleep -Seconds 2
  if (-not (Test-ProcessAlive $BACKEND_PID)) {
    Write-Host "ERROR: the backend crashed on startup" -ForegroundColor Red
    $BACKEND_PID = 0
    exit 1
  }

  Write-Host ">> Frontend: $FRONTEND_DIR (mode: $MODE)"
  Write-Host ">> LLM_STREAM_URL=$env:LLM_STREAM_URL"
  Push-Location $FRONTEND_DIR
  try {
    if ($MODE -eq "build") {
      & npx next build
      if ($LASTEXITCODE -ne 0) { throw "next build failed" }
      & npx next start
    }
    else {
      & npx next dev
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  if ($BACKEND_PID -ne 0) {
    Write-Host ">> Stopping backend (PID $BACKEND_PID)"
    & taskkill.exe /PID $BACKEND_PID /T /F 2>$null | Out-Null
  }
}
