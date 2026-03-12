/**
 * Code symbol outline and structure analysis utility.
 * Powers the Outline panel, breadcrumb navigation, and "@" symbol search
 * in the command palette. Provides regex-based parsers for TS/JS, Python,
 * Go, Rust, Java/Kotlin, CSS/SCSS, JSON, and Markdown with hierarchical
 * symbol trees and change detection.
 */

import { fuzzyMatch } from './fuzzyMatch'

/* ── Types ─────────────────────────────────────────────── */

export type SymbolKind =
  | 'class' | 'function' | 'method' | 'interface' | 'enum'
  | 'variable' | 'constant' | 'type' | 'namespace' | 'property'
  | 'field' | 'constructor' | 'module' | 'event'
  | 'import' | 'export'

export interface Position {
  line: number
  character: number
}

export interface Range {
  start: Position
  end: Position
}

export interface DocumentSymbol {
  name: string
  kind: SymbolKind
  range: Range
  selectionRange: Range
  children: DocumentSymbol[]
  detail?: string
  documentation?: string
  deprecated?: boolean
}

export interface SymbolOutline {
  symbols: DocumentSymbol[]
  flat: DocumentSymbol[]
  languageId: string
  version: number
}

export type SymbolSortMode = 'name' | 'position' | 'kind'

export interface SymbolChange {
  added: DocumentSymbol[]
  removed: DocumentSymbol[]
  modified: Array<{ old: DocumentSymbol; new: DocumentSymbol }>
}

/* ── Icon Mapping ──────────────────────────────────────── */

const SYMBOL_ICON_MAP: Record<SymbolKind, string> = {
  class: 'symbol-class',
  function: 'symbol-function',
  method: 'symbol-method',
  interface: 'symbol-interface',
  enum: 'symbol-enum',
  variable: 'symbol-variable',
  constant: 'symbol-constant',
  type: 'symbol-type',
  namespace: 'symbol-namespace',
  property: 'symbol-property',
  field: 'symbol-field',
  constructor: 'symbol-constructor',
  module: 'symbol-module',
  event: 'symbol-event',
  import: 'symbol-import',
  export: 'symbol-export',
}

export function getSymbolIcon(kind: SymbolKind): string {
  return SYMBOL_ICON_MAP[kind] ?? 'symbol-variable'
}

/* ── Kind display order (for sort-by-kind) ─────────────── */

const KIND_ORDER: Record<SymbolKind, number> = {
  module: 0,
  namespace: 1,
  import: 2,
  export: 3,
  class: 4,
  interface: 5,
  enum: 6,
  type: 7,
  constructor: 8,
  function: 9,
  method: 10,
  property: 11,
  field: 12,
  variable: 13,
  constant: 14,
  event: 15,
}

/* ── Helpers ───────────────────────────────────────────── */

function pos(line: number, character: number): Position {
  return { line, character }
}

function rangeOf(startLine: number, startChar: number, endLine: number, endChar: number): Range {
  return { start: pos(startLine, startChar), end: pos(endLine, endChar) }
}

function lineIndent(line: string): number {
  const m = line.match(/^(\s*)/)
  if (!m) return 0
  let count = 0
  for (const ch of m[1]) {
    count += ch === '\t' ? 4 : 1
  }
  return count
}

/**
 * Extract JSDoc / docstring comment that immediately precedes a given line.
 * Walks backward from `lineIndex - 1` looking for block comments or
 * consecutive line comments.
 */
function extractDocumentation(lines: string[], lineIndex: number): string | undefined {
  if (lineIndex <= 0) return undefined
  const result: string[] = []
  let i = lineIndex - 1

  // Check for block comment ending with */
  const trimmed = lines[i]?.trimStart() ?? ''
  if (trimmed.endsWith('*/')) {
    // Walk backward to find opening /**
    while (i >= 0) {
      const l = lines[i].trimStart()
      result.unshift(
        l.replace(/^\/\*\*?\s?/, '').replace(/\s?\*\/$/, '').replace(/^\*\s?/, '').trim()
      )
      if (l.startsWith('/*')) break
      i--
    }
    const doc = result.filter(Boolean).join('\n').trim()
    return doc || undefined
  }

  // Check for consecutive // or # comments
  const commentChar = trimmed.startsWith('#') ? '#' : trimmed.startsWith('//') ? '//' : null
  if (commentChar) {
    while (i >= 0 && lines[i]?.trimStart().startsWith(commentChar)) {
      result.unshift(lines[i].trimStart().slice(commentChar.length).trim())
      i--
    }
    const doc = result.filter(Boolean).join('\n').trim()
    return doc || undefined
  }

  return undefined
}

/** Detect @deprecated in documentation string */
function isDeprecated(doc: string | undefined): boolean {
  if (!doc) return false
  return /@deprecated/i.test(doc)
}

/**
 * Find the matching closing brace for a given opening brace line.
 * Uses a simple brace-counting heuristic.
 */
function findClosingBrace(lines: string[], startLine: number): number {
  let depth = 0
  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) return i
      }
    }
  }
  return startLine
}

/**
 * Find the end of an indented block (Python-style).
 * The block ends when a non-empty line has indent <= `baseIndent`.
 */
function findIndentBlockEnd(lines: string[], startLine: number, baseIndent: number): number {
  let last = startLine
  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    if (lineIndent(line) <= baseIndent) break
    last = i
  }
  return last
}

/* ── TypeScript / JavaScript Parser ────────────────────── */

interface RawSymbol {
  name: string
  kind: SymbolKind
  line: number
  col: number
  endLine: number
  indent: number
  detail?: string
  documentation?: string
  deprecated?: boolean
}

function parseTSSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  // Patterns ordered from most to least specific
  const patterns: Array<{
    regex: RegExp
    kind: SymbolKind
    nameGroup: number
    detailFn?: (m: RegExpMatchArray) => string
  }> = [
    // import statement
    {
      regex: /^(\s*)import\s+(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/,
      kind: 'import',
      nameGroup: -2, // special: extract from match
    },
    // re-export statement
    {
      regex: /^(\s*)export\s+\{[^}]+\}\s+from\s+['"]([^'"]+)['"]/,
      kind: 'export',
      nameGroup: -3,
    },
    // class (with optional extends/implements)
    {
      regex: /^(\s*)(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/,
      kind: 'class',
      nameGroup: 2,
      detailFn: (m) => {
        const full = lines[parseInt(String(m.index))]
        const ext = full?.match(/extends\s+(\w+)/)
        const impl = full?.match(/implements\s+(.+?)\s*\{/)
        const parts: string[] = []
        if (ext) parts.push(`extends ${ext[1]}`)
        if (impl) parts.push(`implements ${impl[1].trim()}`)
        return parts.join(' ') || ''
      },
    },
    // interface
    {
      regex: /^(\s*)(?:export\s+)?interface\s+(\w+)/,
      kind: 'interface',
      nameGroup: 2,
      detailFn: (m) => {
        const full = lines[parseInt(String(m.index))]
        const ext = full?.match(/extends\s+(.+?)\s*\{/)
        return ext ? `extends ${ext[1].trim()}` : ''
      },
    },
    // enum
    {
      regex: /^(\s*)(?:export\s+)?(?:const\s+)?enum\s+(\w+)/,
      kind: 'enum',
      nameGroup: 2,
    },
    // type alias
    {
      regex: /^(\s*)(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/,
      kind: 'type',
      nameGroup: 2,
    },
    // namespace / module
    {
      regex: /^(\s*)(?:export\s+)?(?:namespace|module)\s+(\w+)/,
      kind: 'namespace',
      nameGroup: 2,
    },
    // constructor
    {
      regex: /^(\s*)(?:public\s+|private\s+|protected\s+)?constructor\s*\(/,
      kind: 'constructor',
      nameGroup: -1, // special: name is always "constructor"
    },
    // method (inside class body — indented, not a standalone function)
    {
      regex: /^(\s+)(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?(?:readonly\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(/,
      kind: 'method',
      nameGroup: 2,
    },
    // property with type annotation (class field)
    {
      regex: /^(\s+)(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:readonly\s+)?(\w+)\s*[?!]?\s*:\s*/,
      kind: 'property',
      nameGroup: 2,
    },
    // exported function (standalone)
    {
      regex: /^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s+(\w+)/,
      kind: 'function',
      nameGroup: 2,
    },
    // arrow function assigned to const/let/var
    {
      regex: /^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/,
      kind: 'function',
      nameGroup: 2,
    },
    // exported const (constant — UPPER_CASE heuristic)
    {
      regex: /^(\s*)(?:export\s+)?const\s+([A-Z][A-Z0-9_]+)\s*(?::\s*[^=]+)?\s*=/,
      kind: 'constant',
      nameGroup: 2,
    },
    // variable declarations
    {
      regex: /^(\s*)(?:export\s+)?(?:const|let|var)\s+(\w+)/,
      kind: 'variable',
      nameGroup: 2,
    },
  ]

  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) continue

    for (const pat of patterns) {
      const m = line.match(pat.regex)
      if (!m) continue

      let name: string
      if (pat.nameGroup === -1) {
        name = 'constructor'
      } else if (pat.nameGroup === -2) {
        // import: use the alias or module name
        name = m[2] || m[3] || m[4] || 'import'
      } else if (pat.nameGroup === -3) {
        // re-export: use the module path
        name = m[2] || 'export'
      } else {
        name = m[pat.nameGroup]
      }
      if (!name) continue

      // Skip control-flow keywords
      if (['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'new', 'from'].includes(name)) continue

      const indent = lineIndent(line)
      const col = line.indexOf(name)
      const key = `${name}:${i}`
      if (seen.has(key)) break
      seen.add(key)

      const doc = extractDocumentation(lines, i)
      const detail = pat.detailFn ? pat.detailFn(m) : undefined

      // Determine end line
      let endLine = i
      if (['class', 'interface', 'enum', 'namespace', 'function', 'method', 'constructor'].includes(pat.kind)) {
        // If the line or nearby lines contain '{', find the matching '}'
        const braceSearchEnd = Math.min(i + 3, lines.length - 1)
        let braceFound = false
        for (let b = i; b <= braceSearchEnd; b++) {
          if (lines[b].includes('{')) {
            endLine = findClosingBrace(lines, b)
            braceFound = true
            break
          }
        }
        if (!braceFound) endLine = i
      }

      raw.push({
        name,
        kind: pat.kind,
        line: i,
        col,
        endLine,
        indent,
        detail: detail || undefined,
        documentation: doc,
        deprecated: isDeprecated(doc),
      })
      break // first matching pattern wins
    }
  }

  return buildHierarchy(raw)
}

/* ── Python Parser ─────────────────────────────────────── */

function parsePythonSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  const patterns: Array<{
    regex: RegExp
    kind: SymbolKind
    nameGroup: number
  }> = [
    { regex: /^(\s*)class\s+(\w+)/, kind: 'class', nameGroup: 2 },
    { regex: /^(\s*)async\s+def\s+(\w+)/, kind: 'function', nameGroup: 2 },
    { regex: /^(\s*)def\s+(__init__)\s*\(/, kind: 'constructor', nameGroup: 2 },
    { regex: /^(\s*)def\s+(\w+)\s*\(self/, kind: 'method', nameGroup: 2 },
    { regex: /^(\s*)def\s+(\w+)/, kind: 'function', nameGroup: 2 },
    { regex: /^(\s*)([A-Z][A-Z0-9_]+)\s*(?::\s*\w+)?\s*=/, kind: 'constant', nameGroup: 2 },
    { regex: /^(\s*)(\w+)\s*(?::\s*\w+)?\s*=/, kind: 'variable', nameGroup: 2 },
  ]

  // Track decorators to attach to subsequent functions
  let pendingDecorator: string | undefined

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue

    // Detect decorators and store them for the next def/class
    const decoratorMatch = line.match(/^(\s*)@(\w+)/)
    if (decoratorMatch) {
      pendingDecorator = decoratorMatch[2]
      continue
    }

    for (const pat of patterns) {
      const m = line.match(pat.regex)
      if (!m) continue
      const name = m[pat.nameGroup]
      if (!name || (name.startsWith('_') && !name.startsWith('__'))) continue

      const indent = lineIndent(line)
      const col = line.indexOf(name)
      const endLine = findIndentBlockEnd(lines, i, indent)

      // Extract docstring (triple-quoted string on the next non-empty line)
      let doc = extractDocumentation(lines, i)
      if (!doc) {
        const nextLine = lines[i + 1]?.trimStart()
        if (nextLine && (nextLine.startsWith('"""') || nextLine.startsWith("'''"))) {
          const quote = nextLine.slice(0, 3)
          const docLines: string[] = []
          if (nextLine.indexOf(quote, 3) > 0) {
            // Single-line docstring
            docLines.push(nextLine.slice(3, nextLine.indexOf(quote, 3)).trim())
          } else {
            docLines.push(nextLine.slice(3).trim())
            for (let d = i + 2; d < lines.length; d++) {
              const dl = lines[d]
              const closeIdx = dl.indexOf(quote)
              if (closeIdx >= 0) {
                docLines.push(dl.slice(0, closeIdx).trim())
                break
              }
              docLines.push(dl.trim())
            }
          }
          doc = docLines.filter(Boolean).join('\n').trim() || undefined
        }
      }

      let kind = pat.kind
      // Reclassify def inside a class as method
      if (kind === 'function' && indent > 0) {
        for (let j = raw.length - 1; j >= 0; j--) {
          if (raw[j].kind === 'class' && raw[j].indent < indent && raw[j].endLine >= i) {
            kind = 'method'
            break
          }
        }
      }

      // Annotate with decorator detail
      const detail = pendingDecorator ? `@${pendingDecorator}` : undefined
      pendingDecorator = undefined

      raw.push({
        name,
        kind,
        line: i,
        col,
        endLine,
        indent,
        detail,
        documentation: doc,
        deprecated: isDeprecated(doc),
      })
      break
    }
  }

  return buildHierarchy(raw)
}

/* ── Go Parser ─────────────────────────────────────────── */

function parseGoSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  const patterns: Array<{
    regex: RegExp
    kind: SymbolKind
    nameGroup: number
    detailFn?: (m: RegExpMatchArray, line: string) => string
  }> = [
    // package declaration
    { regex: /^package\s+(\w+)/, kind: 'module', nameGroup: 1 },
    // struct type
    {
      regex: /^type\s+(\w+)\s+struct/,
      kind: 'class',
      nameGroup: 1,
      detailFn: () => 'struct',
    },
    // interface type
    {
      regex: /^type\s+(\w+)\s+interface/,
      kind: 'interface',
      nameGroup: 1,
    },
    // type alias / other types
    {
      regex: /^type\s+(\w+)\s+/,
      kind: 'type',
      nameGroup: 1,
    },
    // method with receiver
    {
      regex: /^func\s+\(\s*\w+\s+\*?(\w+)\s*\)\s+(\w+)\s*\(/,
      kind: 'method',
      nameGroup: 2,
      detailFn: (m) => `receiver: ${m[1]}`,
    },
    // standalone function
    {
      regex: /^func\s+(\w+)\s*\(/,
      kind: 'function',
      nameGroup: 1,
    },
    // const block or single const
    {
      regex: /^(\s*)(\w+)\s*(?:(?:\w|\.)+)?\s*=\s*/,
      kind: 'constant',
      nameGroup: 2,
    },
    // var declaration
    {
      regex: /^var\s+(\w+)/,
      kind: 'variable',
      nameGroup: 1,
    },
  ]

  let insideConst = false
  let insideVar = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('//')) continue

    // Handle const/var blocks
    if (/^const\s*\(/.test(trimmed)) { insideConst = true; continue }
    if (/^var\s*\(/.test(trimmed)) { insideVar = true; continue }
    if (trimmed === ')') { insideConst = false; insideVar = false; continue }

    if (insideConst || insideVar) {
      const blockMatch = trimmed.match(/^(\w+)/)
      if (blockMatch) {
        const name = blockMatch[1]
        const doc = extractDocumentation(lines, i)
        raw.push({
          name,
          kind: insideConst ? 'constant' : 'variable',
          line: i,
          col: line.indexOf(name),
          endLine: i,
          indent: lineIndent(line),
          documentation: doc,
          deprecated: isDeprecated(doc),
        })
      }
      continue
    }

    for (const pat of patterns) {
      const m = line.match(pat.regex)
      if (!m) continue
      const name = m[pat.nameGroup]
      if (!name) continue

      const indent = lineIndent(line)
      const col = line.indexOf(name)
      let endLine = i
      if (line.includes('{')) {
        endLine = findClosingBrace(lines, i)
      }

      const doc = extractDocumentation(lines, i)
      const detail = pat.detailFn ? pat.detailFn(m, line) : undefined

      raw.push({
        name,
        kind: pat.kind,
        line: i,
        col,
        endLine,
        indent,
        detail,
        documentation: doc,
        deprecated: isDeprecated(doc),
      })
      break
    }
  }

  return buildHierarchy(raw)
}

/* ── Rust Parser ───────────────────────────────────────── */

function parseRustSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  const patterns: Array<{
    regex: RegExp
    kind: SymbolKind
    nameGroup: number
    detailFn?: (m: RegExpMatchArray) => string
  }> = [
    // module
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)/,
      kind: 'module',
      nameGroup: 2,
    },
    // struct
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?struct\s+(\w+)/,
      kind: 'class',
      nameGroup: 2,
      detailFn: () => 'struct',
    },
    // enum
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?enum\s+(\w+)/,
      kind: 'enum',
      nameGroup: 2,
    },
    // trait
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?trait\s+(\w+)/,
      kind: 'interface',
      nameGroup: 2,
      detailFn: () => 'trait',
    },
    // type alias
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?type\s+(\w+)/,
      kind: 'type',
      nameGroup: 2,
    },
    // impl block
    {
      regex: /^(\s*)impl(?:<[^>]*>)?\s+(?:(\w+)\s+for\s+)?(\w+)/,
      kind: 'namespace',
      nameGroup: 3,
      detailFn: (m) => m[2] ? `impl ${m[2]} for ${m[3]}` : `impl ${m[3]}`,
    },
    // function / method
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?(?:const\s+)?fn\s+(\w+)/,
      kind: 'function',
      nameGroup: 2,
    },
    // const
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?const\s+(\w+)/,
      kind: 'constant',
      nameGroup: 2,
    },
    // static
    {
      regex: /^(\s*)(?:pub(?:\([^)]*\))?\s+)?static\s+(?:mut\s+)?(\w+)/,
      kind: 'variable',
      nameGroup: 2,
    },
  ]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('//')) continue

    for (const pat of patterns) {
      const m = line.match(pat.regex)
      if (!m) continue
      const name = m[pat.nameGroup]
      if (!name) continue

      const indent = lineIndent(line)
      const col = line.indexOf(name)
      let endLine = i
      if (line.includes('{')) {
        endLine = findClosingBrace(lines, i)
      } else {
        // Look ahead for opening brace (e.g., fn signature spanning lines)
        for (let b = i + 1; b < Math.min(i + 4, lines.length); b++) {
          if (lines[b].includes('{')) {
            endLine = findClosingBrace(lines, b)
            break
          }
        }
      }

      let kind = pat.kind
      // Reclassify fn inside impl/trait block as method
      if (kind === 'function' && indent > 0) {
        for (let j = raw.length - 1; j >= 0; j--) {
          if ((raw[j].kind === 'namespace' || raw[j].kind === 'interface') &&
              raw[j].indent < indent && raw[j].endLine >= i) {
            kind = 'method'
            break
          }
        }
      }

      const doc = extractDocumentation(lines, i)
      const detail = pat.detailFn ? pat.detailFn(m) : undefined

      raw.push({
        name,
        kind,
        line: i,
        col,
        endLine,
        indent,
        detail,
        documentation: doc,
        deprecated: isDeprecated(doc),
      })
      break
    }
  }

  return buildHierarchy(raw)
}

/* ── Java / Kotlin Parser ──────────────────────────────── */

function parseJavaKotlinSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  const modifiers = '(?:public\\s+|private\\s+|protected\\s+)?(?:static\\s+)?(?:final\\s+)?(?:abstract\\s+)?(?:open\\s+)?(?:override\\s+)?(?:suspend\\s+)?'

  const patterns: Array<{
    regex: RegExp
    kind: SymbolKind
    nameGroup: number
    detailFn?: (m: RegExpMatchArray) => string
  }> = [
    // package
    {
      regex: /^package\s+([\w.]+)/,
      kind: 'module',
      nameGroup: 1,
    },
    // import
    {
      regex: /^import\s+(?:static\s+)?([\w.*]+)/,
      kind: 'import',
      nameGroup: 1,
    },
    // annotation class (Kotlin)
    {
      regex: new RegExp(`^(\\s*)${modifiers}annotation\\s+class\\s+(\\w+)`),
      kind: 'class',
      nameGroup: 2,
      detailFn: () => 'annotation',
    },
    // data class (Kotlin)
    {
      regex: new RegExp(`^(\\s*)${modifiers}data\\s+class\\s+(\\w+)`),
      kind: 'class',
      nameGroup: 2,
      detailFn: () => 'data class',
    },
    // sealed class (Kotlin)
    {
      regex: new RegExp(`^(\\s*)${modifiers}sealed\\s+class\\s+(\\w+)`),
      kind: 'class',
      nameGroup: 2,
      detailFn: () => 'sealed class',
    },
    // class
    {
      regex: new RegExp(`^(\\s*)${modifiers}class\\s+(\\w+)`),
      kind: 'class',
      nameGroup: 2,
      detailFn: (m) => {
        const lineStr = m.input ?? ''
        const ext = lineStr.match(/extends\s+(\w+)/)
        const impl = lineStr.match(/implements\s+(.+?)\s*\{/)
        const parts: string[] = []
        if (ext) parts.push(`extends ${ext[1]}`)
        if (impl) parts.push(`implements ${impl[1].trim()}`)
        return parts.join(' ') || ''
      },
    },
    // interface
    {
      regex: new RegExp(`^(\\s*)${modifiers}interface\\s+(\\w+)`),
      kind: 'interface',
      nameGroup: 2,
    },
    // enum
    {
      regex: new RegExp(`^(\\s*)${modifiers}enum\\s+(?:class\\s+)?(\\w+)`),
      kind: 'enum',
      nameGroup: 2,
    },
    // object (Kotlin)
    {
      regex: new RegExp(`^(\\s*)${modifiers}(?:companion\\s+)?object\\s+(\\w+)`),
      kind: 'class',
      nameGroup: 2,
      detailFn: () => 'object',
    },
    // fun (Kotlin) or method/function
    {
      regex: new RegExp(`^(\\s*)${modifiers}fun\\s+(\\w+)\\s*(?:<[^>]*>)?\\s*\\(`),
      kind: 'function',
      nameGroup: 2,
    },
    // Java method: returnType methodName(
    {
      regex: new RegExp(`^(\\s*)${modifiers}(?:[\\w<>\\[\\],?\\s]+)\\s+(\\w+)\\s*\\(`),
      kind: 'method',
      nameGroup: 2,
    },
    // constant (static final UPPER_CASE in Java, or const val in Kotlin)
    {
      regex: /^(\s*)(?:const\s+val|static\s+final\s+\w+)\s+([A-Z][A-Z0-9_]+)/,
      kind: 'constant',
      nameGroup: 2,
    },
    // field: Type name = ... or Type name;
    {
      regex: new RegExp(`^(\\s*)${modifiers}(?:val|var|[\\w<>\\[\\]?,]+)\\s+(\\w+)\\s*[=;:]`),
      kind: 'field',
      nameGroup: 2,
    },
  ]

  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('@')) continue

    for (const pat of patterns) {
      const m = line.match(pat.regex)
      if (!m) continue

      const name = m[pat.nameGroup]
      if (!name) continue

      // Skip common Java noise / keywords
      if (['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'new', 'else', 'try', 'super', 'this'].includes(name)) continue

      const key = `${name}:${i}`
      if (seen.has(key)) break
      seen.add(key)

      const indent = lineIndent(line)
      const col = line.indexOf(name)

      let endLine = i
      if (['class', 'interface', 'enum', 'function', 'method'].includes(pat.kind)) {
        const braceSearchEnd = Math.min(i + 3, lines.length - 1)
        for (let b = i; b <= braceSearchEnd; b++) {
          if (lines[b].includes('{')) {
            endLine = findClosingBrace(lines, b)
            break
          }
        }
      }

      // Reclassify function inside a class as method
      let kind = pat.kind
      if (kind === 'function' && indent > 0) {
        for (let j = raw.length - 1; j >= 0; j--) {
          if (raw[j].kind === 'class' && raw[j].indent < indent && raw[j].endLine >= i) {
            kind = 'method'
            break
          }
        }
      }

      const doc = extractDocumentation(lines, i)
      const detail = pat.detailFn ? pat.detailFn(m) : undefined

      raw.push({
        name,
        kind,
        line: i,
        col,
        endLine,
        indent,
        detail,
        documentation: doc,
        deprecated: isDeprecated(doc),
      })
      break
    }
  }

  return buildHierarchy(raw)
}

/* ── CSS / SCSS Parser ─────────────────────────────────── */

function parseCSSSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue

    // CSS/SCSS variable declarations ($var or --var)
    const varMatch = trimmed.match(/^(\$[\w-]+|--[\w-]+)\s*:/)
    if (varMatch) {
      raw.push({
        name: varMatch[1],
        kind: 'variable',
        line: i,
        col: line.indexOf(varMatch[1]),
        endLine: i,
        indent: lineIndent(line),
      })
      continue
    }

    // @keyframes
    const keyframesMatch = trimmed.match(/^@keyframes\s+([\w-]+)/)
    if (keyframesMatch) {
      const endLine = line.includes('{') ? findClosingBrace(lines, i) : i
      raw.push({
        name: keyframesMatch[1],
        kind: 'function',
        line: i,
        col: line.indexOf(keyframesMatch[1]),
        endLine,
        indent: lineIndent(line),
        detail: '@keyframes',
      })
      continue
    }

    // @media query
    const mediaMatch = trimmed.match(/^@media\s+(.+?)\s*\{/)
    if (mediaMatch) {
      const endLine = findClosingBrace(lines, i)
      raw.push({
        name: mediaMatch[1],
        kind: 'namespace',
        line: i,
        col: line.indexOf('@media'),
        endLine,
        indent: lineIndent(line),
        detail: '@media',
      })
      continue
    }

    // @mixin (SCSS)
    const mixinMatch = trimmed.match(/^@mixin\s+([\w-]+)/)
    if (mixinMatch) {
      const endLine = line.includes('{') ? findClosingBrace(lines, i) : i
      raw.push({
        name: mixinMatch[1],
        kind: 'function',
        line: i,
        col: line.indexOf(mixinMatch[1]),
        endLine,
        indent: lineIndent(line),
        detail: '@mixin',
      })
      continue
    }

    // @font-face
    if (trimmed.startsWith('@font-face')) {
      const endLine = line.includes('{') ? findClosingBrace(lines, i) : i
      raw.push({
        name: '@font-face',
        kind: 'class',
        line: i,
        col: line.indexOf('@font-face'),
        endLine,
        indent: lineIndent(line),
      })
      continue
    }

    // @import
    const importMatch = trimmed.match(/^@import\s+['"]([^'"]+)['"]/)
    if (importMatch) {
      raw.push({
        name: importMatch[1],
        kind: 'import',
        line: i,
        col: line.indexOf(importMatch[1]),
        endLine: i,
        indent: lineIndent(line),
      })
      continue
    }

    // General selectors (class, id, element, or combined selectors with {)
    const selectorMatch = trimmed.match(/^([.#&]?[\w&>+~:[\]*="-]+(?:\s*[,>+~]\s*[.#&]?[\w&>+~:[\]*="-]+)*)\s*\{/)
    if (selectorMatch) {
      const selectorName = selectorMatch[1].trim()
      // Ignore property-like patterns with colons (but allow pseudo-selectors)
      if (!selectorName.includes(':') || selectorName.includes('::') || selectorName.includes(':hover') || selectorName.includes(':nth')) {
        const endLine = findClosingBrace(lines, i)
        raw.push({
          name: selectorName,
          kind: 'class',
          line: i,
          col: line.indexOf(selectorName),
          endLine,
          indent: lineIndent(line),
        })
      }
      continue
    }
  }

  return buildHierarchy(raw)
}

/* ── JSON Parser ───────────────────────────────────────── */

function parseJSONSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Match "key": value patterns
    const keyMatch = trimmed.match(/^"((?:[^"\\]|\\.)*)"\s*:/)
    if (keyMatch) {
      const name = keyMatch[1]
      const col = line.indexOf(`"${name}"`)
      const indent = lineIndent(line)
      const afterColon = trimmed.slice(keyMatch[0].length).trim()

      let kind: SymbolKind = 'property'
      let endLine = i

      if (afterColon.startsWith('{')) {
        kind = 'namespace'
        endLine = findClosingBrace(lines, i)
      } else if (afterColon.startsWith('[')) {
        kind = 'variable'
        // Find matching bracket
        let bracketDepth = 0
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === '[') bracketDepth++
            else if (ch === ']') {
              bracketDepth--
              if (bracketDepth === 0) {
                endLine = j
                break
              }
            }
          }
          if (endLine > i) break
        }
      }

      raw.push({
        name,
        kind,
        line: i,
        col: col >= 0 ? col : 0,
        endLine,
        indent,
      })
    }
  }

  return buildHierarchy(raw)
}

/* ── Markdown Parser ───────────────────────────────────── */

function parseMarkdownSymbols(content: string): DocumentSymbol[] {
  const lines = content.split('\n')
  const raw: RawSymbol[] = []

  // Map heading level to an indent-like value for hierarchy building
  // Each heading level gets progressively more indent so buildHierarchy nests them
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (!headingMatch) continue

    const level = headingMatch[1].length
    const name = headingMatch[2].trim()

    // Find end line: extends until next heading of same or higher level, or EOF
    let endLine = lines.length - 1
    for (let j = i + 1; j < lines.length; j++) {
      const nextHeading = lines[j].match(/^(#{1,6})\s/)
      if (nextHeading && nextHeading[1].length <= level) {
        endLine = j - 1
        break
      }
    }

    // Use heading level as indent so hierarchy builder can nest them
    // h1 = indent 0, h2 = indent 4, h3 = indent 8, etc.
    const indent = (level - 1) * 4

    const kind: SymbolKind = level === 1 ? 'module' : level === 2 ? 'namespace' : 'property'

    raw.push({
      name,
      kind,
      line: i,
      col: level + 1, // after "# "
      endLine,
      indent,
      detail: `h${level}`,
    })
  }

  return buildHierarchy(raw)
}

/* ── Hierarchy Builder ─────────────────────────────────── */

/**
 * Convert a flat list of raw symbols (with indent + range info)
 * into a tree of DocumentSymbol using containment: a symbol is
 * a child of another if its range falls within the parent range.
 */
function buildHierarchy(raw: RawSymbol[]): DocumentSymbol[] {
  // Sort by position first
  raw.sort((a, b) => a.line - b.line || a.col - b.col)

  function toDocSymbol(r: RawSymbol): DocumentSymbol {
    return {
      name: r.name,
      kind: r.kind,
      range: rangeOf(r.line, 0, r.endLine, 999),
      selectionRange: rangeOf(r.line, r.col, r.line, r.col + r.name.length),
      children: [],
      detail: r.detail,
      documentation: r.documentation,
      deprecated: r.deprecated,
    }
  }

  const roots: DocumentSymbol[] = []
  // Stack of { symbol, endLine } for nesting
  const stack: Array<{ sym: DocumentSymbol; endLine: number }> = []

  for (const r of raw) {
    const sym = toDocSymbol(r)

    // Pop anything from the stack whose range has ended before this symbol
    while (stack.length > 0 && stack[stack.length - 1].endLine < r.line) {
      stack.pop()
    }

    if (stack.length > 0) {
      // Check if current symbol is contained by the top-of-stack
      const parent = stack[stack.length - 1]
      if (r.line >= parent.sym.range.start.line && r.endLine <= parent.endLine) {
        parent.sym.children.push(sym)
      } else {
        // Not contained — pop and try to attach to a higher parent
        stack.pop()
        if (stack.length > 0) {
          stack[stack.length - 1].sym.children.push(sym)
        } else {
          roots.push(sym)
        }
      }
    } else {
      roots.push(sym)
    }

    // Container symbols go on the stack
    if (['class', 'interface', 'enum', 'namespace', 'module', 'function', 'method', 'constructor'].includes(r.kind)) {
      stack.push({ sym, endLine: r.endLine })
    }
  }

  return roots
}

/* ── SymbolOutlineParser class ─────────────────────────── */

export class SymbolOutlineParser {
  private cache = new Map<string, { hash: number; symbols: DocumentSymbol[]; version: number }>()
  private versionCounter = 0

  /**
   * Parse symbols for a document. Results are cached by a simple
   * hash of the content string; re-parsing only occurs when content changes.
   */
  parse(content: string, languageId: string): DocumentSymbol[] {
    const hash = simpleHash(content)
    const key = `${languageId}:${hash}`
    const cached = this.cache.get(key)
    if (cached && cached.hash === hash) return cached.symbols

    const symbols = parseSymbols(content, languageId)
    this.versionCounter++
    this.cache.set(key, { hash, symbols, version: this.versionCounter })

    // Keep cache bounded
    if (this.cache.size > 200) {
      const oldest = this.cache.keys().next().value
      if (oldest) this.cache.delete(oldest)
    }

    return symbols
  }

  /**
   * Parse symbols and return a full SymbolOutline structure with
   * both the tree and a flattened list for searching.
   */
  parseOutline(content: string, languageId: string): SymbolOutline {
    const symbols = this.parse(content, languageId)
    const hash = simpleHash(content)
    const key = `${languageId}:${hash}`
    const cached = this.cache.get(key)

    return {
      symbols,
      flat: flattenSymbols(symbols),
      languageId,
      version: cached?.version ?? this.versionCounter,
    }
  }

  /** Clear the parse cache entirely. */
  clearCache(): void {
    this.cache.clear()
    this.versionCounter = 0
  }

  /** Invalidate cache entries for a specific language. */
  invalidate(languageId: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(`${languageId}:`)) {
        this.cache.delete(key)
      }
    }
  }

  /** Detect symbol-level changes between two versions of a document. */
  detectChanges(oldContent: string, newContent: string, languageId: string): SymbolChange {
    const oldSymbols = flattenSymbols(this.parse(oldContent, languageId))
    const newSymbols = flattenSymbols(this.parse(newContent, languageId))

    return diffSymbolLists(oldSymbols, newSymbols)
  }
}

/* ── Top-level API functions ───────────────────────────── */

/**
 * Parse symbols from source code for a given language.
 * Returns a hierarchical tree of DocumentSymbol.
 */
export function parseSymbols(content: string, languageId: string): DocumentSymbol[] {
  const lang = languageId.toLowerCase()

  switch (lang) {
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return parseTSSymbols(content)

    case 'python':
    case 'py':
      return parsePythonSymbols(content)

    case 'go':
      return parseGoSymbols(content)

    case 'rust':
    case 'rs':
      return parseRustSymbols(content)

    case 'java':
    case 'kotlin':
    case 'kt':
    case 'kts':
      return parseJavaKotlinSymbols(content)

    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return parseCSSSymbols(content)

    case 'json':
    case 'jsonc':
    case 'json5':
      return parseJSONSymbols(content)

    case 'markdown':
    case 'md':
      return parseMarkdownSymbols(content)

    default:
      // Fallback: try TS parser (it handles basic brace-delimited languages)
      return parseTSSymbols(content)
  }
}

/**
 * Get the innermost symbol at a given line number.
 * Walks the tree to find the deepest symbol whose range contains the line.
 */
export function getSymbolAtLine(symbols: DocumentSymbol[], line: number): DocumentSymbol | undefined {
  let best: DocumentSymbol | undefined

  function walk(syms: DocumentSymbol[]): void {
    for (const sym of syms) {
      if (line >= sym.range.start.line && line <= sym.range.end.line) {
        best = sym
        walk(sym.children)
      }
    }
  }

  walk(symbols)
  return best
}

/**
 * Get the breadcrumb path for a given line number.
 * Returns the chain of symbols that contain the cursor position,
 * from outermost to innermost (e.g., [Class, Method, Block]).
 */
export function getBreadcrumbPath(symbols: DocumentSymbol[], line: number): DocumentSymbol[] {
  const path: DocumentSymbol[] = []

  function walk(syms: DocumentSymbol[]): boolean {
    for (const sym of syms) {
      if (line >= sym.range.start.line && line <= sym.range.end.line) {
        path.push(sym)
        walk(sym.children)
        return true
      }
    }
    return false
  }

  walk(symbols)
  return path
}

/**
 * Get the symbol path for a given line number.
 * Alias for getBreadcrumbPath for backward compatibility.
 */
export function getSymbolPath(symbols: DocumentSymbol[], line: number): DocumentSymbol[] {
  return getBreadcrumbPath(symbols, line)
}

/**
 * Format a symbol path as a breadcrumb string.
 * E.g., "MyClass > myMethod > localVar"
 */
export function formatBreadcrumb(symbols: DocumentSymbol[], line: number): string {
  const path = getBreadcrumbPath(symbols, line)
  return path.map(s => s.name).join(' > ')
}

/**
 * Flatten a symbol tree into a single-level array.
 * Children appear after their parents with depth info preserved via indentation-style ordering.
 */
export function flattenSymbols(symbols: DocumentSymbol[]): DocumentSymbol[] {
  const result: DocumentSymbol[] = []

  function walk(syms: DocumentSymbol[]): void {
    for (const sym of syms) {
      result.push(sym)
      walk(sym.children)
    }
  }

  walk(symbols)
  return result
}

/**
 * Fuzzy search across a symbol tree (flattened).
 * Returns matching symbols sorted by match quality.
 */
export function searchSymbols(symbols: DocumentSymbol[], query: string): DocumentSymbol[] {
  if (!query) return []

  const flat = flattenSymbols(symbols)
  const scored: Array<{ sym: DocumentSymbol; score: number }> = []

  for (const sym of flat) {
    const match = fuzzyMatch(query, sym.name)
    if (match.score > 0) {
      scored.push({ sym, score: match.score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.sym)
}

/**
 * Get a flattened symbol list suitable for the command palette "@" mode.
 * Each symbol has a display-friendly detail showing its container path.
 */
export function getQuickOutline(symbols: DocumentSymbol[]): Array<{
  symbol: DocumentSymbol
  containerPath: string
  depth: number
}> {
  const result: Array<{ symbol: DocumentSymbol; containerPath: string; depth: number }> = []

  function walk(syms: DocumentSymbol[], path: string, depth: number): void {
    for (const sym of syms) {
      result.push({
        symbol: sym,
        containerPath: path,
        depth,
      })
      const childPath = path ? `${path} > ${sym.name}` : sym.name
      walk(sym.children, childPath, depth + 1)
    }
  }

  walk(symbols, '', 0)
  return result
}

/**
 * Sort symbols by the given mode. Returns a new array (does not mutate input).
 */
export function sortSymbols(symbols: DocumentSymbol[], mode: SymbolSortMode): DocumentSymbol[] {
  const sorted = [...symbols]

  const compareFn = (a: DocumentSymbol, b: DocumentSymbol): number => {
    switch (mode) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'position':
        return a.range.start.line - b.range.start.line ||
               a.range.start.character - b.range.start.character
      case 'kind':
        return (KIND_ORDER[a.kind] ?? 99) - (KIND_ORDER[b.kind] ?? 99) ||
               a.name.localeCompare(b.name)
      default:
        return 0
    }
  }

  sorted.sort(compareFn)

  // Recursively sort children
  for (const sym of sorted) {
    if (sym.children.length > 0) {
      sym.children = sortSymbols(sym.children, mode)
    }
  }

  return sorted
}

/**
 * Convert a DocumentSymbol to a position suitable for editor navigation.
 * Returns the start of the selection range (the symbol name location).
 */
export function symbolToPosition(symbol: DocumentSymbol): Position {
  return { ...symbol.selectionRange.start }
}

/**
 * Find a symbol by its fully-qualified path (e.g., "MyClass.myMethod").
 * Returns the matching symbol or undefined.
 */
export function findSymbolByPath(symbols: DocumentSymbol[], path: string): DocumentSymbol | undefined {
  const parts = path.split('.')
  let current = symbols

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const found = current.find(s => s.name === part)
    if (!found) return undefined
    if (i === parts.length - 1) return found
    current = found.children
  }

  return undefined
}

/**
 * Get all symbols of a specific kind from a tree.
 */
export function getSymbolsByKind(symbols: DocumentSymbol[], kind: SymbolKind): DocumentSymbol[] {
  const flat = flattenSymbols(symbols)
  return flat.filter(s => s.kind === kind)
}

/**
 * Check whether a given position (line) falls within a symbol's range.
 */
export function isPositionInSymbol(symbol: DocumentSymbol, line: number, character?: number): boolean {
  if (line < symbol.range.start.line || line > symbol.range.end.line) return false
  if (character !== undefined) {
    if (line === symbol.range.start.line && character < symbol.range.start.character) return false
    if (line === symbol.range.end.line && character > symbol.range.end.character) return false
  }
  return true
}

/**
 * Get the innermost symbol at a given cursor position (line + character).
 */
export function getSymbolAtPosition(symbols: DocumentSymbol[], line: number, character?: number): DocumentSymbol | undefined {
  let best: DocumentSymbol | undefined

  function walk(syms: DocumentSymbol[]): void {
    for (const sym of syms) {
      if (isPositionInSymbol(sym, line, character)) {
        best = sym
        walk(sym.children)
      }
    }
  }

  walk(symbols)
  return best
}

/* ── Change Detection ──────────────────────────────────── */

/**
 * Compute a fingerprint for a symbol (name + kind + approximate range).
 */
function symbolFingerprint(s: DocumentSymbol): string {
  return `${s.kind}:${s.name}`
}

/**
 * Diff two flat symbol lists to detect additions, removals, and modifications.
 */
function diffSymbolLists(oldSyms: DocumentSymbol[], newSyms: DocumentSymbol[]): SymbolChange {
  const oldMap = new Map<string, DocumentSymbol[]>()
  const newMap = new Map<string, DocumentSymbol[]>()

  for (const s of oldSyms) {
    const key = symbolFingerprint(s)
    const arr = oldMap.get(key) || []
    arr.push(s)
    oldMap.set(key, arr)
  }
  for (const s of newSyms) {
    const key = symbolFingerprint(s)
    const arr = newMap.get(key) || []
    arr.push(s)
    newMap.set(key, arr)
  }

  const added: DocumentSymbol[] = []
  const removed: DocumentSymbol[] = []
  const modified: Array<{ old: DocumentSymbol; new: DocumentSymbol }> = []

  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()])

  for (const key of allKeys) {
    const oldArr = oldMap.get(key) || []
    const newArr = newMap.get(key) || []

    const minLen = Math.min(oldArr.length, newArr.length)

    // Pair off symbols that exist in both
    for (let i = 0; i < minLen; i++) {
      const o = oldArr[i]
      const n = newArr[i]
      // Check if range changed significantly
      if (o.range.start.line !== n.range.start.line ||
          o.range.end.line !== n.range.end.line ||
          o.detail !== n.detail) {
        modified.push({ old: o, new: n })
      }
    }

    // Remaining old symbols were removed
    for (let i = minLen; i < oldArr.length; i++) {
      removed.push(oldArr[i])
    }

    // Remaining new symbols were added
    for (let i = minLen; i < newArr.length; i++) {
      added.push(newArr[i])
    }
  }

  return { added, removed, modified }
}

/**
 * Detect whether symbols have changed between two content versions.
 * Cheaper than full diff — returns a boolean.
 */
export function haveSymbolsChanged(oldContent: string, newContent: string, languageId: string): boolean {
  if (oldContent === newContent) return false
  const oldSyms = flattenSymbols(parseSymbols(oldContent, languageId))
  const newSyms = flattenSymbols(parseSymbols(newContent, languageId))

  if (oldSyms.length !== newSyms.length) return true

  for (let i = 0; i < oldSyms.length; i++) {
    if (oldSyms[i].name !== newSyms[i].name) return true
    if (oldSyms[i].kind !== newSyms[i].kind) return true
    if (oldSyms[i].range.start.line !== newSyms[i].range.start.line) return true
  }

  return false
}

/* ── Simple Hash ───────────────────────────────────────── */

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    hash = ((hash << 5) - hash + ch) | 0
  }
  return hash
}

/* ── Default singleton ─────────────────────────────────── */

export const symbolOutlineParser = new SymbolOutlineParser()
