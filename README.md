# worktree-setup

Automatic setup for Git worktrees via post-checkout hook. Works with any tool that creates worktrees - Cursor, Codex, wt CLI, or plain `git worktree add`.

## Why?

Git worktrees are great for parallel development, but each new worktree needs setup:

- Copy environment files (`.env.local`, etc.)
- Install dependencies
- Run build scripts

This package automates that by hooking into Git's native `post-checkout` hook.

## Installation

```bash
bun add -D worktree-setup
```

## Setup

### 1. Add configuration to package.json

```json
{
  "worktreeSetup": {
    "copy": [
      ".env.local",
      ".vscode/settings.json"
    ],
    "run": [
      "bun install",
      "bun run prepare"
    ]
  }
}
```

### 2. Initialize hooks automatically

```bash
bunx worktree-setup init
```

This creates `.git/hooks/post-checkout` and adds `.worktree-setup.log` to `.gitignore`.

### 3. Configure the post-checkout hook manually (optional)

Using [simple-git-hooks](https://github.com/toplenboren/simple-git-hooks):

```json
{
  "simple-git-hooks": {
    "post-checkout": "bunx worktree-setup"
  }
}
```

Using [husky](https://github.com/typicode/husky):

```bash
echo "bunx worktree-setup" > .husky/post-checkout
```

Or manually in `.git/hooks/post-checkout`:

```bash
#!/bin/sh
bunx worktree-setup
```

### 4. Add setup log file to .gitignore

```gitignore
.worktree-setup.log
```

## Configuration

Add a `worktreeSetup` key to your `package.json`:

| Option | Type       | Description                                       |
| ------ | ---------- | ------------------------------------------------- |
| `copy` | `string[]` | Files/folders to copy from the main worktree      |
| `run`  | `string[]` | Commands to run after copying (in the worktree)   |

### Example

```json
{
  "worktreeSetup": {
    "copy": [
      ".env.local",
      ".env.development.local",
      ".claude/settings.local.json"
    ],
    "run": [
      "pnpm install --frozen-lockfile",
      "pnpm run build"
    ]
  }
}
```

## How It Works

1. When Git checks out a branch (including worktree creation), the `post-checkout` hook runs
2. The script detects if it's in a linked worktree (not the main repo)
3. Reads `worktreeSetup` config from the main worktree's `package.json`
4. Copies specified files that don't already exist
5. Runs specified commands
6. Appends `WORKTREE_SETUP_STATUS=success` to `.worktree-setup.log` so it only runs once

## CLI Options

```bash
bunx worktree-setup [options]
bunx worktree-setup init [options]

Options:
  -v, --verbose  Show detailed output
  --force        Overwrite existing post-checkout hook (init only)
```

## Programmatic Usage

```typescript
import { runSetup, detectWorktree } from 'worktree-setup'

// Run setup
const result = await runSetup({ verbose: true })
if (result.performed) {
  console.log('Setup completed!')
  console.log('Copied:', result.copiedFiles)
  console.log('Ran:', result.ranCommands)
}

// Just detect worktree info
const info = detectWorktree()
if (info?.isLinkedWorktree) {
  console.log('In worktree:', info.worktreeRoot)
  console.log('Main repo:', info.mainRoot)
}
```

## Compatibility

Works with any tool that creates Git worktrees:

- `git worktree add`
- [Cursor Parallel Agents](https://cursor.com)
- [OpenAI Codex](https://openai.com/codex)
- [@johnlindquist/worktree](https://github.com/johnlindquist/worktree-cli)
- [Vibe Kanban](https://vibe.dev)
- Any other worktree-based workflow

## License

MIT
