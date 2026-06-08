# Project Health Notes

This document captures the current project shape and the highest-leverage maintenance
actions for Orion.

## Current shape

Orion is a combined desktop and CLI project:

| Area | Path | Notes |
|---|---|---|
| CLI | `cli/` | Commander-based Node CLI with 60+ commands and dedicated tests |
| Desktop main process | `electron/` | Electron entrypoint, preload bridge, IPC handlers, terminal manager |
| Desktop renderer | `src/` | React, Monaco Editor, Zustand stores, panels, components, utilities |
| Shared contracts | `shared/` | IPC channels, shared types, path and URL safety helpers |
| Distribution | `dist-*`, `release/`, `electron-builder.yml` | Build and packaging outputs/configuration |

## Immediate improvements already made

- Replaced the corrupted README content with a readable, UTF-8-safe project overview.
- Normalized command counts to `60+` instead of mixing conflicting totals.
- Rebuilt the project structure section so new contributors can find the important paths.
- Added this health note so future cleanup work has a short starting point.

## Recommended next cleanup passes

| Priority | Area | Why it matters | Suggested action |
|---|---|---|---|
| High | Large React files | Several panels and components are very large, which slows review and increases merge risk | Extract reusable hooks, view models, and smaller presentational components |
| High | Electron logging | Main-process and bridge logs should be intentional and configurable | Route debug logs through a small logger with level control |
| High | README-to-code parity | Public docs should match actual CLI registration | Add a small script or test that compares README command lists to `cli/index.ts` registrations |
| Medium | Generated build artifacts | Build outputs in the worktree can obscure source changes | Confirm whether `dist-*`, `build/`, and `release/` should be tracked or ignored |
| Medium | Provider configuration | AI provider setup spans CLI and desktop bridge code | Centralize provider defaults and model labels where possible |
| Medium | Test discoverability | Tests exist across CLI, Electron IPC, and renderer utilities | Add a testing guide that maps commands to test scopes |

## Safe validation sequence

Use this order when checking broad project health:

```bash
npm run typecheck
npm run test
npm run cli:build
npm run build
```

For focused CLI work:

```bash
npm run test:cli
npm run cli:build
```

For desktop packaging work:

```bash
npm run build
npm run package
```

## Commit hygiene

- Keep documentation-only cleanup separate from behavior changes.
- Prefer one focused source area per code PR, especially for large panel/component files.
- Run the narrowest relevant check first, then broaden only when the change crosses boundaries.
- Avoid mixing generated build output with source edits unless the release process requires it.
