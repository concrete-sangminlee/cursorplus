import { describe, expect, it } from 'vitest'
import {
  appendGitStashCreateArgs,
  resolveGitStashIndex,
  normalizeGitStashMode,
} from './git-stash-guard'

describe('normalizeGitStashMode', () => {
  it('defaults missing mode to all', () => {
    expect(normalizeGitStashMode(undefined)).toBe('all')
    expect(normalizeGitStashMode(null)).toBe('all')
    expect(normalizeGitStashMode('')).toBe('all')
  })

  it('keeps valid modes', () => {
    expect(normalizeGitStashMode('all')).toBe('all')
    expect(normalizeGitStashMode('staged')).toBe('staged')
    expect(normalizeGitStashMode('keep-index')).toBe('keep-index')
  })

  it('normalizes case and trims whitespace', () => {
    expect(normalizeGitStashMode(' KEEP-INDEX ')).toBe('keep-index')
    expect(normalizeGitStashMode('StAgEd')).toBe('staged')
  })

  it('falls back to all for invalid values', () => {
    expect(normalizeGitStashMode('invalid')).toBe('all')
    expect(normalizeGitStashMode(123)).toBe('all')
  })
})

describe('appendGitStashCreateArgs', () => {
  it('adds keep index mode', () => {
    const args: string[] = []
    appendGitStashCreateArgs(args, { mode: 'keep-index' })
    expect(args).toEqual(['-k'])
  })

  it('adds staged mode', () => {
    const args: string[] = []
    appendGitStashCreateArgs(args, { mode: 'staged' })
    expect(args).toEqual(['--staged'])
  })

  it('adds includeUntracked and message', () => {
    const args: string[] = []
    appendGitStashCreateArgs(args, { mode: 'all', includeUntracked: true, message: 'WIP' })
    expect(args).toEqual(['-u', '-m', 'WIP'])
  })
})

describe('resolveGitStashIndex', () => {
  it('returns zero for invalid or missing values', () => {
    expect(resolveGitStashIndex(undefined)).toBe(0)
    expect(resolveGitStashIndex(null as unknown)).toBe(0)
    expect(resolveGitStashIndex('abc')).toBe(0)
    expect(resolveGitStashIndex({} as unknown)).toBe(0)
  })

  it('normalizes numeric indices', () => {
    expect(resolveGitStashIndex(2)).toBe(2)
    expect(resolveGitStashIndex(2.9)).toBe(2)
    expect(resolveGitStashIndex(-4)).toBe(0)
  })

  it('parses numeric strings', () => {
    expect(resolveGitStashIndex('3')).toBe(3)
    expect(resolveGitStashIndex('  5  ')).toBe(5)
    expect(resolveGitStashIndex('-1')).toBe(0)
    expect(resolveGitStashIndex('1.9')).toBe(1)
  })
})
