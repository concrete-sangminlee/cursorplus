import { afterEach, describe, expect, it, vi } from 'vitest'
import { clean, commitAmend } from './gitOperations'

function mockGitInvoke(result: unknown) {
  const invoke = vi.fn().mockResolvedValue(result)
  ;(globalThis as any).window = { electron: { invoke } }
  return invoke
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (globalThis as any).window
})

describe('gitOperations IPC error handling', () => {
  it('throws when commit amend returns success false with an empty error string', async () => {
    const invoke = mockGitInvoke({ success: false, error: '' })

    await expect(commitAmend('message', '/repo')).rejects.toThrow('Git operation failed')
    expect(invoke).toHaveBeenCalledWith('git:commit-amend', '/repo', 'message')
  })

  it('throws when clean returns success false with an empty error string', async () => {
    const invoke = mockGitInvoke({ success: false, error: '', removedFiles: [] })

    await expect(clean({ force: true }, '/repo')).rejects.toThrow('Git operation failed')
    expect(invoke).toHaveBeenCalledWith('git:clean', '/repo', { force: true })
  })
})
