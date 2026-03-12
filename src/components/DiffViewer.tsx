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
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  MessageSquare,
  Check,
  X,
  GitMerge,
  ChevronsUpDown,
} from 'lucide-react'

/* ── CSS Variable Documentation ─────────────────────────── */

/**
 * CSS variables consumed by DiffViewer (set on a parent element or :root):
 *
 * --diff-added-bg:             background for added lines         (default: rgba(35,134,54,0.15))
 * --diff-removed-bg:           background for removed lines       (default: rgba(218,54,51,0.15))
 * --diff-modified-bg:          background for modified chars       (default: rgba(227,179,65,0.25))
 * --diff-added-char-bg:        char-level added highlight          (default: rgba(63,185,80,0.4))
 * --diff-removed-char-bg:      char-level removed highlight        (default: rgba(248,81,73,0.4))
 * --diff-added-border:         left gutter color for added         (default: #3fb950)
 * --diff-removed-border:       left gutter color for removed       (default: #f85149)
 * --diff-modified-border:      left gutter color for modified      (default: #e3b341)
 * --diff-line-number:          line number text color              (default: rgba(255,255,255,0.3))
 * --diff-minimap-added:        minimap marker for added            (default: #3fb950)
 * --diff-minimap-removed:      minimap marker for removed          (default: #f85149)
 * --diff-minimap-modified:     minimap marker for modified         (default: #e3b341)
 * --diff-minimap-bg:           minimap background                  (default: rgba(255,255,255,0.03))
 * --diff-minimap-viewport:     minimap viewport indicator          (default: rgba(88,166,255,0.2))
 * --diff-syntax-keyword:       syntax color for keywords           (default: #569cd6)
 * --diff-syntax-string:        syntax color for strings            (default: #ce9178)
 * --diff-syntax-comment:       syntax color for comments           (default: #6a9955)
 * --diff-syntax-number:        syntax color for numbers            (default: #b5cea8)
 * --diff-syntax-punctuation:   syntax color for punctuation        (default: #d4d4d4)
 * --diff-conflict-base-bg:     merge conflict base background      (default: rgba(88,166,255,0.12))
 * --diff-conflict-ours-bg:     merge conflict ours background      (default: rgba(63,185,80,0.12))
 * --diff-conflict-theirs-bg:   merge conflict theirs background    (default: rgba(248,81,73,0.12))
 */

/* ── Types ──────────────────────────────────────────────── */

export type DiffViewMode = 'split' | 'inline'

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'modified'

export type MergeSide = 'base' | 'ours' | 'theirs'

export interface DiffLine {
  type: DiffLineType
  content: string
  oldLineNo?: number
  newLineNo?: number
  /** For modified lines: the paired line from the other side */
  pairedContent?: string
  /** Character-level diff segments */
  charSegments?: CharSegment[]
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
  /** Original file path / name */
  originalPath: string
  /** Modified file path / name */
  modifiedPath: string
  /** Language for syntax highlighting */
  language?: string
  /** Initial view mode */
  initialMode?: DiffViewMode
  /** Callback when the viewer is closed */
  onClose?: () => void
  /** Callback to stage an individual hunk */
  onStageHunk?: (hunkIndex: number, hunk: DiffHunk) => void
  /** Callback to unstage an individual hunk */
  onUnstageHunk?: (hunkIndex: number, hunk: DiffHunk) => void
  /** Callback when a review comment is added */
  onAddComment?: (lineNumber: number, side: 'old' | 'new', content: string) => void
  /** Existing review comments to display */
  comments?: ReviewComment[]
  /** Three-way merge input (if provided, enables merge mode) */
  threeWay?: ThreeWayInput
  /** Whether hunks are read-only (no stage/unstage buttons) */
  readOnly?: boolean
  /** Number of context lines surrounding each change */
  contextLines?: number
  /** Row height in px for virtual scroll */
  rowHeight?: number
}

/* ── Constants ──────────────────────────────────────────── */

const DEFAULT_CONTEXT_LINES = 3
const DEFAULT_ROW_HEIGHT = 20
const VIRTUAL_OVERSCAN = 15
const COLLAPSED_THRESHOLD = 8
const MINIMAP_WIDTH = 48
const LINE_NUMBER_WIDTH = 50
const GUTTER_WIDTH = 4

/* ── Utility: extract file name from path ───────────────── */

function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path
}

/* ── Diff computation (Myers-like LCS) ──────────────────── */

function computeLCS(oldLines: string[], newLines: string[]): number[][] {
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
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
  const dp = computeLCS(oldLines, newLines)

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

/** Detect adjacent removed+added pairs and mark them as modified with char-level diffs */
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
      const charDiff = computeCharDiff(removed.content, added.content)

      output.push({
        type: 'modified',
        content: removed.content,
        oldLineNo: removed.oldLineNo,
        pairedContent: added.content,
        newLineNo: added.newLineNo,
        charSegments: charDiff.oldSegments,
        pairedCharSegments: charDiff.newSegments,
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

  // For very long lines, fall back to simple highlight-all
  if (m * n > 250000) {
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

  // Backtrack to find common subsequence
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
  const segs: CharSegment[] = []
  let cur = { text: chars[0], highlight: flags[0] }
  for (let i = 1; i < chars.length; i++) {
    if (flags[i] === cur.highlight) {
      cur.text += chars[i]
    } else {
      segs.push(cur)
      cur = { text: chars[i], highlight: flags[i] }
    }
  }
  segs.push(cur)
  return segs
}

/* ── Hunk extraction ────────────────────────────────────── */

function extractHunks(lines: DiffLine[]): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let hunkStart = -1
  let hunkId = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.type !== 'unchanged') {
      if (hunkStart === -1) hunkStart = i
    } else {
      if (hunkStart !== -1) {
        hunks.push(buildHunk(lines, hunkStart, i, hunkId++))
        hunkStart = -1
      }
    }
  }
  if (hunkStart !== -1) {
    hunks.push(buildHunk(lines, hunkStart, lines.length, hunkId++))
  }

  return hunks
}

function buildHunk(
  lines: DiffLine[],
  start: number,
  end: number,
  id: number,
): DiffHunk {
  const hunkLines = lines.slice(start, end)
  const oldStart = hunkLines.find((l) => l.oldLineNo != null)?.oldLineNo ?? 0
  const newStart = hunkLines.find((l) => l.newLineNo != null)?.newLineNo ?? 0
  let oldCount = 0
  let newCount = 0
  for (const l of hunkLines) {
    if (l.type === 'removed' || l.type === 'modified') oldCount++
    if (l.type === 'added' || l.type === 'modified') newCount++
    if (l.type === 'unchanged') { oldCount++; newCount++ }
  }
  return {
    id: `hunk-${id}`,
    startIndex: start,
    endIndex: end,
    oldStart,
    newStart,
    oldCount,
    newCount,
    lines: hunkLines,
  }
}

/* ── Collapsed region computation ───────────────────────── */

function computeCollapsedRegions(
  lines: DiffLine[],
  contextLines: number,
): CollapsedRegion[] {
  const regions: CollapsedRegion[] = []
  const changeIndices: number[] = []

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'unchanged') changeIndices.push(i)
  }

  if (changeIndices.length === 0) {
    if (lines.length > COLLAPSED_THRESHOLD) {
      regions.push({ startIndex: 0, endIndex: lines.length, lineCount: lines.length, expanded: false })
    }
    return regions
  }

  // Region before first change
  const firstChange = changeIndices[0]
  if (firstChange > contextLines + COLLAPSED_THRESHOLD) {
    regions.push({
      startIndex: 0,
      endIndex: firstChange - contextLines,
      lineCount: firstChange - contextLines,
      expanded: false,
    })
  }

  // Regions between changes
  for (let c = 0; c < changeIndices.length - 1; c++) {
    let changeEnd = changeIndices[c] + 1
    while (changeEnd < lines.length && lines[changeEnd].type !== 'unchanged') changeEnd++
    const nextChange = changeIndices[c + 1]
    const gapStart = changeEnd + contextLines
    const gapEnd = nextChange - contextLines
    if (gapEnd - gapStart >= COLLAPSED_THRESHOLD) {
      regions.push({
        startIndex: gapStart,
        endIndex: gapEnd,
        lineCount: gapEnd - gapStart,
        expanded: false,
      })
    }
  }

  // Region after last change
  const lastChange = changeIndices[changeIndices.length - 1]
  let lastChangeEnd = lastChange + 1
  while (lastChangeEnd < lines.length && lines[lastChangeEnd].type !== 'unchanged') lastChangeEnd++
  const afterStart = lastChangeEnd + contextLines
  if (lines.length - afterStart >= COLLAPSED_THRESHOLD) {
    regions.push({
      startIndex: afterStart,
      endIndex: lines.length,
      lineCount: lines.length - afterStart,
      expanded: false,
    })
  }

  return regions
}

/* ── Simple syntax tokenizer ────────────────────────────── */

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
    'if', 'else', 'match', 'loop', 'while', 'for', 'in', 'break', 'continue', 'return',
    'as', 'ref', 'move', 'async', 'await', 'unsafe', 'extern', 'dyn', 'box',
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

  while (pos < text.length) {
    // Single-line comment
    if (
      (text[pos] === '/' && text[pos + 1] === '/') ||
      (text[pos] === '#' && (language === 'python' || language === 'py'))
    ) {
      tokens.push({ text: text.slice(pos), type: 'comment' })
      break
    }

    // String (single or double quote)
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

    // Number
    if (/\d/.test(text[pos]) && (pos === 0 || /[\s(,=+\-*/[{<>!&|^~%]/.test(text[pos - 1]))) {
      let end = pos
      while (end < text.length && /[\d.xXoObBeE_a-fA-F]/.test(text[end])) end++
      tokens.push({ text: text.slice(pos, end), type: 'number' })
      pos = end
      continue
    }

    // Identifier / keyword
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
      !(text[end] === '#' && (language === 'python' || language === 'py'))
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

/* ── Three-way merge diff computation ───────────────────── */

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
  const oursDP = computeLCS(baseLines, oursLines)
  const theirsDP = computeLCS(baseLines, theirsLines)

  // Simplified three-way: align ours and theirs against base
  const oursAlign = backtrackAlignment(baseLines, oursLines, oursDP)
  const theirsAlign = backtrackAlignment(baseLines, theirsLines, theirsDP)

  let bi = 0
  let oi = 0
  let ti = 0
  let currentRegion: MergeRegion | null = null

  const maxLen = Math.max(baseLines.length, oursLines.length, theirsLines.length)
  for (let step = 0; step < maxLen * 3 && (bi < baseLines.length || oi < oursLines.length || ti < theirsLines.length); step++) {
    const baseLine = bi < baseLines.length ? baseLines[bi] : undefined
    const oursLine = oi < oursLines.length ? oursLines[oi] : undefined
    const theirsLine = ti < theirsLines.length ? theirsLines[ti] : undefined

    const oursMatch = baseLine !== undefined && oursLine === baseLine
    const theirsMatch = baseLine !== undefined && theirsLine === baseLine

    if (oursMatch && theirsMatch) {
      // All three agree
      if (!currentRegion || currentRegion.type !== 'resolved') {
        if (currentRegion) regions.push(currentRegion)
        currentRegion = { type: 'resolved', baseLines: [], oursLines: [], theirsLines: [] }
      }
      currentRegion.baseLines.push(baseLine!)
      currentRegion.oursLines.push(oursLine!)
      currentRegion.theirsLines.push(theirsLine!)
      bi++; oi++; ti++
    } else {
      // Conflict region
      if (!currentRegion || currentRegion.type !== 'conflict') {
        if (currentRegion) regions.push(currentRegion)
        currentRegion = { type: 'conflict', baseLines: [], oursLines: [], theirsLines: [] }
      }
      if (baseLine !== undefined && !oursMatch && !theirsMatch) {
        currentRegion.baseLines.push(baseLine)
        bi++
      }
      if (oursLine !== undefined && !oursMatch) {
        currentRegion.oursLines.push(oursLine)
        oi++
      }
      if (theirsLine !== undefined && !theirsMatch) {
        currentRegion.theirsLines.push(theirsLine)
        ti++
      }
      // Advance matched sides too
      if (oursMatch) { currentRegion.oursLines.push(oursLine!); oi++ }
      if (theirsMatch) { currentRegion.theirsLines.push(theirsLine!); ti++ }
    }
  }

  if (currentRegion) regions.push(currentRegion)
  return regions
}

function backtrackAlignment(
  base: string[],
  other: string[],
  dp: number[][],
): Array<[number, number]> {
  const pairs: Array<[number, number]> = []
  let i = base.length
  let j = other.length
  while (i > 0 && j > 0) {
    if (base[i - 1] === other[j - 1]) {
      pairs.push([i - 1, j - 1])
      i--; j--
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--
    } else {
      j--
    }
  }
  pairs.reverse()
  return pairs
}

/* ── Change stats computation ───────────────────────────── */

function computeStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === 'added') added++
    else if (line.type === 'removed') removed++
    else if (line.type === 'modified') { added++; removed++ }
  }
  return { added, removed }
}

/* ══════════════════════════════════════════════════════════
   Sub-components (memoized)
   ══════════════════════════════════════════════════════════ */

/* ── Syntax-highlighted text renderer ───────────────────── */

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

/* ── Char-highlighted text renderer ─────────────────────── */

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
          <span
            key={i}
            style={{
              background: highlightColor,
              borderRadius: 2,
            }}
          >
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

/* ── Comment input form ─────────────────────────────────── */

const CommentForm = memo(function CommentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (content: string) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
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

  return (
    <div
      style={{
        padding: '6px 8px',
        borderTop: '1px solid var(--border-color, #333)',
        background: 'var(--bg-tertiary, #1e1e2e)',
      }}
    >
      <textarea
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a review comment... (Ctrl+Enter to submit)"
        style={{
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
        }}
      />
      <div style={{ display: 'flex', gap: 6, marginTop: 4, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '3px 10px',
            fontSize: 11,
            border: '1px solid var(--border-color, #444)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--text-primary, #cdd6f4)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          style={{
            padding: '3px 10px',
            fontSize: 11,
            border: 'none',
            borderRadius: 4,
            background: text.trim() ? 'var(--accent-blue, #58a6ff)' : 'rgba(88,166,255,0.3)',
            color: '#fff',
            cursor: text.trim() ? 'pointer' : 'default',
            fontWeight: 500,
          }}
        >
          Comment
        </button>
      </div>
    </div>
  )
})

/* ── Review comment display ─────────────────────────────── */

const CommentBubble = memo(function CommentBubble({
  comment,
}: {
  comment: ReviewComment
}) {
  return (
    <div
      style={{
        padding: '6px 10px',
        margin: '2px 0',
        borderLeft: '3px solid var(--accent-blue, #58a6ff)',
        background: 'rgba(88,166,255,0.06)',
        borderRadius: '0 4px 4px 0',
        fontSize: 12,
        color: 'var(--text-primary, #cdd6f4)',
      }}
    >
      {comment.author && (
        <span style={{ fontWeight: 600, marginRight: 8, fontSize: 11 }}>
          {comment.author}
        </span>
      )}
      {comment.timestamp && (
        <span style={{ opacity: 0.4, fontSize: 10, marginRight: 8 }}>
          {new Date(comment.timestamp).toLocaleString()}
        </span>
      )}
      <div style={{ marginTop: 2, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
        {comment.content}
      </div>
    </div>
  )
})

/* ══════════════════════════════════════════════════════════
   Main Component
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
  contextLines = DEFAULT_CONTEXT_LINES,
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
  const [activeMergeSide, setActiveMergeSide] = useState<MergeSide>('ours')

  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const leftPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const isSyncingScroll = useRef(false)

  /* ── Computed diff data ────────────────────────────────── */

  const diffLines = useMemo(
    () => computeDiffLines(originalContent, modifiedContent),
    [originalContent, modifiedContent],
  )

  const hunks = useMemo(() => extractHunks(diffLines), [diffLines])

  const stats = useMemo(() => computeStats(diffLines), [diffLines])

  const changeIndices = useMemo(() => {
    const indices: number[] = []
    diffLines.forEach((line, i) => {
      if (line.type !== 'unchanged') indices.push(i)
    })
    return indices
  }, [diffLines])

  /* ── Three-way merge regions ──────────────────────────── */

  const mergeRegions = useMemo(() => {
    if (!threeWay) return null
    return computeThreeWayRegions(threeWay)
  }, [threeWay])

  /* ── Collapsed regions ─────────────────────────────────── */

  useEffect(() => {
    setCollapsedRegions(computeCollapsedRegions(diffLines, contextLines))
  }, [diffLines, contextLines])

  const toggleCollapsedRegion = useCallback((regionIndex: number) => {
    setCollapsedRegions((prev) =>
      prev.map((r, i) => (i === regionIndex ? { ...r, expanded: !r.expanded } : r)),
    )
  }, [])

  /* ── Visible lines (accounting for collapsed regions) ─── */

  interface VisibleItem {
    type: 'line' | 'collapsed'
    lineIndex?: number
    line?: DiffLine
    regionIndex?: number
    region?: CollapsedRegion
  }

  const visibleItems = useMemo(() => {
    const items: VisibleItem[] = []
    const collapsed = collapsedRegions.filter((r) => !r.expanded)
    let lineIdx = 0

    while (lineIdx < diffLines.length) {
      const region = collapsed.find(
        (r) => r.startIndex === lineIdx,
      )
      const regionIdx = region
        ? collapsedRegions.findIndex(
            (r) => r.startIndex === region.startIndex && r.endIndex === region.endIndex,
          )
        : -1

      if (region && regionIdx >= 0) {
        items.push({ type: 'collapsed', regionIndex: regionIdx, region })
        lineIdx = region.endIndex
      } else {
        items.push({ type: 'line', lineIndex: lineIdx, line: diffLines[lineIdx] })
        lineIdx++
      }
    }
    return items
  }, [diffLines, collapsedRegions])

  /* ── Virtual scroll computation ────────────────────────── */

  const containerHeight = useMemo(() => {
    const el = scrollContainerRef.current
    return el ? el.clientHeight : 600
  }, [/* re-read on scroll since we have no resize hook tied here */])

  const totalHeight = visibleItems.length * rowHeight

  const { startIdx, endIdx, offsetY } = useMemo(() => {
    const viewH = containerHeight
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN)
    const visible = Math.ceil(viewH / rowHeight) + VIRTUAL_OVERSCAN * 2
    const end = Math.min(visibleItems.length, start + visible)
    return { startIdx: start, endIdx: end, offsetY: start * rowHeight }
  }, [scrollTop, rowHeight, containerHeight, visibleItems.length])

  const visibleSlice = useMemo(
    () => visibleItems.slice(startIdx, endIdx),
    [visibleItems, startIdx, endIdx],
  )

  /* ── Scroll handler ────────────────────────────────────── */

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  /* ── Synchronized scrolling (split mode) ───────────────── */

  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (isSyncingScroll.current) return
    isSyncingScroll.current = true

    const srcEl = source === 'left' ? leftPanelRef.current : rightPanelRef.current
    const tgtEl = source === 'left' ? rightPanelRef.current : leftPanelRef.current

    if (srcEl && tgtEl) {
      tgtEl.scrollTop = srcEl.scrollTop
      tgtEl.scrollLeft = srcEl.scrollLeft
    }

    requestAnimationFrame(() => {
      isSyncingScroll.current = false
    })
  }, [])

  const handleLeftScroll = useCallback(() => syncScroll('left'), [syncScroll])
  const handleRightScroll = useCallback(() => syncScroll('right'), [syncScroll])

  /* ── Change navigation ─────────────────────────────────── */

  const navigateChange = useCallback(
    (direction: 'prev' | 'next') => {
      if (changeIndices.length === 0) return

      let nextIdx = currentChangeIdx
      if (direction === 'next') {
        nextIdx = Math.min(currentChangeIdx + 1, changeIndices.length - 1)
      } else {
        nextIdx = Math.max(currentChangeIdx - 1, 0)
      }
      setCurrentChangeIdx(nextIdx)

      // Scroll to the change
      const targetLineIdx = changeIndices[nextIdx]
      const itemIdx = visibleItems.findIndex(
        (item) => item.type === 'line' && item.lineIndex === targetLineIdx,
      )
      if (itemIdx >= 0 && scrollContainerRef.current) {
        const targetScroll = itemIdx * rowHeight - scrollContainerRef.current.clientHeight / 2
        scrollContainerRef.current.scrollTop = Math.max(0, targetScroll)
      }
    },
    [changeIndices, currentChangeIdx, visibleItems, rowHeight],
  )

  const goToPrev = useCallback(() => navigateChange('prev'), [navigateChange])
  const goToNext = useCallback(() => navigateChange('next'), [navigateChange])

  /* ── Keyboard shortcuts ────────────────────────────────── */

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F7' && !e.shiftKey) {
        e.preventDefault()
        goToNext()
      }
      if (e.key === 'F7' && e.shiftKey) {
        e.preventDefault()
        goToPrev()
      }
      if (e.key === 'Escape' && onClose) {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [goToNext, goToPrev, onClose])

  /* ── Hunk stage/unstage ────────────────────────────────── */

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

  /* ── Copy side content ─────────────────────────────────── */

  const copySide = useCallback(
    (side: 'old' | 'new') => {
      const content = side === 'old' ? originalContent : modifiedContent
      navigator.clipboard.writeText(content).catch(() => {})
    },
    [originalContent, modifiedContent],
  )

  /* ── Comment handling ──────────────────────────────────── */

  const handleAddComment = useCallback(
    (lineNumber: number, side: 'old' | 'new', content: string) => {
      onAddComment?.(lineNumber, side, content)
      setCommentingLine(null)
    },
    [onAddComment],
  )

  /* ── Find which hunk a line belongs to ─────────────────── */

  const getHunkForLine = useCallback(
    (lineIndex: number): number => {
      return hunks.findIndex((h) => lineIndex >= h.startIndex && lineIndex < h.endIndex)
    },
    [hunks],
  )

  /* ── Minimap data ──────────────────────────────────────── */

  const minimapMarkers = useMemo(() => {
    if (diffLines.length === 0) return []
    return diffLines.map((line, i) => ({
      index: i,
      type: line.type,
      y: (i / diffLines.length) * 100,
    })).filter((m) => m.type !== 'unchanged')
  }, [diffLines])

  const minimapViewportPercent = useMemo(() => {
    if (visibleItems.length === 0) return { top: 0, height: 100 }
    const viewH = containerHeight
    const totalH = visibleItems.length * rowHeight
    if (totalH === 0) return { top: 0, height: 100 }
    const top = (scrollTop / totalH) * 100
    const height = Math.min(100, (viewH / totalH) * 100)
    return { top: Math.max(0, Math.min(100 - height, top)), height }
  }, [scrollTop, containerHeight, visibleItems.length, rowHeight])

  /* ── Comments indexed by line ──────────────────────────── */

  const commentsByLine = useMemo(() => {
    const map = new Map<string, ReviewComment[]>()
    for (const c of comments) {
      const key = `${c.side}:${c.lineNumber}`
      const arr = map.get(key) || []
      arr.push(c)
      map.set(key, arr)
    }
    return map
  }, [comments])

  /* ── Styles ────────────────────────────────────────────── */

  const lineStyle = (type: DiffLineType, isCurrentChange: boolean): CSSProperties => {
    const base: CSSProperties = {
      display: 'flex',
      alignItems: 'stretch',
      height: rowHeight,
      lineHeight: `${rowHeight}px`,
      fontSize: 12,
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      whiteSpace: 'pre',
      overflow: 'hidden',
      borderLeft: 'none',
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
    } else {
      base.borderLeft = `${GUTTER_WIDTH}px solid transparent`
    }

    if (isCurrentChange) {
      base.outline = '1px solid var(--accent-blue, #58a6ff)'
      base.outlineOffset = -1
    }

    return base
  }

  const lineNumberStyle: CSSProperties = {
    width: LINE_NUMBER_WIDTH,
    minWidth: LINE_NUMBER_WIDTH,
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

  const headerBtnStyle: CSSProperties = {
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

  const renderLineContent = (
    line: DiffLine,
    side: 'old' | 'new',
  ): React.ReactNode => {
    if (line.type === 'modified') {
      const segments = side === 'old' ? line.charSegments : line.pairedCharSegments
      const content = side === 'old' ? line.content : (line.pairedContent ?? '')
      const highlightColor =
        side === 'old'
          ? 'var(--diff-removed-char-bg, rgba(248,81,73,0.4))'
          : 'var(--diff-added-char-bg, rgba(63,185,80,0.4))'

      if (segments && segments.length > 0) {
        return (
          <CharHighlightText
            segments={segments}
            highlightColor={highlightColor}
            language={language}
          />
        )
      }
      return <SyntaxText text={content} language={language} />
    }
    return <SyntaxText text={line.content} language={language} />
  }

  const renderCommentSection = (lineNo: number, side: 'old' | 'new') => {
    const key = `${side}:${lineNo}`
    const lineComments = commentsByLine.get(key) || []
    const isCommenting = commentingLine?.line === lineNo && commentingLine?.side === side

    if (lineComments.length === 0 && !isCommenting) return null

    return (
      <div style={{ width: '100%' }}>
        {lineComments.map((c) => (
          <CommentBubble key={c.id} comment={c} />
        ))}
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
      onClick={() => toggleCollapsedRegion(regionIndex)}
      title="Click to expand"
    >
      <ChevronsUpDown size={12} />
      <span>{region.lineCount} lines hidden</span>
      <ChevronRight size={12} />
    </div>
  )

  const renderHunkActions = (lineIndex: number) => {
    if (readOnly) return null
    const hunkIdx = getHunkForLine(lineIndex)
    if (hunkIdx === -1) return null
    const hunk = hunks[hunkIdx]

    // Only show actions on the first line of each hunk
    if (lineIndex !== hunk.startIndex) return null

    const isStaged = stagedHunks.has(hunk.id)

    return (
      <div
        style={{
          position: 'absolute',
          right: MINIMAP_WIDTH + 8,
          top: 0,
          display: 'flex',
          gap: 2,
          zIndex: 5,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); toggleHunkStaged(hunkIdx) }}
          style={{
            ...headerBtnStyle,
            width: 'auto',
            height: 18,
            padding: '0 6px',
            fontSize: 10,
            fontWeight: 500,
            borderRadius: 3,
            background: isStaged
              ? 'rgba(63,185,80,0.15)'
              : 'rgba(255,255,255,0.06)',
            color: isStaged
              ? 'var(--diff-added-border, #3fb950)'
              : 'var(--text-primary, #cdd6f4)',
            opacity: 1,
            gap: 3,
          }}
          title={isStaged ? 'Unstage hunk' : 'Stage hunk'}
        >
          {isStaged ? <Check size={10} /> : <Plus size={10} />}
          {isStaged ? 'Staged' : 'Stage'}
        </button>
        {onAddComment && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const line = diffLines[lineIndex]
              const lineNo = line.newLineNo ?? line.oldLineNo ?? 0
              const side = line.newLineNo ? 'new' : 'old'
              setCommentingLine({ line: lineNo, side })
            }}
            style={{
              ...headerBtnStyle,
              width: 18,
              height: 18,
              borderRadius: 3,
              background: 'rgba(255,255,255,0.06)',
              opacity: 1,
            }}
            title="Add comment"
          >
            <MessageSquare size={10} />
          </button>
        )}
      </div>
    )
  }

  /* ── Render: inline (unified) mode ─────────────────────── */

  const renderInlineLine = (item: VisibleItem, idx: number) => {
    if (item.type === 'collapsed' && item.region && item.regionIndex != null) {
      return renderCollapsedItem(item.region, item.regionIndex)
    }

    const line = item.line!
    const lineIndex = item.lineIndex!
    const isCurrentChange =
      changeIndices.length > 0 &&
      currentChangeIdx < changeIndices.length &&
      changeIndices[currentChangeIdx] === lineIndex

    const prefix =
      line.type === 'added'
        ? '+'
        : line.type === 'removed'
          ? '-'
          : line.type === 'modified'
            ? '~'
            : ' '

    const prefixColor =
      line.type === 'added'
        ? 'var(--diff-added-border, #3fb950)'
        : line.type === 'removed'
          ? 'var(--diff-removed-border, #f85149)'
          : line.type === 'modified'
            ? 'var(--diff-modified-border, #e3b341)'
            : 'transparent'

    const lineNo = line.oldLineNo ?? line.newLineNo ?? ''
    const lineNoRight = line.type === 'modified' ? (line.newLineNo ?? '') : (line.newLineNo ?? '')
    const lineNoLeft = line.oldLineNo ?? ''

    // For modified lines in inline mode, render both old and new lines
    if (line.type === 'modified') {
      return (
        <div key={`inline-${lineIndex}`}>
          {/* Old (removed) version */}
          <div style={lineStyle('removed', isCurrentChange)}>
            <span style={lineNumberStyle}>{lineNoLeft}</span>
            <span style={{ ...lineNumberStyle, opacity: 0.3 }}>&mdash;</span>
            <span
              style={{
                width: 16,
                minWidth: 16,
                textAlign: 'center',
                color: prefixColor,
                fontWeight: 700,
                userSelect: 'none',
              }}
            >
              -
            </span>
            <span style={lineContentStyle}>
              {renderLineContent(line, 'old')}
            </span>
            {renderHunkActions(lineIndex)}
          </div>
          {/* New (added) version */}
          <div style={lineStyle('added', false)}>
            <span style={{ ...lineNumberStyle, opacity: 0.3 }}>&mdash;</span>
            <span style={lineNumberStyle}>{lineNoRight}</span>
            <span
              style={{
                width: 16,
                minWidth: 16,
                textAlign: 'center',
                color: 'var(--diff-added-border, #3fb950)',
                fontWeight: 700,
                userSelect: 'none',
              }}
            >
              +
            </span>
            <span style={lineContentStyle}>
              {renderLineContent(line, 'new')}
            </span>
          </div>
          {renderCommentSection(line.oldLineNo ?? 0, 'old')}
          {renderCommentSection(line.newLineNo ?? 0, 'new')}
        </div>
      )
    }

    return (
      <div key={`inline-${lineIndex}`} style={{ position: 'relative' }}>
        <div style={lineStyle(line.type, isCurrentChange)}>
          <span style={lineNumberStyle}>{lineNoLeft || ''}</span>
          <span style={lineNumberStyle}>{lineNoRight || ''}</span>
          <span
            style={{
              width: 16,
              minWidth: 16,
              textAlign: 'center',
              color: prefixColor,
              fontWeight: 700,
              userSelect: 'none',
            }}
          >
            {prefix}
          </span>
          <span style={lineContentStyle}>
            {renderLineContent(line, line.type === 'removed' ? 'old' : 'new')}
          </span>
          {renderHunkActions(lineIndex)}
        </div>
        {line.oldLineNo && renderCommentSection(line.oldLineNo, 'old')}
        {line.newLineNo && renderCommentSection(line.newLineNo, 'new')}
      </div>
    )
  }

  /* ── Render: split (side-by-side) mode ─────────────────── */

  const renderSplitLine = (item: VisibleItem, idx: number) => {
    if (item.type === 'collapsed' && item.region && item.regionIndex != null) {
      return renderCollapsedItem(item.region, item.regionIndex)
    }

    const line = item.line!
    const lineIndex = item.lineIndex!
    const isCurrentChange =
      changeIndices.length > 0 &&
      currentChangeIdx < changeIndices.length &&
      changeIndices[currentChangeIdx] === lineIndex

    // Left side (old)
    const renderLeft = () => {
      if (line.type === 'added') {
        return (
          <div
            style={{
              ...lineStyle('unchanged', false),
              opacity: 0.3,
              flex: 1,
            }}
          >
            <span style={lineNumberStyle} />
            <span style={lineContentStyle} />
          </div>
        )
      }

      const leftType: DiffLineType =
        line.type === 'modified' ? 'removed' : line.type

      return (
        <div style={{ ...lineStyle(leftType, isCurrentChange), flex: 1 }}>
          <span style={lineNumberStyle}>{line.oldLineNo ?? ''}</span>
          <span style={lineContentStyle}>
            {renderLineContent(line, 'old')}
          </span>
        </div>
      )
    }

    // Right side (new)
    const renderRight = () => {
      if (line.type === 'removed') {
        return (
          <div
            style={{
              ...lineStyle('unchanged', false),
              opacity: 0.3,
              flex: 1,
            }}
          >
            <span style={lineNumberStyle} />
            <span style={lineContentStyle} />
          </div>
        )
      }

      const rightType: DiffLineType =
        line.type === 'modified' ? 'added' : line.type

      const rightContent = line.type === 'modified' ? (line.pairedContent ?? '') : line.content
      const rightLineNo = line.type === 'modified' ? (line.newLineNo ?? '') : (line.newLineNo ?? '')

      return (
        <div style={{ ...lineStyle(rightType, isCurrentChange), flex: 1 }}>
          <span style={lineNumberStyle}>{rightLineNo}</span>
          <span style={lineContentStyle}>
            {line.type === 'modified'
              ? renderLineContent(line, 'new')
              : <SyntaxText text={rightContent} language={language} />
            }
          </span>
        </div>
      )
    }

    return (
      <div key={`split-${lineIndex}`} style={{ position: 'relative' }}>
        <div style={{ display: 'flex' }}>
          {renderLeft()}
          <div
            style={{
              width: 1,
              background: 'var(--border-color, #333)',
              flexShrink: 0,
            }}
          />
          {renderRight()}
          {renderHunkActions(lineIndex)}
        </div>
        {line.oldLineNo && renderCommentSection(line.oldLineNo, 'old')}
        {line.newLineNo && renderCommentSection(line.newLineNo, 'new')}
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

    const conflictHeaderStyle = (side: MergeSide): CSSProperties => ({
      padding: '4px 8px',
      fontSize: 10,
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.5px',
      background:
        side === 'base'
          ? 'var(--diff-conflict-base-bg, rgba(88,166,255,0.12))'
          : side === 'ours'
            ? 'var(--diff-conflict-ours-bg, rgba(63,185,80,0.12))'
            : 'var(--diff-conflict-theirs-bg, rgba(248,81,73,0.12))',
      color: 'var(--text-primary, #cdd6f4)',
      borderBottom: '1px solid var(--border-color, #333)',
    })

    return (
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Base column */}
        <div style={columnStyle}>
          <div style={conflictHeaderStyle('base')}>Base</div>
          <div
            style={{
              overflow: 'auto',
              height: '100%',
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
            }}
          >
            {mergeRegions.map((region, ri) => (
              <div key={`base-${ri}`}>
                {region.type === 'conflict' && (
                  <div
                    style={{
                      background: 'var(--diff-conflict-base-bg, rgba(88,166,255,0.12))',
                      borderLeft: '3px solid var(--accent-blue, #58a6ff)',
                      padding: '1px 0',
                    }}
                  >
                    {region.baseLines.map((ln, li) => (
                      <div
                        key={li}
                        style={{
                          height: rowHeight,
                          lineHeight: `${rowHeight}px`,
                          paddingLeft: 8,
                          whiteSpace: 'pre',
                          overflow: 'hidden',
                        }}
                      >
                        <SyntaxText text={ln} language={language} />
                      </div>
                    ))}
                    {region.baseLines.length === 0 && (
                      <div
                        style={{
                          height: rowHeight,
                          lineHeight: `${rowHeight}px`,
                          paddingLeft: 8,
                          opacity: 0.3,
                          fontStyle: 'italic',
                        }}
                      >
                        (no content)
                      </div>
                    )}
                  </div>
                )}
                {region.type === 'resolved' &&
                  region.baseLines.map((ln, li) => (
                    <div
                      key={li}
                      style={{
                        height: rowHeight,
                        lineHeight: `${rowHeight}px`,
                        paddingLeft: 8,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                      }}
                    >
                      <SyntaxText text={ln} language={language} />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* Ours column */}
        <div style={columnStyle}>
          <div style={conflictHeaderStyle('ours')}>Ours (Current)</div>
          <div
            style={{
              overflow: 'auto',
              height: '100%',
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
            }}
          >
            {mergeRegions.map((region, ri) => (
              <div key={`ours-${ri}`}>
                {region.type === 'conflict' && (
                  <div
                    style={{
                      background: 'var(--diff-conflict-ours-bg, rgba(63,185,80,0.12))',
                      borderLeft: '3px solid var(--diff-added-border, #3fb950)',
                      padding: '1px 0',
                    }}
                  >
                    {region.oursLines.map((ln, li) => (
                      <div
                        key={li}
                        style={{
                          height: rowHeight,
                          lineHeight: `${rowHeight}px`,
                          paddingLeft: 8,
                          whiteSpace: 'pre',
                          overflow: 'hidden',
                        }}
                      >
                        <SyntaxText text={ln} language={language} />
                      </div>
                    ))}
                    {region.oursLines.length === 0 && (
                      <div
                        style={{
                          height: rowHeight,
                          lineHeight: `${rowHeight}px`,
                          paddingLeft: 8,
                          opacity: 0.3,
                          fontStyle: 'italic',
                        }}
                      >
                        (no content)
                      </div>
                    )}
                  </div>
                )}
                {region.type === 'resolved' &&
                  region.oursLines.map((ln, li) => (
                    <div
                      key={li}
                      style={{
                        height: rowHeight,
                        lineHeight: `${rowHeight}px`,
                        paddingLeft: 8,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                      }}
                    >
                      <SyntaxText text={ln} language={language} />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>

        {/* Theirs column */}
        <div style={{ ...columnStyle, borderRight: 'none' }}>
          <div style={conflictHeaderStyle('theirs')}>Theirs (Incoming)</div>
          <div
            style={{
              overflow: 'auto',
              height: '100%',
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
            }}
          >
            {mergeRegions.map((region, ri) => (
              <div key={`theirs-${ri}`}>
                {region.type === 'conflict' && (
                  <div
                    style={{
                      background: 'var(--diff-conflict-theirs-bg, rgba(248,81,73,0.12))',
                      borderLeft: '3px solid var(--diff-removed-border, #f85149)',
                      padding: '1px 0',
                    }}
                  >
                    {region.theirsLines.map((ln, li) => (
                      <div
                        key={li}
                        style={{
                          height: rowHeight,
                          lineHeight: `${rowHeight}px`,
                          paddingLeft: 8,
                          whiteSpace: 'pre',
                          overflow: 'hidden',
                        }}
                      >
                        <SyntaxText text={ln} language={language} />
                      </div>
                    ))}
                    {region.theirsLines.length === 0 && (
                      <div
                        style={{
                          height: rowHeight,
                          lineHeight: `${rowHeight}px`,
                          paddingLeft: 8,
                          opacity: 0.3,
                          fontStyle: 'italic',
                        }}
                      >
                        (no content)
                      </div>
                    )}
                  </div>
                )}
                {region.type === 'resolved' &&
                  region.theirsLines.map((ln, li) => (
                    <div
                      key={li}
                      style={{
                        height: rowHeight,
                        lineHeight: `${rowHeight}px`,
                        paddingLeft: 8,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                      }}
                    >
                      <SyntaxText text={ln} language={language} />
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
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
        if (scrollContainerRef.current) {
          const totalH = visibleItems.length * rowHeight
          scrollContainerRef.current.scrollTop = pct * totalH
        }
      }}
    >
      {/* Viewport indicator */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: `${minimapViewportPercent.top}%`,
          height: `${Math.max(2, minimapViewportPercent.height)}%`,
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

  const renderHeader = () => {
    const changeLabel =
      changeIndices.length === 0
        ? 'No changes'
        : changeIndices.length === 1
          ? '1 change'
          : `${changeIndices.length} changes`

    return (
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
        {/* Original file label */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            opacity: 0.5,
            color: 'var(--text-primary, #cdd6f4)',
          }}
        >
          Original
        </span>
        <span
          style={{
            fontWeight: 500,
            color: 'var(--text-primary, #cdd6f4)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 160,
          }}
          title={originalPath}
        >
          {fileName(originalPath)}
        </span>

        <span style={{ color: 'var(--text-primary, #cdd6f4)', opacity: 0.3, fontSize: 14, margin: '0 2px' }}>
          {'\u2194'}
        </span>

        {/* Modified file label */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            opacity: 0.5,
            color: 'var(--text-primary, #cdd6f4)',
          }}
        >
          Modified
        </span>
        <span
          style={{
            fontWeight: 500,
            color: 'var(--text-primary, #cdd6f4)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 160,
          }}
          title={modifiedPath}
        >
          {fileName(modifiedPath)}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1, minWidth: 8 }} />

        {/* Stats pills */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 8,
            background: 'rgba(63,185,80,0.12)',
            color: 'var(--diff-added-border, #3fb950)',
            whiteSpace: 'nowrap',
          }}
        >
          +{stats.added}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 8,
            background: 'rgba(248,81,73,0.12)',
            color: 'var(--diff-removed-border, #f85149)',
            whiteSpace: 'nowrap',
          }}
        >
          -{stats.removed}
        </span>

        {/* Change count pill */}
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 10,
            background: 'rgba(88,166,255,0.1)',
            color: 'var(--accent-blue, #58a6ff)',
            whiteSpace: 'nowrap',
          }}
        >
          {changeLabel}
        </span>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 18,
            background: 'var(--border-color, #333)',
            margin: '0 2px',
            flexShrink: 0,
          }}
        />

        {/* Change navigation */}
        <button
          onClick={goToPrev}
          disabled={currentChangeIdx <= 0 || changeIndices.length === 0}
          style={{
            ...headerBtnStyle,
            opacity: currentChangeIdx <= 0 || changeIndices.length === 0 ? 0.3 : 0.7,
            cursor: currentChangeIdx <= 0 || changeIndices.length === 0 ? 'default' : 'pointer',
          }}
          title="Previous change (Shift+F7)"
          onMouseEnter={(e) => {
            if (currentChangeIdx > 0 && changeIndices.length > 0) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.opacity = '1'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.opacity =
              currentChangeIdx <= 0 || changeIndices.length === 0 ? '0.3' : '0.7'
          }}
        >
          <ArrowUp size={14} />
        </button>

        {changeIndices.length > 0 && (
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-primary, #cdd6f4)',
              opacity: 0.5,
              minWidth: 28,
              textAlign: 'center',
            }}
          >
            {currentChangeIdx + 1}/{changeIndices.length}
          </span>
        )}

        <button
          onClick={goToNext}
          disabled={currentChangeIdx >= changeIndices.length - 1 || changeIndices.length === 0}
          style={{
            ...headerBtnStyle,
            opacity:
              currentChangeIdx >= changeIndices.length - 1 || changeIndices.length === 0
                ? 0.3
                : 0.7,
            cursor:
              currentChangeIdx >= changeIndices.length - 1 || changeIndices.length === 0
                ? 'default'
                : 'pointer',
          }}
          title="Next change (F7)"
          onMouseEnter={(e) => {
            if (currentChangeIdx < changeIndices.length - 1 && changeIndices.length > 0) {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.opacity = '1'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.opacity =
              currentChangeIdx >= changeIndices.length - 1 || changeIndices.length === 0
                ? '0.3'
                : '0.7'
          }}
        >
          <ArrowDown size={14} />
        </button>

        {/* Divider */}
        <div
          style={{
            width: 1,
            height: 18,
            background: 'var(--border-color, #333)',
            margin: '0 2px',
            flexShrink: 0,
          }}
        />

        {/* View mode toggle */}
        <button
          onClick={() => setViewMode((m) => (m === 'split' ? 'inline' : 'split'))}
          style={{
            ...headerBtnStyle,
            width: 'auto',
            padding: '0 6px',
            gap: 4,
            fontSize: 10,
            fontWeight: 500,
          }}
          title={viewMode === 'split' ? 'Switch to inline diff' : 'Switch to side-by-side diff'}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.opacity = '0.7'
          }}
        >
          {viewMode === 'split' ? <Rows2 size={14} /> : <Columns size={14} />}
          <span>{viewMode === 'split' ? 'Inline' : 'Split'}</span>
        </button>

        {/* Three-way merge toggle */}
        {threeWay && (
          <button
            onClick={() => setMergeViewActive((v) => !v)}
            style={{
              ...headerBtnStyle,
              width: 'auto',
              padding: '0 6px',
              gap: 4,
              fontSize: 10,
              fontWeight: 500,
              background: mergeViewActive ? 'rgba(88,166,255,0.12)' : 'transparent',
              color: mergeViewActive ? 'var(--accent-blue, #58a6ff)' : 'var(--text-primary, #cdd6f4)',
              opacity: 1,
            }}
            title={mergeViewActive ? 'Hide merge view' : 'Show three-way merge'}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = mergeViewActive
                ? 'rgba(88,166,255,0.18)'
                : 'rgba(255,255,255,0.08)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = mergeViewActive
                ? 'rgba(88,166,255,0.12)'
                : 'transparent'
            }}
          >
            <GitMerge size={14} />
            <span>3-Way</span>
          </button>
        )}

        {/* Copy buttons */}
        <button
          onClick={() => copySide('old')}
          style={{
            ...headerBtnStyle,
            width: 'auto',
            padding: '0 6px',
            gap: 3,
            fontSize: 10,
          }}
          title="Copy original content"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.opacity = '0.7'
          }}
        >
          <Copy size={11} />
          <span>Old</span>
        </button>
        <button
          onClick={() => copySide('new')}
          style={{
            ...headerBtnStyle,
            width: 'auto',
            padding: '0 6px',
            gap: 3,
            fontSize: 10,
          }}
          title="Copy modified content"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.opacity = '0.7'
          }}
        >
          <Copy size={11} />
          <span>New</span>
        </button>

        {/* Close button */}
        {onClose && (
          <>
            <div
              style={{
                width: 1,
                height: 18,
                background: 'var(--border-color, #333)',
                margin: '0 2px',
                flexShrink: 0,
              }}
            />
            <button
              onClick={onClose}
              style={headerBtnStyle}
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
  }

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
      {/* Header */}
      {renderHeader()}

      {/* Content area */}
      {mergeViewActive && threeWay ? (
        renderMergeView()
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Main scroll area */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflow: 'auto',
              position: 'relative',
            }}
          >
            {/* Virtual scroll spacer */}
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: offsetY,
                  left: 0,
                  right: 0,
                }}
              >
                {visibleSlice.map((item, idx) =>
                  viewMode === 'inline'
                    ? renderInlineLine(item, startIdx + idx)
                    : renderSplitLine(item, startIdx + idx),
                )}
              </div>
            </div>

            {/* Empty state */}
            {diffLines.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  opacity: 0.4,
                  fontSize: 13,
                }}
              >
                No content to diff
              </div>
            )}

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

          {/* Minimap */}
          {renderMinimap()}
        </div>
      )}
    </div>
  )
}
