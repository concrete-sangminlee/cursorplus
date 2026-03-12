import { useState, useCallback, useMemo } from 'react'
import { ChevronRight, ChevronDown, Copy, Search } from 'lucide-react'

// ── Styles ──────────────────────────────────────────────
const colors = {
  string: '#98c379',
  number: '#61afef',
  boolean: '#d19a66',
  null: '#636d83',
  key: '#e5c07b',
  bracket: '#abb2bf',
  count: '#636d83',
}

function getType(val: unknown): string {
  if (val === null) return 'null'
  if (Array.isArray(val)) return 'array'
  return typeof val
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

// ── JsonNode (recursive) ────────────────────────────────
function JsonNode({
  name,
  value,
  path,
  depth,
  defaultExpanded,
  filter,
  onEdit,
}: {
  name: string | number | null
  value: unknown
  path: string
  depth: number
  defaultExpanded: boolean
  filter: string
  onEdit: (path: string, newValue: unknown) => void
}) {
  const [expanded, setExpanded] = useState(defaultExpanded && depth < 2)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [copied, setCopied] = useState(false)
  const [hovered, setHovered] = useState(false)

  const type = getType(value)
  const isExpandable = type === 'object' || type === 'array'

  const entries = useMemo(() => {
    if (!isExpandable) return []
    if (type === 'array') return (value as unknown[]).map((v, i) => ({ key: i, val: v }))
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, val: v }))
  }, [value, type, isExpandable])

  const filteredEntries = useMemo(() => {
    if (!filter) return entries
    return entries.filter(({ key, val }) => {
      const keyStr = String(key).toLowerCase()
      const valStr = JSON.stringify(val).toLowerCase()
      return keyStr.includes(filter) || valStr.includes(filter)
    })
  }, [entries, filter])

  const matchesFilter = !filter ||
    (name !== null && String(name).toLowerCase().includes(filter)) ||
    (!isExpandable && JSON.stringify(value).toLowerCase().includes(filter))

  if (!isExpandable && filter && !matchesFilter) return null

  const handleCopyPath = (e: React.MouseEvent) => {
    e.stopPropagation()
    copyToClipboard(path)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const handleStartEdit = () => {
    if (isExpandable) return
    setEditing(true)
    setEditValue(type === 'string' ? (value as string) : JSON.stringify(value))
  }

  const handleFinishEdit = () => {
    setEditing(false)
    let parsed: unknown = editValue
    if (editValue === 'null') parsed = null
    else if (editValue === 'true') parsed = true
    else if (editValue === 'false') parsed = false
    else if (!isNaN(Number(editValue)) && editValue.trim() !== '') parsed = Number(editValue)
    onEdit(path, parsed)
  }

  const renderValue = () => {
    if (editing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleFinishEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') handleFinishEdit(); if (e.key === 'Escape') setEditing(false) }}
          style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid var(--accent-blue, #58a6ff)',
            borderRadius: 3,
            color: 'var(--text-primary)',
            padding: '1px 4px',
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            outline: 'none',
            minWidth: 60,
          }}
        />
      )
    }
    switch (type) {
      case 'string': return <span style={{ color: colors.string, cursor: 'pointer' }} onClick={handleStartEdit}>"{String(value)}"</span>
      case 'number': return <span style={{ color: colors.number, cursor: 'pointer' }} onClick={handleStartEdit}>{String(value)}</span>
      case 'boolean': return <span style={{ color: colors.boolean, cursor: 'pointer' }} onClick={handleStartEdit}>{String(value)}</span>
      case 'null': return <span style={{ color: colors.null, cursor: 'pointer', fontStyle: 'italic' }} onClick={handleStartEdit}>null</span>
      default: return <span>{String(value)}</span>
    }
  }

  const label = isExpandable
    ? type === 'array'
      ? `[] ${entries.length} item${entries.length !== 1 ? 's' : ''}`
      : `{} ${entries.length} propert${entries.length !== 1 ? 'ies' : 'y'}`
    : null

  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          height: 22,
          fontSize: 12,
          fontFamily: 'var(--font-mono, monospace)',
          cursor: isExpandable ? 'pointer' : 'default',
          background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent',
          borderRadius: 3,
          paddingRight: 4,
        }}
        onClick={() => isExpandable && setExpanded(!expanded)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {isExpandable ? (
          expanded
            ? <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            : <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        {name !== null && (
          <>
            <span style={{ color: colors.key }}>{typeof name === 'number' ? name : `"${name}"`}</span>
            <span style={{ color: colors.bracket, margin: '0 4px' }}>:</span>
          </>
        )}

        {isExpandable ? (
          <span style={{ color: colors.count, fontSize: 11 }}>{label}</span>
        ) : (
          renderValue()
        )}

        {hovered && (
          <button
            onClick={handleCopyPath}
            title={copied ? 'Copied!' : `Copy path: ${path}`}
            style={{
              marginLeft: 8,
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              padding: '1px 4px',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: copied ? 'var(--accent-blue, #58a6ff)' : 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            <Copy size={10} />
            {copied ? 'Copied' : 'Path'}
          </button>
        )}
      </div>

      {isExpandable && expanded && (
        <div>
          {filteredEntries.map(({ key, val }) => {
            const childPath = typeof key === 'number'
              ? `${path}[${key}]`
              : path ? `${path}.${key}` : String(key)
            return (
              <JsonNode
                key={String(key)}
                name={key}
                value={val}
                path={childPath}
                depth={depth + 1}
                defaultExpanded={depth < 1}
                filter={filter}
                onEdit={onEdit}
              />
            )
          })}
          {filter && filteredEntries.length === 0 && (
            <div style={{ marginLeft: 16, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '2px 0' }}>
              No matches
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ──────────────────────────────────────
export default function JsonTreeViewer({
  content,
  onChange,
}: {
  content: string
  onChange?: (newContent: string) => void
}) {
  const [filter, setFilter] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const parsed = useMemo(() => {
    try {
      const result = JSON.parse(content)
      setParseError(null)
      return result
    } catch (e: unknown) {
      setParseError((e as Error).message)
      return null
    }
  }, [content])

  const handleEdit = useCallback((path: string, newValue: unknown) => {
    if (!onChange || parsed === null) return
    try {
      const clone = JSON.parse(JSON.stringify(parsed))
      if (!path) {
        onChange(JSON.stringify(newValue, null, 2))
        return
      }
      // Navigate to parent and set value
      const parts: (string | number)[] = []
      const regex = /\.?([^.[]+)|\[(\d+)\]/g
      let m: RegExpExecArray | null
      while ((m = regex.exec(path)) !== null) {
        parts.push(m[2] !== undefined ? Number(m[2]) : m[1])
      }
      let obj = clone
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i] as keyof typeof obj]
      }
      const lastKey = parts[parts.length - 1]
      obj[lastKey as keyof typeof obj] = newValue
      onChange(JSON.stringify(clone, null, 2))
    } catch { /* ignore edit errors */ }
  }, [parsed, onChange])

  if (parseError) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: 'var(--text-muted)',
        fontSize: 13,
      }}>
        <div style={{ color: '#f85149', marginBottom: 8 }}>Invalid JSON</div>
        <div style={{ fontSize: 11, opacity: 0.7, maxWidth: 400, textAlign: 'center' }}>{parseError}</div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Search bar */}
      <div style={{
        padding: '6px 8px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexShrink: 0,
      }}>
        <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
          placeholder="Filter properties..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: 12,
            fontFamily: 'var(--font-mono, monospace)',
            outline: 'none',
          }}
        />
        {filter && (
          <button
            onClick={() => setFilter('')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 11 }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 8px' }}>
        <JsonNode
          name={null}
          value={parsed}
          path=""
          depth={0}
          defaultExpanded={true}
          filter={filter}
          onEdit={handleEdit}
        />
      </div>
    </div>
  )
}
