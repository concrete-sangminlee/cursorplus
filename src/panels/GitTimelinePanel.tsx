import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  GitCommit, GitBranch, GitMerge, Tag, User, Clock, Copy, Check,
  Search, Filter, ChevronDown, ChevronUp, FileText, X,
  RotateCcw, ChevronsUp, Eye, ArrowRightLeft, Calendar, Hash,
  RefreshCw, Download, Loader,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineCommit {
  hash: string
  shortHash: string
  message: string
  body?: string
  author: string
  authorEmail: string
  date: string
  timestamp: number
  parents: string[]
  refs: string[]
  branch?: string
  filesChanged?: ChangedFile[]
  insertions?: number
  deletions?: number
  isMerge?: boolean
  avatarUrl?: string
}

interface ChangedFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied'
  additions: number
  deletions: number
  oldPath?: string
}

interface GraphNode {
  column: number
  color: string
  isNode: boolean
  isMerge: boolean
  connections: GraphConnection[]
}

interface GraphConnection {
  fromCol: number
  toCol: number
  color: string
  type: 'straight' | 'merge-in' | 'branch-out'
}

interface FilterState {
  author: string
  dateFrom: string
  dateTo: string
  messageSearch: string
}

interface CompareState {
  commitA: string | null
  commitB: string | null
}

type ViewMode = 'repo' | 'file'
type SortOrder = 'newest' | 'oldest' | 'topo'

// ─── Constants ──────────────────────────────────────────────────────────────

const RAIL_COLORS = [
  '#58a6ff', '#3fb950', '#d2a8ff', '#f0883e',
  '#f778ba', '#79c0ff', '#d29922', '#56d4dd',
  '#ff7b72', '#7ee787', '#e3b341', '#bc8cff',
]

const STATUS_COLORS: Record<string, string> = {
  modified: '#d29922',
  added: '#3fb950',
  deleted: '#f85149',
  renamed: '#d2a8ff',
  copied: '#79c0ff',
}

const STATUS_LETTERS: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  copied: 'C',
}

const PAGE_SIZE = 50

const MOCK_AUTHORS = [
  { name: 'Alice Chen', email: 'alice.chen@example.com' },
  { name: 'Bob Martinez', email: 'bob.martinez@example.com' },
  { name: 'Carol Williams', email: 'carol.w@example.com' },
  { name: 'David Kim', email: 'david.kim@example.com' },
  { name: 'Eva Johnson', email: 'eva.j@example.com' },
  { name: 'Frank Li', email: 'frank.li@example.com' },
  { name: 'Grace Patel', email: 'grace.p@example.com' },
  { name: 'Henry Zhou', email: 'henry.z@example.com' },
]

const MOCK_MESSAGES = [
  'feat: add user authentication flow',
  'fix: resolve null pointer in data parser',
  'refactor: extract common utilities into shared module',
  'chore: update dependencies to latest versions',
  'docs: add API documentation for endpoints',
  'style: format code with prettier config',
  'perf: optimize database query for user lookup',
  'feat: implement real-time notification system',
  'fix: handle edge case in date formatting',
  'refactor: simplify state management logic',
  'feat: add dark mode toggle support',
  'fix: correct off-by-one error in pagination',
  'feat: implement file drag-and-drop upload',
  'fix: prevent memory leak in event listeners',
  'feat: add keyboard shortcuts for navigation',
  'fix: resolve race condition in async handler',
  'perf: lazy load heavy components',
  'feat: implement search with fuzzy matching',
]

const MOCK_BRANCHES = ['main', 'develop', 'feature/auth', 'feature/ui-redesign', 'fix/memory-leak']

const MOCK_FILES = [
  'src/components/App.tsx', 'src/store/auth.ts', 'src/utils/format.ts',
  'src/panels/EditorPanel.tsx', 'package.json', 'tsconfig.json',
  'src/hooks/useDebounce.ts', 'src/services/api.ts', 'README.md',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateMockHash(): string {
  const chars = '0123456789abcdef'
  let hash = ''
  for (let i = 0; i < 40; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)]
  }
  return hash
}

function generateMockCommits(count: number, offset: number = 0): TimelineCommit[] {
  const commits: TimelineCommit[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const idx = offset + i
    const hash = generateMockHash()
    const author = MOCK_AUTHORS[idx % MOCK_AUTHORS.length]
    const message = MOCK_MESSAGES[idx % MOCK_MESSAGES.length]
    const timestamp = now - (idx * 3600000 * (1 + Math.random() * 5))
    const isMerge = idx % 7 === 0 && idx > 0
    const parents = isMerge
      ? [generateMockHash(), generateMockHash()]
      : idx < count - 1 ? [generateMockHash()] : []

    const refs: string[] = []
    if (idx === 0) refs.push('HEAD -> main', 'origin/main')
    if (idx === 3) refs.push('develop', 'origin/develop')
    if (idx === 5) refs.push('feature/auth')
    if (idx === 8) refs.push('tag: v2.0.0-rc.1')
    if (idx === 15) refs.push('tag: v1.2.0')
    if (idx === 22) refs.push('feature/ui-redesign')
    if (idx === 30) refs.push('tag: v1.1.0')
    if (idx === 40) refs.push('tag: v1.0.0', 'release/v2.0')

    const fileCount = 1 + Math.floor(Math.random() * 6)
    const filesChanged: ChangedFile[] = []
    const usedFiles = new Set<number>()
    for (let f = 0; f < fileCount; f++) {
      let fileIdx: number
      do { fileIdx = Math.floor(Math.random() * MOCK_FILES.length) } while (usedFiles.has(fileIdx))
      usedFiles.add(fileIdx)
      const statuses: ChangedFile['status'][] = ['modified', 'added', 'deleted', 'renamed']
      filesChanged.push({
        path: MOCK_FILES[fileIdx],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        additions: Math.floor(Math.random() * 120),
        deletions: Math.floor(Math.random() * 80),
      })
    }

    const insertions = filesChanged.reduce((s, f) => s + f.additions, 0)
    const deletions = filesChanged.reduce((s, f) => s + f.deletions, 0)

    commits.push({
      hash,
      shortHash: hash.substring(0, 7),
      message: isMerge ? `Merge branch '${MOCK_BRANCHES[idx % MOCK_BRANCHES.length]}' into main` : message,
      body: idx % 4 === 0 ? `Detailed description for commit.\n\nThis change includes several improvements:\n- Updated core logic\n- Added new tests\n- Fixed edge cases\n\nCloses #${100 + idx}` : undefined,
      author: author.name,
      authorEmail: author.email,
      date: new Date(timestamp).toISOString(),
      timestamp,
      parents,
      refs,
      branch: MOCK_BRANCHES[idx % MOCK_BRANCHES.length],
      filesChanged,
      insertions,
      deletions,
      isMerge,
    })
  }

  return commits
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)
  const diffYear = Math.floor(diffDay / 365)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffWeek < 5) return `${diffWeek}w ago`
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${diffYear}y ago`
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function getAuthorInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

function getAuthorColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return RAIL_COLORS[Math.abs(hash) % RAIL_COLORS.length]
}

function hoverProps(
  normalBg: string, hoverBg: string,
  normalColor?: string, hoverColor?: string,
) {
  return {
    onMouseEnter: (e: React.MouseEvent) => {
      const t = e.currentTarget as HTMLElement
      t.style.backgroundColor = hoverBg
      if (hoverColor) t.style.color = hoverColor
    },
    onMouseLeave: (e: React.MouseEvent) => {
      const t = e.currentTarget as HTMLElement
      t.style.backgroundColor = normalBg
      if (normalColor) t.style.color = normalColor
    },
  }
}

function getCommitTypeColor(message: string): string {
  if (message.startsWith('feat')) return '#3fb950'
  if (message.startsWith('fix')) return '#f85149'
  if (message.startsWith('refactor')) return '#d2a8ff'
  if (message.startsWith('perf')) return '#7ee787'
  if (message.startsWith('docs')) return '#388bfd'
  if (message.startsWith('chore')) return '#8b949e'
  if (message.startsWith('style')) return '#f78166'
  if (message.startsWith('test')) return '#d29922'
  if (message.startsWith('ci')) return '#a5d6ff'
  if (message.startsWith('Merge')) return '#d2a8ff'
  return '#8b949e'
}

// ─── Graph Layout Engine ────────────────────────────────────────────────────

interface GraphLayoutResult {
  nodes: GraphNode[]
  maxColumns: number
}

function computeGraphLayout(commits: TimelineCommit[]): GraphLayoutResult {
  const nodes: GraphNode[] = []
  const activeLanes: (string | null)[] = []
  let maxColumns = 0

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const connections: GraphConnection[] = []

    // Find or allocate lane for this commit
    let col = activeLanes.indexOf(commit.hash)
    if (col === -1) {
      col = activeLanes.indexOf(null)
      if (col === -1) {
        col = activeLanes.length
        activeLanes.push(null)
      }
    }
    activeLanes[col] = null

    const color = RAIL_COLORS[col % RAIL_COLORS.length]

    // Draw continuation lines for other active lanes
    for (let lane = 0; lane < activeLanes.length; lane++) {
      if (activeLanes[lane] !== null && lane !== col) {
        connections.push({
          fromCol: lane,
          toCol: lane,
          color: RAIL_COLORS[lane % RAIL_COLORS.length],
          type: 'straight',
        })
      }
    }

    // Place parents into lanes
    if (commit.parents.length > 0) {
      // First parent continues in same lane
      activeLanes[col] = commit.parents[0]
      connections.push({
        fromCol: col,
        toCol: col,
        color,
        type: 'straight',
      })

      // Additional parents (merge)
      for (let p = 1; p < commit.parents.length; p++) {
        const parentHash = commit.parents[p]
        let parentLane = activeLanes.indexOf(parentHash)
        if (parentLane === -1) {
          parentLane = activeLanes.indexOf(null)
          if (parentLane === -1) {
            parentLane = activeLanes.length
            activeLanes.push(null)
          }
          activeLanes[parentLane] = parentHash
        }
        connections.push({
          fromCol: col,
          toCol: parentLane,
          color: RAIL_COLORS[parentLane % RAIL_COLORS.length],
          type: 'merge-in',
        })
      }
    }

    maxColumns = Math.max(maxColumns, activeLanes.length)

    nodes.push({
      column: col,
      color,
      isNode: true,
      isMerge: commit.isMerge || false,
      connections,
    })
  }

  return { nodes, maxColumns: Math.max(maxColumns, 1) }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: 'var(--vscode-sideBar-background, #1e1e2e)',
    color: 'var(--vscode-foreground, #e1e4e8)',
    fontFamily: 'var(--vscode-font-family, "Segoe UI", system-ui, sans-serif)',
    fontSize: '12px',
    userSelect: 'none' as const,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.1))',
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  headerTitle: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--vscode-sideBarSectionHeader-foreground, #c9d1d9)',
  },
  modeToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: '4px',
    padding: '2px',
  },
  modeButton: (active: boolean) => ({
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: active ? 600 : 400,
    borderRadius: '3px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: active ? 'rgba(88,166,255,0.15)' : 'transparent',
    color: active ? '#58a6ff' : 'var(--vscode-descriptionForeground, #8b949e)',
    transition: 'all 0.15s',
  }),
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  iconButton: (active?: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: active ? 'rgba(88,166,255,0.12)' : 'transparent',
    color: active ? '#58a6ff' : 'var(--vscode-descriptionForeground, #8b949e)',
    transition: 'all 0.12s',
  }),
  filterBar: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '8px 12px',
    borderBottom: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.1))',
    backgroundColor: 'rgba(255,255,255,0.02)',
    flexShrink: 0,
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  filterInput: {
    flex: 1,
    backgroundColor: 'var(--vscode-input-background, rgba(255,255,255,0.06))',
    border: '1px solid var(--vscode-input-border, rgba(255,255,255,0.1))',
    borderRadius: '4px',
    color: 'var(--vscode-input-foreground, #e1e4e8)',
    fontSize: '11px',
    padding: '4px 8px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  dateInput: {
    backgroundColor: 'var(--vscode-input-background, rgba(255,255,255,0.06))',
    border: '1px solid var(--vscode-input-border, rgba(255,255,255,0.1))',
    borderRadius: '4px',
    color: 'var(--vscode-input-foreground, #e1e4e8)',
    fontSize: '10px',
    padding: '3px 6px',
    outline: 'none',
    fontFamily: 'inherit',
    width: '120px',
    colorScheme: 'dark',
  },
  filterLabel: {
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
    minWidth: '40px',
  },
  compareBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderBottom: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.1))',
    backgroundColor: 'rgba(88,166,255,0.04)',
    flexShrink: 0,
    fontSize: '11px',
  },
  compareBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 6px',
    borderRadius: '3px',
    backgroundColor: 'rgba(88,166,255,0.12)',
    color: '#58a6ff',
    fontSize: '10px',
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto' as const,
    overflowX: 'hidden' as const,
    position: 'relative' as const,
  },
  commitRow: (selected: boolean, focused: boolean) => ({
    display: 'flex',
    alignItems: 'stretch',
    minHeight: '42px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    backgroundColor: selected
      ? 'rgba(88,166,255,0.08)'
      : focused
        ? 'rgba(255,255,255,0.03)'
        : 'transparent',
    transition: 'background-color 0.1s',
    outline: 'none',
  }),
  graphColumn: (width: number) => ({
    width: `${width}px`,
    minWidth: `${width}px`,
    flexShrink: 0,
    position: 'relative' as const,
    overflow: 'hidden' as const,
  }),
  infoColumn: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    justifyContent: 'center',
    padding: '4px 10px 4px 4px',
    gap: '2px',
  },
  topRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  commitMessage: {
    flex: 1,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '12px',
    color: 'var(--vscode-foreground, #e1e4e8)',
    fontWeight: 500,
  },
  bottomRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
  },
  avatar: (color: string) => ({
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '8px',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: color,
    flexShrink: 0,
    letterSpacing: '-0.5px',
  }),
  refBadge: (type: 'branch' | 'tag' | 'head' | 'remote') => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '1px 5px',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 500,
    lineHeight: '16px',
    flexShrink: 0,
    ...(type === 'head'
      ? { backgroundColor: 'rgba(88,166,255,0.15)', color: '#58a6ff', border: '1px solid rgba(88,166,255,0.3)' }
      : type === 'tag'
        ? { backgroundColor: 'rgba(210,169,34,0.12)', color: '#d29922', border: '1px solid rgba(210,169,34,0.25)' }
        : type === 'remote'
          ? { backgroundColor: 'rgba(139,148,158,0.1)', color: '#8b949e', border: '1px solid rgba(139,148,158,0.2)' }
          : { backgroundColor: 'rgba(63,185,80,0.12)', color: '#3fb950', border: '1px solid rgba(63,185,80,0.25)' }),
  }),
  hashBadge: {
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: '1px 4px',
    borderRadius: '3px',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'color 0.12s',
  },
  metaText: {
    fontSize: '11px',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
    whiteSpace: 'nowrap' as const,
  },
  expandedDetail: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: '10px 12px 10px 36px',
  },
  detailSection: {
    marginBottom: '10px',
  },
  detailLabel: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
    marginBottom: '4px',
  },
  detailBody: {
    fontSize: '12px',
    color: 'var(--vscode-foreground, #e1e4e8)',
    whiteSpace: 'pre-wrap' as const,
    lineHeight: '1.5',
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '3px 0',
    fontSize: '11px',
    cursor: 'pointer',
  },
  fileStatusBadge: (color: string) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    borderRadius: '3px',
    fontSize: '9px',
    fontWeight: 700,
    color: '#fff',
    backgroundColor: `${color}33`,
    border: `1px solid ${color}55`,
    flexShrink: 0,
  }),
  diffStat: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    marginLeft: 'auto',
    fontSize: '10px',
    fontFamily: '"Cascadia Code", "Fira Code", monospace',
    flexShrink: 0,
  },
  diffBar: {
    display: 'flex',
    height: '4px',
    borderRadius: '2px',
    overflow: 'hidden',
    width: '40px',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255,255,255,0.1)',
    backgroundColor: 'transparent',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
    fontSize: '10px',
    cursor: 'pointer',
    transition: 'all 0.12s',
  },
  loadMoreBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    gap: '6px',
    cursor: 'pointer',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
    fontSize: '11px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    transition: 'background 0.12s',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    gap: '12px',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
  },
  contextMenu: {
    position: 'fixed' as const,
    backgroundColor: 'var(--vscode-menu-background, #252536)',
    border: '1px solid var(--vscode-menu-border, rgba(255,255,255,0.12))',
    borderRadius: '6px',
    padding: '4px 0',
    minWidth: '180px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 10000,
    fontSize: '12px',
  },
  contextMenuItem: (danger?: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    cursor: 'pointer',
    color: danger ? '#f85149' : 'var(--vscode-menu-foreground, #e1e4e8)',
    transition: 'background 0.1s',
  }),
  contextMenuSeparator: {
    height: '1px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    margin: '4px 0',
  },
  statusBarBottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    borderTop: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.1))',
    fontSize: '10px',
    color: 'var(--vscode-descriptionForeground, #8b949e)',
    flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
}

// ─── Filter chip helper ─────────────────────────────────────────────────────

function FilterChip({ color, icon, label, onClear }: {
  color: string; icon: React.ReactNode; label: string; onClear?: () => void
}) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '1px 6px', borderRadius: '8px',
      backgroundColor: `${color}1a`, color, fontSize: '10px',
    }}>
      {icon} {label}
      {onClear && <X size={9} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={onClear} />}
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function GitTimelinePanel() {
  // ── State ──
  const [viewMode, setViewMode] = useState<ViewMode>('repo')
  const [commits, setCommits] = useState<TimelineCommit[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [expandedHash, setExpandedHash] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>({
    author: '',
    dateFrom: '',
    dateTo: '',
    messageSearch: '',
  })
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [compareMode, setCompareMode] = useState(false)
  const [compare, setCompare] = useState<CompareState>({ commitA: null, commitB: null })
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hash: string } | null>(null)
  const [activeFile, setActiveFile] = useState<string | null>('src/components/App.tsx')
  const [searchHighlight, setSearchHighlight] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // ── IPC simulation ──
  const ipcInvoke = useCallback(async (channel: string, ...args: unknown[]): Promise<unknown> => {
    // Simulate window.electron?.invoke
    if (typeof window !== 'undefined' && (window as any).electron?.invoke) {
      return (window as any).electron.invoke(channel, ...args)
    }
    // Fallback simulation
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400))

    switch (channel) {
      case 'git:log': {
        const opts = (args[0] || {}) as any
        const offset = opts.offset || 0
        const limit = opts.limit || PAGE_SIZE
        const generated = generateMockCommits(limit, offset)
        return { commits: generated, hasMore: offset + limit < 200 }
      }
      case 'git:file-log': {
        const opts = (args[0] || {}) as any
        const offset = opts.offset || 0
        const limit = opts.limit || PAGE_SIZE
        const all = generateMockCommits(limit, offset)
        // Filter to ~60% of commits for file mode
        const filtered = all.filter((_, i) => i % 3 !== 2)
        return { commits: filtered, hasMore: offset + limit < 100 }
      }
      case 'git:show': {
        const hash = args[0] as string
        return { hash, diff: `diff --git a/src/file.ts b/src/file.ts\nindex abc..def 100644\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1,5 +1,8 @@\n import React from 'react'\n+import { useState } from 'react'\n \n-function old() {\n+function updated() {\n+  const [state, setState] = useState(null)\n   return null\n }\n` }
      }
      case 'git:diff-commits': {
        return { diff: 'Showing diff between two commits...', filesChanged: 5 }
      }
      case 'git:cherry-pick': {
        return { success: true }
      }
      case 'git:revert': {
        return { success: true }
      }
      default:
        return null
    }
  }, [])

  // ── Data loading ──
  const loadCommits = useCallback(async (reset: boolean = false) => {
    if (loading) return
    setLoading(true)

    try {
      const offset = reset ? 0 : commits.length
      const channel = viewMode === 'file' ? 'git:file-log' : 'git:log'
      const result = await ipcInvoke(channel, {
        offset,
        limit: PAGE_SIZE,
        file: viewMode === 'file' ? activeFile : undefined,
        author: filters.author || undefined,
        since: filters.dateFrom || undefined,
        until: filters.dateTo || undefined,
        search: filters.messageSearch || undefined,
      }) as any

      if (reset) {
        setCommits(result.commits)
      } else {
        setCommits(prev => [...prev, ...result.commits])
      }
      setHasMore(result.hasMore)
    } catch (err) {
      console.error('Failed to load git log:', err)
    } finally {
      setLoading(false)
    }
  }, [loading, commits.length, viewMode, activeFile, filters, ipcInvoke])

  // Initial load
  useEffect(() => {
    loadCommits(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, activeFile])

  // Reload when filters change (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      loadCommits(true)
    }, 500)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  // ── Filtered & sorted commits ──
  const filteredCommits = useMemo(() => {
    let result = [...commits]

    if (searchHighlight) {
      const lower = searchHighlight.toLowerCase()
      result = result.filter(c =>
        c.message.toLowerCase().includes(lower) ||
        c.shortHash.includes(lower) ||
        c.author.toLowerCase().includes(lower)
      )
    }

    if (sortOrder === 'oldest') {
      result.sort((a, b) => a.timestamp - b.timestamp)
    } else if (sortOrder === 'topo') {
      // Topological is default from git, keep as-is
    }

    return result
  }, [commits, searchHighlight, sortOrder])

  // ── Graph computation ──
  const graphLayout = useMemo(() => {
    return computeGraphLayout(filteredCommits)
  }, [filteredCommits])

  const graphWidth = useMemo(() => {
    return Math.max(30, graphLayout.maxColumns * 20 + 16)
  }, [graphLayout.maxColumns])

  // ── Actions ──
  const handleCopyHash = useCallback((hash: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    navigator.clipboard.writeText(hash).catch(() => {})
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }, [])

  const handleCommitClick = useCallback((hash: string, index: number) => {
    if (compareMode) {
      setCompare(prev => {
        if (!prev.commitA) return { commitA: hash, commitB: null }
        if (prev.commitA === hash) return { commitA: null, commitB: null }
        if (!prev.commitB) return { ...prev, commitB: hash }
        return { commitA: hash, commitB: null }
      })
    } else {
      setSelectedHash(hash)
      setFocusedIndex(index)
    }
  }, [compareMode])

  const handleToggleExpand = useCallback((hash: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpandedHash(prev => prev === hash ? null : hash)
  }, [])

  const handleViewDiff = useCallback(async (hash: string) => {
    await ipcInvoke('git:show', hash)
    // In a real app, this would open a diff tab
  }, [ipcInvoke])

  const handleCompare = useCallback(async () => {
    if (compare.commitA && compare.commitB) {
      await ipcInvoke('git:diff-commits', compare.commitA, compare.commitB)
    }
  }, [compare, ipcInvoke])

  const handleCherryPick = useCallback(async (hash: string) => {
    setContextMenu(null)
    await ipcInvoke('git:cherry-pick', hash)
  }, [ipcInvoke])

  const handleRevert = useCallback(async (hash: string) => {
    setContextMenu(null)
    await ipcInvoke('git:revert', hash)
  }, [ipcInvoke])

  const handleContextMenu = useCallback((e: React.MouseEvent, hash: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, hash })
  }, [])

  const handleRefresh = useCallback(() => {
    loadCommits(true)
  }, [loadCommits])

  // ── Infinite scroll ──
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || loading || !hasMore) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadCommits(false)
    }
  }, [loading, hasMore, loadCommits])

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const len = filteredCommits.length
    if (len === 0) return

    switch (e.key) {
      case 'j':
      case 'ArrowDown': {
        e.preventDefault()
        const next = Math.min(focusedIndex + 1, len - 1)
        setFocusedIndex(next)
        setSelectedHash(filteredCommits[next].hash)
        const row = rowRefs.current.get(filteredCommits[next].hash)
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        break
      }
      case 'k':
      case 'ArrowUp': {
        e.preventDefault()
        const prev = Math.max(focusedIndex - 1, 0)
        setFocusedIndex(prev)
        setSelectedHash(filteredCommits[prev].hash)
        const row = rowRefs.current.get(filteredCommits[prev].hash)
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < len) {
          handleToggleExpand(filteredCommits[focusedIndex].hash)
        }
        break
      }
      case 'c': {
        if (focusedIndex >= 0 && focusedIndex < len) {
          handleCopyHash(filteredCommits[focusedIndex].hash)
        }
        break
      }
      case 'd': {
        if (focusedIndex >= 0 && focusedIndex < len) {
          handleViewDiff(filteredCommits[focusedIndex].hash)
        }
        break
      }
      case 'Escape': {
        if (expandedHash) {
          setExpandedHash(null)
        } else if (compareMode) {
          setCompareMode(false)
          setCompare({ commitA: null, commitB: null })
        } else if (contextMenu) {
          setContextMenu(null)
        }
        break
      }
      case 'Home': {
        e.preventDefault()
        setFocusedIndex(0)
        setSelectedHash(filteredCommits[0].hash)
        rowRefs.current.get(filteredCommits[0].hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
        break
      }
      case 'End': {
        e.preventDefault()
        setFocusedIndex(len - 1)
        setSelectedHash(filteredCommits[len - 1].hash)
        rowRefs.current.get(filteredCommits[len - 1].hash)?.scrollIntoView({ block: 'end', behavior: 'smooth' })
        break
      }
    }
  }, [focusedIndex, filteredCommits, expandedHash, compareMode, contextMenu, handleToggleExpand, handleCopyHash, handleViewDiff])

  // Close context menu on click elsewhere
  useEffect(() => {
    if (!contextMenu) return
    const handler = () => setContextMenu(null)
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [contextMenu])

  // ── Ref rendering helpers ──
  const renderRefBadges = useCallback((refs: string[]) => {
    if (!refs.length) return null
    return refs.map((ref, i) => {
      const isTag = ref.startsWith('tag:')
      const isHead = ref.includes('HEAD')
      const isRemote = ref.startsWith('origin/')
      const label = ref.replace('tag: ', '').replace('HEAD -> ', '')
      const type = isHead ? 'head' : isTag ? 'tag' : isRemote ? 'remote' : 'branch'
      const Icon = isTag ? Tag : isHead ? GitCommit : GitBranch

      return (
        <span key={i} style={styles.refBadge(type)} title={ref}>
          <Icon size={10} />
          {label}
        </span>
      )
    })
  }, [])

  // ── Graph SVG rendering ──
  const renderGraphCell = useCallback((node: GraphNode, rowHeight: number) => {
    const cellWidth = graphWidth
    const colSpacing = 20
    const nodeX = node.column * colSpacing + 14
    const midY = rowHeight / 2

    return (
      <svg
        width={cellWidth}
        height={rowHeight}
        style={{ display: 'block', flexShrink: 0 }}
      >
        {/* Connection lines */}
        {node.connections.map((conn, ci) => {
          const fromX = conn.fromCol * colSpacing + 14
          const toX = conn.toCol * colSpacing + 14

          if (conn.type === 'straight') {
            return (
              <line
                key={ci}
                x1={fromX}
                y1={0}
                x2={toX}
                y2={rowHeight}
                stroke={conn.color}
                strokeWidth={2}
                strokeOpacity={0.6}
              />
            )
          }

          if (conn.type === 'merge-in') {
            const pathD = `M ${fromX} ${midY} C ${fromX} ${midY + 12}, ${toX} ${midY + 4}, ${toX} ${rowHeight}`
            return (
              <path
                key={ci}
                d={pathD}
                fill="none"
                stroke={conn.color}
                strokeWidth={2}
                strokeOpacity={0.5}
              />
            )
          }

          if (conn.type === 'branch-out') {
            const pathD = `M ${fromX} 0 C ${fromX} ${midY - 4}, ${toX} ${midY - 12}, ${toX} ${midY}`
            return (
              <path
                key={ci}
                d={pathD}
                fill="none"
                stroke={conn.color}
                strokeWidth={2}
                strokeOpacity={0.5}
              />
            )
          }

          return null
        })}

        {/* Node circle */}
        {node.isNode && (
          <>
            {node.isMerge ? (
              <>
                <circle
                  cx={nodeX}
                  cy={midY}
                  r={6}
                  fill="none"
                  stroke={node.color}
                  strokeWidth={2}
                />
                <circle
                  cx={nodeX}
                  cy={midY}
                  r={3}
                  fill={node.color}
                />
              </>
            ) : (
              <circle
                cx={nodeX}
                cy={midY}
                r={5}
                fill={node.color}
                stroke="var(--vscode-sideBar-background, #1e1e2e)"
                strokeWidth={2}
              />
            )}
          </>
        )}
      </svg>
    )
  }, [graphWidth])

  // ── Diff stat bar ──
  const renderDiffStatBar = useCallback((additions: number, deletions: number) => {
    const total = additions + deletions
    if (total === 0) return null
    const addPct = (additions / total) * 100
    const delPct = (deletions / total) * 100
    return (
      <div style={styles.diffStat}>
        <span style={{ color: '#3fb950', fontSize: '10px' }}>+{additions}</span>
        <span style={{ color: '#8b949e', margin: '0 1px' }}>/</span>
        <span style={{ color: '#f85149', fontSize: '10px' }}>-{deletions}</span>
        <div style={styles.diffBar}>
          <div style={{ width: `${addPct}%`, backgroundColor: '#3fb950' }} />
          <div style={{ width: `${delPct}%`, backgroundColor: '#f85149' }} />
        </div>
      </div>
    )
  }, [])

  // ── Expanded commit detail ──
  const renderExpandedDetail = useCallback((commit: TimelineCommit) => {
    return (
      <div style={styles.expandedDetail}>
        {/* Full commit message / body */}
        {commit.body && (
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>Message</div>
            <div style={styles.detailBody}>{commit.body}</div>
          </div>
        )}

        {/* Commit metadata */}
        <div style={styles.detailSection}>
          <div style={styles.detailLabel}>Details</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#8b949e', minWidth: '60px' }}>Commit</span>
              <span style={{ fontFamily: '"Cascadia Code", "Fira Code", monospace', color: '#58a6ff' }}>
                {commit.hash}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#8b949e', minWidth: '60px' }}>Author</span>
              <span>{commit.author} &lt;{commit.authorEmail}&gt;</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ color: '#8b949e', minWidth: '60px' }}>Date</span>
              <span>{formatFullDate(commit.date)}</span>
            </div>
            {commit.parents.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ color: '#8b949e', minWidth: '60px' }}>Parents</span>
                <span style={{ fontFamily: '"Cascadia Code", "Fira Code", monospace' }}>
                  {commit.parents.map(p => p.substring(0, 7)).join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Changed files */}
        {commit.filesChanged && commit.filesChanged.length > 0 && (
          <div style={styles.detailSection}>
            <div style={styles.detailLabel}>
              Changed Files ({commit.filesChanged.length})
              {commit.insertions !== undefined && (
                <span style={{ fontWeight: 400, marginLeft: '8px' }}>
                  <span style={{ color: '#3fb950' }}>+{commit.insertions}</span>
                  {' / '}
                  <span style={{ color: '#f85149' }}>-{commit.deletions}</span>
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {commit.filesChanged.map((file, fi) => (
                <div
                  key={fi}
                  style={styles.fileItem}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewDiff(commit.hash)
                  }}
                >
                  <span style={styles.fileStatusBadge(STATUS_COLORS[file.status] || '#8b949e')}>
                    {STATUS_LETTERS[file.status] || '?'}
                  </span>
                  <FileText size={12} style={{ color: '#8b949e', flexShrink: 0 }} />
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: 'var(--vscode-foreground, #e1e4e8)',
                  }}>
                    {file.path}
                    {file.oldPath && (
                      <span style={{ color: '#8b949e' }}> (from {file.oldPath})</span>
                    )}
                  </span>
                  {renderDiffStatBar(file.additions, file.deletions)}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div style={styles.actionBar}>
          <button style={styles.actionButton}
            onClick={(e) => { e.stopPropagation(); handleViewDiff(commit.hash) }}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)', '#8b949e', '#e1e4e8')}
          ><Eye size={11} /> View Diff</button>
          <button style={styles.actionButton}
            onClick={(e) => { e.stopPropagation(); handleCherryPick(commit.hash) }}
            {...hoverProps('transparent', 'rgba(63,185,80,0.1)', '#8b949e', '#3fb950')}
          ><ChevronsUp size={11} /> Cherry-pick</button>
          <button style={styles.actionButton}
            onClick={(e) => { e.stopPropagation(); handleRevert(commit.hash) }}
            {...hoverProps('transparent', 'rgba(248,81,73,0.1)', '#8b949e', '#f85149')}
          ><RotateCcw size={11} /> Revert</button>
          <button style={styles.actionButton}
            onClick={(e) => { e.stopPropagation(); handleCopyHash(commit.hash) }}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)', '#8b949e', '#e1e4e8')}
          >
            {copiedHash === commit.hash ? <Check size={11} /> : <Copy size={11} />}
            {copiedHash === commit.hash ? 'Copied!' : 'Copy Hash'}
          </button>
          <div style={{ flex: 1 }} />
          <button style={styles.actionButton}
            onClick={(e) => {
              e.stopPropagation()
              setCompareMode(true)
              setCompare({ commitA: commit.hash, commitB: null })
            }}
            {...hoverProps('transparent', 'rgba(88,166,255,0.1)', '#8b949e', '#58a6ff')}
          ><ArrowRightLeft size={11} /> Compare...</button>
        </div>
      </div>
    )
  }, [copiedHash, handleCopyHash, handleViewDiff, handleCherryPick, handleRevert, renderDiffStatBar])

  // ── Commit row renderer ──
  const renderCommitRow = useCallback((commit: TimelineCommit, index: number) => {
    const isSelected = compareMode
      ? (compare.commitA === commit.hash || compare.commitB === commit.hash)
      : selectedHash === commit.hash
    const isFocused = focusedIndex === index
    const isExpanded = expandedHash === commit.hash
    const node = graphLayout.nodes[index]
    const rowHeight = 42

    const authorColor = getAuthorColor(commit.author)
    const messageColor = getCommitTypeColor(commit.message)

    return (
      <React.Fragment key={commit.hash}>
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(commit.hash, el)
          }}
          style={styles.commitRow(isSelected, isFocused)}
          onClick={() => handleCommitClick(commit.hash, index)}
          onDoubleClick={() => handleToggleExpand(commit.hash)}
          onContextMenu={(e) => handleContextMenu(e, commit.hash)}
          onMouseEnter={e => {
            if (!isSelected && !isFocused) {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)'
            }
          }}
          onMouseLeave={e => {
            if (!isSelected && !isFocused) {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'
            }
          }}
          data-hash={commit.hash}
          role="row"
          aria-selected={isSelected}
          tabIndex={index === focusedIndex ? 0 : -1}
        >
          {/* Graph rail column */}
          <div style={styles.graphColumn(graphWidth)}>
            {node && renderGraphCell(node, rowHeight)}
          </div>

          {/* Info column */}
          <div style={styles.infoColumn}>
            {/* Top: message + refs */}
            <div style={styles.topRow}>
              {/* Compare selection indicator */}
              {compareMode && (
                <span style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '3px',
                  border: `1px solid ${isSelected ? '#58a6ff' : 'rgba(255,255,255,0.2)'}`,
                  backgroundColor: isSelected ? 'rgba(88,166,255,0.2)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '9px',
                  color: '#58a6ff',
                }}>
                  {compare.commitA === commit.hash ? 'A' : compare.commitB === commit.hash ? 'B' : ''}
                </span>
              )}

              {/* Merge indicator */}
              {commit.isMerge && (
                <GitMerge size={12} style={{ color: '#d2a8ff', flexShrink: 0 }} />
              )}

              {/* Commit message */}
              <span
                style={{
                  ...styles.commitMessage,
                  color: messageColor,
                }}
                title={commit.message}
              >
                {commit.message}
              </span>

              {/* Ref badges */}
              {renderRefBadges(commit.refs)}

              {/* Expand/collapse toggle */}
              <button
                style={{
                  ...styles.iconButton(false),
                  width: '18px',
                  height: '18px',
                  opacity: 0.5,
                  flexShrink: 0,
                }}
                onClick={(e) => handleToggleExpand(commit.hash, e)}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            {/* Bottom: author, date, hash, stats */}
            <div style={styles.bottomRow}>
              <div style={styles.avatar(authorColor)}>
                {getAuthorInitials(commit.author)}
              </div>
              <span style={styles.metaText}>{commit.author}</span>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
              <Clock size={10} style={{ color: '#8b949e' }} />
              <span style={styles.metaText} title={formatFullDate(commit.date)}>
                {formatRelativeDate(commit.date)}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
              <span
                style={styles.hashBadge}
                onClick={(e) => handleCopyHash(commit.hash, e)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#58a6ff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#8b949e' }}
                title="Click to copy full hash"
              >
                {copiedHash === commit.hash ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                    <Check size={9} style={{ color: '#3fb950' }} /> copied
                  </span>
                ) : (
                  commit.shortHash
                )}
              </span>
              {commit.insertions !== undefined && commit.deletions !== undefined && (
                <>
                  <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
                  {renderDiffStatBar(commit.insertions, commit.deletions)}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Expanded detail panel */}
        {isExpanded && renderExpandedDetail(commit)}
      </React.Fragment>
    )
  }, [
    selectedHash, focusedIndex, expandedHash, graphWidth, graphLayout.nodes,
    compareMode, compare, copiedHash,
    handleCommitClick, handleToggleExpand, handleContextMenu, handleCopyHash,
    renderGraphCell, renderRefBadges, renderDiffStatBar, renderExpandedDetail,
  ])

  // ── Unique authors for filter dropdown ──
  const uniqueAuthors = useMemo(() => {
    const set = new Set(commits.map(c => c.author))
    return Array.from(set).sort()
  }, [commits])

  // ── Render ──
  return (
    <div
      style={styles.container}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="grid"
      aria-label="Git Timeline"
    >
      {/* ── Header bar ── */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <GitCommit size={14} style={{ color: '#58a6ff' }} />
          <span style={styles.headerTitle}>Timeline</span>

          {/* Mode toggle */}
          <div style={styles.modeToggle}>
            <button
              style={styles.modeButton(viewMode === 'repo')}
              onClick={() => setViewMode('repo')}
              title="Repository history"
            >
              Repo
            </button>
            <button
              style={styles.modeButton(viewMode === 'file')}
              onClick={() => setViewMode('file')}
              title="Active file history"
            >
              File
            </button>
          </div>

          {viewMode === 'file' && activeFile && (
            <span style={{
              fontSize: '10px',
              color: '#8b949e',
              maxWidth: '180px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }} title={activeFile}>
              {activeFile.split('/').pop()}
            </span>
          )}
        </div>

        <div style={styles.headerActions}>
          {/* Sort dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              style={styles.iconButton(false)}
              onClick={() => {
                const orders: SortOrder[] = ['newest', 'oldest', 'topo']
                const idx = orders.indexOf(sortOrder)
                setSortOrder(orders[(idx + 1) % orders.length])
              }}
              title={`Sort: ${sortOrder}`}
            >
              <ChevronsUp size={14} style={{
                transform: sortOrder === 'oldest' ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s',
              }} />
            </button>
          </div>

          {/* Filter toggle */}
          <button
            style={styles.iconButton(showFilters)}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle filters"
          >
            <Filter size={14} />
          </button>

          {/* Compare toggle */}
          <button
            style={styles.iconButton(compareMode)}
            onClick={() => {
              setCompareMode(!compareMode)
              if (compareMode) setCompare({ commitA: null, commitB: null })
            }}
            title="Compare two commits"
          >
            <ArrowRightLeft size={14} />
          </button>

          {/* Refresh */}
          <button
            style={styles.iconButton(false)}
            onClick={handleRefresh}
            title="Refresh"
          >
            <RefreshCw size={14} style={{
              animation: loading ? 'spin 1s linear infinite' : 'none',
            }} />
          </button>
        </div>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div style={styles.filterBar}>
          {/* Search row */}
          <div style={styles.filterRow}>
            <Search size={12} style={{ color: '#8b949e', flexShrink: 0 }} />
            <input
              style={styles.filterInput}
              placeholder="Search commits by message, hash, or author..."
              value={searchHighlight}
              onChange={e => setSearchHighlight(e.target.value)}
              spellCheck={false}
            />
            {searchHighlight && (
              <button
                style={{ ...styles.iconButton(false), width: '20px', height: '20px' }}
                onClick={() => setSearchHighlight('')}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Author filter */}
          <div style={styles.filterRow}>
            <User size={12} style={{ color: '#8b949e', flexShrink: 0 }} />
            <select
              style={{
                ...styles.filterInput,
                cursor: 'pointer',
                appearance: 'none' as const,
                paddingRight: '24px',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%238b949e' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
              }}
              value={filters.author}
              onChange={e => setFilters(prev => ({ ...prev, author: e.target.value }))}
            >
              <option value="">All authors</option>
              {uniqueAuthors.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div style={styles.filterRow}>
            <Calendar size={12} style={{ color: '#8b949e', flexShrink: 0 }} />
            <span style={styles.filterLabel}>From</span>
            <input
              type="date"
              style={styles.dateInput}
              value={filters.dateFrom}
              onChange={e => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
            />
            <span style={styles.filterLabel}>To</span>
            <input
              type="date"
              style={styles.dateInput}
              value={filters.dateTo}
              onChange={e => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
            />
            {(filters.dateFrom || filters.dateTo) && (
              <button
                style={{ ...styles.iconButton(false), width: '20px', height: '20px' }}
                onClick={() => setFilters(prev => ({ ...prev, dateFrom: '', dateTo: '' }))}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Message search */}
          <div style={styles.filterRow}>
            <Hash size={12} style={{ color: '#8b949e', flexShrink: 0 }} />
            <input
              style={styles.filterInput}
              placeholder="Filter by commit message (sent to git)..."
              value={filters.messageSearch}
              onChange={e => setFilters(prev => ({ ...prev, messageSearch: e.target.value }))}
              spellCheck={false}
            />
            {filters.messageSearch && (
              <button
                style={{ ...styles.iconButton(false), width: '20px', height: '20px' }}
                onClick={() => setFilters(prev => ({ ...prev, messageSearch: '' }))}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Active filter chips */}
          {(filters.author || filters.dateFrom || filters.dateTo || searchHighlight) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '10px' }}>
              <span style={{ color: '#8b949e' }}>Active:</span>
              {filters.author && <FilterChip color="#58a6ff" icon={<User size={9} />} label={filters.author} onClear={() => setFilters(p => ({ ...p, author: '' }))} />}
              {(filters.dateFrom || filters.dateTo) && <FilterChip color="#d29922" icon={<Calendar size={9} />} label={`${filters.dateFrom || '...'} to ${filters.dateTo || '...'}`} />}
              {searchHighlight && <FilterChip color="#3fb950" icon={<Search size={9} />} label={`"${searchHighlight}"`} />}
              <button style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '10px', color: '#f85149' }}
                onClick={() => { setFilters({ author: '', dateFrom: '', dateTo: '', messageSearch: '' }); setSearchHighlight('') }}
              >Clear all</button>
            </div>
          )}
        </div>
      )}

      {/* ── Compare bar ── */}
      {compareMode && (
        <div style={styles.compareBar}>
          <ArrowRightLeft size={12} style={{ color: '#58a6ff' }} />
          <span style={{ color: '#58a6ff', fontWeight: 500 }}>Compare mode</span>
          <span style={{ color: '#8b949e' }}>|</span>
          <span style={{ color: '#8b949e' }}>
            {!compare.commitA
              ? 'Select first commit (A)'
              : !compare.commitB
                ? 'Select second commit (B)'
                : 'Ready to compare'}
          </span>
          {compare.commitA && (
            <>
              <span style={styles.compareBadge}>
                A: {compare.commitA.substring(0, 7)}
              </span>
            </>
          )}
          {compare.commitB && (
            <>
              <span style={styles.compareBadge}>
                B: {compare.commitB.substring(0, 7)}
              </span>
            </>
          )}
          {compare.commitA && compare.commitB && (
            <button
              style={{
                ...styles.actionButton,
                backgroundColor: 'rgba(88,166,255,0.1)',
                color: '#58a6ff',
                borderColor: 'rgba(88,166,255,0.3)',
              }}
              onClick={handleCompare}
            >
              <Eye size={11} /> View Diff
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            style={{ ...styles.iconButton(false), width: '20px', height: '20px' }}
            onClick={() => {
              setCompareMode(false)
              setCompare({ commitA: null, commitB: null })
            }}
            title="Exit compare mode"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Commit list ── */}
      <div
        ref={scrollRef}
        style={styles.scrollArea}
        onScroll={handleScroll}
      >
        {filteredCommits.length === 0 && !loading ? (
          <div style={styles.emptyState}>
            <GitCommit size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>No commits found</span>
            <span style={{ fontSize: '11px', opacity: 0.7, textAlign: 'center' }}>
              {searchHighlight || filters.author || filters.dateFrom || filters.dateTo
                ? 'Try adjusting your filters'
                : viewMode === 'file'
                  ? 'No history available for this file'
                  : 'This repository has no commits yet'}
            </span>
            {(searchHighlight || filters.author) && (
              <button
                style={{
                  ...styles.actionButton,
                  marginTop: '8px',
                  color: '#58a6ff',
                  borderColor: 'rgba(88,166,255,0.3)',
                }}
                onClick={() => {
                  setFilters({ author: '', dateFrom: '', dateTo: '', messageSearch: '' })
                  setSearchHighlight('')
                }}
              >
                <X size={11} /> Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div ref={listRef} role="rowgroup">
            {filteredCommits.map((commit, index) => renderCommitRow(commit, index))}

            {/* Loading indicator / load more */}
            {loading && (
              <div style={{ ...styles.loadMoreBar, cursor: 'default' }}>
                <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                <span>Loading commits...</span>
              </div>
            )}

            {!loading && hasMore && filteredCommits.length > 0 && (
              <div
                style={styles.loadMoreBar}
                onClick={() => loadCommits(false)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
              >
                <Download size={12} />
                <span>Load more commits...</span>
              </div>
            )}

            {!loading && !hasMore && filteredCommits.length > 0 && (
              <div style={{
                ...styles.loadMoreBar,
                cursor: 'default',
                opacity: 0.5,
              }}>
                <span>End of history</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          style={{
            ...styles.contextMenu,
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={styles.contextMenuItem()}
            onClick={() => { handleViewDiff(contextMenu.hash); setContextMenu(null) }}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)')}
          ><Eye size={13} /> View Commit Diff</div>
          <div style={styles.contextMenuItem()}
            onClick={() => { handleCopyHash(contextMenu.hash); setContextMenu(null) }}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)')}
          ><Copy size={13} /> Copy Commit Hash</div>
          <div style={styles.contextMenuItem()}
            onClick={() => {
              const c = commits.find(c => c.hash === contextMenu.hash)
              if (c) navigator.clipboard.writeText(c.message).catch(() => {})
              setContextMenu(null)
            }}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)')}
          ><FileText size={13} /> Copy Commit Message</div>
          <div style={styles.contextMenuSeparator} />
          <div style={styles.contextMenuItem()}
            onClick={() => { setCompareMode(true); setCompare({ commitA: contextMenu.hash, commitB: null }); setContextMenu(null) }}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)')}
          ><ArrowRightLeft size={13} /> Compare with...</div>
          <div style={styles.contextMenuItem()}
            onClick={() => { handleToggleExpand(contextMenu.hash); setContextMenu(null) }}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)')}
          ><ChevronDown size={13} /> {expandedHash === contextMenu.hash ? 'Collapse' : 'Expand'} Details</div>
          <div style={styles.contextMenuSeparator} />
          <div style={styles.contextMenuItem()}
            onClick={() => handleCherryPick(contextMenu.hash)}
            {...hoverProps('transparent', 'rgba(255,255,255,0.06)')}
          ><ChevronsUp size={13} /> Cherry-pick Commit</div>
          <div style={styles.contextMenuItem(true)}
            onClick={() => handleRevert(contextMenu.hash)}
            {...hoverProps('transparent', 'rgba(248,81,73,0.06)')}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
          >
            <RotateCcw size={13} /> Revert Commit
          </div>
        </div>
      )}

      {/* ── Status bar ── */}
      <div style={styles.statusBarBottom}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>
            {filteredCommits.length} commit{filteredCommits.length !== 1 ? 's' : ''}
            {searchHighlight && ` (filtered)`}
          </span>
          {viewMode === 'file' && activeFile && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <FileText size={10} />
                {activeFile.split('/').pop()}
              </span>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedHash && (
            <span style={{ fontFamily: '"Cascadia Code", "Fira Code", monospace' }}>
              {selectedHash.substring(0, 7)}
            </span>
          )}
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
          <span>Sort: {sortOrder}</span>
          {hasMore && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>|</span>
              <span style={{ color: '#d29922' }}>More available</span>
            </>
          )}
        </div>
      </div>

      {/* ── CSS Keyframes (injected once) ── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        div[role="grid"]:focus {
          outline: none;
        }
        div[role="grid"] *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        div[role="grid"] *::-webkit-scrollbar-track {
          background: transparent;
        }
        div[role="grid"] *::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.12);
          border-radius: 3px;
        }
        div[role="grid"] *::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
        select option {
          background: var(--vscode-dropdown-background, #252536);
          color: var(--vscode-dropdown-foreground, #e1e4e8);
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.7);
          cursor: pointer;
        }
      `}</style>
    </div>
  )
}
