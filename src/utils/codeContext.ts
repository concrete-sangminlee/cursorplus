import { useEditorStore } from '@/store/editor'
import type { OpenFile } from '@shared/types'

/* ── Types ────────────────────────────────────────────── */

export interface CodeContext {
  activeFilePath: string | null
  activeFileContent: string | null
  activeFileLanguage: string | null
  selectionText: string | null
  cursorLine: number | null
  surroundingLines: string | null
  openFilePaths: string[]
  importStatements: string | null
  relatedFiles: RelatedFile[]
}

export interface RelatedFile {
  path: string
  name: string
  language: string
  content: string // first 100 lines
}

/** A scored chunk of context ready for token-budget allocation */
export interface ContextChunk {
  source: ContextPriority
  label: string
  content: string
  estimatedTokens: number
  relevanceScore: number // 0-1
  recencyScore: number   // 0-1
  qualityScore: number   // combined relevance * 0.7 + recency * 0.3
}

export type ContextPriority =
  | 'current-selection'
  | 'type-definitions'
  | 'imports-and-types'
  | 'file-outline'
  | 'recent-edits'

/** Token budget allocation per priority tier */
export interface TokenBudget {
  total: number
  allocations: Record<ContextPriority, number>
}

/** A node in the import dependency graph */
export interface DependencyNode {
  path: string
  imports: string[]   // paths this file imports
  importedBy: string[] // paths that import this file
}

/** Project-level metadata detected from files */
export interface ProjectMeta {
  projectType: ProjectType[]
  frameworks: string[]
  libraries: string[]
  codeStyle: CodeStyleConventions
  lintingRules: string[]
}

export type ProjectType = 'react' | 'node' | 'python' | 'rust' | 'go' | 'java' | 'vue' | 'svelte' | 'generic'

export interface CodeStyleConventions {
  indentation: 'tabs' | 'spaces-2' | 'spaces-4' | 'mixed'
  quotes: 'single' | 'double' | 'mixed'
  semicolons: 'always' | 'never' | 'mixed'
  trailingComma: boolean
}

/** Cached context entry with invalidation support */
interface CachedContext<T> {
  value: T
  fileHash: string
  timestamp: number
}

/* ── Constants ────────────────────────────────────────── */

const DEFAULT_TOKEN_BUDGET = 8000
const CHARS_PER_TOKEN_ESTIMATE = 4

const PRIORITY_WEIGHTS: Record<ContextPriority, number> = {
  'current-selection': 0.40,
  'type-definitions': 0.20,
  'imports-and-types': 0.20,
  'file-outline': 0.10,
  'recent-edits': 0.10,
}

/* ── Context Cache ────────────────────────────────────── */

const contextCache = new Map<string, CachedContext<unknown>>()
const CACHE_TTL_MS = 30_000 // 30 seconds

function computeFileHash(content: string): string {
  // Simple fast hash: length + first/last chars + a sampled checksum
  let hash = content.length
  const step = Math.max(1, Math.floor(content.length / 100))
  for (let i = 0; i < content.length; i += step) {
    hash = ((hash << 5) - hash + content.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

function getCached<T>(key: string, fileHash: string): T | null {
  const entry = contextCache.get(key) as CachedContext<T> | undefined
  if (!entry) return null
  if (entry.fileHash !== fileHash) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    contextCache.delete(key)
    return null
  }
  return entry.value
}

function setCache<T>(key: string, fileHash: string, value: T): void {
  contextCache.set(key, { value, fileHash, timestamp: Date.now() })
}

/** Clear all cached context (e.g., on file change notification) */
export function invalidateContextCache(filePath?: string): void {
  if (filePath) {
    // Remove all cache entries related to this file
    const keysToDelete: string[] = []
    contextCache.forEach((_, key) => {
      if (key.includes(filePath)) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach((key) => contextCache.delete(key))
  } else {
    contextCache.clear()
  }
}

/* ── Language detection helper ────────────────────────── */

function extToLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    py: 'python', rs: 'rust', go: 'go', java: 'java', c: 'c', cpp: 'cpp',
    cs: 'csharp', rb: 'ruby', php: 'php', swift: 'swift', kt: 'kotlin',
    html: 'html', css: 'css', scss: 'scss', json: 'json', md: 'markdown',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', sh: 'bash',
    vue: 'vue', svelte: 'svelte',
  }
  return map[ext] || ext
}

/* ── Token estimation ─────────────────────────────────── */

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE)
}

function truncateToTokenBudget(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN_ESTIMATE
  if (text.length <= maxChars) return text
  // Truncate at line boundary
  const truncated = text.substring(0, maxChars)
  const lastNewline = truncated.lastIndexOf('\n')
  return (lastNewline > 0 ? truncated.substring(0, lastNewline) : truncated) + '\n// ... (truncated to fit token budget)'
}

/* ── Import parsing ───────────────────────────────────── */

interface ParsedImport {
  raw: string
  specifier: string // the from '...' path
  isRelative: boolean
  importedNames: string[] // named imports extracted
}

function parseImports(content: string): ParsedImport[] {
  const lines = content.split('\n')
  const imports: ParsedImport[] = []

  // Scan all lines for imports (not just first 30)
  for (const line of lines) {
    const trimmed = line.trim()

    // ES import: import ... from '...'
    const esMatch = trimmed.match(/^import\s+(.*?)\s+from\s+['"](.+?)['"]/)
    if (esMatch) {
      const importClause = esMatch[1]
      const specifier = esMatch[2]
      const names = extractImportedNames(importClause)
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.') || specifier.startsWith('@/'),
        importedNames: names,
      })
      continue
    }

    // Side-effect import: import '...'
    const sideEffectMatch = trimmed.match(/^import\s+['"](.+?)['"]/)
    if (sideEffectMatch) {
      const specifier = sideEffectMatch[1]
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.') || specifier.startsWith('@/'),
        importedNames: [],
      })
      continue
    }

    // CommonJS require: const x = require('...')
    const requireMatch = trimmed.match(/(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"](.+?)['"]\s*\)/)
    if (requireMatch) {
      const specifier = requireMatch[2]
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.') || specifier.startsWith('@/'),
        importedNames: [requireMatch[1]],
      })
      continue
    }

    // Destructured require: const { a, b } = require('...')
    const destructuredRequire = trimmed.match(/(?:const|let|var)\s+\{([^}]+)\}\s*=\s*require\s*\(\s*['"](.+?)['"]\s*\)/)
    if (destructuredRequire) {
      const specifier = destructuredRequire[2]
      const names = destructuredRequire[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean)
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.') || specifier.startsWith('@/'),
        importedNames: names,
      })
    }

    // Python import: from x import y  /  import x
    const pyFromMatch = trimmed.match(/^from\s+(\S+)\s+import\s+(.+)/)
    if (pyFromMatch) {
      const specifier = pyFromMatch[1]
      const names = pyFromMatch[2].split(',').map(n => n.trim().split(/\s+as\s+/).pop()!.trim()).filter(Boolean)
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.'),
        importedNames: names,
      })
      continue
    }

    const pyImportMatch = trimmed.match(/^import\s+(\S+)(?:\s+as\s+(\S+))?/)
    if (pyImportMatch && !trimmed.includes('from') && !trimmed.includes('{')) {
      const specifier = pyImportMatch[1]
      imports.push({
        raw: trimmed,
        specifier,
        isRelative: specifier.startsWith('.'),
        importedNames: [pyImportMatch[2] || specifier],
      })
    }
  }

  return imports
}

/** Extract named imports from an import clause like "{ Foo, Bar as Baz }" or "Default" */
function extractImportedNames(clause: string): string[] {
  const names: string[] = []
  // Default import
  const defaultMatch = clause.match(/^(\w+)/)
  if (defaultMatch && defaultMatch[1] !== 'type') {
    names.push(defaultMatch[1])
  }
  // Named imports in braces
  const braceMatch = clause.match(/\{([^}]+)\}/)
  if (braceMatch) {
    const inner = braceMatch[1]
    for (const part of inner.split(',')) {
      const trimmed = part.trim().replace(/^type\s+/, '')
      const asMatch = trimmed.match(/(\w+)\s+as\s+(\w+)/)
      if (asMatch) {
        names.push(asMatch[2])
      } else if (trimmed) {
        names.push(trimmed)
      }
    }
  }
  // Namespace import: * as Ns
  const nsMatch = clause.match(/\*\s+as\s+(\w+)/)
  if (nsMatch) {
    names.push(nsMatch[1])
  }
  return names
}

/* ── Resolve import paths ─────────────────────────────── */

const defaultExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json']

function resolveImportPath(specifier: string, currentFilePath: string, allFilePaths: string[]): string | null {
  let resolved: string

  if (specifier.startsWith('@/')) {
    // Alias: @/ -> src/
    resolved = specifier.replace('@/', 'src/')
  } else if (specifier.startsWith('.')) {
    // Relative import: resolve against current file's directory
    const currentDir = currentFilePath.split('/').slice(0, -1).join('/')
    const parts = specifier.split('/')
    const dirParts = currentDir.split('/')

    for (const part of parts) {
      if (part === '..') {
        dirParts.pop()
      } else if (part !== '.') {
        dirParts.push(part)
      }
    }
    resolved = dirParts.join('/')
  } else {
    // Node module - skip
    return null
  }

  // Normalize path separators
  resolved = resolved.replace(/\\/g, '/')

  // Try exact match first
  const exactMatch = allFilePaths.find((p) => p.replace(/\\/g, '/') === resolved)
  if (exactMatch) return exactMatch

  // Try with extensions
  for (const ext of defaultExtensions) {
    const withExt = resolved + ext
    const match = allFilePaths.find((p) => p.replace(/\\/g, '/') === withExt)
    if (match) return match
  }

  // Try as directory with index file
  for (const ext of defaultExtensions) {
    const indexPath = resolved + '/index' + ext
    const match = allFilePaths.find((p) => p.replace(/\\/g, '/') === indexPath)
    if (match) return match
  }

  // Fuzzy match: find any file whose normalized path ends with the resolved path
  const normalizedResolved = resolved.replace(/^(src\/|\.?\/)/, '')
  for (const ext of ['', ...defaultExtensions]) {
    const target = normalizedResolved + ext
    const match = allFilePaths.find((p) => {
      const normalized = p.replace(/\\/g, '/').replace(/^(src\/|\.?\/)/, '')
      return normalized === target || normalized.endsWith('/' + target)
    })
    if (match) return match
  }

  return null
}

/* ── Smart Context Extraction ─────────────────────────── */

/** Extract the function or class body surrounding the cursor line */
export function extractCurrentScope(content: string, cursorLine: number): { text: string; startLine: number; endLine: number } | null {
  const lines = content.split('\n')
  if (cursorLine < 0 || cursorLine >= lines.length) return null

  // Walk backwards to find the start of the enclosing function/class/method
  let scopeStart = cursorLine
  let braceDepth = 0
  let foundOpener = false

  // First: count brace depth at cursor to understand nesting
  for (let i = 0; i <= cursorLine; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '{') braceDepth++
      if (ch === '}') braceDepth--
    }
  }

  // Walk backwards from cursor to find the function/class declaration
  const scopePattern = /^\s*(export\s+)?(default\s+)?(async\s+)?(function|class|const\s+\w+\s*=\s*(async\s*)?\(|const\s+\w+\s*=\s*(async\s*)?(\([^)]*\)|[a-zA-Z_]\w*)\s*=>|interface|type\s+\w+|enum|def\s+|fn\s+|func\s+|pub\s+)/
  for (let i = cursorLine; i >= 0; i--) {
    if (scopePattern.test(lines[i])) {
      scopeStart = i
      foundOpener = true
      break
    }
  }

  if (!foundOpener) {
    // Fallback: provide surrounding context
    const start = Math.max(0, cursorLine - 15)
    const end = Math.min(lines.length, cursorLine + 16)
    return {
      text: lines.slice(start, end).join('\n'),
      startLine: start,
      endLine: end - 1,
    }
  }

  // Walk forward from the scope start to find the matching closing brace
  let depth = 0
  let scopeEnd = scopeStart
  let enteredBody = false

  for (let i = scopeStart; i < lines.length; i++) {
    const line = lines[i]
    for (const ch of line) {
      if (ch === '{') { depth++; enteredBody = true }
      if (ch === '}') depth--
    }
    if (enteredBody && depth <= 0) {
      scopeEnd = i
      break
    }
    // For arrow functions without braces or single-line functions
    if (i === scopeStart && !line.includes('{') && i < lines.length - 1) {
      // Might be a one-liner or arrow without braces
      if (!lines[i + 1]?.match(/^\s*[{]/)) {
        scopeEnd = i
        break
      }
    }
    scopeEnd = i
  }

  // If the scope is too large (> 200 lines), center around cursor
  if (scopeEnd - scopeStart > 200) {
    const windowStart = Math.max(scopeStart, cursorLine - 50)
    const windowEnd = Math.min(scopeEnd, cursorLine + 51)
    return {
      text: (windowStart > scopeStart ? '// ... (scope start above)\n' : '')
        + lines.slice(windowStart, windowEnd + 1).join('\n')
        + (windowEnd < scopeEnd ? '\n// ... (scope continues below)' : ''),
      startLine: windowStart,
      endLine: windowEnd,
    }
  }

  return {
    text: lines.slice(scopeStart, scopeEnd + 1).join('\n'),
    startLine: scopeStart,
    endLine: scopeEnd,
  }
}

/** Extract type definitions (interfaces, types, enums) from file content */
export function extractTypeDefinitions(content: string): string[] {
  const lines = content.split('\n')
  const typeDefs: string[] = []
  const typePattern = /^\s*(export\s+)?(interface|type|enum)\s+(\w+)/

  let i = 0
  while (i < lines.length) {
    const match = lines[i].match(typePattern)
    if (match) {
      // Collect the full type definition
      let depth = 0
      let started = false
      const defLines: string[] = []

      for (let j = i; j < lines.length; j++) {
        defLines.push(lines[j])
        for (const ch of lines[j]) {
          if (ch === '{' || ch === '(') { depth++; started = true }
          if (ch === '}' || ch === ')') depth--
        }
        // For single-line type aliases without braces
        if (!started && (lines[j].includes('=') && !lines[j].includes('{'))) {
          if (!lines[j].trimEnd().endsWith(',') && !lines[j].trimEnd().endsWith('|') && !lines[j].trimEnd().endsWith('&')) {
            i = j + 1
            break
          }
        }
        if (started && depth <= 0) {
          i = j + 1
          break
        }
        if (j === lines.length - 1) {
          i = j + 1
        }
      }
      typeDefs.push(defLines.join('\n'))
    } else {
      i++
    }
  }

  return typeDefs
}

/** Extract a structural outline of the file (function signatures, class names, exports) */
export function extractFileOutline(content: string, language: string | null): string {
  const lines = content.split('\n')
  const outlineLines: string[] = []

  const sigPatterns = [
    /^\s*(export\s+)?(default\s+)?(async\s+)?function\s+(\w+)/,
    /^\s*(export\s+)?(default\s+)?class\s+(\w+)/,
    /^\s*(export\s+)?(const|let|var)\s+(\w+)\s*[=:]/,
    /^\s*(export\s+)?(interface|type|enum)\s+(\w+)/,
    /^\s*(export\s+default\s+)/,
    /^\s*def\s+(\w+)/,         // Python
    /^\s*(pub\s+)?fn\s+(\w+)/, // Rust
    /^\s*func\s+(\w+)/,        // Go
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const pattern of sigPatterns) {
      if (pattern.test(line)) {
        // Include just the signature line (trim trailing {)
        outlineLines.push(`L${i + 1}: ${line.trimEnd()}`)
        break
      }
    }
  }

  return outlineLines.join('\n')
}

/** Find recently edited sections by looking for patterns typical of in-progress edits */
export function extractRecentEdits(content: string, cursorLine: number | null): string | null {
  if (cursorLine === null) return null

  const lines = content.split('\n')
  const editRegions: { start: number; end: number }[] = []

  // Region around cursor (most likely recent edit location)
  const cursorStart = Math.max(0, cursorLine - 5)
  const cursorEnd = Math.min(lines.length - 1, cursorLine + 5)
  editRegions.push({ start: cursorStart, end: cursorEnd })

  // Look for TODO/FIXME/HACK comments as likely in-progress areas
  for (let i = 0; i < lines.length; i++) {
    if (/\b(TODO|FIXME|HACK|XXX|WIP)\b/.test(lines[i])) {
      const regionStart = Math.max(0, i - 2)
      const regionEnd = Math.min(lines.length - 1, i + 2)
      // Avoid duplicates with cursor region
      if (regionStart > cursorEnd || regionEnd < cursorStart) {
        editRegions.push({ start: regionStart, end: regionEnd })
      }
    }
  }

  if (editRegions.length === 0) return null

  const sections: string[] = []
  for (const region of editRegions.slice(0, 3)) {
    sections.push(
      lines.slice(region.start, region.end + 1)
        .map((line, idx) => `${region.start + idx + 1}: ${line}`)
        .join('\n')
    )
  }

  return sections.join('\n---\n')
}

/** Find the test file corresponding to a source file */
export function findTestFile(filePath: string, allFilePaths: string[]): string | null {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  const fileName = parts.pop() || ''
  const baseName = fileName.replace(/\.[^.]+$/, '')
  const ext = fileName.split('.').pop() || ''

  // Common test file patterns
  const testPatterns = [
    `${baseName}.test.${ext}`,
    `${baseName}.spec.${ext}`,
    `${baseName}_test.${ext}`,
    `test_${baseName}.${ext}`,
    `${baseName}.test.tsx`,
    `${baseName}.spec.tsx`,
  ]

  // Search in same directory, __tests__ subdirectory, or parallel test directory
  for (const candidate of allFilePaths) {
    const candidateNorm = candidate.replace(/\\/g, '/')
    const candidateName = candidateNorm.split('/').pop() || ''
    if (testPatterns.includes(candidateName)) {
      return candidate
    }
  }

  return null
}

/* ── Dependency Graph ─────────────────────────────────── */

/** Build an import dependency graph from all open files */
export function buildDependencyGraph(openFiles: OpenFile[], allFilePaths: string[]): Map<string, DependencyNode> {
  const graph = new Map<string, DependencyNode>()

  // Initialize all nodes
  for (const file of openFiles) {
    graph.set(file.path, {
      path: file.path,
      imports: [],
      importedBy: [],
    })
  }

  // Build edges
  for (const file of openFiles) {
    const parsed = parseImports(file.content)
    const relativeImports = parsed.filter((i) => i.isRelative)

    for (const imp of relativeImports) {
      const resolvedPath = resolveImportPath(imp.specifier, file.path, allFilePaths)
      if (!resolvedPath) continue

      const node = graph.get(file.path)
      if (node && !node.imports.includes(resolvedPath)) {
        node.imports.push(resolvedPath)
      }

      // Add reverse edge
      let targetNode = graph.get(resolvedPath)
      if (!targetNode) {
        targetNode = { path: resolvedPath, imports: [], importedBy: [] }
        graph.set(resolvedPath, targetNode)
      }
      if (!targetNode.importedBy.includes(file.path)) {
        targetNode.importedBy.push(file.path)
      }
    }
  }

  return graph
}

/** Get files most closely related to a given file via the dependency graph */
export function getClosestDependencies(
  filePath: string,
  graph: Map<string, DependencyNode>,
  maxDepth: number = 2,
): string[] {
  const visited = new Set<string>()
  const result: string[] = []
  const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }]

  while (queue.length > 0) {
    const { path, depth } = queue.shift()!
    if (visited.has(path)) continue
    visited.add(path)

    if (path !== filePath) {
      result.push(path)
    }

    if (depth < maxDepth) {
      const node = graph.get(path)
      if (node) {
        for (const imp of node.imports) {
          if (!visited.has(imp)) queue.push({ path: imp, depth: depth + 1 })
        }
        for (const dep of node.importedBy) {
          if (!visited.has(dep)) queue.push({ path: dep, depth: depth + 1 })
        }
      }
    }
  }

  return result
}

/* ── Context Quality Scoring ──────────────────────────── */

/** Score a chunk of context by relevance and recency */
export function scoreContextChunk(
  chunk: Omit<ContextChunk, 'qualityScore'>,
  cursorLine: number | null,
  totalLines: number,
): ContextChunk {
  let relevanceScore = chunk.relevanceScore
  let recencyScore = chunk.recencyScore

  // Boost relevance if the chunk is near the cursor
  if (cursorLine !== null && totalLines > 0) {
    // Parse line numbers from the chunk to estimate proximity
    const lineMatch = chunk.content.match(/^(\d+):/m)
    if (lineMatch) {
      const chunkLine = parseInt(lineMatch[1], 10)
      const distance = Math.abs(chunkLine - cursorLine) / totalLines
      relevanceScore = Math.max(relevanceScore, 1 - distance)
    }
  }

  // Priority-based base relevance
  const priorityRelevance: Record<ContextPriority, number> = {
    'current-selection': 1.0,
    'type-definitions': 0.8,
    'imports-and-types': 0.7,
    'file-outline': 0.5,
    'recent-edits': 0.6,
  }
  relevanceScore = Math.max(relevanceScore, priorityRelevance[chunk.source] * 0.5)

  const qualityScore = relevanceScore * 0.7 + recencyScore * 0.3

  return { ...chunk, relevanceScore, recencyScore, qualityScore }
}

/* ── Token Budget Management ──────────────────────────── */

/** Create a token budget with priority-based allocations */
export function createTokenBudget(total: number = DEFAULT_TOKEN_BUDGET): TokenBudget {
  const allocations: Record<ContextPriority, number> = {} as Record<ContextPriority, number>
  for (const [priority, weight] of Object.entries(PRIORITY_WEIGHTS)) {
    allocations[priority as ContextPriority] = Math.floor(total * weight)
  }
  return { total, allocations }
}

/** Allocate context chunks within a token budget, prioritizing by quality score */
export function allocateTokenBudget(
  chunks: ContextChunk[],
  budget: TokenBudget,
): ContextChunk[] {
  const selected: ContextChunk[] = []
  const remainingBudget = { ...budget.allocations }
  const overflowBudget = { total: 0 } // tokens freed from under-used priorities

  // Sort chunks by quality score descending
  const sorted = [...chunks].sort((a, b) => b.qualityScore - a.qualityScore)

  // First pass: allocate within priority budgets
  for (const chunk of sorted) {
    const available = remainingBudget[chunk.source]
    if (available >= chunk.estimatedTokens) {
      selected.push(chunk)
      remainingBudget[chunk.source] -= chunk.estimatedTokens
    }
  }

  // Second pass: reclaim unused budget for overflow
  for (const [priority, remaining] of Object.entries(remainingBudget)) {
    overflowBudget.total += remaining
    remainingBudget[priority as ContextPriority] = 0
  }

  // Third pass: try to fit remaining chunks with overflow budget
  for (const chunk of sorted) {
    if (selected.includes(chunk)) continue
    if (overflowBudget.total >= chunk.estimatedTokens) {
      selected.push(chunk)
      overflowBudget.total -= chunk.estimatedTokens
    }
  }

  return selected
}

/* ── Smart Context Selection ──────────────────────────── */

/** Build scored context chunks from the current editor state */
export function buildSmartContextChunks(
  content: string,
  language: string | null,
  cursorLine: number | null,
  selectionText: string | null,
  openFiles: OpenFile[],
  activeFilePath: string,
  allFilePaths: string[],
): ContextChunk[] {
  const chunks: ContextChunk[] = []
  const totalLines = content.split('\n').length
  const fileHash = computeFileHash(content)
  const cacheKey = `smart-chunks:${activeFilePath}`

  // Check cache
  const cached = getCached<ContextChunk[]>(cacheKey, fileHash)
  if (cached && cursorLine === null && selectionText === null) {
    return cached
  }

  // Priority 1: Current selection or function scope
  if (selectionText) {
    chunks.push(scoreContextChunk({
      source: 'current-selection',
      label: 'Current selection',
      content: selectionText,
      estimatedTokens: estimateTokens(selectionText),
      relevanceScore: 1.0,
      recencyScore: 1.0,
    }, cursorLine, totalLines))
  } else if (cursorLine !== null) {
    const scope = extractCurrentScope(content, cursorLine)
    if (scope) {
      chunks.push(scoreContextChunk({
        source: 'current-selection',
        label: `Function/scope at line ${scope.startLine + 1}`,
        content: scope.text,
        estimatedTokens: estimateTokens(scope.text),
        relevanceScore: 1.0,
        recencyScore: 1.0,
      }, cursorLine, totalLines))
    }
  }

  // Priority 2: Type definitions in current file
  const typeDefs = extractTypeDefinitions(content)
  for (const typeDef of typeDefs) {
    chunks.push(scoreContextChunk({
      source: 'type-definitions',
      label: 'Type definition',
      content: typeDef,
      estimatedTokens: estimateTokens(typeDef),
      relevanceScore: 0.8,
      recencyScore: 0.5,
    }, cursorLine, totalLines))
  }

  // Also extract type definitions from imported files
  const parsed = parseImports(content)
  const typeImports = parsed.filter((i) => i.raw.includes('type') && i.isRelative)
  for (const imp of typeImports) {
    const resolvedPath = resolveImportPath(imp.specifier, activeFilePath, allFilePaths)
    if (!resolvedPath) continue
    const importedFile = openFiles.find((f) => f.path === resolvedPath)
    if (!importedFile) continue
    const importedTypes = extractTypeDefinitions(importedFile.content)
    // Only include types that match imported names
    for (const td of importedTypes) {
      const typeNameMatch = td.match(/(?:interface|type|enum)\s+(\w+)/)
      if (typeNameMatch && imp.importedNames.includes(typeNameMatch[1])) {
        chunks.push(scoreContextChunk({
          source: 'type-definitions',
          label: `Type from ${resolvedPath}`,
          content: td,
          estimatedTokens: estimateTokens(td),
          relevanceScore: 0.75,
          recencyScore: 0.4,
        }, cursorLine, totalLines))
      }
    }
  }

  // Priority 3: Import statements and their types
  if (parsed.length > 0) {
    const importBlock = parsed.map((i) => i.raw).join('\n')
    chunks.push(scoreContextChunk({
      source: 'imports-and-types',
      label: 'Import statements',
      content: importBlock,
      estimatedTokens: estimateTokens(importBlock),
      relevanceScore: 0.7,
      recencyScore: 0.5,
    }, cursorLine, totalLines))
  }

  // Priority 4: File outline/structure
  const outline = extractFileOutline(content, language)
  if (outline) {
    chunks.push(scoreContextChunk({
      source: 'file-outline',
      label: 'File structure',
      content: outline,
      estimatedTokens: estimateTokens(outline),
      relevanceScore: 0.5,
      recencyScore: 0.3,
    }, cursorLine, totalLines))
  }

  // Priority 5: Recent edits
  const recentEdits = extractRecentEdits(content, cursorLine)
  if (recentEdits) {
    chunks.push(scoreContextChunk({
      source: 'recent-edits',
      label: 'Recent edit regions',
      content: recentEdits,
      estimatedTokens: estimateTokens(recentEdits),
      relevanceScore: 0.6,
      recencyScore: 1.0,
    }, cursorLine, totalLines))
  }

  // Cache the result (without selection-dependent chunks)
  if (cursorLine === null && selectionText === null) {
    setCache(cacheKey, fileHash, chunks)
  }

  return chunks
}

/* ── Project Type Detection ───────────────────────────── */

/** Detect project type and metadata from open files */
export function detectProjectMeta(openFiles: OpenFile[]): ProjectMeta {
  const allContent = openFiles.map(f => f.content).join('\n')
  const allPaths = openFiles.map(f => f.path.replace(/\\/g, '/'))
  const allNames = allPaths.map(p => p.split('/').pop() || '')

  // Detect project type
  const projectTypes: ProjectType[] = []
  const frameworks: string[] = []
  const libraries: string[] = []

  // React detection
  if (allPaths.some(p => /\.tsx$/.test(p)) || allContent.includes('from \'react\'') || allContent.includes('from "react"')) {
    projectTypes.push('react')
    frameworks.push('React')
    if (allContent.includes('next/') || allNames.includes('next.config.js') || allNames.includes('next.config.ts')) {
      frameworks.push('Next.js')
    }
    if (allContent.includes('remix') || allContent.includes('@remix-run')) {
      frameworks.push('Remix')
    }
  }

  // Vue detection
  if (allPaths.some(p => /\.vue$/.test(p)) || allContent.includes('from \'vue\'')) {
    projectTypes.push('vue')
    frameworks.push('Vue')
    if (allContent.includes('nuxt') || allNames.includes('nuxt.config.ts')) {
      frameworks.push('Nuxt')
    }
  }

  // Svelte detection
  if (allPaths.some(p => /\.svelte$/.test(p)) || allContent.includes('from \'svelte\'')) {
    projectTypes.push('svelte')
    frameworks.push('Svelte')
  }

  // Node detection
  if (allNames.includes('package.json') || allContent.includes('require(') || allContent.includes('module.exports')) {
    projectTypes.push('node')
  }

  // Python detection
  if (allPaths.some(p => /\.py$/.test(p))) {
    projectTypes.push('python')
    if (allContent.includes('django') || allContent.includes('Django')) frameworks.push('Django')
    if (allContent.includes('flask') || allContent.includes('Flask')) frameworks.push('Flask')
    if (allContent.includes('fastapi') || allContent.includes('FastAPI')) frameworks.push('FastAPI')
  }

  // Rust detection
  if (allPaths.some(p => /\.rs$/.test(p)) || allNames.includes('Cargo.toml')) {
    projectTypes.push('rust')
  }

  // Go detection
  if (allPaths.some(p => /\.go$/.test(p)) || allNames.includes('go.mod')) {
    projectTypes.push('go')
  }

  // Java detection
  if (allPaths.some(p => /\.java$/.test(p)) || allNames.includes('pom.xml') || allNames.includes('build.gradle')) {
    projectTypes.push('java')
    if (allContent.includes('springframework')) frameworks.push('Spring')
  }

  if (projectTypes.length === 0) {
    projectTypes.push('generic')
  }

  // Detect common libraries
  const libraryPatterns: Array<[RegExp, string]> = [
    [/['"]tailwindcss['"]|@apply|from ['"]tailwind/, 'Tailwind CSS'],
    [/['"]zustand['"]/, 'Zustand'],
    [/['"]redux['"]|@reduxjs\/toolkit/, 'Redux'],
    [/['"]express['"]/, 'Express'],
    [/['"]prisma['"]|@prisma\/client/, 'Prisma'],
    [/['"]mongoose['"]/, 'Mongoose'],
    [/['"]axios['"]/, 'Axios'],
    [/['"]zod['"]/, 'Zod'],
    [/['"]trpc['"]|@trpc/, 'tRPC'],
    [/['"]jest['"]|from ['"]@jest/, 'Jest'],
    [/['"]vitest['"]/, 'Vitest'],
    [/['"]playwright['"]/, 'Playwright'],
    [/['"]cypress['"]/, 'Cypress'],
    [/['"]storybook['"]|@storybook/, 'Storybook'],
    [/['"]lodash['"]/, 'Lodash'],
    [/['"]rxjs['"]/, 'RxJS'],
    [/['"]graphql['"]|@apollo/, 'GraphQL'],
    [/['"]socket\.io['"]/, 'Socket.io'],
    [/['"]webpack['"]/, 'Webpack'],
    [/['"]vite['"]/, 'Vite'],
    [/['"]esbuild['"]/, 'esbuild'],
    [/['"]rollup['"]/, 'Rollup'],
  ]

  for (const [pattern, name] of libraryPatterns) {
    if (pattern.test(allContent)) {
      libraries.push(name)
    }
  }

  // Detect code style
  const codeStyle = detectCodeStyle(openFiles)

  // Detect linting rules
  const lintingRules = detectLintingRules(allNames, allContent)

  return {
    projectType: projectTypes,
    frameworks,
    libraries,
    codeStyle,
    lintingRules,
  }
}

/** Detect code style conventions from file contents */
function detectCodeStyle(openFiles: OpenFile[]): CodeStyleConventions {
  let tabCount = 0
  let spaces2Count = 0
  let spaces4Count = 0
  let singleQuoteCount = 0
  let doubleQuoteCount = 0
  let semiCount = 0
  let noSemiCount = 0
  let trailingCommaCount = 0
  let noTrailingCommaCount = 0

  // Sample code files (not JSON, not markdown)
  const codeFiles = openFiles.filter(f => {
    const lang = f.language || extToLanguage(f.path)
    return !['json', 'markdown', 'yaml', 'toml'].includes(lang)
  })

  for (const file of codeFiles.slice(0, 10)) {
    const lines = file.content.split('\n')
    for (const line of lines.slice(0, 100)) {
      // Indentation
      const indentMatch = line.match(/^(\s+)\S/)
      if (indentMatch) {
        const indent = indentMatch[1]
        if (indent.includes('\t')) tabCount++
        else if (indent.length % 4 === 0) spaces4Count++
        else if (indent.length % 2 === 0) spaces2Count++
      }

      // Quotes (for strings in imports/assignments, not template literals)
      const singleMatches = line.match(/'/g)
      const doubleMatches = line.match(/"/g)
      if (singleMatches) singleQuoteCount += singleMatches.length
      if (doubleMatches) doubleQuoteCount += doubleMatches.length

      // Semicolons
      const trimmed = line.trim()
      if (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
        if (trimmed.endsWith(';')) semiCount++
        else if (/[a-zA-Z0-9'"\])]$/.test(trimmed) && !trimmed.endsWith('{') && !trimmed.endsWith('(')) {
          noSemiCount++
        }
      }

      // Trailing commas
      if (trimmed.endsWith(',')) trailingCommaCount++
      if (/[}\]]\s*$/.test(trimmed) && lines.indexOf(line) > 0) {
        const prevLine = lines[lines.indexOf(line) - 1]?.trim()
        if (prevLine && !prevLine.endsWith(',')) noTrailingCommaCount++
      }
    }
  }

  let indentation: CodeStyleConventions['indentation'] = 'spaces-2'
  if (tabCount > spaces2Count && tabCount > spaces4Count) indentation = 'tabs'
  else if (spaces4Count > spaces2Count) indentation = 'spaces-4'
  else if (tabCount > 0 && (spaces2Count > 0 || spaces4Count > 0)) indentation = 'mixed'

  let quotes: CodeStyleConventions['quotes'] = 'single'
  if (doubleQuoteCount > singleQuoteCount * 1.5) quotes = 'double'
  else if (singleQuoteCount > 0 && doubleQuoteCount > 0 && Math.abs(singleQuoteCount - doubleQuoteCount) < Math.min(singleQuoteCount, doubleQuoteCount) * 0.3) quotes = 'mixed'

  let semicolons: CodeStyleConventions['semicolons'] = 'mixed'
  if (semiCount > noSemiCount * 2) semicolons = 'always'
  else if (noSemiCount > semiCount * 2) semicolons = 'never'

  return {
    indentation,
    quotes,
    semicolons,
    trailingComma: trailingCommaCount > noTrailingCommaCount,
  }
}

/** Detect linting rules from config files */
function detectLintingRules(fileNames: string[], allContent: string): string[] {
  const rules: string[] = []

  if (fileNames.some(n => n.includes('eslint'))) {
    rules.push('ESLint configured')
    if (allContent.includes('@typescript-eslint')) rules.push('TypeScript ESLint rules')
    if (allContent.includes('eslint-plugin-react')) rules.push('React linting rules')
    if (allContent.includes('eslint-plugin-import')) rules.push('Import ordering rules')
  }

  if (fileNames.some(n => n.includes('prettier') || n === '.prettierrc')) {
    rules.push('Prettier formatting')
  }

  if (fileNames.some(n => n === 'biome.json' || n === 'biome.jsonc')) {
    rules.push('Biome linting/formatting')
  }

  if (fileNames.some(n => n === '.editorconfig')) {
    rules.push('EditorConfig')
  }

  if (fileNames.some(n => n === 'tsconfig.json')) {
    rules.push('TypeScript strict mode')
    if (allContent.includes('"strict": true')) rules.push('TS strict: true')
    if (allContent.includes('"noImplicitAny": true')) rules.push('TS noImplicitAny')
  }

  if (fileNames.some(n => n === '.pylintrc' || n === 'pyproject.toml')) {
    if (allContent.includes('[tool.ruff]')) rules.push('Ruff linting')
    if (allContent.includes('[tool.black]') || allContent.includes('[tool.mypy]')) {
      rules.push('Black formatting')
      rules.push('MyPy type checking')
    }
  }

  if (fileNames.some(n => n === 'clippy.toml' || n === '.clippy.toml')) {
    rules.push('Clippy linting (Rust)')
  }

  return rules
}

/* ── Public API ───────────────────────────────────────── */

/**
 * Gather the current editor context: active file, selection, cursor surroundings, open files, imports.
 */
export function getCurrentContext(options?: {
  selectionText?: string | null
  cursorLine?: number | null
}): CodeContext {
  const state = useEditorStore.getState()
  const { openFiles, activeFilePath } = state
  const activeFile = openFiles.find((f) => f.path === activeFilePath) || null

  const content = activeFile?.content || null
  const language = activeFile?.language || (activeFilePath ? extToLanguage(activeFilePath) : null)
  const selectionText = options?.selectionText || null
  const cursorLine = options?.cursorLine || null

  // Extract surrounding lines around cursor
  let surroundingLines: string | null = null
  if (content && cursorLine !== null && cursorLine >= 0) {
    const lines = content.split('\n')
    const start = Math.max(0, cursorLine - 10)
    const end = Math.min(lines.length, cursorLine + 11)
    surroundingLines = lines
      .slice(start, end)
      .map((line, i) => {
        const lineNum = start + i + 1
        const marker = lineNum === cursorLine + 1 ? ' >>>' : '    '
        return `${marker} ${lineNum}: ${line}`
      })
      .join('\n')
  }

  // Extract import statements (all imports, not just first 30 lines)
  let importStatements: string | null = null
  if (content) {
    const parsed = parseImports(content)
    if (parsed.length > 0) {
      importStatements = parsed.map((i) => i.raw).join('\n')
    }
  }

  // Get related files
  const allFilePaths = openFiles.map((f) => f.path)
  const relatedFiles = activeFile && activeFilePath
    ? getRelatedFiles(activeFilePath, content || '', openFiles, allFilePaths)
    : []

  return {
    activeFilePath,
    activeFileContent: content,
    activeFileLanguage: language,
    selectionText,
    cursorLine,
    surroundingLines,
    openFilePaths: openFiles.map((f) => f.path),
    importStatements,
    relatedFiles,
  }
}

/**
 * Find and return content of files imported by the current file.
 * Returns up to 5 related files, first 100 lines each.
 */
export function getRelatedFiles(
  currentFilePath: string,
  currentContent: string,
  openFiles: OpenFile[],
  allFilePaths: string[],
): RelatedFile[] {
  const parsed = parseImports(currentContent)
  const relativeImports = parsed.filter((i) => i.isRelative)

  const related: RelatedFile[] = []

  for (const imp of relativeImports) {
    if (related.length >= 5) break

    const resolvedPath = resolveImportPath(imp.specifier, currentFilePath, allFilePaths)
    if (!resolvedPath) continue

    // Check if the file is open (so we have its content)
    const openFile = openFiles.find((f) => f.path === resolvedPath)
    if (!openFile) continue

    const lines = openFile.content.split('\n')
    const truncatedContent = lines.slice(0, 100).join('\n')
    const name = resolvedPath.split(/[\\/]/).pop() || resolvedPath

    related.push({
      path: resolvedPath,
      name,
      language: openFile.language || extToLanguage(resolvedPath),
      content: truncatedContent + (lines.length > 100 ? '\n// ... (truncated)' : ''),
    })
  }

  // Also include the test file if available
  const testFile = findTestFile(currentFilePath, allFilePaths)
  if (testFile && related.length < 5) {
    const openTest = openFiles.find((f) => f.path === testFile)
    if (openTest) {
      const lines = openTest.content.split('\n')
      const truncatedContent = lines.slice(0, 100).join('\n')
      const name = testFile.split(/[\\/]/).pop() || testFile
      related.push({
        path: testFile,
        name,
        language: openTest.language || extToLanguage(testFile),
        content: truncatedContent + (lines.length > 100 ? '\n// ... (truncated)' : ''),
      })
    }
  }

  return related
}

/**
 * Build a system prompt that provides the AI with full editor context.
 * Uses smart context selection and token budget management.
 */
export function buildSystemPrompt(context: CodeContext, tokenBudget?: number): string {
  const budget = createTokenBudget(tokenBudget || DEFAULT_TOKEN_BUDGET)
  const state = useEditorStore.getState()
  const { openFiles } = state
  const parts: string[] = []

  // Detect project metadata
  const projectMeta = detectProjectMeta(openFiles)

  parts.push(
    'You are Orion AI, an expert coding assistant integrated in the Orion IDE.',
    'You have deep knowledge of software engineering, debugging, architecture, and best practices.',
    'Be concise, accurate, and provide code examples when helpful.',
    '',
  )

  // Project context
  if (projectMeta.projectType.length > 0) {
    parts.push(`Project type: ${projectMeta.projectType.join(', ')}`)
  }
  if (projectMeta.frameworks.length > 0) {
    parts.push(`Frameworks: ${projectMeta.frameworks.join(', ')}`)
  }
  if (projectMeta.libraries.length > 0) {
    parts.push(`Libraries: ${projectMeta.libraries.join(', ')}`)
  }

  // Code style conventions
  const style = projectMeta.codeStyle
  parts.push(`Code style: ${style.indentation} indentation, ${style.quotes} quotes, semicolons: ${style.semicolons}${style.trailingComma ? ', trailing commas' : ''}`)

  if (projectMeta.lintingRules.length > 0) {
    parts.push(`Linting: ${projectMeta.lintingRules.join(', ')}`)
  }

  parts.push('')

  if (context.activeFilePath && context.activeFileLanguage) {
    parts.push(`Current file: ${context.activeFilePath} (${context.activeFileLanguage})`)
  }

  // Use smart context selection if we have content
  if (context.activeFileContent && context.activeFilePath) {
    const allFilePaths = openFiles.map((f) => f.path)
    const chunks = buildSmartContextChunks(
      context.activeFileContent,
      context.activeFileLanguage,
      context.cursorLine,
      context.selectionText,
      openFiles,
      context.activeFilePath,
      allFilePaths,
    )

    // Allocate within token budget
    const selected = allocateTokenBudget(chunks, budget)

    // Group by source for organized output
    const grouped = new Map<ContextPriority, ContextChunk[]>()
    for (const chunk of selected) {
      const group = grouped.get(chunk.source) || []
      group.push(chunk)
      grouped.set(chunk.source, group)
    }

    // Emit selected context chunks
    const selectionChunks = grouped.get('current-selection')
    if (selectionChunks && selectionChunks.length > 0) {
      for (const chunk of selectionChunks) {
        const truncated = truncateToTokenBudget(chunk.content, budget.allocations['current-selection'])
        parts.push(`\n${chunk.label}:\n\`\`\`${context.activeFileLanguage || ''}\n${truncated}\n\`\`\``)
      }
    } else if (context.selectionText) {
      parts.push(`\nCurrent selection:\n\`\`\`${context.activeFileLanguage || ''}\n${context.selectionText}\n\`\`\``)
    } else {
      parts.push('Current selection: none')
    }

    const typeChunks = grouped.get('type-definitions')
    if (typeChunks && typeChunks.length > 0) {
      parts.push('\nRelevant type definitions:')
      let remainingTypeTokens = budget.allocations['type-definitions']
      for (const chunk of typeChunks) {
        if (remainingTypeTokens <= 0) break
        const truncated = truncateToTokenBudget(chunk.content, remainingTypeTokens)
        parts.push(`\`\`\`${context.activeFileLanguage || ''}\n${truncated}\n\`\`\``)
        remainingTypeTokens -= chunk.estimatedTokens
      }
    }

    const importChunks = grouped.get('imports-and-types')
    if (importChunks && importChunks.length > 0) {
      parts.push('\nImports:')
      for (const chunk of importChunks) {
        const truncated = truncateToTokenBudget(chunk.content, budget.allocations['imports-and-types'])
        parts.push(`\`\`\`${context.activeFileLanguage || ''}\n${truncated}\n\`\`\``)
      }
    }

    const outlineChunks = grouped.get('file-outline')
    if (outlineChunks && outlineChunks.length > 0) {
      parts.push('\nFile structure:')
      for (const chunk of outlineChunks) {
        const truncated = truncateToTokenBudget(chunk.content, budget.allocations['file-outline'])
        parts.push(`\`\`\`\n${truncated}\n\`\`\``)
      }
    }

    const editChunks = grouped.get('recent-edits')
    if (editChunks && editChunks.length > 0) {
      parts.push('\nRecent edit regions:')
      for (const chunk of editChunks) {
        const truncated = truncateToTokenBudget(chunk.content, budget.allocations['recent-edits'])
        parts.push(`\`\`\`${context.activeFileLanguage || ''}\n${truncated}\n\`\`\``)
      }
    }
  } else {
    // No active file content - fallback
    if (context.selectionText) {
      parts.push(`\nCurrent selection:\n\`\`\`${context.activeFileLanguage || ''}\n${context.selectionText}\n\`\`\``)
    } else {
      parts.push('Current selection: none')
    }
  }

  // Related files (with budget awareness)
  if (context.relatedFiles.length > 0) {
    const relatedBudget = Math.floor(budget.total * 0.15) // bonus allocation for related files
    let remainingRelatedTokens = relatedBudget
    parts.push('\nRelated files:')
    for (const rf of context.relatedFiles) {
      const rfTokens = estimateTokens(rf.content)
      if (remainingRelatedTokens <= 0) {
        parts.push(`- ${rf.path} (not included - token budget exceeded)`)
        continue
      }
      const truncated = truncateToTokenBudget(rf.content, remainingRelatedTokens)
      parts.push(`\n[${rf.path}]\n\`\`\`${rf.language}\n${truncated}\n\`\`\``)
      remainingRelatedTokens -= rfTokens
    }
  }

  if (context.openFilePaths.length > 0) {
    parts.push(`\nOpen files in editor:\n${context.openFilePaths.map((p) => `- ${p}`).join('\n')}`)
  }

  return parts.join('\n')
}

/**
 * Quick summary of context for display in the UI.
 * Returns something like "editor.ts + 3 related files"
 */
export function getContextSummary(context: CodeContext): string | null {
  if (!context.activeFilePath) return null

  const fileName = context.activeFilePath.split(/[\\/]/).pop() || context.activeFilePath
  const relatedCount = context.relatedFiles.length

  if (relatedCount > 0) {
    return `${fileName} + ${relatedCount} related file${relatedCount > 1 ? 's' : ''}`
  }
  return fileName
}

/**
 * Get a full smart context payload including dependency graph and budget-managed chunks.
 * This is the high-level entry point for AI context gathering.
 */
export function getSmartContext(options?: {
  selectionText?: string | null
  cursorLine?: number | null
  tokenBudget?: number
}): {
  context: CodeContext
  chunks: ContextChunk[]
  budget: TokenBudget
  dependencyGraph: Map<string, DependencyNode>
  projectMeta: ProjectMeta
  systemPrompt: string
} {
  const context = getCurrentContext(options)
  const state = useEditorStore.getState()
  const { openFiles } = state
  const allFilePaths = openFiles.map((f) => f.path)
  const budget = createTokenBudget(options?.tokenBudget || DEFAULT_TOKEN_BUDGET)

  // Build dependency graph
  const dependencyGraph = buildDependencyGraph(openFiles, allFilePaths)

  // Build smart context chunks
  let chunks: ContextChunk[] = []
  if (context.activeFileContent && context.activeFilePath) {
    chunks = buildSmartContextChunks(
      context.activeFileContent,
      context.activeFileLanguage,
      context.cursorLine,
      context.selectionText,
      openFiles,
      context.activeFilePath,
      allFilePaths,
    )
    chunks = allocateTokenBudget(chunks, budget)
  }

  // Detect project meta
  const projectMeta = detectProjectMeta(openFiles)

  // Build the system prompt
  const systemPrompt = buildSystemPrompt(context, options?.tokenBudget)

  return {
    context,
    chunks,
    budget,
    dependencyGraph,
    projectMeta,
    systemPrompt,
  }
}
