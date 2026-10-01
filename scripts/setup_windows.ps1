<#
.SYNOPSIS
  One-time setup of IROC DataHub on a Windows PC: clone, isolated venv, pinned deps,
  frontend build, workspace registration, optional desktop shortcut.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1 -RepoDir E:\IROC_DataHub -DataRoot E:\iroc_data
#>
param(
  [string]$RepoDir  = "E:\IROC_DataHub",
  [string]$DataRoot = "E:\iroc_data",
  [string]$Branch   = "main",
  [string]$RepoUrl  = "https://github.com/duwang2015/IROC_DataHub.git",
  [string]$Python   = "python",
  [switch]$Shortcut
)
$ErrorActionPreference = "Stop"

Write-Host "== repository: $RepoDir ($Branch)"
if (Test-Path (Join-Path $RepoDir ".git")) {
  git -C $RepoDir fetch origin $Branch; git -C $RepoDir checkout $Branch
  git -C $RepoDir pull --ff-only origin $Branch
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path $RepoDir) | Out-Null
  git clone --branch $Branch $RepoUrl $RepoDir
}

$venv = Join-Path $RepoDir ".venv"
$py   = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $py)) { Write-Host "== creating $venv"; & $Python -m venv $venv }
Write-Host "== installing pinned Python dependencies"
& $py -m pip install --upgrade pip --quiet
& $py -m pip install -r (Join-Path $RepoDir "requirements.lock") --quiet
& $py -m pip install -e $RepoDir --no-deps --quiet

Write-Host "== building the frontend (needs Node from .nvmrc)"
Push-Location (Join-Path $RepoDir "frontend")
npm ci --no-audit --no-fund
npm run build
Pop-Location

$hub = Join-Path $venv "Scripts\iroc-datahub.exe"
if (-not (Test-Path (Join-Path $DataRoot "iroc_store.yaml"))) {
  Write-Host "== $DataRoot is not a store root yet; creating one (edit iroc_store.yaml afterwards)"
  & $hub add-root $DataRoot --create --label (Split-Path $DataRoot -Leaf)
} else {
  & $hub add-root $DataRoot --label (Split-Path $DataRoot -Leaf)
}

if ($Shortcut) {
  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut([IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), "IROC DataHub.lnk"))
  $lnk.TargetPath = $hub; $lnk.Arguments = "serve"; $lnk.WorkingDirectory = $RepoDir; $lnk.Save()
  Write-Host "== desktop shortcut created"
}
Write-Host ""
Write-Host "done. start with:  $hub serve"
