/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { usePanelStore, type PanelDefinition } from './panels'

/**
 * Tests for the panel-management Zustand store.
 *
 * The store is a module-level singleton persisted under the key "orion-panels".
 * Each test resets the mutable data fields to their documented defaults via
 * setState (NOT replace:true) so tests cannot bleed into one another.
 */

const store = () => usePanelStore.getState()

// Snapshot of the genuine default definitions before any test mutates them
// (registerPanel / unregisterPanel / updateDefinition / setBadge all mutate
// the definitions array). Deep-cloned so restoration is mutation-proof.
const DEFAULT_DEFINITIONS = structuredClone(usePanelStore.getState().definitions)

// Mirror of getDefaultStates() in panels.ts: every default panel maps to a
// PanelState whose `visible` matches defaultVisible and position matches its def.
function defaultStates() {
  const states: Record<string, { id: string; visible: boolean; position: string }> = {}
  for (const def of DEFAULT_DEFINITIONS) {
    states[def.id] = { id: def.id, visible: def.defaultVisible, position: def.position }
  }
  return states
}

beforeEach(() => {
  localStorage.clear()
  usePanelStore.setState({
    definitions: structuredClone(DEFAULT_DEFINITIONS),
    states: structuredClone(defaultStates()) as never,
    activeLeftPanel: 'explorer',
    activeRightPanel: null,
    activeBottomPanel: 'terminal',
    floatingPanels: [],
    focusedPanel: null,
  })
})

/* ── Defaults / baseline ──────────────────────────────── */

describe('initial state', () => {
  it('seeds the documented default active panels', () => {
    expect(store().activeLeftPanel).toBe('explorer')
    expect(store().activeRightPanel).toBeNull()
    expect(store().activeBottomPanel).toBe('terminal')
    expect(store().floatingPanels).toEqual([])
    expect(store().focusedPanel).toBeNull()
  })

  it('only the explorer panel is visible by default', () => {
    const visibleIds = store().getVisiblePanels().map(p => p.id)
    expect(visibleIds).toEqual(['explorer'])
  })

  it('creates one state entry per default definition with matching position', () => {
    const { states, definitions } = store()
    expect(Object.keys(states)).toHaveLength(definitions.length)
    for (const def of definitions) {
      expect(states[def.id].position).toBe(def.position)
      expect(states[def.id].visible).toBe(def.defaultVisible)
    }
  })
})

/* ── Visibility: show / hide / toggle ─────────────────── */

describe('visibility', () => {
  it('showPanel makes a hidden panel visible and activates it in its position', () => {
    expect(store().isPanelVisible('search')).toBe(false)
    store().showPanel('search')
    expect(store().isPanelVisible('search')).toBe(true)
    // 'search' is a left panel, so showing it must set it active on the left.
    expect(store().activeLeftPanel).toBe('search')
    expect(store().getActivePanel('left')).toBe('search')
  })

  it('showPanel for an unregistered id is a no-op (no state created)', () => {
    store().showPanel('does-not-exist')
    expect(store().getPanelState('does-not-exist')).toBeUndefined()
    expect(store().isPanelVisible('does-not-exist')).toBe(false)
  })

  it('hidePanel hides a visible panel but does NOT change the active panel', () => {
    store().showPanel('search')
    expect(store().activeLeftPanel).toBe('search')
    store().hidePanel('search')
    expect(store().isPanelVisible('search')).toBe(false)
    // Pins current behaviour: hiding leaves activeLeftPanel pointing at the
    // now-hidden panel (the store never clears it on hide).
    expect(store().activeLeftPanel).toBe('search')
  })

  it('togglePanel flips visibility both directions', () => {
    expect(store().isPanelVisible('terminal')).toBe(false)
    store().togglePanel('terminal')
    expect(store().isPanelVisible('terminal')).toBe(true)
    expect(store().activeBottomPanel).toBe('terminal')
    store().togglePanel('terminal')
    expect(store().isPanelVisible('terminal')).toBe(false)
  })

  it('isPanelVisible returns false for unknown ids', () => {
    expect(store().isPanelVisible('ghost')).toBe(false)
  })

  it('showPanel on a floating panel does not touch the docked active panels', () => {
    store().floatPanel('outline')
    const before = {
      left: store().activeLeftPanel,
      right: store().activeRightPanel,
      bottom: store().activeBottomPanel,
    }
    store().showPanel('outline')
    expect(store().isPanelVisible('outline')).toBe(true)
    expect(store().activeLeftPanel).toBe(before.left)
    expect(store().activeRightPanel).toBe(before.right)
    expect(store().activeBottomPanel).toBe(before.bottom)
  })
})

/* ── Active panel selection ───────────────────────────── */

describe('active panel selection', () => {
  it('setActivePanel routes to the correct slot per position', () => {
    store().setActivePanel('left', 'debug')
    store().setActivePanel('right', 'chat')
    store().setActivePanel('bottom', 'problems')
    expect(store().activeLeftPanel).toBe('debug')
    expect(store().activeRightPanel).toBe('chat')
    expect(store().activeBottomPanel).toBe('problems')
  })

  it('setActivePanel accepts null to clear a slot', () => {
    store().setActivePanel('left', null)
    expect(store().activeLeftPanel).toBeNull()
  })

  it('setActivePanel for "floating" is a no-op on all slots', () => {
    store().setActivePanel('floating', 'whatever')
    expect(store().activeLeftPanel).toBe('explorer')
    expect(store().activeRightPanel).toBeNull()
    expect(store().activeBottomPanel).toBe('terminal')
  })

  it('getActivePanel mirrors setActivePanel and returns null for floating', () => {
    store().setActivePanel('right', 'composer')
    expect(store().getActivePanel('right')).toBe('composer')
    expect(store().getActivePanel('floating')).toBeNull()
  })
})

/* ── Position: move / float / dock ────────────────────── */

describe('positioning', () => {
  it('movePanel to a docked position updates state and stays off the floating list', () => {
    store().movePanel('terminal', 'left')
    expect(store().getPanelState('terminal')?.position).toBe('left')
    expect(store().floatingPanels).not.toContain('terminal')
  })

  it('movePanel to floating adds to floatingPanels exactly once', () => {
    store().movePanel('terminal', 'floating')
    store().movePanel('terminal', 'floating')
    expect(store().getPanelState('terminal')?.position).toBe('floating')
    expect(store().floatingPanels.filter(p => p === 'terminal')).toHaveLength(1)
  })

  it('movePanel away from floating removes it from floatingPanels', () => {
    store().movePanel('terminal', 'floating')
    expect(store().floatingPanels).toContain('terminal')
    store().movePanel('terminal', 'bottom')
    expect(store().floatingPanels).not.toContain('terminal')
  })

  it('floatPanel applies provided config and registers it as floating', () => {
    store().floatPanel('chat', { x: 10, y: 20, width: 800, height: 600 })
    const s = store().getPanelState('chat')
    expect(s?.position).toBe('floating')
    expect(s?.floatingX).toBe(10)
    expect(s?.floatingY).toBe(20)
    expect(s?.width).toBe(800)
    expect(s?.height).toBe(600)
    expect(store().floatingPanels).toContain('chat')
  })

  it('floatPanel falls back to defaults when no config is given', () => {
    store().floatPanel('chat')
    const s = store().getPanelState('chat')
    expect(s?.floatingX).toBe(100)
    expect(s?.floatingY).toBe(100)
    expect(s?.width).toBe(400)
    expect(s?.height).toBe(300)
  })

  it('floatPanel with x:0 falls back to 100 (pins || quirk)', () => {
    // Documented current behaviour: floatingX uses `config?.x || 100`, so a
    // legitimately-zero coordinate is replaced by the default. Suspected bug.
    store().floatPanel('chat', { x: 0, y: 0, width: 0, height: 0 })
    const s = store().getPanelState('chat')
    expect(s?.floatingX).toBe(100)
    expect(s?.floatingY).toBe(100)
    expect(s?.width).toBe(400)
    expect(s?.height).toBe(300)
  })

  it('floatPanel does not duplicate an already-floating panel', () => {
    store().floatPanel('chat')
    store().floatPanel('chat')
    expect(store().floatingPanels.filter(p => p === 'chat')).toHaveLength(1)
  })

  it('dockPanel moves a floating panel back to a docked position', () => {
    store().floatPanel('chat')
    store().dockPanel('chat', 'right')
    expect(store().getPanelState('chat')?.position).toBe('right')
    expect(store().floatingPanels).not.toContain('chat')
  })
})

/* ── Size ─────────────────────────────────────────────── */

describe('size', () => {
  it('setPanelSize sets both dimensions', () => {
    store().setPanelSize('terminal', 500, 250)
    const s = store().getPanelState('terminal')
    expect(s?.width).toBe(500)
    expect(s?.height).toBe(250)
  })

  it('setPanelSize updates only the dimensions provided (undefined skipped)', () => {
    store().setPanelSize('terminal', 500, 250)
    store().setPanelSize('terminal', 800) // height omitted
    const s = store().getPanelState('terminal')
    expect(s?.width).toBe(800)
    expect(s?.height).toBe(250) // preserved
  })

  it('setPanelSize allows width 0 (only `=== undefined` is skipped)', () => {
    store().setPanelSize('terminal', 0, 0)
    const s = store().getPanelState('terminal')
    expect(s?.width).toBe(0)
    expect(s?.height).toBe(0)
  })
})

/* ── Focus ────────────────────────────────────────────── */

describe('focus', () => {
  it('focusPanel sets focusedPanel and blurPanel clears it', () => {
    store().focusPanel('debug')
    expect(store().focusedPanel).toBe('debug')
    store().blurPanel()
    expect(store().focusedPanel).toBeNull()
  })
})

/* ── Badges ───────────────────────────────────────────── */

describe('badges', () => {
  it('setBadge updates the definition badge (numeric and string)', () => {
    store().setBadge('problems', 5)
    expect(store().definitions.find(d => d.id === 'problems')?.badge).toBe(5)
    store().setBadge('problems', '!')
    expect(store().definitions.find(d => d.id === 'problems')?.badge).toBe('!')
  })

  it('setBadge(undefined) clears the badge', () => {
    store().setBadge('problems', 3)
    store().setBadge('problems', undefined)
    expect(store().definitions.find(d => d.id === 'problems')?.badge).toBeUndefined()
  })
})

/* ── Pin ──────────────────────────────────────────────── */

describe('pin', () => {
  it('togglePinPanel flips the pinned flag from undefined -> true -> false', () => {
    expect(store().getPanelState('explorer')?.pinned).toBeUndefined()
    store().togglePinPanel('explorer')
    expect(store().getPanelState('explorer')?.pinned).toBe(true)
    store().togglePinPanel('explorer')
    expect(store().getPanelState('explorer')?.pinned).toBe(false)
  })

  it('togglePinPanel creates a state entry for an unseen-but-registered id', () => {
    // 'ports' has a default state, but exercise that pinning preserves id.
    store().togglePinPanel('ports')
    expect(store().getPanelState('ports')?.id).toBe('ports')
    expect(store().getPanelState('ports')?.pinned).toBe(true)
  })
})

/* ── Registration ─────────────────────────────────────── */

describe('registration', () => {
  const customDef: PanelDefinition = {
    id: 'custom-panel',
    label: 'Custom',
    icon: 'star',
    position: 'right',
    defaultVisible: true,
    priority: 99,
  }

  it('registerPanel adds a definition and a seeded state', () => {
    store().registerPanel(customDef)
    expect(store().definitions.find(d => d.id === 'custom-panel')).toMatchObject(customDef)
    const s = store().getPanelState('custom-panel')
    expect(s).toMatchObject({ id: 'custom-panel', visible: true, position: 'right' })
  })

  it('registerPanel is idempotent — re-registering an existing id is ignored', () => {
    store().registerPanel(customDef)
    const countBefore = store().definitions.length
    store().registerPanel({ ...customDef, label: 'Mutated' })
    expect(store().definitions.length).toBe(countBefore)
    expect(store().definitions.find(d => d.id === 'custom-panel')?.label).toBe('Custom')
  })

  it('unregisterPanel removes the definition and floating membership', () => {
    store().registerPanel(customDef)
    store().floatPanel('custom-panel')
    expect(store().floatingPanels).toContain('custom-panel')
    store().unregisterPanel('custom-panel')
    expect(store().definitions.find(d => d.id === 'custom-panel')).toBeUndefined()
    expect(store().floatingPanels).not.toContain('custom-panel')
  })

  it('unregisterPanel leaves a dangling state entry behind (current behaviour)', () => {
    // Suspected bug: unregisterPanel never deletes states[id], so the orphaned
    // PanelState survives. Pinned here to document, not endorse.
    store().registerPanel(customDef)
    store().unregisterPanel('custom-panel')
    expect(store().getPanelState('custom-panel')).toBeDefined()
  })

  it('updateDefinition merges partial updates into the matching definition', () => {
    store().updateDefinition('explorer', { label: 'Files', priority: 10 })
    const def = store().definitions.find(d => d.id === 'explorer')
    expect(def?.label).toBe('Files')
    expect(def?.priority).toBe(10)
    expect(def?.icon).toBe('files') // untouched field preserved
  })
})

/* ── Queries ──────────────────────────────────────────── */

describe('queries', () => {
  it('getPanelsByPosition returns panels at that position sorted by priority', () => {
    const left = store().getPanelsByPosition('left')
    expect(left.map(p => p.id)).toEqual([
      'explorer', 'search', 'source-control', 'debug', 'extensions', 'testing', 'remote-explorer',
    ])
    const priorities = left.map(p => p.priority)
    expect([...priorities]).toEqual([...priorities].sort((a, b) => a - b))
  })

  it('getPanelsByPosition follows runtime state position, not definition position', () => {
    // Move a bottom panel to the right; it should now appear under "right".
    store().movePanel('terminal', 'right')
    expect(store().getPanelsByPosition('right').map(p => p.id)).toContain('terminal')
    expect(store().getPanelsByPosition('bottom').map(p => p.id)).not.toContain('terminal')
  })

  it('getVisiblePanels reflects show/hide operations', () => {
    store().showPanel('chat')
    store().showPanel('terminal')
    const ids = store().getVisiblePanels().map(p => p.id).sort()
    expect(ids).toEqual(['chat', 'explorer', 'terminal'])
    store().hidePanel('explorer')
    expect(store().getVisiblePanels().map(p => p.id).sort()).toEqual(['chat', 'terminal'])
  })

  it('getFloatingPanels merges definition + state for each floating id', () => {
    store().floatPanel('chat', { x: 5, y: 6, width: 700, height: 500 })
    const floating = store().getFloatingPanels()
    expect(floating).toHaveLength(1)
    expect(floating[0]).toMatchObject({
      id: 'chat',
      label: 'AI Chat', // from definition
      position: 'floating', // from state
      floatingX: 5,
      width: 700,
    })
  })

  it('getFloatingPanels drops ids that lack a definition', () => {
    // Force a floating id whose definition was removed -> filtered out.
    store().floatPanel('chat')
    usePanelStore.setState({ floatingPanels: [...store().floatingPanels, 'phantom'] })
    const floating = store().getFloatingPanels()
    expect(floating.map(p => p.id)).toEqual(['chat'])
  })
})

/* ── Bulk operations ──────────────────────────────────── */

describe('bulk operations', () => {
  it('hideAllPanels() with no position hides every panel', () => {
    store().showPanel('chat')
    store().showPanel('terminal')
    store().hideAllPanels()
    expect(store().getVisiblePanels()).toHaveLength(0)
  })

  it('hideAllPanels(position) hides only panels currently at that position', () => {
    store().showPanel('explorer') // left, visible
    store().showPanel('search')   // left, visible
    store().showPanel('chat')     // right, visible
    store().hideAllPanels('left')
    expect(store().isPanelVisible('explorer')).toBe(false)
    expect(store().isPanelVisible('search')).toBe(false)
    expect(store().isPanelVisible('chat')).toBe(true) // right untouched
  })

  it('resetLayout restores default states and active panels', () => {
    store().showPanel('chat')
    store().floatPanel('terminal')
    store().focusPanel('debug')
    store().setActivePanel('right', 'composer')

    store().resetLayout()

    expect(store().activeLeftPanel).toBe('explorer')
    expect(store().activeRightPanel).toBeNull()
    expect(store().activeBottomPanel).toBe('terminal')
    expect(store().floatingPanels).toEqual([])
    expect(store().focusedPanel).toBeNull()
    expect(store().getVisiblePanels().map(p => p.id)).toEqual(['explorer'])
  })

  it('resetLayout does not touch registered custom definitions', () => {
    store().registerPanel({
      id: 'custom-panel', label: 'Custom', icon: 'star',
      position: 'right', defaultVisible: false, priority: 99,
    })
    store().resetLayout()
    // Definition survives, but its state is gone (reset rebuilds defaults only).
    expect(store().definitions.find(d => d.id === 'custom-panel')).toBeDefined()
    expect(store().getPanelState('custom-panel')).toBeUndefined()
  })
})

/* ── Persistence ──────────────────────────────────────── */

describe('persistence', () => {
  it('persists only the partialized slice under the "orion-panels" key', () => {
    store().showPanel('chat')
    store().setActivePanel('right', 'chat')

    const raw = localStorage.getItem('orion-panels')
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    const persisted = parsed.state

    // partialize keeps exactly these keys.
    expect(Object.keys(persisted).sort()).toEqual(
      ['activeBottomPanel', 'activeLeftPanel', 'activeRightPanel', 'states'].sort(),
    )
    // Non-partialized fields must be absent.
    expect(persisted).not.toHaveProperty('definitions')
    expect(persisted).not.toHaveProperty('floatingPanels')
    expect(persisted).not.toHaveProperty('focusedPanel')

    // Persisted content reflects the mutation.
    expect(persisted.states.chat.visible).toBe(true)
    expect(persisted.activeRightPanel).toBe('chat')
  })
})
