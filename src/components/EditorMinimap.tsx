import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MinimapHighlightKind =
  | 'search'
  | 'selection'
  | 'git-added'
  | 'git-modified'
  | 'git-deleted'
  | 'error'
  | 'warning'
  | 'info'
  | 'bookmark'
  | 'breakpoint'

export interface MinimapHighlight {
  /** 1-based start line */
  startLine: number
  /** 1-based end line (inclusive) */
  endLine: number
  kind: MinimapHighlightKind
}

export interface MinimapProps {
  /** Full text content of the editor */
  content: string
  /** Language id for syntax coloring (e.g. "typescript", "python") */
  language?: string
  /** 1-based first visible line */
  viewportStart: number
  /** 1-based last visible line */
  viewportEnd: number
  /** Total number of lines in the document */
  totalLines: number
  /** Optional highlights (search results, git changes, diagnostics, etc.) */
  highlights?: MinimapHighlight[]
  /** Callback when user clicks/drags to scroll. Receives 1-based line number. */
  onScroll?: (line: number) => void
  /** Minimap width in pixels (default: 86) */
  width?: number
  /** Whether to show the viewport slider (default: true) */
  showSlider?: boolean
  /** Auto-hide the minimap when mouse leaves (default: false) */
  autoHide?: boolean
  /** Delay in ms before hiding (only used when autoHide is true, default: 1200) */
  autoHideDelay?: number
  /** Character width in minimap pixels (default: 1.4) */
  charWidth?: number
  /** Line height in minimap pixels (default: 3) */
  lineHeight?: number
  /** Maximum number of characters to render per line (default: 120) */
  maxColumns?: number
  /** Whether the minimap is enabled (default: true) */
  enabled?: boolean
}

// ─── Syntax color palette ─────────────────────────────────────────────────────

/** Minimal token classification for minimap rendering — not a full parser. */
const TOKEN_COLORS: Record<string, string> = {
  keyword: '#569cd6',
  string: '#ce9178',
  comment: '#6a9955',
  number: '#b5cea8',
  type: '#4ec9b0',
  function: '#dcdcaa',
  operator: '#d4d4d4',
  punctuation: '#808080',
  default: '#9cdcfe',
}

/** Highlight kind ➜ colour mapping */
const HIGHLIGHT_COLORS: Record<MinimapHighlightKind, string> = {
  search: 'rgba(234, 179, 8, 0.55)',
  selection: 'rgba(38, 79, 120, 0.65)',
  'git-added': '#2ea04370',
  'git-modified': '#0078d470',
  'git-deleted': '#f8514970',
  error: '#f85149',
  warning: '#d29922',
  info: '#3fb950',
  bookmark: '#a371f7',
  breakpoint: '#f85149',
}

// ─── Keyword sets per language ────────────────────────────────────────────────

const KEYWORD_SETS: Record<string, Set<string>> = {
  typescript: new Set([
    'abstract', 'as', 'async', 'await', 'break', 'case', 'catch', 'class',
    'const', 'continue', 'debugger', 'declare', 'default', 'delete', 'do',
    'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'from',
    'function', 'get', 'if', 'implements', 'import', 'in', 'instanceof',
    'interface', 'keyof', 'let', 'module', 'namespace', 'new', 'null', 'of',
    'package', 'private', 'protected', 'public', 'readonly', 'return', 'set',
    'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'type',
    'typeof', 'undefined', 'var', 'void', 'while', 'with', 'yield',
  ]),
  javascript: new Set([
    'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends',
    'false', 'finally', 'for', 'from', 'function', 'get', 'if', 'import',
    'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'set',
    'static', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
    'undefined', 'var', 'void', 'while', 'with', 'yield',
  ]),
  python: new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
    'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
    'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
    'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
    'while', 'with', 'yield',
  ]),
  rust: new Set([
    'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
    'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in',
    'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return',
    'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type',
    'unsafe', 'use', 'where', 'while',
  ]),
  go: new Set([
    'break', 'case', 'chan', 'const', 'continue', 'default', 'defer',
    'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import',
    'interface', 'map', 'package', 'range', 'return', 'select', 'struct',
    'switch', 'type', 'var',
  ]),
}

// Alias families
const LANGUAGE_ALIASES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  typescriptreact: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  javascriptreact: 'javascript',
  py: 'python',
  rs: 'rust',
  golang: 'go',
}

function resolveKeywords(language?: string): Set<string> {
  if (!language) return KEYWORD_SETS.typescript
  const normalized = language.toLowerCase()
  const alias = LANGUAGE_ALIASES[normalized] ?? normalized
  return KEYWORD_SETS[alias] ?? KEYWORD_SETS.typescript
}

// ─── Lightweight tokenizer for minimap colors ─────────────────────────────────

interface MiniToken {
  text: string
  color: string
}

/**
 * Fast, approximate tokenizer — just enough to colour the minimap.
 * Handles strings, comments, numbers, keywords and falls back to default.
 */
function tokenizeLine(line: string, keywords: Set<string>): MiniToken[] {
  const tokens: MiniToken[] = []
  let i = 0

  while (i < line.length) {
    // Whitespace — render as default (transparent in practice)
    if (line[i] === ' ' || line[i] === '\t') {
      const start = i
      while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++
      tokens.push({ text: line.slice(start, i), color: 'transparent' })
      continue
    }

    // Single-line comment  //  or  #
    if (
      (line[i] === '/' && line[i + 1] === '/') ||
      (line[i] === '#' && (i === 0 || line[i - 1] === ' '))
    ) {
      tokens.push({ text: line.slice(i), color: TOKEN_COLORS.comment })
      break
    }

    // Block comment start (naive — doesn't cross lines)
    if (line[i] === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2)
      const slice = end >= 0 ? line.slice(i, end + 2) : line.slice(i)
      tokens.push({ text: slice, color: TOKEN_COLORS.comment })
      i += slice.length
      continue
    }

    // String (single, double, backtick)
    if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
      const quote = line[i]
      let j = i + 1
      while (j < line.length && line[j] !== quote) {
        if (line[j] === '\\') j++ // skip escaped char
        j++
      }
      j = Math.min(j + 1, line.length)
      tokens.push({ text: line.slice(i, j), color: TOKEN_COLORS.string })
      i = j
      continue
    }

    // Number
    if (/[0-9]/.test(line[i])) {
      const start = i
      while (i < line.length && /[0-9.xXa-fA-F_eEn]/.test(line[i])) i++
      tokens.push({ text: line.slice(start, i), color: TOKEN_COLORS.number })
      continue
    }

    // Operator / punctuation
    if (/[+\-*/%=<>!&|^~?:;,.]/.test(line[i])) {
      tokens.push({ text: line[i], color: TOKEN_COLORS.operator })
      i++
      continue
    }

    if (/[{}()\[\]]/.test(line[i])) {
      tokens.push({ text: line[i], color: TOKEN_COLORS.punctuation })
      i++
      continue
    }

    // Word
    if (/[a-zA-Z_$]/.test(line[i])) {
      const start = i
      while (i < line.length && /[a-zA-Z0-9_$]/.test(line[i])) i++
      const word = line.slice(start, i)
      if (keywords.has(word)) {
        tokens.push({ text: word, color: TOKEN_COLORS.keyword })
      } else if (word[0] === word[0].toUpperCase() && /[a-z]/.test(word)) {
        tokens.push({ text: word, color: TOKEN_COLORS.type })
      } else if (i < line.length && line[i] === '(') {
        tokens.push({ text: word, color: TOKEN_COLORS.function })
      } else {
        tokens.push({ text: word, color: TOKEN_COLORS.default })
      }
      continue
    }

    // Catch-all
    tokens.push({ text: line[i], color: TOKEN_COLORS.default })
    i++
  }

  return tokens
}

// ─── Injected Styles ──────────────────────────────────────────────────────────

const MINIMAP_STYLES = `
.orion-minimap-root {
  position: relative;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary, #1e1e1e);
  border-left: 1px solid var(--border, #2d2d2d);
  user-select: none;
  flex-shrink: 0;
  cursor: default;
  transition: opacity 0.2s ease;
}

.orion-minimap-root.auto-hide {
  opacity: 0.35;
}

.orion-minimap-root.auto-hide:hover,
.orion-minimap-root.auto-hide.visible {
  opacity: 1;
}

.orion-minimap-canvas {
  display: block;
}

.orion-minimap-viewport {
  position: absolute;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.07);
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  pointer-events: none;
  transition: background 0.12s ease;
  z-index: 2;
}

.orion-minimap-root:hover .orion-minimap-viewport,
.orion-minimap-viewport.dragging {
  background: rgba(255, 255, 255, 0.13);
}

.orion-minimap-viewport.dragging {
  border-color: rgba(255, 255, 255, 0.22);
}

.orion-minimap-gutter {
  position: absolute;
  left: 0;
  width: 4px;
  z-index: 3;
  pointer-events: none;
}

.orion-minimap-marker-dot {
  position: absolute;
  border-radius: 50%;
  z-index: 4;
  pointer-events: none;
}

.orion-minimap-tooltip {
  position: fixed;
  z-index: 10020;
  background: var(--bg-secondary, #252526);
  color: var(--text-primary, #cccccc);
  border: 1px solid var(--border, #3c3c3c);
  border-radius: 3px;
  padding: 2px 6px;
  font-size: 11px;
  font-family: var(--font-mono, 'Cascadia Code', 'Fira Code', monospace);
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.5);
}

.orion-minimap-disabled {
  display: none;
}
`

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Clamp a number between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Build a lookup: line number ➜ array of highlight kinds. */
function buildHighlightMap(
  highlights: MinimapHighlight[],
  totalLines: number,
): Map<number, MinimapHighlightKind[]> {
  const map = new Map<number, MinimapHighlightKind[]>()
  for (const h of highlights) {
    const lo = clamp(h.startLine, 1, totalLines)
    const hi = clamp(h.endLine, 1, totalLines)
    for (let ln = lo; ln <= hi; ln++) {
      const arr = map.get(ln)
      if (arr) {
        arr.push(h.kind)
      } else {
        map.set(ln, [h.kind])
      }
    }
  }
  return map
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditorMinimap({
  content,
  language,
  viewportStart,
  viewportEnd,
  totalLines,
  highlights = [],
  onScroll,
  width = 86,
  showSlider = true,
  autoHide = false,
  autoHideDelay = 1200,
  charWidth = 1.4,
  lineHeight = 3,
  maxColumns = 120,
  enabled = true,
}: MinimapProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)
  const animFrameRef = useRef<number>(0)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── State ─────────────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [tooltipLine, setTooltipLine] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(!autoHide)
  const [canvasHeight, setCanvasHeight] = useState(0)

  // ── Derived ───────────────────────────────────────────────────────────────
  const lines = useMemo(() => content.split('\n'), [content])
  const effectiveTotalLines = totalLines > 0 ? totalLines : lines.length
  const keywords = useMemo(() => resolveKeywords(language), [language])

  /** Pre-tokenize all lines so canvas paint is fast. */
  const tokenizedLines = useMemo(() => {
    return lines.map((line) => tokenizeLine(line.slice(0, maxColumns), keywords))
  }, [lines, keywords, maxColumns])

  /** Highlight lookup map. */
  const highlightMap = useMemo(
    () => buildHighlightMap(highlights, effectiveTotalLines),
    [highlights, effectiveTotalLines],
  )

  /** Gutter-type highlights (git changes — rendered as left-edge bars). */
  const gutterKinds = useMemo(
    () => new Set<MinimapHighlightKind>(['git-added', 'git-modified', 'git-deleted']),
    [],
  )

  /** Dot-type highlights (errors, warnings, bookmarks, breakpoints). */
  const dotKinds = useMemo(
    () => new Set<MinimapHighlightKind>(['error', 'warning', 'info', 'bookmark', 'breakpoint']),
    [],
  )

  // ── Inject global styles once ─────────────────────────────────────────────
  useEffect(() => {
    if (styleRef.current) return
    const style = document.createElement('style')
    style.textContent = MINIMAP_STYLES
    document.head.appendChild(style)
    styleRef.current = style
    return () => {
      style.remove()
      styleRef.current = null
    }
  }, [])

  // ── Compute canvas dimensions ─────────────────────────────────────────────
  const totalCanvasHeight = effectiveTotalLines * lineHeight

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasHeight(Math.floor(entry.contentRect.height))
      }
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [])

  // ── Paint canvas ──────────────────────────────────────────────────────────
  const paintCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const drawWidth = width
    const drawHeight = canvasHeight || canvas.parentElement?.clientHeight || 600

    // Size the canvas accounting for DPR
    canvas.width = drawWidth * dpr
    canvas.height = drawHeight * dpr
    canvas.style.width = `${drawWidth}px`
    canvas.style.height = `${drawHeight}px`
    ctx.scale(dpr, dpr)

    // Background
    ctx.fillStyle = '#1e1e1e'
    ctx.fillRect(0, 0, drawWidth, drawHeight)

    // If the total content is taller than the canvas, we need to scale
    const scaleY =
      totalCanvasHeight > drawHeight ? drawHeight / totalCanvasHeight : 1
    const scaledLineHeight = lineHeight * scaleY
    const scaledCharWidth = charWidth * scaleY
    const gutterWidth = 4

    // ── Draw line-level highlights (search, selection) ─────────────────────
    highlightMap.forEach((kinds, lineNum) => {
      const y = (lineNum - 1) * scaledLineHeight
      for (const kind of kinds) {
        if (gutterKinds.has(kind) || dotKinds.has(kind)) continue
        ctx.fillStyle = HIGHLIGHT_COLORS[kind]
        ctx.fillRect(gutterWidth, y, drawWidth - gutterWidth, scaledLineHeight)
      }
    })

    // ── Draw code tokens ──────────────────────────────────────────────────
    const startLine = 0
    const endLine = tokenizedLines.length
    for (let i = startLine; i < endLine; i++) {
      const y = i * scaledLineHeight
      if (y > drawHeight) break
      if (y + scaledLineHeight < 0) continue

      const tokens = tokenizedLines[i]
      let x = gutterWidth + 2

      for (const token of tokens) {
        if (token.color === 'transparent') {
          // Advance for whitespace
          for (const ch of token.text) {
            x += ch === '\t' ? charWidth * 4 * scaleY : scaledCharWidth
          }
          continue
        }

        ctx.fillStyle = token.color
        const tokenWidth = token.text.length * scaledCharWidth

        // Render as tiny rectangles (not text) for performance
        if (scaledLineHeight >= 2) {
          ctx.fillRect(
            x,
            y + scaledLineHeight * 0.15,
            tokenWidth,
            scaledLineHeight * 0.65,
          )
        } else {
          ctx.fillRect(x, y, tokenWidth, scaledLineHeight)
        }

        x += tokenWidth
        if (x > drawWidth) break
      }
    }

    // ── Draw gutter indicators (git changes) ──────────────────────────────
    highlightMap.forEach((kinds, lineNum) => {
      const y = (lineNum - 1) * scaledLineHeight
      for (const kind of kinds) {
        if (!gutterKinds.has(kind)) continue
        ctx.fillStyle = HIGHLIGHT_COLORS[kind]
        ctx.fillRect(0, y, gutterWidth, scaledLineHeight)
      }
    })

    // ── Draw dot markers (errors, warnings, bookmarks, breakpoints) ───────
    highlightMap.forEach((kinds, lineNum) => {
      const y = (lineNum - 1) * scaledLineHeight + scaledLineHeight / 2
      let xOff = drawWidth - 5
      for (const kind of kinds) {
        if (!dotKinds.has(kind)) continue
        ctx.beginPath()
        const radius = Math.max(1.5, scaledLineHeight * 0.35)
        ctx.arc(xOff, y, radius, 0, Math.PI * 2)
        ctx.fillStyle = HIGHLIGHT_COLORS[kind]
        ctx.fill()
        xOff -= radius * 2.5
      }
    })
  }, [
    canvasHeight,
    width,
    tokenizedLines,
    highlightMap,
    lineHeight,
    charWidth,
    totalCanvasHeight,
    gutterKinds,
    dotKinds,
  ])

  // Repaint whenever dependencies change
  useEffect(() => {
    cancelAnimationFrame(animFrameRef.current)
    animFrameRef.current = requestAnimationFrame(paintCanvas)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [paintCanvas])

  // ── Viewport indicator geometry ───────────────────────────────────────────
  const viewportGeometry = useMemo(() => {
    const h = canvasHeight || 600
    const scaleY = totalCanvasHeight > h ? h / totalCanvasHeight : 1
    const top = (viewportStart - 1) * lineHeight * scaleY
    const bottom = viewportEnd * lineHeight * scaleY
    return {
      top: clamp(top, 0, h),
      height: clamp(bottom - top, 8, h - top),
    }
  }, [viewportStart, viewportEnd, lineHeight, totalCanvasHeight, canvasHeight])

  // ── Coordinate ➜ line number ──────────────────────────────────────────────
  const yToLine = useCallback(
    (clientY: number): number => {
      const root = rootRef.current
      if (!root) return 1
      const rect = root.getBoundingClientRect()
      const y = clientY - rect.top
      const h = canvasHeight || rect.height
      const scaleY = totalCanvasHeight > h ? h / totalCanvasHeight : 1
      const line = Math.round(y / (lineHeight * scaleY)) + 1
      return clamp(line, 1, effectiveTotalLines)
    },
    [canvasHeight, totalCanvasHeight, lineHeight, effectiveTotalLines],
  )

  // ── Click handler ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      e.preventDefault()

      const root = rootRef.current
      if (!root) return
      const rect = root.getBoundingClientRect()
      const y = e.clientY - rect.top

      // Check if clicking inside the viewport slider
      if (
        showSlider &&
        y >= viewportGeometry.top &&
        y <= viewportGeometry.top + viewportGeometry.height
      ) {
        setIsDragging(true)
        return
      }

      // Click to scroll — center viewport around clicked line
      const line = yToLine(e.clientY)
      onScroll?.(line)
    },
    [showSlider, viewportGeometry, yToLine, onScroll],
  )

  // ── Drag handler ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDragging) return

    const handleMove = (e: MouseEvent) => {
      e.preventDefault()
      const line = yToLine(e.clientY)
      onScroll?.(line)
    }

    const handleUp = () => {
      setIsDragging(false)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging, yToLine, onScroll])

  // ── Hover / tooltip ───────────────────────────────────────────────────────
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const line = yToLine(e.clientY)
      setTooltipLine(line)
      setTooltipPos({ x: e.clientX, y: e.clientY })
    },
    [yToLine],
  )

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true)
    if (autoHide) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      setIsVisible(true)
    }
  }, [autoHide])

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false)
    setTooltipLine(null)
    if (autoHide) {
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false)
      }, autoHideDelay)
    }
  }, [autoHide, autoHideDelay])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  // ── Gutter and dot markers for overlay rendering ──────────────────────────
  const gutterMarkers = useMemo(() => {
    const markers: { top: number; height: number; color: string }[] = []
    const h = canvasHeight || 600
    const scaleY = totalCanvasHeight > h ? h / totalCanvasHeight : 1
    const scaledLH = lineHeight * scaleY

    highlightMap.forEach((kinds, lineNum) => {
      for (const kind of kinds) {
        if (!gutterKinds.has(kind)) continue
        markers.push({
          top: (lineNum - 1) * scaledLH,
          height: Math.max(scaledLH, 2),
          color: HIGHLIGHT_COLORS[kind],
        })
      }
    })
    return markers
  }, [highlightMap, canvasHeight, totalCanvasHeight, lineHeight, gutterKinds])

  const dotMarkers = useMemo(() => {
    const markers: { top: number; color: string; kind: MinimapHighlightKind }[] = []
    const h = canvasHeight || 600
    const scaleY = totalCanvasHeight > h ? h / totalCanvasHeight : 1
    const scaledLH = lineHeight * scaleY

    highlightMap.forEach((kinds, lineNum) => {
      for (const kind of kinds) {
        if (!dotKinds.has(kind)) continue
        markers.push({
          top: (lineNum - 1) * scaledLH + scaledLH * 0.15,
          color: HIGHLIGHT_COLORS[kind],
          kind,
        })
      }
    })
    return markers
  }, [highlightMap, canvasHeight, totalCanvasHeight, lineHeight, dotKinds])

  // ── Tooltip text ──────────────────────────────────────────────────────────
  const tooltipText = useMemo(() => {
    if (tooltipLine === null) return ''
    const parts = [`Line ${tooltipLine}`]
    const kinds = highlightMap.get(tooltipLine)
    if (kinds) {
      const labels: string[] = []
      for (const k of kinds) {
        switch (k) {
          case 'error':
            labels.push('Error')
            break
          case 'warning':
            labels.push('Warning')
            break
          case 'info':
            labels.push('Info')
            break
          case 'bookmark':
            labels.push('Bookmark')
            break
          case 'breakpoint':
            labels.push('Breakpoint')
            break
          case 'git-added':
            labels.push('Added')
            break
          case 'git-modified':
            labels.push('Modified')
            break
          case 'git-deleted':
            labels.push('Deleted')
            break
          case 'search':
            labels.push('Search match')
            break
          case 'selection':
            labels.push('Selected')
            break
        }
      }
      if (labels.length > 0) {
        parts.push(labels.join(', '))
      }
    }
    return parts.join(' — ')
  }, [tooltipLine, highlightMap])

  // ── Scroll-bar-style overview ruler marks (right edge) ────────────────────
  const overviewRulerMarks = useMemo(() => {
    const marks: { top: number; color: string }[] = []
    const h = canvasHeight || 600
    const scaleY = totalCanvasHeight > h ? h / totalCanvasHeight : 1
    const scaledLH = lineHeight * scaleY

    highlightMap.forEach((kinds, lineNum) => {
      for (const kind of kinds) {
        if (kind === 'error' || kind === 'warning' || kind === 'search') {
          marks.push({
            top: (lineNum - 1) * scaledLH,
            color: HIGHLIGHT_COLORS[kind],
          })
        }
      }
    })
    return marks
  }, [highlightMap, canvasHeight, totalCanvasHeight, lineHeight])

  // ── Render ────────────────────────────────────────────────────────────────

  if (!enabled) {
    return <div className="orion-minimap-disabled" />
  }

  return (
    <div
      ref={rootRef}
      className={`orion-minimap-root${autoHide ? ' auto-hide' : ''}${isVisible ? ' visible' : ''}`}
      style={{ width }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Canvas layer — code rendering */}
      <canvas
        ref={canvasRef}
        className="orion-minimap-canvas"
        style={{ width, height: '100%' }}
      />

      {/* Viewport slider */}
      {showSlider && (
        <div
          className={`orion-minimap-viewport${isDragging ? ' dragging' : ''}`}
          style={{
            top: viewportGeometry.top,
            height: viewportGeometry.height,
            pointerEvents: isDragging ? 'auto' : 'none',
          }}
        />
      )}

      {/* Overview ruler marks (right-edge ticks for errors/warnings/search) */}
      {overviewRulerMarks.map((mark, i) => (
        <div
          key={`ruler-${i}`}
          style={{
            position: 'absolute',
            right: 0,
            top: mark.top,
            width: 3,
            height: 3,
            background: mark.color,
            borderRadius: 1,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        />
      ))}

      {/* Hover tooltip */}
      {isHovering && tooltipLine !== null && !isDragging && (
        <div
          className="orion-minimap-tooltip"
          style={{
            left: tooltipPos.x - width - 12,
            top: tooltipPos.y - 12,
          }}
        >
          {tooltipText}
        </div>
      )}
    </div>
  )
}
