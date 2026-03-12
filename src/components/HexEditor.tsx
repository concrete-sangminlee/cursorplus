import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Search,
  Copy,
  ChevronDown,
  Info,
  ArrowUp,
  ArrowDown,
  Navigation,
  FileDigit,
  Eye,
  Hash,
  Binary,
} from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface HexEditorProps {
  data: Uint8Array
  fileName?: string
  fileType?: string
}

type BytesPerRow = 8 | 16 | 32
type AddressFormat = 'hex' | 'decimal'
type SearchMode = 'hex' | 'ascii'
type CopyFormat = 'hex' | 'decimal' | 'c-array' | 'base64'
type Endianness = 'little' | 'big'
type InspectorTab = 'integers' | 'floats'

interface SearchResult {
  offset: number
  length: number
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ROW_HEIGHT = 22
const VISIBLE_ROWS_BUFFER = 6
const MIN_INSPECTOR_WIDTH = 240

const FILE_SIGNATURES: Array<{ magic: number[]; type: string }> = [
  { magic: [0x89, 0x50, 0x4e, 0x47], type: 'PNG Image' },
  { magic: [0xff, 0xd8, 0xff], type: 'JPEG Image' },
  { magic: [0x47, 0x49, 0x46, 0x38], type: 'GIF Image' },
  { magic: [0x52, 0x49, 0x46, 0x46], type: 'RIFF (WAV/WebP)' },
  { magic: [0x50, 0x4b, 0x03, 0x04], type: 'ZIP Archive' },
  { magic: [0x25, 0x50, 0x44, 0x46], type: 'PDF Document' },
  { magic: [0x7f, 0x45, 0x4c, 0x46], type: 'ELF Binary' },
  { magic: [0x4d, 0x5a], type: 'PE Executable' },
  { magic: [0x1f, 0x8b], type: 'Gzip Archive' },
  { magic: [0x42, 0x5a, 0x68], type: 'Bzip2 Archive' },
  { magic: [0xfd, 0x37, 0x7a, 0x58, 0x5a], type: 'XZ Archive' },
  { magic: [0x00, 0x00, 0x00, 0x1c, 0x66, 0x74, 0x79, 0x70], type: 'MP4 Video' },
  { magic: [0x49, 0x44, 0x33], type: 'MP3 Audio' },
  { magic: [0x4f, 0x67, 0x67, 0x53], type: 'OGG Audio' },
  { magic: [0xca, 0xfe, 0xba, 0xbe], type: 'Mach-O / Java Class' },
  { magic: [0x23, 0x21], type: 'Script (shebang)' },
  { magic: [0xef, 0xbb, 0xbf], type: 'UTF-8 w/ BOM' },
]

// ─── CSS Variables with fallback ────────────────────────────────────────────

const v = {
  bg: 'var(--hex-bg, #1e1e1e)',
  bgAlt: 'var(--hex-bg-alt, #252526)',
  bgHeader: 'var(--hex-bg-header, #2d2d30)',
  bgHover: 'var(--hex-bg-hover, rgba(255,255,255,0.04))',
  bgSelect: 'var(--hex-bg-select, rgba(38,79,120,0.6))',
  bgSearch: 'var(--hex-bg-search, rgba(234,179,8,0.3))',
  bgSearchActive: 'var(--hex-bg-search-active, rgba(234,179,8,0.6))',
  bgInspector: 'var(--hex-bg-inspector, #252526)',
  fg: 'var(--hex-fg, #cccccc)',
  fgDim: 'var(--hex-fg-dim, #555555)',
  fgOffset: 'var(--hex-fg-offset, #858585)',
  fgNull: 'var(--hex-fg-null, #444444)',
  fgPrintable: 'var(--hex-fg-printable, #d4d4d4)',
  fgHigh: 'var(--hex-fg-high, #c586c0)',
  fgAccent: 'var(--hex-fg-accent, #4fc3f7)',
  fgLabel: 'var(--hex-fg-label, #858585)',
  border: 'var(--hex-border, rgba(255,255,255,0.08))',
  borderActive: 'var(--hex-border-active, rgba(79,195,247,0.4))',
  accent: 'var(--hex-accent, #4fc3f7)',
  accentHover: 'var(--hex-accent-hover, #81d4fa)',
  scrollTrack: 'var(--hex-scroll-track, #1e1e1e)',
  scrollThumb: 'var(--hex-scroll-thumb, #424242)',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function detectFileType(data: Uint8Array): string {
  for (const sig of FILE_SIGNATURES) {
    if (sig.magic.every((b, i) => data[i] === b)) return sig.type
  }
  // Check if mostly text
  let textCount = 0
  const check = Math.min(data.length, 512)
  for (let i = 0; i < check; i++) {
    const b = data[i]
    if ((b >= 0x20 && b <= 0x7e) || b === 0x0a || b === 0x0d || b === 0x09) textCount++
  }
  if (check > 0 && textCount / check > 0.85) return 'Text File'
  return 'Binary File'
}

function byteToHex(byte: number): string {
  return byte.toString(16).padStart(2, '0')
}

function byteToAscii(byte: number): string {
  if (byte >= 0x20 && byte <= 0x7e) return String.fromCharCode(byte)
  return '.'
}

function formatOffset(offset: number, format: AddressFormat, totalBytes: number): string {
  if (format === 'decimal') {
    const width = totalBytes.toString().length
    return offset.toString().padStart(Math.max(width, 8), ' ')
  }
  const width = Math.max(8, Math.ceil(Math.log2(totalBytes + 1) / 4) * 2 || 8)
  return offset.toString(16).padStart(width, '0').toUpperCase()
}

function getByteColor(byte: number): string {
  if (byte === 0x00) return v.fgNull
  if (byte >= 0x20 && byte <= 0x7e) return v.fgPrintable
  return v.fgHigh
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function toBase64(data: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i])
  }
  return btoa(binary)
}

function parseHexInput(hex: string): number[] | null {
  const clean = hex.replace(/[\s,0x]/g, '')
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) return null
  const bytes: number[] = []
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16))
  }
  return bytes
}

function readUint16(data: Uint8Array, offset: number, le: boolean): number | null {
  if (offset + 2 > data.length) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return dv.getUint16(offset, le)
}

function readInt16(data: Uint8Array, offset: number, le: boolean): number | null {
  if (offset + 2 > data.length) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return dv.getInt16(offset, le)
}

function readUint32(data: Uint8Array, offset: number, le: boolean): number | null {
  if (offset + 4 > data.length) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return dv.getUint32(offset, le)
}

function readInt32(data: Uint8Array, offset: number, le: boolean): number | null {
  if (offset + 4 > data.length) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return dv.getInt32(offset, le)
}

function readFloat32(data: Uint8Array, offset: number, le: boolean): number | null {
  if (offset + 4 > data.length) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return dv.getFloat32(offset, le)
}

function readFloat64(data: Uint8Array, offset: number, le: boolean): number | null {
  if (offset + 8 > data.length) return null
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength)
  return dv.getFloat64(offset, le)
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  active,
  title,
  children,
}: {
  onClick: (e: React.MouseEvent) => void
  active?: boolean
  title?: string
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? 'rgba(79,195,247,0.15)' : hovered ? v.bgHover : 'transparent',
        border: active ? `1px solid ${v.borderActive}` : '1px solid transparent',
        borderRadius: 4,
        padding: '3px 8px',
        color: active ? v.accent : v.fg,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 11,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function Dropdown({
  value,
  options,
  onChange,
  width,
}: {
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  width?: number
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: v.bgAlt,
        border: `1px solid ${v.border}`,
        borderRadius: 4,
        color: v.fg,
        fontSize: 11,
        fontFamily: 'inherit',
        padding: '2px 6px',
        cursor: 'pointer',
        width: width ?? 'auto',
        outline: 'none',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function InspectorRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '2px 0',
        fontSize: 11,
        lineHeight: '18px',
      }}
    >
      <span style={{ color: v.fgLabel, minWidth: 72 }}>{label}</span>
      <span
        style={{
          color: value !== null ? v.fgPrintable : v.fgDim,
          fontFamily: 'monospace',
          textAlign: 'right',
          userSelect: value !== null ? 'text' : 'none',
        }}
      >
        {value ?? '\u2014'}
      </span>
    </div>
  )
}

// ─── Byte Inspector Panel ───────────────────────────────────────────────────

function ByteInspectorPanel({
  data,
  offset,
  endianness,
  onEndiannessChange,
}: {
  data: Uint8Array
  offset: number | null
  endianness: Endianness
  onEndiannessChange: (e: Endianness) => void
}) {
  const [tab, setTab] = useState<InspectorTab>('integers')
  const le = endianness === 'little'

  if (offset === null || offset >= data.length) {
    return (
      <div style={{ padding: '12px 14px', color: v.fgDim, fontSize: 11 }}>
        Select a byte to inspect
      </div>
    )
  }

  const byte = data[offset]
  const uint8 = byte
  const int8 = byte > 127 ? byte - 256 : byte
  const uint16 = readUint16(data, offset, le)
  const int16 = readInt16(data, offset, le)
  const uint32 = readUint32(data, offset, le)
  const int32 = readInt32(data, offset, le)
  const float32 = readFloat32(data, offset, le)
  const float64 = readFloat64(data, offset, le)

  const binaryStr = byte.toString(2).padStart(8, '0')
  const octalStr = byte.toString(8).padStart(3, '0')

  return (
    <div style={{ fontSize: 11 }}>
      {/* Offset header */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: `1px solid ${v.border}`,
          color: v.fgAccent,
          fontFamily: 'monospace',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Offset: 0x{offset.toString(16).toUpperCase()}</span>
        <span style={{ color: v.fgLabel }}>({offset})</span>
      </div>

      {/* Byte quick view */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: `1px solid ${v.border}`,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '2px 12px',
        }}
      >
        <InspectorRow label="Hex" value={`0x${byteToHex(byte).toUpperCase()}`} />
        <InspectorRow label="Decimal" value={String(byte)} />
        <InspectorRow label="Binary" value={binaryStr} />
        <InspectorRow label="Octal" value={`0o${octalStr}`} />
        <InspectorRow
          label="ASCII"
          value={
            byte >= 0x20 && byte <= 0x7e ? `'${String.fromCharCode(byte)}'` : 'N/A'
          }
        />
      </div>

      {/* Endianness toggle */}
      <div
        style={{
          padding: '6px 14px',
          borderBottom: `1px solid ${v.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ color: v.fgLabel }}>Endianness:</span>
        <ToolbarButton
          active={endianness === 'little'}
          onClick={() => onEndiannessChange('little')}
        >
          LE
        </ToolbarButton>
        <ToolbarButton
          active={endianness === 'big'}
          onClick={() => onEndiannessChange('big')}
        >
          BE
        </ToolbarButton>
      </div>

      {/* Tab switch */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid ${v.border}`,
        }}
      >
        {(['integers', 'floats'] as InspectorTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              background: tab === t ? 'rgba(79,195,247,0.1)' : 'transparent',
              border: 'none',
              borderBottom:
                tab === t ? `2px solid ${v.accent}` : '2px solid transparent',
              color: tab === t ? v.accent : v.fgLabel,
              padding: '6px 0',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
              textTransform: 'capitalize',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Values */}
      <div style={{ padding: '8px 14px' }}>
        {tab === 'integers' ? (
          <>
            <InspectorRow label="uint8" value={String(uint8)} />
            <InspectorRow label="int8" value={String(int8)} />
            <InspectorRow label="uint16" value={uint16 !== null ? String(uint16) : null} />
            <InspectorRow label="int16" value={int16 !== null ? String(int16) : null} />
            <InspectorRow label="uint32" value={uint32 !== null ? String(uint32) : null} />
            <InspectorRow label="int32" value={int32 !== null ? String(int32) : null} />
          </>
        ) : (
          <>
            <InspectorRow
              label="float32"
              value={float32 !== null ? float32.toPrecision(7) : null}
            />
            <InspectorRow
              label="float64"
              value={float64 !== null ? float64.toPrecision(15) : null}
            />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Copy Menu Item ─────────────────────────────────────────────────────────

function CopyMenuItem({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  disabled: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        padding: '5px 14px',
        background: hovered && !disabled ? v.bgHover : 'transparent',
        border: 'none',
        color: disabled ? v.fgDim : v.fg,
        fontFamily: 'inherit',
        fontSize: 11,
        cursor: disabled ? 'default' : 'pointer',
        textAlign: 'left' as const,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Hex Row (memoized) ─────────────────────────────────────────────────────

interface HexRowProps {
  rowOffset: number
  bytes: Array<{ value: number; globalOffset: number } | null>
  bytesPerRow: BytesPerRow
  addressFormat: AddressFormat
  totalBytes: number
  selStart: number | null
  selEnd: number | null
  selectedOffset: number | null
  searchOffsetSet: Set<number>
  activeSearchOffsetSet: Set<number>
  groupSize: number
  onByteClick: (offset: number, e: React.MouseEvent) => void
}

function HexRow({
  rowOffset,
  bytes,
  bytesPerRow,
  addressFormat,
  totalBytes,
  selStart,
  selEnd,
  selectedOffset,
  searchOffsetSet,
  activeSearchOffsetSet,
  groupSize,
  onByteClick,
}: HexRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: ROW_HEIGHT,
        lineHeight: `${ROW_HEIGHT}px`,
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      {/* Offset column */}
      <div
        style={{
          minWidth: 90,
          paddingLeft: 14,
          paddingRight: 12,
          textAlign: 'right',
          color: v.fgOffset,
          flexShrink: 0,
          fontSize: 11,
        }}
      >
        {formatOffset(rowOffset, addressFormat, totalBytes)}
      </div>

      {/* Hex bytes */}
      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
        {bytes.map((byte, i) => {
          if (byte === null) {
            return (
              <span
                key={i}
                style={{
                  width: 26,
                  textAlign: 'center',
                  marginRight:
                    (i + 1) % groupSize === 0 && i < bytesPerRow - 1 ? 8 : 0,
                }}
              >
                {'  '}
              </span>
            )
          }

          const off = byte.globalOffset
          const isSelected =
            selStart !== null && selEnd !== null && off >= selStart && off <= selEnd
          const isCursor = off === selectedOffset
          const isSearchHit = searchOffsetSet.has(off)
          const isActiveSearch = activeSearchOffsetSet.has(off)

          let bg = 'transparent'
          if (isActiveSearch) bg = v.bgSearchActive
          else if (isSearchHit) bg = v.bgSearch
          else if (isSelected) bg = v.bgSelect

          return (
            <span
              key={i}
              onClick={(e) => onByteClick(off, e)}
              style={{
                width: 26,
                textAlign: 'center',
                color: getByteColor(byte.value),
                background: bg,
                borderRadius: 2,
                cursor: 'pointer',
                outline: isCursor ? `1px solid ${v.accent}` : 'none',
                outlineOffset: -1,
                marginRight:
                  (i + 1) % groupSize === 0 && i < bytesPerRow - 1 ? 8 : 0,
                transition: 'background 0.1s',
              }}
            >
              {byteToHex(byte.value).toUpperCase()}
            </span>
          )
        })}
      </div>

      {/* Separator */}
      <div
        style={{
          width: 1,
          height: 14,
          background: v.border,
          margin: '0 10px',
          flexShrink: 0,
        }}
      />

      {/* ASCII column */}
      <div style={{ display: 'flex', gap: 0, flexShrink: 0 }}>
        {bytes.map((byte, i) => {
          if (byte === null) {
            return (
              <span key={i} style={{ width: 9, textAlign: 'center' }}>
                {' '}
              </span>
            )
          }

          const off = byte.globalOffset
          const isSelected =
            selStart !== null && selEnd !== null && off >= selStart && off <= selEnd
          const isCursor = off === selectedOffset
          const isSearchHit = searchOffsetSet.has(off)
          const isActiveSearch = activeSearchOffsetSet.has(off)

          let bg = 'transparent'
          if (isActiveSearch) bg = v.bgSearchActive
          else if (isSearchHit) bg = v.bgSearch
          else if (isSelected) bg = v.bgSelect

          const isPrintable = byte.value >= 0x20 && byte.value <= 0x7e

          return (
            <span
              key={i}
              onClick={(e) => onByteClick(off, e)}
              style={{
                width: 9,
                textAlign: 'center',
                color: isPrintable ? v.fgPrintable : v.fgNull,
                background: bg,
                borderRadius: 1,
                cursor: 'pointer',
                outline: isCursor ? `1px solid ${v.accent}` : 'none',
                outlineOffset: -1,
                transition: 'background 0.1s',
              }}
            >
              {byteToAscii(byte.value)}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function HexEditor({ data, fileName, fileType }: HexEditorProps) {
  // ── State ──
  const [bytesPerRow, setBytesPerRow] = useState<BytesPerRow>(16)
  const [addressFormat, setAddressFormat] = useState<AddressFormat>('hex')
  const [selectedOffset, setSelectedOffset] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('hex')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1)
  const [showGoTo, setShowGoTo] = useState(false)
  const [goToValue, setGoToValue] = useState('')
  const [showInspector, setShowInspector] = useState(true)
  const [endianness, setEndianness] = useState<Endianness>('little')
  const [showCopyMenu, setShowCopyMenu] = useState(false)
  const [scrollTop, setScrollTop] = useState(0)

  // ── Refs ──
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const goToInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Derived ──
  const totalRows = Math.ceil(data.length / bytesPerRow)
  const detectedType = useMemo(() => fileType ?? detectFileType(data), [data, fileType])
  const containerHeight = useRef(600)

  // Selection range (always min..max)
  const selStart = useMemo(() => {
    if (selectedOffset === null) return null
    if (selectionEnd === null) return selectedOffset
    return Math.min(selectedOffset, selectionEnd)
  }, [selectedOffset, selectionEnd])

  const selEnd = useMemo(() => {
    if (selectedOffset === null) return null
    if (selectionEnd === null) return selectedOffset
    return Math.max(selectedOffset, selectionEnd)
  }, [selectedOffset, selectionEnd])

  const selectedBytes = useMemo(() => {
    if (selStart === null || selEnd === null) return null
    return data.slice(selStart, selEnd + 1)
  }, [data, selStart, selEnd])

  // Search result offsets set for quick lookup
  const searchOffsetSet = useMemo(() => {
    const set = new Set<number>()
    for (const r of searchResults) {
      for (let i = 0; i < r.length; i++) set.add(r.offset + i)
    }
    return set
  }, [searchResults])

  const activeSearchOffsetSet = useMemo(() => {
    const set = new Set<number>()
    if (activeSearchIndex >= 0 && activeSearchIndex < searchResults.length) {
      const r = searchResults[activeSearchIndex]
      for (let i = 0; i < r.length; i++) set.add(r.offset + i)
    }
    return set
  }, [searchResults, activeSearchIndex])

  // ── Virtual scrolling ──
  const visibleRowCount =
    Math.ceil(containerHeight.current / ROW_HEIGHT) + VISIBLE_ROWS_BUFFER
  const firstVisibleRow = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - Math.floor(VISIBLE_ROWS_BUFFER / 2),
  )
  const lastVisibleRow = Math.min(totalRows, firstVisibleRow + visibleRowCount)

  // ── Track container height ──
  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight.current = entry.contentRect.height
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // ── Scroll handler ──
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (el) setScrollTop(el.scrollTop)
  }, [])

  // ── Scroll to offset ──
  const scrollToOffset = useCallback(
    (offset: number) => {
      const row = Math.floor(offset / bytesPerRow)
      const el = scrollContainerRef.current
      if (!el) return
      const targetTop = row * ROW_HEIGHT
      const viewHeight = el.clientHeight
      if (
        targetTop < el.scrollTop ||
        targetTop > el.scrollTop + viewHeight - ROW_HEIGHT
      ) {
        el.scrollTop = Math.max(0, targetTop - viewHeight / 3)
      }
    },
    [bytesPerRow],
  )

  // ── Search logic ──
  const runSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setActiveSearchIndex(-1)
      return
    }

    const results: SearchResult[] = []

    if (searchMode === 'hex') {
      const pattern = parseHexInput(searchQuery)
      if (!pattern || pattern.length === 0) {
        setSearchResults([])
        return
      }
      for (let i = 0; i <= data.length - pattern.length; i++) {
        let match = true
        for (let j = 0; j < pattern.length; j++) {
          if (data[i + j] !== pattern[j]) {
            match = false
            break
          }
        }
        if (match) {
          results.push({ offset: i, length: pattern.length })
        }
      }
    } else {
      // ASCII search (case-insensitive)
      const needle = searchQuery.toLowerCase()
      for (let i = 0; i <= data.length - needle.length; i++) {
        let match = true
        for (let j = 0; j < needle.length; j++) {
          const ch = String.fromCharCode(data[i + j]).toLowerCase()
          if (ch !== needle[j]) {
            match = false
            break
          }
        }
        if (match) {
          results.push({ offset: i, length: needle.length })
        }
      }
    }

    setSearchResults(results)
    setActiveSearchIndex(results.length > 0 ? 0 : -1)

    // Scroll to first result
    if (results.length > 0) {
      scrollToOffset(results[0].offset)
    }
  }, [searchQuery, searchMode, data, scrollToOffset])

  const navigateSearch = useCallback(
    (direction: 1 | -1) => {
      if (searchResults.length === 0) return
      const next =
        (activeSearchIndex + direction + searchResults.length) % searchResults.length
      setActiveSearchIndex(next)
      scrollToOffset(searchResults[next].offset)
    },
    [searchResults, activeSearchIndex, scrollToOffset],
  )

  // ── Go to offset ──
  const handleGoTo = useCallback(() => {
    const trimmed = goToValue.trim()
    if (!trimmed) return
    let offset: number
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      offset = parseInt(trimmed, 16)
    } else {
      offset = parseInt(trimmed, 10)
    }
    if (isNaN(offset) || offset < 0 || offset >= data.length) return
    setSelectedOffset(offset)
    setSelectionEnd(null)
    scrollToOffset(offset)
    setShowGoTo(false)
    setGoToValue('')
  }, [goToValue, data.length, scrollToOffset])

  // ── Copy functions ──
  const handleCopy = useCallback(
    (format: CopyFormat) => {
      const bytes = selectedBytes
      if (!bytes || bytes.length === 0) return

      let text = ''
      switch (format) {
        case 'hex':
          text = Array.from(bytes)
            .map((b) => byteToHex(b).toUpperCase())
            .join(' ')
          break
        case 'decimal':
          text = Array.from(bytes)
            .map((b) => String(b))
            .join(', ')
          break
        case 'c-array':
          text = `{ ${Array.from(bytes)
            .map((b) => `0x${byteToHex(b).toUpperCase()}`)
            .join(', ')} }`
          break
        case 'base64':
          text = toBase64(bytes)
          break
      }
      copyToClipboard(text)
      setShowCopyMenu(false)
    },
    [selectedBytes],
  )

  // ── Click handler for byte selection ──
  const handleByteClick = useCallback(
    (offset: number, e: React.MouseEvent) => {
      if (e.shiftKey && selectedOffset !== null) {
        setSelectionEnd(offset)
      } else {
        setSelectedOffset(offset)
        setSelectionEnd(null)
      }
    },
    [selectedOffset],
  )

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showSearch || showGoTo) return

      // Ctrl shortcuts
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'f') {
          e.preventDefault()
          setShowSearch(true)
          setTimeout(() => searchInputRef.current?.focus(), 50)
          return
        }
        if (e.key === 'g') {
          e.preventDefault()
          setShowGoTo(true)
          setTimeout(() => goToInputRef.current?.focus(), 50)
          return
        }
        return
      }

      if (selectedOffset === null) return

      let newOffset = selectedOffset
      const shiftHeld = e.shiftKey

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault()
          newOffset = Math.min(data.length - 1, selectedOffset + 1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          newOffset = Math.max(0, selectedOffset - 1)
          break
        case 'ArrowDown':
          e.preventDefault()
          newOffset = Math.min(data.length - 1, selectedOffset + bytesPerRow)
          break
        case 'ArrowUp':
          e.preventDefault()
          newOffset = Math.max(0, selectedOffset - bytesPerRow)
          break
        case 'PageDown':
          e.preventDefault()
          newOffset = Math.min(
            data.length - 1,
            selectedOffset +
              bytesPerRow * Math.floor(containerHeight.current / ROW_HEIGHT),
          )
          break
        case 'PageUp':
          e.preventDefault()
          newOffset = Math.max(
            0,
            selectedOffset -
              bytesPerRow * Math.floor(containerHeight.current / ROW_HEIGHT),
          )
          break
        case 'Home':
          e.preventDefault()
          if (e.ctrlKey) {
            newOffset = 0
          } else {
            newOffset = selectedOffset - (selectedOffset % bytesPerRow)
          }
          break
        case 'End':
          e.preventDefault()
          if (e.ctrlKey) {
            newOffset = data.length - 1
          } else {
            newOffset = Math.min(
              data.length - 1,
              selectedOffset - (selectedOffset % bytesPerRow) + bytesPerRow - 1,
            )
          }
          break
        case 'Escape':
          setSelectedOffset(null)
          setSelectionEnd(null)
          return
        default:
          return
      }

      if (shiftHeld) {
        setSelectionEnd(newOffset)
      } else {
        setSelectedOffset(newOffset)
        setSelectionEnd(null)
      }
      scrollToOffset(newOffset)
    },
    [selectedOffset, data.length, bytesPerRow, showSearch, showGoTo, scrollToOffset],
  )

  // ── Search overlay key handling ──
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          navigateSearch(-1)
        } else if (searchResults.length > 0 && activeSearchIndex >= 0) {
          navigateSearch(1)
        } else {
          runSearch()
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowSearch(false)
        setSearchResults([])
        setActiveSearchIndex(-1)
        containerRef.current?.focus()
      }
    },
    [runSearch, navigateSearch, searchResults, activeSearchIndex],
  )

  // ── GoTo overlay key handling ──
  const handleGoToKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleGoTo()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowGoTo(false)
        containerRef.current?.focus()
      }
    },
    [handleGoTo],
  )

  // ── Close copy menu on outside click ──
  useEffect(() => {
    if (!showCopyMenu) return
    const handler = () => setShowCopyMenu(false)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [showCopyMenu])

  // ── Focus on search open ──
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus()
  }, [showSearch])

  useEffect(() => {
    if (showGoTo) goToInputRef.current?.focus()
  }, [showGoTo])

  // ── Build visible rows ──
  const rows = useMemo(() => {
    const result: Array<{
      rowIndex: number
      offset: number
      bytes: Array<{ value: number; globalOffset: number } | null>
    }> = []

    for (let r = firstVisibleRow; r < lastVisibleRow; r++) {
      const rowOffset = r * bytesPerRow
      if (rowOffset >= data.length) break
      const bytes: Array<{ value: number; globalOffset: number } | null> = []
      for (let c = 0; c < bytesPerRow; c++) {
        const off = rowOffset + c
        if (off < data.length) {
          bytes.push({ value: data[off], globalOffset: off })
        } else {
          bytes.push(null)
        }
      }
      result.push({ rowIndex: r, offset: rowOffset, bytes })
    }
    return result
  }, [data, bytesPerRow, firstVisibleRow, lastVisibleRow])

  // ── Hex column header labels ──
  const hexColumnHeaders = useMemo(() => {
    const headers: string[] = []
    for (let i = 0; i < bytesPerRow; i++) {
      headers.push(byteToHex(i).toUpperCase())
    }
    return headers
  }, [bytesPerRow])

  // ── Selection count ──
  const selectionCount =
    selStart !== null && selEnd !== null ? selEnd - selStart + 1 : 0

  // ── Group separator every 8 bytes ──
  const groupSize = 8

  // ── Render ──
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: v.bg,
        color: v.fg,
        fontFamily:
          "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
        fontSize: 12,
        outline: 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── File Info Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '6px 14px',
          background: v.bgHeader,
          borderBottom: `1px solid ${v.border}`,
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileDigit size={14} style={{ color: v.accent, flexShrink: 0 }} />
          <span style={{ color: v.fgPrintable, fontWeight: 600 }}>
            {fileName ?? 'Untitled'}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: v.fgLabel,
          }}
        >
          <Info size={12} />
          <span>{detectedType}</span>
        </div>
        <span style={{ color: v.fgLabel }}>{formatBytes(data.length)}</span>
        <span style={{ color: v.fgDim }}>
          ({data.length.toLocaleString()} bytes)
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginLeft: 'auto',
          }}
        >
          <Eye size={12} style={{ color: v.fgLabel }} />
          <span style={{ color: v.fgLabel }}>Read-only</span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 14px',
          background: v.bgAlt,
          borderBottom: `1px solid ${v.border}`,
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        {/* Bytes per row */}
        <span style={{ color: v.fgLabel, fontSize: 11 }}>Columns:</span>
        <Dropdown
          value={String(bytesPerRow)}
          options={[
            { value: '8', label: '8' },
            { value: '16', label: '16' },
            { value: '32', label: '32' },
          ]}
          onChange={(val) => setBytesPerRow(Number(val) as BytesPerRow)}
          width={56}
        />

        <div
          style={{
            width: 1,
            height: 18,
            background: v.border,
            margin: '0 4px',
          }}
        />

        {/* Address format */}
        <span style={{ color: v.fgLabel, fontSize: 11 }}>Address:</span>
        <Dropdown
          value={addressFormat}
          options={[
            { value: 'hex', label: 'Hex' },
            { value: 'decimal', label: 'Decimal' },
          ]}
          onChange={(val) => setAddressFormat(val as AddressFormat)}
          width={72}
        />

        <div
          style={{
            width: 1,
            height: 18,
            background: v.border,
            margin: '0 4px',
          }}
        />

        {/* Search */}
        <ToolbarButton
          active={showSearch}
          onClick={() => {
            setShowSearch(!showSearch)
            if (!showSearch)
              setTimeout(() => searchInputRef.current?.focus(), 50)
          }}
          title="Search (Ctrl+F)"
        >
          <Search size={13} />
          Search
        </ToolbarButton>

        {/* Go to */}
        <ToolbarButton
          onClick={() => {
            setShowGoTo(!showGoTo)
            if (!showGoTo)
              setTimeout(() => goToInputRef.current?.focus(), 50)
          }}
          active={showGoTo}
          title="Go to offset (Ctrl+G)"
        >
          <Navigation size={13} />
          Go to
        </ToolbarButton>

        <div
          style={{
            width: 1,
            height: 18,
            background: v.border,
            margin: '0 4px',
          }}
        />

        {/* Copy */}
        <div style={{ position: 'relative' }}>
          <ToolbarButton
            onClick={(e) => {
              e.stopPropagation()
              setShowCopyMenu(!showCopyMenu)
            }}
            title="Copy selection"
          >
            <Copy size={13} />
            Copy
            <ChevronDown size={11} />
          </ToolbarButton>
          {showCopyMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: v.bgHeader,
                border: `1px solid ${v.border}`,
                borderRadius: 6,
                padding: '4px 0',
                zIndex: 100,
                minWidth: 160,
                boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}
            >
              {(
                [
                  {
                    format: 'hex' as CopyFormat,
                    label: 'Copy as Hex',
                    icon: <Hash size={13} />,
                  },
                  {
                    format: 'decimal' as CopyFormat,
                    label: 'Copy as Decimal',
                    icon: <Binary size={13} />,
                  },
                  {
                    format: 'c-array' as CopyFormat,
                    label: 'Copy as C Array',
                    icon: <Copy size={13} />,
                  },
                  {
                    format: 'base64' as CopyFormat,
                    label: 'Copy as Base64',
                    icon: <FileDigit size={13} />,
                  },
                ] as const
              ).map(({ format, label, icon }) => (
                <CopyMenuItem
                  key={format}
                  label={label}
                  icon={icon}
                  disabled={!selectedBytes || selectedBytes.length === 0}
                  onClick={() => handleCopy(format)}
                />
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            width: 1,
            height: 18,
            background: v.border,
            margin: '0 4px',
          }}
        />

        {/* Inspector toggle */}
        <ToolbarButton
          active={showInspector}
          onClick={() => setShowInspector(!showInspector)}
          title="Toggle byte inspector"
        >
          <Info size={13} />
          Inspector
        </ToolbarButton>

        {/* Selection info (right side) */}
        {selectionCount > 0 && (
          <div
            style={{
              marginLeft: 'auto',
              color: v.fgLabel,
              fontSize: 11,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>
              Selected: {selectionCount} byte
              {selectionCount !== 1 ? 's' : ''}
            </span>
            <span style={{ color: v.fgDim }}>
              (0x{selStart!.toString(16).toUpperCase()} &ndash; 0x
              {selEnd!.toString(16).toUpperCase()})
            </span>
          </div>
        )}
      </div>

      {/* ── Search Overlay ── */}
      {showSearch && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            background: v.bgHeader,
            borderBottom: `1px solid ${v.border}`,
            flexShrink: 0,
          }}
        >
          <Dropdown
            value={searchMode}
            options={[
              { value: 'hex', label: 'Hex' },
              { value: 'ascii', label: 'ASCII' },
            ]}
            onChange={(val) => setSearchMode(val as SearchMode)}
            width={72}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder={
              searchMode === 'hex' ? 'FF 00 AB ...' : 'Search text...'
            }
            style={{
              background: v.bg,
              border: `1px solid ${v.border}`,
              borderRadius: 4,
              color: v.fg,
              fontFamily: 'inherit',
              fontSize: 12,
              padding: '4px 8px',
              flex: 1,
              maxWidth: 300,
              outline: 'none',
            }}
          />
          <ToolbarButton onClick={runSearch} title="Search">
            <Search size={13} />
          </ToolbarButton>
          <ToolbarButton
            onClick={() => navigateSearch(-1)}
            title="Previous match"
          >
            <ArrowUp size={13} />
          </ToolbarButton>
          <ToolbarButton onClick={() => navigateSearch(1)} title="Next match">
            <ArrowDown size={13} />
          </ToolbarButton>
          <span
            style={{ color: v.fgLabel, fontSize: 11, minWidth: 80 }}
          >
            {searchResults.length > 0
              ? `${activeSearchIndex + 1} / ${searchResults.length}`
              : searchQuery
                ? 'No results'
                : ''}
          </span>
          <ToolbarButton
            onClick={() => {
              setShowSearch(false)
              setSearchResults([])
              setActiveSearchIndex(-1)
              containerRef.current?.focus()
            }}
          >
            Esc
          </ToolbarButton>
        </div>
      )}

      {/* ── Go To Overlay ── */}
      {showGoTo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            background: v.bgHeader,
            borderBottom: `1px solid ${v.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ color: v.fgLabel, fontSize: 11 }}>
            Go to offset:
          </span>
          <input
            ref={goToInputRef}
            type="text"
            value={goToValue}
            onChange={(e) => setGoToValue(e.target.value)}
            onKeyDown={handleGoToKeyDown}
            placeholder="0x1A4F or 6735"
            style={{
              background: v.bg,
              border: `1px solid ${v.border}`,
              borderRadius: 4,
              color: v.fg,
              fontFamily: 'inherit',
              fontSize: 12,
              padding: '4px 8px',
              width: 180,
              outline: 'none',
            }}
          />
          <ToolbarButton onClick={handleGoTo} title="Go">
            <Navigation size={13} />
            Go
          </ToolbarButton>
          <span style={{ color: v.fgDim, fontSize: 11 }}>
            (0 &ndash; 0x{(data.length - 1).toString(16).toUpperCase()})
          </span>
          <ToolbarButton
            onClick={() => {
              setShowGoTo(false)
              containerRef.current?.focus()
            }}
          >
            Esc
          </ToolbarButton>
        </div>
      )}

      {/* ── Main Content Area ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* ── Hex Grid ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Column headers */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '4px 0',
              borderBottom: `1px solid ${v.border}`,
              background: v.bgAlt,
              flexShrink: 0,
              fontSize: 10,
              color: v.fgLabel,
              userSelect: 'none',
            }}
          >
            {/* Offset column header */}
            <div
              style={{
                minWidth: 90,
                paddingLeft: 14,
                paddingRight: 12,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              Offset
            </div>

            {/* Hex column headers */}
            <div
              style={{
                display: 'flex',
                gap: 0,
                flexShrink: 0,
              }}
            >
              {hexColumnHeaders.map((h, i) => (
                <span
                  key={i}
                  style={{
                    width: 26,
                    textAlign: 'center',
                    marginRight:
                      (i + 1) % groupSize === 0 && i < bytesPerRow - 1
                        ? 8
                        : 0,
                  }}
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Separator */}
            <div
              style={{
                width: 1,
                height: 14,
                background: v.border,
                margin: '0 10px',
                flexShrink: 0,
              }}
            />

            {/* ASCII header */}
            <div style={{ paddingLeft: 2 }}>ASCII</div>
          </div>

          {/* Virtual scrolling container */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              overflowX: 'auto',
              position: 'relative',
            }}
          >
            {/* Total height spacer for virtual scroll */}
            <div
              style={{ height: totalRows * ROW_HEIGHT, position: 'relative' }}
            >
              {/* Rendered rows (positioned absolutely) */}
              <div
                style={{
                  position: 'absolute',
                  top: firstVisibleRow * ROW_HEIGHT,
                  left: 0,
                  right: 0,
                }}
              >
                {rows.map(({ rowIndex, offset: rowOffset, bytes }) => (
                  <HexRow
                    key={rowIndex}
                    rowOffset={rowOffset}
                    bytes={bytes}
                    bytesPerRow={bytesPerRow}
                    addressFormat={addressFormat}
                    totalBytes={data.length}
                    selStart={selStart}
                    selEnd={selEnd}
                    selectedOffset={selectedOffset}
                    searchOffsetSet={searchOffsetSet}
                    activeSearchOffsetSet={activeSearchOffsetSet}
                    groupSize={groupSize}
                    onByteClick={handleByteClick}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Inspector Panel ── */}
        {showInspector && (
          <div
            style={{
              width: MIN_INSPECTOR_WIDTH,
              minWidth: MIN_INSPECTOR_WIDTH,
              borderLeft: `1px solid ${v.border}`,
              background: v.bgInspector,
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: '8px 14px',
                borderBottom: `1px solid ${v.border}`,
                fontSize: 11,
                fontWeight: 600,
                color: v.fgPrintable,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Info size={13} style={{ color: v.accent }} />
              Byte Inspector
            </div>
            <ByteInspectorPanel
              data={data}
              offset={selectedOffset}
              endianness={endianness}
              onEndiannessChange={setEndianness}
            />
          </div>
        )}
      </div>

      {/* ── Status Bar ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '3px 14px',
          background: v.bgHeader,
          borderTop: `1px solid ${v.border}`,
          fontSize: 11,
          color: v.fgLabel,
          flexShrink: 0,
        }}
      >
        {selectedOffset !== null && (
          <>
            <span>
              Offset:{' '}
              {addressFormat === 'hex'
                ? `0x${selectedOffset.toString(16).toUpperCase()}`
                : selectedOffset}
            </span>
            <span>
              Byte: 0x{byteToHex(data[selectedOffset]).toUpperCase()} (
              {data[selectedOffset]})
            </span>
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {totalRows.toLocaleString()} rows | {bytesPerRow} bytes/row
        </span>
        <span>
          Ln{' '}
          {selectedOffset !== null
            ? Math.floor(selectedOffset / bytesPerRow) + 1
            : '\u2014'}
          , Col{' '}
          {selectedOffset !== null
            ? (selectedOffset % bytesPerRow) + 1
            : '\u2014'}
        </span>
      </div>
    </div>
  )
}
