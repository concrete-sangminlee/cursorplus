import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  Children,
  createContext,
  useContext,
} from 'react'

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

/**
 * SplitView — A flexible, reusable split pane component for the Orion IDE.
 *
 * Features:
 * - Horizontal and vertical split directions
 * - Draggable resize handle with snap points (25%, 33%, 50%, 67%, 75%)
 * - Double-click handle to reset to 50/50
 * - Minimum pane sizes (configurable, default 100px)
 * - Collapse/expand panes via gutter arrows
 * - Nested splits support (split within split)
 * - Keyboard shortcuts for resizing (Ctrl+Shift+Arrow, plus gutter arrow keys)
 * - Animated transitions on snap/collapse
 * - Save/restore split ratios via localStorage
 * - CSS variables for theming (--split-handle-color, --split-handle-hover, etc.)
 *
 * Exports:
 *   SplitView   — main component (default export)
 *   SplitPane   — child wrapper with optional per-pane constraints
 *   useSplitResize — hook for programmatic control of split state
 */

interface SplitViewProps {
  /** Split direction: horizontal (left/right) or vertical (top/bottom) */
  direction?: 'horizontal' | 'vertical'
  /** Initial sizes as percentages (must sum to 100). Length must match child count. */
  sizes?: number[]
  /** Minimum pane size in pixels (default 100px) */
  minSize?: number
  /** Maximum pane size in pixels */
  maxSize?: number
  /** Snap points as percentages (e.g. [25, 33, 50, 67, 75]) */
  snapPoints?: number[]
  /** Callback fired when pane sizes change */
  onResize?: (sizes: number[]) => void
  /** Pane children (2-4 SplitPane elements) */
  children: React.ReactNode
  /** Gutter/handle size in pixels */
  gutterSize?: number
  /** Whether panes can be collapsed via gutter arrows or drag-to-edge */
  collapsible?: boolean
  /** localStorage key for persisting sizes across sessions */
  persistKey?: string
  /** Default sizes to restore on double-click reset (percentages summing to 100) */
  defaultSizes?: number[]
  /** CSS class for the outer container */
  className?: string
  /** Inline styles for the outer container */
  style?: React.CSSProperties
  /** Snap threshold in pixels — proximity to a snap point that triggers snapping */
  snapThreshold?: number
  /** Whether animated transitions are enabled for collapse/expand/snap */
  animated?: boolean
}

interface SplitPaneProps {
  /** Pane content */
  children: React.ReactNode
  /** Minimum size override for this specific pane (pixels) */
  minSize?: number
  /** Maximum size override for this specific pane (pixels) */
  maxSize?: number
  /** CSS class for the pane wrapper */
  className?: string
  /** Inline styles for the pane wrapper */
  style?: React.CSSProperties
}

interface GutterState {
  dragging: boolean
  hovering: boolean
  focused: boolean
}

interface SplitResizeAPI {
  /** Current pane sizes as percentages (always sum to 100) */
  sizes: number[]
  /** Set all sizes at once */
  setSizes: React.Dispatch<React.SetStateAction<number[]>>
  /** Set a single pane's size; redistributes remainder proportionally */
  setSize: (index: number, percent: number) => void
  /** Reset to initial/default sizes and expand all collapsed panes */
  resetSizes: () => void
  /** Collapse a specific pane by index */
  collapsePane: (index: number) => void
  /** Expand a specific pane by index */
  expandPane: (index: number) => void
  /** Boolean array indicating which panes are currently collapsed */
  collapsed: boolean[]
}

/** Default snap percentages */
const DEFAULT_SNAP_POINTS = [25, 33.33, 50, 66.67, 75]

/** Default snap threshold in pixels */
const DEFAULT_SNAP_THRESHOLD = 8

/** Minimum pane size in pixels when none specified */
const DEFAULT_MIN_SIZE = 100

/** Keyboard resize step in pixels */
const KEYBOARD_STEP = 4

/** Keyboard resize step with Shift held */
const KEYBOARD_STEP_LARGE = 20

/** Collapse threshold: how far past min before collapsing (px) */
const COLLAPSE_THRESHOLD_PX = 30

/** Transition duration for animated collapse/expand (ms) */
const TRANSITION_DURATION = 200

/** localStorage key prefix */
const STORAGE_PREFIX = 'orion:split-view:'

/** Touch move threshold to distinguish from taps */
const TOUCH_MOVE_THRESHOLD = 3

// ---------------------------------------------------------------------------
// Context for programmatic control from children
// ---------------------------------------------------------------------------

const SplitResizeContext = createContext<SplitResizeAPI | null>(null)

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function equalSizes(count: number): number[] {
  const size = 100 / count
  return Array.from({ length: count }, () => size)
}

function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0)
  if (total === 0) return equalSizes(sizes.length)
  return sizes.map((s) => (s / total) * 100)
}

function loadPersistedSizes(key: string, count: number): number[] | null {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key)
    if (!stored) return null
    const parsed: number[] = JSON.parse(stored)
    if (!Array.isArray(parsed) || parsed.length !== count) return null
    if (parsed.some((v) => typeof v !== 'number' || v < 0 || isNaN(v))) return null
    return normalizeSizes(parsed)
  } catch { return null }
}

function persistSizes(key: string, sizes: number[]): void {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(sizes)) } catch {}
}

function loadCollapsedState(key: string, count: number): boolean[] | null {
  try {
    const stored = localStorage.getItem(STORAGE_PREFIX + key + ':collapsed')
    if (!stored) return null
    const parsed: boolean[] = JSON.parse(stored)
    if (!Array.isArray(parsed) || parsed.length !== count) return null
    return parsed
  } catch { return null }
}

function persistCollapsedState(key: string, collapsed: boolean[]): void {
  try { localStorage.setItem(STORAGE_PREFIX + key + ':collapsed', JSON.stringify(collapsed)) } catch {}
}

/** Redistribute a size delta proportionally across other panes */
function redistributeSetSize(prev: number[], index: number, percent: number): number[] {
  const next = [...prev]
  const delta = percent - next[index]
  next[index] = percent
  const others = next.map((s, i) => ({ s, i })).filter(({ i }) => i !== index)
  const othersTotal = others.reduce((sum, { s }) => sum + s, 0)
  if (othersTotal > 0) {
    for (const o of others) next[o.i] -= (delta * o.s) / othersTotal
  }
  return normalizeSizes(next)
}

// ---------------------------------------------------------------------------
// SplitPane — lightweight wrapper marking children for SplitView
// ---------------------------------------------------------------------------

export function SplitPane({ children, className, style }: SplitPaneProps) {
  return <div className={className} style={style} data-split-pane="">{children}</div>
}
SplitPane.displayName = 'SplitPane'

// ---------------------------------------------------------------------------
// CollapseArrow — gutter arrow button for collapsing/expanding panes
// ---------------------------------------------------------------------------

interface CollapseArrowProps {
  direction: 'horizontal' | 'vertical'
  side: 'before' | 'after'
  collapsed: boolean
  onClick: () => void
  gutterSize: number
}

function CollapseArrow({ direction, side, collapsed, onClick, gutterSize }: CollapseArrowProps) {
  const isH = direction === 'horizontal'
  const [hovered, setHovered] = useState(false)

  let chevron: string
  if (isH) {
    chevron = side === 'before' ? (collapsed ? '\u25B6' : '\u25C0') : (collapsed ? '\u25C0' : '\u25B6')
  } else {
    chevron = side === 'before' ? (collapsed ? '\u25BC' : '\u25B2') : (collapsed ? '\u25B2' : '\u25BC')
  }

  const sz = Math.max(gutterSize + 8, 14)

  return (
    <button
      type="button"
      aria-label={collapsed ? 'Expand pane' : 'Collapse pane'}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute', zIndex: 20, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        width: isH ? sz : sz + 4, height: isH ? sz + 4 : sz,
        border: '1px solid var(--split-handle-color, var(--border, #333))',
        borderRadius: 3,
        background: hovered
          ? 'var(--split-arrow-hover-bg, var(--bg-tertiary, #2d2d2d))'
          : 'var(--split-arrow-bg, var(--bg-secondary, #252526))',
        color: hovered
          ? 'var(--split-handle-hover, var(--accent, #007acc))'
          : 'var(--split-handle-color, var(--text-secondary, #858585))',
        cursor: 'pointer', fontSize: 7, lineHeight: 1, padding: 0, outline: 'none',
        transition: 'background 0.15s ease, color 0.15s ease, opacity 0.15s ease',
        opacity: hovered ? 1 : 0.7,
        ...(isH
          ? { top: '50%', transform: 'translateY(-50%)',
              ...(side === 'before' ? { left: -Math.floor(sz / 2) - 2 } : { right: -Math.floor(sz / 2) - 2 }) }
          : { left: '50%', transform: 'translateX(-50%)',
              ...(side === 'before' ? { top: -Math.floor(sz / 2) - 2 } : { bottom: -Math.floor(sz / 2) - 2 }) }),
      }}
    >
      {chevron}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Gutter — draggable separator between panes
// ---------------------------------------------------------------------------

interface GutterProps {
  index: number
  direction: 'horizontal' | 'vertical'
  size: number
  onDragStart: (index: number, clientPos: number) => void
  onDoubleClick: (index: number) => void
  onKeyboardResize: (index: number, delta: number) => void
  onCollapseToggle?: (index: number, side: 'before' | 'after') => void
  collapsedBefore: boolean
  collapsedAfter: boolean
  collapsible: boolean
}

function Gutter({
  index, direction, size, onDragStart, onDoubleClick, onKeyboardResize,
  onCollapseToggle, collapsedBefore, collapsedAfter, collapsible,
}: GutterProps) {
  const [state, setState] = useState<GutterState>({
    dragging: false,
    hovering: false,
    focused: false,
  })
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const isH = direction === 'horizontal'
  const active = state.dragging || state.hovering || state.focused

  // Mouse drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setState((s) => ({ ...s, dragging: true }))
    onDragStart(index, isH ? e.clientX : e.clientY)
  }, [index, isH, onDragStart])

  // Touch drag start — enables mobile/tablet resize
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    setState((s) => ({ ...s, dragging: true }))
    onDragStart(index, isH ? touch.clientX : touch.clientY)
  }, [index, isH, onDragStart])

  // Double-click to reset
  const handleDblClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDoubleClick(index)
  }, [index, onDoubleClick])

  // Keyboard navigation: arrows to resize, Home to reset, Enter/Space to collapse
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const decreaseKey = isH ? 'ArrowLeft' : 'ArrowUp'
    const increaseKey = isH ? 'ArrowRight' : 'ArrowDown'
    const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP

    if (e.key === decreaseKey) {
      e.preventDefault()
      onKeyboardResize(index, -step)
    } else if (e.key === increaseKey) {
      e.preventDefault()
      onKeyboardResize(index, step)
    } else if (e.key === 'Home') {
      e.preventDefault()
      onDoubleClick(index)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (onCollapseToggle) {
        // Toggle the most relevant pane: expand if collapsed, otherwise collapse "after"
        if (collapsedAfter) onCollapseToggle(index, 'after')
        else if (collapsedBefore) onCollapseToggle(index, 'before')
        else onCollapseToggle(index, 'after')
      }
    }
  }, [isH, index, onKeyboardResize, onDoubleClick, onCollapseToggle, collapsedBefore, collapsedAfter])

  // Release drag on global mouseup/touchend
  useEffect(() => {
    if (!state.dragging) return
    const onUp = () => setState((s) => ({ ...s, dragging: false }))
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchend', onUp)
    }
  }, [state.dragging])

  return (
    <div
      role="separator"
      aria-orientation={isH ? 'vertical' : 'horizontal'}
      aria-label={`Resize separator ${index + 1}. Use ${
        isH ? 'Left/Right' : 'Up/Down'
      } arrows to resize. Home to reset. Enter to collapse.`}
      aria-valuenow={50}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onDoubleClick={handleDblClick}
      onKeyDown={handleKeyDown}
      onFocus={() => setState((s) => ({ ...s, focused: true }))}
      onBlur={() => setState((s) => ({ ...s, focused: false }))}
      onMouseEnter={() => setState((s) => ({ ...s, hovering: true }))}
      onMouseLeave={() => setState((s) => ({ ...s, hovering: false }))}
      style={{
        position: 'relative',
        flexShrink: 0,
        zIndex: 10,
        outline: 'none',
        userSelect: 'none',
        touchAction: 'none',
        cursor: isH ? 'col-resize' : 'row-resize',
        ...(isH ? { width: size } : { height: size }),
      }}
    >
      {/* Visible separator line */}
      <div style={{
        position: 'absolute',
        background: state.dragging
          ? 'var(--split-handle-active, var(--split-handle-hover, var(--accent, #007acc)))'
          : active
            ? 'var(--split-handle-hover, rgba(88, 166, 255, 0.6))'
            : 'var(--split-handle-color, var(--border, #333))',
        transition: state.dragging ? 'none' : 'background 0.15s ease, width 0.1s ease, height 0.1s ease',
        ...(isH
          ? { width: active ? 3 : 1, top: 0, bottom: 0, left: Math.floor((size - (active ? 3 : 1)) / 2) }
          : { height: active ? 3 : 1, left: 0, right: 0, top: Math.floor((size - (active ? 3 : 1)) / 2) }),
      }} />

      {/* Grab dots indicator */}
      {active && (
        <div style={{
          position: 'absolute', zIndex: 11, pointerEvents: 'none', display: 'flex',
          ...(isH
            ? { flexDirection: 'column', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center', gap: 2 }
            : { flexDirection: 'row', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', alignItems: 'center', gap: 2 }),
        }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              width: 3, height: 3, borderRadius: '50%',
              background: state.dragging
                ? 'var(--split-handle-active, var(--accent, #007acc))'
                : 'var(--split-handle-dot, rgba(88, 166, 255, 0.7))',
              transition: 'background 0.15s ease',
            }} />
          ))}
        </div>
      )}

      {/* Collapse/expand arrows on hover */}
      {collapsible && active && !state.dragging && (
        <>
          <CollapseArrow direction={direction} side="before" collapsed={collapsedBefore}
            onClick={() => onCollapseToggle?.(index, 'before')} gutterSize={size} />
          <CollapseArrow direction={direction} side="after" collapsed={collapsedAfter}
            onClick={() => onCollapseToggle?.(index, 'after')} gutterSize={size} />
        </>
      )}

      {/* Focus ring */}
      {state.focused && !state.dragging && (
        <div style={{
          position: 'absolute', pointerEvents: 'none', zIndex: 12,
          ...(isH
            ? { width: 5, top: 0, bottom: 0, left: Math.floor((size - 5) / 2),
                borderLeft: '2px solid var(--split-handle-focus, var(--accent, #007acc))',
                borderRight: '2px solid var(--split-handle-focus, var(--accent, #007acc))', opacity: 0.5 }
            : { height: 5, left: 0, right: 0, top: Math.floor((size - 5) / 2),
                borderTop: '2px solid var(--split-handle-focus, var(--accent, #007acc))',
                borderBottom: '2px solid var(--split-handle-focus, var(--accent, #007acc))', opacity: 0.5 }),
        }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SplitView — main component
// ---------------------------------------------------------------------------

export default function SplitView({
  direction = 'horizontal', sizes: initialSizes, minSize = DEFAULT_MIN_SIZE,
  maxSize, snapPoints = DEFAULT_SNAP_POINTS, onResize, children,
  gutterSize = 4, collapsible = true, persistKey, defaultSizes,
  className, style, snapThreshold = DEFAULT_SNAP_THRESHOLD, animated = true,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const dragState = useRef<{
    active: boolean; gutterIndex: number; startPos: number
    startSizes: number[]; containerSize: number
  } | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const isH = direction === 'horizontal'

  // Gather valid children (2-4 panes)
  const childArray = useMemo(() => {
    const arr = Children.toArray(children).filter(React.isValidElement)
    if (arr.length < 2) console.warn('SplitView requires at least 2 children. Got', arr.length)
    if (arr.length > 4) console.warn('SplitView supports up to 4 panes. Got', arr.length)
    return arr.slice(0, 4)
  }, [children])

  const paneCount = childArray.length

  // Per-pane constraints from SplitPane props
  const paneConstraints = useMemo(() => childArray.map((child) => {
    const props = (child as React.ReactElement<SplitPaneProps>).props
    return { minSize: props?.minSize ?? minSize, maxSize: props?.maxSize ?? maxSize }
  }), [childArray, minSize, maxSize])

  // Resolve initial sizes: persisted > prop > equal
  const resolvedInitialSizes = useMemo(() => {
    if (persistKey) { const p = loadPersistedSizes(persistKey, paneCount); if (p) return p }
    if (initialSizes && initialSizes.length === paneCount) return normalizeSizes(initialSizes)
    return equalSizes(paneCount)
  }, [persistKey, paneCount, initialSizes])

  // Default sizes for double-click reset
  const resolvedDefaults = useMemo(() => {
    if (defaultSizes && defaultSizes.length === paneCount) return normalizeSizes(defaultSizes)
    if (initialSizes && initialSizes.length === paneCount) return normalizeSizes(initialSizes)
    return equalSizes(paneCount)
  }, [defaultSizes, initialSizes, paneCount])

  const [sizes, setSizes] = useState<number[]>(resolvedInitialSizes)
  const [collapsed, setCollapsed] = useState<boolean[]>(() => {
    if (persistKey) { const p = loadCollapsedState(persistKey, paneCount); if (p) return p }
    return Array.from({ length: paneCount }, () => false)
  })
  const [transitioning, setTransitioning] = useState(false)
  const sizesBeforeCollapse = useRef<number[]>(resolvedInitialSizes)

  // Persistence
  useEffect(() => { if (persistKey) persistSizes(persistKey, sizes) }, [persistKey, sizes])
  useEffect(() => { if (persistKey) persistCollapsedState(persistKey, collapsed) }, [persistKey, collapsed])
  useEffect(() => { onResize?.(sizes) }, [sizes, onResize])

  // Container size helper (minus gutter space)
  const getContainerSize = useCallback((): number => {
    if (!containerRef.current) return 0
    const rect = containerRef.current.getBoundingClientRect()
    return (isH ? rect.width : rect.height) - gutterSize * (paneCount - 1)
  }, [isH, gutterSize, paneCount])

  // Apply pixel delta to resize two adjacent panes with constraints
  const applyResize = useCallback(
    (gutterIndex: number, pixelDelta: number, currentSizes: number[]): number[] => {
      const cs = getContainerSize()
      if (cs <= 0) return currentSizes
      const percentDelta = (pixelDelta / cs) * 100
      const newSizes = [...currentSizes]
      const bi = gutterIndex, ai = gutterIndex + 1
      if (collapsed[bi] || collapsed[ai]) return currentSizes

      let nb = newSizes[bi] + percentDelta
      let na = newSizes[ai] - percentDelta

      const minB = (paneConstraints[bi].minSize / cs) * 100
      const minA = (paneConstraints[ai].minSize / cs) * 100
      const maxB = paneConstraints[bi].maxSize ? (paneConstraints[bi].maxSize! / cs) * 100 : 100
      const maxA = paneConstraints[ai].maxSize ? (paneConstraints[ai].maxSize! / cs) * 100 : 100

      nb = clamp(nb, minB, maxB)
      na = clamp(na, minA, maxA)

      const pairTotal = currentSizes[bi] + currentSizes[ai]
      if (nb + na > pairTotal) {
        if (percentDelta > 0) {
          na = pairTotal - nb; if (na < minA) { na = minA; nb = pairTotal - na }
        } else {
          nb = pairTotal - na; if (nb < minB) { nb = minB; na = pairTotal - nb }
        }
      } else {
        const diff = pairTotal - nb - na
        if (diff > 0.01) {
          if (percentDelta > 0) { nb = Math.min(nb + diff, maxB) }
          else { na = Math.min(na + diff, maxA) }
        }
      }

      newSizes[bi] = nb
      newSizes[ai] = pairTotal - nb
      return newSizes
    },
    [getContainerSize, collapsed, paneConstraints]
  )

  // Snap logic
  const trySnap = useCallback(
    (sizePercent: number): { snapped: number; didSnap: boolean } => {
      const threshold = (snapThreshold / (getContainerSize() || 1)) * 100
      for (const point of snapPoints) {
        if (Math.abs(sizePercent - point) <= threshold) return { snapped: point, didSnap: true }
      }
      return { snapped: sizePercent, didSnap: false }
    },
    [snapPoints, snapThreshold, getContainerSize]
  )

  // Collapse / Expand
  const triggerTransition = useCallback(() => {
    if (animated) { setTransitioning(true); setTimeout(() => setTransitioning(false), TRANSITION_DURATION) }
  }, [animated])

  const collapsePane = useCallback((paneIndex: number) => {
    if (!collapsible || collapsed[paneIndex]) return
    if (collapsed.filter((c) => !c).length <= 1) return
    sizesBeforeCollapse.current = [...sizes]

    setCollapsed((prev) => { const n = [...prev]; n[paneIndex] = true; return n })
    setSizes((prev) => {
      const next = [...prev]
      const freed = next[paneIndex]; next[paneIndex] = 0
      const vis = next.map((_, i) => i).filter((i) => i !== paneIndex && !collapsed[i])
      if (vis.length === 0) return prev
      const share = freed / vis.length
      for (const vi of vis) next[vi] += share
      return normalizeSizes(next)
    })
    triggerTransition()
  }, [collapsible, collapsed, sizes, triggerTransition])

  const expandPane = useCallback((paneIndex: number) => {
    if (!collapsed[paneIndex]) return
    setCollapsed((prev) => { const n = [...prev]; n[paneIndex] = false; return n })
    const restored = sizesBeforeCollapse.current
    setSizes(restored && restored.length === paneCount ? normalizeSizes(restored) : equalSizes(paneCount))
    triggerTransition()
  }, [collapsed, paneCount, triggerTransition])

  const toggleCollapseFromGutter = useCallback(
    (gutterIndex: number, side: 'before' | 'after') => {
      const pi = side === 'before' ? gutterIndex : gutterIndex + 1
      collapsed[pi] ? expandPane(pi) : collapsePane(pi)
    },
    [collapsed, expandPane, collapsePane]
  )

  // Drag handlers — use refs for performance-critical operations
  const createOverlay = useCallback(() => {
    const o = document.createElement('div')
    Object.assign(o.style, { position: 'fixed', inset: '0', zIndex: '9999',
      cursor: isH ? 'col-resize' : 'row-resize', background: 'transparent' })
    document.body.appendChild(o); overlayRef.current = o; return o
  }, [isH])

  const removeOverlay = useCallback(() => {
    if (overlayRef.current) { overlayRef.current.remove(); overlayRef.current = null }
  }, [])

  const handleDragStart = useCallback((gutterIndex: number, clientPos: number) => {
    const containerSize = getContainerSize()
    dragState.current = { active: true, gutterIndex, startPos: clientPos, startSizes: [...sizes], containerSize }

    const overlay = createOverlay()
    document.body.style.cursor = isH ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (e: MouseEvent) => {
      if (!dragState.current?.active) return
      const currentPos = isH ? e.clientX : e.clientY
      const totalPixelDelta = currentPos - dragState.current.startPos

      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (!dragState.current) return
        const bi = dragState.current.gutterIndex, ai = bi + 1
        const { startSizes, containerSize: cs } = dragState.current
        const startBP = startSizes[bi]
        const deltaP = (totalPixelDelta / cs) * 100
        let newBP = startBP + deltaP

        // Check collapse threshold
        if (collapsible) {
          const newBPx = (newBP / 100) * cs
          if (newBPx < paneConstraints[bi].minSize - COLLAPSE_THRESHOLD_PX && !collapsed[bi]) {
            collapsePane(bi); cleanup(); return
          }
          const aPx = ((startSizes[ai] - deltaP) / 100) * cs
          if (aPx < paneConstraints[ai].minSize - COLLAPSE_THRESHOLD_PX && !collapsed[ai]) {
            collapsePane(ai); cleanup(); return
          }
        }

        // Snap before pane
        const { snapped, didSnap } = trySnap(newBP)
        if (didSnap) newBP = snapped

        // Snap after pane
        const pairTotal = startSizes[bi] + startSizes[ai]
        let newAP = pairTotal - newBP
        const { snapped: sa, didSnap: dsa } = trySnap(newAP)
        if (dsa) { newAP = sa; newBP = pairTotal - newAP }

        const pixDelta = ((newBP - startBP) / 100) * cs
        setSizes(applyResize(dragState.current.gutterIndex, pixDelta, startSizes))
      })
    }

    const cleanup = () => {
      overlay.removeEventListener('mousemove', onMouseMove)
      overlay.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      removeOverlay(); dragState.current = null
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    }
    const onMouseUp = () => cleanup()

    overlay.addEventListener('mousemove', onMouseMove)
    overlay.addEventListener('mouseup', onMouseUp)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [sizes, isH, getContainerSize, createOverlay, removeOverlay, applyResize,
      trySnap, collapsible, collapsed, collapsePane, paneConstraints])

  // Double-click reset to 50/50
  const handleDoubleClick = useCallback((_gutterIndex: number) => {
    setSizes(resolvedDefaults)
    setCollapsed(Array.from({ length: paneCount }, () => false))
    triggerTransition()
  }, [resolvedDefaults, paneCount, triggerTransition])

  // Keyboard resize from gutter
  const handleKeyboardResize = useCallback(
    (gutterIndex: number, pixelDelta: number) => {
      setSizes((prev) => applyResize(gutterIndex, pixelDelta, prev))
    }, [applyResize])

  // Global keyboard shortcuts: Ctrl+Shift+Arrow
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || paneCount < 2) return
      const step = KEYBOARD_STEP_LARGE
      if (isH && e.key === 'ArrowLeft') { e.preventDefault(); setSizes((p) => applyResize(0, -step, p)) }
      else if (isH && e.key === 'ArrowRight') { e.preventDefault(); setSizes((p) => applyResize(0, step, p)) }
      else if (!isH && e.key === 'ArrowUp') { e.preventDefault(); setSizes((p) => applyResize(0, -step, p)) }
      else if (!isH && e.key === 'ArrowDown') { e.preventDefault(); setSizes((p) => applyResize(0, step, p)) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isH, paneCount, applyResize])

  // Cleanup on unmount
  useEffect(() => {
    return () => { removeOverlay(); if (rafRef.current != null) cancelAnimationFrame(rafRef.current) }
  }, [removeOverlay])

  // Programmatic resize helpers
  const setSize = useCallback((index: number, percent: number) => {
    setSizes((prev) => redistributeSetSize(prev, index, percent))
  }, [])

  const resetSizes = useCallback(() => {
    setSizes(resolvedDefaults)
    setCollapsed(Array.from({ length: paneCount }, () => false))
    triggerTransition()
  }, [resolvedDefaults, paneCount, triggerTransition])

  const resizeAPI = useMemo<SplitResizeAPI>(() => ({
    sizes, setSizes, setSize, resetSizes, collapsePane, expandPane, collapsed,
  }), [sizes, setSize, resetSizes, collapsePane, expandPane, collapsed])

  // Transition style for animated snap/collapse
  const transitionStyle = transitioning && animated
    ? `flex-basis ${TRANSITION_DURATION}ms ease, width ${TRANSITION_DURATION}ms ease, height ${TRANSITION_DURATION}ms ease`
    : undefined

  // Render interleaved panes and gutters
  const gutterCount = paneCount - 1
  const elements: React.ReactNode[] = []

  for (let i = 0; i < paneCount; i++) {
    const isCollapsed = collapsed[i]
    elements.push(
      <div
        key={`pane-${i}`}
        data-split-pane-index={i}
        data-collapsed={isCollapsed || undefined}
        style={{
          flex: isCollapsed ? '0 0 0px' : `0 0 ${sizes[i]}%`,
          overflow: 'hidden', position: 'relative',
          ...(isCollapsed ? { visibility: 'hidden' as const, width: 0, height: 0, minWidth: 0, minHeight: 0 } : {}),
          transition: transitionStyle,
          ['--pane-size' as string]: `${sizes[i]}%`,
          ['--pane-index' as string]: `${i}`,
        }}
      >
        {childArray[i]}
      </div>
    )
    if (i < gutterCount) {
      elements.push(
        <Gutter key={`gutter-${i}`} index={i} direction={direction} size={gutterSize}
          onDragStart={handleDragStart} onDoubleClick={handleDoubleClick}
          onKeyboardResize={handleKeyboardResize}
          onCollapseToggle={collapsible ? toggleCollapseFromGutter : undefined}
          collapsedBefore={collapsed[i]} collapsedAfter={collapsed[i + 1]}
          collapsible={collapsible} />
      )
    }
  }

  return (
    <SplitResizeContext.Provider value={resizeAPI}>
      <div
        ref={containerRef} className={className}
        data-split-view="" data-direction={direction}
        style={{
          display: 'flex', flexDirection: isH ? 'row' : 'column',
          width: '100%', height: '100%', overflow: 'hidden', position: 'relative',
          ['--split-handle-width' as string]: `${gutterSize}px`,
          ['--split-pane-count' as string]: `${paneCount}`,
          ['--split-direction' as string]: direction,
          ...style,
        }}
      >
        {elements}
        <style>{`
          [data-split-view] [data-split-pane-index] { box-sizing: border-box; }
          [data-split-view] [data-collapsed] { pointer-events: none; }
          @keyframes split-view-snap-pulse {
            0% { opacity: 0.4; } 50% { opacity: 0.1; } 100% { opacity: 0; }
          }
        `}</style>
      </div>
    </SplitResizeContext.Provider>
  )
}

SplitView.displayName = 'SplitView'

// ---------------------------------------------------------------------------
// NestedSplitView — declarative nested layouts
// ---------------------------------------------------------------------------

type NestedLayoutNode =
  | { type: 'pane'; content: React.ReactNode; minSize?: number; maxSize?: number }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; sizes?: number[]
      children: NestedLayoutNode[]; minSize?: number; maxSize?: number }

function renderNestedLayout(
  node: NestedLayoutNode, key: string, gutterSize: number,
  collapsible: boolean, persistPrefix?: string,
): React.ReactNode {
  if (node.type === 'pane') {
    return <SplitPane key={key} minSize={node.minSize} maxSize={node.maxSize}>{node.content}</SplitPane>
  }
  const nestedKey = persistPrefix ? `${persistPrefix}:${key}` : undefined
  return (
    <SplitPane key={key} minSize={node.minSize} maxSize={node.maxSize}>
      <SplitView direction={node.direction} sizes={node.sizes}
        gutterSize={gutterSize} collapsible={collapsible} persistKey={nestedKey}>
        {node.children.map((child, i) =>
          renderNestedLayout(child, `${key}-${i}`, gutterSize, collapsible, nestedKey)
        )}
      </SplitView>
    </SplitPane>
  )
}

export function NestedSplitView({
  direction = 'horizontal', layout, gutterSize = 4,
  collapsible = true, persistKey, sizes,
}: {
  direction?: 'horizontal' | 'vertical'; layout: NestedLayoutNode[]
  gutterSize?: number; collapsible?: boolean; persistKey?: string; sizes?: number[]
}) {
  return (
    <SplitView direction={direction} sizes={sizes} gutterSize={gutterSize}
      collapsible={collapsible} persistKey={persistKey}>
      {layout.map((node, i) =>
        renderNestedLayout(node, `root-${i}`, gutterSize, collapsible, persistKey)
      )}
    </SplitView>
  )
}

// ---------------------------------------------------------------------------
// useSplitResize — hook for programmatic control
//
// Usage:
//   1. Inside a SplitView tree: reads from context automatically
//   2. Standalone: pass { count, initialSizes?, persistKey? }
// ---------------------------------------------------------------------------

interface UseSplitResizeOptions {
  count: number
  initialSizes?: number[]
  persistKey?: string
}

export function useSplitResize(options?: UseSplitResizeOptions): SplitResizeAPI {
  const contextAPI = useContext(SplitResizeContext)

  // Standalone fallback state
  const count = options?.count ?? 2
  const resolvedInitial = useMemo(() => {
    if (options?.persistKey) { const p = loadPersistedSizes(options.persistKey, count); if (p) return p }
    if (options?.initialSizes && options.initialSizes.length === count) return normalizeSizes(options.initialSizes)
    return equalSizes(count)
  }, [options?.persistKey, count, options?.initialSizes])

  const [standaloneSizes, setStandaloneSizes] = useState<number[]>(resolvedInitial)
  const [standaloneCollapsed, setStandaloneCollapsed] = useState<boolean[]>(
    () => Array.from({ length: count }, () => false)
  )
  const sizesBeforeRef = useRef<number[]>(resolvedInitial)

  const standaloneSetSize = useCallback(
    (index: number, percent: number) => setStandaloneSizes((p) => redistributeSetSize(p, index, percent)),
    []
  )
  const standaloneReset = useCallback(() => {
    setStandaloneSizes(resolvedInitial)
    setStandaloneCollapsed(Array.from({ length: count }, () => false))
  }, [resolvedInitial, count])

  const standaloneCollapse = useCallback((pi: number) => {
    if (standaloneCollapsed[pi]) return
    if (standaloneCollapsed.filter((c) => !c).length <= 1) return
    sizesBeforeRef.current = [...standaloneSizes]
    setStandaloneCollapsed((p) => { const n = [...p]; n[pi] = true; return n })
    setStandaloneSizes((prev) => {
      const next = [...prev]; const freed = next[pi]; next[pi] = 0
      const vis = next.map((_, i) => i).filter((i) => i !== pi && !standaloneCollapsed[i])
      if (!vis.length) return prev
      const share = freed / vis.length
      for (const v of vis) next[v] += share
      return normalizeSizes(next)
    })
  }, [standaloneCollapsed, standaloneSizes])

  const standaloneExpand = useCallback((pi: number) => {
    if (!standaloneCollapsed[pi]) return
    setStandaloneCollapsed((p) => { const n = [...p]; n[pi] = false; return n })
    const r = sizesBeforeRef.current
    setStandaloneSizes(r && r.length === count ? normalizeSizes(r) : equalSizes(count))
  }, [standaloneCollapsed, count])

  useEffect(() => { if (options?.persistKey) persistSizes(options.persistKey, standaloneSizes) },
    [options?.persistKey, standaloneSizes])

  if (contextAPI) return contextAPI
  return {
    sizes: standaloneSizes, setSizes: setStandaloneSizes,
    setSize: standaloneSetSize, resetSizes: standaloneReset,
    collapsePane: standaloneCollapse, expandPane: standaloneExpand,
    collapsed: standaloneCollapsed,
  }
}
