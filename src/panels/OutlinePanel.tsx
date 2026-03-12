import { useState, useEffect, useMemo } from 'react'
import { useEditorStore } from '@/store/editor'
import { ListTree, ChevronRight, ChevronDown, Hash, Braces, Type, Box, Variable, ArrowDownAZ, ArrowDown01, Search } from 'lucide-react'

interface Symbol {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'const' | 'import' | 'export'
  line: number
  children?: Symbol[]
}

// Simple regex-based symbol extraction (no LSP needed)
function extractSymbols(content: string, language: string): Symbol[] {
  const symbols: Symbol[] = []
  const lines = content.split('\n')

  lines.forEach((line, idx) => {
    const trimmed = line.trim()
    const lineNum = idx + 1

    // Functions
    let match = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
    if (match) { symbols.push({ name: match[1], kind: 'function', line: lineNum }); return }

    // Arrow functions / const functions
    match = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|<)/)
    if (match) { symbols.push({ name: match[1], kind: 'function', line: lineNum }); return }

    // Classes
    match = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/)
    if (match) { symbols.push({ name: match[1], kind: 'class', line: lineNum }); return }

    // Interfaces
    match = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/)
    if (match) { symbols.push({ name: match[1], kind: 'interface', line: lineNum }); return }

    // Type aliases
    match = trimmed.match(/^(?:export\s+)?type\s+(\w+)\s*=/)
    if (match) { symbols.push({ name: match[1], kind: 'type', line: lineNum }); return }

    // Enums
    match = trimmed.match(/^(?:export\s+)?enum\s+(\w+)/)
    if (match) { symbols.push({ name: match[1], kind: 'class', line: lineNum }); return }

    // React components (export default function)
    match = trimmed.match(/^export\s+default\s+function\s+(\w+)/)
    if (match) { symbols.push({ name: match[1], kind: 'function', line: lineNum }); return }

    // Python functions/classes
    if (language === 'python') {
      match = trimmed.match(/^def\s+(\w+)/)
      if (match) { symbols.push({ name: match[1], kind: 'function', line: lineNum }); return }
      match = trimmed.match(/^class\s+(\w+)/)
      if (match) { symbols.push({ name: match[1], kind: 'class', line: lineNum }); return }
    }

    // Constants / variables (top-level only - no leading whitespace in original line)
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      match = trimmed.match(/^(?:export\s+)?const\s+(\w+)\s*[=:]/)
      if (match && !trimmed.includes('=>') && !trimmed.includes('function')) {
        symbols.push({ name: match[1], kind: 'const', line: lineNum })
        return
      }
    }
  })

  return symbols
}

const kindIcons: Record<Symbol['kind'], typeof Hash> = {
  function: Hash,
  class: Box,
  interface: Braces,
  type: Type,
  variable: Variable,
  const: Variable,
  import: Variable,
  export: Variable,
}

const kindColors: Record<Symbol['kind'], string> = {
  function: '#dcdcaa',
  class: '#4ec9b0',
  interface: '#4ec9b0',
  type: '#4ec9b0',
  variable: '#9cdcfe',
  const: '#4fc1ff',
  import: '#c586c0',
  export: '#c586c0',
}

type SortMode = 'position' | 'name'

export default function OutlinePanel() {
  const { openFiles, activeFilePath } = useEditorStore()
  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const [filter, setFilter] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('position')
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['function', 'class', 'interface', 'type', 'variable', 'const']))

  // Extract symbols from the active file
  const symbols = useMemo(() => {
    if (!activeFile?.content) return []
    return extractSymbols(activeFile.content, activeFile.language || 'typescript')
  }, [activeFile?.content, activeFile?.language])

  // Filter symbols
  const filteredSymbols = useMemo(() => {
    if (!filter.trim()) return symbols
    const lower = filter.toLowerCase()
    return symbols.filter((s) => s.name.toLowerCase().includes(lower))
  }, [symbols, filter])

  // Sort symbols
  const sortedSymbols = useMemo(() => {
    const sorted = [...filteredSymbols]
    if (sortMode === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
    // 'position' keeps original order (by line number)
    return sorted
  }, [filteredSymbols, sortMode])

  // Group symbols by kind
  const groupedSymbols = useMemo(() => {
    const groups = new Map<string, Symbol[]>()
    for (const sym of sortedSymbols) {
      const key = sym.kind
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(sym)
    }
    return groups
  }, [sortedSymbols])

  const toggleGroup = (kind: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })
  }

  const goToLine = (line: number) => {
    window.dispatchEvent(
      new CustomEvent('orion:go-to-line', { detail: { line } })
    )
  }

  const groupLabels: Record<string, string> = {
    function: 'Functions',
    class: 'Classes',
    interface: 'Interfaces',
    type: 'Types',
    variable: 'Variables',
    const: 'Constants',
    import: 'Imports',
    export: 'Exports',
  }

  if (!activeFile) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 12,
          padding: 20,
          gap: 8,
        }}
      >
        <ListTree size={32} strokeWidth={1} />
        <span>No file open</span>
        <span style={{ fontSize: 11 }}>Open a file to see its outline</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          userSelect: 'none',
        }}
      >
        <span>Outline</span>
        <button
          onClick={() => setSortMode((m) => (m === 'position' ? 'name' : 'position'))}
          title={sortMode === 'position' ? 'Sort by name' : 'Sort by position'}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 2,
            display: 'flex',
            alignItems: 'center',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--text-primary)' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-muted)' }}
        >
          {sortMode === 'position' ? <ArrowDown01 size={14} /> : <ArrowDownAZ size={14} />}
        </button>
      </div>

      {/* Search/filter input */}
      <div
        style={{
          padding: '6px 8px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-primary)',
            borderRadius: 4,
            border: '1px solid var(--border)',
            padding: '4px 8px',
          }}
        >
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Filter symbols..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Symbol list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
        {sortedSymbols.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: 20,
              gap: 8,
            }}
          >
            <ListTree size={24} strokeWidth={1} />
            <span>No symbols found</span>
          </div>
        ) : (
          Array.from(groupedSymbols.entries()).map(([kind, syms]) => {
            const isExpanded = expandedGroups.has(kind)
            const GroupIcon = kindIcons[kind as Symbol['kind']] || Hash
            return (
              <div key={kind}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(kind)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    width: '100%',
                    padding: '4px 8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    textAlign: 'left',
                    userSelect: 'none',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none' }}
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <GroupIcon size={12} style={{ color: kindColors[kind as Symbol['kind']] || 'var(--text-muted)' }} />
                  <span>{groupLabels[kind] || kind}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10 }}>
                    {syms.length}
                  </span>
                </button>

                {/* Symbol items */}
                {isExpanded &&
                  syms.map((sym, i) => (
                    <SymbolItem key={`${sym.name}-${sym.line}-${i}`} symbol={sym} onClick={() => goToLine(sym.line)} />
                  ))}
              </div>
            )
          })
        )}
      </div>

      {/* Footer with file info */}
      <div
        style={{
          padding: '4px 12px',
          fontSize: 10,
          color: 'var(--text-muted)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        <span>{symbols.length} symbol{symbols.length !== 1 ? 's' : ''}</span>
        <span>{activeFile.name}</span>
      </div>
    </div>
  )
}

function SymbolItem({ symbol, onClick }: { symbol: Symbol; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const Icon = kindIcons[symbol.kind] || Hash
  const color = kindColors[symbol.kind] || 'var(--text-muted)'

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '3px 8px 3px 28px',
        background: hovered ? 'var(--bg-tertiary)' : 'transparent',
        border: 'none',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
        textAlign: 'left',
        userSelect: 'none',
        transition: 'background 0.1s ease',
      }}
    >
      <Icon size={12} style={{ color, flexShrink: 0 }} />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {symbol.name}
      </span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
        :{symbol.line}
      </span>
    </button>
  )
}
