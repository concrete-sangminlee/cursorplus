/**
 * Workspace-wide search engine for Orion IDE.
 * Provides fast full-text search, trigram indexing, fuzzy file search,
 * symbol search, regex/replace, include/exclude filtering, pagination,
 * and concurrent search with cancellation support.
 */

import { fuzzyMatch, type FuzzyMatchResult } from './fuzzyMatch'

/* ── Constants ────────────────────────────────────────── */

const DEFAULT_MAX_RESULTS = 5000
const DEFAULT_CONTEXT_LINES = 2
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const DEFAULT_PAGE_SIZE = 100
const MAX_SEARCH_HISTORY = 20
const TRIGRAM_MIN_LENGTH = 3
const BINARY_CHECK_BYTES = 512

const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/__pycache__/**',
  '**/vendor/**',
  '**/.cache/**',
  '**/out/**',
]

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.mp3', '.mp4', '.wav', '.ogg', '.avi', '.mov', '.flv', '.wmv',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.dat',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.lock', '.map',
])

/* ── Types ─────────────────────────────────────────────── */

export type SearchScope =
  | 'workspace'
  | 'openFiles'
  | 'currentFile'
  | 'selectedText'
  | 'specificFolders'

export type SymbolKind =
  | 'file'
  | 'module'
  | 'namespace'
  | 'class'
  | 'method'
  | 'property'
  | 'field'
  | 'constructor'
  | 'enum'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'key'
  | 'null'
  | 'enumMember'
  | 'struct'
  | 'event'
  | 'operator'
  | 'typeParameter'
  | 'component'
  | 'hook'

export interface SearchQuery {
  /** The search pattern (literal text or regex) */
  pattern: string
  /** Treat the pattern as a regular expression */
  isRegex: boolean
  /** Enable case-sensitive matching */
  caseSensitive: boolean
  /** Match whole words only */
  wholeWord: boolean
  /** Enable multiline matching (dot matches newline) */
  multiline: boolean
  /** Glob pattern for files to include (e.g. "*.ts,*.tsx") */
  includePattern?: string
  /** Glob pattern for files to exclude */
  excludePattern?: string
  /** Maximum number of results to return */
  maxResults?: number
  /** Number of context lines before and after each match */
  contextLines?: number
  /** Maximum file size in bytes (skip larger files) */
  maxFileSize?: number
  /** The scope of the search */
  scope: SearchScope
  /** Specific folder paths when scope is 'specificFolders' */
  folderPaths?: string[]
  /** List of currently open file paths when scope is 'openFiles' */
  openFilePaths?: string[]
  /** Current file path when scope is 'currentFile' */
  currentFilePath?: string
  /** Selected text content when scope is 'selectedText' */
  selectedText?: string
  /** Page number for paginated results (0-based) */
  page?: number
  /** Number of results per page */
  pageSize?: number
}

export interface HighlightSpan {
  /** Start offset within the line content */
  start: number
  /** End offset within the line content */
  end: number
}

export interface SearchMatch {
  /** Absolute file path */
  filePath: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
  /** Length of the matched text in characters */
  length: number
  /** Full text of the line containing the match */
  lineContent: string
  /** The matched text itself */
  matchText: string
  /** Lines of context before the match */
  contextBefore: string[]
  /** Lines of context after the match */
  contextAfter: string[]
  /** Highlight positions for rendering */
  highlights: HighlightSpan[]
}

export interface SearchFileResult {
  /** Absolute file path */
  filePath: string
  /** All matches in this file */
  matches: SearchMatch[]
  /** Total number of matches in this file */
  totalMatches: number
}

export interface SearchStatistics {
  /** Total number of files searched */
  filesSearched: number
  /** Number of files that contained matches */
  filesWithMatches: number
  /** Total matches across all files */
  totalMatches: number
  /** Total search duration in milliseconds */
  duration: number
  /** Number of files skipped (binary, too large, excluded) */
  filesSkipped: number
  /** Number of files skipped due to size limit */
  filesSkippedBySize: number
  /** Number of files skipped as binary */
  filesSkippedAsBinary: number
}

export interface SearchResult {
  /** The query that produced these results */
  query: SearchQuery
  /** Results grouped by file */
  files: SearchFileResult[]
  /** Total number of files with matches */
  totalFiles: number
  /** Total match count across all files */
  totalMatches: number
  /** Duration in milliseconds */
  duration: number
  /** Whether the result set was truncated by maxResults */
  truncated: boolean
  /** Detailed search statistics */
  statistics: SearchStatistics
  /** Current page number (0-based) */
  page: number
  /** Total number of pages available */
  totalPages: number
  /** Whether more results are available */
  hasMore: boolean
}

export interface ReplacementEntry {
  /** 1-based line number */
  line: number
  /** Original line text */
  original: string
  /** Replacement line text */
  replacement: string
}

export interface ReplacePreview {
  /** Absolute file path */
  filePath: string
  /** Original full file content */
  originalContent: string
  /** New file content after replacements */
  newContent: string
  /** Number of matches replaced in this file */
  matchCount: number
  /** Per-line replacement details */
  replacements: ReplacementEntry[]
}

export interface SearchProgress {
  /** Number of files searched so far */
  filesSearched: number
  /** Total files to search (estimate) */
  totalFiles: number
  /** Matches found so far */
  matchesFound: number
  /** File currently being searched */
  currentFile?: string
  /** Whether the search is complete */
  done: boolean
  /** Elapsed time in milliseconds */
  elapsed: number
}

export interface SearchHistoryEntry {
  /** The search query */
  query: SearchQuery
  /** Timestamp of when the search was executed */
  timestamp: number
  /** Number of results found */
  resultCount: number
  /** Whether this entry is pinned */
  pinned: boolean
  /** Unique identifier */
  id: string
}

export interface FileSearchEntry {
  /** Absolute file path */
  filePath: string
  /** File name without path */
  fileName: string
  /** Relative path from workspace root */
  relativePath: string
}

export interface FileSearchResult {
  /** The file entry */
  entry: FileSearchEntry
  /** Fuzzy match score */
  score: number
  /** Matched character indices for highlighting */
  indices: number[]
}

export interface SymbolEntry {
  /** Symbol name */
  name: string
  /** Symbol kind */
  kind: SymbolKind
  /** Absolute file path */
  filePath: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
  /** Container name (e.g. class name for methods) */
  containerName?: string
  /** Signature for display */
  signature?: string
}

export interface SymbolSearchResult {
  /** The matched symbol */
  symbol: SymbolEntry
  /** Fuzzy match score */
  score: number
  /** Matched character indices for highlighting */
  indices: number[]
}

/* ── Symbol Kind Icon Map ─────────────────────────────── */

export const SYMBOL_KIND_ICONS: Record<SymbolKind, string> = {
  file: 'file',
  module: 'package',
  namespace: 'symbol-namespace',
  class: 'symbol-class',
  method: 'symbol-method',
  property: 'symbol-property',
  field: 'symbol-field',
  constructor: 'symbol-constructor',
  enum: 'symbol-enum',
  interface: 'symbol-interface',
  function: 'symbol-function',
  variable: 'symbol-variable',
  constant: 'symbol-constant',
  string: 'symbol-string',
  number: 'symbol-number',
  boolean: 'symbol-boolean',
  array: 'symbol-array',
  object: 'symbol-object',
  key: 'symbol-key',
  null: 'symbol-null',
  enumMember: 'symbol-enum-member',
  struct: 'symbol-struct',
  event: 'symbol-event',
  operator: 'symbol-operator',
  typeParameter: 'symbol-type-parameter',
  component: 'symbol-class',
  hook: 'symbol-function',
}

/* ── Trigram Index ─────────────────────────────────────── */

/**
 * Trigram-based search index for fast full-text lookup.
 * Splits file contents into 3-character grams and builds an
 * inverted index mapping each trigram to the set of files that contain it.
 */
export class SearchIndex {
  /** Trigram -> set of file paths */
  private trigramMap = new Map<string, Set<string>>()
  /** File path -> raw content for retrieval */
  private fileContents = new Map<string, string>()
  /** File path -> content hash for incremental updates */
  private fileHashes = new Map<string, number>()
  /** Total indexed files */
  private indexedFileCount = 0

  /** Number of files currently in the index */
  get size(): number {
    return this.indexedFileCount
  }

  /** Number of unique trigrams in the index */
  get trigramCount(): number {
    return this.trigramMap.size
  }

  /**
   * Add or update a file in the index.
   * Skips re-indexing if the content has not changed (based on hash).
   */
  indexFile(filePath: string, content: string): void {
    const hash = simpleHash(content)
    if (this.fileHashes.get(filePath) === hash) return

    // Remove old trigrams for this file
    this.removeFile(filePath)

    // Store content and hash
    this.fileContents.set(filePath, content)
    this.fileHashes.set(filePath, hash)
    this.indexedFileCount++

    // Extract trigrams from lowercased content
    const lower = content.toLowerCase()
    const seen = new Set<string>()

    for (let i = 0; i <= lower.length - TRIGRAM_MIN_LENGTH; i++) {
      const trigram = lower.substring(i, i + TRIGRAM_MIN_LENGTH)
      if (seen.has(trigram)) continue
      seen.add(trigram)

      let files = this.trigramMap.get(trigram)
      if (!files) {
        files = new Set()
        this.trigramMap.set(trigram, files)
      }
      files.add(filePath)
    }
  }

  /**
   * Remove a file from the index.
   */
  removeFile(filePath: string): void {
    if (!this.fileContents.has(filePath)) return

    const content = this.fileContents.get(filePath)!
    const lower = content.toLowerCase()
    const seen = new Set<string>()

    for (let i = 0; i <= lower.length - TRIGRAM_MIN_LENGTH; i++) {
      const trigram = lower.substring(i, i + TRIGRAM_MIN_LENGTH)
      if (seen.has(trigram)) continue
      seen.add(trigram)

      const files = this.trigramMap.get(trigram)
      if (files) {
        files.delete(filePath)
        if (files.size === 0) this.trigramMap.delete(trigram)
      }
    }

    this.fileContents.delete(filePath)
    this.fileHashes.delete(filePath)
    this.indexedFileCount--
  }

  /**
   * Query the index for candidate files that may contain the given text.
   * Returns file paths that contain ALL trigrams derived from the query.
   */
  query(text: string): string[] {
    const lower = text.toLowerCase()
    if (lower.length < TRIGRAM_MIN_LENGTH) {
      // Too short for trigram lookup — return all files
      return Array.from(this.fileContents.keys())
    }

    const trigrams: string[] = []
    for (let i = 0; i <= lower.length - TRIGRAM_MIN_LENGTH; i++) {
      trigrams.push(lower.substring(i, i + TRIGRAM_MIN_LENGTH))
    }

    // Intersect file sets for all trigrams, starting with the smallest set
    const sorted = trigrams
      .map(t => this.trigramMap.get(t))
      .filter((s): s is Set<string> => s !== undefined)
      .sort((a, b) => a.size - b.size)

    if (sorted.length === 0) return []
    if (sorted.length < trigrams.length) return [] // some trigram not in index at all

    let result = new Set(sorted[0])
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i]
      const intersection = new Set<string>()
      for (const f of result) {
        if (next.has(f)) intersection.add(f)
      }
      result = intersection
      if (result.size === 0) break
    }

    return Array.from(result)
  }

  /**
   * Retrieve the stored content for a file.
   */
  getContent(filePath: string): string | undefined {
    return this.fileContents.get(filePath)
  }

  /**
   * Check if a file is in the index.
   */
  hasFile(filePath: string): boolean {
    return this.fileContents.has(filePath)
  }

  /**
   * Clear the entire index.
   */
  clear(): void {
    this.trigramMap.clear()
    this.fileContents.clear()
    this.fileHashes.clear()
    this.indexedFileCount = 0
  }

  /**
   * Get statistics about the index.
   */
  getStats(): { files: number; trigrams: number; memoryEstimate: number } {
    let memoryEstimate = 0
    for (const [key, value] of this.trigramMap) {
      memoryEstimate += key.length * 2 + value.size * 50 // rough estimate
    }
    for (const [, content] of this.fileContents) {
      memoryEstimate += content.length * 2
    }
    return {
      files: this.indexedFileCount,
      trigrams: this.trigramMap.size,
      memoryEstimate,
    }
  }
}

/* ── Search Engine ─────────────────────────────────────── */

const api = () => (window as any).api

/**
 * Comprehensive workspace search engine.
 * Supports text search, replace, file filtering, search history,
 * trigram indexing, fuzzy file search, symbol search, pagination,
 * and concurrent search with cancellation.
 */
export class SearchEngine {
  private abortController: AbortController | null = null
  private progressListeners = new Set<(progress: SearchProgress) => void>()
  private resultCache = new Map<string, SearchResult>()
  private maxCacheSize = 20
  private searchIndex = new SearchIndex()
  private searchHistory: SearchHistoryEntry[] = []
  private fileRegistry: FileSearchEntry[] = []
  private symbolRegistry: SymbolEntry[] = []
  private historyIdCounter = 0

  /* ── Text Search ────────────────────────────────────── */

  /**
   * Execute a workspace-wide text search.
   * Supports regex, case-sensitive, whole word, multiline, and scoped searches.
   */
  async search(query: SearchQuery): Promise<SearchResult> {
    this.abort()
    this.abortController = new AbortController()
    const signal = this.abortController.signal

    const startTime = performance.now()
    const cacheKey = this.getCacheKey(query)

    // Check cache
    const cached = this.resultCache.get(cacheKey)
    if (cached) return cached

    try {
      // For selectedText scope, search within the provided text directly
      if (query.scope === 'selectedText' && query.selectedText) {
        return this.searchInText(query, query.selectedText, 'selection', startTime)
      }

      // For currentFile scope, search just that file
      if (query.scope === 'currentFile' && query.currentFilePath) {
        return this.searchSingleFile(query, query.currentFilePath, startTime)
      }

      // Try IPC-based native search first (fastest)
      if (query.scope === 'workspace' || query.scope === 'specificFolders') {
        const nativeResult = await this.nativeSearch(query)
        if (nativeResult) {
          const result = this.formatNativeResult(query, nativeResult, startTime)
          this.cacheResult(cacheKey, result)
          this.addToHistory(query, result.totalMatches)
          return result
        }
      }

      // Try trigram index for literal, non-regex queries
      if (!query.isRegex && this.searchIndex.size > 0) {
        const candidateFiles = this.searchIndex.query(query.pattern)
        if (candidateFiles.length < this.searchIndex.size) {
          return await this.searchCandidateFiles(query, candidateFiles, startTime, signal)
        }
      }

      // Full fallback search
      return await this.fallbackSearch(query, startTime, signal)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return this.emptyResult(query, startTime)
      }
      throw err
    }
  }

  /**
   * Search within a single file.
   */
  private async searchSingleFile(
    query: SearchQuery,
    filePath: string,
    startTime: number
  ): Promise<SearchResult> {
    const content = this.searchIndex.getContent(filePath) || await this.readFileContent(filePath)
    if (!content) return this.emptyResult(query, startTime)
    return this.searchInText(query, content, filePath, startTime)
  }

  /**
   * Search within raw text (used for selectedText and currentFile scopes).
   */
  private searchInText(
    query: SearchQuery,
    text: string,
    filePath: string,
    startTime: number
  ): SearchResult {
    const regex = this.buildRegex(query)
    if (!regex) return this.emptyResult(query, startTime)

    const contextLines = query.contextLines ?? DEFAULT_CONTEXT_LINES
    const matches = query.multiline
      ? this.searchMultiline(text, regex, filePath, contextLines)
      : this.searchInContent(text, regex, filePath, contextLines)

    const fileResult: SearchFileResult = {
      filePath,
      matches,
      totalMatches: matches.length,
    }

    const duration = performance.now() - startTime
    const result: SearchResult = {
      query,
      files: matches.length > 0 ? [fileResult] : [],
      totalFiles: matches.length > 0 ? 1 : 0,
      totalMatches: matches.length,
      duration,
      truncated: false,
      statistics: {
        filesSearched: 1,
        filesWithMatches: matches.length > 0 ? 1 : 0,
        totalMatches: matches.length,
        duration,
        filesSkipped: 0,
        filesSkippedBySize: 0,
        filesSkippedAsBinary: 0,
      },
      page: 0,
      totalPages: 1,
      hasMore: false,
    }

    this.cacheResult(this.getCacheKey(query), result)
    this.addToHistory(query, result.totalMatches)
    return result
  }

  /**
   * Search a pre-filtered list of candidate files (from trigram index).
   */
  private async searchCandidateFiles(
    query: SearchQuery,
    candidateFiles: string[],
    startTime: number,
    signal: AbortSignal
  ): Promise<SearchResult> {
    const regex = this.buildRegex(query)
    if (!regex) return this.emptyResult(query, startTime)

    const contextLines = query.contextLines ?? DEFAULT_CONTEXT_LINES
    const maxResults = query.maxResults ?? DEFAULT_MAX_RESULTS
    const results: SearchFileResult[] = []
    let totalMatches = 0
    let filesSearched = 0
    const stats = this.createEmptyStats()

    for (const filePath of candidateFiles) {
      if (signal.aborted) break
      if (totalMatches >= maxResults) break

      const content = this.searchIndex.getContent(filePath) || await this.readFileContent(filePath)
      if (!content) {
        stats.filesSkipped++
        continue
      }

      filesSearched++
      const matches = query.multiline
        ? this.searchMultiline(content, regex, filePath, contextLines)
        : this.searchInContent(content, regex, filePath, contextLines)

      if (matches.length > 0) {
        results.push({ filePath, matches, totalMatches: matches.length })
        totalMatches += matches.length
        stats.filesWithMatches++
      }

      this.emitProgress({
        filesSearched,
        totalFiles: candidateFiles.length,
        matchesFound: totalMatches,
        currentFile: filePath,
        done: false,
        elapsed: performance.now() - startTime,
      })
    }

    stats.filesSearched = filesSearched
    stats.totalMatches = totalMatches
    stats.duration = performance.now() - startTime

    this.emitProgress({
      filesSearched,
      totalFiles: candidateFiles.length,
      matchesFound: totalMatches,
      done: true,
      elapsed: stats.duration,
    })

    const paged = this.paginateResults(results, query, totalMatches)
    const result: SearchResult = {
      query,
      files: paged.files,
      totalFiles: results.length,
      totalMatches,
      duration: stats.duration,
      truncated: totalMatches >= maxResults,
      statistics: stats,
      page: paged.page,
      totalPages: paged.totalPages,
      hasMore: paged.hasMore,
    }

    this.cacheResult(this.getCacheKey(query), result)
    this.addToHistory(query, totalMatches)
    return result
  }

  /**
   * Full fallback search across all workspace files.
   */
  private async fallbackSearch(
    query: SearchQuery,
    startTime: number,
    signal: AbortSignal
  ): Promise<SearchResult> {
    const regex = this.buildRegex(query)
    if (!regex) return this.emptyResult(query, startTime)

    const files = await this.getSearchableFiles(query)
    const contextLines = query.contextLines ?? DEFAULT_CONTEXT_LINES
    const maxResults = query.maxResults ?? DEFAULT_MAX_RESULTS
    const maxFileSize = query.maxFileSize ?? DEFAULT_MAX_FILE_SIZE
    const results: SearchFileResult[] = []
    let totalMatches = 0
    const stats = this.createEmptyStats()

    for (let i = 0; i < files.length; i++) {
      if (signal.aborted) break
      if (totalMatches >= maxResults) break

      const filePath = files[i]

      // Skip binary files
      if (isBinaryPath(filePath)) {
        stats.filesSkipped++
        stats.filesSkippedAsBinary++
        continue
      }

      const content = await this.readFileContent(filePath)
      if (!content) {
        stats.filesSkipped++
        continue
      }

      // Skip files exceeding size limit
      if (content.length > maxFileSize) {
        stats.filesSkipped++
        stats.filesSkippedBySize++
        continue
      }

      // Skip binary content
      if (isBinaryContent(content)) {
        stats.filesSkipped++
        stats.filesSkippedAsBinary++
        continue
      }

      stats.filesSearched++
      const matches = query.multiline
        ? this.searchMultiline(content, regex, filePath, contextLines)
        : this.searchInContent(content, regex, filePath, contextLines)

      if (matches.length > 0) {
        results.push({ filePath, matches, totalMatches: matches.length })
        totalMatches += matches.length
        stats.filesWithMatches++
      }

      // Index the file for future searches
      this.searchIndex.indexFile(filePath, content)

      this.emitProgress({
        filesSearched: stats.filesSearched,
        totalFiles: files.length,
        matchesFound: totalMatches,
        currentFile: filePath,
        done: false,
        elapsed: performance.now() - startTime,
      })
    }

    stats.totalMatches = totalMatches
    stats.duration = performance.now() - startTime

    this.emitProgress({
      filesSearched: stats.filesSearched,
      totalFiles: files.length,
      matchesFound: totalMatches,
      done: true,
      elapsed: stats.duration,
    })

    const paged = this.paginateResults(results, query, totalMatches)
    const result: SearchResult = {
      query,
      files: paged.files,
      totalFiles: results.length,
      totalMatches,
      duration: stats.duration,
      truncated: totalMatches >= maxResults,
      statistics: stats,
      page: paged.page,
      totalPages: paged.totalPages,
      hasMore: paged.hasMore,
    }

    this.cacheResult(this.getCacheKey(query), result)
    this.addToHistory(query, totalMatches)
    return result
  }

  /* ── Content Matching ───────────────────────────────── */

  /**
   * Search line-by-line within file content (standard mode).
   */
  private searchInContent(
    content: string,
    regex: RegExp,
    filePath: string,
    contextLines: number
  ): SearchMatch[] {
    const lines = content.split('\n')
    const matches: SearchMatch[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      regex.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(line)) !== null) {
        const highlights: HighlightSpan[] = [{
          start: match.index,
          end: match.index + match[0].length,
        }]

        matches.push({
          filePath,
          line: i + 1,
          column: match.index + 1,
          length: match[0].length,
          lineContent: line,
          matchText: match[0],
          contextBefore: lines.slice(Math.max(0, i - contextLines), i),
          contextAfter: lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines)),
          highlights,
        })

        if (!regex.global) break
        if (match[0].length === 0) {
          regex.lastIndex++
          if (regex.lastIndex > line.length) break
        }
      }
    }

    return matches
  }

  /**
   * Multiline search that can match across line boundaries.
   */
  private searchMultiline(
    content: string,
    regex: RegExp,
    filePath: string,
    contextLines: number
  ): SearchMatch[] {
    const matches: SearchMatch[] = []
    const lines = content.split('\n')

    // Build a line offset map for converting character offsets to line numbers
    const lineOffsets: number[] = [0]
    for (let i = 0; i < lines.length; i++) {
      lineOffsets.push(lineOffsets[i] + lines[i].length + 1)
    }

    // Use dotAll-capable regex for multiline
    const multiRegex = new RegExp(
      regex.source,
      regex.flags.includes('s') ? regex.flags : regex.flags + 's'
    )
    multiRegex.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = multiRegex.exec(content)) !== null) {
      const startOffset = match.index
      const matchedText = match[0]

      // Find the line number from offset
      let lineIdx = 0
      for (let i = 1; i < lineOffsets.length; i++) {
        if (lineOffsets[i] > startOffset) {
          lineIdx = i - 1
          break
        }
      }

      const columnOffset = startOffset - lineOffsets[lineIdx]
      const highlights: HighlightSpan[] = [{
        start: columnOffset,
        end: columnOffset + matchedText.length,
      }]

      matches.push({
        filePath,
        line: lineIdx + 1,
        column: columnOffset + 1,
        length: matchedText.length,
        lineContent: lines[lineIdx],
        matchText: matchedText,
        contextBefore: lines.slice(Math.max(0, lineIdx - contextLines), lineIdx),
        contextAfter: lines.slice(lineIdx + 1, Math.min(lines.length, lineIdx + 1 + contextLines)),
        highlights,
      })

      if (!multiRegex.global) break
      if (matchedText.length === 0) {
        multiRegex.lastIndex++
        if (multiRegex.lastIndex > content.length) break
      }
    }

    return matches
  }

  /* ── Replace ────────────────────────────────────────── */

  /**
   * Preview replacements across all matching files.
   * Does not modify any files.
   */
  async searchAndReplace(
    query: SearchQuery,
    replacement: string,
    options?: { preserveCase?: boolean; filePath?: string }
  ): Promise<ReplacePreview[]> {
    const searchResult = await this.search(query)
    const previews: ReplacePreview[] = []

    const filesToProcess = options?.filePath
      ? searchResult.files.filter(f => f.filePath === options.filePath)
      : searchResult.files

    for (const fileResult of filesToProcess) {
      const content = this.searchIndex.getContent(fileResult.filePath)
        || await this.readFileContent(fileResult.filePath)
      if (!content) continue

      const regex = this.buildRegex(query)
      if (!regex) continue

      let newContent: string
      if (options?.preserveCase) {
        newContent = content.replace(regex, (matched) =>
          preserveCaseReplace(matched, replacement)
        )
      } else {
        newContent = content.replace(regex, replacement)
      }

      if (newContent === content) continue

      const originalLines = content.split('\n')
      const newLines = newContent.split('\n')
      const replacements: ReplacementEntry[] = []

      const maxLen = Math.max(originalLines.length, newLines.length)
      for (let i = 0; i < maxLen; i++) {
        const orig = i < originalLines.length ? originalLines[i] : undefined
        const repl = i < newLines.length ? newLines[i] : undefined
        if (orig !== repl) {
          replacements.push({
            line: i + 1,
            original: orig ?? '',
            replacement: repl ?? '',
          })
        }
      }

      if (replacements.length > 0) {
        previews.push({
          filePath: fileResult.filePath,
          originalContent: content,
          newContent,
          matchCount: fileResult.totalMatches,
          replacements,
        })
      }
    }

    return previews
  }

  /**
   * Replace a single match.
   * Returns the updated file content, or null if the match was not found.
   */
  async replaceSingle(
    match: SearchMatch,
    replacement: string,
    options?: { preserveCase?: boolean }
  ): Promise<string | null> {
    const content = this.searchIndex.getContent(match.filePath)
      || await this.readFileContent(match.filePath)
    if (!content) return null

    const lines = content.split('\n')
    const lineIdx = match.line - 1
    if (lineIdx < 0 || lineIdx >= lines.length) return null

    const line = lines[lineIdx]
    const colIdx = match.column - 1
    const before = line.substring(0, colIdx)
    const after = line.substring(colIdx + match.length)

    const actualReplacement = options?.preserveCase
      ? preserveCaseReplace(match.matchText, replacement)
      : replacement

    lines[lineIdx] = before + actualReplacement + after
    const newContent = lines.join('\n')

    // Write back
    try {
      await api()?.writeFile?.(match.filePath, newContent)
      this.searchIndex.indexFile(match.filePath, newContent)
      this.resultCache.clear()
    } catch (err) {
      console.error(`Failed to write ${match.filePath}:`, err)
      return null
    }

    return newContent
  }

  /**
   * Apply replacement previews to disk.
   * Returns the number of files successfully modified.
   */
  async applyReplacements(previews: ReplacePreview[]): Promise<number> {
    let filesModified = 0

    for (const preview of previews) {
      try {
        await api()?.writeFile?.(preview.filePath, preview.newContent)
        this.searchIndex.indexFile(preview.filePath, preview.newContent)
        filesModified++
      } catch (err) {
        console.error(`Failed to write ${preview.filePath}:`, err)
      }
    }

    this.resultCache.clear()
    return filesModified
  }

  /**
   * Replace all matches in a single file.
   * Returns the number of replacements made.
   */
  async replaceInFile(
    filePath: string,
    query: SearchQuery,
    replacement: string,
    options?: { preserveCase?: boolean }
  ): Promise<number> {
    const previews = await this.searchAndReplace(query, replacement, {
      ...options,
      filePath,
    })

    if (previews.length === 0) return 0
    await this.applyReplacements(previews)
    return previews[0].matchCount
  }

  /* ── Fuzzy File Search ──────────────────────────────── */

  /**
   * Register a list of workspace files for fuzzy file search (Ctrl+P).
   */
  registerFiles(entries: FileSearchEntry[]): void {
    this.fileRegistry = entries
  }

  /**
   * Fast fuzzy file name matching with scoring.
   * Returns results sorted by best score.
   */
  fuzzySearchFiles(query: string, maxResults = 50): FileSearchResult[] {
    if (!query) return this.fileRegistry.slice(0, maxResults).map(entry => ({
      entry,
      score: 0,
      indices: [],
    }))

    const results: FileSearchResult[] = []

    for (const entry of this.fileRegistry) {
      // Score against the relative path for better results
      const nameResult = fuzzyMatch(query, entry.fileName)
      const pathResult = fuzzyMatch(query, entry.relativePath)

      // Use whichever scored higher, preferring file name matches
      const bestResult = nameResult.score >= pathResult.score ? nameResult : pathResult
      if (bestResult.score > 0) {
        results.push({
          entry,
          score: bestResult.score,
          indices: bestResult.indices,
        })
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, maxResults)
  }

  /**
   * Add a file entry to the registry.
   */
  addFileEntry(entry: FileSearchEntry): void {
    const exists = this.fileRegistry.some(e => e.filePath === entry.filePath)
    if (!exists) {
      this.fileRegistry.push(entry)
    }
  }

  /**
   * Remove a file entry from the registry.
   */
  removeFileEntry(filePath: string): void {
    this.fileRegistry = this.fileRegistry.filter(e => e.filePath !== filePath)
    this.searchIndex.removeFile(filePath)
  }

  /* ── Symbol Search ──────────────────────────────────── */

  /**
   * Register workspace symbols for symbol search (#).
   */
  registerSymbols(symbols: SymbolEntry[]): void {
    this.symbolRegistry = symbols
  }

  /**
   * Add symbols for a file (replaces any existing symbols for that file).
   */
  updateFileSymbols(filePath: string, symbols: SymbolEntry[]): void {
    this.symbolRegistry = this.symbolRegistry.filter(s => s.filePath !== filePath)
    this.symbolRegistry.push(...symbols)
  }

  /**
   * Search workspace symbols by name with fuzzy matching.
   */
  searchSymbols(query: string, maxResults = 50): SymbolSearchResult[] {
    if (!query) return this.symbolRegistry.slice(0, maxResults).map(symbol => ({
      symbol,
      score: 0,
      indices: [],
    }))

    const results: SymbolSearchResult[] = []

    for (const symbol of this.symbolRegistry) {
      const result = fuzzyMatch(query, symbol.name)
      if (result.score > 0) {
        results.push({
          symbol,
          score: result.score,
          indices: result.indices,
        })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, maxResults)
  }

  /**
   * Search symbols filtered by kind.
   */
  searchSymbolsByKind(query: string, kinds: SymbolKind[], maxResults = 50): SymbolSearchResult[] {
    const kindSet = new Set(kinds)
    const filtered = this.symbolRegistry.filter(s => kindSet.has(s.kind))

    if (!query) return filtered.slice(0, maxResults).map(symbol => ({
      symbol,
      score: 0,
      indices: [],
    }))

    const results: SymbolSearchResult[] = []
    for (const symbol of filtered) {
      const result = fuzzyMatch(query, symbol.name)
      if (result.score > 0) {
        results.push({ symbol, score: result.score, indices: result.indices })
      }
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, maxResults)
  }

  /**
   * Get the icon key for a symbol kind.
   */
  getSymbolIcon(kind: SymbolKind): string {
    return SYMBOL_KIND_ICONS[kind] || 'symbol-misc'
  }

  /* ── Search History ─────────────────────────────────── */

  /**
   * Get the search history, most recent first.
   */
  getHistory(): SearchHistoryEntry[] {
    return [...this.searchHistory]
  }

  /**
   * Pin or unpin a search history entry.
   */
  togglePinHistory(id: string): void {
    const entry = this.searchHistory.find(e => e.id === id)
    if (entry) entry.pinned = !entry.pinned
  }

  /**
   * Remove a specific history entry.
   */
  removeHistoryEntry(id: string): void {
    this.searchHistory = this.searchHistory.filter(e => e.id !== id)
  }

  /**
   * Clear all non-pinned history entries.
   */
  clearHistory(): void {
    this.searchHistory = this.searchHistory.filter(e => e.pinned)
  }

  /**
   * Add a query to the search history.
   */
  private addToHistory(query: SearchQuery, resultCount: number): void {
    // Don't add empty queries
    if (!query.pattern.trim()) return

    // Don't add duplicates (update timestamp instead)
    const existing = this.searchHistory.find(
      e => e.query.pattern === query.pattern
        && e.query.isRegex === query.isRegex
        && e.query.caseSensitive === query.caseSensitive
    )

    if (existing) {
      existing.timestamp = Date.now()
      existing.resultCount = resultCount
      // Move to front
      this.searchHistory = this.searchHistory.filter(e => e.id !== existing.id)
      this.searchHistory.unshift(existing)
      return
    }

    const entry: SearchHistoryEntry = {
      query: { ...query },
      timestamp: Date.now(),
      resultCount,
      pinned: false,
      id: `search-${++this.historyIdCounter}-${Date.now()}`,
    }

    this.searchHistory.unshift(entry)

    // Trim to max size, preserving pinned entries
    while (this.searchHistory.length > MAX_SEARCH_HISTORY) {
      let lastUnpinned = -1
      for (let idx = this.searchHistory.length - 1; idx >= 0; idx--) {
        if (!this.searchHistory[idx].pinned) { lastUnpinned = idx; break }
      }
      if (lastUnpinned === -1) break // all pinned, allow overflow
      this.searchHistory.splice(lastUnpinned, 1)
    }
  }

  /* ── Abort / Progress ───────────────────────────────── */

  /** Cancel the current search */
  abort(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  /** Whether a search is currently running */
  get isSearching(): boolean {
    return this.abortController !== null && !this.abortController.signal.aborted
  }

  /** Subscribe to search progress updates */
  onProgress(listener: (progress: SearchProgress) => void): () => void {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  /* ── Cache / Index Management ───────────────────────── */

  /** Clear the result cache */
  clearCache(): void {
    this.resultCache.clear()
  }

  /** Get the underlying search index */
  getIndex(): SearchIndex {
    return this.searchIndex
  }

  /** Index a file for faster future searches */
  indexFile(filePath: string, content: string): void {
    this.searchIndex.indexFile(filePath, content)
  }

  /** Remove a file from the search index */
  removeFromIndex(filePath: string): void {
    this.searchIndex.removeFile(filePath)
  }

  /** Clear the search index */
  clearIndex(): void {
    this.searchIndex.clear()
  }

  /* ── Private Helpers ────────────────────────────────── */

  private async nativeSearch(query: SearchQuery): Promise<any> {
    try {
      const searchPath = query.scope === 'specificFolders' && query.folderPaths?.length
        ? query.folderPaths[0]
        : '.'

      return await api()?.searchFiles?.(searchPath, {
        query: query.pattern,
        isRegex: query.isRegex,
        caseSensitive: query.caseSensitive,
        wholeWord: query.wholeWord,
        include: query.includePattern,
        exclude: query.excludePattern,
        maxResults: query.maxResults || DEFAULT_MAX_RESULTS,
        contextLines: query.contextLines ?? DEFAULT_CONTEXT_LINES,
      })
    } catch {
      return null
    }
  }

  private async getSearchableFiles(query: SearchQuery): Promise<string[]> {
    try {
      if (query.scope === 'openFiles' && query.openFilePaths) {
        return query.openFilePaths
      }

      if (query.scope === 'specificFolders' && query.folderPaths) {
        const allFiles: string[] = []
        for (const folder of query.folderPaths) {
          const files = await api()?.listFiles?.(folder, {
            include: query.includePattern,
            exclude: query.excludePattern || DEFAULT_EXCLUDES.join(','),
          })
          if (files) allFiles.push(...files)
        }
        return allFiles
      }

      const files = await api()?.listFiles?.('.', {
        include: query.includePattern,
        exclude: query.excludePattern || DEFAULT_EXCLUDES.join(','),
      })
      return files || []
    } catch {
      return []
    }
  }

  private async readFileContent(filePath: string): Promise<string | null> {
    try {
      const result = await api()?.readFile?.(filePath)
      return result?.content || null
    } catch {
      return null
    }
  }

  private buildRegex(query: SearchQuery): RegExp | null {
    try {
      let pattern = query.isRegex ? query.pattern : escapeRegex(query.pattern)
      if (query.wholeWord) pattern = `\\b${pattern}\\b`

      let flags = 'g'
      if (!query.caseSensitive) flags += 'i'
      if (query.multiline) flags += 'ms'
      else flags += 'm'

      return new RegExp(pattern, flags)
    } catch {
      return null
    }
  }

  private formatNativeResult(query: SearchQuery, raw: any, startTime: number): SearchResult {
    const duration = performance.now() - startTime

    if (Array.isArray(raw)) {
      const fileMap = new Map<string, SearchMatch[]>()

      for (const match of raw) {
        const path = match.file || match.filePath
        if (!fileMap.has(path)) fileMap.set(path, [])

        const column = match.column || 1
        const length = match.length || (match.matchText?.length ?? 0)

        fileMap.get(path)!.push({
          filePath: path,
          line: match.line,
          column,
          length,
          lineContent: match.lineContent || '',
          matchText: match.matchText || '',
          contextBefore: match.contextBefore || [],
          contextAfter: match.contextAfter || [],
          highlights: [{ start: column - 1, end: column - 1 + length }],
        })
      }

      const files: SearchFileResult[] = [...fileMap.entries()].map(([path, matches]) => ({
        filePath: path,
        matches,
        totalMatches: matches.length,
      }))

      return {
        query,
        files,
        totalFiles: files.length,
        totalMatches: raw.length,
        duration,
        truncated: false,
        statistics: {
          filesSearched: files.length,
          filesWithMatches: files.length,
          totalMatches: raw.length,
          duration,
          filesSkipped: 0,
          filesSkippedBySize: 0,
          filesSkippedAsBinary: 0,
        },
        page: 0,
        totalPages: 1,
        hasMore: false,
      }
    }

    return this.emptyResult(query, startTime)
  }

  private emptyResult(query: SearchQuery, startTime: number): SearchResult {
    const duration = performance.now() - startTime
    return {
      query,
      files: [],
      totalFiles: 0,
      totalMatches: 0,
      duration,
      truncated: false,
      statistics: {
        filesSearched: 0,
        filesWithMatches: 0,
        totalMatches: 0,
        duration,
        filesSkipped: 0,
        filesSkippedBySize: 0,
        filesSkippedAsBinary: 0,
      },
      page: 0,
      totalPages: 1,
      hasMore: false,
    }
  }

  private createEmptyStats(): SearchStatistics {
    return {
      filesSearched: 0,
      filesWithMatches: 0,
      totalMatches: 0,
      duration: 0,
      filesSkipped: 0,
      filesSkippedBySize: 0,
      filesSkippedAsBinary: 0,
    }
  }

  private paginateResults(
    allFiles: SearchFileResult[],
    query: SearchQuery,
    totalMatches: number
  ): { files: SearchFileResult[]; page: number; totalPages: number; hasMore: boolean } {
    const page = query.page ?? 0
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE

    if (pageSize <= 0 || allFiles.length === 0) {
      return { files: allFiles, page: 0, totalPages: 1, hasMore: false }
    }

    // Paginate by file count
    const totalPages = Math.ceil(allFiles.length / pageSize)
    const start = page * pageSize
    const end = start + pageSize
    const paged = allFiles.slice(start, end)

    return {
      files: paged,
      page,
      totalPages,
      hasMore: end < allFiles.length,
    }
  }

  private getCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      p: query.pattern,
      r: query.isRegex,
      c: query.caseSensitive,
      w: query.wholeWord,
      m: query.multiline,
      i: query.includePattern,
      e: query.excludePattern,
      s: query.scope,
      pg: query.page,
    })
  }

  private cacheResult(key: string, result: SearchResult): void {
    this.resultCache.set(key, result)
    if (this.resultCache.size > this.maxCacheSize) {
      const firstKey = this.resultCache.keys().next().value
      if (firstKey) this.resultCache.delete(firstKey)
    }
  }

  private emitProgress(progress: SearchProgress): void {
    for (const listener of this.progressListeners) {
      try {
        listener(progress)
      } catch { /* ignore listener errors */ }
    }
  }
}

/* ── Singleton Instances ──────────────────────────────── */

export const searchEngine = new SearchEngine()
export const searchIndex = new SearchIndex()

/** @deprecated Use searchEngine instead */
export const workspaceSearch = searchEngine

/* ── Utility Functions ────────────────────────────────── */

/**
 * Escape special regex characters in a string.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Highlight matches in a line of text.
 * Returns segments with `isMatch` flag for rendering.
 */
export function highlightMatches(
  text: string,
  pattern: string,
  isRegex: boolean,
  caseSensitive: boolean
): { text: string; isMatch: boolean }[] {
  try {
    const escapedPattern = isRegex ? pattern : escapeRegex(pattern)
    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(escapedPattern, flags)

    const parts: { text: string; isMatch: boolean }[] = []
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: text.slice(lastIndex, match.index), isMatch: false })
      }
      parts.push({ text: match[0], isMatch: true })
      lastIndex = regex.lastIndex

      if (!regex.global) break
      if (match[0].length === 0) {
        regex.lastIndex++
        if (regex.lastIndex > text.length) break
      }
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), isMatch: false })
    }

    return parts.length > 0 ? parts : [{ text, isMatch: false }]
  } catch {
    return [{ text, isMatch: false }]
  }
}

/**
 * Smart case-preserving replacement.
 * Matches the casing pattern of the original text:
 * - ALL CAPS -> ALL CAPS replacement
 * - all lower -> all lower replacement
 * - Title Case -> Title Case replacement
 * - camelCase -> camelCase replacement
 * - Otherwise -> literal replacement
 */
export function preserveCaseReplace(original: string, replacement: string): string {
  if (!original || !replacement) return replacement

  // ALL UPPERCASE
  if (original === original.toUpperCase() && original !== original.toLowerCase()) {
    return replacement.toUpperCase()
  }

  // all lowercase
  if (original === original.toLowerCase() && original !== original.toUpperCase()) {
    return replacement.toLowerCase()
  }

  // Title Case (first letter uppercase, rest lowercase)
  if (
    original[0] === original[0].toUpperCase() &&
    original.slice(1) === original.slice(1).toLowerCase()
  ) {
    return replacement[0].toUpperCase() + replacement.slice(1).toLowerCase()
  }

  // camelCase (first letter lowercase, contains uppercase)
  if (
    original[0] === original[0].toLowerCase() &&
    original !== original.toLowerCase()
  ) {
    // Try to match character-by-character casing
    const result: string[] = []
    for (let i = 0; i < replacement.length; i++) {
      if (i < original.length) {
        const origChar = original[i]
        if (origChar === origChar.toUpperCase() && origChar !== origChar.toLowerCase()) {
          result.push(replacement[i].toUpperCase())
        } else {
          result.push(replacement[i].toLowerCase())
        }
      } else {
        result.push(replacement[i])
      }
    }
    return result.join('')
  }

  return replacement
}

/**
 * Check if a file path points to a likely binary file.
 */
export function isBinaryPath(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return false
  const ext = filePath.substring(lastDot).toLowerCase()
  return BINARY_EXTENSIONS.has(ext)
}

/**
 * Check if content appears to be binary by looking for null bytes.
 */
export function isBinaryContent(content: string): boolean {
  const checkLength = Math.min(content.length, BINARY_CHECK_BYTES)
  for (let i = 0; i < checkLength; i++) {
    if (content.charCodeAt(i) === 0) return true
  }
  return false
}

/**
 * Simple string hash for change detection (DJB2 variant).
 */
export function simpleHash(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return hash
}

/**
 * Match a file path against a comma-separated list of glob patterns.
 * Uses a simplified matching algorithm (not full glob).
 */
export function matchGlobPatterns(filePath: string, patterns: string): boolean {
  if (!patterns.trim()) return false

  const normalized = filePath.replace(/\\/g, '/')
  const patternList = patterns.split(',').map(p => p.trim()).filter(Boolean)

  for (const pattern of patternList) {
    if (matchSingleGlob(normalized, pattern)) return true
  }

  return false
}

/**
 * Match a single glob pattern against a file path.
 * Supports *, **, and ? wildcards.
 */
function matchSingleGlob(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, '/')

  // Convert glob to regex
  let regexStr = '^'
  let i = 0

  while (i < normalizedPattern.length) {
    const ch = normalizedPattern[i]

    if (ch === '*') {
      if (normalizedPattern[i + 1] === '*') {
        // ** matches everything including path separators
        if (normalizedPattern[i + 2] === '/') {
          regexStr += '(?:.*/)?'
          i += 3
        } else {
          regexStr += '.*'
          i += 2
        }
      } else {
        // * matches everything except path separator
        regexStr += '[^/]*'
        i++
      }
    } else if (ch === '?') {
      regexStr += '[^/]'
      i++
    } else if (ch === '.') {
      regexStr += '\\.'
      i++
    } else if (ch === '{') {
      // Brace expansion: {ts,tsx} -> (ts|tsx)
      const close = normalizedPattern.indexOf('}', i)
      if (close !== -1) {
        const alternatives = normalizedPattern.substring(i + 1, close)
        regexStr += '(' + alternatives.split(',').map(a => escapeRegex(a.trim())).join('|') + ')'
        i = close + 1
      } else {
        regexStr += '\\{'
        i++
      }
    } else {
      regexStr += escapeRegex(ch)
      i++
    }
  }

  regexStr += '$'

  try {
    return new RegExp(regexStr, 'i').test(filePath)
  } catch {
    return false
  }
}

/**
 * Build a default SearchQuery with sensible defaults.
 */
export function createSearchQuery(pattern: string, overrides?: Partial<SearchQuery>): SearchQuery {
  return {
    pattern,
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    multiline: false,
    scope: 'workspace',
    maxResults: DEFAULT_MAX_RESULTS,
    contextLines: DEFAULT_CONTEXT_LINES,
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    ...overrides,
  }
}

/**
 * Format search statistics for display.
 */
export function formatSearchStats(stats: SearchStatistics): string {
  const parts: string[] = []

  parts.push(`${stats.totalMatches} result${stats.totalMatches !== 1 ? 's' : ''}`)
  parts.push(`in ${stats.filesWithMatches} file${stats.filesWithMatches !== 1 ? 's' : ''}`)

  if (stats.duration >= 1000) {
    parts.push(`(${(stats.duration / 1000).toFixed(1)}s)`)
  } else {
    parts.push(`(${Math.round(stats.duration)}ms)`)
  }

  if (stats.filesSkipped > 0) {
    parts.push(`- ${stats.filesSkipped} file${stats.filesSkipped !== 1 ? 's' : ''} skipped`)
  }

  return parts.join(' ')
}

/**
 * Extract file name from a full file path.
 */
export function extractFileName(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? normalized : normalized.substring(lastSlash + 1)
}

/**
 * Compute a relative path from a workspace root.
 */
export function computeRelativePath(filePath: string, workspaceRoot: string): string {
  const normalizedFile = filePath.replace(/\\/g, '/')
  const normalizedRoot = workspaceRoot.replace(/\\/g, '/').replace(/\/$/, '')

  if (normalizedFile.startsWith(normalizedRoot + '/')) {
    return normalizedFile.substring(normalizedRoot.length + 1)
  }
  if (normalizedFile.startsWith(normalizedRoot)) {
    return normalizedFile.substring(normalizedRoot.length)
  }
  return normalizedFile
}

/**
 * Build a FileSearchEntry from an absolute path and workspace root.
 */
export function buildFileSearchEntry(filePath: string, workspaceRoot: string): FileSearchEntry {
  return {
    filePath,
    fileName: extractFileName(filePath),
    relativePath: computeRelativePath(filePath, workspaceRoot),
  }
}
