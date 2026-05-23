import fs from 'fs/promises'
import path from 'path'

const CONTROL_CHARACTER_RE = /[\x00-\x1F\x7F]/

export class WorkspacePathAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspacePathAccessError'
  }
}

export function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function normalizePathInput(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new WorkspacePathAccessError(`Invalid ${label}: expected a string`)
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new WorkspacePathAccessError(`Invalid ${label}: empty path`)
  }

  if (CONTROL_CHARACTER_RE.test(trimmed)) {
    throw new WorkspacePathAccessError(`Invalid ${label}: control characters are not allowed`)
  }

  return trimmed
}

async function realpathIfPresent(targetPath: string): Promise<string | null> {
  try {
    return await fs.realpath(targetPath)
  } catch (err: any) {
    if (err?.code === 'ENOENT' || err?.code === 'ENOTDIR') {
      return null
    }
    throw err
  }
}

async function nearestExistingAncestor(targetPath: string): Promise<string> {
  let current = targetPath

  while (true) {
    const real = await realpathIfPresent(current)
    if (real) return path.resolve(real)

    const parent = path.dirname(current)
    if (parent === current) return path.resolve(current)
    current = parent
  }
}

export async function resolveWorkspacePath(
  workspaceRoot: unknown,
  candidatePath: unknown,
  label = 'path',
): Promise<string> {
  const rootInput = normalizePathInput(workspaceRoot, 'workspace root')
  if (!path.isAbsolute(rootInput)) {
    throw new WorkspacePathAccessError('Invalid workspace root: absolute path required')
  }

  const rootLexicalPath = path.resolve(rootInput)
  const rootRealPath = await realpathIfPresent(rootLexicalPath)

  if (!rootRealPath) {
    throw new WorkspacePathAccessError('No workspace root is open')
  }

  const candidateInput = normalizePathInput(candidatePath, label)
  if (!path.isAbsolute(candidateInput)) {
    throw new WorkspacePathAccessError(`Invalid ${label}: absolute path required`)
  }

  const resolvedCandidate = path.resolve(candidateInput)

  if (!isPathInside(rootLexicalPath, resolvedCandidate)) {
    throw new WorkspacePathAccessError(`Refused ${label}: outside workspace root`)
  }

  const candidateRealPath = await realpathIfPresent(resolvedCandidate)
  if (candidateRealPath) {
    if (!isPathInside(path.resolve(rootRealPath), path.resolve(candidateRealPath))) {
      throw new WorkspacePathAccessError(`Refused ${label}: resolves outside workspace root`)
    }
    return resolvedCandidate
  }

  const ancestorRealPath = await nearestExistingAncestor(path.dirname(resolvedCandidate))
  if (!isPathInside(path.resolve(rootRealPath), ancestorRealPath)) {
    throw new WorkspacePathAccessError(`Refused ${label}: parent resolves outside workspace root`)
  }

  return resolvedCandidate
}
