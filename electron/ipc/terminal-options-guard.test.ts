import { describe, expect, it } from 'vitest'
import { UnsafeShellOptionsError, validateShellOptions } from './terminal-options-guard'

describe('validateShellOptions', () => {
  it('returns an empty object for undefined input', () => {
    expect(validateShellOptions(undefined)).toEqual({})
  })

  it('returns an empty object for null input', () => {
    expect(validateShellOptions(null)).toEqual({})
  })

  it('accepts well-formed Windows shell profiles', () => {
    expect(validateShellOptions({ shellPath: 'powershell.exe' })).toEqual({ shellPath: 'powershell.exe' })
    expect(validateShellOptions({ shellPath: 'cmd.exe', shellArgs: [] })).toEqual({ shellPath: 'cmd.exe', shellArgs: [] })
    expect(validateShellOptions({ shellPath: 'C:\\Program Files\\Git\\bin\\bash.exe', shellArgs: ['--login', '-i'] }))
      .toEqual({ shellPath: 'C:\\Program Files\\Git\\bin\\bash.exe', shellArgs: ['--login', '-i'] })
  })

  it('accepts well-formed Unix shell profiles', () => {
    expect(validateShellOptions({ shellPath: '/bin/bash', shellArgs: ['--login'] }))
      .toEqual({ shellPath: '/bin/bash', shellArgs: ['--login'] })
    expect(validateShellOptions({ shellPath: '/bin/zsh' })).toEqual({ shellPath: '/bin/zsh' })
  })

  it('trims surrounding whitespace from shellPath', () => {
    expect(validateShellOptions({ shellPath: '  /bin/bash  ' })).toEqual({ shellPath: '/bin/bash' })
  })

  it('rejects non-object shellOptions', () => {
    expect(() => validateShellOptions('cmd.exe')).toThrow(UnsafeShellOptionsError)
    expect(() => validateShellOptions(123)).toThrow('must be an object')
    expect(() => validateShellOptions(['cmd.exe'])).toThrow('must be an object')
  })

  it('rejects non-string shellPath', () => {
    expect(() => validateShellOptions({ shellPath: 123 })).toThrow('shellPath must be a string')
    expect(() => validateShellOptions({ shellPath: null })).toThrow('shellPath must be a string')
    expect(() => validateShellOptions({ shellPath: ['cmd.exe'] })).toThrow('shellPath must be a string')
  })

  it('rejects empty / whitespace-only shellPath', () => {
    expect(() => validateShellOptions({ shellPath: '' })).toThrow('must not be empty')
    expect(() => validateShellOptions({ shellPath: '   ' })).toThrow('must not be empty')
    expect(() => validateShellOptions({ shellPath: '\t\n' })).toThrow('must not be empty')
  })

  it('rejects shellPath with NUL or control characters', () => {
    expect(() => validateShellOptions({ shellPath: 'cmd\x00.exe' })).toThrow('control characters')
    expect(() => validateShellOptions({ shellPath: 'cmd\x07.exe' })).toThrow('control characters')
    expect(() => validateShellOptions({ shellPath: 'cmd\x1b.exe' })).toThrow('control characters')
  })

  it('rejects non-array shellArgs', () => {
    expect(() => validateShellOptions({ shellArgs: '--login' })).toThrow('must be an array')
    expect(() => validateShellOptions({ shellArgs: { 0: '--login' } })).toThrow('must be an array')
  })

  it('rejects non-string shellArgs entries', () => {
    expect(() => validateShellOptions({ shellArgs: ['--login', 123] })).toThrow('entries must be strings')
    expect(() => validateShellOptions({ shellArgs: [null] })).toThrow('entries must be strings')
  })

  it('rejects shellArgs entries containing NUL', () => {
    expect(() => validateShellOptions({ shellArgs: ['--login', 'foo\x00bar'] })).toThrow('NUL bytes')
  })

  it('preserves non-NUL control characters in shellArgs entries', () => {
    // A tab inside an arg is a legitimate thing the user might want passed
    // through (e.g. a value containing a literal tab).
    const result = validateShellOptions({ shellArgs: ['-c', 'echo a\tb'] })
    expect(result.shellArgs).toEqual(['-c', 'echo a\tb'])
  })
})
