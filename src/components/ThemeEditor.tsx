import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Palette, Eye, Code, Download, Upload, RotateCcw, Search, Check, Copy,
  Sun, Moon, Monitor, Paintbrush, Contrast, Layers, X, Save, ChevronDown,
  ChevronRight, Trash2, Clock, AlertTriangle, Undo2, Star, Grid3X3,
} from 'lucide-react'
import { useThemeStore } from '@/store/theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface ThemeToken {
  key: string
  value: string
  category: string
  label: string
  description?: string
  inherited?: string
}

type EditorTab = 'visual' | 'json' | 'gallery' | 'palette'
type PreviewTab = 'code' | 'ui' | 'terminal'

interface RecentChange {
  key: string
  oldValue: string
  newValue: string
  timestamp: number
}

interface ContrastPair {
  fg: string
  bg: string
  fgLabel: string
  bgLabel: string
}

// ── Token Data ───────────────────────────────────────────────────────────────

const TOKEN_CATEGORIES: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  editor:    { label: 'Editor',     icon: <Code size={14} />,       description: 'Code editor backgrounds and foreground' },
  sidebar:   { label: 'Sidebar',    icon: <Layers size={14} />,     description: 'File explorer and sidebar panels' },
  terminal:  { label: 'Terminal',   icon: <Monitor size={14} />,    description: 'Integrated terminal ANSI colors' },
  statusbar: { label: 'Status Bar', icon: <Grid3X3 size={14} />,    description: 'Bottom status bar region' },
  accents:   { label: 'Accents',    icon: <Paintbrush size={14} />, description: 'Accent and highlight colors' },
  borders:   { label: 'Borders',    icon: <Grid3X3 size={14} />,    description: 'Border and separator lines' },
  scrollbar: { label: 'Scrollbar',  icon: <Layers size={14} />,     description: 'Scrollbar track and thumb' },
  text:      { label: 'Text',       icon: <Code size={14} />,       description: 'Text and typography colors' },
}

const TOKEN_DEFS: Omit<ThemeToken, 'value'>[] = [
  // Editor
  { key: '--bg-primary',    category: 'editor',    label: 'Background',            description: 'Main editor background color' },
  { key: '--bg-secondary',  category: 'editor',    label: 'Secondary Background',  description: 'Sidebar and panel backgrounds' },
  { key: '--bg-tertiary',   category: 'editor',    label: 'Tertiary Background',   description: 'Activity bar and deep backgrounds' },
  { key: '--bg-hover',      category: 'editor',    label: 'Hover Background',      description: 'Background color on hover states' },
  { key: '--bg-active',     category: 'editor',    label: 'Active Background',     description: 'Background for active/selected items' },
  { key: '--bg-elevated',   category: 'editor',    label: 'Elevated Background',   description: 'Dropdown, popup, and overlay backgrounds' },
  // Sidebar
  { key: '--bg-secondary',  category: 'sidebar',   label: 'Sidebar Background',    description: 'File explorer panel background',     inherited: '--bg-secondary' },
  { key: '--bg-hover',      category: 'sidebar',   label: 'Sidebar Hover',         description: 'Sidebar item hover highlight',       inherited: '--bg-hover' },
  { key: '--bg-active',     category: 'sidebar',   label: 'Sidebar Active',        description: 'Sidebar active item selection',      inherited: '--bg-active' },
  // Terminal
  { key: '--bg-primary',    category: 'terminal',  label: 'Terminal Background',   description: 'Terminal panel background',           inherited: '--bg-primary' },
  { key: '--accent-green',  category: 'terminal',  label: 'Terminal Green',        description: 'ANSI green for success output' },
  { key: '--accent-red',    category: 'terminal',  label: 'Terminal Red',          description: 'ANSI red for error output' },
  { key: '--accent-yellow', category: 'terminal',  label: 'Terminal Yellow',       description: 'ANSI yellow for warnings' },
  { key: '--accent-blue',   category: 'terminal',  label: 'Terminal Blue',         description: 'ANSI blue for information' },
  { key: '--accent-purple', category: 'terminal',  label: 'Terminal Magenta',      description: 'ANSI magenta for special output' },
  { key: '--accent-cyan',   category: 'terminal',  label: 'Terminal Cyan',         description: 'ANSI cyan for highlights' },
  // Status Bar
  { key: '--bg-tertiary',   category: 'statusbar', label: 'Status Bar Background', description: 'Bottom status bar background',       inherited: '--bg-tertiary' },
  { key: '--text-secondary',category: 'statusbar', label: 'Status Bar Text',       description: 'Status bar foreground text',         inherited: '--text-secondary' },
  // Accents
  { key: '--accent',        category: 'accents',   label: 'Primary Accent',        description: 'Primary accent used for buttons and links' },
  { key: '--accent-blue',   category: 'accents',   label: 'Blue',                  description: 'Blue accent for informational elements' },
  { key: '--accent-green',  category: 'accents',   label: 'Green',                 description: 'Green accent for success states' },
  { key: '--accent-orange', category: 'accents',   label: 'Orange',                description: 'Orange accent for warnings' },
  { key: '--accent-red',    category: 'accents',   label: 'Red',                   description: 'Red accent for errors and deletions' },
  { key: '--accent-purple', category: 'accents',   label: 'Purple',                description: 'Purple accent for special elements' },
  { key: '--accent-yellow', category: 'accents',   label: 'Yellow',                description: 'Yellow accent for caution indicators' },
  { key: '--accent-cyan',   category: 'accents',   label: 'Cyan',                  description: 'Cyan accent for secondary highlights' },
  // Borders
  { key: '--border',        category: 'borders',   label: 'Border',                description: 'Default border color for panels and inputs' },
  { key: '--border-bright', category: 'borders',   label: 'Bright Border',         description: 'Prominent borders and dividers' },
  { key: '--border-focus',  category: 'borders',   label: 'Focus Border',          description: 'Border color on focused elements',   inherited: '--accent' },
  // Scrollbar
  { key: '--scrollbar-thumb',category: 'scrollbar', label: 'Scrollbar Thumb',      description: 'Scrollbar drag handle color' },
  { key: '--scrollbar-track',category: 'scrollbar', label: 'Scrollbar Track',      description: 'Scrollbar track background' },
  // Text
  { key: '--text-primary',  category: 'text',      label: 'Primary Text',          description: 'Main body text color' },
  { key: '--text-secondary',category: 'text',      label: 'Secondary Text',        description: 'Less prominent descriptive text' },
  { key: '--text-muted',    category: 'text',      label: 'Muted Text',            description: 'Subtle text for placeholders and line numbers' },
]

const CONTRAST_PAIRS: ContrastPair[] = [
  { fg: '--text-primary',   bg: '--bg-primary',   fgLabel: 'Primary Text',   bgLabel: 'Editor Background' },
  { fg: '--text-secondary', bg: '--bg-primary',   fgLabel: 'Secondary Text', bgLabel: 'Editor Background' },
  { fg: '--text-muted',     bg: '--bg-primary',   fgLabel: 'Muted Text',     bgLabel: 'Editor Background' },
  { fg: '--text-primary',   bg: '--bg-secondary', fgLabel: 'Primary Text',   bgLabel: 'Sidebar Background' },
  { fg: '--text-secondary', bg: '--bg-secondary', fgLabel: 'Secondary Text', bgLabel: 'Sidebar Background' },
  { fg: '--accent',         bg: '--bg-primary',   fgLabel: 'Accent',         bgLabel: 'Editor Background' },
  { fg: '--accent-green',   bg: '--bg-primary',   fgLabel: 'Green',          bgLabel: 'Editor Background' },
  { fg: '--accent-red',     bg: '--bg-primary',   fgLabel: 'Red',            bgLabel: 'Editor Background' },
  { fg: '--accent-purple',  bg: '--bg-primary',   fgLabel: 'Purple',         bgLabel: 'Editor Background' },
]

const SAMPLE_CODE = `import React, { useState, useEffect } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

// Fetch user data from the REST API
async function fetchUser(id: number): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`);
  if (!response.ok) {
    throw new Error('Failed to fetch user');
  }
  return response.json();
}

export default function UserCard({ userId }: { userId: number }) {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string>("");

  /* Load user on mount */
  useEffect(() => {
    fetchUser(userId)
      .then(setUser)
      .catch(e => setError(e.message));
  }, [userId]);

  if (error) return <div className="error">{error}</div>;
  if (!user) return <div>Loading...</div>;

  return (
    <div className="card">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
      <span className={user.active ? "badge-ok" : "badge-off"}>
        {user.active ? "Active" : "Inactive"}
      </span>
    </div>
  );
}`

// ── Color Utilities ──────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const m = hex.replace('#', '').match(/^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null
}

function hexToHsl(hex: string) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** Relative luminance per WCAG 2.0 */
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const [rs, gs, bs] = [rgb.r, rgb.g, rgb.b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** WCAG contrast ratio between two hex colors */
function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a), l2 = relativeLuminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

function wcagLevel(r: number): { level: string; color: string } {
  if (r >= 7) return { level: 'AAA', color: '#3fb950' }
  if (r >= 4.5) return { level: 'AA', color: '#58a6ff' }
  if (r >= 3) return { level: 'AA Large', color: '#e3b341' }
  return { level: 'Fail', color: '#f85149' }
}

const isValidHex = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c)

// ── Shared Style Tokens ──────────────────────────────────────────────────────

const S = {
  btn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6,
    backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)',
    cursor: 'pointer', fontSize: 12, fontWeight: 500,
    transition: 'all 0.15s', whiteSpace: 'nowrap' as const,
  },
  btnPrimary: {
    backgroundColor: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)',
  },
  btnDanger: {
    backgroundColor: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)',
  },
  iconBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 6,
    backgroundColor: 'transparent', color: 'var(--text-secondary)',
    cursor: 'pointer', transition: 'all 0.15s',
  },
  smBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, border: 'none', borderRadius: 4,
    backgroundColor: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
  },
  hexInput: {
    width: 80, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4,
    backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
    fontSize: 11, fontFamily: 'monospace', outline: 'none', textAlign: 'center' as const,
  },
  tab: (on: boolean) => ({
    padding: '10px 18px', border: 'none',
    borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent',
    backgroundColor: 'transparent',
    color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 12, fontWeight: on ? 600 : 400,
    display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
  }),
  badge: {
    fontSize: 10, padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace',
  },
  mono: {
    fontFamily: "'Cascadia Code','JetBrains Mono','Fira Code',monospace",
  },
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ThemeEditor() {
  const {
    themes, activeThemeId, setTheme, createCustomTheme, deleteCustomTheme,
    exportTheme, importVSCodeTheme, activeTheme: getActiveTheme,
    setWorkbenchColorOverride, removeWorkbenchColorOverride,
    colorOverrides, clearAllColorOverrides,
  } = useThemeStore()

  const currentTheme = getActiveTheme()

  // ── Local State ────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<EditorTab>('visual')
  const [previewTab, setPreviewTab] = useState<PreviewTab>('code')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    new Set(Object.keys(TOKEN_CATEGORIES))
  )
  const [editingColors, setEditingColors] = useState<Record<string, string>>({})
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [recentChanges, setRecentChanges] = useState<RecentChange[]>([])
  const [showRecent, setShowRecent] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSave, setShowSave] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'dark' | 'light' | 'custom'>('all')
  const [showContrast, setShowContrast] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [selectedGallery, setSelectedGallery] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Helpers ────────────────────────────────────────────────────────────────

  const notify = useCallback((msg: string, ok = true) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, ok })
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])

  /** Merge current theme colors with overrides and in-progress edits */
  const colors = useMemo(() => {
    const c = { ...currentTheme.colors }
    for (const [k, v] of Object.entries(colorOverrides.workbench)) c[k] = v
    for (const [k, v] of Object.entries(editingColors)) c[k] = v
    return c
  }, [currentTheme.colors, colorOverrides.workbench, editingColors])

  /** Build tokens from definitions + current effective colors */
  const allTokens = useMemo<ThemeToken[]>(
    () => TOKEN_DEFS.map(d => ({ ...d, value: colors[d.key] || '#000000' })),
    [colors],
  )

  /** Search-filtered tokens */
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return allTokens
    const q = searchQuery.toLowerCase()
    return allTokens.filter(t =>
      t.label.toLowerCase().includes(q) ||
      t.key.toLowerCase().includes(q) ||
      t.category.includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    )
  }, [allTokens, searchQuery])

  /** Group filtered tokens by category */
  const byCategory = useMemo(() => {
    const g: Record<string, ThemeToken[]> = {}
    for (const t of filtered) {
      if (!g[t.category]) g[t.category] = []
      g[t.category].push(t)
    }
    return g
  }, [filtered])

  /** Unique color palette sorted by luminance */
  const palette = useMemo(() => {
    const u = new Map<string, string[]>()
    for (const [k, v] of Object.entries(colors)) {
      const h = v.toLowerCase()
      if (!u.has(h)) u.set(h, [])
      u.get(h)!.push(k)
    }
    return Array.from(u.entries())
      .map(([hex, keys]) => ({ hex, keys }))
      .sort((a, b) => relativeLuminance(a.hex) - relativeLuminance(b.hex))
  }, [colors])

  /** Gallery list with active filter */
  const galleryThemes = useMemo(() => {
    if (galleryFilter === 'all') return themes
    if (galleryFilter === 'custom') return themes.filter(t => (t as any).isCustom)
    return themes.filter(t => t.type === galleryFilter)
  }, [themes, galleryFilter])

  /** Sync JSON text when switching to JSON tab */
  useEffect(() => {
    if (activeTab === 'json') {
      setJsonText(JSON.stringify(colors, null, 2))
      setJsonError(null)
    }
  }, [activeTab, colors])

  /** Shorthand color lookup */
  const C = useCallback((key: string) => colors[key] || '#888888', [colors])

  // ── Actions ────────────────────────────────────────────────────────────────

  const changeColor = useCallback((key: string, value: string) => {
    const old = colors[key] || '#000000'
    setEditingColors(p => ({ ...p, [key]: value }))
    if (isValidHex(value) && value !== old) {
      setWorkbenchColorOverride(key, value)
      setRecentChanges(p => [
        { key, oldValue: old, newValue: value, timestamp: Date.now() },
        ...p.filter(c => c.key !== key),
      ].slice(0, 50))
    }
  }, [colors, setWorkbenchColorOverride])

  const resetToken = useCallback((key: string) => {
    setEditingColors(p => { const n = { ...p }; delete n[key]; return n })
    removeWorkbenchColorOverride(key)
    notify(`Reset ${key}`)
  }, [removeWorkbenchColorOverride, notify])

  const resetAll = useCallback(() => {
    setEditingColors({})
    clearAllColorOverrides()
    setRecentChanges([])
    notify('All colors reset to theme defaults')
  }, [clearAllColorOverrides, notify])

  const applyJson = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText)
      if (typeof parsed !== 'object' || !parsed) {
        setJsonError('JSON root must be an object with CSS variable keys and hex values.')
        return
      }
      setJsonError(null)
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && isValidHex(v)) {
          setWorkbenchColorOverride(k, v)
        }
      }
      setEditingColors({})
      notify('JSON theme applied successfully')
    } catch {
      setJsonError('Invalid JSON syntax. Please verify your input.')
    }
  }, [jsonText, setWorkbenchColorOverride, notify])

  const doExport = useCallback(() => {
    const json = exportTheme(activeThemeId)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentTheme.name.toLowerCase().replace(/\s+/g, '-')}-theme.json`
    a.click()
    URL.revokeObjectURL(url)
    notify('Theme exported successfully')
  }, [exportTheme, activeThemeId, currentTheme.name, notify])

  const doImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const theme = importVSCodeTheme(reader.result as string)
        setTheme(theme.id)
        notify(`Imported "${theme.name}" successfully`)
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Failed to import theme', false)
      }
    }
    reader.readAsText(file)
    if (fileRef.current) fileRef.current.value = ''
  }, [importVSCodeTheme, setTheme, notify])

  const doSave = useCallback(() => {
    const name = saveName.trim()
    if (!name) return
    const ov: Record<string, string> = {}
    for (const [k, v] of Object.entries({ ...colorOverrides.workbench, ...editingColors })) {
      if (isValidHex(v)) ov[k] = v
    }
    const newTheme = createCustomTheme(activeThemeId, name, ov)
    setTheme(newTheme.id)
    setEditingColors({})
    setSaveName('')
    setShowSave(false)
    notify(`Custom theme "${name}" saved`)
  }, [saveName, colorOverrides.workbench, editingColors, createCustomTheme, activeThemeId, setTheme, notify])

  const copyHex = useCallback((hex: string, id: string) => {
    navigator.clipboard.writeText(hex).then(() => {
      setCopiedKey(id)
      setTimeout(() => setCopiedKey(null), 1500)
    })
  }, [])

  const toggleCat = useCallback((cat: string) => {
    setExpandedCats(p => { const n = new Set(p); n.has(cat) ? n.delete(cat) : n.add(cat); return n })
  }, [])

  // ── Token Row Component ────────────────────────────────────────────────────

  const TokenRow = useCallback(({ token }: { token: ThemeToken }) => {
    const edited = colorOverrides.workbench[token.key] !== undefined ||
                   editingColors[token.key] !== undefined
    const uid = `${token.category}-${token.key}`

    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 16px 8px 32px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: edited ? 'rgba(88,166,255,0.04)' : 'transparent',
          transition: 'background-color 0.1s',
        }}
      >
        {/* Color swatch with edit indicator */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 6,
              backgroundColor: token.value,
              border: '2px solid var(--border-bright)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
          />
          {edited && (
            <div style={{
              position: 'absolute', top: -2, right: -2,
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: 'var(--accent-blue)',
              border: '1.5px solid var(--bg-primary)',
            }} />
          )}
        </div>

        {/* Token info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {token.label}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-muted)', marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {token.description}
            {token.inherited && (
              <span style={{
                ...S.badge, marginLeft: 6,
                color: 'var(--accent-purple)',
                backgroundColor: 'rgba(188,140,255,0.1)',
              }}>
                inherits {token.inherited}
              </span>
            )}
          </div>
        </div>

        {/* Color controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <input
            type="color"
            value={token.value}
            onChange={e => changeColor(token.key, e.target.value)}
            style={{
              width: 28, height: 28, border: 'none', borderRadius: 4,
              cursor: 'pointer', padding: 0, backgroundColor: 'transparent',
            }}
            title="Open color picker"
          />
          <input
            type="text"
            value={editingColors[token.key] ?? token.value}
            spellCheck={false}
            onChange={e => {
              const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value
              setEditingColors(p => ({ ...p, [token.key]: v }))
              if (isValidHex(v)) changeColor(token.key, v)
            }}
            style={{
              ...S.hexInput,
              borderColor: editingColors[token.key] && !isValidHex(editingColors[token.key])
                ? 'var(--accent-red)' : 'var(--border)',
            }}
          />
          <button
            style={S.smBtn}
            onClick={() => copyHex(token.value, uid)}
            title="Copy hex value"
          >
            {copiedKey === uid ? <Check size={12} /> : <Copy size={12} />}
          </button>
          {edited && (
            <button
              style={{ ...S.smBtn, color: 'var(--accent-orange)' }}
              onClick={() => resetToken(token.key)}
              title="Reset to default"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
      </div>
    )
  }, [colorOverrides.workbench, editingColors, copiedKey, changeColor, copyHex, resetToken])

  // ── Visual Editor Tab ──────────────────────────────────────────────────────

  const VisualEditor = () => (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
      }}>
        <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          style={{
            flex: 1, padding: '6px 10px', border: '1px solid var(--border)',
            borderRadius: 6, backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)', fontSize: 12, outline: 'none',
          }}
          placeholder="Search tokens by name, category, or description..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          spellCheck={false}
        />
        {searchQuery && (
          <button style={S.smBtn} onClick={() => setSearchQuery('')}>
            <X size={14} />
          </button>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filtered.length} tokens
        </span>
      </div>

      {/* Token list */}
      <div style={{ overflow: 'auto', flex: 1 }}>
        {Object.entries(TOKEN_CATEGORIES).map(([catKey, catInfo]) => {
          const tokens = byCategory[catKey]
          if (!tokens?.length) return null
          const isOpen = expandedCats.has(catKey)
          return (
            <div key={catKey}>
              <div
                onClick={() => toggleCat(catKey)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px', cursor: 'pointer',
                  backgroundColor: isOpen ? 'var(--bg-elevated)' : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  userSelect: 'none', transition: 'background-color 0.15s',
                }}
              >
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>{catInfo.icon}</span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {catInfo.label}
                </span>
                <span style={{
                  fontSize: 11, color: 'var(--text-muted)',
                  backgroundColor: 'var(--bg-active)',
                  padding: '1px 7px', borderRadius: 10,
                }}>
                  {tokens.length}
                </span>
              </div>
              {isOpen && tokens.map(t => (
                <TokenRow key={`${t.category}-${t.key}`} token={t} />
              ))}
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            <Search size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>No tokens match "{searchQuery}"</div>
          </div>
        )}
      </div>
    </div>
  )

  // ── JSON Editor Tab ────────────────────────────────────────────────────────

  const JsonEditor = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Edit theme colors as JSON. Keys are CSS custom properties, values are hex colors.
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={S.btn} onClick={() => { setJsonText(JSON.stringify(colors, null, 2)); setJsonError(null) }}>
            <RotateCcw size={12} /> Reset
          </button>
          <button style={{ ...S.btn, ...S.btnPrimary }} onClick={applyJson}>
            <Check size={12} /> Apply
          </button>
        </div>
      </div>
      {jsonError && (
        <div style={{
          padding: '8px 16px',
          backgroundColor: 'rgba(248,81,73,0.1)',
          borderBottom: '1px solid var(--accent-red)',
          color: 'var(--accent-red)', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <AlertTriangle size={14} /> {jsonError}
        </div>
      )}
      <textarea
        value={jsonText}
        onChange={e => { setJsonText(e.target.value); setJsonError(null) }}
        spellCheck={false}
        style={{
          flex: 1, padding: 16, border: 'none',
          backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
          ...S.mono, fontSize: 12, lineHeight: 1.6,
          resize: 'none', outline: 'none', tabSize: 2,
        }}
      />
    </div>
  )

  // ── Gallery Tab ────────────────────────────────────────────────────────────

  const Gallery = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
          Browse and activate themes ({galleryThemes.length} available)
        </span>
        {(['all', 'dark', 'light', 'custom'] as const).map(f => (
          <button
            key={f}
            onClick={() => setGalleryFilter(f)}
            style={{
              ...S.btn, padding: '4px 10px', fontSize: 11,
              ...(galleryFilter === f ? S.btnPrimary : {}),
            }}
          >
            {f === 'dark' && <Moon size={11} />}
            {f === 'light' && <Sun size={11} />}
            {f === 'custom' && <Paintbrush size={11} />}
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ overflow: 'auto', flex: 1, padding: 16 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: 12,
        }}>
          {galleryThemes.map(theme => {
            const isActive = theme.id === activeThemeId
            const isSelected = theme.id === selectedGallery
            const isCustom = (theme as any).isCustom
            return (
              <div
                key={theme.id}
                onClick={() => setSelectedGallery(theme.id)}
                onDoubleClick={() => setTheme(theme.id)}
                style={{
                  border: isActive
                    ? '2px solid var(--accent)'
                    : isSelected
                      ? '2px solid var(--accent-purple)'
                      : '2px solid var(--border)',
                  borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                  transition: 'all 0.2s', backgroundColor: 'var(--bg-elevated)',
                }}
              >
                <div style={{ display: 'flex', height: 36 }}>
                  {theme.previewColors.map((c, i) => (
                    <div key={i} style={{ flex: 1, backgroundColor: c }} />
                  ))}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1 }}>{theme.name}</span>
                    {isActive && <Check size={14} style={{ color: 'var(--accent-green)' }} />}
                    {theme.type === 'dark'
                      ? <Moon size={12} style={{ color: 'var(--text-muted)' }} />
                      : <Sun size={12} style={{ color: 'var(--accent-yellow)' }} />
                    }
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    by {theme.author}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {theme.tags.slice(0, 4).map(tag => (
                      <span key={tag} style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        backgroundColor: 'var(--bg-active)', color: 'var(--text-secondary)',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      style={{
                        ...S.btn, flex: 1, justifyContent: 'center',
                        fontSize: 11, padding: '4px 8px',
                        ...(isActive ? { opacity: 0.5, cursor: 'default' } : {}),
                      }}
                      onClick={e => { e.stopPropagation(); if (!isActive) setTheme(theme.id) }}
                    >
                      {isActive ? 'Active' : 'Apply'}
                    </button>
                    {isCustom && (
                      <button
                        style={{ ...S.btn, ...S.btnDanger, fontSize: 11, padding: '4px 8px' }}
                        onClick={e => {
                          e.stopPropagation()
                          deleteCustomTheme(theme.id)
                          notify('Theme deleted')
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        {galleryThemes.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            No themes found for this filter.
          </div>
        )}
      </div>
    </div>
  )

  // ── Palette + Contrast Checker Tab ─────────────────────────────────────────

  const PaletteView = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Color palette ({palette.length} unique colors)
        </span>
        <button style={S.btn} onClick={() => setShowContrast(!showContrast)}>
          <Contrast size={12} /> {showContrast ? 'Hide' : 'Show'} Contrast Checker
        </button>
      </div>
      <div style={{ overflow: 'auto', flex: 1, padding: 16 }}>
        {/* Palette grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 8, marginBottom: showContrast ? 24 : 0,
        }}>
          {palette.map(({ hex, keys }) => {
            const hsl = hexToHsl(hex)
            return (
              <div
                key={hex}
                onClick={() => copyHex(hex, hex)}
                style={{
                  borderRadius: 8, border: '1px solid var(--border)',
                  overflow: 'hidden', cursor: 'pointer',
                  transition: 'transform 0.15s',
                }}
              >
                <div style={{ height: 44, backgroundColor: hex }} />
                <div style={{ padding: '6px 8px', backgroundColor: 'var(--bg-elevated)' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, marginBottom: 1 }}>
                    {copiedKey === hex
                      ? <span style={{ color: 'var(--accent-green)' }}>Copied!</span>
                      : hex
                    }
                  </div>
                  {hsl && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      H:{hsl.h} S:{hsl.s}% L:{hsl.l}%
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {keys.length} token{keys.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* WCAG Contrast checker */}
        {showContrast && (
          <div>
            <h3 style={{
              fontSize: 13, fontWeight: 600, marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Contrast size={16} /> WCAG Contrast Ratios
            </h3>
            <div style={{ display: 'grid', gap: 6 }}>
              {CONTRAST_PAIRS.map((pair, i) => {
                const fg = C(pair.fg), bg = C(pair.bg)
                const ratio = contrastRatio(fg, bg)
                const level = wcagLevel(ratio)
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8,
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-elevated)',
                  }}>
                    <div style={{
                      width: 56, height: 28, borderRadius: 6,
                      backgroundColor: bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: fg,
                      border: '1px solid var(--border)', flexShrink: 0,
                    }}>
                      Aa
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>
                        {pair.fgLabel} <span style={{ color: 'var(--text-muted)' }}>on</span> {pair.bgLabel}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {fg} / {bg}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace' }}>
                        {ratio.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: level.color, letterSpacing: '0.5px' }}>
                        {level.level}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ── Code Preview Pane ──────────────────────────────────────────────────────

  const CodePreview = () => {
    const bg = C('--bg-primary'), fg = C('--text-primary'), mt = C('--text-muted')
    const kw = C('--accent-purple'), str = C('--accent-green'), fn = C('--accent-yellow')
    const tp = C('--accent-cyan'), num = C('--accent-orange')

    const highlight = (line: string): React.ReactNode => {
      // Comments
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('/*') || line.trimStart().startsWith('*')) {
        return <span style={{ color: mt, fontStyle: 'italic' }}>{line}</span>
      }
      // Build token positions
      interface Tok { s: number; e: number; c: string }
      const toks: Tok[] = []
      const scan = (rx: RegExp, c: string) => {
        for (const m of line.matchAll(rx)) toks.push({ s: m.index!, e: m.index! + m[0].length, c })
      }
      scan(/\b(import|from|export|default|function|const|let|var|if|else|return|await|async|throw|new|interface|type|typeof|null)\b/g, kw)
      scan(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, str)
      scan(/\b(React|User|Promise|Error|string|number|boolean|void)\b/g, tp)
      scan(/\b(useState|useEffect|fetch|then|catch|setUser|setError|fetchUser)\b/g, fn)
      scan(/\b(\d+)\b/g, num)

      toks.sort((a, b) => a.s - b.s)
      // Remove overlaps
      const clean: Tok[] = []
      let end = 0
      for (const t of toks) { if (t.s >= end) { clean.push(t); end = t.e } }

      const spans: React.ReactNode[] = []
      let pos = 0
      for (const t of clean) {
        if (t.s > pos) spans.push(<span key={pos} style={{ color: fg }}>{line.slice(pos, t.s)}</span>)
        spans.push(<span key={t.s} style={{ color: t.c }}>{line.slice(t.s, t.e)}</span>)
        pos = t.e
      }
      if (pos < line.length) spans.push(<span key={pos} style={{ color: fg }}>{line.slice(pos)}</span>)
      return spans.length ? <>{spans}</> : <span style={{ color: fg }}>{line}</span>
    }

    const lines = SAMPLE_CODE.split('\n')
    return (
      <div style={{
        flex: 1, overflow: 'auto', backgroundColor: bg,
        ...S.mono, fontSize: 12, padding: '12px 0',
      }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex', minHeight: 20, lineHeight: '20px' }}>
            <span style={{
              width: 36, textAlign: 'right', paddingRight: 12,
              color: mt, userSelect: 'none', flexShrink: 0,
            }}>
              {i + 1}
            </span>
            <span style={{ whiteSpace: 'pre' }}>{highlight(l)}</span>
          </div>
        ))}
      </div>
    )
  }

  // ── UI Preview Pane ────────────────────────────────────────────────────────

  const UIPreview = () => {
    const bg = C('--bg-primary'), bgS = C('--bg-secondary'), bgT = C('--bg-tertiary')
    const bgH = C('--bg-hover'), bgA = C('--bg-active'), bdr = C('--border')
    const txt = C('--text-primary'), txS = C('--text-secondary'), txM = C('--text-muted')
    const acc = C('--accent'), grn = C('--accent-green'), pur = C('--accent-purple')

    const files = [
      'src', '  components', '    App.tsx', '    Header.tsx',
      '  utils', '    helpers.ts', 'package.json', 'tsconfig.json',
    ]

    return (
      <div style={{ flex: 1, overflow: 'auto', backgroundColor: bg }}>
        <div style={{ display: 'flex', height: '100%', minHeight: 300 }}>
          {/* Activity Bar */}
          <div style={{
            width: 34, backgroundColor: bgT, borderRight: `1px solid ${bdr}`,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: 8, gap: 10,
          }}>
            {[acc, txS, txM, txM].map((c, i) => (
              <div key={i} style={{
                width: 18, height: 18, borderRadius: 4,
                backgroundColor: c, opacity: i === 0 ? 1 : 0.4,
              }} />
            ))}
          </div>

          {/* Sidebar */}
          <div style={{
            width: 150, backgroundColor: bgS,
            borderRight: `1px solid ${bdr}`, padding: 8,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: txS,
              textTransform: 'uppercase', letterSpacing: '0.8px',
              marginBottom: 6, padding: '0 4px',
            }}>
              Explorer
            </div>
            {files.map((f, i) => {
              const indent = f.length - f.trimStart().length
              const isActive = i === 2
              return (
                <div key={i} style={{
                  padding: '3px 4px', paddingLeft: 4 + indent * 5,
                  borderRadius: 3, fontSize: 10,
                  color: isActive ? txt : txS,
                  backgroundColor: isActive ? bgA : 'transparent',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {f.trim()}
                </div>
              )
            })}
          </div>

          {/* Editor Area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Tab bar */}
            <div style={{
              display: 'flex', backgroundColor: bgS,
              borderBottom: `1px solid ${bdr}`, height: 30,
            }}>
              {['App.tsx', 'Header.tsx'].map((tab, i) => (
                <div key={i} style={{
                  padding: '0 12px', display: 'flex', alignItems: 'center',
                  fontSize: 10, color: i === 0 ? txt : txM,
                  backgroundColor: i === 0 ? bg : 'transparent',
                  borderRight: `1px solid ${bdr}`,
                  borderBottom: i === 0 ? `2px solid ${acc}` : 'none',
                }}>
                  {tab}
                </div>
              ))}
            </div>
            {/* Code lines placeholder */}
            <div style={{ flex: 1, padding: 10, backgroundColor: bg }}>
              {[1, 2, 3, 4, 5, 6, 7].map(n => (
                <div key={n} style={{ display: 'flex', marginBottom: 2, lineHeight: '18px' }}>
                  <span style={{ width: 24, textAlign: 'right', marginRight: 8, fontSize: 10, color: txM }}>
                    {n}
                  </span>
                  <div style={{
                    height: 10, marginTop: 3, borderRadius: 2,
                    backgroundColor: n === 3 ? bgA : bgH,
                    width: `${35 + Math.sin(n * 2.1) * 25}%`,
                    opacity: 0.5,
                  }} />
                </div>
              ))}
            </div>
            {/* Status bar */}
            <div style={{
              display: 'flex', alignItems: 'center', height: 22,
              backgroundColor: bgT, borderTop: `1px solid ${bdr}`,
              padding: '0 8px', gap: 10, fontSize: 9,
            }}>
              <span style={{ color: acc }}>main</span>
              <span style={{ color: grn }}>0 errors</span>
              <span style={{ color: txM }}>UTF-8</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: txS }}>Ln 3, Col 18</span>
              <span style={{ color: pur }}>TypeScript</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Terminal Preview Pane ──────────────────────────────────────────────────

  const TerminalPreview = () => {
    const bg = C('--bg-primary'), fg = C('--text-primary')
    const g = C('--accent-green'), r = C('--accent-red'), y = C('--accent-yellow')
    const b = C('--accent-blue'), p = C('--accent-purple'), c = C('--accent-cyan')
    const mt = C('--text-muted')

    type Seg = { text: string; color: string }
    const lines: (Seg[] | null)[] = [
      [{ text: 'user@orion', color: g }, { text: ':', color: fg }, { text: '~/project', color: b }, { text: '$ git status', color: fg }],
      [{ text: 'On branch main', color: fg }],
      [{ text: 'Changes to be committed:', color: fg }],
      [{ text: '  modified:   ', color: g }, { text: 'src/App.tsx', color: fg }],
      [{ text: '  new file:   ', color: g }, { text: 'src/ThemeEditor.tsx', color: fg }],
      null,
      [{ text: 'Changes not staged for commit:', color: fg }],
      [{ text: '  modified:   ', color: r }, { text: 'package.json', color: fg }],
      null,
      [{ text: 'user@orion', color: g }, { text: ':', color: fg }, { text: '~/project', color: b }, { text: '$ npm run build', color: fg }],
      null,
      [{ text: '> ', color: mt }, { text: 'orion-ide@1.0.0 build', color: fg }],
      [{ text: '> ', color: mt }, { text: 'tsc && vite build', color: fg }],
      null,
      [{ text: 'vite v5.2.0 ', color: p }, { text: 'building for production...', color: fg }],
      [{ text: '  transforming...', color: y }],
      [{ text: '  \u2713 ', color: g }, { text: '2847 modules transformed.', color: fg }],
      [{ text: '  rendering chunks...', color: c }],
      [{ text: '  \u2713 ', color: g }, { text: 'built in 3.42s', color: fg }],
      null,
      [{ text: 'user@orion', color: g }, { text: ':', color: fg }, { text: '~/project', color: b }, { text: '$ \u2588', color: fg }],
    ]

    return (
      <div style={{
        flex: 1, overflow: 'auto', backgroundColor: bg,
        ...S.mono, fontSize: 12, padding: 12, lineHeight: 1.7,
      }}>
        {lines.map((line, i) => (
          <div key={i} style={{ minHeight: 20 }}>
            {line
              ? line.map((seg, j) => <span key={j} style={{ color: seg.color }}>{seg.text}</span>)
              : '\u00A0'
            }
          </div>
        ))}
      </div>
    )
  }

  // ── Recent Changes Dropdown ────────────────────────────────────────────────

  const RecentPanel = () => {
    if (!showRecent) return null
    return (
      <div style={{
        position: 'absolute', top: 42, right: 0, width: 310, maxHeight: 380,
        overflow: 'auto', backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-bright)', borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)', zIndex: 100,
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, backgroundColor: 'var(--bg-elevated)',
        }}>
          <span style={{ fontWeight: 600, fontSize: 12 }}>Recently Changed</span>
          <button style={S.smBtn} onClick={() => setShowRecent(false)}><X size={14} /></button>
        </div>
        {recentChanges.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No changes yet. Edit a color to track changes here.
          </div>
        ) : (
          recentChanges.map((ch, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 14px', borderBottom: '1px solid var(--border)', fontSize: 11,
            }}>
              <div style={{
                width: 14, height: 14, borderRadius: 3,
                backgroundColor: ch.oldValue, border: '1px solid var(--border)', flexShrink: 0,
              }} />
              <span style={{ color: 'var(--text-muted)' }}>{'\u2192'}</span>
              <div style={{
                width: 14, height: 14, borderRadius: 3,
                backgroundColor: ch.newValue, border: '1px solid var(--border)', flexShrink: 0,
              }} />
              <span style={{
                flex: 1, fontFamily: 'monospace', fontSize: 10,
                color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {ch.key}
              </span>
              <button
                style={{ ...S.smBtn, color: 'var(--accent-orange)' }}
                onClick={() => {
                  changeColor(ch.key, ch.oldValue)
                  setRecentChanges(p => p.filter(x => x !== ch))
                  notify(`Reverted ${ch.key}`)
                }}
                title="Undo this change"
              >
                <Undo2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    )
  }

  // ── Save Custom Theme Dialog ───────────────────────────────────────────────

  const SaveDialog = () => {
    if (!showSave) return null
    return (
      <div
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000,
        }}
        onClick={() => setShowSave(false)}
      >
        <div
          style={{
            width: 420, backgroundColor: 'var(--bg-elevated)',
            borderRadius: 12, border: '1px solid var(--border-bright)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.4)', padding: 24,
          }}
          onClick={e => e.stopPropagation()}
        >
          <h3 style={{
            margin: '0 0 16px', fontSize: 15, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Save size={18} /> Save Custom Theme
          </h3>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            Save your current color customizations as a new theme.
            This creates a copy of "{currentTheme.name}" with your modifications applied.
          </p>
          <input
            type="text"
            placeholder="Enter theme name..."
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSave()}
            autoFocus
            style={{
              width: '100%', padding: '10px 14px',
              border: '1px solid var(--border-bright)', borderRadius: 8,
              backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={S.btn} onClick={() => setShowSave(false)}>Cancel</button>
            <button
              style={{ ...S.btn, ...S.btnPrimary, opacity: saveName.trim() ? 1 : 0.5 }}
              onClick={doSave}
              disabled={!saveName.trim()}
            >
              <Save size={12} /> Save Theme
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main Render ────────────────────────────────────────────────────────────

  const overrideCount = Object.keys(colorOverrides.workbench).length

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13,
      overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Palette size={18} style={{ color: 'var(--accent-purple)' }} />
            Theme Editor
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            Active:
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 4,
              backgroundColor: 'var(--bg-active)', color: 'var(--text-primary)',
              fontWeight: 500,
            }}>
              {currentTheme.type === 'dark' ? <Moon size={10} /> : <Sun size={10} />}
              {currentTheme.name}
            </span>
            {overrideCount > 0 && (
              <span style={{
                ...S.badge,
                color: 'var(--accent-orange)',
                backgroundColor: 'rgba(247,129,102,0.1)',
              }}>
                {overrideCount} override{overrideCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Recent changes button */}
          <div style={{ position: 'relative' }}>
            <button
              style={{
                ...S.iconBtn,
                color: recentChanges.length > 0 ? 'var(--accent-yellow)' : 'var(--text-secondary)',
              }}
              onClick={() => setShowRecent(!showRecent)}
              title="Recent changes"
            >
              <Clock size={15} />
            </button>
            {recentChanges.length > 0 && (
              <div style={{
                position: 'absolute', top: -2, right: -2,
                width: 14, height: 14, borderRadius: '50%',
                backgroundColor: 'var(--accent-yellow)', color: '#000',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {recentChanges.length > 9 ? '9+' : recentChanges.length}
              </div>
            )}
            <RecentPanel />
          </div>

          <button style={S.iconBtn} onClick={resetAll} title="Reset all overrides">
            <RotateCcw size={15} />
          </button>

          <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={doImport} />
          <button style={S.btn} onClick={() => fileRef.current?.click()}>
            <Upload size={12} /> Import
          </button>
          <button style={S.btn} onClick={doExport}>
            <Download size={12} /> Export
          </button>
          <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => setShowSave(true)}>
            <Save size={12} /> Save As...
          </button>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)', padding: '0 16px', flexShrink: 0,
      }}>
        <button style={S.tab(activeTab === 'visual')} onClick={() => setActiveTab('visual')}>
          <Paintbrush size={13} /> Visual Editor
        </button>
        <button style={S.tab(activeTab === 'json')} onClick={() => setActiveTab('json')}>
          <Code size={13} /> JSON Editor
        </button>
        <button style={S.tab(activeTab === 'gallery')} onClick={() => setActiveTab('gallery')}>
          <Star size={13} /> Gallery
        </button>
        <button style={S.tab(activeTab === 'palette')} onClick={() => setActiveTab('palette')}>
          <Palette size={13} /> Palette
        </button>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel: active editor tab */}
        {activeTab === 'visual' && <VisualEditor />}
        {activeTab === 'json' && <JsonEditor />}
        {activeTab === 'gallery' && <Gallery />}
        {activeTab === 'palette' && <PaletteView />}

        {/* Right panel: live preview */}
        <div style={{
          width: 400, flexShrink: 0,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border)',
            backgroundColor: 'var(--bg-secondary)', padding: '0 12px',
          }}>
            <span style={{
              padding: '8px 0', fontSize: 11, fontWeight: 600,
              color: 'var(--text-secondary)', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginRight: 'auto',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Eye size={12} /> Live Preview
            </span>
            {(['code', 'ui', 'terminal'] as const).map(t => (
              <button
                key={t}
                onClick={() => setPreviewTab(t)}
                style={{
                  padding: '8px 12px', border: 'none',
                  borderBottom: previewTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                  backgroundColor: 'transparent',
                  color: previewTab === t ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 11,
                  fontWeight: previewTab === t ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            {previewTab === 'code' && <CodePreview />}
            {previewTab === 'ui' && <UIPreview />}
            {previewTab === 'terminal' && <TerminalPreview />}
          </div>
        </div>
      </div>

      {/* ── Overlays ── */}
      <SaveDialog />
      {toast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20,
          padding: '10px 18px', borderRadius: 8,
          backgroundColor: toast.ok ? 'var(--accent-green)' : 'var(--accent-red)',
          color: '#fff', fontSize: 12, fontWeight: 500, zIndex: 10000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
          animation: 'teSlideIn 0.2s ease',
        }}>
          {toast.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}
      <style>{`
        @keyframes teSlideIn {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
