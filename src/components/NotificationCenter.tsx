import { useEffect, useRef } from 'react'
import { useToastStore, type Notification } from '@/store/toast'
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  BellOff,
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
    // Close on Escape
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

  // Position above the status bar, anchored to the bell icon
  const anchorRect = anchorRef.current?.getBoundingClientRect()
  const right = anchorRect
    ? window.innerWidth - anchorRect.right
    : 120

  return (
    <div
      ref={panelRef}
      className="anim-scale-in"
      style={{
        position: 'fixed',
        bottom: 28,
        right: Math.max(4, right),
        width: 360,
        maxHeight: 420,
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

      {/* Notification list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {notifications.length === 0 ? (
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
            <span style={{ fontSize: 12 }}>No notifications</span>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} />
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
          {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

function NotificationItem({ notification }: { notification: Notification }) {
  const color = typeColors[notification.type]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: notification.read
          ? 'transparent'
          : 'rgba(88, 166, 255, 0.03)',
        transition: 'background 0.1s',
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
        <span style={{ color, display: 'flex' }}>
          {typeIcons[notification.type]}
        </span>
      </div>

      {/* Message + timestamp */}
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
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 3,
          }}
        >
          {formatRelativeTime(notification.timestamp)}
        </div>
      </div>
    </div>
  )
}
