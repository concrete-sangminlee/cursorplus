import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { create } from 'zustand'
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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Loader,
  Filter,
  Search,
  Clock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  RefreshCw,
  ExternalLink,
  FileText,
  Terminal,
  Package,
  Bug,
  Zap,
  Shield,
  MoreHorizontal,
  Check,
  Copy,
  XCircle,
  Archive,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
} from 'lucide-react'

/* ================================================================== */
/* Types & Interfaces                                                   */
/* ================================================================== */

export type NotificationType = 'info' | 'warning' | 'error' | 'success' | 'progress'

export type NotificationSource = 'Git' | 'Extensions' | 'Build' | 'LSP' | 'Debug' | 'System'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical'

export interface NotificationAction {
  label: string
  onClick: () => void
  primary?: boolean
  icon?: React.ReactNode
}

export interface INotification {
  id: string
  type: NotificationType
  title: string
  message: string
  source: NotificationSource
  timestamp: number
  read: boolean
  dismissed: boolean
  expanded: boolean
  priority: NotificationPriority
  actions?: NotificationAction[]
  progress?: number
  progressLabel?: string
  cancellable?: boolean
  cancelled?: boolean
  completed?: boolean
  pinned?: boolean
  groupKey?: string
  detailText?: string
  link?: string
  autoDismissMs?: number
}

export interface SourcePreference {
  source: NotificationSource
  enabled: boolean
  soundEnabled: boolean
  showToast: boolean
}

export interface NotificationFilter {
  type: NotificationType | 'all'
  source: NotificationSource | 'all'
  readStatus: 'all' | 'read' | 'unread'
  searchQuery: string
}

/* ================================================================== */
/* Inline Zustand Store                                                 */
/* ================================================================== */

interface NotificationCenterStore {
  notifications: INotification[]
  doNotDisturb: boolean
  soundEnabled: boolean
  panelOpen: boolean
  filter: NotificationFilter
  sourcePreferences: SourcePreference[]
  activeToasts: string[]
  maxVisibleToasts: number
  showPreferences: boolean
  expandedGroups: Set<string>

  // Actions
  addNotification: (n: Omit<INotification, 'id' | 'timestamp' | 'read' | 'dismissed' | 'expanded'>) => string
  removeNotification: (id: string) => void
  dismissNotification: (id: string) => void
  markRead: (id: string) => void
  markUnread: (id: string) => void
  markAllRead: () => void
  clearAll: () => void
  clearBySource: (source: NotificationSource) => void
  clearDismissed: () => void
  toggleExpanded: (id: string) => void
  togglePinned: (id: string) => void
  cancelProgress: (id: string) => void
  updateProgress: (id: string, progress: number, label?: string) => void
  completeProgress: (id: string, message?: string) => void
  toggleDoNotDisturb: () => void
  toggleSound: () => void
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
  setFilter: (filter: Partial<NotificationFilter>) => void
  resetFilter: () => void
  updateSourcePreference: (source: NotificationSource, update: Partial<SourcePreference>) => void
  addToast: (id: string) => void
  removeToast: (id: string) => void
  toggleShowPreferences: () => void
  toggleGroupExpanded: (groupKey: string) => void
  getUnreadCount: () => number
  getUnreadCountBySource: (source: NotificationSource) => number
  getFilteredNotifications: () => INotification[]
}

const DEFAULT_FILTER: NotificationFilter = {
  type: 'all',
  source: 'all',
  readStatus: 'all',
  searchQuery: '',
}

const DEFAULT_SOURCE_PREFS: SourcePreference[] = [
  { source: 'Git', enabled: true, soundEnabled: true, showToast: true },
  { source: 'Extensions', enabled: true, soundEnabled: false, showToast: true },
  { source: 'Build', enabled: true, soundEnabled: true, showToast: true },
  { source: 'LSP', enabled: true, soundEnabled: false, showToast: true },
  { source: 'Debug', enabled: true, soundEnabled: true, showToast: true },
  { source: 'System', enabled: true, soundEnabled: false, showToast: true },
]

const MAX_NOTIFICATIONS = 200
const MAX_VISIBLE_TOASTS = 4

let notificationCounter = 0

export const useNotificationStore = create<NotificationCenterStore>((set, get) => ({
  notifications: [],
  doNotDisturb: false,
  soundEnabled: true,
  panelOpen: false,
  filter: { ...DEFAULT_FILTER },
  sourcePreferences: [...DEFAULT_SOURCE_PREFS],
  activeToasts: [],
  maxVisibleToasts: MAX_VISIBLE_TOASTS,
  showPreferences: false,
  expandedGroups: new Set<string>(),

  addNotification: (partial) => {
    const id = `notif-${Date.now()}-${++notificationCounter}`
    const notification: INotification = {
      ...partial,
      id,
      timestamp: Date.now(),
      read: false,
      dismissed: false,
      expanded: false,
    }

    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
    }))

    // Show toast if appropriate
    const state = get()
    const pref = state.sourcePreferences.find((p) => p.source === partial.source)
    if (!state.doNotDisturb && pref?.showToast && pref?.enabled) {
      if (state.activeToasts.length < state.maxVisibleToasts) {
        set((s) => ({ activeToasts: [...s.activeToasts, id] }))
      }

      // Auto-dismiss for non-error, non-progress, non-critical
      if (partial.type !== 'error' && partial.type !== 'progress' && partial.priority !== 'critical') {
        const timeout = partial.autoDismissMs ?? getDefaultAutoDismiss(partial.type, partial.priority)
        if (timeout > 0) {
          setTimeout(() => {
            get().removeToast(id)
          }, timeout)
        }
      }
    }

    return id
  },

  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
      activeToasts: s.activeToasts.filter((t) => t !== id),
    })),

  dismissNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, dismissed: true } : n
      ),
      activeToasts: s.activeToasts.filter((t) => t !== id),
    })),

  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    })),

  markUnread: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: false } : n
      ),
    })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    })),

  clearAll: () => set({ notifications: [], activeToasts: [] }),

  clearBySource: (source) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.source !== source),
      activeToasts: s.activeToasts.filter((id) => {
        const n = s.notifications.find((notif) => notif.id === id)
        return n ? n.source !== source : true
      }),
    })),

  clearDismissed: () =>
    set((s) => ({
      notifications: s.notifications.filter((n) => !n.dismissed),
    })),

  toggleExpanded: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, expanded: !n.expanded } : n
      ),
    })),

  togglePinned: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, pinned: !n.pinned } : n
      ),
    })),

  cancelProgress: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, cancelled: true, type: 'warning' as NotificationType, progressLabel: 'Cancelled' } : n
      ),
      activeToasts: s.activeToasts.filter((t) => t !== id),
    })),

  updateProgress: (id, progress, label) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id
          ? { ...n, progress: Math.min(100, Math.max(0, progress)), ...(label ? { progressLabel: label } : {}) }
          : n
      ),
    })),

  completeProgress: (id, message) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id
          ? {
              ...n,
              progress: 100,
              completed: true,
              type: 'success' as NotificationType,
              ...(message ? { message } : {}),
              progressLabel: 'Completed',
            }
          : n
      ),
    })),

  toggleDoNotDisturb: () =>
    set((s) => ({
      doNotDisturb: !s.doNotDisturb,
      activeToasts: s.doNotDisturb ? s.activeToasts : [],
    })),

  toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

  setPanelOpen: (open) => {
    set({ panelOpen: open })
    if (open) {
      get().markAllRead()
    }
  },

  togglePanel: () => {
    const open = !get().panelOpen
    set({ panelOpen: open })
    if (open) {
      get().markAllRead()
    }
  },

  setFilter: (partial) =>
    set((s) => ({ filter: { ...s.filter, ...partial } })),

  resetFilter: () => set({ filter: { ...DEFAULT_FILTER } }),

  updateSourcePreference: (source, update) =>
    set((s) => ({
      sourcePreferences: s.sourcePreferences.map((p) =>
        p.source === source ? { ...p, ...update } : p
      ),
    })),

  addToast: (id) =>
    set((s) => ({
      activeToasts: s.activeToasts.includes(id)
        ? s.activeToasts
        : [...s.activeToasts, id].slice(-MAX_VISIBLE_TOASTS),
    })),

  removeToast: (id) =>
    set((s) => ({
      activeToasts: s.activeToasts.filter((t) => t !== id),
    })),

  toggleShowPreferences: () =>
    set((s) => ({ showPreferences: !s.showPreferences })),

  toggleGroupExpanded: (groupKey) =>
    set((s) => {
      const next = new Set(s.expandedGroups)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return { expandedGroups: next }
    }),

  getUnreadCount: () => get().notifications.filter((n) => !n.read && !n.dismissed).length,

  getUnreadCountBySource: (source) =>
    get().notifications.filter((n) => !n.read && !n.dismissed && n.source === source).length,

  getFilteredNotifications: () => {
    const { notifications, filter } = get()
    return notifications.filter((n) => {
      if (n.dismissed) return false
      if (filter.type !== 'all' && n.type !== filter.type) return false
      if (filter.source !== 'all' && n.source !== filter.source) return false
      if (filter.readStatus === 'read' && !n.read) return false
      if (filter.readStatus === 'unread' && n.read) return false
      if (filter.searchQuery) {
        const q = filter.searchQuery.toLowerCase()
        return (
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          n.source.toLowerCase().includes(q)
        )
      }
      return true
    })
  },
}))

/* ================================================================== */
/* Constants & Lookups                                                  */
/* ================================================================== */

function getDefaultAutoDismiss(type: NotificationType, priority: NotificationPriority): number {
  const base: Record<NotificationType, number> = {
    info: 5000,
    success: 4000,
    warning: 8000,
    error: 0,
    progress: 0,
  }
  const multiplier: Record<NotificationPriority, number> = {
    low: 0.7,
    normal: 1,
    high: 2,
    critical: 0,
  }
  const result = base[type] * multiplier[priority]
  return result === 0 && priority === 'critical' ? 0 : result
}

const typeIcons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle size={14} />,
  error: <AlertCircle size={14} />,
  warning: <AlertTriangle size={14} />,
  info: <Info size={14} />,
  progress: <Loader size={14} style={{ animation: 'nc2-spin 1s linear infinite' }} />,
}

const typeLargeIcons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle size={18} />,
  error: <AlertCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
  progress: <Loader size={18} style={{ animation: 'nc2-spin 1s linear infinite' }} />,
}

const typeColors: Record<NotificationType, string> = {
  success: 'var(--success, var(--accent-green, #3fb950))',
  error: 'var(--error, var(--accent-red, #f85149))',
  warning: 'var(--warning, var(--accent-orange, #d29922))',
  info: 'var(--info, var(--accent-primary, #58a6ff))',
  progress: 'var(--info, var(--accent-primary, #58a6ff))',
}

const typeBgColors: Record<NotificationType, string> = {
  success: 'rgba(63, 185, 80, 0.08)',
  error: 'rgba(248, 81, 73, 0.08)',
  warning: 'rgba(210, 153, 34, 0.08)',
  info: 'rgba(88, 166, 255, 0.08)',
  progress: 'rgba(88, 166, 255, 0.06)',
}

const sourceIcons: Record<NotificationSource, React.ReactNode> = {
  Git: <GitBranch size={12} />,
  Extensions: <Package size={12} />,
  Build: <Terminal size={12} />,
  LSP: <Zap size={12} />,
  Debug: <Bug size={12} />,
  System: <Settings size={12} />,
}

const sourceColors: Record<NotificationSource, string> = {
  Git: '#f97316',
  Extensions: '#8b5cf6',
  Build: '#06b6d4',
  LSP: '#eab308',
  Debug: '#ef4444',
  System: '#6b7280',
}

const priorityIndicators: Record<NotificationPriority, { label: string; color: string } | null> = {
  low: null,
  normal: null,
  high: { label: 'Important', color: 'var(--warning, #d29922)' },
  critical: { label: 'Critical', color: 'var(--error, #f85149)' },
}

const ALL_SOURCES: NotificationSource[] = ['Git', 'Extensions', 'Build', 'LSP', 'Debug', 'System']
const ALL_TYPES: NotificationType[] = ['info', 'warning', 'error', 'success', 'progress']

/* ================================================================== */
/* Animations (injected once into <head>)                               */
/* ================================================================== */

const STYLE_ID = 'nc2-styles'
function ensureStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes nc2-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes nc2-badge-pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.5); }
      50% { transform: scale(1.3); box-shadow: 0 0 0 5px rgba(88, 166, 255, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(88, 166, 255, 0); }
    }

    @keyframes nc2-slide-in-right {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes nc2-slide-out-right {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(120%); opacity: 0; }
    }
    @keyframes nc2-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes nc2-fade-out {
      from { opacity: 1; max-height: 300px; margin-bottom: 0; }
      to { opacity: 0; max-height: 0; margin-bottom: -1px; overflow: hidden; }
    }
    @keyframes nc2-panel-slide-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    @keyframes nc2-panel-slide-out {
      from { transform: translateX(0); }
      to { transform: translateX(100%); }
    }
    @keyframes nc2-progress-stripe {
      from { background-position: 0 0; }
      to { background-position: 20px 0; }
    }
    @keyframes nc2-shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes nc2-expand {
      from { max-height: 0; opacity: 0; }
      to { max-height: 500px; opacity: 1; }
    }

    .nc2-toast-enter {
      animation: nc2-slide-in-right 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) both;
    }
    .nc2-toast-exit {
      animation: nc2-slide-out-right 0.25s ease-in forwards;
    }
    .nc2-item-enter {
      animation: nc2-fade-in 0.2s ease-out both;
    }
    .nc2-item-exit {
      animation: nc2-fade-out 0.2s ease-in forwards;
    }
    .nc2-panel-enter {
      animation: nc2-panel-slide-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .nc2-panel-exit {
      animation: nc2-panel-slide-out 0.2s ease-in forwards;
    }

    .nc2-notification-item {
      transition: background 0.15s ease;
    }
    .nc2-notification-item:hover {
      background: var(--bg-hover, rgba(255, 255, 255, 0.04)) !important;
    }

    .nc2-action-btn {
      border: none;
      border-radius: 4px;
      padding: 3px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: filter 0.1s, transform 0.1s;
      white-space: nowrap;
      line-height: 1.4;
    }
    .nc2-action-btn:hover {
      filter: brightness(1.15);
      transform: scale(1.02);
    }
    .nc2-action-btn:active {
      transform: scale(0.97);
    }
    .nc2-action-btn-primary {
      background: var(--accent-primary, #58a6ff);
      color: #fff;
    }
    .nc2-action-btn-secondary {
      background: transparent;
      border: 1px solid var(--border-color, rgba(255,255,255,0.1));
      color: var(--text-secondary, #8b949e);
    }
    .nc2-action-btn-danger {
      background: rgba(248, 81, 73, 0.15);
      color: var(--error, #f85149);
    }

    .nc2-progress-bar {
      height: 3px;
      border-radius: 2px;
      background: var(--bg-tertiary, rgba(255,255,255,0.06));
      overflow: hidden;
    }
    .nc2-progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.35s ease;
    }
    .nc2-progress-fill-animated {
      background-image: linear-gradient(
        45deg,
        rgba(255,255,255,0.12) 25%,
        transparent 25%,
        transparent 50%,
        rgba(255,255,255,0.12) 50%,
        rgba(255,255,255,0.12) 75%,
        transparent 75%
      );
      background-size: 20px 20px;
      animation: nc2-progress-stripe 0.6s linear infinite;
    }
    .nc2-progress-fill-shimmer {
      background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%);
      background-size: 200% 100%;
      animation: nc2-shimmer 1.5s ease-in-out infinite;
    }

    .nc2-scrollbar::-webkit-scrollbar { width: 5px; }
    .nc2-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .nc2-scrollbar::-webkit-scrollbar-thumb {
      background: var(--text-secondary, #8b949e);
      opacity: 0.3;
      border-radius: 3px;
    }
    .nc2-scrollbar::-webkit-scrollbar-thumb:hover { opacity: 0.6; }

    .nc2-filter-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
      user-select: none;
      border: 1px solid transparent;
    }
    .nc2-filter-chip:hover {
      filter: brightness(1.1);
    }
    .nc2-filter-chip-active {
      border-color: var(--accent-primary, #58a6ff);
      background: rgba(88, 166, 255, 0.12);
      color: var(--accent-primary, #58a6ff);
      font-weight: 600;
    }
    .nc2-filter-chip-inactive {
      border-color: var(--border-color, rgba(255,255,255,0.1));
      background: transparent;
      color: var(--text-secondary, #8b949e);
      font-weight: 400;
    }

    .nc2-icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--text-secondary, #8b949e);
      cursor: pointer;
      transition: background 0.1s, color 0.1s;
    }
    .nc2-icon-btn:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-primary, #e6edf3);
    }

    .nc2-preference-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.06));
      transition: background 0.1s;
    }
    .nc2-preference-row:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    .nc2-toggle {
      position: relative;
      width: 32px;
      height: 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
      border: none;
      padding: 0;
    }
    .nc2-toggle-knob {
      position: absolute;
      top: 2px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: white;
      transition: left 0.2s;
    }

    .nc2-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 14px;
      cursor: pointer;
      user-select: none;
      transition: background 0.1s;
    }
    .nc2-group-header:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .nc2-search-input {
      width: 100%;
      background: var(--bg-tertiary, rgba(255,255,255,0.04));
      border: 1px solid var(--border-color, rgba(255,255,255,0.1));
      border-radius: 6px;
      padding: 6px 10px 6px 30px;
      font-size: 12px;
      color: var(--text-primary, #e6edf3);
      outline: none;
      transition: border-color 0.15s;
    }
    .nc2-search-input:focus {
      border-color: var(--accent-primary, #58a6ff);
    }
    .nc2-search-input::placeholder {
      color: var(--text-secondary, #8b949e);
      opacity: 0.6;
    }

    .nc2-context-menu {
      position: absolute;
      z-index: 400;
      background: var(--bg-secondary, #161b22);
      border: 1px solid var(--border-color, rgba(255,255,255,0.1));
      border-radius: 6px;
      padding: 4px 0;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      min-width: 160px;
    }
    .nc2-context-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text-primary, #e6edf3);
      cursor: pointer;
      transition: background 0.1s;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
    }
    .nc2-context-menu-item:hover {
      background: rgba(88, 166, 255, 0.1);
    }
    .nc2-context-menu-separator {
      height: 1px;
      background: var(--border-color, rgba(255,255,255,0.06));
      margin: 4px 0;
    }

    .nc2-empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      gap: 12px;
      color: var(--text-secondary, #8b949e);
    }

    .nc2-toast-auto-dismiss-bar {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2px;
      border-radius: 0 0 0 8px;
      transition: width linear;
    }
  `
  document.head.appendChild(style)
}

/* ================================================================== */
/* Helpers                                                              */
/* ================================================================== */

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

function formatFullTimestamp(timestamp: number): string {
  const d = new Date(timestamp)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'Earlier'

function getDateGroup(timestamp: number): DateGroup {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86400000
  const weekStart = todayStart - 7 * 86400000
  if (timestamp >= todayStart) return 'Today'
  if (timestamp >= yesterdayStart) return 'Yesterday'
  if (timestamp >= weekStart) return 'This Week'
  return 'Earlier'
}

function groupByDate(
  notifications: INotification[]
): { group: DateGroup; items: INotification[] }[] {
  const groups: Record<DateGroup, INotification[]> = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: [],
  }
  for (const n of notifications) {
    groups[getDateGroup(n.timestamp)].push(n)
  }
  const result: { group: DateGroup; items: INotification[] }[] = []
  for (const group of ['Today', 'Yesterday', 'This Week', 'Earlier'] as DateGroup[]) {
    if (groups[group].length > 0) {
      result.push({ group, items: groups[group] })
    }
  }
  return result
}

function groupBySource(
  notifications: INotification[]
): { source: NotificationSource; items: INotification[] }[] {
  const groups: Partial<Record<NotificationSource, INotification[]>> = {}
  for (const n of notifications) {
    if (!groups[n.source]) groups[n.source] = []
    groups[n.source]!.push(n)
  }
  return ALL_SOURCES
    .filter((s) => groups[s] && groups[s]!.length > 0)
    .map((s) => ({ source: s, items: groups[s]! }))
}

/* ================================================================== */
/* Mock Notifications                                                   */
/* ================================================================== */

export function seedMockNotifications() {
  const store = useNotificationStore.getState()
  const now = Date.now()

  const mocks: Omit<INotification, 'id' | 'timestamp' | 'read' | 'dismissed' | 'expanded'>[] = [
    {
      type: 'error',
      title: 'Build Failed',
      message: 'TypeScript compilation failed with 3 errors in src/services/api.ts',
      source: 'Build',
      priority: 'high',
      detailText:
        'Error TS2345: Argument of type \'string\' is not assignable to parameter of type \'number\' at line 42.\nError TS2339: Property \'data\' does not exist on type \'Response\' at line 58.\nError TS7006: Parameter \'e\' implicitly has an \'any\' type at line 73.',
      actions: [
        { label: 'Show Output', onClick: () => console.log('[Mock] Show build output'), primary: true },
        { label: 'Open File', onClick: () => console.log('[Mock] Open api.ts') },
      ],
    },
    {
      type: 'success',
      title: 'Git Push Successful',
      message: 'Pushed 3 commits to origin/main',
      source: 'Git',
      priority: 'normal',
      actions: [
        { label: 'View Remote', onClick: () => console.log('[Mock] View remote'), primary: true },
      ],
    },
    {
      type: 'warning',
      title: 'Extension Deprecated',
      message: 'ESLint v2.4.1 is deprecated. Please update to v3.0.0 for compatibility.',
      source: 'Extensions',
      priority: 'normal',
      actions: [
        { label: 'Update Now', onClick: () => console.log('[Mock] Update extension'), primary: true },
        { label: 'Dismiss', onClick: () => console.log('[Mock] Dismissed') },
      ],
    },
    {
      type: 'error',
      title: 'LSP Server Crashed',
      message: 'TypeScript language server terminated unexpectedly. IntelliSense may be unavailable.',
      source: 'LSP',
      priority: 'critical',
      detailText:
        'Exit code: 137 (SIGKILL)\nPID: 24601\nMemory at termination: 2.1 GB\nLast request: textDocument/completion\n\nThe language server exceeded the memory limit. Consider excluding large directories in tsconfig.json.',
      actions: [
        { label: 'Restart Server', onClick: () => console.log('[Mock] Restart LSP'), primary: true },
        { label: 'Show Logs', onClick: () => console.log('[Mock] Show LSP logs') },
      ],
    },
    {
      type: 'progress',
      title: 'Installing Dependencies',
      message: 'Running npm install... (142 packages)',
      source: 'Build',
      priority: 'normal',
      progress: 67,
      progressLabel: '96 of 142 packages',
      cancellable: true,
    },
    {
      type: 'info',
      title: 'Git Stash Applied',
      message: 'Applied stash@{0}: WIP on feature/auth - login flow',
      source: 'Git',
      priority: 'low',
    },
    {
      type: 'success',
      title: 'Extension Installed',
      message: 'Prettier - Code formatter v10.1.0 has been installed successfully.',
      source: 'Extensions',
      priority: 'normal',
      actions: [
        { label: 'Reload Window', onClick: () => console.log('[Mock] Reload'), primary: true },
      ],
    },
    {
      type: 'warning',
      title: 'Debugger Breakpoint Skipped',
      message: 'Breakpoint at main.ts:142 was not hit. Source maps may be outdated.',
      source: 'Debug',
      priority: 'normal',
      actions: [
        { label: 'Rebuild', onClick: () => console.log('[Mock] Rebuild'), primary: true },
        { label: 'Edit Launch Config', onClick: () => console.log('[Mock] Edit launch.json') },
      ],
    },
    {
      type: 'info',
      title: 'Workspace Trust',
      message: 'This workspace is trusted. All features are enabled.',
      source: 'System',
      priority: 'low',
    },
    {
      type: 'error',
      title: 'Debug Session Failed',
      message: 'Cannot connect to runtime process. Make sure the debug target is running.',
      source: 'Debug',
      priority: 'high',
      detailText:
        'Connection refused at 127.0.0.1:9229\nAttempted 3 reconnection(s)\nTimeout after 10000ms\n\nEnsure the target process was started with --inspect or --inspect-brk flag.',
      actions: [
        { label: 'Retry', onClick: () => console.log('[Mock] Retry debug'), primary: true },
        { label: 'Configure', onClick: () => console.log('[Mock] Configure launch') },
      ],
    },
    {
      type: 'progress',
      title: 'Indexing Workspace',
      message: 'Building search index for 12,847 files...',
      source: 'System',
      priority: 'low',
      progress: 34,
      progressLabel: '4,368 of 12,847 files',
      cancellable: true,
    },
    {
      type: 'success',
      title: 'All Tests Passed',
      message: '247 tests passed in 12.4s (3 suites)',
      source: 'Build',
      priority: 'normal',
      actions: [
        { label: 'Show Report', onClick: () => console.log('[Mock] Show test report'), primary: true },
      ],
    },
    {
      type: 'warning',
      title: 'Large File Detected',
      message: 'bundle.js (4.2 MB) may cause performance issues. Consider code splitting.',
      source: 'Build',
      priority: 'normal',
      actions: [
        { label: 'Analyze Bundle', onClick: () => console.log('[Mock] Analyze bundle'), primary: true },
      ],
    },
    {
      type: 'info',
      title: 'Git Merge Complete',
      message: 'Successfully merged feature/payment-integration into develop',
      source: 'Git',
      priority: 'normal',
    },
    {
      type: 'error',
      title: 'Merge Conflict',
      message: '3 files have merge conflicts that need manual resolution.',
      source: 'Git',
      priority: 'high',
      detailText: 'Conflicting files:\n  - src/config/database.ts\n  - src/routes/auth.ts\n  - package.json',
      actions: [
        { label: 'Open Merge Editor', onClick: () => console.log('[Mock] Open merge editor'), primary: true },
        { label: 'Abort Merge', onClick: () => console.log('[Mock] Abort merge') },
      ],
    },
    {
      type: 'info',
      title: 'LSP Initialized',
      message: 'TypeScript language server ready (v5.4.2). Indexing 342 source files.',
      source: 'LSP',
      priority: 'low',
    },
  ]

  mocks.forEach((mock, i) => {
    const id = `mock-${Date.now()}-${i}`
    const notification: INotification = {
      ...mock,
      id,
      timestamp: now - i * 180000 - Math.random() * 60000,
      read: i > 4,
      dismissed: false,
      expanded: false,
    }
    store.notifications.push(notification)
  })

  useNotificationStore.setState({ notifications: [...store.notifications] })
}

/* ================================================================== */
/* NotificationToast - Individual toast component                       */
/* ================================================================== */

interface ToastProps {
  notification: INotification
  index: number
  onDismiss: (id: string) => void
}

export function NotificationToast({ notification, index, onDismiss }: ToastProps) {
  const [exiting, setExiting] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [autoDismissWidth, setAutoDismissWidth] = useState(100)
  const cancelProgress = useNotificationStore((s) => s.cancelProgress)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(Date.now())
  const color = typeColors[notification.type]
  const bgColor = typeBgColors[notification.type]

  const autoDismissMs = notification.autoDismissMs ??
    (notification.type !== 'error' && notification.type !== 'progress' && notification.priority !== 'critical'
      ? getDefaultAutoDismiss(notification.type, notification.priority)
      : 0)

  // Auto-dismiss countdown visual
  useEffect(() => {
    if (autoDismissMs <= 0 || hovered) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    startTimeRef.current = Date.now()
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, 100 - (elapsed / autoDismissMs) * 100)
      setAutoDismissWidth(remaining)
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current)
      }
    }, 50)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoDismissMs, hovered])

  const handleDismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(notification.id), 250)
  }, [notification.id, onDismiss])

  const handleCancelProgress = useCallback(() => {
    cancelProgress(notification.id)
    handleDismiss()
  }, [notification.id, cancelProgress, handleDismiss])

  return (
    <div
      className={exiting ? 'nc2-toast-exit' : 'nc2-toast-enter'}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 320,
        maxWidth: 440,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
        backdropFilter: 'blur(16px)',
        background: `var(--bg-secondary, #161b22)`,
        borderLeft: `3px solid ${color}`,
        border: `1px solid color-mix(in srgb, ${color} 18%, var(--border-color, rgba(255,255,255,0.1)))`,
        borderLeftWidth: 3,
        animationDelay: `${index * 0.06}s`,
      }}
    >
      {/* Priority indicator */}
      {notification.priority === 'critical' && (
        <div
          style={{
            padding: '3px 14px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            background: 'rgba(248, 81, 73, 0.12)',
            color: 'var(--error, #f85149)',
            borderBottom: '1px solid rgba(248, 81, 73, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Shield size={10} />
          Critical
        </div>
      )}

      {/* Main content */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px' }}>
        <span style={{ color, flexShrink: 0, display: 'flex', paddingTop: 2 }}>
          {typeLargeIcons[notification.type]}
        </span>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          {/* Title */}
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary, #e6edf3)',
              lineHeight: 1.35,
            }}
          >
            {notification.title}
          </div>

          {/* Message */}
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-secondary, #8b949e)',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {notification.message}
          </div>

          {/* Progress bar */}
          {notification.progress !== undefined && !notification.cancelled && (
            <div style={{ marginTop: 4 }}>
              <div className="nc2-progress-bar">
                <div
                  className={`nc2-progress-fill ${notification.completed ? '' : 'nc2-progress-fill-animated'}`}
                  style={{
                    width: `${Math.min(100, Math.max(0, notification.progress))}%`,
                    background: notification.completed ? typeColors.success : color,
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 3,
                }}
              >
                <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)' }}>
                  {notification.progressLabel || `${notification.progress}%`}
                </span>
                {notification.cancellable && !notification.completed && (
                  <button
                    className="nc2-action-btn nc2-action-btn-danger"
                    onClick={handleCancelProgress}
                    style={{ fontSize: 10, padding: '1px 6px' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Cancelled state */}
          {notification.cancelled && (
            <span style={{ fontSize: 10, color: 'var(--warning, #d29922)', marginTop: 2 }}>
              Cancelled
            </span>
          )}

          {/* Action buttons */}
          {notification.actions && notification.actions.length > 0 && !notification.cancelled && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {notification.actions.map((action) => (
                <button
                  key={action.label}
                  className={`nc2-action-btn ${action.primary ? 'nc2-action-btn-primary' : 'nc2-action-btn-secondary'}`}
                  onClick={() => {
                    action.onClick()
                    handleDismiss()
                  }}
                >
                  {action.icon}
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Source label */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 2,
              fontSize: 10,
              color: 'var(--text-secondary, #8b949e)',
              opacity: 0.7,
            }}
          >
            <span style={{ color: sourceColors[notification.source], display: 'flex' }}>
              {sourceIcons[notification.source]}
            </span>
            {notification.source}
          </div>
        </div>

        {/* Dismiss button */}
        <button
          className="nc2-icon-btn"
          onClick={handleDismiss}
          title="Dismiss"
          style={{ flexShrink: 0, width: 22, height: 22 }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Auto-dismiss countdown bar */}
      {autoDismissMs > 0 && (
        <div
          className="nc2-toast-auto-dismiss-bar"
          style={{
            width: `${autoDismissWidth}%`,
            background: color,
            opacity: hovered ? 0.15 : 0.3,
          }}
        />
      )}
    </div>
  )
}

/* ================================================================== */
/* NotificationToastOverlay - Stacked toast container                    */
/* ================================================================== */

export function NotificationToastOverlay() {
  const activeToasts = useNotificationStore((s) => s.activeToasts)
  const notifications = useNotificationStore((s) => s.notifications)
  const removeToast = useNotificationStore((s) => s.removeToast)
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)

  useEffect(() => {
    ensureStyles()
  }, [])

  // Escape to dismiss top toast
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeToasts.length > 0) {
        removeToast(activeToasts[activeToasts.length - 1])
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeToasts, removeToast])

  const toastNotifications = useMemo(() => {
    return activeToasts
      .map((id) => notifications.find((n) => n.id === id))
      .filter(Boolean) as INotification[]
  }, [activeToasts, notifications])

  if (toastNotifications.length === 0 || doNotDisturb) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 38,
        right: 16,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
        maxWidth: 440,
      }}
    >
      {toastNotifications.map((n, i) => (
        <NotificationToast
          key={n.id}
          notification={n}
          index={i}
          onDismiss={removeToast}
        />
      ))}
      {activeToasts.length > MAX_VISIBLE_TOASTS && (
        <div
          style={{
            pointerEvents: 'none',
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--text-secondary, #8b949e)',
            padding: '4px 0',
          }}
        >
          +{activeToasts.length - MAX_VISIBLE_TOASTS} more
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/* NotificationBadge - Status bar badge component                       */
/* ================================================================== */

interface BadgeProps {
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
}

export function NotificationBadge({ onClick, className, style }: BadgeProps) {
  const unreadCount = useNotificationStore((s) => s.notifications.filter((n) => !n.read && !n.dismissed).length)
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)
  const [pulsing, setPulsing] = useState(false)
  const prevCountRef = useRef(unreadCount)

  useEffect(() => {
    ensureStyles()
  }, [])

  // Pulse animation on new notifications
  useEffect(() => {
    if (unreadCount > prevCountRef.current) {
      setPulsing(true)
      const t = setTimeout(() => setPulsing(false), 700)
      prevCountRef.current = unreadCount
      return () => clearTimeout(t)
    }
    prevCountRef.current = unreadCount
  }, [unreadCount])

  return (
    <div
      data-notification-badge
      onClick={onClick}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        cursor: 'pointer',
        padding: '0 6px',
        height: '100%',
        position: 'relative',
        ...style,
      }}
      title={
        doNotDisturb
          ? 'Notifications (Do Not Disturb)'
          : unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
            : 'Notifications'
      }
    >
      {doNotDisturb ? (
        <BellOff size={14} style={{ color: 'var(--warning, #d29922)', opacity: 0.8 }} />
      ) : (
        <Bell size={14} style={{ color: 'var(--text-secondary, #8b949e)' }} />
      )}
      {unreadCount > 0 && !doNotDisturb && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 2,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            background: 'var(--accent-primary, #58a6ff)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
            animation: pulsing ? 'nc2-badge-pulse 0.6s ease-out' : 'none',
          }}
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </div>
  )
}

/* ================================================================== */
/* FilterChip                                                           */
/* ================================================================== */

function FilterChip({
  label,
  icon,
  active,
  count,
  color: chipColor,
  onClick,
}: {
  label: string
  icon?: React.ReactNode
  active: boolean
  count?: number
  color?: string
  onClick: () => void
}) {
  return (
    <button
      className={`nc2-filter-chip ${active ? 'nc2-filter-chip-active' : 'nc2-filter-chip-inactive'}`}
      onClick={onClick}
      style={active && chipColor ? { borderColor: chipColor, color: chipColor, background: `${chipColor}18` } : undefined}
    >
      {icon && <span style={{ display: 'flex', ...(chipColor && !active ? { color: chipColor } : {}) }}>{icon}</span>}
      {label}
      {count !== undefined && count > 0 && (
        <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 1 }}>({count})</span>
      )}
    </button>
  )
}

/* ================================================================== */
/* Toggle Switch                                                        */
/* ================================================================== */

function ToggleSwitch({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      className="nc2-toggle"
      onClick={onToggle}
      style={{
        background: enabled ? 'var(--accent-primary, #58a6ff)' : 'var(--bg-tertiary, rgba(255,255,255,0.1))',
      }}
    >
      <div
        className="nc2-toggle-knob"
        style={{ left: enabled ? 18 : 2 }}
      />
    </button>
  )
}

/* ================================================================== */
/* Notification Context Menu                                            */
/* ================================================================== */

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  notificationId: string | null
}

function NotificationContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState
  onClose: () => void
}) {
  const markRead = useNotificationStore((s) => s.markRead)
  const markUnread = useNotificationStore((s) => s.markUnread)
  const removeNotification = useNotificationStore((s) => s.removeNotification)
  const togglePinned = useNotificationStore((s) => s.togglePinned)
  const notifications = useNotificationStore((s) => s.notifications)
  const menuRef = useRef<HTMLDivElement>(null)

  const notification = notifications.find((n) => n.id === state.notificationId)

  useEffect(() => {
    if (!state.visible) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [state.visible, onClose])

  if (!state.visible || !notification) return null

  return (
    <div
      ref={menuRef}
      className="nc2-context-menu"
      style={{ top: state.y, left: state.x }}
    >
      {notification.read ? (
        <button
          className="nc2-context-menu-item"
          onClick={() => { markUnread(notification.id); onClose() }}
        >
          <EyeOff size={12} /> Mark as Unread
        </button>
      ) : (
        <button
          className="nc2-context-menu-item"
          onClick={() => { markRead(notification.id); onClose() }}
        >
          <Eye size={12} /> Mark as Read
        </button>
      )}
      <button
        className="nc2-context-menu-item"
        onClick={() => { togglePinned(notification.id); onClose() }}
      >
        {notification.pinned ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        {notification.pinned ? 'Unpin' : 'Pin Notification'}
      </button>
      <button
        className="nc2-context-menu-item"
        onClick={() => {
          navigator.clipboard.writeText(`${notification.title}: ${notification.message}`)
          onClose()
        }}
      >
        <Copy size={12} /> Copy Text
      </button>
      <div className="nc2-context-menu-separator" />
      <button
        className="nc2-context-menu-item"
        onClick={() => { removeNotification(notification.id); onClose() }}
        style={{ color: 'var(--error, #f85149)' }}
      >
        <Trash2 size={12} /> Remove
      </button>
    </div>
  )
}

/* ================================================================== */
/* NotificationItem - Individual notification in the panel              */
/* ================================================================== */

function NotificationItem({
  notification,
  index,
  onContextMenu,
}: {
  notification: INotification
  index: number
  onContextMenu: (e: React.MouseEvent, id: string) => void
}) {
  const markRead = useNotificationStore((s) => s.markRead)
  const toggleExpanded = useNotificationStore((s) => s.toggleExpanded)
  const removeNotification = useNotificationStore((s) => s.removeNotification)
  const cancelProgress = useNotificationStore((s) => s.cancelProgress)
  const [hovered, setHovered] = useState(false)
  const [dismissing, setDismissing] = useState(false)

  const color = typeColors[notification.type]
  const bgColor = typeBgColors[notification.type]
  const priorityInfo = priorityIndicators[notification.priority]
  const hasDetail = Boolean(notification.detailText)

  const handleClick = useCallback(() => {
    if (!notification.read) markRead(notification.id)
    if (hasDetail) toggleExpanded(notification.id)
  }, [notification.id, notification.read, hasDetail, markRead, toggleExpanded])

  const handleDismiss = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setDismissing(true)
    setTimeout(() => removeNotification(notification.id), 200)
  }, [notification.id, removeNotification])

  const handleContextMenu = useCallback((e: React.MouseEvent, _id?: string) => {
    e.preventDefault()
    onContextMenu(e, _id ?? notification.id)
  }, [notification.id, onContextMenu])

  return (
    <div
      className={`nc2-notification-item ${dismissing ? 'nc2-item-exit' : 'nc2-item-enter'}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
        background: notification.read ? 'transparent' : bgColor,
        cursor: hasDetail ? 'pointer' : notification.read ? 'default' : 'pointer',
        position: 'relative',
        animationDelay: `${index * 0.025}s`,
      }}
    >
      {/* Unread dot + type icon */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
        {!notification.read ? (
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--accent-primary, #58a6ff)',
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
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary, #e6edf3)',
              lineHeight: 1.35,
            }}
          >
            {notification.title}
          </span>
          {notification.pinned && (
            <span style={{ color: 'var(--warning, #d29922)', display: 'flex' }}>
              <Maximize2 size={10} />
            </span>
          )}
          {priorityInfo && (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: priorityInfo.color,
                padding: '0 5px',
                borderRadius: 3,
                background: `${priorityInfo.color}15`,
                lineHeight: '14px',
                textTransform: 'uppercase',
                letterSpacing: 0.3,
              }}
            >
              {priorityInfo.label}
            </span>
          )}
        </div>

        {/* Message */}
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary, #8b949e)',
            lineHeight: 1.4,
            marginTop: 2,
            wordBreak: 'break-word',
            ...(notification.expanded ? {} : {
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }),
          }}
        >
          {notification.message}
        </div>

        {/* Expanded detail text */}
        {notification.expanded && notification.detailText && (
          <div
            style={{
              marginTop: 6,
              padding: '8px 10px',
              borderRadius: 4,
              background: 'var(--bg-tertiary, rgba(255,255,255,0.03))',
              border: '1px solid var(--border-color, rgba(255,255,255,0.06))',
              fontSize: 11,
              fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", monospace)',
              color: 'var(--text-secondary, #8b949e)',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              animation: 'nc2-expand 0.2s ease-out',
              overflow: 'hidden',
            }}
          >
            {notification.detailText}
          </div>
        )}

        {/* Expand/collapse indicator for long messages */}
        {hasDetail && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded(notification.id)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              background: 'none',
              border: 'none',
              padding: '2px 0',
              fontSize: 10,
              color: 'var(--accent-primary, #58a6ff)',
              cursor: 'pointer',
              marginTop: 3,
            }}
          >
            {notification.expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            {notification.expanded ? 'Show less' : 'Show details'}
          </button>
        )}

        {/* Progress bar */}
        {notification.progress !== undefined && !notification.cancelled && (
          <div style={{ marginTop: 6 }}>
            <div className="nc2-progress-bar">
              <div
                className={`nc2-progress-fill ${notification.completed ? '' : 'nc2-progress-fill-animated'}`}
                style={{
                  width: `${Math.min(100, Math.max(0, notification.progress))}%`,
                  background: notification.completed ? typeColors.success : color,
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <span style={{ fontSize: 10, color: notification.completed ? typeColors.success : 'var(--text-secondary, #8b949e)' }}>
                {notification.progressLabel || (notification.completed ? 'Completed' : `${notification.progress}%`)}
              </span>
              {notification.cancellable && !notification.completed && (
                <button
                  className="nc2-action-btn nc2-action-btn-danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    cancelProgress(notification.id)
                  }}
                  style={{ fontSize: 10, padding: '1px 6px' }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Cancelled indicator */}
        {notification.cancelled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <XCircle size={10} style={{ color: 'var(--warning, #d29922)' }} />
            <span style={{ fontSize: 10, color: 'var(--warning, #d29922)' }}>Cancelled</span>
          </div>
        )}

        {/* Action buttons */}
        {notification.actions && notification.actions.length > 0 && !notification.cancelled && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {notification.actions.map((action) => (
              <button
                key={action.label}
                className={`nc2-action-btn ${action.primary ? 'nc2-action-btn-primary' : 'nc2-action-btn-secondary'}`}
                onClick={(e) => {
                  e.stopPropagation()
                  action.onClick()
                }}
              >
                {action.icon && <span style={{ display: 'flex', marginRight: 3 }}>{action.icon}</span>}
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
            marginTop: 5,
          }}
        >
          <span
            style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)', opacity: 0.7 }}
            title={formatFullTimestamp(notification.timestamp)}
          >
            {formatRelativeTime(notification.timestamp)}
          </span>
          <span
            style={{
              fontSize: 10,
              color: sourceColors[notification.source],
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              opacity: 0.8,
            }}
          >
            {sourceIcons[notification.source]}
            {notification.source}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 6,
            right: 8,
            display: 'flex',
            gap: 2,
            background: 'var(--bg-secondary, #161b22)',
            borderRadius: 4,
            border: '1px solid var(--border-color, rgba(255,255,255,0.1))',
            padding: 2,
          }}
        >
          <button
            className="nc2-icon-btn"
            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, notification.id) }}
            title="More actions"
            style={{ width: 22, height: 22 }}
          >
            <MoreHorizontal size={11} />
          </button>
          <button
            className="nc2-icon-btn"
            onClick={handleDismiss}
            title="Remove"
            style={{ width: 22, height: 22 }}
          >
            <X size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/* Source Preferences Panel                                              */
/* ================================================================== */

function SourcePreferencesPanel() {
  const preferences = useNotificationStore((s) => s.sourcePreferences)
  const updatePref = useNotificationStore((s) => s.updateSourcePreference)
  const soundEnabled = useNotificationStore((s) => s.soundEnabled)
  const toggleSound = useNotificationStore((s) => s.toggleSound)

  return (
    <div style={{ borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))' }}>
      {/* Global sound toggle */}
      <div className="nc2-preference-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          <span style={{ fontSize: 12, color: 'var(--text-primary, #e6edf3)' }}>
            Notification Sounds
          </span>
        </div>
        <ToggleSwitch enabled={soundEnabled} onToggle={toggleSound} />
      </div>

      {/* Per-source toggles */}
      <div
        style={{
          padding: '6px 14px 4px',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--text-secondary, #8b949e)',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        Sources
      </div>
      {preferences.map((pref) => (
        <div key={pref.source} className="nc2-preference-row" style={{ padding: '6px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: sourceColors[pref.source], display: 'flex' }}>
              {sourceIcons[pref.source]}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-primary, #e6edf3)' }}>
              {pref.source}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)' }}>Toast</span>
              <ToggleSwitch
                enabled={pref.showToast}
                onToggle={() => updatePref(pref.source, { showToast: !pref.showToast })}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)' }}>Sound</span>
              <ToggleSwitch
                enabled={pref.soundEnabled}
                onToggle={() => updatePref(pref.source, { soundEnabled: !pref.soundEnabled })}
              />
            </div>
            <ToggleSwitch
              enabled={pref.enabled}
              onToggle={() => updatePref(pref.source, { enabled: !pref.enabled })}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ================================================================== */
/* Source Group Header                                                   */
/* ================================================================== */

function SourceGroupHeader({
  source,
  count,
  unreadCount,
  expanded,
  onToggle,
  onClear,
}: {
  source: NotificationSource
  count: number
  unreadCount: number
  expanded: boolean
  onToggle: () => void
  onClear: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className="nc2-group-header"
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-tertiary, rgba(255,255,255,0.02))',
        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
        position: 'sticky',
        top: 0,
        zIndex: 2,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span style={{ color: sourceColors[source], display: 'flex' }}>{sourceIcons[source]}</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary, #e6edf3)',
          }}
        >
          {source}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)' }}>
          ({count})
        </span>
        {unreadCount > 0 && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              background: 'var(--accent-primary, #58a6ff)',
              color: '#fff',
              borderRadius: 7,
              padding: '0 5px',
              lineHeight: '14px',
            }}
          >
            {unreadCount}
          </span>
        )}
      </div>
      {hovered && (
        <button
          className="nc2-icon-btn"
          onClick={(e) => {
            e.stopPropagation()
            onClear()
          }}
          title={`Clear all ${source} notifications`}
          style={{ width: 22, height: 22 }}
        >
          <Trash2 size={11} />
        </button>
      )}
    </div>
  )
}

/* ================================================================== */
/* Date Group Header                                                    */
/* ================================================================== */

function DateGroupHeader({ group }: { group: DateGroup }) {
  return (
    <div
      style={{
        padding: '6px 14px',
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-secondary, #8b949e)',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        background: 'var(--bg-tertiary, rgba(255,255,255,0.02))',
        borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      <Clock size={10} />
      {group}
    </div>
  )
}

/* ================================================================== */
/* NotificationCenter - Main slide-out panel (default export)           */
/* ================================================================== */

type GroupMode = 'date' | 'source'

interface NotificationCenterProps {
  open?: boolean
  onClose?: () => void
  anchorRef?: React.RefObject<HTMLDivElement | null>
}

export default function NotificationCenter({ open: controlledOpen, onClose, anchorRef }: NotificationCenterProps) {
  const panelOpen = useNotificationStore((s) => s.panelOpen)
  const setPanelOpen = useNotificationStore((s) => s.setPanelOpen)
  const notifications = useNotificationStore((s) => s.notifications)
  const doNotDisturb = useNotificationStore((s) => s.doNotDisturb)
  const toggleDND = useNotificationStore((s) => s.toggleDoNotDisturb)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const clearBySource = useNotificationStore((s) => s.clearBySource)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const filter = useNotificationStore((s) => s.filter)
  const setFilter = useNotificationStore((s) => s.setFilter)
  const resetFilter = useNotificationStore((s) => s.resetFilter)
  const showPreferences = useNotificationStore((s) => s.showPreferences)
  const toggleShowPreferences = useNotificationStore((s) => s.toggleShowPreferences)
  const expandedGroups = useNotificationStore((s) => s.expandedGroups)
  const toggleGroupExpanded = useNotificationStore((s) => s.toggleGroupExpanded)
  const getFilteredNotifications = useNotificationStore((s) => s.getFilteredNotifications)

  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [closing, setClosing] = useState(false)
  const [groupMode, setGroupMode] = useState<GroupMode>('source')
  const [showSearch, setShowSearch] = useState(false)
  const [showTypeFilter, setShowTypeFilter] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    notificationId: null,
  })

  const isOpen = controlledOpen ?? panelOpen

  useEffect(() => {
    ensureStyles()
  }, [])

  // Seed mock notifications on first open
  const seededRef = useRef(false)
  useEffect(() => {
    if (isOpen && !seededRef.current && notifications.length === 0) {
      seedMockNotifications()
      seededRef.current = true
    }
  }, [isOpen, notifications.length])

  // Mark all as read when opening
  useEffect(() => {
    if (isOpen) {
      markAllRead()
    }
  }, [isOpen, markAllRead])

  // Focus search on open
  useEffect(() => {
    if (showSearch && searchRef.current) {
      searchRef.current.focus()
    }
  }, [showSearch])

  // Close on click outside & Escape
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        (!anchorRef?.current || !anchorRef.current.contains(e.target as Node))
      ) {
        handleClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (contextMenu.visible) {
          setContextMenu({ visible: false, x: 0, y: 0, notificationId: null })
        } else {
          handleClose()
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, anchorRef, contextMenu.visible])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(() => {
      setClosing(false)
      if (onClose) onClose()
      else setPanelOpen(false)
    }, 200)
  }, [onClose, setPanelOpen])

  const handleContextMenu = useCallback((e: React.MouseEvent, notificationId: string) => {
    const rect = panelRef.current?.getBoundingClientRect()
    setContextMenu({
      visible: true,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      notificationId,
    })
  }, [])

  // Filtered & grouped data
  const filtered = useMemo(() => getFilteredNotifications(), [notifications, filter])
  const pinnedItems = useMemo(() => filtered.filter((n) => n.pinned), [filtered])
  const unpinnedItems = useMemo(() => filtered.filter((n) => !n.pinned), [filtered])

  const groupedByDate = useMemo(() => groupByDate(unpinnedItems), [unpinnedItems])
  const groupedBySource = useMemo(() => groupBySource(unpinnedItems), [unpinnedItems])

  const unreadCount = notifications.filter((n) => !n.read && !n.dismissed).length
  const activeFilterCount =
    (filter.type !== 'all' ? 1 : 0) +
    (filter.source !== 'all' ? 1 : 0) +
    (filter.readStatus !== 'all' ? 1 : 0) +
    (filter.searchQuery ? 1 : 0)

  if (!isOpen && !closing) return null

  return (
    <div
      ref={panelRef}
      className={closing ? 'nc2-panel-exit' : 'nc2-panel-enter'}
      style={{
        position: 'fixed',
        top: 32,
        right: 0,
        bottom: 24,
        width: 420,
        maxWidth: '100vw',
        background: 'var(--bg-primary, #0d1117)',
        borderLeft: '1px solid var(--border-color, rgba(255,255,255,0.1))',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.3)',
        zIndex: 300,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ───────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={14} style={{ color: 'var(--text-primary, #e6edf3)' }} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary, #e6edf3)',
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
                background: 'var(--accent-primary, #58a6ff)',
                color: '#fff',
                borderRadius: 10,
                padding: '1px 7px',
                lineHeight: '14px',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Search toggle */}
          <button
            className="nc2-icon-btn"
            onClick={() => {
              setShowSearch(!showSearch)
              if (showSearch) setFilter({ searchQuery: '' })
            }}
            title="Search notifications"
            style={showSearch ? { background: 'rgba(88, 166, 255, 0.12)', color: 'var(--accent-primary, #58a6ff)' } : undefined}
          >
            <Search size={13} />
          </button>

          {/* Filter toggle */}
          <button
            className="nc2-icon-btn"
            onClick={() => setShowTypeFilter(!showTypeFilter)}
            title="Filter notifications"
            style={{
              position: 'relative',
              ...(showTypeFilter ? { background: 'rgba(88, 166, 255, 0.12)', color: 'var(--accent-primary, #58a6ff)' } : {}),
            }}
          >
            <Filter size={13} />
            {activeFilterCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 1,
                  right: 1,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--accent-primary, #58a6ff)',
                }}
              />
            )}
          </button>

          {/* Preferences toggle */}
          <button
            className="nc2-icon-btn"
            onClick={toggleShowPreferences}
            title="Notification preferences"
            style={showPreferences ? { background: 'rgba(88, 166, 255, 0.12)', color: 'var(--accent-primary, #58a6ff)' } : undefined}
          >
            <SlidersHorizontal size={13} />
          </button>

          {/* DND toggle */}
          <button
            className="nc2-icon-btn"
            onClick={toggleDND}
            title={doNotDisturb ? 'Disable Do Not Disturb' : 'Enable Do Not Disturb'}
            style={doNotDisturb ? { color: 'var(--warning, #d29922)' } : undefined}
          >
            {doNotDisturb ? <BellOff size={13} /> : <Bell size={13} />}
          </button>

          {/* Group mode toggle */}
          <button
            className="nc2-icon-btn"
            onClick={() => setGroupMode(groupMode === 'source' ? 'date' : 'source')}
            title={`Group by ${groupMode === 'source' ? 'date' : 'source'}`}
          >
            {groupMode === 'source' ? <Package size={13} /> : <Clock size={13} />}
          </button>

          {/* Clear all */}
          {notifications.length > 0 && (
            <button
              className="nc2-icon-btn"
              onClick={() => clearAll()}
              title="Clear all notifications"
              style={{ color: 'var(--text-secondary, #8b949e)' }}
            >
              <Trash2 size={13} />
            </button>
          )}

          {/* Close button */}
          <button
            className="nc2-icon-btn"
            onClick={handleClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── DND Banner ──────────────────────────────────── */}
      {doNotDisturb && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 14px',
            background: 'rgba(210, 153, 34, 0.08)',
            borderBottom: '1px solid rgba(210, 153, 34, 0.15)',
            fontSize: 11,
            color: 'var(--warning, #d29922)',
            flexShrink: 0,
          }}
        >
          <BellOff size={13} />
          <span style={{ flex: 1 }}>Do Not Disturb is active &mdash; toast popups are suppressed</span>
          <button
            className="nc2-action-btn nc2-action-btn-secondary"
            onClick={toggleDND}
            style={{ fontSize: 10, padding: '2px 8px', borderColor: 'rgba(210, 153, 34, 0.3)', color: 'var(--warning, #d29922)' }}
          >
            Disable
          </button>
        </div>
      )}

      {/* ── Search bar ──────────────────────────────────── */}
      {showSearch && (
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary, #8b949e)',
              pointerEvents: 'none',
            }}
          />
          <input
            ref={searchRef}
            className="nc2-search-input"
            type="text"
            placeholder="Search notifications..."
            value={filter.searchQuery}
            onChange={(e) => setFilter({ searchQuery: e.target.value })}
          />
          {filter.searchQuery && (
            <button
              className="nc2-icon-btn"
              onClick={() => setFilter({ searchQuery: '' })}
              style={{
                position: 'absolute',
                right: 18,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 20,
                height: 20,
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}

      {/* ── Type & Source filter chips ────────────────────── */}
      {showTypeFilter && (
        <div
          style={{
            padding: '8px 14px',
            borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
            flexShrink: 0,
          }}
        >
          {/* Type filter row */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)', lineHeight: '22px', marginRight: 4 }}>
              Type:
            </span>
            <FilterChip
              label="All"
              active={filter.type === 'all'}
              onClick={() => setFilter({ type: 'all' })}
            />
            {ALL_TYPES.map((t) => (
              <FilterChip
                key={t}
                label={t.charAt(0).toUpperCase() + t.slice(1)}
                icon={typeIcons[t]}
                active={filter.type === t}
                color={typeColors[t]}
                count={notifications.filter((n) => n.type === t && !n.dismissed).length}
                onClick={() => setFilter({ type: filter.type === t ? 'all' : t })}
              />
            ))}
          </div>

          {/* Source filter row */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)', lineHeight: '22px', marginRight: 4 }}>
              Source:
            </span>
            <FilterChip
              label="All"
              active={filter.source === 'all'}
              onClick={() => setFilter({ source: 'all' })}
            />
            {ALL_SOURCES.map((s) => (
              <FilterChip
                key={s}
                label={s}
                icon={sourceIcons[s]}
                active={filter.source === s}
                color={sourceColors[s]}
                count={notifications.filter((n) => n.source === s && !n.dismissed).length}
                onClick={() => setFilter({ source: filter.source === s ? 'all' : s })}
              />
            ))}
          </div>

          {/* Read status filter */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)', lineHeight: '22px', marginRight: 4 }}>
              Status:
            </span>
            <FilterChip label="All" active={filter.readStatus === 'all'} onClick={() => setFilter({ readStatus: 'all' })} />
            <FilterChip label="Unread" icon={<Eye size={10} />} active={filter.readStatus === 'unread'} onClick={() => setFilter({ readStatus: 'unread' })} />
            <FilterChip label="Read" icon={<Check size={10} />} active={filter.readStatus === 'read'} onClick={() => setFilter({ readStatus: 'read' })} />
          </div>

          {/* Active filter count & reset */}
          {activeFilterCount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                className="nc2-action-btn nc2-action-btn-secondary"
                onClick={resetFilter}
                style={{ fontSize: 10, padding: '2px 8px' }}
              >
                <RefreshCw size={10} style={{ marginRight: 3 }} />
                Reset Filters ({activeFilterCount})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Preferences Panel ────────────────────────────── */}
      {showPreferences && <SourcePreferencesPanel />}

      {/* ── Notification List ─────────────────────────────── */}
      <div
        className="nc2-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <div className="nc2-empty-state">
            {activeFilterCount > 0 ? (
              <>
                <Filter size={28} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 12 }}>No notifications match your filters</span>
                <button
                  className="nc2-action-btn nc2-action-btn-secondary"
                  onClick={resetFilter}
                  style={{ marginTop: 4 }}
                >
                  Reset Filters
                </button>
              </>
            ) : (
              <>
                <Bell size={28} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 12 }}>No notifications yet</span>
                <span style={{ fontSize: 11, opacity: 0.6 }}>
                  Notifications from Git, Build, LSP and more will appear here
                </span>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Pinned notifications */}
            {pinnedItems.length > 0 && (
              <div>
                <div
                  style={{
                    padding: '6px 14px',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--warning, #d29922)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    background: 'rgba(210, 153, 34, 0.05)',
                    borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Maximize2 size={10} />
                  Pinned ({pinnedItems.length})
                </div>
                {pinnedItems.map((n, i) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    index={i}
                    onContextMenu={handleContextMenu}
                  />
                ))}
              </div>
            )}

            {/* Grouped notifications */}
            {groupMode === 'source' ? (
              groupedBySource.map(({ source, items }) => {
                const isExpanded = !expandedGroups.has(source)
                const sourceUnread = items.filter((n) => !n.read).length
                return (
                  <div key={source}>
                    <SourceGroupHeader
                      source={source}
                      count={items.length}
                      unreadCount={sourceUnread}
                      expanded={isExpanded}
                      onToggle={() => toggleGroupExpanded(source)}
                      onClear={() => clearBySource(source)}
                    />
                    {isExpanded &&
                      items.map((n, i) => (
                        <NotificationItem
                          key={n.id}
                          notification={n}
                          index={i}
                          onContextMenu={handleContextMenu}
                        />
                      ))}
                  </div>
                )
              })
            ) : (
              groupedByDate.map(({ group, items }) => (
                <div key={group}>
                  <DateGroupHeader group={group} />
                  {items.map((n, i) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      index={i}
                      onContextMenu={handleContextMenu}
                    />
                  ))}
                </div>
              ))
            )}
          </>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────── */}
      <div
        style={{
          padding: '7px 14px',
          borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-secondary, #8b949e)' }}>
          {filtered.length} notification{filtered.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && ' (filtered)'}
          {notifications.length >= MAX_NOTIFICATIONS && (
            <span style={{ opacity: 0.5 }}> &middot; history capped at {MAX_NOTIFICATIONS}</span>
          )}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {unreadCount > 0 && (
            <button
              className="nc2-action-btn nc2-action-btn-secondary"
              onClick={markAllRead}
              style={{ fontSize: 10, padding: '2px 8px' }}
            >
              <Check size={10} style={{ marginRight: 2 }} />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* ── Context Menu Overlay ──────────────────────────── */}
      <NotificationContextMenu
        state={contextMenu}
        onClose={() => setContextMenu({ visible: false, x: 0, y: 0, notificationId: null })}
      />
    </div>
  )
}
