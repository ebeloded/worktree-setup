import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { detectWorktree } from './git.js'
import type { WorktreeSetupConfig } from './types.js'

const LOG_FILE = '.worktree-setup.log'
const SUCCESS_TOKEN = 'WORKTREE_SETUP_STATUS=success'

function readConfig(mainRoot: string): WorktreeSetupConfig | null {
  const pkgPath = path.join(mainRoot, 'package.json')
  if (!fs.existsSync(pkgPath)) return null

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return pkg.worktreeSetup ?? null
  } catch {
    return null
  }
}

function copyIfMissing(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false
  if (fs.existsSync(dest)) return false

  const st = fs.lstatSync(src)
  fs.mkdirSync(path.dirname(dest), { recursive: true })

  if (st.isDirectory()) {
    fs.cpSync(src, dest, { recursive: true })
  } else {
    fs.copyFileSync(src, dest)
  }

  return true
}

function nowIso(): string {
  return new Date().toISOString()
}

function appendLog(logPath: string, message: string): void {
  fs.appendFileSync(logPath, `[${nowIso()}] ${message}\n`)
}

function hasSuccessfulSetup(logPath: string): boolean {
  if (!fs.existsSync(logPath)) return false
  const content = fs.readFileSync(logPath, 'utf8')
  return content.includes(SUCCESS_TOKEN)
}

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`
}

export interface SetupOptions {
  /**
   * Working directory (defaults to process.cwd())
   */
  cwd?: string

  /**
   * Whether to log progress messages
   */
  verbose?: boolean
}

export interface SetupResult {
  /**
   * Whether setup was performed
   */
  performed: boolean

  /**
   * Reason if setup was skipped
   */
  skippedReason?: string

  /**
   * Files that were copied
   */
  copiedFiles?: string[]

  /**
   * Commands that were run or queued
   */
  ranCommands?: string[]
}

/**
 * Run worktree setup if in a linked worktree
 */
export async function runSetup(options: SetupOptions = {}): Promise<SetupResult> {
  const { cwd = process.cwd(), verbose = false } = options

  const verboseLog = verbose ? console.log.bind(console) : () => {}

  // Detect worktree
  const info = detectWorktree(cwd)

  if (!info) {
    return { performed: false, skippedReason: 'Not in a git repository' }
  }

  if (!info.isLinkedWorktree) {
    return { performed: false, skippedReason: 'Not a linked worktree' }
  }

  // Check if main root exists
  if (!fs.existsSync(info.mainRoot)) {
    return { performed: false, skippedReason: `Main worktree not found at ${info.mainRoot}` }
  }

  // Read config from main worktree
  const config = readConfig(info.mainRoot)
  if (!config) {
    return { performed: false, skippedReason: 'No worktreeSetup config in package.json' }
  }

  const logPath = path.join(info.worktreeRoot, LOG_FILE)
  if (hasSuccessfulSetup(logPath)) {
    return { performed: false, skippedReason: 'Already initialized' }
  }

  appendLog(logPath, `setup start for ${info.worktreeRoot}`)

  const copiedFiles: string[] = []
  let copyFailed = false

  // Copy files
  for (const rel of config.copy ?? []) {
    const src = path.join(info.mainRoot, rel)
    const dest = path.join(info.worktreeRoot, rel)

    try {
      if (copyIfMissing(src, dest)) {
        copiedFiles.push(rel)
        appendLog(logPath, `copy: copied ${rel}`)
        verboseLog(`Copied: ${rel}`)
      } else if (fs.existsSync(dest)) {
        appendLog(logPath, `copy: skipped (exists) ${rel}`)
      } else {
        appendLog(logPath, `copy: skipped (missing source) ${rel}`)
      }
    } catch (err) {
      copyFailed = true
      appendLog(logPath, `copy: failed ${rel} (${String(err)})`)
      console.error(`Failed to copy ${rel}:`, err)
    }
  }

  if (copyFailed) {
    appendLog(logPath, 'WORKTREE_SETUP_STATUS=failed stage=copy')
    return { performed: false, skippedReason: 'Failed to copy one or more files' }
  }

  const commands = config.run ?? []
  if (commands.length > 0) {
    appendLog(logPath, `run: launching ${commands.length} command(s) in background`)
    const runChain = commands.join(' && ')
    const script = `{ echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] command run start (${commands.length} command(s))"; ${runChain}; rc=$?; if [ "$rc" -eq 0 ]; then echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] ${SUCCESS_TOKEN}"; else echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] WORKTREE_SETUP_STATUS=failed stage=run exit_code=$rc"; fi; exit "$rc"; }`
    const wrappedScript = `{ ${script}; } >> ${shellQuote(logPath)} 2>&1`

    try {
      const proc = spawn('bash', ['-lc', wrappedScript], {
        cwd: info.worktreeRoot,
        detached: true,
        stdio: 'ignore',
      })
      proc.unref()
      appendLog(logPath, `run: background process started pid=${proc.pid}`)
      verboseLog(
        `Running ${commands.length} command(s) in background (log: ${LOG_FILE})`,
      )
    } catch (err) {
      appendLog(
        logPath,
        `WORKTREE_SETUP_STATUS=failed stage=spawn error=${String(err)}`,
      )
      console.error('Failed to spawn run commands:', err)
      return { performed: false, skippedReason: 'Failed to spawn run commands' }
    }
  } else {
    appendLog(logPath, SUCCESS_TOKEN)
  }

  return {
    performed: true,
    copiedFiles,
    ranCommands: commands,
  }
}
