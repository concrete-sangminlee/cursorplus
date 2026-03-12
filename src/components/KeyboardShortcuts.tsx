import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Search, Keyboard } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

interface Shortcut {
  description: string
  keys: string[]
}

interface Category {
  name: string
  shortcuts: Shortcut[]
}

const CATEGORIES: Category[] = [
  {
    name: 'General',
    shortcuts: [
      { description: 'Command Palette', keys: ['Ctrl', 'Shift', 'P'] },
      { description: 'Quick Open', keys: ['Ctrl', 'P'] },
      { description: 'Settings', keys: ['Ctrl', ','] },
      { description: 'Zen Mode', keys: ['Ctrl', 'K', 'Z'] },
    ],
  },
  {
    name: 'Editor',
    shortcuts: [
      { description: 'Save', keys: ['Ctrl', 'S'] },
      { description: 'Undo', keys: ['Ctrl', 'Z'] },
      { description: 'Redo', keys: ['Ctrl', 'Y'] },
      { description: 'Cut', keys: ['Ctrl', 'X'] },
      { description: 'Copy', keys: ['Ctrl', 'C'] },
      { description: 'Paste', keys: ['Ctrl', 'V'] },
      { description: 'Find', keys: ['Ctrl', 'F'] },
      { description: 'Replace', keys: ['Ctrl', 'H'] },
      { description: 'Word Wrap', keys: ['Alt', 'Z'] },
      { description: 'Toggle Comment', keys: ['Ctrl', '/'] },
    ],
  },
  {
    name: 'Navigation',
    shortcuts: [
      { description: 'Explorer', keys: ['Ctrl', 'Shift', 'E'] },
      { description: 'Search', keys: ['Ctrl', 'Shift', 'F'] },
      { description: 'Source Control', keys: ['Ctrl', 'Shift', 'G'] },
      { description: 'Outline', keys: ['Ctrl', 'Shift', 'O'] },
      { description: 'Toggle Sidebar', keys: ['Ctrl', 'B'] },
    ],
  },
  {
    name: 'Terminal',
    shortcuts: [
      { description: 'Toggle Terminal', keys: ['Ctrl', '`'] },
      { description: 'Toggle Bottom Panel', keys: ['Ctrl', 'J'] },
      { description: 'New Terminal', keys: ['Ctrl', 'Shift', '`'] },
    ],
  },
  {
    name: 'Search',
    shortcuts: [
      { description: 'Find in Files', keys: ['Ctrl', 'Shift', 'F'] },
      { description: 'Find', keys: ['Ctrl', 'F'] },
      { description: 'Replace', keys: ['Ctrl', 'H'] },
    ],
  },
  {
    name: 'AI',
    shortcuts: [
      { description: 'Focus Chat', keys: ['Ctrl', 'L'] },
      { description: 'Inline Edit', keys: ['Ctrl', 'K'] },
    ],
  },
]

function KeyBadge({ keyName }: { keyName: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 24,
        height: 22,
        padding: '0 6px',
        fontSize: 11,
        fontWeight: 600,
        fontFamily: 'var(--font-mono, monospace)',
        color: 'var(--text-primary)',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border)',
        borderBottom: '2px solid var(--border)',
        borderRadius: 5,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {keyName}
    </span>
  )
}

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {keys.map((k, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {i > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>+</span>
          )}
          <KeyBadge keyName={k} />
        </span>
      ))}
    </span>
  )
}

export default function KeyboardShortcuts({ open, onClose }: Props) {
  const [filter, setFilter] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFilter('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    if (!filter.trim()) return CATEGORIES
    const q = filter.toLowerCase()
    return CATEGORIES.map((cat) => ({
      ...cat,
      shortcuts: cat.shortcuts.filter(
        (s) =>
          s.description.toLowerCase().includes(q) ||
          s.keys.join(' ').toLowerCase().includes(q) ||
          cat.name.toLowerCase().includes(q),
      ),
    })).filter((cat) => cat.shortcuts.length > 0)
  }, [filter])

  if (!open) return null

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
      onClick={onClose}
    >
      <div
        className="anim-scale-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxHeight: '80vh',
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
          <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Keyboard Shortcuts
          </h2>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              padding: 4,
              borderRadius: 4,
              color: 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
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
              placeholder="Search shortcuts..."
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
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
          {filtered.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 0',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              No shortcuts match "{filter}"
            </div>
          )}

          {filtered.map((category) => (
            <div key={category.name} style={{ marginTop: 12 }}>
              {/* Category header */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.6px',
                  marginBottom: 6,
                  padding: '4px 0',
                }}
              >
                {category.name}
              </div>

              {/* Shortcut rows */}
              {category.shortcuts.map((shortcut, idx) => (
                <div
                  key={`${category.name}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 8px',
                    borderRadius: 6,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {shortcut.description}
                  </span>
                  <KeyCombo keys={shortcut.keys} />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '10px 20px',
            borderTop: '1px solid var(--border)',
          }}
        >
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
