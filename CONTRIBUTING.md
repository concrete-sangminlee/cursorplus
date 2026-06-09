# Contributing to Orion IDE

This guide explains how to make focused, reviewable changes to Orion's CLI, Electron app, renderer, and shared contracts.

## Quick Start

```bash
git clone https://github.com/<your-username>/orion.git
cd orion
npm ci
npm run cli:build
npm run test:cli
npm run dev
```

## Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 22.12+ | Required by `package.json` and CI |
| npm | Use `npm ci` for clean installs |
| Git | Required for source control workflows |
| Native build tools | Required by Electron/native dependencies such as `node-pty` |
| Ollama | Optional for local AI provider testing |
| Provider API keys | Optional for Anthropic/OpenAI provider testing |

## Repository Map

| Area | Path | Purpose |
|---|---|---|
| CLI | `cli/` | Commander entrypoint, command implementations, CLI utilities, CLI tests |
| CLI commands | `cli/commands/` | One command module per feature area |
| Desktop main process | `electron/` | Electron app startup, menus, preload, IPC, terminal bridge |
| IPC guards | `electron/ipc/` | Validation around clipboard, Git, shell, terminal, workspace, and filesystem actions |
| Renderer | `src/` | React app, panels, components, stores, hooks, utilities, themes |
| Shared contracts | `shared/` | IPC channel names, shared types, path/URL safety helpers |
| Docs | `docs/` | Architecture, health notes, feature guides, operational notes |
| Workflows | `.github/` | CI, release, Dependabot, issue and PR templates |
| Build output | `dist*`, `build/`, `release/` | Generated artifacts; avoid editing by hand |

## Development Commands

| Task | Command |
|---|---|
| Start renderer dev server | `npm run dev` |
| Build renderer | `npm run build` |
| Type-check project | `npm run typecheck` |
| Run all tests | `npm run test` |
| Build CLI bundle | `npm run cli:build` |
| Run CLI tests | `npm run test:cli` |
| Package desktop app | `npm run package` |

Use the narrowest relevant check first. Broaden only when the change crosses boundaries.

## Validation by Change Type

| Change type | Minimum local checks |
|---|---|
| Documentation only | Manual read-through |
| CLI command or CLI utility | `npm run cli:build`, `npm run test:cli` |
| Electron IPC, preload, terminal, shell, Git, filesystem | `npm run typecheck`, targeted IPC tests if present |
| Renderer component, panel, store, hook, utility | `npm run typecheck`, relevant Vitest tests |
| Shared type, IPC channel, path/URL safety | `npm run typecheck`, tests touching both Electron and renderer contracts |
| Build, release, package, dependency configuration | `npm run build`, `npm run cli:build`, dependency-review checks, and relevant workflow/package review |
| Security-sensitive behavior | Add or update regression tests and document risk in the PR |

## Adding a CLI Command

1. Create a module in `cli/commands/`.
2. Register the command in `cli/index.ts`.
3. Add focused tests under `cli/__tests__/` or extend an existing relevant test file.
4. Build the CLI and smoke-check help output.

Example command shape:

```typescript
import { Command } from 'commander'

export function registerExampleCommand(program: Command): void {
  program
    .command('example')
    .description('Explain what the command does')
    .option('--json', 'print structured output')
    .action(async (options) => {
      // Keep side effects explicit and user-confirmed.
    })
}
```

Smoke check:

```bash
npm run cli:build
node dist-cli/index.mjs example --help
npm run test:cli
```

## Code Style

- Use TypeScript and ES modules.
- Keep changes focused on one coherent behavior or documentation update.
- Prefer explicit validation helpers over inline ad hoc checks.
- Keep user-facing errors actionable and concise.
- Avoid logging secrets, full prompts with credentials, full environment dumps, or private local paths.
- Do not edit generated output by hand unless the release process explicitly requires it.
- Preserve existing design-system patterns when working in the renderer.

## Security Expectations

Orion can access local files, terminals, Git state, clipboard content, and AI provider credentials. Treat these surfaces as sensitive.

- Require clear user intent before file writes, shell commands, destructive Git actions, or external navigation.
- Treat renderer input, IPC payloads, file paths, URLs, provider responses, and workspace content as untrusted.
- Use existing guard modules in `electron/ipc/` and safety helpers in `shared/` where possible.
- Redact secrets from logs, issue reports, test fixtures, screenshots, and generated documentation.
- Report vulnerabilities privately according to `SECURITY.md`.

## Pull Request Guidelines

Before opening a PR:

1. Create a focused branch.
2. Keep generated artifacts out of the diff unless they are intentionally part of the change.
3. Use a Conventional Commit-style message such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`, or `ci:`.
4. Run the narrow checks for your change type.
5. Fill out the PR template with scope, test status, risk, and notes.

A strong PR includes:

- A concise summary of the user-visible or maintainer-visible change.
- The smallest useful diff.
- Tests or a clear reason tests were not added.
- Screenshots or short recordings for UI changes when visual behavior matters.
- Risk notes for Electron, IPC, shell, Git, filesystem, provider, or packaging changes.

## Issue Guidelines

Use the issue templates when reporting bugs or requesting features.

For bugs, include:

- Affected area.
- Reproduction steps.
- Expected and actual behavior.
- OS, Node.js version, Orion version, install method, and provider if relevant.
- Redacted logs or screenshots.

For feature requests, include:

- The workflow problem.
- Proposed behavior.
- Alternatives considered.
- Acceptance criteria.

## Release and Dependency Notes

- CI and release workflows live in `.github/workflows/`.
- Dependabot policy lives in `.github/dependabot.yml`.
- Release publishing expects `NPM_TOKEN` to be configured in GitHub secrets.
- Major dependency bumps should be reviewed individually, especially Electron, Vite, React, Monaco, TypeScript, and AI SDK updates.

## Questions

Use GitHub Discussions for open-ended questions and GitHub Issues for actionable bugs or feature requests.
