import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  memo,
  type CSSProperties,
} from 'react'
import {
  ArrowUp,
  ArrowDown,
  Columns,
  Rows2,
  Copy,
  ChevronRight,
  Plus,
  MessageSquare,
  Check,
  X,
  GitMerge,
  ChevronsUpDown,
} from 'lucide-react'

/* ══════════════════════════════════════════════════════════
   CSS Variable Documentation
   ══════════════════════════════════════════════════════════

   The following CSS custom properties are consumed by DiffViewer.
   Set them on a parent element or :root for full theme control.

   --diff-added-bg             Background for added lines            (default: rgba(35,134,54,0.15))
   --diff-removed-bg           Background for removed lines          (default: rgba(218,54,51,0.15))
   --diff-modified-bg          Background for modified lines         (default: rgba(227,179,65,0.25))
   --diff-added-char-bg        Char-level added highlight            (default: rgba(63,185,80,0.4))
   --diff-removed-char-bg      Char-level removed highlight          (default: rgba(248,81,73,0.4))
   --diff-added-border         Gutter color for added lines          (default: #3fb950)
   --diff-removed-border       Gutter color for removed lines        (default: #f85149)
   --diff-modified-border      Gutter color for modified lines       (default: #e3b341)
   --diff-line-number          Line number text color                (default: rgba(255,255,255,0.3))
   --diff-minimap-added        Minimap marker for additions          (default: #3fb950)
   --diff-minimap-removed      Minimap marker for removals           (default: #f85149)
   --diff-minimap-modified     Minimap marker for modifications      (default: #e3b341)
   --diff-minimap-bg           Minimap background                    (default: rgba(255,255,255,0.03))
   --diff-minimap-viewport     Minimap viewport indicator            (default: rgba(88,166,255,0.2))
   --diff-syntax-keyword       Syntax: keywords                      (default: #569cd6)
   --diff-syntax-string        Syntax: strings                       (default: #ce9178)
   --diff-syntax-comment       Syntax: comments                      (default: #6a9955)
   --diff-syntax-number        Syntax: numbers                       (default: #b5cea8)
   --diff-syntax-punctuation   Syntax: punctuation                   (default: #d4d4d4)
   --diff-conflict-base-bg     Merge conflict: base background       (default: rgba(88,166,255,0.12))
   --diff-conflict-ours-bg     Merge conflict: ours background       (default: rgba(63,185,80,0.12))
   --diff-conflict-theirs-bg   Merge conflict: theirs background     (default: rgba(248,81,73,0.12))

   ══════════════════════════════════════════════════════════ */

/* ── Types ──────────────────────────────────────────────── */

export type DiffViewMode = 'split' | 'inline'

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'modified'

export type MergeSide = 'base' | 'ours' | 'theirs'

export interface DiffLine {
  type: DiffLineType
  content: string
  oldLineNo?: number
  newLineNo?: number
  /** For modified lines: the content from the new/right side */
  pairedContent?: string
  /** Character-level diff segments for old side */
  charSegments?: CharSegment[]
  /** Character-level diff segments for new side */
  pairedCharSegments?: CharSegment[]
}

export interface CharSegment {
  text: string
  highlight: boolean
}

export interface DiffHunk {
  id: string
  startIndex: number
  endIndex: number
  oldStart: number
  newStart: number
  oldCount: number
  newCount: number
  lines: DiffLine[]
}

export interface CollapsedRegion {
  startIndex: number
  endIndex: number
  lineCount: number
  expanded: boolean
}

export interface ReviewComment {
  id: string
  lineNumber: number
  side: 'old' | 'new'
  content: string
  author?: string
  timestamp?: number
}

export interface ThreeWayInput {
  base: string
  ours: string
  theirs: string
}

export interface DiffViewerProps {
  /** Original (left / old) content */
  originalContent: string
  /** Modified (right / new) content */
  modifiedContent: string
  /** Original file path / name shown in header */
  originalPath: string
  /** Modified file path / name shown in header */
  modifiedPath: string
  /** Language for syntax highlighting (default: typescript) */
  language?: string
  /** Initial view mode: split or inline (default: split) */
  initialMode?: DiffViewMode
  /** Called when the viewer is closed */
  onClose?: () => void
  /** Called when a hunk is staged */
  onStageHunk?: (hunkIndex: number, hunk: DiffHunk) => void
  /** Called when a hunk is unstaged */
  onUnstageHunk?: (hunkIndex: number, hunk: DiffHunk) => void
  /** Called when a review comment is added */
  onAddComment?: (lineNumber: number, side: 'old' | 'new', content: string) => void
  /** Existing review comments to display inline */
  comments?: ReviewComment[]
  /** Three-way merge input; if provided, enables merge mode */
  threeWay?: ThreeWayInput
  /** If true, hides stage/unstage hunk buttons */
  readOnly?: boolean
  /** Number of context lines around changes before collapsing (default: 3) */
  contextLines?: number
  /** Height of each row in pixels for virtual scrolling (default: 20) */
  rowHeight?: number
}

/* ── Constants ──────────────────────────────────────────── */

const DEFAULT_CONTEXT = 3
const DEFAULT_ROW_HEIGHT = 20
const VIRTUAL_OVERSCAN = 15
const COLLAPSE_THRESHOLD = 8
const MINIMAP_WIDTH = 48
const LINE_NUM_WIDTH = 50
const GUTTER_WIDTH = 4
const MONO_FONT = "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace"

/* ── Utility helpers ────────────────────────────────────── */

/** Extract file name from a path */
function baseName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path
}

/* ══════════════════════════════════════════════════════════
   Diff Computation (LCS-based)
   ══════════════════════════════════════════════════════════ */

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  return dp
}

function computeDiffLines(original: string, modified: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = modified.split('\n')
  const dp = lcsTable(oldLines, newLines)

  const result: DiffLine[] = []
  let i = oldLines.length
  let j = newLines.length

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNo: i,
        newLineNo: j,
      })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', content: newLines[j - 1], newLineNo: j })
      j--
    } else {
      result.push({ type: 'removed', content: oldLines[i - 1], oldLineNo: i })
      i--
    }
  }

  result.reverse()
  return pairModifiedLines(result)
}

/**
 * Detect adjacent removed+added line pairs and merge them
 * into a single "modified" line with character-level diff data.
 */
function pairModifiedLines(lines: DiffLine[]): DiffLine[] {
  const output: DiffLine[] = []
  let idx = 0

  while (idx < lines.length) {
    if (
      idx + 1 < lines.length &&
      lines[idx].type === 'removed' &&
      lines[idx + 1].type === 'added'
    ) {
      const removed = lines[idx]
      const added = lines[idx + 1]
      const cd = computeCharDiff(removed.content, added.content)

      output.push({
        type: 'modified',
        content: removed.content,
        oldLineNo: removed.oldLineNo,
        pairedContent: added.content,
        newLineNo: added.newLineNo,
        charSegments: cd.oldSegments,
        pairedCharSegments: cd.newSegments,
      })
      idx += 2
    } else {
      output.push(lines[idx])
      idx++
    }
  }

  return output
}

/* ── Character-level diff ───────────────────────────────── */

function computeCharDiff(
  oldStr: string,
  newStr: string,
): { oldSegments: CharSegment[]; newSegments: CharSegment[] } {
  const oldChars = Array.from(oldStr)
  const newChars = Array.from(newStr)
  const m = oldChars.length
  const n = newChars.length

  // For very long lines, skip detailed char diff
  if (m * n > 250_000) {
    return {
      oldSegments: [{ text: oldStr, highlight: true }],
      newSegments: [{ text: newStr, highlight: true }],
    }
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldChars[i - 1] === newChars[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack: mark characters not in LCS as "changed"
  const oldFlags = new Array(m).fill(false)
  const newFlags = new Array(n).fill(false)
  let ci = m
  let cj = n

  while (ci > 0 && cj > 0) {
    if (oldChars[ci - 1] === newChars[cj - 1]) {
      ci--
      cj--
    } else if (dp[ci - 1][cj] >= dp[ci][cj - 1]) {
      oldFlags[ci - 1] = true
      ci--
    } else {
      newFlags[cj - 1] = true
      cj--
    }
  }
  while (ci > 0) { oldFlags[ci - 1] = true; ci-- }
  while (cj > 0) { newFlags[cj - 1] = true; cj-- }

  return {
    oldSegments: buildSegments(oldChars, oldFlags),
    newSegments: buildSegments(newChars, newFlags),
  }
}

function buildSegments(chars: string[], flags: boolean[]): CharSegment[] {
  if (chars.length === 0) return [{ text: '', highlight: false }]

  const segments: CharSegment[] = []
  let current = { text: chars[0], highlight: flags[0] }

  for (let i = 1; i < chars.length; i++) {
    if (flags[i] === current.highlight) {
      current.text += chars[i]
    } else {
      segments.push(current)
      current = { text: chars[i], highlight: flags[i] }
    }
  }

  segments.push(current)
  return segments
}

/* ══════════════════════════════════════════════════════════
   Hunk Extraction
   ══════════════════════════════════════════════════════════ */

function extractHunks(lines: DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let hunkStart = -1
  let hunkId = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'unchanged') {
      if (hunkStart === -1) hunkStart = i
    } else if (hunkStart !== -1) {
      hunks.push(buildHunk(lines, hunkStart, i, hunkId++))
      hunkStart = -1
    }
  }

  if (hunkStart !== -1) {
    hunks.push(buildHunk(lines, hunkStart, lines.length, hunkId++))
  }

  return hunks
}

function buildHunk(lines: DiffLine[], start: number, end: number, id: number): DiffHunk {
  const slice = lines.slice(start, end)
  let oldCount = 0
  let newCount = 0

  for (const l of slice) {
    if (l.type === 'removed' || l.type === 'modified') oldCount++
    if (l.type === 'added' || l.type === 'modified') newCount++
    if (l.type === 'unchanged') { oldCount++; newCount++ }
  }

  return {
    id: `hunk-${id}`,
    startIndex: start,
    endIndex: end,
    oldStart: slice.find((l) => l.oldLineNo != null)?.oldLineNo ?? 0,
    newStart: slice.find((l) => l.newLineNo != null)?.newLineNo ?? 0,
    oldCount,
    newCount,
    lines: slice,
  }
}

/* ══════════════════════════════════════════════════════════
   Collapsed Region Computation
   ══════════════════════════════════════════════════════════ */

function computeCollapsedRegions(
  lines: DiffLine[],
  contextLines: number,
): CollapsedRegion[] {
  const regions: CollapsedRegion[] = []
  const changePositions: number[] = []

  lines.forEach((l, i) => {
    if (l.type !== 'unchanged') changePositions.push(i)
  })

  // If no changes, collapse everything if large enough
  if (changePositions.length === 0) {
    if (lines.length > COLLAPSE_THRESHOLD) {
      regions.push({
        startIndex: 0,
        endIndex: lines.length,
        lineCount: lines.length,
        expanded: false,
      })
    }
    return regions
  }

  // Region before first change
  const firstChange = changePositions[0]
  if (firstChange > contextLines + COLLAPSE_THRESHOLD) {
    regions.push({
      startIndex: 0,
      endIndex: firstChange - contextLines,
      lineCount: firstChange - contextLines,
      expanded: false,
    })
  }

  // Regions between changes
  for (let c = 0; c < changePositions.length - 1; c++) {
    let changeEnd = changePositions[c] + 1
    while (changeEnd < lines.length && lines[changeEnd].type !== 'unchanged') {
      changeEnd++
    }
    const gapStart = changeEnd + contextLines
    const gapEnd = changePositions[c + 1] - contextLines

    if (gapEnd - gapStart >= COLLAPSE_THRESHOLD) {
      regions.push({
        startIndex: gapStart,
        endIndex: gapEnd,
        lineCount: gapEnd - gapStart,
        expanded: false,
      })
    }
  }

  // Region after last change
  const lastChange = changePositions[changePositions.length - 1]
  let lastEnd = lastChange + 1
  while (lastEnd < lines.length && lines[lastEnd].type !== 'unchanged') lastEnd++
  const afterStart = lastEnd + contextLines

  if (lines.length - afterStart >= COLLAPSE_THRESHOLD) {
    regions.push({
      startIndex: afterStart,
      endIndex: lines.length,
      lineCount: lines.length - afterStart,
      expanded: false,
    })
  }

  return regions
}

/* ══════════════════════════════════════════════════════════
   Syntax Tokenizer (lightweight, no external deps)
   ══════════════════════════════════════════════════════════ */

interface SyntaxToken {
  text: string
  type: 'keyword' | 'string' | 'comment' | 'number' | 'punctuation' | 'plain'
}

const KEYWORD_SETS: Record<string, Set<string>> = {
  typescript: new Set([
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'class', 'extends', 'implements', 'interface', 'type', 'enum', 'namespace',
    'new', 'this', 'super', 'null', 'undefined', 'true', 'false', 'void',
    'typeof', 'instanceof', 'in', 'of', 'as', 'is', 'keyof', 'readonly',
    'async', 'await', 'yield', 'try', 'catch', 'finally', 'throw',
    'default', 'static', 'abstract', 'declare', 'private', 'protected', 'public',
  ]),
  javascript: new Set([
    'import', 'export', 'from', 'const', 'let', 'var', 'function', 'return',
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue',
    'class', 'extends', 'new', 'this', 'super', 'null', 'undefined', 'true', 'false',
    'typeof', 'instanceof', 'in', 'of', 'async', 'await', 'yield',
    'try', 'catch', 'finally', 'throw', 'default', 'static', 'void',
  ]),
  python: new Set([
    'import', 'from', 'def', 'class', 'return', 'if', 'elif', 'else',
    'for', 'while', 'break', 'continue', 'pass', 'raise', 'try', 'except',
    'finally', 'with', 'as', 'lambda', 'yield', 'global', 'nonlocal',
    'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'del',
    'async', 'await', 'assert',
  ]),
  rust: new Set([
    'fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait',
    'type', 'use', 'mod', 'pub', 'crate', 'self', 'super', 'where',
    'if', 'else', 'match', 'loop', 'while', 'for', 'in', 'break', 'continue',
    'return', 'as', 'ref', 'move', 'async', 'await', 'unsafe', 'extern', 'dyn',
    'true', 'false',
  ]),
  go: new Set([
    'package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface',
    'map', 'chan', 'range', 'go', 'select', 'defer', 'if', 'else',
    'for', 'switch', 'case', 'default', 'break', 'continue', 'return',
    'fallthrough', 'goto', 'nil', 'true', 'false', 'iota',
  ]),
}

function getKeywords(language: string): Set<string> {
  const lang = language.toLowerCase()
  if (lang === 'tsx' || lang === 'ts') return KEYWORD_SETS.typescript ?? new Set()
  if (lang === 'jsx' || lang === 'js') return KEYWORD_SETS.javascript ?? new Set()
  return KEYWORD_SETS[lang] ?? KEYWORD_SETS.typescript ?? new Set()
}

function tokenizeLine(text: string, language: string): SyntaxToken[] {
  const keywords = getKeywords(language)
  const tokens: SyntaxToken[] = []
  let pos = 0
  const isPy = language === 'python' || language === 'py'

  while (pos < text.length) {
    // Single-line comment
    if ((text[pos] === '/' && text[pos + 1] === '/') || (text[pos] === '#' && isPy)) {
      tokens.push({ text: text.slice(pos), type: 'comment' })
      break
    }

    // String literal
    if (text[pos] === '"' || text[pos] === "'" || text[pos] === '`') {
      const quote = text[pos]
      let end = pos + 1
      while (end < text.length && text[end] !== quote) {
        if (text[end] === '\\') end++
        end++
      }
      if (end < text.length) end++
      tokens.push({ text: text.slice(pos, end), type: 'string' })
      pos = end
      continue
    }

    // Numeric literal
    if (/\d/.test(text[pos]) && (pos === 0 || /[\s(,=+\-*/[{<>!&|^~%]/.test(text[pos - 1]))) {
      let end = pos
      while (end < text.length && /[\d.xXoObBeE_a-fA-F]/.test(text[end])) end++
      tokens.push({ text: text.slice(pos, end), type: 'number' })
      pos = end
      continue
    }

    // Identifier or keyword
    if (/[a-zA-Z_$]/.test(text[pos])) {
      let end = pos
      while (end < text.length && /[a-zA-Z0-9_$]/.test(text[end])) end++
      const word = text.slice(pos, end)
      tokens.push({ text: word, type: keywords.has(word) ? 'keyword' : 'plain' })
      pos = end
      continue
    }

    // Punctuation
    if (/[{}()\[\];:.,<>+\-*/%=!&|^~?@#]/.test(text[pos])) {
      tokens.push({ text: text[pos], type: 'punctuation' })
      pos++
      continue
    }

    // Whitespace / other
    let end = pos
    while (
      end < text.length &&
      !/[a-zA-Z0-9_$"'`{}()\[\];:.,<>+\-*/%=!&|^~?@#]/.test(text[end]) &&
      !(text[end] === '/' && text[end + 1] === '/') &&
      !(text[end] === '#' && isPy)
    ) {
      end++
    }
    if (end === pos) end = pos + 1
    tokens.push({ text: text.slice(pos, end), type: 'plain' })
    pos = end
  }

  return tokens
}

const SYNTAX_COLORS: Record<SyntaxToken['type'], string> = {
  keyword: 'var(--diff-syntax-keyword, #569cd6)',
  string: 'var(--diff-syntax-string, #ce9178)',
  comment: 'var(--diff-syntax-comment, #6a9955)',
  number: 'var(--diff-syntax-number, #b5cea8)',
  punctuation: 'var(--diff-syntax-punctuation, #d4d4d4)',
  plain: 'inherit',
}

/* ══════════════════════════════════════════════════════════
   Three-Way Merge Computation
   ══════════════════════════════════════════════════════════ */

interface MergeRegion {
  type: 'resolved' | 'conflict'
  baseLines: string[]
  oursLines: string[]
  theirsLines: string[]
}

function computeThreeWayRegions(input: ThreeWayInput): MergeRegion[] {
  const baseLines = input.base.split('\n')
  const oursLines = input.ours.split('\n')
  const theirsLines = input.theirs.split('\n')
  const regions: MergeRegion[] = []
  let current: MergeRegion | null = null

  let bi = 0
  let oi = 0
  let ti = 0
  const maxIter = Math.max(baseLines.length, oursLines.length, theirsLines.length) * 3

  for (
    let step = 0;
    step < maxIter && (bi < baseLines.length || oi < oursLines.length || ti < theirsLines.length);
    step++
  ) {
    const b = bi < baseLines.length ? baseLines[bi] : undefined
    const o = oi < oursLines.length ? oursLines[oi] : undefined
    const t = ti < theirsLines.length ? theirsLines[ti] : undefined
    const oursMatch = b !== undefined && o === b
    const theirsMatch = b !== undefined && t === b

    if (oursMatch && theirsMatch) {
      // All three sides agree on this line
      if (!current || current.type !== 'resolved') {
        if (current) regions.push(current)
        current = { type: 'resolved', baseLines: [], oursLines: [], theirsLines: [] }
      }
      current.baseLines.push(b!)
      current.oursLines.push(o!)
      current.theirsLines.push(t!)
      bi++
      oi++
      ti++
    } else {
      // Conflict: at least one side diverges from base
      if (!current || current.type !== 'conflict') {
        if (current) regions.push(current)
        current = { type: 'conflict', baseLines: [], oursLines: [], theirsLines: [] }
      }
      if (b !== undefined && !oursMatch && !theirsMatch) {
        current.baseLines.push(b)
        bi++
      }
      if (o !== undefined && !oursMatch) { current.oursLines.push(o); oi++ }
      if (t !== undefined && !theirsMatch) { current.theirsLines.push(t); ti++ }
      if (oursMatch) { current.oursLines.push(o!); oi++ }
      if (theirsMatch) { current.theirsLines.push(t!); ti++ }
    }
  }

  if (current) regions.push(current)
  return regions
}

/* ── Change stats ───────────────────────────────────────── */

function computeStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const l of lines) {
    if (l.type === 'added') added++
    else if (l.type === 'removed') removed++
    else if (l.type === 'modified') { added++; removed++ }
  }
  return { added, removed }
}

/* ══════════════════════════════════════════════════════════
   Memoized Sub-components
   ══════════════════════════════════════════════════════════ */

/** Renders a line of text with syntax highlighting */
const SyntaxText = memo(function SyntaxText({
  text,
  language,
}: {
  text: string
  language: string
}) {
  const tokens = useMemo(() => tokenizeLine(text, language), [text, language])
  return (
    <>
      {tokens.map((tok, i) => (
        <span key={i} style={{ color: SYNTAX_COLORS[tok.type] }}>
          {tok.text}
        </span>
      ))}
    </>
  )
})

/** Renders text segments with character-level highlighting */
const CharHighlightText = memo(function CharHighlightText({
  segments,
  highlightColor,
  language,
}: {
  segments: CharSegment[]
  highlightColor: string
  language: string
}) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <span key={i} style={{ background: highlightColor, borderRadius: 2 }}>
            <SyntaxText text={seg.text} language={language} />
          </span>
        ) : (
          <span key={i}>
            <SyntaxText text={seg.text} language={language} />
          </span>
        ),
      )}
    </>
  )
})

/** Inline form for adding review comments */
const CommentForm = memo(function CommentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (content: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed) onSubmit(trimmed)
  }, [text, onSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        handleSubmit()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    },
    [handleSubmit, onCancel],
  )

  const inputStyle: CSSProperties = {
    width: '100%',
    minHeight: 48,
    padding: '4px 6px',
    border: '1px solid var(--border-color, #444)',
    borderRadius: 4,
    background: 'var(--bg-primary, #181825)',
    color: 'var(--text-primary, #cdd6f4)',
    fontSize: 12,
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
  }

  return (
    <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-color, #333)', background: 'var(--bg-tertiary, #1e1e2e)' }}>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a review comment... (Ctrl+Enter to submit)"
        style={inputStyle}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border-color, #444)', borderRadius: 4, background: 'transparent', color: 'var(--text-primary, #cdd6f4)', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          style={{
            padding: '3px 10px', fontSize: 11, border: 'none', borderRadius: 4, fontWeight: 500,
            background: text.trim() ? 'var(--accent-blue, #58a6ff)' : 'rgba(88,166,255,0.3)',
            color: '#fff', cursor: text.trim() ? 'pointer' : 'default',
          }}
        >
          Comment
        </button>
      </div>
    </div>
  )
})

/** Displays an existing review comment */
const CommentBubble = memo(function CommentBubble({ comment }: { comment: ReviewComment }) {
  return (
    <div style={{ padding: '6px 10px', margin: '2px 0', borderLeft: '3px solid var(--accent-blue, #58a6ff)', background: 'rgba(88,166,255,0.06)', borderRadius: '0 4px 4px 0', fontSize: 12, color: 'var(--text-primary, #cdd6f4)' }}>
      {comment.author && (
        <span style={{ fontWeight: 600, marginRight: 8, fontSize: 11 }}>{comment.author}</span>
      )}
      {comment.timestamp && (
        <span style={{ opacity: 0.4, fontSize: 10, marginRight: 8 }}>
          {new Date(comment.timestamp).toLocaleString()}
        </span>
      )}
      <div style={{ marginTop: 2, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{comment.content}</div>
    </div>
  )
})

/* ══════════════════════════════════════════════════════════
   Main DiffViewer Component
   ══════════════════════════════════════════════════════════ */

export default function DiffViewer({
  originalContent,
  modifiedContent,
  originalPath,
  modifiedPath,
  language = 'typescript',
  initialMode = 'split',
  onClose,
  onStageHunk,
  onUnstageHunk,
  onAddComment,
  comments = [],
  threeWay,
  readOnly = false,
  contextLines = DEFAULT_CONTEXT,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: DiffViewerProps) {
  /* ── State ─────────────────────────────────────────────── */

  const [viewMode, setViewMode] = useState<DiffViewMode>(initialMode)
  const [collapsedRegions, setCollapsedRegions] = useState<CollapsedRegion[]>([])
  const [currentChangeIdx, setCurrentChangeIdx] = useState(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [commentingLine, setCommentingLine] = useState<{ line: number; side: 'old' | 'new' } | null>(null)
  const [stagedHunks, setStagedHunks] = useState<Set<string>>(new Set())
  const [mergeViewActive, setMergeViewActive] = useState(!!threeWay)

  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  /* ── Computed diff data ────────────────────────────────── */

  const diffLines = useMemo(
    () => computeDiffLines(originalContent, modifiedContent),
    [originalContent, modifiedContent],
  )

  const hunks = useMemo(() => extractHunks(diffLines), [diffLines])
  const st = useMemo(() => computeStats(diffLines), [diffLines])

  const changeIndices = useMemo(() => {
    const indices: number[] = []
    diffLines.forEach((l, i) => { if (l.type !== 'unchanged') indices.push(i) })
    return indices
  }, [diffLines])

  const mergeRegions = useMemo(
    () => (threeWay ? computeThreeWayRegions(threeWay) : null),
    [threeWay],
  )

  /* ── Collapsed regions ─────────────────────────────────── */

  useEffect(() => {
    setCollapsedRegions(computeCollapsedRegions(diffLines, contextLines))
  }, [diffLines, contextLines])

  const toggleCollapse = useCallback((regionIndex: number) => {
    setCollapsedRegions((prev) =>
      prev.map((r, i) => (i === regionIndex ? { ...r, expanded: !r.expanded } : r)),
    )
  }, [])

  /* ── Visible items (with collapsed accounting) ─────────── */

  interface VisibleItem {
    kind: 'line' | 'collapsed'
    lineIndex?: number
    line?: DiffLine
    regionIndex?: number
    region?: CollapsedRegion
  }

  const visibleItems = useMemo(() => {
    const items: VisibleItem[] = []
    const activeCollapsed = collapsedRegions.filter((r) => !r.expanded)
    let lineIdx = 0

    while (lineIdx < diffLines.length) {
      const region = activeCollapsed.find((r) => r.startIndex === lineIdx)
      const rIdx = region
        ? collapsedRegions.findIndex((r) => r.startIndex === region.startIndex && r.endIndex === region.endIndex)
        : -1

      if (region && rIdx >= 0) {
        items.push({ kind: 'collapsed', regionIndex: rIdx, region })
        lineIdx = region.endIndex
      } else {
        items.push({ kind: 'line', lineIndex: lineIdx, line: diffLines[lineIdx] })
        lineIdx++
      }
    }

    return items
  }, [diffLines, collapsedRegions])

  /* ── Virtual scrolling ─────────────────────────────────── */

  const viewHeight = scrollRef.current?.clientHeight ?? 600
  const totalHeight = visibleItems.length * rowHeight
  const vStart = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN)
  const vEnd = Math.min(visibleItems.length, vStart + Math.ceil(viewHeight / rowHeight) + VIRTUAL_OVERSCAN * 2)
  const visibleSlice = visibleItems.slice(vStart, vEnd)
  const offsetY = vStart * rowHeight

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  /* ── Change navigation ─────────────────────────────────── */

  const navigateChange = useCallback(
    (direction: 'prev' | 'next') => {
      if (changeIndices.length === 0) return

      const nextIdx =
        direction === 'next'
          ? Math.min(currentChangeIdx + 1, changeIndices.length - 1)
          : Math.max(currentChangeIdx - 1, 0)

      setCurrentChangeIdx(nextIdx)

      // Scroll the target change into view
      const targetLine = changeIndices[nextIdx]
      const itemIdx = visibleItems.findIndex((v) => v.kind === 'line' && v.lineIndex === targetLine)
      if (itemIdx >= 0 && scrollRef.current) {
        scrollRef.current.scrollTop = Math.max(0, itemIdx * rowHeight - scrollRef.current.clientHeight / 2)
      }
    },
    [changeIndices, currentChangeIdx, visibleItems, rowHeight],
  )

  const goPrev = useCallback(() => navigateChange('prev'), [navigateChange])
  const goNext = useCallback(() => navigateChange('next'), [navigateChange])

  /* ── Keyboard shortcuts ────────────────────────────────── */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F7' && !e.shiftKey) { e.preventDefault(); goNext() }
      if (e.key === 'F7' && e.shiftKey) { e.preventDefault(); goPrev() }
      if (e.key === 'Escape' && onClose) { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [goNext, goPrev, onClose])

  /* ── Hunk stage / unstage ──────────────────────────────── */

  const toggleHunkStaged = useCallback(
    (hunkIndex: number) => {
      const hunk = hunks[hunkIndex]
      if (!hunk) return

      setStagedHunks((prev) => {
        const next = new Set(prev)
        if (next.has(hunk.id)) {
          next.delete(hunk.id)
          onUnstageHunk?.(hunkIndex, hunk)
        } else {
          next.add(hunk.id)
          onStageHunk?.(hunkIndex, hunk)
        }
        return next
      })
    },
    [hunks, onStageHunk, onUnstageHunk],
  )

  /* ── Copy side ─────────────────────────────────────────── */

  const copySide = useCallback(
    (side: 'old' | 'new') => {
      navigator.clipboard.writeText(side === 'old' ? originalContent : modifiedContent).catch(() => {})
    },
    [originalContent, modifiedContent],
  )

  /* ── Comment handling ──────────────────────────────────── */

  const handleAddComment = useCallback(
    (lineNo: number, side: 'old' | 'new', content: string) => {
      onAddComment?.(lineNo, side, content)
      setCommentingLine(null)
    },
    [onAddComment],
  )

  const commentsByLine = useMemo(() => {
    const map = new Map<string, ReviewComment[]>()
    for (const c of comments) {
      const key = `${c.side}:${c.lineNumber}`
      map.set(key, [...(map.get(key) || []), c])
    }
    return map
  }, [comments])

  const hunkForLine = useCallback(
    (lineIndex: number) => hunks.findIndex((h) => lineIndex >= h.startIndex && lineIndex < h.endIndex),
    [hunks],
  )

  /* ── Minimap data ──────────────────────────────────────── */

  const minimapMarkers = useMemo(
    () => diffLines.length > 0
      ? diffLines
          .map((l, i) => ({ i, type: l.type, y: (i / diffLines.length) * 100 }))
          .filter((m) => m.type !== 'unchanged')
      : [],
    [diffLines],
  )

  const minimapViewport = useMemo(() => {
    const total = visibleItems.length * rowHeight
    if (!total) return { top: 0, height: 100 }
    const top = (scrollTop / total) * 100
    const height = Math.min(100, (viewHeight / total) * 100)
    return { top: Math.max(0, Math.min(100 - height, top)), height }
  }, [scrollTop, viewHeight, visibleItems.length, rowHeight])

  /* ── Style helpers ─────────────────────────────────────── */

  const lineStyle = (type: DiffLineType, isCurrent: boolean): CSSProperties => {
    const base: CSSProperties = {
      display: 'flex',
      alignItems: 'stretch',
      height: rowHeight,
      lineHeight: `${rowHeight}px`,
      fontSize: 12,
      fontFamily: MONO_FONT,
      whiteSpace: 'pre',
      overflow: 'hidden',
      borderLeft: `${GUTTER_WIDTH}px solid transparent`,
    }

    if (type === 'added') {
      base.background = 'var(--diff-added-bg, rgba(35,134,54,0.15))'
      base.borderLeft = `${GUTTER_WIDTH}px solid var(--diff-added-border, #3fb950)`
    } else if (type === 'removed') {
      base.background = 'var(--diff-removed-bg, rgba(218,54,51,0.15))'
      base.borderLeft = `${GUTTER_WIDTH}px solid var(--diff-removed-border, #f85149)`
    } else if (type === 'modified') {
      base.background = 'var(--diff-modified-bg, rgba(227,179,65,0.25))'
      base.borderLeft = `${GUTTER_WIDTH}px solid var(--diff-modified-border, #e3b341)`
    }

    if (isCurrent) {
      base.outline = '1px solid var(--accent-blue, #58a6ff)'
      base.outlineOffset = -1
    }

    return base
  }

  const lineNumStyle: CSSProperties = {
    width: LINE_NUM_WIDTH,
    minWidth: LINE_NUM_WIDTH,
    textAlign: 'right',
    paddingRight: 8,
    color: 'var(--diff-line-number, rgba(255,255,255,0.3))',
    fontSize: 11,
    userSelect: 'none',
    flexShrink: 0,
  }

  const lineContentStyle: CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    paddingLeft: 4,
    paddingRight: 8,
  }

  const iconBtnStyle: CSSProperties = {
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-primary, #cdd6f4)',
    background: 'transparent',
    opacity: 0.7,
    transition: 'all 0.15s',
    flexShrink: 0,
  }

  /* ── Render helpers ────────────────────────────────────── */

  const hoverBtn = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
    e.currentTarget.style.opacity = '1'
  }

  const leaveBtn = (disabled: boolean) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.background = 'transparent'
    e.currentTarget.style.opacity = disabled ? '0.3' : '0.7'
  }

  const renderLineContent = (line: DiffLine, side: 'old' | 'new') => {
    if (line.type === 'modified') {
      const segs = side === 'old' ? line.charSegments : line.pairedCharSegments
      const col = side === 'old'
        ? 'var(--diff-removed-char-bg, rgba(248,81,73,0.4))'
        : 'var(--diff-added-char-bg, rgba(63,185,80,0.4))'
      if (segs?.length) {
        return <CharHighlightText segments={segs} highlightColor={col} language={language} />
      }
      const text = side === 'old' ? line.content : (line.pairedContent ?? '')
      return <SyntaxText text={text} language={language} />
    }
    return <SyntaxText text={line.content} language={language} />
  }

  const renderComments = (lineNo: number, side: 'old' | 'new') => {
    const existing = commentsByLine.get(`${side}:${lineNo}`) || []
    const isCommenting = commentingLine?.line === lineNo && commentingLine?.side === side
    if (!existing.length && !isCommenting) return null
    return (
      <div style={{ width: '100%' }}>
        {existing.map((c) => <CommentBubble key={c.id} comment={c} />)}
        {isCommenting && (
          <CommentForm
            onSubmit={(content) => handleAddComment(lineNo, side, content)}
            onCancel={() => setCommentingLine(null)}
          />
        )}
      </div>
    )
  }

  const renderCollapsedItem = (region: CollapsedRegion, regionIndex: number) => (
    <div
      key={`collapsed-${regionIndex}`}
      onClick={() => toggleCollapse(regionIndex)}
      title="Click to expand"
      style={{
        height: rowHeight,
        lineHeight: `${rowHeight}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: 'var(--text-primary, #cdd6f4)',
        opacity: 0.5,
        cursor: 'pointer',
        background: 'rgba(255,255,255,0.02)',
        borderTop: '1px solid var(--border-color, #333)',
        borderBottom: '1px solid var(--border-color, #333)',
        userSelect: 'none',
        gap: 6,
      }}
    >
      <ChevronsUpDown size={12} />
      <span>{region.lineCount} lines hidden</span>
      <ChevronRight size={12} />
    </div>
  )

  const renderHunkActions = (lineIndex: number) => {
    if (readOnly) return null
    const hIdx = hunkForLine(lineIndex)
    if (hIdx === -1) return null
    const hunk = hunks[hIdx]
    if (lineIndex !== hunk.startIndex) return null
    const isStaged = stagedHunks.has(hunk.id)

    return (
      <div style={{ position: 'absolute', right: MINIMAP_WIDTH + 8, top: 0, display: 'flex', gap: 2, zIndex: 5 }}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleHunkStaged(hIdx) }}
          title={isStaged ? 'Unstage hunk' : 'Stage hunk'}
          style={{
            ...iconBtnStyle, width: 'auto', height: 18, padding: '0 6px', fontSize: 10, fontWeight: 500, borderRadius: 3, opacity: 1, gap: 3,
            background: isStaged ? 'rgba(63,185,80,0.15)' : 'rgba(255,255,255,0.06)',
            color: isStaged ? 'var(--diff-added-border, #3fb950)' : 'var(--text-primary, #cdd6f4)',
          }}
        >
          {isStaged ? <Check size={10} /> : <Plus size={10} />}
          {isStaged ? 'Staged' : 'Stage'}
        </button>
        {onAddComment && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const ln = diffLines[lineIndex]
              setCommentingLine({ line: ln.newLineNo ?? ln.oldLineNo ?? 0, side: ln.newLineNo ? 'new' : 'old' })
            }}
            title="Add comment"
            style={{ ...iconBtnStyle, width: 18, height: 18, borderRadius: 3, background: 'rgba(255,255,255,0.06)', opacity: 1 }}
          >
            <MessageSquare size={10} />
          </button>
        )}
      </div>
    )
  }

  /* ── Render: inline (unified) diff lines ───────────────── */

  const renderInlineLine = (item: VisibleItem) => {
    if (item.kind === 'collapsed' && item.region && item.regionIndex != null) {
      return renderCollapsedItem(item.region, item.regionIndex)
    }

    const line = item.line!
    const li = item.lineIndex!
    const isCurrent = changeIndices.length > 0 && currentChangeIdx < changeIndices.length && changeIndices[currentChangeIdx] === li

    const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : line.type === 'modified' ? '~' : ' '
    const prefixColor = line.type === 'added'
      ? 'var(--diff-added-border, #3fb950)'
      : line.type === 'removed'
        ? 'var(--diff-removed-border, #f85149)'
        : line.type === 'modified'
          ? 'var(--diff-modified-border, #e3b341)'
          : 'transparent'

    const prefixSpan = (char: string, color: string) => (
      <span style={{ width: 16, minWidth: 16, textAlign: 'center', color, fontWeight: 700, userSelect: 'none' }}>
        {char}
      </span>
    )

    // Modified lines show both old (removed) and new (added) versions
    if (line.type === 'modified') {
      return (
        <div key={`il-${li}`}>
          <div style={lineStyle('removed', isCurrent)}>
            <span style={lineNumStyle}>{line.oldLineNo ?? ''}</span>
            <span style={{ ...lineNumStyle, opacity: 0.3 }}>&mdash;</span>
            {prefixSpan('-', prefixColor)}
            <span style={lineContentStyle}>{renderLineContent(line, 'old')}</span>
            {renderHunkActions(li)}
          </div>
          <div style={lineStyle('added', false)}>
            <span style={{ ...lineNumStyle, opacity: 0.3 }}>&mdash;</span>
            <span style={lineNumStyle}>{line.newLineNo ?? ''}</span>
            {prefixSpan('+', 'var(--diff-added-border, #3fb950)')}
            <span style={lineContentStyle}>{renderLineContent(line, 'new')}</span>
          </div>
          {renderComments(line.oldLineNo ?? 0, 'old')}
          {renderComments(line.newLineNo ?? 0, 'new')}
        </div>
      )
    }

    return (
      <div key={`il-${li}`} style={{ position: 'relative' }}>
        <div style={lineStyle(line.type, isCurrent)}>
          <span style={lineNumStyle}>{line.oldLineNo ?? ''}</span>
          <span style={lineNumStyle}>{line.newLineNo ?? ''}</span>
          {prefixSpan(prefix, prefixColor)}
          <span style={lineContentStyle}>{renderLineContent(line, line.type === 'removed' ? 'old' : 'new')}</span>
          {renderHunkActions(li)}
        </div>
        {line.oldLineNo && renderComments(line.oldLineNo, 'old')}
        {line.newLineNo && renderComments(line.newLineNo, 'new')}
      </div>
    )
  }

  /* ── Render: split (side-by-side) diff lines ───────────── */

  const renderSplitLine = (item: VisibleItem) => {
    if (item.kind === 'collapsed' && item.region && item.regionIndex != null) {
      return renderCollapsedItem(item.region, item.regionIndex)
    }

    const line = item.line!
    const li = item.lineIndex!
    const isCurrent = changeIndices.length > 0 && currentChangeIdx < changeIndices.length && changeIndices[currentChangeIdx] === li

    const emptyHalf = (
      <div style={{ ...lineStyle('unchanged', false), opacity: 0.3, flex: 1 }}>
        <span style={lineNumStyle} />
        <span style={lineContentStyle} />
      </div>
    )

    // Left panel (old/original)
    const leftType: DiffLineType = line.type === 'modified' ? 'removed' : line.type === 'added' ? 'unchanged' : line.type
    const leftPanel = line.type === 'added'
      ? emptyHalf
      : (
        <div style={{ ...lineStyle(leftType, isCurrent), flex: 1 }}>
          <span style={lineNumStyle}>{line.oldLineNo ?? ''}</span>
          <span style={lineContentStyle}>{renderLineContent(line, 'old')}</span>
        </div>
      )

    // Right panel (new/modified)
    const rightType: DiffLineType = line.type === 'modified' ? 'added' : line.type === 'removed' ? 'unchanged' : line.type
    const rightPanel = line.type === 'removed'
      ? emptyHalf
      : (
        <div style={{ ...lineStyle(rightType, isCurrent), flex: 1 }}>
          <span style={lineNumStyle}>
            {line.type === 'modified' ? (line.newLineNo ?? '') : (line.newLineNo ?? '')}
          </span>
          <span style={lineContentStyle}>
            {line.type === 'modified'
              ? renderLineContent(line, 'new')
              : <SyntaxText text={line.content} language={language} />
            }
          </span>
        </div>
      )

    return (
      <div key={`sp-${li}`} style={{ position: 'relative' }}>
        <div style={{ display: 'flex' }}>
          {leftPanel}
          <div style={{ width: 1, background: 'var(--border-color, #333)', flexShrink: 0 }} />
          {rightPanel}
          {renderHunkActions(li)}
        </div>
        {line.oldLineNo && renderComments(line.oldLineNo, 'old')}
        {line.newLineNo && renderComments(line.newLineNo, 'new')}
      </div>
    )
  }

  /* ── Render: three-way merge view ──────────────────────── */

  const renderMergeView = () => {
    if (!mergeRegions) return null

    const columnStyle: CSSProperties = {
      flex: 1,
      overflow: 'hidden',
      borderRight: '1px solid var(--border-color, #333)',
    }

    const columnHeaderStyle = (side: MergeSide): CSSProperties => ({
      padding: '4px 8px',
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      borderBottom: '1px solid var(--border-color, #333)',
      color: 'var(--text-primary, #cdd6f4)',
      background:
        side === 'base'
          ? 'var(--diff-conflict-base-bg, rgba(88,166,255,0.12))'
          : side === 'ours'
            ? 'var(--diff-conflict-ours-bg, rgba(63,185,80,0.12))'
            : 'var(--diff-conflict-theirs-bg, rgba(248,81,73,0.12))',
    })

    const mergeLineStyle: CSSProperties = {
      height: rowHeight,
      lineHeight: `${rowHeight}px`,
      paddingLeft: 8,
      whiteSpace: 'pre',
      overflow: 'hidden',
    }

    const emptyLineStyle: CSSProperties = {
      ...mergeLineStyle,
      opacity: 0.3,
      fontStyle: 'italic',
    }

    const scrollPanelStyle: CSSProperties = {
      overflow: 'auto',
      height: '100%',
      fontSize: 12,
      fontFamily: MONO_FONT,
    }

    const renderColumn = (
      side: MergeSide,
      label: string,
      getLines: (r: MergeRegion) => string[],
      borderColor: string,
      bgColor: string,
    ) => (
      <div style={side === 'theirs' ? { ...columnStyle, borderRight: 'none' } : columnStyle}>
        <div style={columnHeaderStyle(side)}>{label}</div>
        <div style={scrollPanelStyle}>
          {mergeRegions.map((region, ri) => (
            <div key={`${side}-${ri}`}>
              {region.type === 'conflict' && (
                <div style={{ background: bgColor, borderLeft: `3px solid ${borderColor}`, padding: '1px 0' }}>
                  {getLines(region).length > 0
                    ? getLines(region).map((ln, li) => (
                        <div key={li} style={mergeLineStyle}>
                          <SyntaxText text={ln} language={language} />
                        </div>
                      ))
                    : <div style={emptyLineStyle}>(no content)</div>
                  }
                </div>
              )}
              {region.type === 'resolved' &&
                getLines(region).map((ln, li) => (
                  <div key={li} style={mergeLineStyle}>
                    <SyntaxText text={ln} language={language} />
                  </div>
                ))
              }
            </div>
          ))}
        </div>
      </div>
    )

    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {renderColumn('base', 'Base', (r) => r.baseLines, 'var(--accent-blue, #58a6ff)', 'var(--diff-conflict-base-bg, rgba(88,166,255,0.12))')}
        {renderColumn('ours', 'Ours (Current)', (r) => r.oursLines, 'var(--diff-added-border, #3fb950)', 'var(--diff-conflict-ours-bg, rgba(63,185,80,0.12))')}
        {renderColumn('theirs', 'Theirs (Incoming)', (r) => r.theirsLines, 'var(--diff-removed-border, #f85149)', 'var(--diff-conflict-theirs-bg, rgba(248,81,73,0.12))')}
      </div>
    )
  }

  /* ── Render: minimap scrollbar ──────────────────────────── */

  const renderMinimap = () => (
    <div
      style={{
        width: MINIMAP_WIDTH,
        minWidth: MINIMAP_WIDTH,
        height: '100%',
        background: 'var(--diff-minimap-bg, rgba(255,255,255,0.03))',
        borderLeft: '1px solid var(--border-color, #333)',
        position: 'relative',
        flexShrink: 0,
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const pct = (e.clientY - rect.top) / rect.height
        if (scrollRef.current) {
          scrollRef.current.scrollTop = pct * visibleItems.length * rowHeight
        }
      }}
    >
      {/* Viewport indicator */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${minimapViewport.top}%`,
          height: `${Math.max(2, minimapViewport.height)}%`,
          background: 'var(--diff-minimap-viewport, rgba(88,166,255,0.2))',
          borderRadius: 2,
          transition: 'top 0.05s ease-out',
        }}
      />

      {/* Change markers */}
      {minimapMarkers.map((marker, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: 4,
            right: 4,
            top: `${marker.y}%`,
            height: Math.max(2, 100 / diffLines.length),
            borderRadius: 1,
            background:
              marker.type === 'added'
                ? 'var(--diff-minimap-added, #3fb950)'
                : marker.type === 'removed'
                  ? 'var(--diff-minimap-removed, #f85149)'
                  : 'var(--diff-minimap-modified, #e3b341)',
          }}
        />
      ))}
    </div>
  )

  /* ── Render: header bar ────────────────────────────────── */

  const prevDisabled = currentChangeIdx <= 0 || changeIndices.length === 0
  const nextDisabled = currentChangeIdx >= changeIndices.length - 1 || changeIndices.length === 0
  const changeLabel = !changeIndices.length ? 'No changes' : changeIndices.length === 1 ? '1 change' : `${changeIndices.length} changes`

  const labelStyle: CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    opacity: 0.5,
    color: 'var(--text-primary, #cdd6f4)',
  }

  const fileNameStyle: CSSProperties = {
    fontWeight: 500,
    color: 'var(--text-primary, #cdd6f4)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 160,
  }

  const dividerStyle: CSSProperties = {
    width: 1,
    height: 18,
    background: 'var(--border-color, #333)',
    margin: '0 2px',
    flexShrink: 0,
  }

  const pillStyle = (bg: string, color: string): CSSProperties => ({
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: 8,
    background: bg,
    color,
    whiteSpace: 'nowrap',
  })

  const renderHeader = () => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 36,
        padding: '0 12px',
        borderBottom: '1px solid var(--border-color, #333)',
        background: 'var(--bg-secondary, #1e1e2e)',
        flexShrink: 0,
        gap: 8,
        fontSize: 12,
        userSelect: 'none',
      }}
    >
      <span style={labelStyle}>Original</span>
      <span style={fileNameStyle} title={originalPath}>{baseName(originalPath)}</span>
      <span style={{ color: 'var(--text-primary, #cdd6f4)', opacity: 0.3, fontSize: 14, margin: '0 2px' }}>{'\u2194'}</span>
      <span style={labelStyle}>Modified</span>
      <span style={fileNameStyle} title={modifiedPath}>{baseName(modifiedPath)}</span>

      <div style={{ flex: 1, minWidth: 8 }} />

      {/* Stats pills */}
      <span style={pillStyle('rgba(63,185,80,0.12)', 'var(--diff-added-border, #3fb950)')}>+{st.added}</span>
      <span style={pillStyle('rgba(248,81,73,0.12)', 'var(--diff-removed-border, #f85149)')}>-{st.removed}</span>
      <span style={pillStyle('rgba(88,166,255,0.1)', 'var(--accent-blue, #58a6ff)')}>{changeLabel}</span>

      <div style={dividerStyle} />

      {/* Navigation */}
      <button onClick={goPrev} disabled={prevDisabled}
        style={{ ...iconBtnStyle, opacity: prevDisabled ? 0.3 : 0.7, cursor: prevDisabled ? 'default' : 'pointer' }}
        title="Previous change (Shift+F7)" onMouseEnter={prevDisabled ? undefined : hoverBtn} onMouseLeave={leaveBtn(prevDisabled)}>
        <ArrowUp size={14} />
      </button>
      {changeIndices.length > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-primary, #cdd6f4)', opacity: 0.5, minWidth: 28, textAlign: 'center' }}>
          {currentChangeIdx + 1}/{changeIndices.length}
        </span>
      )}
      <button onClick={goNext} disabled={nextDisabled}
        style={{ ...iconBtnStyle, opacity: nextDisabled ? 0.3 : 0.7, cursor: nextDisabled ? 'default' : 'pointer' }}
        title="Next change (F7)" onMouseEnter={nextDisabled ? undefined : hoverBtn} onMouseLeave={leaveBtn(nextDisabled)}>
        <ArrowDown size={14} />
      </button>

      <div style={dividerStyle} />

      {/* View mode toggle */}
      <button
        onClick={() => setViewMode((m) => (m === 'split' ? 'inline' : 'split'))}
        style={{ ...iconBtnStyle, width: 'auto', padding: '0 6px', gap: 4, fontSize: 10, fontWeight: 500 }}
        title={viewMode === 'split' ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
        onMouseEnter={hoverBtn} onMouseLeave={leaveBtn(false)}
      >
        {viewMode === 'split' ? <Rows2 size={14} /> : <Columns size={14} />}
        <span>{viewMode === 'split' ? 'Inline' : 'Split'}</span>
      </button>

      {/* Three-way merge toggle */}
      {threeWay && (
        <button
          onClick={() => setMergeViewActive((v) => !v)}
          style={{
            ...iconBtnStyle, width: 'auto', padding: '0 6px', gap: 4, fontSize: 10, fontWeight: 500, opacity: 1,
            background: mergeViewActive ? 'rgba(88,166,255,0.12)' : 'transparent',
            color: mergeViewActive ? 'var(--accent-blue, #58a6ff)' : 'var(--text-primary, #cdd6f4)',
          }}
          title={mergeViewActive ? 'Hide merge view' : 'Show three-way merge'}
          onMouseEnter={(e) => { e.currentTarget.style.background = mergeViewActive ? 'rgba(88,166,255,0.18)' : 'rgba(255,255,255,0.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = mergeViewActive ? 'rgba(88,166,255,0.12)' : 'transparent' }}
        >
          <GitMerge size={14} />
          <span>3-Way</span>
        </button>
      )}

      {/* Copy buttons */}
      <button onClick={() => copySide('old')} style={{ ...iconBtnStyle, width: 'auto', padding: '0 6px', gap: 3, fontSize: 10 }}
        title="Copy original content" onMouseEnter={hoverBtn} onMouseLeave={leaveBtn(false)}>
        <Copy size={11} /><span>Old</span>
      </button>
      <button onClick={() => copySide('new')} style={{ ...iconBtnStyle, width: 'auto', padding: '0 6px', gap: 3, fontSize: 10 }}
        title="Copy modified content" onMouseEnter={hoverBtn} onMouseLeave={leaveBtn(false)}>
        <Copy size={11} /><span>New</span>
      </button>

      {/* Close button */}
      {onClose && (
        <>
          <div style={dividerStyle} />
          <button
            onClick={onClose}
            style={iconBtnStyle}
            title="Close diff view (Esc)"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.color = '#f85149'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.opacity = '0.7'
              e.currentTarget.style.color = 'var(--text-primary, #cdd6f4)'
            }}
          >
            <X size={14} />
          </button>
        </>
      )}
    </div>
  )

  /* ── Main render ───────────────────────────────────────── */

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: 'var(--bg-primary, #181825)',
        overflow: 'hidden',
        color: 'var(--text-primary, #cdd6f4)',
        position: 'relative',
      }}
    >
      {renderHeader()}

      {mergeViewActive && threeWay ? (
        renderMergeView()
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Main scrollable area with virtual scrolling */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            style={{ flex: 1, overflow: 'auto', position: 'relative' }}
          >
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div style={{ position: 'absolute', top: offsetY, left: 0, right: 0 }}>
                {visibleSlice.map((item) =>
                  viewMode === 'inline' ? renderInlineLine(item) : renderSplitLine(item),
                )}
              </div>
            </div>

            {/* Empty state */}
            {diffLines.length === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.4, fontSize: 13 }}>
                No content to diff
              </div>
            )}

            {/* Identical files indicator */}
            {changeIndices.length === 0 && diffLines.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '4px 12px',
                  borderRadius: 12,
                  background: 'rgba(63,185,80,0.1)',
                  color: 'var(--diff-added-border, #3fb950)',
                  fontSize: 11,
                  fontWeight: 500,
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                Files are identical
              </div>
            )}
          </div>

          {/* Minimap scrollbar */}
          {renderMinimap()}
        </div>
      )}
    </div>
  )
}
