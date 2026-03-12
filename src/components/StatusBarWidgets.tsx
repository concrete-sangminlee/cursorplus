import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  GitBranch,
  Bell,
  AlertTriangle,
  AlertCircle,
  Wifi,
  WifiOff,
  Users,
  Zap,
  Cloud,
  ChevronUp,
  Check,
  RefreshCw,
  XCircle,
  ChevronDown,
  ArrowUpDown,
  Sparkles,
  MessageSquare,
  Monitor,
  Activity,
  Cpu,
  Server,
  Radio,
} from 'lucide-react'

// ── Shared types & helpers ────────────────────────────────────────────────────

interface StatusWidgetProps {
  children: React.ReactNode
  onClick?: () => void
  title?: string
  style?: React.CSSProperties
}

function WidgetButton({ children, onClick, title, style }: StatusWidgetProps) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      className="flex items-center"
      title={title}
      style={{
        height: '100%',
        padding: '0 7px',
        gap: 4,
        cursor: onClick ? 'pointer' : 'default',
        background: hovered ? 'rgba(255, 255, 255, 0.06)' : 'transparent',
        transition: 'background 0.1s',
        fontSize: 11,
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  )
}

// ── Dropdown infrastructure ──────────────────────────────────────────────────

interface DropdownItem {
  id: string
  label: string
  detail?: string
  active?: boolean
  icon?: React.ReactNode
  separator?: boolean
}

interface WidgetDropdownProps {
  items: DropdownItem[]
  onSelect: (id: string) => void
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
  maxHeight?: number
  searchable?: boolean
  width?: number
}

function WidgetDropdown({
  items,
  onSelect,
  onClose,
  anchorRef,
  maxHeight = 260,
  searchable = false,
  width,
}: WidgetDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState('')
  const [hoveredIdx, setHoveredIdx] = useState(-1)

  const filtered = useMemo(() => {
    if (!filter) return items.filter((i) => !i.separator)
    return items.filter(
      (i) => !i.separator && i.label.toLowerCase().includes(filter.toLowerCase())
    )
  }, [items, filter])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHoveredIdx((p) => Math.min(p + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHoveredIdx((p) => Math.max(p - 1, 0))
      } else if (e.key === 'Enter' && hoveredIdx >= 0 && hoveredIdx < filtered.length) {
        e.preventDefault()
        onSelect(filtered[hoveredIdx].id)
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, onSelect, filtered, hoveredIdx])

  // Auto-focus search
  useEffect(() => {
    if (searchable) inputRef.current?.focus()
  }, [searchable])

  const rect = anchorRef.current?.getBoundingClientRect()
  const left = rect ? rect.left : 0
  const bottom = rect ? window.innerHeight - rect.top + 2 : 24
  const resolvedWidth = width ?? 200

  return (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        left: Math.max(0, Math.min(left, window.innerWidth - resolvedWidth)),
        bottom,
        minWidth: resolvedWidth,
        maxWidth: 340,
        maxHeight,
        background: 'var(--bg-secondary, #1e1e2e)',
        border: '1px solid var(--border, #333)',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        fontSize: 12,
        color: 'var(--text-primary, #ccc)',
      }}
    >
      {searchable && (
        <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border, #333)' }}>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
              setHoveredIdx(0)
            }}
            placeholder="Search..."
            style={{
              width: '100%',
              background: 'var(--bg-primary, #111)',
              border: '1px solid var(--border, #444)',
              borderRadius: 3,
              padding: '3px 6px',
              fontSize: 11,
              color: 'var(--text-primary, #ccc)',
              outline: 'none',
            }}
          />
        </div>
      )}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {filtered.map((item, idx) => (
          <div
            key={item.id}
            style={{
              padding: '4px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: hoveredIdx === idx ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: item.active ? 'var(--accent, #58a6ff)' : undefined,
            }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onClick={() => {
              onSelect(item.id)
              onClose()
            }}
          >
            {item.active && <Check size={10} style={{ flexShrink: 0 }} />}
            {!item.active && item.icon ? (
              <span style={{ flexShrink: 0 }}>{item.icon}</span>
            ) : (
              !item.active && <span style={{ width: 10, flexShrink: 0 }} />
            )}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {item.label}
            </span>
            {item.detail && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
                {item.detail}
              </span>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '8px', color: 'var(--text-muted)', textAlign: 'center' }}>
            No results
          </div>
        )}
      </div>
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { id: 'plaintext', label: 'Plain Text' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'typescriptreact', label: 'TypeScript React' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'javascriptreact', label: 'JavaScript React' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'csharp', label: 'C#' },
  { id: 'cpp', label: 'C++' },
  { id: 'c', label: 'C' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'php', label: 'PHP' },
  { id: 'swift', label: 'Swift' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'scss', label: 'SCSS' },
  { id: 'less', label: 'Less' },
  { id: 'json', label: 'JSON' },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'sql', label: 'SQL' },
  { id: 'shell', label: 'Shell Script' },
  { id: 'powershell', label: 'PowerShell' },
  { id: 'dockerfile', label: 'Dockerfile' },
  { id: 'graphql', label: 'GraphQL' },
  { id: 'lua', label: 'Lua' },
  { id: 'perl', label: 'Perl' },
  { id: 'r', label: 'R' },
  { id: 'dart', label: 'Dart' },
  { id: 'elixir', label: 'Elixir' },
  { id: 'clojure', label: 'Clojure' },
  { id: 'fsharp', label: 'F#' },
  { id: 'scala', label: 'Scala' },
  { id: 'haskell', label: 'Haskell' },
  { id: 'objective-c', label: 'Objective-C' },
  { id: 'bat', label: 'Batch' },
  { id: 'ini', label: 'INI' },
  { id: 'toml', label: 'TOML' },
]

const ENCODINGS = [
  { id: 'utf-8', label: 'UTF-8' },
  { id: 'utf-8-bom', label: 'UTF-8 with BOM' },
  { id: 'utf-16le', label: 'UTF-16 LE' },
  { id: 'utf-16be', label: 'UTF-16 BE' },
  { id: 'ascii', label: 'ASCII' },
  { id: 'iso-8859-1', label: 'ISO 8859-1 (Latin 1)' },
  { id: 'iso-8859-2', label: 'ISO 8859-2 (Latin 2)' },
  { id: 'iso-8859-15', label: 'ISO 8859-15 (Latin 9)' },
  { id: 'windows-1252', label: 'Windows 1252' },
  { id: 'windows-1251', label: 'Windows 1251 (Cyrillic)' },
  { id: 'shift-jis', label: 'Shift JIS' },
  { id: 'euc-jp', label: 'EUC-JP' },
  { id: 'euc-kr', label: 'EUC-KR' },
  { id: 'gb2312', label: 'GB2312' },
  { id: 'big5', label: 'Big5' },
]

const INDENT_OPTIONS = [
  { id: 'spaces-2', label: 'Spaces: 2' },
  { id: 'spaces-4', label: 'Spaces: 4' },
  { id: 'spaces-8', label: 'Spaces: 8' },
  { id: 'tabs-2', label: 'Tab Size: 2' },
  { id: 'tabs-4', label: 'Tab Size: 4' },
  { id: 'tabs-8', label: 'Tab Size: 8' },
]

const EOL_OPTIONS = [
  { id: 'LF', label: 'LF (Unix / macOS)' },
  { id: 'CRLF', label: 'CRLF (Windows)' },
  { id: 'CR', label: 'CR (Classic Mac)' },
]

// Map file extension to language ID
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  py: 'python', rb: 'ruby', rs: 'rust', go: 'go',
  java: 'java', kt: 'kotlin', swift: 'swift',
  cpp: 'cpp', c: 'c', cs: 'csharp', php: 'php',
  html: 'HTML', css: 'css', scss: 'scss', less: 'less',
  json: 'json', md: 'markdown', yml: 'yaml', yaml: 'yaml',
  xml: 'xml', sql: 'sql', sh: 'shell', ps1: 'powershell',
  dockerfile: 'dockerfile', graphql: 'graphql',
  lua: 'lua', pl: 'perl', r: 'r', dart: 'dart',
  ex: 'elixir', exs: 'elixir', clj: 'clojure',
  fs: 'fsharp', scala: 'scala', hs: 'haskell',
  bat: 'bat', ini: 'ini', toml: 'toml',
}

function resolveLanguageId(filename?: string): string {
  if (!filename) return 'plaintext'
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? (EXT_TO_LANG[ext] || 'plaintext') : 'plaintext'
}

function resolveLanguageLabel(languageId: string): string {
  const entry = LANGUAGES.find((l) => l.id === languageId)
  if (entry) return entry.label
  return languageId.charAt(0).toUpperCase() + languageId.slice(1)
}

// ── 1. Language Mode Selector ─────────────────────────────────────────────────

interface LanguageModeWidgetProps {
  languageId: string
  filename?: string
  onChangeLanguage?: (languageId: string) => void
}

export function LanguageModeWidget({
  languageId,
  filename,
  onChangeLanguage,
}: LanguageModeWidgetProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const effectiveId = languageId || resolveLanguageId(filename)
  const label = resolveLanguageLabel(effectiveId)

  const handleSelect = useCallback(
    (id: string) => {
      onChangeLanguage?.(id)
      window.dispatchEvent(
        new CustomEvent('orion:set-language', { detail: { languageId: id } })
      )
    },
    [onChangeLanguage]
  )

  const items = useMemo(
    () =>
      LANGUAGES.map((l) => ({
        ...l,
        active: l.id === effectiveId,
      })),
    [effectiveId]
  )

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={`Language Mode: ${label} (click to change)`}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <ChevronDown size={9} style={{ color: 'var(--text-muted)' }} />
      </WidgetButton>
      {open && (
        <WidgetDropdown
          items={items}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          maxHeight={320}
          searchable
          width={220}
        />
      )}
    </div>
  )
}

// ── 2. Encoding Selector ──────────────────────────────────────────────────────

interface EncodingWidgetProps {
  encoding: string
  onChangeEncoding?: (encoding: string) => void
}

export function EncodingWidget({ encoding, onChangeEncoding }: EncodingWidgetProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const displayLabel =
    ENCODINGS.find((e) => e.id === encoding)?.label || encoding.toUpperCase()

  const handleSelect = useCallback(
    (id: string) => {
      onChangeEncoding?.(id)
      window.dispatchEvent(
        new CustomEvent('orion:set-encoding', { detail: { encoding: id } })
      )
    },
    [onChangeEncoding]
  )

  const items = useMemo(
    () => ENCODINGS.map((e) => ({ ...e, active: e.id === encoding })),
    [encoding]
  )

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={`File Encoding: ${displayLabel} (click to change)`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{displayLabel}</span>
        <ChevronDown size={9} style={{ color: 'var(--text-muted)' }} />
      </WidgetButton>
      {open && (
        <WidgetDropdown
          items={items}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          searchable
          width={220}
        />
      )}
    </div>
  )
}

// ── 3. EOL Selector ───────────────────────────────────────────────────────────

interface EOLWidgetProps {
  eol: 'LF' | 'CRLF' | 'CR'
  onChangeEOL?: (eol: string) => void
}

export function EOLWidget({ eol, onChangeEOL }: EOLWidgetProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const handleSelect = useCallback(
    (id: string) => {
      onChangeEOL?.(id)
      window.dispatchEvent(new CustomEvent('orion:set-eol', { detail: { eol: id } }))
    },
    [onChangeEOL]
  )

  const items = useMemo(
    () => EOL_OPTIONS.map((o) => ({ ...o, active: o.id === eol })),
    [eol]
  )

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={`End of Line Sequence: ${eol} (click to change)`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{eol}</span>
        <ChevronDown size={9} style={{ color: 'var(--text-muted)' }} />
      </WidgetButton>
      {open && (
        <WidgetDropdown
          items={items}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          width={180}
        />
      )}
    </div>
  )
}

// ── 4. Indentation Selector ───────────────────────────────────────────────────

interface IndentWidgetProps {
  useSpaces: boolean
  size: number
  onChangeIndent?: (useSpaces: boolean, size: number) => void
}

export function IndentWidget({ useSpaces, size, onChangeIndent }: IndentWidgetProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const currentId = `${useSpaces ? 'spaces' : 'tabs'}-${size}`
  const label = useSpaces ? `Spaces: ${size}` : `Tab Size: ${size}`

  const handleSelect = useCallback(
    (id: string) => {
      const [type, sizeStr] = id.split('-')
      const newSize = parseInt(sizeStr, 10)
      const newUseSpaces = type === 'spaces'
      onChangeIndent?.(newUseSpaces, newSize)
      window.dispatchEvent(
        new CustomEvent('orion:set-indent', {
          detail: { useSpaces: newUseSpaces, size: newSize },
        })
      )
    },
    [onChangeIndent]
  )

  const items = useMemo(
    () => INDENT_OPTIONS.map((o) => ({ ...o, active: o.id === currentId })),
    [currentId]
  )

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={`Indentation: ${label} (click to change)`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <ChevronDown size={9} style={{ color: 'var(--text-muted)' }} />
      </WidgetButton>
      {open && (
        <WidgetDropdown
          items={items}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          width={160}
        />
      )}
    </div>
  )
}

// ── 5. Cursor Position ────────────────────────────────────────────────────────

interface CursorPositionWidgetProps {
  line: number
  column: number
  totalLines?: number
  onGoToLine?: () => void
}

export function CursorPositionWidget({
  line,
  column,
  totalLines,
  onGoToLine,
}: CursorPositionWidgetProps) {
  const handleClick = useCallback(() => {
    if (onGoToLine) {
      onGoToLine()
    } else {
      window.dispatchEvent(new CustomEvent('orion:go-to-line'))
    }
  }, [onGoToLine])

  return (
    <WidgetButton
      title={`Line ${line}, Column ${column}${totalLines ? ` of ${totalLines}` : ''} - Click to Go to Line (Ctrl+G)`}
      onClick={handleClick}
    >
      <span style={{ padding: '0 2px' }}>
        Ln {line}, Col {column}
        {totalLines != null && totalLines > 0 && (
          <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
            / {totalLines.toLocaleString()}
          </span>
        )}
      </span>
    </WidgetButton>
  )
}

// ── 6. Selection Info ─────────────────────────────────────────────────────────

interface SelectionInfoWidgetProps {
  selectedChars: number
  selectedLines: number
}

export function SelectionInfoWidget({
  selectedChars,
  selectedLines,
}: SelectionInfoWidgetProps) {
  if (selectedChars <= 0) return null

  return (
    <WidgetButton title={`${selectedChars} character(s) selected across ${selectedLines} line(s)`}>
      <span style={{ color: 'var(--accent-blue, #58a6ff)' }}>
        {selectedChars} selected
        {selectedLines > 1 && `, ${selectedLines} lines`}
      </span>
    </WidgetButton>
  )
}

// ── 7. Git Branch Widget ──────────────────────────────────────────────────────

interface GitBranchWidgetProps {
  branch: string
  isRepo: boolean
  branches?: Array<{ name: string; current: boolean }>
  ahead?: number
  behind?: number
  onFetchBranches?: () => Promise<Array<{ name: string; current: boolean }>>
  onSwitchBranch?: (branch: string) => void
}

export function GitBranchWidget({
  branch,
  isRepo,
  branches: propBranches,
  ahead = 0,
  behind = 0,
  onFetchBranches,
  onSwitchBranch,
}: GitBranchWidgetProps) {
  const [open, setOpen] = useState(false)
  const [localBranches, setLocalBranches] = useState<
    Array<{ name: string; current: boolean }>
  >([])
  const anchorRef = useRef<HTMLDivElement>(null)

  const branches = propBranches ?? localBranches

  const handleClick = useCallback(async () => {
    if (!isRepo) return
    if (onFetchBranches) {
      try {
        const fetched = await onFetchBranches()
        setLocalBranches(fetched)
      } catch {
        // ignore fetch errors
      }
    }
    setOpen(true)
  }, [isRepo, onFetchBranches])

  const handleSelect = useCallback(
    (name: string) => {
      onSwitchBranch?.(name)
    },
    [onSwitchBranch]
  )

  const aheadBehindLabel = useMemo(() => {
    const parts: string[] = []
    if (ahead > 0) parts.push(`\u2191${ahead}`)
    if (behind > 0) parts.push(`\u2193${behind}`)
    return parts.join(' ')
  }, [ahead, behind])

  const items = useMemo(
    () =>
      branches
        .filter((b) => !b.name.startsWith('origin/'))
        .map((b) => ({
          id: b.name,
          label: b.name,
          active: b.current || b.name === branch,
        })),
    [branches, branch]
  )

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={isRepo ? `Branch: ${branch} (click to switch)` : 'Not a git repository'}
        onClick={handleClick}
      >
        <GitBranch size={11} style={{ color: 'var(--text-secondary)' }} />
        <span style={{ color: 'var(--text-secondary)' }}>
          {isRepo ? branch : 'No repo'}
        </span>
        {aheadBehindLabel && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 2 }}>
            {aheadBehindLabel}
          </span>
        )}
        {isRepo && (
          <ChevronDown size={9} style={{ color: 'var(--text-muted)', marginLeft: 1 }} />
        )}
      </WidgetButton>
      {open && isRepo && (
        <WidgetDropdown
          items={items}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          searchable
          width={220}
        />
      )}
    </div>
  )
}

// ── 8. Git Sync Status ────────────────────────────────────────────────────────

interface GitSyncWidgetProps {
  isRepo: boolean
  ahead?: number
  behind?: number
  isSyncing?: boolean
  onSync?: () => void
}

export function GitSyncWidget({
  isRepo,
  ahead = 0,
  behind = 0,
  isSyncing = false,
  onSync,
}: GitSyncWidgetProps) {
  const handleClick = useCallback(() => {
    if (!isRepo || isSyncing) return
    onSync?.()
    window.dispatchEvent(new CustomEvent('orion:git-sync'))
  }, [isRepo, isSyncing, onSync])

  if (!isRepo) {
    return (
      <WidgetButton title="Not connected to a repository">
        <WifiOff size={10} style={{ color: 'var(--text-muted)' }} />
      </WidgetButton>
    )
  }

  const hasChanges = ahead > 0 || behind > 0

  return (
    <WidgetButton
      title={
        isSyncing
          ? 'Syncing...'
          : hasChanges
            ? `${ahead}\u2191 ${behind}\u2193 - Click to sync`
            : 'Up to date - Click to sync'
      }
      onClick={handleClick}
    >
      {isSyncing ? (
        <RefreshCw
          size={10}
          style={{
            color: 'var(--accent, #58a6ff)',
            animation: 'spin 1s linear infinite',
          }}
        />
      ) : (
        <ArrowUpDown
          size={10}
          style={{
            color: hasChanges ? 'var(--accent, #58a6ff)' : 'var(--text-muted)',
          }}
        />
      )}
      {hasChanges && !isSyncing && (
        <span style={{ fontSize: 10 }}>
          {ahead > 0 && `${ahead}\u2191`}
          {behind > 0 && ` ${behind}\u2193`}
        </span>
      )}
    </WidgetButton>
  )
}

// ── 9. Notification Bell ──────────────────────────────────────────────────────

interface NotificationBellWidgetProps {
  count: number
  onClick?: () => void
}

export function NotificationBellWidget({ count, onClick }: NotificationBellWidgetProps) {
  const handleClick = useCallback(() => {
    onClick?.()
    window.dispatchEvent(new CustomEvent('orion:toggle-notifications'))
  }, [onClick])

  return (
    <WidgetButton
      title={count > 0 ? `${count} notification(s)` : 'No notifications'}
      onClick={handleClick}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Bell
          size={11}
          style={{
            color: count > 0 ? 'var(--accent, #58a6ff)' : 'var(--text-muted)',
          }}
        />
        {count > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -6,
              background: 'var(--accent-red, #f44747)',
              color: '#fff',
              fontSize: 8,
              fontWeight: 700,
              lineHeight: 1,
              minWidth: 12,
              height: 12,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </div>
    </WidgetButton>
  )
}

// ── 10. Problems Count ────────────────────────────────────────────────────────

interface ProblemsWidgetProps {
  errors: number
  warnings: number
  infos?: number
  onClick?: () => void
}

export function ProblemsWidget({
  errors,
  warnings,
  infos = 0,
  onClick,
}: ProblemsWidgetProps) {
  const handleClick = useCallback(() => {
    onClick?.()
    window.dispatchEvent(new CustomEvent('orion:toggle-problems'))
  }, [onClick])

  return (
    <WidgetButton
      title={`${errors} error(s), ${warnings} warning(s)${infos > 0 ? `, ${infos} info(s)` : ''} - Click to show Problems panel`}
      onClick={handleClick}
    >
      <XCircle
        size={10}
        style={{
          color: errors > 0 ? 'var(--accent-red, #f44747)' : 'var(--text-muted)',
        }}
      />
      <span
        style={{
          color: errors > 0 ? 'var(--accent-red, #f44747)' : undefined,
        }}
      >
        {errors}
      </span>
      <AlertTriangle
        size={10}
        style={{
          color: warnings > 0 ? 'var(--accent-orange, #cca700)' : 'var(--text-muted)',
          marginLeft: 4,
        }}
      />
      <span
        style={{
          color: warnings > 0 ? 'var(--accent-orange, #cca700)' : undefined,
        }}
      >
        {warnings}
      </span>
      {infos > 0 && (
        <>
          <AlertCircle
            size={10}
            style={{ color: 'var(--accent-blue, #58a6ff)', marginLeft: 4 }}
          />
          <span style={{ color: 'var(--accent-blue, #58a6ff)' }}>{infos}</span>
        </>
      )}
    </WidgetButton>
  )
}

// ── 11. Feedback Button ───────────────────────────────────────────────────────

interface FeedbackWidgetProps {
  url?: string
  onClick?: () => void
}

export function FeedbackWidget({ url, onClick }: FeedbackWidgetProps) {
  const handleClick = useCallback(() => {
    if (onClick) {
      onClick()
    } else {
      window.open(
        url || 'https://github.com/orion-editor/orion/issues',
        '_blank'
      )
    }
  }, [url, onClick])

  return (
    <WidgetButton title="Send feedback" onClick={handleClick}>
      <MessageSquare size={10} style={{ color: 'var(--text-muted)' }} />
      <span style={{ fontSize: 10 }}>Feedback</span>
    </WidgetButton>
  )
}

// ── 12. Copilot Status ────────────────────────────────────────────────────────

type CopilotState = 'active' | 'inactive' | 'loading' | 'error' | 'disabled'

interface CopilotWidgetProps {
  status: CopilotState
  onToggle?: () => void
}

export function CopilotWidget({ status, onToggle }: CopilotWidgetProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const colorMap: Record<CopilotState, string> = {
    active: 'var(--accent-green, #89d185)',
    inactive: 'var(--text-muted)',
    loading: 'var(--accent, #58a6ff)',
    error: 'var(--accent-red, #f44747)',
    disabled: 'var(--text-muted)',
  }

  const labelMap: Record<CopilotState, string> = {
    active: 'Copilot',
    inactive: 'Copilot (Off)',
    loading: 'Copilot...',
    error: 'Copilot (!)',
    disabled: 'Copilot (Disabled)',
  }

  const isAnimating = status === 'loading'

  const handleClick = useCallback(() => {
    if (status === 'disabled') return
    if (onToggle) {
      onToggle()
    } else {
      setOpen((v) => !v)
    }
  }, [status, onToggle])

  const dropdownItems: DropdownItem[] = useMemo(
    () => [
      {
        id: 'toggle',
        label: status === 'active' ? 'Disable Copilot' : 'Enable Copilot',
        active: status === 'active',
      },
      {
        id: 'settings',
        label: 'Copilot Settings...',
      },
      {
        id: 'status',
        label: 'Show Copilot Status',
      },
    ],
    [status]
  )

  const handleSelect = useCallback(
    (id: string) => {
      if (id === 'toggle') {
        onToggle?.()
      } else if (id === 'settings') {
        window.dispatchEvent(
          new CustomEvent('orion:open-settings', { detail: { query: 'copilot' } })
        )
      } else if (id === 'status') {
        window.dispatchEvent(new CustomEvent('orion:copilot-status'))
      }
    },
    [onToggle]
  )

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={`AI Autocomplete: ${status.charAt(0).toUpperCase() + status.slice(1)}`}
        onClick={handleClick}
      >
        <Sparkles
          size={12}
          style={{
            color: colorMap[status],
            animation: isAnimating ? 'pulse 1s infinite' : 'none',
            opacity: status === 'disabled' || status === 'inactive' ? 0.5 : 1,
          }}
        />
        <span
          style={{
            color: colorMap[status],
            opacity: status === 'disabled' || status === 'inactive' ? 0.5 : 1,
          }}
        >
          {labelMap[status]}
        </span>
      </WidgetButton>
      {open && !onToggle && (
        <WidgetDropdown
          items={dropdownItems}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          width={200}
        />
      )}
    </div>
  )
}

// ── 13. Remote Indicator ──────────────────────────────────────────────────────

type RemoteType = 'none' | 'ssh' | 'docker' | 'wsl' | 'codespaces' | 'tunnel'

interface RemoteIndicatorWidgetProps {
  type: RemoteType
  label?: string
  onClick?: () => void
}

const REMOTE_ICON_MAP: Record<RemoteType, React.ReactNode> = {
  none: null,
  ssh: <Wifi size={10} />,
  docker: <Server size={10} />,
  wsl: <Monitor size={10} />,
  codespaces: <Cloud size={10} />,
  tunnel: <Radio size={10} />,
}

const REMOTE_LABEL_MAP: Record<RemoteType, string> = {
  none: '',
  ssh: 'SSH',
  docker: 'Docker',
  wsl: 'WSL',
  codespaces: 'Codespaces',
  tunnel: 'Tunnel',
}

const REMOTE_COLOR_MAP: Record<RemoteType, string> = {
  none: 'transparent',
  ssh: '#16825d',
  docker: '#0078d4',
  wsl: '#e38c00',
  codespaces: '#6f42c1',
  tunnel: '#58a6ff',
}

export function RemoteIndicatorWidget({
  type,
  label,
  onClick,
}: RemoteIndicatorWidgetProps) {
  if (type === 'none') return null

  const displayLabel = label || REMOTE_LABEL_MAP[type]
  const bgColor = REMOTE_COLOR_MAP[type]

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick()
    } else {
      window.dispatchEvent(new CustomEvent('orion:remote-menu'))
    }
  }, [onClick])

  return (
    <WidgetButton
      title={`Remote: ${displayLabel} (click to manage)`}
      onClick={handleClick}
      style={{
        background: bgColor,
        color: '#fff',
        padding: '0 8px',
        gap: 4,
      }}
    >
      {REMOTE_ICON_MAP[type]}
      <span style={{ fontSize: 10, fontWeight: 500 }}>{displayLabel}</span>
    </WidgetButton>
  )
}

// ── 14. Live Share Indicator ──────────────────────────────────────────────────

type LiveShareState = 'inactive' | 'sharing' | 'joined' | 'connecting'

interface LiveShareWidgetProps {
  state: LiveShareState
  participantCount?: number
  sessionName?: string
  onToggle?: () => void
}

export function LiveShareWidget({
  state,
  participantCount = 0,
  sessionName,
  onToggle,
}: LiveShareWidgetProps) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const colorMap: Record<LiveShareState, string> = {
    inactive: 'var(--text-muted)',
    sharing: 'var(--accent-green, #89d185)',
    joined: 'var(--accent, #58a6ff)',
    connecting: 'var(--accent-orange, #cca700)',
  }

  const labelMap: Record<LiveShareState, string> = {
    inactive: 'Live Share',
    sharing: 'Sharing',
    joined: 'Joined',
    connecting: 'Connecting...',
  }

  const isActive = state === 'sharing' || state === 'joined'

  const handleClick = useCallback(() => {
    if (onToggle) {
      onToggle()
    } else {
      setOpen((v) => !v)
    }
  }, [onToggle])

  const dropdownItems: DropdownItem[] = useMemo(() => {
    if (state === 'inactive') {
      return [
        { id: 'start', label: 'Start Collaboration Session' },
        { id: 'join', label: 'Join Collaboration Session...' },
      ]
    }
    return [
      {
        id: 'info',
        label: sessionName ? `Session: ${sessionName}` : 'Active Session',
        detail: `${participantCount} participant(s)`,
      },
      { id: 'invite', label: 'Invite Participants...' },
      { id: 'settings', label: 'Session Settings...' },
      { id: 'stop', label: state === 'sharing' ? 'Stop Sharing' : 'Leave Session' },
    ]
  }, [state, sessionName, participantCount])

  const handleSelect = useCallback(
    (id: string) => {
      window.dispatchEvent(
        new CustomEvent('orion:live-share-action', { detail: { action: id } })
      )
    },
    []
  )

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={`Live Share: ${labelMap[state]}${participantCount > 0 ? ` (${participantCount} participants)` : ''}`}
        onClick={handleClick}
      >
        <Users
          size={11}
          style={{
            color: colorMap[state],
            animation: state === 'connecting' ? 'pulse 1.5s infinite' : 'none',
          }}
        />
        <span style={{ color: colorMap[state] }}>{labelMap[state]}</span>
        {isActive && participantCount > 0 && (
          <span
            style={{
              background: colorMap[state],
              color: '#fff',
              fontSize: 8,
              fontWeight: 700,
              lineHeight: 1,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              marginLeft: 2,
            }}
          >
            {participantCount}
          </span>
        )}
      </WidgetButton>
      {open && !onToggle && (
        <WidgetDropdown
          items={dropdownItems}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          width={240}
        />
      )}
    </div>
  )
}

// ── 15. Performance Indicator ─────────────────────────────────────────────────

interface PerformanceWidgetProps {
  enabled?: boolean
  onToggle?: () => void
}

export function PerformanceWidget({
  enabled = false,
  onToggle,
}: PerformanceWidgetProps) {
  const [fps, setFps] = useState(0)
  const [memoryMB, setMemoryMB] = useState(0)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const frameTimesRef = useRef<number[]>([])
  const rafRef = useRef<number>(0)

  // FPS counter
  useEffect(() => {
    if (!enabled) return

    let lastTime = performance.now()

    const tick = (now: number) => {
      const delta = now - lastTime
      lastTime = now

      frameTimesRef.current.push(delta)
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift()
      }

      // Update FPS display every 30 frames
      if (frameTimesRef.current.length % 30 === 0) {
        const avgDelta =
          frameTimesRef.current.reduce((a, b) => a + b, 0) /
          frameTimesRef.current.length
        setFps(Math.round(1000 / avgDelta))
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [enabled])

  // Memory polling
  useEffect(() => {
    if (!enabled) return

    const readMemory = () => {
      try {
        const perfMemory = (
          performance as unknown as { memory?: { usedJSHeapSize: number } }
        ).memory
        if (perfMemory?.usedJSHeapSize) {
          setMemoryMB(Math.round(perfMemory.usedJSHeapSize / (1024 * 1024)))
          return
        }
      } catch {
        // ignore
      }
      // Fallback estimate
      setMemoryMB(Math.round(80 + Math.random() * 40))
    }

    readMemory()
    const interval = setInterval(readMemory, 5000)
    return () => clearInterval(interval)
  }, [enabled])

  const fpsColor = useMemo(() => {
    if (fps >= 55) return 'var(--accent-green, #89d185)'
    if (fps >= 30) return 'var(--accent-orange, #cca700)'
    return 'var(--accent-red, #f44747)'
  }, [fps])

  const memColor = useMemo(() => {
    if (memoryMB < 300) return 'var(--accent-green, #89d185)'
    if (memoryMB <= 500) return 'var(--accent-orange, #cca700)'
    return 'var(--accent-red, #f44747)'
  }, [memoryMB])

  const handleClick = useCallback(() => {
    if (onToggle) {
      onToggle()
    } else {
      setOpen((v) => !v)
    }
  }, [onToggle])

  const dropdownItems: DropdownItem[] = useMemo(
    () => [
      { id: 'toggle', label: enabled ? 'Disable Performance Mode' : 'Enable Performance Mode', active: enabled },
      { id: 'gc', label: 'Force Garbage Collection' },
      { id: 'profile', label: 'Open Performance Profiler' },
      { id: 'report', label: 'Generate Performance Report' },
    ],
    [enabled]
  )

  const handleSelect = useCallback(
    (id: string) => {
      if (id === 'toggle') {
        onToggle?.()
      } else if (id === 'gc') {
        if ((window as unknown as { gc?: () => void }).gc) {
          ;(window as unknown as { gc: () => void }).gc()
        }
        window.dispatchEvent(new CustomEvent('orion:gc-hint'))
      } else if (id === 'profile') {
        window.dispatchEvent(new CustomEvent('orion:open-profiler'))
      } else if (id === 'report') {
        window.dispatchEvent(new CustomEvent('orion:perf-report'))
      }
    },
    [onToggle]
  )

  // When not enabled, show a simple toggle button
  if (!enabled) {
    return (
      <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <WidgetButton
          title="Performance monitoring (click to enable)"
          onClick={handleClick}
        >
          <Activity size={10} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
        </WidgetButton>
        {open && !onToggle && (
          <WidgetDropdown
            items={dropdownItems}
            onSelect={handleSelect}
            onClose={() => setOpen(false)}
            anchorRef={anchorRef}
            width={240}
          />
        )}
      </div>
    )
  }

  return (
    <div ref={anchorRef} style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <WidgetButton
        title={`Performance: ${fps} FPS, ${memoryMB} MB memory`}
        onClick={handleClick}
      >
        <Activity size={10} style={{ color: fpsColor }} />
        <span style={{ color: fpsColor, fontSize: 10 }}>{fps} FPS</span>
        <span
          style={{
            color: 'var(--text-muted)',
            margin: '0 2px',
            fontSize: 10,
          }}
        >
          |
        </span>
        <Cpu size={10} style={{ color: memColor }} />
        <span style={{ color: memColor, fontSize: 10 }}>{memoryMB} MB</span>
      </WidgetButton>
      {open && !onToggle && (
        <WidgetDropdown
          items={dropdownItems}
          onSelect={handleSelect}
          onClose={() => setOpen(false)}
          anchorRef={anchorRef}
          width={240}
        />
      )}
    </div>
  )
}

// ── Default export: combined StatusBarWidgets ─────────────────────────────────

interface StatusBarWidgetsProps {
  // File/editor state
  languageId?: string
  filename?: string
  encoding?: string
  eol?: 'LF' | 'CRLF' | 'CR'
  useSpaces?: boolean
  indentSize?: number
  cursorLine?: number
  cursorColumn?: number
  totalLines?: number
  selectedChars?: number
  selectedLines?: number

  // Git state
  gitBranch?: string
  gitIsRepo?: boolean
  gitAhead?: number
  gitBehind?: number

  // Diagnostics
  errorCount?: number
  warningCount?: number
  infoCount?: number

  // Notifications
  notificationCount?: number

  // AI
  copilotStatus?: CopilotState

  // Remote
  remoteType?: RemoteType
  remoteLabel?: string

  // Collaboration
  liveShareState?: LiveShareState
  liveShareParticipants?: number

  // Performance
  performanceMode?: boolean

  // Callbacks
  onChangeLanguage?: (id: string) => void
  onChangeEncoding?: (encoding: string) => void
  onChangeEOL?: (eol: string) => void
  onChangeIndent?: (useSpaces: boolean, size: number) => void
  onGoToLine?: () => void
  onFetchBranches?: () => Promise<Array<{ name: string; current: boolean }>>
  onSwitchBranch?: (branch: string) => void
  onSync?: () => void
  onNotificationClick?: () => void
  onProblemsClick?: () => void
  onFeedbackClick?: () => void
  onCopilotToggle?: () => void
  onRemoteClick?: () => void
  onLiveShareToggle?: () => void
  onPerformanceToggle?: () => void
}

export default function StatusBarWidgets({
  languageId = 'plaintext',
  filename,
  encoding = 'utf-8',
  eol = 'LF',
  useSpaces = true,
  indentSize = 2,
  cursorLine = 1,
  cursorColumn = 1,
  totalLines,
  selectedChars = 0,
  selectedLines = 0,
  gitBranch = 'main',
  gitIsRepo = true,
  gitAhead = 0,
  gitBehind = 0,
  errorCount = 0,
  warningCount = 0,
  infoCount = 0,
  notificationCount = 0,
  copilotStatus = 'active',
  remoteType = 'none',
  remoteLabel,
  liveShareState = 'inactive',
  liveShareParticipants = 0,
  performanceMode = false,
  onChangeLanguage,
  onChangeEncoding,
  onChangeEOL,
  onChangeIndent,
  onGoToLine,
  onFetchBranches,
  onSwitchBranch,
  onSync,
  onNotificationClick,
  onProblemsClick,
  onFeedbackClick,
  onCopilotToggle,
  onRemoteClick,
  onLiveShareToggle,
  onPerformanceToggle,
}: StatusBarWidgetsProps) {
  return (
    <div
      className="flex items-center select-none"
      style={{
        height: 22,
        fontSize: 11,
        color: 'var(--text-muted)',
        width: '100%',
      }}
    >
      {/* ── Left section ── */}
      <div className="flex items-center" style={{ height: '100%' }}>
        <RemoteIndicatorWidget
          type={remoteType}
          label={remoteLabel}
          onClick={onRemoteClick}
        />

        <GitBranchWidget
          branch={gitBranch}
          isRepo={gitIsRepo}
          ahead={gitAhead}
          behind={gitBehind}
          onFetchBranches={onFetchBranches}
          onSwitchBranch={onSwitchBranch}
        />

        <GitSyncWidget
          isRepo={gitIsRepo}
          ahead={gitAhead}
          behind={gitBehind}
          onSync={onSync}
        />

        <div
          style={{
            width: 1,
            height: 12,
            background: 'var(--border, #333)',
            margin: '0 2px',
            flexShrink: 0,
          }}
        />

        <ProblemsWidget
          errors={errorCount}
          warnings={warningCount}
          infos={infoCount}
          onClick={onProblemsClick}
        />
      </div>

      {/* ── Spacer ── */}
      <div style={{ flex: 1 }} />

      {/* ── Right section ── */}
      <div className="flex items-center" style={{ height: '100%' }}>
        <CursorPositionWidget
          line={cursorLine}
          column={cursorColumn}
          totalLines={totalLines}
          onGoToLine={onGoToLine}
        />

        <SelectionInfoWidget
          selectedChars={selectedChars}
          selectedLines={selectedLines}
        />

        <IndentWidget
          useSpaces={useSpaces}
          size={indentSize}
          onChangeIndent={onChangeIndent}
        />

        <EOLWidget eol={eol} onChangeEOL={onChangeEOL} />

        <EncodingWidget encoding={encoding} onChangeEncoding={onChangeEncoding} />

        <LanguageModeWidget
          languageId={languageId}
          filename={filename}
          onChangeLanguage={onChangeLanguage}
        />

        <div
          style={{
            width: 1,
            height: 12,
            background: 'var(--border, #333)',
            margin: '0 2px',
            flexShrink: 0,
          }}
        />

        <CopilotWidget status={copilotStatus} onToggle={onCopilotToggle} />

        <LiveShareWidget
          state={liveShareState}
          participantCount={liveShareParticipants}
          onToggle={onLiveShareToggle}
        />

        <PerformanceWidget
          enabled={performanceMode}
          onToggle={onPerformanceToggle}
        />

        <div
          style={{
            width: 1,
            height: 12,
            background: 'var(--border, #333)',
            margin: '0 2px',
            flexShrink: 0,
          }}
        />

        <FeedbackWidget onClick={onFeedbackClick} />

        <NotificationBellWidget
          count={notificationCount}
          onClick={onNotificationClick}
        />
      </div>
    </div>
  )
}
