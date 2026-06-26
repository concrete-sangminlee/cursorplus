/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfileStore } from './profiles'
import type { Profile } from './profiles'

/* ------------------------------------------------------------------ */
/*  Mock the theme store the profiles store depends on.               */
/*  profiles.ts only ever reads `getState().activeThemeId` and calls  */
/*  `getState().setTheme(id)`, so we mock exactly that surface.       */
/* ------------------------------------------------------------------ */

const themeMock = vi.hoisted(() => {
  const state = { activeThemeId: 'orion-dark' }
  return {
    state,
    setTheme: vi.fn((id: string) => {
      state.activeThemeId = id
    }),
  }
})

vi.mock('./theme', () => ({
  useThemeStore: {
    getState: () => ({
      activeThemeId: themeMock.state.activeThemeId,
      setTheme: themeMock.setTheme,
    }),
  },
}))

/* ------------------------------------------------------------------ */
/*  Constants mirroring the store's private storage keys.             */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'orion-profiles'
const ACTIVE_KEY = 'orion-active-profile'
const EDITOR_KEY = 'orion-editor-settings'
const TERMINAL_KEY = 'orion-terminal-settings'
const PROMPTS_KEY = 'orion-prompts'

const store = useProfileStore

const DEFAULT_ID = 'default-fixed-id'

function makeDefaultProfile(): Profile {
  return {
    id: DEFAULT_ID,
    name: 'Default',
    icon: '⚙️',
    settings: {},
    theme: 'orion-dark',
    createdAt: '2026-01-01T00:00:00.000Z',
    isDefault: true,
  }
}

/** Convenience accessors. */
const profiles = () => store.getState().profiles
const activeId = () => store.getState().activeProfileId

beforeEach(() => {
  localStorage.clear()
  themeMock.state.activeThemeId = 'orion-dark'
  themeMock.setTheme.mockClear()
  // Reset data fields only (no replace:true) onto the module-level singleton.
  store.setState({
    profiles: [makeDefaultProfile()],
    activeProfileId: DEFAULT_ID,
  })
})

/* ------------------------------------------------------------------ */

describe('createProfile', () => {
  it('appends a non-default profile with generated id and the given name/icon', () => {
    const p = store.getState().createProfile('Work', '\u{1F4BC}')

    expect(p.name).toBe('Work')
    expect(p.icon).toBe('\u{1F4BC}')
    expect(p.isDefault).toBe(false)
    expect(p.id).toMatch(/^profile_\d+_[a-z0-9]+$/)
    expect(typeof p.createdAt).toBe('string')
    expect(Number.isNaN(Date.parse(p.createdAt))).toBe(false)

    // Added to the list, default still present.
    expect(profiles()).toHaveLength(2)
    expect(profiles()[1]).toEqual(p)
    expect(profiles()[0].id).toBe(DEFAULT_ID)
  })

  it('captures the current theme id from the theme store', () => {
    themeMock.state.activeThemeId = 'github-light'
    const p = store.getState().createProfile('Themed', 'x')
    expect(p.theme).toBe('github-light')
  })

  it('snapshots only the known settings keys from localStorage', () => {
    localStorage.setItem(EDITOR_KEY, JSON.stringify({ fontSize: 16 }))
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({ shell: 'pwsh' }))
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(['a', 'b']))
    localStorage.setItem('unrelated-key', JSON.stringify({ nope: true }))

    const p = store.getState().createProfile('Snap', 'x')

    expect(p.settings).toEqual({
      [EDITOR_KEY]: { fontSize: 16 },
      [TERMINAL_KEY]: { shell: 'pwsh' },
      [PROMPTS_KEY]: ['a', 'b'],
    })
    expect(p.settings).not.toHaveProperty('unrelated-key')
  })

  it('ignores corrupt JSON in a settings key without throwing', () => {
    localStorage.setItem(EDITOR_KEY, '{not valid json')
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({ ok: 1 }))

    const p = store.getState().createProfile('Partial', 'x')

    expect(p.settings).not.toHaveProperty(EDITOR_KEY)
    expect(p.settings[TERMINAL_KEY]).toEqual({ ok: 1 })
  })

  it('persists the updated profile list but keeps the existing active id', () => {
    const p = store.getState().createProfile('Persisted', 'x')

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored).toHaveLength(2)
    expect(stored[1].id).toBe(p.id)
    // createProfile persists with the current (unchanged) active id.
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(DEFAULT_ID)
  })

  it('allows duplicate names (no uniqueness enforcement)', () => {
    const a = store.getState().createProfile('Same', 'x')
    const b = store.getState().createProfile('Same', 'y')

    expect(a.id).not.toBe(b.id)
    expect(profiles().filter(p => p.name === 'Same')).toHaveLength(2)
  })
})

describe('switchProfile (activate)', () => {
  it('sets the active profile id', () => {
    const p = store.getState().createProfile('Work', 'x')
    store.getState().switchProfile(p.id)
    expect(activeId()).toBe(p.id)
  })

  it('applies the profile settings snapshot back into localStorage', () => {
    localStorage.setItem(EDITOR_KEY, JSON.stringify({ fontSize: 20 }))
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({ shell: 'bash' }))
    const p = store.getState().createProfile('Work', 'x')

    // Mutate live settings, then switching back should restore the snapshot.
    localStorage.setItem(EDITOR_KEY, JSON.stringify({ fontSize: 99 }))
    store.getState().switchProfile(p.id)

    expect(JSON.parse(localStorage.getItem(EDITOR_KEY)!)).toEqual({ fontSize: 20 })
    expect(JSON.parse(localStorage.getItem(TERMINAL_KEY)!)).toEqual({ shell: 'bash' })
  })

  it('dispatches editor and terminal config events when those settings exist', () => {
    localStorage.setItem(EDITOR_KEY, JSON.stringify({ fontSize: 12 }))
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({ shell: 'zsh' }))
    const p = store.getState().createProfile('Work', 'x')

    const events: CustomEvent[] = []
    const handler = (e: Event) => events.push(e as CustomEvent)
    window.addEventListener('orion:editor-config', handler)
    window.addEventListener('orion:terminal-config', handler)

    store.getState().switchProfile(p.id)

    window.removeEventListener('orion:editor-config', handler)
    window.removeEventListener('orion:terminal-config', handler)

    expect(events.map(e => e.type)).toEqual(
      expect.arrayContaining(['orion:editor-config', 'orion:terminal-config'])
    )
    const editorEvt = events.find(e => e.type === 'orion:editor-config')!
    expect(editorEvt.detail).toEqual({ fontSize: 12 })
  })

  it('switches the theme via the theme store', () => {
    themeMock.state.activeThemeId = 'github-light'
    const p = store.getState().createProfile('Light', 'x') // captures github-light
    themeMock.state.activeThemeId = 'orion-dark'

    store.getState().switchProfile(p.id)

    expect(themeMock.setTheme).toHaveBeenCalledWith('github-light')
    expect(themeMock.state.activeThemeId).toBe('github-light')
  })

  it('persists the new active id', () => {
    const p = store.getState().createProfile('Work', 'x')
    store.getState().switchProfile(p.id)
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(p.id)
  })

  it('is a no-op for an unknown id (no state change, no theme switch)', () => {
    const before = activeId()
    store.getState().switchProfile('does-not-exist')
    expect(activeId()).toBe(before)
    expect(themeMock.setTheme).not.toHaveBeenCalled()
  })
})

describe('deleteProfile', () => {
  it('removes a non-default profile and returns true', () => {
    const p = store.getState().createProfile('Temp', 'x')
    const ok = store.getState().deleteProfile(p.id)

    expect(ok).toBe(true)
    expect(profiles().find(x => x.id === p.id)).toBeUndefined()
    expect(profiles()).toHaveLength(1)
  })

  it('refuses to delete the default profile and returns false', () => {
    const ok = store.getState().deleteProfile(DEFAULT_ID)
    expect(ok).toBe(false)
    expect(profiles()).toHaveLength(1)
  })

  it('returns false for an unknown id', () => {
    expect(store.getState().deleteProfile('nope')).toBe(false)
    expect(profiles()).toHaveLength(1)
  })

  it('reassigns active to the default profile when the active one is deleted', () => {
    const p = store.getState().createProfile('Active', 'x')
    store.getState().switchProfile(p.id)
    expect(activeId()).toBe(p.id)

    const ok = store.getState().deleteProfile(p.id)

    expect(ok).toBe(true)
    expect(activeId()).toBe(DEFAULT_ID)
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(DEFAULT_ID)
  })

  it('keeps the active id unchanged when deleting a non-active profile', () => {
    const keep = store.getState().createProfile('Keep', 'x')
    const drop = store.getState().createProfile('Drop', 'y')
    store.getState().switchProfile(keep.id)

    store.getState().deleteProfile(drop.id)

    expect(activeId()).toBe(keep.id)
  })

  it('falls back to the first remaining profile when active is deleted and no default exists', () => {
    // Construct a state with NO default profile (e.g. corrupt/imported-only data).
    const a: Profile = { ...makeDefaultProfile(), id: 'a', isDefault: false }
    const b: Profile = { ...makeDefaultProfile(), id: 'b', isDefault: false }
    store.setState({ profiles: [a, b], activeProfileId: 'a' })

    const ok = store.getState().deleteProfile('a')

    expect(ok).toBe(true)
    expect(profiles().map(p => p.id)).toEqual(['b'])
    // No default present -> falls back to profiles[0] of the remaining list.
    expect(activeId()).toBe('b')
  })
})

describe('renameProfile', () => {
  it('renames the matching profile and leaves others untouched', () => {
    const p = store.getState().createProfile('Old', 'x')
    store.getState().renameProfile(p.id, 'New')

    expect(profiles().find(x => x.id === p.id)!.name).toBe('New')
    expect(profiles().find(x => x.id === DEFAULT_ID)!.name).toBe('Default')
  })

  it('persists the rename', () => {
    const p = store.getState().createProfile('Old', 'x')
    store.getState().renameProfile(p.id, 'Renamed')

    const stored: Profile[] = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.find(x => x.id === p.id)!.name).toBe('Renamed')
  })

  it('is a no-op for an unknown id', () => {
    const before = profiles().map(p => p.name)
    store.getState().renameProfile('nope', 'X')
    expect(profiles().map(p => p.name)).toEqual(before)
  })
})

describe('updateProfile', () => {
  it('re-snapshots settings and theme for the target profile only', () => {
    const p = store.getState().createProfile('Work', 'x') // empty settings, orion-dark

    // Change the live environment, then update the profile from it.
    localStorage.setItem(EDITOR_KEY, JSON.stringify({ fontSize: 30 }))
    themeMock.state.activeThemeId = 'github-light'

    store.getState().updateProfile(p.id)

    const updated = profiles().find(x => x.id === p.id)!
    expect(updated.settings[EDITOR_KEY]).toEqual({ fontSize: 30 })
    expect(updated.theme).toBe('github-light')

    // Default profile untouched.
    const def = profiles().find(x => x.id === DEFAULT_ID)!
    expect(def.theme).toBe('orion-dark')
    expect(def.settings).toEqual({})
  })

  it('persists the updated profile list', () => {
    const p = store.getState().createProfile('Work', 'x')
    localStorage.setItem(PROMPTS_KEY, JSON.stringify(['hi']))
    store.getState().updateProfile(p.id)

    const stored: Profile[] = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.find(x => x.id === p.id)!.settings[PROMPTS_KEY]).toEqual(['hi'])
  })
})

describe('exportProfile', () => {
  it('returns pretty JSON containing name/icon/settings/theme and an export timestamp', () => {
    localStorage.setItem(EDITOR_KEY, JSON.stringify({ fontSize: 14 }))
    themeMock.state.activeThemeId = 'github-light'
    const p = store.getState().createProfile('Exportable', '\u{1F680}')

    const json = store.getState().exportProfile(p.id)
    expect(json).not.toBeNull()
    // Pretty-printed (2-space indent).
    expect(json).toContain('\n  ')

    const data = JSON.parse(json!)
    expect(data.name).toBe('Exportable')
    expect(data.icon).toBe('\u{1F680}')
    expect(data.theme).toBe('github-light')
    expect(data.settings[EDITOR_KEY]).toEqual({ fontSize: 14 })
    expect(typeof data.exportedAt).toBe('string')
    // id/createdAt/isDefault are intentionally NOT exported.
    expect(data).not.toHaveProperty('id')
    expect(data).not.toHaveProperty('isDefault')
  })

  it('returns null for an unknown id', () => {
    expect(store.getState().exportProfile('nope')).toBeNull()
  })
})

describe('importProfile', () => {
  it('creates a new profile from valid export JSON with an "(imported)" name suffix', () => {
    const json = JSON.stringify({
      name: 'Shared',
      icon: '⭐',
      settings: { [EDITOR_KEY]: { fontSize: 18 } },
      theme: 'monokai',
    })

    const p = store.getState().importProfile(json)

    expect(p).not.toBeNull()
    expect(p!.name).toBe('Shared (imported)')
    expect(p!.icon).toBe('⭐')
    expect(p!.theme).toBe('monokai')
    expect(p!.settings).toEqual({ [EDITOR_KEY]: { fontSize: 18 } })
    expect(p!.isDefault).toBe(false)
    expect(profiles().find(x => x.id === p!.id)).toBeDefined()
  })

  it('applies default icon and theme when omitted', () => {
    const json = JSON.stringify({ name: 'Minimal', settings: {} })
    const p = store.getState().importProfile(json)

    expect(p).not.toBeNull()
    expect(p!.icon).toBe('\u{1F4E6}')
    expect(p!.theme).toBe('github-dark')
  })

  it('persists the imported profile and keeps the active id', () => {
    const json = JSON.stringify({ name: 'Persist', settings: { x: 1 } })
    const p = store.getState().importProfile(json)!

    const stored: Profile[] = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored.find(x => x.id === p.id)).toBeDefined()
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(DEFAULT_ID)
  })

  it('returns null for malformed JSON', () => {
    expect(store.getState().importProfile('{ not json')).toBeNull()
    expect(profiles()).toHaveLength(1)
  })

  it('returns null when required fields (name/settings) are missing', () => {
    expect(store.getState().importProfile(JSON.stringify({ name: 'NoSettings' }))).toBeNull()
    expect(store.getState().importProfile(JSON.stringify({ settings: {} }))).toBeNull()
    expect(profiles()).toHaveLength(1)
  })

  it('round-trips an exported profile back into an importable one', () => {
    localStorage.setItem(TERMINAL_KEY, JSON.stringify({ shell: 'fish' }))
    const original = store.getState().createProfile('Round', '\u{1F3AF}')
    const exported = store.getState().exportProfile(original.id)!

    const imported = store.getState().importProfile(exported)!

    expect(imported.name).toBe('Round (imported)')
    expect(imported.icon).toBe('\u{1F3AF}')
    expect(imported.settings[TERMINAL_KEY]).toEqual({ shell: 'fish' })
  })
})

describe('persistence', () => {
  it('writes both the profiles list and active id to localStorage on mutation', () => {
    const p = store.getState().createProfile('Work', 'x')
    store.getState().switchProfile(p.id)

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).map((x: Profile) => x.id))
      .toEqual([DEFAULT_ID, p.id])
    expect(localStorage.getItem(ACTIVE_KEY)).toBe(p.id)
  })
})
