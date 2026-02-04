export interface WorktreeSetupConfig {
  /**
   * Files or folders to copy from the main worktree (relative to repo root)
   */
  copy?: string[]

  /**
   * Shell commands to run after copying files
   */
  run?: string[]
}

export interface WorktreeInfo {
  /**
   * Root directory of the current worktree
   */
  worktreeRoot: string

  /**
   * Root directory of the main worktree
   */
  mainRoot: string

  /**
   * Whether the current directory is a linked worktree
   */
  isLinkedWorktree: boolean
}
