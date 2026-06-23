/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  useWorkspaceStore,
  DEFAULT_WORKSPACE_SETTINGS,
  type WorkspaceExtensions,
} from './workspace'

// localStorage keys used by the store (mirrored from production code).
const LOCAL_STORAGE_KEY = 'orion-workspace-settings'
const RECENT_WORKSPACES_KEY = 'orion-recent-workspaces'
const WORKSPACE_STATE_KEY = 'orion-workspace-state'

const store = () => useWorkspaceStore.getState()

/**
 * Capture all dispatched orion:* CustomEvents so tests can assert on
 * the event side-effects of actions.
 */
function captureEvents(names: string[]) {
  const events: { name: string; detail: any }[] = []
  const handlers: Array<[string, EventListener]> = []
  for (const name of names) {
    const handler = ((e: CustomEvent) => {
      events.push({ name, detail: e.detail })
    }) as EventListener
    window.addEventListener(name, handler)
    handlers.push([name, handler])
  }
  return {
    events,
    dispose: () => handlers.forEach(([n, h]) => window.removeEventListener(n, h)),
  }
}

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    localStorage.clear()
    // window.api is what the async actions call. Provide stubs returning an
    // empty result by default; individual tests override per-call behavior.
    ;(globalThis as any).window.api = {
      workspaceReadSettings: vi.fn().mockResolvedValue({}),
      workspaceWriteSettings: vi.fn().mockResolvedValue(undefined),
    }
    // Reset only the data fields; keep the action implementations intact.
    useWorkspaceStore.setState({
      roots: [],
      activeRoot: null,
      settings: { ...DEFAULT_WORKSPACE_SETTINGS },
      workspaceOverrides: {},
      isWorkspaceLevel: false,
      recommendedExtensions: { recommendations: [] },
      panelStates: {},
      recentWorkspaces: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Multi-root workspace
  // -------------------------------------------------------------------------
  describe('addRoot', () => {
    it('adds a root and sets it active when none is active', () => {
      const cap = captureEvents(['orion:root-added', 'orion:workspace-changed'])
      store().addRoot('/proj/a')

      expect(store().roots).toEqual(['/proj/a'])
      expect(store().activeRoot).toBe('/proj/a')

      // Both events fire on add.
      expect(cap.events.map((e) => e.name)).toEqual([
        'orion:root-added',
        'orion:workspace-changed',
      ])
      expect(cap.events[0].detail).toMatchObject({ path: '/proj/a', roots: ['/proj/a'] })
      cap.dispose()
    })

    it('does not change the active root when one already exists', () => {
      store().addRoot('/proj/a')
      store().addRoot('/proj/b')
      expect(store().roots).toEqual(['/proj/a', '/proj/b'])
      // activeRoot stays the first one because activeRoot ?? path keeps it.
      expect(store().activeRoot).toBe('/proj/a')
    })

    it('is idempotent: adding the same root twice is a no-op', () => {
      const cap = captureEvents(['orion:root-added'])
      store().addRoot('/proj/a')
      store().addRoot('/proj/a')
      expect(store().roots).toEqual(['/proj/a'])
      // Only one root-added event since the second call returns early.
      expect(cap.events).toHaveLength(1)
      cap.dispose()
    })

    it('persists workspace state and updates recent workspaces on add', () => {
      store().addRoot('/proj/a')

      const persisted = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY)!)
      expect(persisted['/proj/a'].roots).toEqual(['/proj/a'])

      const recent = JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY)!)
      expect(recent).toHaveLength(1)
      expect(recent[0]).toMatchObject({ id: '/proj/a', label: 'a', roots: ['/proj/a'] })
      // The recentWorkspaces state slice is kept in sync.
      expect(store().recentWorkspaces).toHaveLength(1)
    })
  })

  describe('removeRoot', () => {
    it('removes a root and falls back to the first remaining root as active', () => {
      store().addRoot('/proj/a')
      store().addRoot('/proj/b')
      // active is /proj/a; remove it.
      store().removeRoot('/proj/a')
      expect(store().roots).toEqual(['/proj/b'])
      expect(store().activeRoot).toBe('/proj/b')
    })

    it('keeps active root unchanged when a non-active root is removed', () => {
      store().addRoot('/proj/a')
      store().addRoot('/proj/b')
      store().removeRoot('/proj/b')
      expect(store().roots).toEqual(['/proj/a'])
      expect(store().activeRoot).toBe('/proj/a')
    })

    it('sets activeRoot to null when the last root is removed', () => {
      store().addRoot('/proj/a')
      store().removeRoot('/proj/a')
      expect(store().roots).toEqual([])
      expect(store().activeRoot).toBeNull()
    })

    it('dispatches removed + changed events', () => {
      store().addRoot('/proj/a')
      const cap = captureEvents(['orion:root-removed', 'orion:workspace-changed'])
      store().removeRoot('/proj/a')
      expect(cap.events.map((e) => e.name)).toEqual([
        'orion:root-removed',
        'orion:workspace-changed',
      ])
      cap.dispose()
    })
  })

  describe('setActiveRoot', () => {
    it('sets active root when the path is a known root', () => {
      store().addRoot('/proj/a')
      store().addRoot('/proj/b')
      store().setActiveRoot('/proj/b')
      expect(store().activeRoot).toBe('/proj/b')
    })

    it('ignores an unknown root', () => {
      store().addRoot('/proj/a')
      const cap = captureEvents(['orion:workspace-changed'])
      store().setActiveRoot('/proj/unknown')
      expect(store().activeRoot).toBe('/proj/a')
      expect(cap.events).toHaveLength(0)
      cap.dispose()
    })
  })

  // -------------------------------------------------------------------------
  // Settings
  // -------------------------------------------------------------------------
  describe('settings', () => {
    it('setSettings replaces the whole settings object', () => {
      const next = { ...DEFAULT_WORKSPACE_SETTINGS, tabSize: 8 }
      store().setSettings(next)
      expect(store().settings.tabSize).toBe(8)
    })

    it('updateSettings merges a partial patch', () => {
      store().updateSettings({ tabSize: 4, formatOnSave: true })
      expect(store().settings.tabSize).toBe(4)
      expect(store().settings.formatOnSave).toBe(true)
      // Untouched defaults preserved.
      expect(store().settings.insertSpaces).toBe(true)
    })
  })

  describe('loadWorkspaceSettings', () => {
    it('merges workspace overrides over user settings and defaults', async () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ tabSize: 4 }))
      ;(window.api.workspaceReadSettings as any).mockResolvedValue({
        settings: { formatOnSave: true },
      })
      await store().loadWorkspaceSettings('/proj/a')

      const s = store().settings
      expect(s.formatOnSave).toBe(true) // workspace override
      expect(s.tabSize).toBe(4) // user setting
      expect(s.autoSave).toBe(true) // default
      expect(store().workspaceOverrides).toEqual({ formatOnSave: true })
      expect(store().isWorkspaceLevel).toBe(true)
    })

    it('falls back to user+default merge when no workspace settings exist', async () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ tabSize: 6 }))
      ;(window.api.workspaceReadSettings as any).mockResolvedValue({})
      await store().loadWorkspaceSettings('/proj/a')

      expect(store().settings.tabSize).toBe(6)
      expect(store().workspaceOverrides).toEqual({})
      expect(store().isWorkspaceLevel).toBe(false)
    })

    it('catches IPC errors and falls back to user+default merge', async () => {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ tabSize: 3 }))
      ;(window.api.workspaceReadSettings as any).mockRejectedValue(new Error('boom'))
      await store().loadWorkspaceSettings('/proj/a')

      expect(store().settings.tabSize).toBe(3)
      expect(store().isWorkspaceLevel).toBe(false)
    })
  })

  describe('saveWorkspaceSettings', () => {
    it('writes settings via IPC, marks workspace-level, and mirrors to localStorage', async () => {
      store().updateSettings({ tabSize: 7 })
      await store().saveWorkspaceSettings('/proj/a')

      expect(window.api.workspaceWriteSettings).toHaveBeenCalledWith(
        '/proj/a',
        expect.objectContaining({ tabSize: 7 }),
      )
      expect(store().isWorkspaceLevel).toBe(true)
      const mirrored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)!)
      expect(mirrored.tabSize).toBe(7)
    })

    it('still mirrors to localStorage even when IPC write fails', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(window.api.workspaceWriteSettings as any).mockRejectedValue(new Error('disk full'))
      store().updateSettings({ tabSize: 9 })
      await store().saveWorkspaceSettings('/proj/a')

      // isWorkspaceLevel NOT set because the try block threw before set().
      expect(store().isWorkspaceLevel).toBe(false)
      const mirrored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)!)
      expect(mirrored.tabSize).toBe(9)
      expect(errSpy).toHaveBeenCalled()
    })
  })

  describe('saveWorkspaceSetting', () => {
    it('merges a single key into overrides + settings and persists via IPC', async () => {
      store().updateSettings({ tabSize: 2 })
      await store().saveWorkspaceSetting('/proj/a', 'tabSize', 5)

      expect(window.api.workspaceWriteSettings).toHaveBeenCalledWith('/proj/a', { tabSize: 5 })
      expect(store().settings.tabSize).toBe(5)
      expect(store().workspaceOverrides).toEqual({ tabSize: 5 })
      expect(store().isWorkspaceLevel).toBe(true)
    })

    it('does not mutate state when IPC write fails', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(window.api.workspaceWriteSettings as any).mockRejectedValue(new Error('nope'))
      await store().saveWorkspaceSetting('/proj/a', 'tabSize', 99)

      expect(store().settings.tabSize).toBe(DEFAULT_WORKSPACE_SETTINGS.tabSize)
      expect(store().workspaceOverrides).toEqual({})
      expect(store().isWorkspaceLevel).toBe(false)
      expect(errSpy).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Extension recommendations
  // -------------------------------------------------------------------------
  describe('extensions', () => {
    it('loadWorkspaceExtensions reads extensions from the API result', async () => {
      const exts: WorkspaceExtensions = {
        recommendations: [{ id: 'ext.one' }],
        unwantedRecommendations: ['ext.bad'],
      }
      ;(window.api.workspaceReadSettings as any).mockResolvedValue({ extensions: exts })
      await store().loadWorkspaceExtensions('/proj/a')
      expect(store().recommendedExtensions).toEqual(exts)
    })

    it('loadWorkspaceExtensions defaults to empty when API has no extensions', async () => {
      ;(window.api.workspaceReadSettings as any).mockResolvedValue({})
      await store().loadWorkspaceExtensions('/proj/a')
      expect(store().recommendedExtensions).toEqual({ recommendations: [] })
    })

    it('loadWorkspaceExtensions defaults to empty when API throws', async () => {
      ;(window.api.workspaceReadSettings as any).mockRejectedValue(new Error('x'))
      await store().loadWorkspaceExtensions('/proj/a')
      expect(store().recommendedExtensions).toEqual({ recommendations: [] })
    })

    it('addRecommendedExtension appends and persists via the API', async () => {
      await store().addRecommendedExtension('/proj/a', { id: 'ext.one', displayName: 'One' })
      expect(store().recommendedExtensions.recommendations).toEqual([
        { id: 'ext.one', displayName: 'One' },
      ])
      // saveWorkspaceExtensions writes overrides with the __extensions marker.
      expect(window.api.workspaceWriteSettings).toHaveBeenCalledWith(
        '/proj/a',
        expect.objectContaining({
          __extensions: { recommendations: [{ id: 'ext.one', displayName: 'One' }] },
        }),
      )
    })

    it('addRecommendedExtension is idempotent for the same id', async () => {
      await store().addRecommendedExtension('/proj/a', { id: 'ext.one' })
      await store().addRecommendedExtension('/proj/a', { id: 'ext.one', displayName: 'dup' })
      expect(store().recommendedExtensions.recommendations).toEqual([{ id: 'ext.one' }])
      // Second call returns early -> only one write.
      expect(window.api.workspaceWriteSettings).toHaveBeenCalledTimes(1)
    })

    it('removeRecommendedExtension removes by id and persists', async () => {
      await store().addRecommendedExtension('/proj/a', { id: 'ext.one' })
      await store().addRecommendedExtension('/proj/a', { id: 'ext.two' })
      await store().removeRecommendedExtension('/proj/a', 'ext.one')
      expect(store().recommendedExtensions.recommendations).toEqual([{ id: 'ext.two' }])
    })

    it('removeRecommendedExtension on a missing id leaves the list unchanged but still writes', async () => {
      await store().addRecommendedExtension('/proj/a', { id: 'ext.one' })
      ;(window.api.workspaceWriteSettings as any).mockClear()
      await store().removeRecommendedExtension('/proj/a', 'ext.missing')
      expect(store().recommendedExtensions.recommendations).toEqual([{ id: 'ext.one' }])
      // Always calls saveWorkspaceExtensions even if nothing changed.
      expect(window.api.workspaceWriteSettings).toHaveBeenCalledTimes(1)
    })

    it('saveWorkspaceExtensions logs and does not update state on IPC failure', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      ;(window.api.workspaceWriteSettings as any).mockRejectedValue(new Error('fail'))
      await store().saveWorkspaceExtensions('/proj/a', { recommendations: [{ id: 'z' }] })
      expect(store().recommendedExtensions).toEqual({ recommendations: [] })
      expect(errSpy).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Panel state
  // -------------------------------------------------------------------------
  describe('setPanelState', () => {
    it('stores panel state and merges across panels', () => {
      store().setPanelState('explorer', { isVisible: true, size: 200 })
      store().setPanelState('terminal', { isVisible: false })
      expect(store().panelStates).toEqual({
        explorer: { isVisible: true, size: 200 },
        terminal: { isVisible: false },
      })
    })

    it('persists panel state to localStorage when roots exist', () => {
      store().addRoot('/proj/a')
      store().setPanelState('explorer', { isVisible: true })
      const persisted = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY)!)
      expect(persisted['/proj/a'].panelStates.explorer).toEqual({ isVisible: true })
    })
  })

  // -------------------------------------------------------------------------
  // Recent workspaces
  // -------------------------------------------------------------------------
  describe('recent workspaces', () => {
    it('uses "<n> folders" as label for multi-root and dedupes by id', () => {
      store().openWorkspace(['/proj/a', '/proj/b'])
      const recent = store().recentWorkspaces
      expect(recent).toHaveLength(1)
      expect(recent[0].label).toBe('2 folders')
      // id is sorted roots joined by '|'
      expect(recent[0].id).toBe('/proj/a|/proj/b')
    })

    it('moves an existing workspace to the front (most-recent-first, no dupes)', () => {
      store().openWorkspace(['/proj/a'])
      store().openWorkspace(['/proj/b'])
      store().openWorkspace(['/proj/a']) // re-open a
      const ids = store().recentWorkspaces.map((r) => r.id)
      expect(ids).toEqual(['/proj/a', '/proj/b'])
    })

    it('caps the recent list at 10 entries', () => {
      for (let i = 0; i < 12; i++) store().openWorkspace([`/proj/${i}`])
      expect(store().recentWorkspaces).toHaveLength(10)
      // Most recent is last opened.
      expect(store().recentWorkspaces[0].id).toBe('/proj/11')
    })

    it('clearRecentWorkspaces empties state and localStorage', () => {
      store().openWorkspace(['/proj/a'])
      store().clearRecentWorkspaces()
      expect(store().recentWorkspaces).toEqual([])
      expect(JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY)!)).toEqual([])
    })

    it('removeRecentWorkspace removes a single entry by id', () => {
      store().openWorkspace(['/proj/a'])
      store().openWorkspace(['/proj/b'])
      store().removeRecentWorkspace('/proj/a')
      const ids = store().recentWorkspaces.map((r) => r.id)
      expect(ids).toEqual(['/proj/b'])
      expect(JSON.parse(localStorage.getItem(RECENT_WORKSPACES_KEY)!)).toHaveLength(1)
    })
  })

  // -------------------------------------------------------------------------
  // openWorkspace
  // -------------------------------------------------------------------------
  describe('openWorkspace', () => {
    it('is a no-op for an empty roots array', () => {
      const cap = captureEvents(['orion:workspace-changed'])
      store().openWorkspace([])
      expect(store().roots).toEqual([])
      expect(cap.events).toHaveLength(0)
      cap.dispose()
    })

    it('sets roots, defaults active to first root, and loads settings from first root', () => {
      store().openWorkspace(['/proj/a', '/proj/b'])
      expect(store().roots).toEqual(['/proj/a', '/proj/b'])
      expect(store().activeRoot).toBe('/proj/a')
      expect(window.api.workspaceReadSettings).toHaveBeenCalledWith('/proj/a')
    })

    it('restores persisted activeRoot and panelStates for known roots', () => {
      // Seed persisted state via addRoot + setPanelState, then mutate and re-open.
      store().addRoot('/proj/a')
      store().addRoot('/proj/b')
      store().setActiveRoot('/proj/b')
      store().setPanelState('explorer', { isVisible: true, size: 321 })

      // Wipe in-memory state, then re-open.
      useWorkspaceStore.setState({ roots: [], activeRoot: null, panelStates: {} })
      store().openWorkspace(['/proj/a', '/proj/b'])

      expect(store().activeRoot).toBe('/proj/b')
      expect(store().panelStates.explorer).toEqual({ isVisible: true, size: 321 })
    })
  })

  // -------------------------------------------------------------------------
  // persistState / restoreState
  // -------------------------------------------------------------------------
  describe('persistState / restoreState', () => {
    it('persistState does nothing with no roots', () => {
      store().persistState()
      expect(localStorage.getItem(WORKSPACE_STATE_KEY)).toBeNull()
    })

    it('persistState writes keyed by sorted-root id', () => {
      useWorkspaceStore.setState({
        roots: ['/proj/b', '/proj/a'],
        activeRoot: '/proj/b',
        panelStates: {},
      })
      store().persistState()
      const all = JSON.parse(localStorage.getItem(WORKSPACE_STATE_KEY)!)
      // workspaceId sorts roots: a before b.
      expect(Object.keys(all)).toEqual(['/proj/a|/proj/b'])
      expect(all['/proj/a|/proj/b'].activeRoot).toBe('/proj/b')
    })

    it('restoreState is a no-op when no persisted state exists', () => {
      const cap = captureEvents(['orion:workspace-changed'])
      store().restoreState(['/unknown'])
      expect(store().roots).toEqual([])
      expect(cap.events).toHaveLength(0)
      cap.dispose()
    })

    it('restoreState loads persisted roots/active/panels and emits changed event', () => {
      useWorkspaceStore.setState({
        roots: ['/proj/a'],
        activeRoot: '/proj/a',
        panelStates: { explorer: { isVisible: true } },
      })
      store().persistState()

      useWorkspaceStore.setState({ roots: [], activeRoot: null, panelStates: {} })
      const cap = captureEvents(['orion:workspace-changed'])
      store().restoreState(['/proj/a'])

      expect(store().roots).toEqual(['/proj/a'])
      expect(store().activeRoot).toBe('/proj/a')
      expect(store().panelStates).toEqual({ explorer: { isVisible: true } })
      expect(cap.events).toHaveLength(1)
      cap.dispose()
    })
  })
})
