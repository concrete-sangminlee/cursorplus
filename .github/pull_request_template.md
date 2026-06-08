## Summary

Describe the change in 1-3 sentences.

## Scope

- [ ] CLI
- [ ] Desktop renderer
- [ ] Electron main/preload
- [ ] Shared contracts
- [ ] Documentation
- [ ] Tests only
- [ ] Build/release configuration

## Motivation

What problem does this solve, and why is this the right level of change?

## Testing

- [ ] Not run, because:
- [ ] `npm run typecheck`
- [ ] `npm run test`
- [ ] `npm run test:cli`
- [ ] `npm run cli:build`
- [ ] `npm run build`
- [ ] Manual desktop check
- [ ] Manual CLI check

## Risk

- [ ] Low: docs, tests, or isolated cleanup
- [ ] Medium: behavior change with focused coverage
- [ ] High: cross-cutting change, migration, packaging, or provider logic

Notes:

## Checklist

- [ ] The PR is focused on one coherent change.
- [ ] User-facing behavior changes are documented.
- [ ] New behavior has tests or a clear explanation for why tests were not added.
- [ ] Generated artifacts are excluded unless they are intentionally part of the release.
- [ ] Secrets, tokens, and local machine paths are not included.
