import { useState, useMemo, useCallback, useRef } from 'react'
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2,
  Search, FileText, ChevronRight, ChevronDown,
  Lightbulb, Copy, X,
} from 'lucide-react'
import {
  useProblemsStore,
  getProblemsCount,
  type ProblemSeverity,
  type Problem,
} from '@/store/problems'
import { useEditorStore } from '@/store/editor'

/* ── Severity config ───────────────────────────────────── */

const severityConfig: Record<
  ProblemSeverity,
  { Icon: typeof AlertCircle; color: string; label: string; bgColor: string }
> = {
  error: {
    Icon: AlertCircle,
    color: 'var(--accent-red)',
    label: 'Errors',
    bgColor: 'rgba(248,81,73,0.12)',
  },
  warning: {
    Icon: AlertTriangle,
    color: 'var(--accent-orange)',
    label: 'Warnings',
    bgColor: 'rgba(227,179,65,0.12)',
  },
  info: {
    Icon: Info,
    color: 'var(--accent)',
    label: 'Info',
    bgColor: 'rgba(88,166,255,0.12)',
  },
}

/* ── Source badge colors ───────────────────────────────── */

const sourceBadgeColors: Record<string, { bg: string; fg: string }> = {
  eslint:        { bg: 'rgba(130,80,223,0.15)', fg: '#b392f0' },
  typescript:    { bg: 'rgba(49,120,198,0.15)', fg: '#79b8ff' },
  'todo-scanner':{ bg: 'rgba(227,179,65,0.12)', fg: '#e3b341' },
  'code-quality':{ bg: 'rgba(248,81,73,0.12)',  fg: '#f97583' },
  style:         { bg: 'rgba(88,166,255,0.10)', fg: '#58a6ff' },
}

function getSourceColors(source: string) {
  return sourceBadgeColors[source] || { bg: 'rgba(139,148,158,0.12)', fg: '#8b949e' }
}

/* ── Types ─────────────────────────────────────────────── */

interface FileGroup {
  filePath: string
  fileName: string
  problems: Problem[]
  errorCount: number
  warningCount: number
  infoCount: number
}

/* ── Component ─────────────────────────────────────────── */

export default function ProblemsPanel() {
  const problems = useProblemsStore((s) => s.problems)
  const { openFile } = useEditorStore()

  // Filter toggles
  const [showErrors, setShowErrors] = useState(true)
  const [showWarnings, setShowWarnings] = useState(true)
  const [showInfo, setShowInfo] = useState(true)

  // Search filter
  const [filterText, setFilterText] = useState('')

  // Collapsed file groups
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())

  // Tooltip for copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; problem: Problem
  } | null>(null)

  // Counts from all problems (unfiltered)
  const counts = useMemo(() => getProblemsCount(problems), [problems])

  // Filtered + searched
  const filtered = useMemo(() => {
    const activeSeverities = new Set<ProblemSeverity>()
    if (showErrors) activeSeverities.add('error')
    if (showWarnings) activeSeverities.add('warning')
    if (showInfo) activeSeverities.add('info')

    const lowerFilter = filterText.toLowerCase()

    return problems
      .filter((p) => activeSeverities.has(p.severity))
      .filter((p) => {
        if (!lowerFilter) return true
        const fileName = p.file.replace(/\\/g, '/').split('/').pop() || ''
        return (
          p.message.toLowerCase().includes(lowerFilter) ||
          fileName.toLowerCase().includes(lowerFilter) ||
          p.source.toLowerCase().includes(lowerFilter)
        )
      })
      .sort((a, b) => {
        const fc = a.file.localeCompare(b.file)
        if (fc !== 0) return fc
        const weight: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 }
        const w = weight[a.severity] - weight[b.severity]
        if (w !== 0) return w
        return a.line - b.line
      })
  }, [problems, showErrors, showWarnings, showInfo, filterText])

  // Group by file
  const fileGroups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, Problem[]>()
    for (const p of filtered) {
      const list = map.get(p.file)
      if (list) list.push(p)
      else map.set(p.file, [p])
    }
    return Array.from(map.entries()).map(([filePath, probs]) => ({
      filePath,
      fileName: filePath.replace(/\\/g, '/').split('/').pop() || filePath,
      problems: probs,
      errorCount: probs.filter((p) => p.severity === 'error').length,
      warningCount: probs.filter((p) => p.severity === 'warning').length,
      infoCount: probs.filter((p) => p.severity === 'info').length,
    }))
  }, [filtered])

  // Toggle file group collapse
  const toggleFileGroup = useCallback((filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  // Navigate to file/line on click
  const handleNavigate = useCallback(
    async (filePath: string, line: number) => {
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() || ''
      const editorState = useEditorStore.getState()
      const existing = editorState.openFiles.find((f) => f.path === filePath)

      if (existing) {
        editorState.setActiveFile(filePath)
      } else {
        try {
          const result = await window.api?.readFile(filePath)
          if (result) {
            openFile({
              path: filePath,
              name: fileName,
              content: result.content,
              language: result.language || 'plaintext',
              isModified: false,
              aiModified: false,
            })
          }
        } catch {
          return
        }
      }

      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('orion:go-to-line', { detail: { line } })
        )
      }, 50)
    },
    [openFile]
  )

  // Copy problem text
  const handleCopy = useCallback((problem: Problem) => {
    const text = `${problem.message} [${problem.source}] (${problem.file}:${problem.line})`
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(problem.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, problem: Problem) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, problem })
  }, [])

  // Close context menu on any click
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const hasProblems = problems.length > 0

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      onClick={closeContextMenu}
    >
      {/* ── Toolbar ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {/* Severity toggle buttons */}
        <ToggleBadge
          Icon={AlertCircle}
          count={counts.errors}
          active={showErrors}
          color="var(--accent-red)"
          bgColor="rgba(248,81,73,0.12)"
          onClick={() => setShowErrors((v) => !v)}
          title="Toggle errors"
        />
        <ToggleBadge
          Icon={AlertTriangle}
          count={counts.warnings}
          active={showWarnings}
          color="var(--accent-orange)"
          bgColor="rgba(227,179,65,0.12)"
          onClick={() => setShowWarnings((v) => !v)}
          title="Toggle warnings"
        />
        <ToggleBadge
          Icon={Info}
          count={counts.info}
          active={showInfo}
          color="var(--accent)"
          bgColor="rgba(88,166,255,0.12)"
          onClick={() => setShowInfo((v) => !v)}
          title="Toggle info"
        />

        {/* Filter input */}
        <div
          style={{
            marginLeft: 8,
            flex: 1,
            maxWidth: 280,
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md, 4px)',
            overflow: 'hidden',
          }}
        >
          <Search
            size={11}
            style={{ color: 'var(--text-muted)', margin: '0 6px', flexShrink: 0 }}
          />
          <input
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter (message, file, source)..."
            style={{
              flex: 1,
              padding: '4px 6px 4px 0',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 11,
              color: 'var(--text-primary)',
            }}
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              title="Clear filter"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                marginRight: 4,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                borderRadius: 2,
              }}
            >
              <X size={10} />
            </button>
          )}
        </div>

        {/* Summary counts */}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 11,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span style={{ color: counts.errors > 0 ? 'var(--accent-red)' : 'var(--text-muted)' }}>
            {counts.errors} Error{counts.errors !== 1 ? 's' : ''}
          </span>
          <span style={{ color: counts.warnings > 0 ? 'var(--accent-orange)' : 'var(--text-muted)' }}>
            {counts.warnings} Warning{counts.warnings !== 1 ? 's' : ''}
          </span>
          <span style={{ color: counts.info > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            {counts.info} Info
          </span>
        </div>
      </div>

      {/* ── Problem list ────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          fontSize: 12,
        }}
      >
        {!hasProblems ? (
          /* Empty state */
          <div
            style={{
              height: '100%',
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
                background: 'rgba(63,185,80,0.06)',
                border: '1px solid rgba(63,185,80,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2
                size={18}
                style={{ color: 'var(--accent-green)', opacity: 0.7 }}
              />
            </div>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 500,
                fontFamily: 'var(--font-sans, sans-serif)',
                marginTop: 4,
              }}
            >
              No problems detected
            </p>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: 11,
                opacity: 0.5,
                fontFamily: 'var(--font-sans, sans-serif)',
              }}
            >
              Errors and warnings from your workspace will appear here
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
              fontFamily: 'var(--font-sans, sans-serif)',
            }}
          >
            No problems match the current filters
          </div>
        ) : (
          fileGroups.map((group) => (
            <FileGroupSection
              key={group.filePath}
              group={group}
              collapsed={collapsedFiles.has(group.filePath)}
              onToggle={() => toggleFileGroup(group.filePath)}
              onNavigate={handleNavigate}
              onCopy={handleCopy}
              onContextMenu={handleContextMenu}
              copiedId={copiedId}
            />
          ))
        )}
      </div>

      {/* ── Context menu ──────────────────────────────── */}
      {contextMenu && (
        <ContextMenuOverlay
          x={contextMenu.x}
          y={contextMenu.y}
          problem={contextMenu.problem}
          onCopy={() => {
            handleCopy(contextMenu.problem)
            setContextMenu(null)
          }}
          onNavigate={() => {
            handleNavigate(contextMenu.problem.file, contextMenu.problem.line)
            setContextMenu(null)
          }}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

/* ── File group section ───────────────────────────────── */

function FileGroupSection({
  group,
  collapsed,
  onToggle,
  onNavigate,
  onCopy,
  onContextMenu,
  copiedId,
}: {
  group: FileGroup
  collapsed: boolean
  onToggle: () => void
  onNavigate: (file: string, line: number) => void
  onCopy: (problem: Problem) => void
  onContextMenu: (e: React.MouseEvent, problem: Problem) => void
  copiedId: string | null
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown

  return (
    <div>
      {/* File header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          cursor: 'pointer',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-sans, sans-serif)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-primary)',
          userSelect: 'none',
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--bg-primary)'
        }}
      >
        <Chevron size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <FileText size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.fileName}
        </span>

        {/* Per-file severity counts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {group.errorCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--accent-red)', fontSize: 10 }}>
              <AlertCircle size={10} /> {group.errorCount}
            </span>
          )}
          {group.warningCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--accent-orange)', fontSize: 10 }}>
              <AlertTriangle size={10} /> {group.warningCount}
            </span>
          )}
          {group.infoCount > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--accent)', fontSize: 10 }}>
              <Info size={10} /> {group.infoCount}
            </span>
          )}
          <span
            style={{
              marginLeft: 2,
              padding: '1px 5px',
              borderRadius: 8,
              background: 'rgba(139,148,158,0.12)',
              color: 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            {group.problems.length}
          </span>
        </div>
      </div>

      {/* Problem rows */}
      {!collapsed &&
        group.problems.map((problem, idx) => (
          <ProblemRow
            key={problem.id}
            problem={problem}
            index={idx}
            onNavigate={onNavigate}
            onCopy={onCopy}
            onContextMenu={onContextMenu}
            isCopied={copiedId === problem.id}
          />
        ))}
    </div>
  )
}

/* ── Problem row ──────────────────────────────────────── */

function ProblemRow({
  problem,
  index,
  onNavigate,
  onCopy,
  onContextMenu,
  isCopied,
}: {
  problem: Problem
  index: number
  onNavigate: (file: string, line: number) => void
  onCopy: (problem: Problem) => void
  onContextMenu: (e: React.MouseEvent, problem: Problem) => void
  isCopied: boolean
}) {
  const cfg = severityConfig[problem.severity]
  const sourceColors = getSourceColors(problem.source)
  const [hovered, setHovered] = useState(false)

  const isOdd = index % 2 === 1

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onNavigate(problem.file, problem.line)
      }}
      onContextMenu={(e) => onContextMenu(e, problem)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '5px 10px 5px 30px',
        cursor: 'pointer',
        transition: 'background 0.08s',
        background: hovered
          ? 'rgba(255,255,255,0.05)'
          : isOdd
            ? 'rgba(255,255,255,0.015)'
            : 'transparent',
      }}
    >
      {/* Severity icon */}
      <cfg.Icon
        size={13}
        style={{
          color: cfg.color,
          flexShrink: 0,
          marginTop: 2,
        }}
      />

      {/* Message */}
      <span
        style={{
          flex: 1,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          wordBreak: 'break-word',
          fontFamily: 'var(--font-sans, sans-serif)',
          fontSize: 12,
        }}
      >
        {problem.message}
      </span>

      {/* Source badge */}
      <span
        style={{
          flexShrink: 0,
          padding: '1px 6px',
          borderRadius: 3,
          background: sourceColors.bg,
          color: sourceColors.fg,
          fontSize: 10,
          fontFamily: 'var(--font-sans, sans-serif)',
          fontWeight: 500,
          marginTop: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {problem.source}
      </span>

      {/* File:line reference */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
          color: 'var(--text-muted)',
          fontSize: 11,
          fontFamily: 'var(--font-mono, monospace)',
          marginTop: 1,
        }}
      >
        <span style={{ opacity: 0.6 }}>Ln {problem.line}</span>
      </span>

      {/* Action icons (visible on hover) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.12s',
        }}
      >
        {/* Quick fix placeholder */}
        <button
          onClick={(e) => { e.stopPropagation() }}
          title="No quick fixes available"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'default',
            borderRadius: 3,
            opacity: 0.5,
          }}
        >
          <Lightbulb size={12} />
        </button>

        {/* Copy button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCopy(problem)
          }}
          title={isCopied ? 'Copied!' : 'Copy problem text'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            border: 'none',
            background: isCopied ? 'rgba(63,185,80,0.15)' : 'transparent',
            color: isCopied ? 'var(--accent-green)' : 'var(--text-muted)',
            cursor: 'pointer',
            borderRadius: 3,
          }}
          onMouseEnter={(e) => {
            if (!isCopied) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          }}
          onMouseLeave={(e) => {
            if (!isCopied) e.currentTarget.style.background = 'transparent'
          }}
        >
          <Copy size={11} />
        </button>
      </div>
    </div>
  )
}

/* ── Context menu overlay ─────────────────────────────── */

function ContextMenuOverlay({
  x,
  y,
  problem,
  onCopy,
  onNavigate,
  onClose,
}: {
  x: number
  y: number
  problem: Problem
  onCopy: () => void
  onNavigate: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: x,
        top: y,
        zIndex: 9999,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '4px 0',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        minWidth: 180,
        fontFamily: 'var(--font-sans, sans-serif)',
        fontSize: 12,
      }}
    >
      <ContextMenuItem label="Go to Problem" onClick={onNavigate} />
      <ContextMenuItem label="Copy Problem Text" onClick={onCopy} />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      <ContextMenuItem
        label="Quick Fix (not available)"
        onClick={onClose}
        disabled
      />
    </div>
  )
}

function ContextMenuItem({
  label,
  onClick,
  disabled = false,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        padding: '5px 14px',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      {label}
    </div>
  )
}

/* ── Toggle badge button ───────────────────────────────── */

function ToggleBadge({
  Icon,
  count,
  active,
  color,
  bgColor,
  onClick,
  title,
}: {
  Icon: typeof AlertCircle
  count: number
  active: boolean
  color: string
  bgColor: string
  onClick: () => void
  title: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: 22,
        padding: '0 7px',
        borderRadius: 3,
        border: 'none',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 500,
        fontFamily: 'var(--font-mono, monospace)',
        color: active ? color : 'var(--text-muted)',
        background: active ? bgColor : 'transparent',
        opacity: active ? 1 : 0.5,
        transition: 'opacity 0.1s, background 0.1s, color 0.1s',
      }}
    >
      <Icon size={12} />
      {count}
    </button>
  )
}
