import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { detectWorktree } from './git.js'
import type { WorktreeSetupConfig } from './types.js'

const MARKER_FILE = '.worktree-initialized'

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
   * Commands that were run
   */
  ranCommands?: string[]
}

/**
 * Run worktree setup if in a linked worktree
 */
export async function runSetup(options: SetupOptions = {}): Promise<SetupResult> {
  const { cwd = process.cwd(), verbose = false } = options

  const log = verbose ? console.log.bind(console) : () => {}

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

  // Check marker file
  const markerPath = path.join(info.worktreeRoot, MARKER_FILE)
  if (fs.existsSync(markerPath)) {
    return { performed: false, skippedReason: 'Already initialized' }
  }

  const copiedFiles: string[] = []
  const ranCommands: string[] = []

  // Copy files
  for (const rel of config.copy ?? []) {
    const src = path.join(info.mainRoot, rel)
    const dest = path.join(info.worktreeRoot, rel)

    try {
      if (copyIfMissing(src, dest)) {
        copiedFiles.push(rel)
        log(`Copied: ${rel}`)
      }
    } catch (err) {
      console.error(`Failed to copy ${rel}:`, err)
      return { performed: false, skippedReason: `Failed to copy ${rel}` }
    }
  }

  // Run commands
  for (const cmd of config.run ?? []) {
    log(`Running: ${cmd}`)
    try {
      execSync(cmd, {
        cwd: info.worktreeRoot,
        stdio: verbose ? 'inherit' : 'pipe',
        shell: '/bin/bash',
      })
      ranCommands.push(cmd)
    } catch (err) {
      console.error(`Command failed: ${cmd}`, err)
      return { performed: false, skippedReason: `Command failed: ${cmd}` }
    }
  }

  // Write marker file
  try {
    fs.writeFileSync(markerPath, `${new Date().toISOString()}\n`)
  } catch (err) {
    console.warn('Failed to write marker file:', err)
  }

  return {
    performed: true,
    copiedFiles,
    ranCommands,
  }
}
