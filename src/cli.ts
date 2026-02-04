#!/usr/bin/env node

import { runSetup } from './setup.js'

const verbose = process.argv.includes('--verbose') || process.argv.includes('-v')

async function main() {
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
