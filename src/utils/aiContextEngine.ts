/**
 * AI Context Engine - builds intelligent context for AI code assistance.
 * Gathers relevant code snippets, file relationships, symbol definitions,
 * and conversation history to provide rich context to AI providers.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface ContextChunk {
  id: string
  type: 'file' | 'symbol' | 'selection' | 'diagnostic' | 'git-diff' | 'terminal' | 'conversation' | 'doc' | 'dependency'
  content: string
  filePath?: string
  language?: string
  startLine?: number
  endLine?: number
  relevance: number  // 0-1
  tokenCount: number
  metadata?: Record<string, unknown>
}

export interface ContextRequest {
  query: string
  activeFile?: string
  cursorPosition?: { line: number; column: number }
  selection?: { startLine: number; endLine: number; text: string }
  openFiles?: string[]
  recentFiles?: string[]
  maxTokens?: number
  includeGitDiff?: boolean
  includeTerminal?: boolean
  includeDiagnostics?: boolean
  includeImports?: boolean
  strategy?: ContextStrategy
}

export type ContextStrategy = 'focused' | 'broad' | 'conversation' | 'refactor' | 'debug' | 'test-gen'

export interface ContextResult {
  chunks: ContextChunk[]
  totalTokens: number
  strategy: ContextStrategy
  truncated: boolean
  metadata: {
    filesIncluded: number
    symbolsIncluded: number
    timeTaken: number
  }
}

export interface FileRelation {
  source: string
  target: string
  type: 'import' | 'export' | 'extends' | 'implements' | 'references' | 'test-for'
  strength: number
}

export interface SymbolInfo {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'enum' | 'method' | 'property'
  filePath: string
  startLine: number
  endLine: number
  signature?: string
  docComment?: string
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  contextUsed?: string[]
}

/* ── Token estimation ──────────────────────────────────── */

const AVG_CHARS_PER_TOKEN = 4

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN)
}

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * AVG_CHARS_PER_TOKEN
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + '\n... [truncated]'
}

/* ── Import graph analysis ─────────────────────────────── */

const IMPORT_PATTERNS: Record<string, RegExp[]> = {
  typescript: [
    /import\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ],
  python: [
    /^import\s+([\w.]+)/gm,
    /^from\s+([\w.]+)\s+import/gm,
  ],
  rust: [
    /use\s+([\w:]+)/g,
    /mod\s+(\w+)/g,
  ],
  go: [
    /import\s+"([^"]+)"/g,
    /import\s+\w+\s+"([^"]+)"/g,
  ],
}

export function extractImports(content: string, language: string): string[] {
  const patterns = IMPORT_PATTERNS[language] || IMPORT_PATTERNS.typescript
  const imports: Set<string> = new Set()

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags)
    let match
    while ((match = regex.exec(content)) !== null) {
      imports.add(match[1])
    }
  }

  return [...imports]
}

/* ── Symbol extraction (lightweight) ───────────────────── */

const SYMBOL_PATTERNS: Record<string, Array<{ regex: RegExp; kind: SymbolInfo['kind'] }>> = {
  typescript: [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)/gm, kind: 'function' },
    { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
    { regex: /^(?:export\s+)?type\s+(\w+)/gm, kind: 'type' },
    { regex: /^(?:export\s+)?enum\s+(\w+)/gm, kind: 'enum' },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[=:]/gm, kind: 'variable' },
  ],
  python: [
    { regex: /^(?:async\s+)?def\s+(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^class\s+(\w+)/gm, kind: 'class' },
  ],
  rust: [
    { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm, kind: 'function' },
    { regex: /^(?:pub\s+)?struct\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:pub\s+)?trait\s+(\w+)/gm, kind: 'interface' },
    { regex: /^(?:pub\s+)?enum\s+(\w+)/gm, kind: 'enum' },
    { regex: /^(?:pub\s+)?type\s+(\w+)/gm, kind: 'type' },
  ],
  go: [
    { regex: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^type\s+(\w+)\s+struct/gm, kind: 'class' },
    { regex: /^type\s+(\w+)\s+interface/gm, kind: 'interface' },
  ],
}

export function extractSymbols(content: string, filePath: string, language: string): SymbolInfo[] {
  const patterns = SYMBOL_PATTERNS[language] || SYMBOL_PATTERNS.typescript
  const symbols: SymbolInfo[] = []
  const lines = content.split('\n')

  for (const { regex, kind } of patterns) {
    const re = new RegExp(regex.source, regex.flags)
    let match
    while ((match = re.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length - 1

      // Find the end of the symbol (simplified: find next symbol or end)
      let endLine = lineNum
      if (kind === 'function' || kind === 'class' || kind === 'interface' || kind === 'enum') {
        let braceCount = 0
        let foundOpen = false
        for (let i = lineNum; i < lines.length; i++) {
          for (const ch of lines[i]) {
            if (ch === '{' || ch === '(') { braceCount++; foundOpen = true }
            if (ch === '}' || ch === ')') braceCount--
          }
          if (foundOpen && braceCount <= 0) {
            endLine = i
            break
          }
          if (i - lineNum > 500) { endLine = i; break }  // Safety limit
        }
      }

      // Extract doc comment above the symbol
      let docComment: string | undefined
      if (lineNum > 0) {
        const prevLines: string[] = []
        for (let i = lineNum - 1; i >= 0 && i >= lineNum - 20; i--) {
          const line = lines[i].trim()
          if (line.startsWith('*') || line.startsWith('//') || line.startsWith('/**') || line.startsWith('*/') || line.startsWith('#')) {
            prevLines.unshift(lines[i])
          } else {
            break
          }
        }
        if (prevLines.length > 0) docComment = prevLines.join('\n')
      }

      symbols.push({
        name: match[1],
        kind,
        filePath,
        startLine: lineNum,
        endLine,
        signature: lines[lineNum]?.trim(),
        docComment,
      })
    }
  }

  return symbols
}

/* ── Relevance scoring ─────────────────────────────────── */

export function scoreRelevance(chunk: ContextChunk, query: string, activeFile?: string): number {
  let score = chunk.relevance

  const queryLower = query.toLowerCase()
  const contentLower = chunk.content.toLowerCase()

  // Boost if query terms appear in content
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2)
  let termMatches = 0
  for (const term of queryTerms) {
    if (contentLower.includes(term)) termMatches++
  }
  if (queryTerms.length > 0) {
    score += (termMatches / queryTerms.length) * 0.3
  }

  // Boost active file content
  if (activeFile && chunk.filePath === activeFile) {
    score += 0.2
  }

  // Boost by type priority
  const typePriority: Record<string, number> = {
    'selection': 0.3,
    'symbol': 0.2,
    'diagnostic': 0.15,
    'file': 0.1,
    'git-diff': 0.1,
    'conversation': 0.05,
    'terminal': 0.05,
    'doc': 0.05,
    'dependency': 0.02,
  }
  score += typePriority[chunk.type] || 0

  return Math.min(1, score)
}

/* ── Context Window Budget ─────────────────────────────── */

export interface TokenBudget {
  system: number
  conversation: number
  activeFile: number
  relatedFiles: number
  symbols: number
  diagnostics: number
  gitDiff: number
  terminal: number
  reserved: number
}

export function createBudget(maxTokens: number, strategy: ContextStrategy): TokenBudget {
  const budgets: Record<ContextStrategy, TokenBudget> = {
    focused: {
      system: Math.floor(maxTokens * 0.05),
      conversation: Math.floor(maxTokens * 0.1),
      activeFile: Math.floor(maxTokens * 0.4),
      relatedFiles: Math.floor(maxTokens * 0.2),
      symbols: Math.floor(maxTokens * 0.1),
      diagnostics: Math.floor(maxTokens * 0.05),
      gitDiff: Math.floor(maxTokens * 0.05),
      terminal: Math.floor(maxTokens * 0.02),
      reserved: Math.floor(maxTokens * 0.03),
    },
    broad: {
      system: Math.floor(maxTokens * 0.05),
      conversation: Math.floor(maxTokens * 0.1),
      activeFile: Math.floor(maxTokens * 0.15),
      relatedFiles: Math.floor(maxTokens * 0.35),
      symbols: Math.floor(maxTokens * 0.15),
      diagnostics: Math.floor(maxTokens * 0.05),
      gitDiff: Math.floor(maxTokens * 0.05),
      terminal: Math.floor(maxTokens * 0.05),
      reserved: Math.floor(maxTokens * 0.05),
    },
    conversation: {
      system: Math.floor(maxTokens * 0.05),
      conversation: Math.floor(maxTokens * 0.4),
      activeFile: Math.floor(maxTokens * 0.2),
      relatedFiles: Math.floor(maxTokens * 0.15),
      symbols: Math.floor(maxTokens * 0.05),
      diagnostics: Math.floor(maxTokens * 0.05),
      gitDiff: Math.floor(maxTokens * 0.03),
      terminal: Math.floor(maxTokens * 0.02),
      reserved: Math.floor(maxTokens * 0.05),
    },
    refactor: {
      system: Math.floor(maxTokens * 0.05),
      conversation: Math.floor(maxTokens * 0.05),
      activeFile: Math.floor(maxTokens * 0.3),
      relatedFiles: Math.floor(maxTokens * 0.3),
      symbols: Math.floor(maxTokens * 0.15),
      diagnostics: Math.floor(maxTokens * 0.05),
      gitDiff: Math.floor(maxTokens * 0.05),
      terminal: Math.floor(maxTokens * 0.02),
      reserved: Math.floor(maxTokens * 0.03),
    },
    debug: {
      system: Math.floor(maxTokens * 0.05),
      conversation: Math.floor(maxTokens * 0.1),
      activeFile: Math.floor(maxTokens * 0.2),
      relatedFiles: Math.floor(maxTokens * 0.1),
      symbols: Math.floor(maxTokens * 0.05),
      diagnostics: Math.floor(maxTokens * 0.2),
      gitDiff: Math.floor(maxTokens * 0.1),
      terminal: Math.floor(maxTokens * 0.15),
      reserved: Math.floor(maxTokens * 0.05),
    },
    'test-gen': {
      system: Math.floor(maxTokens * 0.05),
      conversation: Math.floor(maxTokens * 0.05),
      activeFile: Math.floor(maxTokens * 0.35),
      relatedFiles: Math.floor(maxTokens * 0.2),
      symbols: Math.floor(maxTokens * 0.15),
      diagnostics: Math.floor(maxTokens * 0.05),
      gitDiff: Math.floor(maxTokens * 0.05),
      terminal: Math.floor(maxTokens * 0.05),
      reserved: Math.floor(maxTokens * 0.05),
    },
  }

  return budgets[strategy]
}

/* ── Context Builder ───────────────────────────────────── */

export class AIContextEngine {
  private fileCache: Map<string, { content: string; symbols: SymbolInfo[]; imports: string[]; mtime: number }> = new Map()
  private relationGraph: Map<string, FileRelation[]> = new Map()
  private conversationHistory: ConversationTurn[] = []
  private maxConversationTurns = 50
  private diagnosticProvider: (() => Array<{ file: string; message: string; severity: string; line: number }>) | null = null
  private gitDiffProvider: (() => string) | null = null
  private terminalProvider: (() => string) | null = null
  private fileReader: ((path: string) => Promise<string>) | null = null

  /* ── Configuration ─────────────────────────── */

  setDiagnosticProvider(fn: () => Array<{ file: string; message: string; severity: string; line: number }>): void {
    this.diagnosticProvider = fn
  }

  setGitDiffProvider(fn: () => string): void {
    this.gitDiffProvider = fn
  }

  setTerminalProvider(fn: () => string): void {
    this.terminalProvider = fn
  }

  setFileReader(fn: (path: string) => Promise<string>): void {
    this.fileReader = fn
  }

  /* ── Conversation tracking ─────────────────── */

  addConversationTurn(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({
      role,
      content,
      timestamp: Date.now(),
    })

    if (this.conversationHistory.length > this.maxConversationTurns) {
      this.conversationHistory.splice(0, this.conversationHistory.length - this.maxConversationTurns)
    }
  }

  clearConversation(): void {
    this.conversationHistory = []
  }

  /* ── File indexing ─────────────────────────── */

  indexFile(filePath: string, content: string, language: string): void {
    const symbols = extractSymbols(content, filePath, language)
    const imports = extractImports(content, language)

    this.fileCache.set(filePath, {
      content,
      symbols,
      imports,
      mtime: Date.now(),
    })

    // Update relation graph
    const relations: FileRelation[] = imports.map(imp => ({
      source: filePath,
      target: imp,
      type: 'import' as const,
      strength: 0.5,
    }))

    this.relationGraph.set(filePath, relations)
  }

  removeFile(filePath: string): void {
    this.fileCache.delete(filePath)
    this.relationGraph.delete(filePath)
  }

  /* ── Related files ─────────────────────────── */

  getRelatedFiles(filePath: string, maxDepth: number = 2): Array<{ path: string; distance: number; relation: string }> {
    const visited = new Set<string>()
    const results: Array<{ path: string; distance: number; relation: string }> = []

    const walk = (current: string, depth: number) => {
      if (depth > maxDepth || visited.has(current)) return
      visited.add(current)

      const relations = this.relationGraph.get(current) || []
      for (const rel of relations) {
        if (!visited.has(rel.target)) {
          results.push({ path: rel.target, distance: depth, relation: rel.type })
          walk(rel.target, depth + 1)
        }
      }

      // Also find files that import this file
      for (const [sourcePath, rels] of this.relationGraph) {
        if (!visited.has(sourcePath)) {
          for (const rel of rels) {
            if (rel.target === current || rel.target.endsWith(current.replace(/\.\w+$/, ''))) {
              results.push({ path: sourcePath, distance: depth, relation: 'imported-by' })
              // Don't walk reverse imports deeply
            }
          }
        }
      }
    }

    walk(filePath, 1)
    return results.sort((a, b) => a.distance - b.distance)
  }

  /* ── Symbol lookup ─────────────────────────── */

  findSymbol(name: string): SymbolInfo[] {
    const results: SymbolInfo[] = []
    for (const [, cached] of this.fileCache) {
      for (const sym of cached.symbols) {
        if (sym.name === name || sym.name.toLowerCase().includes(name.toLowerCase())) {
          results.push(sym)
        }
      }
    }
    return results
  }

  getSymbolsInFile(filePath: string): SymbolInfo[] {
    return this.fileCache.get(filePath)?.symbols || []
  }

  findSymbolAtPosition(filePath: string, line: number): SymbolInfo | undefined {
    const symbols = this.fileCache.get(filePath)?.symbols || []
    return symbols.find(s => line >= s.startLine && line <= s.endLine)
  }

  /* ── Main context building ─────────────────── */

  async buildContext(request: ContextRequest): Promise<ContextResult> {
    const startTime = performance.now()
    const strategy = request.strategy || this.inferStrategy(request)
    const maxTokens = request.maxTokens || 8000
    const budget = createBudget(maxTokens, strategy)
    const chunks: ContextChunk[] = []
    let totalTokens = 0
    let chunkId = 0

    const addChunk = (chunk: Omit<ContextChunk, 'id' | 'tokenCount' | 'relevance'> & { relevance?: number }, budgetCategory: keyof TokenBudget): boolean => {
      const tokens = estimateTokens(chunk.content)
      const budgetRemaining = budget[budgetCategory] - chunks
        .filter(c => c.metadata?.budgetCategory === budgetCategory)
        .reduce((s, c) => s + c.tokenCount, 0)

      if (tokens > budgetRemaining) {
        // Try to fit with truncation
        if (budgetRemaining > 100) {
          const truncated = truncateToTokens(chunk.content, budgetRemaining)
          const truncTokens = estimateTokens(truncated)
          chunks.push({
            ...chunk,
            id: `ctx-${++chunkId}`,
            content: truncated,
            tokenCount: truncTokens,
            relevance: chunk.relevance || 0.5,
            metadata: { ...chunk.metadata, budgetCategory, truncated: true },
          })
          totalTokens += truncTokens
          return true
        }
        return false
      }

      chunks.push({
        ...chunk,
        id: `ctx-${++chunkId}`,
        tokenCount: tokens,
        relevance: chunk.relevance || 0.5,
        metadata: { ...chunk.metadata, budgetCategory },
      })
      totalTokens += tokens
      return true
    }

    // 1. Selection context (highest priority)
    if (request.selection) {
      addChunk({
        type: 'selection',
        content: `Selected code in ${request.activeFile || 'unknown'}:\n\`\`\`\n${request.selection.text}\n\`\`\``,
        filePath: request.activeFile,
        startLine: request.selection.startLine,
        endLine: request.selection.endLine,
        relevance: 1.0,
      }, 'activeFile')
    }

    // 2. Active file context
    if (request.activeFile) {
      const cached = this.fileCache.get(request.activeFile)
      if (cached) {
        const content = this.getRelevantFileSection(cached.content, request.cursorPosition?.line)
        addChunk({
          type: 'file',
          content: `Current file (${request.activeFile}):\n\`\`\`\n${content}\n\`\`\``,
          filePath: request.activeFile,
          relevance: 0.9,
        }, 'activeFile')

        // Add active file symbols as outline
        if (cached.symbols.length > 0) {
          const outline = cached.symbols.map(s =>
            `${s.kind} ${s.name} (L${s.startLine + 1}-${s.endLine + 1})${s.signature ? ': ' + s.signature : ''}`
          ).join('\n')
          addChunk({
            type: 'symbol',
            content: `File outline:\n${outline}`,
            filePath: request.activeFile,
            relevance: 0.7,
          }, 'symbols')
        }
      } else if (this.fileReader) {
        try {
          const content = await this.fileReader(request.activeFile)
          const section = this.getRelevantFileSection(content, request.cursorPosition?.line)
          addChunk({
            type: 'file',
            content: `Current file (${request.activeFile}):\n\`\`\`\n${section}\n\`\`\``,
            filePath: request.activeFile,
            relevance: 0.9,
          }, 'activeFile')
        } catch { /* file not readable */ }
      }
    }

    // 3. Related files
    if (request.activeFile) {
      const related = this.getRelatedFiles(request.activeFile)
      for (const rel of related.slice(0, 5)) {
        const cached = this.fileCache.get(rel.path)
        if (cached) {
          const symbolSummary = cached.symbols.map(s =>
            `${s.kind} ${s.name}${s.signature ? ': ' + s.signature : ''}`
          ).join('\n')

          if (symbolSummary) {
            addChunk({
              type: 'symbol',
              content: `Related file ${rel.path} (${rel.relation}):\n${symbolSummary}`,
              filePath: rel.path,
              relevance: 0.5 / rel.distance,
            }, 'relatedFiles')
          }
        }
      }
    }

    // 4. Open files context
    if (request.openFiles) {
      for (const file of request.openFiles.filter(f => f !== request.activeFile)) {
        const cached = this.fileCache.get(file)
        if (cached && cached.symbols.length > 0) {
          const summary = cached.symbols.slice(0, 20).map(s => `${s.kind} ${s.name}`).join(', ')
          addChunk({
            type: 'file',
            content: `Open file ${file}: ${summary}`,
            filePath: file,
            relevance: 0.3,
          }, 'relatedFiles')
        }
      }
    }

    // 5. Diagnostics
    if (request.includeDiagnostics !== false && this.diagnosticProvider) {
      const diagnostics = this.diagnosticProvider()
      if (diagnostics.length > 0) {
        const diagText = diagnostics.slice(0, 20).map(d =>
          `[${d.severity}] ${d.file}:${d.line} - ${d.message}`
        ).join('\n')
        addChunk({
          type: 'diagnostic',
          content: `Current diagnostics:\n${diagText}`,
          relevance: strategy === 'debug' ? 0.9 : 0.4,
        }, 'diagnostics')
      }
    }

    // 6. Git diff
    if (request.includeGitDiff !== false && this.gitDiffProvider) {
      const diff = this.gitDiffProvider()
      if (diff) {
        addChunk({
          type: 'git-diff',
          content: `Uncommitted changes:\n\`\`\`diff\n${diff}\n\`\`\``,
          relevance: strategy === 'refactor' ? 0.7 : 0.3,
        }, 'gitDiff')
      }
    }

    // 7. Terminal output
    if (request.includeTerminal && this.terminalProvider) {
      const output = this.terminalProvider()
      if (output) {
        addChunk({
          type: 'terminal',
          content: `Recent terminal output:\n\`\`\`\n${output}\n\`\`\``,
          relevance: strategy === 'debug' ? 0.8 : 0.2,
        }, 'terminal')
      }
    }

    // 8. Conversation history
    if (this.conversationHistory.length > 0) {
      const recentTurns = this.conversationHistory.slice(-10)
      const convText = recentTurns.map(t =>
        `${t.role}: ${t.content.slice(0, 500)}`
      ).join('\n\n')
      addChunk({
        type: 'conversation',
        content: `Previous conversation:\n${convText}`,
        relevance: strategy === 'conversation' ? 0.8 : 0.3,
      }, 'conversation')
    }

    // Score and sort chunks
    const scored = chunks.map(chunk => ({
      ...chunk,
      relevance: scoreRelevance(chunk, request.query, request.activeFile),
    }))
    scored.sort((a, b) => b.relevance - a.relevance)

    // Trim to token budget
    let finalTokens = 0
    const finalChunks: ContextChunk[] = []
    for (const chunk of scored) {
      if (finalTokens + chunk.tokenCount > maxTokens) {
        if (finalTokens + 100 < maxTokens) {
          const remaining = maxTokens - finalTokens
          finalChunks.push({
            ...chunk,
            content: truncateToTokens(chunk.content, remaining),
            tokenCount: remaining,
          })
          finalTokens += remaining
        }
        break
      }
      finalChunks.push(chunk)
      finalTokens += chunk.tokenCount
    }

    return {
      chunks: finalChunks,
      totalTokens: finalTokens,
      strategy,
      truncated: scored.length > finalChunks.length,
      metadata: {
        filesIncluded: new Set(finalChunks.filter(c => c.filePath).map(c => c.filePath)).size,
        symbolsIncluded: finalChunks.filter(c => c.type === 'symbol').length,
        timeTaken: performance.now() - startTime,
      },
    }
  }

  /* ── Strategy inference ────────────────────── */

  private inferStrategy(request: ContextRequest): ContextStrategy {
    const q = request.query.toLowerCase()

    if (/\b(fix|bug|error|crash|issue|debug|trace|stack)\b/.test(q)) return 'debug'
    if (/\b(refactor|rename|extract|move|reorganize|restructure)\b/.test(q)) return 'refactor'
    if (/\b(test|spec|coverage|assert|expect|describe|it\s)\b/.test(q)) return 'test-gen'
    if (/\b(explain|what|how|why|understand)\b/.test(q)) return 'broad'
    if (this.conversationHistory.length > 3) return 'conversation'

    return 'focused'
  }

  /* ── File section extraction ───────────────── */

  private getRelevantFileSection(content: string, cursorLine?: number, maxLines: number = 200): string {
    const lines = content.split('\n')

    if (lines.length <= maxLines) return content

    if (cursorLine !== undefined) {
      const halfWindow = Math.floor(maxLines / 2)
      const start = Math.max(0, cursorLine - halfWindow)
      const end = Math.min(lines.length, start + maxLines)
      const section = lines.slice(start, end)
      const prefix = start > 0 ? `... (lines 1-${start} omitted)\n` : ''
      const suffix = end < lines.length ? `\n... (lines ${end + 1}-${lines.length} omitted)` : ''
      return prefix + section.join('\n') + suffix
    }

    // No cursor: return start of file
    return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`
  }

  /* ── System prompt builder ─────────────────── */

  buildSystemPrompt(projectName: string, language?: string): string {
    const parts: string[] = [
      `You are an expert AI coding assistant for the ${projectName} project.`,
    ]

    if (language) {
      parts.push(`The primary language is ${language}.`)
    }

    parts.push(
      'Provide concise, accurate, and well-tested code.',
      'Follow existing code patterns and conventions.',
      'Explain your reasoning briefly when making non-obvious choices.',
    )

    return parts.join(' ')
  }

  /* ── Stats ─────────────────────────────────── */

  getStats(): { indexedFiles: number; totalSymbols: number; conversationTurns: number; relations: number } {
    let totalSymbols = 0
    let totalRelations = 0
    for (const [, cached] of this.fileCache) {
      totalSymbols += cached.symbols.length
    }
    for (const [, rels] of this.relationGraph) {
      totalRelations += rels.length
    }
    return {
      indexedFiles: this.fileCache.size,
      totalSymbols,
      conversationTurns: this.conversationHistory.length,
      relations: totalRelations,
    }
  }

  /* ── Cleanup ───────────────────────────────── */

  clear(): void {
    this.fileCache.clear()
    this.relationGraph.clear()
    this.conversationHistory = []
  }
}

/* ── Singleton ─────────────────────────────────────────── */

let _instance: AIContextEngine | null = null

export function getAIContextEngine(): AIContextEngine {
  if (!_instance) _instance = new AIContextEngine()
  return _instance
}

export function resetAIContextEngine(): void {
  _instance?.clear()
  _instance = null
}
