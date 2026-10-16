# Smeeware setup for Windows (PowerShell) -- mirrors install.sh.
# Usage: powershell -ExecutionPolicy Bypass -File .\install.ps1 [--configure | --deps]
# Or double-click install.bat.

$ErrorActionPreference = "Stop"

$PROJECT_ROOT = $PSScriptRoot
$BACKEND_DIR  = if ($env:BACKEND_DIR)  { $env:BACKEND_DIR }  else { Join-Path $PROJECT_ROOT "backend" }
$FRONTEND_DIR = if ($env:FRONTEND_DIR) { $env:FRONTEND_DIR } else { Join-Path $PROJECT_ROOT "frontend" }
$ENV_FILE     = Join-Path $BACKEND_DIR ".env"
$ENV_EXAMPLE  = Join-Path $BACKEND_DIR ".env.example"
$PYTHON_BIN   = if ($env:PYTHON_BIN) { $env:PYTHON_BIN } else { "python" }
$WHISPER_URL  = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"

$script:SET = @{}

function Show-InstallUsage {
  Write-Host @"
Usage: install.ps1 [--configure | --deps]

  (none)        Set up backend\.env interactively, then install everything
  --configure   Only walk through the keys and switches in backend\.env
  --deps        Only install or update dependencies (start.ps1 runs this)

Only the DeepSeek API key is required. Every other key is optional; the
features behind a missing key stay switched off and out of the UI.

Environment:
  PYTHON_BIN    Python used to create the venv (default: python)
"@
}

function Say($msg)   { Write-Host $msg }
function Ok($msg)    { Write-Host "  " -NoNewline; Write-Host "[OK] " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Warn($msg)  { Write-Host "  " -NoNewline; Write-Host "[!]  " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Fail($msg)  { Write-Host "Error: $msg" -ForegroundColor Red; exit 1 }

function Has($cmd) {
  return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

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

function Read-Hidden($prompt) {
  Write-Host -NoNewline $prompt
  $secure = Read-Host -AsSecureString
  if ($null -eq $secure) { return "" }
  $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Ask-Yes($prompt, $default) {
  $hint = "[y/N]"; if ($default -eq "y") { $hint = "[Y/n]" }
  $answer = Read-Host "  $prompt $hint"
  if ([string]::IsNullOrWhiteSpace($answer)) { $answer = $default }
  return $answer.ToLower().StartsWith("y")
}

function Ask-Text($prompt, $default) {
  $hint = ""; if ($default) { $hint = "[$default] " }
  $answer = Read-Host "  $prompt $hint"
  if ([string]::IsNullOrEmpty($answer)) { return $default }
  return $answer
}

function Ask-Key($Var, $Label, $Purpose) {
  $current = Get-EnvValue $Var
  $state = "empty"; if ($current) { $state = "set" }
  Write-Host "  $Label - $Purpose"
  $answer = Read-Hidden "    $Var ($state, Enter keeps it): "
  if ($answer) { Set-ConfigValue $Var $answer }
}

function Set-ConfigValue($Var, $Value) { $script:SET[$Var] = [string]$Value }

function Get-PendingValue($Var) {
  if ($script:SET.ContainsKey($Var)) { return $script:SET[$Var] }
  return Get-EnvValue $Var
}

function Invoke-WriteEnv {
  foreach ($k in $script:SET.Keys) {
    Set-Item -Path "Env:SET_$k" -Value ([string]$script:SET[$k])
  }
  $pyScript = @'
import os
import re
import sys
from pathlib import Path

target, template = Path(sys.argv[1]), Path(sys.argv[2])
LINE = re.compile(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$")


def unquote(raw):
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] in "\"'" and raw[-1] == raw[0]:
        return raw[1:-1]
    return re.split(r"\s+#", raw, maxsplit=1)[0].strip()


def quote(value):
    if value == "" or re.fullmatch(r"[A-Za-z0-9_./:@,+=\-*]+", value):
        return value
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


values = {}
if target.exists():
    for line in target.read_text(encoding="utf-8").splitlines():
        m = LINE.match(line)
        if m:
            values[m.group(1)] = unquote(m.group(2))
for key, value in os.environ.items():
    if key.startswith("SET_"):
        values[key[4:]] = value

out, seen = [], set()
for line in template.read_text(encoding="utf-8").splitlines():
    m = LINE.match(line)
    if m and not line.startswith("#"):
        key = m.group(1)
        seen.add(key)
        out.append(f"{key}={quote(values.get(key, unquote(m.group(2))))}")
    else:
        out.append(line)

extra = [key for key in values if key not in seen]
if extra:
    out += ["", "# --- Advanced (see backend/README.md) ---"]
    out += [f"{key}={quote(values[key])}" for key in extra]

target.write_text("\n".join(out) + "\n", encoding="utf-8")
if os.name != "nt":
    target.chmod(0o600)
'@
  $pyScript | & $PYTHON_BIN - $ENV_FILE $ENV_EXAMPLE
  if ($LASTEXITCODE -ne 0) { Fail "Failed to write backend\.env." }
}

function Check-Prerequisites {
  if (-not (Has $PYTHON_BIN)) {
    Fail "Python 3.10+ is required ($PYTHON_BIN not found). Install it or set PYTHON_BIN."
  }
  if ($script:STEP_DEPS -ne 1) { return }
  if (-not (Has "node")) { Fail "Node.js 20+ is required (https://nodejs.org)." }
  if (-not (Has "npm"))  { Fail "npm is required (it ships with Node.js)." }
  $major = & node -p 'process.versions.node.split(".")[0]'
  if ([int]$major -lt 20) { Fail "Node.js 20+ is required, found $(node -v)." }
}

function Get-VenvPython {
  return Join-Path $BACKEND_DIR ".venv\Scripts\python.exe"
}

function Create-Venv {
  & $PYTHON_BIN -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"
  if ($LASTEXITCODE -eq 0) {
    & $PYTHON_BIN -m venv "$BACKEND_DIR\.venv"
    if ($LASTEXITCODE -ne 0) { Fail "Could not create a venv with $PYTHON_BIN." }
  }
  elseif (Has "uv") {
    & uv venv --quiet --python 3.12 "$BACKEND_DIR\.venv"
    if ($LASTEXITCODE -ne 0) { Fail "uv could not create a Python 3.12 venv." }
  }
  else {
    $v = & $PYTHON_BIN -V 2>&1
    Fail "Python 3.10+ is required, found $v. Install a newer Python or set PYTHON_BIN."
  }
}

function Pip-Install([string[]]$PipArgs) {
  $py = Get-VenvPython
  if (Has "uv") {
    & uv pip install --quiet --python $py @PipArgs
    if ($LASTEXITCODE -ne 0) { Fail "pip install failed (uv)." }
    return
  }
  & $py -m pip --version *> $null
  if ($LASTEXITCODE -ne 0) {
    & $py -m ensurepip --upgrade *> $null
  }
  & $py -m pip install --quiet --disable-pip-version-check @PipArgs
  if ($LASTEXITCODE -ne 0) {
    Fail "backend\.venv has no pip. Install uv (https://docs.astral.sh/uv/) or delete backend\.venv and run again."
  }
}

function Test-BackendImports($py) {
  & $py -c "import fastapi, uvicorn, edge_tts, yaml, python_multipart" *> $null
  return ($LASTEXITCODE -eq 0)
}

function Ensure-Backend {
  $py = Get-VenvPython
  if (-not (Test-Path $py)) {
    Say ">> Creating the Python environment (backend\.venv)"
    Remove-Item -Recurse -Force "$BACKEND_DIR\.venv" -ErrorAction SilentlyContinue
    Create-Venv
    Say ">> Installing backend dependencies"
    Pip-Install @("-r", "$BACKEND_DIR\requirements.txt")
  }
  else {
    $installed = Join-Path $BACKEND_DIR ".venv\.installed"
    $req = Join-Path $BACKEND_DIR "requirements.txt"
    $needs = $false
    if (-not (Test-Path $installed)) { $needs = $true }
    elseif ((Get-Item $req).LastWriteTime -gt (Get-Item $installed).LastWriteTime) { $needs = $true }
    elseif (-not (Test-BackendImports $py)) { $needs = $true }
    if ($needs) {
      Say ">> Updating backend dependencies"
      Pip-Install @("-r", $req)
    }
  }
  New-Item -ItemType File -Path "$BACKEND_DIR\.venv\.installed" -Force | Out-Null
}

function Test-ForeignBinaries {
  $nm = Join-Path $FRONTEND_DIR "node_modules"
  if (-not (Test-Path $nm)) { return $false }
  if (Get-ChildItem -Path $nm -Filter "*darwin*" -ErrorAction SilentlyContinue | Select-Object -First 1) { return $true }
  if (Get-ChildItem -Path $nm -Filter "*linux*"  -ErrorAction SilentlyContinue | Select-Object -First 1) { return $true }
  $scoped = Get-ChildItem -Path $nm -Directory -Filter "@*" -ErrorAction SilentlyContinue
  foreach ($s in $scoped) {
    if (Get-ChildItem -Path $s.FullName -Filter "*darwin*" -ErrorAction SilentlyContinue | Select-Object -First 1) { return $true }
    if (Get-ChildItem -Path $s.FullName -Filter "*linux*"  -ErrorAction SilentlyContinue | Select-Object -First 1) { return $true }
  }
  return $false
}

function Ensure-Frontend {
  $lock = Join-Path $FRONTEND_DIR "package-lock.json"
  if (-not (Test-Path $lock)) { Fail "frontend\package-lock.json is missing." }
  $nm = Join-Path $FRONTEND_DIR "node_modules"
  $reason = ""
  if (-not (Test-Path $nm)) {
    $reason = "Installing frontend dependencies"
  }
  elseif (Test-ForeignBinaries) {
    $reason = "node_modules came from another OS -- reinstalling"
  }
  else {
    $marker = Join-Path $nm ".package-lock.json"
    if (-not (Test-Path $marker)) { $reason = "Updating frontend dependencies" }
    elseif ((Get-Item $lock).LastWriteTime -gt (Get-Item $marker).LastWriteTime) { $reason = "Updating frontend dependencies" }
  }
  if ($reason) {
    Say ">> $reason (npm ci)"
    Remove-Item -Recurse -Force $nm -ErrorAction SilentlyContinue
    Push-Location $FRONTEND_DIR
    try {
      & npm ci --no-audit --no-fund --loglevel=error
    }
    finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Fail "npm ci failed." }
  }
}

function Ensure-WhisperModel {
  $tm = $env:TRANSCRIBE_MODEL
  if (-not $tm) { $tm = Get-EnvValue "TRANSCRIBE_MODEL" }
  if ($tm -ne "whisper-local") { return }
  $path = $env:WHISPER_MODEL
  if (-not $path) { $path = Get-EnvValue "WHISPER_MODEL" }
  if (-not $path) { $path = "data\models\ggml-large-v3-turbo.bin" }
  if (-not [System.IO.Path]::IsPathRooted($path)) { $path = Join-Path $BACKEND_DIR $path }
  if (-not (Test-Path $path)) {
    Say ">> Downloading the whisper model (~1.6 GB, one time)"
    New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
    & curl.exe -L --fail --progress-bar -o "$path.part" $WHISPER_URL
    if ($LASTEXITCODE -ne 0) {
      Remove-Item -Force "$path.part" -ErrorAction SilentlyContinue
      Fail "Download failed. Fetch $WHISPER_URL into $path."
    }
    Move-Item -Force "$path.part" $path
  }
  $wb = $env:WHISPER_BINARY; if (-not $wb) { $wb = "whisper-cli" }
  if (-not (Has $wb)) { Warn "whisper-cli not found -- install whisper.cpp for local voice input." }
  $fb = $env:FFMPEG_BINARY; if (-not $fb) { $fb = "ffmpeg" }
  if (-not (Has $fb)) { Warn "ffmpeg not found -- local voice input needs it." }
}

function Ensure-OllamaModel {
  $oe = $env:OLLAMA_ENABLED
  if (-not $oe) { $oe = Get-EnvValue "OLLAMA_ENABLED" }
  if ($oe -ne "true") { return }
  $model = $env:OLLAMA_MODEL
  if (-not $model) { $model = Get-EnvValue "OLLAMA_MODEL" }
  if (-not $model) { return }
  if (-not (Has "ollama")) {
    Warn "Ollama is not installed (https://ollama.com) -- the local model stays hidden."
    return
  }
  $listed = @(& ollama list 2>$null | Select-Object -Skip 1 | ForEach-Object { ($_ -split '\s+')[0] })
  if ($listed -notcontains $model) {
    Say ">> Pulling Ollama model $model"
    & ollama pull $model
    if ($LASTEXITCODE -ne 0) { Warn "ollama pull $model failed -- the local model stays hidden." }
  }
}

function Write-SummaryLine($name, $on) {
  if ($on) { Ok $name } else { Write-Host "  -  $name" -ForegroundColor DarkGray }
}

function Invoke-Summary {
  Write-Host ""
  Write-Host "What is switched on"
  $openai = Get-EnvValue "OPENAI_API_KEY"
  $eleven = Get-EnvValue "ELEVENLABS_API_KEY"
  Write-SummaryLine "Chat with DeepSeek" (Get-EnvValue "DEEPSEEK_API_KEY")
  Write-SummaryLine "GPT models and image generation" $openai
  if ((Get-EnvValue "TRANSCRIBE_MODEL") -eq "whisper-local") {
    Write-SummaryLine "Voice input (on this machine)" "yes"
  }
  else {
    Write-SummaryLine "Voice input" $openai
  }
  if ($eleven) { Write-SummaryLine "Read aloud with ElevenLabs" "yes" }
  else { Write-SummaryLine "Read aloud (free, English-only voice)" "yes" }
  Write-SummaryLine "Web search" (Get-EnvValue "BRAVE_API_KEY")
  Write-SummaryLine "Brave Answers" (Get-EnvValue "BRAVE_ANSWERS_API_KEY")
  Write-SummaryLine "Google Maps & YouTube" (Get-EnvValue "SERPAPI_API_KEY")
  if ((Get-EnvValue "HACKERONE_API_USERNAME") -and (Get-EnvValue "HACKERONE_API_TOKEN")) { Write-SummaryLine "HackerOne" "yes" }
  else { Write-SummaryLine "HackerOne" "" }
  if ((Get-EnvValue "SHELL_ENABLED") -eq "true") { Write-SummaryLine "Shell commands" "yes" }
  else { Write-SummaryLine "Shell commands" "" }
  if ((Get-EnvValue "OLLAMA_ENABLED") -eq "true") { Write-SummaryLine "Local model: $(Get-EnvValue 'OLLAMA_MODEL')" "yes" }
  else { Write-SummaryLine "Local model (Ollama)" "" }
  if ((Get-EnvValue "STORAGE_ENABLED") -eq "true") { Write-SummaryLine "S3 bucket: $(Get-EnvValue 'STORAGE_ALIAS')/$(Get-EnvValue 'STORAGE_BUCKET')" "yes" }
  else { Write-SummaryLine "S3 bucket" "" }
  Write-Host ""
  Write-Host "  Change anything later with .\install.ps1 --configure" -ForegroundColor DarkGray
}

function Invoke-Configure {
  if (-not (Test-Path $ENV_EXAMPLE)) { Fail "$ENV_EXAMPLE is missing." }
  if ([Console]::IsInputRedirected) { Fail "The setup asks questions; run .\install.ps1 in a terminal." }

  Say ""
  Say "Smeeware setup"
  Say "Only the DeepSeek key is required. Press Enter to skip anything optional --"
  Say "skipped features simply stay off. Keys are typed hidden and stay in backend\.env."
  Say ""

  Say "Required"
  while ($true) {
    Ask-Key "DEEPSEEK_API_KEY" "DeepSeek" "the chat model (platform.deepseek.com)"
    if ((Get-PendingValue "DEEPSEEK_API_KEY")) { break }
    Warn "The DeepSeek key is required -- nothing answers without it."
  }
  Say ""

  Say "Optional keys"
  Ask-Key "OPENAI_API_KEY" "OpenAI" "GPT models, image generation, voice input"
  Ask-Key "ELEVENLABS_API_KEY" "ElevenLabs" "natural read-aloud voices (otherwise a free, English-only voice)"
  Ask-Key "BRAVE_API_KEY" "Brave Search" "web and image search"
  Ask-Key "BRAVE_ANSWERS_API_KEY" "Brave Answers" "short sourced answers (separate plan)"
  Ask-Key "SERPAPI_API_KEY" "SerpApi" "Google Maps, YouTube search and transcripts"
  if (Ask-Yes "Set up HackerOne (bug bounty programs)?" "n") {
    $h1_user = Ask-Text "HackerOne username:" (Get-EnvValue "HACKERONE_API_USERNAME")
    Set-ConfigValue "HACKERONE_API_USERNAME" $h1_user
    Ask-Key "HACKERONE_API_TOKEN" "HackerOne" "API token"
  }
  Say ""

  Say "Features"
  if (-not (Get-PendingValue "OPENAI_API_KEY")) {
    Say "  Voice input needs OpenAI -- or whisper.cpp running on this machine."
    if (Ask-Yes "Transcribe locally with whisper.cpp? (downloads a 1.6 GB model)" "n") {
      Set-ConfigValue "TRANSCRIBE_MODEL" "whisper-local"
      if (-not (Has "whisper-cli")) { Warn "Install whisper.cpp first (e.g. 'winget install whisper' or build from source)." }
      if (-not (Has "ffmpeg")) { Warn "Install ffmpeg first (e.g. 'winget install ffmpeg')." }
    }
    else {
      Set-ConfigValue "TRANSCRIBE_MODEL" "gpt-transcribe"
    }
  }

  Say "  The shell tool runs whatever the model writes, with your permissions."
  if (Ask-Yes "Allow shell commands? (only for a local, single-user setup)" "n") {
    Set-ConfigValue "SHELL_ENABLED" "true"
  }
  else {
    Set-ConfigValue "SHELL_ENABLED" "false"
  }

  if (Has "ollama") {
    if (Ask-Yes "Offer a local model through Ollama?" "n") {
      $current_model = Get-EnvValue "OLLAMA_MODEL"
      $default_model = if ($current_model) { $current_model } else { "qwen3:8b" }
      $model = Ask-Text "Ollama model (must handle tools):" $default_model
      Set-ConfigValue "OLLAMA_ENABLED" "true"
      Set-ConfigValue "OLLAMA_MODEL" $model
    }
    else {
      Set-ConfigValue "OLLAMA_ENABLED" "false"
    }
  }

  if (Has "mc") {
    if (Ask-Yes "Connect an S3 bucket through mc?" "n") {
      $aliases = (& mc alias list --json 2>$null | ForEach-Object { try { ($_ | ConvertFrom-Json).alias } catch { $null } } | Where-Object { $_ }) -join ", "
      if (-not $aliases) { $aliases = "?" }
      Say "  Configured aliases: $aliases"
      $alias = Ask-Text "mc alias:" (Get-EnvValue "STORAGE_ALIAS")
      $current_bucket = Get-EnvValue "STORAGE_BUCKET"
      $bucket = Ask-Text "Bucket:" ($(if ($current_bucket) { $current_bucket } else { "llm" }))
      $base = Ask-Text "Public base URL (e.g. https://storage.example.com):" (Get-EnvValue "STORAGE_PUBLIC_BASE")
      if ($alias -and $base) {
        Set-ConfigValue "STORAGE_ENABLED" "true"
        Set-ConfigValue "STORAGE_ALIAS" $alias
        Set-ConfigValue "STORAGE_BUCKET" $bucket
        Set-ConfigValue "STORAGE_PUBLIC_BASE" $base
      }
      else {
        Warn "Alias and public URL are both needed -- storage stays off."
        Set-ConfigValue "STORAGE_ENABLED" "false"
      }
    }
    else {
      Set-ConfigValue "STORAGE_ENABLED" "false"
    }
  }

  $secret = Get-EnvValue "SECRET"
  if (-not $secret -or $secret -eq "0815") {
    $newsecret = (& $PYTHON_BIN -c "import secrets; print(secrets.token_urlsafe(32))").Trim()
    Set-ConfigValue "SECRET" $newsecret
  }

  Invoke-WriteEnv
  Say ""
  Ok "Saved backend\.env"
  Invoke-Summary
}

$script:STEP_CONFIGURE = 1
$script:STEP_DEPS = 1

$first = $args[0]
if ($first -eq "--configure") {
  $script:STEP_DEPS = 0
}
elseif ($first -eq "--deps") {
  $script:STEP_CONFIGURE = 0
}
elseif ($first -eq "-h" -or $first -eq "--help") {
  Show-InstallUsage
  exit 0
}
elseif ($first) {
  Write-Host "Unknown option: $first" -ForegroundColor Red
  Show-InstallUsage
  exit 1
}

Check-Prerequisites

if ($script:STEP_CONFIGURE -eq 1) {
  if ($first -eq "--configure" -or -not (Test-Path $ENV_FILE)) {
    Invoke-Configure
  }
  elseif (-not [Console]::IsInputRedirected) {
    if (Ask-Yes "backend\.env exists. Walk through the keys again?" "n") { Invoke-Configure }
  }
}

if ($script:STEP_DEPS -eq 1) {
  if (-not (Test-Path $ENV_FILE)) { Fail "backend\.env is missing -- run .\install.ps1 first." }
  Ensure-Backend
  Ensure-Frontend
  Ensure-WhisperModel
  Ensure-OllamaModel
  if ($first -ne "--deps") {
    Write-Host ""
    Ok "Ready. Start with .\start.ps1 and open http://localhost:3000"
  }
}
