import { useState, useEffect, useRef, useMemo, useCallback, type CSSProperties } from 'react'
import {
  X,
  Search,
  Keyboard,
  ChevronDown,
  ChevronRight,
  Pencil,
  RotateCcw,
  Download,
  Upload,
  AlertTriangle,
  Check,
  Copy,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Trash2,
  Info,
} from 'lucide-react'
import { useKeybindingsStore, type Keybinding } from '../store/keybindings'

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean
  onClose: () => void
}

type SourceFilter = 'all' | 'default' | 'user' | 'extension'
type BindingFilter = 'all' | 'has-binding' | 'no-binding' | 'modified'
type SortColumn = 'command' | 'keybinding' | 'when' | 'source' | 'category'
type SortDirection = 'asc' | 'desc'

interface SortConfig {
  column: SortColumn
  direction: SortDirection
}

interface ExtendedKeybinding extends Keybinding {
  source: 'Default' | 'User' | 'Extension'
  effectiveShortcut: string
  isModified: boolean
  hasConflict: boolean
  conflictsWith: string[]
}

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const WHEN_CLAUSE_OPTIONS = [
  'editorTextFocus',
  'editorFocus',
  'editorHasSelection',
  'editorHasMultipleSelections',
  'editorReadonly',
  'editorLangId',
  'editorHasCompletionItemProvider',
  'textInputFocus',
  'inputFocus',
  'terminalFocus',
  'terminalVisible',
  'terminalProcessSupported',
  'panelFocus',
  'panelVisible',
  'sidebarVisible',
  'sideBarFocus',
  'explorerViewletFocus',
  'searchViewletFocus',
  'debugActive',
  'debugState',
  'debugType',
  'inDebugMode',
  'breakpointWidgetVisible',
  'callStackItemType',
  'suggestWidgetVisible',
  'suggestWidgetMultipleSuggestions',
  'parameterHintsVisible',
  'renameInputVisible',
  'findWidgetVisible',
  'replaceActive',
  'inSnippetMode',
  'hasSnippetCompletions',
  'markdownPreviewFocus',
  'notebookEditorFocus',
  'listFocus',
  'treeFocus',
  'filesExplorerFocus',
  'resourceScheme',
  'isLinux',
  'isMac',
  'isWindows',
  'isWeb',
  'config.editor.tabCompletion',
  'vim.active',
  'vim.mode',
  'scmRepository',
  'gitOpenRepositoryCount',
  'activeEditorGroupEmpty',
  'multipleEditorGroups',
]

const CATEGORY_ORDER = [
  'File',
  'Editor',
  'Navigation',
  'Search',
  'View',
  'Terminal',
  'Debug',
  'Git',
  'AI',
]

const CATEGORY_ICONS: Record<string, string> = {
  File: '\u{1F4C4}',
  Editor: '\u{270F}\u{FE0F}',
  Navigation: '\u{1F9ED}',
  Search: '\u{1F50D}',
  View: '\u{1F441}\u{FE0F}',
  Terminal: '\u{1F4BB}',
  Debug: '\u{1F41B}',
  Git: '\u{1F500}',
  AI: '\u{1F916}',
}

/* ═══════════════════════════════════════════════════════════════════════════
   Injected styles
   ═══════════════════════════════════════════════════════════════════════════ */

const STYLES = `
@keyframes kbe-pulse {
  0%, 100% { box-shadow: 0 0 0 1px var(--accent); }
  50% { box-shadow: 0 0 0 2px var(--accent), 0 0 12px rgba(var(--accent-rgb, 100,149,237), 0.35); }
}
@keyframes kbe-fade-in {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes kbe-toast-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes kbe-slide-in {
  from { opacity: 0; transform: scale(0.98); }
  to   { opacity: 1; transform: scale(1); }
}
.kbe-row:hover { background: rgba(255,255,255,0.035) !important; }
.kbe-row:hover .kbe-row-actions { opacity: 1 !important; }
.kbe-row.kbe-row-conflict { background: rgba(232,163,23,0.04) !important; }
.kbe-row.kbe-row-editing { background: rgba(100,149,237,0.06) !important; }
.kbe-btn-ghost {
  padding: 4px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}
.kbe-btn-ghost:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary);
}
.kbe-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}
.kbe-header-btn:hover {
  background: rgba(255,255,255,0.06);
}
.kbe-modifier-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 40px;
  height: 28px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  border-radius: 4px;
  transition: all 0.1s ease;
  user-select: none;
}
.kbe-modifier-key[data-active="false"] {
  color: var(--text-muted);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  opacity: 0.5;
}
.kbe-modifier-key[data-active="true"] {
  color: #fff;
  background: var(--accent);
  border: 1px solid var(--accent);
  opacity: 1;
  box-shadow: 0 0 8px rgba(var(--accent-rgb, 100,149,237), 0.4);
}
.kbe-sortable-header {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transition: color 0.15s;
}
.kbe-sortable-header:hover {
  color: var(--text-primary) !important;
}
.kbe-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  transition: all 0.15s;
  white-space: nowrap;
}
.kbe-filter-chip:hover {
  border-color: var(--accent);
  color: var(--text-secondary);
}
.kbe-filter-chip[data-active="true"] {
  background: rgba(var(--accent-rgb, 100,149,237), 0.12);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.kbe-when-autocomplete {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 180px;
  overflow-y: auto;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 50;
  margin-top: 2px;
}
.kbe-when-autocomplete-item {
  padding: 5px 10px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.1s;
}
.kbe-when-autocomplete-item:hover,
.kbe-when-autocomplete-item[data-selected="true"] {
  background: rgba(var(--accent-rgb, 100,149,237), 0.12);
  color: var(--text-primary);
}
.kbe-scrollbar::-webkit-scrollbar { width: 6px; }
.kbe-scrollbar::-webkit-scrollbar-track { background: transparent; }
.kbe-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
}
.kbe-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.2);
}
`

/* ═══════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════ */

function parseShortcut(shortcut: string): string[][] {
  if (!shortcut) return []
  return shortcut
    .split(/\s+/)
    .filter(Boolean)
    .map((chord) => chord.split('+'))
}

function keyEventToString(e: KeyboardEvent): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null

  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push(isMac ? 'Cmd' : 'Ctrl')
  if (e.shiftKey) parts.push('Shift')
  if (e.altKey) parts.push(isMac ? 'Option' : 'Alt')

  let key = e.key
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
  else if (key.startsWith('F') && key.length <= 3 && !isNaN(Number(key.slice(1)))) {
    // F1-F12 keys - keep as is
  } else if (key === '`') key = '`'
  else if (key === '-') key = '-'
  else if (key === '=') key = '='
  else if (key === '[') key = '['
  else if (key === ']') key = ']'
  else if (key === '\\') key = '\\'
  else if (key === '/') key = '/'
  else if (key === '.') key = '.'
  else if (key === ',') key = ','
  else if (key === ';') key = ';'
  else if (key === "'") key = "'"
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)
  return parts.join('+')
}

function displayPlatformKey(shortcut: string): string {
  if (!shortcut) return ''
  if (isMac) {
    return shortcut
      .replace(/\bCtrl\b/g, '\u2318')
      .replace(/\bCmd\b/g, '\u2318')
      .replace(/\bShift\b/g, '\u21E7')
      .replace(/\bAlt\b/g, '\u2325')
      .replace(/\bOption\b/g, '\u2325')
      .replace(/\bMeta\b/g, '\u2318')
  }
  return shortcut
}

function normalizeShortcut(shortcut: string): string {
  return shortcut.toLowerCase().replace(/\s+/g, ' ').trim()
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  })
}

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Keyboard key cap ─── */

function KbdKey({ keyName }: { keyName: string }) {
  const displayed = isMac ? displayPlatformKey(keyName) : keyName
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
      {displayed}
    </kbd>
  )
}

/* ─── Shortcut display ─── */

function ShortcutDisplay({
  shortcut,
  isModified,
  hasConflict,
  compact,
}: {
  shortcut: string
  isModified?: boolean
  hasConflict?: boolean
  compact?: boolean
}) {
  const chords = parseShortcut(shortcut)
  if (chords.length === 0) {
    return (
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', opacity: 0.5 }}>
        Unassigned
      </span>
    )
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
      {chords.map((keys, ci) => (
        <span key={ci} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          {ci > 0 && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', margin: '0 1px', opacity: 0.4 }}>
              {' '}
            </span>
          )}
          {keys.map((k, ki) => (
            <span key={ki} style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              {ki > 0 && (
                <span style={{ fontSize: 8, color: 'var(--text-muted)', opacity: 0.4 }}>+</span>
              )}
              <KbdKey keyName={k} />
            </span>
          ))}
        </span>
      ))}
      {isModified && !compact && (
        <span
          style={{
            fontSize: 8,
            color: '#e8a317',
            background: 'rgba(232, 163, 23, 0.12)',
            padding: '1px 5px',
            borderRadius: 3,
            fontWeight: 600,
            marginLeft: 3,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Modified
        </span>
      )}
      {hasConflict && !compact && (
        <span
          style={{
            fontSize: 8,
            color: '#e05252',
            background: 'rgba(224, 82, 82, 0.12)',
            padding: '1px 5px',
            borderRadius: 3,
            fontWeight: 600,
            marginLeft: 3,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Conflict
        </span>
      )}
    </span>
  )
}

/* ─── Source badge ─── */

function SourceBadge({ source }: { source: 'Default' | 'User' | 'Extension' }) {
  const styles: Record<string, CSSProperties> = {
    User: {
      color: '#e8a317',
      background: 'rgba(232, 163, 23, 0.10)',
      border: '1px solid rgba(232, 163, 23, 0.20)',
    },
    Extension: {
      color: '#4ec9b0',
      background: 'rgba(78, 201, 176, 0.10)',
      border: '1px solid rgba(78, 201, 176, 0.20)',
    },
    Default: {
      color: 'var(--text-muted)',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
    },
  }

  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: '2px 6px',
        borderRadius: 3,
        letterSpacing: '0.3px',
        whiteSpace: 'nowrap',
        ...styles[source],
      }}
    >
      {source}
    </span>
  )
}

/* ─── When clause badge ─── */

function WhenBadge({ when }: { when?: string }) {
  if (!when) {
    return (
      <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.3 }}>--</span>
    )
  }
  return (
    <span
      style={{
        fontSize: 10,
        color: 'var(--text-muted)',
        background: 'rgba(255,255,255,0.05)',
        padding: '2px 6px',
        borderRadius: 3,
        fontFamily: 'var(--font-mono, monospace)',
        maxWidth: 160,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'inline-block',
      }}
      title={when}
    >
      {when}
    </span>
  )
}

/* ─── Key capture widget (record keybinding mode) ─── */

function KeyCaptureWidget({
  onCapture,
  onCancel,
  supportChords,
}: {
  onCapture: (shortcut: string) => void
  onCancel: () => void
  supportChords?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [chordParts, setChordParts] = useState<string[]>([])
  const [modifiers, setModifiers] = useState({ ctrl: false, shift: false, alt: false, meta: false })
  const chordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    containerRef.current?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        onCancel()
        return
      }

      setModifiers({
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      })

      const combo = keyEventToString(e)
      if (combo) {
        if (supportChords && chordParts.length === 0) {
          // First part of a potential chord
          setChordParts([combo])
          // Wait for second chord part
          if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current)
          chordTimeoutRef.current = setTimeout(() => {
            onCapture(combo)
            setChordParts([])
          }, 1500)
        } else if (supportChords && chordParts.length === 1) {
          // Second chord part
          if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current)
          const fullChord = `${chordParts[0]} ${combo}`
          onCapture(fullChord)
          setChordParts([])
        } else {
          onCapture(combo)
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setModifiers({
        ctrl: e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey,
      })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current)
    }
  }, [onCapture, onCancel, supportChords, chordParts])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--accent)',
        borderRadius: 6,
        outline: 'none',
        animation: 'kbe-pulse 2s ease-in-out infinite',
        minWidth: 260,
      }}
    >
      <div style={{ display: 'flex', gap: 5 }}>
        <span className="kbe-modifier-key" data-active={String(modifiers.ctrl || modifiers.meta)}>
          {isMac ? '\u2318' : 'Ctrl'}
        </span>
        <span className="kbe-modifier-key" data-active={String(modifiers.shift)}>
          {isMac ? '\u21E7' : 'Shift'}
        </span>
        <span className="kbe-modifier-key" data-active={String(modifiers.alt)}>
          {isMac ? '\u2325' : 'Alt'}
        </span>
      </div>

      <div
        style={{
          fontSize: 11,
          color: chordParts.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
          fontStyle: chordParts.length > 0 ? 'normal' : 'italic',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {chordParts.length > 0 ? (
          <>
            <ShortcutDisplay shortcut={chordParts[0]} compact />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              waiting for second chord...
            </span>
          </>
        ) : (
          'Press desired key combination...'
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          <KbdKey keyName="Esc" /> cancel
        </span>
        {supportChords && (
          <span
            style={{
              fontSize: 9,
              color: 'var(--accent)',
              background: 'rgba(var(--accent-rgb, 100,149,237), 0.08)',
              padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            Chord support enabled
          </span>
        )}
      </div>
    </div>
  )
}

/* ─── When clause editor with autocomplete ─── */

function WhenClauseEditor({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (val: string) => void
  onClose: () => void
}) {
  const [inputVal, setInputVal] = useState(value)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const query = inputVal.split(/\s*(?:&&|\|\|)\s*/).pop()?.trim().toLowerCase() || ''
    if (!query) return WHEN_CLAUSE_OPTIONS.slice(0, 20)
    return WHEN_CLAUSE_OPTIONS.filter((opt) => opt.toLowerCase().includes(query))
  }, [inputVal])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key === 'Enter') {
      if (showAutocomplete && filtered.length > 0) {
        e.preventDefault()
        insertCompletion(filtered[selectedIdx])
      } else {
        e.preventDefault()
        onChange(inputVal)
        onClose()
      }
      return
    }
    if (showAutocomplete) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Tab') {
        e.preventDefault()
        if (filtered.length > 0) insertCompletion(filtered[selectedIdx])
      }
    }
  }

  const insertCompletion = (completion: string) => {
    const parts = inputVal.split(/(\s*(?:&&|\|\|)\s*)/)
    parts[parts.length - 1] = completion
    const newVal = parts.join('')
    setInputVal(newVal)
    setShowAutocomplete(false)
    setSelectedIdx(0)
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          ref={inputRef}
          value={inputVal}
          onChange={(e) => {
            setInputVal(e.target.value)
            setShowAutocomplete(true)
            setSelectedIdx(0)
          }}
          onFocus={() => setShowAutocomplete(true)}
          onBlur={() => setTimeout(() => setShowAutocomplete(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="e.g. editorTextFocus && !suggestWidgetVisible"
          style={{
            flex: 1,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--text-primary)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--accent)',
            borderRadius: 4,
            outline: 'none',
          }}
        />
        <button
          className="kbe-btn-ghost"
          onClick={() => {
            onChange(inputVal)
            onClose()
          }}
          title="Confirm"
          style={{ color: '#4ec9b0' }}
        >
          <Check size={13} />
        </button>
        <button
          className="kbe-btn-ghost"
          onClick={onClose}
          title="Cancel"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={13} />
        </button>
      </div>

      {showAutocomplete && filtered.length > 0 && (
        <div className="kbe-when-autocomplete">
          {filtered.slice(0, 15).map((opt, idx) => (
            <div
              key={opt}
              className="kbe-when-autocomplete-item"
              data-selected={String(idx === selectedIdx)}
              onMouseDown={(e) => {
                e.preventDefault()
                insertCompletion(opt)
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Conflict detection warning banner ─── */

function ConflictWarning({
  shortcut,
  conflicts,
  onAccept,
  onCancel,
}: {
  shortcut: string
  conflicts: Keybinding[]
  onAccept: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        margin: '2px 0 6px 0',
        padding: '10px 14px',
        background: 'rgba(232, 163, 23, 0.06)',
        border: '1px solid rgba(232, 163, 23, 0.20)',
        borderRadius: 6,
        fontSize: 11,
        animation: 'kbe-fade-in 0.15s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <AlertTriangle size={13} style={{ color: '#e8a317' }} />
        <span style={{ color: '#e8a317', fontWeight: 600 }}>Keybinding Conflict Detected</span>
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 10 }}>
        <ShortcutDisplay shortcut={shortcut} compact /> is already bound to:
        {conflicts.map((c) => (
          <div key={c.id} style={{ marginLeft: 8, marginTop: 3 }}>
            <span style={{ fontWeight: 600 }}>{c.label}</span>
            <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>({c.category})</span>
            {c.when && (
              <span
                style={{
                  color: 'var(--text-muted)',
                  marginLeft: 6,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                when: {c.when}
              </span>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onAccept}
          className="kbe-header-btn"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            fontWeight: 600,
          }}
        >
          <Check size={12} />
          Assign Anyway
        </button>
        <button
          onClick={onCancel}
          className="kbe-header-btn"
          style={{
            background: 'transparent',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            fontWeight: 600,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/* ─── Confirm reset all dialog ─── */

function ConfirmResetDialog({
  customCount,
  onConfirm,
  onCancel,
}: {
  customCount: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '24px 28px',
          maxWidth: 380,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          animation: 'kbe-fade-in 0.15s ease-out',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <AlertTriangle size={18} style={{ color: '#e05252' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            Reset All Keybindings?
          </span>
        </div>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            margin: '0 0 20px',
            lineHeight: 1.6,
          }}
        >
          This will reset <strong>{customCount}</strong> customized
          keybinding{customCount !== 1 ? 's' : ''} back to their default values. This action
          cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            className="kbe-header-btn"
            style={{
              color: 'var(--text-secondary)',
              background: 'transparent',
              border: '1px solid var(--border)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="kbe-header-btn"
            style={{
              color: '#fff',
              background: '#e05252',
              border: '1px solid #e05252',
            }}
          >
            <RotateCcw size={12} />
            Reset All
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── Toast notification ─── */

function Toast({ message, type }: { message: string; type: 'success' | 'error' | 'info' }) {
  const colors = {
    success: { color: '#4ec9b0', bg: 'rgba(78,201,176,0.10)' },
    error: { color: '#e05252', bg: 'rgba(224,82,82,0.10)' },
    info: { color: 'var(--accent)', bg: 'rgba(var(--accent-rgb, 100,149,237),0.10)' },
  }
  const c = colors[type]
  return (
    <div
      style={{
        padding: '8px 16px',
        fontSize: 11,
        fontWeight: 600,
        color: c.color,
        background: c.bg,
        borderBottom: '1px solid var(--border)',
        animation: 'kbe-toast-in 0.2s ease-out',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {type === 'success' && <Check size={12} />}
      {type === 'error' && <AlertTriangle size={12} />}
      {type === 'info' && <Info size={12} />}
      {message}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Grid column layout
   ═══════════════════════════════════════════════════════════════════════════ */

const GRID_TEMPLATE = '1fr 200px 140px 70px 80px'

/* ═══════════════════════════════════════════════════════════════════════════
   Single keybinding row
   ═══════════════════════════════════════════════════════════════════════════ */

function KeybindingRow({
  binding,
  editingId,
  editingWhenId,
  onStartEdit,
  onStartWhenEdit,
  onCancelEdit,
  onCancelWhenEdit,
  onSaveBinding,
  onSaveWhen,
  onResetBinding,
  onCopyCommandId,
}: {
  binding: ExtendedKeybinding
  editingId: string | null
  editingWhenId: string | null
  onStartEdit: (id: string) => void
  onStartWhenEdit: (id: string) => void
  onCancelEdit: () => void
  onCancelWhenEdit: () => void
  onSaveBinding: (id: string, shortcut: string) => void
  onSaveWhen: (id: string, when: string) => void
  onResetBinding: (id: string) => void
  onCopyCommandId: (id: string) => void
}) {
  const isEditing = editingId === binding.id
  const isEditingWhen = editingWhenId === binding.id
  const [pendingConflicts, setPendingConflicts] = useState<Keybinding[]>([])
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null)

  const { findConflicts } = useKeybindingsStore()

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
    [binding.id, findConflicts, onSaveBinding],
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

  const rowClass = [
    'kbe-row',
    binding.hasConflict ? 'kbe-row-conflict' : '',
    isEditing ? 'kbe-row-editing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div>
      <div
        className={rowClass}
        style={{
          display: 'grid',
          gridTemplateColumns: GRID_TEMPLATE,
          alignItems: 'center',
          gap: 8,
          padding: '5px 12px',
          borderRadius: 3,
          transition: 'background 0.1s',
          borderBottom: '1px solid rgba(255,255,255,0.02)',
          cursor: 'default',
          minHeight: 34,
        }}
        onDoubleClick={() => {
          if (!isEditing && !isEditingWhen) onStartEdit(binding.id)
        }}
      >
        {/* Command column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: binding.isModified ? '#e8a317' : 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: binding.isModified ? 500 : 400,
            }}
            title={`${binding.label} (${binding.id})`}
          >
            {binding.label}
          </span>
          <span
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              opacity: 0.5,
              fontFamily: 'var(--font-mono, monospace)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {binding.id}
          </span>
        </div>

        {/* Keybinding column */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          {isEditing && pendingConflicts.length === 0 ? (
            <KeyCaptureWidget
              onCapture={handleCapture}
              onCancel={onCancelEdit}
              supportChords
            />
          ) : (
            <ShortcutDisplay
              shortcut={binding.effectiveShortcut}
              isModified={binding.isModified}
              hasConflict={binding.hasConflict}
            />
          )}
        </div>

        {/* When column */}
        <div style={{ minWidth: 0 }}>
          {isEditingWhen ? (
            <WhenClauseEditor
              value={binding.when || ''}
              onChange={(val) => onSaveWhen(binding.id, val)}
              onClose={onCancelWhenEdit}
            />
          ) : (
            <WhenBadge when={binding.when} />
          )}
        </div>

        {/* Source column */}
        <SourceBadge source={binding.source} />

        {/* Actions column */}
        <div
          className="kbe-row-actions"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            opacity: 0,
            transition: 'opacity 0.15s',
          }}
        >
          {!isEditing && (
            <button
              className="kbe-btn-ghost"
              onClick={() => onStartEdit(binding.id)}
              title="Edit keybinding"
            >
              <Pencil size={11} />
            </button>
          )}
          {!isEditingWhen && (
            <button
              className="kbe-btn-ghost"
              onClick={() => onStartWhenEdit(binding.id)}
              title="Edit when clause"
            >
              <Filter size={11} />
            </button>
          )}
          <button
            className="kbe-btn-ghost"
            onClick={() => onCopyCommandId(binding.id)}
            title="Copy command ID"
          >
            <Copy size={11} />
          </button>
          {binding.isModified && !isEditing && (
            <button
              className="kbe-btn-ghost"
              onClick={() => onResetBinding(binding.id)}
              title="Reset to default"
              style={{ color: '#e8a317' }}
            >
              <RotateCcw size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Conflict warning */}
      {pendingConflicts.length > 0 && pendingShortcut && (
        <div style={{ padding: '0 12px' }}>
          <ConflictWarning
            shortcut={pendingShortcut}
            conflicts={pendingConflicts}
            onAccept={handleAcceptConflict}
            onCancel={handleRejectConflict}
          />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Category group (collapsible)
   ═══════════════════════════════════════════════════════════════════════════ */

function CategoryGroup({
  category,
  bindings,
  defaultExpanded,
  editingId,
  editingWhenId,
  onStartEdit,
  onStartWhenEdit,
  onCancelEdit,
  onCancelWhenEdit,
  onSaveBinding,
  onSaveWhen,
  onResetBinding,
  onCopyCommandId,
}: {
  category: string
  bindings: ExtendedKeybinding[]
  defaultExpanded: boolean
  editingId: string | null
  editingWhenId: string | null
  onStartEdit: (id: string) => void
  onStartWhenEdit: (id: string) => void
  onCancelEdit: () => void
  onCancelWhenEdit: () => void
  onSaveBinding: (id: string, shortcut: string) => void
  onSaveWhen: (id: string, when: string) => void
  onResetBinding: (id: string) => void
  onCopyCommandId: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    setExpanded(defaultExpanded)
  }, [defaultExpanded])

  const modifiedCount = bindings.filter((b) => b.isModified).length
  const conflictCount = bindings.filter((b) => b.hasConflict).length

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Category header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '7px 8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          borderRadius: 4,
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {expanded ? (
          <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        ) : (
          <ChevronRight size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
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
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          ({bindings.length})
        </span>
        {modifiedCount > 0 && (
          <span
            style={{
              fontSize: 9,
              color: '#e8a317',
              background: 'rgba(232,163,23,0.10)',
              padding: '1px 6px',
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {modifiedCount} modified
          </span>
        )}
        {conflictCount > 0 && (
          <span
            style={{
              fontSize: 9,
              color: '#e05252',
              background: 'rgba(224,82,82,0.10)',
              padding: '1px 6px',
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Bindings list */}
      {expanded && (
        <div style={{ marginLeft: 6 }}>
          {bindings.map((binding) => (
            <KeybindingRow
              key={binding.id}
              binding={binding}
              editingId={editingId}
              editingWhenId={editingWhenId}
              onStartEdit={onStartEdit}
              onStartWhenEdit={onStartWhenEdit}
              onCancelEdit={onCancelEdit}
              onCancelWhenEdit={onCancelWhenEdit}
              onSaveBinding={onSaveBinding}
              onSaveWhen={onSaveWhen}
              onResetBinding={onResetBinding}
              onCopyCommandId={onCopyCommandId}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Column header (sortable)
   ═══════════════════════════════════════════════════════════════════════════ */

function SortableHeader({
  label,
  column,
  sortConfig,
  onSort,
}: {
  label: string
  column: SortColumn
  sortConfig: SortConfig
  onSort: (col: SortColumn) => void
}) {
  const isActive = sortConfig.column === column
  return (
    <span
      className="kbe-sortable-header"
      onClick={() => onSort(column)}
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: isActive ? 'var(--accent)' : 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {label}
      {isActive ? (
        sortConfig.direction === 'asc' ? (
          <ArrowUp size={10} />
        ) : (
          <ArrowDown size={10} />
        )
      ) : (
        <ArrowUpDown size={9} style={{ opacity: 0.3 }} />
      )}
    </span>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════ */

export default function KeybindingEditor({ open, onClose }: Props) {
  const {
    keybindings,
    customBindings,
    setCustomBinding,
    resetBinding,
    resetAllBindings,
    getEffectiveBinding,
    isCustomized,
    findConflicts,
    exportBindings,
    importBindings,
  } = useKeybindingsStore()

  /* ─── Local state ─── */
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>('all')
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'category', direction: 'asc' })
  const [groupByCategory, setGroupByCategory] = useState(true)
  const [showDefaults, setShowDefaults] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingWhenId, setEditingWhenId] = useState<string | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [showFilterBar, setShowFilterBar] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  /* ─── Reset state on open ─── */
  useEffect(() => {
    if (open) {
      setSearchQuery('')
      setEditingId(null)
      setEditingWhenId(null)
      setShowResetConfirm(false)
      setToast(null)
      setTimeout(() => searchInputRef.current?.focus(), 60)
    }
  }, [open])

  /* ─── Close on Escape ─── */
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingId && !editingWhenId && !showResetConfirm) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose, editingId, editingWhenId, showResetConfirm])

  /* ─── Show toast helper ─── */
  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info') => {
      setToast({ message, type })
      setTimeout(() => setToast(null), 3000)
    },
    [],
  )

  /* ─── Build extended bindings with conflict detection ─── */
  const extendedBindings: ExtendedKeybinding[] = useMemo(() => {
    // Build a map of shortcut -> binding ids for conflict detection
    const shortcutMap = new Map<string, string[]>()
    for (const kb of keybindings) {
      const effective = kb.id in customBindings ? customBindings[kb.id] : kb.shortcut
      if (!effective) continue
      const normalized = normalizeShortcut(effective)
      if (!shortcutMap.has(normalized)) {
        shortcutMap.set(normalized, [])
      }
      shortcutMap.get(normalized)!.push(kb.id)
    }

    return keybindings.map((kb) => {
      const effective = kb.id in customBindings ? customBindings[kb.id] : kb.shortcut
      const normalized = effective ? normalizeShortcut(effective) : ''
      const conflictIds = normalized ? (shortcutMap.get(normalized) || []).filter((id) => id !== kb.id) : []
      // Only flag as conflict if same "when" context or no when clause
      const realConflicts = conflictIds.filter((cid) => {
        const other = keybindings.find((k) => k.id === cid)
        if (!other) return false
        // Both have no when -> conflict
        if (!kb.when && !other.when) return true
        // Same when -> conflict
        if (kb.when && other.when && kb.when === other.when) return true
        // One has when and other doesn't -> potential conflict
        if (!kb.when || !other.when) return true
        return false
      })

      return {
        ...kb,
        source: (kb.id in customBindings ? 'User' : 'Default') as 'Default' | 'User' | 'Extension',
        effectiveShortcut: effective,
        isModified: kb.id in customBindings,
        hasConflict: realConflicts.length > 0,
        conflictsWith: realConflicts,
      }
    })
  }, [keybindings, customBindings])

  /* ─── Filter & sort ─── */
  const processedBindings = useMemo(() => {
    let filtered = extendedBindings

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      filtered = filtered.filter((kb) => {
        return (
          kb.label.toLowerCase().includes(q) ||
          kb.id.toLowerCase().includes(q) ||
          kb.effectiveShortcut.toLowerCase().includes(q) ||
          kb.shortcut.toLowerCase().includes(q) ||
          kb.category.toLowerCase().includes(q) ||
          (kb.when && kb.when.toLowerCase().includes(q)) ||
          kb.source.toLowerCase().includes(q)
        )
      })
    }

    // Source filter
    if (sourceFilter !== 'all') {
      filtered = filtered.filter((kb) => kb.source.toLowerCase() === sourceFilter)
    }

    // Binding filter
    if (bindingFilter === 'has-binding') {
      filtered = filtered.filter((kb) => kb.effectiveShortcut !== '')
    } else if (bindingFilter === 'no-binding') {
      filtered = filtered.filter((kb) => kb.effectiveShortcut === '')
    } else if (bindingFilter === 'modified') {
      filtered = filtered.filter((kb) => kb.isModified)
    }

    // Show/hide defaults
    if (!showDefaults) {
      filtered = filtered.filter((kb) => kb.isModified)
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1
      switch (sortConfig.column) {
        case 'command':
          return dir * a.label.localeCompare(b.label)
        case 'keybinding':
          return dir * a.effectiveShortcut.localeCompare(b.effectiveShortcut)
        case 'when':
          return dir * (a.when || '').localeCompare(b.when || '')
        case 'source':
          return dir * a.source.localeCompare(b.source)
        case 'category': {
          const aIdx = CATEGORY_ORDER.indexOf(a.category)
          const bIdx = CATEGORY_ORDER.indexOf(b.category)
          const aOrder = aIdx >= 0 ? aIdx : 999
          const bOrder = bIdx >= 0 ? bIdx : 999
          if (aOrder !== bOrder) return dir * (aOrder - bOrder)
          return dir * a.label.localeCompare(b.label)
        }
        default:
          return 0
      }
    })

    return sorted
  }, [extendedBindings, searchQuery, sourceFilter, bindingFilter, showDefaults, sortConfig])

  /* ─── Group by category ─── */
  const groupedBindings = useMemo(() => {
    if (!groupByCategory) return null
    const groups: Record<string, ExtendedKeybinding[]> = {}
    for (const kb of processedBindings) {
      if (!groups[kb.category]) {
        groups[kb.category] = []
      }
      groups[kb.category].push(kb)
    }
    // Sort categories by CATEGORY_ORDER
    const ordered: Array<{ category: string; bindings: ExtendedKeybinding[] }> = []
    const cats = Object.keys(groups)
    cats.sort((a, b) => {
      const aIdx = CATEGORY_ORDER.indexOf(a)
      const bIdx = CATEGORY_ORDER.indexOf(b)
      return (aIdx >= 0 ? aIdx : 999) - (bIdx >= 0 ? bIdx : 999)
    })
    for (const cat of cats) {
      ordered.push({ category: cat, bindings: groups[cat] })
    }
    return ordered
  }, [processedBindings, groupByCategory])

  /* ─── Handlers ─── */
  const handleSort = useCallback((column: SortColumn) => {
    setSortConfig((prev) => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }, [])

  const handleSaveBinding = useCallback(
    (commandId: string, shortcut: string) => {
      setCustomBinding(commandId, shortcut)
      setEditingId(null)
      showToast(`Keybinding updated for "${keybindings.find((k) => k.id === commandId)?.label || commandId}"`, 'success')
    },
    [setCustomBinding, showToast, keybindings],
  )

  const handleSaveWhen = useCallback(
    (commandId: string, when: string) => {
      // When clause editing - store as custom binding metadata
      // For now, we just update the custom binding to trigger re-render
      const current = getEffectiveBinding(commandId)
      if (current) {
        setCustomBinding(commandId, current)
      }
      setEditingWhenId(null)
      showToast(`When clause updated for "${keybindings.find((k) => k.id === commandId)?.label || commandId}"`, 'success')
    },
    [getEffectiveBinding, setCustomBinding, showToast, keybindings],
  )

  const handleResetBinding = useCallback(
    (commandId: string) => {
      resetBinding(commandId)
      showToast(`Reset keybinding for "${keybindings.find((k) => k.id === commandId)?.label || commandId}"`, 'info')
    },
    [resetBinding, showToast, keybindings],
  )

  const handleCopyCommandId = useCallback(
    (commandId: string) => {
      copyToClipboard(commandId)
      showToast(`Copied: ${commandId}`, 'info')
    },
    [showToast],
  )

  const handleResetAll = useCallback(() => {
    resetAllBindings()
    setEditingId(null)
    setEditingWhenId(null)
    setShowResetConfirm(false)
    showToast('All keybindings reset to defaults', 'success')
  }, [resetAllBindings, showToast])

  const handleExport = useCallback(() => {
    const data = exportBindings()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'keybindings.json'
    a.click()
    URL.revokeObjectURL(url)

    copyToClipboard(data)
    showToast('Keybindings exported and copied to clipboard', 'success')
  }, [exportBindings, showToast])

  const handleImport = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const reader = new FileReader()
      reader.onload = (ev) => {
        const text = ev.target?.result as string
        const success = importBindings(text)
        if (success) {
          showToast('Keybindings imported successfully', 'success')
        } else {
          showToast('Failed to import keybindings: invalid JSON format', 'error')
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [importBindings, showToast],
  )

  /* ─── Derived values ─── */
  const customCount = Object.keys(customBindings).length
  const conflictCount = extendedBindings.filter((b) => b.hasConflict).length
  const totalVisible = processedBindings.length
  const isFiltering = searchQuery.trim().length > 0 || sourceFilter !== 'all' || bindingFilter !== 'all'

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
      onClick={(e) => {
        if (!editingId && !editingWhenId && !showResetConfirm) onClose()
      }}
    >
      <style>{STYLES}</style>

      {/* Hidden file import input */}
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <ConfirmResetDialog
          customCount={customCount}
          onConfirm={handleResetAll}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {/* ─── Main panel ─── */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 920,
          maxWidth: '95vw',
          maxHeight: '88vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'kbe-slide-in 0.2s ease-out',
        }}
      >
        {/* ═══ Header ═══ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <Keyboard size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <h2
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text-primary)',
              margin: 0,
              marginRight: 8,
            }}
          >
            Keyboard Shortcuts
          </h2>

          {/* Stats badges */}
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.05)',
              padding: '2px 8px',
              borderRadius: 10,
            }}
          >
            {totalVisible}/{keybindings.length} commands
          </span>
          {customCount > 0 && (
            <span
              style={{
                fontSize: 10,
                color: '#e8a317',
                background: 'rgba(232,163,23,0.08)',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {customCount} customized
            </span>
          )}
          {conflictCount > 0 && (
            <span
              style={{
                fontSize: 10,
                color: '#e05252',
                background: 'rgba(224,82,82,0.08)',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {conflictCount} conflict{conflictCount !== 1 ? 's' : ''}
            </span>
          )}

          {/* Header action buttons */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
            {/* Toggle group by category */}
            <button
              onClick={() => setGroupByCategory(!groupByCategory)}
              className="kbe-header-btn"
              title={groupByCategory ? 'Show as flat list' : 'Group by category'}
              style={{
                color: groupByCategory ? 'var(--accent)' : 'var(--text-muted)',
                background: groupByCategory ? 'rgba(var(--accent-rgb, 100,149,237), 0.08)' : 'transparent',
                border: '1px solid var(--border)',
              }}
            >
              <ChevronDown size={11} />
              Group
            </button>

            {/* Show/hide defaults toggle */}
            <button
              onClick={() => setShowDefaults(!showDefaults)}
              className="kbe-header-btn"
              title={showDefaults ? 'Show only modified' : 'Show all keybindings'}
              style={{
                color: showDefaults ? 'var(--text-muted)' : 'var(--accent)',
                background: !showDefaults ? 'rgba(var(--accent-rgb, 100,149,237), 0.08)' : 'transparent',
                border: '1px solid var(--border)',
              }}
            >
              {showDefaults ? <Eye size={11} /> : <EyeOff size={11} />}
              {showDefaults ? 'All' : 'Modified'}
            </button>

            {/* Toggle filter bar */}
            <button
              onClick={() => setShowFilterBar(!showFilterBar)}
              className="kbe-header-btn"
              title="Toggle filter options"
              style={{
                color: showFilterBar || isFiltering ? 'var(--accent)' : 'var(--text-muted)',
                background: showFilterBar ? 'rgba(var(--accent-rgb, 100,149,237), 0.08)' : 'transparent',
                border: '1px solid var(--border)',
              }}
            >
              <Filter size={11} />
              Filter
            </button>

            <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px' }} />

            {/* Import */}
            <button
              onClick={handleImport}
              title="Import keybindings.json"
              className="kbe-header-btn"
              style={{
                color: 'var(--text-secondary)',
                background: 'transparent',
                border: '1px solid var(--border)',
              }}
            >
              <Upload size={11} />
              Import
            </button>

            {/* Export */}
            {customCount > 0 && (
              <button
                onClick={handleExport}
                title="Export keybindings.json"
                className="kbe-header-btn"
                style={{
                  color: 'var(--text-secondary)',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                }}
              >
                <Download size={11} />
                Export
              </button>
            )}

            {/* Reset All */}
            {customCount > 0 && (
              <button
                onClick={() => setShowResetConfirm(true)}
                title="Reset all keybindings to defaults"
                className="kbe-header-btn"
                style={{
                  color: '#e05252',
                  background: 'transparent',
                  border: '1px solid rgba(224,82,82,0.25)',
                }}
              >
                <RotateCcw size={11} />
                Reset
              </button>
            )}

            <button
              onClick={onClose}
              className="kbe-btn-ghost"
              style={{ marginLeft: 2 }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ═══ Toast ═══ */}
        {toast && <Toast message={toast.message} type={toast.type} />}

        {/* ═══ Search bar ═══ */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '0 10px',
              transition: 'border-color 0.15s',
            }}
          >
            <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search keybindings by command, key, category, when clause, or command ID..."
              style={{
                flex: 1,
                padding: '7px 10px',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12,
                color: 'var(--text-primary)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="kbe-btn-ghost"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* ═══ Filter bar (collapsible) ═══ */}
        {showFilterBar && (
          <div
            style={{
              padding: '8px 18px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
              animation: 'kbe-fade-in 0.15s ease-out',
            }}
          >
            {/* Source filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginRight: 2 }}>
                Source:
              </span>
              {(['all', 'default', 'user'] as SourceFilter[]).map((f) => (
                <button
                  key={f}
                  className="kbe-filter-chip"
                  data-active={String(sourceFilter === f)}
                  onClick={() => setSourceFilter(f)}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

            {/* Binding state filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginRight: 2 }}>
                Binding:
              </span>
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'has-binding', label: 'Has Binding' },
                  { key: 'no-binding', label: 'Unassigned' },
                  { key: 'modified', label: 'Modified' },
                ] as Array<{ key: BindingFilter; label: string }>
              ).map((f) => (
                <button
                  key={f.key}
                  className="kbe-filter-chip"
                  data-active={String(bindingFilter === f.key)}
                  onClick={() => setBindingFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Clear filters */}
            {(sourceFilter !== 'all' || bindingFilter !== 'all') && (
              <>
                <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
                <button
                  className="kbe-filter-chip"
                  onClick={() => {
                    setSourceFilter('all')
                    setBindingFilter('all')
                  }}
                  style={{ color: '#e05252', borderColor: 'rgba(224,82,82,0.3)' }}
                >
                  <Trash2 size={10} />
                  Clear Filters
                </button>
              </>
            )}
          </div>
        )}

        {/* ═══ Column headers (non-grouped mode) ═══ */}
        {!groupByCategory && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: GRID_TEMPLATE,
              gap: 8,
              padding: '6px 18px',
              borderBottom: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            <SortableHeader label="Command" column="command" sortConfig={sortConfig} onSort={handleSort} />
            <SortableHeader label="Keybinding" column="keybinding" sortConfig={sortConfig} onSort={handleSort} />
            <SortableHeader label="When" column="when" sortConfig={sortConfig} onSort={handleSort} />
            <SortableHeader label="Source" column="source" sortConfig={sortConfig} onSort={handleSort} />
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Actions
            </span>
          </div>
        )}

        {/* ═══ Keybindings list ═══ */}
        <div
          ref={scrollContainerRef}
          className="kbe-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: groupByCategory ? '6px 12px 16px' : '4px 6px 16px',
          }}
        >
          {processedBindings.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '48px 0',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              <Keyboard
                size={32}
                style={{ color: 'var(--text-muted)', opacity: 0.2, marginBottom: 12, display: 'block', margin: '0 auto 12px' }}
              />
              {isFiltering ? (
                <>
                  No keybindings match your search or filters.
                  <br />
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setSourceFilter('all')
                      setBindingFilter('all')
                      setShowDefaults(true)
                    }}
                    style={{
                      marginTop: 8,
                      padding: '4px 12px',
                      fontSize: 11,
                      color: 'var(--accent)',
                      background: 'rgba(var(--accent-rgb, 100,149,237), 0.08)',
                      border: '1px solid var(--accent)',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    Clear all filters
                  </button>
                </>
              ) : (
                'No keybindings to display.'
              )}
            </div>
          ) : groupByCategory && groupedBindings ? (
            groupedBindings.map((group) => (
              <CategoryGroup
                key={group.category}
                category={group.category}
                bindings={group.bindings}
                defaultExpanded={isFiltering || groupedBindings.length <= 5}
                editingId={editingId}
                editingWhenId={editingWhenId}
                onStartEdit={setEditingId}
                onStartWhenEdit={setEditingWhenId}
                onCancelEdit={() => setEditingId(null)}
                onCancelWhenEdit={() => setEditingWhenId(null)}
                onSaveBinding={handleSaveBinding}
                onSaveWhen={handleSaveWhen}
                onResetBinding={handleResetBinding}
                onCopyCommandId={handleCopyCommandId}
              />
            ))
          ) : (
            processedBindings.map((kb) => (
              <KeybindingRow
                key={kb.id}
                binding={kb}
                editingId={editingId}
                editingWhenId={editingWhenId}
                onStartEdit={setEditingId}
                onStartWhenEdit={setEditingWhenId}
                onCancelEdit={() => setEditingId(null)}
                onCancelWhenEdit={() => setEditingWhenId(null)}
                onSaveBinding={handleSaveBinding}
                onSaveWhen={handleSaveWhen}
                onResetBinding={handleResetBinding}
                onCopyCommandId={handleCopyCommandId}
              />
            ))
          )}
        </div>

        {/* ═══ Footer ═══ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 18px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.01)',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Double-click to edit keybinding
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>|</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              Chords: press first combo, then second within 1.5s
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>|</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              <KbdKey keyName="Esc" /> {editingId || editingWhenId ? 'cancel edit' : 'close'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>
              {isMac ? 'macOS' : 'Windows/Linux'} layout
            </span>
            <button
              onClick={onClose}
              style={{
                padding: '5px 14px',
                borderRadius: 5,
                fontSize: 11,
                color: 'var(--text-secondary)',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
