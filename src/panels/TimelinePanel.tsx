import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Clock, Save, GitCommit, Edit3, FilePlus, FileX, ArrowRight,
  Search, Filter, ChevronDown, ChevronRight, RotateCcw, Eye,
  ArrowRightLeft, Copy, MoreHorizontal, X, Loader, History,
  Calendar, RefreshCw, Trash2, Download, Upload, ChevronUp,
  FileText, Check, AlertCircle, FolderOpen,
} from 'lucide-react'
import { useEditorStore } from '@/store/editor'
import {
  useFileHistoryStore,
  formatRelativeTime,
  formatBytes,
  type TimelineEntry,
  type FileSnapshot,
  type GitCommitEntry,
  type SnapshotTrigger,
  triggerLabels,
} from '@/store/fileHistory'

// ─── Types ──────────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'local' | 'git'
type SortOrder = 'newest' | 'oldest'

interface DateGroup {
  label: string
  entries: TimelineEntry[]
}

interface CompareState {
  entryA: string | null
  entryB: string | null
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  entryId: string | null
  entryType: 'snapshot' | 'git-commit' | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<string, React.ReactNode> = {
  'save': <Save size={14} />,
  'auto-save': <Save size={14} />,
  'format': <Edit3 size={14} />,
  'refactor': <Edit3 size={14} />,
  'ai-edit': <Edit3 size={14} />,
  'manual': <Save size={14} />,
  'unknown': <Clock size={14} />,
  'git-commit': <GitCommit size={14} />,
  'created': <FilePlus size={14} />,
  'renamed': <ArrowRight size={14} />,
  'deleted': <FileX size={14} />,
}

const ACTION_COLORS: Record<string, string> = {
  'save': '#4ec9b0',
  'auto-save': '#569cd6',
  'format': '#dcdcaa',
  'refactor': '#c586c0',
  'ai-edit': '#ce9178',
  'manual': '#4ec9b0',
  'unknown': '#808080',
  'git-commit': '#f0883e',
  'created': '#3fb950',
  'renamed': '#d2a8ff',
  'deleted': '#f85149',
}

const MOCK_GIT_AUTHORS = [
  'Alice Chen', 'Bob Martinez', 'Carol Williams', 'David Kim',
  'Eva Johnson', 'Frank Li', 'Grace Patel', 'Henry Zhou',
]

const MOCK_COMMIT_PREFIXES = [
  'feat: ', 'fix: ', 'refactor: ', 'chore: ', 'style: ', 'perf: ', 'docs: ',
]

const MOCK_COMMIT_DESCRIPTIONS = [
  'update component rendering logic',
  'resolve null reference in parser',
  'extract shared utilities',
  'update dependency versions',
  'improve error handling',
  'optimize data fetching',
  'add input validation',
  'fix race condition in handler',
  'simplify state management',
  'add unit test coverage',
  'correct type annotations',
  'refactor module structure',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9)
}

function generateMockHash(): string {
  const chars = '0123456789abcdef'
  let hash = ''
  for (let i = 0; i < 40; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)]
  }
  return hash
}

function getDateGroupLabel(timestamp: number): string {
  const now = new Date()
  const date = new Date(timestamp)

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - (now.getDay() * 86400000)

  if (timestamp >= todayStart) return 'Today'
  if (timestamp >= yesterdayStart) return 'Yesterday'
  if (timestamp >= weekStart) return 'This Week'

  // Check if same month
  if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
    return 'This Month'
  }

  // Older: show month + year
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function groupByDate(entries: TimelineEntry[]): DateGroup[] {
  const groups = new Map<string, TimelineEntry[]>()
  const order: string[] = []

  for (const entry of entries) {
    const label = getDateGroupLabel(entry.timestamp)
    if (!groups.has(label)) {
      groups.set(label, [])
      order.push(label)
    }
    groups.get(label)!.push(entry)
  }

  return order.map(label => ({
    label,
    entries: groups.get(label)!,
  }))
}

function formatFullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatTimeOnly(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getEntryId(entry: TimelineEntry): string {
  return entry.id
}

function getEntryLabel(entry: TimelineEntry): string {
  if (entry.type === 'git-commit') {
    return entry.message
  }
  return entry.label || triggerLabels[entry.trigger] || 'Change'
}

function getEntryActionType(entry: TimelineEntry): string {
  if (entry.type === 'git-commit') return 'git-commit'
  return entry.trigger || 'unknown'
}

function computeSimpleDiff(oldText: string, newText: string): { added: number; removed: number } {
  if (!oldText) return { added: newText.split('\n').length, removed: 0 }
  if (!newText) return { added: 0, removed: oldText.split('\n').length }

  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const oldSet = new Map<string, number>()
  for (const line of oldLines) {
    oldSet.set(line, (oldSet.get(line) || 0) + 1)
  }
  let matched = 0
  const usedNew = new Map<string, number>()
  for (const line of newLines) {
    const available = (oldSet.get(line) || 0) - (usedNew.get(line) || 0)
    if (available > 0) {
      matched++
      usedNew.set(line, (usedNew.get(line) || 0) + 1)
    }
  }
  return {
    added: newLines.length - matched,
    removed: oldLines.length - matched,
  }
}

// ─── Mock Data Generator ────────────────────────────────────────────────────

function generateMockGitCommits(filePath: string, count: number): GitCommitEntry[] {
  const commits: GitCommitEntry[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const hash = generateMockHash()
    const prefix = MOCK_COMMIT_PREFIXES[i % MOCK_COMMIT_PREFIXES.length]
    const desc = MOCK_COMMIT_DESCRIPTIONS[i % MOCK_COMMIT_DESCRIPTIONS.length]
    const author = MOCK_GIT_AUTHORS[i % MOCK_GIT_AUTHORS.length]
    const offset = (i + 1) * 3600000 * (2 + Math.random() * 8)

    commits.push({
      type: 'git-commit',
      id: `git-${hash.substring(0, 12)}`,
      hash,
      message: `${prefix}${desc}`,
      author,
      timestamp: now - offset,
    })
  }

  return commits.sort((a, b) => b.timestamp - a.timestamp)
}

function generateMockSnapshots(filePath: string, count: number): FileSnapshot[] {
  const snapshots: FileSnapshot[] = []
  const now = Date.now()
  const triggers: SnapshotTrigger[] = ['save', 'auto-save', 'format', 'refactor', 'ai-edit', 'manual']
  const labels = ['Saved', 'Auto-saved', 'Format document', 'Refactored', 'AI edit', 'Manual snapshot']

  for (let i = 0; i < count; i++) {
    const triggerIdx = i % triggers.length
    const offset = i * 1800000 * (1 + Math.random() * 3)
    const linesAdded = Math.floor(Math.random() * 25)
    const linesRemoved = Math.floor(Math.random() * 15)

    snapshots.push({
      id: generateId(),
      path: filePath,
      content: `// Snapshot version ${count - i}\n// File: ${filePath}\n// Changes: +${linesAdded} -${linesRemoved}\n\nconst version = ${count - i};\nexport default version;\n`,
      timestamp: now - offset,
      label: labels[triggerIdx],
      size: 200 + Math.floor(Math.random() * 2000),
      trigger: triggers[triggerIdx],
      linesAdded,
      linesRemoved,
    })
  }

  return snapshots.sort((a, b) => b.timestamp - a.timestamp)
}

// ─── Inline Diff Viewer ─────────────────────────────────────────────────────

interface InlineDiffProps {
  oldText: string
  newText: string
  oldLabel: string
  newLabel: string
  onClose: () => void
}

function InlineDiffViewer({ oldText, newText, oldLabel, newLabel, onClose }: InlineDiffProps) {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')

  // Simple line-by-line diff
  const maxLen = Math.max(oldLines.length, newLines.length)
  const diffLines: Array<{ type: 'same' | 'added' | 'removed'; text: string; lineNum: number }> = []

  const oldSet = new Set(oldLines)
  const newSet = new Set(newLines)

  // Removed lines
  for (let i = 0; i < oldLines.length; i++) {
    if (!newSet.has(oldLines[i])) {
      diffLines.push({ type: 'removed', text: oldLines[i], lineNum: i + 1 })
    }
  }

  // Added lines
  for (let i = 0; i < newLines.length; i++) {
    if (!oldSet.has(newLines[i])) {
      diffLines.push({ type: 'added', text: newLines[i], lineNum: i + 1 })
    }
  }

  // Same lines (context)
  for (let i = 0; i < newLines.length; i++) {
    if (oldSet.has(newLines[i])) {
      diffLines.push({ type: 'same', text: newLines[i], lineNum: i + 1 })
    }
  }

  // Sort by line number
  diffLines.sort((a, b) => a.lineNum - b.lineNum)

  const stats = computeSimpleDiff(oldText, newText)

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 100,
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
        minHeight: 32,
        gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <ArrowRightLeft size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            Diff: {oldLabel} vs {newLabel}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>
            <span style={{ color: '#3fb950' }}>+{stats.added}</span>
            {' / '}
            <span style={{ color: '#f85149' }}>-{stats.removed}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
          title="Close diff"
        >
          <X size={14} />
        </button>
      </div>

      {/* Labels */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-primary)',
        fontSize: 11,
      }}>
        <div style={{
          flex: 1,
          padding: '4px 12px',
          background: 'rgba(248, 81, 73, 0.08)',
          color: '#f85149',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {oldLabel} (previous)
        </div>
        <div style={{
          flex: 1,
          padding: '4px 12px',
          background: 'rgba(63, 185, 80, 0.08)',
          color: '#3fb950',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {newLabel} (current)
        </div>
      </div>

      {/* Diff content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        fontFamily: 'var(--font-mono, "Consolas", "Courier New", monospace)',
        fontSize: 12,
        lineHeight: '20px',
      }}>
        {diffLines.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--text-tertiary)',
            fontSize: 13,
          }}>
            No differences found
          </div>
        ) : (
          diffLines.map((line, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                padding: '0 12px',
                background:
                  line.type === 'added' ? 'rgba(63, 185, 80, 0.12)' :
                  line.type === 'removed' ? 'rgba(248, 81, 73, 0.12)' :
                  'transparent',
                borderLeft: `3px solid ${
                  line.type === 'added' ? '#3fb950' :
                  line.type === 'removed' ? '#f85149' :
                  'transparent'
                }`,
              }}
            >
              <span style={{
                width: 40,
                textAlign: 'right',
                paddingRight: 12,
                color: 'var(--text-tertiary)',
                userSelect: 'none',
                flexShrink: 0,
                opacity: 0.6,
              }}>
                {line.lineNum}
              </span>
              <span style={{
                width: 16,
                textAlign: 'center',
                color: line.type === 'added' ? '#3fb950' :
                       line.type === 'removed' ? '#f85149' :
                       'var(--text-tertiary)',
                userSelect: 'none',
                flexShrink: 0,
                fontWeight: 600,
              }}>
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
              </span>
              <span style={{
                whiteSpace: 'pre',
                color: line.type === 'same' ? 'var(--text-secondary)' : 'var(--text-primary)',
              }}>
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Context Menu Component ─────────────────────────────────────────────────

interface ContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onViewChanges: (id: string) => void
  onCompareSelect: (id: string) => void
  onRestore: (id: string) => void
  onCopyPath: () => void
  onCopyHash: (id: string) => void
  onDelete: (id: string) => void
  compareState: CompareState
}

function TimelineContextMenu({
  state,
  onClose,
  onViewChanges,
  onCompareSelect,
  onRestore,
  onCopyPath,
  onCopyHash,
  onDelete,
  compareState,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  if (!state.visible || !state.entryId) return null

  const isSnapshot = state.entryType === 'snapshot'
  const isComparing = compareState.entryA !== null
  const isSelectedForCompare = compareState.entryA === state.entryId

  const menuItems: Array<{
    label: string
    icon: React.ReactNode
    action: () => void
    separator?: boolean
    disabled?: boolean
    destructive?: boolean
  }> = [
    {
      label: 'View Changes',
      icon: <Eye size={14} />,
      action: () => { onViewChanges(state.entryId!); onClose() },
    },
    {
      label: isComparing
        ? (isSelectedForCompare ? 'Cancel Compare' : 'Compare with Selected')
        : 'Select for Compare',
      icon: <ArrowRightLeft size={14} />,
      action: () => { onCompareSelect(state.entryId!); onClose() },
    },
    ...(isSnapshot ? [{
      label: 'Restore This Version',
      icon: <RotateCcw size={14} />,
      action: () => { onRestore(state.entryId!); onClose() },
      separator: true,
    }] : []),
    {
      label: 'Copy File Path',
      icon: <Copy size={14} />,
      action: () => { onCopyPath(); onClose() },
      separator: !isSnapshot,
    },
    ...(state.entryType === 'git-commit' ? [{
      label: 'Copy Commit Hash',
      icon: <Copy size={14} />,
      action: () => { onCopyHash(state.entryId!); onClose() },
    }] : []),
    ...(isSnapshot ? [{
      label: 'Delete Entry',
      icon: <Trash2 size={14} />,
      action: () => { onDelete(state.entryId!); onClose() },
      separator: true,
      destructive: true,
    }] : []),
  ]

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y,
        zIndex: 10000,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        padding: '4px 0',
        minWidth: 200,
        maxWidth: 280,
      }}
    >
      {menuItems.map((item, i) => (
        <React.Fragment key={i}>
          {item.separator && i > 0 && (
            <div style={{
              height: 1,
              background: 'var(--border-primary)',
              margin: '4px 0',
            }} />
          )}
          <button
            onClick={item.action}
            disabled={item.disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 12px',
              background: 'none',
              border: 'none',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.destructive ? '#f85149' :
                     item.disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
              fontSize: 12,
              textAlign: 'left',
              opacity: item.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'none'
            }}
          >
            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {item.icon}
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>
  )
}

// ─── Timeline Entry Row ─────────────────────────────────────────────────────

interface EntryRowProps {
  entry: TimelineEntry
  isSelected: boolean
  isCompareA: boolean
  isCompareB: boolean
  isFocused: boolean
  onClick: () => void
  onDoubleClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  entryRef: (el: HTMLDivElement | null) => void
}

function TimelineEntryRow({
  entry,
  isSelected,
  isCompareA,
  isCompareB,
  isFocused,
  onClick,
  onDoubleClick,
  onContextMenu,
  onKeyDown,
  entryRef,
}: EntryRowProps) {
  const actionType = getEntryActionType(entry)
  const icon = ACTION_ICONS[actionType] || <Clock size={14} />
  const color = ACTION_COLORS[actionType] || '#808080'
  const label = getEntryLabel(entry)
  const relativeTime = formatRelativeTime(entry.timestamp)
  const fullTime = formatFullTimestamp(entry.timestamp)
  const timeOnly = formatTimeOnly(entry.timestamp)

  const isGit = entry.type === 'git-commit'
  const isSnap = entry.type === 'snapshot'

  const compareIndicator = isCompareA ? 'A' : isCompareB ? 'B' : null

  return (
    <div
      ref={entryRef}
      role="treeitem"
      tabIndex={isFocused ? 0 : -1}
      aria-selected={isSelected}
      aria-label={`${label}, ${relativeTime}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        padding: '6px 12px 6px 8px',
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-tertiary)' :
                    isCompareA || isCompareB ? 'rgba(88, 166, 255, 0.06)' :
                    'transparent',
        borderLeft: `3px solid ${
          isCompareA ? '#58a6ff' :
          isCompareB ? '#f0883e' :
          isSelected ? 'var(--accent-primary)' :
          'transparent'
        }`,
        outline: isFocused ? '1px solid var(--accent-primary)' : 'none',
        outlineOffset: -1,
        transition: 'background 0.1s ease',
        position: 'relative',
        gap: 8,
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover, rgba(255,255,255,0.04))'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background =
            isCompareA || isCompareB ? 'rgba(88, 166, 255, 0.06)' : 'transparent'
        }
      }}
    >
      {/* Timeline dot + line */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 2,
        flexShrink: 0,
        width: 20,
      }}>
        <div style={{
          width: 20,
          height: 20,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${color}18`,
          color: color,
          flexShrink: 0,
        }}>
          {icon}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* First row: label + time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}>
            {label}
          </span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }} title={fullTime}>
            {timeOnly}
          </span>
        </div>

        {/* Second row: metadata */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {isGit && (
            <>
              <span style={{
                fontSize: 10,
                fontFamily: 'var(--font-mono, monospace)',
                color: '#f0883e',
                background: 'rgba(240, 136, 62, 0.12)',
                padding: '1px 5px',
                borderRadius: 3,
                letterSpacing: 0.3,
              }}>
                {entry.hash.substring(0, 7)}
              </span>
              <span style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {entry.author}
              </span>
            </>
          )}
          {isSnap && (
            <>
              <span style={{
                fontSize: 10,
                color: color,
                background: `${color}14`,
                padding: '1px 5px',
                borderRadius: 3,
              }}>
                {triggerLabels[entry.trigger]}
              </span>
              {(entry.linesAdded > 0 || entry.linesRemoved > 0) && (
                <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                  <span style={{ color: '#3fb950' }}>+{entry.linesAdded}</span>
                  {' '}
                  <span style={{ color: '#f85149' }}>-{entry.linesRemoved}</span>
                </span>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                {formatBytes(entry.size)}
              </span>
            </>
          )}
          <span style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            marginLeft: 'auto',
            flexShrink: 0,
          }}>
            {relativeTime}
          </span>
        </div>
      </div>

      {/* Compare indicator badge */}
      {compareIndicator && (
        <div style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: isCompareA ? '#58a6ff' : '#f0883e',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {compareIndicator}
        </div>
      )}
    </div>
  )
}

// ─── Date Group Header ──────────────────────────────────────────────────────

interface DateGroupHeaderProps {
  label: string
  count: number
  isCollapsed: boolean
  onToggle: () => void
}

function DateGroupHeader({ label, count, isCollapsed, onToggle }: DateGroupHeaderProps) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '5px 12px 5px 8px',
        background: 'var(--bg-secondary)',
        border: 'none',
        borderBottom: '1px solid var(--border-primary)',
        cursor: 'pointer',
        color: 'var(--text-secondary)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'
      }}
    >
      {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      <Calendar size={12} style={{ opacity: 0.6 }} />
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
      <span style={{
        fontSize: 10,
        color: 'var(--text-tertiary)',
        background: 'var(--bg-primary)',
        padding: '1px 6px',
        borderRadius: 8,
        fontWeight: 500,
      }}>
        {count}
      </span>
    </button>
  )
}

// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ hasFile, filterActive }: { hasFile: boolean; filterActive: boolean }) {
  if (!hasFile) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 32,
        gap: 12,
      }}>
        <FolderOpen size={40} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          No File Selected
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', opacity: 0.7 }}>
          Open a file to view its timeline history
        </span>
      </div>
    )
  }

  if (filterActive) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 32,
        gap: 12,
      }}>
        <Search size={36} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
        <span style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
          No Matching Entries
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', opacity: 0.7 }}>
          Try adjusting your search or filter criteria
        </span>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 32,
      gap: 12,
    }}>
      <History size={40} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
      <span style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center' }}>
        No Timeline History
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', opacity: 0.7, lineHeight: 1.5 }}>
        File changes will appear here as you save,
        <br />
        edit, and commit changes to this file.
      </span>
    </div>
  )
}

// ─── Loading State ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: 32,
      gap: 12,
    }}>
      <Loader
        size={28}
        style={{
          color: 'var(--accent-primary)',
          animation: 'spin 1.2s linear infinite',
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
        Loading timeline...
      </span>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ─── Restore Confirmation Dialog ────────────────────────────────────────────

interface RestoreDialogProps {
  entry: TimelineEntry | null
  onConfirm: () => void
  onCancel: () => void
}

function RestoreDialog({ entry, onConfirm, onCancel }: RestoreDialogProps) {
  if (!entry) return null

  const label = getEntryLabel(entry)
  const time = formatFullTimestamp(entry.timestamp)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onConfirm, onCancel])

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      zIndex: 200,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: 8,
        padding: 20,
        maxWidth: 380,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <AlertCircle size={18} style={{ color: '#d29922', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Restore File
          </span>
        </div>
        <p style={{
          fontSize: 12,
          color: 'var(--text-secondary)',
          lineHeight: 1.6,
          margin: '0 0 8px',
        }}>
          Are you sure you want to restore this file to the version from:
        </p>
        <div style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 4,
          padding: '8px 12px',
          marginBottom: 16,
          fontSize: 12,
        }}>
          <div style={{ fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
            {label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {time}
          </div>
        </div>
        <p style={{
          fontSize: 11,
          color: 'var(--text-tertiary)',
          lineHeight: 1.5,
          margin: '0 0 16px',
        }}>
          A snapshot of the current version will be saved before restoring.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '6px 14px',
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Stats Bar ──────────────────────────────────────────────────────────────

interface StatsBarProps {
  totalEntries: number
  localCount: number
  gitCount: number
  filteredCount: number
  isFiltered: boolean
}

function StatsBar({ totalEntries, localCount, gitCount, filteredCount, isFiltered }: StatsBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '4px 12px',
      borderTop: '1px solid var(--border-primary)',
      background: 'var(--bg-secondary)',
      fontSize: 11,
      color: 'var(--text-tertiary)',
      minHeight: 24,
      flexShrink: 0,
    }}>
      {isFiltered && (
        <span>
          {filteredCount} of {totalEntries} entries
        </span>
      )}
      {!isFiltered && (
        <span>{totalEntries} entries</span>
      )}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <span title="Local history entries">
          <Save size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
          {localCount}
        </span>
        <span title="Git commit entries">
          <GitCommit size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
          {gitCount}
        </span>
      </span>
    </div>
  )
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export default function TimelinePanel() {
  // Editor state
  const { openFiles, activeFilePath } = useEditorStore()
  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const filePath = activeFile?.path || null
  const fileName = filePath ? filePath.split('/').pop() || filePath : null

  // File history store
  const {
    getTimeline,
    getSnapshots,
    restoreSnapshot,
    deleteSnapshot,
    addSnapshot,
    addGitCommits,
  } = useFileHistoryStore()

  // Local state
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [compareState, setCompareState] = useState<CompareState>({ entryA: null, entryB: null })
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false, x: 0, y: 0, entryId: null, entryType: null,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showDiff, setShowDiff] = useState(false)
  const [diffEntries, setDiffEntries] = useState<{ old: TimelineEntry | null; new: TimelineEntry | null }>({
    old: null, new: null,
  })
  const [restoreTarget, setRestoreTarget] = useState<TimelineEntry | null>(null)
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const entryRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const filterDropdownRef = useRef<HTMLDivElement>(null)

  // ─── Initialize mock data ──────────────────────────────────────────────────

  useEffect(() => {
    if (!filePath || initialized) return

    setIsLoading(true)
    const timer = setTimeout(() => {
      // Seed mock git commits for the active file
      const existingSnapshots = getSnapshots(filePath)
      if (existingSnapshots.length === 0) {
        // Generate some mock local snapshots
        const mockSnaps = generateMockSnapshots(filePath, 12)
        for (const snap of mockSnaps.reverse()) {
          addSnapshot(filePath, snap.content, snap.label, snap.trigger)
        }
      }

      // Generate mock git commits
      const mockCommits = generateMockGitCommits(filePath, 15)
      addGitCommits(filePath, mockCommits)

      setIsLoading(false)
      setInitialized(true)
    }, 600)

    return () => clearTimeout(timer)
  }, [filePath, initialized, getSnapshots, addSnapshot, addGitCommits])

  // Reset when file changes
  useEffect(() => {
    setSelectedEntryId(null)
    setFocusedIndex(0)
    setCompareState({ entryA: null, entryB: null })
    setShowDiff(false)
    setRestoreTarget(null)
    setInitialized(false)
    setSearchQuery('')
  }, [filePath])

  // ─── Compute timeline entries ──────────────────────────────────────────────

  const allEntries = useMemo(() => {
    if (!filePath) return []
    return getTimeline(filePath)
  }, [filePath, getTimeline])

  const filteredEntries = useMemo(() => {
    let entries = [...allEntries]

    // Filter by mode
    if (filterMode === 'local') {
      entries = entries.filter(e => e.type === 'snapshot')
    } else if (filterMode === 'git') {
      entries = entries.filter(e => e.type === 'git-commit')
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      entries = entries.filter(e => {
        const label = getEntryLabel(e).toLowerCase()
        if (label.includes(q)) return true
        if (e.type === 'git-commit') {
          if (e.hash.toLowerCase().startsWith(q)) return true
          if (e.author.toLowerCase().includes(q)) return true
        }
        if (e.type === 'snapshot') {
          if (triggerLabels[e.trigger].toLowerCase().includes(q)) return true
        }
        return false
      })
    }

    // Sort
    if (sortOrder === 'oldest') {
      entries.sort((a, b) => a.timestamp - b.timestamp)
    } else {
      entries.sort((a, b) => b.timestamp - a.timestamp)
    }

    return entries
  }, [allEntries, filterMode, searchQuery, sortOrder])

  const dateGroups = useMemo(() => groupByDate(filteredEntries), [filteredEntries])

  const flatVisibleEntries = useMemo(() => {
    const entries: TimelineEntry[] = []
    for (const group of dateGroups) {
      if (!collapsedGroups.has(group.label)) {
        entries.push(...group.entries)
      }
    }
    return entries
  }, [dateGroups, collapsedGroups])

  const localCount = allEntries.filter(e => e.type === 'snapshot').length
  const gitCount = allEntries.filter(e => e.type === 'git-commit').length
  const isFiltered = searchQuery.trim() !== '' || filterMode !== 'all'

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleEntryClick = useCallback((entry: TimelineEntry, index: number) => {
    setSelectedEntryId(getEntryId(entry))
    setFocusedIndex(index)
  }, [])

  const handleEntryDoubleClick = useCallback((entry: TimelineEntry) => {
    // Double click = view diff with previous version
    handleViewChanges(getEntryId(entry))
  }, [])

  const handleViewChanges = useCallback((entryId: string) => {
    const entryIdx = filteredEntries.findIndex(e => getEntryId(e) === entryId)
    if (entryIdx === -1) return

    const entry = filteredEntries[entryIdx]

    // Find previous entry of the same type or any previous
    let prevEntry: TimelineEntry | null = null
    for (let i = entryIdx + 1; i < filteredEntries.length; i++) {
      if (filteredEntries[i].type === 'snapshot') {
        prevEntry = filteredEntries[i]
        break
      }
    }

    if (entry.type === 'snapshot' && prevEntry?.type === 'snapshot') {
      setDiffEntries({ old: prevEntry, new: entry })
      setShowDiff(true)
    } else if (entry.type === 'snapshot') {
      // Show the snapshot content against empty
      setDiffEntries({ old: null, new: entry })
      setShowDiff(true)
    }
  }, [filteredEntries])

  const handleCompareSelect = useCallback((entryId: string) => {
    setCompareState(prev => {
      if (prev.entryA === entryId) {
        // Deselect
        return { entryA: null, entryB: null }
      }
      if (prev.entryA === null) {
        return { entryA: entryId, entryB: null }
      }
      // Second selection: open diff
      const entryA = filteredEntries.find(e => getEntryId(e) === prev.entryA)
      const entryB = filteredEntries.find(e => getEntryId(e) === entryId)

      if (entryA && entryB && entryA.type === 'snapshot' && entryB.type === 'snapshot') {
        const older = entryA.timestamp < entryB.timestamp ? entryA : entryB
        const newer = entryA.timestamp < entryB.timestamp ? entryB : entryA
        setDiffEntries({ old: older, new: newer })
        setShowDiff(true)
      }

      return { entryA: null, entryB: null }
    })
  }, [filteredEntries])

  const handleRestore = useCallback((entryId: string) => {
    const entry = filteredEntries.find(e => getEntryId(e) === entryId)
    if (entry && entry.type === 'snapshot') {
      setRestoreTarget(entry)
    }
  }, [filteredEntries])

  const confirmRestore = useCallback(() => {
    if (!restoreTarget || restoreTarget.type !== 'snapshot' || !filePath) return

    // Save current version before restoring
    const currentFile = openFiles.find(f => f.path === filePath)
    if (currentFile?.content) {
      addSnapshot(filePath, currentFile.content, 'Before restore', 'manual')
    }

    // Restore the snapshot
    const snapshot = restoreSnapshot(restoreTarget.id)
    if (snapshot) {
      // In a real implementation, this would set the editor content
      addSnapshot(filePath, snapshot.content, `Restored from ${formatRelativeTime(snapshot.timestamp)}`, 'manual')
    }

    setRestoreTarget(null)
  }, [restoreTarget, filePath, openFiles, addSnapshot, restoreSnapshot])

  const handleDelete = useCallback((entryId: string) => {
    deleteSnapshot(entryId)
    if (selectedEntryId === entryId) {
      setSelectedEntryId(null)
    }
  }, [deleteSnapshot, selectedEntryId])

  const handleCopyPath = useCallback(() => {
    if (filePath) {
      navigator.clipboard.writeText(filePath).catch(() => {})
      setCopiedId('path')
      setTimeout(() => setCopiedId(null), 2000)
    }
  }, [filePath])

  const handleCopyHash = useCallback((entryId: string) => {
    const entry = allEntries.find(e => getEntryId(e) === entryId)
    if (entry?.type === 'git-commit') {
      navigator.clipboard.writeText(entry.hash).catch(() => {})
      setCopiedId(entryId)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }, [allEntries])

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: TimelineEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      entryId: getEntryId(entry),
      entryType: entry.type,
    })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false }))
  }, [])

  const toggleGroupCollapse = useCallback((label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }, [])

  const handleRefresh = useCallback(() => {
    if (!filePath) return
    setIsLoading(true)
    setInitialized(false)
    setTimeout(() => {
      setIsLoading(false)
      setInitialized(true)
    }, 400)
  }, [filePath])

  const toggleSearch = useCallback(() => {
    setShowSearch(prev => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 50)
      } else {
        setSearchQuery('')
      }
      return !prev
    })
  }, [])

  // ─── Keyboard navigation ──────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent, entry: TimelineEntry, index: number) => {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const nextIdx = Math.min(index + 1, flatVisibleEntries.length - 1)
        setFocusedIndex(nextIdx)
        const nextEntry = flatVisibleEntries[nextIdx]
        if (nextEntry) {
          setSelectedEntryId(getEntryId(nextEntry))
          entryRefs.current.get(nextIdx)?.focus()
          entryRefs.current.get(nextIdx)?.scrollIntoView({ block: 'nearest' })
        }
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prevIdx = Math.max(index - 1, 0)
        setFocusedIndex(prevIdx)
        const prevEntry = flatVisibleEntries[prevIdx]
        if (prevEntry) {
          setSelectedEntryId(getEntryId(prevEntry))
          entryRefs.current.get(prevIdx)?.focus()
          entryRefs.current.get(prevIdx)?.scrollIntoView({ block: 'nearest' })
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
        handleViewChanges(getEntryId(entry))
        break
      }
      case ' ': {
        e.preventDefault()
        handleCompareSelect(getEntryId(entry))
        break
      }
      case 'Delete':
      case 'Backspace': {
        if (entry.type === 'snapshot') {
          e.preventDefault()
          handleDelete(getEntryId(entry))
        }
        break
      }
      case 'r':
      case 'R': {
        if (entry.type === 'snapshot') {
          e.preventDefault()
          handleRestore(getEntryId(entry))
        }
        break
      }
      case 'c':
      case 'C': {
        if (e.ctrlKey || e.metaKey) break // Don't interfere with copy
        e.preventDefault()
        handleCompareSelect(getEntryId(entry))
        break
      }
      case 'Home': {
        e.preventDefault()
        setFocusedIndex(0)
        if (flatVisibleEntries[0]) {
          setSelectedEntryId(getEntryId(flatVisibleEntries[0]))
          entryRefs.current.get(0)?.focus()
          entryRefs.current.get(0)?.scrollIntoView({ block: 'nearest' })
        }
        break
      }
      case 'End': {
        e.preventDefault()
        const lastIdx = flatVisibleEntries.length - 1
        setFocusedIndex(lastIdx)
        if (flatVisibleEntries[lastIdx]) {
          setSelectedEntryId(getEntryId(flatVisibleEntries[lastIdx]))
          entryRefs.current.get(lastIdx)?.focus()
          entryRefs.current.get(lastIdx)?.scrollIntoView({ block: 'nearest' })
        }
        break
      }
    }
  }, [flatVisibleEntries, handleViewChanges, handleCompareSelect, handleDelete, handleRestore])

  // ─── Panel-level keyboard shortcuts ────────────────────────────────────────

  const handlePanelKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      toggleSearch()
    }
    if (e.key === 'Escape') {
      if (showDiff) {
        setShowDiff(false)
      } else if (compareState.entryA) {
        setCompareState({ entryA: null, entryB: null })
      } else if (showSearch) {
        setShowSearch(false)
        setSearchQuery('')
      }
    }
  }, [showDiff, compareState, showSearch, toggleSearch])

  // Close filter dropdown on outside click
  useEffect(() => {
    if (!showFilterDropdown) return
    const handleClick = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showFilterDropdown])

  // ─── Render ─────────────────────────────────────────────────────────────────

  let flatIndex = -1 // Counter across all groups for ref tracking

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        position: 'relative',
        overflow: 'hidden',
      }}
      onKeyDown={handlePanelKeyDown}
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 8px 6px 12px',
        borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
        gap: 6,
        minHeight: 34,
        flexShrink: 0,
      }}>
        <History size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: 'var(--text-secondary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          Timeline
          {fileName && (
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 6 }}>
              - {fileName}
            </span>
          )}
        </span>

        {/* Compare mode indicator */}
        {compareState.entryA && (
          <span style={{
            fontSize: 10,
            color: '#58a6ff',
            background: 'rgba(88, 166, 255, 0.12)',
            padding: '2px 6px',
            borderRadius: 3,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}>
            Comparing...
          </span>
        )}

        {/* Action buttons */}
        <button
          onClick={toggleSearch}
          title="Search entries (Ctrl+F)"
          style={{
            background: showSearch ? 'var(--bg-tertiary)' : 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            color: showSearch ? 'var(--accent-primary)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search size={14} />
        </button>

        <div style={{ position: 'relative' }} ref={filterDropdownRef}>
          <button
            onClick={() => setShowFilterDropdown(prev => !prev)}
            title="Filter entries"
            style={{
              background: filterMode !== 'all' ? 'var(--bg-tertiary)' : 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              color: filterMode !== 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Filter size={14} />
          </button>

          {/* Filter dropdown */}
          {showFilterDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              zIndex: 1000,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
              padding: '4px 0',
              minWidth: 180,
            }}>
              <div style={{
                padding: '6px 12px 4px',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Show
              </div>
              {([
                { value: 'all', label: 'All History', icon: <History size={13} /> },
                { value: 'local', label: 'Local History', icon: <Save size={13} /> },
                { value: 'git', label: 'Git History', icon: <GitCommit size={13} /> },
              ] as const).map(item => (
                <button
                  key={item.value}
                  onClick={() => { setFilterMode(item.value); setShowFilterDropdown(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 12px',
                    background: filterMode === item.value ? 'var(--bg-tertiary)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      filterMode === item.value ? 'var(--bg-tertiary)' : 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {filterMode === item.value && (
                    <Check size={13} style={{ color: 'var(--accent-primary)' }} />
                  )}
                </button>
              ))}

              <div style={{ height: 1, background: 'var(--border-primary)', margin: '4px 0' }} />

              <div style={{
                padding: '6px 12px 4px',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                Sort
              </div>
              {([
                { value: 'newest', label: 'Newest First', icon: <ChevronDown size={13} /> },
                { value: 'oldest', label: 'Oldest First', icon: <ChevronUp size={13} /> },
              ] as const).map(item => (
                <button
                  key={item.value}
                  onClick={() => { setSortOrder(item.value); setShowFilterDropdown(false) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '6px 12px',
                    background: sortOrder === item.value ? 'var(--bg-tertiary)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      sortOrder === item.value ? 'var(--bg-tertiary)' : 'none'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', opacity: 0.7 }}>
                    {item.icon}
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {sortOrder === item.value && (
                    <Check size={13} style={{ color: 'var(--accent-primary)' }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleRefresh}
          title="Refresh timeline"
          disabled={isLoading}
          style={{
            background: 'none',
            border: 'none',
            cursor: isLoading ? 'default' : 'pointer',
            padding: 4,
            borderRadius: 4,
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            opacity: isLoading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={14} style={isLoading ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>

        <button
          onClick={() => {
            if (compareState.entryA) {
              setCompareState({ entryA: null, entryB: null })
            }
          }}
          title={compareState.entryA ? 'Cancel compare' : 'Compare two entries'}
          style={{
            background: compareState.entryA ? 'rgba(88, 166, 255, 0.15)' : 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            color: compareState.entryA ? '#58a6ff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowRightLeft size={14} />
        </button>
      </div>

      {/* ── Search Bar ─────────────────────────────────────────────────────── */}
      {showSearch && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          gap: 6,
          flexShrink: 0,
        }}>
          <Search size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search timeline entries..."
            style={{
              flex: 1,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: 4,
              padding: '4px 8px',
              color: 'var(--text-primary)',
              fontSize: 12,
              outline: 'none',
            }}
            onFocus={(e) => {
              (e.target as HTMLInputElement).style.borderColor = 'var(--accent-primary)'
            }}
            onBlur={(e) => {
              (e.target as HTMLInputElement).style.borderColor = 'var(--border-primary)'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSearch(false)
                setSearchQuery('')
              }
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                color: 'var(--text-tertiary)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={13} />
            </button>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
            {filteredEntries.length} result{filteredEntries.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ── Filter mode tabs ────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border-primary)',
        flexShrink: 0,
      }}>
        {([
          { value: 'all', label: 'All', count: allEntries.length },
          { value: 'local', label: 'Local', count: localCount },
          { value: 'git', label: 'Git', count: gitCount },
        ] as const).map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilterMode(tab.value)}
            style={{
              flex: 1,
              padding: '5px 8px',
              background: 'none',
              border: 'none',
              borderBottom: filterMode === tab.value
                ? '2px solid var(--accent-primary)'
                : '2px solid transparent',
              cursor: 'pointer',
              color: filterMode === tab.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
              fontSize: 11,
              fontWeight: filterMode === tab.value ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (filterMode !== tab.value) {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'
              }
            }}
            onMouseLeave={(e) => {
              if (filterMode !== tab.value) {
                (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'
              }
            }}
          >
            {tab.label}
            <span style={{
              fontSize: 10,
              background: filterMode === tab.value
                ? 'rgba(var(--accent-primary-rgb, 88, 166, 255), 0.15)'
                : 'var(--bg-tertiary)',
              padding: '0 5px',
              borderRadius: 8,
              lineHeight: '16px',
            }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Compare mode banner ─────────────────────────────────────────────── */}
      {compareState.entryA && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'rgba(88, 166, 255, 0.08)',
          borderBottom: '1px solid rgba(88, 166, 255, 0.2)',
          gap: 8,
          flexShrink: 0,
        }}>
          <ArrowRightLeft size={13} style={{ color: '#58a6ff', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: '#58a6ff', flex: 1 }}>
            Select a second entry to compare
          </span>
          <button
            onClick={() => setCompareState({ entryA: null, entryB: null })}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              color: '#58a6ff',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Content area ───────────────────────────────────────────────────── */}
      <div
        ref={listRef}
        role="tree"
        aria-label="Timeline entries"
        style={{
          flex: 1,
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {isLoading ? (
          <LoadingState />
        ) : !filePath ? (
          <EmptyState hasFile={false} filterActive={false} />
        ) : filteredEntries.length === 0 ? (
          <EmptyState hasFile={true} filterActive={isFiltered} />
        ) : (
          dateGroups.map((group) => {
            const isCollapsed = collapsedGroups.has(group.label)

            return (
              <div key={group.label}>
                <DateGroupHeader
                  label={group.label}
                  count={group.entries.length}
                  isCollapsed={isCollapsed}
                  onToggle={() => toggleGroupCollapse(group.label)}
                />
                {!isCollapsed && group.entries.map((entry) => {
                  flatIndex++
                  const currentFlatIndex = flatIndex
                  const entryId = getEntryId(entry)

                  return (
                    <TimelineEntryRow
                      key={entryId}
                      entry={entry}
                      isSelected={selectedEntryId === entryId}
                      isCompareA={compareState.entryA === entryId}
                      isCompareB={compareState.entryB === entryId}
                      isFocused={focusedIndex === currentFlatIndex}
                      onClick={() => handleEntryClick(entry, currentFlatIndex)}
                      onDoubleClick={() => handleEntryDoubleClick(entry)}
                      onContextMenu={(e) => handleContextMenu(e, entry)}
                      onKeyDown={(e) => handleKeyDown(e, entry, currentFlatIndex)}
                      entryRef={(el) => {
                        if (el) {
                          entryRefs.current.set(currentFlatIndex, el)
                        } else {
                          entryRefs.current.delete(currentFlatIndex)
                        }
                      }}
                    />
                  )
                })}
              </div>
            )
          })
        )}
      </div>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      {filePath && !isLoading && allEntries.length > 0 && (
        <StatsBar
          totalEntries={allEntries.length}
          localCount={localCount}
          gitCount={gitCount}
          filteredCount={filteredEntries.length}
          isFiltered={isFiltered}
        />
      )}

      {/* ── Context Menu ───────────────────────────────────────────────────── */}
      <TimelineContextMenu
        state={contextMenu}
        onClose={closeContextMenu}
        onViewChanges={handleViewChanges}
        onCompareSelect={handleCompareSelect}
        onRestore={handleRestore}
        onCopyPath={handleCopyPath}
        onCopyHash={handleCopyHash}
        onDelete={handleDelete}
        compareState={compareState}
      />

      {/* ── Diff overlay ───────────────────────────────────────────────────── */}
      {showDiff && (
        <InlineDiffViewer
          oldText={
            diffEntries.old?.type === 'snapshot' ? diffEntries.old.content : ''
          }
          newText={
            diffEntries.new?.type === 'snapshot' ? diffEntries.new.content : ''
          }
          oldLabel={
            diffEntries.old
              ? `${getEntryLabel(diffEntries.old)} (${formatRelativeTime(diffEntries.old.timestamp)})`
              : 'Empty'
          }
          newLabel={
            diffEntries.new
              ? `${getEntryLabel(diffEntries.new)} (${formatRelativeTime(diffEntries.new.timestamp)})`
              : 'Current'
          }
          onClose={() => setShowDiff(false)}
        />
      )}

      {/* ── Restore dialog ─────────────────────────────────────────────────── */}
      {restoreTarget && (
        <RestoreDialog
          entry={restoreTarget}
          onConfirm={confirmRestore}
          onCancel={() => setRestoreTarget(null)}
        />
      )}

      {/* ── Spin animation ─────────────────────────────────────────────────── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
