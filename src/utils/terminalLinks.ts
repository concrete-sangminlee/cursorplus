/**
 * Terminal Link Detection & Handling System
 *
 * Detects clickable links in terminal output: file paths, URLs, file:line:col
 * patterns, npm packages, git hashes, IP addresses, and language-specific error
 * patterns (TypeScript, Python, Rust, Go, Java). Provides Ctrl+Click activation,
 * hover tooltips, decorations, custom link providers, and per-buffer caching.
 */

// ---------------------------------------------------------------------------
// Enums & Constants
// ---------------------------------------------------------------------------

export enum LinkType {
  FilePath = 'file-path',
  URL = 'url',
  FileLineColumn = 'file-line-column',
  NpmPackage = 'npm-package',
  GitHash = 'git-hash',
  IPAddress = 'ip-address',
  TypeScriptError = 'typescript-error',
  PythonError = 'python-error',
  RustError = 'rust-error',
  GoError = 'go-error',
  JavaError = 'java-error',
}

export enum LinkActivation { CtrlClick = 'ctrl-click', Click = 'click', DoubleClick = 'double-click' }

export const LINK_COLORS: Record<LinkType, string> = {
  [LinkType.FilePath]: '#4fc1ff',       [LinkType.URL]: '#3794ff',
  [LinkType.FileLineColumn]: '#4fc1ff', [LinkType.NpmPackage]: '#c586c0',
  [LinkType.GitHash]: '#dcdcaa',        [LinkType.IPAddress]: '#ce9178',
  [LinkType.TypeScriptError]: '#f44747',[LinkType.PythonError]: '#f44747',
  [LinkType.RustError]: '#f44747',      [LinkType.GoError]: '#f44747',
  [LinkType.JavaError]: '#f44747',
}

const MAX_CACHE_SIZE = 2000
const MAX_LINE_SCAN_LENGTH = 4096
const GIT_HASH_MIN_LENGTH = 7

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalLink {
  id: string
  type: LinkType
  text: string
  range: LinkRange
  target: LinkTarget
  tooltip: string
  decoration: LinkDecoration
}

export interface LinkRange {
  startLine: number; startColumn: number; endLine: number; endColumn: number
}

export interface LinkTarget {
  uri: string; filePath?: string; line?: number; column?: number; fragment?: string
}

export interface LinkDecoration {
  color: string; underline: boolean; bold: boolean; cursor: string
}

export interface LinkPattern {
  id: string
  type: LinkType
  regex: RegExp
  priority: number
  handler: LinkHandler
  tooltipFormatter?: (match: RegExpExecArray) => string
  targetResolver?: (match: RegExpExecArray, cwd: string) => LinkTarget | null
}

export interface LinkHandler {
  activate: (link: TerminalLink, event: LinkActivationEvent) => void
  hover?: (link: TerminalLink) => void
  leave?: (link: TerminalLink) => void
}

export interface LinkActivationEvent {
  ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; button: number
}

export interface CustomLinkProvider {
  detectLinks: (line: string, lineNumber: number, cwd: string) => TerminalLink[]
  handleActivation?: (link: TerminalLink, event: LinkActivationEvent) => boolean
}

export interface LinkTooltip {
  text: string; position: { x: number; y: number }; visible: boolean; linkId: string | null
}

export interface TerminalLinkProviderOptions {
  workspacePath: string
  activationMode?: LinkActivation
  enableCaching?: boolean
  cacheMaxAge?: number
  maxLineScanLength?: number
  fileExistenceChecker?: (path: string) => Promise<boolean>
  onOpenFile?: (path: string, line?: number, column?: number) => void
  onOpenURL?: (url: string) => void
  onNavigateToHash?: (hash: string) => void
}

interface LinkCacheEntry { links: TerminalLink[]; timestamp: number; lineHash: string }

interface ProviderRegistration {
  id: string; provider: CustomLinkProvider; priority: number; disposer: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nid = 1
const lid = () => `tlink_${_nid++}`

function hashLine(line: string): string {
  let h = 0
  for (let i = 0; i < line.length; i++) h = ((h << 5) - h + line.charCodeAt(i)) | 0
  return h.toString(36)
}

function isAbsolute(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p) || p.startsWith('~/')
}

function resolve(p: string, cwd: string): string {
  if (isAbsolute(p)) return p
  return `${cwd}${cwd.includes('\\') ? '\\' : '/'}${p}`
}

/** Build a file-target from regex groups: m[fileIdx], m[lineIdx], m[colIdx?] */
function fileTarget(m: RegExpExecArray, cwd: string, fi: number, li: number, ci?: number): LinkTarget {
  const fp = resolve(m[fi], cwd)
  return {
    uri: fp, filePath: fp,
    line: parseInt(m[li], 10),
    ...(ci !== undefined && m[ci] ? { column: parseInt(m[ci], 10) } : {}),
  }
}

function fileTip(m: RegExpExecArray, fi: number, li: number, ci?: number): string {
  const col = ci !== undefined && m[ci] ? `, column ${m[ci]}` : ''
  return `Open ${m[fi]} at line ${m[li]}${col}`
}

// ---------------------------------------------------------------------------
// Built-in Patterns
// ---------------------------------------------------------------------------

const BUILTIN_PATTERNS: Omit<LinkPattern, 'handler'>[] = [
  // URLs
  { id: 'url', type: LinkType.URL, priority: 100,
    regex: /\bhttps?:\/\/[^\s"'`<>)\]},;]+|ftp:\/\/[^\s"'`<>)\]},;]+/g,
    tooltipFormatter: (m) => `Open URL: ${m[0]}`,
    targetResolver: (m) => ({ uri: m[0] }) },
  // TypeScript: file(line,col): error TS...
  { id: 'ts-error', type: LinkType.TypeScriptError, priority: 95,
    regex: /([^\s(]+)\((\d+),(\d+)\):\s*error\s+TS\d+/g,
    tooltipFormatter: (m) => fileTip(m, 1, 2, 3),
    targetResolver: (m, cwd) => fileTarget(m, cwd, 1, 2, 3) },
  // Python: File "path", line N
  { id: 'py-error', type: LinkType.PythonError, priority: 94,
    regex: /File\s+"([^"]+)",\s+line\s+(\d+)/g,
    tooltipFormatter: (m) => fileTip(m, 1, 2),
    targetResolver: (m, cwd) => fileTarget(m, cwd, 1, 2) },
  // Rust: --> file:line:col
  { id: 'rs-error', type: LinkType.RustError, priority: 93,
    regex: /-->\s+([^\s:]+):(\d+):(\d+)/g,
    tooltipFormatter: (m) => fileTip(m, 1, 2, 3),
    targetResolver: (m, cwd) => fileTarget(m, cwd, 1, 2, 3) },
  // Go: file.go:line:col
  { id: 'go-error', type: LinkType.GoError, priority: 92,
    regex: /([^\s]+\.go):(\d+):(\d+)/g,
    tooltipFormatter: (m) => fileTip(m, 1, 2, 3),
    targetResolver: (m, cwd) => fileTarget(m, cwd, 1, 2, 3) },
  // Java: at Class.method(File.java:line)
  { id: 'java-error', type: LinkType.JavaError, priority: 91,
    regex: /at\s+[\w$.]+\(([A-Za-z][\w]*\.java):(\d+)\)/g,
    tooltipFormatter: (m) => fileTip(m, 1, 2),
    targetResolver: (m, cwd) => fileTarget(m, cwd, 1, 2) },
  // Generic file:line:column
  { id: 'file-line-col', type: LinkType.FileLineColumn, priority: 80,
    regex: /(?<![/\w])([.\w][\w./\\-]+\.\w+):(\d+):(\d+)/g,
    tooltipFormatter: (m) => fileTip(m, 1, 2, 3),
    targetResolver: (m, cwd) => fileTarget(m, cwd, 1, 2, 3) },
  // file:line (no column)
  { id: 'file-line', type: LinkType.FileLineColumn, priority: 75,
    regex: /(?<![/\w:])([.\w][\w./\\-]+\.\w+):(\d+)(?!:)/g,
    tooltipFormatter: (m) => fileTip(m, 1, 2),
    targetResolver: (m, cwd) => fileTarget(m, cwd, 1, 2) },
  // Absolute file paths
  { id: 'abs-path', type: LinkType.FilePath, priority: 60,
    regex: /(?:\/[\w.-]+)+|[A-Za-z]:[\\\/][\w.\-\\\/]+/g,
    tooltipFormatter: (m) => `Open file: ${m[0]}`,
    targetResolver: (m) => ({ uri: m[0], filePath: m[0] }) },
  // Relative file paths with extension
  { id: 'rel-path', type: LinkType.FilePath, priority: 50,
    regex: /(?:\.\/|\.\.\/)?(?:[\w.-]+\/)+[\w.-]+\.\w{1,10}/g,
    tooltipFormatter: (m) => `Open file: ${m[0]}`,
    targetResolver: (m, cwd) => ({ uri: resolve(m[0], cwd), filePath: resolve(m[0], cwd) }) },
  // npm package in node_modules
  { id: 'npm-pkg', type: LinkType.NpmPackage, priority: 40,
    regex: /node_modules\/((?:@[\w.-]+\/)?[\w.-]+)/g,
    tooltipFormatter: (m) => `npm package: ${m[1]}`,
    targetResolver: (m) => ({ uri: `https://www.npmjs.com/package/${m[1]}`, fragment: m[1] }) },
  // Git commit hashes (7-40 hex chars)
  { id: 'git-hash', type: LinkType.GitHash, priority: 30,
    regex: /\b([0-9a-f]{7,40})\b/g,
    tooltipFormatter: (m) => `Git commit: ${m[1].slice(0, 12)}`,
    targetResolver: (m) => ({ uri: `git:${m[1]}`, fragment: m[1] }) },
  // IP addresses with optional port
  { id: 'ip-addr', type: LinkType.IPAddress, priority: 20,
    regex: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d{1,5}))?\b/g,
    tooltipFormatter: (m) => m[2] ? `Open http://${m[1]}:${m[2]}` : `IP: ${m[1]}`,
    targetResolver: (m) => ({ uri: m[2] ? `http://${m[1]}:${m[2]}` : `http://${m[1]}` }) },
]

// ---------------------------------------------------------------------------
// Custom Pattern Registry (module-level, shared across providers)
// ---------------------------------------------------------------------------

const _customPatterns: LinkPattern[] = []

/**
 * Register a custom link detection pattern globally. Returns a disposer.
 */
export function registerLinkPattern(
  pattern: Omit<LinkPattern, 'id'> & { id?: string }
): () => void {
  const full = { ...pattern, id: pattern.id ?? `custom_${_nid++}` } as LinkPattern
  _customPatterns.push(full)
  return () => {
    const i = _customPatterns.indexOf(full)
    if (i !== -1) _customPatterns.splice(i, 1)
  }
}

// ---------------------------------------------------------------------------
// detectLinks (standalone export)
// ---------------------------------------------------------------------------

/**
 * Detect all links in terminal lines. Returns a flat sorted list.
 */
export function detectLinks(
  lines: string[],
  cwd: string,
  extra?: LinkPattern[]
): TerminalLink[] {
  const patterns = buildPatterns(extra)
  const out: TerminalLink[] = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i] || lines[i].length > MAX_LINE_SCAN_LENGTH) continue
    out.push(...matchLine(lines[i], i, cwd, patterns))
  }
  return dedupe(out)
}

// ---------------------------------------------------------------------------
// Pattern building & matching
// ---------------------------------------------------------------------------

function buildPatterns(extra?: LinkPattern[]): LinkPattern[] {
  const noop: LinkHandler = { activate: () => {} }
  const all: LinkPattern[] = [
    ...BUILTIN_PATTERNS.map((p) => ({ ...p, handler: noop })),
    ..._customPatterns,
    ...(extra ?? []),
  ]
  all.sort((a, b) => b.priority - a.priority)
  return all
}

function matchLine(line: string, lineNum: number, cwd: string, patterns: LinkPattern[]): TerminalLink[] {
  const results: TerminalLink[] = []
  const claimed = new Set<number>()

  for (const pat of patterns) {
    pat.regex.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pat.regex.exec(line)) !== null) {
      const s = m.index, e = s + m[0].length
      // Skip overlapping ranges
      let skip = false
      for (let c = s; c < e; c++) { if (claimed.has(c)) { skip = true; break } }
      if (skip) continue
      // Validate git hashes (not all-digit, min length)
      if (pat.type === LinkType.GitHash) {
        const h = m[1] ?? m[0]
        if (h.length < GIT_HASH_MIN_LENGTH || /^\d+$/.test(h)) continue
      }
      // Validate IP octets and port range
      if (pat.type === LinkType.IPAddress) {
        const octets = (m[1] ?? m[0]).split('.')
        if (octets.some((o) => parseInt(o, 10) > 255)) continue
        if (m[2] && parseInt(m[2], 10) > 65535) continue
      }
      const target = pat.targetResolver ? pat.targetResolver(m, cwd) : { uri: m[0] }
      if (!target) continue
      const tooltip = pat.tooltipFormatter ? pat.tooltipFormatter(m) : `Open: ${m[0]}`
      for (let c = s; c < e; c++) claimed.add(c)
      results.push({
        id: lid(), type: pat.type, text: m[0], tooltip, target,
        range: { startLine: lineNum, startColumn: s, endLine: lineNum, endColumn: e },
        decoration: { color: LINK_COLORS[pat.type], underline: true, bold: false, cursor: 'pointer' },
      })
    }
  }
  return results
}

function dedupe(links: TerminalLink[]): TerminalLink[] {
  const seen = new Map<string, TerminalLink>()
  for (const l of links) {
    const k = `${l.range.startLine}:${l.range.startColumn}:${l.range.endColumn}`
    if (!seen.has(k)) seen.set(k, l)
  }
  return [...seen.values()].sort(
    (a, b) => a.range.startLine - b.range.startLine || a.range.startColumn - b.range.startColumn
  )
}

// ---------------------------------------------------------------------------
// Link Cache (per terminal buffer)
// ---------------------------------------------------------------------------

class LinkCache {
  private entries = new Map<string, LinkCacheEntry>()
  constructor(private maxAge = 30_000) {}

  get(lineNum: number, lh: string): TerminalLink[] | null {
    const key = String(lineNum)
    const e = this.entries.get(key)
    if (!e || e.lineHash !== lh || Date.now() - e.timestamp > this.maxAge) {
      if (e) this.entries.delete(key)
      return null
    }
    return e.links
  }

  set(lineNum: number, lh: string, links: TerminalLink[]): void {
    if (this.entries.size >= MAX_CACHE_SIZE) {
      const sorted = [...this.entries.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)
      for (let i = 0, n = Math.floor(MAX_CACHE_SIZE * 0.25); i < n; i++) {
        this.entries.delete(sorted[i][0])
      }
    }
    this.entries.set(String(lineNum), { links, timestamp: Date.now(), lineHash: lh })
  }

  invalidate(lineNum: number): void { this.entries.delete(String(lineNum)) }
  clear(): void { this.entries.clear() }
  get size(): number { return this.entries.size }
}

// ---------------------------------------------------------------------------
// Tooltip Controller
// ---------------------------------------------------------------------------

class TooltipCtrl {
  private _s: LinkTooltip = { text: '', position: { x: 0, y: 0 }, visible: false, linkId: null }
  private _timer: ReturnType<typeof setTimeout> | null = null
  private _subs: Array<(s: LinkTooltip) => void> = []

  get state(): LinkTooltip { return { ...this._s } }

  subscribe(fn: (s: LinkTooltip) => void): () => void {
    this._subs.push(fn)
    return () => { this._subs = this._subs.filter((f) => f !== fn) }
  }

  show(link: TerminalLink, x: number, y: number): void {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    this._s = { text: link.tooltip, position: { x, y: y - 28 }, visible: true, linkId: link.id }
    this._emit()
  }

  hide(delay = 150): void {
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => {
      this._s = { text: '', position: { x: 0, y: 0 }, visible: false, linkId: null }
      this._timer = null
      this._emit()
    }, delay)
  }

  hideNow(): void {
    if (this._timer) { clearTimeout(this._timer); this._timer = null }
    this._s = { text: '', position: { x: 0, y: 0 }, visible: false, linkId: null }
    this._emit()
  }

  private _emit(): void { for (const fn of this._subs) fn(this.state) }

  dispose(): void {
    if (this._timer) clearTimeout(this._timer)
    this._subs = []
  }
}

// ---------------------------------------------------------------------------
// TerminalLinkProvider – main class
// ---------------------------------------------------------------------------

export class TerminalLinkProvider {
  private readonly opts: Required<TerminalLinkProviderOptions>
  private readonly cache: LinkCache
  private readonly tooltip = new TooltipCtrl()
  private readonly providers: ProviderRegistration[] = []
  private readonly patterns: LinkPattern[]
  private active: TerminalLink | null = null
  private ctrlHeld = false
  private disposed = false

  constructor(options: TerminalLinkProviderOptions) {
    this.opts = {
      activationMode: LinkActivation.CtrlClick,
      enableCaching: true,
      cacheMaxAge: 30_000,
      maxLineScanLength: MAX_LINE_SCAN_LENGTH,
      fileExistenceChecker: async () => true,
      onOpenFile: () => {},
      onOpenURL: () => {},
      onNavigateToHash: () => {},
      ...options,
    }
    this.cache = new LinkCache(this.opts.cacheMaxAge)
    this.patterns = buildPatterns()
    this._bindKeys()
  }

  // ── Key tracking ─────────────────────────────────────

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Control' || e.key === 'Meta') this.ctrlHeld = true
  }

  private _onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Control' || e.key === 'Meta') {
      this.ctrlHeld = false
      this.tooltip.hideNow()
    }
  }

  private _bindKeys(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }

  private _unbindKeys(): void {
    if (typeof window === 'undefined') return
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
  }

  // ── Custom provider registration ────────────────────

  registerProvider(provider: CustomLinkProvider, priority = 50): () => void {
    const reg: ProviderRegistration = {
      id: `cp_${_nid++}`, provider, priority,
      disposer: () => {
        const i = this.providers.indexOf(reg)
        if (i !== -1) this.providers.splice(i, 1)
      },
    }
    this.providers.push(reg)
    this.providers.sort((a, b) => b.priority - a.priority)
    return reg.disposer
  }

  // ── Detection ───────────────────────────────────────

  detectLinksForLine(line: string, lineNumber: number): TerminalLink[] {
    if (this.disposed || !line || line.length > this.opts.maxLineScanLength) return []
    const lh = hashLine(line)
    if (this.opts.enableCaching) {
      const cached = this.cache.get(lineNumber, lh)
      if (cached) return cached
    }
    const links = matchLine(line, lineNumber, this.opts.workspacePath, this.patterns)
    for (const reg of this.providers) {
      try { links.push(...reg.provider.detectLinks(line, lineNumber, this.opts.workspacePath)) }
      catch { /* faulty provider */ }
    }
    const result = dedupe(links)
    if (this.opts.enableCaching) this.cache.set(lineNumber, lh, result)
    return result
  }

  detectLinksForBuffer(lines: string[]): TerminalLink[] {
    const out: TerminalLink[] = []
    for (let i = 0; i < lines.length; i++) out.push(...this.detectLinksForLine(lines[i], i))
    return out
  }

  // ── Hit testing ─────────────────────────────────────

  getLinkAt(line: number, col: number, buf: string[]): TerminalLink | null {
    if (line < 0 || line >= buf.length) return null
    return this.detectLinksForLine(buf[line], line)
      .find((l) => col >= l.range.startColumn && col < l.range.endColumn) ?? null
  }

  // ── Mouse handling ──────────────────────────────────

  handleMouseMove(
    line: number, col: number, cx: number, cy: number, buf: string[]
  ): { link: TerminalLink | null; cursor: string } {
    if (this.disposed) return { link: null, cursor: 'default' }
    const link = this.getLinkAt(line, col, buf)
    if (!link) {
      if (this.active) { this.active = null; this.tooltip.hide() }
      return { link: null, cursor: 'default' }
    }
    const needsMod = this.opts.activationMode === LinkActivation.CtrlClick
    if (link.id !== this.active?.id) {
      this.active = link
      if (!needsMod || this.ctrlHeld) this.tooltip.show(link, cx, cy)
    }
    return { link, cursor: (!needsMod || this.ctrlHeld) ? 'pointer' : 'default' }
  }

  handleClick(line: number, col: number, ev: LinkActivationEvent, buf: string[]): boolean {
    if (this.disposed) return false
    const link = this.getLinkAt(line, col, buf)
    if (!link) return false
    if (this.opts.activationMode === LinkActivation.CtrlClick && !ev.ctrlKey && !ev.metaKey) {
      return false
    }
    // Custom providers get first crack
    for (const reg of this.providers) {
      if (reg.provider.handleActivation?.(link, ev)) return true
    }
    this._activate(link)
    this.tooltip.hideNow()
    return true
  }

  private _activate(link: TerminalLink): void {
    switch (link.type) {
      case LinkType.URL:
      case LinkType.NpmPackage:
      case LinkType.IPAddress:
        this.opts.onOpenURL(link.target.uri)
        break
      case LinkType.FilePath:
      case LinkType.FileLineColumn:
      case LinkType.TypeScriptError:
      case LinkType.PythonError:
      case LinkType.RustError:
      case LinkType.GoError:
      case LinkType.JavaError:
        if (link.target.filePath) {
          this.opts.onOpenFile(link.target.filePath, link.target.line, link.target.column)
        }
        break
      case LinkType.GitHash:
        if (link.target.fragment) this.opts.onNavigateToHash(link.target.fragment)
        break
    }
  }

  // ── Tooltip access ──────────────────────────────────

  getTooltipState(): LinkTooltip { return this.tooltip.state }
  subscribeTooltip(fn: (s: LinkTooltip) => void): () => void { return this.tooltip.subscribe(fn) }

  // ── Decoration helpers ──────────────────────────────

  getDecorationCSS(link: TerminalLink, hovered: boolean): string {
    const d = link.decoration
    const parts = [`color: ${d.color}`]
    if (d.underline && hovered) parts.push('text-decoration: underline')
    if (d.bold) parts.push('font-weight: bold')
    parts.push(`cursor: ${d.cursor}`)
    return parts.join('; ')
  }

  static getDecorationClassName(link: TerminalLink): string {
    return `terminal-link terminal-link--${link.type}`
  }

  // ── Cache management ────────────────────────────────

  invalidateLine(n: number): void { this.cache.invalidate(n) }
  clearCache(): void { this.cache.clear() }
  get cacheSize(): number { return this.cache.size }

  // ── Lifecycle ───────────────────────────────────────

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this._unbindKeys()
    this.tooltip.dispose()
    this.cache.clear()
    this.providers.length = 0
    this.active = null
  }
}
