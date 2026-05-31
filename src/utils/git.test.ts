import { afterEach, describe, expect, it, vi } from 'vitest'
import { gitCommit } from './git'

describe('git utilities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  it('forwards amend flag to window.api.gitCommit', async () => {
    const gitCommitMock = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).window = {
      api: {
        gitCommit: gitCommitMock,
      },
    }

    const ok = await gitCommit('/repo', 'fix', true)

    expect(ok).toBe(true)
    expect(gitCommitMock).toHaveBeenCalledWith('/repo', 'fix', true)
  })
})

