import { useEffect, useRef, useState, useCallback } from 'react'
import {
  useToastStore,
  type Notification,
  type NotificationCategory,
  type NotificationType,
} from '@/store/toast'
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  BellOff,
  Bell,
  GitBranch,
  Edit3,
  Cpu,
  Settings,
  X,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/* Constants & lookups                                                  */
/* ------------------------------------------------------------------ */

const typeIcons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle size={14} />,
  error: <AlertCircle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
}

const typeColors: Record<NotificationType, string> = {
  success: 'var(--notification-success, var(--accent-green))',
  error: 'var(--notification-error, var(--accent-red))',
  warning: 'var(--notification-warning, var(--accent-orange))',
  info: 'var(--notification-info, var(--accent))',
}

const typeBgColors: Record<NotificationType, string> = {
  success: 'var(--notification-success-bg, rgba(63, 185, 80, 0.08))',
  error: 'var(--notification-error-bg, rgba(248, 81, 73, 0.08))',
  warning: 'var(--notification-warning-bg, rgba(210, 153, 34, 0.08))',
  info: 'var(--notification-info-bg, rgba(88, 166, 255, 0.08))',
}

const categoryIcons: Record<NotificationCategory, React.ReactNode> = {
  Git: <GitBranch size={11} />,
  Editor: <Edit3 size={11} />,
  AI: <Cpu size={11} />,
  System: <Settings size={11} />,
}

const ALL_CATEGORIES: NotificationCategory[] = ['Git', 'Editor', 'AI', 'System']

/* ------------------------------------------------------------------ */
/* Animations (injected once into <head>)                              */
/* ------------------------------------------------------------------ */

const STYLE_ID = 'notification-center-styles'
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes nc-badge-pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.5); }
      50% { transform: scale(1.25); box-shadow: 0 0 0 4px rgba(88, 166, 255, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88, 166, 255, 0); }
    }
    .nc-badge-pulse {
      animation: nc-badge-pulse 0.6s ease-out;
    }

    @keyframes nc-slide-in {
      from { transform: translateX(40px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes nc-fade-out {
      from { opacity: 1; max-height: 200px; margin-bottom: 0; }
      to { opacity: 0; max-height: 0; margin-bottom: -1px; overflow: hidden; }
    }
    @keyframes nc-panel-enter {
      from { opacity: 0; transform: translateY(8px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes nc-progress-stripe {
      from { background-position: 0 0; }
      to { background-position: 20px 0; }
    }

    .nc-item-enter {
      animation: nc-slide-in 0.25s ease-out both;
    }
    .nc-item-exit {
      animation: nc-fade-out 0.2s ease-in forwards;
    }

    .nc-notification-item:hover {
      background: var(--bg-hover) !important;
    }

    .nc-action-btn {
      border: none;
      border-radius: var(--radius-sm, 4px);
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.1s, transform 0.1s;
      white-space: nowrap;
    }
    .nc-action-btn:hover {
      filter: brightness(1.2);
      transform: scale(1.02);
    }
    .nc-action-btn:active {
      transform: scale(0.98);
    }
    .nc-action-btn-primary {
      background: var(--accent);
      color: #fff;
    }
    .nc-action-btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
    }

    .nc-progress-bar {
      height: 3px;
      border-radius: 2px;
      background: var(--bg-tertiary, rgba(255,255,255,0.06));
      overflow: hidden;
      margin-top: 6px;
    }
    .nc-progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .nc-progress-fill-animated {
      background-image: linear-gradient(
        45deg,
        rgba(255,255,255,0.1) 25%,
        transparent 25%,
        transparent 50%,
        rgba(255,255,255,0.1) 50%,
        rgba(255,255,255,0.1) 75%,
        transparent 75%
      );
      background-size: 20px 20px;
      animation: nc-progress-stripe 0.6s linear infinite;
    }

    .nc-scrollbar::-webkit-scrollbar { width: 5px; }
    .nc-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .nc-scrollbar::-webkit-scrollbar-thumb {
      background: var(--text-muted);
      opacity: 0.3;
      border-radius: 3px;
    }
    .nc-scrollbar::-webkit-scrollbar-thumb:hover { opacity: 0.5; }

    .nc-dnd-toggle {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: var(--radius-sm, 4px);
      border: none;
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
  `
  document.head.appendChild(style)
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

type DateGroup = 'Today' | 'Yesterday' | 'Earlier'

function getDateGroup(timestamp: number): DateGroup {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  if (timestamp >= todayStart) return 'Today'
  if (timestamp >= yesterdayStart) return 'Yesterday'
  return 'Earlier'
}

function groupNotifications(
  notifications: Notification[]
): { group: DateGroup; items: Notification[] }[] {
  const groups: Record<DateGroup, Notification[]> = { Today: [], Yesterday: [], Earlier: [] }
  for (const n of notifications) {
    groups[getDateGroup(n.timestamp)].push(n)
  }
  const result: { group: DateGroup; items: Notification[] }[] = []
  for (const group of ['Today', 'Yesterday', 'Earlier'] as DateGroup[]) {
    if (groups[group].length > 0) {
      result.push({ group, items: groups[group] })
    }
  }
  return result
}

/* ------------------------------------------------------------------ */
/* Toast popup overlay (stacked, max 3, slide-in/out, Esc dismiss)    */
/* ------------------------------------------------------------------ */

const TOAST_STYLE_ID = 'nc-toast-overlay-styles'
function ensureToastOverlayStyles() {
  if (document.getElementById(TOAST_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = TOAST_STYLE_ID
  style.textContent = `
    @keyframes nc-toast-slide-in {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes nc-toast-fade-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(120%); opacity: 0; }
    }
  `
  document.head.appendChild(style)
}

/** Floating toast popups with max-3 stacking, +N indicator, Esc to dismiss */
export function NotificationToastOverlay() {
  const toasts = useToastStore((s) => s.toasts)
  const queuedCount = useToastStore((s) => s.queuedToasts.length)
  const removeToast = useToastStore((s) => s.removeToast)
  const dismissTop = useToastStore((s) => s.dismissTopToast)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    ensureToastOverlayStyles()
  }, [])

  // Keyboard: Escape dismisses the top toast
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && toasts.length > 0) {
        dismissTop()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toasts.length, dismissTop])

  const handleDismiss = useCallback(
    (id: string) => {
      setExitingIds((prev) => new Set(prev).add(id))
      setTimeout(() => {
        removeToast(id)
        setExitingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 250)
    },
    [removeToast]
  )

  if (toasts.length === 0 && queuedCount === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 36,
        right: 16,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        maxWidth: 420,
      }}
    >
      {toasts.map((t, i) => {
        const isExiting = exitingIds.has(t.id)
        const color = typeColors[t.type]
        const bgColor = typeBgColors[t.type]
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              minWidth: 300,
              maxWidth: 420,
              borderRadius: 'var(--radius-md, 8px)',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-xl, 0 8px 32px rgba(0,0,0,0.4))',
              backdropFilter: 'blur(12px)',
              background: bgColor,
              borderLeft: `3px solid ${color}`,
              borderTop: `1px solid color-mix(in srgb, ${color} 12%, transparent)`,
              borderRight: `1px solid color-mix(in srgb, ${color} 12%, transparent)`,
              borderBottom: `1px solid color-mix(in srgb, ${color} 12%, transparent)`,
              animation: isExiting
                ? 'nc-toast-fade-out 0.25s ease-in forwards'
                : `nc-toast-slide-in 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) ${i * 0.05}s both`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px' }}>
              <span style={{ color, flexShrink: 0, display: 'flex', paddingTop: 1 }}>
                {typeIcons[t.type]}
              </span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  {t.message}
                </span>
                {/* Progress bar */}
                {t.progress !== undefined && (
                  <div className="nc-progress-bar">
                    <div
                      className={`nc-progress-fill ${t.progress < 100 ? 'nc-progress-fill-animated' : ''}`}
                      style={{
                        width: `${Math.min(100, Math.max(0, t.progress))}%`,
                        background: color,
                      }}
                    />
                  </div>
                )}
                {t.progress !== undefined && (
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {t.progress}%
                  </span>
                )}
                {/* Action buttons */}
                {(t.action || t.secondaryAction) && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    {t.action && (
                      <button
                        className="nc-action-btn nc-action-btn-primary"
                        onClick={() => {
                          t.action!.onClick()
                          handleDismiss(t.id)
                        }}
                      >
                        {t.action.label}
                      </button>
                    )}
                    {t.secondaryAction && (
                      <button
                        className="nc-action-btn nc-action-btn-secondary"
                        onClick={() => {
                          t.secondaryAction!.onClick()
                          handleDismiss(t.id)
                        }}
                      >
                        {t.secondaryAction.label}
                      </button>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => handleDismiss(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 2,
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                title="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        )
      })}
      {queuedCount > 0 && (
        <div
          style={{
            pointerEvents: 'none',
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--text-muted)',
            padding: '4px 0',
          }}
        >
          +{queuedCount} more
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Notification Center panel (dropdown history)                        */
/* ------------------------------------------------------------------ */

interface Props {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}

export default function NotificationCenter({ open, onClose, anchorRef }: Props) {
  const notifications = useToastStore((s) => s.notifications)
  const clearAll = useToastStore((s) => s.clearAllNotifications)
  const markAllRead = useToastStore((s) => s.markAllRead)
  const doNotDisturb = useToastStore((s) => s.doNotDisturb)
  const toggleDND = useToastStore((s) => s.toggleDoNotDisturb)
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeFilter, setActiveFilter] = useState<NotificationCategory | null>(null)
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())

  // Pulse badge on new notifications
  const prevCountRef = useRef(notifications.length)
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    ensureStyles()
  }, [])

  useEffect(() => {
    if (notifications.length > prevCountRef.current) {
      setPulsing(true)
      const timer = setTimeout(() => setPulsing(false), 600)
      prevCountRef.current = notifications.length
      return () => clearTimeout(timer)
    }
    prevCountRef.current = notifications.length
  }, [notifications.length])

  useEffect(() => {
    if (!pulsing) return
    const badge = anchorRef.current?.querySelector('[data-notification-badge]')
    if (badge) {
      badge.classList.add('nc-badge-pulse')
      const handler = () => badge.classList.remove('nc-badge-pulse')
      badge.addEventListener('animationend', handler)
      return () => badge.removeEventListener('animationend', handler)
    }
  }, [pulsing, anchorRef])

  // Mark all as read when opening
  useEffect(() => {
    if (open) {
      markAllRead()
    }
  }, [open, markAllRead])

  // Close on click outside & Escape
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose, anchorRef])

  // Animate individual notification removal
  const handleDismissNotification = useCallback(
    (id: string) => {
      setDismissingIds((prev) => new Set(prev).add(id))
      setTimeout(() => {
        useToastStore.setState((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        }))
        setDismissingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }, 200)
    },
    []
  )

  if (!open) return null

  const anchorRect = anchorRef.current?.getBoundingClientRect()
  const right = anchorRect ? window.innerWidth - anchorRect.right : 120

  const filtered = activeFilter
    ? notifications.filter((n) => n.category === activeFilter)
    : notifications

  const grouped = groupNotifications(filtered)
  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        bottom: 28,
        right: Math.max(4, right),
        width: 400,
        maxHeight: 520,
        background: 'var(--notification-panel-bg, var(--bg-secondary))',
        border: '1px solid var(--notification-panel-border, var(--border-bright))',
        borderRadius: 'var(--radius-lg, 10px)',
        boxShadow: 'var(--shadow-xl, 0 16px 48px rgba(0,0,0,0.3))',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'nc-panel-enter 0.2s ease-out',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: 0.3,
            }}
          >
            Notifications
          </span>
          {unreadCount > 0 && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                background: 'var(--accent)',
                color: '#fff',
                borderRadius: 10,
                padding: '1px 6px',
                lineHeight: '14px',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Do Not Disturb toggle */}
          <button
            className="nc-dnd-toggle"
            onClick={toggleDND}
            style={{
              background: doNotDisturb ? 'rgba(210, 153, 34, 0.12)' : 'transparent',
              color: doNotDisturb ? 'var(--accent-orange)' : 'var(--text-muted)',
            }}
            title={doNotDisturb ? 'Do Not Disturb is ON - click to disable' : 'Enable Do Not Disturb'}
          >
            {doNotDisturb ? <BellOff size={12} /> : <Bell size={12} />}
            <span style={{ fontSize: 10 }}>{doNotDisturb ? 'DND' : ''}</span>
          </button>

          {/* Clear All */}
          {notifications.length > 0 && (
            <button
              onClick={() => clearAll()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 11,
                color: 'var(--text-muted)',
                padding: '3px 8px',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(248, 81, 73, 0.1)'
                e.currentTarget.style.color = 'var(--accent-red)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
              title="Clear all notifications"
            >
              <Trash2 size={11} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* DND banner */}
      {doNotDisturb && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: 'rgba(210, 153, 34, 0.08)',
            borderBottom: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--accent-orange)',
            flexShrink: 0,
          }}
        >
          <BellOff size={12} />
          Do Not Disturb is on — popups suppressed, notifications still logged
        </div>
      )}

      {/* Category filter bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 14px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <FilterChip label="All" active={activeFilter === null} onClick={() => setActiveFilter(null)} />
        {ALL_CATEGORIES.map((cat) => {
          const count = notifications.filter((n) => n.category === cat).length
          return (
            <FilterChip
              key={cat}
              label={cat}
              icon={categoryIcons[cat]}
              active={activeFilter === cat}
              count={count}
              onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
            />
          )
        })}
      </div>

      {/* Notification list */}
      <div
        className="nc-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '40px 20px',
              gap: 10,
              color: 'var(--text-muted)',
            }}
          >
            <BellOff size={28} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: 12 }}>
              {activeFilter ? `No ${activeFilter} notifications` : 'No notifications yet'}
            </span>
          </div>
        ) : (
          grouped.map(({ group, items }) => (
            <div key={group}>
              {/* Date group header */}
              <div
                style={{
                  padding: '6px 14px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  background: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border)',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {group}
              </div>
              {items.map((n, idx) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  index={idx}
                  isDismissing={dismissingIds.has(n.id)}
                  onDismiss={handleDismissNotification}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div
          style={{
            padding: '6px 14px',
            borderTop: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--text-muted)',
            textAlign: 'center',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span>
            {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
            {activeFilter && ` in ${activeFilter}`}
          </span>
          {notifications.length >= 50 && (
            <span style={{ opacity: 0.6 }}>(history limited to 50)</span>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* FilterChip                                                          */
/* ------------------------------------------------------------------ */

function FilterChip({
  label,
  icon,
  active,
  count,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 10,
        padding: '2px 8px',
        borderRadius: 10,
        border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
        background: active ? 'rgba(88, 166, 255, 0.12)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        fontWeight: active ? 600 : 400,
      }}
    >
      {icon}
      {label}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>({count})</span>
      )}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* NotificationItem                                                    */
/* ------------------------------------------------------------------ */

function NotificationItem({
  notification,
  index,
  isDismissing,
  onDismiss,
}: {
  notification: Notification
  index: number
  isDismissing: boolean
  onDismiss: (id: string) => void
}) {
  const color = typeColors[notification.type]
  const bgColor = typeBgColors[notification.type]
  const markRead = useToastStore((s) => s.markRead)
  const [hovered, setHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (!notification.read) {
      markRead(notification.id)
    }
  }, [notification.id, notification.read, markRead])

  return (
    <div
      className={`nc-notification-item ${isDismissing ? 'nc-item-exit' : 'nc-item-enter'}`}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: notification.read ? 'transparent' : bgColor,
        transition: 'background 0.1s',
        cursor: notification.read ? 'default' : 'pointer',
        position: 'relative',
        animationDelay: `${index * 0.03}s`,
      }}
    >
      {/* Unread indicator + type icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 1 }}>
        {!notification.read ? (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              flexShrink: 0,
            }}
          />
        ) : (
          <div style={{ width: 6 }} />
        )}
        <span style={{ color, display: 'flex' }}>{typeIcons[notification.type]}</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {notification.message}
        </div>

        {/* Progress bar for progress notifications */}
        {notification.progress !== undefined && (
          <div className="nc-progress-bar" style={{ marginTop: 6 }}>
            <div
              className={`nc-progress-fill ${!notification.completed ? 'nc-progress-fill-animated' : ''}`}
              style={{
                width: `${Math.min(100, Math.max(0, notification.progress))}%`,
                background: notification.completed ? typeColors.success : color,
              }}
            />
          </div>
        )}
        {notification.progress !== undefined && (
          <span
            style={{
              fontSize: 10,
              color: notification.completed ? typeColors.success : 'var(--text-muted)',
              marginTop: 2,
              display: 'inline-block',
            }}
          >
            {notification.completed ? 'Completed' : `${notification.progress}%`}
          </span>
        )}

        {/* Action buttons in history */}
        {notification.actions && notification.actions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {notification.actions.map((action, i) => (
              <button
                key={action.label}
                className={`nc-action-btn ${i === 0 ? 'nc-action-btn-primary' : 'nc-action-btn-secondary'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  action.onClick()
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        {/* Metadata row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {formatRelativeTime(notification.timestamp)}
          </span>
          <span
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              opacity: 0.7,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            {categoryIcons[notification.category]}
            {notification.category}
          </span>
        </div>
      </div>

      {/* Individual dismiss button (visible on hover) */}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDismiss(notification.id)
          }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm, 4px)',
            padding: 2,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Dismiss notification"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}
