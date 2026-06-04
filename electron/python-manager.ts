// FILE: electron/python-manager.ts
// VERSION: 1.0.0
// START_MODULE_CONTRACT
//   PURPOSE: Manage the Python FastAPI backend lifecycle: free-port selection, token generation,
//            model cache env, spawn uvicorn via child_process, health polling, graceful shutdown, restart.
//   SCOPE: Backend process orchestration and writable backend environment setup for the Electron main process.
//   DEPENDS: M-CONFIG-STORE, M-SHARED, node:child_process, node:crypto, node:net
//   LINKS: M-PY-MANAGER, V-M-PY-MANAGER
//   ROLE: INTEGRATION
//   MAP_MODE: EXPORTS
// END_MODULE_CONTRACT
//
// START_MODULE_MAP
//   start - spawn Python backend and return BackendInfo.
//   stop - graceful shutdown (SIGTERM -> SIGKILL on timeout).
//   restart - stop then start.
//   getStatus - running/healthy/port.
//   getInfo - return current BackendInfo.
//   resolveModelCacheDir - choose a writable model cache outside bundled app resources.
//   resolveBackendCwd - choose project root in dev and resources root in packaged app.
// END_MODULE_MAP
import { randomBytes } from 'node:crypto'
import { createServer, type AddressInfo } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { getConfig } from './config-store'

export type BackendInfo = {
  baseUrl: string
  wsBaseUrl: string
  token: string
  port: number
  running: boolean
}

export type BackendStatus = {
  running: boolean
  healthy: boolean
  port: number | null
}

const HEALTH_POLL_INTERVAL = 300
const HEALTH_POLL_TIMEOUT = 30_000
const SHUTDOWN_WAIT = 5_000
const MAX_RESTART_ATTEMPTS = 3

let processInstance: ChildProcess | null = null
let currentInfo: BackendInfo | null = null

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      const port = address.port
      server.close(() => resolve(port))
    })
    server.on('error', reject)
  })
}

async function getPythonPath(): Promise<string> {
  const config = getConfig()

  if (process.env.WA_PYTHON) {
    return process.env.WA_PYTHON
  }

  const bundledPath = join(process.resourcesPath ?? '', 'python', 'Scripts', 'python.exe')
  const devPath = join(process.cwd(), '.venv', 'Scripts', 'python.exe')

  const { access } = await import('node:fs/promises')

  try {
    await access(bundledPath)
    return bundledPath
  } catch {
    try {
      await access(devPath)
      return devPath
    } catch {
      throw new Error('PYTHON_NOT_FOUND')
    }
  }
}

async function findActualPort(configPort: number | null): Promise<number> {
  if (configPort) {
    return configPort
  }
  return findFreePort()
}

function resolveModelCacheDir(): string {
  if (process.env.WA_MODEL_CACHE_DIR) {
    return process.env.WA_MODEL_CACHE_DIR
  }

  return join(process.env.LOCALAPPDATA ?? process.cwd(), 'WhisperAnnote', 'models')
}

function resolveBackendCwd(): string {
  if (process.env.WA_BACKEND_CWD) {
    return process.env.WA_BACKEND_CWD
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    return process.cwd()
  }

  return process.resourcesPath ?? process.cwd()
}

// START_CONTRACT: start
//   PURPOSE: Launch the Python backend and wait for a healthy health-check response.
//   INPUTS: { preferredPort?: number, hfToken?: string }
//   OUTPUTS: Promise<BackendInfo> - resolved when backend health-check passes
//   SIDE_EFFECTS: spawns child process, updates module-level process reference and info
//   LINKS: M-PY-MANAGER, V-M-PY-MANAGER
// END_CONTRACT: start
export async function start(preferredPort?: number, hfToken?: string): Promise<BackendInfo> {
  const port = await findActualPort(preferredPort ?? null)
  const token = randomBytes(32).toString('hex')
  const baseUrl = `http://127.0.0.1:${port}`
  const wsBaseUrl = `ws://127.0.0.1:${port}`

  const pythonPath = await getPythonPath()
  const config = getConfig()

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    BACKEND_HOST: '127.0.0.1',
    BACKEND_PORT: String(port),
    BACKEND_TOKEN: token,
    MODEL_CACHE_DIR: resolveModelCacheDir(),
    ALLOWED_ROOTS: config.outputFolder,
    CORS_ORIGINS: process.env.ELECTRON_RENDERER_URL ?? 'app://.'
  }

  if (hfToken) {
    env.HUGGINGFACE_HUB_TOKEN = hfToken
  }

  if (config.watchFolder) {
    env.ALLOWED_ROOTS = [config.outputFolder, config.watchFolder].filter(Boolean).join(';')
  }

  const cwd = resolveBackendCwd()

  processInstance = spawn(pythonPath, ['-m', 'uvicorn', 'backend.server:create_app', '--factory', '--host', '127.0.0.1', '--port', String(port)], {
    env,
    cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  // START_BLOCK_SPAWN_BACKEND
  const pid = processInstance.pid
  processInstance.stdout?.on('data', (data: Buffer) => {
    const line = data.toString().trim()
    if (line) {
      logBackendLine(line)
    }
  })
  processInstance.stderr?.on('data', (data: Buffer) => {
    const line = data.toString().trim()
    if (line) {
      logBackendLine(line)
    }
  })
  processInstance.on('exit', (code) => {
    processInstance = null
  })
  // END_BLOCK_SPAWN_BACKEND

  await pollHealth(baseUrl, token)

  const info: BackendInfo = { baseUrl, wsBaseUrl, token, port, running: true }
  currentInfo = info
  return info
}

function logBackendLine(line: string) {
  if (process.env.NODE_ENV !== 'production') {
    console.info(`[PyManager][start][BLOCK_SPAWN_BACKEND] ${line}`)
  }
}

async function pollHealth(baseUrl: string, token: string): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < HEALTH_POLL_TIMEOUT) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(2000)
      })

      if (response.ok) {
        return
      }
    } catch {
      // Backend not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL))
  }

  throw new Error('BACKEND_START_FAILED')
}

// START_CONTRACT: stop
//   PURPOSE: Gracefully stop the Python backend process.
//   INPUTS: none
//   OUTPUTS: Promise<void>
//   SIDE_EFFECTS: sends SIGTERM (or taskkill on Windows), waits up to SHUTDOWN_WAIT, then SIGKILL
//   LINKS: M-PY-MANAGER, V-M-PY-MANAGER
// END_CONTRACT: stop
export function stop(): Promise<void> {
  return new Promise((resolve) => {
    if (!processInstance || !processInstance.pid) {
      processInstance = null
      currentInfo = null
      resolve()
      return
    }

    const pid = processInstance.pid
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(pid), '/T', '/F'])
        } else {
          processInstance?.kill('SIGKILL')
        }
      } catch {
        // Process already gone
      }
      processInstance = null
      currentInfo = null
      resolve()
    }, SHUTDOWN_WAIT)

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(pid), '/T'])
    } else {
      processInstance?.kill('SIGTERM')
    }

    processInstance?.on('exit', () => {
      clearTimeout(timer)
      processInstance = null
      currentInfo = null
      resolve()
    })
  })
}

// START_CONTRACT: restart
//   PURPOSE: Stop then start the backend.
//   INPUTS: { hfToken?: string }
//   OUTPUTS: Promise<BackendInfo>
//   SIDE_EFFECTS: may throw after MAX_RESTART_ATTEMPTS
//   LINKS: M-PY-MANAGER, V-M-PY-MANAGER
// END_CONTRACT: restart
export async function restart(hfToken?: string): Promise<BackendInfo> {
  await stop()

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RESTART_ATTEMPTS; attempt++) {
    try {
      return await start(undefined, hfToken)
    } catch (error) {
      lastError = error as Error
    }
  }

  throw lastError ?? new Error('BACKEND_START_FAILED')
}

// START_CONTRACT: getStatus
//   PURPOSE: Return the current backend status without side effects.
//   INPUTS: none
//   OUTPUTS: BackendStatus
//   SIDE_EFFECTS: none
//   LINKS: M-PY-MANAGER, V-M-PY-MANAGER
// END_CONTRACT: getStatus
export function getStatus(): BackendStatus {
  if (!currentInfo) {
    return { running: false, healthy: false, port: null }
  }
  return { running: currentInfo.running, healthy: currentInfo.running, port: currentInfo.port }
}

// START_CONTRACT: getInfo
//   PURPOSE: Return the current BackendInfo or null if not running.
//   INPUTS: none
//   OUTPUTS: BackendInfo | null
//   SIDE_EFFECTS: none
//   LINKS: M-PY-MANAGER, V-M-PY-MANAGER
// END_CONTRACT: getInfo
export function getInfo(): BackendInfo | null {
  return currentInfo
}

// START_CHANGE_SUMMARY
//   LAST_CHANGE: v1.4.0 - Spawn uvicorn with backend.server:create_app --factory to match the backend entry contract.
//   LAST_CHANGE: v1.3.0 - Use project root as backend cwd in dev so uvicorn can import backend.server.
//   LAST_CHANGE: v1.2.0 - Forward backend stdout/stderr to dev logs so startup health failures are diagnosable.
//   LAST_CHANGE: v1.1.0 - Backend now receives a stable writable MODEL_CACHE_DIR instead of an empty cache path.
// END_CHANGE_SUMMARY
