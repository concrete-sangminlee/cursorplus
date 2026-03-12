import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Search, FileText, ChevronRight, ChevronDown, Copy, X,
  ChevronsDownUp, ChevronsUpDown, Pin, PinOff, Trash2,
  ArrowUp, ArrowDown, Eye, Filter, Loader2, Layers,
  BookOpen, PenLine, Phone, PhoneOutgoing, PhoneIncoming,
  CornerDownRight, CornerUpLeft, RefreshCw, MoreVertical,
  ExternalLink, MapPin, Hash, FolderOpen, Minus, Plus,
  ArrowRight, CheckSquare, Square, List, GitBranch,
} from 'lucide-react'
import { useEditorStore } from '@/store/editor'
import { useFileStore } from '@/store/files'

// ─── Types ──────────────────────────────────────────────────────────────────

type ReferenceKind = 'read' | 'write' | 'unknown'

interface Reference {
  id: string
  filePath: string
  fileName: string
  line: number
  column: number
  endColumn: number
  lineContent: string
  surroundingLines: string[]
  surroundingStartLine: number
  kind: ReferenceKind
  removed?: boolean
}

interface FileGroup {
  filePath: string
  fileName: string
  dirPath: string
  references: Reference[]
  readCount: number
  writeCount: number
}

interface SearchResult {
  id: string
  symbolName: string
  symbolKind: string
  timestamp: number
  references: Reference[]
  pinned: boolean
  loading: boolean
  progress: number
}

// ─── Call Hierarchy Types ────────────────────────────────────────────────────

interface CallHierarchyItem {
  id: string
  name: string
  kind: string
  filePath: string
  fileName: string
  line: number
  column: number
  detail?: string
  children?: CallHierarchyItem[]
  loadingChildren?: boolean
  expanded?: boolean
}

type CallHierarchyDirection = 'incoming' | 'outgoing'

// ─── Style Constants ─────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', height: '100%',
  background: 'var(--bg-secondary)', color: 'var(--text-primary)',
  fontSize: 12, fontFamily: 'var(--font-sans)',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '6px 10px', borderBottom: '1px solid var(--border)',
  background: 'var(--bg-tertiary)', minHeight: 32,
  flexShrink: 0,
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '4px 10px', borderBottom: '1px solid var(--border)',
  background: 'var(--bg-secondary)', flexShrink: 0,
}

const searchInputStyle: React.CSSProperties = {
  flex: 1, padding: '4px 8px', background: 'var(--bg-primary)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  outline: 'none', fontSize: 11, color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
}

const iconBtnStyle: React.CSSProperties = {
  padding: 3, borderRadius: 3, color: 'var(--text-muted)',
  background: 'transparent', border: 'none', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'all 0.12s',
}

const iconBtnActiveStyle: React.CSSProperties = {
  ...iconBtnStyle,
  color: 'var(--accent)', background: 'rgba(88,166,255,0.12)',
}

const fileGroupHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 8px 3px 4px', cursor: 'pointer',
  userSelect: 'none', borderBottom: '1px solid var(--border)',
  background: 'var(--bg-tertiary)', transition: 'background 0.12s',
}

const referenceRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 6,
  padding: '3px 8px 3px 24px', cursor: 'pointer',
  borderBottom: '1px solid transparent',
  transition: 'background 0.1s',
}

const lineNumberStyle: React.CSSProperties = {
  color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
  fontSize: 11, minWidth: 36, textAlign: 'right', flexShrink: 0,
  userSelect: 'none',
}

const codePreviewStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 11, flex: 1,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  lineHeight: '18px',
}

const badgeStyle: React.CSSProperties = {
  padding: '0 5px', borderRadius: 8, fontSize: 10,
  fontWeight: 600, lineHeight: '16px', flexShrink: 0,
}

const readBadge: React.CSSProperties = {
  ...badgeStyle,
  background: 'rgba(88,166,255,0.15)', color: '#58a6ff',
}

const writeBadge: React.CSSProperties = {
  ...badgeStyle,
  background: 'rgba(248,81,73,0.15)', color: '#f97583',
}

const countBadge: React.CSSProperties = {
  ...badgeStyle,
  background: 'rgba(139,148,158,0.15)', color: 'var(--text-muted)',
}

const peekBoxStyle: React.CSSProperties = {
  background: 'var(--bg-primary)', borderLeft: '2px solid var(--accent)',
  padding: '4px 8px', margin: '2px 8px 4px 24px',
  borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)',
  fontSize: 11, lineHeight: '17px', maxHeight: 150,
  overflow: 'auto', whiteSpace: 'pre',
}

const emptyStateStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', padding: 40, color: 'var(--text-muted)',
  gap: 8, flex: 1,
}

const tabBarStyle: React.CSSProperties = {
  display: 'flex', borderBottom: '1px solid var(--border)',
  background: 'var(--bg-secondary)', flexShrink: 0, overflow: 'hidden',
}

const tabStyle: React.CSSProperties = {
  padding: '6px 14px', cursor: 'pointer', fontSize: 11,
  fontWeight: 500, borderBottom: '2px solid transparent',
  color: 'var(--text-muted)', transition: 'all 0.15s',
  display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
  userSelect: 'none', background: 'transparent', border: 'none',
}

const tabActiveStyle: React.CSSProperties = {
  ...tabStyle,
  color: 'var(--text-primary)', borderBottomColor: 'var(--accent)',
}

const progressBarContainerStyle: React.CSSProperties = {
  height: 2, background: 'var(--border)', width: '100%',
  overflow: 'hidden', flexShrink: 0,
}

const breadcrumbStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 2,
  fontSize: 10, color: 'var(--text-muted)',
  overflow: 'hidden', textOverflow: 'ellipsis',
  whiteSpace: 'nowrap', flex: 1,
}

const resultTabStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 8px', fontSize: 10, cursor: 'pointer',
  borderRight: '1px solid var(--border)', color: 'var(--text-muted)',
  background: 'transparent', border: 'none', borderBottom: 'none',
  transition: 'all 0.12s', whiteSpace: 'nowrap',
}

const resultTabActiveStyle: React.CSSProperties = {
  ...resultTabStyle,
  color: 'var(--text-primary)', background: 'var(--bg-primary)',
}

const callHierarchyNodeStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4,
  padding: '3px 6px', cursor: 'pointer', userSelect: 'none',
  transition: 'background 0.1s', borderRadius: 2,
}

const kindIconColors: Record<string, string> = {
  function: '#dcdcaa',
  method: '#dcdcaa',
  class: '#4ec9b0',
  interface: '#4ec9b0',
  variable: '#9cdcfe',
  property: '#9cdcfe',
  constructor: '#dcdcaa',
  enum: '#b5cea8',
  module: '#c586c0',
  type: '#4ec9b0',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _refId = 0
function nextRefId(): string {
  return `ref-${++_refId}-${Date.now()}`
}

let _searchId = 0
function nextSearchId(): string {
  return `search-${++_searchId}-${Date.now()}`
}

let _callId = 0
function nextCallId(): string {
  return `call-${++_callId}-${Date.now()}`
}

function getFileIconColor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f1e05a', jsx: '#f1e05a',
    css: '#563d7c', scss: '#c6538c', html: '#e34c26', json: '#292929',
    md: '#083fa1', py: '#3572a5', rs: '#dea584', go: '#00add8',
    vue: '#41b883', svelte: '#ff3e00', java: '#b07219', cpp: '#f34b7d',
    c: '#555555', rb: '#701516', php: '#4f5d95', swift: '#ffac45',
    kt: '#a97bff',
  }
  return map[ext] || 'var(--text-muted)'
}

function shortenPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length > 3) {
    return '.../' + parts.slice(-3).join('/')
  }
  return normalized
}

function buildBreadcrumbs(filePath: string): string[] {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  if (parts.length <= 1) return parts
  // Show last 4 segments for reasonable breadcrumbs
  return parts.slice(-4)
}

function generateMockReferences(symbolName: string): Reference[] {
  const files = [
    { path: '/src/components/App.tsx', name: 'App.tsx' },
    { path: '/src/hooks/useAuth.ts', name: 'useAuth.ts' },
    { path: '/src/store/editor.ts', name: 'editor.ts' },
    { path: '/src/utils/helpers.ts', name: 'helpers.ts' },
    { path: '/src/panels/EditorPanel.tsx', name: 'EditorPanel.tsx' },
    { path: '/src/components/StatusBar.tsx', name: 'StatusBar.tsx' },
  ]

  const refs: Reference[] = []
  const kinds: ReferenceKind[] = ['read', 'write', 'read', 'read', 'write', 'read']

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const line = 10 + Math.floor(Math.random() * 200)
    const col = 4 + Math.floor(Math.random() * 30)
    const surroundingStart = Math.max(1, line - 2)
    refs.push({
      id: nextRefId(),
      filePath: file.path,
      fileName: file.name,
      line,
      column: col,
      endColumn: col + symbolName.length,
      lineContent: `  const result = ${symbolName}(config, options)`,
      surroundingLines: [
        `  // Process the ${symbolName} call`,
        `  if (config.enabled) {`,
        `  const result = ${symbolName}(config, options)`,
        `    return result`,
        `  }`,
      ],
      surroundingStartLine: surroundingStart,
      kind: kinds[i % kinds.length],
    })

    // Add a second reference in some files
    if (i % 2 === 0) {
      const line2 = line + 20 + Math.floor(Math.random() * 50)
      refs.push({
        id: nextRefId(),
        filePath: file.path,
        fileName: file.name,
        line: line2,
        column: 8,
        endColumn: 8 + symbolName.length,
        lineContent: `    ${symbolName}.update(newState)`,
        surroundingLines: [
          `  async function handleUpdate() {`,
          `    const newState = computeNext()`,
          `    ${symbolName}.update(newState)`,
          `    await saveChanges()`,
          `  }`,
        ],
        surroundingStartLine: Math.max(1, line2 - 2),
        kind: 'write',
      })
    }
  }

  return refs
}

function generateMockCallHierarchy(
  name: string,
  direction: CallHierarchyDirection
): CallHierarchyItem[] {
  if (direction === 'incoming') {
    return [
      {
        id: nextCallId(), name: 'handleClick', kind: 'function',
        filePath: '/src/components/App.tsx', fileName: 'App.tsx',
        line: 42, column: 8, detail: 'App.tsx',
      },
      {
        id: nextCallId(), name: 'useEffect callback', kind: 'function',
        filePath: '/src/hooks/useAuth.ts', fileName: 'useAuth.ts',
        line: 17, column: 4, detail: 'useAuth.ts',
      },
      {
        id: nextCallId(), name: 'initialize', kind: 'method',
        filePath: '/src/store/editor.ts', fileName: 'editor.ts',
        line: 88, column: 6, detail: 'EditorStore',
      },
      {
        id: nextCallId(), name: 'processQueue', kind: 'function',
        filePath: '/src/utils/queue.ts', fileName: 'queue.ts',
        line: 31, column: 2, detail: 'queue.ts',
      },
    ]
  } else {
    return [
      {
        id: nextCallId(), name: 'validateInput', kind: 'function',
        filePath: '/src/utils/validation.ts', fileName: 'validation.ts',
        line: 12, column: 2, detail: 'validation.ts',
      },
      {
        id: nextCallId(), name: 'fetchData', kind: 'function',
        filePath: '/src/api/client.ts', fileName: 'client.ts',
        line: 55, column: 8, detail: 'client.ts',
      },
      {
        id: nextCallId(), name: 'setState', kind: 'method',
        filePath: '/src/store/editor.ts', fileName: 'editor.ts',
        line: 102, column: 4, detail: 'EditorStore',
      },
    ]
  }
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function ProgressBar({ progress, loading }: { progress: number; loading: boolean }) {
  if (!loading) return null
  return (
    <div style={progressBarContainerStyle}>
      <div style={{
        height: '100%',
        background: 'var(--accent)',
        width: `${Math.max(progress, 5)}%`,
        transition: 'width 0.3s ease',
        borderRadius: 1,
      }} />
    </div>
  )
}

function KindBadge({ kind }: { kind: ReferenceKind }) {
  if (kind === 'read') return <span style={readBadge} title="Read reference">R</span>
  if (kind === 'write') return <span style={writeBadge} title="Write reference">W</span>
  return null
}

function FileBreadcrumbs({ filePath }: { filePath: string }) {
  const segments = buildBreadcrumbs(filePath)
  return (
    <div style={breadcrumbStyle}>
      <FolderOpen size={10} style={{ flexShrink: 0, opacity: 0.6 }} />
      {segments.map((seg, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {i > 0 && <ChevronRight size={8} style={{ opacity: 0.4 }} />}
          <span style={{
            color: i === segments.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: i === segments.length - 1 ? 500 : 400,
          }}>{seg}</span>
        </span>
      ))}
    </div>
  )
}

function HighlightedCode({
  content, symbolName, style: extraStyle,
}: {
  content: string; symbolName: string; style?: React.CSSProperties
}) {
  if (!symbolName) {
    return <span style={{ ...codePreviewStyle, ...extraStyle }}>{content}</span>
  }

  const parts: React.ReactNode[] = []
  const regex = new RegExp(`(${symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    parts.push(
      <span key={match.index} style={{
        background: 'rgba(255,213,79,0.25)',
        borderRadius: 2,
        padding: '0 1px',
        color: '#ffd54f',
        fontWeight: 600,
      }}>
        {match[1]}
      </span>
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return <span style={{ ...codePreviewStyle, ...extraStyle }}>{parts}</span>
}

function PeekView({
  reference, symbolName,
}: {
  reference: Reference; symbolName: string
}) {
  return (
    <div style={peekBoxStyle}>
      {reference.surroundingLines.map((line, i) => {
        const lineNum = reference.surroundingStartLine + i
        const isCurrent = lineNum === reference.line
        return (
          <div key={i} style={{
            display: 'flex', gap: 8,
            background: isCurrent ? 'rgba(88,166,255,0.08)' : 'transparent',
            marginLeft: -8, marginRight: -8, paddingLeft: 8, paddingRight: 8,
          }}>
            <span style={{
              ...lineNumberStyle,
              fontSize: 10,
              minWidth: 28,
              color: isCurrent ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              {lineNum}
            </span>
            <HighlightedCode
              content={line}
              symbolName={isCurrent ? symbolName : ''}
              style={{ whiteSpace: 'pre', overflow: 'visible', fontSize: 11 }}
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── References View ─────────────────────────────────────────────────────────

function ReferencesView({
  searchResults, activeResultId, onSetActiveResult,
  onRemoveResult, onPinResult, onClearResults,
}: {
  searchResults: SearchResult[]
  activeResultId: string | null
  onSetActiveResult: (id: string) => void
  onRemoveResult: (id: string) => void
  onPinResult: (id: string) => void
  onClearResults: () => void
}) {
  const { openFile } = useEditorStore()
  const rootPath = useFileStore((s) => s.rootPath)

  const [filterText, setFilterText] = useState('')
  const [showReads, setShowReads] = useState(true)
  const [showWrites, setShowWrites] = useState(true)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [peekRefId, setPeekRefId] = useState<string | null>(null)
  const [activeRefIndex, setActiveRefIndex] = useState(-1)
  const [removedRefs, setRemovedRefs] = useState<Set<string>>(new Set())
  const [contextMenuRef, setContextMenuRef] = useState<{
    x: number; y: number; ref: Reference
  } | null>(null)

  const resultsRef = useRef<HTMLDivElement>(null)
  const filterInputRef = useRef<HTMLInputElement>(null)

  const activeResult = useMemo(
    () => searchResults.find(r => r.id === activeResultId) || null,
    [searchResults, activeResultId]
  )

  // Filter references
  const filteredRefs = useMemo(() => {
    if (!activeResult) return []
    let refs = activeResult.references.filter(r => !r.removed && !removedRefs.has(r.id))

    if (!showReads) refs = refs.filter(r => r.kind !== 'read')
    if (!showWrites) refs = refs.filter(r => r.kind !== 'write')

    if (filterText.trim()) {
      const lower = filterText.toLowerCase()
      refs = refs.filter(r =>
        r.fileName.toLowerCase().includes(lower) ||
        r.lineContent.toLowerCase().includes(lower) ||
        r.filePath.toLowerCase().includes(lower)
      )
    }

    return refs
  }, [activeResult, showReads, showWrites, filterText, removedRefs])

  // Group by file
  const fileGroups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, Reference[]>()
    for (const ref of filteredRefs) {
      const list = map.get(ref.filePath)
      if (list) list.push(ref)
      else map.set(ref.filePath, [ref])
    }
    return Array.from(map.entries()).map(([filePath, refs]) => {
      const normalized = filePath.replace(/\\/g, '/')
      const parts = normalized.split('/')
      const fileName = parts.pop() || filePath
      const dirPath = parts.length > 2 ? '.../' + parts.slice(-2).join('/') : parts.join('/')
      return {
        filePath,
        fileName,
        dirPath,
        references: refs.sort((a, b) => a.line - b.line),
        readCount: refs.filter(r => r.kind === 'read').length,
        writeCount: refs.filter(r => r.kind === 'write').length,
      }
    })
  }, [filteredRefs])

  // Flat list for keyboard navigation
  const flatRefs = useMemo(() => {
    const flat: Reference[] = []
    for (const group of fileGroups) {
      if (!collapsedFiles.has(group.filePath)) {
        flat.push(...group.references)
      }
    }
    return flat
  }, [fileGroups, collapsedFiles])

  // Navigate to reference location
  const navigateToRef = useCallback(async (ref: Reference) => {
    const editorState = useEditorStore.getState()
    const existing = editorState.openFiles.find(f => f.path === ref.filePath)

    if (existing) {
      editorState.setActiveFile(ref.filePath)
    } else {
      try {
        const result = await window.api?.readFile(ref.filePath)
        if (result) {
          openFile({
            path: ref.filePath,
            name: ref.fileName,
            content: result.content,
            language: ref.fileName.split('.').pop() || 'text',
          })
        }
      } catch {
        // File may not exist in mock environment
        openFile({
          path: ref.filePath,
          name: ref.fileName,
          content: `// Mock content for ${ref.fileName}`,
          language: ref.fileName.split('.').pop() || 'text',
        })
      }
    }

    // Dispatch cursor position event
    window.dispatchEvent(new CustomEvent('orion:goto-line', {
      detail: { line: ref.line, column: ref.column },
    }))
  }, [openFile])

  // Keyboard navigation (F4 / Shift+F4 / ArrowUp / ArrowDown)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!activeResult) return

      if (e.key === 'F4' || (e.key === 'ArrowDown' && e.altKey) || (e.key === 'ArrowUp' && e.altKey)) {
        e.preventDefault()
        const isBackward = e.shiftKey || (e.key === 'ArrowUp' && e.altKey)

        setActiveRefIndex(prev => {
          if (flatRefs.length === 0) return -1
          let next: number
          if (isBackward) {
            next = prev <= 0 ? flatRefs.length - 1 : prev - 1
          } else {
            next = prev >= flatRefs.length - 1 ? 0 : prev + 1
          }
          const ref = flatRefs[next]
          if (ref) navigateToRef(ref)
          return next
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeResult, flatRefs, navigateToRef])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenuRef) return
    const handler = () => setContextMenuRef(null)
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenuRef])

  const toggleFileGroup = useCallback((filePath: string) => {
    setCollapsedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    setCollapsedFiles(new Set(fileGroups.map(g => g.filePath)))
  }, [fileGroups])

  const expandAll = useCallback(() => {
    setCollapsedFiles(new Set())
  }, [])

  const removeRef = useCallback((refId: string) => {
    setRemovedRefs(prev => new Set(prev).add(refId))
  }, [])

  const copyAllReferences = useCallback(() => {
    if (!activeResult) return
    const lines: string[] = []
    lines.push(`References for "${activeResult.symbolName}" (${filteredRefs.length} references)`)
    lines.push('')

    for (const group of fileGroups) {
      lines.push(`${group.filePath} (${group.references.length})`)
      for (const ref of group.references) {
        lines.push(`  Line ${ref.line}: ${ref.lineContent.trim()}`)
      }
      lines.push('')
    }

    navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
  }, [activeResult, filteredRefs, fileGroups])

  const totalRefCount = activeResult
    ? activeResult.references.filter(r => !r.removed && !removedRefs.has(r.id)).length
    : 0

  const readCount = filteredRefs.filter(r => r.kind === 'read').length
  const writeCount = filteredRefs.filter(r => r.kind === 'write').length

  // ── No active result ──
  if (!activeResult) {
    return (
      <div style={emptyStateStyle}>
        <Search size={32} style={{ opacity: 0.3 }} />
        <span style={{ fontSize: 13 }}>No references to show</span>
        <span style={{ fontSize: 11, opacity: 0.6 }}>
          Use "Find All References" from the editor context menu
        </span>
      </div>
    )
  }

  // ── Loading state ──
  if (activeResult.loading) {
    return (
      <div style={{ ...panelStyle }}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 12 }}>
              Finding references for "{activeResult.symbolName}"...
            </span>
          </div>
        </div>
        <ProgressBar progress={activeResult.progress} loading />
        <div style={emptyStateStyle}>
          <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} />
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            Searching {activeResult.progress}%...
          </span>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── No references found ──
  if (totalRefCount === 0) {
    return (
      <div style={{ ...panelStyle }}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <MapPin size={14} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600, fontSize: 12 }}>
              "{activeResult.symbolName}"
            </span>
          </div>
        </div>
        <div style={emptyStateStyle}>
          <Search size={32} style={{ opacity: 0.3 }} />
          <span style={{ fontSize: 13 }}>No references found</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            The symbol may be unused or defined in an external module
          </span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Multi-result tabs */}
      {searchResults.length > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)', overflow: 'auto',
          flexShrink: 0,
        }}>
          {searchResults.map(sr => (
            <button
              key={sr.id}
              style={sr.id === activeResultId ? resultTabActiveStyle : resultTabStyle}
              onClick={() => onSetActiveResult(sr.id)}
              title={`${sr.symbolName} (${sr.references.length} refs)`}
            >
              {sr.pinned && <Pin size={9} style={{ color: 'var(--accent)' }} />}
              <span>{sr.symbolName}</span>
              <span style={{
                fontSize: 9, opacity: 0.6, background: 'rgba(139,148,158,0.15)',
                padding: '0 3px', borderRadius: 4,
              }}>
                {sr.references.length}
              </span>
              {!sr.pinned && (
                <span
                  style={{ display: 'flex', cursor: 'pointer', opacity: 0.5 }}
                  onClick={(e) => { e.stopPropagation(); onRemoveResult(sr.id) }}
                  title="Close"
                >
                  <X size={10} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <MapPin size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            "{activeResult.symbolName}"
          </span>
          <span style={countBadge}>{totalRefCount} ref{totalRefCount !== 1 ? 's' : ''}</span>
          <span style={{
            fontSize: 10, color: 'var(--text-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            in {fileGroups.length} file{fileGroups.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            style={activeResult.pinned ? iconBtnActiveStyle : iconBtnStyle}
            onClick={() => onPinResult(activeResult.id)}
            title={activeResult.pinned ? 'Unpin results' : 'Pin results'}
          >
            {activeResult.pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </button>
          <button style={iconBtnStyle} onClick={copyAllReferences} title="Copy all references">
            <Copy size={13} />
          </button>
          <button style={iconBtnStyle} onClick={collapseAll} title="Collapse all">
            <ChevronsDownUp size={13} />
          </button>
          <button style={iconBtnStyle} onClick={expandAll} title="Expand all">
            <ChevronsUpDown size={13} />
          </button>
        </div>
      </div>

      {/* Toolbar: filters + search */}
      <div style={toolbarStyle}>
        <input
          ref={filterInputRef}
          type="text"
          placeholder="Filter references..."
          value={filterText}
          onChange={e => setFilterText(e.target.value)}
          style={searchInputStyle}
        />
        {filterText && (
          <button style={iconBtnStyle} onClick={() => setFilterText('')} title="Clear filter">
            <X size={12} />
          </button>
        )}
        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
        <button
          style={showReads ? iconBtnActiveStyle : iconBtnStyle}
          onClick={() => setShowReads(!showReads)}
          title={showReads ? 'Hide read references' : 'Show read references'}
        >
          <Eye size={13} />
          <span style={{ fontSize: 9, marginLeft: 2 }}>{readCount}</span>
        </button>
        <button
          style={showWrites ? iconBtnActiveStyle : iconBtnStyle}
          onClick={() => setShowWrites(!showWrites)}
          title={showWrites ? 'Hide write references' : 'Show write references'}
        >
          <PenLine size={13} />
          <span style={{ fontSize: 9, marginLeft: 2 }}>{writeCount}</span>
        </button>
      </div>

      {/* Filter summary */}
      {(filterText || !showReads || !showWrites) && (
        <div style={{
          padding: '3px 10px', fontSize: 10, color: 'var(--text-muted)',
          background: 'rgba(88,166,255,0.05)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
        }}>
          <Filter size={10} />
          <span>
            Showing {filteredRefs.length} of {totalRefCount} references
            {filterText && <> matching "{filterText}"</>}
            {!showReads && <>, excluding reads</>}
            {!showWrites && <>, excluding writes</>}
          </span>
        </div>
      )}

      {/* Results list */}
      <div ref={resultsRef} style={{ flex: 1, overflow: 'auto' }}>
        {fileGroups.map(group => {
          const isCollapsed = collapsedFiles.has(group.filePath)
          return (
            <div key={group.filePath}>
              {/* File group header */}
              <div
                style={{
                  ...fileGroupHeaderStyle,
                }}
                onClick={() => toggleFileGroup(group.filePath)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)' }}
              >
                {isCollapsed
                  ? <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  : <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                }
                <FileText size={12} style={{ color: getFileIconColor(group.fileName), flexShrink: 0 }} />
                <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.fileName}
                </span>
                <FileBreadcrumbs filePath={group.filePath} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                  {group.readCount > 0 && <span style={readBadge}>{group.readCount}R</span>}
                  {group.writeCount > 0 && <span style={writeBadge}>{group.writeCount}W</span>}
                  <span style={countBadge}>{group.references.length}</span>
                </div>
              </div>

              {/* References in this file */}
              {!isCollapsed && group.references.map((ref, refIdx) => {
                const globalIdx = flatRefs.indexOf(ref)
                const isActive = globalIdx === activeRefIndex
                const isPeeking = peekRefId === ref.id

                return (
                  <div key={ref.id}>
                    <div
                      style={{
                        ...referenceRowStyle,
                        background: isActive
                          ? 'rgba(88,166,255,0.12)'
                          : 'transparent',
                      }}
                      onClick={() => {
                        setActiveRefIndex(globalIdx)
                        navigateToRef(ref)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenuRef({ x: e.clientX, y: e.clientY, ref })
                      }}
                      onMouseEnter={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
                      }}
                      onMouseLeave={e => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      <span style={lineNumberStyle}>{ref.line}</span>
                      <KindBadge kind={ref.kind} />
                      <HighlightedCode
                        content={ref.lineContent}
                        symbolName={activeResult.symbolName}
                      />
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0, marginLeft: 'auto' }}>
                        <button
                          style={{ ...iconBtnStyle, padding: 1 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            setPeekRefId(isPeeking ? null : ref.id)
                          }}
                          title={isPeeking ? 'Hide peek' : 'Peek reference'}
                        >
                          <Eye size={11} />
                        </button>
                        <button
                          style={{ ...iconBtnStyle, padding: 1 }}
                          onClick={(e) => {
                            e.stopPropagation()
                            removeRef(ref.id)
                          }}
                          title="Remove from results"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Inline peek view */}
                    {isPeeking && (
                      <PeekView
                        reference={ref}
                        symbolName={activeResult.symbolName}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Filtered empty state */}
        {filteredRefs.length === 0 && totalRefCount > 0 && (
          <div style={{ ...emptyStateStyle, padding: 20 }}>
            <Filter size={20} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 11 }}>No references match the current filter</span>
            <button
              style={{
                ...iconBtnStyle,
                padding: '4px 12px', fontSize: 11,
                border: '1px solid var(--border)', borderRadius: 4,
                color: 'var(--text-primary)',
              }}
              onClick={() => {
                setFilterText('')
                setShowReads(true)
                setShowWrites(true)
              }}
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenuRef && (
        <div style={{
          position: 'fixed', left: contextMenuRef.x, top: contextMenuRef.y,
          background: 'var(--bg-primary)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          zIndex: 9999, padding: '4px 0', minWidth: 180,
        }}>
          {[
            {
              label: 'Go to Reference', icon: <ExternalLink size={12} />,
              action: () => navigateToRef(contextMenuRef.ref),
            },
            {
              label: isPeekActive(contextMenuRef.ref.id) ? 'Hide Peek' : 'Peek Reference',
              icon: <Eye size={12} />,
              action: () => setPeekRefId(
                peekRefId === contextMenuRef.ref.id ? null : contextMenuRef.ref.id
              ),
            },
            { divider: true, label: '', icon: null, action: () => {} },
            {
              label: 'Copy Reference Path',
              icon: <Copy size={12} />,
              action: () => {
                navigator.clipboard.writeText(
                  `${contextMenuRef.ref.filePath}:${contextMenuRef.ref.line}:${contextMenuRef.ref.column}`
                ).catch(() => {})
              },
            },
            {
              label: 'Copy Line Content',
              icon: <Copy size={12} />,
              action: () => {
                navigator.clipboard.writeText(contextMenuRef.ref.lineContent.trim()).catch(() => {})
              },
            },
            { divider: true, label: '', icon: null, action: () => {} },
            {
              label: 'Remove Reference',
              icon: <Trash2 size={12} />,
              action: () => removeRef(contextMenuRef.ref.id),
            },
          ].map((item, i) => {
            if ('divider' in item && item.divider) {
              return <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            }
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 12px', cursor: 'pointer', fontSize: 11,
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                onClick={() => { item.action(); setContextMenuRef(null) }}
              >
                <span style={{ color: 'var(--text-muted)', display: 'flex' }}>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  function isPeekActive(refId: string): boolean {
    return peekRefId === refId
  }
}

// ─── Call Hierarchy View ─────────────────────────────────────────────────────

function CallHierarchyView() {
  const { openFile } = useEditorStore()
  const [direction, setDirection] = useState<CallHierarchyDirection>('incoming')
  const [rootSymbol, setRootSymbol] = useState<string>('handleSubmit')
  const [rootSymbolInput, setRootSymbolInput] = useState<string>('handleSubmit')
  const [hierarchy, setHierarchy] = useState<CallHierarchyItem[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set())

  // Simulate fetching call hierarchy
  const fetchHierarchy = useCallback((symbol: string, dir: CallHierarchyDirection) => {
    setLoading(true)
    setHierarchy([])
    setExpandedNodes(new Set())
    setSelectedNodeId(null)

    // Simulate async loading
    setTimeout(() => {
      setHierarchy(generateMockCallHierarchy(symbol, dir))
      setLoading(false)
    }, 600)
  }, [])

  // Load on mount or when symbol/direction changes
  useEffect(() => {
    if (rootSymbol) {
      fetchHierarchy(rootSymbol, direction)
    }
  }, [rootSymbol, direction, fetchHierarchy])

  const handleSubmitSymbol = useCallback(() => {
    const trimmed = rootSymbolInput.trim()
    if (trimmed) {
      setRootSymbol(trimmed)
    }
  }, [rootSymbolInput])

  const toggleNode = useCallback((nodeId: string, item: CallHierarchyItem) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
        // Simulate lazy-loading children if not loaded yet
        if (!item.children) {
          setLoadingChildren(prev2 => new Set(prev2).add(nodeId))
          setTimeout(() => {
            setHierarchy(prev2 => {
              const updated = [...prev2]
              const addChildren = (items: CallHierarchyItem[]): boolean => {
                for (const it of items) {
                  if (it.id === nodeId) {
                    it.children = generateMockCallHierarchy(it.name, direction).map(child => ({
                      ...child,
                      id: nextCallId(),
                    }))
                    return true
                  }
                  if (it.children && addChildren(it.children)) return true
                }
                return false
              }
              addChildren(updated)
              return updated
            })
            setLoadingChildren(prev2 => {
              const next2 = new Set(prev2)
              next2.delete(nodeId)
              return next2
            })
          }, 400)
        }
      }
      return next
    })
  }, [direction])

  const navigateToCallSite = useCallback(async (item: CallHierarchyItem) => {
    setSelectedNodeId(item.id)
    const editorState = useEditorStore.getState()
    const existing = editorState.openFiles.find(f => f.path === item.filePath)

    if (existing) {
      editorState.setActiveFile(item.filePath)
    } else {
      try {
        const result = await window.api?.readFile(item.filePath)
        if (result) {
          openFile({
            path: item.filePath,
            name: item.fileName,
            content: result.content,
            language: item.fileName.split('.').pop() || 'text',
          })
        }
      } catch {
        openFile({
          path: item.filePath,
          name: item.fileName,
          content: `// Mock content for ${item.fileName}`,
          language: item.fileName.split('.').pop() || 'text',
        })
      }
    }

    window.dispatchEvent(new CustomEvent('orion:goto-line', {
      detail: { line: item.line, column: item.column },
    }))
  }, [openFile])

  const renderCallNode = useCallback((item: CallHierarchyItem, depth: number): React.ReactNode => {
    const isExpanded = expandedNodes.has(item.id)
    const isSelected = selectedNodeId === item.id
    const isLoadingChildren = loadingChildren.has(item.id)
    const kindColor = kindIconColors[item.kind] || 'var(--text-muted)'

    return (
      <div key={item.id}>
        <div
          style={{
            ...callHierarchyNodeStyle,
            paddingLeft: 8 + depth * 16,
            background: isSelected ? 'rgba(88,166,255,0.12)' : 'transparent',
          }}
          onClick={() => navigateToCallSite(item)}
          onMouseEnter={e => {
            if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
          }}
          onMouseLeave={e => {
            if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
          }}
        >
          <span
            style={{ display: 'flex', cursor: 'pointer', flexShrink: 0 }}
            onClick={(e) => {
              e.stopPropagation()
              toggleNode(item.id, item)
            }}
          >
            {isLoadingChildren ? (
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite', color: 'var(--text-muted)' }} />
            ) : isExpanded ? (
              <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} />
            ) : (
              <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />
            )}
          </span>
          {direction === 'incoming' ? (
            <CornerUpLeft size={11} style={{ color: '#58a6ff', flexShrink: 0, opacity: 0.7 }} />
          ) : (
            <CornerDownRight size={11} style={{ color: '#f97583', flexShrink: 0, opacity: 0.7 }} />
          )}
          <span style={{
            color: kindColor, fontFamily: 'var(--font-mono)',
            fontSize: 11, fontWeight: 500,
          }}>
            {item.name}
          </span>
          <span style={{
            color: 'var(--text-muted)', fontSize: 10, marginLeft: 4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {item.detail || item.fileName}
          </span>
          <span style={{
            marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)', flexShrink: 0,
          }}>
            :{item.line}
          </span>
        </div>

        {isExpanded && item.children && (
          <div>
            {item.children.map(child => renderCallNode(child, depth + 1))}
          </div>
        )}

        {isExpanded && !item.children && !isLoadingChildren && (
          <div style={{
            paddingLeft: 24 + depth * 16,
            color: 'var(--text-muted)', fontSize: 10,
            padding: '4px 8px 4px ' + (24 + depth * 16) + 'px',
            fontStyle: 'italic',
          }}>
            No {direction === 'incoming' ? 'callers' : 'callees'} found
          </div>
        )}
      </div>
    )
  }, [expandedNodes, selectedNodeId, loadingChildren, direction, toggleNode, navigateToCallSite])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Symbol input */}
      <div style={toolbarStyle}>
        <input
          type="text"
          placeholder="Enter function name..."
          value={rootSymbolInput}
          onChange={e => setRootSymbolInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmitSymbol() }}
          style={searchInputStyle}
        />
        <button
          style={{ ...iconBtnStyle, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 4 }}
          onClick={handleSubmitSymbol}
          title="Search call hierarchy"
        >
          <Search size={12} />
        </button>
        <button
          style={{ ...iconBtnStyle, padding: '3px 8px', border: '1px solid var(--border)', borderRadius: 4 }}
          onClick={() => fetchHierarchy(rootSymbol, direction)}
          title="Refresh"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Direction toggle */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        <button
          style={direction === 'incoming' ? tabActiveStyle : tabStyle}
          onClick={() => setDirection('incoming')}
        >
          <PhoneIncoming size={12} />
          Incoming Calls
        </button>
        <button
          style={direction === 'outgoing' ? tabActiveStyle : tabStyle}
          onClick={() => setDirection('outgoing')}
        >
          <PhoneOutgoing size={12} />
          Outgoing Calls
        </button>
      </div>

      {/* Header */}
      <div style={{
        padding: '6px 10px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--bg-tertiary)', flexShrink: 0,
      }}>
        <GitBranch size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {rootSymbol}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {direction === 'incoming' ? 'called by' : 'calls'} {hierarchy.length} function{hierarchy.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ ...emptyStateStyle, padding: 20 }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', opacity: 0.4 }} />
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            Building call hierarchy for "{rootSymbol}"...
          </span>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Empty state */}
      {!loading && hierarchy.length === 0 && (
        <div style={emptyStateStyle}>
          {direction === 'incoming'
            ? <PhoneIncoming size={28} style={{ opacity: 0.3 }} />
            : <PhoneOutgoing size={28} style={{ opacity: 0.3 }} />
          }
          <span style={{ fontSize: 12 }}>No {direction} calls found</span>
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {direction === 'incoming'
              ? 'No functions call this symbol'
              : 'This function does not call other tracked functions'
            }
          </span>
        </div>
      )}

      {/* Hierarchy tree */}
      {!loading && hierarchy.length > 0 && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {hierarchy.map(item => renderCallNode(item, 0))}
        </div>
      )}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

type PanelTab = 'references' | 'callHierarchy'

export default function ReferencesPanel() {
  const [activeTab, setActiveTab] = useState<PanelTab>('references')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [activeResultId, setActiveResultId] = useState<string | null>(null)

  // Listen for "find all references" events from editor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        symbolName: string
        symbolKind?: string
        references?: Reference[]
      } | undefined

      if (!detail) return

      const id = nextSearchId()
      const newResult: SearchResult = {
        id,
        symbolName: detail.symbolName || 'unknown',
        symbolKind: detail.symbolKind || 'symbol',
        timestamp: Date.now(),
        references: detail.references || [],
        pinned: false,
        loading: !detail.references,
        progress: 0,
      }

      setSearchResults(prev => {
        // Remove any non-pinned results to keep things clean (unless user stacked them)
        const pinned = prev.filter(r => r.pinned)
        return [...pinned, newResult]
      })
      setActiveResultId(id)

      // Simulate progressive loading if no references provided
      if (!detail.references) {
        let progress = 0
        const interval = setInterval(() => {
          progress += Math.random() * 25
          if (progress >= 100) {
            progress = 100
            clearInterval(interval)
            const refs = generateMockReferences(detail.symbolName)
            setSearchResults(prev =>
              prev.map(r => r.id === id ? { ...r, loading: false, progress: 100, references: refs } : r)
            )
          } else {
            setSearchResults(prev =>
              prev.map(r => r.id === id ? { ...r, progress } : r)
            )
          }
        }, 200)
      }
    }

    window.addEventListener('orion:find-references', handler)
    return () => window.removeEventListener('orion:find-references', handler)
  }, [])

  // Load demo data on mount if no results
  useEffect(() => {
    if (searchResults.length === 0) {
      const demoSymbols = ['useEditorStore', 'openFile', 'handleSave']
      const demoResults: SearchResult[] = demoSymbols.map(sym => ({
        id: nextSearchId(),
        symbolName: sym,
        symbolKind: 'function',
        timestamp: Date.now(),
        references: generateMockReferences(sym),
        pinned: false,
        loading: false,
        progress: 100,
      }))
      setSearchResults(demoResults)
      setActiveResultId(demoResults[0].id)
    }
  }, [])

  const handleRemoveResult = useCallback((id: string) => {
    setSearchResults(prev => {
      const updated = prev.filter(r => r.id !== id)
      if (activeResultId === id) {
        setActiveResultId(updated.length > 0 ? updated[updated.length - 1].id : null)
      }
      return updated
    })
  }, [activeResultId])

  const handlePinResult = useCallback((id: string) => {
    setSearchResults(prev =>
      prev.map(r => r.id === id ? { ...r, pinned: !r.pinned } : r)
    )
  }, [])

  const handleClearResults = useCallback(() => {
    setSearchResults(prev => prev.filter(r => r.pinned))
    setActiveResultId(prev => {
      const remaining = searchResults.filter(r => r.pinned)
      return remaining.length > 0 ? remaining[0].id : null
    })
  }, [searchResults])

  const handleTriggerDemo = useCallback(() => {
    // Simulate finding references for a new symbol
    const symbols = ['useState', 'useCallback', 'useMemo', 'useEffect', 'useRef', 'fetchData', 'processQueue']
    const sym = symbols[Math.floor(Math.random() * symbols.length)]

    window.dispatchEvent(new CustomEvent('orion:find-references', {
      detail: { symbolName: sym, symbolKind: 'function' },
    }))
  }, [])

  return (
    <div style={panelStyle}>
      {/* Panel tabs: References / Call Hierarchy */}
      <div style={tabBarStyle}>
        <button
          style={activeTab === 'references' ? tabActiveStyle : tabStyle}
          onClick={() => setActiveTab('references')}
        >
          <BookOpen size={13} />
          References
        </button>
        <button
          style={activeTab === 'callHierarchy' ? tabActiveStyle : tabStyle}
          onClick={() => setActiveTab('callHierarchy')}
        >
          <Layers size={13} />
          Call Hierarchy
        </button>
        <div style={{ flex: 1 }} />
        {activeTab === 'references' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, paddingRight: 6 }}>
            <button
              style={{ ...iconBtnStyle, fontSize: 10, padding: '2px 8px', border: '1px solid var(--border)', borderRadius: 4 }}
              onClick={handleTriggerDemo}
              title="Find references for a symbol (demo)"
            >
              <Plus size={11} />
              <span style={{ marginLeft: 3, fontSize: 10 }}>New</span>
            </button>
            {searchResults.length > 1 && (
              <button
                style={iconBtnStyle}
                onClick={handleClearResults}
                title="Clear unpinned results"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Active view */}
      {activeTab === 'references' && (
        <ReferencesView
          searchResults={searchResults}
          activeResultId={activeResultId}
          onSetActiveResult={setActiveResultId}
          onRemoveResult={handleRemoveResult}
          onPinResult={handlePinResult}
          onClearResults={handleClearResults}
        />
      )}

      {activeTab === 'callHierarchy' && (
        <CallHierarchyView />
      )}

      {/* Spin animation style */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
