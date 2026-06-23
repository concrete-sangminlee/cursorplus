import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorGroupStore, type EditorGroup, type EditorLayout } from './editorGroups'

/**
 * Tests for the split-editor groups store (editorGroups.ts).
 *
 * The store is a module-level zustand singleton. We import it, mutate via the
 * action methods, and read back through `.getState()`. Per project rules we
 * reset only the mutable DATA fields in `beforeEach` (no `replace: true`), which
 * keeps the action implementations intact.
 *
 * NOTE on IDs: group/tab IDs embed `Date.now()` + a 3-char random suffix.
 * Because several creations can happen within the same millisecond, IDs are NOT
 * guaranteed unique in theory. Tests below avoid relying on cross-call ID
 * uniqueness except where the production code itself depends on it (flagged).
 */

const store = () => useEditorGroupStore.getState()

/** Build a clean single-group layout for a deterministic starting point. */
function freshLayout(): EditorLayout {
  return {
    type: 'single',
    groups: [
      { id: 'group-default', tabs: [], activeTabId: null, width: 100, height: 100 },
    ],
    activeGroupId: 'group-default',
    ratio: [100],
  }
}

beforeEach(() => {
  // Reset only data fields; leave action implementations alone.
  useEditorGroupStore.setState({
    layout: structuredClone(freshLayout()),
    maxGroups: 4,
    closedTabs: [],
    maxClosedTabs: 20,
  })
})

/* ── Tab opening ───────────────────────────────────────── */

describe('openTab', () => {
  it('adds a new tab, derives fileName, and marks it active', () => {
    const id = store().openTab('group-default', 'C:\\proj\\src\\index.ts')
    const group = store().getActiveGroup()
    expect(group.tabs).toHaveLength(1)
    const tab = group.tabs[0]
    expect(tab.id).toBe(id)
    expect(tab.filePath).toBe('C:\\proj\\src\\index.ts')
    // getFileName normalizes backslashes and takes the basename.
    expect(tab.fileName).toBe('index.ts')
    expect(tab.isPreview).toBe(false)
    expect(tab.isPinned).toBe(false)
    expect(group.activeTabId).toBe(id)
  })

  it('does not duplicate an already-open file; reactivates existing tab', () => {
    const first = store().openTab('group-default', '/a.ts')
    store().openTab('group-default', '/b.ts')
    const again = store().openTab('group-default', '/a.ts')
    expect(again).toBe(first)
    expect(store().getGroupTabs('group-default')).toHaveLength(2)
    // Re-opening reactivates it.
    expect(store().getActiveGroup().activeTabId).toBe(first)
  })

  it('promotes an existing preview tab to permanent when reopened non-preview', () => {
    const id = store().openTab('group-default', '/p.ts', { preview: true })
    expect(store().getGroupTabs('group-default')[0].isPreview).toBe(true)
    store().openTab('group-default', '/p.ts') // non-preview reopen
    const tab = store().getGroupTabs('group-default').find(t => t.id === id)!
    expect(tab.isPreview).toBe(false)
  })

  it('replaces the existing preview tab in place when opening a new preview file', () => {
    store().openTab('group-default', '/first.ts', { preview: true })
    const second = store().openTab('group-default', '/second.ts', { preview: true })
    const tabs = store().getGroupTabs('group-default')
    // Preview slot reused: still only one tab, now pointing at second file.
    expect(tabs).toHaveLength(1)
    expect(tabs[0].id).toBe(second)
    expect(tabs[0].filePath).toBe('/second.ts')
    expect(store().getActiveGroup().activeTabId).toBe(second)
  })

  it('honors pinned option', () => {
    store().openTab('group-default', '/x.ts', { pinned: true })
    expect(store().getGroupTabs('group-default')[0].isPinned).toBe(true)
  })
})

/* ── Splitting / creating groups ───────────────────────── */

describe('splitEditor', () => {
  it('creates a second group, switches to split, sets it active and even ratio', () => {
    const newId = store().splitEditor('vertical')
    const { layout } = store()
    expect(layout.groups).toHaveLength(2)
    expect(layout.type).toBe('split')
    expect(layout.direction).toBe('vertical')
    expect(layout.activeGroupId).toBe(newId)
    expect(layout.ratio).toEqual([50, 50])
  })

  it('copies the specified tab into the new group when tabId is given', () => {
    const tabId = store().openTab('group-default', '/dup.ts')
    const newGroupId = store().splitEditor('horizontal', tabId)
    const newGroup = store().layout.groups.find(g => g.id === newGroupId)!
    expect(newGroup.tabs).toHaveLength(1)
    expect(newGroup.tabs[0].filePath).toBe('/dup.ts')
    expect(newGroup.activeTabId).toBe(tabId)
    // Original group still keeps its copy (this is a copy, not a move).
    expect(store().getGroupTabs('group-default')).toHaveLength(1)
  })

  it('refuses to exceed maxGroups and returns the last existing group id', () => {
    useEditorGroupStore.setState({ maxGroups: 2 })
    const second = store().splitEditor('vertical')
    expect(store().layout.groups).toHaveLength(2)
    // At cap now: another split is a no-op returning the last group's id.
    const result = store().splitEditor('vertical')
    expect(store().layout.groups).toHaveLength(2)
    expect(result).toBe(second)
  })

  it('produces three even thirds (floored) for a third group', () => {
    store().splitEditor('vertical')
    store().splitEditor('vertical')
    expect(store().layout.groups).toHaveLength(3)
    // Math.floor(100/3) = 33 for each slot.
    expect(store().layout.ratio).toEqual([33, 33, 33])
  })
})

/* ── Active group selection ────────────────────────────── */

describe('active group selection', () => {
  it('getActiveGroup returns the activeGroupId group', () => {
    const newId = store().splitEditor('vertical')
    expect(store().getActiveGroup().id).toBe(newId)
  })

  it('setActiveGroup changes the active group', () => {
    store().splitEditor('vertical')
    store().setActiveGroup('group-default')
    expect(store().getActiveGroup().id).toBe('group-default')
  })

  it('getActiveGroup falls back to first group when activeGroupId is stale', () => {
    useEditorGroupStore.setState(s => ({ layout: { ...s.layout, activeGroupId: 'nonexistent' } }))
    expect(store().getActiveGroup().id).toBe('group-default')
  })
})

/* ── Moving tabs between groups ────────────────────────── */

describe('moveTab', () => {
  it('moves a tab from one group to another and reassigns active groups/tabs', () => {
    const tabId = store().openTab('group-default', '/move.ts')
    store().openTab('group-default', '/stay.ts')
    const targetId = store().splitEditor('vertical')

    store().moveTab('group-default', targetId, tabId)

    const from = store().layout.groups.find(g => g.id === 'group-default')!
    const to = store().layout.groups.find(g => g.id === targetId)!
    expect(from.tabs.map(t => t.filePath)).toEqual(['/stay.ts'])
    expect(to.tabs.map(t => t.filePath)).toEqual(['/move.ts'])
    // Source group's active tab becomes the last remaining tab.
    expect(from.activeTabId).toBe(from.tabs[from.tabs.length - 1].id)
    // Moved tab is active in the destination, which becomes active group.
    expect(to.activeTabId).toBe(tabId)
    expect(store().layout.activeGroupId).toBe(targetId)
  })

  it('sets source activeTabId to null when the moved tab was the only one', () => {
    const tabId = store().openTab('group-default', '/solo.ts')
    const targetId = store().splitEditor('vertical')
    store().moveTab('group-default', targetId, tabId)
    const from = store().layout.groups.find(g => g.id === 'group-default')!
    expect(from.tabs).toHaveLength(0)
    expect(from.activeTabId).toBeNull()
  })

  it('is a no-op when the source group does not exist', () => {
    const tabId = store().openTab('group-default', '/x.ts')
    const before = structuredClone(store().layout)
    store().moveTab('ghost-group', 'group-default', tabId)
    expect(store().layout).toEqual(before)
  })

  it('is a no-op when the tab does not exist in the source group', () => {
    store().openTab('group-default', '/x.ts')
    const targetId = store().splitEditor('vertical')
    const before = structuredClone(store().layout)
    store().moveTab('group-default', targetId, 'ghost-tab')
    expect(store().layout).toEqual(before)
  })

  it('moving to a nonexistent destination drops the tab from source without re-homing it', () => {
    // SUSPECTED BUG: moveTab removes the tab from the source group but, since the
    // destination id matches no group, the tab is silently lost (no group gains
    // it). The active group is still switched to the missing id. Pinning current
    // behavior here.
    const tabId = store().openTab('group-default', '/lost.ts')
    store().moveTab('group-default', 'no-such-group', tabId)
    expect(store().findTabByFilePath('/lost.ts')).toBeUndefined()
    expect(store().isFileOpen('/lost.ts')).toBe(false)
    expect(store().layout.activeGroupId).toBe('no-such-group')
  })
})

/* ── Closing tabs (active reassignment) ────────────────── */

describe('closeTab', () => {
  it('removes the tab and records it in closedTabs history', () => {
    store().openTab('group-default', '/keep.ts')
    const closeId = store().openTab('group-default', '/gone.ts')
    store().closeTab('group-default', closeId)
    expect(store().getGroupTabs('group-default').map(t => t.filePath)).toEqual(['/keep.ts'])
    expect(store().closedTabs[0]).toMatchObject({ filePath: '/gone.ts', groupId: 'group-default' })
  })

  it('reassigns active tab to the same index when a middle active tab is closed', () => {
    store().openTab('group-default', '/a.ts')
    const bId = store().openTab('group-default', '/b.ts')
    store().openTab('group-default', '/c.ts')
    store().setActiveTab('group-default', bId) // active = middle
    store().closeTab('group-default', bId)
    // Index 1 now holds /c.ts, which should become active.
    expect(store().getActiveGroup().activeTabId).toBe(store().getGroupTabs('group-default')[1].id)
    expect(store().getGroupTabs('group-default')[1].filePath).toBe('/c.ts')
  })

  it('reassigns active tab to the new last tab when the last active tab is closed', () => {
    store().openTab('group-default', '/a.ts')
    const lastId = store().openTab('group-default', '/b.ts') // last + active
    store().closeTab('group-default', lastId)
    const tabs = store().getGroupTabs('group-default')
    expect(store().getActiveGroup().activeTabId).toBe(tabs[tabs.length - 1].id)
    expect(tabs[tabs.length - 1].filePath).toBe('/a.ts')
  })

  it('sets activeTabId to null when the last remaining tab is closed', () => {
    const id = store().openTab('group-default', '/only.ts')
    store().closeTab('group-default', id)
    expect(store().getGroupTabs('group-default')).toHaveLength(0)
    expect(store().getActiveGroup().activeTabId).toBeNull()
  })

  it('does not change active tab when a non-active tab is closed', () => {
    const aId = store().openTab('group-default', '/a.ts')
    const bId = store().openTab('group-default', '/b.ts') // active
    store().closeTab('group-default', aId)
    expect(store().getActiveGroup().activeTabId).toBe(bId)
  })

  it('caps closedTabs history at maxClosedTabs', () => {
    useEditorGroupStore.setState({ maxClosedTabs: 3 })
    for (let i = 0; i < 5; i++) {
      const id = store().openTab('group-default', `/f${i}.ts`)
      store().closeTab('group-default', id)
    }
    expect(store().closedTabs).toHaveLength(3)
    // Most recent close sits at the front.
    expect(store().closedTabs[0].filePath).toBe('/f4.ts')
  })

  it('is a no-op when closing in a nonexistent group', () => {
    store().openTab('group-default', '/a.ts')
    const before = structuredClone(store().layout)
    store().closeTab('ghost', 'whatever')
    expect(store().layout).toEqual(before)
  })
})

/* ── Bulk tab closing ──────────────────────────────────── */

describe('bulk close operations', () => {
  it('closeOtherTabs keeps the target plus pinned tabs and activates target', () => {
    const keepId = store().openTab('group-default', '/keep.ts')
    store().openTab('group-default', '/drop.ts')
    const pinId = store().openTab('group-default', '/pinned.ts', { pinned: true })
    store().closeOtherTabs('group-default', keepId)
    const paths = store().getGroupTabs('group-default').map(t => t.filePath)
    expect(paths).toContain('/keep.ts')
    expect(paths).toContain('/pinned.ts')
    expect(paths).not.toContain('/drop.ts')
    expect(store().getActiveGroup().activeTabId).toBe(keepId)
    expect(pinId).toBeTruthy()
  })

  it('closeTabsToRight removes tabs after the target (keeping pinned)', () => {
    store().openTab('group-default', '/a.ts')
    const bId = store().openTab('group-default', '/b.ts')
    store().openTab('group-default', '/c.ts')
    store().openTab('group-default', '/d.ts', { pinned: true })
    store().closeTabsToRight('group-default', bId)
    const paths = store().getGroupTabs('group-default').map(t => t.filePath)
    expect(paths).toEqual(['/a.ts', '/b.ts', '/d.ts']) // /c.ts removed, pinned /d.ts kept
  })

  it('closeTabsToLeft removes tabs before the target (keeping pinned)', () => {
    store().openTab('group-default', '/a.ts', { pinned: true })
    store().openTab('group-default', '/b.ts')
    const cId = store().openTab('group-default', '/c.ts')
    store().openTab('group-default', '/d.ts')
    store().closeTabsToLeft('group-default', cId)
    const paths = store().getGroupTabs('group-default').map(t => t.filePath)
    expect(paths).toEqual(['/a.ts', '/c.ts', '/d.ts']) // /b.ts removed, pinned /a.ts kept
  })

  it('closeAllTabs keeps only pinned tabs and clears active', () => {
    store().openTab('group-default', '/a.ts')
    store().openTab('group-default', '/b.ts', { pinned: true })
    store().closeAllTabs('group-default')
    expect(store().getGroupTabs('group-default').map(t => t.filePath)).toEqual(['/b.ts'])
    expect(store().getActiveGroup().activeTabId).toBeNull()
  })

  it('closeSavedTabs keeps modified or pinned tabs', () => {
    const aId = store().openTab('group-default', '/a.ts') // saved -> removed
    store().openTab('group-default', '/b.ts', { pinned: true }) // pinned -> kept
    const cId = store().openTab('group-default', '/c.ts')
    store().updateTabState('group-default', cId, { isModified: true }) // modified -> kept
    store().closeSavedTabs('group-default')
    const paths = store().getGroupTabs('group-default').map(t => t.filePath)
    expect(paths).toEqual(['/b.ts', '/c.ts'])
    expect(aId).toBeTruthy()
  })
})

/* ── Closing a group ───────────────────────────────────── */

describe('closeGroup', () => {
  it('removes a group, reverts to single layout, and reassigns active group', () => {
    const second = store().splitEditor('vertical') // now 2 groups, second active
    store().closeGroup(second)
    expect(store().layout.groups).toHaveLength(1)
    expect(store().layout.type).toBe('single')
    // Active group was the closed one -> falls back to groups[0].
    expect(store().layout.activeGroupId).toBe(store().layout.groups[0].id)
    expect(store().layout.ratio).toEqual([100])
  })

  it('keeps the existing active group when a different group is closed', () => {
    store().splitEditor('vertical')          // group 2 active
    store().setActiveGroup('group-default')  // keep group-default active
    const third = store().splitEditor('vertical') // group 3 active...
    store().setActiveGroup('group-default')  // ...back to default
    store().closeGroup(third)
    expect(store().layout.activeGroupId).toBe('group-default')
    expect(store().layout.groups).toHaveLength(2)
    expect(store().layout.type).toBe('split')
  })

  it('closing the last group replaces it with a fresh empty group', () => {
    const onlyId = store().layout.groups[0].id
    store().openTab(onlyId, '/x.ts')
    store().closeGroup(onlyId)
    // Group list never empties: a brand-new group is pushed in.
    expect(store().layout.groups).toHaveLength(1)
    expect(store().layout.groups[0].id).not.toBe(onlyId)
    expect(store().layout.groups[0].tabs).toHaveLength(0)
    expect(store().layout.type).toBe('single')
    expect(store().layout.activeGroupId).toBe(store().layout.groups[0].id)
  })

  it('discards the closed group tabs (closeGroup does not migrate them)', () => {
    // Documents current behavior: tabs in a closed group are NOT moved elsewhere.
    const second = store().splitEditor('vertical')
    store().openTab(second, '/inside.ts')
    store().closeGroup(second)
    expect(store().isFileOpen('/inside.ts')).toBe(false)
  })
})

/* ── mergeGroups ───────────────────────────────────────── */

describe('mergeGroups', () => {
  it('combines all tabs into one group, de-duplicating by filePath', () => {
    store().openTab('group-default', '/shared.ts')
    store().openTab('group-default', '/a.ts')
    const second = store().splitEditor('vertical')
    store().openTab(second, '/shared.ts') // duplicate path
    store().openTab(second, '/b.ts')

    store().mergeGroups()

    const { layout } = store()
    expect(layout.groups).toHaveLength(1)
    expect(layout.type).toBe('single')
    const paths = layout.groups[0].tabs.map(t => t.filePath)
    expect(paths).toEqual(['/shared.ts', '/a.ts', '/b.ts']) // /shared.ts only once
    // Active tab is the last collected tab.
    expect(layout.groups[0].activeTabId).toBe(layout.groups[0].tabs[paths.length - 1].id)
    expect(layout.ratio).toEqual([100])
  })

  it('produces a group with null active tab when there are no tabs', () => {
    store().splitEditor('vertical')
    store().mergeGroups()
    expect(store().layout.groups).toHaveLength(1)
    expect(store().layout.groups[0].activeTabId).toBeNull()
  })
})

/* ── Group/tab ordering ────────────────────────────────── */

describe('reorderTab', () => {
  it('moves a tab from one index to another within a group', () => {
    store().openTab('group-default', '/a.ts')
    store().openTab('group-default', '/b.ts')
    store().openTab('group-default', '/c.ts')
    store().reorderTab('group-default', 0, 2) // move /a.ts to the end
    expect(store().getGroupTabs('group-default').map(t => t.filePath)).toEqual(['/b.ts', '/c.ts', '/a.ts'])
  })

  it('reorders backwards (last to first)', () => {
    store().openTab('group-default', '/a.ts')
    store().openTab('group-default', '/b.ts')
    store().openTab('group-default', '/c.ts')
    store().reorderTab('group-default', 2, 0)
    expect(store().getGroupTabs('group-default').map(t => t.filePath)).toEqual(['/c.ts', '/a.ts', '/b.ts'])
  })

  it('leaves other groups untouched', () => {
    store().openTab('group-default', '/a.ts')
    store().openTab('group-default', '/b.ts')
    const other = store().splitEditor('vertical')
    store().openTab(other, '/z.ts')
    store().reorderTab('group-default', 0, 1)
    expect(store().getGroupTabs(other).map(t => t.filePath)).toEqual(['/z.ts'])
  })
})

/* ── Pin / unpin and updateTabState ────────────────────── */

describe('pin / unpin / updateTabState', () => {
  it('pinTab sets pinned and clears preview', () => {
    const id = store().openTab('group-default', '/p.ts', { preview: true })
    store().pinTab('group-default', id)
    const tab = store().getGroupTabs('group-default')[0]
    expect(tab.isPinned).toBe(true)
    expect(tab.isPreview).toBe(false)
  })

  it('unpinTab clears pinned', () => {
    const id = store().openTab('group-default', '/p.ts', { pinned: true })
    store().unpinTab('group-default', id)
    expect(store().getGroupTabs('group-default')[0].isPinned).toBe(false)
  })

  it('updateTabState merges partial updates onto the matching tab only', () => {
    const aId = store().openTab('group-default', '/a.ts')
    store().openTab('group-default', '/b.ts')
    store().updateTabState('group-default', aId, { cursorLine: 42, scrollTop: 100, isModified: true })
    const a = store().getGroupTabs('group-default').find(t => t.id === aId)!
    const b = store().getGroupTabs('group-default').find(t => t.filePath === '/b.ts')!
    expect(a).toMatchObject({ cursorLine: 42, scrollTop: 100, isModified: true })
    expect(b.cursorLine).toBe(1) // untouched
  })
})

/* ── setActiveTab ──────────────────────────────────────── */

describe('setActiveTab', () => {
  it('sets the active tab and switches the active group to that group', () => {
    const second = store().splitEditor('vertical')
    store().setActiveGroup('group-default')
    const tabId = store().openTab(second, '/s.ts')
    // Manually flip active group away, then setActiveTab should bring it back.
    store().setActiveGroup('group-default')
    store().setActiveTab(second, tabId)
    expect(store().layout.activeGroupId).toBe(second)
    expect(store().layout.groups.find(g => g.id === second)!.activeTabId).toBe(tabId)
  })
})

/* ── reopenClosedTab ───────────────────────────────────── */

describe('reopenClosedTab', () => {
  it('reopens the most recently closed tab into its original group and pops history', () => {
    store().openTab('group-default', '/keep.ts')
    const closeId = store().openTab('group-default', '/reopen.ts')
    store().closeTab('group-default', closeId)
    expect(store().closedTabs).toHaveLength(1)

    const reopenedId = store().reopenClosedTab()
    expect(reopenedId).toBeTruthy()
    expect(store().isFileOpen('/reopen.ts')).toBe(true)
    expect(store().closedTabs).toHaveLength(0)
  })

  it('returns undefined when there is nothing to reopen', () => {
    expect(store().reopenClosedTab()).toBeUndefined()
  })

  it('falls back to the first group when the original group is gone', () => {
    const second = store().splitEditor('vertical')
    const id = store().openTab(second, '/orphan.ts')
    store().closeTab(second, id)       // recorded with groupId = second
    store().closeGroup(second)         // original group disappears
    const reopened = store().reopenClosedTab()
    expect(reopened).toBeTruthy()
    expect(store().isFileOpen('/orphan.ts')).toBe(true)
  })
})

/* ── Layout helpers ────────────────────────────────────── */

describe('layout helpers', () => {
  it('setSplitRatio replaces the ratio array', () => {
    store().splitEditor('vertical')
    store().setSplitRatio([70, 30])
    expect(store().layout.ratio).toEqual([70, 30])
  })

  it('resetLayout returns to a single fresh empty group', () => {
    store().openTab('group-default', '/a.ts')
    store().splitEditor('vertical')
    store().resetLayout()
    const { layout } = store()
    expect(layout.type).toBe('single')
    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0].tabs).toHaveLength(0)
    expect(layout.ratio).toEqual([100])
    expect(layout.activeGroupId).toBe(layout.groups[0].id)
  })
})

/* ── Query helpers ─────────────────────────────────────── */

describe('query helpers', () => {
  it('findTabByFilePath locates a tab across groups', () => {
    store().openTab('group-default', '/a.ts')
    const second = store().splitEditor('vertical')
    store().openTab(second, '/b.ts')
    const found = store().findTabByFilePath('/b.ts')
    expect(found?.groupId).toBe(second)
    expect(found?.tab.filePath).toBe('/b.ts')
  })

  it('findTabByFilePath returns undefined when absent', () => {
    expect(store().findTabByFilePath('/nope.ts')).toBeUndefined()
  })

  it('getGroupTabs returns [] for an unknown group', () => {
    expect(store().getGroupTabs('ghost')).toEqual([])
  })

  it('getActiveTab returns the active group active tab', () => {
    const id = store().openTab('group-default', '/a.ts')
    expect(store().getActiveTab()?.id).toBe(id)
  })

  it('getActiveTab returns undefined when active group has no active tab', () => {
    expect(store().getActiveTab()).toBeUndefined()
  })

  it('isFileOpen reflects open state across groups', () => {
    expect(store().isFileOpen('/a.ts')).toBe(false)
    const second = store().splitEditor('vertical')
    store().openTab(second, '/a.ts')
    expect(store().isFileOpen('/a.ts')).toBe(true)
  })
})

// Type-only reference so the EditorGroup import is exercised.
const _typeCheck: EditorGroup | undefined = undefined
void _typeCheck
