import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useFileHistoryStore, formatRelativeTime, formatBytes } from '@/store/fileHistory'
import { useEditorStore } from '@/store/editor'
import { useToastStore } from '@/store/toast'
import {
  Clock, RotateCcw, Trash2, X, ChevronDown, ChevronRight,
  Save, Zap, Timer, History, GitCompare, AlertTriangle,
} from 'lucide-react'
import type { FileSnapshot } from '@/store/fileHistory'

// ── Label icon/color mapping ───────────────────────────

const labelConfig: Record<string, { Icon: typeof Save; color: string }> = {
  Saved: { Icon: Save, color: 'var(--accent-green)' },
  'Auto-saved': { Icon: Timer, color: 'var(--accent)' },
  'Before AI edit': { Icon: Zap, color: 'var(--accent-purple, #bc8cff)' },
}

const defaultLabelConfig = { Icon: History, color: 'var(--text-muted)' }

// ── Inject CSS animations ──────────────────────────────

const styleId = 'timeline-panel-animations'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes tl-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes tl-diff-enter {
      from { opacity: 0; max-height: 0; }
      to   { opacity: 1; max-height: 600px; }
    }
    .tl-entry {
      transition: background 0.12s;
    }
    .tl-entry:hover {
      background: rgba(255,255,255,0.03) !important;
    }
    .tl-entry:hover .tl-actions {
      opacity: 1 !important;
    }
    .tl-btn {
      transition: background 0.1s, color 0.1s, transform 0.1s;
    }
    .tl-btn:hover {
      background: rgba(255,255,255,0.08) !important;
      color: var(--text-primary) !important;
    }
    .tl-btn:active {
      transform: scale(0.92);
    }
  `
  document.head.appendChild(style)
}

// ── Simple diff utility ────────────────────────────────

interface DiffLine {
  type: 'same' | 'added' | 'removed'
  text: string
  lineNum?: number
}

function computeSimpleDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length

  // For performance, if files are very large, just show a summary
  if (m + n > 2000) {
    result.push({ type: 'removed', text: `--- ${m} lines (old version)` })
    result.push({ type: 'added', text: `+++ ${n} lines (current version)` })
    return result
  }

  // Build a simple diff using a greedy approach
  let i = 0
  let j = 0

  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'same', text: oldLines[i], lineNum: j + 1 })
      i++
      j++
    } else {
      // Look ahead for a match
      let foundInNew = -1
      let foundInOld = -1
      const lookAhead = Math.min(10, Math.max(m - i, n - j))

      for (let k = 1; k <= lookAhead; k++) {
        if (j + k < n && oldLines[i] === newLines[j + k]) {
          foundInNew = j + k
          break
        }
        if (i + k < m && oldLines[i + k] === newLines[j]) {
          foundInOld = i + k
          break
        }
      }

      if (foundInNew !== -1) {
        // Lines were added in new
        while (j < foundInNew) {
          result.push({ type: 'added', text: newLines[j] })
          j++
        }
      } else if (foundInOld !== -1) {
        // Lines were removed from old
        while (i < foundInOld) {
          result.push({ type: 'removed', text: oldLines[i] })
          i++
        }
      } else {
        // Replace
        result.push({ type: 'removed', text: oldLines[i] })
        result.push({ type: 'added', text: newLines[j] })
        i++
        j++
      }
    }
  }

  // Remaining old lines (removed)
  while (i < m) {
    result.push({ type: 'removed', text: oldLines[i] })
    i++
  }

  // Remaining new lines (added)
  while (j < n) {
    result.push({ type: 'added', text: newLines[j] })
    j++
  }

  return result
}

// ── Confirm dialog component ───────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onCancel])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '16px 20px',
        zIndex: 1000,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        minWidth: 280,
        animation: 'tl-fade-in 0.15s ease',
      }}
    >
      <div className="flex items-start gap-2" style={{ marginBottom: 12 }}>
        <AlertTriangle size={16} style={{ color: 'var(--accent-orange, #d29922)', flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="tl-btn"
          style={{
            padding: '4px 12px',
            fontSize: 11,
            borderRadius: 4,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="tl-btn"
          style={{
            padding: '4px 12px',
            fontSize: 11,
            borderRadius: 4,
            border: '1px solid var(--accent-red)',
            background: 'rgba(248,81,73,0.1)',
            color: 'var(--accent-red)',
            cursor: 'pointer',
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}

// ── Main Timeline Panel ────────────────────────────────

export default function TimelinePanel() {
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const openFiles = useEditorStore((s) => s.openFiles)
  const updateFileContent = useEditorStore((s) => s.updateFileContent)
  const addToast = useToastStore((s) => s.addToast)
  const { getSnapshots, deleteSnapshot, clearFileHistory, restoreSnapshot } = useFileHistoryStore()

  const [previewId, setPreviewId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'restore' | 'delete' | 'clear'; id?: string } | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)
  const snapshots = useMemo(
    () => (activeFilePath ? getSnapshots(activeFilePath) : []),
    // Re-derive when the snapshots map reference changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFilePath, useFileHistoryStore((s) => s.snapshots)]
  )

  // Group snapshots by date
  const groupedSnapshots = useMemo(() => {
    const groups: { label: string; snapshots: FileSnapshot[] }[] = []
    const today = new Date()
    const todayStr = today.toDateString()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toDateString()

    let currentGroup: { label: string; snapshots: FileSnapshot[] } | null = null

    for (const snap of snapshots) {
      const date = new Date(snap.timestamp)
      const dateStr = date.toDateString()
      let groupLabel: string

      if (dateStr === todayStr) {
        groupLabel = 'Today'
      } else if (dateStr === yesterdayStr) {
        groupLabel = 'Yesterday'
      } else {
        groupLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
      }

      if (!currentGroup || currentGroup.label !== groupLabel) {
        currentGroup = { label: groupLabel, snapshots: [] }
        groups.push(currentGroup)
      }
      currentGroup.snapshots.push(snap)
    }

    return groups
  }, [snapshots])

  // Diff computation for preview
  const diffLines = useMemo(() => {
    if (!previewId || !activeFile) return null
    const snapshot = snapshots.find((s) => s.id === previewId)
    if (!snapshot) return null
    return computeSimpleDiff(snapshot.content, activeFile.content)
  }, [previewId, activeFile, snapshots])

  const handleRestore = useCallback(
    (id: string) => {
      const snapshot = restoreSnapshot(id)
      if (snapshot && activeFilePath) {
        updateFileContent(activeFilePath, snapshot.content)
        addToast({
          type: 'success',
          message: `Restored "${snapshot.label}" from ${formatRelativeTime(snapshot.timestamp)}`,
          duration: 2500,
        })
        setPreviewId(null)
        setConfirmAction(null)
      }
    },
    [activeFilePath, restoreSnapshot, updateFileContent, addToast]
  )

  const handleDelete = useCallback(
    (id: string) => {
      deleteSnapshot(id)
      if (previewId === id) setPreviewId(null)
      setConfirmAction(null)
    },
    [deleteSnapshot, previewId]
  )

  const handleClear = useCallback(() => {
    if (activeFilePath) {
      clearFileHistory(activeFilePath)
      setPreviewId(null)
      setConfirmAction(null)
    }
  }, [activeFilePath, clearFileHistory])

  if (!activeFilePath) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center"
        style={{ color: 'var(--text-muted)', fontSize: 11 }}
      >
        <Clock size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
        <span>No file open</span>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col" style={{ position: 'relative' }}>
      {/* Header */}
      <div
        className="flex items-center shrink-0"
        style={{
          height: 28,
          padding: '0 8px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          gap: 6,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <Clock size={12} style={{ color: 'var(--accent)', opacity: 0.8 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '0.2px' }}>
          TIMELINE
        </span>
        <span
          style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            marginLeft: 4,
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {snapshots.length > 0 ? snapshots.length : ''}
        </span>
        <span style={{ flex: 1 }} />
        {snapshots.length > 0 && (
          <button
            className="tl-btn"
            onClick={(e) => {
              e.stopPropagation()
              setConfirmAction({ type: 'clear' })
            }}
            title="Clear all history for this file"
            style={{
              width: 20,
              height: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 3,
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              background: 'transparent',
            }}
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {snapshots.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center"
              style={{ padding: '24px 16px', color: 'var(--text-muted)' }}
            >
              <History size={20} style={{ opacity: 0.25, marginBottom: 8 }} />
              <span style={{ fontSize: 11 }}>No history yet</span>
              <span style={{ fontSize: 10, opacity: 0.5, marginTop: 4, textAlign: 'center' }}>
                Snapshots will appear here when you save or auto-save this file
              </span>
            </div>
          ) : (
            groupedSnapshots.map((group) => (
              <div key={group.label}>
                {/* Date group header */}
                <div
                  style={{
                    padding: '6px 10px 2px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                    opacity: 0.7,
                  }}
                >
                  {group.label}
                </div>

                {group.snapshots.map((snap) => {
                  const config = labelConfig[snap.label] || defaultLabelConfig
                  const isPreview = previewId === snap.id

                  return (
                    <div key={snap.id}>
                      <div
                        className="tl-entry"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          borderLeft: isPreview ? '2px solid var(--accent)' : '2px solid transparent',
                          background: isPreview ? 'rgba(88,166,255,0.06)' : 'transparent',
                          animation: 'tl-fade-in 0.15s ease',
                        }}
                        onClick={() => setPreviewId(isPreview ? null : snap.id)}
                        title={`${snap.label} - ${new Date(snap.timestamp).toLocaleString()}\nSize: ${formatBytes(snap.size)}\nClick to preview diff`}
                      >
                        {/* Label icon */}
                        <config.Icon
                          size={12}
                          style={{ color: config.color, flexShrink: 0, opacity: 0.8 }}
                        />

                        {/* Label + time */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {snap.label}
                          </div>
                          <div
                            style={{
                              fontSize: 9,
                              color: 'var(--text-muted)',
                              opacity: 0.6,
                              display: 'flex',
                              gap: 6,
                            }}
                          >
                            <span>{formatRelativeTime(snap.timestamp)}</span>
                            <span>{formatBytes(snap.size)}</span>
                          </div>
                        </div>

                        {/* Action buttons (shown on hover via CSS) */}
                        <div
                          className="tl-actions"
                          style={{
                            display: 'flex',
                            gap: 2,
                            opacity: 0,
                            flexShrink: 0,
                          }}
                        >
                          <button
                            className="tl-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmAction({ type: 'restore', id: snap.id })
                            }}
                            title="Restore this version"
                            style={{
                              width: 22,
                              height: 22,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 3,
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--accent-green)',
                              background: 'transparent',
                            }}
                          >
                            <RotateCcw size={11} />
                          </button>
                          <button
                            className="tl-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmAction({ type: 'delete', id: snap.id })
                            }}
                            title="Delete this snapshot"
                            style={{
                              width: 22,
                              height: 22,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 3,
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--accent-red)',
                              background: 'transparent',
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Diff preview */}
                      {isPreview && diffLines && (
                        <div
                          style={{
                            borderLeft: '2px solid var(--accent)',
                            margin: '0 0 0 0',
                            background: 'rgba(0,0,0,0.15)',
                            animation: 'tl-diff-enter 0.2s ease',
                            overflow: 'hidden',
                          }}
                        >
                          {/* Diff header */}
                          <div
                            className="flex items-center"
                            style={{
                              padding: '4px 10px',
                              borderBottom: '1px solid var(--border)',
                              gap: 6,
                            }}
                          >
                            <GitCompare size={11} style={{ color: 'var(--accent)', opacity: 0.7 }} />
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>
                              Diff: snapshot vs current
                            </span>
                            <button
                              className="tl-btn"
                              onClick={(e) => {
                                e.stopPropagation()
                                setConfirmAction({ type: 'restore', id: snap.id })
                              }}
                              style={{
                                padding: '2px 8px',
                                fontSize: 10,
                                borderRadius: 3,
                                border: '1px solid rgba(63,185,80,0.3)',
                                background: 'rgba(63,185,80,0.08)',
                                color: 'var(--accent-green)',
                                cursor: 'pointer',
                                fontWeight: 500,
                              }}
                            >
                              Restore
                            </button>
                            <button
                              className="tl-btn"
                              onClick={() => setPreviewId(null)}
                              style={{
                                width: 20,
                                height: 20,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: 3,
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                background: 'transparent',
                              }}
                            >
                              <X size={11} />
                            </button>
                          </div>

                          {/* Diff lines */}
                          <div
                            style={{
                              maxHeight: 300,
                              overflowY: 'auto',
                              overflowX: 'auto',
                              fontFamily: 'var(--font-mono, monospace)',
                              fontSize: 10,
                              lineHeight: 1.6,
                              scrollbarWidth: 'thin',
                            }}
                          >
                            {diffLines.length === 0 ? (
                              <div
                                style={{
                                  padding: '12px 10px',
                                  color: 'var(--text-muted)',
                                  fontStyle: 'italic',
                                  fontSize: 10,
                                  textAlign: 'center',
                                }}
                              >
                                No differences - content is identical
                              </div>
                            ) : (
                              diffLines.slice(0, 200).map((line, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    padding: '0 10px',
                                    whiteSpace: 'pre',
                                    background:
                                      line.type === 'added'
                                        ? 'rgba(63,185,80,0.08)'
                                        : line.type === 'removed'
                                          ? 'rgba(248,81,73,0.08)'
                                          : 'transparent',
                                    color:
                                      line.type === 'added'
                                        ? 'var(--accent-green)'
                                        : line.type === 'removed'
                                          ? 'var(--accent-red)'
                                          : 'var(--text-muted)',
                                    borderLeft:
                                      line.type === 'added'
                                        ? '2px solid rgba(63,185,80,0.4)'
                                        : line.type === 'removed'
                                          ? '2px solid rgba(248,81,73,0.4)'
                                          : '2px solid transparent',
                                  }}
                                >
                                  <span style={{ opacity: 0.5, display: 'inline-block', width: 14, textAlign: 'right', marginRight: 8 }}>
                                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                                  </span>
                                  {line.text}
                                </div>
                              ))
                            )}
                            {diffLines.length > 200 && (
                              <div
                                style={{
                                  padding: '4px 10px',
                                  color: 'var(--text-muted)',
                                  fontSize: 9,
                                  fontStyle: 'italic',
                                  textAlign: 'center',
                                }}
                              >
                                ... {diffLines.length - 200} more lines
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirm dialog overlay */}
      {confirmAction && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.3)',
            zIndex: 999,
          }}
        >
          <ConfirmDialog
            message={
              confirmAction.type === 'restore'
                ? 'Restore this snapshot? Current unsaved changes will be replaced.'
                : confirmAction.type === 'clear'
                  ? 'Clear all history for this file? This cannot be undone.'
                  : 'Delete this snapshot? This cannot be undone.'
            }
            onConfirm={() => {
              if (confirmAction.type === 'restore' && confirmAction.id) {
                handleRestore(confirmAction.id)
              } else if (confirmAction.type === 'delete' && confirmAction.id) {
                handleDelete(confirmAction.id)
              } else if (confirmAction.type === 'clear') {
                handleClear()
              }
            }}
            onCancel={() => setConfirmAction(null)}
          />
        </div>
      )}
    </div>
  )
}
