/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import { useKeybindingsStore } from './keybindings'
import type { Keybinding } from './keybindings'

const store = useKeybindingsStore
const STORAGE_KEY = 'orion-custom-keybindings'

/*
 * DEFAULT_KEYBINDINGS is not exported. Snapshot it from the store's initial
 * `keybindings` array (this is the same module-level constant the store seeds
 * with and that none of the actions ever mutate).
 */
const DEFAULTS: Keybinding[] = store.getState().keybindings.map((k) => ({ ...k }))

function reset() {
  // Reset only data fields; do NOT use replace:true (would wipe actions).
  store.setState({
    keybindings: DEFAULTS.map((k) => ({ ...k })),
    customBindings: {},
    searchQuery: '',
  })
}

function persisted(): Record<string, string> | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === null ? undefined : (JSON.parse(raw) as Record<string, string>)
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

describe('initial state / defaults', () => {
  it('seeds a large default keybinding list and empty customizations', () => {
    const s = store.getState()
    expect(s.keybindings.length).toBeGreaterThan(50)
    expect(s.customBindings).toEqual({})
    expect(s.searchQuery).toBe('')
  })

  it('has unique command ids in the default set', () => {
    const ids = DEFAULTS.map((k) => k.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('exposes well-known default bindings (lookup by id)', () => {
    const s = store.getState()
    expect(s.getDefaultBinding('save')).toBe('Ctrl+S')
    expect(s.getDefaultBinding('command-palette')).toBe('Ctrl+Shift+P')
    expect(s.getDefaultBinding('zen-mode')).toBe('Ctrl+K Z')
  })

  it('returns empty string for an unknown command id', () => {
    expect(store.getState().getDefaultBinding('does-not-exist')).toBe('')
    expect(store.getState().getEffectiveBinding('does-not-exist')).toBe('')
  })
})

describe('searchQuery', () => {
  it('setSearchQuery updates the field', () => {
    store.getState().setSearchQuery('format')
    expect(store.getState().searchQuery).toBe('format')
    store.getState().setSearchQuery('')
    expect(store.getState().searchQuery).toBe('')
  })
})

describe('getByCategory / getCategories', () => {
  it('returns only bindings of the requested category', () => {
    const file = store.getState().getByCategory('File')
    expect(file.length).toBeGreaterThan(0)
    expect(file.every((k) => k.category === 'File')).toBe(true)
    // 'save' is a File command, 'find' (Editor) must not appear
    expect(file.some((k) => k.id === 'save')).toBe(true)
    expect(file.some((k) => k.id === 'find')).toBe(false)
  })

  it('returns empty array for an unknown category', () => {
    expect(store.getState().getByCategory('Nonexistent')).toEqual([])
  })

  it('getCategories returns the de-duplicated set of categories in first-seen order', () => {
    const cats = store.getState().getCategories()
    expect(new Set(cats).size).toBe(cats.length)
    // first category encountered in DEFAULTS is 'File'
    expect(cats[0]).toBe('File')
    expect(cats).toEqual(expect.arrayContaining(['File', 'Editor', 'View', 'AI', 'Git', 'Debug']))
  })
})

describe('setCustomBinding / getEffectiveBinding / isCustomized', () => {
  it('overrides the default and marks the command customized', () => {
    const s = store.getState()
    expect(s.isCustomized('save')).toBe(false)
    expect(s.getEffectiveBinding('save')).toBe('Ctrl+S')

    s.setCustomBinding('save', 'Ctrl+Shift+S')

    expect(store.getState().getEffectiveBinding('save')).toBe('Ctrl+Shift+S')
    expect(store.getState().getDefaultBinding('save')).toBe('Ctrl+S') // default untouched
    expect(store.getState().isCustomized('save')).toBe(true)
  })

  it('does not mutate the keybindings array (defaults stay pristine)', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    const def = store.getState().keybindings.find((k) => k.id === 'save')
    expect(def?.shortcut).toBe('Ctrl+S')
  })

  it('rebinding the same command again replaces the previous custom value', () => {
    store.getState().setCustomBinding('find', 'Ctrl+E')
    store.getState().setCustomBinding('find', 'Ctrl+Q')
    expect(store.getState().getEffectiveBinding('find')).toBe('Ctrl+Q')
    expect(Object.keys(store.getState().customBindings)).toEqual(['find'])
  })

  it('treats an empty-string custom binding as a customization (unbinding)', () => {
    // pin behavior: `'save' in customBindings` is true even when value is ''
    store.getState().setCustomBinding('save', '')
    expect(store.getState().isCustomized('save')).toBe(true)
    expect(store.getState().getEffectiveBinding('save')).toBe('')
  })

  it('can assign a binding to a command that had no default shortcut', () => {
    expect(store.getState().getDefaultBinding('git-commit')).toBe('')
    store.getState().setCustomBinding('git-commit', 'Ctrl+Enter')
    expect(store.getState().getEffectiveBinding('git-commit')).toBe('Ctrl+Enter')
  })
})

describe('resetBinding / resetAllBindings', () => {
  it('resetBinding removes only the targeted customization', () => {
    const s = store.getState()
    s.setCustomBinding('save', 'Ctrl+Alt+S')
    s.setCustomBinding('find', 'Ctrl+Alt+F')

    s.resetBinding('save')

    expect(store.getState().isCustomized('save')).toBe(false)
    expect(store.getState().getEffectiveBinding('save')).toBe('Ctrl+S') // back to default
    expect(store.getState().isCustomized('find')).toBe(true) // untouched
  })

  it('resetBinding on a non-customized command is a no-op', () => {
    store.getState().setCustomBinding('find', 'Ctrl+Alt+F')
    store.getState().resetBinding('save') // never customized
    expect(store.getState().customBindings).toEqual({ find: 'Ctrl+Alt+F' })
  })

  it('resetAllBindings clears every customization', () => {
    const s = store.getState()
    s.setCustomBinding('save', 'Ctrl+Alt+S')
    s.setCustomBinding('find', 'Ctrl+Alt+F')

    s.resetAllBindings()

    expect(store.getState().customBindings).toEqual({})
    expect(store.getState().getEffectiveBinding('save')).toBe('Ctrl+S')
    expect(store.getState().getEffectiveBinding('find')).toBe('Ctrl+F')
  })
})

describe('persistence (localStorage)', () => {
  it('setCustomBinding writes the full custom map to storage', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    expect(persisted()).toEqual({ save: 'Ctrl+Alt+S' })

    store.getState().setCustomBinding('find', 'Ctrl+Alt+F')
    expect(persisted()).toEqual({ save: 'Ctrl+Alt+S', find: 'Ctrl+Alt+F' })
  })

  it('resetBinding persists the removal', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    store.getState().setCustomBinding('find', 'Ctrl+Alt+F')
    store.getState().resetBinding('save')
    expect(persisted()).toEqual({ find: 'Ctrl+Alt+F' })
  })

  it('resetAllBindings persists an empty map', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    store.getState().resetAllBindings()
    expect(persisted()).toEqual({})
  })
})

describe('findConflicts (key-combo matching / normalization)', () => {
  it('returns empty array for an empty shortcut (no conflict for unbound)', () => {
    expect(store.getState().findConflicts('', 'save')).toEqual([])
  })

  it('finds a default command bound to the same shortcut, excluding the given id', () => {
    // 'find' default is Ctrl+F. Probe with another id so 'find' is reported.
    const conflicts = store.getState().findConflicts('Ctrl+F', 'some-other-id')
    expect(conflicts.map((k) => k.id)).toContain('find')
    // excludeId is honored: querying with the owner id excludes itself
    const selfExcluded = store.getState().findConflicts('Ctrl+F', 'find')
    expect(selfExcluded.map((k) => k.id)).not.toContain('find')
  })

  it('matches case-insensitively (normalization to lowercase)', () => {
    const lower = store.getState().findConflicts('ctrl+f', 'x').map((k) => k.id)
    const upper = store.getState().findConflicts('CTRL+F', 'x').map((k) => k.id)
    const mixed = store.getState().findConflicts('Ctrl+F', 'x').map((k) => k.id)
    expect(lower).toEqual(mixed)
    expect(upper).toEqual(mixed)
    expect(mixed).toContain('find')
  })

  it('does NOT normalize modifier order or whitespace (pins literal matching)', () => {
    // 'command-palette' default is 'Ctrl+Shift+P'. A reordered combo must NOT match.
    expect(store.getState().findConflicts('Shift+Ctrl+P', 'x').map((k) => k.id)).not.toContain(
      'command-palette',
    )
    // extra spaces are not trimmed
    expect(store.getState().findConflicts('Ctrl+ F', 'x')).toEqual([])
  })

  it('detects pre-existing duplicate default bindings (e.g. Ctrl+L)', () => {
    // ai-chat, focus-chat and select-line all default to Ctrl+L in DEFAULTS.
    const ids = store.getState().findConflicts('Ctrl+L', 'nope').map((k) => k.id)
    expect(ids).toEqual(expect.arrayContaining(['focus-chat', 'ai-chat', 'select-line']))
    expect(ids.length).toBeGreaterThanOrEqual(3)
  })

  it('uses the EFFECTIVE (custom) binding when detecting conflicts', () => {
    // Rebind 'find' away from Ctrl+F; it should no longer conflict on Ctrl+F.
    store.getState().setCustomBinding('find', 'Ctrl+E')
    expect(store.getState().findConflicts('Ctrl+F', 'x').map((k) => k.id)).not.toContain('find')
    // and a custom binding creates a NEW conflict surface
    expect(store.getState().findConflicts('Ctrl+E', 'x').map((k) => k.id)).toContain('find')
  })

  it('ignores commands whose effective shortcut is empty when probing empty', () => {
    // findConflicts short-circuits on empty input, so unbound commands never
    // collide with each other.
    expect(store.getState().findConflicts('', 'x')).toEqual([])
  })
})

describe('exportBindings / importBindings (round-trip)', () => {
  it('exports custom bindings as pretty JSON', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    const json = store.getState().exportBindings()
    expect(JSON.parse(json)).toEqual({ save: 'Ctrl+Alt+S' })
    expect(json).toContain('\n') // pretty-printed (2-space indent)
  })

  it('imports valid JSON, replaces custom map and persists it', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    const ok = store.getState().importBindings(JSON.stringify({ find: 'Ctrl+E' }))
    expect(ok).toBe(true)
    // import REPLACES rather than merges
    expect(store.getState().customBindings).toEqual({ find: 'Ctrl+E' })
    expect(persisted()).toEqual({ find: 'Ctrl+E' })
    expect(store.getState().getEffectiveBinding('save')).toBe('Ctrl+S') // reverted
    expect(store.getState().getEffectiveBinding('find')).toBe('Ctrl+E')
  })

  it('round-trips export -> import', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    store.getState().setCustomBinding('zen-mode', 'Ctrl+K Z')
    const json = store.getState().exportBindings()
    store.getState().resetAllBindings()
    expect(store.getState().importBindings(json)).toBe(true)
    expect(store.getState().customBindings).toEqual({
      save: 'Ctrl+Alt+S',
      'zen-mode': 'Ctrl+K Z',
    })
  })

  it('rejects malformed JSON and leaves state untouched', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    expect(store.getState().importBindings('{not valid')).toBe(false)
    expect(store.getState().customBindings).toEqual({ save: 'Ctrl+Alt+S' })
  })

  it('rejects non-object JSON values (null / array / primitive)', () => {
    // null is rejected explicitly
    expect(store.getState().importBindings('null')).toBe(false)
    // a JSON number is not an object -> rejected
    expect(store.getState().importBindings('42')).toBe(false)
    // SUSPECTED BUG: a JSON array passes the `typeof === 'object' && !== null`
    // check, so importBindings('[...]') returns true and stores an array as the
    // customBindings map. Pinning current (buggy) behavior here.
    expect(store.getState().importBindings('[]')).toBe(true)
    expect(Array.isArray(store.getState().customBindings)).toBe(true)
  })

  it('exportBindings reflects an empty map after resetAll', () => {
    store.getState().setCustomBinding('save', 'Ctrl+Alt+S')
    store.getState().resetAllBindings()
    expect(JSON.parse(store.getState().exportBindings())).toEqual({})
  })
})
