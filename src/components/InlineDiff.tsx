import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties, type ReactNode } from 'react'
import { Check, X, ChevronDown, ChevronUp, ArrowUp, ArrowDown, ChevronsDown, Copy, ChevronsUp } from 'lucide-react'

/* ── CSS Variable Declarations ─────────────────────────── */

/**
 * CSS variables used for theming (should be set on a parent element):
 *
 * --diff-bg-added:           background for added lines (default: rgba(35, 134, 54, 0.15))
 * --diff-bg-removed:         background for removed lines (default: rgba(218, 54, 51, 0.15))
 * --diff-bg-added-highlight: character-level highlight for added chars (default: rgba(63,185,80,0.35))
 * --diff-bg-removed-highlight: character-level highlight for removed chars (default: rgba(248,81,73,0.35))
 * --diff-border-added:       left border for added lines (default: #3fb950)
 * --diff-border-removed:     left border for removed lines (default: #f85149)
 * --diff-color-added:        text color for +N badge (default: #3fb950)
 * --diff-color-removed:      text color for -N badge (default: #f85149)
 * --diff-syntax-keyword:     syntax highlight color for keywords (default: #569cd6)
 * --diff-syntax-string:      syntax highlight color for strings (default: #ce9178)
 * --diff-syntax-comment:     syntax highlight color for comments (default: #6a9955)
 * --diff-syntax-number:      syntax highlight color for numbers (default: #b5cea8)
 * --diff-syntax-punctuation: syntax highlight color for punctuation (default: #d4d4d4)
 * --diff-minimap-added:      minimap marker color for added lines (default: #3fb950)
 * --diff-minimap-removed:    minimap marker color for removed lines (default: #f85149)
 * --diff-minimap-bg:         minimap background (default: rgba(255,255,255,0.03))
 * --diff-minimap-viewport:   minimap viewport indicator (default: rgba(88,166,255,0.2))
 */

/* ── Types ──────────────────────────────────────────────── */

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
  oldLineNo?: number
  newLineNo?: number
}

/** A hunk is a contiguous group of changed lines (with optional surrounding context) */
interface Hunk {
  startIndex: number
  endIndex: number // exclusive
}

/** A segment of text with optional highlight for word-level diff */
interface WordSegment {
  text: string
  highlight: boolean
}

export interface InlineDiffProps {
  originalCode: string
  suggestedCode: string
  language: string
  onAccept: (newCode: string) => void
  onReject: () => void
  /** Per-hunk accept/reject callbacks (optional, for AI apply context) */
  onAcceptHunk?: (hunkIndex: number, newCode: string) => void
  onRejectHunk?: (hunkIndex: number) => void
  position: { top: number; left: number }
  visible: boolean
}

/* ── Diff computation ───────────────────────────────────── */

function computeDiff(original: string, suggested: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = suggested.split('\n')

  const m = oldLines.length
  const n = newLines.length

  // Build LCS table
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

  // Backtrack to produce diff lines
  const stack: DiffLine[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'unchanged', content: oldLines[i - 1], oldLineNo: i, newLineNo: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', content: newLines[j - 1], newLineNo: j })
      j--
    } else {
      stack.push({ type: 'removed', content: oldLines[i - 1], oldLineNo: i })
      i--
    }
  }

  // Reverse to get correct order
  const result: DiffLine[] = []
  for (let k = stack.length - 1; k >= 0; k--) {
    result.push(stack[k])
  }

  return result
}

/* ── Character-level diff ──────────────────────────────── */

function computeCharDiff(oldText: string, newText: string): { oldSegs: WordSegment[]; newSegs: WordSegment[] } {
  // Character-level: tokenize into individual characters for fine-grained highlighting
  const oldChars = Array.from(oldText)
  const newChars = Array.from(newText)

  const m = oldChars.length
  const n = newChars.length

  // For very long lines, fall back to word-level diff for performance
  if (m > 500 || n > 500) {
    return computeWordDiff(oldText, newText)
  }

  // LCS on characters
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

  // Backtrack
  const oldMarked = new Array(m).fill(true)
  const newMarked = new Array(n).fill(true)
  let ii = m
  let jj = n
  while (ii > 0 && jj > 0) {
    if (oldChars[ii - 1] === newChars[jj - 1]) {
      oldMarked[ii - 1] = false
      newMarked[jj - 1] = false
      ii--
      jj--
    } else if (dp[ii - 1][jj] >= dp[ii][jj - 1]) {
      ii--
    } else {
      jj--
    }
  }

  // Merge consecutive segments
  const merge = (chars: string[], marked: boolean[]): WordSegment[] => {
    const segs: WordSegment[] = []
    for (let i = 0; i < chars.length; i++) {
      if (segs.length > 0 && segs[segs.length - 1].highlight === marked[i]) {
        segs[segs.length - 1].text += chars[i]
      } else {
        segs.push({ text: chars[i], highlight: marked[i] })
      }
    }
    return segs
  }

  return { oldSegs: merge(oldChars, oldMarked), newSegs: merge(newChars, newMarked) }
}

/* ── Word-level diff ────────────────────────────────────── */

function computeWordDiff(oldText: string, newText: string): { oldSegs: WordSegment[]; newSegs: WordSegment[] } {
  // Tokenize into words and whitespace
  const tokenize = (s: string): string[] => {
    const tokens: string[] = []
    let current = ''
    for (const ch of s) {
      const isWs = ch === ' ' || ch === '\t'
      const isAlnum = /[\w$]/.test(ch)
      if (current.length === 0) {
        current = ch
      } else {
        const prevIsWs = current[current.length - 1] === ' ' || current[current.length - 1] === '\t'
        const prevIsAlnum = /[\w$]/.test(current[current.length - 1])
        if ((isWs && prevIsWs) || (isAlnum && prevIsAlnum)) {
          current += ch
        } else {
          tokens.push(current)
          current = ch
        }
      }
    }
    if (current) tokens.push(current)
    return tokens
  }

  const oldTokens = tokenize(oldText)
  const newTokens = tokenize(newText)

  // LCS on tokens
  const m = oldTokens.length
  const n = newTokens.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack
  const oldMarked = new Array(m).fill(true) // true = highlighted (changed)
  const newMarked = new Array(n).fill(true)
  let ii = m
  let jj = n
  while (ii > 0 && jj > 0) {
    if (oldTokens[ii - 1] === newTokens[jj - 1]) {
      oldMarked[ii - 1] = false
      newMarked[jj - 1] = false
      ii--
      jj--
    } else if (dp[ii - 1][jj] >= dp[ii][jj - 1]) {
      ii--
    } else {
      jj--
    }
  }

  // Merge consecutive segments
  const merge = (tokens: string[], marked: boolean[]): WordSegment[] => {
    const segs: WordSegment[] = []
    for (let i = 0; i < tokens.length; i++) {
      if (segs.length > 0 && segs[segs.length - 1].highlight === marked[i]) {
        segs[segs.length - 1].text += tokens[i]
      } else {
        segs.push({ text: tokens[i], highlight: marked[i] })
      }
    }
    return segs
  }

  return { oldSegs: merge(oldTokens, oldMarked), newSegs: merge(newTokens, newMarked) }
}

/* ── Syntax highlighting (basic) ────────────────────────── */

const KEYWORD_SET = new Set([
  'import', 'export', 'from', 'default', 'function', 'const', 'let', 'var',
  'if', 'else', 'return', 'for', 'while', 'do', 'switch', 'case', 'break',
  'continue', 'class', 'extends', 'new', 'this', 'super', 'try', 'catch',
  'finally', 'throw', 'typeof', 'instanceof', 'in', 'of', 'async', 'await',
  'yield', 'void', 'delete', 'true', 'false', 'null', 'undefined',
  'interface', 'type', 'enum', 'implements', 'abstract', 'static', 'readonly',
  'public', 'private', 'protected', 'as', 'is', 'keyof', 'never', 'any',
  'string', 'number', 'boolean', 'object', 'symbol', 'bigint',
  'def', 'self', 'None', 'True', 'False', 'lambda', 'with', 'pass', 'raise',
  'except', 'elif', 'and', 'or', 'not', 'print', 'fn', 'mut', 'pub', 'use',
  'struct', 'impl', 'trait', 'mod', 'crate', 'match', 'loop', 'move',
])

interface SyntaxToken {
  text: string
  kind: 'keyword' | 'string' | 'comment' | 'number' | 'punctuation' | 'plain'
}

function tokenizeSyntax(text: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = []
  // Regex-based tokenizer: strings, comments, numbers, keywords, punctuation, rest
  const regex = /(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[a-zA-Z_$][\w$]*|[^\s\w]|\s+)/gm
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const t = match[0]
    if (t.startsWith('//') || t.startsWith('#') || t.startsWith('/*')) {
      tokens.push({ text: t, kind: 'comment' })
    } else if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith('`') && t.endsWith('`')) ||
      t.startsWith('"""') || t.startsWith("'''")
    ) {
      tokens.push({ text: t, kind: 'string' })
    } else if (/^\d/.test(t)) {
      tokens.push({ text: t, kind: 'number' })
    } else if (KEYWORD_SET.has(t)) {
      tokens.push({ text: t, kind: 'keyword' })
    } else if (/^[^\s\w]$/.test(t)) {
      tokens.push({ text: t, kind: 'punctuation' })
    } else {
      tokens.push({ text: t, kind: 'plain' })
    }
  }
  return tokens
}

/** Map syntax token kind to CSS variable with fallback */
const syntaxColorVar: Record<SyntaxToken['kind'], string> = {
  keyword: 'var(--diff-syntax-keyword, #569cd6)',
  string: 'var(--diff-syntax-string, #ce9178)',
  comment: 'var(--diff-syntax-comment, #6a9955)',
  number: 'var(--diff-syntax-number, #b5cea8)',
  punctuation: 'var(--diff-syntax-punctuation, #d4d4d4)',
  plain: 'inherit',
}

function renderSyntaxHighlighted(text: string): ReactNode {
  const tokens = tokenizeSyntax(text)
  if (tokens.length === 0) return text
  return tokens.map((tok, i) => (
    <span key={i} style={{ color: syntaxColorVar[tok.kind] }}>
      {tok.text}
    </span>
  ))
}

/** Render word/char segments with syntax highlighting inside each segment */
function renderWordSegments(
  segments: WordSegment[],
  highlightColor: string,
): ReactNode {
  return segments.map((seg, i) => {
    const inner = renderSyntaxHighlighted(seg.text)
    if (seg.highlight) {
      return (
        <span
          key={i}
          style={{
            background: highlightColor,
            borderRadius: 2,
          }}
        >
          {inner}
        </span>
      )
    }
    return <span key={i}>{inner}</span>
  })
}

/* ── Hunk detection ─────────────────────────────────────── */

function detectHunks(lines: DiffLine[]): Hunk[] {
  const hunks: Hunk[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'unchanged') {
      const start = i
      while (i < lines.length && lines[i].type !== 'unchanged') i++
      hunks.push({ startIndex: start, endIndex: i })
    } else {
      i++
    }
  }
  return hunks
}

/* ── Collapsible region detection ───────────────────────── */

interface DisplaySegment {
  kind: 'lines' | 'collapsed'
  startIndex: number
  endIndex: number // exclusive
  lineCount: number // for collapsed: how many lines hidden
  regionId?: number // track region for expand/collapse
}

const COLLAPSE_THRESHOLD = 5

function buildDisplaySegments(
  lines: DiffLine[],
  expandedRegions: Set<number>,
): DisplaySegment[] {
  const segments: DisplaySegment[] = []
  let i = 0
  let regionId = 0
  while (i < lines.length) {
    if (lines[i].type === 'unchanged') {
      // Count consecutive unchanged
      const start = i
      while (i < lines.length && lines[i].type === 'unchanged') i++
      const count = i - start
      const currentRegionId = regionId
      if (count >= COLLAPSE_THRESHOLD && !expandedRegions.has(currentRegionId)) {
        // Show first 2, collapse middle, show last 2
        if (start < i) {
          const showTop = Math.min(2, count)
          const showBottom = Math.min(2, count - showTop)
          const collapsedCount = count - showTop - showBottom
          if (showTop > 0) {
            segments.push({ kind: 'lines', startIndex: start, endIndex: start + showTop, lineCount: showTop })
          }
          if (collapsedCount > 0) {
            segments.push({
              kind: 'collapsed',
              startIndex: start + showTop,
              endIndex: start + showTop + collapsedCount,
              lineCount: collapsedCount,
              regionId: currentRegionId,
            })
          }
          if (showBottom > 0) {
            segments.push({
              kind: 'lines',
              startIndex: i - showBottom,
              endIndex: i,
              lineCount: showBottom,
            })
          }
        }
      } else {
        segments.push({ kind: 'lines', startIndex: start, endIndex: i, lineCount: count })
      }
      regionId++
    } else {
      const start = i
      while (i < lines.length && lines[i].type !== 'unchanged') i++
      segments.push({ kind: 'lines', startIndex: start, endIndex: i, lineCount: i - start })
    }
  }
  return segments
}

/* ── Paired lines for split view ────────────────────────── */

interface SplitPair {
  left: DiffLine | null
  right: DiffLine | null
  index: number // original index in diffLines
}

function buildSplitPairs(lines: DiffLine[]): SplitPair[] {
  const pairs: SplitPair[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type === 'unchanged') {
      pairs.push({ left: lines[i], right: lines[i], index: i })
      i++
    } else {
      // Collect contiguous removed/added
      const removed: { line: DiffLine; idx: number }[] = []
      const added: { line: DiffLine; idx: number }[] = []
      const startI = i
      while (i < lines.length && lines[i].type !== 'unchanged') {
        if (lines[i].type === 'removed') removed.push({ line: lines[i], idx: i })
        else added.push({ line: lines[i], idx: i })
        i++
      }
      const maxLen = Math.max(removed.length, added.length)
      for (let k = 0; k < maxLen; k++) {
        pairs.push({
          left: k < removed.length ? removed[k].line : null,
          right: k < added.length ? added[k].line : null,
          index: startI + k,
        })
      }
    }
  }
  return pairs
}

/* ── Minimap Component ──────────────────────────────────── */

function DiffMinimap({
  diffLines,
  bodyRef,
  totalHeight,
}: {
  diffLines: DiffLine[]
  bodyRef: React.RefObject<HTMLDivElement | null>
  totalHeight: number
}) {
  const minimapRef = useRef<HTMLDivElement>(null)
  const [viewportTop, setViewportTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(100)
  const minimapHeight = totalHeight > 0 ? Math.min(totalHeight, 400) : 200
  const lineHeight = diffLines.length > 0 ? minimapHeight / diffLines.length : 1

  // Update viewport indicator on scroll
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const onScroll = () => {
      const scrollRatio = body.scrollTop / (body.scrollHeight || 1)
      const visibleRatio = body.clientHeight / (body.scrollHeight || 1)
      setViewportTop(scrollRatio * minimapHeight)
      setViewportHeight(Math.max(visibleRatio * minimapHeight, 10))
    }
    onScroll()
    body.addEventListener('scroll', onScroll, { passive: true })
    return () => body.removeEventListener('scroll', onScroll)
  }, [bodyRef, minimapHeight])

  // Click to scroll
  const handleMinimapClick = useCallback(
    (e: React.MouseEvent) => {
      const body = bodyRef.current
      const minimap = minimapRef.current
      if (!body || !minimap) return
      const rect = minimap.getBoundingClientRect()
      const clickRatio = (e.clientY - rect.top) / rect.height
      body.scrollTop = clickRatio * body.scrollHeight - body.clientHeight / 2
    },
    [bodyRef],
  )

  if (diffLines.length < 10) return null

  return (
    <div
      ref={minimapRef}
      onClick={handleMinimapClick}
      style={{
        width: 40,
        minWidth: 40,
        height: minimapHeight,
        background: 'var(--diff-minimap-bg, rgba(255,255,255,0.03))',
        borderLeft: '1px solid var(--border)',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        overflow: 'hidden',
      }}
      title="Click to navigate"
    >
      {/* Render change markers */}
      {diffLines.map((line, i) => {
        if (line.type === 'unchanged') return null
        const top = (i / diffLines.length) * minimapHeight
        const h = Math.max(lineHeight, 1.5)
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top,
              left: line.type === 'removed' ? 2 : 20,
              width: 16,
              height: h,
              background:
                line.type === 'added'
                  ? 'var(--diff-minimap-added, #3fb950)'
                  : 'var(--diff-minimap-removed, #f85149)',
              opacity: 0.7,
              borderRadius: 1,
            }}
          />
        )
      })}
      {/* Viewport indicator */}
      <div
        style={{
          position: 'absolute',
          top: viewportTop,
          left: 0,
          right: 0,
          height: viewportHeight,
          background: 'var(--diff-minimap-viewport, rgba(88,166,255,0.2))',
          border: '1px solid rgba(88,166,255,0.3)',
          borderRadius: 2,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

/* ── Component ──────────────────────────────────────────── */

export default function InlineDiff({
  originalCode,
  suggestedCode,
  language,
  onAccept,
  onReject,
  onAcceptHunk,
  onRejectHunk,
  position,
  visible,
}: InlineDiffProps) {
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified')
  const [fadeIn, setFadeIn] = useState(false)
  const [expandedRegions, setExpandedRegions] = useState<Set<number>>(new Set())
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const hunkRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Compute diff lines
  const diffLines = useMemo(() => computeDiff(originalCode, suggestedCode), [originalCode, suggestedCode])

  // Statistics: additions, deletions, changed lines (adjacent removed+added pairs)
  const stats = useMemo(() => {
    let added = 0
    let removed = 0
    let changedPairs = 0
    for (let i = 0; i < diffLines.length; i++) {
      if (diffLines[i].type === 'added') added++
      if (diffLines[i].type === 'removed') removed++
      if (
        diffLines[i].type === 'removed' &&
        i + 1 < diffLines.length &&
        diffLines[i + 1].type === 'added'
      ) {
        changedPairs++
      }
    }
    const netChange = added - removed
    return { added, removed, changedPairs, netChange }
  }, [diffLines])

  // Detect hunks for navigation and per-hunk actions
  const hunks = useMemo(() => detectHunks(diffLines), [diffLines])

  // Display segments (with collapsing)
  const displaySegments = useMemo(
    () => buildDisplaySegments(diffLines, expandedRegions),
    [diffLines, expandedRegions],
  )

  // Split pairs
  const splitPairs = useMemo(() => buildSplitPairs(diffLines), [diffLines])

  // Precompute character-level diffs for paired removed+added lines
  const charDiffs = useMemo(() => {
    const map = new Map<string, { oldSegs: WordSegment[]; newSegs: WordSegment[] }>()
    // Find adjacent removed-then-added pairs
    for (let i = 0; i < diffLines.length - 1; i++) {
      if (diffLines[i].type === 'removed' && diffLines[i + 1].type === 'added') {
        const key = `${i}:${i + 1}`
        map.set(key, computeCharDiff(diffLines[i].content, diffLines[i + 1].content))
      }
    }
    // Also handle split pairs
    for (const pair of splitPairs) {
      if (pair.left && pair.right && pair.left.type === 'removed' && pair.right.type === 'added') {
        const key = `split:${pair.index}`
        if (!map.has(key)) {
          map.set(key, computeCharDiff(pair.left.content, pair.right.content))
        }
      }
    }
    return map
  }, [diffLines, splitPairs])

  // Collect added/changed lines for copy
  const changedLinesText = useMemo(() => {
    return diffLines
      .filter((l) => l.type === 'added')
      .map((l) => l.content)
      .join('\n')
  }, [diffLines])

  // Fade-in animation
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => setFadeIn(true))
    } else {
      setFadeIn(false)
    }
  }, [visible])

  // Reset state when content changes
  useEffect(() => {
    setExpandedRegions(new Set())
    setCurrentHunkIndex(0)
    setCopyFeedback(false)
  }, [originalCode, suggestedCode])

  // Navigate to hunk
  const scrollToHunk = useCallback(
    (hunkIdx: number) => {
      if (hunkIdx < 0 || hunkIdx >= hunks.length) return
      setCurrentHunkIndex(hunkIdx)
      const el = hunkRefs.current.get(hunkIdx)
      if (el && bodyRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    },
    [hunks.length],
  )

  const goToPrevHunk = useCallback(() => {
    const next = Math.max(0, currentHunkIndex - 1)
    scrollToHunk(next)
  }, [currentHunkIndex, scrollToHunk])

  const goToNextHunk = useCallback(() => {
    const next = Math.min(hunks.length - 1, currentHunkIndex + 1)
    scrollToHunk(next)
  }, [currentHunkIndex, hunks.length, scrollToHunk])

  // Copy changed lines to clipboard
  const handleCopyChanges = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(changedLinesText)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    } catch {
      // Fallback: textarea copy
      const ta = document.createElement('textarea')
      ta.value = changedLinesText
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 2000)
    }
  }, [changedLinesText])

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onReject()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        onAccept(suggestedCode)
      }
      // Alt+Up / Alt+Down for hunk navigation
      if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault()
        goToPrevHunk()
      }
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault()
        goToNextHunk()
      }
      // Ctrl+Shift+C to copy changes
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault()
        handleCopyChanges()
      }
    },
    [visible, onAccept, onReject, suggestedCode, goToPrevHunk, goToNextHunk, handleCopyChanges],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [handleKeyDown])

  // Toggle expand region
  const toggleRegion = useCallback((regionId: number) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev)
      if (next.has(regionId)) next.delete(regionId)
      else next.add(regionId)
      return next
    })
  }, [])

  // Expand all collapsed regions
  const expandAllRegions = useCallback(() => {
    const allIds = new Set<number>()
    for (const seg of displaySegments) {
      if (seg.kind === 'collapsed' && seg.regionId !== undefined) {
        allIds.add(seg.regionId)
      }
    }
    setExpandedRegions((prev) => {
      const next = new Set(prev)
      allIds.forEach((id) => next.add(id))
      return next
    })
  }, [displaySegments])

  // Collapse all regions
  const collapseAllRegions = useCallback(() => {
    setExpandedRegions(new Set())
  }, [])

  // Which hunk does a given line index belong to?
  const getHunkIndex = useCallback(
    (lineIndex: number): number => {
      for (let h = 0; h < hunks.length; h++) {
        if (lineIndex >= hunks[h].startIndex && lineIndex < hunks[h].endIndex) return h
      }
      return -1
    },
    [hunks],
  )

  // Count collapsed regions
  const collapsedCount = useMemo(
    () => displaySegments.filter((s) => s.kind === 'collapsed').length,
    [displaySegments],
  )

  if (!visible) return null

  /* ── Style helpers (using CSS variables) ─────────────── */

  const lineBackground = {
    added: 'var(--diff-bg-added, rgba(35, 134, 54, 0.15))',
    removed: 'var(--diff-bg-removed, rgba(218, 54, 51, 0.15))',
    unchanged: 'transparent',
  }

  const lineBorder = {
    added: '3px solid var(--diff-border-added, #3fb950)',
    removed: '3px solid var(--diff-border-removed, #f85149)',
    unchanged: '3px solid transparent',
  }

  const charHighlight = {
    added: 'var(--diff-bg-added-highlight, rgba(63, 185, 80, 0.35))',
    removed: 'var(--diff-bg-removed-highlight, rgba(248, 81, 73, 0.35))',
  }

  const gutterStyle: CSSProperties = {
    width: 36,
    minWidth: 36,
    textAlign: 'right',
    paddingRight: 8,
    color: 'var(--text-muted)',
    fontSize: 10,
    opacity: 0.5,
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
  }

  const markerStyle = (type: DiffLine['type']): CSSProperties => ({
    width: 16,
    minWidth: 16,
    color:
      type === 'added'
        ? 'var(--diff-color-added, #3fb950)'
        : type === 'removed'
          ? 'var(--diff-color-removed, #f85149)'
          : 'transparent',
    fontWeight: 700,
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
  })

  const contentStyle = (type: DiffLine['type']): CSSProperties => ({
    flex: 1,
    whiteSpace: 'pre',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: type === 'removed' ? 'var(--text-muted)' : 'var(--text-primary)',
    textDecoration: type === 'removed' ? 'line-through' : 'none',
    opacity: type === 'removed' ? 0.7 : 1,
  })

  const btnBase: CSSProperties = {
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    transition: 'all 0.15s',
  }

  const smallBtn: CSSProperties = {
    ...btnBase,
    padding: '2px 6px',
    fontSize: 10,
    fontWeight: 500,
    borderRadius: 3,
    background: 'transparent',
  }

  /* ── Render helpers ─────────────────────────────────────── */

  /** Render the content of a line with syntax highlighting and character-level diff */
  const renderLineContent = (line: DiffLine, lineIndex: number, pairKey?: string): ReactNode => {
    // Check for character-level diff
    if (line.type === 'removed') {
      const wdKey = `${lineIndex}:${lineIndex + 1}`
      const wd = charDiffs.get(wdKey) || (pairKey ? charDiffs.get(pairKey) : undefined)
      if (wd) {
        return renderWordSegments(wd.oldSegs, charHighlight.removed)
      }
    }
    if (line.type === 'added') {
      const wdKey = `${lineIndex - 1}:${lineIndex}`
      const wd = charDiffs.get(wdKey) || (pairKey ? charDiffs.get(pairKey) : undefined)
      if (wd) {
        return renderWordSegments(wd.newSegs, charHighlight.added)
      }
    }
    return renderSyntaxHighlighted(line.content)
  }

  /** Render a single unified line */
  const renderUnifiedLine = (line: DiffLine, idx: number, lineIndex: number) => (
    <div
      key={idx}
      style={{
        display: 'flex',
        background: lineBackground[line.type],
        borderLeft: lineBorder[line.type],
        padding: '0 12px 0 0',
        minHeight: 20,
      }}
    >
      <span style={gutterStyle}>
        {line.type !== 'added' ? line.oldLineNo ?? '' : ''}
      </span>
      <span style={gutterStyle}>
        {line.type !== 'removed' ? line.newLineNo ?? '' : ''}
      </span>
      <span style={markerStyle(line.type)}>
        {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
      </span>
      <span style={contentStyle(line.type)}>
        {renderLineContent(line, lineIndex)}
      </span>
    </div>
  )

  /** Render per-hunk action buttons */
  const renderHunkActions = (hunkIdx: number) => {
    if (!onAcceptHunk && !onRejectHunk) return null
    return (
      <div
        style={{
          position: 'absolute',
          right: 8,
          top: 2,
          display: 'flex',
          gap: 3,
          opacity: 0.7,
          zIndex: 2,
        }}
        className="hunk-actions"
      >
        {onRejectHunk && (
          <button
            onClick={(e) => { e.stopPropagation(); onRejectHunk(hunkIdx) }}
            style={{
              ...smallBtn,
              color: 'var(--diff-color-removed, #f85149)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,81,73,0.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            title="Reject this change"
          >
            <X size={10} /> Reject
          </button>
        )}
        {onAcceptHunk && (
          <button
            onClick={(e) => { e.stopPropagation(); onAcceptHunk(hunkIdx, suggestedCode) }}
            style={{
              ...smallBtn,
              color: 'var(--diff-color-added, #3fb950)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(63,185,80,0.15)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            title="Accept this change"
          >
            <Check size={10} /> Accept
          </button>
        )}
      </div>
    )
  }

  /** Collapsed region indicator with expand button */
  const renderCollapsed = (segment: DisplaySegment) => {
    const regionId = segment.regionId ?? 0
    return (
      <div
        key={`collapsed-${segment.startIndex}`}
        onClick={() => toggleRegion(regionId)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3px 0',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 11,
          background: 'rgba(255,255,255,0.02)',
          borderTop: '1px dashed var(--border)',
          borderBottom: '1px dashed var(--border)',
          userSelect: 'none',
          gap: 6,
          transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
        title="Click to expand"
      >
        <ChevronDown size={12} />
        <span style={{ fontStyle: 'italic', fontSize: 10 }}>
          ... {segment.lineCount} unchanged lines ...
        </span>
        <ChevronDown size={12} />
      </div>
    )
  }

  /** Render unified view body */
  const renderUnifiedBody = () => {
    const elements: ReactNode[] = []

    // Track which hunk each changed line belongs to, to wrap with ref
    let prevHunkIdx = -1

    for (const segment of displaySegments) {
      if (segment.kind === 'collapsed') {
        elements.push(renderCollapsed(segment))
        continue
      }

      for (let i = segment.startIndex; i < segment.endIndex; i++) {
        const line = diffLines[i]
        const hunkIdx = getHunkIndex(i)

        // If entering a new hunk, wrap with a relative-positioned div for hunk actions
        if (hunkIdx >= 0 && hunkIdx !== prevHunkIdx) {
          // Start a new hunk group
          const hunkLines: ReactNode[] = []
          const thisHunkIdx = hunkIdx
          const hunk = hunks[thisHunkIdx]

          // Render all lines in this hunk that fall within this segment
          const hunkEnd = Math.min(hunk.endIndex, segment.endIndex)
          for (let li = i; li < hunkEnd; li++) {
            hunkLines.push(renderUnifiedLine(diffLines[li], li, li))
          }

          elements.push(
            <div
              key={`hunk-${thisHunkIdx}`}
              ref={(el) => {
                if (el) hunkRefs.current.set(thisHunkIdx, el)
              }}
              style={{
                position: 'relative',
                outline: currentHunkIndex === thisHunkIdx ? '1px solid rgba(88,166,255,0.3)' : 'none',
                outlineOffset: -1,
              }}
            >
              {renderHunkActions(thisHunkIdx)}
              {hunkLines}
            </div>,
          )

          i = hunkEnd - 1 // will be incremented by loop
          prevHunkIdx = thisHunkIdx
        } else if (hunkIdx < 0) {
          elements.push(renderUnifiedLine(line, i, i))
          prevHunkIdx = -1
        }
      }
    }

    return <div style={{ padding: '4px 0' }}>{elements}</div>
  }

  /** Render split view body */
  const renderSplitBody = () => {
    const elements: ReactNode[] = []

    for (const pair of splitPairs) {
      const { left, right, index } = pair
      const leftBg = left?.type === 'removed' ? lineBackground.removed : 'transparent'
      const rightBg = right?.type === 'added' ? lineBackground.added : 'transparent'
      const hunkIdx = getHunkIndex(index)

      const pairKey =
        left && right && left.type === 'removed' && right.type === 'added'
          ? `split:${index}`
          : undefined
      // Compute char diff for this pair if applicable
      let leftContent: ReactNode = left ? renderSyntaxHighlighted(left.content) : ''
      let rightContent: ReactNode = right ? renderSyntaxHighlighted(right.content) : ''

      if (pairKey && left && right) {
        const wd = charDiffs.get(pairKey) || computeCharDiff(left.content, right.content)
        leftContent = renderWordSegments(wd.oldSegs, charHighlight.removed)
        rightContent = renderWordSegments(wd.newSegs, charHighlight.added)
      }

      elements.push(
        <div
          key={`split-${index}`}
          ref={hunkIdx >= 0 ? (el) => { if (el && !hunkRefs.current.has(hunkIdx)) hunkRefs.current.set(hunkIdx, el) } : undefined}
          style={{
            display: 'flex',
            minHeight: 20,
            outline:
              hunkIdx >= 0 && currentHunkIndex === hunkIdx
                ? '1px solid rgba(88,166,255,0.2)'
                : 'none',
          }}
        >
          {/* Left side */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              borderRight: '1px solid var(--border)',
              background: leftBg,
              borderLeft: left?.type === 'removed' ? lineBorder.removed : lineBorder.unchanged,
              padding: '0 4px 0 0',
            }}
          >
            <span style={{ ...gutterStyle, width: 32, minWidth: 32 }}>
              {left?.oldLineNo ?? ''}
            </span>
            <span style={{ ...markerStyle(left?.type ?? 'unchanged'), width: 14, minWidth: 14 }}>
              {left?.type === 'removed' ? '-' : ' '}
            </span>
            <span style={contentStyle(left?.type ?? 'unchanged')}>
              {left ? leftContent : ''}
            </span>
          </div>
          {/* Right side */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              background: rightBg,
              borderLeft: right?.type === 'added' ? lineBorder.added : lineBorder.unchanged,
              padding: '0 4px 0 0',
            }}
          >
            <span style={{ ...gutterStyle, width: 32, minWidth: 32 }}>
              {right?.newLineNo ?? ''}
            </span>
            <span style={{ ...markerStyle(right?.type ?? 'unchanged'), width: 14, minWidth: 14 }}>
              {right?.type === 'added' ? '+' : ' '}
            </span>
            <span style={contentStyle(right?.type ?? 'unchanged')}>
              {right ? rightContent : ''}
            </span>
          </div>
        </div>,
      )
    }

    return <div style={{ padding: '4px 0' }}>{elements}</div>
  }

  /* ── Main render ────────────────────────────────────────── */

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        zIndex: 55,
        minWidth: viewMode === 'split' ? 640 : 480,
        maxWidth: viewMode === 'split' ? 900 : 740,
        maxHeight: 520,
        opacity: fadeIn ? 1 : 0,
        transform: fadeIn ? 'translateY(0)' : 'translateY(-6px)',
        transition: 'opacity 0.25s ease-out, transform 0.25s ease-out',
      }}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--accent)',
          borderRadius: 10,
          boxShadow: '0 12px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(88,166,255,0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 520,
        }}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(88,166,255,0.06)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
            AI Suggestion
          </span>

          {/* Diff statistics badges */}
          <span
            style={{
              fontSize: 10,
              color: 'var(--diff-color-added, #3fb950)',
              background: 'rgba(63,185,80,0.12)',
              padding: '1px 6px',
              borderRadius: 3,
              fontWeight: 500,
            }}
          >
            +{stats.added}
          </span>
          <span
            style={{
              fontSize: 10,
              color: 'var(--diff-color-removed, #f85149)',
              background: 'rgba(248,81,73,0.12)',
              padding: '1px 6px',
              borderRadius: 3,
              fontWeight: 500,
            }}
          >
            -{stats.removed}
          </span>
          {stats.netChange !== 0 && (
            <span
              style={{
                fontSize: 9,
                color: 'var(--text-muted)',
                padding: '1px 4px',
                borderRadius: 3,
                fontWeight: 400,
                fontStyle: 'italic',
              }}
            >
              net {stats.netChange > 0 ? '+' : ''}{stats.netChange}
            </span>
          )}

          {/* Hunk navigation with "Change X of Y" */}
          {hunks.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
              {hunks.length > 1 && (
                <button
                  onClick={goToPrevHunk}
                  disabled={currentHunkIndex <= 0}
                  style={{
                    ...smallBtn,
                    color: currentHunkIndex <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
                    opacity: currentHunkIndex <= 0 ? 0.4 : 1,
                  }}
                  title="Previous change (Alt+Up)"
                >
                  <ArrowUp size={12} />
                </button>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 70, textAlign: 'center' }}>
                Change {currentHunkIndex + 1} of {hunks.length}
              </span>
              {hunks.length > 1 && (
                <button
                  onClick={goToNextHunk}
                  disabled={currentHunkIndex >= hunks.length - 1}
                  style={{
                    ...smallBtn,
                    color: currentHunkIndex >= hunks.length - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                    opacity: currentHunkIndex >= hunks.length - 1 ? 0.4 : 1,
                  }}
                  title="Next change (Alt+Down)"
                >
                  <ArrowDown size={12} />
                </button>
              )}
            </div>
          )}

          {/* Expand/Collapse all + Copy + View mode toggle */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center' }}>
            {/* Expand/Collapse all */}
            {collapsedCount > 0 && (
              <button
                onClick={expandAllRegions}
                style={{
                  ...smallBtn,
                  color: 'var(--text-muted)',
                  fontSize: 9,
                  padding: '2px 5px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                title="Expand all collapsed regions"
              >
                <ChevronsDown size={10} /> Expand
              </button>
            )}
            {collapsedCount === 0 && expandedRegions.size > 0 && (
              <button
                onClick={collapseAllRegions}
                style={{
                  ...smallBtn,
                  color: 'var(--text-muted)',
                  fontSize: 9,
                  padding: '2px 5px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                title="Collapse unchanged regions"
              >
                <ChevronsUp size={10} /> Collapse
              </button>
            )}

            {/* Copy changes button */}
            {stats.added > 0 && (
              <button
                onClick={handleCopyChanges}
                style={{
                  ...smallBtn,
                  color: copyFeedback ? 'var(--diff-color-added, #3fb950)' : 'var(--text-muted)',
                  fontSize: 9,
                  padding: '2px 5px',
                }}
                onMouseEnter={(e) => {
                  if (!copyFeedback) e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                onMouseLeave={(e) => {
                  if (!copyFeedback) e.currentTarget.style.color = 'var(--text-muted)'
                }}
                title="Copy added/changed lines (Ctrl+Shift+C)"
              >
                {copyFeedback ? (
                  <>
                    <Check size={10} /> Copied!
                  </>
                ) : (
                  <>
                    <Copy size={10} /> Copy changes
                  </>
                )}
              </button>
            )}

            {/* Separator */}
            <span style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />

            {/* View mode toggle */}
            <button
              onClick={() => setViewMode('unified')}
              style={{
                ...smallBtn,
                padding: '2px 8px',
                color: viewMode === 'unified' ? '#fff' : 'var(--text-muted)',
                background: viewMode === 'unified' ? 'var(--accent)' : 'transparent',
              }}
            >
              Unified
            </button>
            <button
              onClick={() => setViewMode('split')}
              style={{
                ...smallBtn,
                padding: '2px 8px',
                color: viewMode === 'split' ? '#fff' : 'var(--text-muted)',
                background: viewMode === 'split' ? 'var(--accent)' : 'transparent',
              }}
            >
              Split
            </button>
          </div>
        </div>

        {/* ── Diff body with minimap ───────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div
            ref={bodyRef}
            style={{
              flex: 1,
              overflow: 'auto',
              fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
              fontSize: 12,
              lineHeight: '20px',
            }}
          >
            {viewMode === 'unified' ? renderUnifiedBody() : renderSplitBody()}
          </div>

          {/* Minimap */}
          <DiffMinimap
            diffLines={diffLines}
            bodyRef={bodyRef}
            totalHeight={diffLines.length * 20}
          />
        </div>

        {/* ── Footer with actions ─────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderTop: '1px solid var(--border)',
            background: 'rgba(0,0,0,0.15)',
            flexShrink: 0,
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            <kbd
              style={{
                padding: '1px 4px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 3,
                fontSize: 10,
                border: '1px solid var(--border)',
              }}
            >
              Ctrl+Enter
            </kbd>{' '}
            accept{' '}
            <kbd
              style={{
                padding: '1px 4px',
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 3,
                fontSize: 10,
                border: '1px solid var(--border)',
                marginLeft: 6,
              }}
            >
              Esc
            </kbd>{' '}
            reject
            {hunks.length > 1 && (
              <>
                {' '}
                <kbd
                  style={{
                    padding: '1px 4px',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: 3,
                    fontSize: 10,
                    border: '1px solid var(--border)',
                    marginLeft: 6,
                  }}
                >
                  Alt+Up/Down
                </kbd>{' '}
                navigate
              </>
            )}
          </span>

          <div style={{ display: 'flex', gap: 6 }}>
            {/* Reject All */}
            <button
              onClick={onReject}
              style={{
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(248,81,73,0.15)'
                e.currentTarget.style.borderColor = 'var(--diff-border-removed, #f85149)'
                e.currentTarget.style.color = 'var(--diff-color-removed, #f85149)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <X size={12} />
              {hunks.length > 1 ? 'Reject All' : 'Reject'}
            </button>
            {/* Accept All */}
            <button
              onClick={() => onAccept(suggestedCode)}
              style={{
                padding: '5px 14px',
                fontSize: 11,
                fontWeight: 600,
                color: '#fff',
                background: 'var(--diff-color-added, #3fb950)',
                border: '1px solid var(--diff-border-added, #3fb950)',
                borderRadius: 6,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2ea043'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--diff-color-added, #3fb950)'
              }}
            >
              <Check size={12} />
              {hunks.length > 1 ? 'Accept All' : 'Accept'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
