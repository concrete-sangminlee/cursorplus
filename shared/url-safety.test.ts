import { describe, expect, it } from 'vitest'
import { isSafeExternalUrl } from './url-safety'

describe('isSafeExternalUrl', () => {
  it('allows http and https', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(true)
    expect(isSafeExternalUrl('https://example.com')).toBe(true)
    expect(isSafeExternalUrl('https://example.com/path?q=1#frag')).toBe(true)
  })

  it('allows mailto and tel', () => {
    expect(isSafeExternalUrl('mailto:user@example.com')).toBe(true)
    expect(isSafeExternalUrl('tel:+15551234567')).toBe(true)
  })

  it('blocks file: protocol (local file read)', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isSafeExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false)
  })

  it('blocks javascript: and data:', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('data:text/html,<script>alert(1)</script>')).toBe(false)
  })

  it('blocks custom protocol handlers (OS-registered apps)', () => {
    // These can launch arbitrary apps via OS protocol handlers
    expect(isSafeExternalUrl('slack://channel')).toBe(false)
    expect(isSafeExternalUrl('vscode://file/path')).toBe(false)
    expect(isSafeExternalUrl('ms-cxh:command=execute&cmd=calc.exe')).toBe(false)
    expect(isSafeExternalUrl('steam://run/123')).toBe(false)
    expect(isSafeExternalUrl('zoommtg://zoom.us/join')).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isSafeExternalUrl(null)).toBe(false)
    expect(isSafeExternalUrl(undefined)).toBe(false)
    expect(isSafeExternalUrl(123)).toBe(false)
    expect(isSafeExternalUrl({})).toBe(false)
    expect(isSafeExternalUrl([])).toBe(false)
  })

  it('rejects empty and whitespace-only strings', () => {
    expect(isSafeExternalUrl('')).toBe(false)
    expect(isSafeExternalUrl('   ')).toBe(false)
    expect(isSafeExternalUrl('\t\n')).toBe(false)
  })

  it('rejects URLs with embedded whitespace', () => {
    expect(isSafeExternalUrl('https://example.com /malicious')).toBe(false)
    expect(isSafeExternalUrl('https://example.com\ttab')).toBe(false)
    expect(isSafeExternalUrl('https://example.com\nnewline')).toBe(false)
  })

  it('rejects URLs with control characters', () => {
    expect(isSafeExternalUrl('https://example.com\x00null')).toBe(false)
    expect(isSafeExternalUrl('https://example.com\x07bell')).toBe(false)
    expect(isSafeExternalUrl('https://example.com\x1bescape')).toBe(false)
  })

  it('rejects malformed URLs', () => {
    expect(isSafeExternalUrl('not a url')).toBe(false)
    expect(isSafeExternalUrl('://no-scheme')).toBe(false)
    expect(isSafeExternalUrl('//protocol-relative')).toBe(false)
  })

  it('is case-insensitive on the scheme', () => {
    expect(isSafeExternalUrl('HTTPS://example.com')).toBe(true)
    expect(isSafeExternalUrl('Http://example.com')).toBe(true)
    expect(isSafeExternalUrl('JAVASCRIPT:alert(1)')).toBe(false)
    expect(isSafeExternalUrl('File:///etc/passwd')).toBe(false)
  })
})
