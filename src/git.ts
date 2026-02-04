import { execSync } from 'node:child_process'
import * as path from 'node:path'
import type { WorktreeInfo } from './types.js'

function runGit(cwd: string, args: string[]): string {
  try {
    const result = execSync(['git', '-C', cwd, ...args].join(' '), {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim()
  } catch (error) {
    const err = error as { stderr?: Buffer }
    const stderr = err.stderr?.toString().trim() ?? ''
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`)
  }
}

/**
 * Detect worktree information for the given directory
 */
export function detectWorktree(cwd: string = process.cwd()): WorktreeInfo | null {
  try {
    // Check if we're in a submodule - if so, skip
    const superproject = runGit(cwd, ['rev-parse', '--show-superproject-working-tree'])
    if (superproject) {
      return null
    }
  } catch {
    // Not in a submodule, continue
  }

  let worktreeRoot: string
  let gitCommonDir: string
  let gitDir: string

  try {
    worktreeRoot = path.resolve(cwd, runGit(cwd, ['rev-parse', '--show-toplevel']))
    gitCommonDir = path.resolve(cwd, runGit(cwd, ['rev-parse', '--git-common-dir']))
    gitDir = path.resolve(cwd, runGit(cwd, ['rev-parse', '--git-dir']))
  } catch {
    return null
  }

  // If gitDir equals gitCommonDir, we're in the main worktree
  const isLinkedWorktree = gitDir !== gitCommonDir

  // Derive main worktree root from common git dir
  const mainRoot =
    path.basename(gitCommonDir) === '.git'
      ? path.dirname(gitCommonDir)
      : gitCommonDir

  return {
    worktreeRoot,
    mainRoot,
    isLinkedWorktree,
  }
}
