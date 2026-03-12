import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Archive,
  Plus,
  Trash2,
  Play,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
  RotateCw,
  X,
  Clock,
  GitBranch,
  AlertTriangle,
  Eye,
  Copy,
  FileText,
  GripVertical,
  Filter,
  ChevronUp,
  Loader,
  Inbox,
  Check,
} from 'lucide-react'
import { useToastStore } from '@/store/toast'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StashEntry {
  id: string
  index: number
  message: string
  branch: string
  date: Date
  hash: string
  filesChanged: number
  insertions: number
  deletions: number
  untrackedIncluded: boolean
}

interface StashDiffFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  insertions: number
  deletions: number
}

interface StashDiffHunk {
  header: string
  lines: DiffLine[]
}

interface DiffLine {
  type: 'context' | 'addition' | 'deletion' | 'header'
  content: string
  oldLineNumber?: number
  newLineNumber?: number
}

interface StashDiffData {
  stashId: string
  files: StashDiffFile[]
  hunks: StashDiffHunk[]
  rawDiff: string
}

type StashMode = 'all' | 'staged' | 'keep-index'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  stashId: string | null
}

// ─── Mock Data Generators ───────────────────────────────────────────────────

const MOCK_BRANCHES = [
  'main', 'develop', 'feature/auth', 'feature/dashboard',
  'fix/memory-leak', 'refactor/state', 'release/v2.0', 'hotfix/login',
]

const MOCK_MESSAGES = [
  'WIP: refactoring authentication module',
  'Saving progress on dashboard layout',
  'Experimental CSS grid implementation',
  'Quick save before switching branches',
  'Half-done API integration work',
  'Testing new validation approach',
  'Debug session state - do not drop',
  'Prototype for new search feature',
  'Incomplete migration to new API',
  'Temp save: fixing flaky tests',
  'Stash before rebasing onto main',
  'WIP: sidebar navigation redesign',
]

const MOCK_FILES: StashDiffFile[] = [
  { path: 'src/auth/login.ts', status: 'modified', insertions: 45, deletions: 12 },
  { path: 'src/components/Dashboard.tsx', status: 'modified', insertions: 78, deletions: 34 },
  { path: 'src/utils/validators.ts', status: 'added', insertions: 120, deletions: 0 },
  { path: 'src/legacy/oldHelper.ts', status: 'deleted', insertions: 0, deletions: 88 },
  { path: 'src/api/endpoints.ts', status: 'modified', insertions: 23, deletions: 8 },
  { path: 'src/styles/layout.css', status: 'renamed', insertions: 5, deletions: 3 },
]

function generateMockStashes(count: number): StashEntry[] {
  const stashes: StashEntry[] = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const daysAgo = Math.floor(Math.random() * 60)
    const hoursAgo = Math.floor(Math.random() * 24)
    stashes.push({
      id: `stash-${i}`,
      index: i,
      message: MOCK_MESSAGES[i % MOCK_MESSAGES.length],
      branch: MOCK_BRANCHES[i % MOCK_BRANCHES.length],
      date: new Date(now - daysAgo * 86400000 - hoursAgo * 3600000),
      hash: Math.random().toString(16).substring(2, 9),
      filesChanged: Math.floor(Math.random() * 12) + 1,
      insertions: Math.floor(Math.random() * 200) + 5,
      deletions: Math.floor(Math.random() * 100) + 1,
      untrackedIncluded: Math.random() > 0.6,
    })
  }
  return stashes
}

function generateMockDiff(stashId: string): StashDiffData {
  const files = MOCK_FILES.slice(0, Math.floor(Math.random() * 4) + 2)
  const hunks: StashDiffHunk[] = [
    {
      header: '@@ -10,8 +10,12 @@ import { useState } from "react"',
      lines: [
        { type: 'context', content: '  const [data, setData] = useState(null)', oldLineNumber: 10, newLineNumber: 10 },
        { type: 'context', content: '  const [loading, setLoading] = useState(false)', oldLineNumber: 11, newLineNumber: 11 },
        { type: 'deletion', content: '  const [error, setError] = useState(null)', oldLineNumber: 12 },
        { type: 'deletion', content: '  const handleFetch = async () => {', oldLineNumber: 13 },
        { type: 'addition', content: '  const [error, setError] = useState<Error | null>(null)', newLineNumber: 12 },
        { type: 'addition', content: '  const [retryCount, setRetryCount] = useState(0)', newLineNumber: 13 },
        { type: 'addition', content: '', newLineNumber: 14 },
        { type: 'addition', content: '  const handleFetch = useCallback(async () => {', newLineNumber: 15 },
        { type: 'context', content: '    setLoading(true)', oldLineNumber: 14, newLineNumber: 16 },
        { type: 'context', content: '    try {', oldLineNumber: 15, newLineNumber: 17 },
      ],
    },
    {
      header: '@@ -35,5 +39,9 @@ function processResult(input: string) {',
      lines: [
        { type: 'context', content: '  const result = parse(input)', oldLineNumber: 35, newLineNumber: 39 },
        { type: 'deletion', content: '  return result', oldLineNumber: 36 },
        { type: 'addition', content: '  if (!result.valid) {', newLineNumber: 40 },
        { type: 'addition', content: '    throw new ValidationError(result.errors)', newLineNumber: 41 },
        { type: 'addition', content: '  }', newLineNumber: 42 },
        { type: 'addition', content: '  return result.data', newLineNumber: 43 },
        { type: 'context', content: '}', oldLineNumber: 37, newLineNumber: 44 },
      ],
    },
  ]

  return { stashId, files, hunks, rawDiff: '' }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeDate(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)
  const months = Math.floor(days / 30)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  if (weeks < 5) return `${weeks}w ago`
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusColor(status: StashDiffFile['status']): string {
  switch (status) {
    case 'modified': return 'var(--accent-warning, #d29922)'
    case 'added': return 'var(--accent-success, #3fb950)'
    case 'deleted': return 'var(--accent-error, #f85149)'
    case 'renamed': return 'var(--accent-info, #388bfd)'
    default: return 'var(--text-secondary)'
  }
}

function getStatusLabel(status: StashDiffFile['status']): string {
  switch (status) {
    case 'modified': return 'M'
    case 'added': return 'A'
    case 'deleted': return 'D'
    case 'renamed': return 'R'
    default: return '?'
  }
}

// ─── Simulated IPC ──────────────────────────────────────────────────────────

async function gitStashList(): Promise<StashEntry[]> {
  await new Promise(r => setTimeout(r, 400 + Math.random() * 300))
  const result = await window.electron?.invoke('git:stash-list').catch(() => null)
  if (result) return result
  return generateMockStashes(8)
}

async function gitStashCreate(message: string, mode: StashMode, includeUntracked: boolean): Promise<boolean> {
  await new Promise(r => setTimeout(r, 300 + Math.random() * 200))
  await window.electron?.invoke('git:stash-create', { message, mode, includeUntracked }).catch(() => null)
  return true
}

async function gitStashApply(index: number, drop: boolean): Promise<boolean> {
  await new Promise(r => setTimeout(r, 250 + Math.random() * 200))
  await window.electron?.invoke('git:stash-apply', { index, drop }).catch(() => null)
  return true
}

async function gitStashPop(index: number): Promise<boolean> {
  await new Promise(r => setTimeout(r, 250 + Math.random() * 200))
  await window.electron?.invoke('git:stash-pop', { index }).catch(() => null)
  return true
}

async function gitStashDrop(index: number): Promise<boolean> {
  await new Promise(r => setTimeout(r, 200 + Math.random() * 150))
  await window.electron?.invoke('git:stash-drop', { index }).catch(() => null)
  return true
}

async function gitStashClear(): Promise<boolean> {
  await new Promise(r => setTimeout(r, 300 + Math.random() * 200))
  await window.electron?.invoke('git:stash-clear').catch(() => null)
  return true
}

async function gitStashShowDiff(index: number): Promise<StashDiffData> {
  await new Promise(r => setTimeout(r, 350 + Math.random() * 300))
  const result = await window.electron?.invoke('git:stash-show', { index }).catch(() => null)
  if (result) return result
  return generateMockDiff(`stash@{${index}}`)
}

async function gitStashBranch(index: number, branchName: string): Promise<boolean> {
  await new Promise(r => setTimeout(r, 400 + Math.random() * 300))
  await window.electron?.invoke('git:stash-branch', { index, branchName }).catch(() => null)
  return true
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function StashCreateForm({
  onSubmit,
  onCancel,
  isCreating,
}: {
  onSubmit: (message: string, mode: StashMode, includeUntracked: boolean) => void
  onCancel: () => void
  isCreating: boolean
}) {
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<StashMode>('all')
  const [includeUntracked, setIncludeUntracked] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(message.trim() || `WIP on ${new Date().toLocaleString()}`, mode, includeUntracked)
  }, [message, mode, includeUntracked, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }, [onCancel])

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-color, #333)',
        background: 'var(--bg-secondary, #1e1e1e)',
      }}
    >
      <div style={{ marginBottom: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Stash message (optional)"
          disabled={isCreating}
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'var(--input-bg, #2d2d2d)',
            border: '1px solid var(--border-color, #444)',
            borderRadius: 4,
            color: 'var(--text-primary, #ccc)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        {(['all', 'staged', 'keep-index'] as StashMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={isCreating}
            style={{
              padding: '3px 8px',
              fontSize: 11,
              borderRadius: 3,
              border: '1px solid',
              borderColor: mode === m ? 'var(--accent-primary, #007acc)' : 'var(--border-color, #444)',
              background: mode === m ? 'var(--accent-primary, #007acc)' : 'transparent',
              color: mode === m ? '#fff' : 'var(--text-secondary, #999)',
              cursor: isCreating ? 'not-allowed' : 'pointer',
            }}
          >
            {m === 'all' ? 'Stash All' : m === 'staged' ? 'Staged Only' : 'Keep Index'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: 11,
            color: 'var(--text-secondary, #999)',
            cursor: isCreating ? 'not-allowed' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={includeUntracked}
            onChange={e => setIncludeUntracked(e.target.checked)}
            disabled={isCreating}
            style={{ accentColor: 'var(--accent-primary, #007acc)' }}
          />
          Include untracked files
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isCreating}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 3,
              border: '1px solid var(--border-color, #444)',
              background: 'transparent',
              color: 'var(--text-secondary, #999)',
              cursor: isCreating ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isCreating}
            style={{
              padding: '4px 10px',
              fontSize: 11,
              borderRadius: 3,
              border: 'none',
              background: 'var(--accent-primary, #007acc)',
              color: '#fff',
              cursor: isCreating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            {isCreating ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Archive size={11} />}
            {isCreating ? 'Stashing...' : 'Stash'}
          </button>
        </div>
      </div>
    </form>
  )
}

function InlineDiffViewer({ diff }: { diff: StashDiffData }) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set(diff.files.map(f => f.path)))

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  return (
    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono, "Consolas", monospace)' }}>
      {/* File list summary */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color, #333)',
        background: 'var(--bg-tertiary, #252526)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary, #999)', marginBottom: 4 }}>
          {diff.files.length} file{diff.files.length !== 1 ? 's' : ''} changed
        </div>
        {diff.files.map(file => (
          <div
            key={file.path}
            onClick={() => toggleFile(file.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 0',
              cursor: 'pointer',
              color: 'var(--text-primary, #ccc)',
              fontSize: 11,
            }}
          >
            {expandedFiles.has(file.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span style={{
              width: 14,
              height: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 2,
              fontSize: 10,
              fontWeight: 600,
              color: getStatusColor(file.status),
            }}>
              {getStatusLabel(file.status)}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file.path}
            </span>
            <span style={{ color: 'var(--accent-success, #3fb950)', fontSize: 10 }}>
              +{file.insertions}
            </span>
            <span style={{ color: 'var(--accent-error, #f85149)', fontSize: 10 }}>
              -{file.deletions}
            </span>
          </div>
        ))}
      </div>

      {/* Hunks */}
      {diff.hunks.map((hunk, hi) => (
        <div key={hi} style={{ borderBottom: '1px solid var(--border-color, #333)' }}>
          <div style={{
            padding: '4px 12px',
            background: 'var(--bg-tertiary, #252526)',
            color: 'var(--text-muted, #6a737d)',
            fontSize: 11,
            borderBottom: '1px solid var(--border-color, #333)',
          }}>
            {hunk.header}
          </div>
          <div>
            {hunk.lines.map((line, li) => {
              let bg = 'transparent'
              let color = 'var(--text-primary, #ccc)'
              const lineNumColor = 'var(--text-muted, #6a737d)'

              if (line.type === 'addition') {
                bg = 'rgba(63, 185, 80, 0.12)'
                color = 'var(--diff-added-text, #aff5b4)'
              } else if (line.type === 'deletion') {
                bg = 'rgba(248, 81, 73, 0.12)'
                color = 'var(--diff-removed-text, #ffa7a0)'
              } else if (line.type === 'header') {
                bg = 'rgba(56, 139, 253, 0.08)'
                color = 'var(--text-muted, #6a737d)'
              }

              return (
                <div
                  key={li}
                  style={{
                    display: 'flex',
                    background: bg,
                    minHeight: 20,
                    lineHeight: '20px',
                  }}
                >
                  <span style={{
                    width: 42,
                    textAlign: 'right',
                    paddingRight: 8,
                    color: lineNumColor,
                    fontSize: 11,
                    userSelect: 'none',
                    flexShrink: 0,
                  }}>
                    {line.oldLineNumber ?? ''}
                  </span>
                  <span style={{
                    width: 42,
                    textAlign: 'right',
                    paddingRight: 8,
                    color: lineNumColor,
                    fontSize: 11,
                    userSelect: 'none',
                    flexShrink: 0,
                    borderRight: '1px solid var(--border-color, #333)',
                    marginRight: 8,
                  }}>
                    {line.newLineNumber ?? ''}
                  </span>
                  <span style={{
                    width: 14,
                    textAlign: 'center',
                    color: line.type === 'addition' ? 'var(--accent-success, #3fb950)'
                      : line.type === 'deletion' ? 'var(--accent-error, #f85149)'
                      : 'transparent',
                    userSelect: 'none',
                    flexShrink: 0,
                    fontWeight: 700,
                  }}>
                    {line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' '}
                  </span>
                  <span style={{ color, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {line.content}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
  }, [onCancel])

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div style={{
        background: 'var(--bg-primary, #1e1e1e)',
        border: '1px solid var(--border-color, #444)',
        borderRadius: 6,
        padding: '16px 20px',
        maxWidth: 340,
        width: '90%',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #ccc)', marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #999)', marginBottom: 16, lineHeight: 1.5 }}>
          {message}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid var(--border-color, #444)',
              background: 'transparent',
              color: 'var(--text-secondary, #999)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: 'none',
              background: danger ? 'var(--accent-error, #f85149)' : 'var(--accent-primary, #007acc)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function BranchFromStashDialog({
  stash,
  onSubmit,
  onCancel,
}: {
  stash: StashEntry
  onSubmit: (branchName: string) => void
  onCancel: () => void
}) {
  const [branchName, setBranchName] = useState(`stash/${stash.branch}-${stash.hash}`)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    if (branchName.trim()) onSubmit(branchName.trim())
  }, [branchName, onSubmit])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <form
        onSubmit={handleSubmit}
        onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
        style={{
          background: 'var(--bg-primary, #1e1e1e)',
          border: '1px solid var(--border-color, #444)',
          borderRadius: 6,
          padding: '16px 20px',
          maxWidth: 380,
          width: '90%',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #ccc)', marginBottom: 4 }}>
          Create Branch from Stash
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary, #999)', marginBottom: 12 }}>
          stash@{'{' + stash.index + '}'}: {stash.message}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={branchName}
          onChange={e => setBranchName(e.target.value)}
          placeholder="Branch name"
          style={{
            width: '100%',
            padding: '6px 8px',
            background: 'var(--input-bg, #2d2d2d)',
            border: '1px solid var(--border-color, #444)',
            borderRadius: 4,
            color: 'var(--text-primary, #ccc)',
            fontSize: 12,
            outline: 'none',
            boxSizing: 'border-box',
            marginBottom: 14,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid var(--border-color, #444)',
              background: 'transparent',
              color: 'var(--text-secondary, #999)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!branchName.trim()}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: 'none',
              background: 'var(--accent-primary, #007acc)',
              color: '#fff',
              cursor: !branchName.trim() ? 'not-allowed' : 'pointer',
              opacity: !branchName.trim() ? 0.5 : 1,
            }}
          >
            Create Branch
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function GitStashPanel() {
  const addToast = useToastStore(s => s.addToast)

  // ── State ───────────────────────────────────────────────────────────────
  const [stashes, setStashes] = useState<StashEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterBranch, setFilterBranch] = useState<string | null>(null)
  const [showBranchFilter, setShowBranchFilter] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [selectedStashId, setSelectedStashId] = useState<string | null>(null)
  const [expandedStashId, setExpandedStashId] = useState<string | null>(null)
  const [diffData, setDiffData] = useState<StashDiffData | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, stashId: null })
  const [confirmAction, setConfirmAction] = useState<{ type: 'drop' | 'clear'; stashId?: string } | null>(null)
  const [branchDialog, setBranchDialog] = useState<StashEntry | null>(null)
  const [operatingStashId, setOperatingStashId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<{ dragging: string | null; overIndex: number | null }>({ dragging: null, overIndex: null })
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')

  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Data fetching ───────────────────────────────────────────────────────
  const fetchStashes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await gitStashList()
      setStashes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stashes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStashes()
  }, [fetchStashes])

  // ── Filtered & sorted stashes ───────────────────────────────────────────
  const filteredStashes = useMemo(() => {
    let result = [...stashes]
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.message.toLowerCase().includes(q) ||
        s.branch.toLowerCase().includes(q) ||
        s.hash.includes(q) ||
        `stash@{${s.index}}`.includes(q)
      )
    }
    if (filterBranch) {
      result = result.filter(s => s.branch === filterBranch)
    }
    if (sortOrder === 'oldest') {
      result.reverse()
    }
    return result
  }, [stashes, searchQuery, filterBranch, sortOrder])

  const uniqueBranches = useMemo(() => {
    const branches = new Set(stashes.map(s => s.branch))
    return Array.from(branches).sort()
  }, [stashes])

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleCreateStash = useCallback(async (message: string, mode: StashMode, includeUntracked: boolean) => {
    setIsCreating(true)
    try {
      await gitStashCreate(message, mode, includeUntracked)
      addToast({ type: 'success', message: `Stash created: ${message}` })
      setShowCreateForm(false)
      await fetchStashes()
    } catch {
      addToast({ type: 'error', message: 'Failed to create stash' })
    } finally {
      setIsCreating(false)
    }
  }, [addToast, fetchStashes])

  const handleApplyStash = useCallback(async (stash: StashEntry, drop: boolean) => {
    setOperatingStashId(stash.id)
    try {
      await gitStashApply(stash.index, drop)
      addToast({ type: 'success', message: `Stash applied${drop ? ' and dropped' : ''}: ${stash.message}` })
      if (drop) await fetchStashes()
    } catch {
      addToast({ type: 'error', message: 'Failed to apply stash' })
    } finally {
      setOperatingStashId(null)
    }
  }, [addToast, fetchStashes])

  const handlePopStash = useCallback(async (stash: StashEntry) => {
    setOperatingStashId(stash.id)
    try {
      await gitStashPop(stash.index)
      addToast({ type: 'success', message: `Stash popped: ${stash.message}` })
      await fetchStashes()
    } catch {
      addToast({ type: 'error', message: 'Failed to pop stash. There may be conflicts.' })
    } finally {
      setOperatingStashId(null)
    }
  }, [addToast, fetchStashes])

  const handleDropStash = useCallback(async (stash: StashEntry) => {
    setOperatingStashId(stash.id)
    try {
      await gitStashDrop(stash.index)
      addToast({ type: 'success', message: `Stash dropped: stash@{${stash.index}}` })
      if (expandedStashId === stash.id) {
        setExpandedStashId(null)
        setDiffData(null)
      }
      if (selectedStashId === stash.id) setSelectedStashId(null)
      await fetchStashes()
    } catch {
      addToast({ type: 'error', message: 'Failed to drop stash' })
    } finally {
      setOperatingStashId(null)
    }
  }, [addToast, fetchStashes, expandedStashId, selectedStashId])

  const handleClearAll = useCallback(async () => {
    try {
      await gitStashClear()
      addToast({ type: 'success', message: 'All stashes cleared' })
      setExpandedStashId(null)
      setDiffData(null)
      setSelectedStashId(null)
      await fetchStashes()
    } catch {
      addToast({ type: 'error', message: 'Failed to clear stashes' })
    }
  }, [addToast, fetchStashes])

  const handleViewDiff = useCallback(async (stash: StashEntry) => {
    if (expandedStashId === stash.id) {
      setExpandedStashId(null)
      setDiffData(null)
      return
    }
    setExpandedStashId(stash.id)
    setDiffLoading(true)
    try {
      const data = await gitStashShowDiff(stash.index)
      setDiffData(data)
    } catch {
      addToast({ type: 'error', message: 'Failed to load stash diff' })
      setExpandedStashId(null)
    } finally {
      setDiffLoading(false)
    }
  }, [expandedStashId, addToast])

  const handleCreateBranch = useCallback(async (stash: StashEntry, branchName: string) => {
    setOperatingStashId(stash.id)
    try {
      await gitStashBranch(stash.index, branchName)
      addToast({ type: 'success', message: `Branch "${branchName}" created from stash` })
      setBranchDialog(null)
      await fetchStashes()
    } catch {
      addToast({ type: 'error', message: 'Failed to create branch from stash' })
    } finally {
      setOperatingStashId(null)
    }
  }, [addToast, fetchStashes])

  // ── Context menu ────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent, stashId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current?.getBoundingClientRect()
    setContextMenu({
      visible: true,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      stashId,
    })
    setSelectedStashId(stashId)
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false, stashId: null }))
  }, [])

  useEffect(() => {
    if (contextMenu.visible) {
      const handler = () => closeContextMenu()
      document.addEventListener('click', handler)
      document.addEventListener('contextmenu', handler)
      return () => {
        document.removeEventListener('click', handler)
        document.removeEventListener('contextmenu', handler)
      }
    }
  }, [contextMenu.visible, closeContextMenu])

  // ── Keyboard navigation ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showCreateForm || confirmAction || branchDialog) return

    const stashList = filteredStashes
    if (!stashList.length) return

    const currentIndex = stashList.findIndex(s => s.id === selectedStashId)

    switch (e.key) {
      case 'ArrowDown':
      case 'j': {
        e.preventDefault()
        const nextIdx = currentIndex < stashList.length - 1 ? currentIndex + 1 : 0
        setSelectedStashId(stashList[nextIdx].id)
        break
      }
      case 'ArrowUp':
      case 'k': {
        e.preventDefault()
        const prevIdx = currentIndex > 0 ? currentIndex - 1 : stashList.length - 1
        setSelectedStashId(stashList[prevIdx].id)
        break
      }
      case 'Enter': {
        e.preventDefault()
        const stash = stashList.find(s => s.id === selectedStashId)
        if (stash) handleViewDiff(stash)
        break
      }
      case 'a': {
        if (e.ctrlKey || e.metaKey) break
        e.preventDefault()
        const stash = stashList.find(s => s.id === selectedStashId)
        if (stash) handleApplyStash(stash, false)
        break
      }
      case 'p': {
        if (e.ctrlKey || e.metaKey) break
        e.preventDefault()
        const stash = stashList.find(s => s.id === selectedStashId)
        if (stash) handlePopStash(stash)
        break
      }
      case 'd': {
        if (e.ctrlKey || e.metaKey) break
        e.preventDefault()
        const stash = stashList.find(s => s.id === selectedStashId)
        if (stash) setConfirmAction({ type: 'drop', stashId: stash.id })
        break
      }
      case 'n': {
        if (e.ctrlKey || e.metaKey) break
        e.preventDefault()
        setShowCreateForm(true)
        break
      }
      case '/': {
        e.preventDefault()
        searchInputRef.current?.focus()
        break
      }
      case 'r': {
        if (e.ctrlKey || e.metaKey) break
        e.preventDefault()
        fetchStashes()
        break
      }
      case 'Escape': {
        if (expandedStashId) {
          setExpandedStashId(null)
          setDiffData(null)
        } else if (searchQuery) {
          setSearchQuery('')
        }
        break
      }
    }
  }, [
    filteredStashes, selectedStashId, showCreateForm, confirmAction, branchDialog,
    expandedStashId, searchQuery, handleViewDiff, handleApplyStash, handlePopStash, fetchStashes,
  ])

  // ── Drag handlers (visual reorder only) ─────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, stashId: string) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', stashId)
    setDragState({ dragging: stashId, overIndex: null })
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragState(prev => ({ ...prev, overIndex: index }))
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragState.dragging && dragState.overIndex !== null) {
      setStashes(prev => {
        const next = [...prev]
        const fromIdx = next.findIndex(s => s.id === dragState.dragging)
        if (fromIdx === -1 || dragState.overIndex === null) return prev
        const [item] = next.splice(fromIdx, 1)
        next.splice(dragState.overIndex, 0, item)
        return next.map((s, i) => ({ ...s, index: i }))
      })
    }
    setDragState({ dragging: null, overIndex: null })
  }, [dragState])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleDragEnd()
  }, [handleDragEnd])

  // ── Confirm action resolution ───────────────────────────────────────────
  const resolveConfirm = useCallback(async () => {
    if (!confirmAction) return
    if (confirmAction.type === 'clear') {
      await handleClearAll()
    } else if (confirmAction.type === 'drop' && confirmAction.stashId) {
      const stash = stashes.find(s => s.id === confirmAction.stashId)
      if (stash) await handleDropStash(stash)
    }
    setConfirmAction(null)
  }, [confirmAction, stashes, handleClearAll, handleDropStash])

  // ── Context menu action handler ─────────────────────────────────────────
  const contextMenuStash = useMemo(() => {
    if (!contextMenu.stashId) return null
    return stashes.find(s => s.id === contextMenu.stashId) ?? null
  }, [contextMenu.stashId, stashes])

  const handleContextAction = useCallback((action: string) => {
    closeContextMenu()
    if (!contextMenuStash) return
    switch (action) {
      case 'apply': handleApplyStash(contextMenuStash, false); break
      case 'apply-drop': handleApplyStash(contextMenuStash, true); break
      case 'pop': handlePopStash(contextMenuStash); break
      case 'drop': setConfirmAction({ type: 'drop', stashId: contextMenuStash.id }); break
      case 'diff': handleViewDiff(contextMenuStash); break
      case 'branch': setBranchDialog(contextMenuStash); break
      case 'copy-hash':
        navigator.clipboard?.writeText(contextMenuStash.hash).then(() =>
          addToast({ type: 'info', message: 'Stash hash copied to clipboard' })
        )
        break
    }
  }, [closeContextMenu, contextMenuStash, handleApplyStash, handlePopStash, handleViewDiff, addToast])

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary, #1e1e1e)',
        color: 'var(--text-primary, #cccccc)',
        fontSize: 13,
        outline: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color, #333)',
        background: 'var(--bg-secondary, #252526)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Archive size={14} style={{ color: 'var(--accent-primary, #007acc)' }} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>Git Stash</span>
          {stashes.length > 0 && (
            <span style={{
              fontSize: 10,
              padding: '1px 5px',
              borderRadius: 8,
              background: 'var(--accent-primary, #007acc)',
              color: '#fff',
              fontWeight: 600,
            }}>
              {stashes.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            onClick={() => setShowCreateForm(f => !f)}
            title="Create Stash (n)"
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: showCreateForm ? 'var(--accent-primary, #007acc)' : 'var(--text-secondary, #999)',
              cursor: 'pointer',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Plus size={14} />
          </button>
          <button
            onClick={() => setSortOrder(s => s === 'newest' ? 'oldest' : 'newest')}
            title={`Sort: ${sortOrder === 'newest' ? 'newest first' : 'oldest first'}`}
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #999)',
              cursor: 'pointer',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {sortOrder === 'newest' ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            onClick={fetchStashes}
            title="Refresh (r)"
            disabled={loading}
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #999)',
              cursor: loading ? 'not-allowed' : 'pointer',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RotateCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
          {stashes.length > 0 && (
            <button
              onClick={() => setConfirmAction({ type: 'clear' })}
              title="Clear All Stashes"
              style={{
                padding: 4,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #999)',
                cursor: 'pointer',
                borderRadius: 3,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ── Search & Filter Bar ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-color, #333)',
        flexShrink: 0,
      }}>
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          background: 'var(--input-bg, #2d2d2d)',
          border: '1px solid var(--border-color, #444)',
          borderRadius: 4,
          padding: '0 6px',
        }}>
          <Search size={12} style={{ color: 'var(--text-muted, #666)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search stashes... (/)"
            style={{
              flex: 1,
              padding: '4px 6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary, #ccc)',
              fontSize: 11,
              outline: 'none',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                padding: 2,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted, #666)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowBranchFilter(f => !f)}
            title="Filter by branch"
            style={{
              padding: '4px 6px',
              background: filterBranch ? 'var(--accent-primary, #007acc)' : 'transparent',
              border: '1px solid',
              borderColor: filterBranch ? 'var(--accent-primary, #007acc)' : 'var(--border-color, #444)',
              borderRadius: 4,
              color: filterBranch ? '#fff' : 'var(--text-secondary, #999)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 11,
            }}
          >
            <Filter size={11} />
            {filterBranch && <span>{filterBranch}</span>}
          </button>
          {showBranchFilter && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--bg-primary, #1e1e1e)',
              border: '1px solid var(--border-color, #444)',
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 50,
              minWidth: 160,
              maxHeight: 200,
              overflowY: 'auto',
            }}>
              <div
                onClick={() => { setFilterBranch(null); setShowBranchFilter(false) }}
                style={{
                  padding: '5px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                  color: !filterBranch ? 'var(--accent-primary, #007acc)' : 'var(--text-secondary, #999)',
                  background: !filterBranch ? 'var(--bg-hover, #2a2d2e)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {!filterBranch && <Check size={11} />}
                All branches
              </div>
              {uniqueBranches.map(branch => (
                <div
                  key={branch}
                  onClick={() => { setFilterBranch(branch); setShowBranchFilter(false) }}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    color: filterBranch === branch ? 'var(--accent-primary, #007acc)' : 'var(--text-primary, #ccc)',
                    background: filterBranch === branch ? 'var(--bg-hover, #2a2d2e)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {filterBranch === branch && <Check size={11} />}
                  <GitBranch size={11} />
                  {branch}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Create Form ─────────────────────────────────────────────────── */}
      {showCreateForm && (
        <StashCreateForm
          onSubmit={handleCreateStash}
          onCancel={() => setShowCreateForm(false)}
          isCreating={isCreating}
        />
      )}

      {/* ── Content Area ────────────────────────────────────────────────── */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Loading state */}
        {loading && stashes.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            gap: 12,
          }}>
            <Loader
              size={24}
              style={{
                color: 'var(--accent-primary, #007acc)',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary, #999)' }}>
              Loading stashes...
            </span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            gap: 12,
          }}>
            <AlertTriangle size={28} style={{ color: 'var(--accent-error, #f85149)' }} />
            <span style={{ fontSize: 12, color: 'var(--accent-error, #f85149)', textAlign: 'center' }}>
              {error}
            </span>
            <button
              onClick={fetchStashes}
              style={{
                padding: '5px 14px',
                fontSize: 11,
                borderRadius: 4,
                border: '1px solid var(--border-color, #444)',
                background: 'transparent',
                color: 'var(--text-primary, #ccc)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <RotateCw size={11} />
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && stashes.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '48px 24px',
            gap: 12,
          }}>
            <Inbox size={36} style={{ color: 'var(--text-muted, #555)', strokeWidth: 1.2 }} />
            <span style={{ fontSize: 13, color: 'var(--text-secondary, #999)', fontWeight: 500 }}>
              No stashes yet
            </span>
            <span style={{
              fontSize: 11,
              color: 'var(--text-muted, #666)',
              textAlign: 'center',
              lineHeight: 1.6,
              maxWidth: 260,
            }}>
              Stashes let you save uncommitted changes temporarily.
              Use <kbd style={{
                padding: '1px 4px',
                borderRadius: 3,
                border: '1px solid var(--border-color, #444)',
                background: 'var(--bg-secondary, #252526)',
                fontSize: 10,
              }}>n</kbd> or the <Plus size={11} style={{ verticalAlign: 'middle' }} /> button to create your first stash.
            </span>
            <button
              onClick={() => setShowCreateForm(true)}
              style={{
                marginTop: 8,
                padding: '6px 16px',
                fontSize: 12,
                borderRadius: 4,
                border: 'none',
                background: 'var(--accent-primary, #007acc)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Archive size={12} />
              Create Stash
            </button>
          </div>
        )}

        {/* No search results */}
        {!loading && !error && stashes.length > 0 && filteredStashes.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 20px',
            gap: 8,
          }}>
            <Search size={24} style={{ color: 'var(--text-muted, #555)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary, #999)' }}>
              No stashes match your search
            </span>
            <button
              onClick={() => { setSearchQuery(''); setFilterBranch(null) }}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                borderRadius: 3,
                border: '1px solid var(--border-color, #444)',
                background: 'transparent',
                color: 'var(--text-secondary, #999)',
                cursor: 'pointer',
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Stash list */}
        {filteredStashes.map((stash, idx) => {
          const isSelected = selectedStashId === stash.id
          const isExpanded = expandedStashId === stash.id
          const isOperating = operatingStashId === stash.id
          const isDragOver = dragState.overIndex === idx && dragState.dragging !== stash.id

          return (
            <div key={stash.id}>
              <div
                draggable
                onDragStart={e => handleDragStart(e, stash.id)}
                onDragOver={e => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                onClick={() => setSelectedStashId(stash.id)}
                onDoubleClick={() => handleViewDiff(stash)}
                onContextMenu={e => handleContextMenu(e, stash.id)}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border-color, #2a2a2a)',
                  background: isSelected
                    ? 'var(--bg-selection, #04395e)'
                    : isDragOver
                    ? 'var(--bg-hover, #2a2d2e)'
                    : 'transparent',
                  cursor: 'pointer',
                  opacity: isOperating ? 0.6 : dragState.dragging === stash.id ? 0.4 : 1,
                  borderTop: isDragOver ? '2px solid var(--accent-primary, #007acc)' : '2px solid transparent',
                  transition: 'background 0.1s, opacity 0.2s',
                  position: 'relative',
                }}
              >
                {/* Top row: index, message, actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <GripVertical
                    size={12}
                    style={{
                      color: 'var(--text-muted, #555)',
                      cursor: 'grab',
                      flexShrink: 0,
                      opacity: 0.5,
                    }}
                  />
                  <span style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: 'var(--accent-primary, #007acc)',
                    flexShrink: 0,
                    fontWeight: 600,
                  }}>
                    {'{' + stash.index + '}'}
                  </span>
                  <span style={{
                    flex: 1,
                    fontSize: 12,
                    color: 'var(--text-primary, #ccc)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}>
                    {stash.message}
                  </span>
                  {isOperating && (
                    <Loader size={12} style={{ color: 'var(--accent-primary, #007acc)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                  )}
                  {!isOperating && (
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); handleApplyStash(stash, false) }}
                        title="Apply"
                        style={{
                          padding: 3,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted, #666)',
                          cursor: 'pointer',
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Download size={12} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handlePopStash(stash) }}
                        title="Pop"
                        style={{
                          padding: 3,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted, #666)',
                          cursor: 'pointer',
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Play size={12} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleViewDiff(stash) }}
                        title="View Diff"
                        style={{
                          padding: 3,
                          background: 'transparent',
                          border: 'none',
                          color: isExpanded ? 'var(--accent-primary, #007acc)' : 'var(--text-muted, #666)',
                          cursor: 'pointer',
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Eye size={12} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmAction({ type: 'drop', stashId: stash.id }) }}
                        title="Drop"
                        style={{
                          padding: 3,
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted, #666)',
                          cursor: 'pointer',
                          borderRadius: 3,
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Meta row: branch, date, stats */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: 18,
                  fontSize: 10,
                  color: 'var(--text-muted, #666)',
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <GitBranch size={10} />
                    {stash.branch}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }} title={formatFullDate(stash.date)}>
                    <Clock size={10} />
                    {formatRelativeDate(stash.date)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, opacity: 0.7 }}>
                    {stash.hash}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <FileText size={10} />
                    {stash.filesChanged}
                  </span>
                  <span style={{ color: 'var(--accent-success, #3fb950)' }}>+{stash.insertions}</span>
                  <span style={{ color: 'var(--accent-error, #f85149)' }}>-{stash.deletions}</span>
                  {stash.untrackedIncluded && (
                    <span style={{
                      padding: '0 4px',
                      borderRadius: 2,
                      background: 'var(--bg-tertiary, #333)',
                      fontSize: 9,
                    }}>
                      +untracked
                    </span>
                  )}
                </div>
              </div>

              {/* Inline diff */}
              {isExpanded && (
                <div style={{
                  borderBottom: '1px solid var(--border-color, #333)',
                  background: 'var(--bg-secondary, #1e1e1e)',
                  maxHeight: 400,
                  overflowY: 'auto',
                }}>
                  {diffLoading ? (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '24px',
                      gap: 8,
                    }}>
                      <Loader size={14} style={{ color: 'var(--accent-primary, #007acc)', animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-secondary, #999)' }}>Loading diff...</span>
                    </div>
                  ) : diffData ? (
                    <InlineDiffViewer diff={diffData} />
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Keyboard hints ──────────────────────────────────────────────── */}
      {!loading && stashes.length > 0 && (
        <div style={{
          padding: '4px 12px',
          borderTop: '1px solid var(--border-color, #333)',
          background: 'var(--bg-secondary, #252526)',
          fontSize: 10,
          color: 'var(--text-muted, #555)',
          display: 'flex',
          gap: 10,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <span><kbd style={kbdStyle}>a</kbd> apply</span>
          <span><kbd style={kbdStyle}>p</kbd> pop</span>
          <span><kbd style={kbdStyle}>d</kbd> drop</span>
          <span><kbd style={kbdStyle}>Enter</kbd> diff</span>
          <span><kbd style={kbdStyle}>n</kbd> new</span>
          <span><kbd style={kbdStyle}>/</kbd> search</span>
          <span><kbd style={kbdStyle}>r</kbd> refresh</span>
        </div>
      )}

      {/* ── Context Menu ────────────────────────────────────────────────── */}
      {contextMenu.visible && contextMenuStash && (
        <div
          style={{
            position: 'absolute',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-primary, #1e1e1e)',
            border: '1px solid var(--border-color, #444)',
            borderRadius: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 200,
            minWidth: 180,
            padding: '4px 0',
          }}
        >
          {([
            { action: 'apply', label: 'Apply Stash', icon: <Download size={12} /> },
            { action: 'apply-drop', label: 'Apply & Drop', icon: <Check size={12} /> },
            { action: 'pop', label: 'Pop Stash', icon: <Play size={12} /> },
            { action: 'diff', label: 'View Diff', icon: <Eye size={12} /> },
            { action: 'separator' },
            { action: 'branch', label: 'Create Branch from Stash', icon: <GitBranch size={12} /> },
            { action: 'copy-hash', label: 'Copy Hash', icon: <Copy size={12} /> },
            { action: 'separator' },
            { action: 'drop', label: 'Drop Stash', icon: <Trash2 size={12} />, danger: true },
          ] as Array<{ action: string; label?: string; icon?: React.ReactNode; danger?: boolean }>).map((item, i) => {
            if (item.action === 'separator') {
              return <div key={i} style={{ height: 1, background: 'var(--border-color, #333)', margin: '4px 0' }} />
            }
            return (
              <div
                key={item.action}
                onClick={() => handleContextAction(item.action)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 12px',
                  fontSize: 11,
                  cursor: 'pointer',
                  color: item.danger ? 'var(--accent-error, #f85149)' : 'var(--text-primary, #ccc)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover, #2a2d2e)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                {item.icon}
                {item.label}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Confirm Dialog ──────────────────────────────────────────────── */}
      {confirmAction && confirmAction.type === 'drop' && (
        <ConfirmDialog
          title="Drop Stash"
          message={`Are you sure you want to drop stash@{${stashes.find(s => s.id === confirmAction.stashId)?.index ?? '?'}}? This cannot be undone.`}
          confirmLabel="Drop"
          danger
          onConfirm={resolveConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {confirmAction && confirmAction.type === 'clear' && (
        <ConfirmDialog
          title="Clear All Stashes"
          message={`Are you sure you want to drop all ${stashes.length} stash${stashes.length !== 1 ? 'es' : ''}? This cannot be undone.`}
          confirmLabel="Clear All"
          danger
          onConfirm={resolveConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {/* ── Branch from Stash Dialog ────────────────────────────────────── */}
      {branchDialog && (
        <BranchFromStashDialog
          stash={branchDialog}
          onSubmit={name => handleCreateBranch(branchDialog, name)}
          onCancel={() => setBranchDialog(null)}
        />
      )}

      {/* ── Keyframe animation for spinner ──────────────────────────────── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ─── Shared Styles ──────────────────────────────────────────────────────────

const kbdStyle: React.CSSProperties = {
  padding: '0px 3px',
  borderRadius: 2,
  border: '1px solid var(--border-color, #444)',
  background: 'var(--bg-tertiary, #333)',
  fontSize: 9,
  fontFamily: 'var(--font-mono, monospace)',
  marginRight: 2,
}
