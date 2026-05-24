import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isPathInside, resolveWorkspacePath, resolveWorkspaceRootPath, WorkspacePathAccessError } from './workspace-path-guard'

let tempDir: string
let workspaceRoot: string
let outsideDir: string

async function canCreateDirectoryLink(target: string, linkPath: string): Promise<boolean> {
  try {
    await fs.symlink(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    return true
  } catch (err: any) {
    if (err?.code === 'EPERM' || err?.code === 'EACCES' || err?.code === 'ENOTSUP') {
      return false
    }
    throw err
  }
}

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orion-workspace-guard-'))
  workspaceRoot = path.join(tempDir, 'workspace')
  outsideDir = path.join(tempDir, 'workspace-sibling')
  await fs.mkdir(workspaceRoot)
  await fs.mkdir(outsideDir)
})

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true })
})

describe('isPathInside', () => {
  it('allows the root itself', () => {
    expect(isPathInside(workspaceRoot, workspaceRoot)).toBe(true)
  })

  it('allows direct children', () => {
    expect(isPathInside(workspaceRoot, path.join(workspaceRoot, 'src', 'index.ts'))).toBe(true)
  })

  it('allows child directories whose names start with two dots', () => {
    expect(isPathInside(workspaceRoot, path.join(workspaceRoot, '..backup', 'out.txt'))).toBe(true)
  })

  it('rejects parent directory traversal', () => {
    expect(isPathInside(workspaceRoot, path.dirname(workspaceRoot))).toBe(false)
  })

  it('rejects sibling paths with the same prefix', () => {
    expect(isPathInside(workspaceRoot, path.join(outsideDir, 'leak.txt'))).toBe(false)
  })
})

describe('resolveWorkspacePath', () => {
  it('allows existing files inside the workspace', async () => {
    const filePath = path.join(workspaceRoot, 'notes.md')
    await fs.writeFile(filePath, 'hello')

    await expect(resolveWorkspacePath(workspaceRoot, filePath)).resolves.toBe(path.resolve(filePath))
  })

  it('allows future files when the nearest existing parent stays inside the workspace', async () => {
    const dirPath = path.join(workspaceRoot, 'src')
    await fs.mkdir(dirPath)
    const filePath = path.join(dirPath, 'new', 'file.ts')

    await expect(resolveWorkspacePath(workspaceRoot, filePath)).resolves.toBe(path.resolve(filePath))
  })

  it('rejects paths that escape with dot-dot segments', async () => {
    const outsidePath = path.join(workspaceRoot, '..', 'escape.txt')

    await expect(resolveWorkspacePath(workspaceRoot, outsidePath)).rejects.toThrow(WorkspacePathAccessError)
  })

  it('rejects sibling paths that only share a string prefix', async () => {
    const outsidePath = path.join(outsideDir, 'leak.txt')

    await expect(resolveWorkspacePath(workspaceRoot, outsidePath)).rejects.toThrow('outside workspace root')
  })

  it('rejects relative candidate paths', async () => {
    await expect(resolveWorkspacePath(workspaceRoot, 'src/index.ts')).rejects.toThrow('absolute path required')
  })

  it('rejects malformed candidate paths', async () => {
    await expect(resolveWorkspacePath(workspaceRoot, '')).rejects.toThrow('empty path')
    await expect(resolveWorkspacePath(workspaceRoot, '   ')).rejects.toThrow('empty path')
    await expect(resolveWorkspacePath(workspaceRoot, `${workspaceRoot}${path.sep}bad\x00name`)).rejects.toThrow('control characters')
  })

  it('rejects non-string candidate paths', async () => {
    await expect(resolveWorkspacePath(workspaceRoot, null)).rejects.toThrow('expected a string')
    await expect(resolveWorkspacePath(workspaceRoot, 123)).rejects.toThrow('expected a string')
  })

  it('rejects missing workspace roots', async () => {
    const missingRoot = path.join(tempDir, 'missing-root')
    const candidate = path.join(missingRoot, 'file.txt')

    await expect(resolveWorkspacePath(missingRoot, candidate)).rejects.toThrow('No workspace root is open')
  })

  it('rejects existing symlink or junction targets outside the workspace', async () => {
    const linkPath = path.join(workspaceRoot, 'outside-link')
    const linked = await canCreateDirectoryLink(outsideDir, linkPath)
    if (!linked) {
      console.warn('Skipping symlink workspace guard test: insufficient privileges')
      return
    }

    await expect(resolveWorkspacePath(workspaceRoot, linkPath)).rejects.toThrow('resolves outside workspace root')
  })

  it('rejects new paths whose nearest existing ancestor resolves outside the workspace', async () => {
    const linkPath = path.join(workspaceRoot, 'outside-parent')
    const linked = await canCreateDirectoryLink(outsideDir, linkPath)
    if (!linked) {
      console.warn('Skipping symlink parent workspace guard test: insufficient privileges')
      return
    }

    const futurePath = path.join(linkPath, 'created-later.txt')
    await expect(resolveWorkspacePath(workspaceRoot, futurePath)).rejects.toThrow('parent resolves outside workspace root')
  })
})

describe('resolveWorkspaceRootPath', () => {
  it('allows existing absolute directory roots', async () => {
    await expect(resolveWorkspaceRootPath(workspaceRoot)).resolves.toBe(path.resolve(workspaceRoot))
  })

  it('rejects file paths as workspace roots', async () => {
    const filePath = path.join(workspaceRoot, 'not-a-directory.txt')
    await fs.writeFile(filePath, 'hello')

    await expect(resolveWorkspaceRootPath(filePath)).rejects.toThrow('directory required')
  })

  it('rejects relative workspace roots', async () => {
    await expect(resolveWorkspaceRootPath('relative-workspace')).rejects.toThrow('absolute path required')
  })

  it('rejects missing workspace roots', async () => {
    await expect(resolveWorkspaceRootPath(path.join(tempDir, 'missing-workspace'))).rejects.toThrow('No workspace root is open')
  })

  it('rejects malformed workspace roots', async () => {
    await expect(resolveWorkspaceRootPath('')).rejects.toThrow('empty path')
    await expect(resolveWorkspaceRootPath(`${workspaceRoot}\x00`)).rejects.toThrow('control characters')
  })
})
