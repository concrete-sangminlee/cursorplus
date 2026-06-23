/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from './layout'

/**
 * Snapshot of the store's documented default values (mirrors the module-level
 * DEFAULT_* constants in layout.ts). Used to restore data fields in beforeEach
 * so every test starts from a known baseline without `replace: true`.
 */
const DEFAULT_PANELS = {
  left: { visible: true, size: 260, activeTab: 'explorer', tabs: ['explorer', 'search', 'git', 'debug', 'extensions'], collapsed: false },
  right: { visible: true, size: 350, activeTab: 'chat', tabs: ['chat', 'composer'], collapsed: false },
  bottom: { visible: true, size: 250, activeTab: 'terminal', tabs: ['terminal', 'output', 'problems', 'debug-console', 'ports'], collapsed: false },
}

const DEFAULT_LAYOUT = { id: 'root', type: 'leaf' as const, groupId: 'group-1', size: 100 }
const DEFAULT_GROUP = { id: 'group-1', tabs: [], activeTabId: null, size: 100 }
const DEFAULT_WINDOW = { x: 100, y: 100, width: 1400, height: 900, maximized: false, fullscreen: false }

const BUILT_IN_PRESET_IDS = ['default', 'focus', 'split', 'review', 'debug']

const store = () => useLayoutStore.getState()

// Snapshot the genuine built-in presets (with their real focus/split panel data)
// before any test mutates the preset list, so beforeEach can restore them.
const BUILT_IN_PRESETS_SNAPSHOT = structuredClone(useLayoutStore.getState().presets)

beforeEach(() => {
  localStorage.clear()
  // Reset every mutable data field to its documented default. We deliberately
  // deep-clone so tests can't bleed nested-object mutations into one another.
  useLayoutStore.setState({
    editorLayout: structuredClone(DEFAULT_LAYOUT),
    editorGroups: [structuredClone(DEFAULT_GROUP)],
    activeGroupId: 'group-1',
    panels: structuredClone(DEFAULT_PANELS),
    windowState: structuredClone(DEFAULT_WINDOW),
    zenMode: false,
    centeredLayout: false,
    activePreset: 'default',
    // Reset presets back to just the built-ins so custom presets saved in one
    // test (and any Date.now() id collisions) cannot leak into the next.
    presets: structuredClone(BUILT_IN_PRESETS_SNAPSHOT),
  })
})

/* ── Panel visibility toggles ──────────────────────────── */

describe('panel visibility toggles', () => {
  it('togglePanel flips left panel visibility on then off', () => {
    expect(store().panels.left.visible).toBe(true)
    store().togglePanel('left')
    expect(store().panels.left.visible).toBe(false)
    store().togglePanel('left')
    expect(store().panels.left.visible).toBe(true)
  })

  it('togglePanel only affects the targeted panel', () => {
    store().togglePanel('bottom')
    expect(store().panels.bottom.visible).toBe(false)
    expect(store().panels.left.visible).toBe(true)
    expect(store().panels.right.visible).toBe(true)
  })

  it('togglePanel preserves other fields on the panel (size/tab/collapsed)', () => {
    const before = { ...store().panels.right }
    store().togglePanel('right')
    const after = store().panels.right
    expect(after.visible).toBe(!before.visible)
    expect(after.size).toBe(before.size)
    expect(after.activeTab).toBe(before.activeTab)
    expect(after.collapsed).toBe(before.collapsed)
    expect(after.tabs).toEqual(before.tabs)
  })

  it('each panel toggles independently across left/right/bottom', () => {
    for (const p of ['left', 'right', 'bottom'] as const) {
      const initial = store().panels[p].visible
      store().togglePanel(p)
      expect(store().panels[p].visible).toBe(!initial)
    }
  })
})

/* ── Panel sizing / resizing ───────────────────────────── */

describe('panel sizing (setPanelSize)', () => {
  it('sets an in-range size verbatim', () => {
    store().setPanelSize('left', 300)
    expect(store().panels.left.size).toBe(300)
  })

  it('does not mutate sibling panels when sizing one', () => {
    store().setPanelSize('bottom', 400)
    expect(store().panels.bottom.size).toBe(400)
    expect(store().panels.left.size).toBe(260)
    expect(store().panels.right.size).toBe(350)
  })

  // NOTE: setPanelSize performs NO clamping. The requirement asked to verify
  // min/max bounds math, but the production code has none. These tests pin the
  // CURRENT (unclamped) behavior. See "SUSPECTED BUGS" in the report.
  it('CURRENT BEHAVIOR: accepts a size of 0 without clamping to a minimum', () => {
    store().setPanelSize('left', 0)
    expect(store().panels.left.size).toBe(0)
  })

  it('CURRENT BEHAVIOR: accepts a negative size (no lower bound)', () => {
    store().setPanelSize('right', -50)
    expect(store().panels.right.size).toBe(-50)
  })

  it('CURRENT BEHAVIOR: accepts an arbitrarily large size (no upper bound)', () => {
    store().setPanelSize('bottom', 99999)
    expect(store().panels.bottom.size).toBe(99999)
  })

  it('CURRENT BEHAVIOR: accepts a fractional size unchanged', () => {
    store().setPanelSize('left', 123.456)
    expect(store().panels.left.size).toBe(123.456)
  })
})

/* ── Editor group resizing ─────────────────────────────── */

describe('resizeGroups', () => {
  it('updates the size of the targeted group only', () => {
    const id = store().createGroup()
    store().resizeGroups('group-1', 30)
    store().resizeGroups(id, 70)
    const g1 = store().editorGroups.find(g => g.id === 'group-1')
    const g2 = store().editorGroups.find(g => g.id === id)
    expect(g1?.size).toBe(30)
    expect(g2?.size).toBe(70)
  })

  it('is a no-op for an unknown group id', () => {
    const before = store().editorGroups.map(g => g.size)
    store().resizeGroups('does-not-exist', 999)
    expect(store().editorGroups.map(g => g.size)).toEqual(before)
  })

  // NOTE: resizeGroups also performs no clamping.
  it('CURRENT BEHAVIOR: accepts out-of-range group sizes unchanged', () => {
    store().resizeGroups('group-1', -10)
    expect(store().editorGroups.find(g => g.id === 'group-1')?.size).toBe(-10)
    store().resizeGroups('group-1', 250)
    expect(store().editorGroups.find(g => g.id === 'group-1')?.size).toBe(250)
  })
})

/* ── Sidebar / bottom-panel show/hide via collapse/expand ── */

describe('collapse / expand panels', () => {
  it('collapsePanel sets collapsed=true without touching visible', () => {
    store().collapsePanel('left')
    expect(store().panels.left.collapsed).toBe(true)
    expect(store().panels.left.visible).toBe(true)
  })

  it('expandPanel clears collapsed and forces visible=true', () => {
    store().collapsePanel('left')
    store().togglePanel('left') // also hide it
    expect(store().panels.left.visible).toBe(false)
    expect(store().panels.left.collapsed).toBe(true)

    store().expandPanel('left')
    expect(store().panels.left.collapsed).toBe(false)
    expect(store().panels.left.visible).toBe(true)
  })

  it('collapse/expand on the bottom panel does not affect the left panel', () => {
    store().collapsePanel('bottom')
    expect(store().panels.bottom.collapsed).toBe(true)
    expect(store().panels.left.collapsed).toBe(false)
  })
})

/* ── Active-view (panel tab) selection ─────────────────── */

describe('setPanelTab (active view selection)', () => {
  it('changes the active tab of a panel', () => {
    store().setPanelTab('left', 'git')
    expect(store().panels.left.activeTab).toBe('git')
  })

  it('forces the panel visible when selecting a tab', () => {
    store().togglePanel('left') // hide first
    expect(store().panels.left.visible).toBe(false)
    store().setPanelTab('left', 'search')
    expect(store().panels.left.activeTab).toBe('search')
    expect(store().panels.left.visible).toBe(true)
  })

  it('does not alter the list of available tabs', () => {
    const tabs = store().panels.right.tabs
    store().setPanelTab('right', 'composer')
    expect(store().panels.right.tabs).toEqual(tabs)
    expect(store().panels.right.activeTab).toBe('composer')
  })
})

/* ── Layout modes ──────────────────────────────────────── */

describe('layout modes', () => {
  it('toggleZenMode flips zenMode', () => {
    expect(store().zenMode).toBe(false)
    store().toggleZenMode()
    expect(store().zenMode).toBe(true)
    store().toggleZenMode()
    expect(store().zenMode).toBe(false)
  })

  it('toggleCenteredLayout flips centeredLayout independently of zenMode', () => {
    store().toggleCenteredLayout()
    expect(store().centeredLayout).toBe(true)
    expect(store().zenMode).toBe(false)
  })

  it('setFullscreen sets the windowState flag without clobbering other window fields', () => {
    store().setFullscreen(true)
    expect(store().windowState.fullscreen).toBe(true)
    expect(store().windowState.width).toBe(1400)
    expect(store().windowState.maximized).toBe(false)
    store().setFullscreen(false)
    expect(store().windowState.fullscreen).toBe(false)
  })
})

/* ── Presets ───────────────────────────────────────────── */

describe('presets', () => {
  it('ships with the five built-in presets', () => {
    const ids = store().presets.map(p => p.id)
    for (const id of BUILT_IN_PRESET_IDS) expect(ids).toContain(id)
  })

  it('loadPreset applies the focus preset (all panels hidden) and sets activePreset', () => {
    store().loadPreset('focus')
    expect(store().activePreset).toBe('focus')
    expect(store().panels.left.visible).toBe(false)
    expect(store().panels.right.visible).toBe(false)
    expect(store().panels.bottom.visible).toBe(false)
  })

  it('loadPreset switches the editor layout to a split for side-by-side', () => {
    store().loadPreset('split')
    expect(store().editorLayout.type).toBe('split')
    expect(store().editorLayout.children?.length).toBe(2)
  })

  it('loadPreset is a no-op for an unknown id', () => {
    const before = store().activePreset
    store().loadPreset('nope')
    expect(store().activePreset).toBe(before)
  })

  it('savePreset captures current panels/layout and returns a usable id', () => {
    store().setPanelTab('left', 'git')
    store().togglePanel('bottom') // hide bottom
    const id = store().savePreset('My Layout', 'desc here')

    const saved = store().presets.find(p => p.id === id)
    expect(saved).toBeDefined()
    expect(saved?.name).toBe('My Layout')
    expect(saved?.description).toBe('desc here')
    expect(saved?.panels.left.activeTab).toBe('git')
    expect(saved?.panels.bottom.visible).toBe(false)
  })

  it('savePreset defaults description to empty string when omitted', () => {
    store().savePreset('No Desc')
    // NOTE: savePreset derives ids from Date.now(), so presets saved within the
    // same millisecond collide. We assert on the just-appended preset (last in
    // the list) rather than find()-by-id to avoid a flaky collision match.
    const saved = store().presets[store().presets.length - 1]
    expect(saved.name).toBe('No Desc')
    expect(saved.description).toBe('')
  })

  it('CURRENT BEHAVIOR: savePreset can produce colliding ids (Date.now based)', () => {
    const id1 = store().savePreset('A')
    const id2 = store().savePreset('B')
    // When saved in the same millisecond the ids are identical; find()-by-id
    // then resolves to the first match. This pins the collision behavior.
    if (id1 === id2) {
      expect(store().presets.find(p => p.id === id1)?.name).toBe('A')
    }
    // Regardless of collision, both presets are appended to the list.
    expect(store().presets.filter(p => p.name === 'A' || p.name === 'B').length).toBe(2)
  })

  it('a saved custom preset can be loaded back', () => {
    store().setPanelSize('left', 410)
    const id = store().savePreset('Wide')
    // change state, then load the preset back
    store().setPanelSize('left', 100)
    store().loadPreset(id)
    expect(store().panels.left.size).toBe(410)
    expect(store().activePreset).toBe(id)
  })

  it('deletePreset removes a custom preset', () => {
    const id = store().savePreset('Temp')
    expect(store().presets.some(p => p.id === id)).toBe(true)
    store().deletePreset(id)
    expect(store().presets.some(p => p.id === id)).toBe(false)
  })

  it('CURRENT BEHAVIOR: deletePreset does NOT remove built-in presets', () => {
    // The filter predicate `p.id !== presetId || BUILT_IN_PRESETS.some(...)`
    // keeps any preset whose id is built-in, so built-ins survive deletion.
    store().deletePreset('default')
    expect(store().presets.some(p => p.id === 'default')).toBe(true)
    expect(store().presets.map(p => p.id)).toContain('focus')
  })
})

/* ── Persistence (localStorage) ────────────────────────── */

describe('persistence', () => {
  const STORAGE_KEY = 'orion:layout'

  it('saveLayout writes panels/windowState/activePreset to localStorage', () => {
    store().setPanelSize('left', 333)
    store().setFullscreen(true)
    store().saveLayout()

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.panels.left.size).toBe(333)
    expect(parsed.windowState.fullscreen).toBe(true)
    expect(parsed.activePreset).toBe('default')
    // editorGroups / zenMode are intentionally NOT persisted
    expect(parsed.editorGroups).toBeUndefined()
    expect(parsed.zenMode).toBeUndefined()
  })

  it('restoreLayout hydrates state from localStorage, merging over defaults', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      panels: { left: { ...DEFAULT_PANELS.left, size: 500, visible: false } },
      windowState: { ...DEFAULT_WINDOW, width: 800 },
      activePreset: 'focus',
    }))
    store().restoreLayout()
    expect(store().panels.left.size).toBe(500)
    expect(store().panels.left.visible).toBe(false)
    // right/bottom fall back to defaults via the {...DEFAULT_PANELS, ...data.panels} merge
    expect(store().panels.right.size).toBe(350)
    expect(store().windowState.width).toBe(800)
    expect(store().activePreset).toBe('focus')
  })

  it('restoreLayout defaults activePreset to "default" when absent in stored data', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ panels: {}, windowState: {} }))
    store().restoreLayout()
    expect(store().activePreset).toBe('default')
  })

  it('restoreLayout is a no-op when nothing is stored', () => {
    store().setPanelSize('left', 271)
    store().restoreLayout()
    expect(store().panels.left.size).toBe(271)
  })

  it('restoreLayout swallows malformed JSON without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    const before = store().panels.left.size
    expect(() => store().restoreLayout()).not.toThrow()
    expect(store().panels.left.size).toBe(before)
  })

  it('saveLayout round-trips through restoreLayout', () => {
    store().setPanelSize('bottom', 275)
    store().setPanelTab('left', 'search')
    store().saveLayout()
    // mutate live state, then restore
    store().setPanelSize('bottom', 100)
    store().setPanelTab('left', 'explorer')
    store().restoreLayout()
    expect(store().panels.bottom.size).toBe(275)
    expect(store().panels.left.activeTab).toBe('search')
  })
})

/* ── Reset to default ──────────────────────────────────── */

describe('resetLayout', () => {
  it('restores panels, layout modes, and activePreset to defaults', () => {
    store().togglePanel('left')
    store().setPanelSize('right', 999)
    store().toggleZenMode()
    store().toggleCenteredLayout()
    store().loadPreset('focus')

    store().resetLayout()

    expect(store().panels.left.visible).toBe(true)
    expect(store().panels.right.size).toBe(350)
    expect(store().zenMode).toBe(false)
    expect(store().centeredLayout).toBe(false)
    expect(store().activePreset).toBe('default')
    expect(store().editorLayout).toEqual(DEFAULT_LAYOUT)
  })

  it('collapses editor groups back to a single group', () => {
    store().createGroup()
    store().createGroup()
    expect(store().editorGroups.length).toBeGreaterThan(1)
    store().resetLayout()
    expect(store().editorGroups.length).toBe(1)
    expect(store().editorGroups[0].tabs).toEqual([])
  })

  it('clears persisted layout from localStorage', () => {
    store().saveLayout()
    expect(localStorage.getItem('orion:layout')).not.toBeNull()
    store().resetLayout()
    expect(localStorage.getItem('orion:layout')).toBeNull()
  })
})

/* ── Edge cases / interaction ──────────────────────────── */

describe('edge cases', () => {
  it('toggle then setPanelTab leaves the panel visible (setPanelTab wins)', () => {
    store().togglePanel('right')
    expect(store().panels.right.visible).toBe(false)
    store().setPanelTab('right', 'composer')
    expect(store().panels.right.visible).toBe(true)
  })

  it('collapsed panel can still be hidden via togglePanel (collapsed and visible are independent)', () => {
    store().collapsePanel('bottom')
    store().togglePanel('bottom')
    expect(store().panels.bottom.collapsed).toBe(true)
    expect(store().panels.bottom.visible).toBe(false)
  })

  it('repeated setPanelSize keeps only the last value', () => {
    store().setPanelSize('left', 200)
    store().setPanelSize('left', 280)
    store().setPanelSize('left', 240)
    expect(store().panels.left.size).toBe(240)
  })
})
