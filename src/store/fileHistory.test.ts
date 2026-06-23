/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  useFileHistoryStore,
  formatRelativeTime,
  formatBytes,
  triggerLabels,
  type GitCommitEntry,
} from './fileHistory'

const store = () => useFileHistoryStore.getState()

// Counter to guarantee unique paths across tests so the module-level
// `lastAutoSaveTimestamps` map (which is NOT resettable via setState) cannot
// leak throttling state between auto-save tests.
let pathCounter = 0
const uniquePath = (name = 'file') => `/proj/${name}-${pathCounter++}.ts`

beforeEach(() => {
  // Reset only the data fields (do NOT use replace: true — that would wipe actions).
  useFileHistoryStore.setState({
    snapshots: new Map(),
    gitCommits: new Map(),
  })
  localStorage.clear()
  // Real timers by default; opt into fake timers per-test where ordering matters.
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('addSnapshot — recording', () => {
  it('records a snapshot with computed metadata', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'line1\nline2\nline3', 'Saved')

    const snaps = store().getSnapshots(path)
    expect(snaps).toHaveLength(1)
    const s = snaps[0]
    expect(s.path).toBe(path)
    expect(s.content).toBe('line1\nline2\nline3')
    expect(s.label).toBe('Saved')
    expect(s.id).toBeTruthy()
    expect(typeof s.timestamp).toBe('number')
    // size is byte length of content via Blob
    expect(s.size).toBe(new Blob(['line1\nline2\nline3']).size)
  })

  it('infers trigger from label when not provided', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'a', 'Saved')
    store().addSnapshot(path, 'b\nc', 'Auto-saved')
    store().addSnapshot(path, 'd\ne\nf', 'Before AI edit')

    const snaps = store().getSnapshots(path)
    // newest first
    expect(snaps[0].trigger).toBe('ai-edit') // label contains "AI"
    expect(snaps[1].trigger).toBe('auto-save')
    expect(snaps[2].trigger).toBe('save')
  })

  it('honors an explicit trigger argument over label inference', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'x', 'Saved', 'refactor')
    expect(store().getSnapshots(path)[0].trigger).toBe('refactor')
  })

  it('computes line diff counts against the previous snapshot content', () => {
    const path = uniquePath()
    // First snapshot: no previous content -> added = number of lines, removed 0
    store().addSnapshot(path, 'a\nb\nc', 'Saved')
    const first = store().getSnapshots(path)[0]
    expect(first.linesAdded).toBe(3)
    expect(first.linesRemoved).toBe(0)

    // Second: a\nb\nc -> a\nb\nd  => 1 added (d), 1 removed (c)
    store().addSnapshot(path, 'a\nb\nd', 'Saved')
    const second = store().getSnapshots(path)[0]
    expect(second.linesAdded).toBe(1)
    expect(second.linesRemoved).toBe(1)
  })

  it('uses explicit previousContent for diff when provided', () => {
    const path = uniquePath()
    // previousContent has 2 lines, new content adds one distinct line
    store().addSnapshot(path, 'a\nb\nc', 'Saved', 'manual', 'a\nb')
    const s = store().getSnapshots(path)[0]
    expect(s.linesAdded).toBe(1)
    expect(s.linesRemoved).toBe(0)
  })
})

describe('addSnapshot — ordering (most-recent-first)', () => {
  it('prepends new snapshots so newest is index 0', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'one', 'Saved')
    store().addSnapshot(path, 'two', 'Saved')
    store().addSnapshot(path, 'three', 'Saved')

    const snaps = store().getSnapshots(path)
    expect(snaps.map((s) => s.content)).toEqual(['three', 'two', 'one'])
  })
})

describe('addSnapshot — dedup', () => {
  it('skips creating a snapshot when content equals the latest', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'same', 'Saved')
    store().addSnapshot(path, 'same', 'Saved')
    expect(store().getSnapshots(path)).toHaveLength(1)
  })

  it('allows a snapshot when content matches an older (non-latest) entry', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'A', 'Saved') // latest = A
    store().addSnapshot(path, 'B', 'Saved') // latest = B
    store().addSnapshot(path, 'A', 'Saved') // A != latest(B) -> recorded
    expect(store().getSnapshots(path).map((s) => s.content)).toEqual(['A', 'B', 'A'])
  })
})

describe('addSnapshot — max-size capping / eviction', () => {
  it('caps snapshots per file at 50, evicting the oldest', () => {
    const path = uniquePath()
    // Add 55 distinct snapshots
    for (let i = 0; i < 55; i++) {
      store().addSnapshot(path, `content-${i}`, 'Saved')
    }
    const snaps = store().getSnapshots(path)
    expect(snaps).toHaveLength(50)
    // newest first: content-54 .. content-5; content-0..4 evicted
    expect(snaps[0].content).toBe('content-54')
    expect(snaps[49].content).toBe('content-5')
    expect(snaps.some((s) => s.content === 'content-0')).toBe(false)
  })
})

describe('addSnapshot — auto-save throttling', () => {
  it('throttles Auto-saved snapshots within the 5 minute window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const path = uniquePath()

    store().addSnapshot(path, 'v1', 'Auto-saved')
    // 1 minute later — within the 5 min window, should be skipped
    vi.advanceTimersByTime(60_000)
    store().addSnapshot(path, 'v2', 'Auto-saved')
    expect(store().getSnapshots(path)).toHaveLength(1)
    expect(store().getSnapshots(path)[0].content).toBe('v1')

    // 5 more minutes (now > 5 min since last) — should record
    vi.advanceTimersByTime(5 * 60_000)
    store().addSnapshot(path, 'v3', 'Auto-saved')
    expect(store().getSnapshots(path)).toHaveLength(2)
    expect(store().getSnapshots(path)[0].content).toBe('v3')
  })

  it('does not throttle non-auto-save labels', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    const path = uniquePath()
    store().addSnapshot(path, 'v1', 'Saved')
    store().addSnapshot(path, 'v2', 'Saved')
    expect(store().getSnapshots(path)).toHaveLength(2)
  })
})

describe('getSnapshots / getTimeline', () => {
  it('returns empty array for an unknown path', () => {
    expect(store().getSnapshots('/does/not/exist')).toEqual([])
    expect(store().getTimeline('/does/not/exist')).toEqual([])
  })

  it('merges snapshots and git commits sorted newest-first by timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const path = uniquePath()

    store().addSnapshot(path, 'snap-old', 'Saved') // ts = 1000
    vi.setSystemTime(3000)
    store().addSnapshot(path, 'snap-new', 'Saved') // ts = 3000

    const commits: GitCommitEntry[] = [
      { type: 'git-commit', id: 'c1', hash: 'aaa', message: 'm1', author: 'me', timestamp: 2000 },
      { type: 'git-commit', id: 'c2', hash: 'bbb', message: 'm2', author: 'me', timestamp: 4000 },
    ]
    store().addGitCommits(path, commits)

    const timeline = store().getTimeline(path)
    expect(timeline.map((e) => e.timestamp)).toEqual([4000, 3000, 2000, 1000])
    // tag types preserved
    const types = timeline.map((e) => e.type)
    expect(types).toEqual(['git-commit', 'snapshot', 'git-commit', 'snapshot'])
  })
})

describe('restoreSnapshot', () => {
  it('finds a snapshot by id across all files', () => {
    const pathA = uniquePath('a')
    const pathB = uniquePath('b')
    store().addSnapshot(pathA, 'aaa', 'Saved')
    store().addSnapshot(pathB, 'bbb', 'Saved')
    const targetId = store().getSnapshots(pathB)[0].id

    const restored = store().restoreSnapshot(targetId)
    expect(restored).not.toBeNull()
    expect(restored!.content).toBe('bbb')
    expect(restored!.path).toBe(pathB)
  })

  it('returns null for an unknown id', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'x', 'Saved')
    expect(store().restoreSnapshot('nope')).toBeNull()
  })
})

describe('deleteSnapshot', () => {
  it('removes a single snapshot by id and keeps the rest', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'one', 'Saved')
    store().addSnapshot(path, 'two', 'Saved')
    const idToDelete = store().getSnapshots(path)[0].id // 'two'

    store().deleteSnapshot(idToDelete)
    const snaps = store().getSnapshots(path)
    expect(snaps).toHaveLength(1)
    expect(snaps[0].content).toBe('one')
  })

  it('removes the file key entirely when its last snapshot is deleted', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'only', 'Saved')
    const id = store().getSnapshots(path)[0].id
    store().deleteSnapshot(id)
    expect(store().snapshots.has(path)).toBe(false)
  })

  it('is a no-op for an unknown id', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'x', 'Saved')
    store().deleteSnapshot('missing')
    expect(store().getSnapshots(path)).toHaveLength(1)
  })
})

describe('clearFileHistory', () => {
  it('removes all snapshots for a given path only', () => {
    const pathA = uniquePath('a')
    const pathB = uniquePath('b')
    store().addSnapshot(pathA, 'a1', 'Saved')
    store().addSnapshot(pathB, 'b1', 'Saved')

    store().clearFileHistory(pathA)
    expect(store().snapshots.has(pathA)).toBe(false)
    expect(store().getSnapshots(pathB)).toHaveLength(1)
  })
})

describe('deleteOlderThan', () => {
  it('deletes snapshots older than the cutoff and returns the deleted count', () => {
    vi.useFakeTimers()
    const dayMs = 24 * 60 * 60 * 1000
    const path = uniquePath()

    // old snapshot 10 days ago
    vi.setSystemTime(100 * dayMs)
    store().addSnapshot(path, 'old', 'Saved')
    // recent snapshot "now" = 110 days
    vi.setSystemTime(110 * dayMs)
    store().addSnapshot(path, 'new', 'Saved')

    // delete anything older than 5 days from now (110d) -> cutoff 105d; old(100d) removed
    const deleted = store().deleteOlderThan(path, 5)
    expect(deleted).toBe(1)
    const snaps = store().getSnapshots(path)
    expect(snaps).toHaveLength(1)
    expect(snaps[0].content).toBe('new')
  })

  it('returns 0 and leaves state when nothing is older than cutoff', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'))
    const path = uniquePath()
    store().addSnapshot(path, 'fresh', 'Saved')
    const deleted = store().deleteOlderThan(path, 30)
    expect(deleted).toBe(0)
    expect(store().getSnapshots(path)).toHaveLength(1)
  })

  it('returns 0 for an unknown path', () => {
    expect(store().deleteOlderThan('/unknown', 1)).toBe(0)
  })

  it('removes the file key when all snapshots are deleted', () => {
    vi.useFakeTimers()
    const dayMs = 24 * 60 * 60 * 1000
    const path = uniquePath()
    vi.setSystemTime(10 * dayMs)
    store().addSnapshot(path, 'old', 'Saved')
    vi.setSystemTime(100 * dayMs)
    const deleted = store().deleteOlderThan(path, 1)
    expect(deleted).toBe(1)
    expect(store().snapshots.has(path)).toBe(false)
  })
})

describe('keepLastN', () => {
  it('keeps the N most-recent snapshots and returns the deleted count', () => {
    const path = uniquePath()
    for (let i = 0; i < 5; i++) store().addSnapshot(path, `c${i}`, 'Saved')
    // newest-first: c4 c3 c2 c1 c0
    const deleted = store().keepLastN(path, 2)
    expect(deleted).toBe(3)
    const snaps = store().getSnapshots(path)
    expect(snaps.map((s) => s.content)).toEqual(['c4', 'c3'])
  })

  it('is a no-op (deleted 0) when count is less than or equal to N', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'a', 'Saved')
    store().addSnapshot(path, 'b', 'Saved')
    expect(store().keepLastN(path, 5)).toBe(0)
    expect(store().getSnapshots(path)).toHaveLength(2)
  })

  it('returns 0 for an unknown path', () => {
    expect(store().keepLastN('/unknown', 3)).toBe(0)
  })
})

describe('addGitCommits', () => {
  it('stores commits keyed by path without touching snapshots', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'snap', 'Saved')
    const commits: GitCommitEntry[] = [
      { type: 'git-commit', id: 'c1', hash: 'h1', message: 'init', author: 'x', timestamp: 1 },
    ]
    store().addGitCommits(path, commits)
    expect(store().gitCommits.get(path)).toEqual(commits)
    expect(store().getSnapshots(path)).toHaveLength(1)
  })

  it('replaces previously stored commits for a path', () => {
    const path = uniquePath()
    store().addGitCommits(path, [
      { type: 'git-commit', id: 'c1', hash: 'h1', message: 'a', author: 'x', timestamp: 1 },
    ])
    store().addGitCommits(path, [
      { type: 'git-commit', id: 'c2', hash: 'h2', message: 'b', author: 'x', timestamp: 2 },
    ])
    const stored = store().gitCommits.get(path)!
    expect(stored).toHaveLength(1)
    expect(stored[0].id).toBe('c2')
  })
})

describe('localStorage persistence', () => {
  it('persists snapshots to localStorage on add', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'persisted', 'Saved')
    const raw = localStorage.getItem('orion-file-history')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed[path]).toBeDefined()
    expect(parsed[path][0].content).toBe('persisted')
  })

  it('updates localStorage when a snapshot is deleted', () => {
    const path = uniquePath()
    store().addSnapshot(path, 'a', 'Saved')
    store().addSnapshot(path, 'b', 'Saved')
    const id = store().getSnapshots(path)[0].id
    store().deleteSnapshot(id)
    const parsed = JSON.parse(localStorage.getItem('orion-file-history')!)
    expect(parsed[path]).toHaveLength(1)
    expect(parsed[path][0].content).toBe('a')
  })
})

describe('exported utilities', () => {
  it('triggerLabels covers every SnapshotTrigger value', () => {
    expect(triggerLabels['save']).toBe('Manual save')
    expect(triggerLabels['auto-save']).toBe('Auto-save')
    expect(triggerLabels['ai-edit']).toBe('AI edit')
    expect(triggerLabels['unknown']).toBe('Unknown')
  })

  it('formatBytes formats across unit boundaries', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('formatRelativeTime returns human-friendly buckets', () => {
    vi.useFakeTimers()
    const now = new Date('2026-06-23T12:00:00Z').getTime()
    vi.setSystemTime(now)
    expect(formatRelativeTime(now - 5_000)).toBe('just now')
    expect(formatRelativeTime(now - 30_000)).toBe('30s ago')
    expect(formatRelativeTime(now - 5 * 60_000)).toBe('5 min ago')
    expect(formatRelativeTime(now - 3 * 3_600_000)).toBe('3 hours ago')
    expect(formatRelativeTime(now - 2 * 86_400_000)).toBe('2 days ago')
  })
})
