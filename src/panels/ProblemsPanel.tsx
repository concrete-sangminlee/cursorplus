import { useState, useMemo, useCallback } from 'react'
import {
  AlertCircle, AlertTriangle, Info, CheckCircle2,
  Search, FileText,
} from 'lucide-react'
import { useProblemsStore, type ProblemSeverity } from '@/store/problems'
import { useEditorStore } from '@/store/editor'

/* ── Severity config ───────────────────────────────────── */

const severityConfig: Record<
  ProblemSeverity,
  { Icon: typeof AlertCircle; color: string; label: string }
> = {
  error:   { Icon: AlertCircle,    color: 'var(--accent-red)',    label: 'Errors' },
  warning: { Icon: AlertTriangle,  color: 'var(--accent-orange)', label: 'Warnings' },
  info:    { Icon: Info,           color: 'var(--accent)',        label: 'Info' },
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

  // Counts
  const errorCount   = useMemo(() => problems.filter((p) => p.severity === 'error').length, [problems])
  const warningCount = useMemo(() => problems.filter((p) => p.severity === 'warning').length, [problems])
  const infoCount    = useMemo(() => problems.filter((p) => p.severity === 'info').length, [problems])

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
          fileName.toLowerCase().includes(lowerFilter)
        )
      })
      .sort((a, b) => {
        // Sort by severity weight (errors first) then by file, then by line
        const weight: Record<ProblemSeverity, number> = { error: 0, warning: 1, info: 2 }
        const w = weight[a.severity] - weight[b.severity]
        if (w !== 0) return w
        const fc = a.file.localeCompare(b.file)
        if (fc !== 0) return fc
        return a.line - b.line
      })
  }, [problems, showErrors, showWarnings, showInfo, filterText])

  // Navigate to file/line on click
  const handleNavigate = useCallback(
    async (filePath: string, line: number) => {
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() || ''

      // Check if already open in editor
      const editorState = useEditorStore.getState()
      const existing = editorState.openFiles.find((f) => f.path === filePath)

      if (existing) {
        editorState.setActiveFile(filePath)
      } else {
        // Try to read and open the file
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
          // File may not be accessible
          return
        }
      }

      // Navigate to line
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('orion:go-to-line', { detail: { line } })
        )
      }, 50)
    },
    [openFile]
  )

  const hasProblems = problems.length > 0

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
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
          count={errorCount}
          active={showErrors}
          color="var(--accent-red)"
          bgColor="rgba(248,81,73,0.12)"
          onClick={() => setShowErrors((v) => !v)}
          title="Toggle errors"
        />
        <ToggleBadge
          Icon={AlertTriangle}
          count={warningCount}
          active={showWarnings}
          color="var(--accent-orange)"
          bgColor="rgba(227,179,65,0.12)"
          onClick={() => setShowWarnings((v) => !v)}
          title="Toggle warnings"
        />
        <ToggleBadge
          Icon={Info}
          count={infoCount}
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
            placeholder="Filter problems..."
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
        </div>

        {/* Summary */}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            color: 'var(--text-muted)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {errorCount} error{errorCount !== 1 ? 's' : ''},{' '}
          {warningCount} warning{warningCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Problem list ────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          fontFamily: 'var(--font-mono, monospace)',
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
          filtered.map((problem) => {
            const cfg = severityConfig[problem.severity]
            const fileName =
              problem.file.replace(/\\/g, '/').split('/').pop() || ''

            return (
              <div
                key={problem.id}
                onClick={() => handleNavigate(problem.file, problem.line)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  padding: '5px 10px',
                  cursor: 'pointer',
                  transition: 'background 0.08s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
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
                  }}
                >
                  {problem.message}
                </span>

                {/* File + line */}
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 1,
                  }}
                >
                  <FileText size={11} style={{ opacity: 0.5 }} />
                  <span>{fileName}</span>
                  <span style={{ opacity: 0.4 }}>:</span>
                  <span>{problem.line}</span>
                </span>
              </div>
            )
          })
        )}
      </div>
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
