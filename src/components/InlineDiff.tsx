import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties, type ReactNode } from 'react'
import { Check, X, ChevronDown, ChevronUp, ArrowUp, ArrowDown, ChevronsUp, ChevronsDown } from 'lucide-react'

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

const syntaxColors: Record<SyntaxToken['kind'], string> = {
  keyword: '#569cd6',
  string: '#ce9178',
  comment: '#6a9955',
  number: '#b5cea8',
  punctuation: '#d4d4d4',
  plain: 'inherit',
}

function renderSyntaxHighlighted(text: string): ReactNode {
  const tokens = tokenizeSyntax(text)
  if (tokens.length === 0) return text
  return tokens.map((tok, i) => (
    <span key={i} style={{ color: syntaxColors[tok.kind] }}>
      {tok.text}
    </span>
  ))
}

/** Render word segments with syntax highlighting inside each segment */
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
      if (count >= COLLAPSE_THRESHOLD && !expandedRegions.has(regionId)) {
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
  const containerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const hunkRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // Compute diff lines
  const diffLines = useMemo(() => computeDiff(originalCode, suggestedCode), [originalCode, suggestedCode])
  const addedCount = useMemo(() => diffLines.filter((l) => l.type === 'added').length, [diffLines])
  const removedCount = useMemo(() => diffLines.filter((l) => l.type === 'removed').length, [diffLines])

  // Detect hunks for navigation and per-hunk actions
  const hunks = useMemo(() => detectHunks(diffLines), [diffLines])

  // Display segments (with collapsing)
  const displaySegments = useMemo(
    () => buildDisplaySegments(diffLines, expandedRegions),
    [diffLines, expandedRegions],
  )

  // Split pairs
  const splitPairs = useMemo(() => buildSplitPairs(diffLines), [diffLines])

  // Precompute word-level diffs for paired removed+added lines
  const wordDiffs = useMemo(() => {
    const map = new Map<string, { oldSegs: WordSegment[]; newSegs: WordSegment[] }>()
    // Find adjacent removed-then-added pairs
    for (let i = 0; i < diffLines.length - 1; i++) {
      if (diffLines[i].type === 'removed' && diffLines[i + 1].type === 'added') {
        const key = `${i}:${i + 1}`
        map.set(key, computeWordDiff(diffLines[i].content, diffLines[i + 1].content))
      }
    }
    // Also handle split pairs
    for (const pair of splitPairs) {
      if (pair.left && pair.right && pair.left.type === 'removed' && pair.right.type === 'added') {
        const key = `split:${pair.index}`
        if (!map.has(key)) {
          map.set(key, computeWordDiff(pair.left.content, pair.right.content))
        }
      }
    }
    return map
  }, [diffLines, splitPairs])

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
    },
    [visible, onAccept, onReject, suggestedCode, goToPrevHunk, goToNextHunk],
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

  if (!visible) return null

  /* ── Style helpers ──────────────────────────────────────── */

  const lineBackground = {
    added: '#1a3a1a',
    removed: '#3a1a1a',
    unchanged: 'transparent',
  }

  const lineBorder = {
    added: '3px solid #3fb950',
    removed: '3px solid #f85149',
    unchanged: '3px solid transparent',
  }

  const charHighlight = {
    added: 'rgba(63, 185, 80, 0.35)',
    removed: 'rgba(248, 81, 73, 0.35)',
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
    color: type === 'added' ? '#3fb950' : type === 'removed' ? '#f85149' : 'transparent',
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

  /** Render the content of a line with syntax highlighting and optional word-level diff */
  const renderLineContent = (line: DiffLine, lineIndex: number, pairKey?: string): ReactNode => {
    // Check for word-level diff
    if (line.type === 'removed') {
      // Check if next line is added (unified view) for word diff
      const wdKey = `${lineIndex}:${lineIndex + 1}`
      const wd = wordDiffs.get(wdKey) || (pairKey ? wordDiffs.get(pairKey) : undefined)
      if (wd) {
        return renderWordSegments(wd.oldSegs, charHighlight.removed)
      }
    }
    if (line.type === 'added') {
      // Check if previous line was removed
      const wdKey = `${lineIndex - 1}:${lineIndex}`
      const wd = wordDiffs.get(wdKey) || (pairKey ? wordDiffs.get(pairKey) : undefined)
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
              color: '#f85149',
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
              color: '#3fb950',
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

  /** Collapsed region indicator */
  const renderCollapsed = (segment: DisplaySegment, regionId: number) => (
    <div
      key={`collapsed-${segment.startIndex}`}
      onClick={() => toggleRegion(regionId)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 0',
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
    >
      <ChevronsDown size={12} />
      <span style={{ fontStyle: 'italic', fontSize: 10 }}>
        ... {segment.lineCount} unchanged lines ...
      </span>
      <ChevronsDown size={12} />
    </div>
  )

  /* Track collapsed region IDs for the expand callback */
  let collapsedRegionCounter = 0

  /** Render unified view body */
  const renderUnifiedBody = () => {
    collapsedRegionCounter = 0
    const elements: ReactNode[] = []

    // Track which hunk each changed line belongs to, to wrap with ref
    let prevHunkIdx = -1

    for (const segment of displaySegments) {
      if (segment.kind === 'collapsed') {
        elements.push(renderCollapsed(segment, collapsedRegionCounter))
        collapsedRegionCounter++
        continue
      }

      // For 'lines' segments, count region IDs for unchanged runs
      const isUnchangedRun =
        segment.startIndex < diffLines.length &&
        diffLines[segment.startIndex].type === 'unchanged'
      if (isUnchangedRun && segment.endIndex - segment.startIndex >= 1) {
        // This is part of an unchanged run. If it's the LAST portion (after a collapse),
        // we already incremented. Only increment if this forms a complete region (no collapse happened).
        // Actually, region IDs are tracked by the full unchanged run, which gets split into
        // top-lines / collapsed / bottom-lines. The regionId applies to the collapsed part.
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
    // For split view, also apply collapsing
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
      // Compute word diff for this pair if applicable
      let leftContent: ReactNode = left ? renderSyntaxHighlighted(left.content) : ''
      let rightContent: ReactNode = right ? renderSyntaxHighlighted(right.content) : ''

      if (pairKey && left && right) {
        const wd = wordDiffs.get(pairKey) || computeWordDiff(left.content, right.content)
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
        maxWidth: viewMode === 'split' ? 900 : 700,
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
          <span
            style={{
              fontSize: 10,
              color: '#3fb950',
              background: 'rgba(63,185,80,0.12)',
              padding: '1px 6px',
              borderRadius: 3,
              fontWeight: 500,
            }}
          >
            +{addedCount}
          </span>
          <span
            style={{
              fontSize: 10,
              color: '#f85149',
              background: 'rgba(248,81,73,0.12)',
              padding: '1px 6px',
              borderRadius: 3,
              fontWeight: 500,
            }}
          >
            -{removedCount}
          </span>

          {/* Hunk navigation */}
          {hunks.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
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
              <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 32, textAlign: 'center' }}>
                {currentHunkIndex + 1}/{hunks.length}
              </span>
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
            </div>
          )}

          {/* View mode toggle */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
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

        {/* ── Diff body ───────────────────────────────────── */}
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
                e.currentTarget.style.borderColor = '#f85149'
                e.currentTarget.style.color = '#f85149'
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
                background: '#3fb950',
                border: '1px solid #3fb950',
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
                e.currentTarget.style.background = '#3fb950'
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
