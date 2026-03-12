import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Files, Search, GitBranch, Bot, Settings, ListTree, Package, CircleUser, Bug, FlaskConical } from 'lucide-react'
import { useEditorStore } from '@/store/editor'
import { useFileStore } from '@/store/files'
import { useProblemsStore } from '@/store/problems'
import type { FileNode } from '@shared/types'

type PanelView = 'explorer' | 'search' | 'git' | 'debug' | 'agents' | 'outline' | 'extensions' | 'testing'

interface Props {
  activeView: PanelView
  onViewChange: (view: PanelView) => void
  onSettingsClick?: () => void
}

interface ActivityItem {
  view: PanelView
  Icon: typeof Files
  label: string
  shortcut?: string
  showDot?: boolean
  badgeKey?: 'git' | 'problems' | 'search'
}

const defaultItems: ActivityItem[] = [
  { view: 'explorer', Icon: Files, label: 'Explorer', shortcut: 'Ctrl+Shift+E', badgeKey: 'problems' },
  { view: 'search', Icon: Search, label: 'Search', shortcut: 'Ctrl+Shift+F', badgeKey: 'search' },
  { view: 'git', Icon: GitBranch, label: 'Source Control', shortcut: 'Ctrl+Shift+G', badgeKey: 'git' },
  { view: 'debug', Icon: Bug, label: 'Run and Debug', shortcut: 'Ctrl+Shift+D' },
  { view: 'agents', Icon: Bot, label: 'AI Agents', showDot: true },
  { view: 'outline', Icon: ListTree, label: 'Outline', shortcut: 'Ctrl+Shift+O' },
  { view: 'extensions', Icon: Package, label: 'Extensions', shortcut: 'Ctrl+Shift+X' },
  { view: 'testing', Icon: FlaskConical, label: 'Testing', shortcut: 'Ctrl+Shift+T' },
]

/* ── Tooltip Component ─────────────────────────────────────────── */
function Tooltip({ label, shortcut, visible, anchorRect }: {
  label: string
  shortcut?: string
  visible: boolean
  anchorRect: DOMRect | null
}) {
  if (!visible || !anchorRect) return null
  return (
    <div
      className="activity-tooltip"
      style={{
        position: 'fixed',
        left: anchorRect.right + 8,
        top: anchorRect.top + anchorRect.height / 2,
        transform: 'translateY(-50%)',
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <span className="activity-tooltip-label">{label}</span>
      {shortcut && <span className="activity-tooltip-shortcut">{shortcut}</span>}
    </div>
  )
}

/* ── Badge Component ───────────────────────────────────────────── */
function Badge({ count, type }: { count: number; type?: 'error' | 'info' }) {
  const prevCountRef = useRef(count)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (count !== prevCountRef.current && count > 0) {
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 400)
      prevCountRef.current = count
      return () => clearTimeout(timer)
    }
    prevCountRef.current = count
  }, [count])

  if (count <= 0) return null

  const bg = type === 'error'
    ? 'var(--accent-red, #f85149)'
    : 'var(--accent-blue, #388bfd)'

  return (
    <span
      className={pulse ? 'activity-badge-pulse' : ''}
      style={{
        position: 'absolute',
        top: 4,
        right: 4,
        minWidth: 14,
        height: 14,
        borderRadius: 7,
        background: bg,
        color: '#fff',
        fontSize: 9,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 3px',
        lineHeight: 1,
        pointerEvents: 'none',
      }}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

/* ── Badge type mapping ────────────────────────────────────────── */
function getBadgeType(key?: string): 'error' | 'info' {
  return key === 'problems' ? 'error' : 'info'
}

/* ── Main Component ────────────────────────────────────────────── */
export default function ActivityBar({ activeView, onViewChange, onSettingsClick }: Props) {
  const [hoveredView, setHoveredView] = useState<string | null>(null)
  const [tooltipRect, setTooltipRect] = useState<DOMRect | null>(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [items, setItems] = useState<ActivityItem[]>(defaultItems)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Badge counts from stores
  const openFiles = useEditorStore((s) => s.openFiles)
  const fileTree = useFileStore((s) => s.fileTree)
  const problems = useProblemsStore((s) => s.problems)

  // Count files with git status recursively from the file tree
  const countGitFiles = useCallback((nodes: FileNode[]): number => {
    let count = 0
    for (const node of nodes) {
      if (node.gitStatus) count++
      if (node.children) count += countGitFiles(node.children)
    }
    return count
  }, [])

  const gitChangedCount = useMemo(() => {
    const treeCount = countGitFiles(fileTree)
    if (treeCount > 0) return treeCount
    return openFiles.filter((f) => f.isModified || f.aiModified).length
  }, [fileTree, openFiles, countGitFiles])

  const problemsCount = problems.length

  const getBadgeCount = (key?: string): number => {
    switch (key) {
      case 'git':
        return gitChangedCount
      case 'problems':
        return problemsCount
      case 'search':
        return 0
      default:
        return 0
    }
  }

  // Tooltip hover logic with 300ms delay
  const handleMouseEnter = useCallback((view: string, el: HTMLElement) => {
    setHoveredView(view)
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      setTooltipRect(el.getBoundingClientRect())
      setTooltipVisible(true)
    }, 300)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoveredView(null)
    setTooltipVisible(false)
    setTooltipRect(null)
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    }
  }, [])

  // Drag reorder handlers
  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      const reordered = [...items]
      const [moved] = reordered.splice(dragIndex, 1)
      reordered.splice(index, 0, moved)
      setItems(reordered)
    }
    setDragIndex(null)
    setDragOverIndex(null)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
  }

  // Find current tooltip item data
  const hoveredItem = hoveredView
    ? items.find((i) => i.view === hoveredView)
    : null

  // Bottom items tooltip data
  const bottomTooltipLabel =
    hoveredView === 'account' ? 'Account' :
    hoveredView === 'settings' ? 'Settings' :
    null
  const bottomTooltipShortcut =
    hoveredView === 'settings' ? 'Ctrl+,' : undefined

  return (
    <>
      <Tooltip
        label={hoveredItem?.label ?? bottomTooltipLabel ?? ''}
        shortcut={hoveredItem?.shortcut ?? bottomTooltipShortcut}
        visible={tooltipVisible && (!!hoveredItem || !!bottomTooltipLabel)}
        anchorRect={tooltipRect}
      />
      <nav
        className="activity-bar shrink-0 flex flex-col items-center"
        style={{
          width: 48,
          background: 'var(--bg-tertiary)',
          borderRight: '1px solid var(--border)',
          paddingTop: 4,
          paddingBottom: 8,
        }}
      >
        {/* ── Top panel icons ──────────────────────────────────── */}
        {items.map(({ view, Icon, label, shortcut, showDot, badgeKey }, index) => {
          const isActive = activeView === view
          const isHovered = hoveredView === view
          const badgeCount = getBadgeCount(badgeKey)
          const isDragOver = dragOverIndex === index
          const isDragging = dragIndex === index

          return (
            <button
              key={view}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              onClick={() => onViewChange(view)}
              className="activity-bar-item relative flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderLeft: isActive
                  ? '2px solid var(--accent-blue, #388bfd)'
                  : '2px solid transparent',
                background: isActive
                  ? 'rgba(56, 139, 253, 0.08)'
                  : 'transparent',
                color: isActive
                  ? 'var(--text-primary)'
                  : isHovered
                    ? 'var(--text-secondary)'
                    : 'var(--text-muted)',
                transition: 'color 0.15s ease, border-color 0.2s ease, background 0.2s ease, opacity 0.15s ease',
                opacity: isDragging ? 0.4 : 1,
                borderTop: isDragOver ? '2px solid var(--accent-blue, #388bfd)' : '2px solid transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => handleMouseEnter(view, e.currentTarget)}
              onMouseLeave={handleMouseLeave}
            >
              <Icon size={21} strokeWidth={isActive ? 1.8 : 1.4} className="activity-bar-icon" />

              {/* Badge count */}
              <Badge count={badgeCount} type={getBadgeType(badgeKey)} />

              {/* Notification dot for agents */}
              {showDot && (
                <span
                  className="anim-pulse"
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--accent-green)',
                    boxShadow: '0 0 6px rgba(63, 185, 80, 0.4)',
                    border: '1px solid var(--bg-tertiary)',
                  }}
                />
              )}
            </button>
          )
        })}

        {/* ── Spacer ───────────────────────────────────────────── */}
        <div className="flex-1" />

        {/* ── Bottom section ───────────────────────────────────── */}

        {/* Account button */}
        <button
          onClick={() => {/* placeholder */}}
          className="activity-bar-item relative flex items-center justify-center"
          style={{
            width: 48,
            height: 48,
            color: hoveredView === 'account' ? 'var(--text-secondary)' : 'var(--text-muted)',
            transition: 'color 0.15s ease',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => handleMouseEnter('account', e.currentTarget)}
          onMouseLeave={handleMouseLeave}
        >
          <CircleUser size={20} strokeWidth={1.4} className="activity-bar-icon" />
        </button>

        {/* Settings button */}
        <button
          onClick={() => {
            if (onSettingsClick) {
              onSettingsClick()
            } else {
              window.dispatchEvent(new Event('orion:open-settings'))
            }
          }}
          className="activity-bar-item relative flex items-center justify-center"
          style={{
            width: 48,
            height: 48,
            color: hoveredView === 'settings' ? 'var(--text-secondary)' : 'var(--text-muted)',
            transition: 'color 0.15s ease',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => handleMouseEnter('settings', e.currentTarget)}
          onMouseLeave={handleMouseLeave}
        >
          <Settings size={20} strokeWidth={1.4} className="activity-bar-icon" />
        </button>
      </nav>
    </>
  )
}

export type { PanelView }
