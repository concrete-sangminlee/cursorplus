/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { useBookmarkStore } from './bookmarks'
import type { BookmarkGroup } from './bookmarks'

/* The default groups baked into the store. Cloned so tests get a fresh array. */
const DEFAULT_GROUPS: BookmarkGroup[] = [
  { id: 'todo', name: 'TODO', color: '#f0883e', collapsed: false, sortOrder: 0 },
  { id: 'important', name: 'Important', color: '#f85149', collapsed: false, sortOrder: 1 },
  { id: 'review', name: 'Review', color: '#a371f7', collapsed: false, sortOrder: 2 },
  { id: 'reference', name: 'Reference', color: '#58a6ff', collapsed: false, sortOrder: 3 },
]

const store = useBookmarkStore

function reset() {
  store.setState({
    bookmarks: [],
    groups: DEFAULT_GROUPS.map(g => ({ ...g })),
    activeGroup: null,
    sortBy: 'file',
    showLabels: true,
    showNotes: false,
  })
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

describe('addBookmark', () => {
  it('adds a bookmark with generated id, default column and timestamp', () => {
    const bm = store.getState().addBookmark('/a.ts', 10)
    expect(store.getState().bookmarks).toHaveLength(1)
    expect(bm.filePath).toBe('/a.ts')
    expect(bm.line).toBe(10)
    expect(bm.column).toBe(1) // default column
    expect(bm.id).toMatch(/^bm-/)
    expect(bm.createdAt).toBeGreaterThan(0)
    expect(store.getState().bookmarks[0]).toBe(bm)
  })

  it('honors options (column, label, color, group, note)', () => {
    const bm = store.getState().addBookmark('/a.ts', 5, {
      column: 7,
      label: 'fix me',
      color: '#abcdef',
      group: 'todo',
      note: 'a note',
    })
    expect(bm.column).toBe(7)
    expect(bm.label).toBe('fix me')
    expect(bm.color).toBe('#abcdef')
    expect(bm.group).toBe('todo')
    expect(bm.note).toBe('a note')
  })

  it('assigns group from activeGroup when no group option given', () => {
    store.getState().setActiveGroup('review')
    const bm = store.getState().addBookmark('/a.ts', 1)
    expect(bm.group).toBe('review')
  })

  it('leaves group undefined when no option and no active group', () => {
    const bm = store.getState().addBookmark('/a.ts', 1)
    expect(bm.group).toBeUndefined()
  })

  it('cycles a default color based on bookmark count', () => {
    const first = store.getState().addBookmark('/a.ts', 1)
    const second = store.getState().addBookmark('/a.ts', 2)
    // First uses index 0, second uses index 1 of the palette -> distinct colors.
    expect(first.color).toBe('#58a6ff')
    expect(second.color).toBe('#3fb950')
  })

  it('allows duplicate bookmarks on the same file+line', () => {
    store.getState().addBookmark('/a.ts', 3)
    store.getState().addBookmark('/a.ts', 3)
    expect(store.getState().bookmarks).toHaveLength(2)
  })
})

describe('removeBookmark', () => {
  it('removes the bookmark with the matching id', () => {
    const a = store.getState().addBookmark('/a.ts', 1)
    const b = store.getState().addBookmark('/a.ts', 2)
    store.getState().removeBookmark(a.id)
    expect(store.getState().bookmarks).toHaveLength(1)
    expect(store.getState().bookmarks[0].id).toBe(b.id)
  })

  it('is a no-op when removing a nonexistent id', () => {
    store.getState().addBookmark('/a.ts', 1)
    store.getState().removeBookmark('does-not-exist')
    expect(store.getState().bookmarks).toHaveLength(1)
  })
})

describe('toggleBookmark', () => {
  it('adds a bookmark when none exists at the line', () => {
    store.getState().toggleBookmark('/a.ts', 9)
    expect(store.getState().hasBookmark('/a.ts', 9)).toBe(true)
    expect(store.getState().bookmarks).toHaveLength(1)
  })

  it('removes the bookmark when one already exists at the line', () => {
    store.getState().addBookmark('/a.ts', 9)
    store.getState().toggleBookmark('/a.ts', 9)
    expect(store.getState().hasBookmark('/a.ts', 9)).toBe(false)
    expect(store.getState().bookmarks).toHaveLength(0)
  })

  it('removes only the first matching bookmark when duplicates exist', () => {
    store.getState().addBookmark('/a.ts', 9)
    store.getState().addBookmark('/a.ts', 9)
    store.getState().toggleBookmark('/a.ts', 9)
    // getBookmarkAt finds the first; only that one is removed.
    expect(store.getState().bookmarks).toHaveLength(1)
  })
})

describe('updateBookmark', () => {
  it('merges updates into the matching bookmark only', () => {
    const a = store.getState().addBookmark('/a.ts', 1)
    const b = store.getState().addBookmark('/b.ts', 2)
    store.getState().updateBookmark(a.id, { label: 'updated', line: 42 })
    const updated = store.getState().bookmarks.find(x => x.id === a.id)!
    expect(updated.label).toBe('updated')
    expect(updated.line).toBe(42)
    expect(updated.filePath).toBe('/a.ts') // untouched
    expect(store.getState().bookmarks.find(x => x.id === b.id)!.label).toBeUndefined()
  })

  it('is a no-op for an unknown id', () => {
    const a = store.getState().addBookmark('/a.ts', 1)
    store.getState().updateBookmark('nope', { label: 'x' })
    expect(store.getState().bookmarks.find(x => x.id === a.id)!.label).toBeUndefined()
  })
})

describe('clearAll / clearFile', () => {
  it('clearAll empties all bookmarks but leaves groups intact', () => {
    store.getState().addBookmark('/a.ts', 1)
    store.getState().addBookmark('/b.ts', 2)
    store.getState().clearAll()
    expect(store.getState().bookmarks).toHaveLength(0)
    expect(store.getState().groups).toHaveLength(DEFAULT_GROUPS.length)
  })

  it('clearFile removes only bookmarks for the given file', () => {
    store.getState().addBookmark('/a.ts', 1)
    store.getState().addBookmark('/a.ts', 2)
    store.getState().addBookmark('/b.ts', 3)
    store.getState().clearFile('/a.ts')
    const remaining = store.getState().bookmarks
    expect(remaining).toHaveLength(1)
    expect(remaining[0].filePath).toBe('/b.ts')
  })

  it('clearFile is a no-op for a file with no bookmarks', () => {
    store.getState().addBookmark('/a.ts', 1)
    store.getState().clearFile('/nope.ts')
    expect(store.getState().bookmarks).toHaveLength(1)
  })
})

describe('groups', () => {
  it('addGroup appends a group with incremented sortOrder and palette color', () => {
    const before = store.getState().groups.length
    const g = store.getState().addGroup('Custom')
    expect(store.getState().groups).toHaveLength(before + 1)
    expect(g.name).toBe('Custom')
    expect(g.sortOrder).toBe(before)
    expect(g.collapsed).toBe(false)
    expect(g.id).toMatch(/^grp-/)
    // 4 default groups -> palette index 4
    expect(g.color).toBe('#a371f7')
  })

  it('addGroup honors an explicit color', () => {
    const g = store.getState().addGroup('Custom', '#123456')
    expect(g.color).toBe('#123456')
  })

  it('removeGroup deletes the group and unassigns its bookmarks', () => {
    const bm = store.getState().addBookmark('/a.ts', 1, { group: 'todo' })
    store.getState().removeGroup('todo')
    expect(store.getState().groups.some(g => g.id === 'todo')).toBe(false)
    expect(store.getState().bookmarks.find(b => b.id === bm.id)!.group).toBeUndefined()
  })

  it('updateGroup merges updates into the matching group only', () => {
    store.getState().updateGroup('todo', { name: 'To Do!', color: '#000000' })
    const g = store.getState().groups.find(x => x.id === 'todo')!
    expect(g.name).toBe('To Do!')
    expect(g.color).toBe('#000000')
    expect(store.getState().groups.find(x => x.id === 'important')!.name).toBe('Important')
  })

  it('toggleGroupCollapse flips the collapsed flag', () => {
    expect(store.getState().groups.find(g => g.id === 'todo')!.collapsed).toBe(false)
    store.getState().toggleGroupCollapse('todo')
    expect(store.getState().groups.find(g => g.id === 'todo')!.collapsed).toBe(true)
    store.getState().toggleGroupCollapse('todo')
    expect(store.getState().groups.find(g => g.id === 'todo')!.collapsed).toBe(false)
  })

  it('moveToGroup reassigns a bookmark, and null clears the group', () => {
    const bm = store.getState().addBookmark('/a.ts', 1)
    store.getState().moveToGroup(bm.id, 'review')
    expect(store.getState().bookmarks.find(b => b.id === bm.id)!.group).toBe('review')
    store.getState().moveToGroup(bm.id, null)
    expect(store.getState().bookmarks.find(b => b.id === bm.id)!.group).toBeUndefined()
  })
})

describe('getBookmarksForFile', () => {
  it('returns only the file bookmarks sorted by line', () => {
    store.getState().addBookmark('/a.ts', 30)
    store.getState().addBookmark('/a.ts', 10)
    store.getState().addBookmark('/a.ts', 20)
    store.getState().addBookmark('/b.ts', 5)
    const lines = store.getState().getBookmarksForFile('/a.ts').map(b => b.line)
    expect(lines).toEqual([10, 20, 30])
  })

  it('returns an empty array for a file with no bookmarks', () => {
    expect(store.getState().getBookmarksForFile('/nothing.ts')).toEqual([])
  })
})

describe('per-file navigation: getNext / getPrevious', () => {
  beforeEach(() => {
    store.getState().addBookmark('/a.ts', 10)
    store.getState().addBookmark('/a.ts', 20)
    store.getState().addBookmark('/a.ts', 30)
  })

  it('getNext returns the first bookmark after the current line', () => {
    expect(store.getState().getNext('/a.ts', 15)!.line).toBe(20)
  })

  it('getNext wraps to the first bookmark when past the last line', () => {
    expect(store.getState().getNext('/a.ts', 99)!.line).toBe(10)
  })

  it('getPrevious returns the closest bookmark before the current line', () => {
    expect(store.getState().getPrevious('/a.ts', 25)!.line).toBe(20)
  })

  it('getPrevious wraps to the last bookmark when before the first line', () => {
    expect(store.getState().getPrevious('/a.ts', 1)!.line).toBe(30)
  })

  it('getNext returns undefined for a file with no bookmarks', () => {
    expect(store.getState().getNext('/empty.ts', 1)).toBeUndefined()
  })
})

describe('global navigation: getNextGlobal / getPreviousGlobal', () => {
  // sortBy defaults to 'file': sorted by filePath then line.
  beforeEach(() => {
    store.getState().addBookmark('/a.ts', 10)
    store.getState().addBookmark('/a.ts', 20)
    store.getState().addBookmark('/b.ts', 5)
    store.getState().addBookmark('/c.ts', 1)
  })

  it('getNextGlobal returns the next bookmark within the same file', () => {
    const next = store.getState().getNextGlobal('/a.ts', 10)
    expect(next!.filePath).toBe('/a.ts')
    expect(next!.line).toBe(20)
  })

  it('getNextGlobal crosses into the next file when none left in current', () => {
    const next = store.getState().getNextGlobal('/a.ts', 20)
    expect(next!.filePath).toBe('/b.ts')
    expect(next!.line).toBe(5)
  })

  it('getNextGlobal wraps around to the first bookmark from the last file', () => {
    const next = store.getState().getNextGlobal('/c.ts', 1)
    expect(next!.filePath).toBe('/a.ts')
    expect(next!.line).toBe(10)
  })

  it('getPreviousGlobal returns the previous bookmark within the same file', () => {
    const prev = store.getState().getPreviousGlobal('/a.ts', 20)
    expect(prev!.filePath).toBe('/a.ts')
    expect(prev!.line).toBe(10)
  })

  it('getPreviousGlobal crosses into the previous file when none left in current', () => {
    const prev = store.getState().getPreviousGlobal('/b.ts', 5)
    expect(prev!.filePath).toBe('/a.ts')
    expect(prev!.line).toBe(20)
  })

  it('getPreviousGlobal wraps around to the last bookmark from the first file', () => {
    const prev = store.getState().getPreviousGlobal('/a.ts', 10)
    expect(prev!.filePath).toBe('/c.ts')
    expect(prev!.line).toBe(1)
  })
})

describe('queries: hasBookmark / getBookmarkAt', () => {
  it('hasBookmark reflects presence by file+line', () => {
    store.getState().addBookmark('/a.ts', 7)
    expect(store.getState().hasBookmark('/a.ts', 7)).toBe(true)
    expect(store.getState().hasBookmark('/a.ts', 8)).toBe(false)
    expect(store.getState().hasBookmark('/b.ts', 7)).toBe(false)
  })

  it('getBookmarkAt returns the matching bookmark or undefined', () => {
    const bm = store.getState().addBookmark('/a.ts', 7)
    expect(store.getState().getBookmarkAt('/a.ts', 7)!.id).toBe(bm.id)
    expect(store.getState().getBookmarkAt('/a.ts', 99)).toBeUndefined()
  })
})

describe('getGroupedBookmarks', () => {
  it('groups bookmarks by group id with an ungrouped bucket and seeds all known groups', () => {
    store.getState().addBookmark('/a.ts', 1, { group: 'todo' })
    store.getState().addBookmark('/a.ts', 2, { group: 'todo' })
    store.getState().addBookmark('/b.ts', 3) // ungrouped
    const grouped = store.getState().getGroupedBookmarks()

    expect(grouped.get('todo')!.map(b => b.line)).toEqual([1, 2])
    expect(grouped.get('ungrouped')!.map(b => b.line)).toEqual([3])
    // Empty default groups are still present as empty arrays.
    expect(grouped.get('important')).toEqual([])
    expect(grouped.has('review')).toBe(true)
  })

  it('creates a bucket for a group id not in the groups list', () => {
    store.getState().addBookmark('/a.ts', 1, { group: 'orphan-group' })
    const grouped = store.getState().getGroupedBookmarks()
    expect(grouped.get('orphan-group')!).toHaveLength(1)
  })
})

describe('getSortedBookmarks', () => {
  it('sorts by file then line (default)', () => {
    store.getState().addBookmark('/b.ts', 1)
    store.getState().addBookmark('/a.ts', 30)
    store.getState().addBookmark('/a.ts', 10)
    const out = store.getState().getSortedBookmarks().map(b => `${b.filePath}:${b.line}`)
    expect(out).toEqual(['/a.ts:10', '/a.ts:30', '/b.ts:1'])
  })

  it('sorts by line only', () => {
    store.getState().setSortBy('line')
    store.getState().addBookmark('/b.ts', 30)
    store.getState().addBookmark('/a.ts', 5)
    store.getState().addBookmark('/c.ts', 12)
    expect(store.getState().getSortedBookmarks().map(b => b.line)).toEqual([5, 12, 30])
  })

  it('sorts by label (missing labels treated as empty string)', () => {
    store.getState().setSortBy('label')
    store.getState().addBookmark('/a.ts', 1, { label: 'beta' })
    store.getState().addBookmark('/a.ts', 2, { label: 'alpha' })
    store.getState().addBookmark('/a.ts', 3) // no label -> ''
    const labels = store.getState().getSortedBookmarks().map(b => b.label)
    expect(labels).toEqual([undefined, 'alpha', 'beta'])
  })

  it('sorts by created descending (newest first)', () => {
    store.getState().setSortBy('created')
    const a = store.getState().addBookmark('/a.ts', 1)
    const b = store.getState().addBookmark('/a.ts', 2)
    // Force distinct, ordered timestamps to avoid Date.now() collisions.
    store.getState().updateBookmark(a.id, { createdAt: 1000 })
    store.getState().updateBookmark(b.id, { createdAt: 2000 })
    const ids = store.getState().getSortedBookmarks().map(x => x.id)
    expect(ids).toEqual([b.id, a.id])
  })

  it('sorts by group (undefined group sorts last via "zzz" sentinel)', () => {
    store.getState().setSortBy('group')
    store.getState().addBookmark('/a.ts', 5) // ungrouped -> 'zzz'
    store.getState().addBookmark('/a.ts', 1, { group: 'review' })
    store.getState().addBookmark('/a.ts', 2, { group: 'important' })
    const out = store.getState().getSortedBookmarks().map(b => b.group ?? 'UNGROUPED')
    expect(out).toEqual(['important', 'review', 'UNGROUPED'])
  })

  it('does not mutate the underlying bookmarks array', () => {
    store.getState().addBookmark('/b.ts', 1)
    store.getState().addBookmark('/a.ts', 1)
    const original = store.getState().bookmarks
    store.getState().getSortedBookmarks()
    expect(store.getState().bookmarks).toBe(original)
  })
})

describe('settings', () => {
  it('setSortBy / setShowLabels / setShowNotes / setActiveGroup update state', () => {
    store.getState().setSortBy('group')
    store.getState().setShowLabels(false)
    store.getState().setShowNotes(true)
    store.getState().setActiveGroup('todo')
    const s = store.getState()
    expect(s.sortBy).toBe('group')
    expect(s.showLabels).toBe(false)
    expect(s.showNotes).toBe(true)
    expect(s.activeGroup).toBe('todo')
  })
})

describe('export / import', () => {
  it('exportBookmarks produces parseable JSON with bookmarks, groups and version', () => {
    store.getState().addBookmark('/a.ts', 1, { label: 'x' })
    const json = store.getState().exportBookmarks()
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(1)
    expect(parsed.bookmarks).toHaveLength(1)
    expect(parsed.bookmarks[0].label).toBe('x')
    expect(parsed.groups).toHaveLength(DEFAULT_GROUPS.length)
  })

  it('importBookmarks appends bookmarks with fresh ids and returns the count', () => {
    const json = JSON.stringify({
      bookmarks: [
        { id: 'old-1', filePath: '/x.ts', line: 1, createdAt: 111 },
        { id: 'old-2', filePath: '/y.ts', line: 2, createdAt: 222 },
      ],
    })
    const count = store.getState().importBookmarks(json)
    expect(count).toBe(2)
    const bms = store.getState().bookmarks
    expect(bms).toHaveLength(2)
    // Ids are regenerated, not preserved.
    expect(bms.every(b => b.id.startsWith('bm-imported-'))).toBe(true)
    // Original createdAt is preserved.
    expect(bms.map(b => b.createdAt).sort()).toEqual([111, 222])
  })

  it('importBookmarks merges only new groups (dedupes by id)', () => {
    const json = JSON.stringify({
      bookmarks: [],
      groups: [
        { id: 'todo', name: 'Dup TODO', color: '#000', collapsed: false, sortOrder: 0 },
        { id: 'new-grp', name: 'New', color: '#111', collapsed: false, sortOrder: 9 },
      ],
    })
    store.getState().importBookmarks(json)
    const groups = store.getState().groups
    expect(groups.filter(g => g.id === 'todo')).toHaveLength(1)
    expect(groups.find(g => g.id === 'todo')!.name).toBe('TODO') // existing kept
    expect(groups.some(g => g.id === 'new-grp')).toBe(true)
  })

  it('importBookmarks returns 0 for invalid JSON', () => {
    expect(store.getState().importBookmarks('{not json')).toBe(0)
    expect(store.getState().bookmarks).toHaveLength(0)
  })

  it('importBookmarks returns 0 when bookmarks field is missing or not an array', () => {
    expect(store.getState().importBookmarks(JSON.stringify({ foo: 1 }))).toBe(0)
    expect(store.getState().importBookmarks(JSON.stringify({ bookmarks: 'nope' }))).toBe(0)
  })

  it('export then import round-trips the bookmark data', () => {
    store.getState().addBookmark('/a.ts', 42, { label: 'roundtrip', note: 'n' })
    const json = store.getState().exportBookmarks()
    store.getState().clearAll()
    const count = store.getState().importBookmarks(json)
    expect(count).toBe(1)
    expect(store.getState().bookmarks[0].line).toBe(42)
    expect(store.getState().bookmarks[0].label).toBe('roundtrip')
    expect(store.getState().bookmarks[0].note).toBe('n')
  })
})

describe('persistence to localStorage', () => {
  it('writes bookmark state to the orion-bookmarks key', () => {
    store.getState().addBookmark('/a.ts', 1, { label: 'persist-me' })
    const raw = localStorage.getItem('orion-bookmarks')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    // zustand persist wraps state under a `state` field.
    expect(parsed.state.bookmarks).toHaveLength(1)
    expect(parsed.state.bookmarks[0].label).toBe('persist-me')
    expect(parsed.state.sortBy).toBe('file')
  })

  it('persists groups and settings, removals reflect in storage', () => {
    const bm = store.getState().addBookmark('/a.ts', 1)
    store.getState().setShowNotes(true)
    store.getState().removeBookmark(bm.id)
    const parsed = JSON.parse(localStorage.getItem('orion-bookmarks')!)
    expect(parsed.state.bookmarks).toHaveLength(0)
    expect(parsed.state.showNotes).toBe(true)
    expect(parsed.state.groups).toHaveLength(DEFAULT_GROUPS.length)
  })
})
