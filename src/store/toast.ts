import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
}

export type ToastPriority = 'low' | 'normal' | 'high'

export type NotificationCategory = 'Git' | 'Editor' | 'AI' | 'System'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  duration?: number
  action?: ToastAction
  secondaryAction?: ToastAction
  priority?: ToastPriority
  createdAt: number
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  timestamp: number
  read: boolean
  category: NotificationCategory
}

const MAX_NOTIFICATIONS = 50

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
  addToast: (toast: Omit<Toast, 'id' | 'createdAt'>) => void
  removeToast: (id: string) => void
  clearAllNotifications: () => void
  markAllRead: () => void
  markRead: (id: string) => void
  getUnreadCount: () => number
  setMaxToasts: (n: number) => void
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  queuedToasts: [],
  notifications: [],
  lastOpenedAt: Date.now(),
  maxToasts: 5,

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
    }

    const newToast: Toast = { ...toast, id, priority, createdAt: now }

    set((s) => {
      const maxVisible = s.maxToasts
      if (s.toasts.length >= maxVisible) {
        // Queue the toast
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

    // Dispatch notification event for notification center
    window.dispatchEvent(
      new CustomEvent('orion:notification', {
        detail: { type: toast.type, message: toast.message },
      })
    )

    // High priority toasts don't auto-dismiss
    if (priority !== 'high') {
      const duration = toast.duration || (priority === 'low' ? 2000 : 3000)
      setTimeout(() => {
        get().removeToast(id)
      }, duration)
    }
  },

  removeToast: (id) =>
    set((s) => {
      const remaining = s.toasts.filter((t) => t.id !== id)
      // Promote from queue if space available
      if (s.queuedToasts.length > 0 && remaining.length < s.maxToasts) {
        const [next, ...restQueue] = s.queuedToasts
        // Schedule auto-dismiss for promoted toast if not high priority
        if ((next.priority || 'normal') !== 'high') {
          const duration = next.duration || (next.priority === 'low' ? 2000 : 3000)
          setTimeout(() => {
            get().removeToast(next.id)
          }, duration)
          // Reset createdAt so the progress bar starts fresh
          next.createdAt = Date.now()
        }
        return {
          toasts: [...remaining, next],
          queuedToasts: restQueue,
        }
      }
      return { toasts: remaining }
    }),

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
}))
