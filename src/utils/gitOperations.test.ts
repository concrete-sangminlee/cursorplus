import { afterEach, describe, expect, it, vi } from 'vitest'
import { clean, commitAmend, createTag, getConfig, stageAll } from './gitOperations'

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

  it('normalizes camelCase git operations to hyphenated IPC channels', async () => {
    const invoke = mockGitInvoke('abc123')
    await stageAll('/repo')
    expect(invoke).toHaveBeenCalledWith('git:stage-all', '/repo')
  })

  it('normalizes getConfig to git:config-get and preserves arguments order', async () => {
    const invoke = mockGitInvoke('alice')
    const value = await getConfig('user.name', 'local', '/repo')

    expect(value).toBe('alice')
    expect(invoke).toHaveBeenCalledWith('git:config-get', 'user.name', 'local', '/repo')
  })

  it('normalizes createTag to git:create-tag and keeps option ordering', async () => {
    const invoke = mockGitInvoke('created')
    await createTag('v1', { message: 'release', force: true }, '/repo')

    expect(invoke).toHaveBeenCalledWith(
      'git:create-tag',
      '/repo',
      'v1',
      'release',
      undefined,
      true
    )
  })
})
