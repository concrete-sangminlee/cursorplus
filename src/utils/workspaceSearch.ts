/**
 * Workspace-wide search engine.
 * Provides fast full-text search across files with regex, replace,
 * include/exclude patterns, and result streaming.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface SearchQuery {
  pattern: string
  isRegex: boolean
  caseSensitive: boolean
  wholeWord: boolean
  includePattern?: string
  excludePattern?: string
  maxResults?: number
  contextLines?: number
  searchInFiles?: boolean  // true = workspace search, false = current file
}

export interface SearchMatch {
  filePath: string
  line: number
  column: number
  length: number
  lineContent: string
  contextBefore: string[]
  contextAfter: string[]
  matchText: string
}

export interface SearchFileResult {
  filePath: string
  matches: SearchMatch[]
  totalMatches: number
}

export interface SearchResult {
  query: SearchQuery
  files: SearchFileResult[]
  totalFiles: number
  totalMatches: number
  duration: number
  truncated: boolean
}

export interface ReplacePreview {
  filePath: string
  originalContent: string
  newContent: string
  matchCount: number
  replacements: { line: number; original: string; replacement: string }[]
}

export interface SearchProgress {
  filesSearched: number
  totalFiles: number
  matchesFound: number
  currentFile?: string
  done: boolean
}

/* ── Search Engine ─────────────────────────────────────── */

const api = () => (window as any).api

export class WorkspaceSearchEngine {
  private abortController: AbortController | null = null
  private progressListeners = new Set<(progress: SearchProgress) => void>()
  private resultCache = new Map<string, SearchResult>()
  private maxCacheSize = 20

  /** Execute a workspace-wide search */
  async search(query: SearchQuery): Promise<SearchResult> {
    // Cancel any in-progress search
    this.abort()
    this.abortController = new AbortController()

    const startTime = performance.now()
    const cacheKey = this.getCacheKey(query)

    // Check cache
    const cached = this.resultCache.get(cacheKey)
    if (cached) return cached

    try {
      // Try IPC-based search first (native, faster)
      const nativeResult = await this.nativeSearch(query)
      if (nativeResult) {
        const result = this.formatResult(query, nativeResult, startTime)
        this.cacheResult(cacheKey, result)
        return result
      }

      // Fallback to in-memory search
      return await this.fallbackSearch(query, startTime)
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return this.emptyResult(query, startTime)
      }
      throw err
    }
  }

  /** Search and replace across files */
  async searchAndReplace(
    query: SearchQuery,
    replacement: string,
    options?: { preserveCase?: boolean }
  ): Promise<ReplacePreview[]> {
    const searchResult = await this.search(query)
    const previews: ReplacePreview[] = []

    for (const fileResult of searchResult.files) {
      const content = await this.readFileContent(fileResult.filePath)
      if (!content) continue

      const lines = content.split('\n')
      const replacements: ReplacePreview['replacements'] = []
      let newContent = content

      // Build regex
      const regex = this.buildRegex(query)
      if (!regex) continue

      // Apply replacement
      if (options?.preserveCase) {
        newContent = newContent.replace(regex, (match) => {
          return this.preserveCase(match, replacement)
        })
      } else {
        newContent = newContent.replace(regex, replacement)
      }

      // Track per-line changes
      const newLines = newContent.split('\n')
      for (let i = 0; i < Math.max(lines.length, newLines.length); i++) {
        if (i < lines.length && i < newLines.length && lines[i] !== newLines[i]) {
          replacements.push({
            line: i + 1,
            original: lines[i],
            replacement: newLines[i],
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

  /** Apply replacements to files */
  async applyReplacements(previews: ReplacePreview[]): Promise<number> {
    let filesModified = 0

    for (const preview of previews) {
      try {
        await api()?.writeFile?.(preview.filePath, preview.newContent)
        filesModified++
      } catch (err) {
        console.error(`Failed to write ${preview.filePath}:`, err)
      }
    }

    // Clear cache after modifications
    this.resultCache.clear()
    return filesModified
  }

  /** Abort the current search */
  abort(): void {
    this.abortController?.abort()
    this.abortController = null
  }

  /** Subscribe to search progress */
  onProgress(listener: (progress: SearchProgress) => void): () => void {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  /** Clear the result cache */
  clearCache(): void {
    this.resultCache.clear()
  }

  /* ── Private Methods ────────────────────────────────── */

  private async nativeSearch(query: SearchQuery): Promise<any> {
    try {
      return await api()?.searchFiles?.('.', {
        query: query.pattern,
        isRegex: query.isRegex,
        caseSensitive: query.caseSensitive,
        wholeWord: query.wholeWord,
        include: query.includePattern,
        exclude: query.excludePattern,
        maxResults: query.maxResults || 5000,
        contextLines: query.contextLines || 2,
      })
    } catch {
      return null
    }
  }

  private async fallbackSearch(query: SearchQuery, startTime: number): Promise<SearchResult> {
    const regex = this.buildRegex(query)
    if (!regex) return this.emptyResult(query, startTime)

    const files = await this.getSearchableFiles(query)
    const results: SearchFileResult[] = []
    let totalMatches = 0
    const maxResults = query.maxResults || 5000

    for (let i = 0; i < files.length; i++) {
      if (this.abortController?.signal.aborted) break
      if (totalMatches >= maxResults) break

      const content = await this.readFileContent(files[i])
      if (!content) continue

      const matches = this.searchInContent(content, regex, files[i], query.contextLines || 2)
      if (matches.length > 0) {
        results.push({
          filePath: files[i],
          matches,
          totalMatches: matches.length,
        })
        totalMatches += matches.length
      }

      this.emitProgress({
        filesSearched: i + 1,
        totalFiles: files.length,
        matchesFound: totalMatches,
        currentFile: files[i],
        done: false,
      })
    }

    this.emitProgress({
      filesSearched: files.length,
      totalFiles: files.length,
      matchesFound: totalMatches,
      done: true,
    })

    const result: SearchResult = {
      query,
      files: results,
      totalFiles: results.length,
      totalMatches,
      duration: performance.now() - startTime,
      truncated: totalMatches >= maxResults,
    }

    this.cacheResult(this.getCacheKey(query), result)
    return result
  }

  private searchInContent(content: string, regex: RegExp, filePath: string, contextLines: number): SearchMatch[] {
    const lines = content.split('\n')
    const matches: SearchMatch[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      regex.lastIndex = 0
      let match: RegExpExecArray | null

      while ((match = regex.exec(line)) !== null) {
        matches.push({
          filePath,
          line: i + 1,
          column: match.index + 1,
          length: match[0].length,
          lineContent: line,
          matchText: match[0],
          contextBefore: lines.slice(Math.max(0, i - contextLines), i),
          contextAfter: lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines)),
        })

        if (!regex.global) break
      }
    }

    return matches
  }

  private buildRegex(query: SearchQuery): RegExp | null {
    try {
      let pattern = query.isRegex ? query.pattern : escapeRegex(query.pattern)
      if (query.wholeWord) pattern = `\\b${pattern}\\b`

      const flags = query.caseSensitive ? 'gm' : 'gim'
      return new RegExp(pattern, flags)
    } catch {
      return null
    }
  }

  private async getSearchableFiles(query: SearchQuery): Promise<string[]> {
    try {
      const files = await api()?.listFiles?.('.', {
        include: query.includePattern,
        exclude: query.excludePattern || '**/node_modules/**,**/.git/**,**/dist/**,**/build/**',
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

  private preserveCase(original: string, replacement: string): string {
    if (original === original.toUpperCase()) return replacement.toUpperCase()
    if (original === original.toLowerCase()) return replacement.toLowerCase()
    if (original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1)
    }
    return replacement
  }

  private formatResult(query: SearchQuery, raw: any, startTime: number): SearchResult {
    if (Array.isArray(raw)) {
      const files = new Map<string, SearchMatch[]>()
      for (const match of raw) {
        const path = match.file || match.filePath
        if (!files.has(path)) files.set(path, [])
        files.get(path)!.push({
          filePath: path,
          line: match.line,
          column: match.column || 1,
          length: match.length || 0,
          lineContent: match.lineContent || '',
          matchText: match.matchText || '',
          contextBefore: match.contextBefore || [],
          contextAfter: match.contextAfter || [],
        })
      }

      const fileResults: SearchFileResult[] = [...files.entries()].map(([path, matches]) => ({
        filePath: path,
        matches,
        totalMatches: matches.length,
      }))

      return {
        query,
        files: fileResults,
        totalFiles: fileResults.length,
        totalMatches: raw.length,
        duration: performance.now() - startTime,
        truncated: false,
      }
    }

    return this.emptyResult(query, startTime)
  }

  private emptyResult(query: SearchQuery, startTime: number): SearchResult {
    return {
      query,
      files: [],
      totalFiles: 0,
      totalMatches: 0,
      duration: performance.now() - startTime,
      truncated: false,
    }
  }

  private getCacheKey(query: SearchQuery): string {
    return JSON.stringify({
      p: query.pattern,
      r: query.isRegex,
      c: query.caseSensitive,
      w: query.wholeWord,
      i: query.includePattern,
      e: query.excludePattern,
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
    this.progressListeners.forEach(l => {
      try { l(progress) } catch {}
    })
  }
}

/* ── Singleton ─────────────────────────────────────────── */

export const workspaceSearch = new WorkspaceSearchEngine()

/* ── Helpers ───────────────────────────────────────────── */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Highlight matches in a line of text */
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
    }

    if (lastIndex < text.length) {
      parts.push({ text: text.slice(lastIndex), isMatch: false })
    }

    return parts.length > 0 ? parts : [{ text, isMatch: false }]
  } catch {
    return [{ text, isMatch: false }]
  }
}
