import { describe, expect, it } from 'vitest'
import { isSafeOpenPath, isSafeRevealPath } from './path-safety'

describe('isSafeOpenPath', () => {
  it('allows ordinary document paths', () => {
    expect(isSafeOpenPath('C:/Users/me/notes.md')).toBe(true)
    expect(isSafeOpenPath('C:\\Users\\me\\report.pdf')).toBe(true)
    expect(isSafeOpenPath('/home/user/photo.png')).toBe(true)
    expect(isSafeOpenPath('relative/path/to/file.txt')).toBe(true)
    expect(isSafeOpenPath('file_without_extension')).toBe(true)
  })

  it('blocks Windows executable extensions', () => {
    expect(isSafeOpenPath('C:/tmp/payload.exe')).toBe(false)
    expect(isSafeOpenPath('script.bat')).toBe(false)
    expect(isSafeOpenPath('C:/foo.cmd')).toBe(false)
    expect(isSafeOpenPath('thing.com')).toBe(false)
    expect(isSafeOpenPath('foo.scr')).toBe(false)
    expect(isSafeOpenPath('a.pif')).toBe(false)
    expect(isSafeOpenPath('macro.vbs')).toBe(false)
    expect(isSafeOpenPath('macro.vbe')).toBe(false)
    expect(isSafeOpenPath('payload.wsf')).toBe(false)
    expect(isSafeOpenPath('payload.wsh')).toBe(false)
    expect(isSafeOpenPath('script.ps1')).toBe(false)
    expect(isSafeOpenPath('installer.msi')).toBe(false)
    expect(isSafeOpenPath('patch.msp')).toBe(false)
    expect(isSafeOpenPath('foo.mst')).toBe(false)
    expect(isSafeOpenPath('foo.hta')).toBe(false)
    expect(isSafeOpenPath('foo.cpl')).toBe(false)
    expect(isSafeOpenPath('foo.reg')).toBe(false)
    expect(isSafeOpenPath('shortcut.lnk')).toBe(false)
    expect(isSafeOpenPath('foo.jse')).toBe(false)
  })

  it('blocks Unix shell scripts', () => {
    expect(isSafeOpenPath('/tmp/install.sh')).toBe(false)
    expect(isSafeOpenPath('foo.bash')).toBe(false)
    expect(isSafeOpenPath('foo.zsh')).toBe(false)
  })

  it('blocks macOS app bundles and Java archives', () => {
    expect(isSafeOpenPath('/Applications/Calculator.app')).toBe(false)
    expect(isSafeOpenPath('payload.jar')).toBe(false)
  })

  it('is case-insensitive on the extension', () => {
    expect(isSafeOpenPath('Payload.EXE')).toBe(false)
    expect(isSafeOpenPath('Payload.Exe')).toBe(false)
    expect(isSafeOpenPath('SCRIPT.BAT')).toBe(false)
    expect(isSafeOpenPath('Script.PS1')).toBe(false)
  })

  it('blocks dangerous extension even with double extension trick', () => {
    // Attacker may name file "invoice.pdf.exe" hoping victim sees "invoice.pdf"
    expect(isSafeOpenPath('invoice.pdf.exe')).toBe(false)
    expect(isSafeOpenPath('photo.png.scr')).toBe(false)
    // ...also when the dangerous one is not last (defense in depth — some
    // shell handlers strip trailing tokens or treat `.lnk` mid-path specially)
    expect(isSafeOpenPath('foo.exe.txt')).toBe(false)
  })

  it('still blocks dangerous extension when trailing dot or space is appended', () => {
    // Windows shell strips trailing `.` and ` ` from filenames, so `payload.exe.`
    // / `payload.exe ` would execute as `payload.exe`. The segment-based check
    // catches both cases via trim() + split('.') yielding 'exe'.
    expect(isSafeOpenPath('payload.exe.')).toBe(false)
    expect(isSafeOpenPath('payload.exe ')).toBe(false)
  })

  it('rejects non-string input', () => {
    expect(isSafeOpenPath(null)).toBe(false)
    expect(isSafeOpenPath(undefined)).toBe(false)
    expect(isSafeOpenPath(123)).toBe(false)
    expect(isSafeOpenPath({})).toBe(false)
    expect(isSafeOpenPath([])).toBe(false)
  })

  it('rejects empty and whitespace-only strings', () => {
    expect(isSafeOpenPath('')).toBe(false)
    expect(isSafeOpenPath('   ')).toBe(false)
    expect(isSafeOpenPath('\t\n')).toBe(false)
  })

  it('rejects paths with NUL or control characters', () => {
    expect(isSafeOpenPath('foo.txt\x00.exe')).toBe(false)
    expect(isSafeOpenPath('foo\x07.txt')).toBe(false)
    expect(isSafeOpenPath('foo\x1b.txt')).toBe(false)
    expect(isSafeOpenPath('foo\x7f.txt')).toBe(false)
  })
})

describe('isSafeRevealPath', () => {
  // showItemInFolder only opens the file manager — it does not execute the
  // target. So this validator only needs to block NUL injection and bogus
  // input; extension filtering is not required.
  it('allows ordinary paths regardless of extension', () => {
    expect(isSafeRevealPath('C:/tmp/payload.exe')).toBe(true)
    expect(isSafeRevealPath('/home/user/photo.png')).toBe(true)
    expect(isSafeRevealPath('script.bat')).toBe(true)
  })

  it('rejects non-string input', () => {
    expect(isSafeRevealPath(null)).toBe(false)
    expect(isSafeRevealPath(undefined)).toBe(false)
    expect(isSafeRevealPath(123)).toBe(false)
  })

  it('rejects empty and whitespace-only strings', () => {
    expect(isSafeRevealPath('')).toBe(false)
    expect(isSafeRevealPath('   ')).toBe(false)
  })

  it('rejects paths with NUL or control characters', () => {
    expect(isSafeRevealPath('foo\x00.txt')).toBe(false)
    expect(isSafeRevealPath('foo\x07.txt')).toBe(false)
    expect(isSafeRevealPath('foo\x1b.txt')).toBe(false)
  })
})
