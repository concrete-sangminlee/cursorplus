import { useState, useCallback } from 'react'
import {
  Play,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  MoreHorizontal,
  Settings,
  Square,
  RotateCw,
  StepForward,
  StepBack,
  ArrowDownToLine,
  Bug,
  X,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────── */

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  actions?: React.ReactNode
  children: React.ReactNode
}

/* ── Collapsible Section ───────────────────────────────────────── */

function CollapsibleSection({ title, defaultOpen = false, actions, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '6px 8px',
          background: 'var(--bg-tertiary)',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          cursor: 'pointer',
          gap: 4,
          userSelect: 'none',
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
        {actions && (
          <span
            onClick={(e) => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          >
            {actions}
          </span>
        )}
      </button>
      {open && (
        <div style={{ padding: '4px 0' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Empty State ───────────────────────────────────────────────── */

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '8px 20px',
        color: 'var(--text-muted)',
        fontSize: 12,
        fontStyle: 'italic',
      }}
    >
      {message}
    </div>
  )
}

/* ── Small Icon Button ─────────────────────────────────────────── */

function IconBtn({ icon: Icon, title, onClick, size = 14 }: {
  icon: typeof Plus
  title: string
  onClick?: () => void
  size?: number
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        padding: 2,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
    >
      <Icon size={size} strokeWidth={1.6} />
    </button>
  )
}

/* ── Debug Toolbar ─────────────────────────────────────────────── */

function DebugToolbar() {
  const buttons = [
    { icon: Play, title: 'Continue (F5)', color: 'var(--accent-green, #3fb950)' },
    { icon: StepForward, title: 'Step Over (F10)', color: undefined },
    { icon: ArrowDownToLine, title: 'Step Into (F11)', color: undefined },
    { icon: StepBack, title: 'Step Out (Shift+F11)', color: undefined },
    { icon: RotateCw, title: 'Restart (Ctrl+Shift+F5)', color: undefined },
    { icon: Square, title: 'Stop (Shift+F5)', color: 'var(--accent-red, #f85149)' },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
        opacity: 0.5,
      }}
      title="Not available while not debugging"
    >
      {buttons.map(({ icon: Icon, title, color }, i) => (
        <button
          key={i}
          title={title}
          disabled
          style={{
            background: 'none',
            border: 'none',
            color: color || 'var(--text-muted)',
            cursor: 'not-allowed',
            padding: '3px 4px',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.6,
          }}
        >
          <Icon size={15} strokeWidth={1.6} />
        </button>
      ))}
    </div>
  )
}

/* ── Main Debug Panel ──────────────────────────────────────────── */

const LAUNCH_CONFIGS = ['Node.js', 'Chrome', 'Python', 'Custom...']

export default function DebugPanel() {
  const [selectedConfig, setSelectedConfig] = useState('Node.js')
  const [watchExpression, setWatchExpression] = useState('')
  const [watchExpressions, setWatchExpressions] = useState<string[]>([])
  const [caughtExceptions, setCaughtExceptions] = useState(true)
  const [uncaughtExceptions, setUncaughtExceptions] = useState(true)

  const addWatch = useCallback(() => {
    const expr = watchExpression.trim()
    if (expr && !watchExpressions.includes(expr)) {
      setWatchExpressions((prev) => [...prev, expr])
      setWatchExpression('')
    }
  }, [watchExpression, watchExpressions])

  const removeWatch = useCallback((index: number) => {
    setWatchExpressions((prev) => prev.filter((_, i) => i !== index))
  }, [])

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* ── Panel Header ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Run and Debug
        </span>
        <span style={{ flex: 1 }} />
        <IconBtn icon={Settings} title="Open launch.json" />
        <IconBtn icon={MoreHorizontal} title="More Actions" />
      </div>

      {/* ── Launch Configuration ──────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          gap: 6,
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <select
          value={selectedConfig}
          onChange={(e) => setSelectedConfig(e.target.value)}
          style={{
            flex: 1,
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '4px 8px',
            fontSize: 12,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {LAUNCH_CONFIGS.map((config) => (
            <option key={config} value={config}>{config}</option>
          ))}
        </select>
        <button
          title="Start Debugging (F5)"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            background: 'var(--accent-green, #3fb950)',
            color: '#fff',
            border: 'none',
            borderRadius: 3,
            padding: '4px 10px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <Play size={13} strokeWidth={2} fill="#fff" />
          Start
        </button>
      </div>

      {/* ── Launch.json link ──────────────────────────────────── */}
      <div
        style={{
          padding: '6px 12px 8px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: 'var(--accent-blue, #388bfd)',
            cursor: 'pointer',
            textDecoration: 'none',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
        >
          create a launch.json file
        </span>
      </div>

      {/* ── Debug Toolbar (disabled) ──────────────────────────── */}
      <DebugToolbar />

      {/* ── Scrollable sections ───────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Variables */}
        <CollapsibleSection title="Variables" defaultOpen>
          <EmptyState message="Not available while not debugging" />
          <div style={{ padding: '0 20px' }}>
            {['Local', 'Closure', 'Global'].map((scope) => (
              <div
                key={scope}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 0',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                  cursor: 'default',
                }}
              >
                <ChevronRight size={12} />
                <span>{scope}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>

        {/* Watch */}
        <CollapsibleSection
          title="Watch"
          defaultOpen
          actions={
            <IconBtn icon={Plus} title="Add Expression" onClick={() => {
              const input = document.getElementById('debug-watch-input')
              input?.focus()
            }} />
          }
        >
          <div style={{ padding: '2px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <input
                id="debug-watch-input"
                type="text"
                placeholder="Add expression..."
                value={watchExpression}
                onChange={(e) => setWatchExpression(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addWatch()
                }}
                style={{
                  flex: 1,
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  padding: '3px 6px',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
              <IconBtn icon={Plus} title="Add" onClick={addWatch} />
            </div>
            {watchExpressions.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '2px 0', fontStyle: 'italic' }}>
                No expressions added
              </div>
            ) : (
              watchExpressions.map((expr, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px 0',
                    fontSize: 12,
                    gap: 6,
                  }}
                >
                  <span style={{ color: 'var(--text-secondary)', flex: 1, fontFamily: 'var(--font-mono, monospace)' }}>
                    {expr}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic' }}>
                    not available
                  </span>
                  <IconBtn icon={X} title="Remove" size={12} onClick={() => removeWatch(i)} />
                </div>
              ))
            )}
          </div>
        </CollapsibleSection>

        {/* Call Stack */}
        <CollapsibleSection title="Call Stack" defaultOpen>
          <EmptyState message="Not available while not debugging" />
        </CollapsibleSection>

        {/* Breakpoints */}
        <CollapsibleSection
          title="Breakpoints"
          defaultOpen
          actions={
            <>
              <IconBtn icon={Plus} title="Add Function Breakpoint" />
              <IconBtn icon={Trash2} title="Remove All Breakpoints" />
            </>
          }
        >
          {/* Exception Breakpoints */}
          <div style={{ padding: '2px 12px' }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}
            >
              Exception Breakpoints
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 0',
                fontSize: 12,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={caughtExceptions}
                onChange={(e) => setCaughtExceptions(e.target.checked)}
                style={{ accentColor: 'var(--accent-blue, #388bfd)', cursor: 'pointer' }}
              />
              Caught Exceptions
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 0',
                fontSize: 12,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={uncaughtExceptions}
                onChange={(e) => setUncaughtExceptions(e.target.checked)}
                style={{ accentColor: 'var(--accent-blue, #388bfd)', cursor: 'pointer' }}
              />
              Uncaught Exceptions
            </label>

            {/* Breakpoint list placeholder */}
            <div
              style={{
                marginTop: 8,
                paddingTop: 6,
                borderTop: '1px solid var(--border)',
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic', padding: '2px 0' }}>
                No breakpoints set
              </div>
            </div>

            {/* Add Function Breakpoint button */}
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 6,
                padding: '4px 8px',
                background: 'none',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-tertiary)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <Bug size={12} strokeWidth={1.6} />
              Add Function Breakpoint
            </button>
          </div>
        </CollapsibleSection>
      </div>

      {/* ── Footer hint ───────────────────────────────────────── */}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        Press <kbd style={{
          padding: '1px 4px',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          fontSize: 10,
          fontFamily: 'var(--font-mono, monospace)',
        }}>F5</kbd> to start debugging
      </div>
    </div>
  )
}
