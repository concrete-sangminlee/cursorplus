/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useKeybindingStore,
  DEFAULT_KEYBINDINGS,
  normalizeKey,
  parseChord,
  keysMatch,
  evaluateWhenClause,
  isMac,
} from './keybindingCustomization'
import type { KeyBinding } from './keybindingCustomization'

/*
 * Test strategy / scope notes
 * ---------------------------------------------------------------------------
 * - This is a module-level zustand singleton with persist middleware backed by
 *   localStorage. We reset all DATA fields in beforeEach via setState (never
 *   replace:true) and clear localStorage.
 * - The store references NO IPC / electron namespaces, so nothing to mock there.
 * - In jsdom, navigator.platform === '' so `isMac` is false and getPlatformKey
 *   resolves to binding.key (not binding.mac). A sanity test below pins this so
 *   if it ever changes the rest of the suite's assumptions are flagged.
 * - We intentionally DO NOT exhaustively assert the ~1300-line static default
 *   keybinding table. We only touch a handful of well-known default ids
 *   (general.save, editor.copy, etc.) and otherwise inject small, controlled
 *   binding sets to exercise the real logic (conflict detection, resolution,
 *   when-clauses, customization, import/export). The giant default table is
 *   covered only incidentally.
 */

const store = useKeybindingStore

// Fresh default data state. We clone DEFAULT_KEYBINDINGS so test mutations of
// `bindings` can never leak into the shared module constant.
function freshState() {
  return {
    bindings: DEFAULT_KEYBINDINGS.map((b) => ({ ...b })),
    customOverrides: new Map<string, string>(),
    activeContexts: new Set<string>(),
    searchQuery: '',
    selectedCategory: null,
    isRecording: false,
    recordingBindingId: null,
  }
}

beforeEach(() => {
  localStorage.clear()
  store.setState(freshState())
})

// Helper to swap the binding table for a tiny controlled set (data field reset).
function setBindings(bindings: KeyBinding[]) {
  store.setState({ bindings })
}

function b(partial: Partial<KeyBinding> & Pick<KeyBinding, 'id' | 'key'>): KeyBinding {
  return {
    command: partial.command ?? `cmd.${partial.id}`,
    category: partial.category ?? 'general',
    label: partial.label ?? partial.id,
    ...partial,
  }
}

// ─── Platform sanity ──────────────────────────────────────────────────────────

describe('platform detection (jsdom)', () => {
  it('treats the test environment as non-mac so getPlatformKey uses .key', () => {
    expect(isMac).toBe(false)
    // general.save default key is Ctrl+S (the mac variant Cmd+S must NOT be used)
    expect(store.getState().getDefaultKey('general.save')).toBe('Ctrl+S')
  })
})

// ─── Pure helpers: normalizeKey / parseChord / keysMatch ───────────────────────

describe('normalizeKey', () => {
  it('returns empty string for empty input', () => {
    expect(normalizeKey('')).toBe('')
  })

  it('canonicalizes modifier names and casing, preserving main key case', () => {
    expect(normalizeKey('ctrl+s')).toBe('Ctrl+s')
    expect(normalizeKey('control+S')).toBe('Ctrl+S')
    expect(normalizeKey('cmd+p')).toBe('Meta+p')
    expect(normalizeKey('command+p')).toBe('Meta+p')
    expect(normalizeKey('win+e')).toBe('Meta+e')
    expect(normalizeKey('option+a')).toBe('Alt+a')
  })

  it('sorts modifiers into canonical Ctrl/Alt/Shift/Meta order', () => {
    expect(normalizeKey('shift+ctrl+a')).toBe('Ctrl+Shift+a')
    expect(normalizeKey('meta+shift+alt+ctrl+k')).toBe('Ctrl+Alt+Shift+Meta+k')
  })

  it('normalizes each part of a multi-stroke chord independently', () => {
    expect(normalizeKey('ctrl+k ctrl+o')).toBe('Ctrl+k Ctrl+o')
  })

  it('handles a modifier-only sequence (no main key)', () => {
    expect(normalizeKey('shift+ctrl')).toBe('Ctrl+Shift')
  })
})

describe('parseChord', () => {
  it('flags a single stroke as not a chord', () => {
    const c = parseChord('Ctrl+S')
    expect(c.isChord).toBe(false)
    expect(c.parts).toEqual(['Ctrl+S'])
  })

  it('flags multi-stroke as a chord and normalizes parts', () => {
    const c = parseChord('ctrl+k ctrl+o')
    expect(c.isChord).toBe(true)
    expect(c.parts).toEqual(['Ctrl+k', 'Ctrl+o'])
  })

  it('ignores extra whitespace between strokes', () => {
    const c = parseChord('ctrl+k    ctrl+o')
    expect(c.parts).toEqual(['Ctrl+k', 'Ctrl+o'])
  })
})

describe('keysMatch', () => {
  it('matches differently-cased / differently-ordered equivalents', () => {
    expect(keysMatch('Ctrl+Shift+S', 'shift+ctrl+s')).toBe(true)
    expect(keysMatch('ctrl+s', 'Ctrl+S')).toBe(true)
  })

  it('does not match distinct keys', () => {
    expect(keysMatch('Ctrl+S', 'Ctrl+A')).toBe(false)
  })
})

// ─── When-clause evaluation ────────────────────────────────────────────────────

describe('evaluateWhenClause', () => {
  it('returns true when there is no when-clause', () => {
    expect(evaluateWhenClause(undefined, new Set())).toBe(true)
    expect(evaluateWhenClause('', new Set())).toBe(true)
  })

  it('evaluates a single positive context', () => {
    expect(evaluateWhenClause('editorFocus', new Set(['editorFocus']))).toBe(true)
    expect(evaluateWhenClause('editorFocus', new Set())).toBe(false)
  })

  it('evaluates negated contexts', () => {
    expect(evaluateWhenClause('!editorFocus', new Set())).toBe(true)
    expect(evaluateWhenClause('!editorFocus', new Set(['editorFocus']))).toBe(false)
  })

  it('evaluates && (both must hold)', () => {
    expect(evaluateWhenClause('a && b', new Set(['a', 'b']))).toBe(true)
    expect(evaluateWhenClause('a && b', new Set(['a']))).toBe(false)
  })

  it('evaluates || (either holds)', () => {
    expect(evaluateWhenClause('a || b', new Set(['b']))).toBe(true)
    expect(evaluateWhenClause('a || b', new Set())).toBe(false)
  })

  it('evaluates left-to-right without operator precedence', () => {
    // (a && b) || c  -> with only c active: ((false) || true) = true
    expect(evaluateWhenClause('a && b || c', new Set(['c']))).toBe(true)
    // a || b && c  -> ((a) || b) && c, left-to-right => (true && false) = false
    expect(evaluateWhenClause('a || b && c', new Set(['a']))).toBe(false)
  })
})

// ─── Context management ────────────────────────────────────────────────────────

describe('context management', () => {
  it('setContext adds and removes a single context immutably', () => {
    const before = store.getState().activeContexts
    store.getState().setContext('editorFocus', true)
    expect(store.getState().isContextActive('editorFocus')).toBe(true)
    expect(store.getState().activeContexts).not.toBe(before) // new Set reference

    store.getState().setContext('editorFocus', false)
    expect(store.getState().isContextActive('editorFocus')).toBe(false)
  })

  it('setContexts applies a batch of toggles', () => {
    store.getState().setContext('keepMe', true)
    store.getState().setContexts({ a: true, b: true, keepMe: false })
    expect(store.getState().isContextActive('a')).toBe(true)
    expect(store.getState().isContextActive('b')).toBe(true)
    expect(store.getState().isContextActive('keepMe')).toBe(false)
  })

  it('clearAllContexts empties the set', () => {
    store.getState().setContexts({ a: true, b: true })
    store.getState().clearAllContexts()
    expect(store.getState().activeContexts.size).toBe(0)
  })
})

// ─── Binding queries ───────────────────────────────────────────────────────────

describe('binding queries', () => {
  it('getBindingById / getBindingByCommand find defaults', () => {
    expect(store.getState().getBindingById('general.save')?.key).toBe('Ctrl+S')
    expect(
      store.getState().getBindingByCommand('workbench.action.files.save')?.id
    ).toBe('general.save')
    expect(store.getState().getBindingById('does.not.exist')).toBeUndefined()
  })

  it('getBindingsByCategory / getCategories reflect the table', () => {
    const general = store.getState().getBindingsByCategory('general')
    expect(general.length).toBeGreaterThan(0)
    expect(general.every((x) => x.category === 'general')).toBe(true)
    expect(store.getState().getCategories()).toContain('editor')
  })

  it('getDefaultKey always reads from the static defaults, ignoring overrides', () => {
    store.getState().setCustomKey('general.save', 'Ctrl+J')
    expect(store.getState().getDefaultKey('general.save')).toBe('Ctrl+S')
    expect(store.getState().getDefaultKey('unknown.id')).toBe('')
  })

  it('getActiveBindings filters by active when-clause contexts', () => {
    setBindings([
      b({ id: 'noWhen', key: 'Ctrl+1' }),
      b({ id: 'needsEditor', key: 'Ctrl+2', when: 'editorFocus' }),
    ])
    // No contexts active: only the unconditioned binding is active.
    let active = store.getState().getActiveBindings()
    expect(active.map((x) => x.id)).toEqual(['noWhen'])

    store.getState().setContext('editorFocus', true)
    active = store.getState().getActiveBindings()
    expect(active.map((x) => x.id).sort()).toEqual(['needsEditor', 'noWhen'])
  })
})

// ─── Customization: override / reset ───────────────────────────────────────────

describe('customization (overrides)', () => {
  it('setCustomKey normalizes and getEffectiveKey returns the override', () => {
    store.getState().setCustomKey('general.save', 'shift+ctrl+j')
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+Shift+j')
    expect(store.getState().isCustomized('general.save')).toBe(true)
  })

  it('getEffectiveKey falls back to the default key when not customized', () => {
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+S')
    expect(store.getState().isCustomized('general.save')).toBe(false)
  })

  it('an empty-string override is still considered an override (overrides win)', () => {
    // Pins current behavior: getEffectiveKey checks `override !== undefined`,
    // so an explicit empty override unbinds the key rather than falling back.
    store.getState().setCustomKey('general.save', '')
    expect(store.getState().getEffectiveKey('general.save')).toBe('')
    expect(store.getState().isCustomized('general.save')).toBe(true)
  })

  it('removeCustomKey / resetBinding revert to the default', () => {
    store.getState().setCustomKey('general.save', 'Ctrl+J')
    store.getState().removeCustomKey('general.save')
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+S')
    expect(store.getState().isCustomized('general.save')).toBe(false)

    store.getState().setCustomKey('general.save', 'Ctrl+J')
    store.getState().resetBinding('general.save')
    expect(store.getState().isCustomized('general.save')).toBe(false)
  })

  it('resetAllBindings clears overrides and restores the default table', () => {
    store.getState().setCustomKey('general.save', 'Ctrl+J')
    store.getState().addCustomBinding(b({ id: 'my.custom', key: 'Ctrl+9' }))
    store.getState().resetAllBindings()

    expect(store.getState().customOverrides.size).toBe(0)
    expect(store.getState().getBindingById('my.custom')).toBeUndefined()
    expect(store.getState().bindings.length).toBe(DEFAULT_KEYBINDINGS.length)
  })
})

// ─── Customization: add / remove custom bindings ───────────────────────────────

describe('custom bindings (add/remove)', () => {
  it('addCustomBinding stores a normalized, isCustom-flagged binding', () => {
    store.getState().addCustomBinding(
      b({ id: 'custom.run', key: 'shift+ctrl+r', label: 'Run' })
    )
    const added = store.getState().getBindingById('custom.run')
    expect(added?.isCustom).toBe(true)
    expect(added?.key).toBe('Ctrl+Shift+r')
  })

  it('addCustomBinding ignores duplicate ids', () => {
    store.getState().addCustomBinding(b({ id: 'custom.run', key: 'Ctrl+R' }))
    store.getState().addCustomBinding(b({ id: 'custom.run', key: 'Ctrl+T' }))
    const matches = store.getState().bindings.filter((x) => x.id === 'custom.run')
    expect(matches).toHaveLength(1)
    expect(matches[0].key).toBe('Ctrl+R')
  })

  it('removeCustomBinding only removes user-added bindings, not defaults', () => {
    store.getState().addCustomBinding(b({ id: 'custom.run', key: 'Ctrl+R' }))
    store.getState().setCustomKey('custom.run', 'Ctrl+Y')

    store.getState().removeCustomBinding('custom.run')
    expect(store.getState().getBindingById('custom.run')).toBeUndefined()
    expect(store.getState().customOverrides.has('custom.run')).toBe(false) // override cleaned up

    // Attempting to remove a default is a no-op.
    store.getState().removeCustomBinding('general.save')
    expect(store.getState().getBindingById('general.save')).toBeDefined()
  })
})

// ─── Conflict detection ────────────────────────────────────────────────────────

describe('conflict detection', () => {
  it('findConflicts reports a pair of unconditioned bindings sharing a key', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K' }),
      b({ id: 'b2', key: 'ctrl+k' }), // same key, different casing
      b({ id: 'c', key: 'Ctrl+L' }),
    ])
    const conflicts = store.getState().findConflicts('Ctrl+K')
    expect(conflicts).toHaveLength(1)
    const ids = [conflicts[0].bindingA.id, conflicts[0].bindingB.id].sort()
    expect(ids).toEqual(['a', 'b2'])
    expect(conflicts[0].key).toBe('ctrl+k') // normalized + lowercased
    expect(conflicts[0].context).toBeNull()
  })

  it('returns no conflicts for an empty key', () => {
    setBindings([b({ id: 'a', key: '' }), b({ id: 'b2', key: '' })])
    expect(store.getState().findConflicts('')).toEqual([])
  })

  it('mutually-exclusive when-clauses (ctx vs !ctx) do NOT conflict', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K', when: 'editorFocus' }),
      b({ id: 'b2', key: 'Ctrl+K', when: '!editorFocus' }),
    ])
    expect(store.getState().findConflicts('Ctrl+K')).toEqual([])
  })

  it('overlapping when-clauses (disjoint contexts) DO conflict', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K', when: 'editorFocus' }),
      b({ id: 'b2', key: 'Ctrl+K', when: 'terminalFocus' }),
    ])
    const conflicts = store.getState().findConflicts('Ctrl+K')
    expect(conflicts).toHaveLength(1)
  })

  it('a binding with no when-clause conflicts with a conditioned one on the same key', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K' }),
      b({ id: 'b2', key: 'Ctrl+K', when: 'editorFocus' }),
    ])
    const conflicts = store.getState().findConflicts('Ctrl+K')
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].context).toBe('editorFocus')
  })

  it('findConflicts honors excludeId', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K' }),
      b({ id: 'b2', key: 'Ctrl+K' }),
      b({ id: 'c', key: 'Ctrl+K' }),
    ])
    // Excluding one of three leaves a single conflicting pair (b2,c).
    const conflicts = store.getState().findConflicts('Ctrl+K', 'a')
    expect(conflicts).toHaveLength(1)
    const ids = [conflicts[0].bindingA.id, conflicts[0].bindingB.id].sort()
    expect(ids).toEqual(['b2', 'c'])
  })

  it('respects custom overrides when computing the effective conflicting key', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+1' }),
      b({ id: 'b2', key: 'Ctrl+2' }),
    ])
    store.getState().setCustomKey('a', 'Ctrl+9')
    store.getState().setCustomKey('b2', 'Ctrl+9')
    expect(store.getState().findConflicts('Ctrl+9')).toHaveLength(1)
    // Original default keys no longer collide.
    expect(store.getState().findConflicts('Ctrl+1')).toEqual([])
  })

  it('SUSPECTED BUG: findConflicts cannot detect a single existing holder of a key', () => {
    // findConflicts only reports PAIRS among the matching (non-excluded) set.
    // To check whether assigning `key` to binding X is safe, a caller would pass
    // findConflicts(key, X) -- but if exactly one OTHER binding already holds the
    // key, the matching set has size 1, no pair forms, and [] is returned. So the
    // intended "would this assignment conflict?" check is effectively broken for
    // the common single-holder case. Pinning current behavior here.
    setBindings([
      b({ id: 'holder', key: 'Ctrl+K' }),
      b({ id: 'target', key: 'Ctrl+0' }),
    ])
    expect(store.getState().findConflicts('Ctrl+K', 'target')).toEqual([])
    expect(store.getState().hasConflict('Ctrl+K', 'target')).toBe(false)
  })

  it('hasConflict mirrors findConflicts truthiness', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K' }),
      b({ id: 'b2', key: 'Ctrl+K' }),
    ])
    expect(store.getState().hasConflict('Ctrl+K')).toBe(true)
    expect(store.getState().hasConflict('Ctrl+L')).toBe(false)
  })

  it('findAllConflicts groups every colliding key across the table', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K' }),
      b({ id: 'b2', key: 'Ctrl+K' }),
      b({ id: 'c', key: 'Ctrl+L' }),
      b({ id: 'd', key: 'Ctrl+L' }),
      b({ id: 'e', key: 'Ctrl+M' }), // unique, no conflict
      b({ id: 'f', key: '' }), // empty key, skipped
    ])
    const all = store.getState().findAllConflicts()
    expect(all).toHaveLength(2)
    expect(all.map((c) => c.key).sort()).toEqual(['ctrl+k', 'ctrl+l'])
  })

  it('findAllConflicts excludes mutually-exclusive when pairs', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K', when: 'editorFocus' }),
      b({ id: 'b2', key: 'Ctrl+K', when: '!editorFocus' }),
    ])
    expect(store.getState().findAllConflicts()).toEqual([])
  })
})

// ─── Binding resolution ────────────────────────────────────────────────────────

describe('keypress resolution', () => {
  it('resolveKeypress returns all bindings whose effective key matches', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+K' }),
      b({ id: 'b2', key: 'Ctrl+K', when: 'editorFocus' }),
      b({ id: 'c', key: 'Ctrl+L' }),
    ])
    const matches = store.getState().resolveKeypress('ctrl+k')
    expect(matches.map((m) => m.id).sort()).toEqual(['a', 'b2'])
  })

  it('resolveKeypress matches a chord by its first stroke', () => {
    setBindings([b({ id: 'chord', key: 'Ctrl+K Ctrl+O' })])
    expect(store.getState().resolveKeypress('Ctrl+K').map((m) => m.id)).toEqual(['chord'])
    // The second stroke alone does not match a chord's first stroke.
    expect(store.getState().resolveKeypress('Ctrl+O')).toEqual([])
  })

  it('resolveKeypressInContext prefers the most specific satisfied when-clause', () => {
    setBindings([
      b({ id: 'generic', key: 'Ctrl+K' }),
      b({ id: 'specific', key: 'Ctrl+K', when: 'editorFocus' }),
    ])
    // No context -> only the generic (no-when) binding is eligible.
    expect(store.getState().resolveKeypressInContext('Ctrl+K')?.id).toBe('generic')

    store.getState().setContext('editorFocus', true)
    // Now both are eligible; the one with a when-clause wins on specificity.
    expect(store.getState().resolveKeypressInContext('Ctrl+K')?.id).toBe('specific')
  })

  it('resolveKeypressInContext returns null when no binding is eligible', () => {
    setBindings([b({ id: 'specific', key: 'Ctrl+K', when: 'editorFocus' })])
    expect(store.getState().resolveKeypressInContext('Ctrl+K')).toBeNull()
  })

  it('matchesChord resolves a full two-stroke chord respecting context', () => {
    setBindings([
      b({ id: 'chord', key: 'Ctrl+K Ctrl+O', when: 'editorFocus' }),
    ])
    expect(store.getState().matchesChord('Ctrl+K', 'Ctrl+O')).toBeNull() // context off
    store.getState().setContext('editorFocus', true)
    expect(store.getState().matchesChord('ctrl+k', 'ctrl+o')?.id).toBe('chord')
  })

  it('isChordBinding / getPendingChordBindings identify multi-stroke bindings', () => {
    setBindings([
      b({ id: 'chord', key: 'Ctrl+K Ctrl+O' }),
      b({ id: 'single', key: 'Ctrl+S' }),
    ])
    expect(store.getState().isChordBinding('chord')).toBe(true)
    expect(store.getState().isChordBinding('single')).toBe(false)
    expect(store.getState().isChordBinding('missing')).toBe(false)

    const pending = store.getState().getPendingChordBindings('Ctrl+K')
    expect(pending.map((p) => p.id)).toEqual(['chord'])
    expect(store.getState().getPendingChordBindings('Ctrl+S')).toEqual([])
  })
})

// ─── Search & filter ───────────────────────────────────────────────────────────

describe('search & filter', () => {
  it('filters by selected category', () => {
    store.getState().setSelectedCategory('editor')
    const filtered = store.getState().getFilteredBindings()
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.every((x) => x.category === 'editor')).toBe(true)
  })

  it('search matches label, command, id, key and category (case-insensitive)', () => {
    setBindings([
      b({ id: 'editor.copy', key: 'Ctrl+C', label: 'Copy', command: 'editor.action.copy', category: 'editor' }),
      b({ id: 'general.save', key: 'Ctrl+S', label: 'Save', command: 'files.save', category: 'general' }),
    ])

    store.getState().setSearchQuery('copy') // label
    expect(store.getState().getFilteredBindings().map((x) => x.id)).toEqual(['editor.copy'])

    store.getState().setSearchQuery('files.save') // command
    expect(store.getState().getFilteredBindings().map((x) => x.id)).toEqual(['general.save'])

    store.getState().setSearchQuery('CTRL+S') // effective key, case-insensitive
    expect(store.getState().getFilteredBindings().map((x) => x.id)).toEqual(['general.save'])

    store.getState().setSearchQuery('editor') // category + id both match copy only
    expect(store.getState().getFilteredBindings().map((x) => x.id)).toEqual(['editor.copy'])
  })

  it('search matches the overridden (effective) key, not the default key', () => {
    setBindings([b({ id: 'general.save', key: 'Ctrl+S', label: 'Save' })])
    store.getState().setCustomKey('general.save', 'Ctrl+J')
    store.getState().setSearchQuery('Ctrl+J')
    expect(store.getState().getFilteredBindings().map((x) => x.id)).toEqual(['general.save'])
    store.getState().setSearchQuery('Ctrl+S')
    expect(store.getState().getFilteredBindings()).toEqual([])
  })

  it('combines category filter with search', () => {
    setBindings([
      b({ id: 'editor.copy', key: 'Ctrl+C', label: 'Copy', category: 'editor' }),
      b({ id: 'editor.cut', key: 'Ctrl+X', label: 'Cut', category: 'editor' }),
      b({ id: 'general.copyPath', key: 'Ctrl+P', label: 'Copy Path', category: 'general' }),
    ])
    store.getState().setSelectedCategory('editor')
    store.getState().setSearchQuery('copy')
    expect(store.getState().getFilteredBindings().map((x) => x.id)).toEqual(['editor.copy'])
  })

  it('blank/whitespace query returns everything (within category)', () => {
    store.getState().setSearchQuery('   ')
    expect(store.getState().getFilteredBindings().length).toBe(store.getState().bindings.length)
  })
})

// ─── Recording ─────────────────────────────────────────────────────────────────

describe('recording', () => {
  it('startRecording / stopRecording toggle recording state', () => {
    store.getState().startRecording('general.save')
    expect(store.getState().isRecording).toBe(true)
    expect(store.getState().recordingBindingId).toBe('general.save')

    store.getState().stopRecording()
    expect(store.getState().isRecording).toBe(false)
    expect(store.getState().recordingBindingId).toBeNull()
  })

  it('recordKey writes a normalized override and ends recording', () => {
    store.getState().startRecording('general.save')
    store.getState().recordKey('shift+ctrl+j')
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+Shift+j')
    expect(store.getState().isRecording).toBe(false)
    expect(store.getState().recordingBindingId).toBeNull()
  })

  it('recordKey is a no-op when not recording', () => {
    store.getState().recordKey('Ctrl+J')
    expect(store.getState().customOverrides.size).toBe(0)
  })
})

// ─── Import / Export ───────────────────────────────────────────────────────────

describe('export', () => {
  it('exportBindings emits only custom overrides in the v1 format', () => {
    store.getState().setCustomKey('general.save', 'Ctrl+J')
    const json = store.getState().exportBindings()
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe(1)
    expect(parsed.platform).toBe('windows/linux') // non-mac in jsdom
    expect(parsed.bindings).toEqual([{ id: 'general.save', key: 'Ctrl+J' }])
    expect(typeof parsed.exportedAt).toBe('string')
  })

  it('exportAllBindings includes every binding with an isDefault flag', () => {
    setBindings([
      b({ id: 'a', key: 'Ctrl+1' }),
      b({ id: 'b2', key: 'Ctrl+2' }),
    ])
    store.getState().setCustomKey('a', 'Ctrl+9')
    const all = JSON.parse(store.getState().exportAllBindings())
    const byId = Object.fromEntries(all.map((x: any) => [x.id, x]))
    expect(byId.a.key).toBe('Ctrl+9')
    expect(byId.a.isDefault).toBe(false)
    expect(byId.b2.isDefault).toBe(true)
  })
})

describe('import', () => {
  it('imports the full v1 export format and reports a count', () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: 'x',
      platform: 'windows/linux',
      bindings: [{ id: 'general.save', key: 'ctrl+j' }],
    })
    const res = store.getState().importBindings(json)
    expect(res).toEqual({ success: true, count: 1 })
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+j') // normalized
  })

  it('imports a simple { id: key } object map', () => {
    const res = store.getState().importBindings(
      JSON.stringify({ 'general.save': 'Ctrl+J', 'general.openFile': 'Ctrl+M' })
    )
    expect(res.success).toBe(true)
    expect(res.count).toBe(2)
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+J')
    expect(store.getState().getEffectiveKey('general.openFile')).toBe('Ctrl+M')
  })

  it('imports a bare array of {id,key}', () => {
    const res = store.getState().importBindings(
      JSON.stringify([{ id: 'general.save', key: 'Ctrl+J' }])
    )
    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
  })

  it('merges imported overrides on top of existing ones', () => {
    store.getState().setCustomKey('general.openFile', 'Ctrl+E')
    store.getState().importBindings(JSON.stringify({ 'general.save': 'Ctrl+J' }))
    // pre-existing override survives
    expect(store.getState().getEffectiveKey('general.openFile')).toBe('Ctrl+E')
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+J')
  })

  it('rejects invalid JSON', () => {
    const res = store.getState().importBindings('{ not json')
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Failed to parse JSON/)
  })

  it('rejects data with no valid entries', () => {
    const res = store.getState().importBindings(JSON.stringify({}))
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/No valid bindings/)
  })

  it('filters out entries with non-string id/key', () => {
    const res = store.getState().importBindings(
      JSON.stringify([
        { id: 'general.save', key: 'Ctrl+J' },
        { id: 'bad', key: 123 },
        { id: 42, key: 'Ctrl+Q' },
      ])
    )
    expect(res.success).toBe(true)
    expect(res.count).toBe(1)
  })

  it('export -> import round-trips overrides', () => {
    store.getState().setCustomKey('general.save', 'Ctrl+J')
    store.getState().setCustomKey('general.openFile', 'Ctrl+M')
    const exported = store.getState().exportBindings()

    store.getState().resetAllBindings()
    expect(store.getState().customOverrides.size).toBe(0)

    const res = store.getState().importBindings(exported)
    expect(res.success).toBe(true)
    expect(res.count).toBe(2)
    expect(store.getState().getEffectiveKey('general.save')).toBe('Ctrl+J')
    expect(store.getState().getEffectiveKey('general.openFile')).toBe('Ctrl+M')
  })
})

// ─── Persistence ───────────────────────────────────────────────────────────────

describe('persistence (localStorage)', () => {
  it('serializes customOverrides (Map) and activeContexts (Set) to localStorage', () => {
    store.getState().setCustomKey('general.save', 'Ctrl+J')
    store.getState().setContext('editorFocus', true)

    const raw = localStorage.getItem('orion-keybinding-customization')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    // Map is stored as a plain object, Set as an array.
    expect(parsed.state.customOverrides).toEqual({ 'general.save': 'Ctrl+J' })
    expect(parsed.state.activeContexts).toContain('editorFocus')
  })

  it('persists only user-added custom bindings, not the default table', () => {
    store.getState().addCustomBinding(b({ id: 'custom.run', key: 'Ctrl+9' }))
    const parsed = JSON.parse(
      localStorage.getItem('orion-keybinding-customization') as string
    )
    const ids = parsed.state.bindings.map((x: any) => x.id)
    expect(ids).toEqual(['custom.run']) // partialize keeps only isCustom bindings
  })
})
