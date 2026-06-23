/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { useRecentProjectsStore } from './recentProjects'

/**
 * Tests for the recentProjects Zustand store.
 *
 * The store is a module-level singleton wrapped with the `persist` middleware
 * (localStorage key: "orion-recent-projects"). We reset the data fields before
 * each test via setState and clear localStorage. We do NOT use replace:true.
 */

const store = useRecentProjectsStore

function reset() {
  store.setState({
    projects: [],
    sessions: new Map(),
    maxProjects: 50,
    maxSessions: 20,
    sortBy: 'recent',
    filter: 'all',
    searchQuery: '',
  })
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('addProject', () => {
  it('adds a new project with derived name, defaults and detected framework', () => {
    store.getState().addProject('C:\\dev\\my-react-app')
    const projects = store.getState().projects
    expect(projects).toHaveLength(1)
    const p = projects[0]
    expect(p.path).toBe('C:\\dev\\my-react-app')
    expect(p.name).toBe('my-react-app')
    expect(p.openCount).toBe(1)
    expect(p.pinned).toBe(false)
    expect(p.tags).toEqual([])
    // detectFramework runs on the derived name "my-react-app" -> contains "react"
    expect(p.framework).toBe('React')
    expect(typeof p.lastOpened).toBe('number')
  })

  it('derives a project name from forward-slash paths too', () => {
    store.getState().addProject('/home/user/projects/cool-tool/')
    expect(store.getState().projects[0].name).toBe('cool-tool')
  })

  it('does not detect a framework for a neutral name', () => {
    store.getState().addProject('/tmp/plainfolder')
    expect(store.getState().projects[0].framework).toBeUndefined()
  })

  it('honors explicit meta overrides (name, tags, framework, language)', () => {
    store.getState().addProject('/x/y', {
      name: 'Custom',
      tags: ['a', 'b'],
      framework: 'Vue',
      language: 'TypeScript',
    })
    const p = store.getState().projects[0]
    expect(p.name).toBe('Custom')
    expect(p.tags).toEqual(['a', 'b'])
    expect(p.framework).toBe('Vue')
    expect(p.language).toBe('TypeScript')
  })

  it('orders multiple added projects most-recent-first', () => {
    store.getState().addProject('/a')
    store.getState().addProject('/b')
    store.getState().addProject('/c')
    expect(store.getState().projects.map(p => p.path)).toEqual(['/c', '/b', '/a'])
  })

  it('dedups when re-adding an existing path: increments openCount and moves to front (via lastOpened)', () => {
    // Use fake timers so each add gets a strictly increasing lastOpened.
    // Without this, real Date.now() can return identical ms for consecutive
    // adds, leaving recent-sort order ambiguous (see NOTE below).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    store.getState().addProject('/a')
    vi.setSystemTime(new Date('2020-01-01T00:00:01Z'))
    store.getState().addProject('/b')
    vi.setSystemTime(new Date('2020-01-01T00:00:02Z'))
    store.getState().addProject('/a') // re-add existing

    const projects = store.getState().projects
    expect(projects).toHaveLength(2)
    // NOTE: the implementation uses .map(), so the re-added project is NOT
    // physically moved to the front of the array; only lastOpened/openCount
    // change. "Moves to front" is expressed via lastOpened and surfaced by
    // getSortedProjects('recent'), not by array position.
    expect(projects.map(p => p.path)).toEqual(['/b', '/a'])

    const a = projects.find(p => p.path === '/a')!
    expect(a.openCount).toBe(2)

    // lastOpened-based "front" ordering is observable through the sorted view
    const sorted = store.getState().getSortedProjects()
    expect(sorted[0].path).toBe('/a')
  })

  it('merges new meta into an existing project on re-add (gitBranch/gitRemote fallback)', () => {
    store.getState().addProject('/repo', { gitBranch: 'main', gitRemote: 'origin' })
    // Re-add without gitRemote: meta fallback should keep the previous value,
    // but a spread of meta overrides afterward — verify final state.
    store.getState().addProject('/repo', { gitBranch: 'dev' })
    const p = store.getState().projects[0]
    expect(p.gitBranch).toBe('dev')
    expect(p.gitRemote).toBe('origin') // preserved via `meta.gitRemote || p.gitRemote`
    expect(p.openCount).toBe(2)
  })

  it('updates lastOpened on re-add', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    store.getState().addProject('/a')
    const first = store.getState().projects[0].lastOpened

    vi.setSystemTime(new Date('2020-01-02T00:00:00Z'))
    store.getState().addProject('/a')
    const second = store.getState().projects[0].lastOpened

    expect(second).toBeGreaterThan(first)
  })
})

describe('max-size cap / eviction', () => {
  it('caps total projects at maxProjects, evicting the oldest unpinned', () => {
    store.setState({ maxProjects: 3 })
    store.getState().addProject('/1')
    store.getState().addProject('/2')
    store.getState().addProject('/3')
    store.getState().addProject('/4') // exceeds cap of 3

    const paths = store.getState().projects.map(p => p.path)
    expect(paths).toHaveLength(3)
    // newest first; oldest (/1) evicted
    expect(paths).toEqual(['/4', '/3', '/2'])
    expect(paths).not.toContain('/1')
  })

  it('keeps pinned projects even when over cap, and re-orders pinned to the front', () => {
    store.setState({ maxProjects: 2 })
    store.getState().addProject('/keep')
    store.getState().pinProject('/keep')
    store.getState().addProject('/x')
    store.getState().addProject('/y') // triggers trim: length 3 > 2

    const paths = store.getState().projects.map(p => p.path)
    // pinned '/keep' is retained; trim formula = [...pinned, ...unpinned.slice(0, max - pinned.length)]
    // pinned=['/keep'], unpinned=['/y','/x'], slice(0, 2-1=1) => ['/y']
    expect(paths).toContain('/keep')
    expect(paths).toEqual(['/keep', '/y'])
    expect(paths).not.toContain('/x')
  })

  it('retains all already-pinned projects when adding past the cap (pinned never dropped)', () => {
    // Pin both BEFORE the trimming add so they survive the eviction pass.
    store.setState({ maxProjects: 1 })
    store.getState().addProject('/p1')
    store.getState().pinProject('/p1')
    store.setState({ maxProjects: 2 })
    store.getState().addProject('/p2')
    store.getState().pinProject('/p2')
    store.setState({ maxProjects: 1 })
    store.getState().addProject('/unpinned') // length 3 > 1; pinned=2

    const paths = store.getState().projects.map(p => p.path)
    // pinned=['/p1','/p2'], unpinned.slice(0, 1-2 = -1) => [] so unpinned dropped,
    // both pinned kept even though that exceeds maxProjects.
    expect(paths.sort()).toEqual(['/p1', '/p2'])
  })

  it('NOTE/edge: trimming runs only on add, so a not-yet-pinned project can be evicted before it is pinned', () => {
    // Reproduces the subtle behavior that broke the naive expectation:
    // pinning happens AFTER the add that triggers the trim, so the new
    // project is evicted first and the later pinProject is a no-op.
    store.setState({ maxProjects: 1 })
    store.getState().addProject('/p1')
    store.getState().pinProject('/p1')
    store.getState().addProject('/p2') // trim NOW: pinned=['/p1'], slice(0,0) -> '/p2' dropped
    store.getState().pinProject('/p2') // no-op, '/p2' no longer exists

    const paths = store.getState().projects.map(p => p.path)
    expect(paths).toEqual(['/p1'])
    expect(store.getState().getProjectByPath('/p2')).toBeUndefined()
  })
})

describe('removeProject', () => {
  it('removes a project by path and leaves others intact', () => {
    store.getState().addProject('/a')
    store.getState().addProject('/b')
    store.getState().removeProject('/a')
    expect(store.getState().projects.map(p => p.path)).toEqual(['/b'])
  })

  it('is a no-op for an unknown path', () => {
    store.getState().addProject('/a')
    store.getState().removeProject('/does-not-exist')
    expect(store.getState().projects).toHaveLength(1)
  })
})

describe('pinning', () => {
  it('pinProject sets pinned true; unpinProject sets it false', () => {
    store.getState().addProject('/a')
    store.getState().pinProject('/a')
    expect(store.getState().getProjectByPath('/a')!.pinned).toBe(true)
    store.getState().unpinProject('/a')
    expect(store.getState().getProjectByPath('/a')!.pinned).toBe(false)
  })

  it('togglePin flips the pinned flag both ways', () => {
    store.getState().addProject('/a')
    store.getState().togglePin('/a')
    expect(store.getState().getProjectByPath('/a')!.pinned).toBe(true)
    store.getState().togglePin('/a')
    expect(store.getState().getProjectByPath('/a')!.pinned).toBe(false)
  })

  it('clearUnpinned removes only unpinned projects', () => {
    store.getState().addProject('/a')
    store.getState().addProject('/b')
    store.getState().pinProject('/b')
    store.getState().clearUnpinned()
    expect(store.getState().projects.map(p => p.path)).toEqual(['/b'])
  })

  it('clearAll empties projects entirely', () => {
    store.getState().addProject('/a')
    store.getState().addProject('/b')
    store.getState().pinProject('/b')
    store.getState().clearAll()
    expect(store.getState().projects).toEqual([])
  })
})

describe('tagging and updates', () => {
  it('tagProject replaces the tags array', () => {
    store.getState().addProject('/a')
    store.getState().tagProject('/a', ['x', 'y'])
    expect(store.getState().getProjectByPath('/a')!.tags).toEqual(['x', 'y'])
  })

  it('updateProject merges arbitrary fields', () => {
    store.getState().addProject('/a')
    store.getState().updateProject('/a', { description: 'hello', language: 'Go' })
    const p = store.getState().getProjectByPath('/a')!
    expect(p.description).toBe('hello')
    expect(p.language).toBe('Go')
  })

  it('getAllTags returns a sorted, deduped union across projects', () => {
    store.getState().addProject('/a', { tags: ['z', 'a'] })
    store.getState().addProject('/b', { tags: ['a', 'm'] })
    expect(store.getState().getAllTags()).toEqual(['a', 'm', 'z'])
  })

  it('getProjectsByTag returns matching projects', () => {
    store.getState().addProject('/a', { tags: ['shared'] })
    store.getState().addProject('/b', { tags: ['other'] })
    store.getState().addProject('/c', { tags: ['shared'] })
    expect(store.getState().getProjectsByTag('shared').map(p => p.path).sort())
      .toEqual(['/a', '/c'])
  })
})

describe('queries: filtering and sorting', () => {
  it('getFilteredProjects with filter=pinned returns only pinned', () => {
    store.getState().addProject('/a')
    store.getState().addProject('/b')
    store.getState().pinProject('/b')
    store.getState().setFilter('pinned')
    expect(store.getState().getFilteredProjects().map(p => p.path)).toEqual(['/b'])
  })

  it('getFilteredProjects with filter=git returns only projects with a gitRemote', () => {
    store.getState().addProject('/a', { gitRemote: 'origin' })
    store.getState().addProject('/b')
    store.getState().setFilter('git')
    expect(store.getState().getFilteredProjects().map(p => p.path)).toEqual(['/a'])
  })

  it('getFilteredProjects with filter=tagged returns only projects with tags', () => {
    store.getState().addProject('/a', { tags: ['t'] })
    store.getState().addProject('/b')
    store.getState().setFilter('tagged')
    expect(store.getState().getFilteredProjects().map(p => p.path)).toEqual(['/a'])
  })

  it('searchQuery filters by name, path, tag, or framework (case-insensitive)', () => {
    store.getState().addProject('/repos/alpha', { tags: ['backend'] })
    store.getState().addProject('/repos/beta', { framework: 'Svelte' })
    store.getState().addProject('/repos/gamma')

    store.getState().setSearchQuery('ALPHA')
    expect(store.getState().getFilteredProjects().map(p => p.path)).toEqual(['/repos/alpha'])

    store.getState().setSearchQuery('svelte')
    expect(store.getState().getFilteredProjects().map(p => p.path)).toEqual(['/repos/beta'])

    store.getState().setSearchQuery('backend') // matches a tag
    expect(store.getState().getFilteredProjects().map(p => p.path)).toEqual(['/repos/alpha'])
  })

  it('getSortedProjects always puts pinned first regardless of sortBy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    store.getState().addProject('/old')
    vi.setSystemTime(new Date('2020-02-01T00:00:00Z'))
    store.getState().addProject('/new')
    store.getState().pinProject('/old') // pinned but older

    store.getState().setSortBy('recent')
    expect(store.getState().getSortedProjects().map(p => p.path)).toEqual(['/old', '/new'])
  })

  it('getSortedProjects sorts unpinned by recent (lastOpened desc)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    store.getState().addProject('/first')
    vi.setSystemTime(new Date('2020-03-01T00:00:00Z'))
    store.getState().addProject('/third')
    vi.setSystemTime(new Date('2020-02-01T00:00:00Z'))
    store.getState().addProject('/second')

    store.getState().setSortBy('recent')
    expect(store.getState().getSortedProjects().map(p => p.path))
      .toEqual(['/third', '/second', '/first'])
  })

  it('getSortedProjects sorts by name alphabetically', () => {
    store.getState().addProject('/x', { name: 'Charlie' })
    store.getState().addProject('/y', { name: 'alpha' })
    store.getState().addProject('/z', { name: 'Bravo' })
    store.getState().setSortBy('name')
    expect(store.getState().getSortedProjects().map(p => p.name))
      .toEqual(['alpha', 'Bravo', 'Charlie'])
  })

  it('getSortedProjects sorts by frequency (openCount desc)', () => {
    store.getState().addProject('/a')
    store.getState().addProject('/b')
    store.getState().addProject('/b') // openCount 2
    store.getState().addProject('/b') // openCount 3
    store.getState().setSortBy('frequency')
    expect(store.getState().getSortedProjects().map(p => p.path)).toEqual(['/b', '/a'])
  })

  it('getMostFrequent returns top-N by openCount with default limit 5', () => {
    store.getState().addProject('/a')
    store.getState().addProject('/b')
    store.getState().addProject('/b')
    store.getState().addProject('/c')
    store.getState().addProject('/c')
    store.getState().addProject('/c')

    expect(store.getState().getMostFrequent(2).map(p => p.path)).toEqual(['/c', '/b'])
    expect(store.getState().getMostFrequent()).toHaveLength(3) // default limit >= count
  })

  it('getProjectByPath returns undefined for an unknown path', () => {
    expect(store.getState().getProjectByPath('/nope')).toBeUndefined()
  })
})

describe('session management', () => {
  it('saveSession stores a session keyed by projectPath with timestamp', () => {
    store.getState().saveSession('/proj', { openFiles: ['a.ts'], activeFile: 'a.ts' })
    const s = store.getState().getSession('/proj')
    expect(s).toBeDefined()
    expect(s!.projectPath).toBe('/proj')
    expect(s!.openFiles).toEqual(['a.ts'])
    expect(s!.activeFile).toBe('a.ts')
    expect(typeof s!.timestamp).toBe('number')
  })

  it('saveSession overwrites an existing session for the same path', () => {
    store.getState().saveSession('/proj', { openFiles: ['a.ts'] })
    store.getState().saveSession('/proj', { openFiles: ['b.ts', 'c.ts'] })
    expect(store.getState().getSession('/proj')!.openFiles).toEqual(['b.ts', 'c.ts'])
    expect(store.getState().sessions.size).toBe(1)
  })

  it('trims sessions to maxSessions, keeping the most recent by timestamp', () => {
    store.setState({ maxSessions: 2 })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'))
    store.getState().saveSession('/s1', { openFiles: [] })
    vi.setSystemTime(new Date('2020-01-02T00:00:00Z'))
    store.getState().saveSession('/s2', { openFiles: [] })
    vi.setSystemTime(new Date('2020-01-03T00:00:00Z'))
    store.getState().saveSession('/s3', { openFiles: [] }) // size 3 > 2 -> trim oldest

    const keys = [...store.getState().sessions.keys()].sort()
    expect(keys).toEqual(['/s2', '/s3'])
    expect(store.getState().sessions.has('/s1')).toBe(false)
  })

  it('clearSession removes a single session', () => {
    store.getState().saveSession('/a', { openFiles: [] })
    store.getState().saveSession('/b', { openFiles: [] })
    store.getState().clearSession('/a')
    expect(store.getState().sessions.has('/a')).toBe(false)
    expect(store.getState().sessions.has('/b')).toBe(true)
  })

  it('clearAllSessions empties the session map', () => {
    store.getState().saveSession('/a', { openFiles: [] })
    store.getState().clearAllSessions()
    expect(store.getState().sessions.size).toBe(0)
  })

  it('getSession returns undefined for an unknown path', () => {
    expect(store.getState().getSession('/missing')).toBeUndefined()
  })
})

describe('settings', () => {
  it('setSortBy / setFilter / setSearchQuery / setMaxProjects update state', () => {
    store.getState().setSortBy('frequency')
    store.getState().setFilter('git')
    store.getState().setSearchQuery('foo')
    store.getState().setMaxProjects(7)
    const s = store.getState()
    expect(s.sortBy).toBe('frequency')
    expect(s.filter).toBe('git')
    expect(s.searchQuery).toBe('foo')
    expect(s.maxProjects).toBe(7)
  })
})

describe('persistence to localStorage', () => {
  it('writes projects (and partialized fields) to the persist key', () => {
    store.getState().addProject('/persisted', { name: 'P' })

    const raw = localStorage.getItem('orion-recent-projects')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    const state = parsed.state

    expect(state.projects.map((p: any) => p.path)).toContain('/persisted')
    // partialize persists projects, sessions (as object), maxProjects, sortBy
    expect(state).toHaveProperty('maxProjects')
    expect(state).toHaveProperty('sortBy')
    expect(state).toHaveProperty('sessions')
    // filter and searchQuery are intentionally NOT partialized
    expect(state.filter).toBeUndefined()
    expect(state.searchQuery).toBeUndefined()
  })

  it('serializes sessions as a plain object (Map -> object via partialize)', () => {
    store.getState().saveSession('/sess', { openFiles: ['f.ts'] })
    const parsed = JSON.parse(localStorage.getItem('orion-recent-projects')!)
    expect(parsed.state.sessions['/sess']).toBeDefined()
    expect(parsed.state.sessions['/sess'].openFiles).toEqual(['f.ts'])
  })
})

describe('edge cases', () => {
  it('addProject with an empty path uses the raw path as the name', () => {
    store.getState().addProject('')
    expect(store.getState().projects[0].name).toBe('')
  })

  it('pin/unpin/tag/update are no-ops for unknown paths (no project created)', () => {
    store.getState().pinProject('/ghost')
    store.getState().tagProject('/ghost', ['x'])
    store.getState().updateProject('/ghost', { name: 'Z' })
    expect(store.getState().projects).toHaveLength(0)
  })

  it('getFilteredProjects returns an empty array when no projects match', () => {
    store.getState().addProject('/a')
    store.getState().setSearchQuery('zzzz-no-match')
    expect(store.getState().getFilteredProjects()).toEqual([])
  })
})
