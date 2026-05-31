import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import { resolveGitCwd, resolveGitInternalPath } from './git-cwd-guard'
import { normalizeGitBranchName, normalizeGitCommitHash, tryNormalizeGitCommitHash } from './git-ref-guard'
import {
  appendGitStashCreateArgs,
  GitStashCreateOptions,
  GitStashApplyOptions,
  resolveGitStashIndex,
} from './git-stash-guard'
import { appendGitSequencerOptions, GitSequencerOptions } from './git-sequencer-guard'
import { GIT_TAG_FORMAT, parseGitTagLine } from './git-tag-format'

const execFileAsync = promisify(execFile)

/**
 * Run git using execFile with an array of arguments.
 * Throws on non-zero exit so callers can report errors.
 *
 * NEVER goes through a shell — argv entries are passed directly to git, so
 * renderer-supplied values (file paths, branch names, commit messages, refs)
 * cannot inject commands via shell metacharacters.
 */
async function runGitExec(
  cwd: unknown,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number }
): Promise<string> {
  const safeCwd = await resolveGitCwd(cwd)
  const { stdout } = await execFileAsync('git', args, {
    cwd: safeCwd,
    timeout: options?.timeout ?? 10000,
    maxBuffer: options?.maxBuffer ?? 1024 * 1024 * 5,
  })
  return stdout.trim()
}

/**
 * Same as runGitExec but returns '' instead of throwing on failure.
 * Use for handlers that should degrade gracefully (status checks, optional
 * upstream queries) rather than propagating errors to the renderer.
 */
async function runGitOrEmpty(
  cwd: unknown,
  args: string[],
  options?: { timeout?: number; maxBuffer?: number }
): Promise<string> {
  try {
    return await runGitExec(cwd, args, options)
  } catch {
    return ''
  }
}

function gitErrorMessage(err: any): string {
  return err?.stderr?.trim() || err?.message || 'Git operation failed'
}

interface GitLogPageOptions {
  offset?: unknown
  limit?: unknown
  file?: unknown
  author?: unknown
  since?: unknown
  until?: unknown
  search?: unknown
}

interface ParsedLogCommit {
  fullHash: string
  hash: string
  author: string
  email: string
  date: string
  message: string
}

function normalizeGitLogOptions(
  options?: GitLogPageOptions,
): {
  offset: number
  limit: number
  file?: string
  author?: string
  since?: string
  until?: string
  search?: string
} {
  const opts = options ?? {}

  const toNonNegativeInt = (value: unknown, fallback: number): number => {
    const parsed = Number.parseInt(String(value ?? ''), 10)
    if (!Number.isFinite(parsed) || parsed < 0) return fallback
    return parsed
  }

  const trimOrUndefined = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  const safeLimit = Math.min(toNonNegativeInt(opts.limit, 50), 200)
  const safeOffset = toNonNegativeInt(opts.offset, 0)

  return {
    offset: safeOffset,
    limit: safeLimit,
    file: trimOrUndefined(opts.file),
    author: trimOrUndefined(opts.author),
    since: trimOrUndefined(opts.since),
    until: trimOrUndefined(opts.until),
    search: trimOrUndefined(opts.search),
  }
}

function parseGitLogOutput(raw: string): ParsedLogCommit[] {
  if (!raw) return []
  const SEP = '\x1f'
  const REC = '\x1e'
  const rawEntries = raw.split(REC).filter(Boolean)
  return rawEntries.map((record) => {
    const parts = record.trim().split(SEP)
    return {
      fullHash: parts[0] || '',
      hash: parts[1] || '',
      author: parts[2] || '',
      email: parts[3] || '',
      date: parts[4] || '',
      message: parts[5] || '',
    }
  })
}

async function getGitLogPage(cwd: string, options?: GitLogPageOptions) {
  const { offset, limit, file, author, since, until, search } = normalizeGitLogOptions(options)

  const SEP = '\x1f'
  const REC = '\x1e'
  const format = `%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%ai${SEP}%s${REC}`

  const args = ['log', `--pretty=format:${format}`, `--skip=${offset}`, `--max-count=${Math.min(limit + 1, 201)}`]
  if (author) args.push(`--author=${author}`)
  if (since) args.push(`--since=${since}`)
  if (until) args.push(`--until=${until}`)
  if (search) {
    args.push(`--grep=${search}`, '--regexp-ignore-case')
  }
  if (file) {
    args.push('--', file)
  }

  const raw = await runGitOrEmpty(cwd, args)
  const parsed = parseGitLogOutput(raw)
  const hasMore = parsed.length > limit

  return {
    commits: parsed.slice(0, limit),
    hasMore,
  }
}


export function registerGitHandlers() {
  ipcMain.handle('git:status', async (_, cwd: string) => {
    const branch = await runGitOrEmpty(cwd, ['branch', '--show-current'])
    const statusRaw = await runGitOrEmpty(cwd, ['status', '--porcelain'])
    const isRepo = branch !== '' || statusRaw !== ''

    if (!isRepo) {
      const check = await runGitOrEmpty(cwd, ['rev-parse', '--is-inside-work-tree'])
      if (check !== 'true') return { isRepo: false, branch: '', files: [], staged: [], unstaged: [], ahead: 0, behind: 0 }
    }

    const files: { path: string; state: string }[] = []
    const staged: { path: string; state: string }[] = []
    const unstaged: { path: string; state: string }[] = []

    statusRaw
      .split('\n')
      .filter(Boolean)
      .forEach((line) => {
        const x = line[0] // index (staging area) status
        const y = line[1] // working tree status
        const path = line.substring(3)

        // Determine overall state for backward compat
        let state: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed' = 'modified'
        if (x === '?' && y === '?') state = 'untracked'
        else if (x === 'A' || y === 'A') state = 'added'
        else if (x === 'D' || y === 'D') state = 'deleted'
        else if (x === 'R' || y === 'R') state = 'renamed'
        files.push({ path, state })

        // Staged: X has a non-space, non-? value
        if (x !== ' ' && x !== '?') {
          let sState: string = 'modified'
          if (x === 'A') sState = 'added'
          else if (x === 'D') sState = 'deleted'
          else if (x === 'R') sState = 'renamed'
          staged.push({ path, state: sState })
        }

        // Unstaged: Y has a non-space value, or untracked
        if (y !== ' ' || (x === '?' && y === '?')) {
          let uState: string = 'modified'
          if (x === '?' && y === '?') uState = 'untracked'
          else if (y === 'D') uState = 'deleted'
          unstaged.push({ path, state: uState })
        }
      })

    // Get ahead/behind counts
    let ahead = 0, behind = 0
    try {
      const ab = await runGitOrEmpty(cwd, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
      if (ab) {
        const [a, b] = ab.split('\t').map(Number)
        ahead = a || 0
        behind = b || 0
      }
    } catch {}

    return { isRepo: true, branch: branch || 'main', files, staged, unstaged, ahead, behind }
  })

  ipcMain.handle('git:diff', async (_, cwd: string, filePath?: string) => {
    const args = filePath ? ['diff', '--', filePath] : ['diff']
    return await runGitOrEmpty(cwd, args)
  })

  ipcMain.handle('git:log', async (_, cwd: string, count: number = 50) => {
    // Use ASCII record/unit separators to avoid conflicts with commit message content
    const SEP = '\x1f' // unit separator
    const REC = '\x1e' // record separator
    const format = `%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%ai${SEP}%s${REC}`
    const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 50
    const raw = await runGitOrEmpty(cwd, ['log', `--pretty=format:${format}`, `-${safeCount}`])
    if (!raw) return []
    return raw.split(REC).filter(s => s.trim()).map((record) => {
      const parts = record.trim().split(SEP)
      return {
        fullHash: parts[0] || '',
        hash: parts[1] || '',
        author: parts[2] || '',
        email: parts[3] || '',
        date: parts[4] || '',
        message: parts[5] || '',
      }
    })
  })

  ipcMain.handle('git:log-page', async (_, cwd: string, options?: GitLogPageOptions) => {
    return getGitLogPage(cwd, options)
  })

  ipcMain.handle('git:file-log', async (_, cwd: string, options?: GitLogPageOptions) => {
    return getGitLogPage(cwd, options)
  })

  ipcMain.handle('git:diff-commits', async (_, cwd: string, commitA: string, commitB: string) => {
    const safeA = tryNormalizeGitCommitHash(commitA)
    const safeB = tryNormalizeGitCommitHash(commitB)
    if (!safeA || !safeB) return { diff: '', filesChanged: 0 }
    const output = await runGitOrEmpty(cwd, ['diff', `${safeA}..${safeB}`])
    return { diff: output, filesChanged: output ? output.split('\n').filter(Boolean).length : 0 }
  })

  ipcMain.handle('git:blame', async (_, cwd: string, filePath: string) => {
    const raw = await runGitOrEmpty(cwd, ['blame', '--porcelain', filePath], { timeout: 30000, maxBuffer: 1024 * 1024 * 10 })
    if (!raw) return []

    const lines = raw.split('\n')
    const result: { hash: string; author: string; date: string; line: number; content: string }[] = []
    let currentHash = ''
    let currentAuthor = ''
    let currentDate = ''
    let currentLine = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Header line: <hash> <orig-line> <final-line> [<num-lines>]
      const headerMatch = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)/)
      if (headerMatch) {
        currentHash = headerMatch[1]
        currentLine = parseInt(headerMatch[2], 10)
        continue
      }
      if (line.startsWith('author ')) {
        currentAuthor = line.substring(7)
        continue
      }
      if (line.startsWith('author-time ')) {
        const timestamp = parseInt(line.substring(12), 10)
        currentDate = new Date(timestamp * 1000).toISOString()
        continue
      }
      // Content line starts with a tab
      if (line.startsWith('\t')) {
        result.push({
          hash: currentHash.substring(0, 8),
          author: currentAuthor,
          date: currentDate,
          line: currentLine,
          content: line.substring(1),
        })
      }
    }
    return result
  })

  ipcMain.handle('git:show', async (_, cwd: string, hash: string) => {
    const safeHash = tryNormalizeGitCommitHash(hash)
    if (!safeHash) return null

    const SEP = '\x1f'
    const format = `%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%ai${SEP}%s`
    const headerRaw = await runGitOrEmpty(cwd, ['show', safeHash, '--quiet', `--pretty=format:${format}`])
    const statRaw = await runGitOrEmpty(cwd, ['show', safeHash, '--stat', '--format='])

    if (!headerRaw) return null

    const parts = headerRaw.trim().split(SEP)
    const filesChanged: { file: string; changes: string }[] = []
    let summary = ''

    if (statRaw) {
      const statLines = statRaw.trim().split('\n')
      for (const sl of statLines) {
        // Match file stat lines like: " src/file.ts | 10 ++++----"
        const fileMatch = sl.match(/^\s*(.+?)\s+\|\s+(.+)$/)
        if (fileMatch) {
          filesChanged.push({ file: fileMatch[1].trim(), changes: fileMatch[2].trim() })
        }
        // Match summary line like: " 3 files changed, 10 insertions(+), 5 deletions(-)"
        if (sl.match(/\d+\s+file/)) {
          summary = sl.trim()
        }
      }
    }

    return {
      fullHash: parts[0] || '',
      hash: parts[1] || '',
      author: parts[2] || '',
      email: parts[3] || '',
      date: parts[4] || '',
      message: parts[5] || '',
      filesChanged,
      summary,
    }
  })

  ipcMain.handle('git:stage', async (_, cwd: string, filePath: string) => {
    await runGitOrEmpty(cwd, ['add', filePath])
    return true
  })

  ipcMain.handle('git:unstage', async (_, cwd: string, filePath: string) => {
    await runGitOrEmpty(cwd, ['reset', 'HEAD', filePath])
    return true
  })

  ipcMain.handle('git:commit', async (_, cwd: string, message: string, amend = false) => {
    // Pass the message via stdin as the argument value — no shell quoting needed.
    const args = ['commit']
    if (amend) {
      args.push('--amend')
      if (message) {
        args.push('-m', message)
      } else {
        args.push('--no-edit')
      }
    } else {
      args.push('-m', message)
    }
    const result = await runGitOrEmpty(cwd, args)
    return result !== ''
  })

  ipcMain.handle('git:checkout', async (_, cwd: string, branch: string) => {
    return await runGitOrEmpty(cwd, ['checkout', branch])
  })

  ipcMain.handle('git:discard', async (_, cwd: string, filePath: string) => {
    await runGitOrEmpty(cwd, ['checkout', '--', filePath])
    // Also handle untracked files
    await runGitOrEmpty(cwd, ['clean', '-f', '--', filePath])
    return true
  })

  ipcMain.handle('git:branches', async (_, cwd: string) => {
    const raw = await runGitOrEmpty(cwd, ['branch', '-a', '--format=%(refname:short)|%(HEAD)'])
    if (!raw) return []
    return raw.split('\n').filter(Boolean).map((line) => {
      const [name, head] = line.split('|')
      return { name, current: head === '*' }
    })
  })

  // Return parsed diff hunks for a specific file (used for git gutter decorations)
  ipcMain.handle('git:file-diff', async (_, cwd: string, filePath: string) => {
    const raw = await runGitOrEmpty(cwd, ['diff', '-U0', '--', filePath])
    if (!raw) return []

    const hunks: { type: 'added' | 'modified' | 'deleted'; startLine: number; count: number }[] = []
    const lines = raw.split('\n')
    for (const line of lines) {
      // Parse hunk headers like @@ -oldStart,oldCount +newStart,newCount @@
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (match) {
        const oldStart = parseInt(match[1], 10)
        const oldCount = parseInt(match[2] ?? '1', 10)
        const newStart = parseInt(match[3], 10)
        const newCount = parseInt(match[4] ?? '1', 10)

        if (oldCount === 0 && newCount > 0) {
          // Pure addition
          hunks.push({ type: 'added', startLine: newStart, count: newCount })
        } else if (newCount === 0 && oldCount > 0) {
          // Pure deletion
          hunks.push({ type: 'deleted', startLine: newStart, count: 1 })
        } else {
          // Modification (changed lines)
          hunks.push({ type: 'modified', startLine: newStart, count: newCount })
        }
      }
    }
    return hunks
  })

  // Return combined unified diff (staged + unstaged) for a specific file
  ipcMain.handle('git:diff-file', async (_, cwd: string, filePath: string) => {
    // Get unstaged changes
    const unstaged = await runGitOrEmpty(cwd, ['diff', '-U0', '--', filePath])
    // Get staged (cached) changes
    const staged = await runGitOrEmpty(cwd, ['diff', '--cached', '-U0', '--', filePath])

    // Combine both diffs and parse hunks
    const combined = [unstaged, staged].filter(Boolean).join('\n')
    if (!combined) return []

    const hunks: { type: 'added' | 'modified' | 'deleted'; startLine: number; count: number }[] = []
    const lines = combined.split('\n')
    for (const line of lines) {
      const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (match) {
        const oldCount = parseInt(match[2] ?? '1', 10)
        const newStart = parseInt(match[3], 10)
        const newCount = parseInt(match[4] ?? '1', 10)

        if (oldCount === 0 && newCount > 0) {
          hunks.push({ type: 'added', startLine: newStart, count: newCount })
        } else if (newCount === 0 && oldCount > 0) {
          hunks.push({ type: 'deleted', startLine: newStart, count: 1 })
        } else {
          hunks.push({ type: 'modified', startLine: newStart, count: newCount })
        }
      }
    }

    // Deduplicate overlapping hunks (same line ranges from staged + unstaged)
    const seen = new Set<string>()
    return hunks.filter((h) => {
      const key = `${h.type}:${h.startLine}:${h.count}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

  ipcMain.handle('git:push', async (_, cwd: string) => {
    return await runGitOrEmpty(cwd, ['push'])
  })

  ipcMain.handle('git:pull', async (_, cwd: string) => {
    return await runGitOrEmpty(cwd, ['pull'])
  })

  ipcMain.handle('git:fetch', async (_, cwd: string) => {
    return await runGitOrEmpty(cwd, ['fetch', '--all'])
  })

  ipcMain.handle('git:stash', async (_, cwd: string) => {
    return await runGitOrEmpty(cwd, ['stash'])
  })

  ipcMain.handle('git:stash-pop', async (_, cwd: string, rawIndex: unknown) => {
    const safeIndex = resolveGitStashIndex(rawIndex)
    return await runGitOrEmpty(cwd, ['stash', 'pop', `stash@{${safeIndex}}`])
  })

  ipcMain.handle('git:create-branch', async (_, cwd: string, branchName: string) => {
    return await runGitOrEmpty(cwd, ['checkout', '-b', branchName])
  })

  ipcMain.handle('git:stage-all', async (_, cwd: string) => {
    await runGitOrEmpty(cwd, ['add', '-A'])
    return true
  })

  ipcMain.handle('git:unstage-all', async (_, cwd: string) => {
    await runGitOrEmpty(cwd, ['reset', 'HEAD'])
    return true
  })

  ipcMain.handle('git:stash-list', async (_, cwd: string) => {
    const SEP = '\x1f'
    const raw = await runGitOrEmpty(cwd, ['stash', 'list', `--pretty=format:%H${SEP}%s${SEP}%an${SEP}%at${SEP}%gd`])
    if (!raw) return []
    return raw.split('\n').filter(Boolean).map((line, index) => {
      const parts = line.split(SEP)
      const message = parts[1] || `stash@{${index}}`
      const branchMatch = message.match(/^On (.+):/)
      return {
        index,
        hash: (parts[0] || '').substring(0, 8),
        message,
        branch: branchMatch ? branchMatch[1] : '',
        date: parts[3] ? new Date(Number(parts[3]) * 1000).toISOString() : '',
        author: parts[2] || '',
        untracked: false,
      }
    })
  })

  ipcMain.handle('git:stash-drop', async (_, cwd: string, rawIndex: unknown) => {
    const safeIndex = resolveGitStashIndex(rawIndex)
    return await runGitOrEmpty(cwd, ['stash', 'drop', `stash@{${safeIndex}}`])
  })

  ipcMain.handle(
    'git:stash-apply',
    async (_, cwd: string, rawIndex: unknown, rawOptions: unknown) => {
      const options: GitStashApplyOptions =
        rawIndex && typeof rawIndex === 'object' && !Array.isArray(rawIndex) && 'index' in rawIndex && typeof rawOptions !== 'object'
          ? (rawIndex as GitStashApplyOptions)
          : typeof rawOptions === 'object' && rawOptions !== null
            ? (rawOptions as GitStashApplyOptions)
            : {}

      const safeIndexSource = rawIndex && typeof rawIndex === 'object' && !Array.isArray(rawIndex) && 'index' in rawIndex
        ? (rawIndex as { index?: unknown }).index
        : rawIndex

      const safeIndex = resolveGitStashIndex(safeIndexSource)
      const command = options.drop ? 'pop' : 'apply'
      return await runGitOrEmpty(cwd, ['stash', command, `stash@{${safeIndex}}`])
  })

  ipcMain.handle('git:stash-save', async (_, cwd: string, rawMessageOrOptions?: string | GitStashCreateOptions) => {
    const options: GitStashCreateOptions = typeof rawMessageOrOptions === 'object'
      ? rawMessageOrOptions ?? {}
      : { message: rawMessageOrOptions }

    const args = ['stash', 'push']
    appendGitStashCreateArgs(args, options)
    return await runGitOrEmpty(cwd, args)
  })

  ipcMain.handle('git:stash-clear', async (_, cwd: string) => {
    return await runGitOrEmpty(cwd, ['stash', 'clear'])
  })

  ipcMain.handle('git:stash-show', async (_, cwd: string, rawIndex: unknown) => {
    const safeIndex = resolveGitStashIndex(rawIndex)
    const raw = await runGitOrEmpty(cwd, ['stash', 'show', `stash@{${safeIndex}}`, '--name-only', '--patch', '--no-color'])
    if (!raw) return null

    const files: Array<{ path: string; status: 'modified' | 'added' | 'deleted' | 'renamed'; insertions: number; deletions: number }> = []
    const hunks: Array<{ header: string; lines: Array<{ type: 'context' | 'addition' | 'deletion' | 'header'; content: string; oldLineNumber?: number; newLineNumber?: number }> }> = []

    let currentHunk: typeof hunks[number] | null = null
    const lines = raw.split('\n')
    for (const line of lines) {
      if (line.startsWith('diff --git ')) {
        const parts = line.split(' ')
        const right = parts[parts.length - 1] || ''
        const filePath = right.startsWith('b/') ? right.slice(2) : right
        if (filePath) {
          files.push({ path: filePath, status: 'modified', insertions: 0, deletions: 0 })
        }
      } else if (line.startsWith('@@ ')) {
        if (currentHunk) {
          hunks.push(currentHunk)
        }
        currentHunk = { header: line, lines: [] }
      } else if (currentHunk) {
        const type = line.startsWith('+')
          ? 'addition'
          : line.startsWith('-')
            ? 'deletion'
            : line.startsWith('\\')
              ? 'context'
              : 'context'

        currentHunk.lines.push({
          type,
          content: line,
        })
      }
    }
    if (currentHunk) {
      hunks.push(currentHunk)
    }

    return {
      stashId: `stash@{${safeIndex}}`,
      files,
      hunks,
      rawDiff: raw,
    }
  })

  ipcMain.handle('git:stash-branch', async (_, cwd: string, rawIndex: unknown, rawBranch: unknown) => {
    const safeIndex = resolveGitStashIndex(rawIndex)
    const branchName = normalizeGitBranchName(rawBranch as string | undefined)
    return await runGitOrEmpty(cwd, ['stash', 'branch', branchName, `stash@{${safeIndex}}`])
  })

  ipcMain.handle('git:merge-status', async (_, cwd: string) => {
    try {
      // rev-parse --verify MERGE_HEAD exits 0 and prints the hash when a merge
      // is in progress, non-zero (empty) otherwise — no gitDir path needed.
      const mergeHead = await runGitOrEmpty(cwd, ['rev-parse', '--verify', 'MERGE_HEAD'])
      return { merging: mergeHead !== '' }
    } catch {
      return { merging: false }
    }
  })

  ipcMain.handle('git:conflict-files', async (_, cwd: string) => {
    const raw = await runGitOrEmpty(cwd, ['diff', '--name-only', '--diff-filter=U'])
    if (!raw) return []
    return raw.split('\n').filter(Boolean)
  })

  ipcMain.handle('git:merge-abort', async (_, cwd: string) => {
    return await runGitOrEmpty(cwd, ['merge', '--abort'])
  })

  // ── Cherry-pick ──────────────────────────────────────────────────────

  ipcMain.handle('git:merge', async (_, cwd: string, branchName: string) => {
    try {
      const safeBranchName = normalizeGitBranchName(branchName)
      return await runGitExec(cwd, ['merge', safeBranchName])
    } catch (err: any) {
      throw new Error(gitErrorMessage(err))
    }
  })

  ipcMain.handle('git:delete-branch', async (_, cwd: string, branchName: string) => {
    try {
      const safeBranchName = normalizeGitBranchName(branchName)
      return await runGitExec(cwd, ['branch', '-d', safeBranchName])
    } catch (err: any) {
      throw new Error(gitErrorMessage(err))
    }
  })

  ipcMain.handle('git:cherry-pick', async (_, cwd: string, commitHash: string, options?: GitSequencerOptions) => {
    try {
      const safeHash = normalizeGitCommitHash(commitHash)
      const args = ['cherry-pick']
      appendGitSequencerOptions(args, options)
      args.push(safeHash)
      return await runGitExec(cwd, args)
    } catch (err: any) {
      throw new Error(gitErrorMessage(err))
    }
  })

  // ── Revert ───────────────────────────────────────────────────────────

  ipcMain.handle('git:revert', async (_, cwd: string, commitHash: string, options?: GitSequencerOptions) => {
    try {
      const safeHash = normalizeGitCommitHash(commitHash)
      const args = ['revert']
      if (!options?.noCommit) {
        args.push('--no-edit')
      }
      appendGitSequencerOptions(args, options)
      args.push(safeHash)
      const result = await runGitExec(cwd, args)
      return { success: true, output: result }
    } catch (err: any) {
      return { success: false, error: gitErrorMessage(err) }
    }
  })

  // ── Interactive rebase status ────────────────────────────────────────

  ipcMain.handle('git:rebase-status', async (_, cwd: string) => {
    try {
      const gitDir = await runGitExec(cwd, ['rev-parse', '--git-dir'])
      if (!gitDir) return { rebasing: false }

      // Validate that the resolved gitDir is inside the workspace before any
      // filesystem reads. git rev-parse --git-dir returns an absolute path for
      // linked worktrees, which would otherwise silently escape the workspace.
      let rebaseMergePath: string
      let rebaseApplyPath: string
      try {
        rebaseMergePath = await resolveGitInternalPath(cwd, gitDir, 'rebase-merge')
        rebaseApplyPath = await resolveGitInternalPath(cwd, gitDir, 'rebase-apply')
      } catch {
        // gitDir resolves outside the workspace (linked worktree). Fall back to
        // a pure git command for detection without step-count detail.
        const rebaseHead = await runGitOrEmpty(cwd, ['rev-parse', '--verify', 'REBASE_HEAD'])
        return { rebasing: rebaseHead !== '', currentStep: 0, totalSteps: 0, headName: '' }
      }

      const isRebasing = fs.existsSync(rebaseMergePath) || fs.existsSync(rebaseApplyPath)
      if (!isRebasing) return { rebasing: false }

      const activeDir = fs.existsSync(rebaseMergePath) ? rebaseMergePath : rebaseApplyPath

      let currentStep = 0
      let totalSteps = 0
      let headName = ''

      const msgNumPath = path.join(activeDir, 'msgnum')
      const endPath = path.join(activeDir, 'end')
      const headNamePath = path.join(activeDir, 'head-name')

      if (fs.existsSync(msgNumPath)) {
        currentStep = parseInt(fs.readFileSync(msgNumPath, 'utf-8').trim(), 10) || 0
      }
      if (fs.existsSync(endPath)) {
        totalSteps = parseInt(fs.readFileSync(endPath, 'utf-8').trim(), 10) || 0
      }
      if (fs.existsSync(headNamePath)) {
        headName = fs.readFileSync(headNamePath, 'utf-8').trim().replace(/^refs\/heads\//, '')
      }

      return { rebasing: true, currentStep, totalSteps, headName }
    } catch {
      return { rebasing: false }
    }
  })

  // ── Tags ─────────────────────────────────────────────────────────────

  ipcMain.handle('git:tags', async (_, cwd: string) => {
    try {
      const raw = await runGitExec(cwd, ['tag', '--sort=-creatordate', `--format=${GIT_TAG_FORMAT}`])
      if (!raw) return []
      return raw.split('\n').filter(Boolean).map(parseGitTagLine)
    } catch {
      return []
    }
  })

  ipcMain.handle('git:create-tag', async (_, cwd: string, tagName: string, message?: string, commitHash?: string) => {
    try {
      const args = ['tag']
      if (message) {
        args.push('-a', tagName, '-m', message)
      } else {
        args.push(tagName)
      }
      if (commitHash) {
        const safeHash = tryNormalizeGitCommitHash(commitHash)
        if (safeHash) args.push(safeHash)
      }
      await runGitExec(cwd, args)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })

  ipcMain.handle('git:delete-tag', async (_, cwd: string, tagName: string) => {
    try {
      await runGitExec(cwd, ['tag', '-d', tagName])
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })

  // ── Remote management ────────────────────────────────────────────────

  ipcMain.handle('git:remotes', async (_, cwd: string) => {
    try {
      const raw = await runGitExec(cwd, ['remote', '-v'])
      if (!raw) return []
      const remotes = new Map<string, { name: string; fetchUrl: string; pushUrl: string }>()
      raw.split('\n').filter(Boolean).forEach((line) => {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/)
        if (match) {
          const [, name, url, type] = match
          if (!remotes.has(name)) {
            remotes.set(name, { name, fetchUrl: '', pushUrl: '' })
          }
          const entry = remotes.get(name)!
          if (type === 'fetch') entry.fetchUrl = url
          else entry.pushUrl = url
        }
      })
      return Array.from(remotes.values())
    } catch {
      return []
    }
  })

  ipcMain.handle('git:add-remote', async (_, cwd: string, name: string, url: string) => {
    try {
      await runGitExec(cwd, ['remote', 'add', name, url])
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })

  ipcMain.handle('git:remove-remote', async (_, cwd: string, name: string) => {
    try {
      await runGitExec(cwd, ['remote', 'remove', name])
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })

  // ── Git config ───────────────────────────────────────────────────────

  ipcMain.handle('git:config-get', async (_, cwd: string, key: string, scope?: 'local' | 'global' | 'system') => {
    try {
      const args = ['config']
      if (scope) args.push(`--${scope}`)
      args.push('--get', key)
      const value = await runGitExec(cwd, args)
      return { success: true, value }
    } catch (err: any) {
      // Exit code 1 means key not found, which is not really an error
      return { success: false, value: null, error: err.stderr?.trim() || err.message }
    }
  })

  ipcMain.handle('git:config-set', async (_, cwd: string, key: string, value: string, scope?: 'local' | 'global') => {
    try {
      const args = ['config']
      if (scope) args.push(`--${scope}`)
      args.push(key, value)
      await runGitExec(cwd, args)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })

  // ── Worktree ─────────────────────────────────────────────────────────

  ipcMain.handle('git:worktree-list', async (_, cwd: string) => {
    try {
      const raw = await runGitExec(cwd, ['worktree', 'list', '--porcelain'])
      if (!raw) return []

      const worktrees: { path: string; head: string; branch: string; bare: boolean }[] = []
      let current: { path: string; head: string; branch: string; bare: boolean } = { path: '', head: '', branch: '', bare: false }

      for (const line of raw.split('\n')) {
        if (line.startsWith('worktree ')) {
          current = { path: line.substring(9), head: '', branch: '', bare: false }
        } else if (line.startsWith('HEAD ')) {
          current.head = line.substring(5)
        } else if (line.startsWith('branch ')) {
          current.branch = line.substring(7).replace(/^refs\/heads\//, '')
        } else if (line === 'bare') {
          current.bare = true
        } else if (line === '') {
          if (current.path) worktrees.push({ ...current })
        }
      }
      // Push last entry if file doesn't end with blank line
      if (current.path && !worktrees.find((w) => w.path === current.path)) {
        worktrees.push({ ...current })
      }

      return worktrees
    } catch {
      return []
    }
  })

  // ── Submodules ───────────────────────────────────────────────────────

  ipcMain.handle('git:submodule-status', async (_, cwd: string) => {
    try {
      const raw = await runGitExec(cwd, ['submodule', 'status'])
      if (!raw) return []

      return raw.split('\n').filter(Boolean).map((line) => {
        // Format: [+-U ]<sha1> <path> [(describe)]
        const match = line.match(/^([+-U ]?)([0-9a-f]+)\s+(\S+)(?:\s+\((.+)\))?$/)
        if (!match) return null
        const [, statusChar, hash, subPath, describe] = match
        let status = 'initialized'
        if (statusChar === '-') status = 'uninitialized'
        else if (statusChar === '+') status = 'out-of-date'
        else if (statusChar === 'U') status = 'merge-conflict'
        return { path: subPath, hash: hash.substring(0, 8), status, describe: describe || '' }
      }).filter(Boolean)
    } catch {
      return []
    }
  })

  // ── Git ignore ───────────────────────────────────────────────────────

  ipcMain.handle('git:check-ignored', async (_, cwd: string, filePaths: string[]) => {
    if (!filePaths || filePaths.length === 0) return []
    try {
      const result = await runGitExec(cwd, ['check-ignore', ...filePaths])
      return result.split('\n').filter(Boolean)
    } catch {
      // Exit code 1 means no files are ignored, which is expected
      return []
    }
  })

  // ── Commit amend ─────────────────────────────────────────────────────

  ipcMain.handle('git:commit-amend', async (_, cwd: string, message?: string) => {
    try {
      const args = ['commit', '--amend']
      if (message) {
        args.push('-m', message)
      } else {
        args.push('--no-edit')
      }
      const result = await runGitExec(cwd, args)
      return { success: true, output: result }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })

  // ── Reset ────────────────────────────────────────────────────────────

  ipcMain.handle('git:reset', async (_, cwd: string, mode: 'soft' | 'mixed' | 'hard', ref?: string) => {
    const validModes = ['soft', 'mixed', 'hard']
    if (!validModes.includes(mode)) {
      return { success: false, error: `Invalid reset mode: ${mode}` }
    }
    try {
      const args = ['reset', `--${mode}`]
      if (ref) {
        // Sanitize ref: allow hex, branch names, HEAD~N, etc.
        const safeRef = ref.replace(/[;&|`$(){}]/g, '')
        if (safeRef) args.push(safeRef)
      }
      const result = await runGitExec(cwd, args)
      return { success: true, output: result }
    } catch (err: any) {
      return { success: false, error: err.stderr?.trim() || err.message }
    }
  })

  // ── Clean ────────────────────────────────────────────────────────────

  ipcMain.handle('git:clean', async (_, cwd: string, options?: { directories?: boolean; force?: boolean; dryRun?: boolean; ignored?: boolean }) => {
    try {
      const args = ['clean']
      if (options?.dryRun) {
        args.push('-n')
      } else {
        if (options?.force === false) {
          return { success: true, removedFiles: [] }
        }
        args.push('-f')
      }
      if (options?.directories) {
        args.push('-d')
      }
      if (options?.ignored) {
        args.push('-x')
      }
      const result = await runGitExec(cwd, args)
      const removedFiles = result.split('\n').filter(Boolean).map((line) => {
        // Lines look like "Removing path/to/file" or "Would remove path/to/file"
        return line.replace(/^(Removing|Would remove)\s+/, '')
      })
      return { success: true, removedFiles }
    } catch (err: any) {
      return { success: false, error: gitErrorMessage(err), removedFiles: [] }
    }
  })
}
