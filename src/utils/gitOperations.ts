/**
 * Git operations utility layer.
 * Provides typed wrappers around git commands via IPC,
 * with staging, commit, branch, merge, stash, and log support.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  staged: GitFileChange[]
  unstaged: GitFileChange[]
  untracked: string[]
  conflicted: string[]
  stashCount: number
  isDetached: boolean
  isRebasing: boolean
  isMerging: boolean
  isCherryPicking: boolean
}

export interface GitFileChange {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmerged'
  oldPath?: string
  additions?: number
  deletions?: number
}

export interface GitCommitInfo {
  hash: string
  shortHash: string
  author: string
  authorEmail: string
  authorDate: string
  committer: string
  committerDate: string
  message: string
  body?: string
  parents: string[]
  refs: string[]
  isHead: boolean
}

export interface GitBranch {
  name: string
  current: boolean
  remote?: string
  upstream?: string
  ahead: number
  behind: number
  lastCommitHash?: string
  lastCommitMessage?: string
  lastCommitDate?: string
}

export interface GitRemote {
  name: string
  fetchUrl: string
  pushUrl: string
}

export interface GitStash {
  index: number
  message: string
  branch: string
  date: string
  hash: string
}

export interface GitTag {
  name: string
  hash: string
  message?: string
  date?: string
  isAnnotated: boolean
}

export interface GitBlameInfo {
  hash: string
  author: string
  authorEmail: string
  date: string
  message: string
  line: number
  originalLine: number
}

export interface GitDiffStat {
  file: string
  additions: number
  deletions: number
  binary: boolean
}

export interface MergeConflict {
  file: string
  ours: string
  theirs: string
  base: string
  resolved: boolean
}

/* ── IPC Bridge ────────────────────────────────────────── */

const api = () => (window as any).api

async function gitCommand<T = string>(command: string, args: string[] = [], cwd?: string): Promise<T> {
  const result = await api()?.gitCommand?.(command, args, cwd)
  if (result?.error) throw new Error(result.error)
  return result?.data as T
}

/* ── Status ────────────────────────────────────────────── */

export async function getStatus(cwd?: string): Promise<GitStatus> {
  const raw = await gitCommand<any>('status', ['--porcelain=v2', '--branch', '-u'], cwd)
  return parseStatus(raw)
}

function parseStatus(raw: any): GitStatus {
  // Return a structured status (parsing handled by backend)
  if (typeof raw === 'object' && raw.branch) return raw as GitStatus

  // Fallback for raw string
  return {
    branch: 'main',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    stashCount: 0,
    isDetached: false,
    isRebasing: false,
    isMerging: false,
    isCherryPicking: false,
  }
}

/* ── Staging ───────────────────────────────────────────── */

export async function stage(paths: string[], cwd?: string): Promise<void> {
  await gitCommand('add', paths, cwd)
}

export async function stageAll(cwd?: string): Promise<void> {
  await gitCommand('add', ['-A'], cwd)
}

export async function unstage(paths: string[], cwd?: string): Promise<void> {
  await gitCommand('reset', ['HEAD', ...paths], cwd)
}

export async function unstageAll(cwd?: string): Promise<void> {
  await gitCommand('reset', ['HEAD'], cwd)
}

export async function discardChanges(paths: string[], cwd?: string): Promise<void> {
  await gitCommand('checkout', ['--', ...paths], cwd)
}

/* ── Commits ───────────────────────────────────────────── */

export async function commit(message: string, options?: {
  amend?: boolean
  signoff?: boolean
  allowEmpty?: boolean
}, cwd?: string): Promise<string> {
  const args = ['-m', message]
  if (options?.amend) args.push('--amend')
  if (options?.signoff) args.push('--signoff')
  if (options?.allowEmpty) args.push('--allow-empty')

  return await gitCommand('commit', args, cwd)
}

export async function getLog(options?: {
  maxCount?: number
  skip?: number
  author?: string
  since?: string
  until?: string
  path?: string
  grep?: string
  all?: boolean
}, cwd?: string): Promise<GitCommitInfo[]> {
  const args = ['--format=json']
  if (options?.maxCount) args.push(`-n`, `${options.maxCount}`)
  if (options?.skip) args.push(`--skip=${options.skip}`)
  if (options?.author) args.push(`--author=${options.author}`)
  if (options?.since) args.push(`--since=${options.since}`)
  if (options?.until) args.push(`--until=${options.until}`)
  if (options?.grep) args.push(`--grep=${options.grep}`)
  if (options?.all) args.push('--all')
  if (options?.path) args.push('--', options.path)

  return await gitCommand<GitCommitInfo[]>('log', args, cwd)
}

export async function getCommitDetails(hash: string, cwd?: string): Promise<GitCommitInfo & { diff: string }> {
  return await gitCommand('show', [hash], cwd)
}

/* ── Branches ──────────────────────────────────────────── */

export async function getBranches(cwd?: string): Promise<GitBranch[]> {
  return await gitCommand<GitBranch[]>('branch', ['-a', '-v', '--format=json'], cwd)
}

export async function createBranch(name: string, startPoint?: string, cwd?: string): Promise<void> {
  const args = [name]
  if (startPoint) args.push(startPoint)
  await gitCommand('branch', args, cwd)
}

export async function deleteBranch(name: string, force = false, cwd?: string): Promise<void> {
  await gitCommand('branch', [force ? '-D' : '-d', name], cwd)
}

export async function renameBranch(oldName: string, newName: string, cwd?: string): Promise<void> {
  await gitCommand('branch', ['-m', oldName, newName], cwd)
}

export async function checkout(ref: string, cwd?: string): Promise<void> {
  await gitCommand('checkout', [ref], cwd)
}

export async function checkoutNewBranch(name: string, startPoint?: string, cwd?: string): Promise<void> {
  const args = ['-b', name]
  if (startPoint) args.push(startPoint)
  await gitCommand('checkout', args, cwd)
}

/* ── Merge & Rebase ────────────────────────────────────── */

export async function merge(branch: string, options?: {
  noFastForward?: boolean
  squash?: boolean
  message?: string
}, cwd?: string): Promise<void> {
  const args = [branch]
  if (options?.noFastForward) args.push('--no-ff')
  if (options?.squash) args.push('--squash')
  if (options?.message) args.push('-m', options.message)

  await gitCommand('merge', args, cwd)
}

export async function rebase(branch: string, cwd?: string): Promise<void> {
  await gitCommand('rebase', [branch], cwd)
}

export async function rebaseContinue(cwd?: string): Promise<void> {
  await gitCommand('rebase', ['--continue'], cwd)
}

export async function rebaseAbort(cwd?: string): Promise<void> {
  await gitCommand('rebase', ['--abort'], cwd)
}

export async function mergeAbort(cwd?: string): Promise<void> {
  await gitCommand('merge', ['--abort'], cwd)
}

/* ── Remote ────────────────────────────────────────────── */

export async function getRemotes(cwd?: string): Promise<GitRemote[]> {
  return await gitCommand<GitRemote[]>('remote', ['-v'], cwd)
}

export async function fetch(remote = 'origin', options?: {
  prune?: boolean
  all?: boolean
  tags?: boolean
}, cwd?: string): Promise<void> {
  const args = options?.all ? ['--all'] : [remote]
  if (options?.prune) args.push('--prune')
  if (options?.tags) args.push('--tags')

  await gitCommand('fetch', args, cwd)
}

export async function pull(remote = 'origin', branch?: string, options?: {
  rebase?: boolean
}, cwd?: string): Promise<void> {
  const args = [remote]
  if (branch) args.push(branch)
  if (options?.rebase) args.push('--rebase')

  await gitCommand('pull', args, cwd)
}

export async function push(remote = 'origin', branch?: string, options?: {
  force?: boolean
  setUpstream?: boolean
  tags?: boolean
}, cwd?: string): Promise<void> {
  const args = [remote]
  if (branch) args.push(branch)
  if (options?.force) args.push('--force-with-lease')
  if (options?.setUpstream) args.push('-u')
  if (options?.tags) args.push('--tags')

  await gitCommand('push', args, cwd)
}

/* ── Stash ─────────────────────────────────────────────── */

export async function stashList(cwd?: string): Promise<GitStash[]> {
  return await gitCommand<GitStash[]>('stash', ['list'], cwd)
}

export async function stashSave(message?: string, options?: {
  includeUntracked?: boolean
  keepIndex?: boolean
}, cwd?: string): Promise<void> {
  const args = ['push']
  if (message) args.push('-m', message)
  if (options?.includeUntracked) args.push('-u')
  if (options?.keepIndex) args.push('--keep-index')

  await gitCommand('stash', args, cwd)
}

export async function stashPop(index = 0, cwd?: string): Promise<void> {
  await gitCommand('stash', ['pop', `stash@{${index}}`], cwd)
}

export async function stashApply(index = 0, cwd?: string): Promise<void> {
  await gitCommand('stash', ['apply', `stash@{${index}}`], cwd)
}

export async function stashDrop(index: number, cwd?: string): Promise<void> {
  await gitCommand('stash', ['drop', `stash@{${index}}`], cwd)
}

/* ── Tags ──────────────────────────────────────────────── */

export async function getTags(cwd?: string): Promise<GitTag[]> {
  return await gitCommand<GitTag[]>('tag', ['-l', '--format=json'], cwd)
}

export async function createTag(name: string, message?: string, hash?: string, cwd?: string): Promise<void> {
  const args = message ? ['-a', name, '-m', message] : [name]
  if (hash) args.push(hash)
  await gitCommand('tag', args, cwd)
}

export async function deleteTag(name: string, cwd?: string): Promise<void> {
  await gitCommand('tag', ['-d', name], cwd)
}

/* ── Blame ─────────────────────────────────────────────── */

export async function blame(filePath: string, cwd?: string): Promise<GitBlameInfo[]> {
  return await gitCommand<GitBlameInfo[]>('blame', ['--porcelain', filePath], cwd)
}

/* ── Diff ──────────────────────────────────────────────── */

export async function diff(path?: string, options?: {
  staged?: boolean
  cached?: boolean
  nameOnly?: boolean
  stat?: boolean
  ref1?: string
  ref2?: string
}, cwd?: string): Promise<string> {
  const args: string[] = []
  if (options?.staged || options?.cached) args.push('--cached')
  if (options?.nameOnly) args.push('--name-only')
  if (options?.stat) args.push('--stat')
  if (options?.ref1) args.push(options.ref1)
  if (options?.ref2) args.push(options.ref2)
  if (path) args.push('--', path)

  return await gitCommand('diff', args, cwd)
}

export async function diffStat(ref1?: string, ref2?: string, cwd?: string): Promise<GitDiffStat[]> {
  return await gitCommand<GitDiffStat[]>('diff', ['--stat', ref1 || '', ref2 || ''].filter(Boolean), cwd)
}

/* ── Cherry Pick ───────────────────────────────────────── */

export async function cherryPick(hash: string, cwd?: string): Promise<void> {
  await gitCommand('cherry-pick', [hash], cwd)
}

export async function cherryPickAbort(cwd?: string): Promise<void> {
  await gitCommand('cherry-pick', ['--abort'], cwd)
}

/* ── Reset ─────────────────────────────────────────────── */

export async function reset(ref: string, mode: 'soft' | 'mixed' | 'hard' = 'mixed', cwd?: string): Promise<void> {
  await gitCommand('reset', [`--${mode}`, ref], cwd)
}

/* ── Clean ─────────────────────────────────────────────── */

export async function clean(options?: { dryRun?: boolean; force?: boolean; directories?: boolean }, cwd?: string): Promise<string[]> {
  const args: string[] = []
  if (options?.dryRun) args.push('-n')
  if (options?.force) args.push('-f')
  if (options?.directories) args.push('-d')

  return await gitCommand<string[]>('clean', args, cwd)
}

/* ── Config ────────────────────────────────────────────── */

export async function getConfig(key: string, cwd?: string): Promise<string | undefined> {
  try {
    return await gitCommand('config', ['--get', key], cwd)
  } catch {
    return undefined
  }
}

export async function setConfig(key: string, value: string, global = false, cwd?: string): Promise<void> {
  const args = global ? ['--global', key, value] : [key, value]
  await gitCommand('config', args, cwd)
}

/* ── Helpers ───────────────────────────────────────────── */

export function formatCommitDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return `${Math.floor(diffDays / 365)}y ago`
  } catch {
    return dateStr
  }
}

export function getStatusIcon(status: GitFileChange['status']): string {
  switch (status) {
    case 'added': return 'A'
    case 'modified': return 'M'
    case 'deleted': return 'D'
    case 'renamed': return 'R'
    case 'copied': return 'C'
    case 'unmerged': return 'U'
    default: return '?'
  }
}

export function getStatusColor(status: GitFileChange['status']): string {
  switch (status) {
    case 'added': return '#2ea043'
    case 'modified': return '#d29922'
    case 'deleted': return '#f85149'
    case 'renamed': return '#58a6ff'
    case 'copied': return '#58a6ff'
    case 'unmerged': return '#f85149'
    default: return '#8b949e'
  }
}
