import { useState, useMemo, useRef, useCallback } from 'react'
import { useSnippetStore, type Snippet, type VSCodeSnippetFormat } from '@/store/snippets'
import {
  X, Plus, Trash2, Edit3, Download, Upload,
  Code, ChevronDown, ChevronRight, Save, Search,
  Eye, Lock, Copy, FileJson, Info, Zap,
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

/** Tab stop / variable reference items shown in the editor helper panel */
const TAB_STOP_HELP = [
  { syntax: '$1, $2, ...', desc: 'Tab stops (cursor positions in order)' },
  { syntax: '$0', desc: 'Final cursor position after all tab stops' },
  { syntax: '${1:placeholder}', desc: 'Tab stop with default placeholder text' },
  { syntax: '${1|one,two,three|}', desc: 'Tab stop with choice dropdown' },
  { syntax: '${1:nested ${2:inner}}', desc: 'Nested placeholders' },
]

const VARIABLE_HELP = [
  { syntax: '$TM_SELECTED_TEXT', desc: 'Currently selected text' },
  { syntax: '$TM_CURRENT_LINE', desc: 'Contents of the current line' },
  { syntax: '$TM_CURRENT_WORD', desc: 'Word under cursor' },
  { syntax: '$TM_FILENAME', desc: 'Filename of the current document' },
  { syntax: '$TM_FILENAME_BASE', desc: 'Filename without extension' },
  { syntax: '$TM_DIRECTORY', desc: 'Directory of the current document' },
  { syntax: '$TM_FILEPATH', desc: 'Full file path of the current document' },
  { syntax: '$RELATIVE_FILEPATH', desc: 'Relative file path' },
  { syntax: '$CLIPBOARD', desc: 'Contents of the clipboard' },
  { syntax: '$WORKSPACE_NAME', desc: 'Name of the opened workspace' },
  { syntax: '$WORKSPACE_FOLDER', desc: 'Path of the opened workspace' },
  { syntax: '$CURRENT_YEAR', desc: 'Current year (e.g. 2026)' },
  { syntax: '$CURRENT_YEAR_SHORT', desc: 'Current year, last two digits' },
  { syntax: '$CURRENT_MONTH', desc: 'Month as two digits (01-12)' },
  { syntax: '$CURRENT_MONTH_NAME', desc: 'Full month name (e.g. January)' },
  { syntax: '$CURRENT_MONTH_NAME_SHORT', desc: 'Short month name (e.g. Jan)' },
  { syntax: '$CURRENT_DATE', desc: 'Day of month as two digits' },
  { syntax: '$CURRENT_DAY_NAME', desc: 'Day name (e.g. Monday)' },
  { syntax: '$CURRENT_DAY_NAME_SHORT', desc: 'Short day name (e.g. Mon)' },
  { syntax: '$CURRENT_HOUR', desc: 'Current hour (24h format)' },
  { syntax: '$CURRENT_MINUTE', desc: 'Current minute' },
  { syntax: '$CURRENT_SECOND', desc: 'Current second' },
  { syntax: '$RANDOM', desc: 'Six random decimal digits' },
  { syntax: '$RANDOM_HEX', desc: 'Six random hex digits' },
  { syntax: '$UUID', desc: 'UUID v4' },
  { syntax: '$LINE_COMMENT', desc: 'Line comment for current language' },
  { syntax: '$BLOCK_COMMENT_START', desc: 'Block comment start for language' },
  { syntax: '$BLOCK_COMMENT_END', desc: 'Block comment end for language' },
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

const pillBtnStyle: React.CSSProperties = {
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
}

/** Render snippet body as a preview, replacing tab-stop syntax with visual hints */
function renderPreview(body: string): string {
  let out = body
  // Replace ${N:placeholder} with the placeholder text styled
  out = out.replace(/\$\{(\d+):([^}]+)\}/g, (_m, _n, placeholder) => placeholder)
  // Replace ${N|choice1,choice2|} with first choice
  out = out.replace(/\$\{(\d+)\|([^}]+)\|\}/g, (_m, _n, choices) => choices.split(',')[0] || '')
  // Replace $N with an empty cursor marker
  out = out.replace(/\$(\d+)/g, (_m, n) => (n === '0' ? '|' : ''))
  // Replace variable references with example values
  out = out.replace(/\$TM_FILENAME/g, 'example.ts')
  out = out.replace(/\$TM_FILENAME_BASE/g, 'example')
  out = out.replace(/\$CLIPBOARD/g, '<clipboard>')
  out = out.replace(/\$CURRENT_YEAR/g, new Date().getFullYear().toString())
  out = out.replace(/\$CURRENT_MONTH/g, String(new Date().getMonth() + 1).padStart(2, '0'))
  out = out.replace(/\$CURRENT_DATE/g, String(new Date().getDate()).padStart(2, '0'))
  out = out.replace(/\$UUID/g, 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx')
  out = out.replace(/\$\w+/g, '')
  // Convert tabs to spaces for display
  out = out.replace(/\t/g, '  ')
  return out
}

/** Highlight tab-stop syntax in the body for the code view */
function highlightBody(body: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  // Split on tab-stop patterns and variable references
  const regex = /(\$\{\d+\|[^}]+\|\}|\$\{\d+:[^}]+\}|\$\d+|\$[A-Z_]+)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{body.slice(lastIndex, match.index)}</span>)
    }
    const isVariable = /^\$[A-Z_]+$/.test(match[0])
    parts.push(
      <span
        key={key++}
        style={{
          color: isVariable ? 'var(--text-warning, #e5a84b)' : 'var(--accent)',
          background: isVariable
            ? 'rgba(229, 168, 75, 0.1)'
            : 'rgba(var(--accent-rgb, 59,130,246), 0.12)',
          borderRadius: 2,
          padding: '0 2px',
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
  const [showHelp, setShowHelp] = useState(false)
  const [helpTab, setHelpTab] = useState<'tabstops' | 'variables'>('tabstops')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const update = (key: keyof SnippetFormData, value: string) =>
    setData((prev) => ({ ...prev, [key]: value }))

  const valid = data.name.trim() && data.prefix.trim() && data.body.trim()

  /** Insert text at the current cursor position in the body textarea */
  const insertAtCursor = useCallback((text: string) => {
    const ta = bodyRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const newBody = data.body.slice(0, start) + text + data.body.slice(end)
    setData((prev) => ({ ...prev, body: newBody }))
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = start + text.length
    })
  }, [data.body])

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

      {/* Row 3: body with preview toggle + help toggle */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelStyle}>
            Body (use $1, $2 for tab stops, {'${1:placeholder}'} for defaults, $0 for final cursor)
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => { setShowHelp(!showHelp); if (showHelp) setShowPreview(false) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                fontSize: 10,
                color: showHelp ? 'var(--accent)' : 'var(--text-muted)',
                background: showHelp ? 'var(--bg-active)' : 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              <Info size={10} /> Reference
            </button>
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
        </div>

        {/* Reference helper panel */}
        {showHelp && (
          <div
            style={{
              marginTop: 4,
              marginBottom: 6,
              border: '1px solid var(--border)',
              borderRadius: 4,
              background: 'var(--bg-primary)',
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              <button
                onClick={() => setHelpTab('tabstops')}
                style={{
                  flex: 1,
                  padding: '5px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: helpTab === 'tabstops' ? 'var(--accent)' : 'var(--text-muted)',
                  background: helpTab === 'tabstops' ? 'var(--bg-active)' : 'transparent',
                  border: 'none',
                  borderRight: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              >
                Tab Stops
              </button>
              <button
                onClick={() => setHelpTab('variables')}
                style={{
                  flex: 1,
                  padding: '5px 10px',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: helpTab === 'variables' ? 'var(--accent)' : 'var(--text-muted)',
                  background: helpTab === 'variables' ? 'var(--bg-active)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Variables
              </button>
            </div>
            <div
              style={{
                maxHeight: 140,
                overflowY: 'auto',
                padding: '6px 10px',
              }}
            >
              {(helpTab === 'tabstops' ? TAB_STOP_HELP : VARIABLE_HELP).map((item, i) => (
                <div
                  key={i}
                  onClick={() => insertAtCursor(item.syntax)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '3px 4px',
                    cursor: 'pointer',
                    borderRadius: 3,
                    fontSize: 11,
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-active)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <code
                    style={{
                      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                      fontSize: 10,
                      color: helpTab === 'variables' ? 'var(--text-warning, #e5a84b)' : 'var(--accent)',
                      background: 'var(--bg-tertiary)',
                      padding: '1px 6px',
                      borderRadius: 3,
                      flexShrink: 0,
                      minWidth: helpTab === 'variables' ? 180 : 140,
                    }}
                  >
                    {item.syntax}
                  </code>
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <textarea
            ref={bodyRef}
            value={data.body}
            onChange={(e) => update('body', e.target.value)}
            placeholder={"e.g. const ${1:name} = (${2:params}) => {\n\t$0\n};"}
            rows={6}
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

// ── Import/Export Format Selector ─────────────────────────────────────

type ImportFormat = 'orion' | 'vscode'

function ImportFormatDialog({
  onImport,
  onCancel,
}: {
  onImport: (format: ImportFormat) => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 50,
        right: 80,
        zIndex: 220,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-bright)',
        borderRadius: 6,
        boxShadow: 'var(--shadow-xl)',
        padding: 12,
        width: 260,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
        Import Snippets
      </div>
      <button
        onClick={() => onImport('orion')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          fontSize: 11,
          color: 'var(--text-primary)',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
          marginBottom: 6,
          textAlign: 'left',
        }}
      >
        <FileJson size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600 }}>Orion Format</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            Array of snippet objects (Orion export)
          </div>
        </div>
      </button>
      <button
        onClick={() => onImport('vscode')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          fontSize: 11,
          color: 'var(--text-primary)',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Code size={14} style={{ color: 'var(--text-warning, #e5a84b)', flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600 }}>VS Code Format</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            VS Code snippet JSON (e.g. javascript.json)
          </div>
        </div>
      </button>
      <button
        onClick={onCancel}
        style={{
          width: '100%',
          marginTop: 8,
          padding: '4px 8px',
          fontSize: 10,
          color: 'var(--text-muted)',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 3,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
    </div>
  )
}

function ExportFormatDialog({
  onExport,
  onCancel,
}: {
  onExport: (format: 'orion' | 'vscode') => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 50,
        right: 120,
        zIndex: 220,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-bright)',
        borderRadius: 6,
        boxShadow: 'var(--shadow-xl)',
        padding: 12,
        width: 260,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>
        Export Snippets
      </div>
      <button
        onClick={() => onExport('orion')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          fontSize: 11,
          color: 'var(--text-primary)',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
          marginBottom: 6,
          textAlign: 'left',
        }}
      >
        <FileJson size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600 }}>Orion Format</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            Array of snippet objects
          </div>
        </div>
      </button>
      <button
        onClick={() => onExport('vscode')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: '8px 10px',
          fontSize: 11,
          color: 'var(--text-primary)',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Code size={14} style={{ color: 'var(--text-warning, #e5a84b)', flexShrink: 0 }} />
        <div>
          <div style={{ fontWeight: 600 }}>VS Code Format</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            Compatible with VS Code snippet files
          </div>
        </div>
      </button>
      <button
        onClick={onCancel}
        style={{
          width: '100%',
          marginTop: 8,
          padding: '4px 8px',
          fontSize: 10,
          color: 'var(--text-muted)',
          background: 'transparent',
          border: '1px solid var(--border)',
          borderRadius: 3,
          cursor: 'pointer',
        }}
      >
        Cancel
      </button>
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
    importVSCodeSnippets,
    exportSnippets,
    exportVSCodeFormat,
    insertSnippetAtCursor,
  } = useSnippetStore()

  const [filterLang, setFilterLang] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [collapsedLangs, setCollapsedLangs] = useState<Set<string>>(new Set())
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importFormatRef = useRef<ImportFormat>('orion')

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
          s.description.toLowerCase().includes(q) ||
          s.language.toLowerCase().includes(q)
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

  const handleExport = useCallback((format: 'orion' | 'vscode') => {
    let json: string
    let filename: string
    if (format === 'vscode') {
      const data = exportVSCodeFormat()
      json = JSON.stringify(data, null, 2)
      filename = 'snippets.code-snippets'
    } else {
      const data = exportSnippets()
      json = JSON.stringify(data, null, 2)
      filename = 'orion-snippets.json'
    }
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setShowExportDialog(false)
  }, [exportSnippets, exportVSCodeFormat])

  const handleImportClick = useCallback((format: ImportFormat) => {
    importFormatRef.current = format
    setShowImportDialog(false)
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = (ev) => {
        try {
          const raw = ev.target?.result as string
          const data = JSON.parse(raw)

          if (importFormatRef.current === 'vscode') {
            // VS Code format: object with named entries
            if (data && typeof data === 'object' && !Array.isArray(data)) {
              const count = importVSCodeSnippets(data as VSCodeSnippetFormat)
              setImportMsg(`Imported ${count} snippet${count !== 1 ? 's' : ''} from VS Code format`)
              setTimeout(() => setImportMsg(null), 3000)
            } else {
              setImportMsg('Invalid VS Code snippet format (expected JSON object)')
              setTimeout(() => setImportMsg(null), 3000)
            }
          } else {
            // Orion format: array of snippet objects
            if (Array.isArray(data)) {
              importSnippets(data)
              setImportMsg(`Imported ${data.length} snippet${data.length !== 1 ? 's' : ''}`)
              setTimeout(() => setImportMsg(null), 3000)
            } else {
              setImportMsg('Invalid Orion format (expected JSON array)')
              setTimeout(() => setImportMsg(null), 3000)
            }
          }
        } catch {
          setImportMsg('Failed to parse JSON file')
          setTimeout(() => setImportMsg(null), 3000)
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [importSnippets, importVSCodeSnippets]
  )

  /** Double-click handler: insert snippet at editor cursor */
  const handleDoubleClick = useCallback(
    (snippet: Snippet) => {
      insertSnippetAtCursor(snippet)
    },
    [insertSnippetAtCursor]
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
          width: 960,
          maxHeight: '88vh',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
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
              onClick={() => { setShowImportDialog(!showImportDialog); setShowExportDialog(false) }}
              title="Import snippets from JSON"
              style={pillBtnStyle}
            >
              <Upload size={12} /> Import
            </button>
            <button
              onClick={() => { setShowExportDialog(!showExportDialog); setShowImportDialog(false) }}
              title="Export user snippets as JSON"
              style={pillBtnStyle}
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
            accept=".json,.code-snippets"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Import/Export format dialogs */}
        {showImportDialog && (
          <ImportFormatDialog
            onImport={handleImportClick}
            onCancel={() => setShowImportDialog(false)}
          />
        )}
        {showExportDialog && (
          <ExportFormatDialog
            onExport={handleExport}
            onCancel={() => setShowExportDialog(false)}
          />
        )}

        {/* Import status message */}
        {importMsg && (
          <div
            style={{
              padding: '6px 18px',
              fontSize: 11,
              fontWeight: 500,
              color: importMsg.startsWith('Failed') || importMsg.startsWith('Invalid')
                ? 'var(--text-error, #f87171)'
                : 'var(--text-success, #4ade80)',
              background: importMsg.startsWith('Failed') || importMsg.startsWith('Invalid')
                ? 'rgba(248,113,113,0.08)'
                : 'rgba(74,222,128,0.08)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            {importMsg}
          </div>
        )}

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
              placeholder="Search by name, prefix, or language..."
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
                            onDoubleClick={() => handleDoubleClick(snippet)}
                            title="Click to preview, double-click to insert at cursor"
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
                width: 360,
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
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleDoubleClick(selectedSnippet)}
                    title="Insert snippet at editor cursor"
                    style={{
                      ...smallBtnStyle,
                      gap: 4,
                      width: 'auto',
                      padding: '2px 8px',
                      fontSize: 10,
                      color: 'var(--accent)',
                      border: '1px solid var(--accent)',
                      borderRadius: 3,
                    }}
                  >
                    <Zap size={10} /> Insert
                  </button>
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

                {/* Quick insert hint */}
                <div
                  style={{
                    marginTop: 12,
                    padding: '8px 10px',
                    background: 'rgba(var(--accent-rgb, 59,130,246), 0.06)',
                    borderRadius: 4,
                    border: '1px solid rgba(var(--accent-rgb, 59,130,246), 0.15)',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Zap size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <span>
                    <strong style={{ color: 'var(--text-secondary)' }}>Double-click</strong> any snippet
                    to insert at the current editor cursor position, or type{' '}
                    <code
                      style={{
                        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
                        color: 'var(--accent)',
                        background: 'var(--bg-active)',
                        padding: '0 3px',
                        borderRadius: 2,
                      }}
                    >
                      {selectedSnippet.prefix}
                    </code>{' '}
                    in the editor.
                  </span>
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
            <span>
              <code style={{ color: 'var(--text-warning, #e5a84b)' }}>$TM_FILENAME</code> variable
            </span>
          </div>
          <span>VS Code snippet syntax compatible</span>
        </div>
      </div>
    </div>
  )
}
