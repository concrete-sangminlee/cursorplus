/**
 * Comprehensive code lens provider system for Orion IDE.
 * Provides code lens registration, resolution, caching, language-specific
 * symbol detection, cyclomatic complexity analysis, and Monaco editor
 * integration. Built-in providers include references, implementations,
 * test runners, git blame, AI suggestions, and type information lenses.
 */

/* ── Core Types ───────────────────────────────────────── */

export interface CodeLensRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface CodeLensCommand {
  id: string
  title: string
  tooltip?: string
  arguments?: unknown[]
}

export interface CodeLens {
  range: CodeLensRange
  command?: CodeLensCommand
  title: string
  tooltip?: string
  isResolved: boolean
  providerId?: string
  data?: unknown
}

export interface CodeLensProviderMetadata {
  id: string
  displayName: string
  priority: number
  languages?: string[]
  enabled: boolean
}

export interface CodeLensProvider {
  metadata: CodeLensProviderMetadata
  provideCodeLenses(document: CodeLensDocument, token: CancellationToken): CodeLens[] | Promise<CodeLens[]>
  resolveCodeLens(codeLens: CodeLens, token: CancellationToken): CodeLens | Promise<CodeLens>
}

export interface CodeLensDocument {
  uri: string
  languageId: string
  content: string
  lineCount: number
  version: number
  getLineContent(line: number): string
}

export interface CancellationToken {
  isCancelled: boolean
  onCancellationRequested?: () => void
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'enum'
  | 'type'
  | 'variable'
  | 'constant'
  | 'test'
  | 'abstract-class'
  | 'trait'
  | 'struct'
  | 'module'

export interface DetectedSymbol {
  name: string
  kind: SymbolKind
  line: number
  endLine: number
  column: number
  endColumn: number
  modifiers: SymbolModifier[]
  language: string
  signature?: string
  body?: string
}

export type SymbolModifier =
  | 'export'
  | 'default'
  | 'async'
  | 'abstract'
  | 'static'
  | 'readonly'
  | 'public'
  | 'private'
  | 'protected'
  | 'override'
  | 'virtual'
  | 'unsafe'

export interface ComplexityResult {
  score: number
  level: 'low' | 'moderate' | 'high' | 'very-high'
  branches: number
  loops: number
  conditions: number
  logicalOperators: number
  nestingDepth: number
}

export interface MonacoCodeLensSymbol {
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
  id?: string
  command?: {
    id: string
    title: string
    tooltip?: string
    arguments?: unknown[]
  }
}

export interface CodeLensCacheEntry {
  lenses: CodeLens[]
  contentHash: number
  timestamp: number
  version: number
}

export interface GitBlameInfo {
  author: string
  email: string
  date: Date
  message: string
  commitHash: string
  changes: number
}

/* ── Utilities ────────────────────────────────────────── */

export function createRange(startLine: number, startColumn: number, endLine: number, endColumn: number): CodeLensRange {
  return { startLine, startColumn, endLine, endColumn }
}

export function createCodeLens(
  range: CodeLensRange,
  title: string,
  command?: Partial<CodeLensCommand>,
  tooltip?: string,
): CodeLens {
  return {
    range,
    title,
    tooltip: tooltip ?? title,
    isResolved: !!command,
    command: command
      ? { id: command.id ?? '', title: command.title ?? title, tooltip: command.tooltip ?? tooltip, arguments: command.arguments }
      : undefined,
  }
}

export function createCancellationToken(): CancellationToken & { cancel: () => void } {
  const token: CancellationToken & { cancel: () => void } = {
    isCancelled: false,
    cancel() {
      token.isCancelled = true
      token.onCancellationRequested?.()
    },
  }
  return token
}

function computeContentHash(content: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash
}

function formatTimeAgo(date: Date): string {
  const now = Date.now()
  const diffMs = now - date.getTime()
  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)

  if (years > 0) return years === 1 ? '1 year ago' : `${years} years ago`
  if (months > 0) return months === 1 ? '1 month ago' : `${months} months ago`
  if (days > 0) return days === 1 ? '1 day ago' : `${days} days ago`
  if (hours > 0) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (minutes > 0) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  return 'just now'
}

function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${plural ?? singular + 's'}`
}

/* ── Language-specific Symbol Detection ───────────────── */

interface LanguageDetector {
  languageIds: string[]
  detectSymbols(content: string): DetectedSymbol[]
}

function getLines(content: string): string[] {
  return content.split(/\r?\n/)
}

function findClosingBrace(lines: string[], startLine: number): number {
  let depth = 0
  let foundOpen = false
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]
    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
      if (ch === '{') {
        depth++
        foundOpen = true
      } else if (ch === '}') {
        depth--
        if (foundOpen && depth === 0) return i
      }
    }
  }
  return Math.min(startLine + 50, lines.length - 1)
}

function findIndentBlock(lines: string[], startLine: number): number {
  if (startLine >= lines.length - 1) return startLine
  const baseMatch = lines[startLine + 1]?.match(/^(\s+)/)
  if (!baseMatch) return startLine
  const baseIndent = baseMatch[1].length
  let endLine = startLine + 1
  for (let i = startLine + 2; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') { endLine = i; continue }
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0
    if (indent >= baseIndent) { endLine = i } else break
  }
  return endLine
}

function extractModifiers(prefix: string): SymbolModifier[] {
  const mods: SymbolModifier[] = []
  if (/\bexport\b/.test(prefix)) mods.push('export')
  if (/\bdefault\b/.test(prefix)) mods.push('default')
  if (/\basync\b/.test(prefix)) mods.push('async')
  if (/\babstract\b/.test(prefix)) mods.push('abstract')
  if (/\bstatic\b/.test(prefix)) mods.push('static')
  if (/\breadonly\b/.test(prefix)) mods.push('readonly')
  if (/\bpublic\b/.test(prefix)) mods.push('public')
  if (/\bprivate\b/.test(prefix)) mods.push('private')
  if (/\bprotected\b/.test(prefix)) mods.push('protected')
  if (/\boverride\b/.test(prefix)) mods.push('override')
  return mods
}

const typeScriptDetector: LanguageDetector = {
  languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
  detectSymbols(content: string): DetectedSymbol[] {
    const symbols: DetectedSymbol[] = []
    const lines = getLines(content)
    const lang = 'typescript'

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trimStart()

      // Function declarations: function name(...) or async function name(...)
      const funcMatch = line.match(
        /^(\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?)(function\s*\*?\s+)(\w+)\s*(<[^>]*>)?\s*\(/,
      )
      if (funcMatch) {
        const endLine = findClosingBrace(lines, i)
        const body = lines.slice(i, endLine + 1).join('\n')
        symbols.push({
          name: funcMatch[3],
          kind: 'function',
          line: i + 1,
          endLine: endLine + 1,
          column: funcMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: extractModifiers(funcMatch[1]),
          language: lang,
          signature: line.trim(),
          body,
        })
        continue
      }

      // Arrow functions assigned to const/let/var
      const arrowMatch = line.match(
        /^(\s*(?:export\s+)?(?:default\s+)?)(const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=]*)?\s*=>/,
      )
      if (arrowMatch) {
        const endLine = findClosingBrace(lines, i)
        const body = lines.slice(i, endLine + 1).join('\n')
        symbols.push({
          name: arrowMatch[3],
          kind: 'function',
          line: i + 1,
          endLine: endLine + 1,
          column: arrowMatch[1].length + arrowMatch[2].length + 2,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: extractModifiers(arrowMatch[1]),
          language: lang,
          signature: line.trim(),
          body,
        })
        continue
      }

      // Class declarations
      const classMatch = line.match(
        /^(\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?)(class)\s+(\w+)/,
      )
      if (classMatch) {
        const endLine = findClosingBrace(lines, i)
        const isAbstract = /\babstract\b/.test(classMatch[1])
        symbols.push({
          name: classMatch[3],
          kind: isAbstract ? 'abstract-class' : 'class',
          line: i + 1,
          endLine: endLine + 1,
          column: classMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: extractModifiers(classMatch[1]),
          language: lang,
          signature: line.trim(),
        })
        continue
      }

      // Interface declarations
      const ifaceMatch = line.match(
        /^(\s*(?:export\s+)?)(interface)\s+(\w+)/,
      )
      if (ifaceMatch) {
        const endLine = findClosingBrace(lines, i)
        symbols.push({
          name: ifaceMatch[3],
          kind: 'interface',
          line: i + 1,
          endLine: endLine + 1,
          column: ifaceMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: extractModifiers(ifaceMatch[1]),
          language: lang,
          signature: line.trim(),
        })
        continue
      }

      // Type alias declarations
      const typeMatch = line.match(
        /^(\s*(?:export\s+)?)(type)\s+(\w+)/,
      )
      if (typeMatch) {
        symbols.push({
          name: typeMatch[3],
          kind: 'type',
          line: i + 1,
          endLine: i + 1,
          column: typeMatch[1].length + 1,
          endColumn: line.length,
          modifiers: extractModifiers(typeMatch[1]),
          language: lang,
          signature: line.trim(),
        })
        continue
      }

      // Enum declarations
      const enumMatch = line.match(
        /^(\s*(?:export\s+)?(?:const\s+)?)(enum)\s+(\w+)/,
      )
      if (enumMatch) {
        const endLine = findClosingBrace(lines, i)
        symbols.push({
          name: enumMatch[3],
          kind: 'enum',
          line: i + 1,
          endLine: endLine + 1,
          column: enumMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: extractModifiers(enumMatch[1]),
          language: lang,
          signature: line.trim(),
        })
        continue
      }

      // Method declarations in class bodies
      const methodMatch = trimmed.match(
        /^((?:public|private|protected|static|abstract|async|override|readonly)\s+)*(get\s+|set\s+)?(\w+)\s*(<[^>]*>)?\s*\(/,
      )
      if (methodMatch && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('switch') && !trimmed.startsWith('return') && !trimmed.startsWith('new ')) {
        const indentLen = line.length - trimmed.length
        if (indentLen > 0) {
          const endLine = findClosingBrace(lines, i)
          const body = lines.slice(i, endLine + 1).join('\n')
          symbols.push({
            name: methodMatch[3],
            kind: 'method',
            line: i + 1,
            endLine: endLine + 1,
            column: indentLen + 1,
            endColumn: lines[endLine]?.length ?? 1,
            modifiers: extractModifiers(methodMatch[1] ?? ''),
            language: lang,
            signature: trimmed.split('{')[0].trim(),
            body,
          })
        }
        continue
      }

      // Test functions: describe, it, test, etc.
      const testMatch = trimmed.match(
        /^(describe|it|test|beforeEach|afterEach|beforeAll|afterAll)\s*[.(]/,
      )
      if (testMatch) {
        const nameMatch = trimmed.match(/['"`]([^'"`]+)['"`]/)
        const endLine = findClosingBrace(lines, i)
        symbols.push({
          name: nameMatch?.[1] ?? testMatch[1],
          kind: 'test',
          line: i + 1,
          endLine: endLine + 1,
          column: 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: [],
          language: lang,
          signature: trimmed.split('{')[0].trim(),
          body: lines.slice(i, endLine + 1).join('\n'),
        })
      }
    }

    return symbols
  },
}

const pythonDetector: LanguageDetector = {
  languageIds: ['python'],
  detectSymbols(content: string): DetectedSymbol[] {
    const symbols: DetectedSymbol[] = []
    const lines = getLines(content)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Function/method definitions
      const funcMatch = line.match(/^(\s*)(async\s+)?def\s+(\w+)\s*\(/)
      if (funcMatch) {
        const endLine = findIndentBlock(lines, i)
        const indent = funcMatch[1].length
        const mods: SymbolModifier[] = []
        if (funcMatch[2]) mods.push('async')
        if (funcMatch[3].startsWith('_') && !funcMatch[3].startsWith('__')) mods.push('private')

        const isTest = funcMatch[3].startsWith('test_') || funcMatch[3].startsWith('test')
        const body = lines.slice(i, endLine + 1).join('\n')

        symbols.push({
          name: funcMatch[3],
          kind: isTest ? 'test' : indent > 0 ? 'method' : 'function',
          line: i + 1,
          endLine: endLine + 1,
          column: indent + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: mods,
          language: 'python',
          signature: line.trim(),
          body,
        })
        continue
      }

      // Class definitions
      const classMatch = line.match(/^(\s*)class\s+(\w+)/)
      if (classMatch) {
        const endLine = findIndentBlock(lines, i)
        const isAbstract = /\(.*ABC.*\)/.test(line) || /\(.*ABCMeta.*\)/.test(line)
        symbols.push({
          name: classMatch[2],
          kind: isAbstract ? 'abstract-class' : 'class',
          line: i + 1,
          endLine: endLine + 1,
          column: classMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: [],
          language: 'python',
          signature: line.trim(),
        })
      }
    }

    return symbols
  },
}

const rustDetector: LanguageDetector = {
  languageIds: ['rust'],
  detectSymbols(content: string): DetectedSymbol[] {
    const symbols: DetectedSymbol[] = []
    const lines = getLines(content)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trimStart()

      // Function declarations
      const funcMatch = line.match(
        /^(\s*(?:pub(?:\(crate\))?\s+)?(?:async\s+)?(?:unsafe\s+)?)(fn)\s+(\w+)\s*(<[^>]*>)?\s*\(/,
      )
      if (funcMatch) {
        const endLine = findClosingBrace(lines, i)
        const mods: SymbolModifier[] = []
        if (/\bpub\b/.test(funcMatch[1])) mods.push('public')
        if (/\basync\b/.test(funcMatch[1])) mods.push('async')
        if (/\bunsafe\b/.test(funcMatch[1])) mods.push('unsafe')

        const isTest = i > 0 && /^\s*#\[test\]/.test(lines[i - 1])
        const body = lines.slice(i, endLine + 1).join('\n')

        symbols.push({
          name: funcMatch[3],
          kind: isTest ? 'test' : 'function',
          line: i + 1,
          endLine: endLine + 1,
          column: funcMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: mods,
          language: 'rust',
          signature: line.trim().replace(/\s*\{.*$/, ''),
          body,
        })
        continue
      }

      // Struct declarations
      const structMatch = line.match(/^(\s*(?:pub(?:\(crate\))?\s+)?)(struct)\s+(\w+)/)
      if (structMatch) {
        const endLine = findClosingBrace(lines, i)
        symbols.push({
          name: structMatch[3],
          kind: 'struct',
          line: i + 1,
          endLine: endLine + 1,
          column: structMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: /\bpub\b/.test(structMatch[1]) ? ['public'] : [],
          language: 'rust',
          signature: line.trim(),
        })
        continue
      }

      // Trait declarations
      const traitMatch = line.match(/^(\s*(?:pub(?:\(crate\))?\s+)?)(trait)\s+(\w+)/)
      if (traitMatch) {
        const endLine = findClosingBrace(lines, i)
        symbols.push({
          name: traitMatch[3],
          kind: 'trait',
          line: i + 1,
          endLine: endLine + 1,
          column: traitMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: /\bpub\b/.test(traitMatch[1]) ? ['public'] : [],
          language: 'rust',
          signature: line.trim(),
        })
        continue
      }

      // Impl blocks
      const implMatch = trimmed.match(/^impl\s+(?:<[^>]*>\s+)?(\w+)/)
      if (implMatch) {
        const endLine = findClosingBrace(lines, i)
        symbols.push({
          name: implMatch[1],
          kind: 'class',
          line: i + 1,
          endLine: endLine + 1,
          column: 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: [],
          language: 'rust',
          signature: trimmed.split('{')[0].trim(),
        })
        continue
      }

      // Enum declarations
      const enumMatch = line.match(/^(\s*(?:pub(?:\(crate\))?\s+)?)(enum)\s+(\w+)/)
      if (enumMatch) {
        const endLine = findClosingBrace(lines, i)
        symbols.push({
          name: enumMatch[3],
          kind: 'enum',
          line: i + 1,
          endLine: endLine + 1,
          column: enumMatch[1].length + 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: /\bpub\b/.test(enumMatch[1]) ? ['public'] : [],
          language: 'rust',
          signature: line.trim(),
        })
      }
    }

    return symbols
  },
}

const goDetector: LanguageDetector = {
  languageIds: ['go'],
  detectSymbols(content: string): DetectedSymbol[] {
    const symbols: DetectedSymbol[] = []
    const lines = getLines(content)

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Function declarations: func Name(...)
      const funcMatch = line.match(/^(func)\s+(\w+)\s*\(/)
      if (funcMatch) {
        const endLine = findClosingBrace(lines, i)
        const isTest = funcMatch[2].startsWith('Test') || funcMatch[2].startsWith('Benchmark')
        const isExported = funcMatch[2][0] === funcMatch[2][0].toUpperCase()
        const body = lines.slice(i, endLine + 1).join('\n')
        symbols.push({
          name: funcMatch[2],
          kind: isTest ? 'test' : 'function',
          line: i + 1,
          endLine: endLine + 1,
          column: 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: isExported ? ['export'] : [],
          language: 'go',
          signature: line.trim().replace(/\s*\{.*$/, ''),
          body,
        })
        continue
      }

      // Method declarations: func (r *Receiver) Name(...)
      const methodMatch = line.match(/^func\s+\([^)]+\)\s+(\w+)\s*\(/)
      if (methodMatch) {
        const endLine = findClosingBrace(lines, i)
        const isExported = methodMatch[1][0] === methodMatch[1][0].toUpperCase()
        const body = lines.slice(i, endLine + 1).join('\n')
        symbols.push({
          name: methodMatch[1],
          kind: 'method',
          line: i + 1,
          endLine: endLine + 1,
          column: 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: isExported ? ['export'] : [],
          language: 'go',
          signature: line.trim().replace(/\s*\{.*$/, ''),
          body,
        })
        continue
      }

      // Type declarations: type Name struct/interface
      const typeMatch = line.match(/^type\s+(\w+)\s+(struct|interface)/)
      if (typeMatch) {
        const endLine = findClosingBrace(lines, i)
        const kind: SymbolKind = typeMatch[2] === 'interface' ? 'interface' : 'struct'
        const isExported = typeMatch[1][0] === typeMatch[1][0].toUpperCase()
        symbols.push({
          name: typeMatch[1],
          kind,
          line: i + 1,
          endLine: endLine + 1,
          column: 1,
          endColumn: lines[endLine]?.length ?? 1,
          modifiers: isExported ? ['export'] : [],
          language: 'go',
          signature: line.trim(),
        })
      }
    }

    return symbols
  },
}

const languageDetectors: LanguageDetector[] = [
  typeScriptDetector,
  pythonDetector,
  rustDetector,
  goDetector,
]

export function detectSymbols(content: string, languageId: string): DetectedSymbol[] {
  const detector = languageDetectors.find((d) => d.languageIds.includes(languageId))
  if (!detector) return []
  return detector.detectSymbols(content)
}

export function getSupportedLanguages(): string[] {
  return languageDetectors.flatMap((d) => d.languageIds)
}

/* ── Cyclomatic Complexity Analysis ──────────────────── */

const BRANCH_PATTERNS: RegExp[] = [
  /\bif\s*\(/,
  /\belse\s+if\s*\(/,
  /\belse\b/,
  /\bswitch\s*\(/,
  /\bcase\s+/,
  /\bfor\s*\(/,
  /\bfor\s+/,
  /\bwhile\s*\(/,
  /\bdo\s*\{/,
  /\bcatch\s*\(/,
  /\?\?/,
  /\?\./,
  /\?[^:?]+:/,
]

const LOOP_KEYWORDS = /\b(for|while|do|loop)\b/g
const CONDITION_KEYWORDS = /\b(if|else\s+if|switch|match)\b/g
const LOGICAL_OPERATORS = /(\|\||&&|or\b|and\b)/g

export function calculateComplexity(code: string): ComplexityResult {
  const lines = getLines(code)
  let branches = 0
  let loops = 0
  let conditions = 0
  let logicalOperators = 0
  let maxNesting = 0

  // Strip string literals and comments for analysis
  const stripped = code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')

  const strippedLines = getLines(stripped)

  for (const line of strippedLines) {
    for (const pattern of BRANCH_PATTERNS) {
      if (pattern.test(line)) branches++
    }
    const loopMatches = line.match(LOOP_KEYWORDS)
    if (loopMatches) loops += loopMatches.length

    const condMatches = line.match(CONDITION_KEYWORDS)
    if (condMatches) conditions += condMatches.length

    const logicalMatches = line.match(LOGICAL_OPERATORS)
    if (logicalMatches) logicalOperators += logicalMatches.length
  }

  // Calculate nesting depth
  let currentNesting = 0
  for (const char of stripped) {
    if (char === '{') {
      currentNesting++
      maxNesting = Math.max(maxNesting, currentNesting)
    } else if (char === '}') {
      currentNesting = Math.max(0, currentNesting - 1)
    }
  }

  // Cyclomatic complexity = branches + 1 (base path)
  const score = branches + logicalOperators + 1

  let level: ComplexityResult['level']
  if (score <= 5) level = 'low'
  else if (score <= 10) level = 'moderate'
  else if (score <= 20) level = 'high'
  else level = 'very-high'

  return {
    score,
    level,
    branches,
    loops,
    conditions,
    logicalOperators,
    nestingDepth: maxNesting,
  }
}

export function shouldSuggestAI(complexity: ComplexityResult): boolean {
  return complexity.score >= 8 || complexity.nestingDepth >= 4
}

/* ── Built-in Providers ──────────────────────────────── */

export class ReferencesCodeLensProvider implements CodeLensProvider {
  metadata: CodeLensProviderMetadata = {
    id: 'builtin.references',
    displayName: 'References',
    priority: 10,
    enabled: true,
  }

  private referenceCounts: Map<string, number> = new Map()

  setReferenceCounts(counts: Map<string, number>): void {
    this.referenceCounts = counts
  }

  provideCodeLenses(document: CodeLensDocument, token: CancellationToken): CodeLens[] {
    const symbols = detectSymbols(document.content, document.languageId)
    const lenses: CodeLens[] = []

    for (const symbol of symbols) {
      if (token.isCancelled) break
      if (symbol.kind === 'test') continue

      const range = createRange(symbol.line, symbol.column, symbol.line, symbol.endColumn)
      const count = this.referenceCounts.get(symbol.name) ?? 0
      const title = pluralize(count, 'reference')

      lenses.push({
        range,
        title,
        tooltip: `${title} to ${symbol.name}`,
        isResolved: true,
        providerId: this.metadata.id,
        command: {
          id: 'orion.showReferences',
          title,
          tooltip: `Show all references to ${symbol.name}`,
          arguments: [document.uri, symbol.line, symbol.name],
        },
      })
    }

    return lenses
  }

  resolveCodeLens(codeLens: CodeLens, _token: CancellationToken): CodeLens {
    return codeLens
  }
}

export class ImplementationsCodeLensProvider implements CodeLensProvider {
  metadata: CodeLensProviderMetadata = {
    id: 'builtin.implementations',
    displayName: 'Implementations',
    priority: 15,
    languages: ['typescript', 'typescriptreact', 'java', 'go', 'rust'],
    enabled: true,
  }

  private implementationCounts: Map<string, number> = new Map()

  setImplementationCounts(counts: Map<string, number>): void {
    this.implementationCounts = counts
  }

  provideCodeLenses(document: CodeLensDocument, token: CancellationToken): CodeLens[] {
    const symbols = detectSymbols(document.content, document.languageId)
    const lenses: CodeLens[] = []

    for (const symbol of symbols) {
      if (token.isCancelled) break
      if (symbol.kind !== 'interface' && symbol.kind !== 'abstract-class' && symbol.kind !== 'trait') continue

      const range = createRange(symbol.line, symbol.column, symbol.line, symbol.endColumn)
      const count = this.implementationCounts.get(symbol.name) ?? 0
      const title = pluralize(count, 'implementation')

      lenses.push({
        range,
        title,
        tooltip: `${title} of ${symbol.name}`,
        isResolved: true,
        providerId: this.metadata.id,
        command: {
          id: 'orion.showImplementations',
          title,
          tooltip: `Show all implementations of ${symbol.name}`,
          arguments: [document.uri, symbol.line, symbol.name],
        },
      })
    }

    return lenses
  }

  resolveCodeLens(codeLens: CodeLens, _token: CancellationToken): CodeLens {
    return codeLens
  }
}

export class TestCodeLensProvider implements CodeLensProvider {
  metadata: CodeLensProviderMetadata = {
    id: 'builtin.test',
    displayName: 'Test Runner',
    priority: 20,
    enabled: true,
  }

  provideCodeLenses(document: CodeLensDocument, token: CancellationToken): CodeLens[] {
    const symbols = detectSymbols(document.content, document.languageId)
    const lenses: CodeLens[] = []

    for (const symbol of symbols) {
      if (token.isCancelled) break
      if (symbol.kind !== 'test') continue

      const range = createRange(symbol.line, symbol.column, symbol.line, symbol.endColumn)

      // Run Test lens
      lenses.push({
        range,
        title: 'Run Test',
        tooltip: `Run test: ${symbol.name}`,
        isResolved: true,
        providerId: this.metadata.id,
        command: {
          id: 'orion.runTest',
          title: 'Run Test',
          tooltip: `Run test: ${symbol.name}`,
          arguments: [document.uri, symbol.name, 'run'],
        },
      })

      // Debug Test lens
      lenses.push({
        range,
        title: 'Debug Test',
        tooltip: `Debug test: ${symbol.name}`,
        isResolved: true,
        providerId: this.metadata.id,
        command: {
          id: 'orion.debugTest',
          title: 'Debug Test',
          tooltip: `Debug test: ${symbol.name}`,
          arguments: [document.uri, symbol.name, 'debug'],
        },
      })
    }

    return lenses
  }

  resolveCodeLens(codeLens: CodeLens, _token: CancellationToken): CodeLens {
    return codeLens
  }
}

export class GitCodeLensProvider implements CodeLensProvider {
  metadata: CodeLensProviderMetadata = {
    id: 'builtin.git',
    displayName: 'Git Lens',
    priority: 5,
    enabled: true,
  }

  private blameData: Map<string, Map<number, GitBlameInfo>> = new Map()

  setBlameData(fileUri: string, blameMap: Map<number, GitBlameInfo>): void {
    this.blameData.set(fileUri, blameMap)
  }

  provideCodeLenses(document: CodeLensDocument, token: CancellationToken): CodeLens[] {
    const symbols = detectSymbols(document.content, document.languageId)
    const lenses: CodeLens[] = []
    const blameMap = this.blameData.get(document.uri)

    for (const symbol of symbols) {
      if (token.isCancelled) break
      if (symbol.kind === 'test' || symbol.kind === 'type' || symbol.kind === 'enum') continue

      const range = createRange(symbol.line, symbol.column, symbol.line, symbol.endColumn)

      if (blameMap) {
        const blame = blameMap.get(symbol.line)
        if (blame) {
          const timeAgo = formatTimeAgo(blame.date)
          const title = `${blame.author}, ${timeAgo} | ${pluralize(blame.changes, 'change')}`

          lenses.push({
            range,
            title,
            tooltip: `${blame.author} (${blame.email})\n${blame.message}\n${blame.commitHash.slice(0, 8)}`,
            isResolved: true,
            providerId: this.metadata.id,
            command: {
              id: 'orion.showCommit',
              title,
              tooltip: `Show commit ${blame.commitHash.slice(0, 8)}`,
              arguments: [document.uri, blame.commitHash],
            },
          })
          continue
        }
      }

      // Unresolved lens when blame data is not available yet
      lenses.push({
        range,
        title: 'Loading git blame...',
        tooltip: 'Git blame data is loading',
        isResolved: false,
        providerId: this.metadata.id,
        data: { symbolName: symbol.name, line: symbol.line },
      })
    }

    return lenses
  }

  resolveCodeLens(codeLens: CodeLens, _token: CancellationToken): CodeLens {
    const data = codeLens.data as { symbolName?: string; line?: number } | undefined
    if (!data) return codeLens

    return {
      ...codeLens,
      title: 'No git blame available',
      tooltip: `Could not load blame info for ${data.symbolName ?? 'symbol'}`,
      isResolved: true,
      command: {
        id: 'orion.noOp',
        title: 'No git blame available',
      },
    }
  }
}

export class AICodeLensProvider implements CodeLensProvider {
  metadata: CodeLensProviderMetadata = {
    id: 'builtin.ai',
    displayName: 'AI Suggestions',
    priority: 30,
    enabled: true,
  }

  private complexityThreshold = 8
  private nestingThreshold = 4

  setThresholds(complexity: number, nesting: number): void {
    this.complexityThreshold = complexity
    this.nestingThreshold = nesting
  }

  provideCodeLenses(document: CodeLensDocument, token: CancellationToken): CodeLens[] {
    const symbols = detectSymbols(document.content, document.languageId)
    const lenses: CodeLens[] = []

    for (const symbol of symbols) {
      if (token.isCancelled) break
      if (!symbol.body) continue
      if (symbol.kind !== 'function' && symbol.kind !== 'method') continue

      const complexity = calculateComplexity(symbol.body)

      if (complexity.score < this.complexityThreshold && complexity.nestingDepth < this.nestingThreshold) {
        continue
      }

      const range = createRange(symbol.line, symbol.column, symbol.line, symbol.endColumn)
      const complexityLabel = `Complexity: ${complexity.score} (${complexity.level})`

      // Explain lens
      lenses.push({
        range,
        title: 'Explain',
        tooltip: `${complexityLabel} — Ask AI to explain ${symbol.name}`,
        isResolved: true,
        providerId: this.metadata.id,
        command: {
          id: 'orion.ai.explain',
          title: 'Explain',
          tooltip: `Explain function ${symbol.name}`,
          arguments: [document.uri, symbol.line, symbol.endLine, 'explain'],
        },
      })

      // Optimize lens
      lenses.push({
        range,
        title: 'Optimize',
        tooltip: `${complexityLabel} — Ask AI to suggest optimizations for ${symbol.name}`,
        isResolved: true,
        providerId: this.metadata.id,
        command: {
          id: 'orion.ai.optimize',
          title: 'Optimize',
          tooltip: `Optimize function ${symbol.name}`,
          arguments: [document.uri, symbol.line, symbol.endLine, 'optimize'],
        },
      })

      // Generate Tests lens
      lenses.push({
        range,
        title: 'Generate Tests',
        tooltip: `${complexityLabel} — Ask AI to generate tests for ${symbol.name}`,
        isResolved: true,
        providerId: this.metadata.id,
        command: {
          id: 'orion.ai.generateTests',
          title: 'Generate Tests',
          tooltip: `Generate tests for function ${symbol.name}`,
          arguments: [document.uri, symbol.line, symbol.endLine, 'generateTests'],
        },
      })
    }

    return lenses
  }

  resolveCodeLens(codeLens: CodeLens, _token: CancellationToken): CodeLens {
    return codeLens
  }
}

export class TypeInfoCodeLensProvider implements CodeLensProvider {
  metadata: CodeLensProviderMetadata = {
    id: 'builtin.typeInfo',
    displayName: 'Type Information',
    priority: 25,
    languages: ['typescript', 'typescriptreact'],
    enabled: true,
  }

  private inferredTypes: Map<string, Map<number, string>> = new Map()

  setInferredTypes(fileUri: string, typeMap: Map<number, string>): void {
    this.inferredTypes.set(fileUri, typeMap)
  }

  provideCodeLenses(document: CodeLensDocument, token: CancellationToken): CodeLens[] {
    const symbols = detectSymbols(document.content, document.languageId)
    const lenses: CodeLens[] = []
    const typeMap = this.inferredTypes.get(document.uri)

    for (const symbol of symbols) {
      if (token.isCancelled) break
      if (symbol.kind !== 'function' && symbol.kind !== 'method') continue

      // Only show for functions without explicit return type
      const sig = symbol.signature ?? ''
      const hasExplicitReturnType = /\)\s*:\s*\S/.test(sig)
      if (hasExplicitReturnType) continue

      const range = createRange(symbol.line, symbol.column, symbol.line, symbol.endColumn)

      if (typeMap) {
        const inferredType = typeMap.get(symbol.line)
        if (inferredType) {
          lenses.push({
            range,
            title: `inferred: ${inferredType}`,
            tooltip: `Inferred return type for ${symbol.name}: ${inferredType}`,
            isResolved: true,
            providerId: this.metadata.id,
            command: {
              id: 'orion.addReturnType',
              title: `inferred: ${inferredType}`,
              tooltip: `Click to add explicit return type: ${inferredType}`,
              arguments: [document.uri, symbol.line, inferredType],
            },
          })
          continue
        }
      }

      // Unresolved — will be resolved when type info is available
      lenses.push({
        range,
        title: 'Resolving type...',
        tooltip: 'Type inference in progress',
        isResolved: false,
        providerId: this.metadata.id,
        data: { symbolName: symbol.name, line: symbol.line },
      })
    }

    return lenses
  }

  resolveCodeLens(codeLens: CodeLens, _token: CancellationToken): CodeLens {
    return {
      ...codeLens,
      title: 'type: unknown',
      tooltip: 'Could not infer return type',
      isResolved: true,
      command: {
        id: 'orion.noOp',
        title: 'type: unknown',
      },
    }
  }
}

/* ── Monaco Decoration Conversion ────────────────────── */

export function toMonacoCodeLensSymbol(codeLens: CodeLens): MonacoCodeLensSymbol {
  return {
    range: {
      startLineNumber: codeLens.range.startLine,
      startColumn: codeLens.range.startColumn,
      endLineNumber: codeLens.range.endLine,
      endColumn: codeLens.range.endColumn,
    },
    id: codeLens.providerId
      ? `${codeLens.providerId}:${codeLens.range.startLine}`
      : `lens:${codeLens.range.startLine}`,
    command: codeLens.command
      ? {
          id: codeLens.command.id,
          title: codeLens.command.title,
          tooltip: codeLens.command.tooltip,
          arguments: codeLens.command.arguments,
        }
      : undefined,
  }
}

export function toMonacoCodeLensSymbols(lenses: CodeLens[]): MonacoCodeLensSymbol[] {
  return lenses.map(toMonacoCodeLensSymbol)
}

export function fromMonacoRange(range: MonacoCodeLensSymbol['range']): CodeLensRange {
  return {
    startLine: range.startLineNumber,
    startColumn: range.startColumn,
    endLine: range.endLineNumber,
    endColumn: range.endColumn,
  }
}

/**
 * Groups code lenses by line number so they can be displayed together
 * in the Monaco editor as a single decoration per line.
 */
export function groupLensesByLine(lenses: CodeLens[]): Map<number, CodeLens[]> {
  const grouped = new Map<number, CodeLens[]>()
  for (const lens of lenses) {
    const line = lens.range.startLine
    const existing = grouped.get(line)
    if (existing) {
      existing.push(lens)
    } else {
      grouped.set(line, [lens])
    }
  }
  return grouped
}

/**
 * Formats a group of code lenses on the same line into a display string
 * using pipe separators, suitable for rendering in the editor.
 */
export function formatLensGroup(lenses: CodeLens[]): string {
  return lenses.map((l) => l.title).join(' | ')
}

/* ── CodeLens Cache ──────────────────────────────────── */

export class CodeLensCache {
  private cache: Map<string, Map<string, CodeLensCacheEntry>> = new Map()
  private maxAge: number
  private maxEntries: number

  constructor(maxAgeMs = 60_000, maxEntries = 200) {
    this.maxAge = maxAgeMs
    this.maxEntries = maxEntries
  }

  get(fileUri: string, providerId: string, contentHash: number): CodeLens[] | null {
    const fileCache = this.cache.get(fileUri)
    if (!fileCache) return null

    const entry = fileCache.get(providerId)
    if (!entry) return null

    if (entry.contentHash !== contentHash) {
      fileCache.delete(providerId)
      return null
    }

    if (Date.now() - entry.timestamp > this.maxAge) {
      fileCache.delete(providerId)
      return null
    }

    return entry.lenses
  }

  set(fileUri: string, providerId: string, contentHash: number, version: number, lenses: CodeLens[]): void {
    let fileCache = this.cache.get(fileUri)
    if (!fileCache) {
      fileCache = new Map()
      this.cache.set(fileUri, fileCache)
    }

    fileCache.set(providerId, {
      lenses,
      contentHash,
      timestamp: Date.now(),
      version,
    })

    this.evictIfNeeded()
  }

  invalidate(fileUri: string, providerId?: string): void {
    if (providerId) {
      const fileCache = this.cache.get(fileUri)
      if (fileCache) fileCache.delete(providerId)
    } else {
      this.cache.delete(fileUri)
    }
  }

  invalidateAll(): void {
    this.cache.clear()
  }

  getStats(): { files: number; entries: number; totalLenses: number } {
    let entries = 0
    let totalLenses = 0
    for (const fileCache of this.cache.values()) {
      entries += fileCache.size
      for (const entry of fileCache.values()) {
        totalLenses += entry.lenses.length
      }
    }
    return { files: this.cache.size, entries, totalLenses }
  }

  private evictIfNeeded(): void {
    let totalEntries = 0
    for (const fileCache of this.cache.values()) {
      totalEntries += fileCache.size
    }

    if (totalEntries <= this.maxEntries) return

    // Collect all entries with their timestamps for LRU eviction
    const allEntries: Array<{ fileUri: string; providerId: string; timestamp: number }> = []
    for (const [fileUri, fileCache] of this.cache) {
      for (const [providerId, entry] of fileCache) {
        allEntries.push({ fileUri, providerId, timestamp: entry.timestamp })
      }
    }

    // Sort oldest first
    allEntries.sort((a, b) => a.timestamp - b.timestamp)

    // Remove oldest entries until under limit
    const toRemove = totalEntries - this.maxEntries
    for (let i = 0; i < toRemove && i < allEntries.length; i++) {
      const { fileUri, providerId } = allEntries[i]
      const fileCache = this.cache.get(fileUri)
      if (fileCache) {
        fileCache.delete(providerId)
        if (fileCache.size === 0) this.cache.delete(fileUri)
      }
    }
  }
}

/* ── CodeLens Registry ───────────────────────────────── */

export type CodeLensChangeListener = (fileUri: string) => void

export class CodeLensRegistry {
  private providers: Map<string, CodeLensProvider> = new Map()
  private cache: CodeLensCache
  private changeListeners: Set<CodeLensChangeListener> = new Set()
  private enabledProviders: Set<string> = new Set()

  constructor(cache?: CodeLensCache) {
    this.cache = cache ?? new CodeLensCache()
  }

  /**
   * Register a code lens provider. If a provider with the same ID
   * already exists, it will be replaced.
   */
  register(provider: CodeLensProvider): void {
    this.providers.set(provider.metadata.id, provider)
    if (provider.metadata.enabled) {
      this.enabledProviders.add(provider.metadata.id)
    }
  }

  /**
   * Unregister a provider by ID.
   */
  unregister(providerId: string): boolean {
    this.enabledProviders.delete(providerId)
    return this.providers.delete(providerId)
  }

  /**
   * Enable or disable a specific provider.
   */
  setProviderEnabled(providerId: string, enabled: boolean): void {
    const provider = this.providers.get(providerId)
    if (provider) {
      provider.metadata.enabled = enabled
      if (enabled) {
        this.enabledProviders.add(providerId)
      } else {
        this.enabledProviders.delete(providerId)
      }
    }
  }

  /**
   * Check if a provider is currently enabled.
   */
  isProviderEnabled(providerId: string): boolean {
    return this.enabledProviders.has(providerId)
  }

  /**
   * Get metadata for all registered providers.
   */
  getProviders(): CodeLensProviderMetadata[] {
    return Array.from(this.providers.values()).map((p) => ({ ...p.metadata }))
  }

  /**
   * Get a specific provider by ID.
   */
  getProvider(providerId: string): CodeLensProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * Provide all code lenses for a document from all enabled providers.
   * Uses caching when available and merges results sorted by line number
   * and provider priority.
   */
  async provideCodeLenses(
    document: CodeLensDocument,
    token: CancellationToken,
    options?: { skipCache?: boolean; providerIds?: string[] },
  ): Promise<CodeLens[]> {
    const contentHash = computeContentHash(document.content)
    const allLenses: CodeLens[] = []

    const providersToRun = this.getActiveProviders(document.languageId, options?.providerIds)

    const promises = providersToRun.map(async (provider) => {
      if (token.isCancelled) return []

      // Check cache
      if (!options?.skipCache) {
        const cached = this.cache.get(document.uri, provider.metadata.id, contentHash)
        if (cached) return cached
      }

      try {
        const lenses = await provider.provideCodeLenses(document, token)
        // Tag each lens with its provider
        for (const lens of lenses) {
          lens.providerId = provider.metadata.id
        }
        // Cache the results
        this.cache.set(document.uri, provider.metadata.id, contentHash, document.version, lenses)
        return lenses
      } catch (err) {
        console.warn(`[CodeLens] Provider ${provider.metadata.id} failed:`, err)
        return []
      }
    })

    const results = await Promise.allSettled(promises)
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allLenses.push(...result.value)
      }
    }

    // Sort by line number (ascending), then by provider priority (descending)
    return allLenses.sort((a, b) => {
      const lineDiff = a.range.startLine - b.range.startLine
      if (lineDiff !== 0) return lineDiff
      const aPriority = this.providers.get(a.providerId ?? '')?.metadata.priority ?? 0
      const bPriority = this.providers.get(b.providerId ?? '')?.metadata.priority ?? 0
      return bPriority - aPriority
    })
  }

  /**
   * Resolve a single unresolved code lens using its originating provider.
   */
  async resolveCodeLens(codeLens: CodeLens, token: CancellationToken): Promise<CodeLens> {
    if (codeLens.isResolved) return codeLens

    const provider = codeLens.providerId ? this.providers.get(codeLens.providerId) : undefined
    if (!provider) return codeLens

    try {
      return await provider.resolveCodeLens(codeLens, token)
    } catch (err) {
      console.warn(`[CodeLens] Failed to resolve lens from ${codeLens.providerId}:`, err)
      return codeLens
    }
  }

  /**
   * Resolve all unresolved lenses in a batch.
   */
  async resolveAll(lenses: CodeLens[], token: CancellationToken): Promise<CodeLens[]> {
    const resolved = await Promise.allSettled(
      lenses.map((lens) => {
        if (lens.isResolved) return Promise.resolve(lens)
        return this.resolveCodeLens(lens, token)
      }),
    )

    return resolved.map((r, i) => (r.status === 'fulfilled' ? r.value : lenses[i]))
  }

  /**
   * Invalidate cached lenses for a file (e.g., on document change).
   */
  invalidateCache(fileUri: string): void {
    this.cache.invalidate(fileUri)
    this.notifyChange(fileUri)
  }

  /**
   * Invalidate all cached lenses across all files.
   */
  invalidateAllCaches(): void {
    this.cache.invalidateAll()
  }

  /**
   * Subscribe to code lens change events (triggered by cache invalidation).
   */
  onDidChange(listener: CodeLensChangeListener): () => void {
    this.changeListeners.add(listener)
    return () => {
      this.changeListeners.delete(listener)
    }
  }

  /**
   * Get cache statistics for diagnostics.
   */
  getCacheStats(): ReturnType<CodeLensCache['getStats']> {
    return this.cache.getStats()
  }

  private getActiveProviders(languageId: string, filterIds?: string[]): CodeLensProvider[] {
    const active: CodeLensProvider[] = []
    for (const [id, provider] of this.providers) {
      if (!this.enabledProviders.has(id)) continue
      if (filterIds && !filterIds.includes(id)) continue
      if (provider.metadata.languages && !provider.metadata.languages.includes(languageId)) continue
      active.push(provider)
    }
    // Sort by priority descending so highest-priority providers run first
    return active.sort((a, b) => b.metadata.priority - a.metadata.priority)
  }

  private notifyChange(fileUri: string): void {
    for (const listener of this.changeListeners) {
      try {
        listener(fileUri)
      } catch {
        // swallow listener errors
      }
    }
  }
}

/* ── Factory & Convenience ───────────────────────────── */

/**
 * Creates a CodeLensDocument from raw content, suitable for passing
 * to providers when no full editor model is available.
 */
export function createDocument(
  uri: string,
  languageId: string,
  content: string,
  version = 1,
): CodeLensDocument {
  const lines = getLines(content)
  return {
    uri,
    languageId,
    content,
    lineCount: lines.length,
    version,
    getLineContent(line: number): string {
      return lines[line - 1] ?? ''
    },
  }
}

/**
 * Creates a fully configured CodeLensRegistry with all built-in providers.
 */
export function createDefaultRegistry(options?: {
  enableReferences?: boolean
  enableImplementations?: boolean
  enableTests?: boolean
  enableGit?: boolean
  enableAI?: boolean
  enableTypeInfo?: boolean
  cacheMaxAgeMs?: number
  cacheMaxEntries?: number
}): CodeLensRegistry {
  const opts = {
    enableReferences: true,
    enableImplementations: true,
    enableTests: true,
    enableGit: true,
    enableAI: true,
    enableTypeInfo: true,
    ...options,
  }

  const cache = new CodeLensCache(opts.cacheMaxAgeMs, opts.cacheMaxEntries)
  const registry = new CodeLensRegistry(cache)

  if (opts.enableReferences) {
    registry.register(new ReferencesCodeLensProvider())
  }
  if (opts.enableImplementations) {
    registry.register(new ImplementationsCodeLensProvider())
  }
  if (opts.enableTests) {
    registry.register(new TestCodeLensProvider())
  }
  if (opts.enableGit) {
    registry.register(new GitCodeLensProvider())
  }
  if (opts.enableAI) {
    registry.register(new AICodeLensProvider())
  }
  if (opts.enableTypeInfo) {
    registry.register(new TypeInfoCodeLensProvider())
  }

  return registry
}

/**
 * Quick helper: detect symbols and provide all lenses for a snippet
 * of code. Useful for testing and preview scenarios.
 */
export async function quickLens(
  code: string,
  languageId: string,
  fileUri = 'untitled:snippet',
): Promise<CodeLens[]> {
  const registry = createDefaultRegistry()
  const doc = createDocument(fileUri, languageId, code)
  const token = createCancellationToken()
  return registry.provideCodeLenses(doc, token, { skipCache: true })
}

/**
 * Merges lenses from multiple sources, deduplicating by range and title.
 */
export function mergeLenses(...sources: CodeLens[][]): CodeLens[] {
  const seen = new Set<string>()
  const merged: CodeLens[] = []

  for (const lenses of sources) {
    for (const lens of lenses) {
      const key = `${lens.range.startLine}:${lens.range.startColumn}:${lens.title}`
      if (!seen.has(key)) {
        seen.add(key)
        merged.push(lens)
      }
    }
  }

  return merged.sort((a, b) => a.range.startLine - b.range.startLine)
}

/**
 * Filters lenses to only include those from specified providers.
 */
export function filterByProvider(lenses: CodeLens[], providerIds: string[]): CodeLens[] {
  const idSet = new Set(providerIds)
  return lenses.filter((l) => l.providerId && idSet.has(l.providerId))
}

/**
 * Filters lenses to only include those within a specific line range.
 */
export function filterByLineRange(lenses: CodeLens[], startLine: number, endLine: number): CodeLens[] {
  return lenses.filter((l) => l.range.startLine >= startLine && l.range.startLine <= endLine)
}

/**
 * Computes a content hash for cache key purposes.
 * Exposed for external callers that manage their own caching.
 */
export function hashContent(content: string): number {
  return computeContentHash(content)
}
