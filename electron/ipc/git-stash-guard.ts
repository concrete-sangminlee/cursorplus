export type GitStashMode = 'all' | 'staged' | 'keep-index'

export interface GitStashCreateOptions {
  message?: string
  mode?: GitStashMode
  includeUntracked?: boolean
}

export interface GitStashApplyOptions {
  drop?: boolean
}

const STASH_MODES = new Set<GitStashMode>(['all', 'staged', 'keep-index'])

export function normalizeGitStashMode(mode?: unknown): GitStashMode {
  if (typeof mode !== 'string') return 'all'
  const normalized = mode.trim().toLowerCase()
  return STASH_MODES.has(normalized as GitStashMode)
    ? (normalized as GitStashMode)
    : 'all'
}

export function appendGitStashCreateArgs(
  args: string[],
  options?: GitStashCreateOptions
): void {
  const mode = normalizeGitStashMode(options?.mode)

  if (options?.includeUntracked) {
    args.push('-u')
  }
  if (mode === 'staged') {
    args.push('--staged')
  } else if (mode === 'keep-index') {
    args.push('-k')
  }
  if (options?.message) {
    args.push('-m', options.message)
  }
}

export function resolveGitStashIndex(index?: unknown): number {
  if (typeof index === 'number' && Number.isFinite(index)) {
    return Math.max(0, Math.floor(index))
  }
  if (typeof index === 'string' && index.trim()) {
    const parsed = Number.parseInt(index.trim(), 10)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }
  return 0
}
