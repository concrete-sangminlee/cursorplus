import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2,
  Search, FileText, ChevronRight, ChevronDown,
  Lightbulb, Copy, X, ChevronsDownUp, ChevronsUpDown,
  FileCode2, Check,
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
  eslint:           { bg: 'rgba(130,80,223,0.15)', fg: '#b392f0' },
  typescript:       { bg: 'rgba(49,120,198,0.15)', fg: '#79b8ff' },
  'todo-scanner':   { bg: 'rgba(227,179,65,0.12)', fg: '#e3b341' },
  'code-quality':   { bg: 'rgba(248,81,73,0.12)',  fg: '#f97583' },
  style:            { bg: 'rgba(88,166,255,0.10)', fg: '#58a6ff' },
  'bracket-matcher':{ bg: 'rgba(248,81,73,0.12)',  fg: '#f97583' },
  imports:          { bg: 'rgba(227,179,65,0.12)', fg: '#e3b341' },
}

function getSourceColors(source: string) {
  return sourceBadgeColors[source] || { bg: 'rgba(139,148,158,0.12)', fg: '#8b949e' }
}

/* ── File extension to icon color mapping ─────────────── */

function getFileIconColor(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    ts: '#3178c6', tsx: '#3178c6', js: '#f1e05a', jsx: '#f1e05a',
    css: '#563d7c', scss: '#c6538c', html: '#e34c26', json: '#292929',
    md: '#083fa1', py: '#3572a5', rs: '#dea584', go: '#00add8',
    vue: '#41b883', svelte: '#ff3e00',
  }
  return map[ext] || 'var(--text-muted)'
}

/* ── Types ─────────────────────────────────────────────── */

interface FileGroup {
  filePath: string
  fileName: string
  dirPath: string
  problems: Problem[]
  errorCount: number
  warningCount: number
  infoCount: number
}

/* ── Component ─────────────────────────────────────────── */

export default function ProblemsPanel() {
  const problems = useProblemsStore((s) => s.problems)
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const { openFile } = useEditorStore()

  // Filter toggles
  const [showErrors, setShowErrors] = useState(true)
  const [showWarnings, setShowWarnings] = useState(true)
  const [showInfo, setShowInfo] = useState(true)

  // Search filter
  const [filterText, setFilterText] = useState('')

  // Current file only toggle
  const [currentFileOnly, setCurrentFileOnly] = useState(false)

  // Collapsed file groups
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())

  // Tooltip for copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; problem: Problem
  } | null>(null)

  // Auto-refresh marker for forcing re-render on markers-changed events
  const [, setMarkerTick] = useState(0)

  useEffect(() => {
    const handler = () => setMarkerTick((t) => t + 1)
    window.addEventListener('orion:markers-changed', handler)
    return () => window.removeEventListener('orion:markers-changed', handler)
  }, [])

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
        if (currentFileOnly && activeFilePath && p.file !== activeFilePath) return false
        return true
      })
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
  }, [problems, showErrors, showWarnings, showInfo, filterText, currentFileOnly, activeFilePath])

  // Group by file
  const fileGroups = useMemo<FileGroup[]>(() => {
    const map = new Map<string, Problem[]>()
    for (const p of filtered) {
      const list = map.get(p.file)
      if (list) list.push(p)
      else map.set(p.file, [p])
    }
    return Array.from(map.entries()).map(([filePath, probs]) => {
      const normalized = filePath.replace(/\\/g, '/')
      const parts = normalized.split('/')
      const fileName = parts.pop() || filePath
      const dirPath = parts.length > 2 ? '.../' + parts.slice(-2).join('/') : parts.join('/')
      return {
        filePath,
        fileName,
        dirPath,
        problems: probs,
        errorCount: probs.filter((p) => p.severity === 'error').length,
        warningCount: probs.filter((p) => p.severity === 'warning').length,
        infoCount: probs.filter((p) => p.severity === 'info').length,
      }
    })
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

  // Collapse all
  const collapseAll = useCallback(() => {
    setCollapsedFiles(new Set(fileGroups.map((g) => g.filePath)))
  }, [fileGroups])

  // Expand all
  const expandAll = useCallback(() => {
    setCollapsedFiles(new Set())
  }, [])

  // Navigate to file/line on click
  const handleNavigate = useCallback(
    async (filePath: string, line: number, column?: number) => {
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
          new CustomEvent('orion:go-to-line', { detail: { line, column: column || 1 } })
        )
      }, 50)
    },
    [openFile]
  )

  // Copy problem text
  const handleCopy = useCallback((problem: Problem) => {
    const col = problem.column ? `:${problem.column}` : ''
    const text = `${problem.message} [${problem.source}] (${problem.file}:${problem.line}${col})`
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(problem.id)
      setTimeout(() => setCopiedId(null), 1500)
    })
  }, [])

  // Apply quick fix
  const handleQuickFix = useCallback((problem: Problem) => {
    if (!problem.quickFix) return
    window.dispatchEvent(
      new CustomEvent('orion:apply-quick-fix', {
        detail: {
          file: problem.file,
          line: problem.line,
          column: problem.column,
          fix: problem.quickFix,
          problemId: problem.id,
        },
      })
    )
  }, [])

  // Context menu handler
  const handleContextMenu = useCallback((e: React.MouseEvent, problem: Problem) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, problem })
  }, [])

  // Close context menu on any click
  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const hasProblems = problems.length > 0
  const allCollapsed = fileGroups.length > 0 && fileGroups.every((g) => collapsedFiles.has(g.filePath))

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
          gap: 4,
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          minHeight: 30,
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

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {/* Filter input */}
        <div
          style={{
            flex: 1,
            maxWidth: 260,
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
              padding: '3px 6px 3px 0',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 11,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans, sans-serif)',
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

        <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px', flexShrink: 0 }} />

        {/* Current file only toggle */}
        <ToolbarButton
          Icon={FileCode2}
          active={currentFileOnly}
          onClick={() => setCurrentFileOnly((v) => !v)}
          title={currentFileOnly ? 'Show all files' : 'Show current file only'}
        />

        {/* Collapse / Expand all */}
        <ToolbarButton
          Icon={allCollapsed ? ChevronsUpDown : ChevronsDownUp}
          active={false}
          onClick={allCollapsed ? expandAll : collapseAll}
          title={allCollapsed ? 'Expand all' : 'Collapse all'}
        />
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
              onQuickFix={handleQuickFix}
              onContextMenu={handleContextMenu}
              copiedId={copiedId}
            />
          ))
        )}
      </div>

      {/* ── Summary bar ────────────────────────────────── */}
      {hasProblems && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '4px 10px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-primary)',
            flexShrink: 0,
            minHeight: 26,
            fontSize: 11,
            fontFamily: 'var(--font-sans, sans-serif)',
          }}
        >
          <SummaryBadge
            Icon={AlertCircle}
            label="Errors"
            count={counts.errors}
            color="var(--accent-red)"
            bgColor="rgba(248,81,73,0.12)"
          />
          <SummaryBadge
            Icon={AlertTriangle}
            label="Warnings"
            count={counts.warnings}
            color="var(--accent-orange)"
            bgColor="rgba(227,179,65,0.12)"
          />
          <SummaryBadge
            Icon={Info}
            label="Info"
            count={counts.info}
            color="var(--accent)"
            bgColor="rgba(88,166,255,0.12)"
          />
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 10 }}>
            {filtered.length} shown{currentFileOnly ? ' (current file)' : ''}
          </span>
        </div>
      )}

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
            handleNavigate(contextMenu.problem.file, contextMenu.problem.line, contextMenu.problem.column)
            setContextMenu(null)
          }}
          onQuickFix={
            contextMenu.problem.quickFix
              ? () => {
                  handleQuickFix(contextMenu.problem)
                  setContextMenu(null)
                }
              : undefined
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

/* ── Summary badge ─────────────────────────────────────── */

function SummaryBadge({
  Icon,
  label,
  count,
  color,
  bgColor,
}: {
  Icon: typeof AlertCircle
  label: string
  count: number
  color: string
  bgColor: string
}) {
  const isActive = count > 0
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '1px 8px 1px 5px',
        borderRadius: 10,
        background: isActive ? bgColor : 'transparent',
        color: isActive ? color : 'var(--text-muted)',
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        transition: 'all 0.15s',
      }}
    >
      <Icon size={11} />
      <span>{label}:</span>
      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>{count}</span>
    </span>
  )
}

/* ── Toolbar icon button ──────────────────────────────── */

function ToolbarButton({
  Icon,
  active,
  onClick,
  title,
}: {
  Icon: typeof AlertCircle
  active: boolean
  onClick: () => void
  title: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 22,
        border: 'none',
        borderRadius: 3,
        cursor: 'pointer',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        background: active
          ? 'rgba(88,166,255,0.12)'
          : hovered
            ? 'rgba(255,255,255,0.06)'
            : 'transparent',
        transition: 'background 0.1s, color 0.1s',
        flexShrink: 0,
      }}
    >
      <Icon size={14} />
    </button>
  )
}

/* ── File group section ───────────────────────────────── */

function FileGroupSection({
  group,
  collapsed,
  onToggle,
  onNavigate,
  onCopy,
  onQuickFix,
  onContextMenu,
  copiedId,
}: {
  group: FileGroup
  collapsed: boolean
  onToggle: () => void
  onNavigate: (file: string, line: number, column?: number) => void
  onCopy: (problem: Problem) => void
  onQuickFix: (problem: Problem) => void
  onContextMenu: (e: React.MouseEvent, problem: Problem) => void
  copiedId: string | null
}) {
  const Chevron = collapsed ? ChevronRight : ChevronDown
  const [headerHovered, setHeaderHovered] = useState(false)
  const fileIconColor = getFileIconColor(group.fileName)

  return (
    <div>
      {/* File header */}
      <div
        onClick={onToggle}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 10px',
          cursor: 'pointer',
          background: headerHovered ? 'rgba(255,255,255,0.04)' : 'var(--bg-primary)',
          borderBottom: '1px solid var(--border)',
          fontFamily: 'var(--font-sans, sans-serif)',
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-primary)',
          userSelect: 'none',
          position: 'sticky',
          top: 0,
          zIndex: 1,
          transition: 'background 0.08s',
        }}
      >
        <Chevron size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <FileText size={12} style={{ color: fileIconColor, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.fileName}
        </span>
        {group.dirPath && (
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: 10,
              fontWeight: 400,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              opacity: 0.7,
              marginLeft: 2,
            }}
          >
            {group.dirPath}
          </span>
        )}

        <div style={{ flex: 1 }} />

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
            onQuickFix={onQuickFix}
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
  onQuickFix,
  onContextMenu,
  isCopied,
}: {
  problem: Problem
  index: number
  onNavigate: (file: string, line: number, column?: number) => void
  onCopy: (problem: Problem) => void
  onQuickFix: (problem: Problem) => void
  onContextMenu: (e: React.MouseEvent, problem: Problem) => void
  isCopied: boolean
}) {
  const cfg = severityConfig[problem.severity]
  const sourceColors = getSourceColors(problem.source)
  const [hovered, setHovered] = useState(false)
  const hasQuickFix = !!problem.quickFix

  const isOdd = index % 2 === 1

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onNavigate(problem.file, problem.line, problem.column)
      }}
      onContextMenu={(e) => onContextMenu(e, problem)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: '4px 10px 4px 30px',
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

      {/* Message + source */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <span
          style={{
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            wordBreak: 'break-word',
            fontFamily: 'var(--font-sans, sans-serif)',
            fontSize: 12,
          }}
        >
          {problem.message}
        </span>
        <span
          style={{
            marginLeft: 6,
            padding: '0px 5px',
            borderRadius: 3,
            background: sourceColors.bg,
            color: sourceColors.fg,
            fontSize: 10,
            fontFamily: 'var(--font-sans, sans-serif)',
            fontWeight: 500,
            whiteSpace: 'nowrap',
            verticalAlign: 'middle',
          }}
        >
          {problem.source}
        </span>
      </div>

      {/* File:line:column reference */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexShrink: 0,
          color: 'var(--text-muted)',
          fontSize: 10,
          fontFamily: 'var(--font-mono, monospace)',
          marginTop: 2,
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ opacity: 0.6 }}>
          Ln {problem.line}
          {problem.column != null && `, Col ${problem.column}`}
        </span>
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
        {/* Quick fix button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (hasQuickFix) onQuickFix(problem)
          }}
          title={hasQuickFix ? `Quick fix: ${problem.quickFix}` : 'No quick fixes available'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            border: 'none',
            background: hasQuickFix ? 'rgba(227,179,65,0.12)' : 'transparent',
            color: hasQuickFix ? 'var(--accent-orange)' : 'var(--text-muted)',
            cursor: hasQuickFix ? 'pointer' : 'default',
            borderRadius: 3,
            opacity: hasQuickFix ? 1 : 0.4,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => {
            if (hasQuickFix) e.currentTarget.style.background = 'rgba(227,179,65,0.22)'
          }}
          onMouseLeave={(e) => {
            if (hasQuickFix) e.currentTarget.style.background = 'rgba(227,179,65,0.12)'
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
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => {
            if (!isCopied) e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
          }}
          onMouseLeave={(e) => {
            if (!isCopied) e.currentTarget.style.background = isCopied ? 'rgba(63,185,80,0.15)' : 'transparent'
          }}
        >
          {isCopied ? <Check size={11} /> : <Copy size={11} />}
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
  onQuickFix,
  onClose,
}: {
  x: number
  y: number
  problem: Problem
  onCopy: () => void
  onNavigate: () => void
  onQuickFix?: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Adjust menu position to stay within viewport
  const [adjustedPos, setAdjustedPos] = useState({ x, y })

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      let newX = x
      let newY = y
      if (x + rect.width > window.innerWidth) newX = window.innerWidth - rect.width - 4
      if (y + rect.height > window.innerHeight) newY = window.innerHeight - rect.height - 4
      if (newX < 0) newX = 4
      if (newY < 0) newY = 4
      if (newX !== x || newY !== y) setAdjustedPos({ x: newX, y: newY })
    }
  }, [x, y])

  return (
    <div
      ref={menuRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: adjustedPos.x,
        top: adjustedPos.y,
        zIndex: 9999,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '4px 0',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        minWidth: 200,
        fontFamily: 'var(--font-sans, sans-serif)',
        fontSize: 12,
      }}
    >
      <ContextMenuItem
        icon={<ChevronRight size={12} />}
        label="Go to Problem"
        shortcut="Enter"
        onClick={onNavigate}
      />
      <ContextMenuItem
        icon={<Copy size={12} />}
        label="Copy Problem Text"
        shortcut="Ctrl+C"
        onClick={onCopy}
      />
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {onQuickFix ? (
        <ContextMenuItem
          icon={<Lightbulb size={12} style={{ color: 'var(--accent-orange)' }} />}
          label="Apply Quick Fix"
          onClick={onQuickFix}
        />
      ) : (
        <ContextMenuItem
          icon={<Lightbulb size={12} />}
          label="No Quick Fix Available"
          onClick={onClose}
          disabled
        />
      )}
    </div>
  )
}

function ContextMenuItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled = false,
}: {
  icon?: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
        background: hovered && !disabled ? 'rgba(255,255,255,0.06)' : 'transparent',
        transition: 'background 0.08s',
      }}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--text-muted)' }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.6, flexShrink: 0 }}>
          {shortcut}
        </span>
      )}
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
