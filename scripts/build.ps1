# FILE: scripts/build.ps1
# VERSION: 1.0.0
# START_MODULE_CONTRACT
#   PURPOSE: Build Windows GPU packaging assets: a CUDA-capable Python venv and the Electron installer sidecar inputs.
#   SCOPE: build_venv, package, dependency wheel ordering, packaging preflight validation.
#   DEPENDS: M-MAIN, M-SERVER, backend/requirements.txt, pyproject.toml
#   LINKS: M-PACKAGING, V-M-PACKAGING
#   ROLE: SCRIPT
#   MAP_MODE: LOCALS
# END_MODULE_CONTRACT
#
# START_MODULE_MAP
#   build_venv - creates .venv with torch cu124 installed before pyannote and validates GPU imports.
#   package - stages backend and .venv sidecar then invokes npm package flow.
#   Invoke-Checked - runs native commands with stable packaging failure codes.
#   Write-PackagingLog - emits grep-stable GRACE verification markers.
# END_MODULE_MAP
#
# START_CHANGE_SUMMARY
#   LAST_CHANGE: v1.0.0 - Added Phase 8 GPU venv build script with explicit CUDA wheel ordering and validation markers.
# END_CHANGE_SUMMARY

[CmdletBinding()]
param(
  [ValidateSet('build_venv', 'package', 'all')]
  [string]$Step = 'all',

  [string]$PythonVersion = '3.11',
  [string]$TorchVersion = '2.6.0',
  [string]$TorchaudioVersion = '2.6.0',
  [string]$VenvPath = '',
  [string]$StagePath = '',
  [switch]$SkipGpuAssert
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
if (-not $VenvPath) {
  $VenvPath = Join-Path $ProjectRoot '.venv'
}
if (-not $StagePath) {
  $StagePath = Join-Path $ProjectRoot 'dist-packaging'
}
$BackendRequirements = Join-Path $ProjectRoot 'backend\requirements.txt'
$PythonExe = Join-Path $VenvPath 'Scripts\python.exe'
$TorchIndex = 'https://download.pytorch.org/whl/cu124'

function Write-PackagingLog {
  param(
    [Parameter(Mandatory = $true)][string]$FunctionName,
    [Parameter(Mandatory = $true)][string]$BlockName,
    [Parameter(Mandatory = $true)][string]$Message
  )
  "[Packaging][$FunctionName][$BlockName] $Message"
}

# START_CONTRACT: Invoke-Checked
#   PURPOSE: Execute a native command and convert non-zero exit codes into contract error codes.
#   INPUTS: { ErrorCode: string, Command: string, Arguments: string[] }
#   OUTPUTS: none; throws on failure
#   SIDE_EFFECTS: starts child processes and writes command output to the console
#   LINKS: M-PACKAGING, V-M-PACKAGING
# END_CONTRACT: Invoke-Checked
function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$ErrorCode,
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "${ErrorCode}: command failed: $Command $($Arguments -join ' ')"
  }
}

function Test-CommandAvailable {
  param([Parameter(Mandatory = $true)][string]$Command)
  return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# START_CONTRACT: build_venv
#   PURPOSE: Create the production Python venv and enforce torch cu124 before pyannote dependency resolution.
#   INPUTS: { PythonVersion, TorchVersion, TorchaudioVersion, VenvPath, SkipGpuAssert }
#   OUTPUTS: .venv containing CUDA torch, CTranslate2, faster-whisper, pyannote, and backend API dependencies
#   SIDE_EFFECTS: downloads wheels, writes .venv, writes temporary constraints file under dist-packaging
#   LINKS: M-PACKAGING, V-M-PACKAGING
# END_CONTRACT: build_venv
function build_venv {
  if (-not (Test-CommandAvailable 'uv')) {
    throw 'VENV_BUILD_FAILED: uv is required to build the packaged Python environment'
  }

  if (-not (Test-Path -LiteralPath $BackendRequirements)) {
    throw "VENV_BUILD_FAILED: backend requirements not found at $BackendRequirements"
  }

  # START_BLOCK_CREATE_VENV
  Write-PackagingLog 'build_venv' 'BLOCK_CREATE_VENV' "creating venv at $VenvPath with Python $PythonVersion"
  Invoke-Checked 'VENV_BUILD_FAILED' 'uv' @('venv', $VenvPath, '--python', $PythonVersion)
  # END_BLOCK_CREATE_VENV

  # START_BLOCK_INSTALL_WHEELS
  Write-PackagingLog 'build_venv' 'BLOCK_INSTALL_WHEELS' "installing torch $TorchVersion cu124 before pyannote"
  Invoke-Checked 'CUDA_WHEEL_RESOLUTION_FAILED' 'uv' @(
    'pip', 'install', '--python', $PythonExe,
    "torch==$TorchVersion", "torchaudio==$TorchaudioVersion",
    '--index-url', $TorchIndex
  )

  $constraintDir = Join-Path $ProjectRoot 'dist-packaging'
  New-Item -ItemType Directory -Path $constraintDir -Force | Out-Null
  $constraintFile = Join-Path $constraintDir 'cuda-wheel-constraints.txt'
  @(
    "torch==$TorchVersion",
    "torchaudio==$TorchaudioVersion"
  ) | Set-Content -LiteralPath $constraintFile -Encoding UTF8

  Write-PackagingLog 'build_venv' 'BLOCK_INSTALL_WHEELS' 'installing backend requirements with torch pinned to cu124 wheels'
  Invoke-Checked 'CUDA_WHEEL_RESOLUTION_FAILED' 'uv' @(
    'pip', 'install', '--python', $PythonExe,
    '--constraint', $constraintFile,
    '-r', $BackendRequirements
  )
  # END_BLOCK_INSTALL_WHEELS

  # START_BLOCK_VALIDATE_IMPORTS
  $gpuAssert = if ($SkipGpuAssert) { 'False' } else { 'True' }
  $validation = @"
import importlib
import torch
assert torch.version.cuda, 'torch is not a CUDA build'
if ${gpuAssert}:
    assert torch.cuda.is_available(), 'CUDA GPU is not available'
for module in ('ctranslate2', 'faster_whisper', 'pyannote.audio'):
    importlib.import_module(module)
print('PACKAGING_VENV_OK', torch.__version__, torch.version.cuda)
"@
  Write-PackagingLog 'build_venv' 'BLOCK_VALIDATE_IMPORTS' 'validating CUDA torch and ML imports'
  Invoke-Checked 'CUDA_WHEEL_RESOLUTION_FAILED' $PythonExe @('-c', $validation)
  # END_BLOCK_VALIDATE_IMPORTS
}

# START_CONTRACT: package
#   PURPOSE: Build Electron artifacts after the Python sidecar has been created.
#   INPUTS: { VenvPath, StagePath }
#   OUTPUTS: electron-builder installer artifacts under dist
#   SIDE_EFFECTS: copies Python/backend resources and runs npm package tooling
#   LINKS: M-PACKAGING, V-M-PACKAGING
# END_CONTRACT: package
function package {
  if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "VENV_BUILD_FAILED: packaged Python not found at $PythonExe; run build_venv first"
  }

  # START_BLOCK_STAGE_SIDECAR
  Write-PackagingLog 'package' 'BLOCK_STAGE_SIDECAR' "staging Python sidecar under $StagePath"
  New-Item -ItemType Directory -Path $StagePath -Force | Out-Null
  $pythonStage = Join-Path $StagePath 'python'
  if (Test-Path -LiteralPath $pythonStage) {
    Remove-Item -LiteralPath $pythonStage -Recurse -Force
  }
  Copy-Item -LiteralPath $VenvPath -Destination $pythonStage -Recurse
  # END_BLOCK_STAGE_SIDECAR

  # START_BLOCK_ELECTRON_BUILDER
  Write-PackagingLog 'package' 'BLOCK_ELECTRON_BUILDER' 'running npm package flow'
  Invoke-Checked 'VENV_BUILD_FAILED' 'npm' @('run', 'package:win')
  # END_BLOCK_ELECTRON_BUILDER
}

if ($Step -eq 'build_venv' -or $Step -eq 'all') {
  build_venv
}

if ($Step -eq 'package' -or $Step -eq 'all') {
  package
}
