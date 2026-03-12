import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronRight,
  FolderOpen,
  FileText,
  Braces,
  Box,
  Variable,
  Type,
} from 'lucide-react'

export interface BreadcrumbSymbol {
  name: string
  kind: string
  range: { startLine: number }
}

interface Props {
  filePath: string
  symbols?: BreadcrumbSymbol[]
  onNavigate?: (line: number) => void
}

interface DropdownItem {
  label: string
  icon: React.ReactNode
  action: () => void
}

const SYMBOL_ICONS: Record<string, React.ReactNode> = {
  function: <Braces size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />,
  method: <Braces size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />,
  class: <Box size={14} style={{ color: '#e5c07b', flexShrink: 0 }} />,
  interface: <Type size={14} style={{ color: '#56b6c2', flexShrink: 0 }} />,
  variable: <Variable size={14} style={{ color: '#c678dd', flexShrink: 0 }} />,
  constant: <Variable size={14} style={{ color: '#c678dd', flexShrink: 0 }} />,
  property: <Variable size={14} style={{ color: '#c678dd', flexShrink: 0 }} />,
}

function getSymbolIcon(kind: string): React.ReactNode {
  return SYMBOL_ICONS[kind.toLowerCase()] || <Braces size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
}

/** Simulated sibling files for a folder segment */
function getSimulatedSiblings(segment: string, fullPath: string): string[] {
  const parts = fullPath.replace(/\\/g, '/').split('/')
  const idx = parts.indexOf(segment)
  if (idx < 0) return [segment]
  // Return the real segment plus a few plausible siblings
  const siblings = new Set<string>([segment])
  if (idx > 0) {
    siblings.add('src')
    siblings.add('lib')
    siblings.add('utils')
    siblings.add('components')
    siblings.add('hooks')
  }
  // Always include the actual segment first
  return [segment, ...Array.from(siblings).filter(s => s !== segment).slice(0, 4)]
}

function Dropdown({
  items,
  anchorRect,
  onClose,
  focusedIndex,
}: {
  items: DropdownItem[]
  anchorRect: DOMRect
  onClose: () => void
  focusedIndex: number
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const left = Math.max(0, anchorRect.left)
  const top = anchorRect.bottom + 1

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 10000,
        minWidth: 160,
        maxWidth: 280,
        maxHeight: 240,
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        padding: '4px 0',
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          onClick={() => {
            item.action()
            onClose()
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            fontSize: 12,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            background: i === focusedIndex ? 'rgba(255,255,255,0.08)' : 'transparent',
            transition: 'background 0.08s',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)'
          }}
          onMouseLeave={(e) => {
            if (i !== focusedIndex) {
              (e.currentTarget as HTMLElement).style.background = 'transparent'
            }
          }}
        >
          {item.icon}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
          No items
        </div>
      )}
    </div>
  )
}

export default function Breadcrumbs({ filePath, symbols, onNavigate }: Props) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null)
  const [dropdownAnchor, setDropdownAnchor] = useState<DOMRect | null>(null)
  const [dropdownItems, setDropdownItems] = useState<DropdownItem[]>([])
  const [dropdownFocusIndex, setDropdownFocusIndex] = useState(-1)
  const [focusedSegmentIndex, setFocusedSegmentIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const segmentRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const normalized = filePath.replace(/\\/g, '/')
  const pathSegments = useMemo(() => normalized.split('/').filter(Boolean), [normalized])
  const fileName = pathSegments[pathSegments.length - 1] || ''
  const folderSegments = pathSegments.slice(0, -1)

  // Total segments: folders + file + symbols
  const totalSegments = folderSegments.length + 1 + (symbols?.length || 0)

  const closeDropdown = useCallback(() => {
    setActiveDropdown(null)
    setDropdownAnchor(null)
    setDropdownItems([])
    setDropdownFocusIndex(-1)
  }, [])

  const openFolderDropdown = useCallback((index: number, el: HTMLElement) => {
    const segment = folderSegments[index]
    const rect = el.getBoundingClientRect()
    const siblings = getSimulatedSiblings(segment, normalized)
    const items: DropdownItem[] = siblings.map(s => ({
      label: s,
      icon: <FolderOpen size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />,
      action: () => { /* navigation stub */ },
    }))
    setActiveDropdown(index)
    setDropdownAnchor(rect)
    setDropdownItems(items)
    setDropdownFocusIndex(-1)
  }, [folderSegments, normalized])

  const openFileDropdown = useCallback((el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    // Simulate sibling files in the same directory
    const siblingFiles = [fileName, 'index.ts', 'utils.ts', 'types.ts', 'styles.css'].filter(
      (v, i, arr) => arr.indexOf(v) === i
    )
    const items: DropdownItem[] = siblingFiles.map(f => ({
      label: f,
      icon: <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />,
      action: () => { /* navigation stub */ },
    }))
    setActiveDropdown(folderSegments.length)
    setDropdownAnchor(rect)
    setDropdownItems(items)
    setDropdownFocusIndex(-1)
  }, [fileName, folderSegments.length])

  const openSymbolDropdown = useCallback((symbolIndex: number, el: HTMLElement) => {
    if (!symbols) return
    const rect = el.getBoundingClientRect()
    const items: DropdownItem[] = symbols.map(s => ({
      label: s.name,
      icon: getSymbolIcon(s.kind),
      action: () => onNavigate?.(s.range.startLine),
    }))
    setActiveDropdown(folderSegments.length + 1 + symbolIndex)
    setDropdownAnchor(rect)
    setDropdownItems(items)
    setDropdownFocusIndex(-1)
  }, [symbols, folderSegments.length, onNavigate])

  const handleSegmentClick = useCallback((globalIndex: number, el: HTMLElement) => {
    if (activeDropdown === globalIndex) {
      closeDropdown()
      return
    }
    if (globalIndex < folderSegments.length) {
      openFolderDropdown(globalIndex, el)
    } else if (globalIndex === folderSegments.length) {
      openFileDropdown(el)
    } else {
      const symbolIdx = globalIndex - folderSegments.length - 1
      openSymbolDropdown(symbolIdx, el)
    }
  }, [activeDropdown, folderSegments.length, openFolderDropdown, openFileDropdown, openSymbolDropdown, closeDropdown])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (focusedSegmentIndex < 0 && activeDropdown === null) return

      if (e.key === 'Escape') {
        if (activeDropdown !== null) {
          closeDropdown()
          e.preventDefault()
        } else {
          setFocusedSegmentIndex(-1)
        }
        return
      }

      if (activeDropdown !== null) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setDropdownFocusIndex(prev => Math.min(prev + 1, dropdownItems.length - 1))
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setDropdownFocusIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter' && dropdownFocusIndex >= 0) {
          e.preventDefault()
          dropdownItems[dropdownFocusIndex]?.action()
          closeDropdown()
        }
        return
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setFocusedSegmentIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setFocusedSegmentIndex(prev => Math.min(prev + 1, totalSegments - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const el = segmentRefs.current.get(focusedSegmentIndex)
        if (el) handleSegmentClick(focusedSegmentIndex, el)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [focusedSegmentIndex, activeDropdown, dropdownFocusIndex, dropdownItems, totalSegments, handleSegmentClick, closeDropdown])

  const segmentStyle = (index: number): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '1px 4px',
    borderRadius: 3,
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: '20px',
    color: hoveredSegment === index || focusedSegmentIndex === index
      ? 'var(--text-primary)'
      : 'var(--text-muted)',
    background: hoveredSegment === index || focusedSegmentIndex === index
      ? 'rgba(255,255,255,0.07)'
      : activeDropdown === index
        ? 'rgba(255,255,255,0.05)'
        : 'transparent',
    outline: focusedSegmentIndex === index ? '1px solid var(--accent-blue)' : 'none',
    outlineOffset: -1,
    transition: 'background 0.1s, color 0.1s',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  })

  const separatorStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--text-muted)',
    opacity: 0.5,
    flexShrink: 0,
  }

  const setSegmentRef = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) {
      segmentRefs.current.set(index, el)
    } else {
      segmentRefs.current.delete(index)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onFocus={() => {
        if (focusedSegmentIndex < 0) setFocusedSegmentIndex(0)
      }}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setFocusedSegmentIndex(-1)
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 22,
        paddingLeft: 8,
        paddingRight: 8,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        overflow: 'hidden',
        flexShrink: 0,
        outline: 'none',
      }}
    >
      {/* Folder segments */}
      {folderSegments.map((seg, i) => (
        <React.Fragment key={`folder-${i}`}>
          <div
            ref={(el) => setSegmentRef(i, el)}
            style={segmentStyle(i)}
            onMouseEnter={() => setHoveredSegment(i)}
            onMouseLeave={() => setHoveredSegment(null)}
            onClick={(e) => handleSegmentClick(i, e.currentTarget)}
          >
            <FolderOpen size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
            <span>{seg}</span>
          </div>
          <span style={separatorStyle}>
            <ChevronRight size={12} />
          </span>
        </React.Fragment>
      ))}

      {/* File segment */}
      <div
        ref={(el) => setSegmentRef(folderSegments.length, el)}
        style={segmentStyle(folderSegments.length)}
        onMouseEnter={() => setHoveredSegment(folderSegments.length)}
        onMouseLeave={() => setHoveredSegment(null)}
        onClick={(e) => handleSegmentClick(folderSegments.length, e.currentTarget)}
      >
        <FileText size={13} style={{ opacity: 0.7, flexShrink: 0 }} />
        <span>{fileName}</span>
      </div>

      {/* Symbol segments */}
      {symbols && symbols.length > 0 && symbols.map((sym, i) => {
        const globalIdx = folderSegments.length + 1 + i
        return (
          <React.Fragment key={`sym-${i}`}>
            <span style={separatorStyle}>
              <ChevronRight size={12} />
            </span>
            <div
              ref={(el) => setSegmentRef(globalIdx, el)}
              style={segmentStyle(globalIdx)}
              onMouseEnter={() => setHoveredSegment(globalIdx)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={(e) => {
                handleSegmentClick(globalIdx, e.currentTarget)
                onNavigate?.(sym.range.startLine)
              }}
            >
              {getSymbolIcon(sym.kind)}
              <span>{sym.name}</span>
            </div>
          </React.Fragment>
        )
      })}

      {/* Dropdown */}
      {activeDropdown !== null && dropdownAnchor && (
        <Dropdown
          items={dropdownItems}
          anchorRect={dropdownAnchor}
          onClose={closeDropdown}
          focusedIndex={dropdownFocusIndex}
        />
      )}
    </div>
  )
}
