import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { setProjectPath } from '../workspace/project-path'
import { resolveGitCwd, resolveGitInternalPath } from './git-cwd-guard'

let tempDir: string
let workspaceRoot: string
let outsideDir: string

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orion-git-cwd-guard-'))
  workspaceRoot = path.join(tempDir, 'workspace')
  outsideDir = path.join(tempDir, 'outside')
  await fs.mkdir(workspaceRoot)
  await fs.mkdir(outsideDir)
  setProjectPath(workspaceRoot)
})

afterEach(async () => {
  setProjectPath('')
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('resolveGitCwd', () => {
  it('allows the active workspace root', async () => {
    await expect(resolveGitCwd(workspaceRoot)).resolves.toBe(path.resolve(workspaceRoot))
  })

  it('allows existing subdirectories inside the active workspace', async () => {
    const subdir = path.join(workspaceRoot, 'src')
    await fs.mkdir(subdir)

    await expect(resolveGitCwd(subdir)).resolves.toBe(path.resolve(subdir))
  })

  it('rejects cwd paths outside the active workspace', async () => {
    await expect(resolveGitCwd(outsideDir)).rejects.toThrow('outside workspace root')
  })

  it('rejects files inside the active workspace as cwd', async () => {
    const filePath = path.join(workspaceRoot, 'README.md')
    await fs.writeFile(filePath, '# test')

    await expect(resolveGitCwd(filePath)).rejects.toThrow('directory required')
  })

  it('rejects missing directories inside the active workspace as cwd', async () => {
    await expect(resolveGitCwd(path.join(workspaceRoot, 'missing'))).rejects.toThrow('directory required')
  })

  it('rejects non-string cwd values', async () => {
    await expect(resolveGitCwd(null)).rejects.toThrow('expected a string')
    await expect(resolveGitCwd(123)).rejects.toThrow('expected a string')
  })

  it('rejects cwd when no active workspace is open', async () => {
    setProjectPath('')

    await expect(resolveGitCwd(workspaceRoot)).rejects.toThrow('No workspace root is open')
  })
})

describe('resolveGitInternalPath', () => {
  it('allows a relative gitDir that resolves inside the active workspace', async () => {
    const result = await resolveGitInternalPath(workspaceRoot, '.', 'MERGE_HEAD')
    expect(result).toBe(path.join(path.resolve(workspaceRoot), 'MERGE_HEAD'))
  })

  it('allows a nested relative gitDir inside the active workspace', async () => {
    const gitDir = path.join(workspaceRoot, '.git')
    await fs.mkdir(gitDir)
    const result = await resolveGitInternalPath(workspaceRoot, '.git', 'MERGE_HEAD')
    expect(result).toBe(path.join(path.resolve(workspaceRoot), '.git', 'MERGE_HEAD'))
  })

  it('rejects an absolute gitDir that resolves outside the active workspace', async () => {
    await expect(resolveGitInternalPath(workspaceRoot, outsideDir, 'MERGE_HEAD'))
      .rejects.toThrow('outside workspace root')
  })

  it('rejects an absolute gitDir from a worktree whose main repo is outside the workspace', async () => {
    const externalGitDir = path.join(outsideDir, '.git', 'worktrees', 'wt')
    await fs.mkdir(externalGitDir, { recursive: true })
    await expect(resolveGitInternalPath(workspaceRoot, externalGitDir, 'rebase-merge'))
      .rejects.toThrow('outside workspace root')
  })

  it('rejects when no active workspace is open', async () => {
    setProjectPath('')
    await expect(resolveGitInternalPath(workspaceRoot, '.git', 'MERGE_HEAD'))
      .rejects.toThrow('No workspace root is open')
  })
})
