<!-- FILE: tests/packaging/smoke-install.md -->
<!-- VERSION: 1.0.0 -->
<!-- START_MODULE_CONTRACT -->
<!--   PURPOSE: Capture manual and semiautomated evidence for the Windows GPU installer smoke gate. -->
<!--   SCOPE: packaged venv checks, electron-builder sidecar checks, clean-machine GPU validation. -->
<!--   DEPENDS: M-PACKAGING, V-M-PACKAGING -->
<!--   LINKS: M-PACKAGING, V-M-PACKAGING, Gate-Phase-8 -->
<!--   ROLE: TEST -->
<!--   MAP_MODE: LOCALS -->
<!-- END_MODULE_CONTRACT -->

<!-- START_MODULE_MAP -->
<!--   Step 1 - build and validate CUDA .venv. -->
<!--   Step 2 - package installer with Python sidecar and backend resources. -->
<!--   Gate - run installer on a clean Windows NVIDIA GPU machine. -->
<!-- END_MODULE_MAP -->

<!-- START_CHANGE_SUMMARY -->
<!--   LAST_CHANGE: v1.0.0 - Added Phase 8 smoke evidence checklist for V-M-PACKAGING. -->
<!-- END_CHANGE_SUMMARY -->

# M-PACKAGING Smoke Install Evidence

## Step 1: CUDA Venv

Run from the repository root on a Windows build host:

```powershell
uv sync
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Step build_venv
```

Expected evidence:

- Build log contains `[Packaging][build_venv][BLOCK_INSTALL_WHEELS] installing torch 2.6.0 cu124 before pyannote`.
- `torch` and `torchaudio` are installed from `https://download.pytorch.org/whl/cu124` before `pyannote.audio`.
- `.\.venv\Scripts\python.exe -c "import torch; assert torch.version.cuda"` passes.
- `.\.venv\Scripts\python.exe -c "import torch; assert torch.cuda.is_available()"` passes on the GPU smoke host.
- `.\.venv\Scripts\python.exe -c "import ctranslate2"` passes.
- `.\.venv\Scripts\python.exe -c "import faster_whisper; import pyannote.audio"` passes.

## Step 2: Installer Sidecar

Run from the repository root after Step 1 passes:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1 -Step package
```

Expected evidence:

- `dist-packaging\python\Scripts\python.exe` exists before `electron-builder` runs.
- The installed app contains `resources\python\Scripts\python.exe`.
- The installed app contains `resources\backend\server.py` and backend package files.
- The installer does not contain model cache directories or downloaded Hugging Face model blobs.

## Gate-Phase-8: Clean GPU Machine

Run on a clean Windows machine with NVIDIA driver 550+ and no system CUDA Toolkit requirement:

```powershell
& "$env:LOCALAPPDATA\Programs\WhisperAnnote\WhisperAnnote.exe"
```

Expected evidence:

- First run shows onboarding and allows HF token entry without exposing the token in renderer state or logs.
- `GET /api/health` reports `cuda_available=true` and at least one CUDA device.
- Model download writes only to `MODEL_CACHE_DIR`, not to bundled app resources.
- A short audio transcription completes with diarized speaker labels.
- On a non-CUDA machine, the app reports a clear CUDA-unavailable error instead of crashing (`VF-ONBOARD-NOCUDA`).
