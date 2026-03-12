import { useState, useMemo, useRef, useCallback } from 'react'
import { useSnippetStore, type Snippet } from '@/store/snippets'
import {
  X, Plus, Trash2, Edit3, Download, Upload,
  Code, ChevronDown, ChevronRight, Save, Search,
  Eye, Lock, Copy,
} from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
}

const LANGUAGE_OPTIONS = [
  { value: 'global', label: 'Global (all languages)' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'cpp', label: 'C++' },
  { value: 'shell', label: 'Shell/Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'yaml', label: 'YAML' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 4,
  padding: '5px 8px',
  fontSize: 12,
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'var(--font-sans)',
}

const monoInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: "'Cascadia Code', 'Fira Code', monospace",
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-muted)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const smallBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 22,
  color: 'var(--text-muted)',
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
}

/** Render snippet body as a preview, replacing tab-stop syntax with visual hints */
function renderPreview(body: string): string {
  let out = body
  // Replace ${N:placeholder} with the placeholder text styled
  out = out.replace(/\$\{(\d+):([^}]+)\}/g, (_m, _n, placeholder) => placeholder)
  // Replace $N with an empty cursor marker
  out = out.replace(/\$(\d+)/g, (_m, n) => (n === '0' ? '|' : ''))
  // Convert tabs to spaces for display
  out = out.replace(/\t/g, '  ')
  return out
}

/** Highlight tab-stop syntax in the body for the code view */
function highlightBody(body: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Split on tab-stop patterns
  const regex = /(\$\{\d+:[^}]+\}|\$\d+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{body.slice(lastIndex, match.index)}</span>)
    }
    parts.push(
      <span
        key={key++}
        style={{
          color: 'var(--accent)',
          background: 'rgba(var(--accent-rgb, 59,130,246), 0.12)',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {match[0]}
      </span>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < body.length) {
    parts.push(<span key={key++}>{body.slice(lastIndex)}</span>)
  }
  return parts
}

// ── Snippet Form (shared between Create and Edit) ─────────────────────
interface SnippetFormData {
  name: string
  prefix: string
  body: string
  description: string
  language: string
}

function SnippetForm({
  initial,
  onSave,
  onCancel,
  saveLabel,
}: {
  initial: SnippetFormData
  onSave: (data: SnippetFormData) => void
  onCancel: () => void
  saveLabel: string
}) {
  const [data, setData] = useState<SnippetFormData>(initial)
  const [showPreview, setShowPreview] = useState(false)

  const update = (key: keyof SnippetFormData, value: string) =>
    setData((prev) => ({ ...prev, [key]: value }))

  const valid = data.name.trim() && data.prefix.trim() && data.body.trim()

  return (
    <div
      style={{
        padding: '14px 18px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
      }}
    >
      {/* Row 1: name, prefix, language */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Name</label>
          <input
            value={data.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Arrow Function"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Prefix (trigger text)</label>
          <input
            value={data.prefix}
            onChange={(e) => update('prefix', e.target.value)}
            placeholder="e.g. arrow"
            style={monoInputStyle}
          />
        </div>
        <div style={{ width: 160 }}>
          <label style={labelStyle}>Language Scope</label>
          <select
            value={data.language}
            onChange={(e) => update('language', e.target.value)}
            style={{
              ...inputStyle,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
            }}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: description */}
      <div style={{ marginBottom: 8 }}>
        <label style={labelStyle}>Description</label>
        <input
          value={data.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Brief description of what this snippet does"
          style={inputStyle}
        />
      </div>

      {/* Row 3: body with preview toggle */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelStyle}>
            Body (use $1, $2 for tab stops, {'${1:placeholder}'} for defaults, $0 for final cursor)
          </label>
          <button
            onClick={() => setShowPreview(!showPreview)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              fontSize: 10,
              color: showPreview ? 'var(--accent)' : 'var(--text-muted)',
              background: showPreview ? 'var(--bg-active)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            <Eye size={10} /> Preview
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <textarea
            value={data.body}
            onChange={(e) => update('body', e.target.value)}
            placeholder={"e.g. const ${1:name} = (${2:params}) => {\n\t$0\n};"}
            rows={5}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 12,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              outline: 'none',
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              resize: 'vertical',
              lineHeight: 1.5,
              tabSize: 2,
            }}
            onKeyDown={(e) => {
              // Allow tab insertion in textarea
              if (e.key === 'Tab') {
                e.preventDefault()
                const target = e.target as HTMLTextAreaElement
                const start = target.selectionStart
                const end = target.selectionEnd
                const newVal = data.body.slice(0, start) + '\t' + data.body.slice(end)
                update('body', newVal)
                requestAnimationFrame(() => {
                  target.selectionStart = target.selectionEnd = start + 1
                })
              }
            }}
          />
          {showPreview && (
            <div
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 12,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-secondary)',
                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                lineHeight: 1.5,
                whiteSpace: 'pre',
                overflow: 'auto',
                maxHeight: 200,
                tabSize: 2,
              }}
            >
              {renderPreview(data.body)}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 14px',
            fontSize: 11,
            color: 'var(--text-secondary)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => valid && onSave(data)}
          disabled={!valid}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 14px',
            fontSize: 11,
            fontWeight: 600,
            color: '#fff',
            background: valid ? 'var(--accent)' : 'var(--bg-active)',
            border: 'none',
            borderRadius: 4,
            cursor: valid ? 'pointer' : 'not-allowed',
            opacity: valid ? 1 : 0.5,
          }}
        >
          <Save size={11} /> {saveLabel}
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────

export default function SnippetManager({ open, onClose }: Props) {
  const {
    snippets,
    userSnippets,
    createSnippet,
    updateSnippet,
    deleteSnippet,
    importSnippets,
    exportSnippets,
  } = useSnippetStore()

  const [filterLang, setFilterLang] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [collapsedLangs, setCollapsedLangs] = useState<Set<string>>(new Set())
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filteredSnippets = useMemo(() => {
    let result = snippets
    if (filterLang !== 'all') {
      result = result.filter((s) => s.language === filterLang)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.prefix.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
      )
    }
    return result
  }, [snippets, filterLang, searchQuery])

  // Group snippets by language
  const grouped = useMemo(() => {
    const map = new Map<string, Snippet[]>()
    for (const s of filteredSnippets) {
      const lang = s.language
      if (!map.has(lang)) map.set(lang, [])
      map.get(lang)!.push(s)
    }
    // Sort: global first, then alphabetically
    const sorted = new Map(
      [...map.entries()].sort(([a], [b]) => {
        if (a === 'global') return -1
        if (b === 'global') return 1
        return a.localeCompare(b)
      })
    )
    return sorted
  }, [filteredSnippets])

  const selectedSnippet = useMemo(
    () => (selectedSnippetId ? snippets.find((s) => s.id === selectedSnippetId) : null),
    [selectedSnippetId, snippets]
  )

  const toggleLangCollapse = useCallback((lang: string) => {
    setCollapsedLangs((prev) => {
      const next = new Set(prev)
      if (next.has(lang)) next.delete(lang)
      else next.add(lang)
      return next
    })
  }, [])

  const handleAdd = useCallback(
    (data: SnippetFormData) => {
      createSnippet({
        name: data.name.trim(),
        prefix: data.prefix.trim(),
        body: data.body,
        description: data.description.trim() || data.name.trim(),
        language: data.language,
      })
      setShowAddForm(false)
    },
    [createSnippet]
  )

  const handleSaveEdit = useCallback(
    (data: SnippetFormData) => {
      if (!editingId) return
      updateSnippet(editingId, {
        name: data.name.trim(),
        prefix: data.prefix.trim(),
        body: data.body,
        description: data.description.trim() || data.name.trim(),
        language: data.language,
      })
      setEditingId(null)
    },
    [editingId, updateSnippet]
  )

  const handleExport = useCallback(() => {
    const data = exportSnippets()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'orion-snippets.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [exportSnippets])

  const handleImport = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string)
          if (Array.isArray(data)) {
            importSnippets(data)
          }
        } catch {
          /* ignore invalid JSON */
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [importSnippets]
  )

  const langLabel = (lang: string) => {
    const opt = LANGUAGE_OPTIONS.find((o) => o.value === lang)
    return opt ? opt.label : lang.charAt(0).toUpperCase() + lang.slice(1)
  }

  const handleCopyBody = useCallback((body: string) => {
    navigator.clipboard.writeText(body).catch(() => {})
  }, [])

  if (!open) return null

  const builtinCount = snippets.filter((s) => s.isBuiltin).length

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 210,
        background: 'rgba(0,0,0,0.55)',
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
          width: 900,
          maxHeight: '85vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Code size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Snippet Manager
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {snippets.length} total ({builtinCount} built-in, {userSnippets.length} user)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={handleImport}
              title="Import user snippets from JSON"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 5,
                cursor: 'pointer',
              }}
            >
              <Upload size={12} /> Import
            </button>
            <button
              onClick={handleExport}
              title="Export user snippets as JSON"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 5,
                cursor: 'pointer',
              }}
            >
              <Download size={12} /> Export
            </button>
            <button
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
              }}
            >
              <X size={15} />
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Toolbar: search + filter + add */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-primary)',
              borderRadius: 5,
              border: '1px solid var(--border)',
              padding: '0 8px',
            }}
          >
            <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or prefix..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 12,
                color: 'var(--text-primary)',
                padding: '6px 0',
                fontFamily: 'var(--font-sans)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  ...smallBtnStyle,
                  width: 16,
                  height: 16,
                }}
              >
                <X size={10} />
              </button>
            )}
          </div>
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
            style={{
              fontSize: 11,
              padding: '5px 8px',
              background: 'var(--bg-primary)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Languages</option>
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              setShowAddForm(!showAddForm)
              setEditingId(null)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 600,
              color: showAddForm ? 'var(--text-primary)' : '#fff',
              background: showAddForm ? 'var(--bg-tertiary)' : 'var(--accent)',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
            }}
          >
            <Plus size={13} /> New Snippet
          </button>
        </div>

        {/* Add snippet form */}
        {showAddForm && (
          <SnippetForm
            initial={{ name: '', prefix: '', body: '', description: '', language: 'javascript' }}
            onSave={handleAdd}
            onCancel={() => setShowAddForm(false)}
            saveLabel="Create Snippet"
          />
        )}

        {/* Main content: snippet list + preview */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* Snippet list */}
          <div
            style={{
              flex: selectedSnippet ? 1 : 1,
              overflowY: 'auto',
              borderRight: selectedSnippet ? '1px solid var(--border)' : 'none',
            }}
          >
            {grouped.size === 0 ? (
              <div
                style={{
                  padding: '40px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              >
                {searchQuery
                  ? `No snippets matching "${searchQuery}"`
                  : 'No snippets found'}
              </div>
            ) : (
              Array.from(grouped.entries()).map(([lang, langSnippets]) => (
                <div key={lang}>
                  {/* Language group header */}
                  <div
                    onClick={() => toggleLangCollapse(lang)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 18px',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      borderBottom: '1px solid var(--border)',
                      background: 'var(--bg-primary)',
                      userSelect: 'none',
                    }}
                  >
                    {collapsedLangs.has(lang) ? (
                      <ChevronRight size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                    {langLabel(lang)}
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 10,
                        fontWeight: 400,
                        color: 'var(--text-muted)',
                        opacity: 0.7,
                      }}
                    >
                      {langSnippets.length} snippet{langSnippets.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Snippets for this language */}
                  {!collapsedLangs.has(lang) &&
                    langSnippets.map((snippet) => (
                      <div key={snippet.id}>
                        {editingId === snippet.id ? (
                          <SnippetForm
                            initial={{
                              name: snippet.name,
                              prefix: snippet.prefix,
                              body: snippet.body,
                              description: snippet.description,
                              language: snippet.language,
                            }}
                            onSave={handleSaveEdit}
                            onCancel={() => setEditingId(null)}
                            saveLabel="Save Changes"
                          />
                        ) : (
                          /* Snippet row */
                          <div
                            onClick={() =>
                              setSelectedSnippetId(
                                selectedSnippetId === snippet.id ? null : snippet.id
                              )
                            }
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '7px 18px',
                              borderBottom: '1px solid var(--border)',
                              fontSize: 12,
                              cursor: 'pointer',
                              background:
                                selectedSnippetId === snippet.id
                                  ? 'var(--bg-active)'
                                  : 'transparent',
                            }}
                          >
                            <code
                              style={{
                                padding: '2px 8px',
                                fontSize: 11,
                                background: 'var(--bg-active)',
                                borderRadius: 4,
                                color: 'var(--accent)',
                                fontWeight: 600,
                                fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                                flexShrink: 0,
                                minWidth: 60,
                                textAlign: 'center',
                              }}
                            >
                              {snippet.prefix}
                            </code>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  color: 'var(--text-primary)',
                                  fontWeight: 500,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {snippet.name}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: 'var(--text-muted)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {snippet.description}
                              </div>
                            </div>
                            {snippet.isBuiltin ? (
                              <span
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 3,
                                  fontSize: 9,
                                  color: 'var(--text-muted)',
                                  opacity: 0.6,
                                  padding: '1px 6px',
                                  borderRadius: 3,
                                  border: '1px solid var(--border)',
                                  flexShrink: 0,
                                }}
                              >
                                <Lock size={8} /> built-in
                              </span>
                            ) : (
                              <div
                                style={{ display: 'flex', gap: 2, flexShrink: 0 }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    setEditingId(snippet.id)
                                    setShowAddForm(false)
                                  }}
                                  title="Edit snippet"
                                  style={smallBtnStyle}
                                >
                                  <Edit3 size={12} />
                                </button>
                                <button
                                  onClick={() => {
                                    deleteSnippet(snippet.id)
                                    if (selectedSnippetId === snippet.id)
                                      setSelectedSnippetId(null)
                                  }}
                                  title="Delete snippet"
                                  style={smallBtnStyle}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ))
            )}
          </div>

          {/* Preview panel */}
          {selectedSnippet && (
            <div
              style={{
                width: 340,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Preview header */}
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Preview
                </span>
                <button
                  onClick={() => handleCopyBody(selectedSnippet.body)}
                  title="Copy snippet body"
                  style={{
                    ...smallBtnStyle,
                    gap: 4,
                    width: 'auto',
                    padding: '2px 8px',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: 3,
                  }}
                >
                  <Copy size={10} /> Copy
                </button>
              </div>

              {/* Snippet details */}
              <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1 }}>
                <div style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: 2,
                    }}
                  >
                    {selectedSnippet.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {selectedSnippet.description}
                  </div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                    <span>
                      Prefix:{' '}
                      <code
                        style={{
                          color: 'var(--accent)',
                          fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                        }}
                      >
                        {selectedSnippet.prefix}
                      </code>
                    </span>
                    <span>Language: {langLabel(selectedSnippet.language)}</span>
                    {selectedSnippet.isBuiltin && <span>(built-in)</span>}
                  </div>
                </div>

                {/* Body source with syntax highlighting */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      ...labelStyle,
                      marginBottom: 4,
                    }}
                  >
                    Template
                  </div>
                  <pre
                    style={{
                      padding: '8px 10px',
                      fontSize: 11,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                      lineHeight: 1.6,
                      overflow: 'auto',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      tabSize: 2,
                    }}
                  >
                    {highlightBody(selectedSnippet.body)}
                  </pre>
                </div>

                {/* Expanded preview */}
                <div>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>Expanded Output</div>
                  <pre
                    style={{
                      padding: '8px 10px',
                      fontSize: 11,
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-primary)',
                      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                      lineHeight: 1.6,
                      overflow: 'auto',
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      tabSize: 2,
                    }}
                  >
                    {renderPreview(selectedSnippet.body)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '8px 18px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            gap: 16,
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <span>
              <code style={{ color: 'var(--text-secondary)' }}>$1</code>,{' '}
              <code style={{ color: 'var(--text-secondary)' }}>$2</code> tab stops
            </span>
            <span>
              <code style={{ color: 'var(--text-secondary)' }}>{'${1:text}'}</code> placeholder
            </span>
            <span>
              <code style={{ color: 'var(--text-secondary)' }}>$0</code> final cursor
            </span>
          </div>
          <span>VS Code snippet syntax compatible</span>
        </div>
      </div>
    </div>
  )
}
