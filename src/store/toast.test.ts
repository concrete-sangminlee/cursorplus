/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useToastStore, AUTO_DISMISS_TIMEOUTS } from './toast'

const reset = () =>
  useToastStore.setState({
    toasts: [],
    queuedToasts: [],
    notifications: [],
    doNotDisturb: false,
    maxToasts: 3,
    lastOpenedAt: 0,
  })

beforeEach(() => {
  vi.useFakeTimers()
  reset()
})

afterEach(() => {
  vi.useRealTimers()
})

const store = () => useToastStore.getState()

describe('addToast basics', () => {
  it('returns an id and creates one toast + one notification', () => {
    const id = store().addToast({ type: 'info', message: 'hello world' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    expect(store().toasts).toHaveLength(1)
    expect(store().notifications).toHaveLength(1)

    const toast = store().toasts[0]
    expect(toast.id).toBe(id)
    expect(toast.priority).toBe('normal') // default applied
    expect(typeof toast.createdAt).toBe('number')

    const notif = store().notifications[0]
    expect(notif.id).toBe(id)
    expect(notif.read).toBe(false)
    expect(notif.message).toBe('hello world')
  })

  it('dispatches an orion:notification CustomEvent with the id', () => {
    const handler = vi.fn()
    window.addEventListener('orion:notification', handler)
    const id = store().addToast({ type: 'success', message: 'saved file' })
    expect(handler).toHaveBeenCalledTimes(1)
    const evt = handler.mock.calls[0][0] as CustomEvent
    expect(evt.detail).toMatchObject({ type: 'success', message: 'saved file', id })
    window.removeEventListener('orion:notification', handler)
  })

  it('preserves action + secondaryAction labels in the notification', () => {
    const a = vi.fn()
    const b = vi.fn()
    store().addToast({
      type: 'info',
      message: 'with actions',
      action: { label: 'Undo', onClick: a },
      secondaryAction: { label: 'Dismiss', onClick: b },
    })
    const actions = store().notifications[0].actions
    expect(actions).toHaveLength(2)
    expect(actions?.map((x) => x.label)).toEqual(['Undo', 'Dismiss'])
    actions?.[0].onClick()
    expect(a).toHaveBeenCalled()
  })
})

describe('inferCategory mapping', () => {
  const cat = (message: string) => {
    store().addToast({ type: 'info', message })
    return store().notifications[0].category
  }

  it('maps Git keywords', () => {
    reset()
    expect(cat('git status changed')).toBe('Git')
    reset()
    expect(cat('Commit created')).toBe('Git') // case-insensitive
    reset()
    expect(cat('push to remote')).toBe('Git')
    reset()
    expect(cat('merge conflict')).toBe('Git')
  })

  it('maps AI keywords', () => {
    reset()
    expect(cat('AI suggestion ready')).toBe('AI')
    reset()
    expect(cat('copilot enabled')).toBe('AI')
    reset()
    expect(cat('model loaded')).toBe('AI')
  })

  it('maps Editor keywords', () => {
    reset()
    expect(cat('file saved')).toBe('Editor')
    reset()
    expect(cat('Format complete')).toBe('Editor')
    reset()
    expect(cat('lint passed')).toBe('Editor')
  })

  it('falls back to System for unmatched messages', () => {
    reset()
    expect(cat('something happened')).toBe('System')
  })

  it('respects precedence order (Git before AI before Editor)', () => {
    // "commit" (Git) wins even though "ai" substring also present via "chat"
    reset()
    expect(cat('commit the chat')).toBe('Git')
    // "ai" (AI) wins over "file" (Editor)
    reset()
    expect(cat('ai touched the file')).toBe('AI')
  })
})

describe('MAX_VISIBLE_TOASTS overflow', () => {
  it('pushes overflow toasts to queuedToasts but still logs notifications', () => {
    store().addToast({ type: 'info', message: 't1' })
    store().addToast({ type: 'info', message: 't2' })
    store().addToast({ type: 'info', message: 't3' })
    store().addToast({ type: 'info', message: 't4' }) // overflow

    expect(store().toasts).toHaveLength(3)
    expect(store().queuedToasts).toHaveLength(1)
    expect(store().queuedToasts[0].message).toBe('t4')
    // all 4 logged as notifications
    expect(store().notifications).toHaveLength(4)
  })

  it('respects a custom maxToasts value', () => {
    store().setMaxToasts(1)
    store().addToast({ type: 'info', message: 'a' })
    store().addToast({ type: 'info', message: 'b' })
    expect(store().toasts).toHaveLength(1)
    expect(store().queuedToasts).toHaveLength(1)
  })
})

describe('auto-dismiss timing', () => {
  it('removes an info toast after its AUTO_DISMISS_TIMEOUT', () => {
    const id = store().addToast({ type: 'info', message: 'temp' })
    expect(store().toasts).toHaveLength(1)
    vi.advanceTimersByTime(AUTO_DISMISS_TIMEOUTS.info - 1)
    expect(store().toasts).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(store().toasts.find((t) => t.id === id)).toBeUndefined()
    expect(store().toasts).toHaveLength(0)
  })

  it('warning uses the longer 10s timeout', () => {
    store().addToast({ type: 'warning', message: 'careful' })
    vi.advanceTimersByTime(AUTO_DISMISS_TIMEOUTS.success) // 5s — not enough
    expect(store().toasts).toHaveLength(1)
    vi.advanceTimersByTime(AUTO_DISMISS_TIMEOUTS.warning - AUTO_DISMISS_TIMEOUTS.success)
    expect(store().toasts).toHaveLength(0)
  })

  it('honors an explicit duration override', () => {
    store().addToast({ type: 'info', message: 'fast', duration: 100 })
    vi.advanceTimersByTime(100)
    expect(store().toasts).toHaveLength(0)
  })

  // AUTO_DISMISS_TIMEOUTS.error is 0 ("never auto-dismiss"). The duration is
  // computed with `??` so this intentional 0 is preserved (a `||` would fall
  // through to the 5000ms default and wrongly dismiss error toasts).
  it('error toasts never auto-dismiss', () => {
    store().addToast({ type: 'error', message: 'boom' })
    vi.advanceTimersByTime(60_000)
    expect(store().toasts).toHaveLength(1)
  })

  it('high priority toasts never auto-dismiss', () => {
    store().addToast({ type: 'info', message: 'pinned', priority: 'high' })
    vi.advanceTimersByTime(60_000)
    expect(store().toasts).toHaveLength(1)
  })

  it('progress notifications never auto-dismiss', () => {
    store().addToast({ type: 'info', message: 'downloading', progress: 10 })
    vi.advanceTimersByTime(60_000)
    expect(store().toasts).toHaveLength(1)
  })
})

describe('removeToast queue promotion', () => {
  it('promotes the next queued toast when space frees up', () => {
    const id1 = store().addToast({ type: 'info', message: 't1' })
    store().addToast({ type: 'info', message: 't2' })
    store().addToast({ type: 'info', message: 't3' })
    store().addToast({ type: 'info', message: 't4' }) // queued

    expect(store().queuedToasts).toHaveLength(1)

    store().removeToast(id1)

    expect(store().queuedToasts).toHaveLength(0)
    expect(store().toasts).toHaveLength(3)
    expect(store().toasts.map((t) => t.message)).toContain('t4')
  })

  it('schedules auto-dismiss for the promoted toast', () => {
    const id1 = store().addToast({ type: 'info', message: 't1' })
    store().addToast({ type: 'info', message: 't2' })
    store().addToast({ type: 'info', message: 't3' })
    store().addToast({ type: 'info', message: 't4' }) // queued, normal priority

    store().removeToast(id1) // promotes t4, scheduling its dismiss
    expect(store().toasts.map((t) => t.message)).toContain('t4')

    vi.advanceTimersByTime(AUTO_DISMISS_TIMEOUTS.info)
    // t4 promoted dismiss fires; t2 and t3 original timers also fire by now
    expect(store().toasts.map((t) => t.message)).not.toContain('t4')
  })

  it('does not promote a high-priority queued toast scheduling (it stays until removed)', () => {
    store().setMaxToasts(1)
    store().addToast({ type: 'error', message: 'e1' }) // error never auto-dismisses, occupies slot
    const errId = store().toasts[0].id
    store().addToast({ type: 'info', message: 'q1', priority: 'high' }) // queued, high prio

    store().removeToast(errId) // promote q1
    expect(store().toasts.map((t) => t.message)).toContain('q1')
    // high priority -> no auto-dismiss scheduled
    vi.advanceTimersByTime(60_000)
    expect(store().toasts.map((t) => t.message)).toContain('q1')
  })
})

describe('Do-Not-Disturb mode', () => {
  it('logs to notifications but shows no toast', () => {
    store().setDoNotDisturb(true)
    const id = store().addToast({ type: 'info', message: 'silent' })
    expect(typeof id).toBe('string')
    expect(store().toasts).toHaveLength(0)
    expect(store().notifications).toHaveLength(1)
  })

  it('no auto-dismiss timer leaks in DND mode', () => {
    store().setDoNotDisturb(true)
    store().addToast({ type: 'info', message: 'silent' })
    vi.advanceTimersByTime(60_000)
    expect(store().notifications).toHaveLength(1)
    expect(store().toasts).toHaveLength(0)
  })

  it('toggleDoNotDisturb flips the flag', () => {
    expect(store().doNotDisturb).toBe(false)
    store().toggleDoNotDisturb()
    expect(store().doNotDisturb).toBe(true)
    store().toggleDoNotDisturb()
    expect(store().doNotDisturb).toBe(false)
  })
})

describe('read tracking', () => {
  it('markRead marks a single notification read', () => {
    const id = store().addToast({ type: 'info', message: 'one' })
    store().addToast({ type: 'info', message: 'two' })
    store().markRead(id)
    const target = store().notifications.find((n) => n.id === id)
    expect(target?.read).toBe(true)
    expect(store().getUnreadCount()).toBe(1)
  })

  it('markAllRead marks everything read and sets lastOpenedAt', () => {
    store().addToast({ type: 'info', message: 'one' })
    store().addToast({ type: 'info', message: 'two' })
    expect(store().getUnreadCount()).toBe(2)
    store().markAllRead()
    expect(store().getUnreadCount()).toBe(0)
    expect(store().notifications.every((n) => n.read)).toBe(true)
    expect(store().lastOpenedAt).toBeGreaterThan(0)
  })

  it('getUnreadCount counts only unread', () => {
    expect(store().getUnreadCount()).toBe(0)
    store().addToast({ type: 'info', message: 'x' })
    expect(store().getUnreadCount()).toBe(1)
  })
})

describe('progress notifications', () => {
  it('updateProgress updates both toast and notification by id', () => {
    const id = store().addToast({ type: 'info', message: 'dl', progress: 0 })
    store().updateProgress(id, 42, 'downloading 42%')
    const toast = store().toasts.find((t) => t.id === id)
    const notif = store().notifications.find((n) => n.id === id)
    expect(toast?.progress).toBe(42)
    expect(toast?.message).toBe('downloading 42%')
    expect(notif?.progress).toBe(42)
    expect(notif?.message).toBe('downloading 42%')
  })

  it('updateProgress matches by sourceId', () => {
    const id = store().addToast({
      type: 'info',
      message: 'job',
      progress: 0,
      // sourceId is read off the toast object via a cast in the store
      ...({ sourceId: 'job-1' } as object),
    })
    expect(store().notifications[0].sourceId).toBe('job-1')
    store().updateProgress('job-1', 75)
    const notif = store().notifications.find((n) => n.sourceId === 'job-1')
    expect(notif?.progress).toBe(75)
    // toast is matched only by id, not sourceId, so its progress stays at 0
    const toast = store().toasts.find((t) => t.id === id)
    expect(toast?.progress).toBe(0)
  })

  it('updateProgress without a message keeps the old message', () => {
    const id = store().addToast({ type: 'info', message: 'keep me', progress: 0 })
    store().updateProgress(id, 30)
    expect(store().notifications[0].message).toBe('keep me')
    expect(store().notifications[0].progress).toBe(30)
  })

  it('completeProgress sets progress=100, completed, and removes the toast', () => {
    const id = store().addToast({ type: 'info', message: 'job', progress: 50 })
    expect(store().toasts).toHaveLength(1)
    store().completeProgress(id, 'done!', 'success')
    const notif = store().notifications.find((n) => n.id === id)
    expect(notif?.progress).toBe(100)
    expect(notif?.completed).toBe(true)
    expect(notif?.message).toBe('done!')
    expect(notif?.type).toBe('success')
    // toast popup removed
    expect(store().toasts.find((t) => t.id === id)).toBeUndefined()
  })

  it('completeProgress without type leaves the original type', () => {
    const id = store().addToast({ type: 'warning', message: 'job', progress: 50 })
    store().completeProgress(id)
    const notif = store().notifications.find((n) => n.id === id)
    expect(notif?.type).toBe('warning')
    expect(notif?.completed).toBe(true)
  })
})

describe('MAX_NOTIFICATIONS cap', () => {
  it('caps notifications at 50, keeping the newest', () => {
    // 55 toasts; with maxToasts=3 most go to queue but all log notifications
    for (let i = 0; i < 55; i++) {
      store().addToast({ type: 'info', message: `n${i}` })
    }
    expect(store().notifications).toHaveLength(50)
    // newest is prepended, so the most recent message should be first
    expect(store().notifications[0].message).toBe('n54')
    // oldest retained should be n5 (n0..n4 dropped)
    expect(store().notifications[store().notifications.length - 1].message).toBe('n5')
  })
})

describe('misc actions', () => {
  it('clearAllNotifications empties notifications only', () => {
    store().addToast({ type: 'info', message: 'x' })
    store().clearAllNotifications()
    expect(store().notifications).toHaveLength(0)
  })

  it('dismissTopToast removes the most recently added visible toast', () => {
    store().addToast({ type: 'info', message: 'bottom' })
    store().addToast({ type: 'info', message: 'top' })
    store().dismissTopToast()
    expect(store().toasts.map((t) => t.message)).toEqual(['bottom'])
  })

  it('dismissTopToast is a no-op with no toasts', () => {
    expect(() => store().dismissTopToast()).not.toThrow()
    expect(store().toasts).toHaveLength(0)
  })
})
