import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'

const execAsync = promisify(exec)

async function runGit(cwd: string, args: string, options?: { timeout?: number; maxBuffer?: number }): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ${args}`, {
      cwd,
      timeout: options?.timeout ?? 10000,
      maxBuffer: options?.maxBuffer ?? 1024 * 1024 * 5, // 5MB default
    })
    return stdout.trim()
  } catch (err: any) {
    if (err.stderr) return ''
    return ''
  }
}

export function registerGitHandlers() {
  ipcMain.handle('git:status', async (_, cwd: string) => {
    const branch = await runGit(cwd, 'branch --show-current')
    const statusRaw = await runGit(cwd, 'status --porcelain')
    const isRepo = branch !== '' || statusRaw !== ''

    if (!isRepo) {
      const check = await runGit(cwd, 'rev-parse --is-inside-work-tree')
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
      const ab = await runGit(cwd, 'rev-list --left-right --count HEAD...@{upstream}')
      if (ab) {
        const [a, b] = ab.split('\t').map(Number)
        ahead = a || 0
        behind = b || 0
      }
    } catch {}

    return { isRepo: true, branch: branch || 'main', files, staged, unstaged, ahead, behind }
  })

  ipcMain.handle('git:diff', async (_, cwd: string, filePath?: string) => {
    const args = filePath ? `diff -- "${filePath}"` : 'diff'
    return await runGit(cwd, args)
  })

  ipcMain.handle('git:log', async (_, cwd: string, count: number = 50) => {
    // Use ASCII record/unit separators to avoid conflicts with commit message content
    const SEP = '\x1f' // unit separator
    const REC = '\x1e' // record separator
    const format = `%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%ai${SEP}%s${REC}`
    const raw = await runGit(cwd, `log --pretty=format:"${format}" -${count}`)
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

  ipcMain.handle('git:blame', async (_, cwd: string, filePath: string) => {
    const raw = await runGit(cwd, `blame --porcelain "${filePath}"`, { timeout: 30000, maxBuffer: 1024 * 1024 * 10 })
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
    // Sanitize hash - only allow hex chars
    const safeHash = hash.replace(/[^0-9a-fA-F]/g, '')
    if (!safeHash) return null

    const SEP = '\x1f'
    const format = `%H${SEP}%h${SEP}%an${SEP}%ae${SEP}%ai${SEP}%s`
    const headerRaw = await runGit(cwd, `show ${safeHash} --quiet --pretty=format:"${format}"`)
    const statRaw = await runGit(cwd, `show ${safeHash} --stat --format=""`)

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
    await runGit(cwd, `add "${filePath}"`)
    return true
  })

  ipcMain.handle('git:unstage', async (_, cwd: string, filePath: string) => {
    await runGit(cwd, `reset HEAD "${filePath}"`)
    return true
  })

  ipcMain.handle('git:commit', async (_, cwd: string, message: string) => {
    const result = await runGit(cwd, `commit -m "${message.replace(/"/g, '\\"')}"`)
    return result !== ''
  })

  ipcMain.handle('git:checkout', async (_, cwd: string, branch: string) => {
    return await runGit(cwd, `checkout "${branch}"`)
  })

  ipcMain.handle('git:discard', async (_, cwd: string, filePath: string) => {
    await runGit(cwd, `checkout -- "${filePath}"`)
    // Also handle untracked files
    await runGit(cwd, `clean -f -- "${filePath}"`)
    return true
  })

  ipcMain.handle('git:branches', async (_, cwd: string) => {
    const raw = await runGit(cwd, 'branch -a --format="%(refname:short)|%(HEAD)"')
    if (!raw) return []
    return raw.split('\n').filter(Boolean).map((line) => {
      const [name, head] = line.split('|')
      return { name, current: head === '*' }
    })
  })

  // Return parsed diff hunks for a specific file (used for git gutter decorations)
  ipcMain.handle('git:file-diff', async (_, cwd: string, filePath: string) => {
    const raw = await runGit(cwd, `diff -U0 -- "${filePath}"`)
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
    const unstaged = await runGit(cwd, `diff -U0 -- "${filePath}"`)
    // Get staged (cached) changes
    const staged = await runGit(cwd, `diff --cached -U0 -- "${filePath}"`)

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
    const result = await runGit(cwd, 'push')
    return result
  })

  ipcMain.handle('git:pull', async (_, cwd: string) => {
    const result = await runGit(cwd, 'pull')
    return result
  })

  ipcMain.handle('git:fetch', async (_, cwd: string) => {
    const result = await runGit(cwd, 'fetch --all')
    return result
  })

  ipcMain.handle('git:stash', async (_, cwd: string) => {
    const result = await runGit(cwd, 'stash')
    return result
  })

  ipcMain.handle('git:stash-pop', async (_, cwd: string) => {
    const result = await runGit(cwd, 'stash pop')
    return result
  })

  ipcMain.handle('git:create-branch', async (_, cwd: string, branchName: string) => {
    const result = await runGit(cwd, `checkout -b "${branchName}"`)
    return result
  })

  ipcMain.handle('git:stage-all', async (_, cwd: string) => {
    await runGit(cwd, 'add -A')
    return true
  })

  ipcMain.handle('git:unstage-all', async (_, cwd: string) => {
    await runGit(cwd, 'reset HEAD')
    return true
  })

  ipcMain.handle('git:stash-list', async (_, cwd: string) => {
    const SEP = '\x1f'
    const raw = await runGit(cwd, `stash list --pretty=format:"%H${SEP}%s"`)
    if (!raw) return []
    return raw.split('\n').filter(Boolean).map((line, index) => {
      const parts = line.split(SEP)
      return {
        index,
        hash: (parts[0] || '').substring(0, 8),
        message: parts[1] || `stash@{${index}}`,
      }
    })
  })

  ipcMain.handle('git:stash-drop', async (_, cwd: string, index: number) => {
    const result = await runGit(cwd, `stash drop stash@{${index}}`)
    return result
  })

  ipcMain.handle('git:stash-apply', async (_, cwd: string, index: number) => {
    const result = await runGit(cwd, `stash apply stash@{${index}}`)
    return result
  })

  ipcMain.handle('git:stash-save', async (_, cwd: string, message: string) => {
    const safeMsg = message.replace(/"/g, '\\"')
    const result = await runGit(cwd, `stash push -m "${safeMsg}"`)
    return result
  })

  ipcMain.handle('git:merge-status', async (_, cwd: string) => {
    try {
      // Check for .git/MERGE_HEAD to detect active merge
      const gitDir = await runGit(cwd, 'rev-parse --git-dir')
      if (!gitDir) return { merging: false }
      const mergeHeadPath = path.resolve(cwd, gitDir, 'MERGE_HEAD')
      const exists = fs.existsSync(mergeHeadPath)
      return { merging: exists }
    } catch {
      return { merging: false }
    }
  })

  ipcMain.handle('git:conflict-files', async (_, cwd: string) => {
    const raw = await runGit(cwd, 'diff --name-only --diff-filter=U')
    if (!raw) return []
    return raw.split('\n').filter(Boolean)
  })

  ipcMain.handle('git:merge-abort', async (_, cwd: string) => {
    const result = await runGit(cwd, 'merge --abort')
    return result
  })
}
