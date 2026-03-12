import React, {
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  memo,
} from 'react'
import {
  GitMerge,
  ChevronUp,
  ChevronDown,
  Check,
  CheckCheck,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  Combine,
  Eye,
  FileCode,
  Pencil,
  RotateCcw,
  Columns,
  AlertTriangle,
  Sparkles,
  Undo2,
  Redo2,
  Save,
  Ban,
  Keyboard,
} from 'lucide-react'
import { useEditorStore } from '@/store/editor'
import { useToastStore } from '@/store/toast'

/* ── Types ──────────────────────────────────────────────── */

/**
 * Represents a single conflict hunk parsed from git merge markers.
 * Each hunk contains the "ours" (current), "theirs" (incoming), and
 * optionally "base" (common ancestor) content for three-way merging.
 */
export interface ConflictHunk {
  /** Unique identifier for this conflict */
  id: string
  /** Line index (0-based) where the conflict starts in the original text */
  startLine: number
  /** Line index (0-based) where the conflict ends in the original text */
  endLine: number
  /** Content from the current branch (ours / HEAD) */
  currentContent: string
  /** Content from the incoming branch (theirs) */
  incomingContent: string
  /** Content from the common ancestor (base), null if unavailable */
  baseContent: string | null
  /** Whether this conflict has been resolved */
  resolved: boolean
  /** The resolution strategy chosen by the user */
  resolution: 'current' | 'incoming' | 'both' | 'none' | 'custom' | null
  /** Custom content when resolution is 'custom' */
  customContent: string | null
}

/**
 * Props for the MergeConflictResolver component.
 */
export interface MergeConflictResolverProps {
  /** Path to the file containing merge conflicts */
  filePath: string
  /** Raw file content with git merge conflict markers */
  fileContent: string
  /** Branch name for "current" side (defaults to HEAD) */
  currentBranch?: string
  /** Branch name for "incoming" side */
  incomingBranch?: string
  /** Called when the user finalises the merge with resolved content */
  onResolve?: (resolvedContent: string) => void
  /** Called when the user cancels or closes the resolver */
  onClose?: () => void
  /** Language identifier for syntax highlighting */
  language?: string
  /** Optional callback for AI-assisted merge suggestion */
  onAiSuggest?: (conflict: ConflictHunk) => Promise<string | null>
}

/**
 * Snapshot of conflict state for undo/redo history tracking.
 */
interface HistoryEntry {
  conflicts: ConflictHunk[]
  focusedIndex: number
  label: string
}

/* ── Constants ──────────────────────────────────────────── */

/** Regex patterns for parsing git merge conflict markers */
const MARKER_CURRENT_START = /^<{7}\s*(.*)/
const MARKER_BASE_START = /^\|{7}\s*(.*)/
const MARKER_SEPARATOR = /^={7}/
const MARKER_INCOMING_END = /^>{7}\s*(.*)/

/** Layout constants */
const LH = 20  // line height in pixels
const GW = 48  // gutter width in pixels
const MONO = "'Cascadia Code', 'Fira Code', 'Consolas', monospace"

/**
 * Color tokens for conflict regions.
 * Green = ours/current, Blue = theirs/incoming, Gray = base/ancestor
 */
const C = {
  oursBg: 'rgba(40,167,69,0.10)',
  oursBorder: 'rgba(40,167,69,0.55)',
  oursAccent: 'rgba(40,167,69,0.85)',
  oursHeader: 'rgba(40,167,69,0.15)',
  theirsBg: 'rgba(30,110,215,0.10)',
  theirsBorder: 'rgba(30,110,215,0.55)',
  theirsAccent: 'rgba(30,110,215,0.85)',
  theirsHeader: 'rgba(30,110,215,0.15)',
  baseBg: 'rgba(160,160,160,0.06)',
  baseBorder: 'rgba(160,160,160,0.40)',
  baseAccent: 'rgba(160,160,160,0.70)',
  baseHeader: 'rgba(160,160,160,0.10)',
} as const

/* ── Conflict parser ────────────────────────────────────── */

/**
 * Parses git merge conflict markers from file content and extracts
 * individual conflict hunks. Supports both two-way (<<<, ===, >>>)
 * and three-way (<<<, |||, ===, >>>) merge formats.
 */
function parseConflicts(content: string): {
  conflicts: ConflictHunk[]
  nonConflictingLines: Map<number, string>
} {
  const lines = content.split('\n')
  const conflicts: ConflictHunk[] = []
  const nonConflictingLines = new Map<number, string>()
  let i = 0, ci = 0

  while (i < lines.length) {
    const csm = lines[i].match(MARKER_CURRENT_START)
    if (csm) {
      const startLine = i
      const cur: string[] = [], inc: string[] = [], base: string[] = []
      let section: 'current' | 'base' | 'incoming' = 'current'
      let hasBase = false
      i++
      while (i < lines.length) {
        if (lines[i].match(MARKER_BASE_START)) { section = 'base'; hasBase = true; i++; continue }
        if (lines[i].match(MARKER_SEPARATOR)) { section = 'incoming'; i++; continue }
        if (lines[i].match(MARKER_INCOMING_END)) {
          conflicts.push({
            id: `conflict-${ci++}`, startLine, endLine: i,
            currentContent: cur.join('\n'), incomingContent: inc.join('\n'),
            baseContent: hasBase ? base.join('\n') : null,
            resolved: false, resolution: null, customContent: null,
          })
          i++; break
        }
        if (section === 'current') cur.push(lines[i])
        else if (section === 'base') base.push(lines[i])
        else inc.push(lines[i])
        i++
      }
    } else {
      nonConflictingLines.set(i, lines[i]); i++
    }
  }
  return { conflicts, nonConflictingLines }
}

/* ── Build resolved output ──────────────────────────────── */

/**
 * Reconstructs the file content with conflict regions replaced by their
 * chosen resolution. Unresolved conflicts keep their original markers.
 */
function buildResolvedContent(original: string, conflicts: ConflictHunk[]): string {
  const lines = original.split('\n')
  const result: string[] = []
  let i = 0
  const byStart = new Map(conflicts.map((c) => [c.startLine, c]))

  while (i < lines.length) {
    const conflict = byStart.get(i)
    if (conflict) {
      let resolved: string | null = null
      switch (conflict.resolution) {
        case 'current': resolved = conflict.currentContent; break
        case 'incoming': resolved = conflict.incomingContent; break
        case 'both': resolved = conflict.currentContent + '\n' + conflict.incomingContent; break
        case 'none': resolved = ''; break
        case 'custom': resolved = conflict.customContent ?? ''; break
        default:
          for (let j = conflict.startLine; j <= conflict.endLine; j++) result.push(lines[j])
          i = conflict.endLine + 1; continue
      }
      if (resolved !== null && resolved.length > 0) result.push(...resolved.split('\n'))
      i = conflict.endLine + 1
    } else { result.push(lines[i]); i++ }
  }
  return result.join('\n')
}

/* ── Inline diff computation (word-level) ──────────────── */

/**
 * Token representing a word-level diff segment.
 */
interface DiffToken {
  text: string
  type: 'equal' | 'added' | 'removed'
}

/**
 * Computes a word-level inline diff between two strings using an LCS
 * (Longest Common Subsequence) approach. Returns an array of tokens
 * tagged as equal, added, or removed for highlighting within conflict regions.
 */
function computeInlineDiff(a: string, b: string): DiffToken[] {
  const wA = a.split(/(\s+)/), wB = b.split(/(\s+)/)
  const m = wA.length, n = wB.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = wA[i - 1] === wB[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])

  const stack: DiffToken[] = []
  let ai = m, bi = n
  while (ai > 0 || bi > 0) {
    if (ai > 0 && bi > 0 && wA[ai - 1] === wB[bi - 1]) {
      stack.push({ text: wA[ai - 1], type: 'equal' }); ai--; bi--
    } else if (bi > 0 && (ai === 0 || dp[ai][bi - 1] >= dp[ai - 1][bi])) {
      stack.push({ text: wB[bi - 1], type: 'added' }); bi--
    } else {
      stack.push({ text: wA[ai - 1], type: 'removed' }); ai--
    }
  }
  stack.reverse()

  const tokens: DiffToken[] = []
  for (const tok of stack) {
    if (tokens.length > 0 && tokens[tokens.length - 1].type === tok.type)
      tokens[tokens.length - 1].text += tok.text
    else tokens.push({ ...tok })
  }
  return tokens
}

/* ── Syntax highlight (lightweight token colouring) ────── */

/** Escape HTML special characters for safe dangerouslySetInnerHTML usage. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Applies simple regex-based syntax highlighting for keywords, strings,
 * comments, and numbers. Language-agnostic with common programming tokens.
 */
function tokenHighlight(line: string, _lang: string): string {
  let r = escapeHtml(line)
  r = r.replace(
    /\b(const|let|var|function|return|if|else|for|while|import|export|from|class|interface|type|extends|implements|new|this|super|async|await|try|catch|throw|switch|case|default|break|continue|do|in|of|typeof|instanceof|void|null|undefined|true|false)\b/g,
    '<span style="color:#c586c0">$1</span>',
  )
  r = r.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`|"[^"]*?"|'[^']*?')/g,
    '<span style="color:#ce9178">$1</span>')
  r = r.replace(/(\/\/.*$)/g, '<span style="color:#6a9955">$1</span>')
  r = r.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#b5cea8">$1</span>')
  return r
}

/* ── SyntaxLine - renders a single source line ─────────── */

const SyntaxLine = memo(function SyntaxLine({
  line,
  lineNumber,
  language,
  bgColor,
}: {
  line: string
  lineNumber: number
  language?: string
  bgColor?: string
}) {
  const html = useMemo(
    () => (language ? tokenHighlight(line, language) : escapeHtml(line)),
    [line, language],
  )
  return (
    <div style={{ display: 'flex', minHeight: LH, lineHeight: `${LH}px`, background: bgColor }}>
      <span style={{
        display: 'inline-block', width: GW, textAlign: 'right', paddingRight: 12,
        color: 'var(--text-secondary)', opacity: 0.5, userSelect: 'none',
        fontFamily: MONO, fontSize: 12, flexShrink: 0,
      }}>{lineNumber}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, whiteSpace: 'pre', color: 'var(--text-primary)' }}
        dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
})

/* ── InlineDiffLine - word-level diff highlights ───────── */

const InlineDiffLine = memo(function InlineDiffLine({
  tokens,
  lineNumber,
  side,
}: {
  tokens: DiffToken[]
  lineNumber: number
  side: 'ours' | 'theirs'
}) {
  return (
    <div style={{ display: 'flex', minHeight: LH, lineHeight: `${LH}px` }}>
      <span style={{
        display: 'inline-block', width: GW, textAlign: 'right', paddingRight: 12,
        color: 'var(--text-secondary)', opacity: 0.5, userSelect: 'none',
        fontFamily: MONO, fontSize: 12, flexShrink: 0,
      }}>{lineNumber}</span>
      <span style={{ fontFamily: MONO, fontSize: 13, whiteSpace: 'pre' }}>
        {tokens.map((tok, i) => {
          let bg = 'transparent', clr = 'var(--text-primary)'
          if (side === 'ours' && tok.type === 'removed') bg = 'rgba(40,167,69,0.25)'
          if (side === 'ours' && tok.type === 'added') { bg = 'rgba(220,50,50,0.18)'; clr = 'var(--text-secondary)' }
          if (side === 'theirs' && tok.type === 'added') bg = 'rgba(30,110,215,0.25)'
          if (side === 'theirs' && tok.type === 'removed') { bg = 'rgba(220,50,50,0.18)'; clr = 'var(--text-secondary)' }
          return <span key={i} style={{ background: bg, color: clr, borderRadius: 2 }}>{tok.text}</span>
        })}
      </span>
    </div>
  )
})

/* ── Pane - scrollable column for three-way view ───────── */

/**
 * A single scrollable pane used in the three-pane layout (Ours / Base / Theirs).
 * Supports synchronised scrolling across panes and highlights conflict regions.
 */
const Pane = memo(function Pane({
  title,
  lines,
  language,
  accentColor,
  headerBg,
  lineBg,
  borderColor,
  scrollTop,
  onScroll,
  startLineNumber = 1,
  conflictRanges,
  highlightBg,
}: {
  title: string
  lines: string[]
  language?: string
  accentColor: string
  headerBg: string
  lineBg: string
  borderColor: string
  scrollTop: number
  onScroll: (v: number) => void
  startLineNumber?: number
  conflictRanges?: Array<{ start: number; end: number }>
  highlightBg?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const selfScroll = useRef(false)

  useEffect(() => {
    if (ref.current && !selfScroll.current) ref.current.scrollTop = scrollTop
  }, [scrollTop])

  const handleScroll = useCallback(() => {
    if (ref.current) {
      selfScroll.current = true
      onScroll(ref.current.scrollTop)
      requestAnimationFrame(() => { selfScroll.current = false })
    }
  }, [onScroll])

  const conflictSet = useMemo(() => {
    const s = new Set<number>()
    if (conflictRanges) for (const r of conflictRanges) for (let l = r.start; l <= r.end; l++) s.add(l)
    return s
  }, [conflictRanges])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0,
      borderRight: '1px solid var(--border-primary)', overflow: 'hidden' }}>
      <div style={{
        padding: '4px 10px', background: headerBg, borderBottom: `2px solid ${borderColor}`,
        fontSize: 11, fontWeight: 600, color: accentColor, textTransform: 'uppercase',
        letterSpacing: 0.5, flexShrink: 0, userSelect: 'none',
      }}>{title}</div>
      <div ref={ref} onScroll={handleScroll} style={{ flex: 1, overflow: 'auto', background: lineBg }}>
        {lines.map((line, idx) => (
          <SyntaxLine key={idx} line={line} lineNumber={startLineNumber + idx} language={language}
            bgColor={conflictSet.has(idx) && highlightBg ? highlightBg : undefined} />
        ))}
        {lines.length === 0 && (
          <div style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 12, fontStyle: 'italic' }}>(empty)</div>
        )}
      </div>
    </div>
  )
})

/* ── InlineDiffView - side-by-side word diff ───────────── */

/**
 * Renders a side-by-side word-level diff comparison for a single
 * conflict, showing additions and removals highlighted inline.
 */
const InlineDiffView = memo(function InlineDiffView({
  current,
  incoming,
}: {
  current: string
  incoming: string
  language?: string
}) {
  const cLines = current.split('\n'), iLines = incoming.split('\n')
  const maxLen = Math.max(cLines.length, iLines.length)
  const diffs = useMemo(() =>
    Array.from({ length: maxLen }, (_, i) => computeInlineDiff(cLines[i] ?? '', iLines[i] ?? '')),
    [current, incoming, maxLen])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1,
      borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-primary)' }}>
      <div style={{ padding: '4px 8px', background: C.oursHeader, color: 'var(--text-secondary)',
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current (word diff)</div>
      <div style={{ padding: '4px 8px', background: C.theirsHeader, color: 'var(--text-secondary)',
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Incoming (word diff)</div>
      <div style={{ background: C.oursBg, padding: '4px 0', overflow: 'auto' }}>
        {diffs.map((d, i) => <InlineDiffLine key={i} tokens={d} lineNumber={i + 1} side="ours" />)}
      </div>
      <div style={{ background: C.theirsBg, padding: '4px 0', overflow: 'auto' }}>
        {diffs.map((d, i) => <InlineDiffLine key={i} tokens={d} lineNumber={i + 1} side="theirs" />)}
      </div>
    </div>
  )
})

/* ── ActionButton - small labelled icon button ─────────── */

const ActionButton = memo(function ActionButton({
  icon,
  label,
  color,
  onClick,
  active,
  shortcut,
  disabled,
}: {
  icon: React.ReactNode
  label: string
  color: string
  onClick: () => void
  active?: boolean
  shortcut?: string
  disabled?: boolean
}) {
  return (
    <button title={shortcut ? `${label} (${shortcut})` : label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
        fontSize: 11, color: active ? '#fff' : color,
        background: active ? 'var(--accent-primary)' : 'transparent',
        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
        borderRadius: 3, cursor: disabled ? 'not-allowed' : 'pointer',
        whiteSpace: 'nowrap', transition: 'background 0.1s, color 0.1s',
        opacity: disabled ? 0.5 : 1,
      }}>
      {icon}{label}
    </button>
  )
})

/* ── SummaryBadge - conflict count indicator ───────────── */

const SummaryBadge = memo(function SummaryBadge({
  label,
  count,
  color,
}: {
  label: string
  count: number
  color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}:</span>
      <span style={{ fontSize: 12, fontWeight: 700, color }}>{count}</span>
    </div>
  )
})

/* ── Keyboard shortcut help overlay ────────────────────── */

const SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: 'F7', desc: 'Next conflict' },
  { keys: 'Shift+F7', desc: 'Previous conflict' },
  { keys: 'Alt+1', desc: 'Accept Current (focused)' },
  { keys: 'Alt+2', desc: 'Accept Incoming (focused)' },
  { keys: 'Alt+3', desc: 'Accept Both (focused)' },
  { keys: 'Alt+4', desc: 'Accept None (focused)' },
  { keys: 'Alt+E', desc: 'Edit focused conflict' },
  { keys: 'Alt+A', desc: 'AI suggest for focused conflict' },
  { keys: 'Ctrl+Z', desc: 'Undo' },
  { keys: 'Ctrl+Shift+Z / Ctrl+Y', desc: 'Redo' },
  { keys: 'Ctrl+S', desc: 'Save resolved' },
  { keys: 'Escape', desc: 'Cancel / Close' },
  { keys: 'Alt+C', desc: 'Accept All Current' },
  { keys: 'Alt+I', desc: 'Accept All Incoming' },
  { keys: 'Alt+B', desc: 'Toggle base view' },
  { keys: 'Alt+D', desc: 'Toggle inline diff' },
  { keys: 'Alt+T', desc: 'Toggle three-pane view' },
]

const ShortcutHelp = memo(function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)',
        borderRadius: 8, padding: 20, minWidth: 360, maxWidth: 480,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Keyboard Shortcuts</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none',
            cursor: 'pointer', color: 'var(--text-secondary)', padding: 2 }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SHORTCUTS.map((s) => (
            <div key={s.keys} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '4px 0', borderBottom: '1px solid var(--border-primary)',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{s.desc}</span>
              <kbd style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 3,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border-primary)',
                color: 'var(--text-secondary)', fontFamily: MONO, whiteSpace: 'nowrap',
              }}>{s.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

/* ── ConflictBlock - individual conflict region ────────── */

interface ConflictBlockProps {
  conflict: ConflictHunk
  index: number
  isFocused: boolean
  language?: string
  showBase: boolean
  showInlineDiff: boolean
  onAcceptCurrent: (id: string) => void
  onAcceptIncoming: (id: string) => void
  onAcceptBoth: (id: string) => void
  onAcceptNone: (id: string) => void
  onCustomResolve: (id: string, content: string) => void
  onReset: (id: string) => void
  onFocus: (index: number) => void
  onAiSuggest?: (conflict: ConflictHunk) => void
  aiLoading?: boolean
}

/**
 * Renders a single conflict region with:
 * - Colour-coded current (green) and incoming (blue) sections
 * - Optional base (gray) section for three-way merge
 * - Per-conflict action buttons (Accept Current/Incoming/Both/None, Edit, AI)
 * - Inline word-diff view
 * - Manual editing textarea
 * - Resolved preview
 */
const ConflictBlock = memo(function ConflictBlock({
  conflict,
  index,
  isFocused,
  language,
  showBase,
  showInlineDiff,
  onAcceptCurrent,
  onAcceptIncoming,
  onAcceptBoth,
  onAcceptNone,
  onCustomResolve,
  onReset,
  onFocus,
  onAiSuggest,
  aiLoading,
}: ConflictBlockProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const blockRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isFocused && blockRef.current) blockRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [isFocused])
  useEffect(() => { if (isEditing && textareaRef.current) textareaRef.current.focus() }, [isEditing])

  const startEdit = useCallback(() => {
    setEditContent(conflict.customContent ?? conflict.currentContent + '\n' + conflict.incomingContent)
    setIsEditing(true)
  }, [conflict])
  const saveEdit = useCallback(() => { onCustomResolve(conflict.id, editContent); setIsEditing(false) },
    [conflict.id, editContent, onCustomResolve])
  const cancelEdit = useCallback(() => setIsEditing(false), [])

  const resLabel = useMemo(() => {
    const m: Record<string, string> = {
      current: 'Accepted Current', incoming: 'Accepted Incoming',
      both: 'Accepted Both', none: 'Accepted None', custom: 'Custom Resolution',
    }
    return conflict.resolution ? m[conflict.resolution] ?? null : null
  }, [conflict.resolution])

  const resContent = useMemo(() => {
    switch (conflict.resolution) {
      case 'current': return conflict.currentContent
      case 'incoming': return conflict.incomingContent
      case 'both': return conflict.currentContent + '\n' + conflict.incomingContent
      case 'none': return ''
      case 'custom': return conflict.customContent ?? ''
      default: return null
    }
  }, [conflict])

  const borderClr = isFocused ? 'var(--accent-primary)' : 'var(--border-primary)'

  return (
    <div ref={blockRef} data-conflict-index={index} onClick={() => onFocus(index)} style={{
      border: `1px solid ${borderClr}`, borderRadius: 6, marginBottom: 12, overflow: 'hidden',
      boxShadow: isFocused ? '0 0 0 1px var(--accent-primary)' : 'none',
      transition: 'box-shadow 0.15s, border-color 0.15s',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 12px', background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-primary)', flexWrap: 'wrap', gap: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitMerge size={14} style={{ color: 'var(--warning)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            Conflict {index + 1}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            Lines {conflict.startLine + 1}&ndash;{conflict.endLine + 1}
          </span>
          {conflict.resolved && resLabel && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
              background: conflict.resolution === 'none' ? 'rgba(180,180,180,0.15)' : 'rgba(40,160,80,0.15)',
              color: conflict.resolution === 'none' ? 'var(--text-secondary)' : 'var(--success)',
            }}>{resLabel}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {!conflict.resolved ? (
            <>
              <ActionButton icon={<ArrowUpFromLine size={12} />} label="Accept Current" shortcut="Alt+1"
                color={C.oursAccent} onClick={() => onAcceptCurrent(conflict.id)} />
              <ActionButton icon={<ArrowDownToLine size={12} />} label="Accept Incoming" shortcut="Alt+2"
                color={C.theirsAccent} onClick={() => onAcceptIncoming(conflict.id)} />
              <ActionButton icon={<Combine size={12} />} label="Accept Both" shortcut="Alt+3"
                color="rgba(180,140,40,0.8)" onClick={() => onAcceptBoth(conflict.id)} />
              <ActionButton icon={<Ban size={12} />} label="Accept None" shortcut="Alt+4"
                color="var(--text-secondary)" onClick={() => onAcceptNone(conflict.id)} />
              <ActionButton icon={<Pencil size={12} />} label="Edit" shortcut="Alt+E"
                color="var(--text-secondary)" onClick={startEdit} />
              {onAiSuggest && (
                <ActionButton icon={<Sparkles size={12} />}
                  label={aiLoading ? 'Thinking...' : 'AI Suggest'} shortcut="Alt+A"
                  color="rgba(168,85,247,0.85)" onClick={() => onAiSuggest(conflict)} disabled={aiLoading} />
              )}
            </>
          ) : (
            <ActionButton icon={<RotateCcw size={12} />} label="Reset"
              color="var(--text-secondary)" onClick={() => onReset(conflict.id)} />
          )}
        </div>
      </div>

      {/* Body */}
      {!conflict.resolved ? (
        <div>
          {/* Current change */}
          <div style={{ background: C.oursBg, borderLeft: `3px solid ${C.oursBorder}` }}>
            <div style={{ padding: '3px 12px', fontSize: 11, color: C.oursAccent,
              fontWeight: 600, background: C.oursHeader }}>{'<<<'} Current Change (Ours)</div>
            <div style={{ padding: '4px 0' }}>
              {conflict.currentContent.split('\n').map((l, i) => (
                <SyntaxLine key={i} line={l} lineNumber={conflict.startLine + 1 + i} language={language} />
              ))}
            </div>
          </div>

          {/* Base */}
          {showBase && conflict.baseContent !== null && (
            <div style={{ background: C.baseBg, borderLeft: `3px solid ${C.baseBorder}`,
              borderTop: '1px solid var(--border-primary)' }}>
              <div style={{ padding: '3px 12px', fontSize: 11, color: C.baseAccent,
                fontWeight: 600, background: C.baseHeader }}>||| Common Ancestor (Base)</div>
              <div style={{ padding: '4px 0' }}>
                {conflict.baseContent.split('\n').map((l, i) => (
                  <SyntaxLine key={i} line={l} lineNumber={i + 1} language={language} />
                ))}
              </div>
            </div>
          )}

          <div style={{ height: 1, background: 'var(--border-primary)' }} />

          {/* Incoming change */}
          <div style={{ background: C.theirsBg, borderLeft: `3px solid ${C.theirsBorder}` }}>
            <div style={{ padding: '3px 12px', fontSize: 11, color: C.theirsAccent,
              fontWeight: 600, background: C.theirsHeader }}>{'>>>'} Incoming Change (Theirs)</div>
            <div style={{ padding: '4px 0' }}>
              {conflict.incomingContent.split('\n').map((l, i) => (
                <SyntaxLine key={i} line={l} lineNumber={conflict.startLine + 1 + i} language={language} />
              ))}
            </div>
          </div>

          {/* Inline diff */}
          {showInlineDiff && (
            <div style={{ padding: 8, borderTop: '1px solid var(--border-primary)' }}>
              <InlineDiffView current={conflict.currentContent} incoming={conflict.incomingContent} language={language} />
            </div>
          )}

          {/* Manual editing */}
          {isEditing && (
            <div style={{ borderTop: '1px solid var(--border-primary)', padding: 8, background: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Custom Resolution</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={saveEdit} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                    fontSize: 11, background: 'var(--success)', color: '#fff',
                    border: 'none', borderRadius: 3, cursor: 'pointer',
                  }}><Check size={11} /> Apply</button>
                  <button onClick={cancelEdit} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px',
                    fontSize: 11, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
                    border: '1px solid var(--border-primary)', borderRadius: 3, cursor: 'pointer',
                  }}><X size={11} /> Cancel</button>
                </div>
              </div>
              <textarea ref={textareaRef} value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveEdit() }
                  if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                }}
                spellCheck={false}
                style={{
                  width: '100%', minHeight: 120, fontFamily: MONO, fontSize: 13,
                  lineHeight: `${LH}px`, padding: 8, background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', border: '1px solid var(--border-primary)',
                  borderRadius: 4, resize: 'vertical', outline: 'none', boxSizing: 'border-box',
                }} />
            </div>
          )}
        </div>
      ) : (
        /* Resolved preview */
        <div style={{
          background: conflict.resolution === 'none' ? C.baseBg : 'rgba(40,160,80,0.04)',
          borderLeft: `3px solid ${conflict.resolution === 'none' ? 'var(--text-secondary)' : 'var(--success)'}`,
          padding: '4px 0',
        }}>
          {resContent !== null && resContent.length > 0 ? (
            resContent.split('\n').map((l, i) => (
              <SyntaxLine key={i} line={l} lineNumber={i + 1} language={language} />
            ))
          ) : (
            <div style={{ padding: '6px 16px', fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              (empty -- conflict content removed)
            </div>
          )}
        </div>
      )}
    </div>
  )
})

/* ── ResultPane - resolved content preview at bottom ──── */

/**
 * Shows the reconstructed file content after applying all resolutions.
 * When all conflicts are resolved, the user can manually edit the
 * result content before saving. Supports Ctrl+Enter to save edits.
 */
const ResultPane = memo(function ResultPane({
  content,
  language,
  onEdit,
  editable,
}: {
  content: string
  language?: string
  onEdit: (c: string) => void
  editable: boolean
}) {
  const [manual, setManual] = useState(false)
  const [editVal, setEditVal] = useState(content)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (!manual) setEditVal(content) }, [content, manual])
  const lines = useMemo(() => content.split('\n'), [content])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', borderTop: '2px solid var(--accent-primary)',
      flexShrink: 0, maxHeight: 300, minHeight: 80 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-primary)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileCode size={13} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
            textTransform: 'uppercase', letterSpacing: 0.5 }}>Resolved Result</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{lines.length} lines</span>
        </div>
        {editable && (
          <button onClick={() => {
            if (manual) { onEdit(editVal); setManual(false) }
            else { setEditVal(content); setManual(true); setTimeout(() => taRef.current?.focus(), 50) }
          }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
            fontSize: 11, color: manual ? '#fff' : 'var(--text-secondary)',
            background: manual ? 'var(--accent-primary)' : 'transparent',
            border: `1px solid ${manual ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
            borderRadius: 3, cursor: 'pointer',
          }}>
            <Pencil size={11} />{manual ? 'Save Edits' : 'Edit Result'}
          </button>
        )}
      </div>
      {manual ? (
        <textarea ref={taRef} value={editVal} onChange={(e) => setEditVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onEdit(editVal); setManual(false) }
            if (e.key === 'Escape') { e.preventDefault(); setManual(false) }
          }}
          spellCheck={false}
          style={{
            flex: 1, fontFamily: MONO, fontSize: 13, lineHeight: `${LH}px`, padding: 8,
            background: 'var(--bg-primary)', color: 'var(--text-primary)',
            border: 'none', resize: 'none', outline: 'none', boxSizing: 'border-box',
          }} />
      ) : (
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-primary)' }}>
          {lines.map((l, i) => <SyntaxLine key={i} line={l} lineNumber={i + 1} language={language} />)}
        </div>
      )}
    </div>
  )
})

/* ── Helper ─────────────────────────────────────────────── */

function fileName(path: string): string {
  return path.replace(/\\/g, '/').split('/').pop() || path
}

/* ── Main component ─────────────────────────────────────── */

/**
 * Three-way merge conflict resolution component.
 *
 * Features:
 * - Three-pane view: Ours (left), Base (center), Theirs (right)
 * - Result pane at bottom showing resolved content
 * - Conflict markers highlighted: green=ours, blue=theirs, gray=base
 * - Per-conflict actions: Accept Current, Incoming, Both, None
 * - Bulk actions: Accept All Current / Accept All Incoming
 * - Prev/Next conflict navigation (F7 / Shift+F7)
 * - Conflict count badge and progress bar
 * - Inline word-level diff within conflict regions
 * - Manual editing in result pane
 * - Synchronised line numbers and scrolling across panes
 * - Lightweight syntax highlighting
 * - File header with conflict statistics
 * - Save Resolved / Cancel buttons
 * - AI-assisted merge suggestion button
 * - Full undo/redo for resolution choices
 * - Comprehensive keyboard shortcuts
 */
function MergeConflictResolver({
  filePath,
  fileContent,
  currentBranch = 'HEAD',
  incomingBranch = 'incoming',
  onResolve,
  onClose,
  language,
  onAiSuggest,
}: MergeConflictResolverProps) {
  const addToast = useToastStore((s) => s.addToast)
  const _activeFilePath = useEditorStore((s) => s.activeFilePath)

  const [showBase, setShowBase] = useState(false)
  const [showInlineDiff, setShowInlineDiff] = useState(false)
  const [showThreePane, setShowThreePane] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [aiLoadingId, setAiLoadingId] = useState<string | null>(null)
  const [syncScrollTop, setSyncScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse conflicts
  const { conflicts: initialConflicts } = useMemo(() => parseConflicts(fileContent), [fileContent])
  const [conflicts, setConflicts] = useState<ConflictHunk[]>(initialConflicts)

  // Undo / redo
  const [history, setHistory] = useState<HistoryEntry[]>([
    { conflicts: initialConflicts, focusedIndex: 0, label: 'Initial' },
  ])
  const [historyIndex, setHistoryIndex] = useState(0)
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const pushHistory = useCallback((nc: ConflictHunk[], fi: number, label: string) => {
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), { conflicts: nc, focusedIndex: fi, label }])
    setHistoryIndex((prev) => prev + 1)
  }, [historyIndex])

  const handleUndo = useCallback(() => {
    if (!canUndo) return
    const e = history[historyIndex - 1]
    setConflicts(e.conflicts); setFocusedIndex(e.focusedIndex); setHistoryIndex(historyIndex - 1)
    addToast({ type: 'info', message: `Undo: ${e.label}` })
  }, [canUndo, historyIndex, history, addToast])

  const handleRedo = useCallback(() => {
    if (!canRedo) return
    const e = history[historyIndex + 1]
    setConflicts(e.conflicts); setFocusedIndex(e.focusedIndex); setHistoryIndex(historyIndex + 1)
    addToast({ type: 'info', message: `Redo: ${e.label}` })
  }, [canRedo, historyIndex, history, addToast])

  // Reset on file change
  useEffect(() => {
    const { conflicts: parsed } = parseConflicts(fileContent)
    setConflicts(parsed); setFocusedIndex(0)
    setHistory([{ conflicts: parsed, focusedIndex: 0, label: 'Initial' }]); setHistoryIndex(0)
  }, [fileContent])

  // Counts
  const total = conflicts.length
  const resolved = useMemo(() => conflicts.filter((c) => c.resolved).length, [conflicts])
  const remaining = total - resolved
  const allDone = remaining === 0 && total > 0
  const hasBase = useMemo(() => conflicts.some((c) => c.baseContent !== null), [conflicts])

  /* ── Conflict actions with history ───────────────────── */

  const updateWithHistory = useCallback((id: string, patch: Partial<ConflictHunk>, label: string) => {
    setConflicts((prev) => {
      const upd = prev.map((c) => c.id === id ? { ...c, ...patch } : c)
      setTimeout(() => pushHistory(upd, focusedIndex, label), 0)
      return upd
    })
  }, [pushHistory, focusedIndex])

  const onAccCurrent = useCallback((id: string) =>
    updateWithHistory(id, { resolved: true, resolution: 'current' }, 'Accept Current'), [updateWithHistory])
  const onAccIncoming = useCallback((id: string) =>
    updateWithHistory(id, { resolved: true, resolution: 'incoming' }, 'Accept Incoming'), [updateWithHistory])
  const onAccBoth = useCallback((id: string) =>
    updateWithHistory(id, { resolved: true, resolution: 'both' }, 'Accept Both'), [updateWithHistory])
  const onAccNone = useCallback((id: string) =>
    updateWithHistory(id, { resolved: true, resolution: 'none' }, 'Accept None'), [updateWithHistory])
  const onCustom = useCallback((id: string, content: string) =>
    updateWithHistory(id, { resolved: true, resolution: 'custom', customContent: content }, 'Custom Resolution'), [updateWithHistory])
  const onReset = useCallback((id: string) =>
    updateWithHistory(id, { resolved: false, resolution: null, customContent: null }, 'Reset'), [updateWithHistory])

  /* ── AI suggestion ───────────────────────────────────── */

  const handleAiSuggest = useCallback(async (conflict: ConflictHunk) => {
    if (!onAiSuggest) return
    setAiLoadingId(conflict.id)
    try {
      const suggestion = await onAiSuggest(conflict)
      if (suggestion !== null) {
        updateWithHistory(conflict.id,
          { resolved: true, resolution: 'custom', customContent: suggestion }, 'AI Suggestion')
        addToast({ type: 'success', message: 'AI merge suggestion applied' })
      } else {
        addToast({ type: 'warning', message: 'AI could not produce a suggestion' })
      }
    } catch { addToast({ type: 'error', message: 'AI suggestion failed' }) }
    finally { setAiLoadingId(null) }
  }, [onAiSuggest, updateWithHistory, addToast])

  /* ── Bulk actions ────────────────────────────────────── */

  const bulkAction = useCallback((res: ConflictHunk['resolution'], label: string) => {
    setConflicts((prev) => {
      const upd = prev.map((c) => c.resolved ? c : { ...c, resolved: true, resolution: res })
      setTimeout(() => pushHistory(upd, focusedIndex, label), 0)
      return upd
    })
  }, [pushHistory, focusedIndex])

  const accAllCurrent = useCallback(() => {
    bulkAction('current', 'Accept All Current')
    addToast({ type: 'info', message: `Accepted all ${remaining} current changes` })
  }, [remaining, addToast, bulkAction])

  const accAllIncoming = useCallback(() => {
    bulkAction('incoming', 'Accept All Incoming')
    addToast({ type: 'info', message: `Accepted all ${remaining} incoming changes` })
  }, [remaining, addToast, bulkAction])

  const resetAll = useCallback(() => {
    setConflicts((prev) => {
      const upd = prev.map((c) => ({
        ...c, resolved: false, resolution: null as ConflictHunk['resolution'], customContent: null,
      }))
      setTimeout(() => pushHistory(upd, focusedIndex, 'Reset All'), 0)
      return upd
    })
  }, [pushHistory, focusedIndex])

  /* ── Navigation ──────────────────────────────────────── */

  const navConflict = useCallback((dir: 'next' | 'prev') => {
    if (total === 0) return
    setFocusedIndex((p) => dir === 'next' ? (p + 1) % total : (p - 1 + total) % total)
  }, [total])
  const navNext = useCallback(() => navConflict('next'), [navConflict])
  const navPrev = useCallback(() => navConflict('prev'), [navConflict])

  /* ── Finalise ────────────────────────────────────────── */

  const handleFinaliseMerge = useCallback(() => {
    if (!allDone) {
      addToast({ type: 'warning', message: `${remaining} conflict${remaining > 1 ? 's' : ''} still unresolved` })
      return
    }
    const result = buildResolvedContent(fileContent, conflicts)
    onResolve?.(result)
    addToast({ type: 'success', message: `Merge conflicts resolved for ${fileName(filePath)}` })
  }, [allDone, remaining, fileContent, conflicts, filePath, onResolve, addToast])

  /* ── Result edit ─────────────────────────────────────── */

  const handleResultEdit = useCallback((newContent: string) => {
    addToast({ type: 'info', message: 'Result pane content updated.' })
    setConflicts((prev) => {
      const upd = prev.map((c, i) => ({
        ...c, resolved: true, resolution: 'custom' as const,
        customContent: i === 0 ? newContent : '',
      }))
      setTimeout(() => pushHistory(upd, focusedIndex, 'Manual result edit'), 0)
      return upd
    })
  }, [addToast, pushHistory, focusedIndex])

  /* ── Keyboard shortcuts ──────────────────────────────── */

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'F7' && !e.shiftKey) { e.preventDefault(); navNext(); return }
      if (e.key === 'F7' && e.shiftKey) { e.preventDefault(); navPrev(); return }
      if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); navNext(); return }
      if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); navPrev(); return }

      const fc = conflicts[focusedIndex]
      if (fc && !fc.resolved && e.altKey) {
        if (e.key === '1') { e.preventDefault(); onAccCurrent(fc.id); return }
        if (e.key === '2') { e.preventDefault(); onAccIncoming(fc.id); return }
        if (e.key === '3') { e.preventDefault(); onAccBoth(fc.id); return }
        if (e.key === '4') { e.preventDefault(); onAccNone(fc.id); return }
      }
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault()
        if (fc && !fc.resolved && onAiSuggest) handleAiSuggest(fc)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); return }
      if (((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
          ((e.ctrlKey || e.metaKey) && e.key === 'y')) { e.preventDefault(); handleRedo(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleFinaliseMerge(); return }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (showShortcuts) setShowShortcuts(false); else onClose?.()
        return
      }
      if (e.altKey && (e.key === 'c' || e.key === 'C') && !e.ctrlKey) { e.preventDefault(); accAllCurrent(); return }
      if (e.altKey && (e.key === 'i' || e.key === 'I')) { e.preventDefault(); accAllIncoming(); return }
      if (e.altKey && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); setShowBase((s) => !s); return }
      if (e.altKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); setShowInlineDiff((s) => !s); return }
      if (e.altKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); setShowThreePane((s) => !s); return }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [navNext, navPrev, onAccCurrent, onAccIncoming, onAccBoth, onAccNone,
    handleUndo, handleRedo, accAllCurrent, accAllIncoming, handleAiSuggest,
    handleFinaliseMerge, conflicts, focusedIndex, showShortcuts, onClose, onAiSuggest])

  /* ── Three-pane data ─────────────────────────────────── */

  const threePaneData = useMemo(() => {
    if (!showThreePane) return null
    const fl = fileContent.split('\n')
    const oL: string[] = [], tL: string[] = [], bL: string[] = []
    const oR: Array<{ start: number; end: number }> = []
    const tR: Array<{ start: number; end: number }> = []
    const bR: Array<{ start: number; end: number }> = []
    const byStart = new Map(conflicts.map((c) => [c.startLine, c]))
    let i = 0

    while (i < fl.length) {
      const conf = byStart.get(i)
      if (conf) {
        const cl = conf.currentContent.split('\n')
        const il = conf.incomingContent.split('\n')
        const os = oL.length; oL.push(...cl); oR.push({ start: os, end: os + cl.length - 1 })
        const ts = tL.length; tL.push(...il); tR.push({ start: ts, end: ts + il.length - 1 })
        if (conf.baseContent !== null) {
          const bl = conf.baseContent.split('\n')
          const bs = bL.length; bL.push(...bl); bR.push({ start: bs, end: bs + bl.length - 1 })
        } else {
          const mx = Math.max(cl.length, il.length)
          const bs = bL.length; for (let k = 0; k < mx; k++) bL.push('')
          bR.push({ start: bs, end: bs + mx - 1 })
        }
        i = conf.endLine + 1
      } else { oL.push(fl[i]); tL.push(fl[i]); bL.push(fl[i]); i++ }
    }
    return { oL, tL, bL, oR, tR, bR }
  }, [showThreePane, fileContent, conflicts])

  const previewContent = useMemo(() => buildResolvedContent(fileContent, conflicts), [fileContent, conflicts])

  /* ── Render ──────────────────────────────────────────── */

  if (total === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 40, color: 'var(--text-secondary)', gap: 12 }}>
        <CheckCheck size={32} style={{ color: 'var(--success)' }} />
        <span style={{ fontSize: 14 }}>No merge conflicts found in this file.</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-primary)', color: 'var(--text-primary)', position: 'relative' }}>

      {showShortcuts && <ShortcutHelp onClose={() => setShowShortcuts(false)} />}

      {/* ── File header ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-primary)', flexWrap: 'wrap', gap: 6, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitMerge size={16} style={{ color: 'var(--warning)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Merge Conflicts</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: MONO }}>{fileName(filePath)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '1px 6px',
            background: 'var(--bg-tertiary)', borderRadius: 3 }}>{currentBranch} {'<->'} {incomingBranch}</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, fontSize: 11, fontWeight: 700,
            background: allDone ? 'var(--success)' : 'var(--error)', color: '#fff',
          }}>{remaining > 0 ? remaining : <Check size={11} />}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ActionButton icon={<Columns size={12} />} label="Three-Pane" shortcut="Alt+T"
            color="var(--text-secondary)" onClick={() => setShowThreePane((s) => !s)} active={showThreePane} />
          <ActionButton icon={<Eye size={12} />} label="Inline Diff" shortcut="Alt+D"
            color="var(--text-secondary)" onClick={() => setShowInlineDiff((s) => !s)} active={showInlineDiff} />
          {hasBase && <ActionButton icon={<Eye size={12} />} label="Show Base" shortcut="Alt+B"
            color="var(--text-secondary)" onClick={() => setShowBase((s) => !s)} active={showBase} />}
          <ActionButton icon={<Keyboard size={12} />} label="Shortcuts"
            color="var(--text-secondary)" onClick={() => setShowShortcuts((s) => !s)} />
          {onClose && (
            <button onClick={onClose} title="Close (Escape)" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, background: 'transparent', border: 'none',
              borderRadius: 3, cursor: 'pointer', color: 'var(--text-secondary)',
            }}><X size={14} /></button>
          )}
        </div>
      </div>

      {/* ── Summary bar ──────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '5px 12px', background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-primary)', flexWrap: 'wrap', gap: 6, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SummaryBadge label="Total" count={total} color="var(--warning)" />
          <SummaryBadge label="Resolved" count={resolved} color="var(--success)" />
          <SummaryBadge label="Remaining" count={remaining}
            color={remaining > 0 ? 'var(--error)' : 'var(--success)'} />
          {/* Progress bar */}
          <div style={{ width: 80, height: 4, borderRadius: 2, background: 'var(--bg-primary)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${total > 0 ? (resolved / total) * 100 : 0}%`,
              background: allDone ? 'var(--success)' : 'var(--accent-primary)',
              borderRadius: 2, transition: 'width 0.2s',
            }} />
          </div>
          {/* Undo / Redo */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
            <button onClick={handleUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, background: 'transparent',
              border: '1px solid var(--border-primary)', borderRadius: 3,
              cursor: canUndo ? 'pointer' : 'default', color: 'var(--text-secondary)',
              opacity: canUndo ? 1 : 0.35,
            }}><Undo2 size={12} /></button>
            <button onClick={handleRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 24, height: 24, background: 'transparent',
              border: '1px solid var(--border-primary)', borderRadius: 3,
              cursor: canRedo ? 'pointer' : 'default', color: 'var(--text-secondary)',
              opacity: canRedo ? 1 : 0.35,
            }}><Redo2 size={12} /></button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <ActionButton icon={<ArrowUpFromLine size={12} />} label="Accept All Current" shortcut="Alt+C"
            color={C.oursAccent} onClick={accAllCurrent} />
          <ActionButton icon={<ArrowDownToLine size={12} />} label="Accept All Incoming" shortcut="Alt+I"
            color={C.theirsAccent} onClick={accAllIncoming} />
          {resolved > 0 && <ActionButton icon={<RotateCcw size={12} />} label="Reset All"
            color="var(--text-secondary)" onClick={resetAll} />}
          <div style={{ width: 1, height: 18, background: 'var(--border-primary)', margin: '0 4px' }} />
          <button onClick={navPrev} title="Previous Conflict (Shift+F7)" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, background: 'transparent',
            border: '1px solid var(--border-primary)', borderRadius: 3,
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}><ChevronUp size={14} /></button>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>
            {focusedIndex + 1} / {total}
          </span>
          <button onClick={navNext} title="Next Conflict (F7)" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, background: 'transparent',
            border: '1px solid var(--border-primary)', borderRadius: 3,
            cursor: 'pointer', color: 'var(--text-secondary)',
          }}><ChevronDown size={14} /></button>
        </div>
      </div>

      {/* ── Three-pane view ──────────────────────────────── */}
      {showThreePane && threePaneData && (
        <div style={{ display: 'flex', flex: 1, minHeight: 0, borderBottom: '1px solid var(--border-primary)' }}>
          <Pane title={`Ours (${currentBranch})`} lines={threePaneData.oL} language={language}
            accentColor={C.oursAccent} headerBg={C.oursHeader} lineBg={C.oursBg}
            borderColor={C.oursBorder} scrollTop={syncScrollTop} onScroll={setSyncScrollTop}
            conflictRanges={threePaneData.oR} highlightBg="rgba(40,167,69,0.12)" />
          <Pane title="Base (Common Ancestor)" lines={threePaneData.bL} language={language}
            accentColor={C.baseAccent} headerBg={C.baseHeader} lineBg={C.baseBg}
            borderColor={C.baseBorder} scrollTop={syncScrollTop} onScroll={setSyncScrollTop}
            conflictRanges={threePaneData.bR} highlightBg="rgba(160,160,160,0.10)" />
          <Pane title={`Theirs (${incomingBranch})`} lines={threePaneData.tL} language={language}
            accentColor={C.theirsAccent} headerBg={C.theirsHeader} lineBg={C.theirsBg}
            borderColor={C.theirsBorder} scrollTop={syncScrollTop} onScroll={setSyncScrollTop}
            conflictRanges={threePaneData.tR} highlightBg="rgba(30,110,215,0.12)" />
        </div>
      )}

      {/* ── Conflict list ────────────────────────────────── */}
      {!showThreePane && (
        <div style={{ flex: 1, overflow: 'auto', padding: 12, minHeight: 0 }}>
          {conflicts.map((c, idx) => (
            <ConflictBlock key={c.id} conflict={c} index={idx} isFocused={idx === focusedIndex}
              language={language} showBase={showBase} showInlineDiff={showInlineDiff}
              onAcceptCurrent={onAccCurrent} onAcceptIncoming={onAccIncoming}
              onAcceptBoth={onAccBoth} onAcceptNone={onAccNone}
              onCustomResolve={onCustom} onReset={onReset} onFocus={setFocusedIndex}
              onAiSuggest={onAiSuggest ? handleAiSuggest : undefined}
              aiLoading={aiLoadingId === c.id} />
          ))}
        </div>
      )}

      {/* ── Three-pane conflict actions ──────────────────── */}
      {showThreePane && (
        <div style={{ overflow: 'auto', padding: '8px 12px', borderTop: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)', maxHeight: 200 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {conflicts.map((c, idx) => (
              <div key={c.id} onClick={() => setFocusedIndex(idx)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 8px', borderRadius: 4, cursor: 'pointer', transition: 'background 0.1s',
                background: idx === focusedIndex ? 'rgba(88,166,255,0.08)' : 'transparent',
                border: `1px solid ${idx === focusedIndex ? 'var(--accent-primary)' : 'transparent'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>#{idx + 1}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    L{c.startLine + 1}&ndash;{c.endLine + 1}
                  </span>
                  {c.resolved && (
                    <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: 'rgba(40,160,80,0.15)', color: 'var(--success)', fontWeight: 600 }}>
                      {c.resolution}
                    </span>
                  )}
                </div>
                {!c.resolved ? (
                  <div style={{ display: 'flex', gap: 3 }}>
                    <ActionButton icon={<ArrowUpFromLine size={10} />} label="Ours"
                      color={C.oursAccent} onClick={() => onAccCurrent(c.id)} />
                    <ActionButton icon={<ArrowDownToLine size={10} />} label="Theirs"
                      color={C.theirsAccent} onClick={() => onAccIncoming(c.id)} />
                    <ActionButton icon={<Combine size={10} />} label="Both"
                      color="rgba(180,140,40,0.8)" onClick={() => onAccBoth(c.id)} />
                    <ActionButton icon={<Ban size={10} />} label="None"
                      color="var(--text-secondary)" onClick={() => onAccNone(c.id)} />
                    {onAiSuggest && <ActionButton icon={<Sparkles size={10} />} label="AI"
                      color="rgba(168,85,247,0.85)" onClick={() => handleAiSuggest(c)}
                      disabled={aiLoadingId === c.id} />}
                  </div>
                ) : (
                  <ActionButton icon={<RotateCcw size={10} />} label="Reset"
                    color="var(--text-secondary)" onClick={() => onReset(c.id)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Result pane ──────────────────────────────────── */}
      <ResultPane content={previewContent} language={language}
        onEdit={handleResultEdit} editable={allDone} />

      {/* ── Bottom bar ───────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-primary)', flexShrink: 0, gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {allDone ? <CheckCheck size={14} style={{ color: 'var(--success)' }} />
            : <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {allDone ? 'All conflicts resolved. Ready to complete merge.'
              : `${remaining} conflict${remaining > 1 ? 's' : ''} remaining`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {onClose && (
            <button onClick={onClose} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px',
              fontSize: 12, fontWeight: 600, background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)', border: '1px solid var(--border-primary)',
              borderRadius: 4, cursor: 'pointer',
            }}><X size={13} />Cancel</button>
          )}
          <button onClick={handleFinaliseMerge} disabled={!allDone} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px',
            fontSize: 12, fontWeight: 600,
            background: allDone ? 'var(--success)' : 'var(--bg-tertiary)',
            color: allDone ? '#fff' : 'var(--text-secondary)',
            border: 'none', borderRadius: 4,
            cursor: allDone ? 'pointer' : 'default',
            opacity: allDone ? 1 : 0.6, transition: 'background 0.15s, opacity 0.15s',
          }}><Save size={13} />Save Resolved</button>
        </div>
      </div>
    </div>
  )
}

export default MergeConflictResolver
