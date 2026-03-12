/**
 * Semantic token analysis engine.
 * Provides rich token classification for syntax highlighting
 * beyond basic TextMate grammar scopes — similar to VS Code's
 * semantic tokens from LSP.
 */

/* ── Types ─────────────────────────────────────────────── */

export type SemanticTokenType =
  | 'namespace' | 'type' | 'class' | 'enum' | 'interface'
  | 'struct' | 'typeParameter' | 'parameter' | 'variable'
  | 'property' | 'enumMember' | 'event' | 'function'
  | 'method' | 'macro' | 'keyword' | 'modifier' | 'comment'
  | 'string' | 'number' | 'regexp' | 'operator' | 'decorator'
  | 'label' | 'lifetime' | 'builtinType' | 'selfKeyword'

export type SemanticTokenModifier =
  | 'declaration' | 'definition' | 'readonly' | 'static'
  | 'deprecated' | 'abstract' | 'async' | 'modification'
  | 'documentation' | 'defaultLibrary' | 'local' | 'global'
  | 'exported' | 'unused' | 'mutable' | 'consuming'

export interface SemanticToken {
  line: number
  startChar: number
  length: number
  tokenType: SemanticTokenType
  modifiers: SemanticTokenModifier[]
}

export interface SemanticTokensResult {
  tokens: SemanticToken[]
  resultId?: string
}

export interface SemanticTokensLegend {
  tokenTypes: SemanticTokenType[]
  tokenModifiers: SemanticTokenModifier[]
}

/* ── Encoded format (LSP-compatible) ─────────────────── */

export interface EncodedSemanticTokens {
  data: number[] // [deltaLine, deltaStartChar, length, tokenType, tokenModifiers][]
  resultId?: string
}

/* ── Legend ───────────────────────────────────────────── */

const TOKEN_TYPES: SemanticTokenType[] = [
  'namespace', 'type', 'class', 'enum', 'interface',
  'struct', 'typeParameter', 'parameter', 'variable',
  'property', 'enumMember', 'event', 'function',
  'method', 'macro', 'keyword', 'modifier', 'comment',
  'string', 'number', 'regexp', 'operator', 'decorator',
  'label', 'lifetime', 'builtinType', 'selfKeyword',
]

const TOKEN_MODIFIERS: SemanticTokenModifier[] = [
  'declaration', 'definition', 'readonly', 'static',
  'deprecated', 'abstract', 'async', 'modification',
  'documentation', 'defaultLibrary', 'local', 'global',
  'exported', 'unused', 'mutable', 'consuming',
]

export function getSemanticTokensLegend(): SemanticTokensLegend {
  return { tokenTypes: [...TOKEN_TYPES], tokenModifiers: [...TOKEN_MODIFIERS] }
}

/* ── Encode / Decode ─────────────────────────────────── */

export function encodeSemanticTokens(tokens: SemanticToken[]): EncodedSemanticTokens {
  const sorted = [...tokens].sort((a, b) =>
    a.line !== b.line ? a.line - b.line : a.startChar - b.startChar
  )

  const data: number[] = []
  let prevLine = 0
  let prevChar = 0

  for (const token of sorted) {
    const deltaLine = token.line - prevLine
    const deltaChar = deltaLine === 0 ? token.startChar - prevChar : token.startChar

    const typeIdx = TOKEN_TYPES.indexOf(token.tokenType)
    let modBits = 0
    for (const mod of token.modifiers) {
      const idx = TOKEN_MODIFIERS.indexOf(mod)
      if (idx >= 0) modBits |= (1 << idx)
    }

    data.push(deltaLine, deltaChar, token.length, typeIdx >= 0 ? typeIdx : 0, modBits)

    prevLine = token.line
    prevChar = token.startChar
  }

  return { data, resultId: `st-${Date.now()}` }
}

export function decodeSemanticTokens(encoded: EncodedSemanticTokens): SemanticToken[] {
  const tokens: SemanticToken[] = []
  let line = 0
  let char = 0

  for (let i = 0; i < encoded.data.length; i += 5) {
    const deltaLine = encoded.data[i]
    const deltaChar = encoded.data[i + 1]
    const length = encoded.data[i + 2]
    const typeIdx = encoded.data[i + 3]
    const modBits = encoded.data[i + 4]

    line += deltaLine
    char = deltaLine === 0 ? char + deltaChar : deltaChar

    const modifiers: SemanticTokenModifier[] = []
    for (let bit = 0; bit < TOKEN_MODIFIERS.length; bit++) {
      if (modBits & (1 << bit)) {
        modifiers.push(TOKEN_MODIFIERS[bit])
      }
    }

    tokens.push({
      line,
      startChar: char,
      length,
      tokenType: TOKEN_TYPES[typeIdx] || 'variable',
      modifiers,
    })
  }

  return tokens
}

/* ── Delta encoding for incremental updates ──────────── */

export interface SemanticTokensDelta {
  resultId: string
  edits: SemanticTokensEdit[]
}

export interface SemanticTokensEdit {
  start: number
  deleteCount: number
  data?: number[]
}

export function applySemanticTokensDelta(
  previous: EncodedSemanticTokens,
  delta: SemanticTokensDelta
): EncodedSemanticTokens {
  const data = [...previous.data]

  // Apply edits in reverse order to maintain indices
  const sorted = [...delta.edits].sort((a, b) => b.start - a.start)
  for (const edit of sorted) {
    data.splice(edit.start, edit.deleteCount, ...(edit.data || []))
  }

  return { data, resultId: delta.resultId }
}

export function computeSemanticTokensDelta(
  previous: EncodedSemanticTokens,
  current: EncodedSemanticTokens
): SemanticTokensDelta {
  const edits: SemanticTokensEdit[] = []
  const prevData = previous.data
  const currData = current.data

  // Simple diff: find first and last differences
  let start = 0
  while (start < prevData.length && start < currData.length && prevData[start] === currData[start]) {
    start++
  }

  // Align to token boundary (5 elements per token)
  start = Math.floor(start / 5) * 5

  let prevEnd = prevData.length
  let currEnd = currData.length
  while (prevEnd > start && currEnd > start && prevData[prevEnd - 1] === currData[currEnd - 1]) {
    prevEnd--
    currEnd--
  }

  // Align to token boundary
  prevEnd = Math.ceil(prevEnd / 5) * 5
  currEnd = Math.ceil(currEnd / 5) * 5

  if (start < prevEnd || start < currEnd) {
    edits.push({
      start,
      deleteCount: prevEnd - start,
      data: currData.slice(start, currEnd),
    })
  }

  return { resultId: current.resultId || `st-${Date.now()}`, edits }
}

/* ── Language-specific token analysis ────────────────── */

interface TokenPattern {
  pattern: RegExp
  tokenType: SemanticTokenType
  modifiers: SemanticTokenModifier[]
  group?: number
}

const TYPESCRIPT_PATTERNS: TokenPattern[] = [
  // Decorators
  { pattern: /@(\w+)/g, tokenType: 'decorator', modifiers: [], group: 0 },
  // Type annotations after colon
  { pattern: /:\s*([A-Z]\w*)/g, tokenType: 'type', modifiers: [], group: 1 },
  // Generic type parameters
  { pattern: /<([A-Z]\w*)(?:\s*(?:extends|=))?/g, tokenType: 'typeParameter', modifiers: ['declaration'], group: 1 },
  // Interface/type declarations
  { pattern: /\b(?:interface|type)\s+(\w+)/g, tokenType: 'interface', modifiers: ['declaration'], group: 1 },
  // Class declarations
  { pattern: /\bclass\s+(\w+)/g, tokenType: 'class', modifiers: ['declaration'], group: 1 },
  // Enum declarations
  { pattern: /\benum\s+(\w+)/g, tokenType: 'enum', modifiers: ['declaration'], group: 1 },
  // Function declarations
  { pattern: /\bfunction\s+(\w+)/g, tokenType: 'function', modifiers: ['declaration'], group: 1 },
  // Async function declarations
  { pattern: /\basync\s+function\s+(\w+)/g, tokenType: 'function', modifiers: ['declaration', 'async'], group: 1 },
  // Method declarations
  { pattern: /^\s*(?:async\s+)?(\w+)\s*\(/gm, tokenType: 'method', modifiers: ['declaration'], group: 1 },
  // Static methods
  { pattern: /\bstatic\s+(?:async\s+)?(\w+)/g, tokenType: 'method', modifiers: ['static', 'declaration'], group: 1 },
  // Arrow function assignments
  { pattern: /\b(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/g, tokenType: 'function', modifiers: ['declaration', 'readonly'], group: 1 },
  // Constants (UPPER_CASE)
  { pattern: /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]+)\b/g, tokenType: 'variable', modifiers: ['readonly', 'declaration'], group: 1 },
  // Regular variables
  { pattern: /\b(?:const)\s+(\w+)/g, tokenType: 'variable', modifiers: ['readonly', 'declaration'], group: 1 },
  { pattern: /\b(?:let|var)\s+(\w+)/g, tokenType: 'variable', modifiers: ['declaration', 'mutable'], group: 1 },
  // Parameters in function signatures
  { pattern: /\(([^)]*)\)/g, tokenType: 'parameter', modifiers: [], group: 0 },
  // Property access
  { pattern: /\.(\w+)(?!\s*\()/g, tokenType: 'property', modifiers: [], group: 1 },
  // Method calls
  { pattern: /\.(\w+)\s*\(/g, tokenType: 'method', modifiers: [], group: 1 },
  // Namespace/module
  { pattern: /\bnamespace\s+(\w+)/g, tokenType: 'namespace', modifiers: ['declaration'], group: 1 },
  // Import identifiers
  { pattern: /\bimport\s+(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+(\w+)|(\w+))/g, tokenType: 'namespace', modifiers: [], group: 1 },
  // Export markers
  { pattern: /\bexport\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g, tokenType: 'variable', modifiers: ['exported', 'declaration'], group: 1 },
  // Readonly modifier
  { pattern: /\breadonly\s+(\w+)/g, tokenType: 'property', modifiers: ['readonly'], group: 1 },
  // Deprecated (JSDoc)
  { pattern: /@deprecated/g, tokenType: 'comment', modifiers: ['documentation', 'deprecated'] },
]

const PYTHON_PATTERNS: TokenPattern[] = [
  // Decorators
  { pattern: /@(\w+(?:\.\w+)*)/g, tokenType: 'decorator', modifiers: [], group: 0 },
  // Class declarations
  { pattern: /\bclass\s+(\w+)/g, tokenType: 'class', modifiers: ['declaration'], group: 1 },
  // Function declarations
  { pattern: /\bdef\s+(\w+)/g, tokenType: 'function', modifiers: ['declaration'], group: 1 },
  // Async function
  { pattern: /\basync\s+def\s+(\w+)/g, tokenType: 'function', modifiers: ['declaration', 'async'], group: 1 },
  // Self parameter
  { pattern: /\bself\b/g, tokenType: 'selfKeyword', modifiers: [] },
  // cls parameter
  { pattern: /\bcls\b/g, tokenType: 'selfKeyword', modifiers: ['static'] },
  // Type hints
  { pattern: /:\s*([A-Z]\w*)/g, tokenType: 'type', modifiers: [], group: 1 },
  // CONSTANTS
  { pattern: /^([A-Z][A-Z0-9_]+)\s*=/gm, tokenType: 'variable', modifiers: ['readonly', 'declaration'], group: 1 },
  // Dunder methods
  { pattern: /\bdef\s+(__\w+__)/g, tokenType: 'method', modifiers: ['declaration', 'defaultLibrary'], group: 1 },
  // Private attributes
  { pattern: /\bself\.(__?\w+)/g, tokenType: 'property', modifiers: ['local'], group: 1 },
  // Property access
  { pattern: /\.(\w+)(?!\s*\()/g, tokenType: 'property', modifiers: [], group: 1 },
  // Method calls
  { pattern: /\.(\w+)\s*\(/g, tokenType: 'method', modifiers: [], group: 1 },
  // Built-in types
  { pattern: /\b(int|float|str|bool|list|dict|tuple|set|bytes|None|True|False)\b/g, tokenType: 'builtinType', modifiers: ['defaultLibrary'] },
  // Import
  { pattern: /\bimport\s+(\w+)/g, tokenType: 'namespace', modifiers: [], group: 1 },
  { pattern: /\bfrom\s+(\w+(?:\.\w+)*)/g, tokenType: 'namespace', modifiers: [], group: 1 },
]

const RUST_PATTERNS: TokenPattern[] = [
  // Struct declarations
  { pattern: /\bstruct\s+(\w+)/g, tokenType: 'struct', modifiers: ['declaration'], group: 1 },
  // Enum declarations
  { pattern: /\benum\s+(\w+)/g, tokenType: 'enum', modifiers: ['declaration'], group: 1 },
  // Trait declarations
  { pattern: /\btrait\s+(\w+)/g, tokenType: 'interface', modifiers: ['declaration'], group: 1 },
  // Impl blocks
  { pattern: /\bimpl(?:<[^>]*>)?\s+(\w+)/g, tokenType: 'class', modifiers: [], group: 1 },
  // Function declarations
  { pattern: /\bfn\s+(\w+)/g, tokenType: 'function', modifiers: ['declaration'], group: 1 },
  // Async fn
  { pattern: /\basync\s+fn\s+(\w+)/g, tokenType: 'function', modifiers: ['declaration', 'async'], group: 1 },
  // Macro invocations
  { pattern: /\b(\w+)!/g, tokenType: 'macro', modifiers: [], group: 1 },
  // Lifetimes
  { pattern: /'(\w+)/g, tokenType: 'lifetime', modifiers: [], group: 0 },
  // Type parameters
  { pattern: /<([A-Z]\w*)(?:\s*:)?/g, tokenType: 'typeParameter', modifiers: [], group: 1 },
  // Constants
  { pattern: /\bconst\s+([A-Z_]\w*)/g, tokenType: 'variable', modifiers: ['readonly', 'declaration'], group: 1 },
  // Static
  { pattern: /\bstatic\s+(?:mut\s+)?([A-Z_]\w*)/g, tokenType: 'variable', modifiers: ['static', 'declaration'], group: 1 },
  // Let bindings
  { pattern: /\blet\s+(?:mut\s+)?(\w+)/g, tokenType: 'variable', modifiers: ['declaration'], group: 1 },
  // Self
  { pattern: /\bself\b/g, tokenType: 'selfKeyword', modifiers: [] },
  { pattern: /\bSelf\b/g, tokenType: 'type', modifiers: [] },
  // Module
  { pattern: /\bmod\s+(\w+)/g, tokenType: 'namespace', modifiers: ['declaration'], group: 1 },
  // Use imports
  { pattern: /\buse\s+(\w+(?:::\w+)*)/g, tokenType: 'namespace', modifiers: [], group: 1 },
  // Derive attribute
  { pattern: /#\[derive\(([^)]+)\)\]/g, tokenType: 'decorator', modifiers: [], group: 0 },
  // Other attributes
  { pattern: /#\[(\w+)/g, tokenType: 'decorator', modifiers: [], group: 1 },
  // Built-in types
  { pattern: /\b(i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64|bool|char|str|String|Vec|Option|Result|Box|Rc|Arc)\b/g, tokenType: 'builtinType', modifiers: ['defaultLibrary'] },
]

const GO_PATTERNS: TokenPattern[] = [
  // Struct declarations
  { pattern: /\btype\s+(\w+)\s+struct\b/g, tokenType: 'struct', modifiers: ['declaration'], group: 1 },
  // Interface declarations
  { pattern: /\btype\s+(\w+)\s+interface\b/g, tokenType: 'interface', modifiers: ['declaration'], group: 1 },
  // Type aliases
  { pattern: /\btype\s+(\w+)\s+/g, tokenType: 'type', modifiers: ['declaration'], group: 1 },
  // Function declarations
  { pattern: /\bfunc\s+(\w+)/g, tokenType: 'function', modifiers: ['declaration'], group: 1 },
  // Method declarations (with receiver)
  { pattern: /\bfunc\s+\([^)]+\)\s+(\w+)/g, tokenType: 'method', modifiers: ['declaration'], group: 1 },
  // Package
  { pattern: /\bpackage\s+(\w+)/g, tokenType: 'namespace', modifiers: ['declaration'], group: 1 },
  // Import
  { pattern: /"([^"]+)"/g, tokenType: 'string', modifiers: [], group: 0 },
  // Constants
  { pattern: /\b([A-Z][A-Z0-9_]+)\b/g, tokenType: 'variable', modifiers: ['readonly'], group: 1 },
  // Exported identifiers (capitalized)
  { pattern: /\b([A-Z]\w+)\b/g, tokenType: 'variable', modifiers: ['exported'], group: 1 },
  // Short variable declaration
  { pattern: /(\w+)\s*:=/g, tokenType: 'variable', modifiers: ['declaration', 'mutable'], group: 1 },
  // Var declaration
  { pattern: /\bvar\s+(\w+)/g, tokenType: 'variable', modifiers: ['declaration', 'mutable'], group: 1 },
  // Built-in types
  { pattern: /\b(int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|complex64|complex128|string|bool|byte|rune|error|any)\b/g, tokenType: 'builtinType', modifiers: ['defaultLibrary'] },
  // Built-in functions
  { pattern: /\b(make|new|len|cap|append|copy|delete|close|panic|recover|print|println)\s*\(/g, tokenType: 'function', modifiers: ['defaultLibrary'], group: 1 },
]

const LANGUAGE_PATTERNS: Record<string, TokenPattern[]> = {
  typescript: TYPESCRIPT_PATTERNS,
  typescriptreact: TYPESCRIPT_PATTERNS,
  javascript: TYPESCRIPT_PATTERNS,
  javascriptreact: TYPESCRIPT_PATTERNS,
  python: PYTHON_PATTERNS,
  rust: RUST_PATTERNS,
  go: GO_PATTERNS,
}

/* ── Analyzer ────────────────────────────────────────── */

export function analyzeSemanticTokens(
  content: string,
  language: string
): SemanticTokensResult {
  const patterns = LANGUAGE_PATTERNS[language]
  if (!patterns) return { tokens: [] }

  const lines = content.split('\n')
  const tokens: SemanticToken[] = []
  const seen = new Set<string>() // dedup key: line:start:length

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]

    for (const pat of patterns) {
      const regex = new RegExp(pat.pattern.source, pat.pattern.flags)
      let match: RegExpExecArray | null

      while ((match = regex.exec(line)) !== null) {
        const group = pat.group ?? 0
        const text = group > 0 && match[group] ? match[group] : match[0]
        const startChar = group > 0 && match[group]
          ? match.index + match[0].indexOf(match[group])
          : match.index

        if (text.length === 0) continue

        const key = `${lineIdx}:${startChar}:${text.length}`
        if (seen.has(key)) continue
        seen.add(key)

        tokens.push({
          line: lineIdx,
          startChar,
          length: text.length,
          tokenType: pat.tokenType,
          modifiers: [...pat.modifiers],
        })
      }
    }
  }

  // Sort by position
  tokens.sort((a, b) =>
    a.line !== b.line ? a.line - b.line : a.startChar - b.startChar
  )

  return { tokens, resultId: `st-${Date.now()}` }
}

/* ── Scope analysis (for token refinement) ───────────── */

export interface TokenScope {
  kind: 'function' | 'class' | 'block' | 'module' | 'loop' | 'conditional'
  name: string
  startLine: number
  endLine: number
  variables: Map<string, { type: SemanticTokenType; modifiers: SemanticTokenModifier[] }>
}

export function analyzeScopeTree(content: string, language: string): TokenScope[] {
  const lines = content.split('\n')
  const scopes: TokenScope[] = []
  const stack: { kind: TokenScope['kind']; name: string; startLine: number; braceDepth: number }[] = []
  let braceDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Track brace depth
    for (const ch of line) {
      if (ch === '{') braceDepth++
      if (ch === '}') {
        braceDepth--
        // Check if scope ends
        while (stack.length > 0 && braceDepth <= stack[stack.length - 1].braceDepth) {
          const scope = stack.pop()!
          scopes.push({
            kind: scope.kind,
            name: scope.name,
            startLine: scope.startLine,
            endLine: i,
            variables: new Map(),
          })
        }
      }
    }

    // Detect scope starts
    if (language === 'typescript' || language === 'javascript' || language === 'typescriptreact' || language === 'javascriptreact') {
      const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/)
      if (classMatch) {
        stack.push({ kind: 'class', name: classMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }

      const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
      if (funcMatch) {
        stack.push({ kind: 'function', name: funcMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }

      const methodMatch = trimmed.match(/^(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/)
      if (methodMatch && !classMatch && !funcMatch) {
        stack.push({ kind: 'function', name: methodMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }

      if (/\bif\s*\(/.test(trimmed)) {
        stack.push({ kind: 'conditional', name: 'if', startLine: i, braceDepth: braceDepth - 1 })
      }
      if (/\b(?:for|while)\s*\(/.test(trimmed)) {
        stack.push({ kind: 'loop', name: 'loop', startLine: i, braceDepth: braceDepth - 1 })
      }
    }

    if (language === 'rust') {
      const fnMatch = trimmed.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/)
      if (fnMatch) {
        stack.push({ kind: 'function', name: fnMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }
      const implMatch = trimmed.match(/^impl(?:<[^>]*>)?\s+(\w+)/)
      if (implMatch) {
        stack.push({ kind: 'class', name: implMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }
      const structMatch = trimmed.match(/^(?:pub\s+)?struct\s+(\w+)/)
      if (structMatch) {
        stack.push({ kind: 'class', name: structMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }
    }

    if (language === 'go') {
      const funcMatch = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)/)
      if (funcMatch) {
        stack.push({ kind: 'function', name: funcMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }
      const typeMatch = trimmed.match(/^type\s+(\w+)\s+struct/)
      if (typeMatch) {
        stack.push({ kind: 'class', name: typeMatch[1], startLine: i, braceDepth: braceDepth - 1 })
      }
    }
  }

  // Close remaining scopes
  while (stack.length > 0) {
    const scope = stack.pop()!
    scopes.push({
      kind: scope.kind,
      name: scope.name,
      startLine: scope.startLine,
      endLine: lines.length - 1,
      variables: new Map(),
    })
  }

  return scopes
}

/* ── Token-to-CSS class mapping ──────────────────────── */

export interface TokenColorMap {
  [tokenType: string]: {
    foreground?: string
    fontStyle?: 'italic' | 'bold' | 'underline' | 'strikethrough'
    opacity?: number
  }
}

const DARK_THEME_COLORS: TokenColorMap = {
  namespace: { foreground: '#4EC9B0' },
  type: { foreground: '#4EC9B0' },
  class: { foreground: '#4EC9B0' },
  enum: { foreground: '#4EC9B0' },
  interface: { foreground: '#4EC9B0' },
  struct: { foreground: '#4EC9B0' },
  typeParameter: { foreground: '#4EC9B0' },
  parameter: { foreground: '#9CDCFE' },
  variable: { foreground: '#9CDCFE' },
  property: { foreground: '#9CDCFE' },
  enumMember: { foreground: '#4FC1FF' },
  event: { foreground: '#9CDCFE' },
  function: { foreground: '#DCDCAA' },
  method: { foreground: '#DCDCAA' },
  macro: { foreground: '#DCDCAA', fontStyle: 'bold' },
  keyword: { foreground: '#569CD6' },
  modifier: { foreground: '#569CD6' },
  comment: { foreground: '#6A9955', fontStyle: 'italic' },
  string: { foreground: '#CE9178' },
  number: { foreground: '#B5CEA8' },
  regexp: { foreground: '#D16969' },
  operator: { foreground: '#D4D4D4' },
  decorator: { foreground: '#DCDCAA', fontStyle: 'italic' },
  label: { foreground: '#C8C8C8' },
  lifetime: { foreground: '#569CD6', fontStyle: 'italic' },
  builtinType: { foreground: '#4EC9B0', fontStyle: 'italic' },
  selfKeyword: { foreground: '#569CD6', fontStyle: 'italic' },
}

const LIGHT_THEME_COLORS: TokenColorMap = {
  namespace: { foreground: '#267F99' },
  type: { foreground: '#267F99' },
  class: { foreground: '#267F99' },
  enum: { foreground: '#267F99' },
  interface: { foreground: '#267F99' },
  struct: { foreground: '#267F99' },
  typeParameter: { foreground: '#267F99' },
  parameter: { foreground: '#001080' },
  variable: { foreground: '#001080' },
  property: { foreground: '#001080' },
  enumMember: { foreground: '#0070C1' },
  event: { foreground: '#001080' },
  function: { foreground: '#795E26' },
  method: { foreground: '#795E26' },
  macro: { foreground: '#795E26', fontStyle: 'bold' },
  keyword: { foreground: '#0000FF' },
  modifier: { foreground: '#0000FF' },
  comment: { foreground: '#008000', fontStyle: 'italic' },
  string: { foreground: '#A31515' },
  number: { foreground: '#098658' },
  regexp: { foreground: '#811F3F' },
  operator: { foreground: '#000000' },
  decorator: { foreground: '#795E26', fontStyle: 'italic' },
  label: { foreground: '#000000' },
  lifetime: { foreground: '#0000FF', fontStyle: 'italic' },
  builtinType: { foreground: '#267F99', fontStyle: 'italic' },
  selfKeyword: { foreground: '#0000FF', fontStyle: 'italic' },
}

export function getTokenColorMap(theme: 'dark' | 'light'): TokenColorMap {
  return theme === 'dark' ? { ...DARK_THEME_COLORS } : { ...LIGHT_THEME_COLORS }
}

/* ── Generate CSS for semantic tokens ────────────────── */

export function generateSemanticTokenCSS(theme: 'dark' | 'light'): string {
  const colors = getTokenColorMap(theme)
  const rules: string[] = []

  for (const [tokenType, style] of Object.entries(colors)) {
    const props: string[] = []
    if (style.foreground) props.push(`color: ${style.foreground}`)
    if (style.fontStyle === 'italic') props.push('font-style: italic')
    if (style.fontStyle === 'bold') props.push('font-weight: bold')
    if (style.fontStyle === 'underline') props.push('text-decoration: underline')
    if (style.fontStyle === 'strikethrough') props.push('text-decoration: line-through')
    if (style.opacity !== undefined) props.push(`opacity: ${style.opacity}`)

    if (props.length > 0) {
      rules.push(`.semantic-token-${tokenType} { ${props.join('; ')} }`)
    }
  }

  // Modifier-based overrides
  rules.push('.semantic-mod-deprecated { text-decoration: line-through; opacity: 0.7; }')
  rules.push('.semantic-mod-readonly { font-style: italic; }')
  rules.push('.semantic-mod-static { text-decoration: underline; }')
  rules.push('.semantic-mod-unused { opacity: 0.5; }')
  rules.push('.semantic-mod-async::after { content: "⚡"; font-size: 0.7em; vertical-align: super; }')

  return rules.join('\n')
}

/* ── Monaco decoration conversion ────────────────────── */

export interface SemanticDecoration {
  range: {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
  }
  options: {
    inlineClassName: string
    stickiness: number
  }
}

export function toMonacoDecorations(tokens: SemanticToken[]): SemanticDecoration[] {
  return tokens.map(token => {
    const classes = [`semantic-token-${token.tokenType}`]
    for (const mod of token.modifiers) {
      classes.push(`semantic-mod-${mod}`)
    }

    return {
      range: {
        startLineNumber: token.line + 1,
        startColumn: token.startChar + 1,
        endLineNumber: token.line + 1,
        endColumn: token.startChar + token.length + 1,
      },
      options: {
        inlineClassName: classes.join(' '),
        stickiness: 1,
      },
    }
  })
}

/* ── Token range query ───────────────────────────────── */

export function getTokensInRange(
  tokens: SemanticToken[],
  startLine: number,
  endLine: number
): SemanticToken[] {
  return tokens.filter(t => t.line >= startLine && t.line <= endLine)
}

export function getTokenAtPosition(
  tokens: SemanticToken[],
  line: number,
  character: number
): SemanticToken | undefined {
  return tokens.find(t =>
    t.line === line &&
    t.startChar <= character &&
    t.startChar + t.length > character
  )
}

/* ── Token statistics ────────────────────────────────── */

export interface TokenStats {
  totalTokens: number
  byType: Record<string, number>
  byModifier: Record<string, number>
  uniqueIdentifiers: number
  averageTokensPerLine: number
}

export function computeTokenStats(tokens: SemanticToken[], totalLines: number): TokenStats {
  const byType: Record<string, number> = {}
  const byModifier: Record<string, number> = {}
  const identifiers = new Set<string>()

  for (const token of tokens) {
    byType[token.tokenType] = (byType[token.tokenType] || 0) + 1
    for (const mod of token.modifiers) {
      byModifier[mod] = (byModifier[mod] || 0) + 1
    }
    identifiers.add(`${token.tokenType}:${token.line}:${token.startChar}`)
  }

  return {
    totalTokens: tokens.length,
    byType,
    byModifier,
    uniqueIdentifiers: identifiers.size,
    averageTokensPerLine: totalLines > 0 ? tokens.length / totalLines : 0,
  }
}
