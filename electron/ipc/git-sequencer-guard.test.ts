import { describe, expect, it } from 'vitest'
import { appendGitSequencerOptions, GitSequencerOptions } from './git-sequencer-guard'

describe('appendGitSequencerOptions', () => {
  it('does nothing when options is undefined', () => {
    const args = ['cherry-pick']
    appendGitSequencerOptions(args, undefined)
    expect(args).toEqual(['cherry-pick'])
  })

  it('does nothing when options is empty object', () => {
    const args = ['cherry-pick']
    appendGitSequencerOptions(args, {})
    expect(args).toEqual(['cherry-pick'])
  })

  it('appends --no-commit when noCommit is true', () => {
    const args = ['cherry-pick']
    appendGitSequencerOptions(args, { noCommit: true })
    expect(args).toContain('--no-commit')
  })

  it('does not append --no-commit when noCommit is false', () => {
    const args = ['cherry-pick']
    appendGitSequencerOptions(args, { noCommit: false })
    expect(args).not.toContain('--no-commit')
  })

  it('appends -m and mainline number when mainline is valid', () => {
    const args = ['revert']
    appendGitSequencerOptions(args, { mainline: 2 })
    expect(args).toEqual(['revert', '-m', '2'])
  })

  it('accepts mainline of 1', () => {
    const args = ['revert']
    appendGitSequencerOptions(args, { mainline: 1 })
    expect(args).toContain('-m')
    expect(args).toContain('1')
  })

  it('throws for non-integer mainline', () => {
    expect(() =>
      appendGitSequencerOptions(['revert'], { mainline: 1.5 })
    ).toThrow('Invalid mainline parent number')
  })

  it('throws for mainline of 0', () => {
    expect(() =>
      appendGitSequencerOptions(['revert'], { mainline: 0 })
    ).toThrow('Invalid mainline parent number')
  })

  it('throws for negative mainline', () => {
    expect(() =>
      appendGitSequencerOptions(['revert'], { mainline: -1 })
    ).toThrow('Invalid mainline parent number')
  })

  it('appends both --no-commit and -m when both options are set', () => {
    const args = ['revert']
    appendGitSequencerOptions(args, { noCommit: true, mainline: 2 })
    expect(args).toContain('--no-commit')
    expect(args).toContain('-m')
    expect(args).toContain('2')
  })
})

// Ensure the exported type is structurally correct
const _typeCheck: GitSequencerOptions = { noCommit: true, mainline: 1 }
void _typeCheck
