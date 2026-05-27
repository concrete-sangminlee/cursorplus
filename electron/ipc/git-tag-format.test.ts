import { describe, expect, it } from 'vitest'
import { GIT_TAG_FORMAT, parseGitTagLine } from './git-tag-format'

describe('parseGitTagLine', () => {
  const sep = '\x1f'

  it('preserves annotated tag metadata', () => {
    const line = [
      'v2.2.0',
      'tag1234',
      'commit1234',
      '2026-05-28 12:34:56 +0900',
      'tag',
      'Release 2.2.0',
      'Sang Min',
      '<sang@example.com>',
    ].join(sep)

    expect(parseGitTagLine(line)).toEqual({
      name: 'v2.2.0',
      hash: 'tag1234',
      targetHash: 'commit1234',
      message: 'Release 2.2.0',
      tagger: 'Sang Min',
      taggerEmail: 'sang@example.com',
      date: '2026-05-28 12:34:56 +0900',
      isAnnotated: true,
    })
  })

  it('keeps lightweight tags distinct from annotated tags', () => {
    const line = [
      'quick-tag',
      'commit5678',
      '',
      '2026-05-28 12:34:56 +0900',
      'commit',
      'Commit subject',
      '',
      '',
    ].join(sep)

    expect(parseGitTagLine(line)).toEqual({
      name: 'quick-tag',
      hash: 'commit5678',
      targetHash: undefined,
      message: '',
      tagger: undefined,
      taggerEmail: undefined,
      date: '2026-05-28 12:34:56 +0900',
      isAnnotated: false,
    })
  })

  it('exports the matching git for-each-ref format', () => {
    expect(GIT_TAG_FORMAT).toContain('%(objecttype)')
    expect(GIT_TAG_FORMAT).toContain('%(*objectname:short)')
    expect(GIT_TAG_FORMAT).toContain('%(taggeremail)')
  })
})
