import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const LOG_FILE = '.worktree-setup.log'
const HOOK_SCRIPT = `#!/bin/sh
bunx worktree-setup
`

function runGit(cwd: string, args: string[]): string {
  const result = execSync(['git', '-C', cwd, ...args].join(' '), {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  return result.trim()
}

function ensureLogIgnored(repoRoot: string): boolean {
  const gitignorePath = path.join(repoRoot, '.gitignore')
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${LOG_FILE}\n`, 'utf8')
    return true
  }

  const content = fs.readFileSync(gitignorePath, 'utf8')
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  if (lines.includes(LOG_FILE)) {
    return false
  }

  const needsNewline = content.length > 0 && !content.endsWith('\n')
  fs.appendFileSync(gitignorePath, `${needsNewline ? '\n' : ''}${LOG_FILE}\n`, 'utf8')
  return true
}

export interface InitOptions {
  cwd?: string
  verbose?: boolean
  force?: boolean
}

export interface InitResult {
  performed: boolean
  skippedReason?: string
  hookPath?: string
  hookUpdated?: boolean
  gitignoreUpdated?: boolean
}

export function initWorkspaceSetup(options: InitOptions = {}): InitResult {
  const { cwd = process.cwd(), verbose = false, force = false } = options
  const verboseLog = verbose ? console.log.bind(console) : () => {}

  let repoRoot: string
  let gitCommonDir: string

  try {
    repoRoot = path.resolve(cwd, runGit(cwd, ['rev-parse', '--show-toplevel']))
    gitCommonDir = path.resolve(cwd, runGit(cwd, ['rev-parse', '--git-common-dir']))
  } catch {
    return { performed: false, skippedReason: 'Not in a git repository' }
  }

  const hooksDir = path.join(gitCommonDir, 'hooks')
  const hookPath = path.join(hooksDir, 'post-checkout')
  fs.mkdirSync(hooksDir, { recursive: true })

  const existingHook = fs.existsSync(hookPath) ? fs.readFileSync(hookPath, 'utf8') : null
  const normalizedExisting = existingHook?.replace(/\r\n/g, '\n')
  const normalizedExpected = HOOK_SCRIPT.replace(/\r\n/g, '\n')

  let hookUpdated = false

  if (normalizedExisting === normalizedExpected) {
    verboseLog('post-checkout hook already configured')
  } else if (existingHook && !force) {
    return {
      performed: false,
      skippedReason: `post-checkout hook already exists at ${hookPath} (use --force to overwrite)`,
      hookPath,
    }
  } else {
    fs.writeFileSync(hookPath, HOOK_SCRIPT, 'utf8')
    fs.chmodSync(hookPath, 0o755)
    hookUpdated = true
    verboseLog(`Configured hook: ${hookPath}`)
  }

  const gitignoreUpdated = ensureLogIgnored(repoRoot)
  if (gitignoreUpdated) {
    verboseLog(`Added ${LOG_FILE} to .gitignore`)
  }

  return {
    performed: true,
    hookPath,
    hookUpdated,
    gitignoreUpdated,
  }
}
