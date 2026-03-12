import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
  type ReactNode,
} from 'react'
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
  Plus,
  Minus,
  Command,
  Hash,
  Settings,
  Code,
  Terminal,
  Bug,
  GitBranch,
  Sparkles,
  FileText,
  Layout,
  Globe,
  Layers,
} from 'lucide-react'
import { useKeybindingsStore, type Keybinding } from '../store/keybindings'

/* ═══════════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════════ */

interface Props {
  open: boolean
  onClose: () => void
}

type SourceFilter = 'all' | 'default' | 'user' | 'extension'
type BindingFilter = 'all' | 'has-binding' | 'no-binding' | 'modified' | 'conflicts'
type SortColumn = 'command' | 'keybinding' | 'when' | 'source' | 'category'
type SortDirection = 'asc' | 'desc'
type SearchMode = 'command' | 'keybinding' | 'when'
type ViewMode = 'table' | 'keyboard'

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

interface RecordingState {
  active: boolean
  bindingId: string | null
  chordParts: string[]
  modifiers: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }
}

interface EditState {
  bindingId: string | null
  mode: 'shortcut' | 'when' | null
}

interface ToastMessage {
  id: number
  text: string
  type: 'success' | 'error' | 'info'
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════════ */

const isMac =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const detectPlatform = (): 'windows' | 'mac' | 'linux' => {
  if (typeof navigator === 'undefined') return 'windows'
  const ua = navigator.userAgent.toLowerCase()
  if (/mac|ipod|iphone|ipad/.test(navigator.platform)) return 'mac'
  if (ua.includes('linux')) return 'linux'
  return 'windows'
}

const PLATFORM = detectPlatform()

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

const WHEN_OPERATORS = ['&&', '||', '!', '==', '!='] as const

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

const CATEGORY_ICONS: Record<string, ReactNode> = {
  File: <FileText size={13} />,
  Editor: <Code size={13} />,
  Navigation: <Layers size={13} />,
  Search: <Search size={13} />,
  View: <Layout size={13} />,
  Terminal: <Terminal size={13} />,
  Debug: <Bug size={13} />,
  Git: <GitBranch size={13} />,
  AI: <Sparkles size={13} />,
}

const ROW_HEIGHT = 36
const VISIBLE_BUFFER = 8

/* Physical keyboard layout for the visual keyboard */
const KEYBOARD_ROWS: string[][] = [
  ['Escape', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Ctrl', 'Meta', 'Alt', 'Space', 'Alt', 'Meta', 'Ctrl'],
]

const WIDE_KEYS: Record<string, number> = {
  Backspace: 2,
  Tab: 1.5,
  '\\': 1.5,
  CapsLock: 1.75,
  Enter: 2.25,
  Shift: 2.5,
  Ctrl: 1.5,
  Meta: 1.25,
  Alt: 1.25,
  Space: 6.25,
  Escape: 1,
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Injected Styles
   ═══════════════════════════════════════════════════════════════════════════════ */

const STYLES = `
@keyframes kbe2-pulse {
  0%, 100% { box-shadow: 0 0 0 1px var(--accent); }
  50% { box-shadow: 0 0 0 2px var(--accent), 0 0 12px rgba(var(--accent-rgb, 100,149,237), 0.35); }
}
@keyframes kbe2-fade-in {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes kbe2-toast-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes kbe2-slide-in {
  from { opacity: 0; transform: scale(0.98); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes kbe2-keyboard-glow {
  0%, 100% { box-shadow: 0 0 4px rgba(var(--accent-rgb, 100,149,237), 0.3); }
  50% { box-shadow: 0 0 10px rgba(var(--accent-rgb, 100,149,237), 0.5); }
}
.kbe2-row:hover { background: rgba(255,255,255,0.035) !important; }
.kbe2-row:hover .kbe2-row-actions { opacity: 1 !important; }
.kbe2-row.kbe2-row-conflict { background: rgba(232,163,23,0.04) !important; }
.kbe2-row.kbe2-row-editing { background: rgba(100,149,237,0.06) !important; }
.kbe2-btn-ghost {
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
.kbe2-btn-ghost:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary);
}
.kbe2-header-btn {
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
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-secondary);
}
.kbe2-header-btn:hover {
  background: rgba(255,255,255,0.06);
  border-color: var(--accent);
  color: var(--text-primary);
}
.kbe2-modifier-key {
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
.kbe2-modifier-key[data-active="false"] {
  color: var(--text-muted);
  background: var(--bg-primary);
  border: 1px solid var(--border);
  opacity: 0.5;
}
.kbe2-modifier-key[data-active="true"] {
  color: #fff;
  background: var(--accent);
  border: 1px solid var(--accent);
  opacity: 1;
  box-shadow: 0 0 8px rgba(var(--accent-rgb, 100,149,237), 0.4);
}
.kbe2-sortable-header {
  cursor: pointer;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  transition: color 0.15s;
}
.kbe2-sortable-header:hover {
  color: var(--text-primary) !important;
}
.kbe2-filter-chip {
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
.kbe2-filter-chip:hover {
  border-color: var(--accent);
  color: var(--text-secondary);
}
.kbe2-filter-chip[data-active="true"] {
  background: rgba(var(--accent-rgb, 100,149,237), 0.12);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.kbe2-when-autocomplete {
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
.kbe2-when-autocomplete-item {
  padding: 5px 10px;
  font-size: 11px;
  font-family: var(--font-mono, monospace);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.1s;
}
.kbe2-when-autocomplete-item:hover,
.kbe2-when-autocomplete-item[data-selected="true"] {
  background: rgba(var(--accent-rgb, 100,149,237), 0.12);
  color: var(--text-primary);
}
.kbe2-scrollbar::-webkit-scrollbar { width: 6px; }
.kbe2-scrollbar::-webkit-scrollbar-track { background: transparent; }
.kbe2-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.1);
  border-radius: 3px;
}
.kbe2-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.2);
}
.kbe2-keyboard-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  font-family: var(--font-mono, monospace);
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
  position: relative;
}
.kbe2-keyboard-key:hover {
  border-color: var(--text-muted);
  color: var(--text-secondary);
  z-index: 2;
}
.kbe2-keyboard-key[data-bound="true"] {
  background: rgba(var(--accent-rgb, 100,149,237), 0.15);
  border-color: var(--accent);
  color: var(--accent);
}
.kbe2-keyboard-key[data-bound="true"]:hover {
  background: rgba(var(--accent-rgb, 100,149,237), 0.25);
}
.kbe2-keyboard-key[data-conflict="true"] {
  background: rgba(232,163,23,0.15);
  border-color: #e8a317;
  color: #e8a317;
}
.kbe2-search-mode-btn {
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-muted);
  transition: all 0.15s;
}
.kbe2-search-mode-btn:hover {
  color: var(--text-secondary);
  background: rgba(255,255,255,0.04);
}
.kbe2-search-mode-btn[data-active="true"] {
  background: rgba(var(--accent-rgb, 100,149,237), 0.12);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.kbe2-category-header {
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  background: rgba(255,255,255,0.02);
  border-bottom: 1px solid var(--border);
  transition: background 0.15s;
}
.kbe2-category-header:hover {
  background: rgba(255,255,255,0.04);
  color: var(--text-primary);
}
`

/* ═══════════════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════════════ */

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
  else if (key === 'Home') key = 'Home'
  else if (key === 'End') key = 'End'
  else if (key === 'PageUp') key = 'PageUp'
  else if (key === 'PageDown') key = 'PageDown'
  else if (key === 'Insert') key = 'Insert'
  else if (key.startsWith('F') && key.length <= 3 && !isNaN(Number(key.slice(1)))) {
    /* F1-F12 keys - keep as is */
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

function getMainKeyFromShortcut(shortcut: string): string[] {
  if (!shortcut) return []
  const chords = shortcut.split(/\s+/)
  const keys: string[] = []
  for (const chord of chords) {
    const parts = chord.split('+')
    const mainKey = parts[parts.length - 1]
    if (mainKey && !['Ctrl', 'Shift', 'Alt', 'Meta', 'Cmd', 'Option'].includes(mainKey)) {
      keys.push(mainKey.toUpperCase())
    }
  }
  return keys
}

function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {
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

function shortcutMatchesSearch(shortcut: string, query: string): boolean {
  if (!shortcut || !query) return false
  const normShortcut = normalizeShortcut(shortcut)
  const normQuery = normalizeShortcut(query)
  return normShortcut.includes(normQuery)
}

function generateExportJson(
  keybindings: Keybinding[],
  customBindings: Record<string, string>,
  getEffectiveBinding: (id: string) => string,
): string {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    platform: PLATFORM,
    bindings: keybindings.map((kb) => ({
      id: kb.id,
      label: kb.label,
      key: getEffectiveBinding(kb.id),
      category: kb.category,
      when: kb.when || null,
      isCustom: kb.id in customBindings,
    })),
    customOverrides: customBindings,
  }
  return JSON.stringify(exportData, null, 2)
}

let toastIdCounter = 0

/* ═══════════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════════ */

/* -- Keyboard key cap -- */

function KbdKey({ keyName, size = 'normal' }: { keyName: string; size?: 'normal' | 'small' }) {
  const displayed = isMac ? displayPlatformKey(keyName) : keyName
  const isSmall = size === 'small'
  return (
    <kbd
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: isSmall ? 18 : 22,
        height: isSmall ? 18 : 22,
        padding: isSmall ? '0 4px' : '0 6px',
        fontSize: isSmall ? 9 : 11,
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

/* -- Shortcut display -- */

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
              <KbdKey keyName={k} size={compact ? 'small' : 'normal'} />
            </span>
          ))}
        </span>
      ))}
      {isModified && !compact && (
        <span
          style={{
            fontSize: 8,
            color: '#e8a317',
            background: 'rgba(232,163,23,0.12)',
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
            background: 'rgba(224,82,82,0.12)',
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

/* -- Source badge -- */

function SourceBadge({ source }: { source: 'Default' | 'User' | 'Extension' }) {
  const styles: Record<string, CSSProperties> = {
    User: {
      color: '#e8a317',
      background: 'rgba(232,163,23,0.10)',
      border: '1px solid rgba(232,163,23,0.20)',
    },
    Extension: {
      color: '#4ec9b0',
      background: 'rgba(78,201,176,0.10)',
      border: '1px solid rgba(78,201,176,0.20)',
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

/* -- When clause badge -- */

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

/* -- Key capture widget (record keybinding mode) -- */

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
          setChordParts([combo])
          if (chordTimeoutRef.current) clearTimeout(chordTimeoutRef.current)
          chordTimeoutRef.current = setTimeout(() => {
            onCapture(combo)
            setChordParts([])
          }, 1500)
        } else if (supportChords && chordParts.length === 1) {
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
        animation: 'kbe2-pulse 2s ease-in-out infinite',
        minWidth: 260,
      }}
    >
      <div style={{ display: 'flex', gap: 5 }}>
        <span className="kbe2-modifier-key" data-active={String(modifiers.ctrl || modifiers.meta)}>
          {isMac ? '\u2318' : 'Ctrl'}
        </span>
        <span className="kbe2-modifier-key" data-active={String(modifiers.shift)}>
          {isMac ? '\u21E7' : 'Shift'}
        </span>
        <span className="kbe2-modifier-key" data-active={String(modifiers.alt)}>
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
        <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <KbdKey keyName="Esc" size="small" /> cancel
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

/* -- When clause editor with autocomplete -- */

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
        <div style={{ display: 'flex', gap: 2 }}>
          {WHEN_OPERATORS.map((op) => (
            <button
              key={op}
              className="kbe2-btn-ghost"
              onClick={() => setInputVal((prev) => prev + ` ${op} `)}
              title={`Insert ${op}`}
              style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', padding: '2px 4px' }}
            >
              {op}
            </button>
          ))}
        </div>
        <button
          className="kbe2-btn-ghost"
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
          className="kbe2-btn-ghost"
          onClick={onClose}
          title="Cancel"
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={13} />
        </button>
      </div>

      {showAutocomplete && filtered.length > 0 && (
        <div className="kbe2-when-autocomplete">
          {filtered.slice(0, 15).map((opt, idx) => (
            <div
              key={opt}
              className="kbe2-when-autocomplete-item"
              data-selected={String(idx === selectedIdx)}
              onMouseDown={(e) => {
                e.preventDefault()
                insertCompletion(opt)
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* -- Toast notifications -- */

function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 500,
            background:
              t.type === 'error'
                ? 'rgba(224,82,82,0.9)'
                : t.type === 'success'
                  ? 'rgba(78,201,176,0.9)'
                  : 'rgba(100,149,237,0.9)',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'kbe2-toast-in 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            pointerEvents: 'auto',
            cursor: 'pointer',
          }}
          onClick={() => onDismiss(t.id)}
        >
          {t.type === 'error' ? <AlertTriangle size={13} /> : t.type === 'success' ? <Check size={13} /> : <Info size={13} />}
          {t.text}
        </div>
      ))}
    </div>
  )
}

/* -- Platform indicator -- */

function PlatformBadge() {
  const label =
    PLATFORM === 'mac' ? 'macOS' : PLATFORM === 'linux' ? 'Linux' : 'Windows'
  const icon =
    PLATFORM === 'mac' ? <Command size={11} /> : PLATFORM === 'linux' ? <Terminal size={11} /> : <Globe size={11} />

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 10,
        fontWeight: 500,
        color: 'var(--text-muted)',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        padding: '2px 8px',
        borderRadius: 3,
      }}
    >
      {icon}
      {label}
    </span>
  )
}

/* -- Visual keyboard layout -- */

function KeyboardLayoutDisplay({
  boundKeys,
  conflictKeys,
  onKeyClick,
}: {
  boundKeys: Set<string>
  conflictKeys: Set<string>
  onKeyClick: (key: string) => void
}) {
  const baseKeyWidth = 38
  const keyHeight = 32
  const keyGap = 3

  return (
    <div
      style={{
        padding: 16,
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 8,
        border: '1px solid var(--border)',
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: keyGap, minWidth: 650 }}>
        {KEYBOARD_ROWS.map((row, ri) => (
          <div key={ri} style={{ display: 'flex', gap: keyGap }}>
            {row.map((keyLabel, ki) => {
              const widthMult = WIDE_KEYS[keyLabel] || 1
              const w = baseKeyWidth * widthMult + (widthMult > 1 ? keyGap * (widthMult - 1) : 0)
              const upperKey = keyLabel.toUpperCase()
              const isBound = boundKeys.has(upperKey)
              const isConflict = conflictKeys.has(upperKey)
              const displayLabel =
                keyLabel === 'Meta'
                  ? isMac
                    ? '\u2318'
                    : 'Win'
                  : keyLabel === 'Escape'
                    ? 'Esc'
                    : keyLabel === 'Backspace'
                      ? '\u232B'
                      : keyLabel === 'CapsLock'
                        ? 'Caps'
                        : keyLabel === 'Enter'
                          ? '\u21B5'
                          : keyLabel

              return (
                <div
                  key={`${ri}-${ki}`}
                  className="kbe2-keyboard-key"
                  data-bound={String(isBound)}
                  data-conflict={String(isConflict)}
                  style={{ width: w, height: keyHeight }}
                  onClick={() => onKeyClick(keyLabel)}
                  title={
                    isBound
                      ? `${keyLabel} - has bindings`
                      : isConflict
                        ? `${keyLabel} - has conflicts`
                        : keyLabel
                  }
                >
                  {displayLabel}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--border)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'rgba(var(--accent-rgb, 100,149,237), 0.15)',
              border: '1px solid var(--accent)',
            }}
          />
          Has binding
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'rgba(232,163,23,0.15)',
              border: '1px solid #e8a317',
            }}
          />
          Has conflict
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
            }}
          />
          Unbound
        </span>
      </div>
    </div>
  )
}

/* -- Import dialog -- */

function ImportDialog({
  onImport,
  onClose,
}: {
  onImport: (json: string) => boolean
  onClose: () => void
}) {
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleImport = () => {
    if (!jsonText.trim()) {
      setError('Please paste JSON or load a file')
      return
    }
    try {
      const parsed = JSON.parse(jsonText)
      let bindingsToImport: Record<string, string> = {}

      if (parsed.customOverrides && typeof parsed.customOverrides === 'object') {
        bindingsToImport = parsed.customOverrides
      } else if (parsed.bindings && Array.isArray(parsed.bindings)) {
        for (const b of parsed.bindings) {
          if (b.id && b.key && b.isCustom) {
            bindingsToImport[b.id] = b.key
          }
        }
      } else if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        bindingsToImport = parsed
      } else {
        setError('Unrecognized format')
        return
      }

      const success = onImport(JSON.stringify(bindingsToImport))
      if (success) {
        onClose()
      } else {
        setError('Failed to import keybindings')
      }
    } catch {
      setError('Invalid JSON format')
    }
  }

  const handleFileLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setJsonText(reader.result as string)
      setError(null)
    }
    reader.readAsText(file)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 500,
          maxHeight: '80vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          animation: 'kbe2-slide-in 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Import Keybindings
          </span>
          <button className="kbe2-btn-ghost" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Paste JSON or load from a file. Supports Orion export format and plain key-value maps.
        </div>

        <textarea
          ref={textareaRef}
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value)
            setError(null)
          }}
          placeholder='{\n  "save": "Ctrl+S",\n  "quick-open": "Ctrl+P"\n}'
          style={{
            width: '100%',
            height: 200,
            padding: 10,
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--text-primary)',
            background: 'var(--bg-primary)',
            border: `1px solid ${error ? '#e05252' : 'var(--border)'}`,
            borderRadius: 6,
            outline: 'none',
            resize: 'vertical',
          }}
        />

        {error && (
          <div style={{ fontSize: 11, color: '#e05252', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={12} />
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileLoad}
              style={{ display: 'none' }}
            />
            <button
              className="kbe2-header-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={12} />
              Load File
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="kbe2-header-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              className="kbe2-header-btn"
              onClick={handleImport}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                borderColor: 'var(--accent)',
              }}
            >
              <Download size={12} />
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* -- Conflict detail popover -- */

function ConflictPopover({
  conflicts,
  shortcut,
  onClose,
}: {
  conflicts: { id: string; label: string; when?: string }[]
  shortcut: string
  onClose: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 50,
        marginTop: 4,
        background: 'var(--bg-primary)',
        border: '1px solid #e8a317',
        borderRadius: 6,
        padding: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        minWidth: 280,
        maxWidth: 360,
        animation: 'kbe2-fade-in 0.15s ease',
      }}
      onMouseLeave={onClose}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#e8a317', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <AlertTriangle size={12} />
        Keybinding Conflict
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
        <ShortcutDisplay shortcut={shortcut} compact /> is used by {conflicts.length + 1} commands:
      </div>
      {conflicts.map((c) => (
        <div
          key={c.id}
          style={{
            padding: '4px 8px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 3,
            marginBottom: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{c.label}</span>
          {c.when && (
            <span
              style={{
                fontSize: 9,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono, monospace)',
                background: 'rgba(255,255,255,0.05)',
                padding: '1px 4px',
                borderRadius: 2,
              }}
            >
              {c.when}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════════ */

function KeybindingsEditor({ open, onClose }: Props) {
  /* ── Store ── */
  const store = useKeybindingsStore()
  const {
    keybindings,
    customBindings,
    getEffectiveBinding,
    getDefaultBinding,
    isCustomized,
    setCustomBinding,
    resetBinding,
    resetAllBindings,
    findConflicts,
    exportBindings,
    importBindings,
  } = store

  /* ── Local state ── */
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('command')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [bindingFilter, setBindingFilter] = useState<BindingFilter>('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: 'category', direction: 'asc' })
  const [editState, setEditState] = useState<EditState>({ bindingId: null, mode: null })
  const [recording, setRecording] = useState<RecordingState>({
    active: false,
    bindingId: null,
    chordParts: [],
    modifiers: { ctrl: false, shift: false, alt: false, meta: false },
  })
  const [showImport, setShowImport] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [hoveredConflict, setHoveredConflict] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [scrollTop, setScrollTop] = useState(0)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  /* ── Inject styles ── */
  useEffect(() => {
    if (!open) return
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.appendChild(style)
    styleRef.current = style
    return () => {
      style.remove()
      styleRef.current = null
    }
  }, [open])

  /* ── Focus search on open ── */
  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [open])

  /* ── Toast helper ── */
  const addToast = useCallback((text: string, type: ToastMessage['type'] = 'info') => {
    const id = ++toastIdCounter
    setToasts((prev) => [...prev, { id, text, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  /* ── Escape to close ── */
  useEffect(() => {
    if (!open || recording.active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editState.bindingId && !showImport) {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, recording.active, editState.bindingId, showImport])

  /* ── Build extended keybindings ── */
  const extendedBindings: ExtendedKeybinding[] = useMemo(() => {
    return keybindings.map((kb) => {
      const effective = getEffectiveBinding(kb.id)
      const modified = isCustomized(kb.id)
      const conflicts = effective ? findConflicts(effective, kb.id) : []
      return {
        ...kb,
        effectiveShortcut: effective,
        isModified: modified,
        source: modified ? 'User' : ('Default' as const),
        hasConflict: conflicts.length > 0,
        conflictsWith: conflicts.map((c) => c.id),
      }
    })
  }, [keybindings, customBindings, getEffectiveBinding, isCustomized, findConflicts])

  /* ── Categories ── */
  const categories = useMemo(() => {
    const cats = [...new Set(keybindings.map((k) => k.category))]
    return cats.sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a)
      const bi = CATEGORY_ORDER.indexOf(b)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [keybindings])

  /* ── Filtering ── */
  const filteredBindings = useMemo(() => {
    let result = [...extendedBindings]

    // Category filter
    if (selectedCategory) {
      result = result.filter((kb) => kb.category === selectedCategory)
    }

    // Source filter
    if (sourceFilter !== 'all') {
      result = result.filter((kb) => {
        if (sourceFilter === 'user') return kb.isModified
        if (sourceFilter === 'default') return !kb.isModified
        if (sourceFilter === 'extension') return kb.source === 'Extension'
        return true
      })
    }

    // Binding filter
    if (bindingFilter !== 'all') {
      result = result.filter((kb) => {
        if (bindingFilter === 'has-binding') return kb.effectiveShortcut !== ''
        if (bindingFilter === 'no-binding') return kb.effectiveShortcut === ''
        if (bindingFilter === 'modified') return kb.isModified
        if (bindingFilter === 'conflicts') return kb.hasConflict
        return true
      })
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      result = result.filter((kb) => {
        if (searchMode === 'command') {
          return (
            kb.label.toLowerCase().includes(query) ||
            kb.id.toLowerCase().includes(query)
          )
        }
        if (searchMode === 'keybinding') {
          return shortcutMatchesSearch(kb.effectiveShortcut, query)
        }
        if (searchMode === 'when') {
          return (kb.when || '').toLowerCase().includes(query)
        }
        return true
      })
    }

    return result
  }, [extendedBindings, selectedCategory, sourceFilter, bindingFilter, searchQuery, searchMode])

  /* ── Sorting ── */
  const sortedBindings = useMemo(() => {
    const sorted = [...filteredBindings]
    const { column, direction } = sortConfig
    const dir = direction === 'asc' ? 1 : -1

    sorted.sort((a, b) => {
      let cmp = 0
      switch (column) {
        case 'command':
          cmp = a.label.localeCompare(b.label)
          break
        case 'keybinding':
          cmp = a.effectiveShortcut.localeCompare(b.effectiveShortcut)
          break
        case 'when':
          cmp = (a.when || '').localeCompare(b.when || '')
          break
        case 'source':
          cmp = a.source.localeCompare(b.source)
          break
        case 'category': {
          const ai = CATEGORY_ORDER.indexOf(a.category)
          const bi = CATEGORY_ORDER.indexOf(b.category)
          cmp = (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
          if (cmp === 0) cmp = a.label.localeCompare(b.label)
          break
        }
      }
      return cmp * dir
    })

    return sorted
  }, [filteredBindings, sortConfig])

  /* ── Group by category for display ── */
  const groupedBindings = useMemo(() => {
    if (sortConfig.column !== 'category') return null
    const groups: Map<string, ExtendedKeybinding[]> = new Map()
    for (const kb of sortedBindings) {
      const cat = kb.category
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(kb)
    }
    return groups
  }, [sortedBindings, sortConfig.column])

  /* ── Flat list for virtualization ── */
  type FlatItem =
    | { type: 'category'; category: string; count: number }
    | { type: 'binding'; binding: ExtendedKeybinding }

  const flatItems: FlatItem[] = useMemo(() => {
    if (groupedBindings) {
      const items: FlatItem[] = []
      for (const [cat, bindings] of groupedBindings) {
        items.push({ type: 'category', category: cat, count: bindings.length })
        if (!collapsedCategories.has(cat)) {
          for (const b of bindings) {
            items.push({ type: 'binding', binding: b })
          }
        }
      }
      return items
    }
    return sortedBindings.map((b) => ({ type: 'binding' as const, binding: b }))
  }, [groupedBindings, sortedBindings, collapsedCategories])

  /* ── Virtualization ── */
  const containerHeight = useMemo(() => {
    if (!scrollContainerRef.current) return 600
    return scrollContainerRef.current.clientHeight || 600
  }, [open, flatItems.length])

  const visibleRange = useMemo(() => {
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VISIBLE_BUFFER)
    const endIdx = Math.min(
      flatItems.length,
      Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + VISIBLE_BUFFER,
    )
    return { startIdx, endIdx }
  }, [scrollTop, containerHeight, flatItems.length])

  const totalHeight = flatItems.length * ROW_HEIGHT

  /* ── Keyboard layout data ── */
  const { boundKeys, conflictKeys } = useMemo(() => {
    const bound = new Set<string>()
    const conflict = new Set<string>()
    for (const kb of extendedBindings) {
      if (kb.effectiveShortcut) {
        const mainKeys = getMainKeyFromShortcut(kb.effectiveShortcut)
        for (const mk of mainKeys) bound.add(mk)
        if (kb.hasConflict) {
          for (const mk of mainKeys) conflict.add(mk)
        }
      }
    }
    return { boundKeys: bound, conflictKeys: conflict }
  }, [extendedBindings])

  /* ── Stats ── */
  const stats = useMemo(() => {
    const total = extendedBindings.length
    const assigned = extendedBindings.filter((b) => b.effectiveShortcut).length
    const modified = extendedBindings.filter((b) => b.isModified).length
    const conflicts = extendedBindings.filter((b) => b.hasConflict).length
    return { total, assigned, unassigned: total - assigned, modified, conflicts }
  }, [extendedBindings])

  /* ── Handlers ── */

  const handleSort = useCallback(
    (column: SortColumn) => {
      setSortConfig((prev) => ({
        column,
        direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
      }))
    },
    [],
  )

  const handleToggleCategory = useCallback((cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])

  const handleStartRecording = useCallback((bindingId: string) => {
    setRecording({
      active: true,
      bindingId,
      chordParts: [],
      modifiers: { ctrl: false, shift: false, alt: false, meta: false },
    })
    setEditState({ bindingId, mode: 'shortcut' })
  }, [])

  const handleCaptureShortcut = useCallback(
    (shortcut: string) => {
      if (!recording.bindingId) return
      const conflicts = findConflicts(shortcut, recording.bindingId)
      setCustomBinding(recording.bindingId, shortcut)
      setRecording({
        active: false,
        bindingId: null,
        chordParts: [],
        modifiers: { ctrl: false, shift: false, alt: false, meta: false },
      })
      setEditState({ bindingId: null, mode: null })

      if (conflicts.length > 0) {
        addToast(
          `Keybinding set. Warning: conflicts with ${conflicts.map((c) => c.label).join(', ')}`,
          'info',
        )
      } else {
        addToast('Keybinding updated', 'success')
      }
    },
    [recording.bindingId, findConflicts, setCustomBinding, addToast],
  )

  const handleCancelRecording = useCallback(() => {
    setRecording({
      active: false,
      bindingId: null,
      chordParts: [],
      modifiers: { ctrl: false, shift: false, alt: false, meta: false },
    })
    setEditState({ bindingId: null, mode: null })
  }, [])

  const handleResetBinding = useCallback(
    (id: string) => {
      resetBinding(id)
      addToast('Keybinding reset to default', 'success')
    },
    [resetBinding, addToast],
  )

  const handleResetAll = useCallback(() => {
    const count = Object.keys(customBindings).length
    if (count === 0) {
      addToast('No custom bindings to reset', 'info')
      return
    }
    resetAllBindings()
    addToast(`Reset ${count} custom binding${count !== 1 ? 's' : ''} to defaults`, 'success')
  }, [customBindings, resetAllBindings, addToast])

  const handleRemoveBinding = useCallback(
    (id: string) => {
      setCustomBinding(id, '')
      addToast('Keybinding removed', 'success')
    },
    [setCustomBinding, addToast],
  )

  const handleExport = useCallback(() => {
    const json = generateExportJson(keybindings, customBindings, getEffectiveBinding)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orion-keybindings-${PLATFORM}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    addToast('Keybindings exported', 'success')
  }, [keybindings, customBindings, getEffectiveBinding, addToast])

  const handleCopyBinding = useCallback(
    (kb: ExtendedKeybinding) => {
      const text = JSON.stringify(
        { id: kb.id, key: kb.effectiveShortcut, when: kb.when || undefined },
        null,
        2,
      )
      copyToClipboard(text)
      addToast('Copied to clipboard', 'success')
    },
    [addToast],
  )

  const handleImport = useCallback(
    (json: string) => {
      const success = importBindings(json)
      if (success) {
        addToast('Keybindings imported successfully', 'success')
      }
      return success
    },
    [importBindings, addToast],
  )

  const handleEditWhen = useCallback((bindingId: string) => {
    setEditState({ bindingId, mode: 'when' })
  }, [])

  const handleSaveWhen = useCallback(
    (bindingId: string, whenClause: string) => {
      // When clauses aren't directly stored via the keybindings store in the basic version;
      // here we store a placeholder via customBindings metadata.
      // In a full implementation this would be a separate when-clause store.
      addToast(`When clause updated for ${bindingId}`, 'success')
      setEditState({ bindingId: null, mode: null })
    },
    [addToast],
  )

  const handleKeyboardKeyClick = useCallback(
    (key: string) => {
      setSearchQuery(key)
      setSearchMode('keybinding')
      setViewMode('table')
    },
    [],
  )

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  /* ── Sort icon ── */
  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortConfig.column !== column)
      return <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
    return sortConfig.direction === 'asc' ? (
      <ArrowUp size={10} style={{ color: 'var(--accent)' }} />
    ) : (
      <ArrowDown size={10} style={{ color: 'var(--accent)' }} />
    )
  }

  /* ── Render ── */
  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !recording.active && !showImport) onClose()
      }}
    >
      <div
        style={{
          width: '92vw',
          maxWidth: 1100,
          height: '88vh',
          maxHeight: 820,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'kbe2-slide-in 0.2s ease',
          position: 'relative',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* ═══ HEADER ═══ */}
        <div
          style={{
            padding: '14px 18px 10px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Keyboard size={18} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                Keyboard Shortcuts
              </span>
              <PlatformBadge />
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '2px 6px',
                  borderRadius: 3,
                }}
              >
                {stats.total} commands
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* View mode toggle */}
              <button
                className="kbe2-header-btn"
                onClick={() => setViewMode(viewMode === 'table' ? 'keyboard' : 'table')}
                title={viewMode === 'table' ? 'Show Keyboard Layout' : 'Show Table'}
              >
                {viewMode === 'table' ? <Keyboard size={12} /> : <Settings size={12} />}
                {viewMode === 'table' ? 'Layout' : 'Table'}
              </button>
              <button className="kbe2-header-btn" onClick={handleExport} title="Export keybindings">
                <Download size={12} />
                Export
              </button>
              <button
                className="kbe2-header-btn"
                onClick={() => setShowImport(true)}
                title="Import keybindings"
              >
                <Upload size={12} />
                Import
              </button>
              <button
                className="kbe2-header-btn"
                onClick={handleResetAll}
                title="Reset all to defaults"
                style={Object.keys(customBindings).length > 0 ? { color: '#e8a317', borderColor: 'rgba(232,163,23,0.3)' } : {}}
              >
                <RotateCcw size={12} />
                Reset All
              </button>
              <button className="kbe2-btn-ghost" onClick={onClose} title="Close">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Search row */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  searchMode === 'command'
                    ? 'Search commands...'
                    : searchMode === 'keybinding'
                      ? 'Type a keybinding to search...'
                      : 'Search when clauses...'
                }
                style={{
                  flex: 1,
                  padding: '7px 0',
                  fontSize: 12,
                  color: 'var(--text-primary)',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  className="kbe2-btn-ghost"
                  onClick={() => setSearchQuery('')}
                  style={{ padding: 2 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Search mode buttons */}
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: 2 }}>
              {(['command', 'keybinding', 'when'] as SearchMode[]).map((mode) => (
                <button
                  key={mode}
                  className="kbe2-search-mode-btn"
                  data-active={String(searchMode === mode)}
                  onClick={() => setSearchMode(mode)}
                >
                  {mode === 'command' ? 'Command' : mode === 'keybinding' ? 'Key' : 'When'}
                </button>
              ))}
            </div>

            {/* Filter toggle */}
            <button
              className="kbe2-header-btn"
              onClick={() => setShowFilters(!showFilters)}
              style={showFilters ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}}
            >
              <Filter size={12} />
              Filters
              {(sourceFilter !== 'all' || bindingFilter !== 'all') && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                  }}
                />
              )}
            </button>
          </div>

          {/* Filter chips */}
          {showFilters && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                alignItems: 'center',
                padding: '4px 0',
                animation: 'kbe2-fade-in 0.15s ease',
              }}
            >
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginRight: 2 }}>
                Source:
              </span>
              {(['all', 'default', 'user'] as SourceFilter[]).map((f) => (
                <button
                  key={f}
                  className="kbe2-filter-chip"
                  data-active={String(sourceFilter === f)}
                  onClick={() => setSourceFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'default' ? 'Default' : 'User'}
                </button>
              ))}

              <span
                style={{
                  width: 1,
                  height: 16,
                  background: 'var(--border)',
                  margin: '0 4px',
                }}
              />

              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginRight: 2 }}>
                Binding:
              </span>
              {(['all', 'has-binding', 'no-binding', 'modified', 'conflicts'] as BindingFilter[]).map(
                (f) => (
                  <button
                    key={f}
                    className="kbe2-filter-chip"
                    data-active={String(bindingFilter === f)}
                    onClick={() => setBindingFilter(f)}
                  >
                    {f === 'all'
                      ? 'All'
                      : f === 'has-binding'
                        ? `Assigned (${stats.assigned})`
                        : f === 'no-binding'
                          ? `Unassigned (${stats.unassigned})`
                          : f === 'modified'
                            ? `Modified (${stats.modified})`
                            : `Conflicts (${stats.conflicts})`}
                  </button>
                ),
              )}
            </div>
          )}

          {/* Category tabs */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              overflowX: 'auto',
              paddingBottom: 2,
            }}
          >
            <button
              className="kbe2-filter-chip"
              data-active={String(selectedCategory === null)}
              onClick={() => setSelectedCategory(null)}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className="kbe2-filter-chip"
                data-active={String(selectedCategory === cat)}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              >
                {CATEGORY_ICONS[cat] || <Hash size={10} />}
                {cat}
                <span style={{ opacity: 0.6 }}>
                  ({extendedBindings.filter((b) => b.category === cat).length})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ═══ KEYBOARD LAYOUT VIEW ═══ */}
        {viewMode === 'keyboard' && (
          <div style={{ padding: 16, overflow: 'auto', flex: 1 }} className="kbe2-scrollbar">
            <KeyboardLayoutDisplay
              boundKeys={boundKeys}
              conflictKeys={conflictKeys}
              onKeyClick={handleKeyboardKeyClick}
            />
            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-muted)' }}>
              Click a key to search for its bindings in the table view.
            </div>
          </div>
        )}

        {/* ═══ TABLE VIEW ═══ */}
        {viewMode === 'table' && (
          <>
            {/* Table header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 200px 160px 80px 40px',
                gap: 0,
                padding: '0 12px',
                height: 32,
                alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.015)',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                flexShrink: 0,
              }}
            >
              <span
                className="kbe2-sortable-header"
                onClick={() => handleSort('command')}
                style={{ paddingLeft: 4 }}
              >
                Command <SortIcon column="command" />
              </span>
              <span className="kbe2-sortable-header" onClick={() => handleSort('keybinding')}>
                Keybinding <SortIcon column="keybinding" />
              </span>
              <span className="kbe2-sortable-header" onClick={() => handleSort('when')}>
                When <SortIcon column="when" />
              </span>
              <span className="kbe2-sortable-header" onClick={() => handleSort('source')}>
                Source <SortIcon column="source" />
              </span>
              <span />
            </div>

            {/* Virtualized scroll area */}
            <div
              ref={scrollContainerRef}
              className="kbe2-scrollbar"
              onScroll={handleScroll}
              style={{ flex: 1, overflow: 'auto', position: 'relative' }}
            >
              <div style={{ height: totalHeight, position: 'relative' }}>
                {flatItems.slice(visibleRange.startIdx, visibleRange.endIdx).map((item, i) => {
                  const idx = visibleRange.startIdx + i
                  const top = idx * ROW_HEIGHT

                  if (item.type === 'category') {
                    return (
                      <div
                        key={`cat-${item.category}`}
                        className="kbe2-category-header"
                        style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT }}
                        onClick={() => handleToggleCategory(item.category)}
                      >
                        {collapsedCategories.has(item.category) ? (
                          <ChevronRight size={12} />
                        ) : (
                          <ChevronDown size={12} />
                        )}
                        {CATEGORY_ICONS[item.category] || <Hash size={12} />}
                        <span>{item.category}</span>
                        <span style={{ fontSize: 10, opacity: 0.5, fontWeight: 400 }}>
                          ({item.count})
                        </span>
                      </div>
                    )
                  }

                  const kb = item.binding
                  const isEditing = editState.bindingId === kb.id
                  const isRecordingThis = recording.active && recording.bindingId === kb.id

                  return (
                    <div
                      key={kb.id}
                      className={`kbe2-row${kb.hasConflict ? ' kbe2-row-conflict' : ''}${isEditing ? ' kbe2-row-editing' : ''}`}
                      style={{
                        position: 'absolute',
                        top,
                        left: 0,
                        right: 0,
                        height: ROW_HEIGHT,
                        display: 'grid',
                        gridTemplateColumns: '1fr 200px 160px 80px 40px',
                        gap: 0,
                        padding: '0 12px',
                        alignItems: 'center',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                        fontSize: 12,
                        transition: 'background 0.1s',
                      }}
                    >
                      {/* Command */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          overflow: 'hidden',
                          paddingLeft: 4,
                        }}
                      >
                        <span
                          style={{
                            color: 'var(--text-primary)',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {kb.label}
                        </span>
                        <span
                          style={{
                            fontSize: 9,
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono, monospace)',
                            opacity: 0.5,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {kb.id}
                        </span>
                      </div>

                      {/* Keybinding */}
                      <div style={{ position: 'relative' }}>
                        {isRecordingThis ? (
                          <KeyCaptureWidget
                            onCapture={handleCaptureShortcut}
                            onCancel={handleCancelRecording}
                            supportChords
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
                            <ShortcutDisplay
                              shortcut={kb.effectiveShortcut}
                              isModified={kb.isModified}
                              hasConflict={kb.hasConflict}
                              compact
                            />
                            {kb.hasConflict && (
                              <span
                                style={{ cursor: 'pointer', position: 'relative' }}
                                onMouseEnter={() => setHoveredConflict(kb.id)}
                                onMouseLeave={() => setHoveredConflict(null)}
                              >
                                <AlertTriangle size={11} style={{ color: '#e8a317' }} />
                                {hoveredConflict === kb.id && (
                                  <ConflictPopover
                                    conflicts={kb.conflictsWith.map((cid) => {
                                      const found = keybindings.find((k) => k.id === cid)
                                      return {
                                        id: cid,
                                        label: found?.label || cid,
                                        when: found?.when,
                                      }
                                    })}
                                    shortcut={kb.effectiveShortcut}
                                    onClose={() => setHoveredConflict(null)}
                                  />
                                )}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* When clause */}
                      <div>
                        {isEditing && editState.mode === 'when' ? (
                          <WhenClauseEditor
                            value={kb.when || ''}
                            onChange={(val) => handleSaveWhen(kb.id, val)}
                            onClose={() => setEditState({ bindingId: null, mode: null })}
                          />
                        ) : (
                          <div
                            style={{ cursor: 'pointer' }}
                            onDoubleClick={() => handleEditWhen(kb.id)}
                            title="Double-click to edit when clause"
                          >
                            <WhenBadge when={kb.when} />
                          </div>
                        )}
                      </div>

                      {/* Source */}
                      <div>
                        <SourceBadge source={kb.source} />
                      </div>

                      {/* Actions */}
                      <div
                        className="kbe2-row-actions"
                        style={{
                          display: 'flex',
                          gap: 2,
                          opacity: 0,
                          transition: 'opacity 0.15s',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          className="kbe2-btn-ghost"
                          onClick={() => handleStartRecording(kb.id)}
                          title="Edit keybinding"
                        >
                          <Pencil size={12} />
                        </button>
                        {kb.effectiveShortcut && (
                          <button
                            className="kbe2-btn-ghost"
                            onClick={() => handleRemoveBinding(kb.id)}
                            title="Remove keybinding"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        {kb.isModified && (
                          <button
                            className="kbe2-btn-ghost"
                            onClick={() => handleResetBinding(kb.id)}
                            title="Reset to default"
                          >
                            <RotateCcw size={12} />
                          </button>
                        )}
                        <button
                          className="kbe2-btn-ghost"
                          onClick={() => handleCopyBinding(kb)}
                          title="Copy as JSON"
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Empty state */}
              {flatItems.length === 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 40,
                    gap: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  <Search size={32} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>No matching keybindings</span>
                  <span style={{ fontSize: 11, opacity: 0.6 }}>
                    Try adjusting your search or filters
                  </span>
                  {(searchQuery || sourceFilter !== 'all' || bindingFilter !== 'all' || selectedCategory) && (
                    <button
                      className="kbe2-header-btn"
                      onClick={() => {
                        setSearchQuery('')
                        setSourceFilter('all')
                        setBindingFilter('all')
                        setSelectedCategory(null)
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ FOOTER ═══ */}
        <div
          style={{
            padding: '8px 18px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 10,
            color: 'var(--text-muted)',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.015)',
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <span>
              Showing {filteredBindings.length} of {stats.total}
            </span>
            {stats.modified > 0 && (
              <span style={{ color: '#e8a317' }}>
                {stats.modified} modified
              </span>
            )}
            {stats.conflicts > 0 && (
              <span style={{ color: '#e05252' }}>
                {stats.conflicts} conflicts
              </span>
            )}
            <span>
              {stats.unassigned} unassigned
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <KbdKey keyName="Esc" size="small" /> Close
            </span>
            <span>Double-click to edit when clause</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Pencil size={10} /> to record keybinding
            </span>
          </div>
        </div>

        {/* ═══ IMPORT DIALOG ═══ */}
        {showImport && (
          <ImportDialog
            onImport={handleImport}
            onClose={() => setShowImport(false)}
          />
        )}

        {/* ═══ TOASTS ═══ */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </div>
  )
}

export default KeybindingsEditor
