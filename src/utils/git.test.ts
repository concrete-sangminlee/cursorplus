import { afterEach, describe, expect, it, vi } from 'vitest'
import { gitCommit, gitPull, gitPush } from './git'

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

  it('forwards remote, branch, and force to window.api.gitPush', async () => {
    const gitPushMock = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).window = {
      api: {
        gitPush: gitPushMock,
      },
    }

    const ok = await gitPush('/repo', 'upstream', 'feature', true)

    expect(ok).toBe(true)
    expect(gitPushMock).toHaveBeenCalledWith('/repo', 'upstream', 'feature', true)
  })

  it('forwards remote and branch to window.api.gitPull', async () => {
    const gitPullMock = vi.fn().mockResolvedValue(true)
    ;(globalThis as any).window = {
      api: {
        gitPull: gitPullMock,
      },
    }

    const ok = await gitPull('/repo', 'upstream', 'feature')

    expect(ok).toBe(true)
    expect(gitPullMock).toHaveBeenCalledWith('/repo', 'upstream', 'feature')
  })
})
