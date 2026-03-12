/**
 * Code Navigation Engine.
 * Provides go-to-definition, find references, call hierarchy,
 * type hierarchy, implementations, and breadcrumb navigation
 * without requiring a full LSP server.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface Location {
  filePath: string
  line: number
  column: number
  endLine?: number
  endColumn?: number
}

export interface DefinitionResult {
  symbol: string
  kind: SymbolKind
  location: Location
  preview: string
  confidence: 'exact' | 'probable' | 'guess'
}

export interface ReferenceResult {
  location: Location
  preview: string
  context: 'definition' | 'usage' | 'import' | 'export' | 'type-ref' | 'assignment' | 'call'
  symbol: string
}

export interface CallHierarchyItem {
  name: string
  kind: SymbolKind
  location: Location
  detail?: string
}

export interface CallHierarchyCall {
  from: CallHierarchyItem
  to: CallHierarchyItem
  fromRanges: Location[]
}

export interface TypeHierarchyItem {
  name: string
  kind: 'class' | 'interface' | 'type'
  location: Location
  parents: TypeHierarchyItem[]
  children: TypeHierarchyItem[]
}

export interface BreadcrumbItem {
  name: string
  kind: SymbolKind
  range: { startLine: number; endLine: number }
  children?: BreadcrumbItem[]
}

export type SymbolKind =
  | 'file' | 'module' | 'namespace' | 'package'
  | 'class' | 'method' | 'property' | 'field'
  | 'constructor' | 'enum' | 'interface' | 'function'
  | 'variable' | 'constant' | 'string' | 'number'
  | 'boolean' | 'array' | 'object' | 'key'
  | 'null' | 'enumerator' | 'struct' | 'event'
  | 'operator' | 'type-parameter'

export interface NavigationIndex {
  definitions: Map<string, DefinitionResult[]>
  references: Map<string, ReferenceResult[]>
  exports: Map<string, Map<string, Location>>  // file -> symbol -> location
  imports: Map<string, ImportInfo[]>
}

export interface ImportInfo {
  source: string
  specifiers: Array<{ name: string; alias?: string; isDefault: boolean; isNamespace: boolean }>
  location: Location
}

/* ── Symbol kind detection ─────────────────────────────── */

const KIND_PATTERNS: Array<{ pattern: RegExp; kind: SymbolKind }> = [
  { pattern: /^(?:export\s+)?(?:abstract\s+)?class\s/, kind: 'class' },
  { pattern: /^(?:export\s+)?interface\s/, kind: 'interface' },
  { pattern: /^(?:export\s+)?type\s/, kind: 'type-parameter' },
  { pattern: /^(?:export\s+)?enum\s/, kind: 'enum' },
  { pattern: /^(?:export\s+)?(?:async\s+)?function\s/, kind: 'function' },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s/, kind: 'variable' },
  { pattern: /^\s+(?:public|private|protected|static|readonly|async)?\s*(?:get|set)\s/, kind: 'property' },
  { pattern: /^\s+(?:public|private|protected|static|readonly|async)?\s+\w+\s*\(/, kind: 'method' },
  { pattern: /^\s+constructor\s*\(/, kind: 'constructor' },
  { pattern: /^(?:pub\s+)?(?:async\s+)?fn\s/, kind: 'function' },
  { pattern: /^(?:pub\s+)?struct\s/, kind: 'struct' },
  { pattern: /^(?:pub\s+)?trait\s/, kind: 'interface' },
  { pattern: /^def\s/, kind: 'function' },
  { pattern: /^class\s/, kind: 'class' },
  { pattern: /^func\s/, kind: 'function' },
]

function detectSymbolKind(line: string): SymbolKind {
  for (const { pattern, kind } of KIND_PATTERNS) {
    if (pattern.test(line.trim())) return kind
  }
  return 'variable'
}

/* ── Import parsing ────────────────────────────────────── */

export function parseImports(content: string, filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = []
  const lines = content.split('\n')

  // TypeScript/JavaScript imports
  const importRegex = /import\s+(?:(type)\s+)?(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?\s*(?:from\s+)?['"]([^'"]+)['"]/g
  const namespaceImportRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g

  let match

  // Namespace imports
  while ((match = namespaceImportRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length - 1
    imports.push({
      source: match[2],
      specifiers: [{ name: match[1], isDefault: false, isNamespace: true }],
      location: { filePath, line: lineNum, column: 0 },
    })
  }

  // Regular imports
  while ((match = importRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length - 1
    const specifiers: ImportInfo['specifiers'] = []

    // Default import
    if (match[2]) {
      specifiers.push({ name: match[2], isDefault: true, isNamespace: false })
    }

    // Named imports
    if (match[3]) {
      const names = match[3].split(',').map(s => s.trim()).filter(Boolean)
      for (const name of names) {
        const parts = name.split(/\s+as\s+/)
        specifiers.push({
          name: parts[0].trim(),
          alias: parts[1]?.trim(),
          isDefault: false,
          isNamespace: false,
        })
      }
    }

    if (specifiers.length > 0) {
      imports.push({
        source: match[4],
        specifiers,
        location: { filePath, line: lineNum, column: 0 },
      })
    }
  }

  // Side-effect imports
  while ((match = sideEffectRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length - 1
    // Skip if already captured by other patterns
    const line = lines[lineNum]?.trim() || ''
    if (line.startsWith('import \'') || line.startsWith('import "')) {
      imports.push({
        source: match[1],
        specifiers: [],
        location: { filePath, line: lineNum, column: 0 },
      })
    }
  }

  return imports
}

/* ── Export parsing ────────────────────────────────────── */

export function parseExports(content: string, filePath: string): Map<string, Location> {
  const exports = new Map<string, Location>()
  const lines = content.split('\n')

  // Named exports
  const namedExportRegex = /export\s+(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+(\w+)/g
  let match

  while ((match = namedExportRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length - 1
    exports.set(match[1], { filePath, line: lineNum, column: match.index - content.lastIndexOf('\n', match.index) - 1 })
  }

  // Export list: export { a, b, c }
  const exportListRegex = /export\s+\{([^}]+)\}/g
  while ((match = exportListRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length - 1
    const names = match[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
    for (const name of names) {
      exports.set(name, { filePath, line: lineNum, column: 0 })
    }
  }

  // Default export
  const defaultExportRegex = /export\s+default\s+(?:(?:async\s+)?function|class)\s+(\w+)/g
  while ((match = defaultExportRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length - 1
    exports.set('default', { filePath, line: lineNum, column: 0 })
    exports.set(match[1], { filePath, line: lineNum, column: 0 })
  }

  // Default export of variable: export default Foo
  const defaultVarRegex = /export\s+default\s+(\w+)\s*[;\n]/g
  while ((match = defaultVarRegex.exec(content)) !== null) {
    const lineNum = content.slice(0, match.index).split('\n').length - 1
    exports.set('default', { filePath, line: lineNum, column: 0 })
  }

  return exports
}

/* ── Reference finding ─────────────────────────────────── */

export function findReferencesInContent(
  content: string,
  filePath: string,
  symbolName: string
): ReferenceResult[] {
  const results: ReferenceResult[] = []
  const lines = content.split('\n')
  const wordRegex = new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'g')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let match

    while ((match = wordRegex.exec(line)) !== null) {
      const context = classifyReference(line, match.index, symbolName)
      results.push({
        location: { filePath, line: i, column: match.index, endColumn: match.index + symbolName.length },
        preview: line.trim(),
        context,
        symbol: symbolName,
      })
    }
  }

  return results
}

function classifyReference(line: string, col: number, _symbol: string): ReferenceResult['context'] {
  const trimmed = line.trim()

  if (/^import\s/.test(trimmed)) return 'import'
  if (/^export\s/.test(trimmed)) return 'export'
  if (/(?:function|class|interface|type|enum)\s/.test(trimmed) && col < 50) return 'definition'
  if (/(?:const|let|var)\s/.test(trimmed) && col < line.indexOf('=')) return 'definition'

  // Check if it's a call
  const afterSymbol = line.slice(col + _symbol.length).trimStart()
  if (afterSymbol.startsWith('(') || afterSymbol.startsWith('<')) return 'call'

  // Check assignment
  const beforeSymbol = line.slice(0, col).trimEnd()
  if (/[=:]$/.test(beforeSymbol) || afterSymbol.startsWith('=')) return 'assignment'

  // Check type reference
  if (/:\s*$/.test(beforeSymbol) || /^[<\[]/.test(afterSymbol) || beforeSymbol.endsWith('extends') || beforeSymbol.endsWith('implements')) return 'type-ref'

  return 'usage'
}

/* ── Call hierarchy ────────────────────────────────────── */

export function buildCallHierarchy(
  files: Map<string, string>,
  targetSymbol: string
): { incoming: CallHierarchyCall[]; outgoing: CallHierarchyCall[] } {
  const incoming: CallHierarchyCall[] = []
  const outgoing: CallHierarchyCall[] = []

  // Find the target's definition
  let targetItem: CallHierarchyItem | null = null
  let targetContent = ''

  for (const [filePath, content] of files) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const defRegex = new RegExp(`(?:function|class|def|fn)\\s+${escapeRegex(targetSymbol)}\\b`)
      if (defRegex.test(line)) {
        targetItem = {
          name: targetSymbol,
          kind: detectSymbolKind(line),
          location: { filePath, line: i, column: 0 },
          detail: line.trim(),
        }
        targetContent = content
        break
      }
    }
    if (targetItem) break
  }

  if (!targetItem) return { incoming, outgoing }

  // Find incoming calls (who calls targetSymbol)
  const callRegex = new RegExp(`\\b${escapeRegex(targetSymbol)}\\s*\\(`, 'g')
  for (const [filePath, content] of files) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (callRegex.test(lines[i])) {
        callRegex.lastIndex = 0
        // Find enclosing function
        const enclosing = findEnclosingFunction(lines, i)
        if (enclosing && enclosing.name !== targetSymbol) {
          incoming.push({
            from: {
              name: enclosing.name,
              kind: enclosing.kind,
              location: { filePath, line: enclosing.line, column: 0 },
            },
            to: targetItem,
            fromRanges: [{ filePath, line: i, column: lines[i].indexOf(targetSymbol) }],
          })
        }
      }
    }
  }

  // Find outgoing calls (what does targetSymbol call)
  if (targetContent) {
    const targetLines = targetContent.split('\n')
    const start = targetItem.location.line
    let braceDepth = 0
    let foundOpen = false

    for (let i = start; i < targetLines.length; i++) {
      for (const ch of targetLines[i]) {
        if (ch === '{') { braceDepth++; foundOpen = true }
        if (ch === '}') braceDepth--
      }

      // Find function calls in this line
      const funcCallRegex = /\b(\w+)\s*\(/g
      let m
      while ((m = funcCallRegex.exec(targetLines[i])) !== null) {
        const calledName = m[1]
        if (calledName === targetSymbol) continue
        if (/^(if|for|while|switch|catch|return|new|typeof|void|delete|throw|await|yield)$/.test(calledName)) continue

        outgoing.push({
          from: targetItem,
          to: {
            name: calledName,
            kind: 'function',
            location: { filePath: targetItem.location.filePath, line: i, column: m.index },
          },
          fromRanges: [{ filePath: targetItem.location.filePath, line: i, column: m.index }],
        })
      }

      if (foundOpen && braceDepth <= 0) break
    }
  }

  return { incoming, outgoing }
}

function findEnclosingFunction(lines: string[], targetLine: number): { name: string; kind: SymbolKind; line: number } | null {
  for (let i = targetLine; i >= 0; i--) {
    const line = lines[i]
    const funcMatch = line.match(/(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(|(\w+)\s*\([^)]*\)\s*\{|(?:pub\s+)?(?:async\s+)?fn\s+(\w+))/)
    if (funcMatch) {
      const name = funcMatch[1] || funcMatch[2] || funcMatch[3] || funcMatch[4]
      if (name) {
        return { name, kind: detectSymbolKind(line), line: i }
      }
    }

    const classMatch = line.match(/(?:export\s+)?class\s+(\w+)/)
    if (classMatch) {
      return { name: classMatch[1], kind: 'class', line: i }
    }
  }
  return null
}

/* ── Breadcrumb generation ─────────────────────────────── */

export function generateBreadcrumbs(content: string, cursorLine: number): BreadcrumbItem[] {
  const lines = content.split('\n')
  const breadcrumbs: BreadcrumbItem[] = []
  const stack: Array<{ name: string; kind: SymbolKind; startLine: number; braceDepth: number }> = []
  let braceDepth = 0

  for (let i = 0; i <= cursorLine && i < lines.length; i++) {
    const line = lines[i]

    // Track brace depth
    for (const ch of line) {
      if (ch === '{') braceDepth++
      if (ch === '}') {
        braceDepth--
        // Pop stack items that have ended
        while (stack.length > 0 && braceDepth <= stack[stack.length - 1].braceDepth) {
          stack.pop()
        }
      }
    }

    // Check for symbol definitions
    const funcMatch = line.match(/(?:(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:export\s+)?class\s+(\w+)|(?:export\s+)?interface\s+(\w+)|(?:export\s+)?enum\s+(\w+)|(?:export\s+)?type\s+(\w+)|(\w+)\s*(?:=|:)\s*(?:async\s+)?\([^)]*\)\s*=>)/)
    if (funcMatch) {
      const name = funcMatch[1] || funcMatch[2] || funcMatch[3] || funcMatch[4] || funcMatch[5] || funcMatch[6]
      if (name) {
        const kind = detectSymbolKind(line)
        stack.push({ name, kind, startLine: i, braceDepth: braceDepth - 1 })
      }
    }

    // Method detection inside class
    if (stack.length > 0) {
      const methodMatch = line.match(/^\s+(?:(?:public|private|protected|static|readonly|async|override)\s+)*(\w+)\s*(?:<[^>]*>)?\s*\(/)
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'return', 'new'].includes(methodMatch[1])) {
        if (i <= cursorLine) {
          stack.push({ name: methodMatch[1], kind: 'method', startLine: i, braceDepth: braceDepth - 1 })
        }
      }
    }
  }

  // Build breadcrumbs from stack
  for (const item of stack) {
    breadcrumbs.push({
      name: item.name,
      kind: item.kind,
      range: { startLine: item.startLine, endLine: cursorLine },
    })
  }

  return breadcrumbs
}

/* ── Type hierarchy ────────────────────────────────────── */

export function buildTypeHierarchy(
  files: Map<string, string>,
  typeName: string
): TypeHierarchyItem | null {
  const typeMap = new Map<string, { kind: 'class' | 'interface' | 'type'; location: Location; extends: string[]; implements: string[] }>()

  // First pass: collect all types
  for (const [filePath, content] of files) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/)
      if (classMatch) {
        typeMap.set(classMatch[1], {
          kind: 'class',
          location: { filePath, line: i, column: 0 },
          extends: classMatch[2] ? [classMatch[2]] : [],
          implements: classMatch[3] ? classMatch[3].split(',').map(s => s.trim()) : [],
        })
      }

      const ifaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?/)
      if (ifaceMatch) {
        typeMap.set(ifaceMatch[1], {
          kind: 'interface',
          location: { filePath, line: i, column: 0 },
          extends: ifaceMatch[2] ? ifaceMatch[2].split(',').map(s => s.trim()) : [],
          implements: [],
        })
      }
    }
  }

  const typeInfo = typeMap.get(typeName)
  if (!typeInfo) return null

  const buildItem = (name: string, depth: number): TypeHierarchyItem | null => {
    if (depth > 10) return null // Safety
    const info = typeMap.get(name)
    if (!info) return { name, kind: 'class', location: { filePath: '', line: 0, column: 0 }, parents: [], children: [] }

    const item: TypeHierarchyItem = {
      name,
      kind: info.kind,
      location: info.location,
      parents: [],
      children: [],
    }

    // Find parents
    for (const parentName of [...info.extends, ...info.implements]) {
      const parent = buildItem(parentName, depth + 1)
      if (parent) item.parents.push(parent)
    }

    // Find children (types that extend/implement this)
    for (const [childName, childInfo] of typeMap) {
      if (childName === name) continue
      if (childInfo.extends.includes(name) || childInfo.implements.includes(name)) {
        const child: TypeHierarchyItem = {
          name: childName,
          kind: childInfo.kind,
          location: childInfo.location,
          parents: [],
          children: [],
        }
        item.children.push(child)
      }
    }

    return item
  }

  return buildItem(typeName, 0)
}

/* ── Word at position ──────────────────────────────────── */

export function getWordAtPosition(content: string, line: number, column: number): string | null {
  const lines = content.split('\n')
  if (line >= lines.length) return null

  const lineText = lines[line]
  if (column >= lineText.length) return null

  // Find word boundaries
  const wordChars = /[\w$]/
  let start = column
  let end = column

  while (start > 0 && wordChars.test(lineText[start - 1])) start--
  while (end < lineText.length && wordChars.test(lineText[end])) end++

  if (start === end) return null
  return lineText.slice(start, end)
}

/* ── Go-to-definition heuristic ────────────────────────── */

export function findDefinition(
  files: Map<string, string>,
  symbol: string,
  sourceFile: string
): DefinitionResult[] {
  const results: DefinitionResult[] = []

  // Check imports in source file first
  const sourceContent = files.get(sourceFile)
  if (sourceContent) {
    const imports = parseImports(sourceContent, sourceFile)
    for (const imp of imports) {
      for (const spec of imp.specifiers) {
        if (spec.name === symbol || spec.alias === symbol) {
          // Resolve import source to find definition
          for (const [filePath, content] of files) {
            if (filePath.includes(imp.source) || filePath.endsWith(imp.source + '.ts') || filePath.endsWith(imp.source + '.tsx')) {
              const exports = parseExports(content, filePath)
              const exportLoc = exports.get(spec.isDefault ? 'default' : symbol)
              if (exportLoc) {
                const lines = content.split('\n')
                results.push({
                  symbol,
                  kind: detectSymbolKind(lines[exportLoc.line] || ''),
                  location: exportLoc,
                  preview: (lines[exportLoc.line] || '').trim(),
                  confidence: 'exact',
                })
              }
            }
          }
        }
      }
    }
  }

  // Search all files for definition patterns
  const defPatterns = [
    new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${escapeRegex(symbol)}\\b`),
    new RegExp(`(?:export\\s+)?class\\s+${escapeRegex(symbol)}\\b`),
    new RegExp(`(?:export\\s+)?interface\\s+${escapeRegex(symbol)}\\b`),
    new RegExp(`(?:export\\s+)?type\\s+${escapeRegex(symbol)}\\b`),
    new RegExp(`(?:export\\s+)?enum\\s+${escapeRegex(symbol)}\\b`),
    new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+${escapeRegex(symbol)}\\b`),
  ]

  for (const [filePath, content] of files) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of defPatterns) {
        if (pattern.test(lines[i])) {
          // Avoid duplicates
          if (!results.some(r => r.location.filePath === filePath && r.location.line === i)) {
            results.push({
              symbol,
              kind: detectSymbolKind(lines[i]),
              location: { filePath, line: i, column: lines[i].indexOf(symbol) },
              preview: lines[i].trim(),
              confidence: filePath === sourceFile ? 'probable' : 'guess',
            })
          }
        }
      }
    }
  }

  // Sort: exact first, then probable, then guess. Prefer same file.
  results.sort((a, b) => {
    const confOrder = { exact: 0, probable: 1, guess: 2 }
    const confDiff = confOrder[a.confidence] - confOrder[b.confidence]
    if (confDiff !== 0) return confDiff
    if (a.location.filePath === sourceFile && b.location.filePath !== sourceFile) return -1
    if (b.location.filePath === sourceFile && a.location.filePath !== sourceFile) return 1
    return 0
  })

  return results
}

/* ── Implementation finder ─────────────────────────────── */

export function findImplementations(
  files: Map<string, string>,
  interfaceName: string
): DefinitionResult[] {
  const results: DefinitionResult[] = []
  const implementsRegex = new RegExp(`(?:implements|extends)\\s+(?:[\\w,\\s]*\\b)?${escapeRegex(interfaceName)}\\b`)

  for (const [filePath, content] of files) {
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (implementsRegex.test(lines[i])) {
        const classMatch = lines[i].match(/class\s+(\w+)/)
        if (classMatch) {
          results.push({
            symbol: classMatch[1],
            kind: 'class',
            location: { filePath, line: i, column: lines[i].indexOf(classMatch[1]) },
            preview: lines[i].trim(),
            confidence: 'exact',
          })
        }
      }
    }
  }

  return results
}

/* ── Document symbols (outline) ────────────────────────── */

export function getDocumentSymbols(content: string, filePath: string): BreadcrumbItem[] {
  const lines = content.split('\n')
  const symbols: BreadcrumbItem[] = []
  const stack: Array<{ item: BreadcrumbItem; braceDepth: number }> = []
  let braceDepth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Count braces before checking for symbols
    for (const ch of line) {
      if (ch === '{') braceDepth++
      if (ch === '}') {
        braceDepth--
        while (stack.length > 0 && braceDepth <= stack[stack.length - 1].braceDepth) {
          const popped = stack.pop()!
          popped.item.range.endLine = i
        }
      }
    }

    // Check for top-level and nested symbols
    const matches: Array<{ name: string; kind: SymbolKind }> = []

    const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
    if (funcMatch) matches.push({ name: funcMatch[1], kind: 'function' })

    const classMatch = line.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/)
    if (classMatch) matches.push({ name: classMatch[1], kind: 'class' })

    const ifaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/)
    if (ifaceMatch) matches.push({ name: ifaceMatch[1], kind: 'interface' })

    const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/)
    if (enumMatch) matches.push({ name: enumMatch[1], kind: 'enum' })

    const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)/)
    if (typeMatch) matches.push({ name: typeMatch[1], kind: 'type-parameter' })

    const constMatch = line.match(/(?:export\s+)?const\s+(\w+)/)
    if (constMatch && !funcMatch) matches.push({ name: constMatch[1], kind: 'variable' })

    // Methods within classes
    if (stack.length > 0 && stack[stack.length - 1].item.kind === 'class') {
      const methodMatch = line.match(/^\s+(?:(?:public|private|protected|static|readonly|async|override|abstract)\s+)*(\w+)\s*(?:<[^>]*>)?\s*\(/)
      if (methodMatch && !['if', 'for', 'while', 'switch', 'catch', 'return', 'new', 'super', 'this'].includes(methodMatch[1])) {
        matches.push({ name: methodMatch[1], kind: 'method' })
      }
    }

    for (const m of matches) {
      const item: BreadcrumbItem = {
        name: m.name,
        kind: m.kind,
        range: { startLine: i, endLine: i },
        children: [],
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].item
        if (!parent.children) parent.children = []
        parent.children.push(item)
      } else {
        symbols.push(item)
      }

      if (m.kind === 'class' || m.kind === 'interface' || m.kind === 'enum' || m.kind === 'function') {
        stack.push({ item, braceDepth: braceDepth - 1 })
      }
    }
  }

  // Close remaining stack items
  while (stack.length > 0) {
    const popped = stack.pop()!
    popped.item.range.endLine = lines.length - 1
  }

  return symbols
}

/* ── Helpers ───────────────────────────────────────────── */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ── Navigation Manager ────────────────────────────────── */

export class NavigationManager {
  private index: NavigationIndex = {
    definitions: new Map(),
    references: new Map(),
    exports: new Map(),
    imports: new Map(),
  }
  private fileContents: Map<string, string> = new Map()
  private history: Location[] = []
  private historyIndex = -1
  private maxHistory = 100

  indexFile(filePath: string, content: string): void {
    this.fileContents.set(filePath, content)
    this.index.imports.set(filePath, parseImports(content, filePath))
    this.index.exports.set(filePath, parseExports(content, filePath))
  }

  removeFile(filePath: string): void {
    this.fileContents.delete(filePath)
    this.index.imports.delete(filePath)
    this.index.exports.delete(filePath)
  }

  goToDefinition(symbol: string, sourceFile: string): DefinitionResult[] {
    return findDefinition(this.fileContents, symbol, sourceFile)
  }

  findReferences(symbol: string): ReferenceResult[] {
    const results: ReferenceResult[] = []
    for (const [filePath, content] of this.fileContents) {
      results.push(...findReferencesInContent(content, filePath, symbol))
    }
    return results
  }

  findImplementationsOf(interfaceName: string): DefinitionResult[] {
    return findImplementations(this.fileContents, interfaceName)
  }

  getCallHierarchy(symbol: string) {
    return buildCallHierarchy(this.fileContents, symbol)
  }

  getTypeHierarchy(typeName: string) {
    return buildTypeHierarchy(this.fileContents, typeName)
  }

  getBreadcrumbs(filePath: string, line: number): BreadcrumbItem[] {
    const content = this.fileContents.get(filePath)
    if (!content) return []
    return generateBreadcrumbs(content, line)
  }

  getDocumentSymbols(filePath: string): BreadcrumbItem[] {
    const content = this.fileContents.get(filePath)
    if (!content) return []
    return getDocumentSymbols(content, filePath)
  }

  // Navigation history
  pushLocation(location: Location): void {
    // Trim forward history if navigating from middle
    if (this.historyIndex < this.history.length - 1) {
      this.history.splice(this.historyIndex + 1)
    }
    this.history.push(location)
    this.historyIndex = this.history.length - 1

    if (this.history.length > this.maxHistory) {
      this.history.shift()
      this.historyIndex--
    }
  }

  goBack(): Location | null {
    if (this.historyIndex <= 0) return null
    this.historyIndex--
    return this.history[this.historyIndex]
  }

  goForward(): Location | null {
    if (this.historyIndex >= this.history.length - 1) return null
    this.historyIndex++
    return this.history[this.historyIndex]
  }

  canGoBack(): boolean { return this.historyIndex > 0 }
  canGoForward(): boolean { return this.historyIndex < this.history.length - 1 }

  getStats() {
    return {
      indexedFiles: this.fileContents.size,
      totalExports: Array.from(this.index.exports.values()).reduce((s, m) => s + m.size, 0),
      totalImports: Array.from(this.index.imports.values()).reduce((s, arr) => s + arr.length, 0),
      historyLength: this.history.length,
    }
  }

  clear(): void {
    this.fileContents.clear()
    this.index = { definitions: new Map(), references: new Map(), exports: new Map(), imports: new Map() }
    this.history = []
    this.historyIndex = -1
  }
}

/* ── Singleton ─────────────────────────────────────────── */

let _instance: NavigationManager | null = null

export function getNavigationManager(): NavigationManager {
  if (!_instance) _instance = new NavigationManager()
  return _instance
}

export function resetNavigationManager(): void {
  _instance?.clear()
  _instance = null
}
