import { describe, expect, it, vi, beforeEach } from 'vitest'
import { assertIpcSuccess, writeFileChecked } from './ipcResult'

describe('ipcResult helpers', () => {
  beforeEach(() => {
    ;(globalThis as { api?: { writeFile: unknown } }).api = {
      writeFile: vi.fn(),
    }
  })

  it('asserts success result', () => {
    expect(() => assertIpcSuccess({ success: true }, 'save')).not.toThrow()
  })

  it('throws when result is undefined', () => {
    expect(() => assertIpcSuccess(undefined, 'save')).toThrow('save failed')
  })

  it('throws when result indicates failure', () => {
    expect(() => assertIpcSuccess({ success: false, error: 'disk full' }, 'save')).toThrow('disk full')
  })

  it('writeFileChecked calls window.api.writeFile and resolves on success', async () => {
    const apiWrite = (globalThis as unknown as { api: { writeFile: unknown } }).api.writeFile as ReturnType<typeof vi.fn>
    apiWrite.mockResolvedValue({ success: true })

    await expect(writeFileChecked('file.ts', 'content', 'save')).resolves.toBeUndefined()
    expect(apiWrite).toHaveBeenCalledWith('file.ts', 'content')
  })

  it('writeFileChecked throws when write fails', async () => {
    const apiWrite = (globalThis as unknown as { api: { writeFile: unknown } }).api.writeFile as ReturnType<typeof vi.fn>
    apiWrite.mockResolvedValue({ success: false, error: 'denied' })

    await expect(writeFileChecked('file.ts', 'content', 'save')).rejects.toThrow('denied')
  })
})
