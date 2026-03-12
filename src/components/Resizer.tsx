import { useCallback, useEffect, useRef, useState } from 'react'

export interface ResizerConstraints {
  min: number
  max: number
  defaultSize: number
  snapPoints?: number[]
  snapThreshold?: number
}

/** Default snap percentages applied to container size */
const DEFAULT_SNAP_PERCENTAGES = [0.25, 0.33, 0.5, 0.67, 0.75]
/** Default magnetic threshold in px for snapping */
const DEFAULT_SNAP_THRESHOLD = 8
/** How far below min before we collapse */
const COLLAPSE_THRESHOLD = 30
/** Arrow key step size in px */
const KEYBOARD_STEP = 10
/** Arrow key step with shift held */
const KEYBOARD_STEP_LARGE = 50

interface Props {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
  /** Current size of the panel being resized (needed for tooltip + snap + collapse) */
  currentSize?: number
  /** Constraints for min/max/default/snap behavior */
  constraints?: ResizerConstraints
  /** Called when panel should collapse (dragged below minimum) */
  onCollapse?: () => void
  /** Called when double-clicking to reset to default */
  onReset?: () => void
  /** Whether the associated panel is currently collapsed */
  collapsed?: boolean
  /** Called to expand a collapsed panel */
  onExpand?: () => void
  /** Container size for computing percentage-based snaps */
  containerSize?: number
}

export default function Resizer({
  direction,
  onResize,
  currentSize,
  constraints,
  onCollapse,
  onReset,
  collapsed,
  onExpand,
  containerSize,
}: Props) {
  const startPos = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<number | null>(null)
  const [snapped, setSnapped] = useState(false)
  const [snapLabel, setSnapLabel] = useState<string | null>(null)
  const snappedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const accumulatedDelta = useRef(0)
  const lastSnappedValue = useRef<number | null>(null)

  const isH = direction === 'horizontal'

  // Compute snap points from constraints or container size percentages
  const getSnapPoints = useCallback((): number[] => {
    if (constraints?.snapPoints && constraints.snapPoints.length > 0) {
      return constraints.snapPoints
    }
    if (containerSize && containerSize > 0) {
      return DEFAULT_SNAP_PERCENTAGES.map((p) => Math.round(p * containerSize))
    }
    return []
  }, [constraints?.snapPoints, containerSize])

  const snapThreshold = constraints?.snapThreshold ?? DEFAULT_SNAP_THRESHOLD

  // Clean up overlay on unmount
  useEffect(() => {
    return () => {
      if (overlayRef.current) {
        overlayRef.current.remove()
        overlayRef.current = null
      }
      if (snappedTimeout.current) {
        clearTimeout(snappedTimeout.current)
      }
    }
  }, [])

  const createOverlay = useCallback(() => {
    const overlay = document.createElement('div')
    overlay.style.position = 'fixed'
    overlay.style.inset = '0'
    overlay.style.zIndex = '9999'
    overlay.style.cursor = isH ? 'col-resize' : 'row-resize'
    overlay.style.background = 'transparent'
    document.body.appendChild(overlay)
    overlayRef.current = overlay
    return overlay
  }, [isH])

  const removeOverlay = useCallback(() => {
    if (overlayRef.current) {
      overlayRef.current.remove()
      overlayRef.current = null
    }
  }, [])

  const triggerSnapFeedback = useCallback((label?: string) => {
    setSnapped(true)
    setSnapLabel(label ?? null)
    if (snappedTimeout.current) clearTimeout(snappedTimeout.current)
    snappedTimeout.current = setTimeout(() => {
      setSnapped(false)
      setSnapLabel(null)
    }, 400)
  }, [])

  /** Attempt to snap a size to a nearby snap point; returns snapped size or original */
  const trySnap = useCallback(
    (size: number): { snappedSize: number; didSnap: boolean; label?: string } => {
      const points = getSnapPoints()
      for (const pt of points) {
        if (Math.abs(size - pt) <= snapThreshold) {
          // Compute label
          let label: string | undefined
          if (containerSize && containerSize > 0) {
            const pct = Math.round((pt / containerSize) * 100)
            label = `${pct}%`
          }
          return { snappedSize: pt, didSnap: true, label }
        }
      }
      return { snappedSize: size, didSnap: false }
    },
    [getSnapPoints, snapThreshold, containerSize]
  )

  // Update displaySize when currentSize changes during drag
  const prevSizeRef = useRef<number | null>(null)
  useEffect(() => {
    if (dragging && currentSize != null) {
      setDisplaySize(currentSize)
      // Detect if we just snapped to a snap point
      const points = getSnapPoints()
      if (
        prevSizeRef.current != null &&
        prevSizeRef.current !== currentSize &&
        points.some((p) => Math.abs(currentSize - p) < 2)
      ) {
        let label: string | undefined
        if (containerSize && containerSize > 0) {
          const pct = Math.round((currentSize / containerSize) * 100)
          label = `${pct}%`
        }
        triggerSnapFeedback(label)
      }
      prevSizeRef.current = currentSize
    } else {
      prevSizeRef.current = null
    }
  }, [currentSize, dragging, getSnapPoints, containerSize, triggerSnapFeedback])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startPos.current = isH ? e.clientX : e.clientY
      setDragging(true)
      setDisplaySize(currentSize ?? null)
      accumulatedDelta.current = 0
      lastSnappedValue.current = null

      const overlay = createOverlay()

      const onMouseMove = (ev: MouseEvent) => {
        const current = isH ? ev.clientX : ev.clientY
        const rawDelta = current - startPos.current
        startPos.current = current

        // Accumulate delta for snap detent logic
        accumulatedDelta.current += rawDelta
        const projectedSize = (currentSize ?? 0) + accumulatedDelta.current

        // Check collapse threshold
        if (constraints && onCollapse && projectedSize < constraints.min - COLLAPSE_THRESHOLD) {
          onCollapse()
          // End the drag
          cleanup()
          return
        }

        // Check snap points with detent
        const { snappedSize, didSnap, label } = trySnap(projectedSize)

        if (didSnap && lastSnappedValue.current !== snappedSize) {
          // Snap: compute adjusted delta to reach snap point
          const adjustedDelta = snappedSize - (currentSize ?? 0)
          accumulatedDelta.current = 0
          lastSnappedValue.current = snappedSize
          onResize(adjustedDelta)
          triggerSnapFeedback(label)
        } else if (!didSnap) {
          lastSnappedValue.current = null
          onResize(rawDelta)
          accumulatedDelta.current = 0
        }
        // If snapped and same value, absorb the delta (detent effect)

        setTooltipPos({ x: ev.clientX, y: ev.clientY })
      }

      const cleanup = () => {
        overlay.removeEventListener('mousemove', onMouseMove)
        overlay.removeEventListener('mouseup', onMouseUp)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        removeOverlay()
        setDragging(false)
        setTooltipPos(null)
        setDisplaySize(null)
        accumulatedDelta.current = 0
        lastSnappedValue.current = null
      }

      const onMouseUp = () => {
        cleanup()
      }

      overlay.addEventListener('mousemove', onMouseMove)
      overlay.addEventListener('mouseup', onMouseUp)
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.body.style.cursor = isH ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [isH, onResize, currentSize, constraints, onCollapse, createOverlay, removeOverlay, trySnap, triggerSnapFeedback]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (onReset) {
        onReset()
      } else if (constraints?.defaultSize != null && currentSize != null) {
        // Fallback: compute delta to reach default size
        const delta = constraints.defaultSize - currentSize
        if (delta !== 0) onResize(delta)
      }
    },
    [onReset, constraints, currentSize, onResize]
  )

  // Keyboard support: arrow keys to resize, Home to reset
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const relevantKeys = isH
        ? ['ArrowLeft', 'ArrowRight', 'Home', 'Enter', ' ']
        : ['ArrowUp', 'ArrowDown', 'Home', 'Enter', ' ']

      if (!relevantKeys.includes(e.key)) return

      e.preventDefault()
      e.stopPropagation()

      const step = e.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP

      if (e.key === 'Home') {
        // Reset to default
        if (onReset) {
          onReset()
        } else if (constraints?.defaultSize != null && currentSize != null) {
          const delta = constraints.defaultSize - currentSize
          if (delta !== 0) onResize(delta)
        }
        return
      }

      if (e.key === 'Enter' || e.key === ' ') {
        // Toggle collapse
        if (collapsed && onExpand) {
          onExpand()
        } else if (!collapsed && onCollapse) {
          onCollapse()
        }
        return
      }

      // Arrow keys
      if (isH) {
        if (e.key === 'ArrowRight') onResize(step)
        else if (e.key === 'ArrowLeft') onResize(-step)
      } else {
        if (e.key === 'ArrowDown') onResize(step)
        else if (e.key === 'ArrowUp') onResize(-step)
      }
    },
    [isH, onResize, onReset, onCollapse, onExpand, collapsed, constraints, currentSize]
  )

  const active = dragging || hovering || focused

  // Collapsed state: render a thin expand handle
  if (collapsed) {
    return (
      <div
        ref={containerRef}
        role="separator"
        aria-orientation={isH ? 'vertical' : 'horizontal'}
        aria-label={`Expand ${isH ? 'side' : 'bottom'} panel`}
        tabIndex={0}
        onClick={onExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onExpand?.()
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          position: 'relative',
          flexShrink: 0,
          cursor: 'pointer',
          zIndex: 10,
          outline: 'none',
          ...(isH ? { width: 6 } : { height: 6 }),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title="Click to expand panel"
      >
        {/* Background strip */}
        <div
          style={{
            position: 'absolute',
            background: focused
              ? 'var(--resizer-focus, var(--accent))'
              : 'var(--resizer-collapsed-bg, var(--bg-secondary))',
            transition: 'background 0.15s ease',
            ...(isH
              ? { width: 6, top: 0, bottom: 0, left: 0 }
              : { height: 6, left: 0, right: 0, top: 0 }),
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background =
              'var(--resizer-hover, var(--accent))'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background =
              'var(--resizer-collapsed-bg, var(--bg-secondary))'
          }}
        />
        {/* Expand chevron indicator */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            color: 'var(--resizer-icon, var(--text-secondary))',
            fontSize: 8,
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {isH ? '\u25B6' : '\u25BC'}
        </div>
        {/* Focus ring */}
        {focused && (
          <div
            style={{
              position: 'absolute',
              inset: -1,
              border: '1px solid var(--resizer-focus, var(--accent))',
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 12,
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="separator"
      aria-orientation={isH ? 'vertical' : 'horizontal'}
      aria-valuenow={currentSize != null ? Math.round(currentSize) : undefined}
      aria-valuemin={constraints?.min}
      aria-valuemax={constraints?.max}
      aria-label={`Resize ${isH ? 'horizontal' : 'vertical'} panel. Use ${isH ? 'Left/Right' : 'Up/Down'} arrow keys to resize. Home to reset. Enter to collapse.`}
      tabIndex={0}
      onMouseDown={onMouseDown}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        position: 'relative',
        flexShrink: 0,
        cursor: isH ? 'col-resize' : 'row-resize',
        zIndex: 10,
        outline: 'none',
        ...(isH ? { width: 1 } : { height: 1 }),
      }}
    >
      {/* Visible line */}
      <div
        data-resizer-line=""
        style={{
          position: 'absolute',
          background: dragging
            ? 'var(--resizer-active, var(--accent))'
            : active
              ? 'var(--resizer-hover, rgba(88, 166, 255, 0.6))'
              : 'var(--resizer-line, var(--border))',
          transition: dragging
            ? 'none'
            : 'background 0.15s ease, width 0.1s ease, height 0.1s ease',
          ...(isH
            ? {
                width: dragging ? 3 : active ? 3 : 1,
                top: 0,
                bottom: 0,
                left: dragging ? -1 : active ? -1 : 0,
              }
            : {
                height: dragging ? 3 : active ? 3 : 1,
                left: 0,
                right: 0,
                top: dragging ? -1 : active ? -1 : 0,
              }),
        }}
      />

      {/* Grab handle indicator (3 dots centered) */}
      {active && (
        <div
          style={{
            position: 'absolute',
            zIndex: 11,
            pointerEvents: 'none',
            display: 'flex',
            ...(isH
              ? {
                  flexDirection: 'column',
                  left: -3,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  alignItems: 'center',
                  gap: 2,
                  width: 7,
                  padding: '4px 0',
                }
              : {
                  flexDirection: 'row',
                  top: -3,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  alignItems: 'center',
                  gap: 2,
                  height: 7,
                  padding: '0 4px',
                }),
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: dragging
                  ? 'var(--resizer-active, var(--accent))'
                  : 'var(--resizer-dot, rgba(88, 166, 255, 0.7))',
                transition: 'background 0.15s ease',
              }}
            />
          ))}
        </div>
      )}

      {/* Wider hit target */}
      <div
        style={{
          position: 'absolute',
          ...(isH
            ? { width: 9, top: 0, bottom: 0, left: -4 }
            : { height: 9, left: 0, right: 0, top: -4 }),
        }}
        onMouseEnter={() => {
          if (!dragging) setHovering(true)
        }}
        onMouseLeave={() => {
          if (!dragging) setHovering(false)
        }}
      />

      {/* Snap indicator flash */}
      {snapped && (
        <div
          style={{
            position: 'absolute',
            background: 'var(--resizer-snap, var(--accent))',
            opacity: 0.3,
            animation: 'resizer-snap-flash 0.4s ease-out forwards',
            ...(isH
              ? { width: 8, top: 0, bottom: 0, left: -3 }
              : { height: 8, left: 0, right: 0, top: -3 }),
          }}
        />
      )}

      {/* Resize tooltip with size + snap label */}
      {dragging && tooltipPos && displaySize != null && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 10,
            background: 'var(--resizer-tooltip-bg, var(--bg-tertiary, #2d2d2d))',
            color: 'var(--resizer-tooltip-fg, var(--text-primary))',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            padding: '2px 6px',
            borderRadius: 3,
            border: '1px solid var(--resizer-tooltip-border, var(--border))',
            pointerEvents: 'none',
            zIndex: 10000,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>{Math.round(displaySize)}px</span>
          {snapLabel && (
            <span
              style={{
                color: 'var(--resizer-snap-label, var(--accent))',
                fontWeight: 600,
              }}
            >
              {snapLabel}
            </span>
          )}
        </div>
      )}

      {/* Focus ring for keyboard users */}
      {focused && !dragging && (
        <div
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            zIndex: 12,
            ...(isH
              ? {
                  width: 5,
                  top: 0,
                  bottom: 0,
                  left: -2,
                  borderLeft: '2px solid var(--resizer-focus, var(--accent))',
                  borderRight: '2px solid var(--resizer-focus, var(--accent))',
                  opacity: 0.5,
                }
              : {
                  height: 5,
                  left: 0,
                  right: 0,
                  top: -2,
                  borderTop: '2px solid var(--resizer-focus, var(--accent))',
                  borderBottom: '2px solid var(--resizer-focus, var(--accent))',
                  opacity: 0.5,
                }),
          }}
        />
      )}

      {/* Inline keyframes for snap flash */}
      <style>{`
        @keyframes resizer-snap-flash {
          0% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.2; }
          100% { opacity: 0; transform: scale(1.5); }
        }
      `}</style>
    </div>
  )
}
