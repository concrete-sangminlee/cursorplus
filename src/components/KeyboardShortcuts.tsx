import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { X, Search, Keyboard, ChevronDown, ChevronRight, Pencil, RotateCcw, Download, AlertTriangle } from 'lucide-react'
import { useKeybindingsStore, Keybinding } from '../store/keybindings'

interface Props {
  open: boolean
  onClose: () => void
}

function parseShortcut(shortcut: string): string[][] {
  if (!shortcut) return []
  // Handle chord shortcuts like "Ctrl+K Z" (space-separated chords)
  return shortcut.split(' ').map((chord) => chord.split('+'))
}

function keyEventToString(e: KeyboardEvent): string | null {
  // Ignore lone modifier key presses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push('Alt')

  let key = e.key
  // Normalize key names
  if (key === ' ') key = 'Space'
  else if (key === 'ArrowUp') key = 'Up'
  else if (key === 'ArrowDown') key = 'Down'
  else if (key === 'ArrowLeft') key = 'Left'
  else if (key === 'ArrowRight') key = 'Right'
  else if (key === 'Escape') key = 'Escape'
  else if (key === 'Enter') key = 'Enter'
  else if (key === 'Backspace') key = 'Backspace'
  else if (key === 'Delete') key = 'Delete'
  else if (key === 'Tab') key = 'Tab'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)
  return parts.join('+')
}

function KbdKey({ keyName }: { keyName: string }) {
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 22,
        height: 22,
        padding: '0 6px',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--text-primary)',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderBottom: '2px solid var(--border)',
        borderRadius: 4,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 1px rgba(0,0,0,0.2)',
      }}
    >
      {keyName}
    </kbd>
  )
}

function ShortcutDisplay({ shortcut, isCustomized }: { shortcut: string; isCustomized?: boolean }) {
  const chords = parseShortcut(shortcut)
  if (chords.length === 0) {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Unassigned
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {chords.map((keys, ci) => (
        <span key={ci} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {ci > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 2px' }}> </span>
          )}
          {keys.map((k, ki) => (
            <span key={ki} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              {ki > 0 && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.5 }}>+</span>
              )}
              <KbdKey keyName={k} />
            </span>
          ))}
        </span>
      ))}
      {isCustomized && (
        <span
          style={{
            fontSize: 8,
            color: '#e8a317',
            background: 'rgba(232, 163, 23, 0.12)',
            padding: '1px 5px',
            borderRadius: 3,
            fontWeight: 600,
            marginLeft: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Modified
        </span>
      )}
    </span>
  )
}

function KeyCaptureInput({
  onCapture,
  onCancel,
}: {
  onCapture: (shortcut: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLDivElement>(null)
  const [captured, setCaptured] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        onCancel()
        return
      }

      const combo = keyEventToString(e)
      if (combo) {
        setCaptured(combo)
        onCapture(combo)
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onCapture, onCancel])

  return (
    <div
      ref={inputRef}
      tabIndex={0}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--accent)',
        borderRadius: 4,
        fontSize: 11,
        color: captured ? 'var(--text-primary)' : 'var(--text-muted)',
        fontStyle: captured ? 'normal' : 'italic',
        outline: 'none',
        boxShadow: '0 0 0 1px var(--accent)',
        animation: 'keycapture-pulse 2s ease-in-out infinite',
        minWidth: 180,
      }}
    >
      {captured ? (
        <ShortcutDisplay shortcut={captured} />
      ) : (
        'Press desired key combination...'
      )}
    </div>
  )
}

function ShortcutRow({
  binding,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaveBinding,
}: {
  binding: Keybinding
  editingId: string | null
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSaveBinding: (id: string, shortcut: string) => void
}) {
  const { customBindings, getEffectiveBinding, isCustomized, resetBinding, findConflicts } =
    useKeybindingsStore()
  const isEditing = editingId === binding.id
  const hasCustom = isCustomized(binding.id)
  const effectiveShortcut = getEffectiveBinding(binding.id)
  const [pendingConflicts, setPendingConflicts] = useState<Keybinding[]>([])
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null)

  const handleCapture = useCallback(
    (shortcut: string) => {
      const conflicts = findConflicts(shortcut, binding.id)
      if (conflicts.length > 0) {
        setPendingConflicts(conflicts)
        setPendingShortcut(shortcut)
      } else {
        onSaveBinding(binding.id, shortcut)
        setPendingConflicts([])
        setPendingShortcut(null)
      }
    },
    [binding.id, findConflicts, onSaveBinding]
  )

  const handleAcceptConflict = useCallback(() => {
    if (pendingShortcut) {
      onSaveBinding(binding.id, pendingShortcut)
    }
    setPendingConflicts([])
    setPendingShortcut(null)
  }, [binding.id, pendingShortcut, onSaveBinding])

  const handleRejectConflict = useCallback(() => {
    setPendingConflicts([])
    setPendingShortcut(null)
    onCancelEdit()
  }, [onCancelEdit])

  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto auto',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 4,
          transition: 'background 0.1s',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
          background: isEditing ? 'rgba(255, 255, 255, 0.06)' : undefined,
        }}
        onMouseEnter={(e) => {
          if (!isEditing) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
        }}
        onMouseLeave={(e) => {
          if (!isEditing) e.currentTarget.style.background = 'transparent'
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: hasCustom ? '#e8a317' : 'var(--text-secondary)',
          }}
        >
          {binding.label}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isEditing ? (
            <KeyCaptureInput onCapture={handleCapture} onCancel={onCancelEdit} />
          ) : (
            <ShortcutDisplay shortcut={effectiveShortcut} isCustomized={hasCustom} />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {!isEditing && (
            <button
              onClick={() => onStartEdit(binding.id)}
              title="Edit keybinding"
              style={{
                padding: 4,
                borderRadius: 4,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.5,
                transition: 'opacity 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.5'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Pencil size={12} />
            </button>
          )}

          {hasCustom && !isEditing && (
            <button
              onClick={() => resetBinding(binding.id)}
              title="Reset to default"
              style={{
                padding: 4,
                borderRadius: 4,
                color: '#e8a317',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: 0.7,
                transition: 'opacity 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1'
                e.currentTarget.style.background = 'rgba(232,163,23,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.7'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>

        {binding.when && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.05)',
              padding: '2px 6px',
              borderRadius: 3,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {binding.when}
          </span>
        )}
      </div>

      {/* Conflict warning */}
      {pendingConflicts.length > 0 && (
        <div
          style={{
            margin: '2px 12px 6px 12px',
            padding: '8px 12px',
            background: 'rgba(232, 163, 23, 0.08)',
            border: '1px solid rgba(232, 163, 23, 0.25)',
            borderRadius: 6,
            fontSize: 11,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <AlertTriangle size={13} style={{ color: '#e8a317' }} />
            <span style={{ color: '#e8a317', fontWeight: 600 }}>Keybinding Conflict</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>{pendingShortcut}</span> is already assigned to:
            {pendingConflicts.map((c) => (
              <div key={c.id} style={{ marginLeft: 8, marginTop: 2 }}>
                - {c.label} ({c.category})
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleAcceptConflict}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                background: 'var(--accent)',
                color: '#fff',
              }}
            >
              Assign Anyway
            </button>
            <button
              onClick={handleRejectConflict}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                border: '1px solid var(--border)',
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CategorySection({
  category,
  bindings,
  defaultExpanded,
  editingId,
  onStartEdit,
  onCancelEdit,
  onSaveBinding,
}: {
  category: string
  bindings: Keybinding[]
  defaultExpanded: boolean
  editingId: string | null
  onStartEdit: (id: string) => void
  onCancelEdit: () => void
  onSaveBinding: (id: string, shortcut: string) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded])

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '8px 8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: 4,
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {expanded ? (
          <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
        )}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          {category}
        </span>
        <span
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginLeft: 4,
          }}
        >
          ({bindings.length})
        </span>
      </button>

      {expanded && (
        <div style={{ marginLeft: 8 }}>
          {/* Column headers */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto auto',
              gap: 8,
              padding: '4px 12px',
              borderBottom: '1px solid var(--border)',
              marginBottom: 2,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Command
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              Keybinding
            </span>
            <span />
            <span />
          </div>

          {bindings.map((binding) => (
            <ShortcutRow
              key={binding.id}
              binding={binding}
              editingId={editingId}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSaveBinding={onSaveBinding}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function KeyboardShortcuts({ open, onClose }: Props) {
  const { keybindings, customBindings, resetAllBindings, setCustomBinding, getEffectiveBinding } =
    useKeybindingsStore()
  const [filter, setFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [exportToast, setExportToast] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFilter('')
      setEditingId(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on Escape (only when not editing)
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingId) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose, editingId])

  const handleSaveBinding = useCallback(
    (commandId: string, shortcut: string) => {
      setCustomBinding(commandId, shortcut)
      setEditingId(null)
    },
    [setCustomBinding]
  )

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
  }, [])

  const handleStartEdit = useCallback((id: string) => {
    setEditingId(id)
  }, [])

  const handleExport = useCallback(() => {
    const exportData: Record<string, string> = {}
    for (const [id, shortcut] of Object.entries(customBindings)) {
      exportData[id] = shortcut
    }
    navigator.clipboard.writeText(JSON.stringify(exportData, null, 2)).then(() => {
      setExportToast(true)
      setTimeout(() => setExportToast(false), 2000)
    })
  }, [customBindings])

  const handleResetAll = useCallback(() => {
    resetAllBindings()
    setEditingId(null)
  }, [resetAllBindings])

  const customCount = Object.keys(customBindings).length

  const { filteredByCategory, totalCount } = useMemo(() => {
    const q = filter.toLowerCase().trim()
    const cats = [...new Set(keybindings.map((k) => k.category))]

    const filtered = q
      ? keybindings.filter((k) => {
          const effectiveShortcut = getEffectiveBinding(k.id)
          return (
            k.label.toLowerCase().includes(q) ||
            effectiveShortcut.toLowerCase().includes(q) ||
            k.shortcut.toLowerCase().includes(q) ||
            k.category.toLowerCase().includes(q) ||
            k.id.toLowerCase().includes(q) ||
            (k.when && k.when.toLowerCase().includes(q))
          )
        })
      : keybindings

    const grouped: Record<string, Keybinding[]> = {}
    for (const cat of cats) {
      const items = filtered.filter((k) => k.category === cat)
      if (items.length > 0) {
        grouped[cat] = items
      }
    }

    return {
      filteredByCategory: grouped,
      totalCount: filtered.length,
    }
  }, [filter, keybindings, customBindings, getEffectiveBinding])

  if (!open) return null

  const activeCats = Object.keys(filteredByCategory)
  const isFiltering = filter.trim().length > 0

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (!editingId) onClose()
      }}
    >
      {/* Pulse animation for key capture input */}
      <style>{`
        @keyframes keycapture-pulse {
          0%, 100% { box-shadow: 0 0 0 1px var(--accent); }
          50% { box-shadow: 0 0 0 2px var(--accent), 0 0 8px rgba(var(--accent-rgb, 100,149,237), 0.3); }
        }
      `}</style>

      <div
        className="anim-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 750,
          maxHeight: '85vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Keyboard size={16} style={{ color: 'var(--accent)', marginRight: 10 }} />
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            Keyboard Shortcuts
          </h2>
          <span
            style={{
              marginLeft: 10,
              fontSize: 11,
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.06)',
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {totalCount} commands
          </span>

          {customCount > 0 && (
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: '#e8a317',
                background: 'rgba(232,163,23,0.1)',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {customCount} customized
            </span>
          )}

          {/* Header action buttons */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            {customCount > 0 && (
              <>
                <button
                  onClick={handleExport}
                  title="Export custom keybindings as JSON"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Download size={12} />
                  Export
                  {exportToast && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -28,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--accent)',
                        color: '#fff',
                        fontSize: 10,
                        padding: '3px 8px',
                        borderRadius: 4,
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                      }}
                    >
                      Copied to clipboard
                    </span>
                  )}
                </button>

                <button
                  onClick={handleResetAll}
                  title="Reset all keybindings to defaults"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    color: '#e05252',
                    background: 'transparent',
                    border: '1px solid rgba(224,82,82,0.3)',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(224,82,82,0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <RotateCcw size={12} />
                  Reset All
                </button>
              </>
            )}

            <button
              onClick={onClose}
              style={{
                padding: 4,
                borderRadius: 4,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                marginLeft: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0 10px',
            }}
          >
            <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Type to search keybindings (e.g. save, Ctrl+S, editor)..."
              style={{
                flex: 1,
                padding: '8px 10px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12,
                color: 'var(--text-primary)',
              }}
            />
            {filter && (
              <button
                onClick={() => setFilter('')}
                style={{
                  padding: 2,
                  color: 'var(--text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px' }}>
          {activeCats.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 0',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              No shortcuts match &ldquo;{filter}&rdquo;
            </div>
          )}

          {activeCats.map((cat) => (
            <CategorySection
              key={cat}
              category={cat}
              bindings={filteredByCategory[cat]}
              defaultExpanded={isFiltering || activeCats.length <= 5}
              editingId={editingId}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onSaveBinding={handleSaveBinding}
            />
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Click <Pencil size={10} style={{ display: 'inline', verticalAlign: 'middle', margin: '0 2px' }} /> to edit
            {' '}&middot;{' '}
            Press <KbdKey keyName="Esc" /> to {editingId ? 'cancel edit' : 'close'}
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--text-secondary)',
              background: 'var(--bg-hover)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
