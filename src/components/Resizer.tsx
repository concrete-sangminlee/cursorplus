import { useCallback, useEffect, useRef, useState } from 'react'

export interface ResizerConstraints {
  min: number
  max: number
  defaultSize: number
  snapPoints?: number[]
  snapThreshold?: number
}

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
}: Props) {
  const startPos = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<number | null>(null)
  const [snapped, setSnapped] = useState(false)
  const snappedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const isH = direction === 'horizontal'

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

  const triggerSnapFeedback = useCallback(() => {
    setSnapped(true)
    if (snappedTimeout.current) clearTimeout(snappedTimeout.current)
    snappedTimeout.current = setTimeout(() => setSnapped(false), 300)
  }, [])

  // Update displaySize when currentSize changes during drag, and detect snaps
  const prevSizeRef = useRef<number | null>(null)
  useEffect(() => {
    if (dragging && currentSize != null) {
      setDisplaySize(currentSize)
      // Detect if we just snapped to a snap point
      if (
        constraints?.snapPoints &&
        prevSizeRef.current != null &&
        prevSizeRef.current !== currentSize &&
        constraints.snapPoints.includes(currentSize)
      ) {
        triggerSnapFeedback()
      }
      prevSizeRef.current = currentSize
    } else {
      prevSizeRef.current = null
    }
  }, [currentSize, dragging, constraints, triggerSnapFeedback])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startPos.current = isH ? e.clientX : e.clientY
      setDragging(true)
      setDisplaySize(currentSize ?? null)

      const overlay = createOverlay()

      const onMouseMove = (e: MouseEvent) => {
        const current = isH ? e.clientX : e.clientY
        let delta = current - startPos.current
        startPos.current = current

        // Apply the raw delta first via callback
        onResize(delta)

        // Update tooltip position
        setTooltipPos({ x: e.clientX, y: e.clientY })
      }

      const onMouseUp = () => {
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
      }

      // Listen on both overlay and document for reliability
      overlay.addEventListener('mousemove', onMouseMove)
      overlay.addEventListener('mouseup', onMouseUp)
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.body.style.cursor = isH ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [isH, onResize, currentSize, createOverlay, removeOverlay]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (onReset) {
        onReset()
      }
    },
    [onReset]
  )

  // Collapsed state: render a thin expand handle
  if (collapsed) {
    return (
      <div
        ref={containerRef}
        onClick={onExpand}
        style={{
          position: 'relative',
          flexShrink: 0,
          cursor: 'pointer',
          zIndex: 10,
          ...(isH ? { width: 6 } : { height: 6 }),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={isH ? 'Click to expand panel' : 'Click to expand panel'}
      >
        {/* Background strip */}
        <div
          style={{
            position: 'absolute',
            background: 'var(--bg-secondary)',
            transition: 'background 0.15s ease',
            ...(isH
              ? { width: 6, top: 0, bottom: 0, left: 0 }
              : { height: 6, left: 0, right: 0, top: 0 }),
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-secondary)'
          }}
        />
        {/* Expand chevron indicator */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            color: 'var(--text-secondary)',
            fontSize: 8,
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          {isH ? '\u25B6' : '\u25BC'}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'relative',
        flexShrink: 0,
        cursor: isH ? 'col-resize' : 'row-resize',
        zIndex: 10,
        ...(isH ? { width: 1 } : { height: 1 }),
      }}
    >
      {/* Visible line */}
      <div
        data-resizer-line=""
        style={{
          position: 'absolute',
          background: dragging
            ? 'var(--accent)'
            : hovering
              ? 'rgba(88, 166, 255, 0.6)'
              : 'var(--border)',
          transition: dragging ? 'none' : 'background 0.15s ease, width 0.1s ease, height 0.1s ease',
          ...(isH
            ? {
                width: dragging ? 3 : hovering ? 2 : 1,
                top: 0,
                bottom: 0,
                left: dragging ? -1 : hovering ? 0 : 0,
              }
            : {
                height: dragging ? 3 : hovering ? 2 : 1,
                left: 0,
                right: 0,
                top: dragging ? -1 : hovering ? 0 : 0,
              }),
        }}
      />

      {/* Grab handle indicator (3 dots centered) */}
      {(hovering || dragging) && (
        <div
          style={{
            position: 'absolute',
            zIndex: 11,
            pointerEvents: 'none',
            display: 'flex',
            gap: isH ? 0 : 3,
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
                background: dragging ? 'var(--accent)' : 'rgba(88, 166, 255, 0.7)',
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
            background: 'var(--accent)',
            opacity: 0.3,
            animation: 'resizer-snap-flash 0.3s ease-out forwards',
            ...(isH
              ? { width: 8, top: 0, bottom: 0, left: -3 }
              : { height: 8, left: 0, right: 0, top: -3 }),
          }}
        />
      )}

      {/* Resize tooltip */}
      {dragging && tooltipPos && displaySize != null && (
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 10,
            background: 'var(--bg-tertiary, #2d2d2d)',
            color: 'var(--text-primary)',
            fontSize: 11,
            fontFamily: 'var(--font-mono, monospace)',
            padding: '2px 6px',
            borderRadius: 3,
            border: '1px solid var(--border)',
            pointerEvents: 'none',
            zIndex: 10000,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}
        >
          {Math.round(displaySize)}px
        </div>
      )}

      {/* Inline keyframes for snap flash */}
      <style>{`
        @keyframes resizer-snap-flash {
          0% { opacity: 0.4; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}
