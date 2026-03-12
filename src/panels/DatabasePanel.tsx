import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Database,
  Plus,
  Trash2,
  Edit3,
  Play,
  ChevronRight,
  ChevronDown,
  Table,
  Columns,
  Key,
  Link2,
  Unlink,
  AlertCircle,
  Clock,
  Download,
  Search,
  X,
  Copy,
  RotateCw,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FolderOpen,
  Hash,
  Type,
  Calendar,
  ToggleLeft,
  FileJson,
  FileSpreadsheet,
  Server,
  HardDrive,
  Layers,
  Settings,
  Check,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────── */

type DbEngine = 'postgresql' | 'mysql' | 'sqlite' | 'mongodb'

type ConnectionStatus = 'connected' | 'disconnected' | 'error'

interface ColumnDef {
  name: string
  type: string
  nullable: boolean
  primaryKey: boolean
  defaultValue?: string
  foreignKey?: { table: string; column: string }
}

interface TableDef {
  name: string
  columns: ColumnDef[]
  rowCount: number
  expanded: boolean
}

interface SchemaDef {
  name: string
  tables: TableDef[]
  expanded: boolean
}

interface DatabaseDef {
  name: string
  schemas: SchemaDef[]
  expanded: boolean
}

interface DbConnection {
  id: string
  name: string
  engine: DbEngine
  host: string
  port: number
  user: string
  password: string
  database: string
  status: ConnectionStatus
  databases: DatabaseDef[]
}

interface QueryHistoryEntry {
  id: string
  sql: string
  timestamp: Date
  duration: number
  rowsAffected: number
  error?: string
}

interface QueryResult {
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows: number
  duration: number
}

type SortDir = 'asc' | 'desc'

interface SortConfig {
  column: string
  direction: SortDir
}

type BottomTab = 'results' | 'schema' | 'history'

/* ── Demo data ─────────────────────────────────────────────────── */

const DEMO_COLUMNS_USERS: ColumnDef[] = [
  { name: 'id', type: 'serial', nullable: false, primaryKey: true },
  { name: 'email', type: 'varchar(255)', nullable: false, primaryKey: false },
  { name: 'username', type: 'varchar(100)', nullable: false, primaryKey: false },
  { name: 'password_hash', type: 'varchar(512)', nullable: false, primaryKey: false },
  { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
  { name: 'is_active', type: 'boolean', nullable: false, primaryKey: false, defaultValue: 'true' },
  { name: 'role', type: 'varchar(50)', nullable: true, primaryKey: false, defaultValue: "'user'" },
]

const DEMO_COLUMNS_ORDERS: ColumnDef[] = [
  { name: 'id', type: 'serial', nullable: false, primaryKey: true },
  { name: 'user_id', type: 'integer', nullable: false, primaryKey: false, foreignKey: { table: 'users', column: 'id' } },
  { name: 'total', type: 'numeric(10,2)', nullable: false, primaryKey: false },
  { name: 'status', type: 'varchar(30)', nullable: false, primaryKey: false, defaultValue: "'pending'" },
  { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
  { name: 'shipped_at', type: 'timestamptz', nullable: true, primaryKey: false },
]

const DEMO_COLUMNS_PRODUCTS: ColumnDef[] = [
  { name: 'id', type: 'serial', nullable: false, primaryKey: true },
  { name: 'name', type: 'varchar(200)', nullable: false, primaryKey: false },
  { name: 'sku', type: 'varchar(50)', nullable: false, primaryKey: false },
  { name: 'price', type: 'numeric(10,2)', nullable: false, primaryKey: false },
  { name: 'stock', type: 'integer', nullable: false, primaryKey: false, defaultValue: '0' },
  { name: 'category', type: 'varchar(100)', nullable: true, primaryKey: false },
  { name: 'description', type: 'text', nullable: true, primaryKey: false },
  { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' },
]

const DEMO_COLUMNS_ORDER_ITEMS: ColumnDef[] = [
  { name: 'id', type: 'serial', nullable: false, primaryKey: true },
  { name: 'order_id', type: 'integer', nullable: false, primaryKey: false, foreignKey: { table: 'orders', column: 'id' } },
  { name: 'product_id', type: 'integer', nullable: false, primaryKey: false, foreignKey: { table: 'products', column: 'id' } },
  { name: 'quantity', type: 'integer', nullable: false, primaryKey: false, defaultValue: '1' },
  { name: 'unit_price', type: 'numeric(10,2)', nullable: false, primaryKey: false },
]

function buildDemoConnection(): DbConnection {
  return {
    id: 'conn-1',
    name: 'Production PG',
    engine: 'postgresql',
    host: 'db.example.com',
    port: 5432,
    user: 'admin',
    password: '••••••••',
    database: 'app_production',
    status: 'connected',
    databases: [
      {
        name: 'app_production',
        expanded: true,
        schemas: [
          {
            name: 'public',
            expanded: true,
            tables: [
              { name: 'users', columns: DEMO_COLUMNS_USERS, rowCount: 12458, expanded: false },
              { name: 'orders', columns: DEMO_COLUMNS_ORDERS, rowCount: 87231, expanded: false },
              { name: 'products', columns: DEMO_COLUMNS_PRODUCTS, rowCount: 1543, expanded: false },
              { name: 'order_items', columns: DEMO_COLUMNS_ORDER_ITEMS, rowCount: 214890, expanded: false },
            ],
          },
          {
            name: 'analytics',
            expanded: false,
            tables: [
              { name: 'events', columns: [{ name: 'id', type: 'bigserial', nullable: false, primaryKey: true }, { name: 'event_type', type: 'varchar(100)', nullable: false, primaryKey: false }, { name: 'payload', type: 'jsonb', nullable: true, primaryKey: false }, { name: 'created_at', type: 'timestamptz', nullable: false, primaryKey: false, defaultValue: 'now()' }], rowCount: 3892012, expanded: false },
              { name: 'sessions', columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }, { name: 'user_id', type: 'integer', nullable: true, primaryKey: false }, { name: 'started_at', type: 'timestamptz', nullable: false, primaryKey: false }, { name: 'ended_at', type: 'timestamptz', nullable: true, primaryKey: false }], rowCount: 502341, expanded: false },
            ],
          },
        ],
      },
    ],
  }
}

function buildDemoResults(): QueryResult {
  return {
    columns: ['id', 'email', 'username', 'created_at', 'is_active', 'role'],
    rows: [
      { id: 1, email: 'alice@example.com', username: 'alice', created_at: '2024-01-15 09:23:11', is_active: true, role: 'admin' },
      { id: 2, email: 'bob@corp.io', username: 'bob_dev', created_at: '2024-02-03 14:07:45', is_active: true, role: 'user' },
      { id: 3, email: 'charlie@mail.net', username: 'charlie99', created_at: '2024-02-18 21:55:02', is_active: false, role: 'user' },
      { id: 4, email: 'diana@startup.co', username: 'diana_pm', created_at: '2024-03-01 08:12:33', is_active: true, role: 'moderator' },
      { id: 5, email: 'eve@security.org', username: 'eve_sec', created_at: '2024-03-10 16:40:19', is_active: true, role: 'admin' },
      { id: 6, email: 'frank@design.io', username: 'frankux', created_at: '2024-03-22 11:05:57', is_active: true, role: 'user' },
      { id: 7, email: 'grace@data.com', username: 'grace_ml', created_at: '2024-04-05 07:31:44', is_active: true, role: 'user' },
      { id: 8, email: 'hank@devops.net', username: 'hank_ops', created_at: '2024-04-12 19:48:26', is_active: false, role: 'user' },
      { id: 9, email: 'iris@qa.org', username: 'iris_test', created_at: '2024-04-28 13:22:08', is_active: true, role: 'user' },
      { id: 10, email: 'jack@mobile.dev', username: 'jack_rn', created_at: '2024-05-06 10:15:39', is_active: true, role: 'user' },
    ],
    totalRows: 12458,
    duration: 23,
  }
}

const DEMO_HISTORY: QueryHistoryEntry[] = [
  { id: 'h1', sql: 'SELECT * FROM users LIMIT 10;', timestamp: new Date('2026-03-12T14:22:00'), duration: 23, rowsAffected: 10 },
  { id: 'h2', sql: 'SELECT COUNT(*) FROM orders WHERE status = \'completed\';', timestamp: new Date('2026-03-12T14:18:00'), duration: 145, rowsAffected: 1 },
  { id: 'h3', sql: 'UPDATE products SET stock = stock - 1 WHERE id = 42;', timestamp: new Date('2026-03-12T14:10:00'), duration: 8, rowsAffected: 1 },
  { id: 'h4', sql: 'SELECT u.username, COUNT(o.id) as order_count\nFROM users u\nJOIN orders o ON o.user_id = u.id\nGROUP BY u.username\nORDER BY order_count DESC\nLIMIT 5;', timestamp: new Date('2026-03-12T13:55:00'), duration: 312, rowsAffected: 5 },
  { id: 'h5', sql: 'ALTER TABLE products ADD COLUMN weight_kg numeric(6,2);', timestamp: new Date('2026-03-12T13:40:00'), duration: 18, rowsAffected: 0 },
  { id: 'h6', sql: 'SELECT * FROM nonexistent_table;', timestamp: new Date('2026-03-12T13:30:00'), duration: 2, rowsAffected: 0, error: 'ERROR: relation "nonexistent_table" does not exist' },
]

/* ── Helpers ────────────────────────────────────────────────────── */

const ENGINE_DEFAULTS: Record<DbEngine, { port: number; label: string }> = {
  postgresql: { port: 5432, label: 'PostgreSQL' },
  mysql: { port: 3306, label: 'MySQL' },
  sqlite: { port: 0, label: 'SQLite' },
  mongodb: { port: 27017, label: 'MongoDB' },
}

function statusColor(s: ConnectionStatus): string {
  if (s === 'connected') return '#22c55e'
  if (s === 'error') return '#ef4444'
  return '#71717a'
}

function typeIcon(t: string) {
  const lower = t.toLowerCase()
  if (lower.includes('int') || lower.includes('serial') || lower.includes('numeric') || lower.includes('float') || lower.includes('double') || lower.includes('decimal') || lower.includes('bigint')) return Hash
  if (lower.includes('bool')) return ToggleLeft
  if (lower.includes('timestamp') || lower.includes('date') || lower.includes('time')) return Calendar
  return Type
}

function formatTimestamp(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function exportCSV(columns: string[], rows: Record<string, unknown>[]) {
  const header = columns.join(',')
  const body = rows.map(r => columns.map(c => {
    const v = r[c]
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\n')
  const blob = new Blob([header + '\n' + body], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'query_results.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function exportJSON(rows: Record<string, unknown>[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'query_results.json'
  a.click()
  URL.revokeObjectURL(url)
}

let _nextId = 100

/* ── Component ─────────────────────────────────────────────────── */

export default function DatabasePanel() {
  /* ---- state ---- */
  const [connections, setConnections] = useState<DbConnection[]>([buildDemoConnection()])
  const [activeConnId, setActiveConnId] = useState<string>('conn-1')
  const [sqlText, setSqlText] = useState('SELECT * FROM users LIMIT 10;')
  const [results, setResults] = useState<QueryResult | null>(buildDemoResults())
  const [history, setHistory] = useState<QueryHistoryEntry[]>(DEMO_HISTORY)
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null)
  const [page, setPage] = useState(0)
  const [bottomTab, setBottomTab] = useState<BottomTab>('results')
  const [selectedTable, setSelectedTable] = useState<TableDef | null>(null)
  const [showConnDialog, setShowConnDialog] = useState(false)
  const [editingConn, setEditingConn] = useState<DbConnection | null>(null)
  const [autocompleteItems, setAutocompleteItems] = useState<string[]>([])
  const [acPos, setAcPos] = useState<{ top: number; left: number } | null>(null)
  const [acIndex, setAcIndex] = useState(0)
  const [treeFilter, setTreeFilter] = useState('')

  const sqlRef = useRef<HTMLTextAreaElement>(null)
  const acRef = useRef<HTMLDivElement>(null)
  const PAGE_SIZE = 10

  const activeConn = useMemo(() => connections.find(c => c.id === activeConnId) ?? null, [connections, activeConnId])

  /* ---- all table/column names for autocomplete ---- */
  const allNames = useMemo(() => {
    if (!activeConn) return [] as string[]
    const names: string[] = []
    for (const db of activeConn.databases) {
      for (const schema of db.schemas) {
        for (const table of schema.tables) {
          names.push(table.name)
          for (const col of table.columns) names.push(col.name)
        }
      }
    }
    return [...new Set(names)]
  }, [activeConn])

  /* ---- sorted + paginated rows ---- */
  const sortedRows = useMemo(() => {
    if (!results) return []
    let rows = [...results.rows]
    if (sortConfig) {
      rows.sort((a, b) => {
        const av = a[sortConfig.column]
        const bv = b[sortConfig.column]
        const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true })
        return sortConfig.direction === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [results, sortConfig])

  const pagedRows = useMemo(() => sortedRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [sortedRows, page])
  const totalPages = useMemo(() => Math.ceil(sortedRows.length / PAGE_SIZE), [sortedRows])

  /* ---- tree toggle helpers ---- */
  const toggleDatabase = useCallback((connId: string, dbName: string) => {
    setConnections(prev => prev.map(c => c.id !== connId ? c : {
      ...c,
      databases: c.databases.map(d => d.name !== dbName ? d : { ...d, expanded: !d.expanded }),
    }))
  }, [])

  const toggleSchema = useCallback((connId: string, dbName: string, schemaName: string) => {
    setConnections(prev => prev.map(c => c.id !== connId ? c : {
      ...c,
      databases: c.databases.map(d => d.name !== dbName ? d : {
        ...d,
        schemas: d.schemas.map(s => s.name !== schemaName ? s : { ...s, expanded: !s.expanded }),
      }),
    }))
  }, [])

  const toggleTable = useCallback((connId: string, dbName: string, schemaName: string, tableName: string) => {
    setConnections(prev => prev.map(c => c.id !== connId ? c : {
      ...c,
      databases: c.databases.map(d => d.name !== dbName ? d : {
        ...d,
        schemas: d.schemas.map(s => s.name !== schemaName ? s : {
          ...s,
          tables: s.tables.map(t => t.name !== tableName ? t : { ...t, expanded: !t.expanded }),
        }),
      }),
    }))
  }, [])

  /* ---- execute query (simulated) ---- */
  const executeQuery = useCallback(() => {
    const sql = sqlText.trim()
    if (!sql) return
    const entry: QueryHistoryEntry = {
      id: `h${++_nextId}`,
      sql,
      timestamp: new Date(),
      duration: Math.round(Math.random() * 400 + 5),
      rowsAffected: 0,
    }
    if (sql.toLowerCase().includes('from users')) {
      setResults(buildDemoResults())
      entry.rowsAffected = 10
    } else if (sql.toLowerCase().includes('from orders')) {
      setResults({
        columns: ['id', 'user_id', 'total', 'status', 'created_at'],
        rows: [
          { id: 1001, user_id: 1, total: '129.99', status: 'completed', created_at: '2024-06-01 08:30:00' },
          { id: 1002, user_id: 3, total: '49.50', status: 'pending', created_at: '2024-06-02 12:45:00' },
          { id: 1003, user_id: 1, total: '220.00', status: 'shipped', created_at: '2024-06-03 15:10:00' },
          { id: 1004, user_id: 5, total: '15.99', status: 'completed', created_at: '2024-06-04 09:22:00' },
          { id: 1005, user_id: 2, total: '310.75', status: 'pending', created_at: '2024-06-05 18:00:00' },
        ],
        totalRows: 87231,
        duration: entry.duration,
      })
      entry.rowsAffected = 5
    } else if (sql.toLowerCase().includes('from products')) {
      setResults({
        columns: ['id', 'name', 'sku', 'price', 'stock', 'category'],
        rows: [
          { id: 1, name: 'Wireless Mouse', sku: 'WM-001', price: '29.99', stock: 150, category: 'Electronics' },
          { id: 2, name: 'USB-C Hub', sku: 'HUB-042', price: '49.99', stock: 83, category: 'Electronics' },
          { id: 3, name: 'Standing Desk', sku: 'DSK-100', price: '399.00', stock: 12, category: 'Furniture' },
          { id: 4, name: 'Noise-Cancel Headphones', sku: 'NC-200', price: '199.99', stock: 67, category: 'Audio' },
          { id: 5, name: 'Mechanical Keyboard', sku: 'KB-MX1', price: '89.99', stock: 210, category: 'Electronics' },
          { id: 6, name: 'Monitor Arm', sku: 'ARM-77', price: '59.00', stock: 44, category: 'Accessories' },
        ],
        totalRows: 1543,
        duration: entry.duration,
      })
      entry.rowsAffected = 6
    } else {
      entry.error = 'Simulated: only queries on users/orders/products return demo data'
      setResults(null)
    }
    setHistory(prev => [entry, ...prev])
    setPage(0)
    setSortConfig(null)
    setBottomTab('results')
  }, [sqlText])

  /* ---- autocomplete logic ---- */
  const handleSqlKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (acPos && autocompleteItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAcIndex(i => Math.min(i + 1, autocompleteItems.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setAcIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        const word = autocompleteItems[acIndex]
        const ta = sqlRef.current
        if (ta && word) {
          const pos = ta.selectionStart
          const text = ta.value
          const before = text.slice(0, pos)
          const tokenStart = before.search(/[\w]+$/)
          if (tokenStart >= 0) {
            const newText = text.slice(0, tokenStart) + word + text.slice(pos)
            setSqlText(newText)
            setTimeout(() => { ta.selectionStart = ta.selectionEnd = tokenStart + word.length }, 0)
          }
        }
        setAcPos(null)
        setAutocompleteItems([])
        return
      }
      if (e.key === 'Escape') { setAcPos(null); setAutocompleteItems([]); return }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); executeQuery() }
  }, [acPos, autocompleteItems, acIndex, executeQuery])

  const handleSqlChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setSqlText(val)
    const pos = e.target.selectionStart
    const before = val.slice(0, pos)
    const match = before.match(/(\w{2,})$/)
    if (match) {
      const prefix = match[1].toLowerCase()
      const filtered = allNames.filter(n => n.toLowerCase().startsWith(prefix) && n.toLowerCase() !== prefix)
      if (filtered.length > 0) {
        setAutocompleteItems(filtered.slice(0, 8))
        setAcIndex(0)
        setAcPos({ top: 220, left: 12 })
        return
      }
    }
    setAcPos(null)
    setAutocompleteItems([])
  }, [allNames])

  /* ---- close autocomplete on outside click ---- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (acRef.current && !acRef.current.contains(e.target as Node)) {
        setAcPos(null)
        setAutocompleteItems([])
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ---- connection dialog state ---- */
  const [formEngine, setFormEngine] = useState<DbEngine>('postgresql')
  const [formName, setFormName] = useState('')
  const [formHost, setFormHost] = useState('localhost')
  const [formPort, setFormPort] = useState(5432)
  const [formUser, setFormUser] = useState('')
  const [formPass, setFormPass] = useState('')
  const [formDb, setFormDb] = useState('')

  const openNewConnDialog = useCallback(() => {
    setEditingConn(null)
    setFormEngine('postgresql')
    setFormName('')
    setFormHost('localhost')
    setFormPort(5432)
    setFormUser('')
    setFormPass('')
    setFormDb('')
    setShowConnDialog(true)
  }, [])

  const openEditConnDialog = useCallback((conn: DbConnection) => {
    setEditingConn(conn)
    setFormEngine(conn.engine)
    setFormName(conn.name)
    setFormHost(conn.host)
    setFormPort(conn.port)
    setFormUser(conn.user)
    setFormPass('')
    setFormDb(conn.database)
    setShowConnDialog(true)
  }, [])

  const saveConnection = useCallback(() => {
    if (!formName.trim()) return
    if (editingConn) {
      setConnections(prev => prev.map(c => c.id !== editingConn.id ? c : {
        ...c,
        name: formName,
        engine: formEngine,
        host: formHost,
        port: formPort,
        user: formUser,
        password: formPass || c.password,
        database: formDb,
      }))
    } else {
      const newConn: DbConnection = {
        id: `conn-${++_nextId}`,
        name: formName,
        engine: formEngine,
        host: formHost,
        port: formPort,
        user: formUser,
        password: formPass,
        database: formDb,
        status: 'disconnected',
        databases: [],
      }
      setConnections(prev => [...prev, newConn])
      setActiveConnId(newConn.id)
    }
    setShowConnDialog(false)
  }, [editingConn, formEngine, formName, formHost, formPort, formUser, formPass, formDb])

  const deleteConnection = useCallback((id: string) => {
    setConnections(prev => prev.filter(c => c.id !== id))
    if (activeConnId === id) {
      setConnections(prev => { if (prev.length > 0) setActiveConnId(prev[0].id); return prev })
    }
  }, [activeConnId])

  const toggleConnect = useCallback((id: string) => {
    setConnections(prev => prev.map(c => {
      if (c.id !== id) return c
      const newStatus: ConnectionStatus = c.status === 'connected' ? 'disconnected' : 'connected'
      return { ...c, status: newStatus }
    }))
  }, [])

  /* ---- column sort handler ---- */
  const handleSort = useCallback((col: string) => {
    setSortConfig(prev => {
      if (prev?.column === col) {
        return prev.direction === 'asc' ? { column: col, direction: 'desc' } : null
      }
      return { column: col, direction: 'asc' }
    })
    setPage(0)
  }, [])

  /* ---- render ---- */

  const sidebarWidth = 260
  const editorHeight = 180

  const cellStyle: React.CSSProperties = {
    padding: '4px 10px',
    borderBottom: '1px solid var(--border, #333)',
    fontSize: 12,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 220,
  }

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    cursor: 'pointer',
    userSelect: 'none',
    position: 'sticky' as const,
    top: 0,
    background: 'var(--panel-bg, #1e1e1e)',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }

  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--foreground, #ccc)',
    cursor: 'pointer',
    padding: '3px 6px',
    borderRadius: 4,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 12,
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    ...btnStyle,
    padding: '5px 12px',
    borderBottom: active ? '2px solid var(--accent, #007acc)' : '2px solid transparent',
    color: active ? 'var(--accent, #007acc)' : 'var(--foreground, #999)',
    fontWeight: active ? 600 : 400,
  })

  const inputStyle: React.CSSProperties = {
    background: 'var(--input-bg, #2a2a2a)',
    border: '1px solid var(--border, #444)',
    borderRadius: 4,
    color: 'var(--foreground, #ccc)',
    padding: '5px 8px',
    fontSize: 12,
    width: '100%',
    outline: 'none',
  }

  /* ---- tree renderer ---- */
  const renderTree = () => {
    if (!activeConn) return <div style={{ padding: 12, color: 'var(--foreground, #888)', fontSize: 12 }}>No connection selected</div>
    if (activeConn.status !== 'connected') return <div style={{ padding: 12, color: 'var(--foreground, #888)', fontSize: 12 }}>Not connected. Click the plug icon to connect.</div>

    const filterLower = treeFilter.toLowerCase()

    return activeConn.databases.map(db => {
      const Chevron = db.expanded ? ChevronDown : ChevronRight
      return (
        <div key={db.name}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 12, color: 'var(--foreground, #ccc)' }}
            onClick={() => toggleDatabase(activeConn.id, db.name)}
          >
            <Chevron size={14} />
            <Database size={14} style={{ color: '#60a5fa' }} />
            <span style={{ fontWeight: 500 }}>{db.name}</span>
          </div>
          {db.expanded && db.schemas.map(schema => {
            const SChev = schema.expanded ? ChevronDown : ChevronRight
            return (
              <div key={schema.name} style={{ paddingLeft: 16 }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 6px', cursor: 'pointer', fontSize: 12, color: 'var(--foreground, #bbb)' }}
                  onClick={() => toggleSchema(activeConn.id, db.name, schema.name)}
                >
                  <SChev size={13} />
                  <Layers size={13} style={{ color: '#a78bfa' }} />
                  <span>{schema.name}</span>
                </div>
                {schema.expanded && schema.tables
                  .filter(t => !filterLower || t.name.toLowerCase().includes(filterLower))
                  .map(table => {
                    const TChev = table.expanded ? ChevronDown : ChevronRight
                    return (
                      <div key={table.name} style={{ paddingLeft: 16 }}>
                        <div
                          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 12, color: 'var(--foreground, #aaa)' }}
                          onClick={() => toggleTable(activeConn.id, db.name, schema.name, table.name)}
                          onDoubleClick={() => {
                            setSelectedTable(table)
                            setBottomTab('schema')
                          }}
                        >
                          <TChev size={12} />
                          <Table size={12} style={{ color: '#34d399' }} />
                          <span>{table.name}</span>
                          <span style={{ color: 'var(--foreground, #666)', marginLeft: 'auto', fontSize: 10 }}>
                            {table.rowCount.toLocaleString()} rows
                          </span>
                        </div>
                        {table.expanded && table.columns.map(col => {
                          const ColIcon = col.primaryKey ? Key : (col.foreignKey ? Link2 : typeIcon(col.type))
                          const colColor = col.primaryKey ? '#fbbf24' : col.foreignKey ? '#f472b6' : 'var(--foreground, #888)'
                          return (
                            <div
                              key={col.name}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 6px 1px 32px', fontSize: 11, color: 'var(--foreground, #999)' }}
                            >
                              <ColIcon size={11} style={{ color: colColor, flexShrink: 0 }} />
                              <span style={{ color: 'var(--foreground, #bbb)' }}>{col.name}</span>
                              <span style={{ color: 'var(--foreground, #666)', marginLeft: 'auto', fontSize: 10 }}>{col.type}</span>
                              {col.nullable && <span style={{ color: '#71717a', fontSize: 9 }}>NULL</span>}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      )
    })
  }

  /* ---- schema view ---- */
  const renderSchemaView = () => {
    if (!selectedTable) return <div style={{ padding: 12, fontSize: 12, color: 'var(--foreground, #888)' }}>Double-click a table in the tree to view its schema.</div>
    return (
      <div style={{ overflow: 'auto', flex: 1 }}>
        <div style={{ padding: '8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--foreground, #ccc)' }}>
          <Table size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
          {selectedTable.name}
          <span style={{ fontWeight: 400, color: 'var(--foreground, #888)', marginLeft: 8, fontSize: 11 }}>
            {selectedTable.rowCount.toLocaleString()} rows
          </span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border, #444)' }}>
              {['Column', 'Type', 'Nullable', 'PK', 'Default', 'FK'].map(h => (
                <th key={h} style={{ ...cellStyle, fontWeight: 600, textAlign: 'left', background: 'var(--panel-bg, #1e1e1e)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedTable.columns.map(col => (
              <tr key={col.name} style={{ borderBottom: '1px solid var(--border, #333)' }}>
                <td style={{ ...cellStyle, color: 'var(--foreground, #ccc)', fontWeight: col.primaryKey ? 600 : 400 }}>
                  {col.primaryKey && <Key size={10} style={{ color: '#fbbf24', marginRight: 4, verticalAlign: -1 }} />}
                  {col.name}
                </td>
                <td style={{ ...cellStyle, color: '#60a5fa' }}>{col.type}</td>
                <td style={cellStyle}>{col.nullable ? 'YES' : 'NO'}</td>
                <td style={cellStyle}>{col.primaryKey ? <Check size={12} style={{ color: '#22c55e' }} /> : ''}</td>
                <td style={{ ...cellStyle, color: '#a78bfa' }}>{col.defaultValue ?? ''}</td>
                <td style={{ ...cellStyle, color: '#f472b6' }}>
                  {col.foreignKey ? `${col.foreignKey.table}.${col.foreignKey.column}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  /* ---- history view ---- */
  const renderHistoryView = () => (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {history.map(entry => (
        <div
          key={entry.id}
          style={{
            padding: '6px 12px',
            borderBottom: '1px solid var(--border, #333)',
            cursor: 'pointer',
            fontSize: 12,
          }}
          onClick={() => setSqlText(entry.sql)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={11} style={{ color: 'var(--foreground, #888)' }} />
            <span style={{ color: 'var(--foreground, #888)' }}>{formatTimestamp(entry.timestamp)}</span>
            <span style={{ color: 'var(--foreground, #666)', fontSize: 10 }}>{entry.duration}ms</span>
            {entry.error && <AlertCircle size={11} style={{ color: '#ef4444' }} />}
            {!entry.error && <span style={{ color: 'var(--foreground, #666)', fontSize: 10 }}>{entry.rowsAffected} rows</span>}
            <button
              style={{ ...btnStyle, marginLeft: 'auto', padding: '2px 4px' }}
              title="Copy SQL"
              onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(entry.sql) }}
            >
              <Copy size={11} />
            </button>
          </div>
          <pre style={{
            margin: '4px 0 0',
            fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", monospace)',
            fontSize: 11,
            color: entry.error ? '#ef4444' : 'var(--foreground, #bbb)',
            whiteSpace: 'pre-wrap',
            maxHeight: 60,
            overflow: 'hidden',
          }}>
            {entry.sql}
          </pre>
          {entry.error && (
            <div style={{ color: '#f87171', fontSize: 11, marginTop: 2 }}>{entry.error}</div>
          )}
        </div>
      ))}
    </div>
  )

  /* ---- main layout ---- */
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: 'var(--bg, #181818)', color: 'var(--foreground, #ccc)', fontFamily: 'var(--font-sans, system-ui, sans-serif)', overflow: 'hidden' }}>
      {/* ====== Sidebar ====== */}
      <div style={{ width: sidebarWidth, minWidth: sidebarWidth, borderRight: '1px solid var(--border, #333)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* connection tabs */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '6px 8px', gap: 4, borderBottom: '1px solid var(--border, #333)', flexWrap: 'wrap' }}>
          {connections.map(c => (
            <button
              key={c.id}
              style={{
                ...btnStyle,
                padding: '3px 8px',
                borderRadius: 4,
                background: c.id === activeConnId ? 'var(--accent-bg, #264f78)' : 'transparent',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                maxWidth: 120,
                overflow: 'hidden',
              }}
              onClick={() => setActiveConnId(c.id)}
              title={`${c.name} (${ENGINE_DEFAULTS[c.engine].label})`}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(c.status), flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            </button>
          ))}
          <button style={btnStyle} onClick={openNewConnDialog} title="New connection">
            <Plus size={14} />
          </button>
        </div>

        {/* active connection header */}
        {activeConn && (
          <div style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 4, borderBottom: '1px solid var(--border, #333)', fontSize: 11 }}>
            <Server size={12} style={{ color: '#60a5fa' }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--foreground, #aaa)' }}>
              {activeConn.host}:{activeConn.port}
            </span>
            <button style={btnStyle} onClick={() => toggleConnect(activeConn.id)} title={activeConn.status === 'connected' ? 'Disconnect' : 'Connect'}>
              {activeConn.status === 'connected' ? <Unlink size={12} /> : <Link2 size={12} />}
            </button>
            <button style={btnStyle} onClick={() => openEditConnDialog(activeConn)} title="Edit connection">
              <Edit3 size={12} />
            </button>
            <button style={btnStyle} onClick={() => deleteConnection(activeConn.id)} title="Delete connection">
              <Trash2 size={12} />
            </button>
          </div>
        )}

        {/* tree filter */}
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border, #333)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 6, top: 7, color: 'var(--foreground, #666)' }} />
            <input
              style={{ ...inputStyle, paddingLeft: 24, fontSize: 11 }}
              placeholder="Filter tables..."
              value={treeFilter}
              onChange={e => setTreeFilter(e.target.value)}
            />
            {treeFilter && (
              <button
                style={{ position: 'absolute', right: 4, top: 4, background: 'none', border: 'none', color: 'var(--foreground, #888)', cursor: 'pointer' }}
                onClick={() => setTreeFilter('')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* tree */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
          {renderTree()}
        </div>
      </div>

      {/* ====== Main area ====== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* SQL Editor */}
        <div style={{ height: editorHeight, minHeight: 100, borderBottom: '1px solid var(--border, #333)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 6, borderBottom: '1px solid var(--border, #333)', background: 'var(--panel-bg, #1e1e1e)' }}>
            <HardDrive size={13} style={{ color: '#60a5fa' }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>SQL Editor</span>
            <span style={{ fontSize: 10, color: 'var(--foreground, #666)' }}>Ctrl+Enter to run</span>
            <div style={{ flex: 1 }} />
            <button
              style={{ ...btnStyle, background: 'var(--accent, #007acc)', color: '#fff', borderRadius: 4, padding: '3px 10px' }}
              onClick={executeQuery}
              title="Execute query (Ctrl+Enter)"
            >
              <Play size={12} />
              <span>Run</span>
            </button>
            <button style={btnStyle} onClick={() => setSqlText('')} title="Clear editor">
              <RotateCw size={12} />
            </button>
          </div>
          <textarea
            ref={sqlRef}
            value={sqlText}
            onChange={handleSqlChange}
            onKeyDown={handleSqlKeyDown}
            spellCheck={false}
            style={{
              flex: 1,
              resize: 'none',
              background: 'var(--editor-bg, #1a1a1a)',
              color: 'var(--foreground, #d4d4d4)',
              border: 'none',
              outline: 'none',
              padding: '10px 12px',
              fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", Consolas, monospace)',
              fontSize: 13,
              lineHeight: 1.6,
              tabSize: 2,
            }}
          />
          {/* autocomplete dropdown */}
          {acPos && autocompleteItems.length > 0 && (
            <div
              ref={acRef}
              style={{
                position: 'absolute',
                top: acPos.top,
                left: acPos.left,
                background: 'var(--dropdown-bg, #252525)',
                border: '1px solid var(--border, #444)',
                borderRadius: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                zIndex: 100,
                maxHeight: 180,
                overflow: 'auto',
                minWidth: 160,
              }}
            >
              {autocompleteItems.map((item, i) => (
                <div
                  key={item}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono, monospace)',
                    background: i === acIndex ? 'var(--accent-bg, #264f78)' : 'transparent',
                    color: i === acIndex ? '#fff' : 'var(--foreground, #ccc)',
                  }}
                  onMouseDown={() => {
                    const ta = sqlRef.current
                    if (ta) {
                      const pos = ta.selectionStart
                      const text = ta.value
                      const before = text.slice(0, pos)
                      const tokenStart = before.search(/[\w]+$/)
                      if (tokenStart >= 0) {
                        const newText = text.slice(0, tokenStart) + item + text.slice(pos)
                        setSqlText(newText)
                      }
                    }
                    setAcPos(null)
                    setAutocompleteItems([])
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom section: results / schema / history */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border, #333)', background: 'var(--panel-bg, #1e1e1e)', padding: '0 4px' }}>
            <button style={tabBtnStyle(bottomTab === 'results')} onClick={() => setBottomTab('results')}>
              <Columns size={12} style={{ marginRight: 4 }} />Results
            </button>
            <button style={tabBtnStyle(bottomTab === 'schema')} onClick={() => setBottomTab('schema')}>
              <Table size={12} style={{ marginRight: 4 }} />Schema
            </button>
            <button style={tabBtnStyle(bottomTab === 'history')} onClick={() => setBottomTab('history')}>
              <Clock size={12} style={{ marginRight: 4 }} />History
            </button>

            <div style={{ flex: 1 }} />

            {/* export buttons (only on results tab) */}
            {bottomTab === 'results' && results && (
              <>
                <button
                  style={btnStyle}
                  onClick={() => exportCSV(results.columns, results.rows)}
                  title="Export as CSV"
                >
                  <FileSpreadsheet size={12} />
                  <span style={{ fontSize: 11 }}>CSV</span>
                </button>
                <button
                  style={btnStyle}
                  onClick={() => exportJSON(results.rows)}
                  title="Export as JSON"
                >
                  <FileJson size={12} />
                  <span style={{ fontSize: 11 }}>JSON</span>
                </button>
              </>
            )}

            {/* result stats */}
            {bottomTab === 'results' && results && (
              <span style={{ fontSize: 10, color: 'var(--foreground, #888)', marginRight: 8 }}>
                {results.rows.length} of {results.totalRows.toLocaleString()} rows &middot; {results.duration}ms
              </span>
            )}
          </div>

          {/* tab content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {bottomTab === 'results' && (
              results ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ flex: 1, overflow: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ ...cellStyle, fontWeight: 600, textAlign: 'center', width: 40, background: 'var(--panel-bg, #1e1e1e)' }}>#</th>
                          {results.columns.map(col => (
                            <th key={col} style={{ ...headerCellStyle, textAlign: 'left' }} onClick={() => handleSort(col)}>
                              {col}
                              {sortConfig?.column === col
                                ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)
                                : <ArrowUpDown size={10} style={{ opacity: 0.3 }} />
                              }
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pagedRows.map((row, ri) => (
                          <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                            <td style={{ ...cellStyle, textAlign: 'center', color: 'var(--foreground, #666)', fontSize: 10 }}>
                              {page * PAGE_SIZE + ri + 1}
                            </td>
                            {results.columns.map(col => (
                              <td key={col} style={{ ...cellStyle, color: row[col] === null ? '#71717a' : 'var(--foreground, #ccc)' }}>
                                {row[col] === null ? 'NULL' : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', borderTop: '1px solid var(--border, #333)', background: 'var(--panel-bg, #1e1e1e)' }}>
                      <button style={btnStyle} disabled={page === 0} onClick={() => setPage(0)}>
                        <ChevronsLeft size={14} />
                      </button>
                      <button style={btnStyle} disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft size={14} />
                      </button>
                      <span style={{ fontSize: 11, color: 'var(--foreground, #aaa)' }}>
                        Page {page + 1} of {totalPages}
                      </span>
                      <button style={btnStyle} disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight size={14} />
                      </button>
                      <button style={btnStyle} disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
                        <ChevronsRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--foreground, #666)', fontSize: 12 }}>
                  <Database size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div>Run a query to see results here.</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Try: SELECT * FROM users LIMIT 10;</div>
                </div>
              )
            )}
            {bottomTab === 'schema' && renderSchemaView()}
            {bottomTab === 'history' && renderHistoryView()}
          </div>
        </div>
      </div>

      {/* ====== Connection Dialog ====== */}
      {showConnDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
          onClick={() => setShowConnDialog(false)}
        >
          <div
            style={{
              background: 'var(--panel-bg, #252525)',
              border: '1px solid var(--border, #444)',
              borderRadius: 8,
              padding: 24,
              width: 420,
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Settings size={18} style={{ color: '#60a5fa' }} />
              <span style={{ fontSize: 15, fontWeight: 600 }}>{editingConn ? 'Edit Connection' : 'New Connection'}</span>
              <div style={{ flex: 1 }} />
              <button style={btnStyle} onClick={() => setShowConnDialog(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Engine */}
              <label style={{ fontSize: 12, color: 'var(--foreground, #aaa)' }}>
                Engine
                <select
                  value={formEngine}
                  onChange={e => {
                    const eng = e.target.value as DbEngine
                    setFormEngine(eng)
                    setFormPort(ENGINE_DEFAULTS[eng].port)
                  }}
                  style={{ ...inputStyle, marginTop: 4, cursor: 'pointer' }}
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="sqlite">SQLite</option>
                  <option value="mongodb">MongoDB</option>
                </select>
              </label>

              {/* Name */}
              <label style={{ fontSize: 12, color: 'var(--foreground, #aaa)' }}>
                Connection Name
                <input style={{ ...inputStyle, marginTop: 4 }} value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Database" />
              </label>

              {/* Host + Port */}
              {formEngine !== 'sqlite' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--foreground, #aaa)', flex: 1 }}>
                    Host
                    <input style={{ ...inputStyle, marginTop: 4 }} value={formHost} onChange={e => setFormHost(e.target.value)} placeholder="localhost" />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--foreground, #aaa)', width: 80 }}>
                    Port
                    <input style={{ ...inputStyle, marginTop: 4 }} type="number" value={formPort} onChange={e => setFormPort(Number(e.target.value))} />
                  </label>
                </div>
              )}

              {/* User + Password */}
              {formEngine !== 'sqlite' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ fontSize: 12, color: 'var(--foreground, #aaa)', flex: 1 }}>
                    User
                    <input style={{ ...inputStyle, marginTop: 4 }} value={formUser} onChange={e => setFormUser(e.target.value)} placeholder="postgres" />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--foreground, #aaa)', flex: 1 }}>
                    Password
                    <input style={{ ...inputStyle, marginTop: 4 }} type="password" value={formPass} onChange={e => setFormPass(e.target.value)} placeholder="••••••" />
                  </label>
                </div>
              )}

              {/* Database */}
              <label style={{ fontSize: 12, color: 'var(--foreground, #aaa)' }}>
                {formEngine === 'sqlite' ? 'File Path' : 'Database'}
                <input style={{ ...inputStyle, marginTop: 4 }} value={formDb} onChange={e => setFormDb(e.target.value)} placeholder={formEngine === 'sqlite' ? '/path/to/database.db' : 'mydb'} />
              </label>

              {/* buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button style={{ ...btnStyle, padding: '6px 16px', border: '1px solid var(--border, #444)', borderRadius: 4 }} onClick={() => setShowConnDialog(false)}>
                  Cancel
                </button>
                <button
                  style={{ ...btnStyle, padding: '6px 16px', background: 'var(--accent, #007acc)', color: '#fff', borderRadius: 4 }}
                  onClick={saveConnection}
                >
                  {editingConn ? 'Save' : 'Add Connection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
