#!/usr/bin/env node

import { initWorkspaceSetup } from './init.js'
import { runSetup } from './setup.js'

const args = process.argv.slice(2)
const verbose = args.includes('--verbose') || args.includes('-v')
const force = args.includes('--force')
const command = args.find((arg) => arg === 'init')

async function main() {
  if (command === 'init') {
    const result = initWorkspaceSetup({ verbose, force })
    if (result.performed) {
      if (verbose) {
        console.log('worktree-setup init completed')
        if (result.hookPath) {
          console.log(`  Hook: ${result.hookPath}`)
        }
      }
      return
    }

    const reason = result.skippedReason ?? 'Initialization failed'
    console.error(`worktree-setup init skipped: ${reason}`)
    process.exit(1)
  }

  const result = await runSetup({ verbose })

  if (result.performed) {
    if (verbose) {
      console.log('Worktree setup completed successfully')
      if (result.copiedFiles?.length) {
        console.log(`  Copied: ${result.copiedFiles.join(', ')}`)
      }
      if (result.ranCommands?.length) {
        console.log(`  Ran: ${result.ranCommands.length} command(s)`)
      }
    }
  } else if (verbose && result.skippedReason) {
    console.log(`Worktree setup skipped: ${result.skippedReason}`)
  }
}

main().catch((err) => {
  console.error('Worktree setup error:', err)
  process.exit(1)
})
