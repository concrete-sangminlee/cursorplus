import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  X,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  Edit3,
  Columns,
  FileText,
  Copy,
  Pin,
  Maximize2,
} from 'lucide-react'
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useThemeStore } from '@/store/theme'

/* ── Types ──────────────────────────────────────────────── */

export interface PeekLocation {
  /** Full file path to the definition/reference */
  filePath: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
  /** 1-based end line (optional, for range highlighting) */
  endLine?: number
  /** 1-based end column (optional) */
  endColumn?: number
  /** Preview text of the line content */
  preview?: string
  /** Full file content (for rendering in the embedded editor) */
  fileContent?: string
  /** Language id for syntax highlighting */
  languageId?: string
  /** Symbol name at this location */
  symbolName?: string
}

export interface PeekDefinitionProps {
  /** List of definition/reference locations to show */
  locations: PeekLocation[]
  /** Called when the peek widget is dismissed */
  onClose: () => void
  /** Called when the user navigates to a location (e.g. double-click or "Open to Side") */
  onNavigate?: (location: PeekLocation, mode: 'open' | 'side' | 'edit') => void
  /** Called when content is edited in the peek view (if editing is enabled) */
  onEdit?: (location: PeekLocation, newContent: string) => void
  /** Title to display (e.g. "3 references", "1 definition") */
  title?: string
  /** Whether to allow editing in the peek view */
  allowEditing?: boolean
  /** Initial height of the peek widget */
  initialHeight?: number
  /** Whether to show the reference list sidebar (defaults to true when multiple locations) */
  showReferenceList?: boolean
  /** The mode: 'definition' shows single result, 'references' shows list */
  mode?: 'definition' | 'references'
  /** Whether the peek widget is pinned (stays open on blur) */
  pinned?: boolean
  /** Called when pin state toggles */
  onPinToggle?: () => void
}

/* ── Constants ──────────────────────────────────────────── */

const MIN_PEEK_HEIGHT = 120
const MAX_PEEK_HEIGHT = 600
const DEFAULT_PEEK_HEIGHT = 280
const REFERENCE_LIST_WIDTH = 280
const HEADER_HEIGHT = 28
const RESIZE_HANDLE_HEIGHT = 4
const CONTEXT_LINES_ABOVE = 5

/* ── Helpers ────────────────────────────────────────────── */

/** Extract the file name from a full path. */
function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path
}

/** Extract relative path from workspace root (heuristic). */
function relativePath(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  // Try to find common workspace markers
  const markers = ['/src/', '/lib/', '/packages/', '/app/']
  for (const marker of markers) {
    const idx = normalized.indexOf(marker)
    if (idx !== -1) return normalized.slice(idx + 1)
  }
  // Fall back to last 3 segments
  const parts = normalized.split('/')
  return parts.slice(Math.max(0, parts.length - 3)).join('/')
}

/** Detect language from file extension */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin',
    cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', swift: 'swift',
    json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml', html: 'html',
    css: 'css', scss: 'scss', less: 'less', md: 'markdown', sql: 'sql',
    sh: 'shell', bash: 'shell', zsh: 'shell', ps1: 'powershell',
    vue: 'vue', svelte: 'svelte', php: 'php', lua: 'lua', dart: 'dart',
  }
  return map[ext] || 'plaintext'
}

/** Generate a synthetic file content from a preview line for when full content is not available */
function generateSyntheticContent(location: PeekLocation): string {
  if (location.fileContent) return location.fileContent
  if (!location.preview) return `// ${fileName(location.filePath)}\n// Content not available`

  const lines: string[] = []
  // Add blank lines so the preview appears at the correct line number
  const targetLine = Math.max(1, location.line - CONTEXT_LINES_ABOVE)
  for (let i = 1; i < targetLine; i++) {
    lines.push('')
  }
  // Add some context padding before the actual line
  for (let i = 0; i < CONTEXT_LINES_ABOVE && targetLine + i < location.line; i++) {
    lines.push('')
  }
  lines.push(location.preview)
  // Add a few lines after
  for (let i = 0; i < 10; i++) {
    lines.push('')
  }
  return lines.join('\n')
}

/** Group locations by file path */
function groupByFile(locations: PeekLocation[]): Map<string, PeekLocation[]> {
  const grouped = new Map<string, PeekLocation[]>()
  for (const loc of locations) {
    const existing = grouped.get(loc.filePath)
    if (existing) {
      existing.push(loc)
    } else {
      grouped.set(loc.filePath, [loc])
    }
  }
  return grouped
}

/* ── Syntax highlight for preview text ──────────────────── */

interface TokenSpan {
  text: string
  className: string
}

function tokenizePreview(text: string, languageId: string): TokenSpan[] {
  // Simple keyword-based tokenizer for preview lines
  const keywords: Record<string, Set<string>> = {
    typescript: new Set([
      'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
      'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while',
      'new', 'this', 'extends', 'implements', 'async', 'await', 'default',
      'public', 'private', 'protected', 'static', 'readonly', 'abstract',
      'void', 'string', 'number', 'boolean', 'null', 'undefined', 'true', 'false',
    ]),
    typescriptreact: new Set([
      'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum',
      'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while',
      'new', 'this', 'extends', 'implements', 'async', 'await', 'default',
      'public', 'private', 'protected', 'static', 'readonly', 'abstract',
      'void', 'string', 'number', 'boolean', 'null', 'undefined', 'true', 'false',
    ]),
    python: new Set([
      'def', 'class', 'import', 'from', 'return', 'if', 'else', 'elif',
      'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'async',
      'await', 'yield', 'None', 'True', 'False', 'self', 'lambda', 'pass',
    ]),
  }

  const langKeywords = keywords[languageId] || keywords['typescript'] || new Set()
  const tokens: TokenSpan[] = []
  let i = 0

  while (i < text.length) {
    // Whitespace
    if (/\s/.test(text[i])) {
      let j = i
      while (j < text.length && /\s/.test(text[j])) j++
      tokens.push({ text: text.slice(i, j), className: '' })
      i = j
      continue
    }

    // Single-line comment
    if (text.slice(i, i + 2) === '//' || text[i] === '#') {
      tokens.push({ text: text.slice(i), className: 'peek-token-comment' })
      break
    }

    // String (single or double quote)
    if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
      const quote = text[i]
      let j = i + 1
      while (j < text.length && text[j] !== quote) {
        if (text[j] === '\\') j++
        j++
      }
      if (j < text.length) j++
      tokens.push({ text: text.slice(i, j), className: 'peek-token-string' })
      i = j
      continue
    }

    // Number
    if (/[0-9]/.test(text[i])) {
      let j = i
      while (j < text.length && /[0-9.xXa-fA-F_]/.test(text[j])) j++
      tokens.push({ text: text.slice(i, j), className: 'peek-token-number' })
      i = j
      continue
    }

    // Word (identifier or keyword)
    if (/[a-zA-Z_$]/.test(text[i])) {
      let j = i
      while (j < text.length && /[a-zA-Z0-9_$]/.test(text[j])) j++
      const word = text.slice(i, j)
      const cls = langKeywords.has(word) ? 'peek-token-keyword' : 'peek-token-identifier'
      tokens.push({ text: word, className: cls })
      i = j
      continue
    }

    // Punctuation / operators
    tokens.push({ text: text[i], className: 'peek-token-punctuation' })
    i++
  }

  return tokens
}

/* ── Sub-components ─────────────────────────────────────── */

/** Reference list item in the sidebar */
function ReferenceItem({
  location,
  index,
  isActive,
  onClick,
  onDoubleClick,
}: {
  location: PeekLocation
  index: number
  isActive: boolean
  onClick: () => void
  onDoubleClick: () => void
}) {
  const languageId = location.languageId || detectLanguage(location.filePath)
  const tokens = useMemo(
    () => tokenizePreview(location.preview || '', languageId),
    [location.preview, languageId]
  )

  return (
    <div
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      style={{
        padding: '2px 8px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        backgroundColor: isActive ? 'var(--peek-list-active-bg, rgba(4, 57, 94, 0.7))' : 'transparent',
        borderLeft: isActive ? '2px solid var(--peek-accent, #1b80b2)' : '2px solid transparent',
        fontSize: '12px',
        lineHeight: '18px',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'var(--peek-list-hover-bg, rgba(4, 57, 94, 0.4))'
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent'
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: 'var(--peek-file-color, #e8e8e8)',
          fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", Consolas, monospace)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <FileText size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {relativePath(location.filePath)}
        </span>
        <span style={{ color: 'var(--peek-line-color, #858585)', flexShrink: 0, marginLeft: 'auto' }}>
          :{location.line}
        </span>
      </div>
      {location.preview && (
        <div
          style={{
            fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", Consolas, monospace)',
            fontSize: '11px',
            lineHeight: '16px',
            color: 'var(--peek-preview-color, #a0a0a0)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            paddingLeft: 16,
          }}
        >
          {tokens.map((t, i) => (
            <span key={i} className={t.className}>
              {t.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** File group header in the reference list */
function FileGroupHeader({
  filePath,
  count,
  isExpanded,
  onToggle,
}: {
  filePath: string
  count: number
  isExpanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 600,
        color: 'var(--peek-file-header-color, #e8e8e8)',
        backgroundColor: 'var(--peek-file-header-bg, rgba(255, 255, 255, 0.04))',
        userSelect: 'none',
        lineHeight: '20px',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          transition: 'transform 120ms',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
          fontSize: '10px',
        }}
      >
        &#9654;
      </span>
      <FileText size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {fileName(filePath)}
      </span>
      <span
        style={{
          fontSize: '10px',
          backgroundColor: 'var(--peek-badge-bg, rgba(77, 153, 209, 0.5))',
          color: 'var(--peek-badge-color, #ffffff)',
          borderRadius: 8,
          padding: '0 5px',
          lineHeight: '16px',
          flexShrink: 0,
        }}
      >
        {count}
      </span>
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────── */

export default function PeekDefinition({
  locations,
  onClose,
  onNavigate,
  onEdit,
  title,
  allowEditing = false,
  initialHeight,
  showReferenceList,
  mode = 'references',
  pinned = false,
  onPinToggle,
}: PeekDefinitionProps) {
  /* ── Theme ──────────────────────────────────────────────── */
  const monacoTheme = useThemeStore((s) => s.activeTheme().monacoTheme)

  /* ── State ──────────────────────────────────────────────── */
  const [activeIndex, setActiveIndex] = useState(0)
  const [peekHeight, setPeekHeight] = useState(initialHeight || DEFAULT_PEEK_HEIGHT)
  const [isEditing, setIsEditing] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => {
    // Expand all files by default
    return new Set(locations.map((l) => l.filePath))
  })
  const [editorContent, setEditorContent] = useState<string | null>(null)

  /* ── Refs ───────────────────────────────────────────────── */
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const referenceListRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const resizeStartRef = useRef({ y: 0, height: 0 })

  /* ── Derived state ──────────────────────────────────────── */
  const activeLocation = locations[activeIndex] || locations[0]
  const showSidebar = showReferenceList ?? (locations.length > 1)
  const groupedLocations = useMemo(() => groupByFile(locations), [locations])
  const languageId = activeLocation?.languageId || detectLanguage(activeLocation?.filePath || '')
  const content = useMemo(() => {
    if (editorContent !== null && isEditing) return editorContent
    return activeLocation ? generateSyntheticContent(activeLocation) : ''
  }, [activeLocation, editorContent, isEditing])

  const displayTitle = useMemo(() => {
    if (title) return title
    if (mode === 'definition') {
      return locations.length === 1 ? '1 definition' : `${locations.length} definitions`
    }
    return locations.length === 1 ? '1 reference' : `${locations.length} references`
  }, [title, mode, locations.length])

  /* ── Ensure active index is within bounds ────────────────── */
  useEffect(() => {
    if (activeIndex >= locations.length) {
      setActiveIndex(Math.max(0, locations.length - 1))
    }
  }, [locations.length, activeIndex])

  /* ── Reset editor content when switching locations ─────── */
  useEffect(() => {
    setEditorContent(null)
    setIsEditing(false)
  }, [activeIndex])

  /* ── Editor mount handler ───────────────────────────────── */
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      // Scroll to the target line
      if (activeLocation) {
        const targetLine = Math.max(1, activeLocation.line - CONTEXT_LINES_ABOVE)
        editor.revealLineInCenter(targetLine)

        // Highlight the target range
        const endLine = activeLocation.endLine || activeLocation.line
        const endColumn = activeLocation.endColumn || (activeLocation.preview?.length || 80) + 1
        editor.deltaDecorations([], [
          {
            range: new monaco.Range(
              activeLocation.line,
              activeLocation.column,
              endLine,
              endColumn
            ),
            options: {
              className: 'peek-highlight-range',
              isWholeLine: false,
              overviewRuler: {
                color: '#1b80b2',
                position: monaco.editor.OverviewRulerLane.Full,
              },
            },
          },
          {
            range: new monaco.Range(activeLocation.line, 1, endLine, 1),
            options: {
              isWholeLine: true,
              className: 'peek-highlight-line',
            },
          },
        ])

        // Set cursor position
        editor.setPosition({ lineNumber: activeLocation.line, column: activeLocation.column })
      }

      // Focus the editor
      editor.focus()
    },
    [activeLocation]
  )

  /* ── Reveal active location in editor ───────────────────── */
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !activeLocation) return

    editor.revealLineInCenter(activeLocation.line)

    const endLine = activeLocation.endLine || activeLocation.line
    const endColumn = activeLocation.endColumn || (activeLocation.preview?.length || 80) + 1

    // Clear old decorations and set new ones
    const decorations = editor.deltaDecorations([], [
      {
        range: new monaco.Range(
          activeLocation.line,
          activeLocation.column,
          endLine,
          endColumn
        ),
        options: {
          className: 'peek-highlight-range',
          isWholeLine: false,
        },
      },
      {
        range: new monaco.Range(activeLocation.line, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: 'peek-highlight-line',
        },
      },
    ])

    return () => {
      if (editorRef.current) {
        editorRef.current.deltaDecorations(decorations, [])
      }
    }
  }, [activeLocation])

  /* ── Navigation callbacks ───────────────────────────────── */
  const goToPrevious = useCallback(() => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : locations.length - 1))
  }, [locations.length])

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev < locations.length - 1 ? prev + 1 : 0))
  }, [locations.length])

  const handleSelectReference = useCallback((index: number) => {
    setActiveIndex(index)
  }, [])

  const handleOpenReference = useCallback(
    (location: PeekLocation) => {
      onNavigate?.(location, 'open')
    },
    [onNavigate]
  )

  const handleOpenToSide = useCallback(() => {
    if (activeLocation) {
      onNavigate?.(activeLocation, 'side')
    }
  }, [activeLocation, onNavigate])

  const handleToggleEdit = useCallback(() => {
    if (!allowEditing) return
    setIsEditing((prev) => {
      if (!prev) {
        // Entering edit mode — capture current content
        setEditorContent(content)
      } else {
        // Leaving edit mode — fire onEdit if content changed
        if (editorContent !== null && activeLocation) {
          onEdit?.(activeLocation, editorContent)
        }
      }
      return !prev
    })
  }, [allowEditing, content, editorContent, activeLocation, onEdit])

  const handleCopyPath = useCallback(() => {
    if (activeLocation) {
      navigator.clipboard.writeText(`${activeLocation.filePath}:${activeLocation.line}`).catch(() => {
        // Silently ignore clipboard errors
      })
    }
  }, [activeLocation])

  /* ── File group expand/collapse ─────────────────────────── */
  const toggleFileGroup = useCallback((filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }, [])

  /* ── Resize handling ────────────────────────────────────── */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      resizingRef.current = true
      resizeStartRef.current = { y: e.clientY, height: peekHeight }

      const handleResizeMove = (moveEvent: MouseEvent) => {
        if (!resizingRef.current) return
        const delta = moveEvent.clientY - resizeStartRef.current.y
        const newHeight = Math.min(MAX_PEEK_HEIGHT, Math.max(MIN_PEEK_HEIGHT, resizeStartRef.current.height + delta))
        setPeekHeight(newHeight)
      }

      const handleResizeEnd = () => {
        resizingRef.current = false
        document.removeEventListener('mousemove', handleResizeMove)
        document.removeEventListener('mouseup', handleResizeEnd)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
      document.addEventListener('mousemove', handleResizeMove)
      document.addEventListener('mouseup', handleResizeEnd)
    },
    [peekHeight]
  )

  /* ── Keyboard handling ──────────────────────────────────── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape closes the peek widget
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        return
      }

      // Only handle navigation keys when not editing
      if (isEditing) return

      // F2 toggles edit mode
      if (e.key === 'F2' && allowEditing) {
        e.preventDefault()
        handleToggleEdit()
        return
      }

      // Ctrl+Enter opens in editor
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && activeLocation) {
        e.preventDefault()
        onNavigate?.(activeLocation, 'open')
        return
      }

      // Alt+arrows for reference navigation
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault()
        goToPrevious()
        return
      }
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault()
        goToNext()
        return
      }

      // Up/Down for reference list navigation when reference list is focused
      if (
        e.key === 'ArrowUp' &&
        referenceListRef.current?.contains(document.activeElement)
      ) {
        e.preventDefault()
        goToPrevious()
        return
      }
      if (
        e.key === 'ArrowDown' &&
        referenceListRef.current?.contains(document.activeElement)
      ) {
        e.preventDefault()
        goToNext()
        return
      }

      // Enter on a reference opens it
      if (
        e.key === 'Enter' &&
        referenceListRef.current?.contains(document.activeElement) &&
        activeLocation
      ) {
        e.preventDefault()
        onNavigate?.(activeLocation, 'open')
        return
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('keydown', handleKeyDown)
      return () => container.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    onClose, isEditing, allowEditing, handleToggleEdit,
    activeLocation, onNavigate, goToPrevious, goToNext,
  ])

  /* ── Focus management ───────────────────────────────────── */
  useEffect(() => {
    // Focus the container when the peek widget mounts
    containerRef.current?.focus()
  }, [])

  /* ── Scroll active reference into view ──────────────────── */
  useEffect(() => {
    if (!referenceListRef.current) return
    const activeItem = referenceListRef.current.querySelector('[aria-selected="true"]')
    if (activeItem) {
      activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [activeIndex])

  /* ── Build flat reference list with file group indices ──── */
  const referenceItems = useMemo(() => {
    const items: Array<
      | { type: 'header'; filePath: string; count: number }
      | { type: 'ref'; location: PeekLocation; flatIndex: number }
    > = []
    let flatIndex = 0
    for (const [filePath, locs] of groupedLocations) {
      items.push({ type: 'header', filePath, count: locs.length })
      for (const loc of locs) {
        items.push({ type: 'ref', location: loc, flatIndex })
        flatIndex++
      }
    }
    return items
  }, [groupedLocations])

  /* ── Bail if no locations ────────────────────────────────── */
  if (!locations.length) return null

  /* ── Editor options ─────────────────────────────────────── */
  const editorOptions: MonacoEditor.IStandaloneEditorConstructionOptions = {
    readOnly: !isEditing,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    lineNumbersMinChars: 3,
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 0,
    renderLineHighlight: 'none',
    overviewRulerBorder: false,
    overviewRulerLanes: 1,
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto',
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
    contextmenu: false,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", Consolas, monospace)',
    renderWhitespace: 'none',
    wordWrap: 'off',
    domReadOnly: !isEditing,
    cursorStyle: isEditing ? 'line' : 'line-thin',
    cursorBlinking: isEditing ? 'blink' : 'solid',
    matchBrackets: 'always',
    occurrencesHighlight: 'off' as unknown as boolean,
    selectionHighlight: false,
    renderValidationDecorations: 'off' as unknown as 'on' | 'off',
    fixedOverflowWidgets: true,
    padding: { top: 4, bottom: 4 },
  }

  /* ── Render ─────────────────────────────────────────────── */
  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Peek: ${displayTitle}`}
      style={{
        position: 'relative',
        width: '100%',
        height: peekHeight + HEADER_HEIGHT + RESIZE_HANDLE_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        border: '2px solid var(--peek-border, #1b80b2)',
        backgroundColor: 'var(--peek-bg, #1e1e1e)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        outline: 'none',
        zIndex: 10,
        overflow: 'hidden',
        fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
      }}
    >
      {/* ── Title Bar ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: HEADER_HEIGHT,
          minHeight: HEADER_HEIGHT,
          backgroundColor: 'var(--peek-title-bg, #1b80b2)',
          color: 'var(--peek-title-color, #ffffff)',
          fontSize: '12px',
          fontWeight: 500,
          paddingLeft: 8,
          paddingRight: 4,
          gap: 4,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {/* File path breadcrumb */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flex: 1,
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              opacity: 0.9,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", Consolas, monospace)',
              fontSize: '11px',
            }}
            title={activeLocation.filePath}
          >
            {relativePath(activeLocation.filePath)}
          </span>
          <span style={{ opacity: 0.65, fontSize: '11px' }}>
            :{activeLocation.line}:{activeLocation.column}
          </span>
        </div>

        {/* Navigation counter */}
        {locations.length > 1 && (
          <span
            style={{
              fontSize: '11px',
              opacity: 0.85,
              whiteSpace: 'nowrap',
              marginRight: 2,
            }}
          >
            {activeIndex + 1} / {locations.length}
          </span>
        )}

        {/* Navigation arrows */}
        {locations.length > 1 && (
          <>
            <PeekIconButton
              icon={<ChevronUp size={14} />}
              title="Previous reference (Alt+Up)"
              onClick={goToPrevious}
              color="var(--peek-title-color, #ffffff)"
            />
            <PeekIconButton
              icon={<ChevronDown size={14} />}
              title="Next reference (Alt+Down)"
              onClick={goToNext}
              color="var(--peek-title-color, #ffffff)"
            />
          </>
        )}

        {/* Action buttons */}
        <PeekDivider />

        <PeekIconButton
          icon={<Copy size={13} />}
          title="Copy path"
          onClick={handleCopyPath}
          color="var(--peek-title-color, #ffffff)"
        />

        {allowEditing && (
          <PeekIconButton
            icon={<Edit3 size={13} />}
            title={isEditing ? 'Stop editing (F2)' : 'Edit in peek (F2)'}
            onClick={handleToggleEdit}
            color="var(--peek-title-color, #ffffff)"
            isActive={isEditing}
          />
        )}

        <PeekIconButton
          icon={<Columns size={13} />}
          title="Open to side"
          onClick={handleOpenToSide}
          color="var(--peek-title-color, #ffffff)"
        />

        {onPinToggle && (
          <PeekIconButton
            icon={<Pin size={13} />}
            title={pinned ? 'Unpin peek' : 'Pin peek'}
            onClick={onPinToggle}
            color="var(--peek-title-color, #ffffff)"
            isActive={pinned}
          />
        )}

        <PeekIconButton
          icon={<Maximize2 size={13} />}
          title="Open definition (Ctrl+Enter)"
          onClick={() => activeLocation && onNavigate?.(activeLocation, 'open')}
          color="var(--peek-title-color, #ffffff)"
        />

        <PeekDivider />

        <PeekIconButton
          icon={<X size={14} />}
          title="Close (Escape)"
          onClick={onClose}
          color="var(--peek-title-color, #ffffff)"
        />
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {/* ── Embedded editor ──────────────────────────────── */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            borderRight: showSidebar ? '1px solid var(--peek-divider, rgba(128, 128, 128, 0.35))' : 'none',
          }}
        >
          <Editor
            height="100%"
            language={languageId}
            value={content}
            theme={monacoTheme}
            onMount={handleEditorMount}
            onChange={(value) => {
              if (isEditing && value !== undefined) {
                setEditorContent(value)
              }
            }}
            options={editorOptions}
            loading={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: 'var(--peek-loading-color, #808080)',
                  fontSize: '12px',
                }}
              >
                Loading...
              </div>
            }
          />
        </div>

        {/* ── Reference list sidebar ───────────────────────── */}
        {showSidebar && (
          <div
            ref={referenceListRef}
            role="listbox"
            aria-label="References"
            tabIndex={0}
            style={{
              width: REFERENCE_LIST_WIDTH,
              minWidth: REFERENCE_LIST_WIDTH,
              maxWidth: REFERENCE_LIST_WIDTH,
              overflowY: 'auto',
              overflowX: 'hidden',
              backgroundColor: 'var(--peek-sidebar-bg, #252526)',
              outline: 'none',
            }}
            onFocus={() => {
              // When the reference list gets focus, ensure scrolling to active item
              const activeItem = referenceListRef.current?.querySelector('[aria-selected="true"]')
              if (activeItem) {
                activeItem.scrollIntoView({ block: 'nearest' })
              }
            }}
          >
            {/* Title line */}
            <div
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--peek-sidebar-title-color, #cccccc)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                borderBottom: '1px solid var(--peek-divider, rgba(128, 128, 128, 0.35))',
                userSelect: 'none',
              }}
            >
              {displayTitle}
            </div>

            {/* Grouped reference items */}
            {referenceItems.map((item, idx) => {
              if (item.type === 'header') {
                return (
                  <FileGroupHeader
                    key={`header-${item.filePath}`}
                    filePath={item.filePath}
                    count={item.count}
                    isExpanded={expandedFiles.has(item.filePath)}
                    onToggle={() => toggleFileGroup(item.filePath)}
                  />
                )
              }

              // Hide reference if its file group is collapsed
              if (!expandedFiles.has(item.location.filePath)) return null

              return (
                <ReferenceItem
                  key={`ref-${item.flatIndex}-${item.location.filePath}-${item.location.line}`}
                  location={item.location}
                  index={item.flatIndex}
                  isActive={item.flatIndex === activeIndex}
                  onClick={() => handleSelectReference(item.flatIndex)}
                  onDoubleClick={() => handleOpenReference(item.location)}
                />
              )
            })}

            {/* Empty state */}
            {locations.length === 0 && (
              <div
                style={{
                  padding: '16px 8px',
                  textAlign: 'center',
                  color: 'var(--peek-empty-color, #808080)',
                  fontSize: '12px',
                }}
              >
                No results found
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Resize handle ──────────────────────────────────── */}
      <div
        onMouseDown={handleResizeStart}
        style={{
          height: RESIZE_HANDLE_HEIGHT,
          minHeight: RESIZE_HANDLE_HEIGHT,
          cursor: 'ns-resize',
          backgroundColor: 'var(--peek-resize-bg, transparent)',
          borderTop: '1px solid var(--peek-border, #1b80b2)',
          position: 'relative',
          flexShrink: 0,
        }}
        title="Drag to resize"
      >
        {/* Visual grip dots */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 24,
            height: 2,
            borderRadius: 1,
            backgroundColor: 'var(--peek-resize-grip, rgba(128, 128, 128, 0.5))',
          }}
        />
      </div>

      {/* ── Injected CSS for editor decorations and token colors ── */}
      <style>{`
        .peek-highlight-range {
          background-color: rgba(27, 128, 178, 0.25) !important;
          border: 1px solid rgba(27, 128, 178, 0.5);
          border-radius: 2px;
        }
        .peek-highlight-line {
          background-color: rgba(27, 128, 178, 0.1) !important;
        }
        .peek-token-keyword {
          color: var(--diff-syntax-keyword, #569cd6);
        }
        .peek-token-string {
          color: var(--diff-syntax-string, #ce9178);
        }
        .peek-token-comment {
          color: var(--diff-syntax-comment, #6a9955);
          font-style: italic;
        }
        .peek-token-number {
          color: var(--diff-syntax-number, #b5cea8);
        }
        .peek-token-punctuation {
          color: var(--diff-syntax-punctuation, #d4d4d4);
        }
        .peek-token-identifier {
          color: var(--peek-preview-color, #a0a0a0);
        }
      `}</style>
    </div>
  )
}

/* ── Small helper sub-components ────────────────────────── */

/** Tiny icon button for the peek title bar */
function PeekIconButton({
  icon,
  title,
  onClick,
  color,
  isActive,
}: {
  icon: React.ReactNode
  title: string
  onClick: () => void
  color: string
  isActive?: boolean
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        padding: 0,
        margin: 0,
        border: 'none',
        borderRadius: 3,
        cursor: 'pointer',
        color,
        backgroundColor: hovered || isActive
          ? 'rgba(255, 255, 255, 0.15)'
          : 'transparent',
        transition: 'background-color 100ms',
        flexShrink: 0,
        outline: 'none',
        opacity: isActive ? 1 : hovered ? 0.95 : 0.8,
      }}
    >
      {icon}
    </button>
  )
}

/** Vertical divider for the title bar */
function PeekDivider() {
  return (
    <div
      style={{
        width: 1,
        height: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        margin: '0 2px',
        flexShrink: 0,
      }}
    />
  )
}
