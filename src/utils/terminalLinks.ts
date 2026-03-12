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

export enum LinkActivation {
  CtrlClick = 'ctrl-click',
  Click = 'click',
  DoubleClick = 'double-click',
}

export const LINK_COLORS: Record<LinkType, string> = {
  [LinkType.FilePath]: '#4fc1ff',
  [LinkType.URL]: '#3794ff',
  [LinkType.FileLineColumn]: '#4fc1ff',
  [LinkType.NpmPackage]: '#c586c0',
  [LinkType.GitHash]: '#dcdcaa',
  [LinkType.IPAddress]: '#ce9178',
  [LinkType.TypeScriptError]: '#f44747',
  [LinkType.PythonError]: '#f44747',
  [LinkType.RustError]: '#f44747',
  [LinkType.GoError]: '#f44747',
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
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface LinkTarget {
  uri: string
  filePath?: string
  line?: number
  column?: number
  fragment?: string
}

export interface LinkDecoration {
  color: string
  underline: boolean
  bold: boolean
  cursor: string
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
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
  button: number
}

export interface LinkProviderRegistration {
  id: string
  provider: CustomLinkProvider
  priority: number
  disposer: () => void
}

export interface CustomLinkProvider {
  detectLinks: (line: string, lineNumber: number, cwd: string) => TerminalLink[]
  handleActivation?: (link: TerminalLink, event: LinkActivationEvent) => boolean
}

export interface LinkCacheEntry {
  links: TerminalLink[]
  timestamp: number
  lineHash: string
}

export interface LinkTooltip {
  text: string
  position: { x: number; y: number }
  visible: boolean
  linkId: string | null
}

export interface TerminalLinkProviderOptions {
  workspacePath: string
  activationMode: LinkActivation
  enableCaching: boolean
  cacheMaxAge: number
  maxLineScanLength: number
  fileExistenceChecker?: (path: string) => Promise<boolean>
  onOpenFile?: (path: string, line?: number, column?: number) => void
  onOpenURL?: (url: string) => void
  onNavigateToHash?: (hash: string) => void
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _nextLinkId = 1
function linkId(): string {
  return `tlink_${_nextLinkId++}`
}

// ---------------------------------------------------------------------------
// Simple string hash for cache keying
// ---------------------------------------------------------------------------

function hashLine(line: string): string {
  let h = 0
  for (let i = 0; i < line.length; i++) {
    h = ((h << 5) - h + line.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

function isAbsolutePath(p: string): boolean {
  return (
    p.startsWith('/') ||
    /^[A-Za-z]:[/\\]/.test(p) ||
    p.startsWith('~/')
  )
}

function resolvePath(p: string, cwd: string): string {
  if (isAbsolutePath(p)) return p
  const sep = cwd.includes('\\') ? '\\' : '/'
  return `${cwd}${sep}${p}`
}

// ---------------------------------------------------------------------------
// Built-in regex patterns
// ---------------------------------------------------------------------------

const BUILTIN_PATTERNS: Omit<LinkPattern, 'handler'>[] = [
  // URLs (http, https, ftp)
  {
    id: 'url',
    type: LinkType.URL,
    regex: /\bhttps?:\/\/[^\s"'`<>)\]},;]+|ftp:\/\/[^\s"'`<>)\]},;]+/g,
    priority: 100,
    tooltipFormatter: (m) => `Open URL: ${m[0]}`,
    targetResolver: (m) => ({ uri: m[0] }),
  },
  // TypeScript: file(line,col): error TS...
  {
    id: 'typescript-error',
    type: LinkType.TypeScriptError,
    regex: /([^\s(]+)\((\d+),(\d+)\):\s*error\s+TS\d+/g,
    priority: 95,
    tooltipFormatter: (m) => `Open ${m[1]} at line ${m[2]}, column ${m[3]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[1], cwd),
      filePath: resolvePath(m[1], cwd),
      line: parseInt(m[2], 10),
      column: parseInt(m[3], 10),
    }),
  },
  // Python: File "path", line N
  {
    id: 'python-error',
    type: LinkType.PythonError,
    regex: /File\s+"([^"]+)",\s+line\s+(\d+)/g,
    priority: 94,
    tooltipFormatter: (m) => `Open ${m[1]} at line ${m[2]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[1], cwd),
      filePath: resolvePath(m[1], cwd),
      line: parseInt(m[2], 10),
    }),
  },
  // Rust: --> file:line:col
  {
    id: 'rust-error',
    type: LinkType.RustError,
    regex: /-->\s+([^\s:]+):(\d+):(\d+)/g,
    priority: 93,
    tooltipFormatter: (m) => `Open ${m[1]} at line ${m[2]}, column ${m[3]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[1], cwd),
      filePath: resolvePath(m[1], cwd),
      line: parseInt(m[2], 10),
      column: parseInt(m[3], 10),
    }),
  },
  // Go: file.go:line:col
  {
    id: 'go-error',
    type: LinkType.GoError,
    regex: /([^\s]+\.go):(\d+):(\d+)/g,
    priority: 92,
    tooltipFormatter: (m) => `Open ${m[1]} at line ${m[2]}, column ${m[3]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[1], cwd),
      filePath: resolvePath(m[1], cwd),
      line: parseInt(m[2], 10),
      column: parseInt(m[3], 10),
    }),
  },
  // Java: at Class.method(File.java:line)
  {
    id: 'java-error',
    type: LinkType.JavaError,
    regex: /at\s+[\w$.]+\(([A-Za-z][\w]*\.java):(\d+)\)/g,
    priority: 91,
    tooltipFormatter: (m) => `Open ${m[1]} at line ${m[2]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[1], cwd),
      filePath: resolvePath(m[1], cwd),
      line: parseInt(m[2], 10),
    }),
  },
  // Generic file:line:column (e.g., src/App.tsx:42:10)
  {
    id: 'file-line-column',
    type: LinkType.FileLineColumn,
    regex: /(?<![/\w])([.\w][\w./\\-]+\.\w+):(\d+):(\d+)/g,
    priority: 80,
    tooltipFormatter: (m) => `Open ${m[1]} at line ${m[2]}, column ${m[3]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[1], cwd),
      filePath: resolvePath(m[1], cwd),
      line: parseInt(m[2], 10),
      column: parseInt(m[3], 10),
    }),
  },
  // file:line (no column)
  {
    id: 'file-line',
    type: LinkType.FileLineColumn,
    regex: /(?<![/\w:])([.\w][\w./\\-]+\.\w+):(\d+)(?!:)/g,
    priority: 75,
    tooltipFormatter: (m) => `Open ${m[1]} at line ${m[2]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[1], cwd),
      filePath: resolvePath(m[1], cwd),
      line: parseInt(m[2], 10),
    }),
  },
  // Absolute file paths (/foo/bar or C:\foo\bar)
  {
    id: 'absolute-path',
    type: LinkType.FilePath,
    regex: /(?:\/[\w.-]+)+(?:\/[\w.-]+)*|[A-Za-z]:[\\\/][\w.\-\\\/]+/g,
    priority: 60,
    tooltipFormatter: (m) => `Open file: ${m[0]}`,
    targetResolver: (m) => ({
      uri: m[0],
      filePath: m[0],
    }),
  },
  // Relative file paths with extension (e.g., ./src/main.ts, src/index.js)
  {
    id: 'relative-path',
    type: LinkType.FilePath,
    regex: /(?:\.\/|\.\.\/)?(?:[\w.-]+\/)+[\w.-]+\.\w{1,10}/g,
    priority: 50,
    tooltipFormatter: (m) => `Open file: ${m[0]}`,
    targetResolver: (m, cwd) => ({
      uri: resolvePath(m[0], cwd),
      filePath: resolvePath(m[0], cwd),
    }),
  },
  // npm package names in error traces (e.g., "at Object.<anonymous> (node_modules/pkg/...")
  {
    id: 'npm-package',
    type: LinkType.NpmPackage,
    regex: /node_modules\/((?:@[\w.-]+\/)?[\w.-]+)/g,
    priority: 40,
    tooltipFormatter: (m) => `npm package: ${m[1]}`,
    targetResolver: (m) => ({
      uri: `https://www.npmjs.com/package/${m[1]}`,
      fragment: m[1],
    }),
  },
  // Git commit hashes (7+ hex characters, word-bounded)
  {
    id: 'git-hash',
    type: LinkType.GitHash,
    regex: /\b([0-9a-f]{7,40})\b/g,
    priority: 30,
    tooltipFormatter: (m) => `Git commit: ${m[1].slice(0, 12)}`,
    targetResolver: (m) => ({
      uri: `git:${m[1]}`,
      fragment: m[1],
    }),
  },
  // IP addresses with optional port
  {
    id: 'ip-address',
    type: LinkType.IPAddress,
    regex: /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d{1,5}))?\b/g,
    priority: 20,
    tooltipFormatter: (m) =>
      m[2] ? `Open http://${m[1]}:${m[2]}` : `IP address: ${m[1]}`,
    targetResolver: (m) => ({
      uri: m[2] ? `http://${m[1]}:${m[2]}` : `http://${m[1]}`,
    }),
  },
]

// ---------------------------------------------------------------------------
// Registered custom patterns (module-level, shared across providers)
// ---------------------------------------------------------------------------

const _customPatterns: LinkPattern[] = []

/**
 * Register a custom link detection pattern. Returns a disposer function to
 * unregister the pattern later.
 */
export function registerLinkPattern(
  pattern: Omit<LinkPattern, 'id'> & { id?: string }
): () => void {
  const id = pattern.id ?? `custom_${_nextLinkId++}`
  const full: LinkPattern = { ...pattern, id } as LinkPattern
  _customPatterns.push(full)
  return () => {
    const idx = _customPatterns.indexOf(full)
    if (idx !== -1) _customPatterns.splice(idx, 1)
  }
}

// ---------------------------------------------------------------------------
// Standalone detection helper (exported for external consumers)
// ---------------------------------------------------------------------------

/**
 * Detect all links in an array of terminal lines. Returns a flat list of
 * `TerminalLink` objects sorted by position.
 */
export function detectLinks(
  lines: string[],
  cwd: string,
  options?: { additionalPatterns?: LinkPattern[] }
): TerminalLink[] {
  const allPatterns = buildSortedPatterns(options?.additionalPatterns)
  const results: TerminalLink[] = []

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    if (!line || line.length > MAX_LINE_SCAN_LENGTH) continue
    const lineLinks = matchLine(line, lineIdx, cwd, allPatterns)
    results.push(...lineLinks)
  }

  return deduplicateLinks(results)
}

// ---------------------------------------------------------------------------
// Core matching logic
// ---------------------------------------------------------------------------

function buildSortedPatterns(extra?: LinkPattern[]): LinkPattern[] {
  const defaultHandler: LinkHandler = {
    activate: () => {},
  }

  const builtins: LinkPattern[] = BUILTIN_PATTERNS.map((p) => ({
    ...p,
    handler: defaultHandler,
  }))

  const all = [...builtins, ..._customPatterns, ...(extra ?? [])]
  all.sort((a, b) => b.priority - a.priority)
  return all
}

function matchLine(
  line: string,
  lineNumber: number,
  cwd: string,
  patterns: LinkPattern[]
): TerminalLink[] {
  const results: TerminalLink[] = []
  const claimed = new Set<number>() // column indices already matched

  for (const pattern of patterns) {
    // Reset lastIndex for global regex
    pattern.regex.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.regex.exec(line)) !== null) {
      const startCol = match.index
      const endCol = startCol + match[0].length

      // Skip if any character in this range is already claimed
      let overlaps = false
      for (let c = startCol; c < endCol; c++) {
        if (claimed.has(c)) {
          overlaps = true
          break
        }
      }
      if (overlaps) continue

      // Extra validation for git hashes – must be >= 7 chars and not all digits
      if (pattern.type === LinkType.GitHash) {
        const h = match[1] ?? match[0]
        if (h.length < GIT_HASH_MIN_LENGTH || /^\d+$/.test(h)) continue
      }

      // Extra validation for IP addresses
      if (pattern.type === LinkType.IPAddress) {
        const octets = (match[1] ?? match[0]).split('.')
        if (octets.some((o) => parseInt(o, 10) > 255)) continue
        if (match[2] && parseInt(match[2], 10) > 65535) continue
      }

      const target = pattern.targetResolver
        ? pattern.targetResolver(match, cwd)
        : { uri: match[0] }
      if (!target) continue

      const tooltip = pattern.tooltipFormatter
        ? pattern.tooltipFormatter(match)
        : `Open: ${match[0]}`

      // Claim columns
      for (let c = startCol; c < endCol; c++) claimed.add(c)

      results.push({
        id: linkId(),
        type: pattern.type,
        text: match[0],
        range: {
          startLine: lineNumber,
          startColumn: startCol,
          endLine: lineNumber,
          endColumn: endCol,
        },
        target,
        tooltip,
        decoration: {
          color: LINK_COLORS[pattern.type],
          underline: true,
          bold: false,
          cursor: 'pointer',
        },
      })
    }
  }

  return results
}

function deduplicateLinks(links: TerminalLink[]): TerminalLink[] {
  const seen = new Map<string, TerminalLink>()
  for (const link of links) {
    const key = `${link.range.startLine}:${link.range.startColumn}:${link.range.endColumn}`
    if (!seen.has(key)) {
      seen.set(key, link)
    }
  }
  const deduped = Array.from(seen.values())
  deduped.sort(
    (a, b) =>
      a.range.startLine - b.range.startLine ||
      a.range.startColumn - b.range.startColumn
  )
  return deduped
}

// ---------------------------------------------------------------------------
// Link Cache (per terminal buffer)
// ---------------------------------------------------------------------------

class LinkCache {
  private entries = new Map<string, LinkCacheEntry>()
  private maxAge: number

  constructor(maxAge = 30_000) {
    this.maxAge = maxAge
  }

  get(lineNumber: number, lineHash: string): TerminalLink[] | null {
    const key = String(lineNumber)
    const entry = this.entries.get(key)
    if (!entry) return null
    if (entry.lineHash !== lineHash) {
      this.entries.delete(key)
      return null
    }
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.entries.delete(key)
      return null
    }
    return entry.links
  }

  set(lineNumber: number, lineHash: string, links: TerminalLink[]): void {
    if (this.entries.size >= MAX_CACHE_SIZE) {
      // Evict oldest 25%
      const sorted = [...this.entries.entries()].sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )
      const evictCount = Math.floor(MAX_CACHE_SIZE * 0.25)
      for (let i = 0; i < evictCount; i++) {
        this.entries.delete(sorted[i][0])
      }
    }
    this.entries.set(String(lineNumber), {
      links,
      timestamp: Date.now(),
      lineHash,
    })
  }

  invalidateLine(lineNumber: number): void {
    this.entries.delete(String(lineNumber))
  }

  clear(): void {
    this.entries.clear()
  }

  get size(): number {
    return this.entries.size
  }
}

// ---------------------------------------------------------------------------
// Tooltip Controller
// ---------------------------------------------------------------------------

class TooltipController {
  private _state: LinkTooltip = {
    text: '',
    position: { x: 0, y: 0 },
    visible: false,
    linkId: null,
  }
  private _hideTimer: ReturnType<typeof setTimeout> | null = null
  private _listeners: Array<(state: LinkTooltip) => void> = []

  get state(): LinkTooltip {
    return { ...this._state }
  }

  subscribe(fn: (state: LinkTooltip) => void): () => void {
    this._listeners.push(fn)
    return () => {
      this._listeners = this._listeners.filter((l) => l !== fn)
    }
  }

  show(link: TerminalLink, x: number, y: number): void {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer)
      this._hideTimer = null
    }
    this._state = {
      text: link.tooltip,
      position: { x, y: y - 28 },
      visible: true,
      linkId: link.id,
    }
    this._notify()
  }

  hide(delay = 150): void {
    if (this._hideTimer) clearTimeout(this._hideTimer)
    this._hideTimer = setTimeout(() => {
      this._state = { text: '', position: { x: 0, y: 0 }, visible: false, linkId: null }
      this._hideTimer = null
      this._notify()
    }, delay)
  }

  hideImmediate(): void {
    if (this._hideTimer) {
      clearTimeout(this._hideTimer)
      this._hideTimer = null
    }
    this._state = { text: '', position: { x: 0, y: 0 }, visible: false, linkId: null }
    this._notify()
  }

  private _notify(): void {
    for (const fn of this._listeners) fn(this.state)
  }

  dispose(): void {
    if (this._hideTimer) clearTimeout(this._hideTimer)
    this._listeners = []
  }
}

// ---------------------------------------------------------------------------
// TerminalLinkProvider – main class
// ---------------------------------------------------------------------------

export class TerminalLinkProvider {
  private readonly options: TerminalLinkProviderOptions
  private readonly cache: LinkCache
  private readonly tooltip: TooltipController
  private readonly customProviders: LinkProviderRegistration[] = []
  private readonly patterns: LinkPattern[]
  private activeLink: TerminalLink | null = null
  private ctrlHeld = false
  private disposed = false

  constructor(options: TerminalLinkProviderOptions) {
    this.options = {
      activationMode: LinkActivation.CtrlClick,
      enableCaching: true,
      cacheMaxAge: 30_000,
      maxLineScanLength: MAX_LINE_SCAN_LENGTH,
      ...options,
    }
    this.cache = new LinkCache(this.options.cacheMaxAge)
    this.tooltip = new TooltipController()
    this.patterns = buildSortedPatterns()

    this._bindKeyTracking()
  }

  // ── Key tracking ─────────────────────────────────────

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Control' || e.key === 'Meta') {
      this.ctrlHeld = true
    }
  }

  private _onKeyUp = (e: KeyboardEvent): void => {
    if (e.key === 'Control' || e.key === 'Meta') {
      this.ctrlHeld = false
      this.tooltip.hideImmediate()
    }
  }

  private _bindKeyTracking(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown)
      window.addEventListener('keyup', this._onKeyUp)
    }
  }

  private _unbindKeyTracking(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._onKeyDown)
      window.removeEventListener('keyup', this._onKeyUp)
    }
  }

  // ── Custom provider registration ────────────────────

  registerProvider(provider: CustomLinkProvider, priority = 50): () => void {
    const reg: LinkProviderRegistration = {
      id: `cp_${_nextLinkId++}`,
      provider,
      priority,
      disposer: () => {
        const idx = this.customProviders.indexOf(reg)
        if (idx !== -1) this.customProviders.splice(idx, 1)
      },
    }
    this.customProviders.push(reg)
    this.customProviders.sort((a, b) => b.priority - a.priority)
    return reg.disposer
  }

  // ── Link detection ──────────────────────────────────

  detectLinksForLine(line: string, lineNumber: number): TerminalLink[] {
    if (this.disposed) return []
    if (!line || line.length > this.options.maxLineScanLength) return []

    const lh = hashLine(line)

    // Check cache
    if (this.options.enableCaching) {
      const cached = this.cache.get(lineNumber, lh)
      if (cached) return cached
    }

    // Built-in pattern detection
    const links = matchLine(line, lineNumber, this.options.workspacePath, this.patterns)

    // Custom providers
    for (const reg of this.customProviders) {
      try {
        const custom = reg.provider.detectLinks(line, lineNumber, this.options.workspacePath)
        links.push(...custom)
      } catch {
        // Faulty provider should not break detection
      }
    }

    const deduped = deduplicateLinks(links)

    if (this.options.enableCaching) {
      this.cache.set(lineNumber, lh, deduped)
    }

    return deduped
  }

  detectLinksForBuffer(lines: string[]): TerminalLink[] {
    const results: TerminalLink[] = []
    for (let i = 0; i < lines.length; i++) {
      results.push(...this.detectLinksForLine(lines[i], i))
    }
    return results
  }

  // ── Hit testing ─────────────────────────────────────

  getLinkAt(
    line: number,
    column: number,
    bufferLines: string[]
  ): TerminalLink | null {
    if (line < 0 || line >= bufferLines.length) return null
    const links = this.detectLinksForLine(bufferLines[line], line)
    return (
      links.find(
        (l) =>
          column >= l.range.startColumn && column < l.range.endColumn
      ) ?? null
    )
  }

  // ── Event handlers ──────────────────────────────────

  handleMouseMove(
    line: number,
    column: number,
    clientX: number,
    clientY: number,
    bufferLines: string[]
  ): { link: TerminalLink | null; cursor: string } {
    if (this.disposed) return { link: null, cursor: 'default' }

    const link = this.getLinkAt(line, column, bufferLines)

    if (!link) {
      if (this.activeLink) {
        this.activeLink.decoration.underline = true
        this.activeLink = null
        this.tooltip.hide()
      }
      return { link: null, cursor: 'default' }
    }

    const needsModifier =
      this.options.activationMode === LinkActivation.CtrlClick

    if (link.id !== this.activeLink?.id) {
      this.activeLink = link
      if (needsModifier && this.ctrlHeld) {
        this.tooltip.show(link, clientX, clientY)
      } else if (!needsModifier) {
        this.tooltip.show(link, clientX, clientY)
      }
    }

    // Show underline only when modifier is held (or always for Click mode)
    const showDecoration = !needsModifier || this.ctrlHeld

    return {
      link,
      cursor: showDecoration ? 'pointer' : 'default',
    }
  }

  handleClick(
    line: number,
    column: number,
    event: LinkActivationEvent,
    bufferLines: string[]
  ): boolean {
    if (this.disposed) return false

    const link = this.getLinkAt(line, column, bufferLines)
    if (!link) return false

    // Activation check
    if (
      this.options.activationMode === LinkActivation.CtrlClick &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      return false
    }

    // Let custom providers handle first
    for (const reg of this.customProviders) {
      if (reg.provider.handleActivation?.(link, event)) return true
    }

    // Default handling
    this._activateLink(link, event)
    this.tooltip.hideImmediate()
    return true
  }

  private _activateLink(link: TerminalLink, _event: LinkActivationEvent): void {
    switch (link.type) {
      case LinkType.URL:
        this.options.onOpenURL?.(link.target.uri)
        break

      case LinkType.FilePath:
      case LinkType.FileLineColumn:
      case LinkType.TypeScriptError:
      case LinkType.PythonError:
      case LinkType.RustError:
      case LinkType.GoError:
      case LinkType.JavaError:
        if (link.target.filePath) {
          this.options.onOpenFile?.(
            link.target.filePath,
            link.target.line,
            link.target.column
          )
        }
        break

      case LinkType.NpmPackage:
        this.options.onOpenURL?.(link.target.uri)
        break

      case LinkType.GitHash:
        if (link.target.fragment) {
          this.options.onNavigateToHash?.(link.target.fragment)
        }
        break

      case LinkType.IPAddress:
        this.options.onOpenURL?.(link.target.uri)
        break
    }
  }

  // ── Tooltip access ──────────────────────────────────

  getTooltipState(): LinkTooltip {
    return this.tooltip.state
  }

  subscribeTooltip(fn: (state: LinkTooltip) => void): () => void {
    return this.tooltip.subscribe(fn)
  }

  // ── Decoration helpers ──────────────────────────────

  getDecorationCSS(link: TerminalLink, isHovered: boolean): string {
    const d = link.decoration
    const parts: string[] = [`color: ${d.color}`]
    if (d.underline && isHovered) {
      parts.push('text-decoration: underline')
    }
    if (d.bold) {
      parts.push('font-weight: bold')
    }
    parts.push(`cursor: ${d.cursor}`)
    return parts.join('; ')
  }

  static getDecorationClassName(link: TerminalLink): string {
    return `terminal-link terminal-link--${link.type}`
  }

  // ── Cache management ────────────────────────────────

  invalidateLine(lineNumber: number): void {
    this.cache.invalidateLine(lineNumber)
  }

  clearCache(): void {
    this.cache.clear()
  }

  get cacheSize(): number {
    return this.cache.size
  }

  // ── Lifecycle ───────────────────────────────────────

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this._unbindKeyTracking()
    this.tooltip.dispose()
    this.cache.clear()
    this.customProviders.length = 0
    this.activeLink = null
  }
}
