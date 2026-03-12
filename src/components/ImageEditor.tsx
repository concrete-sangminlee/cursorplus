import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Grid,
  Pipette,
  Copy,
  Image as ImageIcon,
  Info,
  Play,
  Pause,
  Minus,
  Plus,
  Ruler as RulerIcon,
  Columns,
  MousePointer,
  Move,
  X,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImageEditorProps {
  src: string
  fileName: string
  fileSize?: number
  comparisonSrc?: string
  comparisonFileName?: string
}

type FitMode = 'fit-page' | 'fit-width' | 'fit-height' | 'actual'
type ActiveTool = 'pan' | 'pick-color'

interface PickedColor {
  hex: string
  rgb: string
  hsl: string
  r: number
  g: number
  b: number
  a: number
}

interface ImageDimensions {
  width: number
  height: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_ZOOM = 5
const MAX_ZOOM = 3200
const ZOOM_STEP = 1.15
const ZOOM_PRESETS = [10, 25, 50, 100, 200, 400, 800, 1600]

const CHECKERBOARD_BG = `repeating-conic-gradient(
  var(--ie-checker-a, #3c3c3c) 0% 25%,
  var(--ie-checker-b, #2c2c2c) 0% 50%
) 0 0 / 16px 16px`

const SUPPORTED_FORMATS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp', 'tiff']

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function detectFormat(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP',
    bmp: 'BMP', ico: 'ICO', svg: 'SVG', avif: 'AVIF', tiff: 'TIFF',
  }
  return map[ext] || ext.toUpperCase()
}

function detectColorSpace(format: string): string {
  if (['PNG', 'JPEG', 'WebP', 'AVIF', 'TIFF'].includes(format)) return 'sRGB'
  if (format === 'GIF') return 'Indexed'
  if (format === 'SVG') return 'N/A'
  return 'sRGB'
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val))
}

function isAnimatedGif(name: string): boolean {
  return name.toLowerCase().endsWith('.gif')
}

// ─── Toolbar Button ─────────────────────────────────────────────────────────

const ToolbarButton: React.FC<{
  icon: React.ReactNode
  label: string
  active?: boolean
  onClick: () => void
  disabled?: boolean
  badge?: string
}> = ({ icon, label, active, onClick, disabled, badge }) => (
  <button
    title={label}
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      border: 'none',
      borderRadius: 4,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      background: active ? 'var(--ie-btn-active, rgba(255,255,255,0.15))' : 'transparent',
      color: active ? 'var(--ie-accent, #4fc3f7)' : 'var(--ie-fg, #ccc)',
      transition: 'background 0.15s, color 0.15s',
    }}
  >
    {icon}
    {badge && (
      <span style={{
        position: 'absolute', top: 0, right: 0,
        fontSize: 8, background: 'var(--ie-accent, #4fc3f7)',
        color: '#000', borderRadius: 4, padding: '0 3px', lineHeight: '14px',
      }}>
        {badge}
      </span>
    )}
  </button>
)

// ─── Toolbar Separator ──────────────────────────────────────────────────────

const ToolbarSep: React.FC = () => (
  <div style={{
    width: 1, height: 18, background: 'var(--ie-border, rgba(255,255,255,0.1))',
    margin: '0 4px',
  }} />
)

// ─── Zoom Slider ────────────────────────────────────────────────────────────

const ZoomControls: React.FC<{
  zoom: number
  onZoomChange: (z: number) => void
}> = ({ zoom, onZoomChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
    <ToolbarButton
      icon={<Minus size={13} />}
      label="Zoom out"
      onClick={() => onZoomChange(Math.max(MIN_ZOOM, Math.round(zoom / ZOOM_STEP)))}
    />
    <input
      type="range"
      min={MIN_ZOOM}
      max={MAX_ZOOM}
      value={zoom}
      onChange={(e) => onZoomChange(Number(e.target.value))}
      style={{ width: 80, accentColor: 'var(--ie-accent, #4fc3f7)' }}
      title={`Zoom: ${zoom}%`}
    />
    <ToolbarButton
      icon={<Plus size={13} />}
      label="Zoom in"
      onClick={() => onZoomChange(Math.min(MAX_ZOOM, Math.round(zoom * ZOOM_STEP)))}
    />
    <button
      onClick={() => {
        const idx = ZOOM_PRESETS.findIndex(p => p >= zoom)
        const next = idx >= 0 && idx < ZOOM_PRESETS.length - 1
          ? ZOOM_PRESETS[idx + 1]
          : ZOOM_PRESETS[0]
        onZoomChange(next)
      }}
      style={{
        background: 'var(--ie-btn-active, rgba(255,255,255,0.08))',
        border: '1px solid var(--ie-border, rgba(255,255,255,0.1))',
        borderRadius: 4, padding: '2px 8px', cursor: 'pointer',
        fontSize: 11, color: 'var(--ie-fg, #ccc)', minWidth: 48, textAlign: 'center',
      }}
      title="Click to cycle zoom presets"
    >
      {zoom}%
    </button>
  </div>
)

// ─── Image Info Panel ───────────────────────────────────────────────────────

const ImageInfoPanel: React.FC<{
  dimensions: ImageDimensions | null
  fileSize?: number
  fileName: string
  zoom: number
  rotation: number
}> = ({ dimensions, fileSize, fileName, zoom, rotation }) => {
  const format = detectFormat(fileName)
  const colorSpace = detectColorSpace(format)
  const rows = [
    ['File', fileName],
    ['Format', format],
    ['Dimensions', dimensions ? `${dimensions.width} x ${dimensions.height} px` : 'Loading...'],
    ['Color space', colorSpace],
    ['File size', fileSize ? formatBytes(fileSize) : 'Unknown'],
    ['Zoom', `${zoom}%`],
    ['Rotation', `${rotation}deg`],
  ]

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 20,
      background: 'var(--ie-panel-bg, rgba(24,24,28,0.94))',
      borderRadius: 8, padding: '10px 14px',
      fontSize: 11, color: 'var(--ie-fg, #ccc)', lineHeight: 1.8,
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
      maxWidth: 280,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 4, paddingBottom: 4,
        borderBottom: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
        fontWeight: 600, fontSize: 12,
      }}>
        <Info size={12} />
        Image Info
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 12 }}>
          <span style={{ opacity: 0.55, minWidth: 78, flexShrink: 0 }}>{k}</span>
          <span style={{ wordBreak: 'break-all' }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Color Picker Tooltip ───────────────────────────────────────────────────

const ColorPickerTooltip: React.FC<{
  color: PickedColor | null
  position: { x: number; y: number }
  pixelCoord: { x: number; y: number }
}> = ({ color, position, pixelCoord }) => {
  if (!color) return null
  return (
    <div style={{
      position: 'fixed',
      left: position.x + 18, top: position.y + 18,
      background: 'var(--ie-panel-bg, rgba(24,24,28,0.95))',
      borderRadius: 8, padding: '8px 12px',
      display: 'flex', flexDirection: 'column', gap: 4,
      fontSize: 11, color: 'var(--ie-fg, #ccc)',
      pointerEvents: 'none', zIndex: 100,
      border: '1px solid var(--ie-border, rgba(255,255,255,0.12))',
      backdropFilter: 'blur(6px)',
      minWidth: 160,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{
          width: 24, height: 24, borderRadius: 4,
          background: color.a < 255
            ? `rgba(${color.r},${color.g},${color.b},${(color.a / 255).toFixed(2)})`
            : color.hex,
          border: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
        }} />
        <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>
          {color.hex}
        </span>
      </div>
      <div style={{ fontFamily: 'monospace', opacity: 0.8 }}>
        {color.rgb}
      </div>
      <div style={{ fontFamily: 'monospace', opacity: 0.8 }}>
        {color.hsl}
      </div>
      {color.a < 255 && (
        <div style={{ fontFamily: 'monospace', opacity: 0.8 }}>
          Alpha: {(color.a / 255 * 100).toFixed(0)}%
        </div>
      )}
      <div style={{
        opacity: 0.45, fontSize: 10, marginTop: 2,
        borderTop: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
        paddingTop: 4,
      }}>
        Pixel ({pixelCoord.x}, {pixelCoord.y}) &middot; Click to copy
      </div>
    </div>
  )
}

// ─── Ruler Component ────────────────────────────────────────────────────────

const Ruler: React.FC<{
  direction: 'horizontal' | 'vertical'
  length: number
  zoom: number
  offset: number
}> = ({ direction, length, zoom, offset }) => {
  const tickSpacing = useMemo(() => {
    const base = 50
    const px = base / (zoom / 100)
    if (px >= 100) return 100
    if (px >= 50) return 50
    if (px >= 25) return 25
    if (px >= 10) return 10
    return 5
  }, [zoom])

  const maxTicks = Math.ceil(length / (tickSpacing * zoom / 100)) + 2
  const startTick = Math.floor(-offset / (tickSpacing * zoom / 100))

  const ticks = useMemo(() => {
    const result: Array<{ pos: number; label: string }> = []
    for (let i = startTick; i < startTick + maxTicks; i++) {
      const pixelValue = i * tickSpacing
      const screenPos = pixelValue * (zoom / 100) + offset
      if (screenPos >= 0 && screenPos <= length) {
        result.push({ pos: screenPos, label: `${pixelValue}` })
      }
    }
    return result
  }, [startTick, maxTicks, tickSpacing, zoom, offset, length])

  const isHoriz = direction === 'horizontal'

  return (
    <div style={{
      position: 'absolute',
      [isHoriz ? 'top' : 'left']: 0,
      [isHoriz ? 'left' : 'top']: 0,
      [isHoriz ? 'width' : 'height']: length,
      [isHoriz ? 'height' : 'width']: 20,
      background: 'var(--ie-ruler-bg, rgba(30,30,34,0.95))',
      borderBottom: isHoriz ? '1px solid var(--ie-border, rgba(255,255,255,0.08))' : 'none',
      borderRight: !isHoriz ? '1px solid var(--ie-border, rgba(255,255,255,0.08))' : 'none',
      overflow: 'hidden',
      zIndex: 15,
      userSelect: 'none',
    }}>
      {ticks.map((tick, i) => (
        <div key={i} style={{
          position: 'absolute',
          [isHoriz ? 'left' : 'top']: tick.pos,
          [isHoriz ? 'bottom' : 'right']: 0,
        }}>
          <div style={{
            [isHoriz ? 'width' : 'height']: 1,
            [isHoriz ? 'height' : 'width']: 6,
            background: 'var(--ie-fg, rgba(255,255,255,0.3))',
          }} />
          <span style={{
            position: 'absolute',
            fontSize: 8,
            color: 'var(--ie-fg, rgba(255,255,255,0.4))',
            [isHoriz ? 'left' : 'top']: 2,
            [isHoriz ? 'top' : 'left']: 1,
            whiteSpace: 'nowrap',
            ...(isHoriz ? {} : {
              transform: 'rotate(-90deg)',
              transformOrigin: 'left top',
            }),
          }}>
            {tick.label}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Comparison Slider ──────────────────────────────────────────────────────

const ComparisonSlider: React.FC<{
  leftSrc: string
  rightSrc: string
  leftName: string
  rightName: string
  zoom: number
  rotation: number
  flipH: boolean
  flipV: boolean
}> = ({ leftSrc, rightSrc, leftName, rightName, zoom, rotation, flipH, flipV }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sliderPos, setSliderPos] = useState(50)
  const [dragging, setDragging] = useState(false)

  const handleMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100)
    setSliderPos(x)
  }, [dragging])

  useEffect(() => {
    if (!dragging) return
    const up = () => setDragging(false)
    const move = (e: MouseEvent) => handleMove(e)
    window.addEventListener('mouseup', up)
    window.addEventListener('mousemove', move)
    return () => {
      window.removeEventListener('mouseup', up)
      window.removeEventListener('mousemove', move)
    }
  }, [dragging, handleMove])

  const imgStyle: React.CSSProperties = {
    transform: `scale(${zoom / 100}) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative', width: '100%', height: '100%',
        overflow: 'hidden', cursor: dragging ? 'col-resize' : 'default',
      }}
      onMouseMove={handleMove}
    >
      {/* Left image (full) */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: CHECKERBOARD_BG,
      }}>
        <img src={leftSrc} alt={leftName} style={imgStyle} draggable={false} />
      </div>

      {/* Right image (clipped) */}
      <div style={{
        position: 'absolute', inset: 0,
        clipPath: `inset(0 0 0 ${sliderPos}%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: CHECKERBOARD_BG,
      }}>
        <img src={rightSrc} alt={rightName} style={imgStyle} draggable={false} />
      </div>

      {/* Slider handle */}
      <div
        onMouseDown={() => setDragging(true)}
        style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${sliderPos}%`, width: 3,
          background: 'var(--ie-accent, #4fc3f7)',
          cursor: 'col-resize', zIndex: 10,
          transform: 'translateX(-50%)',
        }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 28, height: 28, borderRadius: '50%',
          background: 'var(--ie-accent, #4fc3f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}>
          <Columns size={14} color="#000" />
        </div>
      </div>

      {/* Labels */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        background: 'rgba(0,0,0,0.6)', borderRadius: 4,
        padding: '2px 8px', fontSize: 11, color: '#fff',
      }}>
        {leftName}
      </div>
      <div style={{
        position: 'absolute', top: 8, right: 8,
        background: 'rgba(0,0,0,0.6)', borderRadius: 4,
        padding: '2px 8px', fontSize: 11, color: '#fff',
      }}>
        {rightName}
      </div>
    </div>
  )
}

// ─── GIF Animation Controller ───────────────────────────────────────────────

const AnimationController: React.FC<{
  isPlaying: boolean
  onToggle: () => void
}> = ({ isPlaying, onToggle }) => (
  <div style={{
    position: 'absolute', bottom: 12, right: 12, zIndex: 20,
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'var(--ie-panel-bg, rgba(24,24,28,0.94))',
    borderRadius: 8, padding: '6px 10px',
    border: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
    backdropFilter: 'blur(8px)',
  }}>
    <ToolbarButton
      icon={isPlaying ? <Pause size={14} /> : <Play size={14} />}
      label={isPlaying ? 'Pause animation' : 'Play animation'}
      onClick={onToggle}
      active={isPlaying}
    />
    <span style={{ fontSize: 11, color: 'var(--ie-fg, #ccc)', opacity: 0.7 }}>
      {isPlaying ? 'Playing' : 'Paused'}
    </span>
  </div>
)

// ─── Fit Mode Selector ──────────────────────────────────────────────────────

const FitModeSelector: React.FC<{
  mode: FitMode
  onChange: (m: FitMode) => void
}> = ({ mode, onChange }) => {
  const options: Array<{ value: FitMode; label: string }> = [
    { value: 'fit-page', label: 'Fit' },
    { value: 'fit-width', label: 'Width' },
    { value: 'fit-height', label: 'Height' },
    { value: 'actual', label: '1:1' },
  ]
  return (
    <div style={{
      display: 'flex', borderRadius: 4, overflow: 'hidden',
      border: '1px solid var(--ie-border, rgba(255,255,255,0.1))',
    }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            border: 'none', padding: '3px 8px',
            fontSize: 10, cursor: 'pointer',
            background: mode === opt.value
              ? 'var(--ie-accent, #4fc3f7)'
              : 'var(--ie-btn-bg, rgba(255,255,255,0.05))',
            color: mode === opt.value ? '#000' : 'var(--ie-fg, #ccc)',
            transition: 'background 0.15s',
          }}
          title={`Fit: ${opt.label}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ImageEditor({
  src,
  fileName,
  fileSize,
  comparisonSrc,
  comparisonFileName,
}: ImageEditorProps) {
  // ── State ──
  const [zoom, setZoom] = useState(100)
  const [fitMode, setFitMode] = useState<FitMode>('fit-page')
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const [showRulers, setShowRulers] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [activeTool, setActiveTool] = useState<ActiveTool>('pan')
  const [dimensions, setDimensions] = useState<ImageDimensions | null>(null)
  const [isAnimated, setIsAnimated] = useState(false)
  const [isPlaying, setIsPlaying] = useState(true)

  // Pan state
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const panStart = useRef({ x: 0, y: 0 })
  const panOffsetStart = useRef({ x: 0, y: 0 })

  // Color picker state
  const [pickedColor, setPickedColor] = useState<PickedColor | null>(null)
  const [colorPickerPos, setColorPickerPos] = useState({ x: 0, y: 0 })
  const [pixelCoord, setPixelCoord] = useState({ x: 0, y: 0 })

  // Refs
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)

  // Paused GIF: we draw a single frame onto a canvas and display that instead
  const frozenCanvasRef = useRef<HTMLCanvasElement>(null)
  const [frozenDataUrl, setFrozenDataUrl] = useState<string | null>(null)

  // ── Detect animated GIF ──
  useEffect(() => {
    const animated = isAnimatedGif(fileName)
    setIsAnimated(animated)
    setIsPlaying(animated)
  }, [fileName])

  // ── Image load → detect dimensions ──
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight })
  }, [])

  // ── Fit mode calculation ──
  const calculateFitZoom = useCallback((mode: FitMode) => {
    if (!dimensions || !viewportRef.current) return 100
    const vw = viewportRef.current.clientWidth - (showRulers ? 20 : 0)
    const vh = viewportRef.current.clientHeight - (showRulers ? 20 : 0)
    const iw = dimensions.width
    const ih = dimensions.height

    switch (mode) {
      case 'fit-page':
        return Math.round(Math.min(vw / iw, vh / ih) * 100 * 0.95)
      case 'fit-width':
        return Math.round((vw / iw) * 100 * 0.95)
      case 'fit-height':
        return Math.round((vh / ih) * 100 * 0.95)
      case 'actual':
        return 100
    }
  }, [dimensions, showRulers])

  // Apply fit mode when it changes or dimensions load
  useEffect(() => {
    const z = calculateFitZoom(fitMode)
    setZoom(clamp(z, MIN_ZOOM, MAX_ZOOM))
    setPanOffset({ x: 0, y: 0 })
  }, [fitMode, dimensions, calculateFitZoom])

  // ── Zoom change handler ──
  const handleZoomChange = useCallback((newZoom: number) => {
    setZoom(clamp(newZoom, MIN_ZOOM, MAX_ZOOM))
    setFitMode('fit-page') // exit fit mode on manual zoom
  }, [])

  // ── Mouse wheel zoom ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP
    const newZoom = clamp(Math.round(zoom * delta), MIN_ZOOM, MAX_ZOOM)

    // Zoom toward cursor position
    if (viewportRef.current) {
      const rect = viewportRef.current.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const scale = newZoom / zoom
      setPanOffset(prev => ({
        x: cx - scale * (cx - prev.x),
        y: cy - scale * (cy - prev.y),
      }))
    }

    setZoom(newZoom)
  }, [zoom])

  // ── Pan handlers ──
  const handlePanStart = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'pan') return
    if (e.button !== 0) return
    setIsPanning(true)
    panStart.current = { x: e.clientX, y: e.clientY }
    panOffsetStart.current = { ...panOffset }
  }, [activeTool, panOffset])

  const handlePanMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    setPanOffset({
      x: panOffsetStart.current.x + (e.clientX - panStart.current.x),
      y: panOffsetStart.current.y + (e.clientY - panStart.current.y),
    })
  }, [isPanning])

  const handlePanEnd = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Global mouse up for pan
  useEffect(() => {
    if (!isPanning) return
    const up = () => setIsPanning(false)
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [isPanning])

  // ── Color picker ──
  const handleColorPick = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'pick-color') return
    const img = imageRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)

    const rect = img.getBoundingClientRect()
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    const px = Math.floor((e.clientX - rect.left) * scaleX)
    const py = Math.floor((e.clientY - rect.top) * scaleY)

    if (px >= 0 && py >= 0 && px < canvas.width && py < canvas.height) {
      const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data
      const hex = `#${[r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')}`
      const [h, s, l] = rgbToHsl(r, g, b)
      const color: PickedColor = {
        hex, r, g, b, a,
        rgb: `rgb(${r}, ${g}, ${b})`,
        hsl: `hsl(${h}, ${s}%, ${l}%)`,
      }
      setPickedColor(color)
      setColorPickerPos({ x: e.clientX, y: e.clientY })
      setPixelCoord({ x: px, y: py })
    }
  }, [activeTool])

  const handleColorPickClick = useCallback((e: React.MouseEvent) => {
    if (activeTool !== 'pick-color') return
    handleColorPick(e)
    if (pickedColor) {
      navigator.clipboard.writeText(pickedColor.hex).catch(() => {})
    }
  }, [activeTool, handleColorPick, pickedColor])

  // ── Rotation ──
  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360)
  }, [])

  // ── Flip ──
  const handleFlipH = useCallback(() => setFlipH(prev => !prev), [])
  const handleFlipV = useCallback(() => setFlipV(prev => !prev), [])

  // ── Copy to clipboard ──
  const handleCopy = useCallback(async () => {
    const img = imageRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    ctx.drawImage(img, 0, 0)

    try {
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/png')
      )
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ])
      }
    } catch {
      // Fallback: copy src URL
      await navigator.clipboard.writeText(src).catch(() => {})
    }
  }, [src])

  // ── Pause/Play animated GIF ──
  const toggleAnimation = useCallback(() => {
    if (isPlaying) {
      // Freeze: draw current frame to an offscreen canvas
      const img = imageRef.current
      if (img) {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0)
          setFrozenDataUrl(c.toDataURL('image/png'))
        }
      }
      setIsPlaying(false)
    } else {
      setFrozenDataUrl(null)
      setIsPlaying(true)
    }
  }, [isPlaying])

  // ── Reset view ──
  const handleResetView = useCallback(() => {
    setRotation(0)
    setFlipH(false)
    setFlipV(false)
    setPanOffset({ x: 0, y: 0 })
    setFitMode('fit-page')
  }, [])

  // ── Image transform style ──
  const imageTransform = useMemo(() => {
    const scaleVal = zoom / 100
    const parts = [
      `translate(${panOffset.x}px, ${panOffset.y}px)`,
      `scale(${scaleVal})`,
      `rotate(${rotation}deg)`,
      flipH ? 'scaleX(-1)' : '',
      flipV ? 'scaleY(-1)' : '',
    ].filter(Boolean).join(' ')
    return parts
  }, [zoom, panOffset, rotation, flipH, flipV])

  // ── Cursor based on tool ──
  const viewportCursor = useMemo(() => {
    if (isPanning) return 'grabbing'
    if (activeTool === 'pan') return 'grab'
    if (activeTool === 'pick-color') return 'crosshair'
    return 'default'
  }, [activeTool, isPanning])

  // The actual displayed image src (frozen frame if paused)
  const displaySrc = useMemo(() => {
    if (isAnimated && !isPlaying && frozenDataUrl) return frozenDataUrl
    return src
  }, [isAnimated, isPlaying, frozenDataUrl, src])

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case '+':
        case '=':
          handleZoomChange(Math.round(zoom * ZOOM_STEP))
          break
        case '-':
          handleZoomChange(Math.round(zoom / ZOOM_STEP))
          break
        case '0':
          setFitMode('actual')
          break
        case '1':
          setFitMode('fit-page')
          break
        case 'r':
          if (!e.ctrlKey && !e.metaKey) handleRotate()
          break
        case 'h':
          if (!e.ctrlKey && !e.metaKey) handleFlipH()
          break
        case 'v':
          if (!e.ctrlKey && !e.metaKey) handleFlipV()
          break
        case 'g':
          if (!e.ctrlKey && !e.metaKey) setShowGrid(p => !p)
          break
        case 'i':
          if (!e.ctrlKey && !e.metaKey) setShowInfo(p => !p)
          break
        case 'Escape':
          setActiveTool('pan')
          setPickedColor(null)
          break
        case ' ':
          if (isAnimated) {
            e.preventDefault()
            toggleAnimation()
          }
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [zoom, handleZoomChange, handleRotate, handleFlipH, handleFlipV, isAnimated, toggleAnimation])

  // ── Render: comparison mode ──
  if (showCompare && comparisonSrc) {
    return (
      <div
        ref={containerRef}
        style={{
          display: 'flex', flexDirection: 'column',
          height: '100%', width: '100%',
          background: 'var(--ie-bg, #1e1e1e)',
          color: 'var(--ie-fg, #ccc)',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 8px', height: 36, flexShrink: 0,
          borderBottom: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
          background: 'var(--ie-toolbar-bg, #252526)',
        }}>
          <ToolbarButton
            icon={<Columns size={14} />}
            label="Exit comparison"
            active
            onClick={() => setShowCompare(false)}
          />
          <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 8 }}>
            Side-by-side comparison &middot; Drag the slider to compare
          </span>
        </div>

        <ComparisonSlider
          leftSrc={src}
          rightSrc={comparisonSrc}
          leftName={fileName}
          rightName={comparisonFileName || 'Comparison'}
          zoom={zoom}
          rotation={rotation}
          flipH={flipH}
          flipV={flipV}
        />
      </div>
    )
  }

  // ── Render: main editor ──
  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', width: '100%',
        background: 'var(--ie-bg, #1e1e1e)',
        color: 'var(--ie-fg, #ccc)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* ── Top toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', height: 36, flexShrink: 0,
        borderBottom: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
        background: 'var(--ie-toolbar-bg, #252526)',
        overflowX: 'auto',
        overflowY: 'hidden',
      }}>
        {/* File name */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginRight: 8, flexShrink: 0,
        }}>
          <ImageIcon size={14} style={{ opacity: 0.6 }} />
          <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.8 }}>
            {fileName}
          </span>
          {dimensions && (
            <span style={{ fontSize: 10, opacity: 0.45 }}>
              {dimensions.width}x{dimensions.height}
            </span>
          )}
        </div>

        <ToolbarSep />

        {/* Tools */}
        <ToolbarButton
          icon={<Move size={14} />}
          label="Pan tool (Esc)"
          active={activeTool === 'pan'}
          onClick={() => { setActiveTool('pan'); setPickedColor(null) }}
        />
        <ToolbarButton
          icon={<Pipette size={14} />}
          label="Color picker"
          active={activeTool === 'pick-color'}
          onClick={() => setActiveTool(activeTool === 'pick-color' ? 'pan' : 'pick-color')}
        />

        <ToolbarSep />

        {/* Zoom */}
        <ZoomControls zoom={zoom} onZoomChange={handleZoomChange} />
        <FitModeSelector mode={fitMode} onChange={setFitMode} />

        <ToolbarSep />

        {/* Transform */}
        <ToolbarButton
          icon={<RotateCw size={14} />}
          label="Rotate 90deg (R)"
          onClick={handleRotate}
        />
        <ToolbarButton
          icon={<FlipHorizontal size={14} />}
          label="Flip horizontal (H)"
          active={flipH}
          onClick={handleFlipH}
        />
        <ToolbarButton
          icon={<FlipVertical size={14} />}
          label="Flip vertical (V)"
          active={flipV}
          onClick={handleFlipV}
        />

        <ToolbarSep />

        {/* Toggles */}
        <ToolbarButton
          icon={<Grid size={14} />}
          label="Toggle checkerboard (G)"
          active={showGrid}
          onClick={() => setShowGrid(p => !p)}
        />
        <ToolbarButton
          icon={<RulerIcon size={14} />}
          label="Toggle rulers"
          active={showRulers}
          onClick={() => setShowRulers(p => !p)}
        />
        <ToolbarButton
          icon={<Info size={14} />}
          label="Toggle info panel (I)"
          active={showInfo}
          onClick={() => setShowInfo(p => !p)}
        />

        <ToolbarSep />

        {/* Actions */}
        <ToolbarButton
          icon={<Copy size={14} />}
          label="Copy image to clipboard"
          onClick={handleCopy}
        />
        {comparisonSrc && (
          <ToolbarButton
            icon={<Columns size={14} />}
            label="Compare images"
            onClick={() => setShowCompare(true)}
          />
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Reset */}
        <button
          onClick={handleResetView}
          style={{
            border: 'none', background: 'transparent',
            color: 'var(--ie-fg, #999)', fontSize: 11,
            cursor: 'pointer', padding: '4px 8px', borderRadius: 4,
            opacity: 0.7,
          }}
          title="Reset view"
        >
          Reset
        </button>
      </div>

      {/* ── Viewport ── */}
      <div
        ref={viewportRef}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden',
          cursor: viewportCursor,
        }}
        onWheel={handleWheel}
        onMouseDown={handlePanStart}
        onMouseMove={(e) => {
          handlePanMove(e)
          if (activeTool === 'pick-color') handleColorPick(e)
        }}
        onMouseUp={handlePanEnd}
        onClick={handleColorPickClick}
      >
        {/* Rulers */}
        {showRulers && viewportRef.current && (
          <>
            <Ruler
              direction="horizontal"
              length={viewportRef.current.clientWidth}
              zoom={zoom}
              offset={panOffset.x + (viewportRef.current.clientWidth / 2)}
            />
            <Ruler
              direction="vertical"
              length={viewportRef.current.clientHeight}
              zoom={zoom}
              offset={panOffset.y + (viewportRef.current.clientHeight / 2)}
            />
            {/* Corner square */}
            <div style={{
              position: 'absolute', top: 0, left: 0,
              width: 20, height: 20, zIndex: 16,
              background: 'var(--ie-ruler-bg, rgba(30,30,34,0.95))',
              borderRight: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
              borderBottom: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
            }} />
          </>
        )}

        {/* Image canvas area */}
        <div style={{
          position: 'absolute',
          inset: showRulers ? '20px 0 0 20px' : 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: showGrid ? CHECKERBOARD_BG : 'var(--ie-canvas-bg, #1a1a1a)',
          overflow: 'hidden',
        }}>
          <img
            ref={imageRef}
            src={displaySrc}
            alt={fileName}
            onLoad={handleImageLoad}
            draggable={false}
            style={{
              transform: imageTransform,
              transformOrigin: 'center center',
              maxWidth: 'none',
              maxHeight: 'none',
              width: dimensions ? dimensions.width : 'auto',
              height: dimensions ? dimensions.height : 'auto',
              imageRendering: zoom > 400 ? 'pixelated' : 'auto',
              userSelect: 'none',
              pointerEvents: activeTool === 'pick-color' ? 'auto' : 'none',
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
          />
        </div>

        {/* Info panel overlay */}
        {showInfo && (
          <ImageInfoPanel
            dimensions={dimensions}
            fileSize={fileSize}
            fileName={fileName}
            zoom={zoom}
            rotation={rotation}
          />
        )}

        {/* Color picker tooltip */}
        {activeTool === 'pick-color' && (
          <ColorPickerTooltip
            color={pickedColor}
            position={colorPickerPos}
            pixelCoord={pixelCoord}
          />
        )}

        {/* Animation controller for GIFs */}
        {isAnimated && (
          <AnimationController
            isPlaying={isPlaying}
            onToggle={toggleAnimation}
          />
        )}

        {/* Zoom indicator (brief overlay) */}
        <div style={{
          position: 'absolute', top: 8, right: 8, zIndex: 20,
          background: 'var(--ie-panel-bg, rgba(24,24,28,0.85))',
          borderRadius: 6, padding: '4px 10px',
          fontSize: 11, color: 'var(--ie-fg, #ccc)',
          border: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
          display: 'flex', alignItems: 'center', gap: 6,
          backdropFilter: 'blur(6px)',
          pointerEvents: 'none',
        }}>
          <ZoomIn size={11} style={{ opacity: 0.5 }} />
          {zoom}%
          {rotation !== 0 && (
            <span style={{ opacity: 0.5, marginLeft: 4 }}>{rotation}deg</span>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '2px 12px', height: 22, flexShrink: 0,
        borderTop: '1px solid var(--ie-border, rgba(255,255,255,0.08))',
        background: 'var(--ie-statusbar-bg, #1f1f1f)',
        fontSize: 11, color: 'var(--ie-fg, #999)',
      }}>
        <span>{detectFormat(fileName)}</span>
        {dimensions && (
          <span>{dimensions.width} x {dimensions.height} px</span>
        )}
        {fileSize !== undefined && <span>{formatBytes(fileSize)}</span>}
        <span>{zoom}%</span>
        {rotation !== 0 && <span>Rotated {rotation}deg</span>}
        {flipH && <span>Flipped H</span>}
        {flipV && <span>Flipped V</span>}
        {isAnimated && (
          <span style={{ color: isPlaying ? 'var(--ie-accent, #4fc3f7)' : 'inherit' }}>
            {isPlaying ? 'Animated (playing)' : 'Animated (paused)'}
          </span>
        )}
        {activeTool === 'pick-color' && pickedColor && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              display: 'inline-block', width: 10, height: 10,
              borderRadius: 2, background: pickedColor.hex,
              border: '1px solid rgba(255,255,255,0.2)',
            }} />
            {pickedColor.hex}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ opacity: 0.5 }}>
          {activeTool === 'pan' ? 'Pan' : 'Color Picker'} tool
        </span>
      </div>

      {/* Hidden canvas for color picking / copy */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
