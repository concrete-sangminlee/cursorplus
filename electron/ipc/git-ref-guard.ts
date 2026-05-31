const CONTROL_CHARACTER_RE = /[\x00-\x1F\x7F]/

export class UnsafeGitRefError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeGitRefError'
  }
}

export function normalizeGitBranchName(value: unknown, label = 'branch name'): string {
  if (typeof value !== 'string') {
    throw new UnsafeGitRefError(`Invalid ${label}: expected a string`)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new UnsafeGitRefError(`Invalid ${label}: empty value`)
  }

  if (CONTROL_CHARACTER_RE.test(trimmed)) {
    throw new UnsafeGitRefError(`Invalid ${label}: control characters are not allowed`)
  }

  if (trimmed.startsWith('-')) {
    throw new UnsafeGitRefError(`Invalid ${label}: must not start with '-'`)
  }

  return trimmed
}

export function normalizeGitCommitHash(value: unknown, label = 'commit hash'): string {
  if (typeof value !== 'string') {
    throw new UnsafeGitRefError(`Invalid ${label}: expected a string`)
  }

  const trimmed = value.trim()
  if (!/^[0-9a-fA-F]{7,40}$/.test(trimmed)) {
    throw new UnsafeGitRefError(`Invalid ${label}`)
  }

  return trimmed
}

export function tryNormalizeGitCommitHash(value: unknown): string | null {
  try {
    return normalizeGitCommitHash(value)
  } catch {
    return null
  }
}
