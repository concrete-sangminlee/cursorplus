/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useNotificationStore } from './notifications'

// The store auto-dismisses nothing on a timer (no setTimeout in source), so no
// fake timers are needed. It does call window.dispatchEvent in `notify`, hence
// the jsdom environment above.

const store = () => useNotificationStore.getState()

// Reset only data fields (no `replace: true`), preserving action implementations.
// `unreadCount` is stored explicitly (not derived), so it must be reset too.
beforeEach(() => {
  useNotificationStore.setState({
    notifications: [],
    progressItems: [],
    doNotDisturb: false,
    maxHistory: 200,
    unreadCount: 0,
    showCenter: false,
    filter: 'all',
  })
})

describe('notify', () => {
  it('creates a notification with defaults and returns its id', () => {
    const id = store().notify({ title: 'Hello' })
    expect(typeof id).toBe('string')
    expect(id).toMatch(/^notif-\d+$/)

    expect(store().notifications).toHaveLength(1)
    const n = store().notifications[0]
    expect(n.id).toBe(id)
    expect(n.title).toBe('Hello')
    expect(n.level).toBe('info') // default level
    expect(n.source).toBe('system') // default source
    expect(n.read).toBe(false)
    expect(n.pinned).toBe(false)
    expect(n.autoHide).toBe(true) // default autoHide via ??
    expect(n.hideAfterMs).toBe(5000) // default info hide time
    expect(typeof n.timestamp).toBe('number')
    expect(store().unreadCount).toBe(1)
  })

  it('honors explicit options and per-level default hideAfterMs', () => {
    const cb = vi.fn()
    const id = store().notify({
      level: 'error',
      source: 'git',
      title: 'Boom',
      message: 'msg',
      detail: 'detail',
      actions: [{ label: 'Retry', callback: cb }],
      groupKey: 'g1',
      pinned: true,
    })
    const n = store().notifications.find((x) => x.id === id)!
    expect(n.level).toBe('error')
    expect(n.source).toBe('git')
    expect(n.message).toBe('msg')
    expect(n.detail).toBe('detail')
    expect(n.pinned).toBe(true)
    expect(n.groupKey).toBe('g1')
    expect(n.hideAfterMs).toBe(8000) // error default
    expect(n.actions).toHaveLength(1)
    n.actions![0].callback()
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('uses per-level default hide times for each level', () => {
    store().notify({ level: 'warning', title: 'w' })
    store().notify({ level: 'success', title: 's' })
    store().notify({ level: 'info', title: 'i' })
    const byTitle = (t: string) => store().notifications.find((n) => n.title === t)!
    expect(byTitle('w').hideAfterMs).toBe(6000)
    expect(byTitle('s').hideAfterMs).toBe(4000)
    expect(byTitle('i').hideAfterMs).toBe(5000)
  })

  it('preserves an explicit autoHide=false (?? keeps the false)', () => {
    const id = store().notify({ title: 'sticky', autoHide: false, hideAfterMs: 1234 })
    const n = store().notifications.find((x) => x.id === id)!
    expect(n.autoHide).toBe(false)
    expect(n.hideAfterMs).toBe(1234)
  })

  it('prepends newest notifications (most recent first)', () => {
    store().notify({ title: 'first' })
    store().notify({ title: 'second' })
    expect(store().notifications.map((n) => n.title)).toEqual(['second', 'first'])
  })

  it('dispatches an orion:notification CustomEvent when not in DND', () => {
    const handler = vi.fn()
    window.addEventListener('orion:notification', handler)
    const id = store().notify({ title: 'event', message: 'hi' })
    expect(handler).toHaveBeenCalledTimes(1)
    const evt = handler.mock.calls[0][0] as CustomEvent
    expect(evt.detail).toMatchObject({ id, title: 'event', message: 'hi' })
    window.removeEventListener('orion:notification', handler)
  })

  it('does NOT dispatch the DOM event in do-not-disturb mode but still records it', () => {
    store().setDoNotDisturb(true)
    const handler = vi.fn()
    window.addEventListener('orion:notification', handler)
    store().notify({ title: 'silent' })
    expect(handler).not.toHaveBeenCalled()
    expect(store().notifications).toHaveLength(1)
    expect(store().unreadCount).toBe(1)
    window.removeEventListener('orion:notification', handler)
  })

  it('assigns unique, monotonically increasing ids across calls', () => {
    const a = store().notify({ title: 'a' })
    const b = store().notify({ title: 'b' })
    expect(a).not.toBe(b)
    const na = Number(a.split('-')[1])
    const nb = Number(b.split('-')[1])
    expect(nb).toBeGreaterThan(na)
  })
})

describe('convenience helpers', () => {
  it('info/success/warn/error set the matching level', () => {
    const iid = store().info('i', 'im')
    const sid = store().success('s')
    const wid = store().warn('w')
    const eid = store().error('e')
    const find = (id: string) => store().notifications.find((n) => n.id === id)!
    expect(find(iid).level).toBe('info')
    expect(find(iid).message).toBe('im')
    expect(find(sid).level).toBe('success')
    expect(find(wid).level).toBe('warning')
    expect(find(eid).level).toBe('error')
    expect(store().unreadCount).toBe(4)
  })
})

describe('dismiss / dismissAll', () => {
  it('dismiss removes a single notification by id', () => {
    const id = store().notify({ title: 'a' })
    store().notify({ title: 'b' })
    store().dismiss(id)
    expect(store().notifications.map((n) => n.title)).toEqual(['b'])
  })

  it('dismiss is a no-op for an unknown id', () => {
    store().notify({ title: 'a' })
    store().dismiss('does-not-exist')
    expect(store().notifications).toHaveLength(1)
  })

  it('dismiss decrements unreadCount when the dismissed item was unread', () => {
    const id = store().notify({ title: 'a' })
    expect(store().unreadCount).toBe(1)
    store().dismiss(id)
    expect(store().notifications).toHaveLength(0)
    expect(store().unreadCount).toBe(0)
  })

  it('dismiss does not change unreadCount when the dismissed item was already read', () => {
    const id = store().notify({ title: 'a' })
    store().markRead(id)
    expect(store().unreadCount).toBe(0)
    store().dismiss(id)
    expect(store().unreadCount).toBe(0)
  })

  it('dismissAll keeps only pinned notifications', () => {
    store().notify({ title: 'a' })
    store().notify({ title: 'pinned', pinned: true })
    store().notify({ title: 'c' })
    store().dismissAll()
    expect(store().notifications.map((n) => n.title)).toEqual(['pinned'])
  })

  it('dismissAll on an all-unpinned list empties it', () => {
    store().notify({ title: 'a' })
    store().notify({ title: 'b' })
    store().dismissAll()
    expect(store().notifications).toHaveLength(0)
  })
})

describe('read tracking + unreadCount', () => {
  it('markRead flips read and decrements unreadCount once', () => {
    const id = store().notify({ title: 'a' })
    store().notify({ title: 'b' })
    expect(store().unreadCount).toBe(2)
    store().markRead(id)
    expect(store().notifications.find((n) => n.id === id)!.read).toBe(true)
    expect(store().unreadCount).toBe(1)
  })

  it('markRead is idempotent (no double decrement on already-read item)', () => {
    const id = store().notify({ title: 'a' })
    store().notify({ title: 'b' })
    store().markRead(id)
    store().markRead(id) // second call must not decrement again
    expect(store().unreadCount).toBe(1)
  })

  it('markRead is a no-op for unknown id', () => {
    store().notify({ title: 'a' })
    store().markRead('nope')
    expect(store().unreadCount).toBe(1)
  })

  it('unreadCount never goes below zero', () => {
    const id = store().notify({ title: 'a' })
    // Force an inconsistent state where count is already 0 but item is unread.
    useNotificationStore.setState({ unreadCount: 0 })
    store().markRead(id)
    expect(store().unreadCount).toBe(0) // Math.max(0, ...) guard
  })

  it('markAllRead marks every notification read and zeroes the count', () => {
    store().notify({ title: 'a' })
    store().notify({ title: 'b' })
    store().markAllRead()
    expect(store().notifications.every((n) => n.read)).toBe(true)
    expect(store().unreadCount).toBe(0)
  })
})

describe('pin / unpin', () => {
  it('pin then unpin toggles the pinned flag', () => {
    const id = store().notify({ title: 'a' })
    store().pin(id)
    expect(store().notifications.find((n) => n.id === id)!.pinned).toBe(true)
    store().unpin(id)
    expect(store().notifications.find((n) => n.id === id)!.pinned).toBe(false)
  })

  it('pin protects a notification from dismissAll', () => {
    const id = store().notify({ title: 'a' })
    store().pin(id)
    store().dismissAll()
    expect(store().notifications.map((n) => n.id)).toContain(id)
  })

  it('pin/unpin are no-ops for unknown ids', () => {
    store().notify({ title: 'a' })
    expect(() => store().pin('x')).not.toThrow()
    expect(() => store().unpin('x')).not.toThrow()
    expect(store().notifications[0].pinned).toBe(false)
  })
})

describe('clearHistory', () => {
  it('removes unpinned notifications and resets unreadCount', () => {
    store().notify({ title: 'a' })
    store().notify({ title: 'keep', pinned: true })
    store().clearHistory()
    expect(store().notifications.map((n) => n.title)).toEqual(['keep'])
    expect(store().unreadCount).toBe(0)
  })

  // SUSPECTED BUG: clearHistory zeroes unreadCount but retains pinned items that
  // may still be unread, so the badge can under-count surviving unread items.
  it('zeroes unreadCount even when a surviving pinned item is still unread', () => {
    store().notify({ title: 'keep', pinned: true }) // unread + pinned
    expect(store().notifications[0].read).toBe(false)
    store().clearHistory()
    expect(store().notifications[0].read).toBe(false) // still unread...
    expect(store().unreadCount).toBe(0) // ...but count says zero (documents bug)
  })
})

describe('maxHistory cap', () => {
  it('caps stored notifications at maxHistory, keeping the newest', () => {
    useNotificationStore.setState({ maxHistory: 3 })
    for (let i = 0; i < 6; i++) store().notify({ title: `n${i}` })
    expect(store().notifications).toHaveLength(3)
    // newest prepended -> n5 first, oldest kept is n3
    expect(store().notifications.map((n) => n.title)).toEqual(['n5', 'n4', 'n3'])
  })

  // NOTE: unreadCount is incremented per notify and is NOT clamped to maxHistory,
  // so after capping it exceeds notifications.length. Pinning current behavior.
  it('unreadCount keeps counting past the maxHistory cap', () => {
    useNotificationStore.setState({ maxHistory: 2 })
    for (let i = 0; i < 5; i++) store().notify({ title: `n${i}` })
    expect(store().notifications).toHaveLength(2)
    expect(store().unreadCount).toBe(5)
  })
})

describe('filtering helpers (categories / source)', () => {
  it('getBySource returns only notifications of that source', () => {
    store().notify({ title: 'g1', source: 'git' })
    store().notify({ title: 'e1', source: 'editor' })
    store().notify({ title: 'g2', source: 'git' })
    const git = store().getBySource('git')
    expect(git.map((n) => n.title).sort()).toEqual(['g1', 'g2'])
    expect(store().getBySource('ai')).toHaveLength(0)
  })

  it('setFilter updates the filter field', () => {
    expect(store().filter).toBe('all')
    store().setFilter('terminal')
    expect(store().filter).toBe('terminal')
    store().setFilter('all')
    expect(store().filter).toBe('all')
  })

  it('getGrouped groups by groupKey and falls back to id when absent', () => {
    store().notify({ title: 'a', groupKey: 'build' })
    store().notify({ title: 'b', groupKey: 'build' })
    const loneId = store().notify({ title: 'c' }) // no groupKey
    const grouped = store().getGrouped()
    expect(grouped.get('build')!.map((n) => n.title).sort()).toEqual(['a', 'b'])
    expect(grouped.get(loneId)!).toHaveLength(1)
    expect(grouped.get(loneId)![0].title).toBe('c')
  })
})

describe('settings: doNotDisturb / showCenter', () => {
  it('setDoNotDisturb sets the flag', () => {
    store().setDoNotDisturb(true)
    expect(store().doNotDisturb).toBe(true)
    store().setDoNotDisturb(false)
    expect(store().doNotDisturb).toBe(false)
  })

  it('toggleCenter flips showCenter', () => {
    expect(store().showCenter).toBe(false)
    store().toggleCenter()
    expect(store().showCenter).toBe(true)
    store().toggleCenter()
    expect(store().showCenter).toBe(false)
  })
})

describe('progress notifications', () => {
  it('startProgress adds an indeterminate progress item and returns its id', () => {
    const id = store().startProgress('Indexing')
    expect(id).toMatch(/^progress-\d+$/)
    expect(store().progressItems).toHaveLength(1)
    const p = store().progressItems[0]
    expect(p.id).toBe(id)
    expect(p.title).toBe('Indexing')
    expect(p.progress).toBe(-1) // indeterminate
    expect(p.cancellable).toBe(false)
    expect(typeof p.startTime).toBe('number')
  })

  it('updateProgress clamps progress into [-1, 100] and sets message', () => {
    const id = store().startProgress('Job')
    store().updateProgress(id, 250, 'almost')
    expect(store().progressItems[0].progress).toBe(100) // clamped high
    expect(store().progressItems[0].message).toBe('almost')
    store().updateProgress(id, -50)
    expect(store().progressItems[0].progress).toBe(-1) // clamped low
  })

  it('updateProgress preserves the existing message when omitted', () => {
    const id = store().startProgress('Job')
    store().updateProgress(id, 10, 'hi')
    expect(store().progressItems[0].message).toBe('hi')
    store().updateProgress(id, 20) // no message arg
    // message is only written when provided (conditional spread), so it survives.
    expect(store().progressItems[0].message).toBe('hi')
    expect(store().progressItems[0].progress).toBe(20)
  })

  it('completeProgress removes the item and optionally emits a success notification', () => {
    const id = store().startProgress('Build')
    store().completeProgress(id, 'Build done')
    expect(store().progressItems).toHaveLength(0)
    // success notification created from the message
    expect(store().notifications).toHaveLength(1)
    expect(store().notifications[0].level).toBe('success')
    expect(store().notifications[0].title).toBe('Build done')
  })

  it('completeProgress without a message does not create a notification', () => {
    const id = store().startProgress('Build')
    store().completeProgress(id)
    expect(store().progressItems).toHaveLength(0)
    expect(store().notifications).toHaveLength(0)
  })

  it('cancelProgress invokes onCancel and removes the item', () => {
    const onCancel = vi.fn()
    const id = store().startProgress('Download', true, onCancel)
    expect(store().progressItems[0].cancellable).toBe(true)
    store().cancelProgress(id)
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(store().progressItems).toHaveLength(0)
  })

  it('cancelProgress without an onCancel handler still removes the item', () => {
    const id = store().startProgress('Download')
    expect(() => store().cancelProgress(id)).not.toThrow()
    expect(store().progressItems).toHaveLength(0)
  })

  it('updateProgress on an unknown id leaves items untouched', () => {
    const id = store().startProgress('Job')
    store().updateProgress('unknown', 50)
    expect(store().progressItems.find((p) => p.id === id)!.progress).toBe(-1)
  })
})

describe('persistence', () => {
  // The notifications store uses a plain create() with no persist() middleware,
  // so nothing is written to localStorage. This documents that intentional
  // absence so a future regression (or accidental persistence) is caught.
  it('does not write to localStorage on notify', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    store().notify({ title: 'a' })
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })
})
