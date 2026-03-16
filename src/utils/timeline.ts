/**
 * Timeline / Activity tracking utility.
 * Powers the activity feed panel by recording every meaningful action
 * (file edits, git commits, test runs, debug sessions, terminal commands,
 * AI interactions, bookmarks, and notes). Supports filtering, grouping,
 * full-text search, statistics, and JSON persistence.
 *
 * All data is kept in-memory with configurable capacity limits.
 * No external dependencies.
 */

/* ── Entry Type Enum ──────────────────────────────────── */

export type TimelineEntryType =
  | 'file-edit'
  | 'git-commit'
  | 'test-run'
  | 'debug-session'
  | 'terminal-command'
  | 'ai-interaction'
  | 'bookmark'
  | 'note'

/* ── Severity / Status helpers ────────────────────────── */

export type TestRunStatus = 'passed' | 'failed' | 'skipped' | 'running'
export type DebugSessionStatus = 'started' | 'paused' | 'stopped' | 'crashed'
export type AIInteractionKind = 'completion' | 'chat' | 'refactor' | 'explain' | 'fix' | 'test-gen'

/* ── Diff Snapshot ────────────────────────────────────── */

export interface DiffSnapshot {
  /** Path relative to workspace root */
  filePath: string
  /** A lightweight slice of the content around the change (not the whole file) */
  beforeSlice: string
  afterSlice: string
  /** Line range that was affected */
  startLine: number
  endLine: number
}

/* ── Entry Metadata Variants ──────────────────────────── */

export interface FileEditMeta {
  filePath: string
  language?: string
  linesAdded: number
  linesRemoved: number
  /** Optional lightweight diff snapshot */
  snapshot?: DiffSnapshot
}

export interface GitCommitMeta {
  hash: string
  message: string
  branch: string
  filesChanged: string[]
  insertions: number
  deletions: number
  author?: string
}

export interface TestRunMeta {
  suiteName: string
  totalTests: number
  passed: number
  failed: number
  skipped: number
  durationMs: number
  status: TestRunStatus
  failedTests?: string[]
}

export interface DebugSessionMeta {
  sessionId: string
  launchConfig: string
  status: DebugSessionStatus
  durationMs?: number
  breakpointsHit?: number
}

export interface TerminalCommandMeta {
  command: string
  cwd: string
  exitCode?: number
  durationMs?: number
  shell?: string
}

export interface AIInteractionMeta {
  kind: AIInteractionKind
  model?: string
  prompt: string
  /** First 500 chars of response for search/preview */
  responseSummary?: string
  tokensUsed?: number
  filePath?: string
}

export interface BookmarkMeta {
  filePath: string
  line: number
  column?: number
  label?: string
  category?: string
}

export interface NoteMeta {
  title: string
  body: string
  tags?: string[]
  filePath?: string
  line?: number
}

/** Union of all metadata types keyed by entry type */
export interface TimelineMetaMap {
  'file-edit': FileEditMeta
  'git-commit': GitCommitMeta
  'test-run': TestRunMeta
  'debug-session': DebugSessionMeta
  'terminal-command': TerminalCommandMeta
  'ai-interaction': AIInteractionMeta
  'bookmark': BookmarkMeta
  'note': NoteMeta
}

/* ── Timeline Entry ───────────────────────────────────── */

export interface TimelineEntry<T extends TimelineEntryType = TimelineEntryType> {
  id: string
  type: T
  timestamp: number
  /** Human-readable summary shown in the feed */
  summary: string
  /** Git branch active at the time of the entry */
  branch?: string
  /** Workspace-relative file path most relevant to this entry */
  filePath?: string
  /** Metadata specific to the entry type */
  meta: TimelineMetaMap[T]
  /** Optional user-assigned tags */
  tags?: string[]
  /** If the entry was pinned / starred */
  pinned?: boolean
}

/* ── Filter & Query Types ─────────────────────────────── */

export interface TimelineFilter {
  types?: TimelineEntryType[]
  /** Inclusive start timestamp */
  from?: number
  /** Inclusive end timestamp */
  to?: number
  /** Match entries whose filePath starts with this */
  filePathPrefix?: string
  /** Match entries whose filePath equals this exactly */
  filePath?: string
  branch?: string
  tags?: string[]
  pinnedOnly?: boolean
  /** Full-text search query (case-insensitive) */
  search?: string
}

export type GroupByKey = 'day' | 'hour' | 'file' | 'type'

export interface TimelineGroup {
  key: string
  label: string
  entries: TimelineEntry[]
  count: number
}

/* ── Statistics Types ─────────────────────────────────── */

export interface HourlyActivity {
  /** 0-23 */
  hour: number
  count: number
}

export interface DailyActivity {
  /** ISO date string YYYY-MM-DD */
  date: string
  count: number
  byType: Partial<Record<TimelineEntryType, number>>
}

export interface FileActivity {
  filePath: string
  editCount: number
  lastEdited: number
}

export interface ProductivityMetrics {
  totalEntries: number
  entriesByType: Record<TimelineEntryType, number>
  /** Average entries per active day */
  averageEntriesPerDay: number
  /** Hour of day with peak activity (0-23) */
  peakHour: number
  /** Most active day of the week (0=Sun, 6=Sat) */
  peakDayOfWeek: number
  /** Total lines added across file edits */
  totalLinesAdded: number
  /** Total lines removed across file edits */
  totalLinesRemoved: number
  /** Most frequently edited files */
  topFiles: FileActivity[]
  /** Total AI tokens consumed */
  totalAITokens: number
  /** Test pass rate (0-1) */
  testPassRate: number
  /** Longest streak of consecutive active days */
  longestStreakDays: number
}

export interface HeatmapData {
  /** 7 rows (days of week, 0=Sun) x 24 cols (hours) */
  grid: number[][]
  maxValue: number
  totalEntries: number
}

/* ── Event System ─────────────────────────────────────── */

export type TimelineEventKind =
  | 'entry-added'
  | 'entry-removed'
  | 'entry-updated'
  | 'entries-cleared'
  | 'entries-imported'

export interface TimelineEvent {
  kind: TimelineEventKind
  entryId?: string
  entry?: TimelineEntry
  timestamp: number
}

export type TimelineListener = (event: TimelineEvent) => void

/* ── Serialisation Envelope ───────────────────────────── */

export interface TimelineSnapshot {
  version: number
  exportedAt: number
  entryCount: number
  entries: TimelineEntry[]
}

/* ── Store Configuration ──────────────────────────────── */

export interface TimelineStoreConfig {
  /** Maximum entries kept in memory (oldest evicted first). Default 10 000. */
  maxEntries?: number
  /** If true, pinned entries are exempt from eviction. Default true. */
  preservePinned?: boolean
  /** Default branch name when none is provided. Default 'main'. */
  defaultBranch?: string
}

const DEFAULT_CONFIG: Required<TimelineStoreConfig> = {
  maxEntries: 10_000,
  preservePinned: true,
  defaultBranch: 'main',
}

/* ── ID Generator ─────────────────────────────────────── */

let _idCounter = 0

function generateId(): string {
  _idCounter++
  const ts = Date.now().toString(36)
  const seq = _idCounter.toString(36).padStart(4, '0')
  const rand = Math.random().toString(36).slice(2, 6)
  return `tl-${ts}-${seq}-${rand}`
}

/* ── Helpers ──────────────────────────────────────────── */

function toDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toHourKey(ts: number): string {
  const d = new Date(ts)
  return `${toDateKey(ts)}T${String(d.getHours()).padStart(2, '0')}`
}

function toHourLabel(key: string): string {
  // key = "2026-03-13T14"
  const [date, hour] = key.split('T')
  const h = parseInt(hour, 10)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${date} ${h12}:00 ${suffix}`
}

function toDayLabel(key: string): string {
  const d = new Date(key + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Simple case-insensitive substring / multi-word match */
function textMatches(haystack: string, query: string): boolean {
  const lower = haystack.toLowerCase()
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return terms.every(t => lower.includes(t))
}

/** Extract all searchable text from an entry for full-text matching */
function extractSearchableText(entry: TimelineEntry): string {
  const parts: string[] = [entry.summary, entry.type]
  if (entry.filePath) parts.push(entry.filePath)
  if (entry.branch) parts.push(entry.branch)
  if (entry.tags) parts.push(...entry.tags)

  const meta = entry.meta as unknown as Record<string, unknown>
  for (const value of Object.values(meta)) {
    if (typeof value === 'string') {
      parts.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') parts.push(item)
      }
    }
  }
  return parts.join(' ')
}

/* ── Index structures for efficient querying ──────────── */

class TimelineIndex {
  /** Entries by type for fast type filtering */
  private byType = new Map<TimelineEntryType, Set<string>>()
  /** Entries by file path for fast path filtering */
  private byFile = new Map<string, Set<string>>()
  /** Entries by branch */
  private byBranch = new Map<string, Set<string>>()
  /** Entries by date key (YYYY-MM-DD) */
  private byDate = new Map<string, Set<string>>()
  /** Pinned entry ids */
  private pinned = new Set<string>()

  add(entry: TimelineEntry): void {
    this.getOrCreate(this.byType, entry.type).add(entry.id)
    if (entry.filePath) {
      this.getOrCreate(this.byFile, entry.filePath).add(entry.id)
    }
    if (entry.branch) {
      this.getOrCreate(this.byBranch, entry.branch).add(entry.id)
    }
    this.getOrCreate(this.byDate, toDateKey(entry.timestamp)).add(entry.id)
    if (entry.pinned) this.pinned.add(entry.id)
  }

  remove(entry: TimelineEntry): void {
    this.byType.get(entry.type)?.delete(entry.id)
    if (entry.filePath) this.byFile.get(entry.filePath)?.delete(entry.id)
    if (entry.branch) this.byBranch.get(entry.branch)?.delete(entry.id)
    this.byDate.get(toDateKey(entry.timestamp))?.delete(entry.id)
    this.pinned.delete(entry.id)
  }

  update(oldEntry: TimelineEntry, newEntry: TimelineEntry): void {
    this.remove(oldEntry)
    this.add(newEntry)
  }

  getByType(type: TimelineEntryType): Set<string> {
    return this.byType.get(type) ?? new Set()
  }

  getByFile(filePath: string): Set<string> {
    return this.byFile.get(filePath) ?? new Set()
  }

  getByBranch(branch: string): Set<string> {
    return this.byBranch.get(branch) ?? new Set()
  }

  getByDate(date: string): Set<string> {
    return this.byDate.get(date) ?? new Set()
  }

  getPinned(): Set<string> {
    return new Set(this.pinned)
  }

  getAllFiles(): string[] {
    return Array.from(this.byFile.keys())
  }

  getAllBranches(): string[] {
    return Array.from(this.byBranch.keys())
  }

  clear(): void {
    this.byType.clear()
    this.byFile.clear()
    this.byBranch.clear()
    this.byDate.clear()
    this.pinned.clear()
  }

  private getOrCreate<K>(map: Map<K, Set<string>>, key: K): Set<string> {
    let set = map.get(key)
    if (!set) {
      set = new Set()
      map.set(key, set)
    }
    return set
  }
}

/* ── Timeline Store ───────────────────────────────────── */

export class TimelineStore {
  private entries = new Map<string, TimelineEntry>()
  /** Ordered list of entry IDs (oldest first) for efficient eviction */
  private orderedIds: string[] = []
  private config: Required<TimelineStoreConfig>
  private index = new TimelineIndex()
  private listeners = new Set<TimelineListener>()
  private currentBranch: string

  constructor(config?: TimelineStoreConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.currentBranch = this.config.defaultBranch
  }

  /* ── Branch Awareness ─────────────────────────────── */

  /** Update the current branch. New entries inherit this automatically. */
  setCurrentBranch(branch: string): void {
    this.currentBranch = branch
  }

  getCurrentBranch(): string {
    return this.currentBranch
  }

  /* ── CRUD ──────────────────────────────────────────── */

  /** Add a new timeline entry. Returns the generated ID. */
  add<T extends TimelineEntryType>(
    type: T,
    summary: string,
    meta: TimelineMetaMap[T],
    options?: {
      filePath?: string
      branch?: string
      tags?: string[]
      pinned?: boolean
      timestamp?: number
    },
  ): string {
    const entry: TimelineEntry<T> = {
      id: generateId(),
      type,
      timestamp: options?.timestamp ?? Date.now(),
      summary,
      branch: options?.branch ?? this.currentBranch,
      filePath: options?.filePath ?? this.extractFilePath(type, meta),
      meta,
      tags: options?.tags,
      pinned: options?.pinned,
    }

    this.entries.set(entry.id, entry as TimelineEntry)
    this.insertOrdered(entry.id, entry.timestamp)
    this.index.add(entry as TimelineEntry)
    this.enforceCapacity()
    this.emit({ kind: 'entry-added', entryId: entry.id, entry: entry as TimelineEntry, timestamp: Date.now() })
    return entry.id
  }

  /** Retrieve an entry by ID */
  get(id: string): TimelineEntry | undefined {
    return this.entries.get(id)
  }

  /** Update an existing entry. Merges provided fields. */
  update(id: string, patch: Partial<Pick<TimelineEntry, 'summary' | 'tags' | 'pinned' | 'meta'>>): boolean {
    const existing = this.entries.get(id)
    if (!existing) return false

    const updated: TimelineEntry = {
      ...existing,
      ...patch,
      meta: patch.meta ? { ...existing.meta, ...patch.meta } : existing.meta,
    }

    this.index.update(existing, updated)
    this.entries.set(id, updated)
    this.emit({ kind: 'entry-updated', entryId: id, entry: updated, timestamp: Date.now() })
    return true
  }

  /** Remove an entry by ID */
  remove(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false

    this.entries.delete(id)
    this.orderedIds = this.orderedIds.filter(eid => eid !== id)
    this.index.remove(entry)
    this.emit({ kind: 'entry-removed', entryId: id, entry, timestamp: Date.now() })
    return true
  }

  /** Remove all entries matching a filter (or all if no filter given) */
  clear(filter?: TimelineFilter): number {
    if (!filter) {
      const count = this.entries.size
      this.entries.clear()
      this.orderedIds = []
      this.index.clear()
      this.emit({ kind: 'entries-cleared', timestamp: Date.now() })
      return count
    }

    const toRemove = this.query(filter)
    for (const entry of toRemove) {
      this.entries.delete(entry.id)
      this.index.remove(entry)
    }
    const ids = new Set(toRemove.map(e => e.id))
    this.orderedIds = this.orderedIds.filter(id => !ids.has(id))
    return toRemove.length
  }

  /** Toggle the pinned state of an entry */
  togglePin(id: string): boolean {
    const entry = this.entries.get(id)
    if (!entry) return false
    return this.update(id, { pinned: !entry.pinned })
  }

  /** Total number of entries */
  get size(): number {
    return this.entries.size
  }

  /* ── Querying ──────────────────────────────────────── */

  /** Query entries with optional filters. Returns newest first. */
  query(filter?: TimelineFilter, options?: { limit?: number; offset?: number }): TimelineEntry[] {
    let results: TimelineEntry[]

    // If we can narrow with an index, do so
    if (filter && this.canUseIndex(filter)) {
      results = this.indexedQuery(filter)
    } else {
      results = this.fullScan(filter)
    }

    // Sort newest first
    results.sort((a, b) => b.timestamp - a.timestamp)

    // Pagination
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? results.length
    return results.slice(offset, offset + limit)
  }

  /** Count entries matching a filter without materialising the full list */
  count(filter?: TimelineFilter): number {
    if (!filter) return this.entries.size
    // For simple type filters we can use the index directly
    if (filter.types && filter.types.length === 1 && Object.keys(filter).length === 1) {
      return this.index.getByType(filter.types[0]).size
    }
    return this.query(filter).length
  }

  /** Get the N most recent entries */
  recent(n: number): TimelineEntry[] {
    return this.query(undefined, { limit: n })
  }

  /** Get entries for a specific file */
  forFile(filePath: string): TimelineEntry[] {
    return this.query({ filePath })
  }

  /** Get entries for a specific branch */
  forBranch(branch: string): TimelineEntry[] {
    return this.query({ branch })
  }

  /* ── Full-text Search ──────────────────────────────── */

  /** Search across all text content of entries */
  search(queryText: string, filter?: TimelineFilter): TimelineEntry[] {
    const base = filter ? this.query(filter) : Array.from(this.entries.values())
    if (!queryText.trim()) return base.sort((a, b) => b.timestamp - a.timestamp)

    const scored: Array<{ entry: TimelineEntry; score: number }> = []
    const terms = queryText.toLowerCase().split(/\s+/).filter(Boolean)

    for (const entry of base) {
      const text = extractSearchableText(entry).toLowerCase()
      let score = 0
      let allMatch = true

      for (const term of terms) {
        const idx = text.indexOf(term)
        if (idx === -1) {
          allMatch = false
          break
        }
        // Boost for earlier position and exact matches in summary
        score += 10
        if (entry.summary.toLowerCase().includes(term)) score += 20
        if (idx === 0) score += 5
      }

      if (allMatch) {
        // Boost pinned entries
        if (entry.pinned) score += 15
        // Boost recent entries slightly
        score += Math.max(0, 5 - (Date.now() - entry.timestamp) / (1000 * 60 * 60 * 24))
        scored.push({ entry, score })
      }
    }

    scored.sort((a, b) => b.score - a.score || b.entry.timestamp - a.entry.timestamp)
    return scored.map(s => s.entry)
  }

  /* ── Grouping ──────────────────────────────────────── */

  /** Group entries by a key dimension */
  groupBy(key: GroupByKey, filter?: TimelineFilter): TimelineGroup[] {
    const entries = this.query(filter)

    switch (key) {
      case 'day': return this.groupByFn(entries, e => toDateKey(e.timestamp), toDayLabel)
      case 'hour': return this.groupByFn(entries, e => toHourKey(e.timestamp), toHourLabel)
      case 'file': return this.groupByFn(
        entries.filter(e => e.filePath),
        e => e.filePath!,
        k => k,
      )
      case 'type': return this.groupByFn(entries, e => e.type, k => formatEntryType(k))
      default: return []
    }
  }

  /* ── Statistics ────────────────────────────────────── */

  /** Get hourly activity distribution (0-23) */
  getHourlyActivity(filter?: TimelineFilter): HourlyActivity[] {
    const entries = this.query(filter)
    const hours = new Array(24).fill(0) as number[]

    for (const entry of entries) {
      const h = new Date(entry.timestamp).getHours()
      hours[h]++
    }

    return hours.map((count, hour) => ({ hour, count }))
  }

  /** Get daily activity over a date range */
  getDailyActivity(from: number, to: number): DailyActivity[] {
    const entries = this.query({ from, to })
    const dayMap = new Map<string, DailyActivity>()

    for (const entry of entries) {
      const dateKey = toDateKey(entry.timestamp)
      let day = dayMap.get(dateKey)
      if (!day) {
        day = { date: dateKey, count: 0, byType: {} }
        dayMap.set(dateKey, day)
      }
      day.count++
      day.byType[entry.type] = (day.byType[entry.type] ?? 0) + 1
    }

    // Fill in gaps
    const result: DailyActivity[] = []
    const cursor = new Date(from)
    cursor.setHours(0, 0, 0, 0)
    const end = new Date(to)
    end.setHours(23, 59, 59, 999)

    while (cursor <= end) {
      const key = toDateKey(cursor.getTime())
      result.push(dayMap.get(key) ?? { date: key, count: 0, byType: {} })
      cursor.setDate(cursor.getDate() + 1)
    }

    return result
  }

  /** Get most edited files ranked by edit count */
  getMostEditedFiles(limit = 10): FileActivity[] {
    const fileMap = new Map<string, FileActivity>()
    const editIds = this.index.getByType('file-edit')

    for (const id of editIds) {
      const entry = this.entries.get(id)
      if (!entry?.filePath) continue

      let fa = fileMap.get(entry.filePath)
      if (!fa) {
        fa = { filePath: entry.filePath, editCount: 0, lastEdited: 0 }
        fileMap.set(entry.filePath, fa)
      }
      fa.editCount++
      if (entry.timestamp > fa.lastEdited) fa.lastEdited = entry.timestamp
    }

    return Array.from(fileMap.values())
      .sort((a, b) => b.editCount - a.editCount)
      .slice(0, limit)
  }

  /** Compute a week-by-hour heatmap (7 x 24 grid) */
  getHeatmap(filter?: TimelineFilter): HeatmapData {
    const entries = this.query(filter)
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0) as number[])
    let max = 0

    for (const entry of entries) {
      const d = new Date(entry.timestamp)
      const dow = d.getDay()
      const hour = d.getHours()
      grid[dow][hour]++
      if (grid[dow][hour] > max) max = grid[dow][hour]
    }

    return { grid, maxValue: max, totalEntries: entries.length }
  }

  /** Compute comprehensive productivity metrics */
  getProductivityMetrics(filter?: TimelineFilter): ProductivityMetrics {
    const entries = this.query(filter)

    // Entries by type
    const entriesByType = {} as Record<TimelineEntryType, number>
    const allTypes: TimelineEntryType[] = [
      'file-edit', 'git-commit', 'test-run', 'debug-session',
      'terminal-command', 'ai-interaction', 'bookmark', 'note',
    ]
    for (const t of allTypes) entriesByType[t] = 0
    for (const e of entries) entriesByType[e.type]++

    // Active days set
    const activeDays = new Set<string>()
    for (const e of entries) activeDays.add(toDateKey(e.timestamp))

    // Peak hour
    const hourCounts = new Array(24).fill(0) as number[]
    const dowCounts = new Array(7).fill(0) as number[]
    for (const e of entries) {
      const d = new Date(e.timestamp)
      hourCounts[d.getHours()]++
      dowCounts[d.getDay()]++
    }
    const peakHour = hourCounts.indexOf(Math.max(...hourCounts))
    const peakDayOfWeek = dowCounts.indexOf(Math.max(...dowCounts))

    // Lines added / removed from file edits
    let totalLinesAdded = 0
    let totalLinesRemoved = 0
    for (const e of entries) {
      if (e.type === 'file-edit') {
        const m = e.meta as FileEditMeta
        totalLinesAdded += m.linesAdded
        totalLinesRemoved += m.linesRemoved
      }
    }

    // AI tokens
    let totalAITokens = 0
    for (const e of entries) {
      if (e.type === 'ai-interaction') {
        const m = e.meta as AIInteractionMeta
        totalAITokens += m.tokensUsed ?? 0
      }
    }

    // Test pass rate
    let totalTests = 0
    let passedTests = 0
    for (const e of entries) {
      if (e.type === 'test-run') {
        const m = e.meta as TestRunMeta
        totalTests += m.totalTests
        passedTests += m.passed
      }
    }

    // Longest streak
    const longestStreakDays = this.computeLongestStreak(activeDays)

    return {
      totalEntries: entries.length,
      entriesByType,
      averageEntriesPerDay: activeDays.size > 0 ? entries.length / activeDays.size : 0,
      peakHour,
      peakDayOfWeek,
      totalLinesAdded,
      totalLinesRemoved,
      topFiles: this.getMostEditedFiles(10),
      totalAITokens,
      testPassRate: totalTests > 0 ? passedTests / totalTests : 0,
      longestStreakDays,
    }
  }

  /* ── Events ────────────────────────────────────────── */

  /** Subscribe to timeline changes */
  on(listener: TimelineListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Subscribe to a specific event kind */
  onKind(kind: TimelineEventKind, listener: TimelineListener): () => void {
    const wrapper: TimelineListener = (event) => {
      if (event.kind === kind) listener(event)
    }
    return this.on(wrapper)
  }

  /* ── Persistence ───────────────────────────────────── */

  /** Serialise the entire timeline to a JSON-compatible snapshot */
  serialize(): TimelineSnapshot {
    const entries = this.getAllOrdered()
    return {
      version: 1,
      exportedAt: Date.now(),
      entryCount: entries.length,
      entries,
    }
  }

  /** Serialise to a JSON string */
  toJSON(): string {
    return JSON.stringify(this.serialize())
  }

  /** Restore timeline from a snapshot. Existing entries are replaced. */
  deserialize(snapshot: TimelineSnapshot): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported timeline snapshot version: ${snapshot.version}`)
    }

    this.entries.clear()
    this.orderedIds = []
    this.index.clear()

    for (const entry of snapshot.entries) {
      this.entries.set(entry.id, entry)
      this.insertOrdered(entry.id, entry.timestamp)
      this.index.add(entry)
    }

    this.enforceCapacity()
    this.emit({ kind: 'entries-imported', timestamp: Date.now() })
  }

  /** Restore from a JSON string */
  static fromJSON(json: string, config?: TimelineStoreConfig): TimelineStore {
    const store = new TimelineStore(config)
    const snapshot = JSON.parse(json) as TimelineSnapshot
    store.deserialize(snapshot)
    return store
  }

  /** Merge entries from another snapshot without replacing existing data */
  merge(snapshot: TimelineSnapshot): number {
    let imported = 0
    for (const entry of snapshot.entries) {
      if (!this.entries.has(entry.id)) {
        this.entries.set(entry.id, entry)
        this.insertOrdered(entry.id, entry.timestamp)
        this.index.add(entry)
        imported++
      }
    }
    this.enforceCapacity()
    if (imported > 0) {
      this.emit({ kind: 'entries-imported', timestamp: Date.now() })
    }
    return imported
  }

  /* ── Convenience Entry Builders ────────────────────── */

  addFileEdit(
    filePath: string,
    linesAdded: number,
    linesRemoved: number,
    options?: { language?: string; snapshot?: DiffSnapshot; tags?: string[] },
  ): string {
    const net = linesAdded - linesRemoved
    const sign = net >= 0 ? '+' : ''
    const summary = `Edited ${basename(filePath)} (${sign}${net} lines)`
    return this.add('file-edit', summary, {
      filePath,
      language: options?.language,
      linesAdded,
      linesRemoved,
      snapshot: options?.snapshot,
    }, { filePath, tags: options?.tags })
  }

  addGitCommit(
    hash: string,
    message: string,
    branch: string,
    filesChanged: string[],
    insertions: number,
    deletions: number,
    author?: string,
  ): string {
    const short = hash.slice(0, 7)
    const summary = `[${branch}] ${short}: ${message}`
    return this.add('git-commit', summary, {
      hash, message, branch, filesChanged, insertions, deletions, author,
    }, { branch })
  }

  addTestRun(
    suiteName: string,
    results: { total: number; passed: number; failed: number; skipped: number; durationMs: number },
    failedTests?: string[],
  ): string {
    const status: TestRunStatus = results.failed > 0 ? 'failed' : 'passed'
    const summary = `Tests ${status}: ${results.passed}/${results.total} passed (${results.durationMs}ms)`
    return this.add('test-run', summary, {
      suiteName,
      totalTests: results.total,
      passed: results.passed,
      failed: results.failed,
      skipped: results.skipped,
      durationMs: results.durationMs,
      status,
      failedTests,
    })
  }

  addDebugSession(
    sessionId: string,
    launchConfig: string,
    status: DebugSessionStatus,
    durationMs?: number,
    breakpointsHit?: number,
  ): string {
    const summary = `Debug ${status}: ${launchConfig}${durationMs ? ` (${(durationMs / 1000).toFixed(1)}s)` : ''}`
    return this.add('debug-session', summary, {
      sessionId, launchConfig, status, durationMs, breakpointsHit,
    })
  }

  addTerminalCommand(
    command: string,
    cwd: string,
    exitCode?: number,
    durationMs?: number,
    shell?: string,
  ): string {
    const cmdPreview = command.length > 60 ? command.slice(0, 57) + '...' : command
    const status = exitCode === undefined ? '' : exitCode === 0 ? ' (ok)' : ` (exit ${exitCode})`
    const summary = `$ ${cmdPreview}${status}`
    return this.add('terminal-command', summary, {
      command, cwd, exitCode, durationMs, shell,
    })
  }

  addAIInteraction(
    kind: AIInteractionKind,
    prompt: string,
    options?: { model?: string; responseSummary?: string; tokensUsed?: number; filePath?: string },
  ): string {
    const promptPreview = prompt.length > 80 ? prompt.slice(0, 77) + '...' : prompt
    const summary = `AI ${kind}: ${promptPreview}`
    return this.add('ai-interaction', summary, {
      kind,
      prompt,
      model: options?.model,
      responseSummary: options?.responseSummary,
      tokensUsed: options?.tokensUsed,
      filePath: options?.filePath,
    }, { filePath: options?.filePath })
  }

  addBookmark(
    filePath: string,
    line: number,
    options?: { column?: number; label?: string; category?: string },
  ): string {
    const label = options?.label ?? `Line ${line}`
    const summary = `Bookmark: ${basename(filePath)}:${line} - ${label}`
    return this.add('bookmark', summary, {
      filePath,
      line,
      column: options?.column,
      label: options?.label,
      category: options?.category,
    }, { filePath })
  }

  addNote(
    title: string,
    body: string,
    options?: { tags?: string[]; filePath?: string; line?: number },
  ): string {
    const summary = `Note: ${title}`
    return this.add('note', summary, {
      title,
      body,
      tags: options?.tags,
      filePath: options?.filePath,
      line: options?.line,
    }, { filePath: options?.filePath, tags: options?.tags })
  }

  /* ── Snapshot Helpers ──────────────────────────────── */

  /** Get the diff snapshot for a file-edit entry, if one exists */
  getSnapshot(entryId: string): DiffSnapshot | undefined {
    const entry = this.entries.get(entryId)
    if (!entry || entry.type !== 'file-edit') return undefined
    return (entry.meta as FileEditMeta).snapshot
  }

  /** Get all snapshots for a given file path, ordered by time */
  getFileSnapshots(filePath: string): Array<{ entryId: string; timestamp: number; snapshot: DiffSnapshot }> {
    const results: Array<{ entryId: string; timestamp: number; snapshot: DiffSnapshot }> = []
    const ids = this.index.getByFile(filePath)

    for (const id of ids) {
      const entry = this.entries.get(id)
      if (!entry || entry.type !== 'file-edit') continue
      const snap = (entry.meta as FileEditMeta).snapshot
      if (snap) {
        results.push({ entryId: id, timestamp: entry.timestamp, snapshot: snap })
      }
    }

    results.sort((a, b) => a.timestamp - b.timestamp)
    return results
  }

  /* ── Introspection ─────────────────────────────────── */

  /** Get all known file paths with timeline activity */
  getTrackedFiles(): string[] {
    return this.index.getAllFiles()
  }

  /** Get all known branches with timeline activity */
  getTrackedBranches(): string[] {
    return this.index.getAllBranches()
  }

  /** Get all entries in chronological order (oldest first) */
  getAllOrdered(): TimelineEntry[] {
    const result: TimelineEntry[] = []
    for (const id of this.orderedIds) {
      const entry = this.entries.get(id)
      if (entry) result.push(entry)
    }
    return result
  }

  /** Get pinned entries only */
  getPinnedEntries(): TimelineEntry[] {
    const pinned = this.index.getPinned()
    const results: TimelineEntry[] = []
    for (const id of pinned) {
      const entry = this.entries.get(id)
      if (entry) results.push(entry)
    }
    return results.sort((a, b) => b.timestamp - a.timestamp)
  }

  /* ── Private Implementation ────────────────────────── */

  /** Insert an ID into orderedIds maintaining timestamp sort */
  private insertOrdered(id: string, timestamp: number): void {
    // Fast path: most entries are appended at the end (chronological)
    if (this.orderedIds.length === 0) {
      this.orderedIds.push(id)
      return
    }

    const lastId = this.orderedIds[this.orderedIds.length - 1]
    const lastEntry = this.entries.get(lastId)
    if (lastEntry && timestamp >= lastEntry.timestamp) {
      this.orderedIds.push(id)
      return
    }

    // Binary search for correct position
    let lo = 0
    let hi = this.orderedIds.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      const midEntry = this.entries.get(this.orderedIds[mid])
      if (midEntry && midEntry.timestamp <= timestamp) {
        lo = mid + 1
      } else {
        hi = mid
      }
    }
    this.orderedIds.splice(lo, 0, id)
  }

  /** Enforce the max capacity, evicting oldest non-pinned entries */
  private enforceCapacity(): void {
    while (this.entries.size > this.config.maxEntries) {
      let evicted = false
      for (let i = 0; i < this.orderedIds.length; i++) {
        const id = this.orderedIds[i]
        const entry = this.entries.get(id)
        if (!entry) {
          this.orderedIds.splice(i, 1)
          evicted = true
          break
        }
        if (this.config.preservePinned && entry.pinned) continue

        this.entries.delete(id)
        this.orderedIds.splice(i, 1)
        this.index.remove(entry)
        evicted = true
        break
      }

      // If every entry is pinned and we still exceed capacity, stop
      if (!evicted) break
    }
  }

  /** Try to extract a file path from entry metadata */
  private extractFilePath(type: TimelineEntryType, meta: unknown): string | undefined {
    const m = meta as Record<string, unknown>
    if (typeof m.filePath === 'string') return m.filePath
    return undefined
  }

  /** Check whether the filter can benefit from index usage */
  private canUseIndex(filter: TimelineFilter): boolean {
    return !!(
      (filter.types && filter.types.length > 0) ||
      filter.filePath ||
      filter.branch ||
      filter.pinnedOnly
    )
  }

  /** Use the index to narrow down candidate IDs, then apply remaining filters */
  private indexedQuery(filter: TimelineFilter): TimelineEntry[] {
    let candidateIds: Set<string> | null = null

    // Intersect sets from index lookups
    const intersect = (ids: Set<string>) => {
      if (candidateIds === null) {
        candidateIds = new Set(ids)
      } else {
        for (const id of candidateIds) {
          if (!ids.has(id)) candidateIds.delete(id)
        }
      }
    }

    if (filter.types && filter.types.length > 0) {
      const union = new Set<string>()
      for (const t of filter.types) {
        for (const id of this.index.getByType(t)) union.add(id)
      }
      intersect(union)
    }

    if (filter.filePath) {
      intersect(this.index.getByFile(filter.filePath))
    }

    if (filter.branch) {
      intersect(this.index.getByBranch(filter.branch))
    }

    if (filter.pinnedOnly) {
      intersect(this.index.getPinned())
    }

    if (!candidateIds) return []

    const finalIds: Set<string> = candidateIds
    const results: TimelineEntry[] = []
    for (const id of finalIds) {
      const entry = this.entries.get(id)
      if (entry && this.matchesFilter(entry, filter)) {
        results.push(entry)
      }
    }
    return results
  }

  /** Full scan with filter */
  private fullScan(filter?: TimelineFilter): TimelineEntry[] {
    if (!filter) return Array.from(this.entries.values())

    const results: TimelineEntry[] = []
    for (const entry of this.entries.values()) {
      if (this.matchesFilter(entry, filter)) {
        results.push(entry)
      }
    }
    return results
  }

  /** Check if an entry passes all filter criteria */
  private matchesFilter(entry: TimelineEntry, filter: TimelineFilter): boolean {
    if (filter.types && filter.types.length > 0 && !filter.types.includes(entry.type)) {
      return false
    }
    if (filter.from !== undefined && entry.timestamp < filter.from) return false
    if (filter.to !== undefined && entry.timestamp > filter.to) return false
    if (filter.filePath && entry.filePath !== filter.filePath) return false
    if (filter.filePathPrefix && (!entry.filePath || !entry.filePath.startsWith(filter.filePathPrefix))) {
      return false
    }
    if (filter.branch && entry.branch !== filter.branch) return false
    if (filter.pinnedOnly && !entry.pinned) return false
    if (filter.tags && filter.tags.length > 0) {
      if (!entry.tags || !filter.tags.some(t => entry.tags!.includes(t))) return false
    }
    if (filter.search && !textMatches(extractSearchableText(entry), filter.search)) {
      return false
    }
    return true
  }

  /** Generic grouping helper */
  private groupByFn(
    entries: TimelineEntry[],
    keyFn: (e: TimelineEntry) => string,
    labelFn: (key: string) => string,
  ): TimelineGroup[] {
    const map = new Map<string, TimelineEntry[]>()
    const order: string[] = []

    for (const entry of entries) {
      const key = keyFn(entry)
      let group = map.get(key)
      if (!group) {
        group = []
        map.set(key, group)
        order.push(key)
      }
      group.push(entry)
    }

    return order.map(key => {
      const entries = map.get(key)!
      return {
        key,
        label: labelFn(key),
        entries,
        count: entries.length,
      }
    })
  }

  /** Compute the longest streak of consecutive active days */
  private computeLongestStreak(activeDays: Set<string>): number {
    if (activeDays.size === 0) return 0

    const sorted = Array.from(activeDays).sort()
    let longest = 1
    let current = 1

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1] + 'T00:00:00')
      const curr = new Date(sorted[i] + 'T00:00:00')
      const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)

      if (Math.abs(diffDays - 1) < 0.01) {
        current++
        if (current > longest) longest = current
      } else {
        current = 1
      }
    }

    return longest
  }

  /** Emit an event to all listeners */
  private emit(event: TimelineEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // Listener errors must not break the store
      }
    }
  }
}

/* ── Utility Functions ────────────────────────────────── */

/** Extract the file basename from a path */
function basename(filePath: string): string {
  const sep = filePath.lastIndexOf('/')
  const bsep = filePath.lastIndexOf('\\')
  const last = Math.max(sep, bsep)
  return last >= 0 ? filePath.slice(last + 1) : filePath
}

/** Format an entry type for display */
export function formatEntryType(type: TimelineEntryType | string): string {
  const labels: Record<string, string> = {
    'file-edit': 'File Edits',
    'git-commit': 'Git Commits',
    'test-run': 'Test Runs',
    'debug-session': 'Debug Sessions',
    'terminal-command': 'Terminal Commands',
    'ai-interaction': 'AI Interactions',
    'bookmark': 'Bookmarks',
    'note': 'Notes',
  }
  return labels[type] ?? type
}

/** Get an icon identifier for an entry type (for UI rendering) */
export function entryTypeIcon(type: TimelineEntryType): string {
  const icons: Record<TimelineEntryType, string> = {
    'file-edit': 'edit',
    'git-commit': 'git-commit',
    'test-run': 'beaker',
    'debug-session': 'debug-alt',
    'terminal-command': 'terminal',
    'ai-interaction': 'sparkle',
    'bookmark': 'bookmark',
    'note': 'note',
  }
  return icons[type]
}

/** Get a colour hint for an entry type (CSS custom property names or hex) */
export function entryTypeColor(type: TimelineEntryType): string {
  const colors: Record<TimelineEntryType, string> = {
    'file-edit': 'var(--orion-timeline-edit, #4fc3f7)',
    'git-commit': 'var(--orion-timeline-git, #81c784)',
    'test-run': 'var(--orion-timeline-test, #ffb74d)',
    'debug-session': 'var(--orion-timeline-debug, #e57373)',
    'terminal-command': 'var(--orion-timeline-terminal, #b0bec5)',
    'ai-interaction': 'var(--orion-timeline-ai, #ce93d8)',
    'bookmark': 'var(--orion-timeline-bookmark, #fff176)',
    'note': 'var(--orion-timeline-note, #a5d6a7)',
  }
  return colors[type]
}

/** All available entry types */
export const ALL_ENTRY_TYPES: readonly TimelineEntryType[] = [
  'file-edit',
  'git-commit',
  'test-run',
  'debug-session',
  'terminal-command',
  'ai-interaction',
  'bookmark',
  'note',
] as const

/* ── Singleton ────────────────────────────────────────── */

let _defaultStore: TimelineStore | null = null

/** Get (or create) the default shared timeline store */
export function getTimelineStore(config?: TimelineStoreConfig): TimelineStore {
  if (!_defaultStore) {
    _defaultStore = new TimelineStore(config)
  }
  return _defaultStore
}

/** Replace the default shared timeline store (useful for testing) */
export function setTimelineStore(store: TimelineStore): void {
  _defaultStore = store
}

/** Reset the default store (for testing) */
export function resetTimelineStore(): void {
  _defaultStore = null
}
