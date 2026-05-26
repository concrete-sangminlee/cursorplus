import fs from 'fs/promises'
import path from 'path'
import { resolveActiveWorkspacePath, WorkspacePathAccessError } from './workspace-path-guard'

export async function resolveGitCwd(cwd: unknown): Promise<string> {
  const safeCwd = await resolveActiveWorkspacePath(cwd, 'git cwd')

  try {
    const stat = await fs.stat(safeCwd)
    if (!stat.isDirectory()) {
      throw new WorkspacePathAccessError('Invalid git cwd: directory required')
    }
  } catch (err: any) {
    if (err instanceof WorkspacePathAccessError) {
      throw err
    }
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') {
      throw new WorkspacePathAccessError('Invalid git cwd: directory required')
    }
    throw err
  }

  return safeCwd
}

/**
 * Resolve a git-internal path (built from cwd + gitDir output + segments) and
 * validate that the resulting directory is inside the active workspace.
 *
 * `git rev-parse --git-dir` can return an absolute path for linked worktrees,
 * causing path.resolve(cwd, gitDir) to silently escape the workspace. This
 * function catches that case before any filesystem I/O reaches an out-of-scope
 * path.
 */
export async function resolveGitInternalPath(cwd: string, gitDir: string, ...segments: string[]): Promise<string> {
  const resolvedGitDir = path.resolve(cwd, gitDir)
  const validatedGitDir = await resolveActiveWorkspacePath(resolvedGitDir, 'git dir')
  return path.join(validatedGitDir, ...segments)
}
