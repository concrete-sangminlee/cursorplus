import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  useOutputStore,
  type OutputLineType,
} from '@/store/output'
import {
  ChevronDown, Trash2, Copy, WrapText, FileOutput,
  Pin, PinOff, Clock, Search, X,
} from 'lucide-react'

/* ── Line type colour mapping ────────────────────────────── */

const lineTypeColors: Record<OutputLineType, string> = {
  info:    'var(--text-secondary)',
  warn:    '#d29922',
  error:   '#f85149',
  success: '#3fb950',
}

/* ── Component ────────────────────────────────────────────── */

export default function OutputPanel() {
  const channels    = useOutputStore((s) => s.channels)
  const active      = useOutputStore((s) => s.activeChannel)
  const setActive   = useOutputStore((s) => s.setActiveChannel)
  const clearChan   = useOutputStore((s) => s.clearChannel)

  const [wordWrap, setWordWrap]             = useState(true)
  const [dropdownOpen, setDropdownOpen]     = useState(false)
  const [copyFeedback, setCopyFeedback]     = useState(false)
  const [pinToBottom, setPinToBottom]        = useState(true)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [filterText, setFilterText]         = useState('')
  const [filterOpen, setFilterOpen]         = useState(false)

  const scrollRef    = useRef<HTMLDivElement>(null)
  const dropdownRef  = useRef<HTMLDivElement>(null)
  const filterRef    = useRef<HTMLInputElement>(null)

  const allLines = channels.get(active) ?? []

  /* ── Filtered lines ──────────────────────────────────────── */

  const lines = useMemo(() => {
    if (!filterText) return allLines
    const lower = filterText.toLowerCase()
    return allLines.filter((l) => l.text.toLowerCase().includes(lower))
  }, [allLines, filterText])

  /* ── Auto-scroll (pin to bottom) ─────────────────────────── */

  useEffect(() => {
    if (pinToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines.length, pinToBottom])

  const handleScroll = useCallback(() => {
    if (!pinToBottom) return
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    if (!atBottom) {
      setPinToBottom(false)
    }
  }, [pinToBottom])

  /* ── Close dropdown on outside click ─────────────────────── */

  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  /* ── Focus filter input on open ──────────────────────────── */

  useEffect(() => {
    if (filterOpen && filterRef.current) {
      filterRef.current.focus()
    }
  }, [filterOpen])

  /* ── Copy all output ─────────────────────────────────────── */

  const handleCopy = useCallback(() => {
    const text = lines
      .map((l) => {
        const ts = new Date(l.timestamp).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        })
        return `[${ts}] ${l.text}`
      })
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    })
  }, [lines])

  /* ── Channel list ────────────────────────────────────────── */

  const channelNames = Array.from(channels.keys())

  /* ── Format timestamp ────────────────────────────────────── */

  const fmtTime = useCallback((ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }, [])

  /* ── Toggle filter bar ───────────────────────────────────── */

  const toggleFilter = useCallback(() => {
    setFilterOpen((v) => {
      if (v) setFilterText('')
      return !v
    })
  }, [])

  /* ── Empty state ─────────────────────────────────────────── */

  if (lines.length === 0 && !filterText) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Toolbar
          channelNames={channelNames}
          active={active}
          setActive={setActive}
          dropdownOpen={dropdownOpen}
          setDropdownOpen={setDropdownOpen}
          dropdownRef={dropdownRef}
          onClear={() => clearChan(active)}
          onCopy={handleCopy}
          copyFeedback={copyFeedback}
          wordWrap={wordWrap}
          onToggleWrap={() => setWordWrap((v) => !v)}
          pinToBottom={pinToBottom}
          onTogglePin={() => setPinToBottom((v) => !v)}
          showTimestamps={showTimestamps}
          onToggleTimestamps={() => setShowTimestamps((v) => !v)}
          onToggleFilter={toggleFilter}
          filterOpen={filterOpen}
        />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FileOutput size={18} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, marginTop: 4 }}>
            No output
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, opacity: 0.5 }}>
            Output from {active} channel will appear here
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        channelNames={channelNames}
        active={active}
        setActive={setActive}
        dropdownOpen={dropdownOpen}
        setDropdownOpen={setDropdownOpen}
        dropdownRef={dropdownRef}
        onClear={() => clearChan(active)}
        onCopy={handleCopy}
        copyFeedback={copyFeedback}
        wordWrap={wordWrap}
        onToggleWrap={() => setWordWrap((v) => !v)}
        pinToBottom={pinToBottom}
        onTogglePin={() => setPinToBottom((v) => !v)}
        showTimestamps={showTimestamps}
        onToggleTimestamps={() => setShowTimestamps((v) => !v)}
        onToggleFilter={toggleFilter}
        filterOpen={filterOpen}
      />

      {/* ── Filter bar ──────────────────────────────────────── */}
      {filterOpen && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-secondary)',
            flexShrink: 0,
          }}
        >
          <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={filterRef}
            type="text"
            placeholder="Filter output..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              flex: 1,
              height: 22,
              fontSize: 11,
              color: 'var(--text-primary)',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              padding: '0 6px',
              outline: 'none',
              fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", Consolas, monospace)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setFilterText('')
                setFilterOpen(false)
              }
            }}
          />
          {filterText && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
              {lines.length} match{lines.length !== 1 ? 'es' : ''}
            </span>
          )}
          <button
            onClick={() => { setFilterText(''); setFilterOpen(false) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 2,
              borderRadius: 3,
            }}
            title="Close filter"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* ── Log area ──────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: wordWrap ? 'hidden' : 'auto',
          fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", Consolas, monospace)',
          fontSize: 12,
          lineHeight: 1.55,
          padding: '2px 0',
        }}
      >
        {lines.length === 0 && filterText ? (
          <div
            style={{
              padding: '20px 10px',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 11,
            }}
          >
            No results matching "{filterText}"
          </div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              style={{
                display: 'flex',
                minHeight: 20,
                padding: '0 10px',
                whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
                wordBreak: wordWrap ? 'break-all' : undefined,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {/* Timestamp */}
              {showTimestamps && (
                <span
                  style={{
                    color: 'var(--text-muted)',
                    opacity: 0.5,
                    fontSize: 10,
                    flexShrink: 0,
                    width: 62,
                    paddingTop: 2,
                    userSelect: 'none',
                  }}
                >
                  {fmtTime(line.timestamp)}
                </span>
              )}

              {/* Text */}
              <span style={{ color: lineTypeColors[line.type], flex: 1 }}>
                {line.text}
              </span>
            </div>
          ))
        )}
      </div>

      {/* ── Scroll-to-bottom indicator ────────────────────── */}
      {!pinToBottom && (
        <button
          onClick={() => {
            setPinToBottom(true)
            if (scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }
          }}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: 10,
            fontWeight: 500,
            color: 'var(--text-primary)',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 10,
          }}
          title="Scroll to bottom and pin"
        >
          <ChevronDown size={12} />
          Follow output
        </button>
      )}
    </div>
  )
}

/* ── Toolbar ──────────────────────────────────────────────── */

function Toolbar({
  channelNames,
  active,
  setActive,
  dropdownOpen,
  setDropdownOpen,
  dropdownRef,
  onClear,
  onCopy,
  copyFeedback,
  wordWrap,
  onToggleWrap,
  pinToBottom,
  onTogglePin,
  showTimestamps,
  onToggleTimestamps,
  onToggleFilter,
  filterOpen,
}: {
  channelNames: string[]
  active: string
  setActive: (ch: string) => void
  dropdownOpen: boolean
  setDropdownOpen: (v: boolean) => void
  dropdownRef: React.RefObject<HTMLDivElement | null>
  onClear: () => void
  onCopy: () => void
  copyFeedback: boolean
  wordWrap: boolean
  onToggleWrap: () => void
  pinToBottom: boolean
  onTogglePin: () => void
  showTimestamps: boolean
  onToggleTimestamps: () => void
  onToggleFilter: () => void
  filterOpen: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {/* ── Channel selector ──────────────────────────────── */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 24,
            padding: '0 8px',
            fontSize: 11,
            fontWeight: 500,
            color: 'var(--text-primary)',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {active}
          <ChevronDown size={11} style={{ opacity: 0.5 }} />
        </button>

        {dropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 2,
              minWidth: 140,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            {channelNames.map((ch) => (
              <button
                key={ch}
                onClick={() => {
                  setActive(ch)
                  setDropdownOpen(false)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 10px',
                  fontSize: 11,
                  fontWeight: active === ch ? 600 : 400,
                  color: active === ch ? 'var(--accent)' : 'var(--text-secondary)',
                  background: active === ch ? 'rgba(88,166,255,0.08)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (active !== ch) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                }}
                onMouseLeave={(e) => {
                  if (active !== ch) e.currentTarget.style.background = 'transparent'
                }}
              >
                {ch}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* ── Filter toggle ──────────────────────────────────── */}
      <ToolbarButton
        title={filterOpen ? 'Close filter' : 'Filter output'}
        active={filterOpen}
        onClick={onToggleFilter}
      >
        <Search size={13} />
      </ToolbarButton>

      {/* ── Timestamp toggle ───────────────────────────────── */}
      <ToolbarButton
        title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
        active={showTimestamps}
        onClick={onToggleTimestamps}
      >
        <Clock size={13} />
      </ToolbarButton>

      {/* ── Pin to bottom toggle ───────────────────────────── */}
      <ToolbarButton
        title={pinToBottom ? 'Unpin from bottom' : 'Pin to bottom (auto-scroll)'}
        active={pinToBottom}
        onClick={onTogglePin}
      >
        {pinToBottom ? <Pin size={13} /> : <PinOff size={13} />}
      </ToolbarButton>

      {/* ── Word wrap toggle ───────────────────────────────── */}
      <ToolbarButton
        title={wordWrap ? 'Disable word wrap' : 'Enable word wrap'}
        active={wordWrap}
        onClick={onToggleWrap}
      >
        <WrapText size={13} />
      </ToolbarButton>

      {/* ── Copy ───────────────────────────────────────────── */}
      <ToolbarButton title="Copy all output" onClick={onCopy}>
        <Copy size={13} />
        {copyFeedback && (
          <span style={{ fontSize: 9, marginLeft: 2, color: 'var(--accent-green, #3fb950)' }}>
            Copied
          </span>
        )}
      </ToolbarButton>

      {/* ── Clear ──────────────────────────────────────────── */}
      <ToolbarButton title="Clear output" onClick={onClear}>
        <Trash2 size={13} />
      </ToolbarButton>
    </div>
  )
}

/* ── Small toolbar icon button ────────────────────────────── */

function ToolbarButton({
  title,
  onClick,
  children,
  active,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        height: 22,
        padding: '0 5px',
        borderRadius: 3,
        border: 'none',
        cursor: 'pointer',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        background: active ? 'rgba(88,166,255,0.10)' : 'transparent',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
        e.currentTarget.style.color = 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? 'rgba(88,166,255,0.10)' : 'transparent'
        e.currentTarget.style.color = active ? 'var(--accent)' : 'var(--text-muted)'
      }}
    >
      {children}
    </button>
  )
}
