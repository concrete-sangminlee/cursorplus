/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRecentFilesStore } from './recentFiles'

const STORAGE_KEY = 'orion-recent-files'

beforeEach(() => {
  localStorage.clear()
  // Reset data fields without replacing the store (keeps actions intact).
  useRecentFilesStore.setState({ recentFiles: [] })
  vi.useRealTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useRecentFilesStore', () => {
  it('records a recent file with path, name and a timestamp', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

    useRecentFilesStore.getState().addRecentFile('/a/b.ts', 'b.ts')

    const { recentFiles } = useRecentFilesStore.getState()
    expect(recentFiles).toHaveLength(1)
    expect(recentFiles[0]).toEqual({
      path: '/a/b.ts',
      name: 'b.ts',
      timestamp: Date.parse('2026-01-01T00:00:00Z'),
    })
  })

  it('orders most-recently-added first', () => {
    const store = useRecentFilesStore.getState()
    store.addRecentFile('/one.ts', 'one.ts')
    store.addRecentFile('/two.ts', 'two.ts')
    store.addRecentFile('/three.ts', 'three.ts')

    expect(useRecentFilesStore.getState().recentFiles.map((f) => f.path)).toEqual([
      '/three.ts',
      '/two.ts',
      '/one.ts',
    ])
  })

  it('dedupes on re-add and moves the file to the front without growing the list', () => {
    const store = useRecentFilesStore.getState()
    store.addRecentFile('/one.ts', 'one.ts')
    store.addRecentFile('/two.ts', 'two.ts')
    store.addRecentFile('/three.ts', 'three.ts')

    store.addRecentFile('/one.ts', 'one.ts')

    const paths = useRecentFilesStore.getState().recentFiles.map((f) => f.path)
    expect(paths).toEqual(['/one.ts', '/three.ts', '/two.ts'])
    expect(paths).toHaveLength(3) // no duplicate entry
  })

  it('refreshes name and timestamp when re-adding the same path', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const store = useRecentFilesStore.getState()
    store.addRecentFile('/file.ts', 'old-name.ts')

    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'))
    store.addRecentFile('/file.ts', 'new-name.ts')

    const { recentFiles } = useRecentFilesStore.getState()
    expect(recentFiles).toHaveLength(1)
    expect(recentFiles[0].name).toBe('new-name.ts')
    expect(recentFiles[0].timestamp).toBe(Date.parse('2026-01-02T00:00:00Z'))
  })

  it('caps the list at 30 entries, evicting the oldest', () => {
    const store = useRecentFilesStore.getState()
    for (let i = 0; i < 35; i++) {
      store.addRecentFile(`/file-${i}.ts`, `file-${i}.ts`)
    }

    const { recentFiles } = useRecentFilesStore.getState()
    expect(recentFiles).toHaveLength(30)
    // Newest (file-34) is first, oldest survivor is file-5; file-0..4 evicted.
    expect(recentFiles[0].path).toBe('/file-34.ts')
    expect(recentFiles[29].path).toBe('/file-5.ts')
    expect(recentFiles.some((f) => f.path === '/file-4.ts')).toBe(false)
  })

  it('persists the list to localStorage on add', () => {
    useRecentFilesStore.getState().addRecentFile('/p.ts', 'p.ts')

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].path).toBe('/p.ts')
  })

  it('clears the in-memory list and removes the persisted key', () => {
    const store = useRecentFilesStore.getState()
    store.addRecentFile('/p.ts', 'p.ts')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    store.clearRecent()

    expect(useRecentFilesStore.getState().recentFiles).toEqual([])
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('getRecent returns at most the default limit of 10', () => {
    const store = useRecentFilesStore.getState()
    for (let i = 0; i < 15; i++) {
      store.addRecentFile(`/f-${i}.ts`, `f-${i}.ts`)
    }

    const recent = store.getRecent()
    expect(recent).toHaveLength(10)
    // Most recent first: f-14 down to f-5.
    expect(recent[0].path).toBe('/f-14.ts')
    expect(recent[9].path).toBe('/f-5.ts')
  })

  it('getRecent honors a custom limit and never returns more than exists', () => {
    const store = useRecentFilesStore.getState()
    store.addRecentFile('/a.ts', 'a.ts')
    store.addRecentFile('/b.ts', 'b.ts')

    expect(store.getRecent(1).map((f) => f.path)).toEqual(['/b.ts'])
    // Asking for more than present returns only what exists.
    expect(store.getRecent(50)).toHaveLength(2)
  })

  it('treats different paths with the same name as distinct entries', () => {
    const store = useRecentFilesStore.getState()
    store.addRecentFile('/dir1/index.ts', 'index.ts')
    store.addRecentFile('/dir2/index.ts', 'index.ts')

    const paths = useRecentFilesStore.getState().recentFiles.map((f) => f.path)
    expect(paths).toEqual(['/dir2/index.ts', '/dir1/index.ts'])
  })
})
