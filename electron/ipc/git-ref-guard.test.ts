import { describe, expect, it } from 'vitest'
import {
  normalizeGitBranchName,
  normalizeGitCommitHash,
  tryNormalizeGitCommitHash,
  UnsafeGitRefError,
} from './git-ref-guard'

describe('normalizeGitBranchName', () => {
  it('accepts ordinary branch names', () => {
    expect(normalizeGitBranchName('main')).toBe('main')
    expect(normalizeGitBranchName('feature/workspace-guards')).toBe('feature/workspace-guards')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeGitBranchName('  release/2.3  ')).toBe('release/2.3')
  })

  it('rejects non-string or empty branch names', () => {
    expect(() => normalizeGitBranchName(null)).toThrow(UnsafeGitRefError)
    expect(() => normalizeGitBranchName('   ')).toThrow('empty value')
  })

  it('rejects control characters', () => {
    expect(() => normalizeGitBranchName('feature\x00hidden')).toThrow('control characters')
    expect(() => normalizeGitBranchName('feature\nnext')).toThrow('control characters')
  })

  it('rejects option-like branch names', () => {
    expect(() => normalizeGitBranchName('--upload-pack=cmd')).toThrow("must not start with '-'")
    expect(() => normalizeGitBranchName('-danger')).toThrow("must not start with '-'")
  })
})

describe('normalizeGitCommitHash', () => {
  it('accepts short and full hex commit hashes', () => {
    expect(normalizeGitCommitHash('abc1234')).toBe('abc1234')
    expect(normalizeGitCommitHash('a'.repeat(40))).toBe('a'.repeat(40))
  })

  it('rejects malformed hashes', () => {
    expect(() => normalizeGitCommitHash('abc123')).toThrow(UnsafeGitRefError)
    expect(() => normalizeGitCommitHash('main')).toThrow(UnsafeGitRefError)
    expect(() => normalizeGitCommitHash('a'.repeat(41))).toThrow(UnsafeGitRefError)
    expect(() => normalizeGitCommitHash(null)).toThrow(UnsafeGitRefError)
  })
})

describe('tryNormalizeGitCommitHash', () => {
  it('returns the trimmed hash for a valid 7-char input', () => {
    expect(tryNormalizeGitCommitHash('abc1234')).toBe('abc1234')
  })

  it('returns the hash for a valid 40-char input', () => {
    expect(tryNormalizeGitCommitHash('a'.repeat(40))).toBe('a'.repeat(40))
  })

  it('trims surrounding whitespace before validating', () => {
    expect(tryNormalizeGitCommitHash(' abc1234 ')).toBe('abc1234')
  })

  it('returns null for a hash that is too short', () => {
    expect(tryNormalizeGitCommitHash('abc123')).toBeNull()
  })

  it('returns null when input contains non-hex characters', () => {
    expect(tryNormalizeGitCommitHash('abc1234/extra')).toBeNull()
  })

  it('returns null for a non-string input', () => {
    expect(tryNormalizeGitCommitHash(null)).toBeNull()
    expect(tryNormalizeGitCommitHash(undefined)).toBeNull()
    expect(tryNormalizeGitCommitHash(42)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(tryNormalizeGitCommitHash('')).toBeNull()
  })
})
