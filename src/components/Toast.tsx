import { useEffect, useState, useRef } from 'react'
import { useToastStore, type Toast } from '../store/toast'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

const icons = {
  success: <CheckCircle size={14} />,
  error: <AlertCircle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
}

const colors = {
  success: { bg: 'rgba(63, 185, 80, 0.15)', border: 'var(--accent-green)', icon: 'var(--accent-green)' },
  error: { bg: 'rgba(248, 81, 73, 0.15)', border: 'var(--accent-red)', icon: 'var(--accent-red)' },
  warning: { bg: 'rgba(210, 153, 34, 0.15)', border: 'var(--accent-orange)', icon: 'var(--accent-orange)' },
  info: { bg: 'rgba(88, 166, 255, 0.15)', border: 'var(--accent)', icon: 'var(--accent)' },
}

// Inject keyframes once
const STYLE_ID = 'toast-animations'
function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes toast-slide-in {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes toast-slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(120%); opacity: 0; }
    }
    @keyframes toast-progress {
      from { width: 100%; }
      to { width: 0%; }
    }
  `
  document.head.appendChild(style)
}

function ToastItem({ toast, index }: { toast: Toast; index: number }) {
  const removeToast = useToastStore((s) => s.removeToast)
  const c = colors[toast.type]
  const priority = toast.priority || 'normal'
  const duration = priority === 'high' ? 0 : (toast.duration || (priority === 'low' ? 2000 : 3000))
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDismiss = () => {
    setExiting(true)
    timerRef.current = setTimeout(() => removeToast(toast.id), 250)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 300,
        maxWidth: 420,
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(12px)',
        background: c.bg,
        borderLeft: `3px solid ${c.border}`,
        borderTop: `1px solid ${c.border}20`,
        borderRight: `1px solid ${c.border}20`,
        borderBottom: `1px solid ${c.border}20`,
        animation: exiting
          ? 'toast-slide-out 0.25s ease-in forwards'
          : 'toast-slide-in 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) forwards',
        animationDelay: exiting ? '0s' : `${index * 0.05}s`,
        opacity: exiting ? undefined : 0,
      }}
    >
      {/* Content row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <span style={{ color: c.icon, flexShrink: 0, display: 'flex' }}>{icons[toast.type]}</span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>
            {toast.message}
          </span>
          {(toast.action || toast.secondaryAction) && (
            <div style={{ display: 'flex', gap: 8 }}>
              {toast.action && (
                <button
                  onClick={() => {
                    toast.action!.onClick()
                    handleDismiss()
                  }}
                  style={{
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 4,
                    padding: '3px 10px',
                    fontSize: 11,
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              {toast.secondaryAction && (
                <button
                  onClick={() => {
                    toast.secondaryAction!.onClick()
                    handleDismiss()
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '3px 10px',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {toast.secondaryAction.label}
                </button>
              )}
            </div>
          )}
        </div>
        {priority === 'high' && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.6,
              color: c.icon,
              opacity: 0.7,
              flexShrink: 0,
            }}
          >
            !
          </span>
        )}
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 2,
            color: 'var(--text-muted)',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Progress bar (not shown for high-priority toasts) */}
      {duration > 0 && (
        <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', flexShrink: 0 }}>
          <div
            style={{
              height: '100%',
              background: c.border,
              opacity: 0.6,
              animation: `toast-progress ${duration}ms linear forwards`,
            }}
          />
        </div>
      )}
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const queuedCount = useToastStore((s) => s.queuedToasts.length)

  useEffect(() => {
    ensureStyles()
  }, [])

  if (toasts.length === 0) return null

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
      }}
    >
      {toasts.map((t, i) => (
        <ToastItem key={t.id} toast={t} index={i} />
      ))}
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
