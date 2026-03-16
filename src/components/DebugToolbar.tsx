/**
 * DebugToolbar.tsx
 *
 * Comprehensive debug UI for Orion IDE, modelled after VS Code's debugger.
 * Includes: floating toolbar, variables panel, watch panel, call stack panel,
 * and breakpoints panel.  All state is driven by the debugAdapter store.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useDebugAdapterStore } from '@/store/debugAdapter'
import type {
  DebugSession,
  DebugState,
  DebugAction,
  DebugThread,
  StackFrame,
  Scope,
  Variable,
  Breakpoint,
  BreakpointType,
  WatchExpression,
} from '@/store/debugAdapter'
import {
  Play,
  Pause,
  SkipForward,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCcw,
  Square,
  Flame,
  ChevronDown,
  ChevronRight,
  X,
  Plus,
  Trash2,
  Edit3,
  Search,
  Copy,
  Eye,
  EyeOff,
  Check,
  Circle,
  CircleDot,
  FileCode,
  Bug,
  GripHorizontal,
  RefreshCw,
  Filter,
  MoreHorizontal,
  AlertCircle,
  MessageSquare,
  Hash,
  Braces,
  type LucideIcon,
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════
   CSS animation injection
   ═══════════════════════════════════════════════════════════ */

const STYLE_ID = 'debug-toolbar-animations'
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes dbg-fade-in {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes dbg-slide-in {
      from { opacity: 0; transform: translateX(-8px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes dbg-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.5; }
    }
    @keyframes dbg-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    @keyframes dbg-highlight {
      from { background: var(--accent-alpha, rgba(0,120,212,0.15)); }
      to   { background: transparent; }
    }
    .dbg-toolbar-enter { animation: dbg-fade-in 0.2s ease-out; }
    .dbg-row-enter     { animation: dbg-slide-in 0.15s ease-out; }
    .dbg-pulse         { animation: dbg-pulse 1.5s ease-in-out infinite; }
    .dbg-spin          { animation: dbg-spin 1s linear infinite; }
    .dbg-highlight     { animation: dbg-highlight 0.8s ease-out; }
  `
  document.head.appendChild(style)
}

/* ═══════════════════════════════════════════════════════════
   Shared style constants
   ═══════════════════════════════════════════════════════════ */

const colors = {
  bg:            'var(--panel-bg, #1e1e1e)',
  bgElevated:    'var(--panel-bg-elevated, #252526)',
  bgHover:       'var(--list-hover-bg, #2a2d2e)',
  bgActive:      'var(--list-active-bg, #37373d)',
  bgSelection:   'var(--list-active-selection-bg, #094771)',
  border:        'var(--border-color, #3c3c3c)',
  borderFocused: 'var(--focus-border, #007fd4)',
  text:          'var(--text-normal, #cccccc)',
  textMuted:     'var(--text-muted, #858585)',
  textBright:    'var(--text-bright, #e8e8e8)',
  accent:        'var(--accent, #007acc)',
  accentGreen:   'var(--accent-green, #89d185)',
  accentOrange:  'var(--accent-orange, #d29922)',
  accentRed:     'var(--accent-red, #f44747)',
  accentPurple:  'var(--accent-purple, #bc8cff)',
  accentYellow:  'var(--accent-yellow, #e2c08d)',
  debugBar:      'var(--debug-toolbar-bg, #cc6633)',
  debugBarHover: 'var(--debug-toolbar-hover, #dd7744)',
  scrollbar:     'var(--scrollbar-thumb, rgba(121,121,121,0.4))',
} as const

const fontSize = {
  xs: '11px',
  sm: '12px',
  md: '13px',
} as const

/* ═══════════════════════════════════════════════════════════
   Shared micro-components
   ═══════════════════════════════════════════════════════════ */

interface IconBtnProps {
  icon: LucideIcon
  onClick?: () => void
  title?: string
  disabled?: boolean
  size?: number
  color?: string
  active?: boolean
  danger?: boolean
  style?: CSSProperties
}

function IconBtn({
  icon: Icon,
  onClick,
  title,
  disabled,
  size = 16,
  color,
  active,
  danger,
  style,
}: IconBtnProps) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size + 10,
        height: size + 10,
        border: 'none',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.35 : 1,
        background: active
          ? colors.bgActive
          : hovered && !disabled
            ? colors.bgHover
            : 'transparent',
        color: danger
          ? colors.accentRed
          : color ?? colors.text,
        padding: 0,
        transition: 'background 0.1s, opacity 0.1s',
        ...style,
      }}
    >
      <Icon size={size} />
    </button>
  )
}

/** Collapsible section header used across all debug panels. */
function SectionHeader({
  title,
  expanded,
  onToggle,
  count,
  actions,
  badge,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  count?: number
  actions?: ReactNode
  badge?: ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 22,
        padding: '0 4px 0 2px',
        cursor: 'pointer',
        userSelect: 'none',
        fontWeight: 600,
        fontSize: fontSize.xs,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        color: colors.textBright,
        background: hovered ? colors.bgHover : colors.bgElevated,
        borderBottom: `1px solid ${colors.border}`,
        transition: 'background 0.1s',
        flexShrink: 0,
      }}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      <span style={{ marginLeft: 2, flex: 1 }}>{title}</span>
      {badge}
      {count !== undefined && (
        <span
          style={{
            fontSize: '10px',
            color: colors.textMuted,
            marginRight: 4,
            background: colors.bgActive,
            borderRadius: 8,
            padding: '0 5px',
            lineHeight: '16px',
          }}
        >
          {count}
        </span>
      )}
      {actions && (
        <span
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          {actions}
        </span>
      )}
    </div>
  )
}

/** Scrollable container with thin custom scrollbar. */
function ScrollArea({
  children,
  maxHeight,
  style,
}: {
  children: ReactNode
  maxHeight?: number | string
  style?: CSSProperties
}) {
  return (
    <div
      style={{
        overflowY: 'auto',
        overflowX: 'hidden',
        maxHeight: maxHeight ?? 'none',
        scrollbarWidth: 'thin',
        scrollbarColor: `${colors.scrollbar} transparent`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/** Simple text input with standard styling. */
function TextInput({
  value,
  onChange,
  onKeyDown,
  onBlur,
  placeholder,
  autoFocus,
  style,
}: {
  value: string
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent) => void
  onBlur?: () => void
  placeholder?: string
  autoFocus?: boolean
  style?: CSSProperties
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
      style={{
        width: '100%',
        height: 22,
        padding: '0 6px',
        fontSize: fontSize.sm,
        fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", monospace)',
        color: colors.text,
        background: 'var(--input-bg, #3c3c3c)',
        border: `1px solid ${colors.border}`,
        borderRadius: 2,
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = colors.borderFocused
      }}
      onBlurCapture={(e) => {
        e.currentTarget.style.borderColor = colors.border
      }}
    />
  )
}

/** Empty state placeholder. */
function EmptyState({ text, icon: Icon }: { text: string; icon?: LucideIcon }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 12px',
        gap: 6,
        color: colors.textMuted,
        fontSize: fontSize.sm,
        textAlign: 'center',
      }}
    >
      {Icon && <Icon size={24} strokeWidth={1.2} />}
      <span>{text}</span>
    </div>
  )
}

/** Helper: shorten file paths for display. */
function shortenPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return parts.join('/')
  return `.../${parts.slice(-2).join('/')}`
}

/** Helper: get filename from path. */
function fileName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

/** Type-based color for variable values. */
function typeColor(type: string | undefined): string {
  if (!type) return colors.text
  const t = type.toLowerCase()
  if (t === 'string') return 'var(--syntax-string, #ce9178)'
  if (t === 'number' || t === 'int' || t === 'float' || t === 'double') return 'var(--syntax-number, #b5cea8)'
  if (t === 'boolean' || t === 'bool') return 'var(--syntax-keyword, #569cd6)'
  if (t === 'null' || t === 'undefined' || t === 'none') return colors.textMuted
  if (t.includes('function') || t.includes('method')) return 'var(--syntax-function, #dcdcaa)'
  if (t.includes('array') || t.includes('list')) return colors.accentPurple
  if (t.includes('object') || t.includes('class') || t.includes('dict') || t.includes('map'))
    return colors.accentOrange
  return colors.text
}

/** Type-based icon for variables. */
function typeIcon(type: string | undefined): LucideIcon {
  if (!type) return Circle
  const t = type.toLowerCase()
  if (t === 'string') return MessageSquare
  if (t === 'number' || t === 'int' || t === 'float') return Hash
  if (t === 'boolean' || t === 'bool') return CircleDot
  if (t.includes('function') || t.includes('method')) return Play
  if (t.includes('array') || t.includes('list') || t.includes('object') || t.includes('map'))
    return Braces
  return Circle
}

/* ═══════════════════════════════════════════════════════════
   1. FLOATING DEBUG TOOLBAR
   ═══════════════════════════════════════════════════════════ */

interface ToolbarButtonDef {
  action: DebugAction | 'hotReload'
  icon: LucideIcon
  label: string
  enabledStates: DebugState[]
  color?: string
}

const TOOLBAR_BUTTONS: ToolbarButtonDef[] = [
  { action: 'continue', icon: Play,            label: 'Continue (F5)',           enabledStates: ['paused'] },
  { action: 'pause',    icon: Pause,           label: 'Pause (F6)',             enabledStates: ['running'] },
  { action: 'stepOver', icon: SkipForward,     label: 'Step Over (F10)',        enabledStates: ['paused'] },
  { action: 'stepInto', icon: ArrowDownToLine, label: 'Step Into (F11)',        enabledStates: ['paused'] },
  { action: 'stepOut',  icon: ArrowUpFromLine, label: 'Step Out (Shift+F11)',   enabledStates: ['paused'] },
  { action: 'restart',  icon: RotateCcw,       label: 'Restart (Ctrl+Shift+F5)', enabledStates: ['running', 'paused', 'initializing'] },
  { action: 'stop',     icon: Square,          label: 'Stop (Shift+F5)',        enabledStates: ['running', 'paused', 'initializing'], color: colors.accentRed },
]

const FloatingDebugToolbar = memo(function FloatingDebugToolbar() {
  const sessions = useDebugAdapterStore((s) => s.sessions)
  const activeSessionId = useDebugAdapterStore((s) => s.activeSessionId)
  const performAction = useDebugAdapterStore((s) => s.performAction)
  const setActiveSession = useDebugAdapterStore((s) => s.setActiveSession)
  const restartSession = useDebugAdapterStore((s) => s.restartSession)

  const session = sessions.find((s) => s.id === activeSessionId)

  // Dragging state
  const [position, setPosition] = useState({ x: -1, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [sessionDropdown, setSessionDropdown] = useState(false)

  // Center toolbar on first mount
  useEffect(() => {
    if (position.x < 0 && toolbarRef.current) {
      const w = toolbarRef.current.offsetWidth
      setPosition({ x: Math.max(0, (window.innerWidth - w) / 2), y: 0 })
    }
  }, [position.x, session])

  // Drag handlers
  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      setDragging(true)
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y,
      }
    },
    [position],
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 360, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y)),
      })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  if (!session || session.state === 'inactive' || session.state === 'stopped') return null

  const state = session.state

  const handleAction = (action: DebugAction | 'hotReload') => {
    if (action === 'hotReload') {
      // Hot reload triggers a restart without full stop
      if (activeSessionId) restartSession(activeSessionId)
      return
    }
    performAction(action)
  }

  const stateLabel =
    state === 'initializing'
      ? 'Initializing...'
      : state === 'running'
        ? 'Running'
        : state === 'paused'
          ? 'Paused'
          : state

  const stateColor =
    state === 'running'
      ? colors.accentGreen
      : state === 'paused'
        ? colors.accentOrange
        : colors.textMuted

  return (
    <div
      ref={toolbarRef}
      className="dbg-toolbar-enter"
      onMouseDown={onDragStart}
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x >= 0 ? position.x : '50%',
        transform: position.x < 0 ? 'translateX(-50%)' : undefined,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        height: 30,
        padding: '0 6px',
        gap: 1,
        background: colors.debugBar,
        borderRadius: '0 0 6px 6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        cursor: dragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      {/* Grip handle */}
      <GripHorizontal
        size={14}
        style={{ color: 'rgba(255,255,255,0.5)', marginRight: 4, flexShrink: 0 }}
      />

      {/* Session selector (when multiple sessions) */}
      {sessions.length > 1 && (
        <div style={{ position: 'relative', marginRight: 4 }}>
          <button
            onClick={() => setSessionDropdown(!sessionDropdown)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              padding: '2px 6px',
              fontSize: fontSize.xs,
              color: '#fff',
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              borderRadius: 3,
              cursor: 'pointer',
              maxWidth: 140,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {session.name}
            </span>
            <ChevronDown size={10} />
          </button>
          {sessionDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 2,
                minWidth: 180,
                background: colors.bgElevated,
                border: `1px solid ${colors.border}`,
                borderRadius: 4,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                zIndex: 1,
                overflow: 'hidden',
              }}
            >
              {sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => {
                    setActiveSession(s.id)
                    setSessionDropdown(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    fontSize: fontSize.sm,
                    color: s.id === activeSessionId ? colors.textBright : colors.text,
                    background: s.id === activeSessionId ? colors.bgSelection : 'transparent',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    if (s.id !== activeSessionId)
                      e.currentTarget.style.background = colors.bgHover
                  }}
                  onMouseLeave={(e) => {
                    if (s.id !== activeSessionId)
                      e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Bug size={12} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.name}
                  </span>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background:
                        s.state === 'running'
                          ? colors.accentGreen
                          : s.state === 'paused'
                            ? colors.accentOrange
                            : colors.textMuted,
                      flexShrink: 0,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Session name + state (single session) */}
      {sessions.length <= 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            marginRight: 6,
            fontSize: fontSize.xs,
            color: '#fff',
            maxWidth: 160,
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: stateColor,
              flexShrink: 0,
            }}
            className={state === 'initializing' ? 'dbg-pulse' : undefined}
          />
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {session.name}
          </span>
          <span
            style={{
              fontSize: '10px',
              opacity: 0.7,
              whiteSpace: 'nowrap',
            }}
          >
            {stateLabel}
          </span>
        </div>
      )}

      {/* Separator */}
      <div
        style={{
          width: 1,
          height: 16,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 3px',
          flexShrink: 0,
        }}
      />

      {/* Action buttons */}
      {TOOLBAR_BUTTONS.map((btn) => {
        const enabled = btn.enabledStates.includes(state)
        // Skip continue when running, skip pause when paused
        if (btn.action === 'continue' && state === 'running') return null
        if (btn.action === 'pause' && state !== 'running') return null

        return (
          <ToolbarActionButton
            key={btn.action}
            icon={btn.icon}
            label={btn.label}
            enabled={enabled}
            color={btn.color}
            onClick={() => handleAction(btn.action)}
          />
        )
      })}

      {/* Hot Reload button */}
      <div
        style={{
          width: 1,
          height: 16,
          background: 'rgba(255,255,255,0.2)',
          margin: '0 3px',
          flexShrink: 0,
        }}
      />
      <ToolbarActionButton
        icon={Flame}
        label="Hot Reload"
        enabled={state === 'running' || state === 'paused'}
        color={colors.accentOrange}
        onClick={() => handleAction('hotReload')}
      />
    </div>
  )
})

/** Individual toolbar action button. */
function ToolbarActionButton({
  icon: Icon,
  label,
  enabled,
  color,
  onClick,
}: {
  icon: LucideIcon
  label: string
  enabled: boolean
  color?: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      title={label}
      disabled={!enabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        border: 'none',
        borderRadius: 4,
        cursor: enabled ? 'pointer' : 'default',
        opacity: enabled ? 1 : 0.35,
        background: hovered && enabled ? 'rgba(255,255,255,0.15)' : 'transparent',
        color: color ?? '#ffffff',
        padding: 0,
        transition: 'background 0.1s, opacity 0.1s',
      }}
    >
      <Icon size={15} />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════
   2. VARIABLES PANEL
   ═══════════════════════════════════════════════════════════ */

const VariablesPanel = memo(function VariablesPanel() {
  const sessions = useDebugAdapterStore((s) => s.sessions)
  const activeSessionId = useDebugAdapterStore((s) => s.activeSessionId)
  const expandVariable = useDebugAdapterStore((s) => s.expandVariable)

  const session = sessions.find((s) => s.id === activeSessionId)
  const scopes = session?.scopes ?? []
  const isPaused = session?.state === 'paused'

  const [expandedScopes, setExpandedScopes] = useState<Set<string>>(
    () => new Set(['Local']),
  )
  const [filterText, setFilterText] = useState('')
  const [showFilter, setShowFilter] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Scope display order
  const scopeOrder = ['Local', 'Closure', 'Block', 'Script', 'Global', 'Module']
  const sortedScopes = useMemo(() => {
    return [...scopes].sort((a, b) => {
      const ai = scopeOrder.indexOf(a.name)
      const bi = scopeOrder.indexOf(b.name)
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
    })
  }, [scopes])

  const toggleScope = (name: string) => {
    setExpandedScopes((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const copyValue = useCallback((name: string, value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopiedId(name)
    setTimeout(() => setCopiedId(null), 1500)
  }, [])

  const addToWatch = useCallback((evaluateName?: string) => {
    if (evaluateName) {
      useDebugAdapterStore.getState().addWatch(evaluateName)
    }
  }, [])

  const filterLower = filterText.toLowerCase()

  if (!isPaused) {
    return (
      <div style={{ padding: 0 }}>
        <SectionHeader title="Variables" expanded={true} onToggle={() => {}} />
        <EmptyState text="Not paused" icon={Play} />
      </div>
    )
  }

  return (
    <div>
      <SectionHeader
        title="Variables"
        expanded={true}
        onToggle={() => {}}
        actions={
          <>
            <IconBtn
              icon={showFilter ? X : Filter}
              size={13}
              title={showFilter ? 'Hide filter' : 'Filter variables'}
              onClick={() => setShowFilter(!showFilter)}
            />
            <IconBtn
              icon={RefreshCw}
              size={13}
              title="Refresh variables"
              onClick={() => {
                // Re-request scopes for active frame
                if (session?.id) {
                  window.electron?.invoke('debug:scopes', {
                    sessionId: session.id,
                    frameId: session.activeFrameId,
                  }).catch(() => {})
                }
              }}
            />
          </>
        }
      />

      {showFilter && (
        <div style={{ padding: '4px 6px', borderBottom: `1px solid ${colors.border}` }}>
          <TextInput
            value={filterText}
            onChange={setFilterText}
            placeholder="Filter variables..."
            autoFocus
          />
        </div>
      )}

      <ScrollArea maxHeight={400}>
        {sortedScopes.length === 0 && (
          <EmptyState text="No variables available" />
        )}
        {sortedScopes.map((scope) => (
          <ScopeSection
            key={scope.name}
            scope={scope}
            expanded={expandedScopes.has(scope.name)}
            onToggle={() => toggleScope(scope.name)}
            filterText={filterLower}
            onExpand={expandVariable}
            onCopy={copyValue}
            onAddToWatch={addToWatch}
            copiedId={copiedId}
          />
        ))}
      </ScrollArea>
    </div>
  )
})

/** A single scope (Local, Closure, Global, etc.). */
function ScopeSection({
  scope,
  expanded,
  onToggle,
  filterText,
  onExpand,
  onCopy,
  onAddToWatch,
  copiedId,
}: {
  scope: Scope
  expanded: boolean
  onToggle: () => void
  filterText: string
  onExpand: (ref: number) => void
  onCopy: (name: string, value: string) => void
  onAddToWatch: (name?: string) => void
  copiedId: string | null
}) {
  const filteredVars = useMemo(() => {
    if (!filterText) return scope.variables
    return scope.variables.filter(
      (v) =>
        v.name.toLowerCase().includes(filterText) ||
        v.value.toLowerCase().includes(filterText) ||
        (v.type && v.type.toLowerCase().includes(filterText)),
    )
  }, [scope.variables, filterText])

  const scopeIcon =
    scope.name === 'Local'
      ? colors.accentGreen
      : scope.name === 'Closure'
        ? colors.accentPurple
        : scope.name === 'Global'
          ? colors.accentOrange
          : colors.accent

  return (
    <div>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 4px 2px 6px',
          cursor: 'pointer',
          fontSize: fontSize.sm,
          fontWeight: 600,
          color: colors.textBright,
          borderBottom: `1px solid ${colors.border}`,
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = colors.bgHover
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: scopeIcon,
            flexShrink: 0,
          }}
        />
        <span style={{ flex: 1 }}>{scope.name}</span>
        {scope.expensive && (
          <span
            style={{
              fontSize: '9px',
              color: colors.accentOrange,
              padding: '0 3px',
              border: `1px solid ${colors.accentOrange}`,
              borderRadius: 3,
              lineHeight: '14px',
            }}
          >
            expensive
          </span>
        )}
        <span style={{ fontSize: '10px', color: colors.textMuted }}>
          {scope.variables.length}
        </span>
      </div>

      {expanded && (
        <div style={{ paddingLeft: 4 }}>
          {filteredVars.length === 0 && filterText ? (
            <div style={{ padding: '4px 12px', fontSize: fontSize.xs, color: colors.textMuted }}>
              No matching variables
            </div>
          ) : filteredVars.length === 0 ? (
            <div style={{ padding: '4px 12px', fontSize: fontSize.xs, color: colors.textMuted }}>
              No variables in this scope
            </div>
          ) : (
            filteredVars.map((v) => (
              <VariableRow
                key={`${scope.variablesReference}-${v.name}`}
                variable={v}
                depth={1}
                onExpand={onExpand}
                onCopy={onCopy}
                onAddToWatch={onAddToWatch}
                copiedId={copiedId}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Recursive variable tree row. */
function VariableRow({
  variable,
  depth,
  onExpand,
  onCopy,
  onAddToWatch,
  copiedId,
}: {
  variable: Variable
  depth: number
  onExpand: (ref: number) => void
  onCopy: (name: string, value: string) => void
  onAddToWatch: (name?: string) => void
  copiedId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')

  const handleToggle = () => {
    if (!variable.expandable) return
    if (!expanded && (!variable.children || variable.children.length === 0)) {
      onExpand(variable.variablesReference)
    }
    setExpanded(!expanded)
  }

  const handleStartEdit = () => {
    setEditing(true)
    setEditValue(variable.value)
  }

  const handleCommitEdit = () => {
    setEditing(false)
    if (editValue !== variable.value) {
      const store = useDebugAdapterStore.getState()
      const session = store.getActiveSession()
      if (session?.supportsSetVariable) {
        window.electron?.invoke('debug:setVariable', {
          sessionId: session.id,
          variablesReference: variable.variablesReference,
          name: variable.name,
          value: editValue,
        }).catch(() => {})
      }
    }
  }

  const TIcon = typeIcon(variable.type)
  const vColor = typeColor(variable.type)
  const indent = depth * 16

  const visibility = variable.presentationHint?.visibility
  const visLabel =
    visibility === 'private'
      ? '#'
      : visibility === 'protected'
        ? '*'
        : visibility === 'internal'
          ? '~'
          : ''

  const isStatic = variable.presentationHint?.attributes?.includes('static')
  const isReadOnly = variable.presentationHint?.attributes?.includes('readOnly') ||
    variable.presentationHint?.attributes?.includes('constant')

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 22,
          paddingLeft: indent,
          paddingRight: 4,
          gap: 3,
          fontSize: fontSize.sm,
          fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", monospace)',
          cursor: variable.expandable ? 'pointer' : 'default',
          background: hovered ? colors.bgHover : 'transparent',
          transition: 'background 0.08s',
        }}
        onClick={handleToggle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onDoubleClick={(e) => {
          e.stopPropagation()
          handleStartEdit()
        }}
      >
        {/* Expand arrow */}
        <span style={{ width: 14, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {variable.expandable ? (
            expanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )
          ) : null}
        </span>

        {/* Type icon */}
        <TIcon size={12} style={{ color: vColor, flexShrink: 0 }} />

        {/* Name */}
        <span
          style={{
            color: 'var(--syntax-property, #9cdcfe)',
            whiteSpace: 'nowrap',
            fontStyle: isStatic ? 'italic' : 'normal',
          }}
        >
          {visLabel}{variable.name}
        </span>

        {/* Read-only indicator */}
        {isReadOnly && (
          <span
            style={{
              fontSize: '9px',
              color: colors.textMuted,
              opacity: 0.7,
            }}
          >
            const
          </span>
        )}

        {/* Separator */}
        <span style={{ color: colors.textMuted, flexShrink: 0 }}>:</span>

        {/* Value (editing or display) */}
        {editing ? (
          <span
            style={{ flex: 1, minWidth: 60 }}
            onClick={(e) => e.stopPropagation()}
          >
            <TextInput
              value={editValue}
              onChange={setEditValue}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              onBlur={handleCommitEdit}
              style={{ height: 18, fontSize: fontSize.xs }}
            />
          </span>
        ) : (
          <span
            style={{
              flex: 1,
              color: vColor,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={`${variable.value} (${variable.type || 'unknown'})`}
          >
            {variable.value}
          </span>
        )}

        {/* Type badge */}
        {variable.type && !editing && (
          <span
            style={{
              fontSize: '10px',
              color: colors.textMuted,
              flexShrink: 0,
              maxWidth: 60,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {variable.type}
          </span>
        )}

        {/* Hover actions */}
        {hovered && !editing && (
          <span
            style={{ display: 'flex', gap: 1, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconBtn
              icon={copiedId === variable.name ? Check : Copy}
              size={12}
              title="Copy value"
              onClick={() => onCopy(variable.name, variable.value)}
            />
            <IconBtn
              icon={Eye}
              size={12}
              title="Add to watch"
              onClick={() => onAddToWatch(variable.evaluateName || variable.name)}
            />
            <IconBtn
              icon={Edit3}
              size={12}
              title="Set value"
              onClick={handleStartEdit}
            />
          </span>
        )}
      </div>

      {/* Children */}
      {expanded && variable.children && variable.children.length > 0 && (
        <div>
          {variable.children.map((child) => (
            <VariableRow
              key={`${variable.variablesReference}-${child.name}`}
              variable={child}
              depth={depth + 1}
              onExpand={onExpand}
              onCopy={onCopy}
              onAddToWatch={onAddToWatch}
              copiedId={copiedId}
            />
          ))}
        </div>
      )}

      {expanded && variable.expandable && (!variable.children || variable.children.length === 0) && (
        <div
          style={{
            paddingLeft: indent + 20,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            fontSize: fontSize.xs,
            color: colors.textMuted,
            fontStyle: 'italic',
          }}
        >
          <RefreshCw size={10} className="dbg-spin" style={{ marginRight: 4 }} />
          Loading...
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   3. WATCH PANEL
   ═══════════════════════════════════════════════════════════ */

const WatchPanel = memo(function WatchPanel() {
  const watchExpressions = useDebugAdapterStore((s) => s.watchExpressions)
  const addWatch = useDebugAdapterStore((s) => s.addWatch)
  const removeWatch = useDebugAdapterStore((s) => s.removeWatch)
  const editWatch = useDebugAdapterStore((s) => s.editWatch)
  const refreshWatches = useDebugAdapterStore((s) => s.refreshWatches)
  const isPaused = useDebugAdapterStore((s) => s.isPaused)

  const [expanded, setExpanded] = useState(true)
  const [addingNew, setAddingNew] = useState(false)
  const [newExpression, setNewExpression] = useState('')

  const handleAddWatch = () => {
    const expr = newExpression.trim()
    if (expr) {
      addWatch(expr)
      setNewExpression('')
    }
    setAddingNew(false)
  }

  const handleRemoveAll = () => {
    for (const w of watchExpressions) {
      removeWatch(w.id)
    }
  }

  return (
    <div>
      <SectionHeader
        title="Watch"
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        count={watchExpressions.length}
        actions={
          <>
            <IconBtn
              icon={Plus}
              size={13}
              title="Add Expression"
              onClick={() => {
                setExpanded(true)
                setAddingNew(true)
              }}
            />
            <IconBtn
              icon={RefreshCw}
              size={13}
              title="Refresh All"
              onClick={refreshWatches}
              disabled={!isPaused()}
            />
            <IconBtn
              icon={Trash2}
              size={13}
              title="Remove All Expressions"
              onClick={handleRemoveAll}
              disabled={watchExpressions.length === 0}
            />
          </>
        }
      />

      {expanded && (
        <ScrollArea maxHeight={250}>
          {watchExpressions.map((watch) => (
            <WatchRow
              key={watch.id}
              watch={watch}
              onRemove={() => removeWatch(watch.id)}
              onEdit={(expr) => editWatch(watch.id, expr)}
            />
          ))}

          {addingNew && (
            <div
              className="dbg-row-enter"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '2px 8px 2px 22px',
                gap: 4,
              }}
            >
              <TextInput
                value={newExpression}
                onChange={setNewExpression}
                placeholder="Expression to watch"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddWatch()
                  if (e.key === 'Escape') {
                    setAddingNew(false)
                    setNewExpression('')
                  }
                }}
                onBlur={handleAddWatch}
              />
            </div>
          )}

          {watchExpressions.length === 0 && !addingNew && (
            <EmptyState text="No watch expressions" icon={Eye} />
          )}

          {/* Clickable "add expression" area */}
          {!addingNew && (
            <div
              onClick={() => setAddingNew(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px 4px 22px',
                fontSize: fontSize.xs,
                color: colors.textMuted,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = colors.text
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = colors.textMuted
              }}
            >
              <Plus size={12} />
              <span>Add expression...</span>
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  )
})

/** Single watch expression row. */
function WatchRow({
  watch,
  onRemove,
  onEdit,
}: {
  watch: WatchExpression
  onRemove: () => void
  onEdit: (expr: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(watch.expression)

  const handleCommit = () => {
    setEditing(false)
    const expr = editValue.trim()
    if (expr && expr !== watch.expression) {
      onEdit(expr)
    } else {
      setEditValue(watch.expression)
    }
  }

  const hasError = !!watch.error
  const displayValue = hasError
    ? watch.error
    : watch.value !== undefined
      ? watch.value
      : 'not available'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        minHeight: 22,
        padding: '1px 4px 1px 8px',
        gap: 4,
        fontSize: fontSize.sm,
        fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", monospace)',
        background: hovered ? colors.bgHover : 'transparent',
        transition: 'background 0.08s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => {
        setEditing(true)
        setEditValue(watch.expression)
      }}
    >
      {/* Icon */}
      <Eye size={12} style={{ color: colors.textMuted, flexShrink: 0 }} />

      {editing ? (
        <div style={{ flex: 1 }}>
          <TextInput
            value={editValue}
            onChange={setEditValue}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCommit()
              if (e.key === 'Escape') {
                setEditing(false)
                setEditValue(watch.expression)
              }
            }}
            onBlur={handleCommit}
            style={{ height: 18, fontSize: fontSize.xs }}
          />
        </div>
      ) : (
        <>
          {/* Expression name */}
          <span
            style={{
              color: 'var(--syntax-property, #9cdcfe)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={watch.expression}
          >
            {watch.expression}
          </span>

          <span style={{ color: colors.textMuted, flexShrink: 0 }}>:</span>

          {/* Value */}
          <span
            style={{
              flex: 1,
              color: hasError
                ? colors.accentRed
                : watch.type
                  ? typeColor(watch.type)
                  : colors.textMuted,
              fontStyle: hasError ? 'italic' : 'normal',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={displayValue}
          >
            {displayValue}
          </span>

          {/* Type */}
          {watch.type && !hasError && (
            <span
              style={{
                fontSize: '10px',
                color: colors.textMuted,
                flexShrink: 0,
              }}
            >
              {watch.type}
            </span>
          )}
        </>
      )}

      {/* Actions on hover */}
      {hovered && !editing && (
        <span
          style={{ display: 'flex', gap: 1, flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <IconBtn
            icon={Edit3}
            size={12}
            title="Edit Expression"
            onClick={() => {
              setEditing(true)
              setEditValue(watch.expression)
            }}
          />
          <IconBtn
            icon={Copy}
            size={12}
            title="Copy Value"
            onClick={() => {
              navigator.clipboard.writeText(displayValue ?? '').catch(() => {})
            }}
          />
          <IconBtn
            icon={X}
            size={12}
            title="Remove"
            onClick={onRemove}
            danger
          />
        </span>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   4. CALL STACK PANEL
   ═══════════════════════════════════════════════════════════ */

const CallStackPanel = memo(function CallStackPanel() {
  const sessions = useDebugAdapterStore((s) => s.sessions)
  const activeSessionId = useDebugAdapterStore((s) => s.activeSessionId)
  const setActiveThread = useDebugAdapterStore((s) => s.setActiveThread)
  const setActiveFrame = useDebugAdapterStore((s) => s.setActiveFrame)

  const session = sessions.find((s) => s.id === activeSessionId)
  const threads = session?.threads ?? []
  const activeThreadId = session?.activeThreadId ?? null
  const activeFrameId = session?.activeFrameId ?? null
  const isPaused = session?.state === 'paused'
  const supportsRestartFrame = session?.supportsRestartFrame ?? false

  const [expanded, setExpanded] = useState(true)
  const [threadDropdownOpen, setThreadDropdownOpen] = useState(false)
  const [expandedThreads, setExpandedThreads] = useState<Set<number>>(
    () => new Set(),
  )

  // Auto-expand active thread
  useEffect(() => {
    if (activeThreadId !== null) {
      setExpandedThreads((prev) => {
        const next = new Set(prev)
        next.add(activeThreadId)
        return next
      })
    }
  }, [activeThreadId])

  const activeThread = threads.find((t) => t.id === activeThreadId)

  const toggleThread = (id: number) => {
    setExpandedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleNavigateToFrame = (frame: StackFrame) => {
    setActiveFrame(frame.id)
    // Navigate editor to frame location
    window.electron?.invoke('editor:openFile', {
      filePath: frame.filePath,
      line: frame.line,
      column: frame.column,
    }).catch(() => {})
  }

  const handleRestartFrame = (frame: StackFrame) => {
    if (!session || !supportsRestartFrame) return
    window.electron?.invoke('debug:restartFrame', {
      sessionId: session.id,
      frameId: frame.id,
    }).catch(() => {})
  }

  const totalFrames = threads.reduce(
    (sum, t) => sum + t.stackFrames.length,
    0,
  )

  return (
    <div>
      <SectionHeader
        title="Call Stack"
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        count={totalFrames}
      />

      {expanded && (
        <ScrollArea maxHeight={350}>
          {!isPaused && (
            <EmptyState text="Not paused" icon={Play} />
          )}

          {isPaused && threads.length === 0 && (
            <EmptyState text="No threads available" icon={Bug} />
          )}

          {isPaused && threads.length > 0 && (
            <>
              {/* Thread selector (if multiple) */}
              {threads.length > 1 && (
                <div style={{ padding: '4px 6px', borderBottom: `1px solid ${colors.border}` }}>
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => setThreadDropdownOpen(!threadDropdownOpen)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        padding: '3px 8px',
                        gap: 6,
                        fontSize: fontSize.sm,
                        color: colors.text,
                        background: 'var(--input-bg, #3c3c3c)',
                        border: `1px solid ${colors.border}`,
                        borderRadius: 2,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background:
                            activeThread?.state === 'running'
                              ? colors.accentGreen
                              : activeThread?.state === 'paused'
                                ? colors.accentOrange
                                : colors.textMuted,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {activeThread?.name ?? 'Select thread'}
                      </span>
                      <ChevronDown size={12} />
                    </button>

                    {threadDropdownOpen && (
                      <div
                        style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          marginTop: 2,
                          background: colors.bgElevated,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 4,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                          zIndex: 10,
                          maxHeight: 200,
                          overflowY: 'auto',
                        }}
                      >
                        {threads.map((t) => (
                          <div
                            key={t.id}
                            onClick={() => {
                              setActiveThread(t.id)
                              setThreadDropdownOpen(false)
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '4px 10px',
                              fontSize: fontSize.sm,
                              cursor: 'pointer',
                              color: t.id === activeThreadId ? colors.textBright : colors.text,
                              background: t.id === activeThreadId ? colors.bgSelection : 'transparent',
                            }}
                            onMouseEnter={(e) => {
                              if (t.id !== activeThreadId) e.currentTarget.style.background = colors.bgHover
                            }}
                            onMouseLeave={(e) => {
                              if (t.id !== activeThreadId) e.currentTarget.style.background = 'transparent'
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background:
                                  t.state === 'running'
                                    ? colors.accentGreen
                                    : t.state === 'paused'
                                      ? colors.accentOrange
                                      : colors.textMuted,
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ flex: 1 }}>{t.name}</span>
                            <span style={{ fontSize: '10px', color: colors.textMuted }}>
                              {t.stackFrames.length} frames
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Threads list with frames */}
              {threads.map((thread) => (
                <div key={thread.id}>
                  {/* Thread header (only if multiple) */}
                  {threads.length > 1 && (
                    <div
                      onClick={() => toggleThread(thread.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 6px',
                        fontSize: fontSize.xs,
                        fontWeight: 600,
                        color:
                          thread.id === activeThreadId
                            ? colors.textBright
                            : colors.textMuted,
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.bgHover
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {expandedThreads.has(thread.id) ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background:
                            thread.state === 'running'
                              ? colors.accentGreen
                              : thread.state === 'paused'
                                ? colors.accentOrange
                                : colors.textMuted,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ flex: 1 }}>{thread.name}</span>
                      <span style={{ fontSize: '10px', color: colors.textMuted }}>
                        #{thread.id}
                      </span>
                    </div>
                  )}

                  {/* Stack frames */}
                  {(threads.length === 1 || expandedThreads.has(thread.id)) &&
                    thread.stackFrames.map((frame, idx) => (
                      <StackFrameRow
                        key={frame.id}
                        frame={frame}
                        isActive={frame.id === activeFrameId}
                        isTopFrame={idx === 0}
                        indent={threads.length > 1 ? 16 : 4}
                        onClick={() => handleNavigateToFrame(frame)}
                        onRestart={
                          supportsRestartFrame
                            ? () => handleRestartFrame(frame)
                            : undefined
                        }
                      />
                    ))}
                </div>
              ))}
            </>
          )}
        </ScrollArea>
      )}
    </div>
  )
})

/** A single stack frame row. */
function StackFrameRow({
  frame,
  isActive,
  isTopFrame,
  indent,
  onClick,
  onRestart,
}: {
  frame: StackFrame
  isActive: boolean
  isTopFrame: boolean
  indent: number
  onClick: () => void
  onRestart?: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const hint = frame.presentationHint ?? 'normal'
  const isSubtle = hint === 'subtle'
  const isLabel = hint === 'label'

  return (
    <div
      className={isActive ? 'dbg-highlight' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 22,
        paddingLeft: indent,
        paddingRight: 4,
        gap: 4,
        fontSize: fontSize.sm,
        cursor: isLabel ? 'default' : 'pointer',
        background: isActive
          ? colors.bgSelection
          : hovered
            ? colors.bgHover
            : 'transparent',
        color: isSubtle
          ? colors.textMuted
          : isActive
            ? colors.textBright
            : colors.text,
        opacity: isSubtle ? 0.6 : 1,
        transition: 'background 0.08s',
        borderLeft: isActive
          ? `2px solid ${colors.accent}`
          : '2px solid transparent',
      }}
      onClick={isLabel ? undefined : onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top frame indicator */}
      {isTopFrame && (
        <span
          style={{
            width: 6,
            height: 6,
            background: colors.accentYellow,
            borderRadius: '50%',
            flexShrink: 0,
          }}
        />
      )}

      {/* Frame name */}
      <span
        style={{
          fontWeight: isTopFrame ? 600 : 400,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flexShrink: 1,
          minWidth: 0,
        }}
        title={frame.name}
      >
        {frame.name}
      </span>

      {/* File + line */}
      {frame.source?.path && !isLabel && (
        <span
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            fontSize: fontSize.xs,
            color: colors.textMuted,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <FileCode size={10} />
          <span>{fileName(frame.source.path)}</span>
          <span style={{ color: colors.accentOrange }}>:{frame.line}</span>
        </span>
      )}

      {!frame.source?.path && !isLabel && (
        <span
          style={{
            marginLeft: 'auto',
            fontSize: fontSize.xs,
            color: colors.textMuted,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {shortenPath(frame.filePath)}
          <span style={{ color: colors.accentOrange }}>:{frame.line}</span>
        </span>
      )}

      {/* Restart frame action */}
      {hovered && onRestart && !isLabel && (
        <span onClick={(e) => e.stopPropagation()} style={{ flexShrink: 0 }}>
          <IconBtn
            icon={RotateCcw}
            size={12}
            title="Restart Frame"
            onClick={onRestart}
          />
        </span>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   5. BREAKPOINTS PANEL
   ═══════════════════════════════════════════════════════════ */

const BreakpointsPanel = memo(function BreakpointsPanel() {
  const breakpoints = useDebugAdapterStore((s) => s.breakpoints)
  const toggleBreakpoint = useDebugAdapterStore((s) => s.toggleBreakpoint)
  const removeBreakpoint = useDebugAdapterStore((s) => s.removeBreakpoint)
  const updateBreakpoint = useDebugAdapterStore((s) => s.updateBreakpoint)
  const clearBreakpoints = useDebugAdapterStore((s) => s.clearBreakpoints)
  const enableAllBreakpoints = useDebugAdapterStore((s) => s.enableAllBreakpoints)
  const disableAllBreakpoints = useDebugAdapterStore((s) => s.disableAllBreakpoints)

  const [expanded, setExpanded] = useState(true)
  const [editingCondition, setEditingCondition] = useState<string | null>(null)
  const [conditionDraft, setConditionDraft] = useState('')
  const [showExceptionBps, setShowExceptionBps] = useState(true)

  // Group breakpoints by file
  const groupedByFile = useMemo(() => {
    const map = new Map<string, Breakpoint[]>()
    for (const bp of breakpoints) {
      const existing = map.get(bp.filePath) ?? []
      existing.push(bp)
      map.set(bp.filePath, existing)
    }
    // Sort files alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [breakpoints])

  const enabledCount = breakpoints.filter((b) => b.enabled).length

  const handleNavigateToBreakpoint = (bp: Breakpoint) => {
    window.electron?.invoke('editor:openFile', {
      filePath: bp.filePath,
      line: bp.line,
      column: bp.column ?? 1,
    }).catch(() => {})
  }

  const handleEditCondition = (bp: Breakpoint) => {
    setEditingCondition(bp.id)
    setConditionDraft(bp.condition ?? '')
  }

  const handleSaveCondition = (bpId: string) => {
    updateBreakpoint(bpId, { condition: conditionDraft || undefined })
    setEditingCondition(null)
    setConditionDraft('')
  }

  // Exception breakpoint filters from active session
  const sessions = useDebugAdapterStore((s) => s.sessions)
  const activeSessionId = useDebugAdapterStore((s) => s.activeSessionId)
  const session = sessions.find((s) => s.id === activeSessionId)
  const exceptionFilters = session?.exceptionBreakpointFilters ?? []

  return (
    <div>
      <SectionHeader
        title="Breakpoints"
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        count={breakpoints.length}
        badge={
          enabledCount > 0 ? (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: colors.accentRed,
                marginRight: 4,
                flexShrink: 0,
              }}
            />
          ) : undefined
        }
        actions={
          <>
            <IconBtn
              icon={Check}
              size={13}
              title="Enable All Breakpoints"
              onClick={enableAllBreakpoints}
              disabled={breakpoints.length === 0}
            />
            <IconBtn
              icon={EyeOff}
              size={13}
              title="Disable All Breakpoints"
              onClick={disableAllBreakpoints}
              disabled={breakpoints.length === 0}
            />
            <IconBtn
              icon={Trash2}
              size={13}
              title="Remove All Breakpoints"
              onClick={() => clearBreakpoints()}
              disabled={breakpoints.length === 0}
              danger
            />
          </>
        }
      />

      {expanded && (
        <ScrollArea maxHeight={350}>
          {/* Exception breakpoints section */}
          {exceptionFilters.length > 0 && (
            <div>
              <div
                onClick={() => setShowExceptionBps(!showExceptionBps)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 6px',
                  fontSize: fontSize.xs,
                  fontWeight: 600,
                  color: colors.textMuted,
                  cursor: 'pointer',
                  userSelect: 'none',
                  borderBottom: `1px solid ${colors.border}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.bgHover
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {showExceptionBps ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                <AlertCircle size={11} style={{ color: colors.accentOrange }} />
                <span>Exception Breakpoints</span>
              </div>
              {showExceptionBps &&
                exceptionFilters.map((ef) => (
                  <div
                    key={ef.filter}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '2px 6px 2px 24px',
                      fontSize: fontSize.sm,
                      height: 22,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={ef.enabled}
                      onChange={() => {
                        // Toggle exception breakpoint via store
                        const store = useDebugAdapterStore.getState()
                        if (session) {
                          const updatedFilters = session.exceptionBreakpointFilters.map(
                            (f) =>
                              f.filter === ef.filter
                                ? { ...f, enabled: !f.enabled }
                                : f,
                          )
                          // Update session
                          store.setActiveSession(session.id)
                          window.electron?.invoke('debug:setExceptionBreakpoints', {
                            sessionId: session.id,
                            filters: updatedFilters.filter((f) => f.enabled).map((f) => f.filter),
                          }).catch(() => {})
                        }
                      }}
                      style={{
                        width: 14,
                        height: 14,
                        accentColor: colors.accent,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: ef.enabled ? colors.text : colors.textMuted,
                      }}
                    >
                      {ef.label}
                    </span>
                    {ef.description && (
                      <span
                        style={{
                          fontSize: '10px',
                          color: colors.textMuted,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={ef.description}
                      >
                        {ef.description}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Breakpoints grouped by file */}
          {groupedByFile.map(([filePath, bps]) => (
            <BreakpointFileGroup
              key={filePath}
              filePath={filePath}
              breakpoints={bps}
              onToggle={toggleBreakpoint}
              onRemove={removeBreakpoint}
              onNavigate={handleNavigateToBreakpoint}
              onEditCondition={handleEditCondition}
              editingCondition={editingCondition}
              conditionDraft={conditionDraft}
              onConditionDraftChange={setConditionDraft}
              onSaveCondition={handleSaveCondition}
              onCancelCondition={() => setEditingCondition(null)}
            />
          ))}

          {breakpoints.length === 0 && exceptionFilters.length === 0 && (
            <EmptyState
              text="No breakpoints set. Click in the editor gutter to add one."
              icon={CircleDot}
            />
          )}
        </ScrollArea>
      )}
    </div>
  )
})

/** Breakpoints grouped under a file header. */
function BreakpointFileGroup({
  filePath,
  breakpoints,
  onToggle,
  onRemove,
  onNavigate,
  onEditCondition,
  editingCondition,
  conditionDraft,
  onConditionDraftChange,
  onSaveCondition,
  onCancelCondition,
}: {
  filePath: string
  breakpoints: Breakpoint[]
  onToggle: (id: string) => void
  onRemove: (id: string) => void
  onNavigate: (bp: Breakpoint) => void
  onEditCondition: (bp: Breakpoint) => void
  editingCondition: string | null
  conditionDraft: string
  onConditionDraftChange: (v: string) => void
  onSaveCondition: (id: string) => void
  onCancelCondition: () => void
}) {
  const [fileExpanded, setFileExpanded] = useState(true)

  const sorted = useMemo(
    () => [...breakpoints].sort((a, b) => a.line - b.line),
    [breakpoints],
  )

  return (
    <div>
      {/* File header */}
      <div
        onClick={() => setFileExpanded(!fileExpanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          fontSize: fontSize.xs,
          fontWeight: 600,
          color: colors.textMuted,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = colors.bgHover
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {fileExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <FileCode size={11} />
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={filePath}
        >
          {shortenPath(filePath)}
        </span>
        <span
          style={{
            background: colors.bgActive,
            borderRadius: 8,
            padding: '0 5px',
            lineHeight: '14px',
            fontSize: '10px',
          }}
        >
          {breakpoints.length}
        </span>
      </div>

      {/* Individual breakpoints */}
      {fileExpanded &&
        sorted.map((bp) => (
          <BreakpointRow
            key={bp.id}
            bp={bp}
            onToggle={() => onToggle(bp.id)}
            onRemove={() => onRemove(bp.id)}
            onNavigate={() => onNavigate(bp)}
            onEditCondition={() => onEditCondition(bp)}
            isEditingCondition={editingCondition === bp.id}
            conditionDraft={conditionDraft}
            onConditionDraftChange={onConditionDraftChange}
            onSaveCondition={() => onSaveCondition(bp.id)}
            onCancelCondition={onCancelCondition}
          />
        ))}
    </div>
  )
}

/** A single breakpoint row. */
function BreakpointRow({
  bp,
  onToggle,
  onRemove,
  onNavigate,
  onEditCondition,
  isEditingCondition,
  conditionDraft,
  onConditionDraftChange,
  onSaveCondition,
  onCancelCondition,
}: {
  bp: Breakpoint
  onToggle: () => void
  onRemove: () => void
  onNavigate: () => void
  onEditCondition: () => void
  isEditingCondition: boolean
  conditionDraft: string
  onConditionDraftChange: (v: string) => void
  onSaveCondition: () => void
  onCancelCondition: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const isLogpoint = bp.type === 'logpoint'
  const isConditional = bp.type === 'conditional' || !!bp.condition
  const isFunction = bp.type === 'function'

  const bpColor = !bp.enabled
    ? colors.textMuted
    : isLogpoint
      ? colors.accentOrange
      : isConditional
        ? colors.accentYellow
        : colors.accentRed

  const bpIcon = isLogpoint
    ? MessageSquare
    : isConditional
      ? AlertCircle
      : isFunction
        ? Play
        : CircleDot

  const BpIcon = bpIcon

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 22,
          paddingLeft: 16,
          paddingRight: 4,
          gap: 4,
          fontSize: fontSize.sm,
          cursor: 'pointer',
          background: hovered ? colors.bgHover : 'transparent',
          transition: 'background 0.08s',
          opacity: bp.enabled ? 1 : 0.6,
        }}
        onClick={onNavigate}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Enable/disable checkbox */}
        <input
          type="checkbox"
          checked={bp.enabled}
          onChange={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 14,
            height: 14,
            accentColor: colors.accent,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        />

        {/* Breakpoint icon */}
        <BpIcon
          size={12}
          style={{
            color: bpColor,
            flexShrink: 0,
          }}
        />

        {/* Line number */}
        <span
          style={{
            fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", monospace)',
            color: colors.accentOrange,
            flexShrink: 0,
            minWidth: 28,
          }}
        >
          L{bp.line}
        </span>

        {/* Condition / log message preview */}
        {bp.condition && (
          <span
            style={{
              fontSize: fontSize.xs,
              color: colors.accentYellow,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
            }}
            title={`Condition: ${bp.condition}`}
          >
            {bp.condition}
          </span>
        )}

        {bp.logMessage && !bp.condition && (
          <span
            style={{
              fontSize: fontSize.xs,
              color: colors.accentOrange,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: 1,
              fontStyle: 'italic',
            }}
            title={`Log: ${bp.logMessage}`}
          >
            log: {bp.logMessage}
          </span>
        )}

        {!bp.condition && !bp.logMessage && (
          <span style={{ flex: 1 }} />
        )}

        {/* Hit count */}
        {bp.hitCount > 0 && (
          <span
            style={{
              fontSize: '10px',
              color: colors.textMuted,
              background: colors.bgActive,
              borderRadius: 8,
              padding: '0 5px',
              lineHeight: '14px',
              flexShrink: 0,
            }}
            title={`Hit count: ${bp.hitCount}`}
          >
            {bp.hitCount}x
          </span>
        )}

        {/* Hit condition indicator */}
        {bp.hitCondition && (
          <span
            style={{
              fontSize: '10px',
              color: colors.accentPurple,
              flexShrink: 0,
            }}
            title={`Hit condition: ${bp.hitCondition}`}
          >
            @{bp.hitCondition}
          </span>
        )}

        {/* Verified status */}
        {!bp.verified && bp.enabled && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              border: `1px solid ${colors.textMuted}`,
              flexShrink: 0,
            }}
            title="Unverified"
          />
        )}

        {/* Logpoint indicator */}
        {isLogpoint && (
          <span
            style={{
              fontSize: '9px',
              color: colors.accentOrange,
              border: `1px solid ${colors.accentOrange}`,
              borderRadius: 3,
              padding: '0 3px',
              lineHeight: '13px',
              flexShrink: 0,
            }}
          >
            LOG
          </span>
        )}

        {/* Hover actions */}
        {hovered && (
          <span
            style={{ display: 'flex', gap: 1, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <IconBtn
              icon={Edit3}
              size={12}
              title="Edit Condition"
              onClick={onEditCondition}
            />
            <IconBtn
              icon={X}
              size={12}
              title="Remove Breakpoint"
              onClick={onRemove}
              danger
            />
          </span>
        )}
      </div>

      {/* Condition editing inline */}
      {isEditingCondition && (
        <div
          className="dbg-row-enter"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px 3px 36px',
            borderBottom: `1px solid ${colors.border}`,
            background: colors.bgElevated,
          }}
        >
          <span
            style={{
              fontSize: fontSize.xs,
              color: colors.textMuted,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Condition:
          </span>
          <TextInput
            value={conditionDraft}
            onChange={onConditionDraftChange}
            placeholder="e.g. x > 5 && y !== null"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveCondition()
              if (e.key === 'Escape') onCancelCondition()
            }}
            onBlur={onSaveCondition}
            style={{ flex: 1, height: 20, fontSize: fontSize.xs }}
          />
          <IconBtn
            icon={Check}
            size={12}
            title="Save condition"
            color={colors.accentGreen}
            onClick={onSaveCondition}
          />
          <IconBtn
            icon={X}
            size={12}
            title="Cancel"
            onClick={onCancelCondition}
          />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   DEBUG SIDEBAR (composition of all panels)
   ═══════════════════════════════════════════════════════════ */

const DebugSidebar = memo(function DebugSidebar() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: colors.bg,
        color: colors.text,
        fontSize: fontSize.sm,
        overflow: 'hidden',
        borderRight: `1px solid ${colors.border}`,
      }}
    >
      <ScrollArea style={{ flex: 1 }}>
        <VariablesPanel />
        <WatchPanel />
        <CallStackPanel />
        <BreakpointsPanel />
      </ScrollArea>
    </div>
  )
})

/* ═══════════════════════════════════════════════════════════
   6. DEBUG CONSOLE PANEL (bonus, integrated)
   ═══════════════════════════════════════════════════════════ */

const DebugConsolePanel = memo(function DebugConsolePanel() {
  const consoleEntries = useDebugAdapterStore((s) => s.consoleEntries)
  const evaluateInConsole = useDebugAdapterStore((s) => s.evaluateInConsole)
  const clearConsole = useDebugAdapterStore((s) => s.clearConsole)
  const isDebugging = useDebugAdapterStore((s) => s.isDebugging)

  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [consoleEntries.length])

  const handleSubmit = () => {
    const expr = input.trim()
    if (!expr) return
    evaluateInConsole(expr)
    setHistory((prev) => [expr, ...prev.filter((h) => h !== expr)].slice(0, 100))
    setHistoryIndex(-1)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const nextIdx = Math.min(historyIndex + 1, history.length - 1)
        setHistoryIndex(nextIdx)
        setInput(history[nextIdx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1
        setHistoryIndex(nextIdx)
        setInput(history[nextIdx])
      } else {
        setHistoryIndex(-1)
        setInput('')
      }
    }
  }

  const entryColor = (type: string) => {
    switch (type) {
      case 'error':
        return colors.accentRed
      case 'warning':
        return colors.accentOrange
      case 'info':
        return colors.accent
      case 'input':
        return 'var(--syntax-keyword, #569cd6)'
      default:
        return colors.text
    }
  }

  const entryPrefix = (type: string) => {
    switch (type) {
      case 'input':
        return '> '
      case 'error':
        return ''
      case 'warning':
        return ''
      default:
        return ''
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: colors.bg,
        color: colors.text,
        fontSize: fontSize.sm,
        fontFamily: 'var(--font-mono, "Cascadia Code", "Fira Code", monospace)',
      }}
    >
      {/* Console header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 26,
          padding: '0 8px',
          borderBottom: `1px solid ${colors.border}`,
          background: colors.bgElevated,
          gap: 6,
          flexShrink: 0,
        }}
      >
        <Bug size={13} style={{ color: colors.accent }} />
        <span
          style={{
            fontWeight: 600,
            fontSize: fontSize.xs,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            flex: 1,
          }}
        >
          Debug Console
        </span>
        <IconBtn
          icon={Filter}
          size={13}
          title="Filter output"
        />
        <IconBtn
          icon={Trash2}
          size={13}
          title="Clear Console"
          onClick={clearConsole}
        />
      </div>

      {/* Entries */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '4px 0',
          scrollbarWidth: 'thin',
          scrollbarColor: `${colors.scrollbar} transparent`,
        }}
      >
        {consoleEntries.length === 0 && (
          <EmptyState
            text={isDebugging() ? 'Debug console is empty' : 'Start a debug session to use the console'}
            icon={Bug}
          />
        )}
        {consoleEntries.map((entry) => (
          <div
            key={entry.id}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              padding: '1px 8px',
              gap: 4,
              fontSize: fontSize.sm,
              color: entryColor(entry.type),
              background:
                entry.type === 'error'
                  ? 'rgba(244,71,71,0.08)'
                  : entry.type === 'warning'
                    ? 'rgba(210,153,34,0.08)'
                    : 'transparent',
              borderLeft:
                entry.type === 'error'
                  ? `2px solid ${colors.accentRed}`
                  : entry.type === 'warning'
                    ? `2px solid ${colors.accentOrange}`
                    : '2px solid transparent',
              wordBreak: 'break-word',
            }}
          >
            {entry.type === 'input' && (
              <span style={{ color: colors.accent, flexShrink: 0 }}>{'>'}</span>
            )}
            {entry.type === 'error' && (
              <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
            )}
            {entry.type === 'warning' && (
              <AlertCircle size={12} style={{ marginTop: 2, flexShrink: 0 }} />
            )}
            <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>
              {entryPrefix(entry.type)}{entry.text}
            </span>
            {entry.source && (
              <span style={{ color: colors.textMuted, fontSize: '10px', flexShrink: 0 }}>
                {entry.source}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          gap: 6,
          borderTop: `1px solid ${colors.border}`,
          background: colors.bgElevated,
          flexShrink: 0,
        }}
      >
        <span style={{ color: colors.accent, fontSize: fontSize.sm, flexShrink: 0 }}>{'>'}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDebugging() ? 'Evaluate expression...' : 'Not debugging'}
          disabled={!isDebugging()}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: colors.text,
            fontSize: fontSize.sm,
            fontFamily: 'inherit',
            padding: 0,
          }}
        />
      </div>
    </div>
  )
})

/* ═══════════════════════════════════════════════════════════
   7. LAUNCH CONFIGURATION SELECTOR (header bar)
   ═══════════════════════════════════════════════════════════ */

const DebugLaunchBar = memo(function DebugLaunchBar() {
  const configurations = useDebugAdapterStore((s) => s.configurations)
  const recentConfigurations = useDebugAdapterStore((s) => s.recentConfigurations)
  const startSession = useDebugAdapterStore((s) => s.startSession)
  const isDebugging = useDebugAdapterStore((s) => s.isDebugging)

  const [selectedConfig, setSelectedConfig] = useState<string>(
    () => recentConfigurations[0] ?? configurations[0]?.name ?? '',
  )
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const config = configurations.find((c) => c.name === selectedConfig)

  const handleStart = () => {
    if (config) {
      startSession(config)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 30,
        padding: '0 8px',
        gap: 4,
        background: colors.bgElevated,
        borderBottom: `1px solid ${colors.border}`,
        flexShrink: 0,
      }}
    >
      {/* Start / Continue button */}
      <button
        onClick={handleStart}
        disabled={!config || isDebugging()}
        title={isDebugging() ? 'Already debugging' : `Start Debugging: ${selectedConfig}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 22,
          border: 'none',
          borderRadius: 3,
          cursor: !config || isDebugging() ? 'default' : 'pointer',
          opacity: !config || isDebugging() ? 0.4 : 1,
          background: colors.accentGreen,
          color: '#1e1e1e',
          padding: 0,
          transition: 'opacity 0.1s',
        }}
      >
        <Play size={14} />
      </button>

      {/* Configuration selector */}
      <div style={{ position: 'relative', flex: 1 }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            padding: '2px 8px',
            gap: 4,
            fontSize: fontSize.sm,
            color: colors.text,
            background: 'var(--input-bg, #3c3c3c)',
            border: `1px solid ${colors.border}`,
            borderRadius: 2,
            cursor: 'pointer',
            textAlign: 'left',
            height: 22,
          }}
        >
          <Bug size={12} style={{ flexShrink: 0, color: colors.accent }} />
          <span
            style={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {selectedConfig || 'Select configuration...'}
          </span>
          <ChevronDown size={12} style={{ flexShrink: 0 }} />
        </button>

        {dropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: 2,
              background: colors.bgElevated,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
              zIndex: 100,
              maxHeight: 300,
              overflowY: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: `${colors.scrollbar} transparent`,
            }}
          >
            {/* Recent configs */}
            {recentConfigurations.length > 0 && (
              <>
                <div
                  style={{
                    padding: '4px 10px 2px',
                    fontSize: '10px',
                    color: colors.textMuted,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Recent
                </div>
                {recentConfigurations
                  .filter((name) => configurations.some((c) => c.name === name))
                  .map((name) => {
                    const c = configurations.find((cc) => cc.name === name)!
                    return (
                      <ConfigDropdownItem
                        key={`recent-${name}`}
                        config={c}
                        selected={name === selectedConfig}
                        onClick={() => {
                          setSelectedConfig(name)
                          setDropdownOpen(false)
                        }}
                      />
                    )
                  })}
                <div
                  style={{
                    height: 1,
                    background: colors.border,
                    margin: '2px 0',
                  }}
                />
              </>
            )}

            {/* All configs */}
            <div
              style={{
                padding: '4px 10px 2px',
                fontSize: '10px',
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              All Configurations
            </div>
            {configurations.map((c) => (
              <ConfigDropdownItem
                key={c.name}
                config={c}
                selected={c.name === selectedConfig}
                onClick={() => {
                  setSelectedConfig(c.name)
                  setDropdownOpen(false)
                }}
              />
            ))}

            {/* Add configuration */}
            <div
              style={{
                height: 1,
                background: colors.border,
                margin: '2px 0',
              }}
            />
            <div
              onClick={() => setDropdownOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                fontSize: fontSize.sm,
                color: colors.accent,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = colors.bgHover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Plus size={12} />
              <span>Add Configuration...</span>
            </div>
          </div>
        )}
      </div>

      {/* Settings gear */}
      <IconBtn
        icon={MoreHorizontal}
        size={14}
        title="Debug Settings"
        onClick={() => {
          // Open launch.json
          window.electron?.invoke('editor:openFile', {
            filePath: '.vscode/launch.json',
          }).catch(() => {})
        }}
      />
    </div>
  )
})

/** Configuration item in the launch dropdown. */
function ConfigDropdownItem({
  config,
  selected,
  onClick,
}: {
  config: { name: string; type: string; request: string }
  selected: boolean
  onClick: () => void
}) {
  const typeIcon =
    config.type === 'node'
      ? '🟢'
      : config.type === 'python'
        ? '🐍'
        : config.type === 'chrome'
          ? '🌐'
          : config.type === 'go'
            ? '🔵'
            : config.type === 'lldb'
              ? '🦀'
              : '🔧'

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        fontSize: fontSize.sm,
        cursor: 'pointer',
        color: selected ? colors.textBright : colors.text,
        background: selected ? colors.bgSelection : 'transparent',
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = colors.bgHover
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ fontSize: '12px', flexShrink: 0 }}>{typeIcon}</span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {config.name}
      </span>
      <span style={{ fontSize: '10px', color: colors.textMuted, flexShrink: 0 }}>
        {config.request}
      </span>
      {selected && <Check size={12} style={{ color: colors.accent, flexShrink: 0 }} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   8. MAIN EXPORT: DebugToolbar (full layout wrapper)
   ═══════════════════════════════════════════════════════════ */

export interface DebugToolbarProps {
  /** Whether to show the floating toolbar over the editor. */
  showFloatingToolbar?: boolean
  /** Whether to show the debug sidebar panels. */
  showSidebar?: boolean
  /** Whether to show the debug console panel. */
  showConsole?: boolean
  /** Whether to show the launch configuration bar. */
  showLaunchBar?: boolean
}

/**
 * Main debug toolbar component. Renders the floating toolbar (absolute positioned),
 * and optionally the sidebar panels and/or console.
 *
 * Usage:
 *   <DebugToolbar showFloatingToolbar showSidebar showConsole showLaunchBar />
 *
 * Or use individual sub-components:
 *   <FloatingDebugToolbar />
 *   <DebugSidebar />
 *   <DebugConsolePanel />
 *   <DebugLaunchBar />
 */
export default function DebugToolbar({
  showFloatingToolbar = true,
  showSidebar = true,
  showConsole = false,
  showLaunchBar = true,
}: DebugToolbarProps) {
  const isDebugging = useDebugAdapterStore((s) => s.isDebugging)
  const debugging = isDebugging()

  return (
    <>
      {/* Floating toolbar (always rendered when debugging) */}
      {showFloatingToolbar && debugging && <FloatingDebugToolbar />}

      {/* Sidebar layout */}
      {showSidebar && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {/* Launch bar at top */}
          {showLaunchBar && <DebugLaunchBar />}

          {/* Debug panels */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DebugSidebar />
          </div>

          {/* Console at bottom (optional) */}
          {showConsole && (
            <div
              style={{
                height: 200,
                borderTop: `1px solid ${colors.border}`,
                flexShrink: 0,
              }}
            >
              <DebugConsolePanel />
            </div>
          )}
        </div>
      )}
    </>
  )
}

/* ── Named exports for individual panels ─────────────────── */

export {
  FloatingDebugToolbar,
  DebugSidebar,
  VariablesPanel,
  WatchPanel,
  CallStackPanel,
  BreakpointsPanel,
  DebugConsolePanel,
  DebugLaunchBar,
}
