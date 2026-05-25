import fs from 'fs/promises'
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
