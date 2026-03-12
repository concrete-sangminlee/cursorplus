import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
}

export type ToastPriority = 'low' | 'normal' | 'high'

export type NotificationCategory = 'Git' | 'Editor' | 'AI' | 'System'

export type NotificationType = 'info' | 'success' | 'error' | 'warning'

export interface Toast {
  id: string
  type: NotificationType
  message: string
  duration?: number
  action?: ToastAction
  secondaryAction?: ToastAction
  priority?: ToastPriority
  createdAt: number
  /** Progress value 0-100; undefined means no progress bar */
  progress?: number
}

export interface Notification {
  id: string
  type: NotificationType
  message: string
  timestamp: number
  read: boolean
  category: NotificationCategory
  /** Action buttons preserved in history */
  actions?: NotificationAction[]
  /** Progress value 0-100; undefined means not a progress notification */
  progress?: number
  /** Whether this notification has completed (for progress notifications) */
  completed?: boolean
  /** Source identifier for updating progress notifications in-place */
  sourceId?: string
}

export interface NotificationAction {
  label: string
  onClick: () => void
}

/** Default auto-dismiss timeouts by notification type (ms). 0 = never auto-dismiss. */
export const AUTO_DISMISS_TIMEOUTS: Record<NotificationType, number> = {
  info: 5000,
  success: 5000,
  warning: 10000,
  error: 0, // never auto-dismiss
}

const MAX_NOTIFICATIONS = 50
const MAX_VISIBLE_TOASTS = 3

/** Infer a notification category from the toast message */
function inferCategory(message: string): NotificationCategory {
  const lower = message.toLowerCase()
  if (
    lower.includes('git') ||
    lower.includes('commit') ||
    lower.includes('push') ||
    lower.includes('pull') ||
    lower.includes('branch') ||
    lower.includes('merge') ||
    lower.includes('stash')
  )
    return 'Git'
  if (
    lower.includes('ai') ||
    lower.includes('copilot') ||
    lower.includes('suggest') ||
    lower.includes('chat') ||
    lower.includes('model')
  )
    return 'AI'
  if (
    lower.includes('file') ||
    lower.includes('save') ||
    lower.includes('edit') ||
    lower.includes('format') ||
    lower.includes('lint') ||
    lower.includes('open') ||
    lower.includes('close') ||
    lower.includes('tab')
  )
    return 'Editor'
  return 'System'
}

interface ToastStore {
  toasts: Toast[]
  queuedToasts: Toast[]
  notifications: Notification[]
  lastOpenedAt: number
  maxToasts: number
  doNotDisturb: boolean

  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => string
  removeToast: (id: string) => void
  dismissTopToast: () => void
  clearAllNotifications: () => void
  markAllRead: () => void
  markRead: (id: string) => void
  getUnreadCount: () => number
  setMaxToasts: (n: number) => void
  toggleDoNotDisturb: () => void
  setDoNotDisturb: (value: boolean) => void

  /** Update progress on an existing notification by sourceId or id */
  updateProgress: (idOrSourceId: string, progress: number, message?: string) => void
  /** Mark a progress notification as completed */
  completeProgress: (idOrSourceId: string, message?: string, type?: NotificationType) => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  queuedToasts: [],
  notifications: [],
  lastOpenedAt: Date.now(),
  maxToasts: MAX_VISIBLE_TOASTS,
  doNotDisturb: false,

  addToast: (toast) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    const now = Date.now()
    const priority = toast.priority || 'normal'

    const notification: Notification = {
      id,
      type: toast.type,
      message: toast.message,
      timestamp: now,
      read: false,
      category: inferCategory(toast.message),
      progress: toast.progress,
      actions: [
        ...(toast.action ? [{ label: toast.action.label, onClick: toast.action.onClick }] : []),
        ...(toast.secondaryAction
          ? [{ label: toast.secondaryAction.label, onClick: toast.secondaryAction.onClick }]
          : []),
      ],
      sourceId: (toast as { sourceId?: string }).sourceId,
    }

    const dnd = get().doNotDisturb

    if (dnd) {
      // In DND mode: log to history but don't show popup toasts
      set((s) => ({
        notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
      }))
    } else {
      const newToast: Toast = { ...toast, id, priority, createdAt: now }

      set((s) => {
        const maxVisible = s.maxToasts
        if (s.toasts.length >= maxVisible) {
          return {
            queuedToasts: [...s.queuedToasts, newToast],
            notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
          }
        }
        return {
          toasts: [...s.toasts, newToast],
          notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
        }
      })

      // Auto-dismiss logic based on type, priority, and progress
      const isProgressNotification = toast.progress !== undefined
      if (priority !== 'high' && !isProgressNotification) {
        const duration =
          toast.duration || AUTO_DISMISS_TIMEOUTS[toast.type] || 5000
        if (duration > 0) {
          setTimeout(() => {
            get().removeToast(id)
          }, duration)
        }
      }
    }

    // Dispatch notification event for external listeners
    window.dispatchEvent(
      new CustomEvent('orion:notification', {
        detail: { type: toast.type, message: toast.message, id },
      })
    )

    return id
  },

  removeToast: (id) =>
    set((s) => {
      const remaining = s.toasts.filter((t) => t.id !== id)
      // Promote from queue if space available
      if (s.queuedToasts.length > 0 && remaining.length < s.maxToasts) {
        const [next, ...restQueue] = s.queuedToasts
        // Schedule auto-dismiss for promoted toast if not high priority
        const nextPriority = next.priority || 'normal'
        const isProgress = next.progress !== undefined
        if (nextPriority !== 'high' && !isProgress) {
          const duration =
            next.duration || AUTO_DISMISS_TIMEOUTS[next.type] || 5000
          if (duration > 0) {
            setTimeout(() => {
              get().removeToast(next.id)
            }, duration)
          }
          next.createdAt = Date.now()
        }
        return {
          toasts: [...remaining, next],
          queuedToasts: restQueue,
        }
      }
      return { toasts: remaining }
    }),

  dismissTopToast: () => {
    const state = get()
    if (state.toasts.length > 0) {
      const topToast = state.toasts[state.toasts.length - 1]
      get().removeToast(topToast.id)
    }
  },

  clearAllNotifications: () => set({ notifications: [] }),

  markAllRead: () =>
    set((s) => ({
      lastOpenedAt: Date.now(),
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),

  getUnreadCount: () => {
    const state = get()
    return state.notifications.filter((n) => !n.read).length
  },

  setMaxToasts: (n) => set({ maxToasts: n }),

  toggleDoNotDisturb: () => set((s) => ({ doNotDisturb: !s.doNotDisturb })),

  setDoNotDisturb: (value) => set({ doNotDisturb: value }),

  updateProgress: (idOrSourceId, progress, message) =>
    set((s) => {
      const updatedToasts = s.toasts.map((t) =>
        t.id === idOrSourceId ? { ...t, progress, ...(message ? { message } : {}) } : t
      )
      const updatedNotifications = s.notifications.map((n) => {
        if (n.id === idOrSourceId || n.sourceId === idOrSourceId) {
          return { ...n, progress, ...(message ? { message } : {}) }
        }
        return n
      })
      return { toasts: updatedToasts, notifications: updatedNotifications }
    }),

  completeProgress: (idOrSourceId, message, type) =>
    set((s) => {
      const updatedNotifications = s.notifications.map((n) => {
        if (n.id === idOrSourceId || n.sourceId === idOrSourceId) {
          return {
            ...n,
            progress: 100,
            completed: true,
            ...(message ? { message } : {}),
            ...(type ? { type } : {}),
          }
        }
        return n
      })
      // Remove the toast popup since it's complete
      const remaining = s.toasts.filter(
        (t) => t.id !== idOrSourceId
      )
      return { notifications: updatedNotifications, toasts: remaining }
    }),
}))
