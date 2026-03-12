/**
 * File Watching System for Orion IDE.
 *
 * Provides comprehensive file system monitoring including glob-pattern matching,
 * recursive directory watching, debounced event batching, rate limiting,
 * content-hash change detection, conflict resolution, IPC bridging to the
 * Electron main process, and hot-reload trigger integration.
 */

/* ── Types ─────────────────────────────────────────────── */

export type FileChangeType = 'created' | 'modified' | 'deleted' | 'renamed'

export type WatcherState = 'idle' | 'running' | 'paused' | 'disposed'

export interface FileChangeEvent {
  /** Absolute path of the affected file. */
  path: string
  /** Type of change that occurred. */
  type: FileChangeType
  /** For renames – the path before the rename. */
  oldPath?: string
  /** High-resolution timestamp (Date.now()). */
  timestamp: number
  /** SHA-256 content hash, when available. */
  hash?: string
  /** Whether the change originated outside the IDE. */
  external: boolean
}

export interface WatchOptions {
  /** Glob patterns to include (e.g. '**\/*.ts'). */
  includes?: string[]
  /** Glob patterns to exclude. Merged with default ignores. */
  excludes?: string[]
  /** Watch directories recursively. @default true */
  recursive?: boolean
  /** Debounce window in ms. @default 100 */
  debounceMs?: number
  /** Maximum events per second before rate-limiting kicks in. @default 200 */
  maxEventsPerSecond?: number
  /** Compute content hashes to detect real changes. @default false */
  useContentHash?: boolean
  /** Follow symbolic links. @default false */
  followSymlinks?: boolean
  /** Maximum directory depth. @default Infinity */
  maxDepth?: number
  /** Polling interval in ms (fallback for network drives). @default 0 (disabled) */
  pollingIntervalMs?: number
}

export interface WatcherStats {
  id: string
  state: WatcherState
  root: string
  trackedPaths: number
  eventsEmitted: number
  lastEventAt: number | null
  options: WatchOptions
}

export interface FileConflict {
  path: string
  editorModifiedAt: number
  diskModifiedAt: number
  editorHash: string
  diskHash: string
  detectedAt: number
}

export interface ConflictResolution {
  action: 'accept-editor' | 'accept-disk' | 'merge' | 'dismiss'
  path: string
  resolvedAt: number
}

export interface IPCWatchMessage {
  channel: 'file-watcher'
  command: 'start' | 'stop' | 'pause' | 'resume' | 'event' | 'error'
  watcherId: string
  payload?: unknown
}

export interface HotReloadConfig {
  enabled: boolean
  /** File extensions that trigger a full page reload. */
  fullReloadExtensions: string[]
  /** File extensions that trigger a CSS-only hot swap. */
  cssReloadExtensions: string[]
  /** Delay in ms before triggering reload after the last change event. */
  delayMs: number
}

/* ── Listener / Disposable helpers ─────────────────────── */

interface Disposable {
  dispose(): void
}

type Listener<T> = (event: T) => void

class SimpleEmitter<T> {
  private listeners = new Set<Listener<T>>()
  private onceListeners = new Set<Listener<T>>()

  on(listener: Listener<T>): Disposable {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }

  once(listener: Listener<T>): Disposable {
    this.onceListeners.add(listener)
    return { dispose: () => this.onceListeners.delete(listener) }
  }

  emit(event: T): void {
    for (const fn of this.listeners) {
      try { fn(event) } catch (e) { console.error('[FileWatcher] listener error', e) }
    }
    for (const fn of this.onceListeners) {
      try { fn(event) } catch (e) { console.error('[FileWatcher] once-listener error', e) }
    }
    this.onceListeners.clear()
  }

  removeAll(): void {
    this.listeners.clear()
    this.onceListeners.clear()
  }

  get size(): number {
    return this.listeners.size + this.onceListeners.size
  }
}

/* ── Constants ─────────────────────────────────────────── */

const DEFAULT_IGNORE_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/*.swp',
  '**/*.swo',
  '**/*~',
]

const DEFAULT_WATCH_OPTIONS: Required<WatchOptions> = {
  includes: ['**/*'],
  excludes: [],
  recursive: true,
  debounceMs: 100,
  maxEventsPerSecond: 200,
  useContentHash: false,
  followSymlinks: false,
  maxDepth: Infinity,
  pollingIntervalMs: 0,
}

const DEFAULT_HOT_RELOAD_CONFIG: HotReloadConfig = {
  enabled: true,
  fullReloadExtensions: ['.html', '.ts', '.tsx', '.js', '.jsx', '.json'],
  cssReloadExtensions: ['.css', '.scss', '.less'],
  delayMs: 150,
}

/* ── Utility functions ─────────────────────────────────── */

let idCounter = 0

function generateWatcherId(): string {
  return `watcher_${Date.now()}_${++idCounter}`
}

/**
 * Minimal glob matcher supporting *, **, and ? wildcards.
 * Not intended to replace a full glob library — sufficient for file watcher
 * include/exclude patterns.
 */
export function matchGlob(pattern: string, filePath: string): boolean {
  const normalised = filePath.replace(/\\/g, '/')
  const regex = globToRegex(pattern)
  return regex.test(normalised)
}

function globToRegex(pattern: string): RegExp {
  let regexStr = ''
  let i = 0
  const pat = pattern.replace(/\\/g, '/')

  while (i < pat.length) {
    const ch = pat[i]
    if (ch === '*') {
      if (pat[i + 1] === '*') {
        // ** matches everything including path separators
        if (pat[i + 2] === '/') {
          regexStr += '(?:.+/)?'
          i += 3
        } else {
          regexStr += '.*'
          i += 2
        }
      } else {
        // * matches everything except path separator
        regexStr += '[^/]*'
        i += 1
      }
    } else if (ch === '?') {
      regexStr += '[^/]'
      i += 1
    } else if (ch === '.') {
      regexStr += '\\.'
      i += 1
    } else if (ch === '{') {
      regexStr += '(?:'
      i += 1
    } else if (ch === '}') {
      regexStr += ')'
      i += 1
    } else if (ch === ',') {
      // Inside brace expansion → alternation
      regexStr += '|'
      i += 1
    } else {
      regexStr += ch
      i += 1
    }
  }

  return new RegExp(`^${regexStr}$`)
}

/**
 * Compute a SHA-256 hex hash of a string using the SubtleCrypto API.
 * Falls back to a simple FNV-1a 32-bit hash when SubtleCrypto is unavailable.
 */
export async function computeContentHash(content: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const buf = new TextEncoder().encode(content)
    const hashBuf = await crypto.subtle.digest('SHA-256', buf)
    const bytes = new Uint8Array(hashBuf)
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  // Fallback: FNV-1a 32-bit
  let hash = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function getExtension(filePath: string): string {
  const base = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const dotIdx = base.lastIndexOf('.')
  return dotIdx > 0 ? base.slice(dotIdx) : ''
}

function pathDepth(filePath: string, root: string): number {
  const rel = filePath.replace(/\\/g, '/').replace(root.replace(/\\/g, '/'), '')
  return rel.split('/').filter(Boolean).length
}

/* ── Rate Limiter ──────────────────────────────────────── */

class RateLimiter {
  private timestamps: number[] = []
  private readonly windowMs = 1000

  constructor(private maxPerSecond: number) {}

  /** Returns true if the event should be allowed through. */
  allow(): boolean {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)
    if (this.timestamps.length >= this.maxPerSecond) {
      return false
    }
    this.timestamps.push(now)
    return true
  }

  /** Reset the limiter (e.g. after resuming from pause). */
  reset(): void {
    this.timestamps = []
  }

  /** Update the limit at runtime. */
  setLimit(maxPerSecond: number): void {
    this.maxPerSecond = maxPerSecond
  }
}

/* ── Debouncer ─────────────────────────────────────────── */

class EventDebouncer {
  private pending: FileChangeEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private delayMs: number,
    private onFlush: (events: FileChangeEvent[]) => void,
  ) {}

  push(event: FileChangeEvent): void {
    this.pending.push(event)
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => this.flush(), this.delayMs)
  }

  flush(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.pending.length === 0) return
    const batch = this.deduplicateBatch(this.pending)
    this.pending = []
    this.onFlush(batch)
  }

  /**
   * Collapse duplicate events targeting the same path within a single batch.
   * For example, a rapid create→modify sequence becomes a single 'created' event.
   * A modify→delete sequence becomes a single 'deleted' event.
   */
  private deduplicateBatch(events: FileChangeEvent[]): FileChangeEvent[] {
    const map = new Map<string, FileChangeEvent>()
    for (const ev of events) {
      const existing = map.get(ev.path)
      if (!existing) {
        map.set(ev.path, ev)
        continue
      }
      // Merge rules
      if (existing.type === 'created' && ev.type === 'modified') {
        // keep as created – the file was newly created
        existing.hash = ev.hash
        existing.timestamp = ev.timestamp
      } else if (existing.type === 'created' && ev.type === 'deleted') {
        // Created then deleted within the window – cancel out
        map.delete(ev.path)
      } else if (existing.type === 'modified' && ev.type === 'deleted') {
        // Supersede with delete
        map.set(ev.path, ev)
      } else if (existing.type === 'modified' && ev.type === 'modified') {
        // Keep latest
        existing.hash = ev.hash
        existing.timestamp = ev.timestamp
      } else {
        // All other cases: latest event wins
        map.set(ev.path, ev)
      }
    }
    return Array.from(map.values())
  }

  clear(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending = []
  }

  get pendingCount(): number {
    return this.pending.length
  }
}

/* ══════════════════════════════════════════════════════════
   GlobWatcher
   ══════════════════════════════════════════════════════════ */

/**
 * Watches a directory (optionally recursive) and emits events only for
 * files that match the configured include/exclude glob patterns.
 */
export class GlobWatcher {
  readonly id: string
  private state: WatcherState = 'idle'
  private readonly options: Required<WatchOptions>
  private readonly allExcludes: string[]
  private readonly emitter = new SimpleEmitter<FileChangeEvent[]>()
  private readonly errorEmitter = new SimpleEmitter<Error>()
  private readonly debouncer: EventDebouncer
  private readonly rateLimiter: RateLimiter
  private readonly trackedHashes = new Map<string, string>()
  private eventsEmitted = 0
  private lastEventAt: number | null = null
  private pollingTimer: ReturnType<typeof setInterval> | null = null
  private pollingSnapshot = new Map<string, number>() // path → mtime

  constructor(
    readonly root: string,
    userOptions: WatchOptions = {},
  ) {
    this.id = generateWatcherId()
    this.options = { ...DEFAULT_WATCH_OPTIONS, ...userOptions }
    this.allExcludes = [...DEFAULT_IGNORE_PATTERNS, ...this.options.excludes]
    this.rateLimiter = new RateLimiter(this.options.maxEventsPerSecond)
    this.debouncer = new EventDebouncer(this.options.debounceMs, batch => {
      this.eventsEmitted += batch.length
      this.lastEventAt = Date.now()
      this.emitter.emit(batch)
    })
  }

  /* ── Public API ──────────────────────────────────── */

  /** Subscribe to batched change events. */
  onDidChange(listener: Listener<FileChangeEvent[]>): Disposable {
    return this.emitter.on(listener)
  }

  /** Subscribe to watcher errors. */
  onError(listener: Listener<Error>): Disposable {
    return this.errorEmitter.on(listener)
  }

  /** Start watching. No-op if already running. */
  start(): void {
    if (this.state === 'running') return
    if (this.state === 'disposed') {
      throw new Error(`GlobWatcher ${this.id} has been disposed`)
    }
    this.state = 'running'
    this.rateLimiter.reset()
    if (this.options.pollingIntervalMs > 0) {
      this.startPolling()
    }
  }

  /** Stop watching. Can be restarted. */
  stop(): void {
    if (this.state === 'disposed') return
    this.state = 'idle'
    this.debouncer.flush()
    this.stopPolling()
  }

  /** Pause event processing. Events are silently discarded while paused. */
  pause(): void {
    if (this.state !== 'running') return
    this.state = 'paused'
    this.debouncer.clear()
  }

  /** Resume from paused state. */
  resume(): void {
    if (this.state !== 'paused') return
    this.state = 'running'
    this.rateLimiter.reset()
  }

  /** Permanently dispose of this watcher and free resources. */
  dispose(): void {
    this.state = 'disposed'
    this.debouncer.clear()
    this.stopPolling()
    this.emitter.removeAll()
    this.errorEmitter.removeAll()
    this.trackedHashes.clear()
    this.pollingSnapshot.clear()
  }

  /** Inject a raw file system event (from the Electron main process, etc.). */
  handleRawEvent(type: FileChangeType, filePath: string, oldPath?: string): void {
    if (this.state !== 'running') return
    if (!this.matchesFilters(filePath)) return
    if (!this.rateLimiter.allow()) return

    const event: FileChangeEvent = {
      path: filePath,
      type,
      oldPath,
      timestamp: Date.now(),
      external: true,
    }

    this.debouncer.push(event)
  }

  /**
   * Handle a raw event with optional content for hash-based deduplication.
   * If the hash has not changed since the last event, the event is suppressed.
   */
  async handleRawEventWithContent(
    type: FileChangeType,
    filePath: string,
    content?: string,
  ): Promise<void> {
    if (this.state !== 'running') return
    if (!this.matchesFilters(filePath)) return
    if (!this.rateLimiter.allow()) return

    let hash: string | undefined
    if (this.options.useContentHash && content !== undefined) {
      hash = await computeContentHash(content)
      const prev = this.trackedHashes.get(filePath)
      if (prev === hash && type === 'modified') {
        // Content has not actually changed – skip
        return
      }
      if (type === 'deleted') {
        this.trackedHashes.delete(filePath)
      } else {
        this.trackedHashes.set(filePath, hash)
      }
    }

    const event: FileChangeEvent = {
      path: filePath,
      type,
      timestamp: Date.now(),
      hash,
      external: true,
    }

    this.debouncer.push(event)
  }

  getStats(): WatcherStats {
    return {
      id: this.id,
      state: this.state,
      root: this.root,
      trackedPaths: this.trackedHashes.size,
      eventsEmitted: this.eventsEmitted,
      lastEventAt: this.lastEventAt,
      options: this.options,
    }
  }

  getState(): WatcherState {
    return this.state
  }

  /* ── Filtering ───────────────────────────────────── */

  private matchesFilters(filePath: string): boolean {
    const normalised = filePath.replace(/\\/g, '/')
    const rootNorm = this.root.replace(/\\/g, '/')

    // Depth check
    if (this.options.maxDepth !== Infinity) {
      const depth = pathDepth(normalised, rootNorm)
      if (depth > this.options.maxDepth) return false
    }

    // Recursive check
    if (!this.options.recursive) {
      const rel = normalised.replace(rootNorm, '').replace(/^\//, '')
      if (rel.includes('/')) return false
    }

    // Exclude patterns
    for (const pattern of this.allExcludes) {
      if (matchGlob(pattern, normalised)) return false
    }

    // Include patterns
    if (this.options.includes.length > 0) {
      const included = this.options.includes.some(p => matchGlob(p, normalised))
      if (!included) return false
    }

    return true
  }

  /* ── Polling (fallback for network drives) ───────── */

  private startPolling(): void {
    this.stopPolling()
    this.pollingTimer = setInterval(() => {
      this.pollForChanges()
    }, this.options.pollingIntervalMs)
  }

  private stopPolling(): void {
    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer)
      this.pollingTimer = null
    }
  }

  /**
   * Poll-based change detection stub.
   * In a production implementation this would walk the directory tree,
   * stat each file, and compare against `this.pollingSnapshot`.
   * Here we emit a hook for IPC integration to provide snapshot diffs.
   */
  private pollForChanges(): void {
    // Implemented via IPC – the main process sends snapshot diffs
    // which are fed through handleRawEvent().
  }
}

/* ══════════════════════════════════════════════════════════
   FileConflictDetector
   ══════════════════════════════════════════════════════════ */

/**
 * Detects when a file has been modified both in the editor buffer and
 * on disk by an external process, and surfaces a conflict for the user
 * to resolve.
 */
export class FileConflictDetector {
  private readonly editorStates = new Map<string, { hash: string; modifiedAt: number }>()
  private readonly conflicts = new Map<string, FileConflict>()
  private readonly conflictEmitter = new SimpleEmitter<FileConflict>()
  private readonly resolutionEmitter = new SimpleEmitter<ConflictResolution>()

  /** Register or update the editor's known state for a file. */
  trackEditorState(path: string, hash: string, modifiedAt: number): void {
    this.editorStates.set(path, { hash, modifiedAt })
    // If a conflict was previously detected and the editor state changed,
    // the user is actively editing – keep the conflict visible.
  }

  /** Remove tracking for a file (e.g. when the editor tab is closed). */
  untrack(path: string): void {
    this.editorStates.delete(path)
    this.conflicts.delete(path)
  }

  /**
   * Called when a file change is detected on disk.
   * Compares the disk hash against the editor's last known hash.
   * If they diverge, a conflict is raised.
   */
  async checkDiskChange(path: string, diskHash: string, diskModifiedAt: number): Promise<void> {
    const editorState = this.editorStates.get(path)
    if (!editorState) return // not tracked in editor

    if (editorState.hash === diskHash) {
      // Disk matches editor – no conflict (or conflict resolved)
      this.conflicts.delete(path)
      return
    }

    // Only flag a conflict if the editor has unsaved changes (hash differs)
    const conflict: FileConflict = {
      path,
      editorModifiedAt: editorState.modifiedAt,
      diskModifiedAt,
      editorHash: editorState.hash,
      diskHash,
      detectedAt: Date.now(),
    }
    this.conflicts.set(path, conflict)
    this.conflictEmitter.emit(conflict)
  }

  /** Resolve a conflict with the given action. */
  resolve(path: string, action: ConflictResolution['action']): void {
    const conflict = this.conflicts.get(path)
    if (!conflict) return

    this.conflicts.delete(path)
    this.resolutionEmitter.emit({
      action,
      path,
      resolvedAt: Date.now(),
    })

    // If accepting disk version, update editor state tracking
    if (action === 'accept-disk') {
      this.editorStates.set(path, {
        hash: conflict.diskHash,
        modifiedAt: conflict.diskModifiedAt,
      })
    }
  }

  /** Subscribe to newly detected conflicts. */
  onConflict(listener: Listener<FileConflict>): Disposable {
    return this.conflictEmitter.on(listener)
  }

  /** Subscribe to conflict resolutions. */
  onResolution(listener: Listener<ConflictResolution>): Disposable {
    return this.resolutionEmitter.on(listener)
  }

  /** Get all currently active conflicts. */
  getActiveConflicts(): FileConflict[] {
    return Array.from(this.conflicts.values())
  }

  /** Check if a specific file has an active conflict. */
  hasConflict(path: string): boolean {
    return this.conflicts.has(path)
  }

  dispose(): void {
    this.editorStates.clear()
    this.conflicts.clear()
    this.conflictEmitter.removeAll()
    this.resolutionEmitter.removeAll()
  }
}

/* ══════════════════════════════════════════════════════════
   HotReloadManager
   ══════════════════════════════════════════════════════════ */

/**
 * Integrates with the file watcher to trigger hot-reload or full-reload
 * for development workflows.
 */
export class HotReloadManager {
  private config: HotReloadConfig
  private reloadTimer: ReturnType<typeof setTimeout> | null = null
  private readonly reloadEmitter = new SimpleEmitter<{ type: 'full' | 'css'; files: string[] }>()
  private pendingFiles: string[] = []
  private pendingType: 'full' | 'css' = 'css'

  constructor(config?: Partial<HotReloadConfig>) {
    this.config = { ...DEFAULT_HOT_RELOAD_CONFIG, ...config }
  }

  /** Process a batch of file change events and schedule a reload if needed. */
  processChanges(events: FileChangeEvent[]): void {
    if (!this.config.enabled) return

    for (const ev of events) {
      if (ev.type === 'deleted') continue // deletions don't trigger reload
      const ext = getExtension(ev.path)
      if (!ext) continue

      if (this.config.fullReloadExtensions.includes(ext)) {
        this.pendingType = 'full' // full reload trumps css-only
        this.pendingFiles.push(ev.path)
      } else if (this.config.cssReloadExtensions.includes(ext)) {
        this.pendingFiles.push(ev.path)
        // Keep pendingType as-is; don't downgrade from 'full' to 'css'
      }
    }

    if (this.pendingFiles.length > 0) {
      this.scheduleReload()
    }
  }

  /** Subscribe to reload triggers. */
  onReload(listener: Listener<{ type: 'full' | 'css'; files: string[] }>): Disposable {
    return this.reloadEmitter.on(listener)
  }

  /** Update configuration at runtime. */
  updateConfig(partial: Partial<HotReloadConfig>): void {
    this.config = { ...this.config, ...partial }
  }

  /** Cancel any pending reload. */
  cancel(): void {
    if (this.reloadTimer !== null) {
      clearTimeout(this.reloadTimer)
      this.reloadTimer = null
    }
    this.pendingFiles = []
    this.pendingType = 'css'
  }

  dispose(): void {
    this.cancel()
    this.reloadEmitter.removeAll()
  }

  private scheduleReload(): void {
    if (this.reloadTimer !== null) {
      clearTimeout(this.reloadTimer)
    }
    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null
      const files = [...this.pendingFiles]
      const type = this.pendingType
      this.pendingFiles = []
      this.pendingType = 'css'
      this.reloadEmitter.emit({ type, files })
    }, this.config.delayMs)
  }
}

/* ══════════════════════════════════════════════════════════
   IPCWatcherBridge
   ══════════════════════════════════════════════════════════ */

/**
 * Bridges the renderer-process FileWatcherManager with the Electron
 * main process, which runs the native fs watchers.
 *
 * In the renderer, we cannot directly use Node `fs.watch`; instead we
 * send commands over IPC and receive events back.
 */
export class IPCWatcherBridge {
  private readonly ipcRenderer: IPCRenderer | null = null
  private readonly pendingRequests = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()
  private readonly eventHandlers = new Map<string, (type: FileChangeType, path: string, oldPath?: string) => void>()
  private disposed = false

  constructor() {
    this.ipcRenderer = getIPCRenderer()
    if (this.ipcRenderer) {
      this.ipcRenderer.on('file-watcher:event', this.handleIncomingEvent.bind(this))
      this.ipcRenderer.on('file-watcher:error', this.handleIncomingError.bind(this))
    }
  }

  /** Request the main process to start a native watcher. */
  async startNativeWatcher(
    watcherId: string,
    root: string,
    options: WatchOptions,
    handler: (type: FileChangeType, path: string, oldPath?: string) => void,
  ): Promise<void> {
    if (!this.ipcRenderer) {
      console.warn('[IPCWatcherBridge] No ipcRenderer available – native watching disabled')
      return
    }
    if (this.disposed) return

    this.eventHandlers.set(watcherId, handler)

    return new Promise<void>((resolve, reject) => {
      this.pendingRequests.set(watcherId, { resolve, reject })
      const msg: IPCWatchMessage = {
        channel: 'file-watcher',
        command: 'start',
        watcherId,
        payload: { root, options },
      }
      this.ipcRenderer!.send('file-watcher:command', msg)

      // Timeout if main process doesn't respond
      setTimeout(() => {
        if (this.pendingRequests.has(watcherId)) {
          this.pendingRequests.delete(watcherId)
          resolve() // degrade gracefully
        }
      }, 5000)
    })
  }

  /** Request the main process to stop a native watcher. */
  stopNativeWatcher(watcherId: string): void {
    this.eventHandlers.delete(watcherId)
    this.pendingRequests.delete(watcherId)
    if (!this.ipcRenderer || this.disposed) return

    const msg: IPCWatchMessage = {
      channel: 'file-watcher',
      command: 'stop',
      watcherId,
    }
    this.ipcRenderer.send('file-watcher:command', msg)
  }

  /** Pause a native watcher without destroying it. */
  pauseNativeWatcher(watcherId: string): void {
    if (!this.ipcRenderer || this.disposed) return
    const msg: IPCWatchMessage = {
      channel: 'file-watcher',
      command: 'pause',
      watcherId,
    }
    this.ipcRenderer.send('file-watcher:command', msg)
  }

  /** Resume a paused native watcher. */
  resumeNativeWatcher(watcherId: string): void {
    if (!this.ipcRenderer || this.disposed) return
    const msg: IPCWatchMessage = {
      channel: 'file-watcher',
      command: 'resume',
      watcherId,
    }
    this.ipcRenderer.send('file-watcher:command', msg)
  }

  dispose(): void {
    this.disposed = true
    for (const watcherId of this.eventHandlers.keys()) {
      this.stopNativeWatcher(watcherId)
    }
    this.eventHandlers.clear()
    this.pendingRequests.clear()
    if (this.ipcRenderer) {
      this.ipcRenderer.removeAllListeners?.('file-watcher:event')
      this.ipcRenderer.removeAllListeners?.('file-watcher:error')
    }
  }

  private handleIncomingEvent(_event: unknown, data: {
    watcherId: string
    type: FileChangeType
    path: string
    oldPath?: string
  }): void {
    if (this.disposed) return

    // Resolve any pending start request
    const pending = this.pendingRequests.get(data.watcherId)
    if (pending) {
      pending.resolve()
      this.pendingRequests.delete(data.watcherId)
    }

    const handler = this.eventHandlers.get(data.watcherId)
    if (handler) {
      try {
        handler(data.type, data.path, data.oldPath)
      } catch (e) {
        console.error('[IPCWatcherBridge] handler error', e)
      }
    }
  }

  private handleIncomingError(_event: unknown, data: {
    watcherId: string
    message: string
  }): void {
    const pending = this.pendingRequests.get(data.watcherId)
    if (pending) {
      pending.reject(new Error(data.message))
      this.pendingRequests.delete(data.watcherId)
    }
  }
}

/* ── Electron IPC interface shim ───────────────────────── */

interface IPCRenderer {
  send(channel: string, data: unknown): void
  on(channel: string, listener: (...args: any[]) => void): void
  removeAllListeners?(channel: string): void
}

function getIPCRenderer(): IPCRenderer | null {
  try {
    // In an Electron renderer process, window.electronAPI or require('electron')
    const win = globalThis as any
    if (win.electronAPI?.ipcRenderer) {
      return win.electronAPI.ipcRenderer
    }
    // Fallback for preload-less setups (rare)
    if (typeof require === 'function') {
      const electron = require('electron')
      return electron?.ipcRenderer ?? null
    }
  } catch {
    // Not in Electron – that's fine
  }
  return null
}

/* ══════════════════════════════════════════════════════════
   FileWatcherManager
   ══════════════════════════════════════════════════════════ */

/**
 * Central manager for all file watchers in the Orion IDE.
 *
 * Usage:
 *   const manager = new FileWatcherManager()
 *   const watcher = manager.watch('/project', {
 *     includes: ['**\/*.ts', '**\/*.tsx'],
 *     debounceMs: 150,
 *   })
 *   watcher.onDidChange(events => { ... })
 *   watcher.start()
 *   // later:
 *   manager.dispose()
 */
export class FileWatcherManager {
  private readonly watchers = new Map<string, GlobWatcher>()
  private readonly ipcBridge: IPCWatcherBridge
  private readonly conflictDetector: FileConflictDetector
  private readonly hotReload: HotReloadManager
  private readonly changeEmitter = new SimpleEmitter<FileChangeEvent[]>()
  private readonly subscriptions: Disposable[] = []
  private disposed = false

  constructor(hotReloadConfig?: Partial<HotReloadConfig>) {
    this.ipcBridge = new IPCWatcherBridge()
    this.conflictDetector = new FileConflictDetector()
    this.hotReload = new HotReloadManager(hotReloadConfig)
  }

  /* ── Watcher creation ─────────────────────────────── */

  /**
   * Create and register a new glob watcher for a root directory.
   * The watcher is returned in 'idle' state – call `.start()` on it.
   */
  watch(root: string, options?: WatchOptions): GlobWatcher {
    this.ensureNotDisposed()

    const watcher = new GlobWatcher(root, options)

    // Wire up the IPC bridge so the main process does the native watching
    const ipcHandler = (type: FileChangeType, path: string, oldPath?: string) => {
      watcher.handleRawEvent(type, path, oldPath)
    }

    // When the watcher starts, connect to the native watcher
    const originalStart = watcher.start.bind(watcher)
    const originalStop = watcher.stop.bind(watcher)
    const originalPause = watcher.pause.bind(watcher)
    const originalResume = watcher.resume.bind(watcher)
    const originalDispose = watcher.dispose.bind(watcher)

    watcher.start = () => {
      originalStart()
      this.ipcBridge.startNativeWatcher(watcher.id, root, options ?? {}, ipcHandler)
    }

    watcher.stop = () => {
      originalStop()
      this.ipcBridge.stopNativeWatcher(watcher.id)
    }

    watcher.pause = () => {
      originalPause()
      this.ipcBridge.pauseNativeWatcher(watcher.id)
    }

    watcher.resume = () => {
      originalResume()
      this.ipcBridge.resumeNativeWatcher(watcher.id)
    }

    watcher.dispose = () => {
      originalDispose()
      this.ipcBridge.stopNativeWatcher(watcher.id)
      this.watchers.delete(watcher.id)
    }

    // Propagate events to the manager's global stream and hot-reload
    const sub = watcher.onDidChange(events => {
      this.changeEmitter.emit(events)
      this.hotReload.processChanges(events)
      // Feed conflict detector
      for (const ev of events) {
        if (ev.hash && ev.external) {
          this.conflictDetector.checkDiskChange(ev.path, ev.hash, ev.timestamp)
        }
      }
    })
    this.subscriptions.push(sub)

    this.watchers.set(watcher.id, watcher)
    return watcher
  }

  /**
   * Create a watcher that monitors a single file.
   */
  watchFile(filePath: string, options?: Omit<WatchOptions, 'includes' | 'recursive'>): GlobWatcher {
    const dir = filePath.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
    const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? ''
    return this.watch(dir, {
      ...options,
      includes: [fileName],
      recursive: false,
    })
  }

  /* ── Global subscriptions ─────────────────────────── */

  /** Subscribe to all change events from all watchers. */
  onDidChangeAny(listener: Listener<FileChangeEvent[]>): Disposable {
    return this.changeEmitter.on(listener)
  }

  /** Subscribe to hot-reload triggers. */
  onHotReload(listener: Listener<{ type: 'full' | 'css'; files: string[] }>): Disposable {
    return this.hotReload.onReload(listener)
  }

  /** Subscribe to file conflict detection. */
  onConflict(listener: Listener<FileConflict>): Disposable {
    return this.conflictDetector.onConflict(listener)
  }

  /** Subscribe to conflict resolutions. */
  onConflictResolution(listener: Listener<ConflictResolution>): Disposable {
    return this.conflictDetector.onResolution(listener)
  }

  /* ── Conflict detection ───────────────────────────── */

  /** Register the editor's current state for conflict tracking. */
  trackEditorState(path: string, hash: string, modifiedAt: number): void {
    this.conflictDetector.trackEditorState(path, hash, modifiedAt)
  }

  /** Stop tracking a file (e.g. tab closed). */
  untrackEditor(path: string): void {
    this.conflictDetector.untrack(path)
  }

  /** Resolve an active conflict. */
  resolveConflict(path: string, action: ConflictResolution['action']): void {
    this.conflictDetector.resolve(path, action)
  }

  /** Get all active conflicts. */
  getActiveConflicts(): FileConflict[] {
    return this.conflictDetector.getActiveConflicts()
  }

  /* ── Hot reload ───────────────────────────────────── */

  /** Update hot reload configuration. */
  configureHotReload(config: Partial<HotReloadConfig>): void {
    this.hotReload.updateConfig(config)
  }

  /** Cancel any pending hot reload. */
  cancelHotReload(): void {
    this.hotReload.cancel()
  }

  /* ── Bulk operations ──────────────────────────────── */

  /** Pause all watchers. Useful during large batch operations. */
  pauseAll(): void {
    for (const w of this.watchers.values()) {
      if (w.getState() === 'running') w.pause()
    }
  }

  /** Resume all paused watchers. */
  resumeAll(): void {
    for (const w of this.watchers.values()) {
      if (w.getState() === 'paused') w.resume()
    }
  }

  /** Stop and dispose all watchers. */
  stopAll(): void {
    for (const w of this.watchers.values()) {
      w.dispose()
    }
    this.watchers.clear()
  }

  /**
   * Execute a callback with all watchers paused.
   * Watchers are automatically resumed after the callback completes.
   * Useful for operations like `git checkout` or `npm install`.
   */
  async withPaused<T>(fn: () => T | Promise<T>): Promise<T> {
    this.pauseAll()
    try {
      return await fn()
    } finally {
      this.resumeAll()
    }
  }

  /* ── Queries ──────────────────────────────────────── */

  /** Get a specific watcher by ID. */
  getWatcher(id: string): GlobWatcher | undefined {
    return this.watchers.get(id)
  }

  /** Get stats for all active watchers. */
  getAllStats(): WatcherStats[] {
    return Array.from(this.watchers.values()).map(w => w.getStats())
  }

  /** Get the number of active watchers. */
  get watcherCount(): number {
    return this.watchers.size
  }

  /* ── Lifecycle ────────────────────────────────────── */

  /** Permanently dispose the manager and all its watchers. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    for (const w of this.watchers.values()) {
      w.dispose()
    }
    this.watchers.clear()

    for (const sub of this.subscriptions) {
      sub.dispose()
    }
    this.subscriptions.length = 0

    this.ipcBridge.dispose()
    this.conflictDetector.dispose()
    this.hotReload.dispose()
    this.changeEmitter.removeAll()
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('FileWatcherManager has been disposed')
    }
  }
}

/* ══════════════════════════════════════════════════════════
   Convenience factory
   ══════════════════════════════════════════════════════════ */

let globalManager: FileWatcherManager | null = null

/**
 * Get or create the singleton FileWatcherManager.
 * Suitable for use across the IDE without threading a reference.
 */
export function getFileWatcherManager(hotReloadConfig?: Partial<HotReloadConfig>): FileWatcherManager {
  if (!globalManager || (globalManager as any).disposed) {
    globalManager = new FileWatcherManager(hotReloadConfig)
  }
  return globalManager
}

/**
 * Dispose the global singleton. Call during IDE shutdown.
 */
export function disposeFileWatcherManager(): void {
  if (globalManager) {
    globalManager.dispose()
    globalManager = null
  }
}

/* ── Re-exports for convenience ────────────────────────── */

export { DEFAULT_IGNORE_PATTERNS, DEFAULT_WATCH_OPTIONS, DEFAULT_HOT_RELOAD_CONFIG }
