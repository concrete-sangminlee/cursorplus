import { useEffect, useRef, useState, useCallback } from 'react'
import { useToastStore, type Notification, type NotificationCategory } from '@/store/toast'
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  BellOff,
  GitBranch,
  Edit3,
  Cpu,
  Settings,
} from 'lucide-react'

const typeIcons = {
  success: <CheckCircle size={14} />,
  error: <AlertCircle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
}

const typeColors: Record<Notification['type'], string> = {
  success: 'var(--accent-green)',
  error: 'var(--accent-red)',
  warning: 'var(--accent-orange)',
  info: 'var(--accent)',
}

const categoryIcons: Record<NotificationCategory, React.ReactNode> = {
  Git: <GitBranch size={11} />,
  Editor: <Edit3 size={11} />,
  AI: <Cpu size={11} />,
  System: <Settings size={11} />,
}

const ALL_CATEGORIES: NotificationCategory[] = ['Git', 'Editor', 'AI', 'System']

// Inject pulse animation
const PULSE_STYLE_ID = 'notification-pulse-style'
function ensurePulseStyle() {
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PULSE_STYLE_ID
  style.textContent = `
    @keyframes badge-pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.5); }
      50% { transform: scale(1.25); box-shadow: 0 0 0 4px rgba(88, 166, 255, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88, 166, 255, 0); }
    }
    .badge-pulse {
      animation: badge-pulse 0.6s ease-out;
    }
  `
  document.head.appendChild(style)
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
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
  const date = new Date(timestamp)
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

interface Props {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLDivElement | null>
}

export default function NotificationCenter({ open, onClose, anchorRef }: Props) {
  const notifications = useToastStore((s) => s.notifications)
  const clearAll = useToastStore((s) => s.clearAllNotifications)
  const markAllRead = useToastStore((s) => s.markAllRead)
  const panelRef = useRef<HTMLDivElement>(null)
  const [activeFilter, setActiveFilter] = useState<NotificationCategory | null>(null)

  // Pulse badge on new notifications
  const prevCountRef = useRef(notifications.length)
  const [pulsing, setPulsing] = useState(false)

  useEffect(() => {
    ensurePulseStyle()
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

  // Expose pulse class name for external badge usage
  useEffect(() => {
    if (!pulsing) return
    // Find the badge element near the anchor and add pulse class
    const badge = anchorRef.current?.querySelector('[data-notification-badge]')
    if (badge) {
      badge.classList.add('badge-pulse')
      const handler = () => badge.classList.remove('badge-pulse')
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

  // Close on click outside
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

  if (!open) return null

  const anchorRect = anchorRef.current?.getBoundingClientRect()
  const right = anchorRect ? window.innerWidth - anchorRect.right : 120

  const filtered = activeFilter
    ? notifications.filter((n) => n.category === activeFilter)
    : notifications

  const grouped = groupNotifications(filtered)

  return (
    <div
      ref={panelRef}
      className="anim-scale-in"
      style={{
        position: 'fixed',
        bottom: 28,
        right: Math.max(4, right),
        width: 380,
        maxHeight: 480,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-bright)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
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
              borderRadius: 'var(--radius-sm)',
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
            Clear All
          </button>
        )}
      </div>

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
        <FilterChip
          label="All"
          active={activeFilter === null}
          onClick={() => setActiveFilter(null)}
        />
        {ALL_CATEGORIES.map((cat) => (
          <FilterChip
            key={cat}
            label={cat}
            icon={categoryIcons[cat]}
            active={activeFilter === cat}
            onClick={() => setActiveFilter(activeFilter === cat ? null : cat)}
          />
        ))}
      </div>

      {/* Notification list */}
      <div
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
              {activeFilter ? `No ${activeFilter} notifications` : 'No notifications'}
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
              {items.map((n) => (
                <NotificationItem key={n.id} notification={n} />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer count */}
      {notifications.length > 0 && (
        <div
          style={{
            padding: '6px 14px',
            borderTop: '1px solid var(--border)',
            fontSize: 10,
            color: 'var(--text-muted)',
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
          {activeFilter && ` in ${activeFilter}`}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
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
    </button>
  )
}

function NotificationItem({ notification }: { notification: Notification }) {
  const color = typeColors[notification.type]
  const markRead = useToastStore((s) => s.markRead)

  const handleClick = useCallback(() => {
    if (!notification.read) {
      markRead(notification.id)
    }
  }, [notification.id, notification.read, markRead])

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: notification.read ? 'transparent' : 'rgba(88, 166, 255, 0.03)',
        transition: 'background 0.1s',
        cursor: notification.read ? 'default' : 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = notification.read
          ? 'transparent'
          : 'rgba(88, 166, 255, 0.03)'
      }}
    >
      {/* Unread indicator + icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 1 }}>
        {!notification.read && (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent)',
              flexShrink: 0,
            }}
          />
        )}
        {notification.read && <div style={{ width: 6 }} />}
        <span style={{ color, display: 'flex' }}>{typeIcons[notification.type]}</span>
      </div>

      {/* Message + timestamp + category */}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 3,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
            }}
          >
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
    </div>
  )
}
