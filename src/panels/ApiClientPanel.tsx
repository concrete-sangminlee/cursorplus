import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Send,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Globe,
  Clock,
  Search,
  Copy,
  Save,
  Download,
  Upload,
  Code,
  Eye,
  FileText,
  Settings,
  X,
  Check,
  Lock,
  Key,
  Layers,
  History,
  BookOpen,
  MoreHorizontal,
  Play,
  RefreshCw,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────── */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

interface KeyValuePair {
  key: string
  value: string
  enabled: boolean
  id: string
}

interface AuthConfig {
  type: 'none' | 'bearer' | 'basic' | 'apikey'
  bearerToken: string
  basicUser: string
  basicPass: string
  apiKeyName: string
  apiKeyValue: string
  apiKeyIn: 'header' | 'query'
}

interface ApiRequest {
  id: string
  name: string
  method: HttpMethod
  url: string
  headers: KeyValuePair[]
  params: KeyValuePair[]
  bodyType: 'json' | 'form' | 'raw'
  bodyContent: string
  auth: AuthConfig
}

interface CollectionFolder {
  id: string
  name: string
  expanded: boolean
  requests: ApiRequest[]
}

interface ApiCollection {
  id: string
  name: string
  expanded: boolean
  folders: CollectionFolder[]
  requests: ApiRequest[]
}

interface TimingInfo {
  dns: number
  connect: number
  tls: number
  ttfb: number
  transfer: number
  total: number
}

interface ApiResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  timing: TimingInfo
  size: number
}

interface HistoryEntry {
  id: string
  method: HttpMethod
  url: string
  status: number
  timestamp: number
  timing: TimingInfo
}

interface EnvVariable {
  key: string
  value: string
}

interface Environment {
  id: string
  name: string
  variables: EnvVariable[]
}

type RequestTab = 'headers' | 'params' | 'body' | 'auth'
type ResponseTab = 'body' | 'headers' | 'timing'
type BodyPreviewMode = 'pretty' | 'raw' | 'preview'
type CodeGenLang = 'curl' | 'fetch' | 'axios' | 'python' | 'go'
type SidebarTab = 'collections' | 'history' | 'environments'

/* ── Helpers ───────────────────────────────────────────────────── */

const uid = () => Math.random().toString(36).slice(2, 10)

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: '#61affe',
  POST: '#49cc90',
  PUT: '#fca130',
  DELETE: '#f93e3e',
  PATCH: '#50e3c2',
  HEAD: '#9012fe',
  OPTIONS: '#0d5aa7',
}

const statusColor = (code: number): string => {
  if (code < 200) return '#0dcaf0'
  if (code < 300) return '#49cc90'
  if (code < 400) return '#fca130'
  return '#f93e3e'
}

const emptyAuth = (): AuthConfig => ({
  type: 'none',
  bearerToken: '',
  basicUser: '',
  basicPass: '',
  apiKeyName: '',
  apiKeyValue: '',
  apiKeyIn: 'header',
})

const newRequest = (name = 'New Request', method: HttpMethod = 'GET', url = ''): ApiRequest => ({
  id: uid(),
  name,
  method,
  url,
  headers: [{ key: 'Content-Type', value: 'application/json', enabled: true, id: uid() }],
  params: [],
  bodyType: 'json',
  bodyContent: '',
  auth: emptyAuth(),
})

const DEMO_COLLECTIONS: ApiCollection[] = [
  {
    id: 'sample-api',
    name: 'Sample API',
    expanded: true,
    folders: [
      {
        id: 'users-folder',
        name: 'Users',
        expanded: true,
        requests: [
          {
            ...newRequest('List Users', 'GET', '{{baseUrl}}/users'),
            id: 'demo-get-users',
            params: [{ key: 'page', value: '1', enabled: true, id: uid() }, { key: 'limit', value: '10', enabled: true, id: uid() }],
          },
          {
            ...newRequest('Create User', 'POST', '{{baseUrl}}/users'),
            id: 'demo-create-user',
            bodyContent: JSON.stringify({ name: 'John Doe', email: 'john@example.com', role: 'admin' }, null, 2),
          },
        ],
      },
      {
        id: 'posts-folder',
        name: 'Posts',
        expanded: false,
        requests: [
          { ...newRequest('Get Post', 'GET', '{{baseUrl}}/posts/1'), id: 'demo-get-post' },
          {
            ...newRequest('Update Post', 'PUT', '{{baseUrl}}/posts/1'),
            id: 'demo-update-post',
            bodyContent: JSON.stringify({ title: 'Updated Title', body: 'Updated content' }, null, 2),
          },
          { ...newRequest('Delete Post', 'DELETE', '{{baseUrl}}/posts/1'), id: 'demo-delete-post' },
        ],
      },
    ],
    requests: [
      { ...newRequest('Health Check', 'GET', '{{baseUrl}}/health'), id: 'demo-health' },
    ],
  },
]

const DEFAULT_ENVIRONMENTS: Environment[] = [
  {
    id: 'env-dev',
    name: 'Development',
    variables: [
      { key: 'baseUrl', value: 'http://localhost:3000/api' },
      { key: 'token', value: 'dev-token-abc123' },
    ],
  },
  {
    id: 'env-staging',
    name: 'Staging',
    variables: [
      { key: 'baseUrl', value: 'https://staging.example.com/api' },
      { key: 'token', value: 'staging-token-xyz789' },
    ],
  },
  {
    id: 'env-prod',
    name: 'Production',
    variables: [
      { key: 'baseUrl', value: 'https://api.example.com' },
      { key: 'token', value: '' },
    ],
  },
]

const STORAGE_KEY_COLLECTIONS = 'api-client-collections'
const STORAGE_KEY_HISTORY = 'api-client-history'
const STORAGE_KEY_ENVIRONMENTS = 'api-client-environments'

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function saveToStorage<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* quota exceeded */ }
}

/* ── Code Generation ───────────────────────────────────────────── */

function generateCode(req: ApiRequest, lang: CodeGenLang, resolveEnv: (s: string) => string): string {
  const url = resolveEnv(req.url)
  const enabledHeaders = req.headers.filter(h => h.enabled && h.key)
  const enabledParams = req.params.filter(p => p.enabled && p.key)
  const queryStr = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(resolveEnv(p.value))}`).join('&')
  const fullUrl = queryStr ? `${url}?${queryStr}` : url
  const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.bodyContent

  switch (lang) {
    case 'curl': {
      let cmd = `curl -X ${req.method} '${fullUrl}'`
      enabledHeaders.forEach(h => { cmd += ` \\\n  -H '${h.key}: ${resolveEnv(h.value)}'` })
      if (hasBody) cmd += ` \\\n  -d '${req.bodyContent}'`
      return cmd
    }
    case 'fetch': {
      const opts: string[] = [`  method: '${req.method}'`]
      if (enabledHeaders.length) {
        const hObj = enabledHeaders.reduce<Record<string, string>>((a, h) => { a[h.key] = resolveEnv(h.value); return a }, {})
        opts.push(`  headers: ${JSON.stringify(hObj, null, 4)}`)
      }
      if (hasBody) opts.push(`  body: ${JSON.stringify(req.bodyContent)}`)
      return `fetch('${fullUrl}', {\n${opts.join(',\n')}\n})\n  .then(res => res.json())\n  .then(data => console.log(data))`
    }
    case 'axios': {
      const cfg: string[] = [`  method: '${req.method.toLowerCase()}'`, `  url: '${fullUrl}'`]
      if (enabledHeaders.length) {
        const hObj = enabledHeaders.reduce<Record<string, string>>((a, h) => { a[h.key] = resolveEnv(h.value); return a }, {})
        cfg.push(`  headers: ${JSON.stringify(hObj, null, 4)}`)
      }
      if (hasBody) cfg.push(`  data: ${req.bodyContent}`)
      return `axios({\n${cfg.join(',\n')}\n})\n  .then(res => console.log(res.data))`
    }
    case 'python': {
      let code = `import requests\n\n`
      code += `response = requests.${req.method.toLowerCase()}(\n  '${fullUrl}'`
      if (enabledHeaders.length) {
        const hObj = enabledHeaders.reduce<Record<string, string>>((a, h) => { a[h.key] = resolveEnv(h.value); return a }, {})
        code += `,\n  headers=${JSON.stringify(hObj)}`
      }
      if (hasBody) code += `,\n  json=${req.bodyContent}`
      code += `\n)\nprint(response.json())`
      return code
    }
    case 'go': {
      let code = `package main\n\nimport (\n  "fmt"\n  "net/http"\n  "io/ioutil"\n`
      if (hasBody) code += `  "strings"\n`
      code += `)\n\nfunc main() {\n`
      if (hasBody) {
        code += `  body := strings.NewReader(\`${req.bodyContent}\`)\n`
        code += `  req, _ := http.NewRequest("${req.method}", "${fullUrl}", body)\n`
      } else {
        code += `  req, _ := http.NewRequest("${req.method}", "${fullUrl}", nil)\n`
      }
      enabledHeaders.forEach(h => { code += `  req.Header.Set("${h.key}", "${resolveEnv(h.value)}")\n` })
      code += `  client := &http.Client{}\n  resp, _ := client.Do(req)\n  defer resp.Body.Close()\n  data, _ := ioutil.ReadAll(resp.Body)\n  fmt.Println(string(data))\n}`
      return code
    }
    default:
      return ''
  }
}

/* ── Simulated Response ────────────────────────────────────────── */

function simulateResponse(method: HttpMethod, url: string): ApiResponse {
  const dns = Math.random() * 20 + 5
  const connect = Math.random() * 30 + 10
  const tls = url.startsWith('https') ? Math.random() * 40 + 20 : 0
  const ttfb = Math.random() * 100 + 30
  const transfer = Math.random() * 50 + 10
  const total = dns + connect + tls + ttfb + transfer

  const sampleBodies: Record<string, unknown> = {
    '/users': [
      { id: 1, name: 'Alice', email: 'alice@example.com', role: 'admin' },
      { id: 2, name: 'Bob', email: 'bob@example.com', role: 'user' },
      { id: 3, name: 'Carol', email: 'carol@example.com', role: 'user' },
    ],
    '/health': { status: 'ok', uptime: '72h 14m', version: '2.1.0' },
    '/posts/1': { id: 1, title: 'Hello World', body: 'First post content', authorId: 1 },
  }

  const pathMatch = Object.keys(sampleBodies).find(p => url.includes(p))
  const body = pathMatch ? sampleBodies[pathMatch] : { message: 'OK', timestamp: new Date().toISOString() }

  let status = 200
  let statusText = 'OK'
  if (method === 'POST') { status = 201; statusText = 'Created' }
  if (method === 'DELETE') { status = 204; statusText = 'No Content' }

  const bodyStr = JSON.stringify(body, null, 2)

  return {
    status,
    statusText,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': uid(),
      'x-response-time': `${total.toFixed(0)}ms`,
      'cache-control': 'no-cache',
      'access-control-allow-origin': '*',
    },
    body: bodyStr,
    timing: { dns, connect, tls, ttfb, transfer, total },
    size: new Blob([bodyStr]).size,
  }
}

/* ── JSON Tree View ────────────────────────────────────────────── */

function JsonTreeNode({ label, value, depth }: { label: string; value: unknown; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2)

  if (value === null) return <div style={{ paddingLeft: depth * 16 }}><span style={{ color: 'var(--vscode-debugTokenExpression-name)' }}>{label}</span>: <span style={{ color: '#ce9178' }}>null</span></div>
  if (typeof value === 'boolean') return <div style={{ paddingLeft: depth * 16 }}><span style={{ color: 'var(--vscode-debugTokenExpression-name)' }}>{label}</span>: <span style={{ color: '#569cd6' }}>{String(value)}</span></div>
  if (typeof value === 'number') return <div style={{ paddingLeft: depth * 16 }}><span style={{ color: 'var(--vscode-debugTokenExpression-name)' }}>{label}</span>: <span style={{ color: '#b5cea8' }}>{value}</span></div>
  if (typeof value === 'string') return <div style={{ paddingLeft: depth * 16 }}><span style={{ color: 'var(--vscode-debugTokenExpression-name)' }}>{label}</span>: <span style={{ color: '#ce9178' }}>"{value}"</span></div>

  const isArray = Array.isArray(value)
  const entries = isArray ? (value as unknown[]).map((v, i) => [String(i), v]) : Object.entries(value as Record<string, unknown>)
  const bracket = isArray ? ['[', ']'] : ['{', '}']

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setExpanded(!expanded)}>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span style={{ color: 'var(--vscode-debugTokenExpression-name)' }}>{label}</span>
        {!expanded && <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 11 }}>{bracket[0]} {entries.length} items {bracket[1]}</span>}
      </div>
      {expanded && entries.map(([k, v]) => <JsonTreeNode key={k} label={k} value={v} depth={depth + 1} />)}
    </div>
  )
}

/* ── Main Component ────────────────────────────────────────────── */

export default function ApiClientPanel() {
  /* ── State ───────────────────── */
  const [collections, setCollections] = useState<ApiCollection[]>(() => loadFromStorage(STORAGE_KEY_COLLECTIONS, DEMO_COLLECTIONS))
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadFromStorage(STORAGE_KEY_HISTORY, []))
  const [environments, setEnvironments] = useState<Environment[]>(() => loadFromStorage(STORAGE_KEY_ENVIRONMENTS, DEFAULT_ENVIRONMENTS))
  const [activeEnvId, setActiveEnvId] = useState<string>(DEFAULT_ENVIRONMENTS[0].id)
  const [activeRequest, setActiveRequest] = useState<ApiRequest>(DEMO_COLLECTIONS[0].folders[0].requests[0])
  const [response, setResponse] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [requestTab, setRequestTab] = useState<RequestTab>('params')
  const [responseTab, setResponseTab] = useState<ResponseTab>('body')
  const [bodyPreview, setBodyPreview] = useState<BodyPreviewMode>('pretty')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('collections')
  const [historySearch, setHistorySearch] = useState('')
  const [showCodeGen, setShowCodeGen] = useState(false)
  const [codeGenLang, setCodeGenLang] = useState<CodeGenLang>('curl')
  const [sidebarWidth] = useState(240)

  const urlRef = useRef<HTMLInputElement>(null)

  /* ── Persist ─────────────────── */
  useEffect(() => { saveToStorage(STORAGE_KEY_COLLECTIONS, collections) }, [collections])
  useEffect(() => { saveToStorage(STORAGE_KEY_HISTORY, history) }, [history])
  useEffect(() => { saveToStorage(STORAGE_KEY_ENVIRONMENTS, environments) }, [environments])

  /* ── Environment resolver ────── */
  const resolveEnv = useCallback((str: string): string => {
    const env = environments.find(e => e.id === activeEnvId)
    if (!env) return str
    return str.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const v = env.variables.find(ev => ev.key === key)
      return v ? v.value : `{{${key}}}`
    })
  }, [environments, activeEnvId])

  /* ── Send request ────────────── */
  const sendRequest = useCallback(() => {
    setLoading(true)
    setResponseTab('body')
    const resolvedUrl = resolveEnv(activeRequest.url)
    setTimeout(() => {
      const res = simulateResponse(activeRequest.method, resolvedUrl)
      setResponse(res)
      setLoading(false)
      const entry: HistoryEntry = {
        id: uid(),
        method: activeRequest.method,
        url: activeRequest.url,
        status: res.status,
        timestamp: Date.now(),
        timing: res.timing,
      }
      setHistory(prev => [entry, ...prev].slice(0, 100))
    }, Math.random() * 400 + 200)
  }, [activeRequest, resolveEnv])

  /* ── Update active request ───── */
  const updateRequest = useCallback((patch: Partial<ApiRequest>) => {
    setActiveRequest(prev => ({ ...prev, ...patch }))
  }, [])

  /* ── Save current request to collection ── */
  const saveRequestToCollection = useCallback(() => {
    setCollections(prev => {
      const copy = JSON.parse(JSON.stringify(prev)) as ApiCollection[]
      for (const col of copy) {
        const idx = col.requests.findIndex(r => r.id === activeRequest.id)
        if (idx >= 0) { col.requests[idx] = activeRequest; return copy }
        for (const folder of col.folders) {
          const fi = folder.requests.findIndex(r => r.id === activeRequest.id)
          if (fi >= 0) { folder.requests[fi] = activeRequest; return copy }
        }
      }
      if (copy.length === 0) copy.push({ id: uid(), name: 'My Collection', expanded: true, folders: [], requests: [] })
      copy[0].requests.push(activeRequest)
      return copy
    })
  }, [activeRequest])

  /* ── Filtered history ────────── */
  const filteredHistory = useMemo(() => {
    if (!historySearch) return history
    const q = historySearch.toLowerCase()
    return history.filter(h => h.url.toLowerCase().includes(q) || h.method.toLowerCase().includes(q))
  }, [history, historySearch])

  /* ── Add KV row ──────────────── */
  const addKVRow = useCallback((field: 'headers' | 'params') => {
    updateRequest({ [field]: [...activeRequest[field], { key: '', value: '', enabled: true, id: uid() }] })
  }, [activeRequest, updateRequest])

  const updateKVRow = useCallback((field: 'headers' | 'params', id: string, patch: Partial<KeyValuePair>) => {
    updateRequest({ [field]: activeRequest[field].map(r => r.id === id ? { ...r, ...patch } : r) })
  }, [activeRequest, updateRequest])

  const removeKVRow = useCallback((field: 'headers' | 'params', id: string) => {
    updateRequest({ [field]: activeRequest[field].filter(r => r.id !== id) })
  }, [activeRequest, updateRequest])

  /* ── Code generation string ──── */
  const generatedCode = useMemo(() => generateCode(activeRequest, codeGenLang, resolveEnv), [activeRequest, codeGenLang, resolveEnv])

  /* ── Styles ──────────────────── */
  const s = {
    root: { display: 'flex', height: '100%', background: 'var(--vscode-editor-background)', color: 'var(--vscode-editor-foreground)', fontFamily: 'var(--vscode-font-family)', fontSize: 13 } as React.CSSProperties,
    sidebar: { width: sidebarWidth, minWidth: sidebarWidth, borderRight: '1px solid var(--vscode-panel-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' } as React.CSSProperties,
    sidebarTabs: { display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)' } as React.CSSProperties,
    sidebarTab: (active: boolean) => ({ flex: 1, padding: '6px 4px', fontSize: 11, textAlign: 'center', cursor: 'pointer', background: active ? 'var(--vscode-tab-activeBackground)' : 'transparent', borderBottom: active ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent', color: active ? 'var(--vscode-editor-foreground)' : 'var(--vscode-descriptionForeground)' }) as React.CSSProperties,
    sidebarBody: { flex: 1, overflowY: 'auto', padding: 4 } as React.CSSProperties,
    main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } as React.CSSProperties,
    urlBar: { display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--vscode-panel-border)', alignItems: 'center' } as React.CSSProperties,
    methodSelect: (m: HttpMethod) => ({ background: 'var(--vscode-input-background)', color: METHOD_COLORS[m], border: '1px solid var(--vscode-input-border)', borderRadius: 3, padding: '5px 8px', fontWeight: 700, fontSize: 12, cursor: 'pointer', minWidth: 80 }) as React.CSSProperties,
    urlInput: { flex: 1, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 3, padding: '5px 10px', fontSize: 13, outline: 'none' } as React.CSSProperties,
    sendBtn: { display: 'flex', alignItems: 'center', gap: 4, background: 'var(--vscode-button-background)', color: 'var(--vscode-button-foreground)', border: 'none', borderRadius: 3, padding: '5px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
    tabRow: { display: 'flex', borderBottom: '1px solid var(--vscode-panel-border)', background: 'var(--vscode-editorGroupHeader-tabsBackground)' } as React.CSSProperties,
    tab: (active: boolean) => ({ padding: '6px 14px', fontSize: 12, cursor: 'pointer', borderBottom: active ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent', color: active ? 'var(--vscode-editor-foreground)' : 'var(--vscode-descriptionForeground)', background: 'transparent' }) as React.CSSProperties,
    panel: { flex: 1, overflow: 'auto', padding: 10 } as React.CSSProperties,
    kvRow: { display: 'flex', gap: 4, marginBottom: 4, alignItems: 'center' } as React.CSSProperties,
    kvInput: { flex: 1, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 2, padding: '3px 6px', fontSize: 12, outline: 'none' } as React.CSSProperties,
    textarea: { width: '100%', minHeight: 120, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 3, padding: 8, fontSize: 12, fontFamily: 'var(--vscode-editor-font-family)', resize: 'vertical', outline: 'none' } as React.CSSProperties,
    badge: (color: string) => ({ display: 'inline-block', padding: '1px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: color, marginRight: 6 }) as React.CSSProperties,
    treeItem: { padding: '3px 6px', cursor: 'pointer', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as React.CSSProperties,
    iconBtn: { background: 'none', border: 'none', color: 'var(--vscode-descriptionForeground)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' } as React.CSSProperties,
    responseStatus: (code: number) => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--vscode-panel-border)', fontSize: 12, color: statusColor(code), fontWeight: 700 }) as React.CSSProperties,
    timingBar: (pct: number, color: string) => ({ height: 6, borderRadius: 3, background: color, width: `${pct}%`, minWidth: 2 }) as React.CSSProperties,
    codeBlock: { background: 'var(--vscode-textCodeBlock-background)', borderRadius: 4, padding: 10, fontSize: 12, fontFamily: 'var(--vscode-editor-font-family)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', position: 'relative' } as React.CSSProperties,
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 } as React.CSSProperties,
    modal: { background: 'var(--vscode-editor-background)', border: '1px solid var(--vscode-panel-border)', borderRadius: 6, padding: 16, width: 560, maxHeight: '80vh', overflow: 'auto' } as React.CSSProperties,
  }

  /* ── Sidebar: Collections Tree ── */
  const renderCollections = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--vscode-descriptionForeground)' }}>Collections</span>
        <div style={{ display: 'flex', gap: 2 }}>
          <button style={s.iconBtn} title="New Collection" onClick={() => setCollections(prev => [...prev, { id: uid(), name: 'New Collection', expanded: true, folders: [], requests: [newRequest()] }])}><Plus size={14} /></button>
          <button style={s.iconBtn} title="Save All" onClick={() => saveRequestToCollection()}><Save size={14} /></button>
        </div>
      </div>
      {collections.map(col => (
        <div key={col.id}>
          <div
            style={{ ...s.treeItem, fontWeight: 600 }}
            onClick={() => setCollections(prev => prev.map(c => c.id === col.id ? { ...c, expanded: !c.expanded } : c))}
          >
            {col.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {col.expanded ? <FolderOpen size={14} style={{ color: 'var(--vscode-icon-foreground)' }} /> : <Folder size={14} style={{ color: 'var(--vscode-icon-foreground)' }} />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.name}</span>
          </div>
          {col.expanded && (
            <div style={{ paddingLeft: 12 }}>
              {col.folders.map(folder => (
                <div key={folder.id}>
                  <div
                    style={s.treeItem}
                    onClick={() => setCollections(prev => prev.map(c => c.id === col.id ? { ...c, folders: c.folders.map(f => f.id === folder.id ? { ...f, expanded: !f.expanded } : f) } : c))}
                  >
                    {folder.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    {folder.expanded ? <FolderOpen size={12} /> : <Folder size={12} />}
                    <span>{folder.name}</span>
                  </div>
                  {folder.expanded && folder.requests.map(req => (
                    <div
                      key={req.id}
                      style={{ ...s.treeItem, paddingLeft: 28, background: activeRequest.id === req.id ? 'var(--vscode-list-activeSelectionBackground)' : undefined }}
                      onClick={() => { setActiveRequest(req); setResponse(null) }}
                    >
                      <span style={{ ...s.badge(METHOD_COLORS[req.method]), fontSize: 9, padding: '0 4px' }}>{req.method}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.name}</span>
                    </div>
                  ))}
                </div>
              ))}
              {col.requests.map(req => (
                <div
                  key={req.id}
                  style={{ ...s.treeItem, paddingLeft: 16, background: activeRequest.id === req.id ? 'var(--vscode-list-activeSelectionBackground)' : undefined }}
                  onClick={() => { setActiveRequest(req); setResponse(null) }}
                >
                  <span style={{ ...s.badge(METHOD_COLORS[req.method]), fontSize: 9, padding: '0 4px' }}>{req.method}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{req.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )

  /* ── Sidebar: History ────────── */
  const renderHistory = () => (
    <div>
      <div style={{ padding: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-input-border)', borderRadius: 3, padding: '2px 6px' }}>
          <Search size={12} style={{ color: 'var(--vscode-descriptionForeground)' }} />
          <input
            style={{ ...s.kvInput, border: 'none', padding: '2px 0' }}
            placeholder="Search history..."
            value={historySearch}
            onChange={e => setHistorySearch(e.target.value)}
          />
        </div>
      </div>
      {filteredHistory.length === 0 && <div style={{ padding: 12, color: 'var(--vscode-descriptionForeground)', fontSize: 11, textAlign: 'center' }}>No history yet</div>}
      {filteredHistory.map(entry => (
        <div
          key={entry.id}
          style={{ ...s.treeItem, justifyContent: 'space-between' }}
          onClick={() => { updateRequest({ method: entry.method, url: entry.url }); setResponse(null) }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
            <span style={{ ...s.badge(METHOD_COLORS[entry.method]), fontSize: 9, padding: '0 4px' }}>{entry.method}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 11 }}>{entry.url}</span>
          </div>
          <span style={{ fontSize: 10, color: statusColor(entry.status), fontWeight: 600, flexShrink: 0 }}>{entry.status}</span>
        </div>
      ))}
      {history.length > 0 && (
        <div style={{ padding: 8, textAlign: 'center' }}>
          <button style={{ ...s.iconBtn, fontSize: 11, color: 'var(--vscode-errorForeground)' }} onClick={() => setHistory([])}>
            <Trash2 size={12} /> Clear History
          </button>
        </div>
      )}
    </div>
  )

  /* ── Sidebar: Environments ───── */
  const renderEnvironments = () => (
    <div>
      <div style={{ padding: '4px 6px', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--vscode-descriptionForeground)' }}>Environments</span>
        <button style={s.iconBtn} title="Add Environment" onClick={() => setEnvironments(prev => [...prev, { id: uid(), name: 'New Env', variables: [{ key: '', value: '' }] }])}><Plus size={14} /></button>
      </div>
      <div style={{ padding: '0 6px', marginBottom: 8 }}>
        <select
          style={{ ...s.kvInput, width: '100%', padding: '4px 6px' }}
          value={activeEnvId}
          onChange={e => setActiveEnvId(e.target.value)}
        >
          {environments.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
        </select>
      </div>
      {environments.filter(e => e.id === activeEnvId).map(env => (
        <div key={env.id} style={{ padding: '0 6px' }}>
          {env.variables.map((v, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
              <input style={{ ...s.kvInput, flex: 1, fontSize: 11 }} placeholder="Key" value={v.key}
                onChange={e => setEnvironments(prev => prev.map(en => en.id === env.id ? { ...en, variables: en.variables.map((vv, vi) => vi === i ? { ...vv, key: e.target.value } : vv) } : en))} />
              <input style={{ ...s.kvInput, flex: 1, fontSize: 11 }} placeholder="Value" value={v.value}
                onChange={e => setEnvironments(prev => prev.map(en => en.id === env.id ? { ...en, variables: en.variables.map((vv, vi) => vi === i ? { ...vv, value: e.target.value } : vv) } : en))} />
            </div>
          ))}
          <button style={{ ...s.iconBtn, fontSize: 11 }} onClick={() => setEnvironments(prev => prev.map(en => en.id === env.id ? { ...en, variables: [...en.variables, { key: '', value: '' }] } : en))}>
            <Plus size={12} /> Add Variable
          </button>
        </div>
      ))}
    </div>
  )

  /* ── KV Table renderer ───────── */
  const renderKVTable = (field: 'headers' | 'params') => (
    <div>
      {activeRequest[field].map(row => (
        <div key={row.id} style={s.kvRow}>
          <input type="checkbox" checked={row.enabled} onChange={e => updateKVRow(field, row.id, { enabled: e.target.checked })} />
          <input style={s.kvInput} placeholder="Key" value={row.key} onChange={e => updateKVRow(field, row.id, { key: e.target.value })} />
          <input style={s.kvInput} placeholder="Value" value={row.value} onChange={e => updateKVRow(field, row.id, { value: e.target.value })} />
          <button style={s.iconBtn} onClick={() => removeKVRow(field, row.id)}><X size={14} /></button>
        </div>
      ))}
      <button style={{ ...s.iconBtn, fontSize: 11, marginTop: 4 }} onClick={() => addKVRow(field)}><Plus size={12} /> Add {field === 'headers' ? 'Header' : 'Parameter'}</button>
    </div>
  )

  /* ── Auth editor ─────────────── */
  const renderAuthEditor = () => {
    const auth = activeRequest.auth
    return (
      <div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginBottom: 4, display: 'block' }}>Auth Type</label>
          <select style={{ ...s.kvInput, padding: '4px 8px', width: 200 }} value={auth.type} onChange={e => updateRequest({ auth: { ...auth, type: e.target.value as AuthConfig['type'] } })}>
            <option value="none">No Auth</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
            <option value="apikey">API Key</option>
          </select>
        </div>
        {auth.type === 'bearer' && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: 4 }}>Token</label>
            <input style={{ ...s.kvInput, width: '100%' }} placeholder="Enter bearer token or {{token}}" value={auth.bearerToken}
              onChange={e => updateRequest({ auth: { ...auth, bearerToken: e.target.value } })} />
          </div>
        )}
        {auth.type === 'basic' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: 4 }}>Username</label>
              <input style={{ ...s.kvInput, width: '100%' }} value={auth.basicUser} onChange={e => updateRequest({ auth: { ...auth, basicUser: e.target.value } })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: 4 }}>Password</label>
              <input style={{ ...s.kvInput, width: '100%' }} type="password" value={auth.basicPass} onChange={e => updateRequest({ auth: { ...auth, basicPass: e.target.value } })} />
            </div>
          </div>
        )}
        {auth.type === 'apikey' && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: 4 }}>Key Name</label>
              <input style={{ ...s.kvInput, width: '100%' }} placeholder="X-API-Key" value={auth.apiKeyName} onChange={e => updateRequest({ auth: { ...auth, apiKeyName: e.target.value } })} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: 4 }}>Value</label>
              <input style={{ ...s.kvInput, width: '100%' }} value={auth.apiKeyValue} onChange={e => updateRequest({ auth: { ...auth, apiKeyValue: e.target.value } })} />
            </div>
            <div style={{ minWidth: 100 }}>
              <label style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', display: 'block', marginBottom: 4 }}>Add to</label>
              <select style={{ ...s.kvInput, padding: '4px 8px' }} value={auth.apiKeyIn} onChange={e => updateRequest({ auth: { ...auth, apiKeyIn: e.target.value as 'header' | 'query' } })}>
                <option value="header">Header</option>
                <option value="query">Query Param</option>
              </select>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── Response: Timing ────────── */
  const renderTiming = () => {
    if (!response) return null
    const t = response.timing
    const segments = [
      { label: 'DNS', value: t.dns, color: '#61affe' },
      { label: 'Connect', value: t.connect, color: '#49cc90' },
      { label: 'TLS', value: t.tls, color: '#9012fe' },
      { label: 'TTFB', value: t.ttfb, color: '#fca130' },
      { label: 'Transfer', value: t.transfer, color: '#f93e3e' },
    ]
    return (
      <div>
        <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600 }}>Total: {t.total.toFixed(0)}ms</div>
        <div style={{ display: 'flex', gap: 2, marginBottom: 16, height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--vscode-input-background)' }}>
          {segments.map(seg => (
            <div key={seg.label} style={s.timingBar(seg.value / t.total * 100, seg.color)} title={`${seg.label}: ${seg.value.toFixed(1)}ms`} />
          ))}
        </div>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <tbody>
            {segments.map(seg => (
              <tr key={seg.label}>
                <td style={{ padding: '4px 8px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: seg.color, marginRight: 6 }} />
                  {seg.label}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)' }}>{seg.value.toFixed(1)}ms</td>
              </tr>
            ))}
            <tr style={{ borderTop: '1px solid var(--vscode-panel-border)', fontWeight: 600 }}>
              <td style={{ padding: '6px 8px' }}>Total</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)' }}>{t.total.toFixed(1)}ms</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  /* ── Response: Body ──────────── */
  const renderResponseBody = () => {
    if (!response) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>Send a request to see the response</div>
    const isJson = response.headers['content-type']?.includes('json')
    const isHtml = response.headers['content-type']?.includes('html')
    return (
      <div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {(['pretty', 'raw', 'preview'] as BodyPreviewMode[]).map(mode => (
            <button key={mode} style={{ ...s.iconBtn, padding: '2px 8px', fontSize: 11, borderRadius: 3, background: bodyPreview === mode ? 'var(--vscode-button-background)' : 'transparent', color: bodyPreview === mode ? 'var(--vscode-button-foreground)' : undefined }}>
              <span onClick={() => setBodyPreview(mode)}>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
            </button>
          ))}
        </div>
        {bodyPreview === 'pretty' && isJson && (() => {
          try {
            const parsed = JSON.parse(response.body)
            return <div style={{ fontFamily: 'var(--vscode-editor-font-family)', fontSize: 12 }}><JsonTreeNode label="root" value={parsed} depth={0} /></div>
          } catch {
            return <pre style={s.codeBlock}>{response.body}</pre>
          }
        })()}
        {bodyPreview === 'pretty' && !isJson && <pre style={s.codeBlock}>{response.body}</pre>}
        {bodyPreview === 'raw' && <pre style={s.codeBlock}>{response.body}</pre>}
        {bodyPreview === 'preview' && isHtml && <div dangerouslySetInnerHTML={{ __html: response.body }} />}
        {bodyPreview === 'preview' && !isHtml && <pre style={s.codeBlock}>{response.body}</pre>}
      </div>
    )
  }

  /* ── Code Generation Modal ───── */
  const renderCodeGenModal = () => {
    if (!showCodeGen) return null
    return (
      <div style={s.overlay as React.CSSProperties} onClick={() => setShowCodeGen(false)}>
        <div style={s.modal as React.CSSProperties} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>Generate Code</h3>
            <button style={s.iconBtn} onClick={() => setShowCodeGen(false)}><X size={16} /></button>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {(['curl', 'fetch', 'axios', 'python', 'go'] as CodeGenLang[]).map(lang => (
              <button
                key={lang}
                style={{ ...s.iconBtn, padding: '4px 10px', fontSize: 11, borderRadius: 3, background: codeGenLang === lang ? 'var(--vscode-button-background)' : 'var(--vscode-input-background)', color: codeGenLang === lang ? 'var(--vscode-button-foreground)' : undefined }}
                onClick={() => setCodeGenLang(lang)}
              >
                {lang === 'curl' ? 'cURL' : lang === 'python' ? 'Python' : lang === 'go' ? 'Go' : lang}
              </button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <pre style={s.codeBlock}>{generatedCode}</pre>
            <button
              style={{ ...s.iconBtn, position: 'absolute', top: 8, right: 8, background: 'var(--vscode-button-secondaryBackground)', borderRadius: 3, padding: '3px 6px' }}
              onClick={() => navigator.clipboard?.writeText(generatedCode)}
              title="Copy to clipboard"
            >
              <Copy size={14} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ── Render ──────────────────── */
  return (
    <div style={s.root}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sidebarTabs}>
          <div style={s.sidebarTab(sidebarTab === 'collections')} onClick={() => setSidebarTab('collections')}><Layers size={12} style={{ marginBottom: 2 }} /><div>Collections</div></div>
          <div style={s.sidebarTab(sidebarTab === 'history')} onClick={() => setSidebarTab('history')}><History size={12} style={{ marginBottom: 2 }} /><div>History</div></div>
          <div style={s.sidebarTab(sidebarTab === 'environments')} onClick={() => setSidebarTab('environments')}><Settings size={12} style={{ marginBottom: 2 }} /><div>Env</div></div>
        </div>
        <div style={s.sidebarBody}>
          {sidebarTab === 'collections' && renderCollections()}
          {sidebarTab === 'history' && renderHistory()}
          {sidebarTab === 'environments' && renderEnvironments()}
        </div>
      </div>

      {/* Main area */}
      <div style={s.main}>
        {/* URL Bar */}
        <div style={s.urlBar}>
          <select style={s.methodSelect(activeRequest.method)} value={activeRequest.method} onChange={e => updateRequest({ method: e.target.value as HttpMethod })}>
            {(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as HttpMethod[]).map(m => (
              <option key={m} value={m} style={{ color: METHOD_COLORS[m] }}>{m}</option>
            ))}
          </select>
          <input
            ref={urlRef}
            style={s.urlInput}
            placeholder="Enter request URL or paste cURL..."
            value={activeRequest.url}
            onChange={e => updateRequest({ url: e.target.value })}
            onKeyDown={e => e.key === 'Enter' && sendRequest()}
          />
          <button style={s.sendBtn} onClick={sendRequest} disabled={loading}>
            {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
            Send
          </button>
          <button style={s.iconBtn} title="Save Request" onClick={saveRequestToCollection}><Save size={16} /></button>
          <button style={s.iconBtn} title="Generate Code" onClick={() => setShowCodeGen(true)}><Code size={16} /></button>
        </div>

        {/* Request / Response split */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Request config tabs */}
          <div style={s.tabRow}>
            {(['params', 'headers', 'body', 'auth'] as RequestTab[]).map(tab => (
              <div key={tab} style={s.tab(requestTab === tab)} onClick={() => setRequestTab(tab)}>
                {tab === 'params' && <><Globe size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Params {activeRequest.params.filter(p => p.enabled && p.key).length > 0 && <span style={s.badge('#61affe')}>{activeRequest.params.filter(p => p.enabled && p.key).length}</span>}</>}
                {tab === 'headers' && <><FileText size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Headers {activeRequest.headers.filter(h => h.enabled && h.key).length > 0 && <span style={s.badge('#49cc90')}>{activeRequest.headers.filter(h => h.enabled && h.key).length}</span>}</>}
                {tab === 'body' && <><BookOpen size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Body</>}
                {tab === 'auth' && <><Lock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Auth {activeRequest.auth.type !== 'none' && <span style={s.badge('#9012fe')}>{activeRequest.auth.type}</span>}</>}
              </div>
            ))}
          </div>

          {/* Request config panel */}
          <div style={{ ...s.panel, maxHeight: 200, flex: 'none' }}>
            {requestTab === 'params' && renderKVTable('params')}
            {requestTab === 'headers' && renderKVTable('headers')}
            {requestTab === 'body' && (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  {(['json', 'form', 'raw'] as const).map(bt => (
                    <label key={bt} style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="radio" name="bodyType" checked={activeRequest.bodyType === bt} onChange={() => updateRequest({ bodyType: bt })} />
                      {bt === 'json' ? 'JSON' : bt === 'form' ? 'Form Data' : 'Raw'}
                    </label>
                  ))}
                </div>
                <textarea
                  style={s.textarea as React.CSSProperties}
                  placeholder={activeRequest.bodyType === 'json' ? '{\n  "key": "value"\n}' : 'Request body...'}
                  value={activeRequest.bodyContent}
                  onChange={e => updateRequest({ bodyContent: e.target.value })}
                />
              </div>
            )}
            {requestTab === 'auth' && renderAuthEditor()}
          </div>

          {/* Response section */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderTop: '2px solid var(--vscode-panel-border)' }}>
            {response && (
              <div style={s.responseStatus(response.status)}>
                <span style={s.badge(statusColor(response.status))}>{response.status} {response.statusText}</span>
                <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 11 }}>Time: {response.timing.total.toFixed(0)}ms</span>
                <span style={{ color: 'var(--vscode-descriptionForeground)', fontSize: 11 }}>Size: {response.size}B</span>
              </div>
            )}
            <div style={s.tabRow}>
              {(['body', 'headers', 'timing'] as ResponseTab[]).map(tab => (
                <div key={tab} style={s.tab(responseTab === tab)} onClick={() => setResponseTab(tab)}>
                  {tab === 'body' && <><Eye size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Body</>}
                  {tab === 'headers' && <><FileText size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Headers {response ? <span style={s.badge('#49cc90')}>{Object.keys(response.headers).length}</span> : null}</>}
                  {tab === 'timing' && <><Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />Timing</>}
                </div>
              ))}
            </div>
            <div style={{ ...s.panel, flex: 1 }}>
              {responseTab === 'body' && renderResponseBody()}
              {responseTab === 'headers' && response && (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <tbody>
                    {Object.entries(response.headers).map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}>
                        <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--vscode-debugTokenExpression-name)', whiteSpace: 'nowrap' }}>{k}</td>
                        <td style={{ padding: '4px 8px', fontFamily: 'var(--vscode-editor-font-family)' }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {responseTab === 'timing' && renderTiming()}
              {responseTab !== 'body' && !response && (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>Send a request to see response details</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Code Gen Modal */}
      {renderCodeGenModal()}

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
