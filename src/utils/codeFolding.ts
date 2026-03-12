/**
 * Code folding engine.
 * Provides intelligent code folding ranges for multiple languages
 * with indent-based, syntax-based, and region-based folding.
 */

/* ── Types ─────────────────────────────────────────────── */

export type FoldingRangeKind = 'comment' | 'imports' | 'region' | 'block' | 'function' | 'class' | 'conditional' | 'array' | 'object' | 'string' | 'template'

export interface FoldingRange {
  startLine: number
  endLine: number
  kind: FoldingRangeKind
  collapsed: boolean
  label?: string
  isManual?: boolean
}

export interface FoldingState {
  ranges: FoldingRange[]
  collapsedLines: Set<number>
}

export interface FoldingOptions {
  maxFoldingRegions: number
  foldImports: boolean
  foldComments: boolean
  minFoldLines: number
  showFoldingControls: 'always' | 'mouseover'
}

/* ── Default Options ──────────────────────────────────── */

const DEFAULT_OPTIONS: FoldingOptions = {
  maxFoldingRegions: 5000,
  foldImports: true,
  foldComments: true,
  minFoldLines: 1,
  showFoldingControls: 'mouseover',
}

/* ── Folding Range Providers ──────────────────────────── */

type FoldingProvider = (lines: string[], language: string) => FoldingRange[]

const providers: Map<string, FoldingProvider[]> = new Map()

export function registerFoldingProvider(languages: string[], provider: FoldingProvider): () => void {
  for (const lang of languages) {
    if (!providers.has(lang)) providers.set(lang, [])
    providers.get(lang)!.push(provider)
  }
  return () => {
    for (const lang of languages) {
      const list = providers.get(lang)
      if (list) {
        const idx = list.indexOf(provider)
        if (idx >= 0) list.splice(idx, 1)
      }
    }
  }
}

/* ── Main API ─────────────────────────────────────────── */

export function computeFoldingRanges(
  content: string,
  language: string,
  options: Partial<FoldingOptions> = {}
): FoldingRange[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const lines = content.split('\n')
  const ranges: FoldingRange[] = []

  // Indent-based folding (universal fallback)
  ranges.push(...computeIndentFolding(lines, opts))

  // Syntax-based folding
  ranges.push(...computeSyntaxFolding(lines, language, opts))

  // Region markers
  ranges.push(...computeRegionFolding(lines, language))

  // Comment blocks
  if (opts.foldComments) {
    ranges.push(...computeCommentFolding(lines, language))
  }

  // Import blocks
  if (opts.foldImports) {
    ranges.push(...computeImportFolding(lines, language))
  }

  // Custom providers
  const customProviders = providers.get(language) || providers.get('*') || []
  for (const provider of customProviders) {
    ranges.push(...provider(lines, language))
  }

  // Deduplicate and limit
  const deduped = deduplicateRanges(ranges)
  return deduped
    .filter(r => r.endLine - r.startLine >= opts.minFoldLines)
    .slice(0, opts.maxFoldingRegions)
    .sort((a, b) => a.startLine - b.startLine)
}

/* ── Indent-based Folding ─────────────────────────────── */

function computeIndentFolding(lines: string[], options: FoldingOptions): FoldingRange[] {
  const ranges: FoldingRange[] = []
  const indentStack: { indent: number; line: number }[] = []

  function getIndent(line: string): number {
    const match = line.match(/^(\s*)/)
    if (!match) return 0
    const ws = match[1]
    let indent = 0
    for (const ch of ws) {
      indent += ch === '\t' ? 4 : 1
    }
    return indent
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue

    const indent = getIndent(line)

    // Pop items with greater or equal indent
    while (indentStack.length > 0 && indentStack[indentStack.length - 1].indent >= indent) {
      const item = indentStack.pop()!
      if (i - item.line > options.minFoldLines) {
        ranges.push({
          startLine: item.line,
          endLine: i - 1,
          kind: 'block',
          collapsed: false,
        })
      }
    }

    indentStack.push({ indent, line: i })
  }

  // Close remaining
  for (const item of indentStack) {
    if (lines.length - 1 - item.line > options.minFoldLines) {
      ranges.push({
        startLine: item.line,
        endLine: lines.length - 1,
        kind: 'block',
        collapsed: false,
      })
    }
  }

  return ranges
}

/* ── Syntax-based Folding ─────────────────────────────── */

function computeSyntaxFolding(lines: string[], language: string, options: FoldingOptions): FoldingRange[] {
  const ranges: FoldingRange[] = []

  // Brace-based languages
  const braceLanguages = new Set([
    'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
    'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin',
    'dart', 'scala', 'php', 'css', 'scss', 'less', 'json', 'jsonc',
  ])

  if (braceLanguages.has(language)) {
    ranges.push(...computeBraceFolding(lines, options))
  }

  // Python: colon-based blocks
  if (language === 'python') {
    ranges.push(...computePythonFolding(lines, options))
  }

  // HTML/XML: tag-based
  if (['html', 'xml', 'svg', 'vue', 'svelte', 'astro'].includes(language)) {
    ranges.push(...computeTagFolding(lines, options))
  }

  // Markdown: heading-based
  if (['markdown', 'mdx'].includes(language)) {
    ranges.push(...computeMarkdownFolding(lines))
  }

  // YAML: indent-based with key awareness
  if (language === 'yaml') {
    ranges.push(...computeYamlFolding(lines, options))
  }

  return ranges
}

/* ── Brace Folding ────────────────────────────────────── */

function computeBraceFolding(lines: string[], options: FoldingOptions): FoldingRange[] {
  const ranges: FoldingRange[] = []
  const braceStack: { char: string; line: number }[] = []
  const bracketStack: { char: string; line: number }[] = []
  const parenStack: { char: string; line: number }[] = []
  let inString = false
  let stringChar = ''
  let inTemplateString = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    inLineComment = false

    for (let j = 0; j < line.length; j++) {
      const ch = line[j]
      const next = line[j + 1]

      // Skip if in block comment
      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false
          j++
        }
        continue
      }

      // Line comment
      if (!inString && !inTemplateString && ch === '/' && next === '/') {
        inLineComment = true
        break
      }

      // Block comment start
      if (!inString && !inTemplateString && ch === '/' && next === '*') {
        inBlockComment = true
        j++
        continue
      }

      // String handling
      if (!inLineComment && !inBlockComment) {
        if (ch === '`') {
          inTemplateString = !inTemplateString
          continue
        }
        if (!inTemplateString && (ch === '"' || ch === "'")) {
          if (inString && ch === stringChar) {
            inString = false
          } else if (!inString) {
            inString = true
            stringChar = ch
          }
          continue
        }
      }

      if (inString || inTemplateString || inLineComment) continue

      // Brace matching
      if (ch === '{') braceStack.push({ char: '{', line: i })
      else if (ch === '}' && braceStack.length > 0) {
        const open = braceStack.pop()!
        if (i - open.line >= options.minFoldLines) {
          ranges.push({ startLine: open.line, endLine: i, kind: 'block', collapsed: false })
        }
      }

      if (ch === '[') bracketStack.push({ char: '[', line: i })
      else if (ch === ']' && bracketStack.length > 0) {
        const open = bracketStack.pop()!
        if (i - open.line >= options.minFoldLines) {
          ranges.push({ startLine: open.line, endLine: i, kind: 'array', collapsed: false })
        }
      }

      if (ch === '(') parenStack.push({ char: '(', line: i })
      else if (ch === ')' && parenStack.length > 0) {
        const open = parenStack.pop()!
        if (i - open.line >= options.minFoldLines + 1) {
          ranges.push({ startLine: open.line, endLine: i, kind: 'block', collapsed: false })
        }
      }
    }
  }

  return ranges
}

/* ── Python Folding ───────────────────────────────────── */

function computePythonFolding(lines: string[], options: FoldingOptions): FoldingRange[] {
  const ranges: FoldingRange[] = []
  const blockPatterns = /^\s*(def |class |if |elif |else:|for |while |with |try:|except |finally:|async def |async for |async with )/

  for (let i = 0; i < lines.length; i++) {
    if (blockPatterns.test(lines[i]) && lines[i].trimEnd().endsWith(':')) {
      // Find end of block by indentation
      const baseIndent = getLineIndent(lines[i])
      let endLine = i

      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j]
        if (line.trim() === '') continue
        if (getLineIndent(line) <= baseIndent) break
        endLine = j
      }

      if (endLine - i >= options.minFoldLines) {
        const kind = lines[i].trim().startsWith('class ') ? 'class' as FoldingRangeKind
          : lines[i].trim().startsWith('def ') || lines[i].trim().startsWith('async def ')
            ? 'function' as FoldingRangeKind
            : 'conditional' as FoldingRangeKind

        ranges.push({ startLine: i, endLine, kind, collapsed: false })
      }
    }
  }

  return ranges
}

/* ── Tag Folding (HTML/XML) ───────────────────────────── */

function computeTagFolding(lines: string[], options: FoldingOptions): FoldingRange[] {
  const ranges: FoldingRange[] = []
  const tagStack: { tag: string; line: number }[] = []
  const selfClosingTags = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ])

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Opening tags
    const openMatch = line.match(/<(\w[\w-]*)[^>]*(?<!\/)\s*>/)
    if (openMatch) {
      const tag = openMatch[1].toLowerCase()
      if (!selfClosingTags.has(tag)) {
        tagStack.push({ tag, line: i })
      }
    }

    // Closing tags
    const closeMatch = line.match(/<\/(\w[\w-]*)\s*>/)
    if (closeMatch) {
      const tag = closeMatch[1].toLowerCase()
      // Find matching open tag
      for (let j = tagStack.length - 1; j >= 0; j--) {
        if (tagStack[j].tag === tag) {
          const open = tagStack.splice(j, 1)[0]
          if (i - open.line >= options.minFoldLines) {
            ranges.push({ startLine: open.line, endLine: i, kind: 'block', collapsed: false })
          }
          break
        }
      }
    }
  }

  return ranges
}

/* ── Markdown Folding ─────────────────────────────────── */

function computeMarkdownFolding(lines: string[]): FoldingRange[] {
  const ranges: FoldingRange[] = []
  const headingStack: { level: number; line: number }[] = []

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s/)
    if (match) {
      const level = match[1].length

      // Close headings of same or higher level
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        const h = headingStack.pop()!
        ranges.push({ startLine: h.line, endLine: i - 1, kind: 'block', collapsed: false })
      }

      headingStack.push({ level, line: i })
    }
  }

  // Close remaining headings
  for (const h of headingStack) {
    ranges.push({ startLine: h.line, endLine: lines.length - 1, kind: 'block', collapsed: false })
  }

  // Fenced code blocks
  let codeStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('```')) {
      if (codeStart === -1) {
        codeStart = i
      } else {
        ranges.push({ startLine: codeStart, endLine: i, kind: 'block', collapsed: false })
        codeStart = -1
      }
    }
  }

  return ranges
}

/* ── YAML Folding ─────────────────────────────────────── */

function computeYamlFolding(lines: string[], options: FoldingOptions): FoldingRange[] {
  const ranges: FoldingRange[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trim().startsWith('#')) continue

    const currentIndent = getLineIndent(line)

    // Check if next non-empty line is indented more
    let nextContentLine = -1
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() !== '' && !lines[j].trim().startsWith('#')) {
        nextContentLine = j
        break
      }
    }

    if (nextContentLine !== -1 && getLineIndent(lines[nextContentLine]) > currentIndent) {
      // Find end of block
      let endLine = nextContentLine
      for (let j = nextContentLine + 1; j < lines.length; j++) {
        if (lines[j].trim() === '' || lines[j].trim().startsWith('#')) continue
        if (getLineIndent(lines[j]) <= currentIndent) break
        endLine = j
      }

      if (endLine - i >= options.minFoldLines) {
        ranges.push({ startLine: i, endLine, kind: 'block', collapsed: false })
      }
    }
  }

  return ranges
}

/* ── Region Folding ───────────────────────────────────── */

function computeRegionFolding(lines: string[], language: string): FoldingRange[] {
  const ranges: FoldingRange[] = []

  // Language-specific region markers
  const regionPatterns: Record<string, { start: RegExp; end: RegExp }> = {
    default: {
      start: /^\s*\/\/\s*#?region\b(.*)$/i,
      end: /^\s*\/\/\s*#?endregion\b/i,
    },
    python: {
      start: /^\s*#\s*region\b(.*)$/i,
      end: /^\s*#\s*endregion\b/i,
    },
    html: {
      start: /^\s*<!--\s*#?region\b(.*)-->$/i,
      end: /^\s*<!--\s*#?endregion\b.*-->$/i,
    },
    css: {
      start: /^\s*\/\*\s*#?region\b(.*)\*\/$/i,
      end: /^\s*\/\*\s*#?endregion\b.*\*\/$/i,
    },
    lua: {
      start: /^\s*--\s*#?region\b(.*)$/i,
      end: /^\s*--\s*#?endregion\b/i,
    },
    ruby: {
      start: /^\s*#\s*region\b(.*)$/i,
      end: /^\s*#\s*endregion\b/i,
    },
  }

  const patterns = regionPatterns[language] || regionPatterns.default
  const regionStack: { line: number; label: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const startMatch = lines[i].match(patterns.start)
    if (startMatch) {
      regionStack.push({ line: i, label: startMatch[1]?.trim() || '' })
      continue
    }

    if (patterns.end.test(lines[i]) && regionStack.length > 0) {
      const region = regionStack.pop()!
      ranges.push({
        startLine: region.line,
        endLine: i,
        kind: 'region',
        collapsed: false,
        label: region.label || undefined,
        isManual: true,
      })
    }
  }

  return ranges
}

/* ── Comment Folding ──────────────────────────────────── */

function computeCommentFolding(lines: string[], language: string): FoldingRange[] {
  const ranges: FoldingRange[] = []

  // Block comments
  const blockCommentLangs = new Set([
    'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
    'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'swift', 'kotlin',
    'css', 'scss', 'less', 'php', 'scala', 'dart',
  ])

  if (blockCommentLangs.has(language)) {
    let commentStart = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('/*') && commentStart === -1) {
        commentStart = i
      }
      if (lines[i].includes('*/') && commentStart !== -1) {
        if (i > commentStart) {
          ranges.push({ startLine: commentStart, endLine: i, kind: 'comment', collapsed: false })
        }
        commentStart = -1
      }
    }
  }

  // Consecutive line comments
  const lineCommentChar = getLineCommentChar(language)
  if (lineCommentChar) {
    let blockStart = -1
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed.startsWith(lineCommentChar) && !trimmed.startsWith(lineCommentChar + ' region') && !trimmed.startsWith(lineCommentChar + ' endregion')) {
        if (blockStart === -1) blockStart = i
      } else {
        if (blockStart !== -1 && i - blockStart > 1) {
          ranges.push({ startLine: blockStart, endLine: i - 1, kind: 'comment', collapsed: false })
        }
        blockStart = -1
      }
    }
    if (blockStart !== -1 && lines.length - blockStart > 1) {
      ranges.push({ startLine: blockStart, endLine: lines.length - 1, kind: 'comment', collapsed: false })
    }
  }

  return ranges
}

/* ── Import Folding ───────────────────────────────────── */

function computeImportFolding(lines: string[], language: string): FoldingRange[] {
  const ranges: FoldingRange[] = []
  const importPatterns: Record<string, RegExp> = {
    typescript: /^\s*import\s/,
    typescriptreact: /^\s*import\s/,
    javascript: /^\s*import\s/,
    javascriptreact: /^\s*import\s/,
    python: /^\s*(import\s|from\s)/,
    java: /^\s*import\s/,
    go: /^\s*import\s/,
    rust: /^\s*use\s/,
    csharp: /^\s*using\s/,
    dart: /^\s*import\s/,
    kotlin: /^\s*import\s/,
    swift: /^\s*import\s/,
    scala: /^\s*import\s/,
    php: /^\s*(use|require|include)\s/,
  }

  const pattern = importPatterns[language]
  if (!pattern) return ranges

  let importStart = -1
  let importEnd = -1

  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) {
      if (importStart === -1) importStart = i
      importEnd = i
    } else if (importStart !== -1 && lines[i].trim() !== '') {
      // Non-import, non-empty line: end of import block
      if (importEnd - importStart > 0) {
        ranges.push({
          startLine: importStart,
          endLine: importEnd,
          kind: 'imports',
          collapsed: false,
          label: `${importEnd - importStart + 1} imports`,
        })
      }
      importStart = -1
      importEnd = -1
    }
  }

  // Handle trailing imports
  if (importStart !== -1 && importEnd - importStart > 0) {
    ranges.push({
      startLine: importStart,
      endLine: importEnd,
      kind: 'imports',
      collapsed: false,
      label: `${importEnd - importStart + 1} imports`,
    })
  }

  return ranges
}

/* ── Helpers ──────────────────────────────────────────── */

function getLineIndent(line: string): number {
  const match = line.match(/^(\s*)/)
  if (!match) return 0
  let indent = 0
  for (const ch of match[1]) {
    indent += ch === '\t' ? 4 : 1
  }
  return indent
}

function getLineCommentChar(language: string): string | null {
  const map: Record<string, string> = {
    typescript: '//',
    typescriptreact: '//',
    javascript: '//',
    javascriptreact: '//',
    java: '//',
    c: '//',
    cpp: '//',
    csharp: '//',
    go: '//',
    rust: '//',
    swift: '//',
    kotlin: '//',
    dart: '//',
    scala: '//',
    python: '#',
    ruby: '#',
    shell: '#',
    bash: '#',
    yaml: '#',
    toml: '#',
    perl: '#',
    r: '#',
    lua: '--',
    haskell: '--',
    elm: '--',
    sql: '--',
  }
  return map[language] || null
}

function deduplicateRanges(ranges: FoldingRange[]): FoldingRange[] {
  const seen = new Set<string>()
  return ranges.filter(r => {
    const key = `${r.startLine}-${r.endLine}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/* ── Folding State Manager ────────────────────────────── */

export class FoldingStateManager {
  private states: Map<string, FoldingState> = new Map()

  getState(filePath: string): FoldingState | undefined {
    return this.states.get(filePath)
  }

  setState(filePath: string, state: FoldingState): void {
    this.states.set(filePath, state)
  }

  toggleFold(filePath: string, line: number): boolean {
    const state = this.states.get(filePath)
    if (!state) return false

    const range = state.ranges.find(r => r.startLine === line)
    if (!range) return false

    range.collapsed = !range.collapsed

    if (range.collapsed) {
      state.collapsedLines.add(line)
    } else {
      state.collapsedLines.delete(line)
    }

    return range.collapsed
  }

  foldAll(filePath: string): void {
    const state = this.states.get(filePath)
    if (!state) return
    for (const range of state.ranges) {
      range.collapsed = true
      state.collapsedLines.add(range.startLine)
    }
  }

  unfoldAll(filePath: string): void {
    const state = this.states.get(filePath)
    if (!state) return
    for (const range of state.ranges) {
      range.collapsed = false
    }
    state.collapsedLines.clear()
  }

  foldLevel(filePath: string, level: number, lines: string[]): void {
    const state = this.states.get(filePath)
    if (!state) return

    for (const range of state.ranges) {
      const indent = getLineIndent(lines[range.startLine] || '')
      range.collapsed = Math.floor(indent / 4) >= level
      if (range.collapsed) {
        state.collapsedLines.add(range.startLine)
      } else {
        state.collapsedLines.delete(range.startLine)
      }
    }
  }

  foldByKind(filePath: string, kind: FoldingRangeKind, collapse: boolean): void {
    const state = this.states.get(filePath)
    if (!state) return
    for (const range of state.ranges) {
      if (range.kind === kind) {
        range.collapsed = collapse
        if (collapse) {
          state.collapsedLines.add(range.startLine)
        } else {
          state.collapsedLines.delete(range.startLine)
        }
      }
    }
  }

  isLineVisible(filePath: string, line: number): boolean {
    const state = this.states.get(filePath)
    if (!state) return true

    for (const range of state.ranges) {
      if (range.collapsed && line > range.startLine && line <= range.endLine) {
        return false
      }
    }
    return true
  }

  getVisibleLineCount(filePath: string, totalLines: number): number {
    const state = this.states.get(filePath)
    if (!state) return totalLines

    let hiddenLines = 0
    for (const range of state.ranges) {
      if (range.collapsed) {
        hiddenLines += range.endLine - range.startLine
      }
    }
    return totalLines - hiddenLines
  }

  clear(filePath?: string): void {
    if (filePath) {
      this.states.delete(filePath)
    } else {
      this.states.clear()
    }
  }
}

export const foldingManager = new FoldingStateManager()
