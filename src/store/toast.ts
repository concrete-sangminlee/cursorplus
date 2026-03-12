import { create } from 'zustand'

export interface Toast {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  duration?: number
}

export interface Notification {
  id: string
  type: 'info' | 'success' | 'error' | 'warning'
  message: string
  timestamp: number
  read: boolean
}

const MAX_NOTIFICATIONS = 50

interface ToastStore {
  toasts: Toast[]
  notifications: Notification[]
  lastOpenedAt: number
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearAllNotifications: () => void
  markAllRead: () => void
  getUnreadCount: () => number
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  notifications: [],
  lastOpenedAt: Date.now(),

  addToast: (toast) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    const now = Date.now()

    const notification: Notification = {
      id,
      type: toast.type,
      message: toast.message,
      timestamp: now,
      read: false,
    }

    set((s) => ({
      toasts: [...s.toasts, { ...toast, id }],
      notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
    }))

    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, toast.duration || 3000)
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  clearAllNotifications: () => set({ notifications: [] }),

  markAllRead: () =>
    set((s) => ({
      lastOpenedAt: Date.now(),
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  getUnreadCount: () => {
    const state = get()
    return state.notifications.filter((n) => !n.read).length
  },
}))
