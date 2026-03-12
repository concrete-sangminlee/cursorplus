import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Archive,
  Trash2,
  Play,
  Download,
  Search,
  Plus,
  ChevronRight,
  ChevronDown,
  FileText,
  GitBranch,
  Clock,
  AlertTriangle,
  X,
  MoreHorizontal,
  Copy,
  Eye,
  ArrowRightLeft,
  RefreshCw,
  Filter,
  Check,
  Layers,
  Box,
  Hash,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface StashEntry {
  index: number
  message: string
  branch: string
  date: string
  files: StashFile[]
  hash: string
  includesUntracked: boolean
}

interface StashFile {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed'
  additions: number
  deletions: number
}

interface DiffLine {
  type: 'added' | 'removed' | 'context' | 'header'
  content: string
  lineNumber?: number
}

interface StashComparison {
  leftIndex: number
  rightIndex: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  modified: '#d29922',
  added: '#3fb950',
  deleted: '#f85149',
  renamed: '#d2a8ff',
}

const STATUS_LABELS: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
}

const BRANCH_COLORS = [
  '#388bfd', '#3fb950', '#d29922', '#f85149', '#d2a8ff',
  '#f78166', '#a5d6ff', '#7ee787', '#ff7b72', '#79c0ff',
]

const getBranchColor = (name: string): string => {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return BRANCH_COLORS[Math.abs(hash) % BRANCH_COLORS.length]
}

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_STASH_FILES: StashFile[][] = [
  [
    { path: 'src/components/Header.tsx', status: 'modified', additions: 24, deletions: 8 },
    { path: 'src/utils/auth.ts', status: 'modified', additions: 15, deletions: 3 },
    { path: 'src/hooks/useSession.ts', status: 'added', additions: 42, deletions: 0 },
  ],
  [
    { path: 'src/panels/SearchPanel.tsx', status: 'modified', additions: 67, deletions: 31 },
    { path: 'src/store/search.ts', status: 'modified', additions: 18, deletions: 5 },
    { path: 'src/types/search.d.ts', status: 'added', additions: 22, deletions: 0 },
    { path: 'tests/search.test.ts', status: 'added', additions: 88, deletions: 0 },
  ],
  [
    { path: 'package.json', status: 'modified', additions: 3, deletions: 2 },
    { path: 'package-lock.json', status: 'modified', additions: 412, deletions: 198 },
  ],
  [
    { path: 'src/App.tsx', status: 'modified', additions: 11, deletions: 4 },
    { path: 'src/components/Sidebar.tsx', status: 'modified', additions: 35, deletions: 12 },
    { path: 'src/components/Sidebar.css', status: 'deleted', additions: 0, deletions: 78 },
    { path: 'src/styles/sidebar.module.css', status: 'added', additions: 92, deletions: 0 },
    { path: 'src/components/Navbar.tsx', status: 'renamed', additions: 5, deletions: 2 },
  ],
  [
    { path: '.env.local', status: 'modified', additions: 2, deletions: 1 },
    { path: 'src/config/api.ts', status: 'modified', additions: 8, deletions: 4 },
    { path: 'src/services/client.ts', status: 'added', additions: 56, deletions: 0 },
  ],
  [
    { path: 'src/panels/EditorPanel.tsx', status: 'modified', additions: 120, deletions: 45 },
    { path: 'src/store/editor.ts', status: 'modified', additions: 30, deletions: 8 },
    { path: 'src/components/EditorMinimap.tsx', status: 'added', additions: 210, deletions: 0 },
    { path: 'src/components/CodeLens.tsx', status: 'added', additions: 85, deletions: 0 },
    { path: 'src/types/editor.d.ts', status: 'modified', additions: 14, deletions: 2 },
    { path: 'tests/editor.test.ts', status: 'modified', additions: 45, deletions: 10 },
  ],
]

const MOCK_STASHES: StashEntry[] = [
  {
    index: 0,
    message: 'WIP: authentication refactor with OAuth2 integration',
    branch: 'feature/auth-v2',
    date: '2026-03-12T09:32:00Z',
    files: MOCK_STASH_FILES[0],
    hash: 'a3b1c2d',
    includesUntracked: false,
  },
  {
    index: 1,
    message: 'feat: fuzzy search implementation - needs testing',
    branch: 'feature/search-overhaul',
    date: '2026-03-11T17:45:00Z',
    files: MOCK_STASH_FILES[1],
    hash: 'e4f5g6h',
    includesUntracked: true,
  },
  {
    index: 2,
    message: 'chore: dependency update (breaking change investigation)',
    branch: 'main',
    date: '2026-03-10T14:20:00Z',
    files: MOCK_STASH_FILES[2],
    hash: 'i7j8k9l',
    includesUntracked: false,
  },
  {
    index: 3,
    message: 'refactor: sidebar CSS modules migration',
    branch: 'refactor/css-modules',
    date: '2026-03-09T11:05:00Z',
    files: MOCK_STASH_FILES[3],
    hash: 'm0n1o2p',
    includesUntracked: true,
  },
  {
    index: 4,
    message: 'WIP: API client configuration for staging env',
    branch: 'feature/staging-env',
    date: '2026-03-08T08:50:00Z',
    files: MOCK_STASH_FILES[4],
    hash: 'q3r4s5t',
    includesUntracked: false,
  },
  {
    index: 5,
    message: 'feat: editor minimap and code lens (incomplete)',
    branch: 'feature/editor-enhancements',
    date: '2026-03-06T21:15:00Z',
    files: MOCK_STASH_FILES[5],
    hash: 'u6v7w8x',
    includesUntracked: true,
  },
]

const MOCK_DIFF_LINES: DiffLine[] = [
  { type: 'header', content: '@@ -15,8 +15,12 @@ export function Header({ user }: HeaderProps) {' },
  { type: 'context', content: '  const [menuOpen, setMenuOpen] = useState(false)', lineNumber: 15 },
  { type: 'context', content: '  const navigate = useNavigate()', lineNumber: 16 },
  { type: 'context', content: '', lineNumber: 17 },
  { type: 'removed', content: '  const handleLogout = () => {', lineNumber: 18 },
  { type: 'removed', content: '    localStorage.removeItem("token")', lineNumber: 19 },
  { type: 'removed', content: '    navigate("/login")', lineNumber: 20 },
  { type: 'added', content: '  const handleLogout = useCallback(async () => {', lineNumber: 18 },
  { type: 'added', content: '    try {', lineNumber: 19 },
  { type: 'added', content: '      await authService.revokeToken()', lineNumber: 20 },
  { type: 'added', content: '      sessionStorage.clear()', lineNumber: 21 },
  { type: 'added', content: '      localStorage.removeItem("token")', lineNumber: 22 },
  { type: 'added', content: '      navigate("/login")', lineNumber: 23 },
  { type: 'added', content: '    } catch (err) {', lineNumber: 24 },
  { type: 'added', content: '      console.error("Logout failed:", err)', lineNumber: 25 },
  { type: 'added', content: '    }', lineNumber: 26 },
  { type: 'context', content: '  }', lineNumber: 27 },
  { type: 'context', content: '', lineNumber: 28 },
  { type: 'context', content: '  return (', lineNumber: 29 },
]

const AVAILABLE_BRANCHES = [
  'main', 'develop', 'feature/auth-v2', 'feature/search-overhaul',
  'refactor/css-modules', 'feature/staging-env', 'feature/editor-enhancements',
  'hotfix/login-redirect', 'release/v2.1.0',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatRelativeDate(dateStr: string): string {
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getFileName(path: string): string {
  return path.split('/').pop() || path
}

function getDirectory(path: string): string {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

function StashCreateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (message: string, includeUntracked: boolean, keepIndex: boolean) => void
}) {
  const [message, setMessage] = useState('')
  const [includeUntracked, setIncludeUntracked] = useState(false)
  const [keepIndex, setKeepIndex] = useState(false)

  const handleSubmit = useCallback(() => {
    onCreate(message || 'WIP', includeUntracked, keepIndex)
    onClose()
  }, [message, includeUntracked, keepIndex, onCreate, onClose])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, handleSubmit])

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#252526', border: '1px solid #3c3c3c', borderRadius: 8,
        padding: 20, width: 420, maxWidth: '90%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: '#e1e4e8', fontSize: 14, fontWeight: 600 }}>Create Stash</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 6 }}>
            Stash Message
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="WIP: describe your changes..."
            autoFocus
            style={{
              width: '100%', padding: '8px 12px', background: '#1e1e1e',
              border: '1px solid #3c3c3c', borderRadius: 4, color: '#e1e4e8',
              fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            color: '#c9d1d9', fontSize: 13,
          }}>
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
              style={{ accentColor: '#388bfd' }}
            />
            Include untracked files
          </label>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            color: '#c9d1d9', fontSize: 13,
          }}>
            <input
              type="checkbox"
              checked={keepIndex}
              onChange={(e) => setKeepIndex(e.target.checked)}
              style={{ accentColor: '#388bfd' }}
            />
            Keep staged changes (--keep-index)
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', background: 'transparent', border: '1px solid #3c3c3c',
              borderRadius: 4, color: '#c9d1d9', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '6px 16px', background: '#388bfd', border: 'none',
              borderRadius: 4, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 500,
            }}
          >
            Stash Changes
          </button>
        </div>

        <div style={{ marginTop: 12, color: '#6e7681', fontSize: 11, textAlign: 'center' }}>
          Ctrl+Enter to confirm &middot; Escape to cancel
        </div>
      </div>
    </div>
  )
}

function ApplyToBranchDialog({
  stash,
  onClose,
  onApply,
}: {
  stash: StashEntry
  onClose: () => void
  onApply: (stashIndex: number, branch: string) => void
}) {
  const [selectedBranch, setSelectedBranch] = useState('')
  const [branchFilter, setBranchFilter] = useState('')

  const filteredBranches = useMemo(() => {
    return AVAILABLE_BRANCHES.filter((b) =>
      b.toLowerCase().includes(branchFilter.toLowerCase())
    )
  }, [branchFilter])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: '#252526', border: '1px solid #3c3c3c', borderRadius: 8,
        padding: 20, width: 400, maxWidth: '90%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ color: '#e1e4e8', fontSize: 14, fontWeight: 600 }}>Apply Stash to Branch</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 4 }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{
          padding: '8px 12px', background: '#1e1e1e', borderRadius: 4, marginBottom: 14,
          color: '#8b949e', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Archive size={14} />
          <span style={{ color: '#c9d1d9' }}>stash@{'{' + stash.index + '}'}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {stash.message}
          </span>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#8b949e', fontSize: 12, display: 'block', marginBottom: 6 }}>
            Target Branch
          </label>
          <input
            type="text"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            placeholder="Search branches..."
            autoFocus
            style={{
              width: '100%', padding: '8px 12px', background: '#1e1e1e',
              border: '1px solid #3c3c3c', borderRadius: 4, color: '#e1e4e8',
              fontSize: 13, outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{
          maxHeight: 180, overflowY: 'auto', border: '1px solid #3c3c3c',
          borderRadius: 4, marginBottom: 16,
        }}>
          {filteredBranches.map((branch) => (
            <div
              key={branch}
              onClick={() => setSelectedBranch(branch)}
              style={{
                padding: '8px 12px', cursor: 'pointer', display: 'flex',
                alignItems: 'center', gap: 8, fontSize: 13,
                background: selectedBranch === branch ? '#04395e' : 'transparent',
                color: selectedBranch === branch ? '#58a6ff' : '#c9d1d9',
              }}
            >
              <GitBranch size={14} style={{ color: getBranchColor(branch) }} />
              <span>{branch}</span>
              {selectedBranch === branch && (
                <Check size={14} style={{ marginLeft: 'auto', color: '#3fb950' }} />
              )}
            </div>
          ))}
          {filteredBranches.length === 0 && (
            <div style={{ padding: 12, color: '#6e7681', fontSize: 12, textAlign: 'center' }}>
              No branches found
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', background: 'transparent', border: '1px solid #3c3c3c',
              borderRadius: 4, color: '#c9d1d9', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selectedBranch) {
                onApply(stash.index, selectedBranch)
                onClose()
              }
            }}
            disabled={!selectedBranch}
            style={{
              padding: '6px 16px', background: selectedBranch ? '#388bfd' : '#2d333b',
              border: 'none', borderRadius: 4,
              color: selectedBranch ? '#fff' : '#6e7681',
              fontSize: 13, cursor: selectedBranch ? 'pointer' : 'not-allowed', fontWeight: 500,
            }}
          >
            Apply to Branch
          </button>
        </div>
      </div>
    </div>
  )
}

function StashDiffView({ stash, file }: { stash: StashEntry; file: StashFile }) {
  return (
    <div style={{
      background: '#1e1e1e', borderRadius: 4, overflow: 'hidden',
      border: '1px solid #2d333b', margin: '8px 0',
    }}>
      <div style={{
        padding: '6px 12px', background: '#252526', borderBottom: '1px solid #2d333b',
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8b949e',
      }}>
        <FileText size={12} />
        <span style={{ color: '#c9d1d9' }}>{file.path}</span>
        <span style={{ marginLeft: 'auto', color: '#3fb950' }}>+{file.additions}</span>
        <span style={{ color: '#f85149' }}>-{file.deletions}</span>
      </div>
      <div style={{ fontFamily: 'Consolas, "Courier New", monospace', fontSize: 12 }}>
        {MOCK_DIFF_LINES.map((line, idx) => (
          <div
            key={idx}
            style={{
              padding: '1px 12px 1px 8px',
              display: 'flex',
              background:
                line.type === 'added' ? 'rgba(63, 185, 80, 0.1)' :
                line.type === 'removed' ? 'rgba(248, 81, 73, 0.1)' :
                line.type === 'header' ? 'rgba(56, 139, 253, 0.08)' :
                'transparent',
              color:
                line.type === 'added' ? '#3fb950' :
                line.type === 'removed' ? '#f85149' :
                line.type === 'header' ? '#79c0ff' :
                '#8b949e',
            }}
          >
            <span style={{
              width: 40, textAlign: 'right', paddingRight: 12, userSelect: 'none',
              color: '#484f58', flexShrink: 0,
            }}>
              {line.lineNumber || ''}
            </span>
            <span style={{
              width: 14, flexShrink: 0, textAlign: 'center', userSelect: 'none',
              color:
                line.type === 'added' ? '#3fb950' :
                line.type === 'removed' ? '#f85149' :
                'transparent',
            }}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span style={{ whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {line.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StashCompareView({
  left,
  right,
  onClose,
}: {
  left: StashEntry
  right: StashEntry
  onClose: () => void
}) {
  const allFiles = useMemo(() => {
    const paths = new Set<string>()
    left.files.forEach((f) => paths.add(f.path))
    right.files.forEach((f) => paths.add(f.path))
    return Array.from(paths).sort()
  }, [left, right])

  const getFileInStash = (stash: StashEntry, path: string) =>
    stash.files.find((f) => f.path === path)

  return (
    <div style={{
      background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: 6,
      margin: '8px 0', overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', background: '#252526', borderBottom: '1px solid #3c3c3c',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e1e4e8' }}>
          <ArrowRightLeft size={14} style={{ color: '#d2a8ff' }} />
          <span>Comparing stash@{'{' + left.index + '}'} vs stash@{'{' + right.index + '}'}</span>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #2d333b' }}>
        <div style={{ padding: '6px 12px', borderRight: '1px solid #2d333b', fontSize: 12, color: '#8b949e' }}>
          <span style={{ color: '#79c0ff' }}>stash@{'{' + left.index + '}'}</span> &mdash; {left.message}
        </div>
        <div style={{ padding: '6px 12px', fontSize: 12, color: '#8b949e' }}>
          <span style={{ color: '#79c0ff' }}>stash@{'{' + right.index + '}'}</span> &mdash; {right.message}
        </div>
      </div>

      <div>
        {allFiles.map((path) => {
          const leftFile = getFileInStash(left, path)
          const rightFile = getFileInStash(right, path)
          return (
            <div
              key={path}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                borderBottom: '1px solid #2d333b', fontSize: 12,
              }}
            >
              <div style={{
                padding: '4px 12px', borderRight: '1px solid #2d333b',
                display: 'flex', alignItems: 'center', gap: 6,
                color: leftFile ? '#c9d1d9' : '#484f58',
              }}>
                {leftFile ? (
                  <>
                    <span style={{
                      color: STATUS_COLORS[leftFile.status],
                      fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
                    }}>
                      {STATUS_LABELS[leftFile.status]}
                    </span>
                    <span>{getFileName(path)}</span>
                    <span style={{ color: '#3fb950', marginLeft: 'auto' }}>+{leftFile.additions}</span>
                    <span style={{ color: '#f85149' }}>-{leftFile.deletions}</span>
                  </>
                ) : (
                  <span style={{ fontStyle: 'italic' }}>not in stash</span>
                )}
              </div>
              <div style={{
                padding: '4px 12px',
                display: 'flex', alignItems: 'center', gap: 6,
                color: rightFile ? '#c9d1d9' : '#484f58',
              }}>
                {rightFile ? (
                  <>
                    <span style={{
                      color: STATUS_COLORS[rightFile.status],
                      fontFamily: 'monospace', fontSize: 11, fontWeight: 600,
                    }}>
                      {STATUS_LABELS[rightFile.status]}
                    </span>
                    <span>{getFileName(path)}</span>
                    <span style={{ color: '#3fb950', marginLeft: 'auto' }}>+{rightFile.additions}</span>
                    <span style={{ color: '#f85149' }}>-{rightFile.deletions}</span>
                  </>
                ) : (
                  <span style={{ fontStyle: 'italic' }}>not in stash</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function GitStashPanel() {
  const [stashes, setStashes] = useState<StashEntry[]>(MOCK_STASHES)
  const [expandedStash, setExpandedStash] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showApplyToBranch, setShowApplyToBranch] = useState<StashEntry | null>(null)
  const [selectedDiffFile, setSelectedDiffFile] = useState<{ stashIndex: number; file: StashFile } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ stash: StashEntry; x: number; y: number } | null>(null)
  const [confirmDrop, setConfirmDrop] = useState<number | null>(null)
  const [confirmDropAll, setConfirmDropAll] = useState(false)
  const [autoStashActive, setAutoStashActive] = useState(false)
  const [compareSelection, setCompareSelection] = useState<StashComparison | null>(null)
  const [compareFirstPick, setCompareFirstPick] = useState<number | null>(null)
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'branch' | 'files'>('date')

  // Simulated auto-stash indicator toggle
  useEffect(() => {
    const timer = setTimeout(() => setAutoStashActive(true), 8000)
    const offTimer = setTimeout(() => setAutoStashActive(false), 14000)
    return () => { clearTimeout(timer); clearTimeout(offTimer) }
  }, [])

  // Keyboard shortcut: Ctrl+Shift+S to quick stash
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        setShowCreateDialog(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return
    const handleClick = () => setContextMenu(null)
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [contextMenu])

  // Auto-dismiss notifications
  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(() => setNotification(null), 3000)
    return () => clearTimeout(timer)
  }, [notification])

  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type })
  }, [])

  const filteredStashes = useMemo(() => {
    let result = stashes
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter((s) =>
        s.message.toLowerCase().includes(q) ||
        s.branch.toLowerCase().includes(q) ||
        s.hash.toLowerCase().includes(q) ||
        s.files.some((f) => f.path.toLowerCase().includes(q))
      )
    }
    if (sortBy === 'branch') {
      result = [...result].sort((a, b) => a.branch.localeCompare(b.branch))
    } else if (sortBy === 'files') {
      result = [...result].sort((a, b) => b.files.length - a.files.length)
    }
    return result
  }, [stashes, searchQuery, sortBy])

  const handleApply = useCallback((index: number) => {
    showNotification(`Applied stash@{${index}} successfully`)
  }, [showNotification])

  const handlePop = useCallback((index: number) => {
    setStashes((prev) => prev.filter((s) => s.index !== index))
    setExpandedStash(null)
    showNotification(`Popped stash@{${index}} successfully`)
  }, [showNotification])

  const handleDrop = useCallback((index: number) => {
    setStashes((prev) => prev.filter((s) => s.index !== index))
    setExpandedStash(null)
    setConfirmDrop(null)
    showNotification(`Dropped stash@{${index}}`)
  }, [showNotification])

  const handleDropAll = useCallback(() => {
    setStashes([])
    setExpandedStash(null)
    setConfirmDropAll(false)
    showNotification('All stashes cleared')
  }, [showNotification])

  const handleCreate = useCallback((message: string, includeUntracked: boolean, _keepIndex: boolean) => {
    const newStash: StashEntry = {
      index: stashes.length > 0 ? Math.max(...stashes.map((s) => s.index)) + 1 : 0,
      message,
      branch: 'main',
      date: new Date().toISOString(),
      files: [
        { path: 'src/components/NewComponent.tsx', status: 'added', additions: 35, deletions: 0 },
        { path: 'src/utils/helpers.ts', status: 'modified', additions: 12, deletions: 4 },
      ],
      hash: Math.random().toString(36).substring(2, 9),
      includesUntracked: includeUntracked,
    }
    setStashes((prev) => [newStash, ...prev])
    showNotification(`Created stash: ${message}`)
  }, [stashes, showNotification])

  const handleApplyToBranch = useCallback((stashIndex: number, branch: string) => {
    showNotification(`Applied stash@{${stashIndex}} to branch "${branch}"`)
  }, [showNotification])

  const handleCompareSelect = useCallback((index: number) => {
    if (compareFirstPick === null) {
      setCompareFirstPick(index)
      showNotification(`Selected stash@{${index}} for comparison. Pick a second stash.`, 'info')
    } else {
      if (compareFirstPick === index) {
        setCompareFirstPick(null)
        showNotification('Comparison cancelled', 'info')
      } else {
        setCompareSelection({ leftIndex: compareFirstPick, rightIndex: index })
        setCompareFirstPick(null)
      }
    }
  }, [compareFirstPick, showNotification])

  const toggleExpand = useCallback((index: number) => {
    setExpandedStash((prev) => (prev === index ? null : index))
    setSelectedDiffFile(null)
  }, [])

  const totalFiles = useMemo(() => stashes.reduce((sum, s) => sum + s.files.length, 0), [stashes])

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#1e1e1e', color: '#c9d1d9', position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Notification */}
      {notification && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 16px', borderRadius: 4, fontSize: 12, zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 8,
          background:
            notification.type === 'success' ? '#1a3a2a' :
            notification.type === 'error' ? '#3a1a1a' : '#1a2a3a',
          border: `1px solid ${
            notification.type === 'success' ? '#3fb950' :
            notification.type === 'error' ? '#f85149' : '#388bfd'
          }`,
          color:
            notification.type === 'success' ? '#3fb950' :
            notification.type === 'error' ? '#f85149' : '#79c0ff',
        }}>
          {notification.type === 'success' && <Check size={14} />}
          {notification.type === 'error' && <AlertTriangle size={14} />}
          {notification.type === 'info' && <Archive size={14} />}
          {notification.message}
        </div>
      )}

      {/* Auto-stash indicator */}
      {autoStashActive && (
        <div style={{
          padding: '6px 12px', background: 'rgba(210, 153, 34, 0.12)',
          borderBottom: '1px solid rgba(210, 153, 34, 0.3)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#d29922',
        }}>
          <RefreshCw size={12} style={{ animation: 'spin 2s linear infinite' }} />
          Auto-stash active during rebase &mdash; changes will be restored automatically
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Header */}
      <div style={{
        padding: '10px 12px', borderBottom: '1px solid #2d333b',
        display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Archive size={16} style={{ color: '#d2a8ff' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e1e4e8' }}>Stashes</span>
            <span style={{
              fontSize: 11, padding: '1px 6px', borderRadius: 10,
              background: '#30363d', color: '#8b949e',
            }}>
              {stashes.length}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setShowCreateDialog(true)}
              title="Create Stash (Ctrl+Shift+S)"
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                color: '#8b949e', borderRadius: 4, display: 'flex', alignItems: 'center',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#30363d')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <Plus size={16} />
            </button>
            {compareFirstPick !== null && (
              <button
                onClick={() => { setCompareFirstPick(null); showNotification('Comparison cancelled', 'info') }}
                title="Cancel comparison"
                style={{
                  background: 'rgba(210, 168, 255, 0.1)', border: '1px solid #d2a8ff',
                  cursor: 'pointer', padding: '2px 8px', color: '#d2a8ff', borderRadius: 4,
                  fontSize: 11, display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                <X size={12} /> Cancel Compare
              </button>
            )}
            {stashes.length > 1 && compareFirstPick === null && (
              <button
                onClick={() => handleCompareSelect(stashes[0].index)}
                title="Compare two stashes"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: '#8b949e', borderRadius: 4, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#30363d')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <ArrowRightLeft size={16} />
              </button>
            )}
            {stashes.length > 0 && (
              <button
                onClick={() => setConfirmDropAll(true)}
                title="Drop all stashes"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                  color: '#8b949e', borderRadius: 4, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#3a1a1a'; e.currentTarget.style.color = '#f85149' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8b949e' }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: '#252526', border: '1px solid #3c3c3c', borderRadius: 4,
            padding: '4px 8px',
          }}>
            <Search size={14} style={{ color: '#6e7681', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search stashes..."
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#e1e4e8', fontSize: 12,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'branch' | 'files')}
            style={{
              background: '#252526', border: '1px solid #3c3c3c', borderRadius: 4,
              color: '#8b949e', fontSize: 11, padding: '4px 6px', outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="date">By Date</option>
            <option value="branch">By Branch</option>
            <option value="files">By Files</option>
          </select>
        </div>

        {/* Stats bar */}
        {stashes.length > 0 && (
          <div style={{
            display: 'flex', gap: 16, fontSize: 11, color: '#6e7681',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Layers size={11} /> {stashes.length} stash{stashes.length !== 1 ? 'es' : ''}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileText size={11} /> {totalFiles} file{totalFiles !== 1 ? 's' : ''} total
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <GitBranch size={11} /> {new Set(stashes.map((s) => s.branch)).size} branch{new Set(stashes.map((s) => s.branch)).size !== 1 ? 'es' : ''}
            </span>
          </div>
        )}
      </div>

      {/* Confirm Drop All */}
      {confirmDropAll && (
        <div style={{
          padding: '10px 12px', background: 'rgba(248, 81, 73, 0.08)',
          borderBottom: '1px solid rgba(248, 81, 73, 0.3)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flexShrink: 0,
        }}>
          <AlertTriangle size={14} style={{ color: '#f85149', flexShrink: 0 }} />
          <span style={{ color: '#f85149', flex: 1 }}>
            Drop all {stashes.length} stashes? This cannot be undone.
          </span>
          <button
            onClick={handleDropAll}
            style={{
              padding: '3px 10px', background: '#da3633', border: 'none',
              borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 500,
            }}
          >
            Drop All
          </button>
          <button
            onClick={() => setConfirmDropAll(false)}
            style={{
              padding: '3px 10px', background: 'transparent', border: '1px solid #3c3c3c',
              borderRadius: 4, color: '#c9d1d9', fontSize: 11, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Comparison view */}
      {compareSelection && (
        <div style={{ padding: '0 12px', flexShrink: 0 }}>
          <StashCompareView
            left={stashes.find((s) => s.index === compareSelection.leftIndex)!}
            right={stashes.find((s) => s.index === compareSelection.rightIndex)!}
            onClose={() => setCompareSelection(null)}
          />
        </div>
      )}

      {/* Stash list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredStashes.length === 0 && stashes.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 12, padding: 24,
          }}>
            <Archive size={40} style={{ color: '#30363d' }} />
            <span style={{ color: '#6e7681', fontSize: 14, fontWeight: 500 }}>No Stashes</span>
            <span style={{ color: '#484f58', fontSize: 12, textAlign: 'center', lineHeight: 1.6 }}>
              Stash your uncommitted changes to save them for later.<br />
              Use <kbd style={{
                padding: '1px 5px', background: '#30363d', borderRadius: 3,
                fontSize: 11, border: '1px solid #484f58',
              }}>Ctrl+Shift+S</kbd> to quickly stash your work.
            </span>
            <button
              onClick={() => setShowCreateDialog(true)}
              style={{
                marginTop: 8, padding: '6px 16px', background: '#388bfd', border: 'none',
                borderRadius: 4, color: '#fff', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <Plus size={14} /> Create Stash
            </button>
          </div>
        )}

        {filteredStashes.length === 0 && stashes.length > 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 40, gap: 8,
          }}>
            <Search size={28} style={{ color: '#30363d' }} />
            <span style={{ color: '#6e7681', fontSize: 13 }}>No stashes match "{searchQuery}"</span>
            <button
              onClick={() => setSearchQuery('')}
              style={{
                padding: '4px 12px', background: 'transparent', border: '1px solid #3c3c3c',
                borderRadius: 4, color: '#79c0ff', fontSize: 12, cursor: 'pointer',
              }}
            >
              Clear search
            </button>
          </div>
        )}

        {filteredStashes.map((stash) => {
          const isExpanded = expandedStash === stash.index
          const isCompareTarget = compareFirstPick !== null
          const isCompareSelected = compareFirstPick === stash.index

          return (
            <div key={stash.hash} style={{ borderBottom: '1px solid #2d333b' }}>
              {/* Stash header row */}
              <div
                onClick={() => isCompareTarget ? handleCompareSelect(stash.index) : toggleExpand(stash.index)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ stash, x: e.clientX, y: e.clientY })
                }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', display: 'flex',
                  alignItems: 'flex-start', gap: 8,
                  background: isCompareSelected
                    ? 'rgba(210, 168, 255, 0.08)'
                    : isExpanded
                    ? '#252526'
                    : 'transparent',
                  borderLeft: isCompareSelected ? '2px solid #d2a8ff' : '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded && !isCompareSelected) e.currentTarget.style.background = '#252526'
                }}
                onMouseLeave={(e) => {
                  if (!isExpanded && !isCompareSelected) e.currentTarget.style.background = 'transparent'
                }}
              >
                {/* Expand chevron */}
                <div style={{ paddingTop: 2, flexShrink: 0, color: '#6e7681' }}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>

                {/* Main content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, fontFamily: 'monospace', color: '#79c0ff',
                      background: '#0d1117', padding: '1px 5px', borderRadius: 3,
                      flexShrink: 0,
                    }}>
                      stash@{'{' + stash.index + '}'}
                    </span>
                    <span style={{
                      fontSize: 13, color: '#e1e4e8', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {stash.message}
                    </span>
                  </div>

                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#6e7681',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <GitBranch size={11} style={{ color: getBranchColor(stash.branch) }} />
                      {stash.branch}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={formatFullDate(stash.date)}>
                      <Clock size={11} />
                      {formatRelativeDate(stash.date)}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <FileText size={11} />
                      {stash.files.length} file{stash.files.length !== 1 ? 's' : ''}
                    </span>
                    <span style={{
                      fontSize: 10, fontFamily: 'monospace', color: '#484f58',
                    }}>
                      {stash.hash}
                    </span>
                    {stash.includesUntracked && (
                      <span style={{
                        fontSize: 10, padding: '0 4px', borderRadius: 3,
                        background: 'rgba(210, 153, 34, 0.15)', color: '#d29922',
                      }}>
                        +untracked
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick actions */}
                {!isCompareTarget && (
                  <div
                    style={{ display: 'flex', gap: 2, flexShrink: 0, paddingTop: 2 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleApply(stash.index)}
                      title="Apply stash"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: '#8b949e', borderRadius: 4, display: 'flex',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#1a3a2a'; e.currentTarget.style.color = '#3fb950' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8b949e' }}
                    >
                      <Play size={14} />
                    </button>
                    <button
                      onClick={() => handlePop(stash.index)}
                      title="Pop stash (apply and remove)"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: '#8b949e', borderRadius: 4, display: 'flex',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#1a2a3a'; e.currentTarget.style.color = '#388bfd' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8b949e' }}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDrop(stash.index)}
                      title="Drop stash"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: '#8b949e', borderRadius: 4, display: 'flex',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#3a1a1a'; e.currentTarget.style.color = '#f85149' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8b949e' }}
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setContextMenu({ stash, x: e.clientX, y: e.clientY })
                      }}
                      title="More actions"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: '#8b949e', borderRadius: 4, display: 'flex',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#30363d')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                  </div>
                )}
              </div>

              {/* Drop confirmation inline */}
              {confirmDrop === stash.index && (
                <div style={{
                  padding: '6px 12px 6px 36px', background: 'rgba(248, 81, 73, 0.06)',
                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                }}>
                  <AlertTriangle size={12} style={{ color: '#f85149' }} />
                  <span style={{ color: '#f85149' }}>Drop this stash? This cannot be undone.</span>
                  <button
                    onClick={() => handleDrop(stash.index)}
                    style={{
                      padding: '2px 8px', background: '#da3633', border: 'none',
                      borderRadius: 3, color: '#fff', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Drop
                  </button>
                  <button
                    onClick={() => setConfirmDrop(null)}
                    style={{
                      padding: '2px 8px', background: 'transparent', border: '1px solid #3c3c3c',
                      borderRadius: 3, color: '#c9d1d9', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Expanded stash details */}
              {isExpanded && (
                <div style={{
                  padding: '4px 12px 8px 36px', background: '#252526',
                  borderTop: '1px solid #2d333b',
                }}>
                  {/* Expanded action bar */}
                  <div style={{
                    display: 'flex', gap: 6, marginBottom: 8, paddingBottom: 8,
                    borderBottom: '1px solid #2d333b', flexWrap: 'wrap',
                  }}>
                    <button
                      onClick={() => handleApply(stash.index)}
                      style={{
                        padding: '3px 10px', background: 'rgba(63, 185, 80, 0.1)',
                        border: '1px solid rgba(63, 185, 80, 0.3)', borderRadius: 4,
                        color: '#3fb950', fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Play size={11} /> Apply
                    </button>
                    <button
                      onClick={() => handlePop(stash.index)}
                      style={{
                        padding: '3px 10px', background: 'rgba(56, 139, 253, 0.1)',
                        border: '1px solid rgba(56, 139, 253, 0.3)', borderRadius: 4,
                        color: '#388bfd', fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Download size={11} /> Pop
                    </button>
                    <button
                      onClick={() => setShowApplyToBranch(stash)}
                      style={{
                        padding: '3px 10px', background: 'rgba(210, 168, 255, 0.1)',
                        border: '1px solid rgba(210, 168, 255, 0.3)', borderRadius: 4,
                        color: '#d2a8ff', fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <GitBranch size={11} /> Apply to Branch
                    </button>
                    <button
                      onClick={() => handleCompareSelect(stash.index)}
                      style={{
                        padding: '3px 10px', background: 'rgba(136, 136, 136, 0.1)',
                        border: '1px solid #3c3c3c', borderRadius: 4,
                        color: '#8b949e', fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <ArrowRightLeft size={11} /> Compare
                    </button>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(stash.hash)
                        showNotification('Hash copied to clipboard', 'info')
                      }}
                      style={{
                        padding: '3px 10px', background: 'rgba(136, 136, 136, 0.1)',
                        border: '1px solid #3c3c3c', borderRadius: 4,
                        color: '#8b949e', fontSize: 11, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <Copy size={11} /> Copy Hash
                    </button>
                  </div>

                  {/* File list */}
                  <div style={{ fontSize: 12 }}>
                    <div style={{ color: '#6e7681', fontSize: 11, marginBottom: 6 }}>
                      Changed files ({stash.files.length})
                    </div>
                    {stash.files.map((file) => {
                      const isViewingDiff = selectedDiffFile?.stashIndex === stash.index &&
                        selectedDiffFile?.file.path === file.path
                      return (
                        <div key={file.path}>
                          <div
                            onClick={() => setSelectedDiffFile(
                              isViewingDiff ? null : { stashIndex: stash.index, file }
                            )}
                            style={{
                              padding: '3px 8px', display: 'flex', alignItems: 'center',
                              gap: 8, cursor: 'pointer', borderRadius: 4,
                              background: isViewingDiff ? 'rgba(56, 139, 253, 0.08)' : 'transparent',
                            }}
                            onMouseEnter={(e) => {
                              if (!isViewingDiff) e.currentTarget.style.background = '#2d333b'
                            }}
                            onMouseLeave={(e) => {
                              if (!isViewingDiff) e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <span style={{
                              color: STATUS_COLORS[file.status], fontFamily: 'monospace',
                              fontSize: 11, fontWeight: 600, width: 14, textAlign: 'center',
                              flexShrink: 0,
                            }}>
                              {STATUS_LABELS[file.status]}
                            </span>
                            <span style={{ color: '#c9d1d9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {getFileName(file.path)}
                            </span>
                            <span style={{ color: '#484f58', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {getDirectory(file.path)}
                            </span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
                              <span style={{ color: '#3fb950', fontSize: 11 }}>+{file.additions}</span>
                              <span style={{ color: '#f85149', fontSize: 11 }}>-{file.deletions}</span>
                            </div>
                            <Eye size={12} style={{ color: isViewingDiff ? '#388bfd' : '#484f58', flexShrink: 0 }} />
                          </div>

                          {/* Inline diff preview */}
                          {isViewingDiff && (
                            <StashDiffView stash={stash} file={file} />
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary */}
                  <div style={{
                    marginTop: 8, paddingTop: 8, borderTop: '1px solid #2d333b',
                    display: 'flex', gap: 12, fontSize: 11, color: '#6e7681',
                  }}>
                    <span>
                      <span style={{ color: '#3fb950' }}>
                        +{stash.files.reduce((s, f) => s + f.additions, 0)}
                      </span>
                      {' / '}
                      <span style={{ color: '#f85149' }}>
                        -{stash.files.reduce((s, f) => s + f.deletions, 0)}
                      </span>
                    </span>
                    <span>Created on {stash.branch}</span>
                    <span title={formatFullDate(stash.date)}>{formatFullDate(stash.date)}</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            background: '#252526', border: '1px solid #3c3c3c', borderRadius: 6,
            padding: 4, minWidth: 180, zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: 'Apply', icon: <Play size={14} />, action: () => handleApply(contextMenu.stash.index), color: '#3fb950' },
            { label: 'Pop', icon: <Download size={14} />, action: () => handlePop(contextMenu.stash.index), color: '#388bfd' },
            { label: 'Apply to Branch...', icon: <GitBranch size={14} />, action: () => setShowApplyToBranch(contextMenu.stash), color: '#d2a8ff' },
            null,
            { label: 'Compare with...', icon: <ArrowRightLeft size={14} />, action: () => handleCompareSelect(contextMenu.stash.index), color: '#8b949e' },
            { label: 'Copy Hash', icon: <Copy size={14} />, action: () => { navigator.clipboard?.writeText(contextMenu.stash.hash); showNotification('Hash copied', 'info') }, color: '#8b949e' },
            { label: 'View Details', icon: <Eye size={14} />, action: () => toggleExpand(contextMenu.stash.index), color: '#8b949e' },
            null,
            { label: 'Drop Stash', icon: <Trash2 size={14} />, action: () => setConfirmDrop(contextMenu.stash.index), color: '#f85149' },
          ].map((item, idx) =>
            item === null ? (
              <div key={`sep-${idx}`} style={{ height: 1, background: '#3c3c3c', margin: '4px 0' }} />
            ) : (
              <button
                key={item.label}
                onClick={() => { item.action(); setContextMenu(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '6px 10px', background: 'none', border: 'none',
                  color: item.color, fontSize: 12, cursor: 'pointer', borderRadius: 4,
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#2d333b')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                {item.icon}
                {item.label}
              </button>
            )
          )}
        </div>
      )}

      {/* Dialogs */}
      {showCreateDialog && (
        <StashCreateDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleCreate}
        />
      )}

      {showApplyToBranch && (
        <ApplyToBranchDialog
          stash={showApplyToBranch}
          onClose={() => setShowApplyToBranch(null)}
          onApply={handleApplyToBranch}
        />
      )}
    </div>
  )
}
