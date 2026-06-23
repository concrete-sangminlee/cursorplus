/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  useSettingsStore,
  getEffectiveSetting,
  getEffectiveSettingTyped,
  getSettingDescriptor,
  getSettingCategories,
  validateSetting,
  migrateSettings,
  searchSettings,
  SETTINGS_SCHEMA,
  SETTING_DEFAULTS,
  SETTINGS_VERSION,
  SETTINGS_MIGRATIONS,
  type SettingsLayer,
  type SettingChangedDetail,
} from './settings'
import { useWorkspaceStore } from './workspace'
import { DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY } from '@shared/constants'

const store = () => useSettingsStore.getState()

// Pristine legacy AppSettings shape, mirrored from the store initializer.
const PRISTINE_SETTINGS = {
  theme: 'dark' as const,
  fontSize: DEFAULT_FONT_SIZE,
  fontFamily: DEFAULT_FONT_FAMILY,
  models: [] as any[],
  activeModelId: '',
  agentModelMapping: {},
}

/**
 * Capture orion:setting-changed events so tests can assert event side-effects.
 */
function captureSettingChanges() {
  const events: SettingChangedDetail[] = []
  const handler = ((e: CustomEvent<SettingChangedDetail>) => {
    events.push(e.detail)
  }) as EventListener
  window.addEventListener('orion:setting-changed', handler)
  return {
    events,
    dispose: () => window.removeEventListener('orion:setting-changed', handler),
  }
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset ONLY the data fields back to their initial values. We deliberately
    // do NOT pass { replace: true } so the action implementations remain intact.
    useSettingsStore.setState({
      settings: {
        ...PRISTINE_SETTINGS,
        models: [],
        agentModelMapping: {},
      },
      layers: {
        default: { ...SETTING_DEFAULTS },
        user: {},
        workspace: {},
        folder: {},
      },
      version: SETTINGS_VERSION,
    })
    // getEffectiveSetting also consults the workspace store's workspaceOverrides
    // for the 'workspace' layer; reset it so leakage between suites can't occur.
    useWorkspaceStore.setState({ workspaceOverrides: {} })
  })

  // ---------------------------------------------------------------------------
  // Schema integrity
  // ---------------------------------------------------------------------------
  describe('schema', () => {
    it('has unique keys across the whole schema', () => {
      const keys = SETTINGS_SCHEMA.map((d) => d.key)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('SETTING_DEFAULTS contains every schema key with its declared default', () => {
      for (const d of SETTINGS_SCHEMA) {
        expect(SETTING_DEFAULTS[d.key]).toEqual(d.default)
      }
      expect(Object.keys(SETTING_DEFAULTS).length).toBe(SETTINGS_SCHEMA.length)
    })

    it('every number setting with min/max has min <= max', () => {
      for (const d of SETTINGS_SCHEMA) {
        if (d.type === 'number' && d.min !== undefined && d.max !== undefined) {
          expect(d.min).toBeLessThanOrEqual(d.max)
        }
      }
    })

    it('every enum default is itself a member of the enum', () => {
      for (const d of SETTINGS_SCHEMA) {
        if (d.enum) {
          expect(d.enum).toContain(d.default)
        }
      }
    })

    it('getSettingDescriptor returns the descriptor for a known key and undefined otherwise', () => {
      expect(getSettingDescriptor('editor.fontSize')?.key).toBe('editor.fontSize')
      expect(getSettingDescriptor('does.not.exist')).toBeUndefined()
    })

    it('getSettingCategories returns the unique set of categories in declaration order', () => {
      const cats = getSettingCategories()
      expect(cats).toEqual([
        'editor',
        'terminal',
        'ai',
        'appearance',
        'files',
        'theme',
        'general',
        'keybindings',
      ])
      expect(new Set(cats).size).toBe(cats.length)
    })
  })

  // ---------------------------------------------------------------------------
  // Defaults / effective resolution
  // ---------------------------------------------------------------------------
  describe('defaults & getEffectiveSetting', () => {
    it('resolves a number default from the default layer', () => {
      expect(getEffectiveSetting('editor.fontSize')).toBe(DEFAULT_FONT_SIZE)
      expect(getEffectiveSetting('editor.tabSize')).toBe(2)
      expect(getEffectiveSetting('ai.maxTokens')).toBe(4096)
    })

    it('resolves string/boolean/array/object defaults', () => {
      expect(getEffectiveSetting('editor.fontFamily')).toBe(DEFAULT_FONT_FAMILY)
      expect(getEffectiveSetting('editor.insertSpaces')).toBe(true)
      expect(getEffectiveSetting('terminal.shellArgs')).toEqual([])
      expect(getEffectiveSetting('terminal.env')).toEqual({})
    })

    it('returns undefined for a completely unknown key (no schema, no layer)', () => {
      expect(getEffectiveSetting('totally.unknown.key')).toBeUndefined()
    })

    it('falls back to the legacy flat AppSettings object for pre-schema keys', () => {
      // "theme" and "fontSize" (flat) are not schema keys, but exist on settings.
      expect(getEffectiveSetting('theme')).toBe('dark')
      expect(getEffectiveSetting('fontSize')).toBe(DEFAULT_FONT_SIZE)
    })

    it('getEffectiveSettingTyped returns value when present, fallback when nullish', () => {
      expect(getEffectiveSettingTyped('editor.tabSize', 99)).toBe(2)
      expect(getEffectiveSettingTyped('totally.unknown.key', 'fallback')).toBe('fallback')
    })

    it('getEffectiveSettingTyped fallback DOES NOT trigger for falsy-but-defined values (uses ??)', () => {
      // general.telemetry default is false; ?? must keep false, not fall back.
      expect(getEffectiveSettingTyped('general.telemetry', true)).toBe(false)
      // editor.lineHeight default is 0; ?? must keep 0.
      expect(getEffectiveSettingTyped('editor.lineHeight', 42)).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // Layer precedence
  // ---------------------------------------------------------------------------
  describe('layer precedence (default < user < workspace < folder)', () => {
    it('user overrides default', () => {
      store().setSetting('editor.fontSize', 20, 'user')
      expect(getEffectiveSetting('editor.fontSize')).toBe(20)
    })

    it('workspace overrides user', () => {
      store().setSetting('editor.fontSize', 20, 'user')
      store().setSetting('editor.fontSize', 24, 'workspace')
      expect(getEffectiveSetting('editor.fontSize')).toBe(24)
    })

    it('folder overrides workspace and user', () => {
      store().setSetting('editor.fontSize', 20, 'user')
      store().setSetting('editor.fontSize', 24, 'workspace')
      store().setSetting('editor.fontSize', 30, 'folder')
      expect(getEffectiveSetting('editor.fontSize')).toBe(30)
    })

    it('legacy workspaceOverrides store is consulted at the workspace layer and beats user', () => {
      store().setSetting('editor.tabSize', 8, 'user')
      useWorkspaceStore.setState({ workspaceOverrides: { 'editor.tabSize': 4 } })
      // workspace layer (via workspaceOverrides) wins over user.
      expect(getEffectiveSetting('editor.tabSize')).toBe(4)
    })

    it('legacy workspaceOverrides is checked BEFORE the in-store workspace layer for the same key', () => {
      // Both present: production walks workspaceOverrides first within the
      // workspace layer iteration, so it wins over the store workspace layer.
      store().setSetting('editor.tabSize', 6, 'workspace')
      useWorkspaceStore.setState({ workspaceOverrides: { 'editor.tabSize': 3 } })
      expect(getEffectiveSetting('editor.tabSize')).toBe(3)
    })

    it('folder still beats a legacy workspaceOverride', () => {
      useWorkspaceStore.setState({ workspaceOverrides: { 'editor.tabSize': 3 } })
      store().setSetting('editor.tabSize', 10, 'folder')
      expect(getEffectiveSetting('editor.tabSize')).toBe(10)
    })
  })

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  describe('validateSetting', () => {
    it('rejects unknown keys', () => {
      const r = validateSetting('nope', 1)
      expect(r.valid).toBe(false)
      expect(r.message).toMatch(/Unknown setting key/)
    })

    it('rejects type mismatch (array vs number distinguished)', () => {
      expect(validateSetting('editor.fontSize', 'big').valid).toBe(false)
      expect(validateSetting('terminal.shellArgs', {}).valid).toBe(false) // object != array
      expect(validateSetting('terminal.shellArgs', ['--login']).valid).toBe(true)
      expect(validateSetting('terminal.env', {}).valid).toBe(true)
      // arrays must NOT validate as 'object'
      expect(validateSetting('terminal.env', []).valid).toBe(false)
    })

    it('enforces enum membership', () => {
      expect(validateSetting('editor.wordWrap', 'on').valid).toBe(true)
      const bad = validateSetting('editor.wordWrap', 'sideways')
      expect(bad.valid).toBe(false)
      expect(bad.message).toMatch(/must be one of/)
    })

    it('enforces inclusive min/max numeric bounds', () => {
      // editor.fontSize: min 8, max 72
      expect(validateSetting('editor.fontSize', 8).valid).toBe(true) // inclusive min
      expect(validateSetting('editor.fontSize', 72).valid).toBe(true) // inclusive max
      expect(validateSetting('editor.fontSize', 7).valid).toBe(false)
      expect(validateSetting('editor.fontSize', 73).valid).toBe(false)
    })

    it('reports the correct bound in the message', () => {
      expect(validateSetting('editor.fontSize', 7).message).toMatch(/>= 8/)
      expect(validateSetting('editor.fontSize', 73).message).toMatch(/<= 72/)
    })

    it('treats null as type "object" (so number keys reject null)', () => {
      // typeof null === 'object'; pins current behavior.
      expect(validateSetting('editor.fontSize', null).valid).toBe(false)
      // ...but an 'object'-typed key would accept null. Pin that quirk:
      // SUSPECTED FOOTGUN: null passes the type check for object-typed settings.
      expect(validateSetting('terminal.env', null).valid).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // setSetting
  // ---------------------------------------------------------------------------
  describe('setSetting', () => {
    it('stores valid value in the user layer by default and returns true', () => {
      expect(store().setSetting('editor.fontSize', 18)).toBe(true)
      expect(store().layers.user['editor.fontSize']).toBe(18)
      expect(store().layers.workspace['editor.fontSize']).toBeUndefined()
    })

    it('rejects invalid value, returns false, and does not mutate any layer', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(store().setSetting('editor.fontSize', 1000)).toBe(false)
      expect(store().layers.user['editor.fontSize']).toBeUndefined()
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it('rejects an unknown key', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(store().setSetting('mystery.key', 1)).toBe(false)
      warn.mockRestore()
    })

    it('dispatches orion:setting-changed with old/new/layer on success', () => {
      const cap = captureSettingChanges()
      store().setSetting('editor.fontSize', 22, 'workspace')
      cap.dispose()
      expect(cap.events).toHaveLength(1)
      expect(cap.events[0]).toMatchObject({
        key: 'editor.fontSize',
        oldValue: DEFAULT_FONT_SIZE, // effective before write
        newValue: 22,
        layer: 'workspace',
      })
    })

    it('does NOT dispatch when the value is invalid', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const cap = captureSettingChanges()
      store().setSetting('editor.fontSize', -1)
      cap.dispose()
      expect(cap.events).toHaveLength(0)
      warn.mockRestore()
    })

    it('writing to a non-effective layer still reports the previously-effective oldValue', () => {
      // folder is effective; writing user reports oldValue = folder value.
      store().setSetting('editor.tabSize', 10, 'folder')
      const cap = captureSettingChanges()
      store().setSetting('editor.tabSize', 5, 'user')
      cap.dispose()
      expect(cap.events[0].oldValue).toBe(10)
      expect(cap.events[0].newValue).toBe(5)
      // ...but the effective value is unchanged because folder still wins.
      expect(getEffectiveSetting('editor.tabSize')).toBe(10)
    })
  })

  // ---------------------------------------------------------------------------
  // removeSetting
  // ---------------------------------------------------------------------------
  describe('removeSetting', () => {
    it('removes a user override so the value falls back to default', () => {
      store().setSetting('editor.fontSize', 30, 'user')
      expect(getEffectiveSetting('editor.fontSize')).toBe(30)
      store().removeSetting('editor.fontSize', 'user')
      expect(getEffectiveSetting('editor.fontSize')).toBe(DEFAULT_FONT_SIZE)
    })

    it('dispatches a change event only when the effective value actually changes', () => {
      store().setSetting('editor.fontSize', 30, 'user')
      const cap = captureSettingChanges()
      store().removeSetting('editor.fontSize', 'user')
      cap.dispose()
      expect(cap.events).toHaveLength(1)
      expect(cap.events[0]).toMatchObject({ oldValue: 30, newValue: DEFAULT_FONT_SIZE })
    })

    it('does NOT dispatch when removing a key that has no override (no effective change)', () => {
      const cap = captureSettingChanges()
      store().removeSetting('editor.fontSize', 'user')
      cap.dispose()
      expect(cap.events).toHaveLength(0)
    })

    it('removing from a shadowed layer leaves the effective value unchanged and dispatches nothing', () => {
      store().setSetting('editor.fontSize', 30, 'user')
      store().setSetting('editor.fontSize', 40, 'folder')
      const cap = captureSettingChanges()
      store().removeSetting('editor.fontSize', 'user') // folder still wins
      cap.dispose()
      expect(getEffectiveSetting('editor.fontSize')).toBe(40)
      expect(cap.events).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------------------
  // setMany
  // ---------------------------------------------------------------------------
  describe('setMany', () => {
    it('applies all valid entries and skips invalid ones', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      store().setMany({
        'editor.fontSize': 16,
        'editor.tabSize': 4,
        'editor.fontSize-bogus': 1, // unknown -> skipped
        'editor.wordWrap': 'nonsense', // bad enum -> skipped
      })
      warn.mockRestore()
      expect(store().layers.user['editor.fontSize']).toBe(16)
      expect(store().layers.user['editor.tabSize']).toBe(4)
      expect(store().layers.user['editor.wordWrap']).toBeUndefined()
    })

    it('dispatches one event per valid entry', () => {
      const cap = captureSettingChanges()
      store().setMany({ 'editor.fontSize': 16, 'editor.tabSize': 4 })
      cap.dispose()
      expect(cap.events.map((e) => e.key).sort()).toEqual(['editor.fontSize', 'editor.tabSize'])
    })

    it('is a no-op (no events, no layer change) when every entry is invalid', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const cap = captureSettingChanges()
      store().setMany({ unknown1: 1, 'editor.wordWrap': 'bad' })
      cap.dispose()
      warn.mockRestore()
      expect(cap.events).toHaveLength(0)
      expect(store().layers.user).toEqual({})
    })

    it('targets the requested layer', () => {
      store().setMany({ 'editor.fontSize': 16 }, 'folder')
      expect(store().layers.folder['editor.fontSize']).toBe(16)
      expect(store().layers.user['editor.fontSize']).toBeUndefined()
    })
  })

  // ---------------------------------------------------------------------------
  // loadLayer (persistence-style reload + migration + merge precedence)
  // ---------------------------------------------------------------------------
  describe('loadLayer', () => {
    it('merges loaded data ON TOP of the default values, not the existing layer', () => {
      // Pre-seed user with a value that loadLayer should overwrite via a fresh
      // default+clean merge (loadLayer spreads state.layers.default, not the old user layer).
      store().setSetting('editor.fontSize', 50, 'user') // 50, valid
      store().loadLayer('user', { 'editor.tabSize': 6 })
      // tabSize from loaded data:
      expect(store().layers.user['editor.tabSize']).toBe(6)
      // fontSize is reset to the DEFAULT (the merge base is default layer, the
      // old user override of 50 is discarded):
      expect(store().layers.user['editor.fontSize']).toBe(DEFAULT_FONT_SIZE)
    })

    it('strips the internal __settingsVersion key from the stored layer', () => {
      store().loadLayer('workspace', { 'editor.tabSize': 8, __settingsVersion: 2 })
      expect('__settingsVersion' in store().layers.workspace).toBe(false)
      expect(store().layers.workspace['editor.tabSize']).toBe(8)
    })

    it('applies v0->v2 migrations on load (flat theme/fontSize renamed)', () => {
      store().loadLayer('user', {
        theme: 'monokai',
        fontSize: 18,
        activeModelId: 'm1',
      })
      // migrated to namespaced keys
      expect(store().layers.user['theme.colorTheme']).toBe('monokai')
      expect(store().layers.user['editor.fontSize']).toBe(18)
      expect(store().layers.user['ai.activeModelId']).toBe('m1')
      // old flat keys gone
      expect('theme' in store().layers.user).toBe(false)
      expect('fontSize' in store().layers.user).toBe(false)
    })

    it('sets version to the current SETTINGS_VERSION after load', () => {
      store().loadLayer('user', { 'editor.tabSize': 4 })
      expect(store().version).toBe(SETTINGS_VERSION)
    })
  })

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------
  describe('resetSetting / resetAll', () => {
    it('resetSetting removes the override from ALL layers', () => {
      store().setSetting('editor.fontSize', 20, 'user')
      store().setSetting('editor.fontSize', 24, 'workspace')
      store().setSetting('editor.fontSize', 30, 'folder')
      store().resetSetting('editor.fontSize')
      expect(store().layers.user['editor.fontSize']).toBeUndefined()
      expect(store().layers.workspace['editor.fontSize']).toBeUndefined()
      expect(store().layers.folder['editor.fontSize']).toBeUndefined()
      expect(getEffectiveSetting('editor.fontSize')).toBe(DEFAULT_FONT_SIZE)
    })

    it('resetSetting dispatches a default-layer change event when effective value changes', () => {
      store().setSetting('editor.fontSize', 30, 'user')
      const cap = captureSettingChanges()
      store().resetSetting('editor.fontSize')
      cap.dispose()
      expect(cap.events).toHaveLength(1)
      expect(cap.events[0]).toMatchObject({
        oldValue: 30,
        newValue: DEFAULT_FONT_SIZE,
        layer: 'default',
      })
    })

    it('resetSetting does NOT dispatch when there was nothing to reset', () => {
      const cap = captureSettingChanges()
      store().resetSetting('editor.fontSize')
      cap.dispose()
      expect(cap.events).toHaveLength(0)
    })

    it('resetAll clears user/workspace/folder but PRESERVES the default layer', () => {
      store().setSetting('editor.fontSize', 20, 'user')
      store().setSetting('editor.tabSize', 8, 'workspace')
      store().setSetting('ai.temperature', 1.5, 'folder')
      store().resetAll()
      expect(store().layers.user).toEqual({})
      expect(store().layers.workspace).toEqual({})
      expect(store().layers.folder).toEqual({})
      // default layer intact
      expect(store().layers.default['editor.fontSize']).toBe(DEFAULT_FONT_SIZE)
      expect(getEffectiveSetting('editor.fontSize')).toBe(DEFAULT_FONT_SIZE)
    })

    it('SUSPECTED LIMITATION: resetAll does NOT clear legacy workspaceOverrides', () => {
      useWorkspaceStore.setState({ workspaceOverrides: { 'editor.tabSize': 4 } })
      store().resetAll()
      // The workspaceOverrides store is separate and survives resetAll, so the
      // effective value is still the override, not the default. Pinning behavior.
      expect(getEffectiveSetting('editor.tabSize')).toBe(4)
    })
  })

  // ---------------------------------------------------------------------------
  // Legacy AppSettings mutations
  // ---------------------------------------------------------------------------
  describe('legacy mutations', () => {
    it('setSettings replaces the whole legacy settings object', () => {
      store().setSettings({ ...PRISTINE_SETTINGS, theme: 'light', fontSize: 20 } as any)
      expect(store().settings.theme).toBe('light')
      expect(store().settings.fontSize).toBe(20)
    })

    it('addModel appends to settings.models immutably', () => {
      const m1 = { modelId: 'a', provider: 'x' } as any
      const m2 = { modelId: 'b', provider: 'y' } as any
      const before = store().settings.models
      store().addModel(m1)
      store().addModel(m2)
      expect(store().settings.models.map((m: any) => m.modelId)).toEqual(['a', 'b'])
      expect(store().settings.models).not.toBe(before) // new array
    })

    it('removeModel filters by modelId', () => {
      store().addModel({ modelId: 'a' } as any)
      store().addModel({ modelId: 'b' } as any)
      store().removeModel('a')
      expect(store().settings.models.map((m: any) => m.modelId)).toEqual(['b'])
    })

    it('setActiveModel updates only activeModelId', () => {
      store().setActiveModel('gpt-x')
      expect(store().settings.activeModelId).toBe('gpt-x')
      expect(store().settings.models).toEqual([])
    })
  })

  // ---------------------------------------------------------------------------
  // migrateSettings (pure function)
  // ---------------------------------------------------------------------------
  describe('migrateSettings', () => {
    it('treats missing __settingsVersion as v0 and runs the full chain to current', () => {
      const out = migrateSettings({ theme: 'nord', fontSize: 16, fontFamily: 'X' })
      expect(out['theme.colorTheme']).toBe('nord')
      expect(out['editor.fontSize']).toBe(16)
      expect(out['editor.fontFamily']).toBe('X')
      expect(out['__settingsVersion']).toBe(SETTINGS_VERSION)
    })

    it('v0->v1 renames ai.* legacy keys', () => {
      const out = migrateSettings({
        activeModelId: 'm',
        models: [{ modelId: 'm' }],
        agentModelMapping: { a: 'm' },
      })
      expect(out['ai.activeModelId']).toBe('m')
      expect(out['ai.models']).toEqual([{ modelId: 'm' }])
      expect(out['ai.agentModelMapping']).toEqual({ a: 'm' })
      expect('activeModelId' in out).toBe(false)
    })

    it('v1->v2 bumps the old ai.maxTokens default of 2048 to 4096', () => {
      const out = migrateSettings({ __settingsVersion: 1, 'ai.maxTokens': 2048 })
      expect(out['ai.maxTokens']).toBe(4096)
    })

    it('v1->v2 leaves a non-default ai.maxTokens untouched', () => {
      const out = migrateSettings({ __settingsVersion: 1, 'ai.maxTokens': 8000 })
      expect(out['ai.maxTokens']).toBe(8000)
    })

    it('is a no-op for already-current data except stamping the version', () => {
      const out = migrateSettings({ __settingsVersion: SETTINGS_VERSION, 'editor.tabSize': 4 })
      expect(out['editor.tabSize']).toBe(4)
      expect(out['__settingsVersion']).toBe(SETTINGS_VERSION)
    })

    it('does not mutate the input object', () => {
      const input = { theme: 'dark' }
      migrateSettings(input)
      expect(input).toEqual({ theme: 'dark' })
    })

    it('migration registry covers a contiguous version chain ending at SETTINGS_VERSION', () => {
      const sorted = [...SETTINGS_MIGRATIONS].sort((a, b) => a.fromVersion - b.fromVersion)
      expect(sorted[0].fromVersion).toBe(0)
      expect(sorted[sorted.length - 1].toVersion).toBe(SETTINGS_VERSION)
    })
  })

  // ---------------------------------------------------------------------------
  // searchSettings
  // ---------------------------------------------------------------------------
  describe('searchSettings', () => {
    it('empty query returns every schema entry matched on all fields', () => {
      const r = searchSettings('   ')
      expect(r).toHaveLength(SETTINGS_SCHEMA.length)
      expect(r[0].matchedOn).toEqual(['key', 'description', 'category'])
    })

    it('matches by key (case-insensitive) and records matchedOn', () => {
      const r = searchSettings('FONTSIZE')
      const keys = r.map((x) => x.descriptor.key)
      expect(keys).toContain('editor.fontSize')
      expect(keys).toContain('terminal.fontSize')
      const fontSizeHit = r.find((x) => x.descriptor.key === 'editor.fontSize')!
      expect(fontSizeHit.matchedOn).toContain('key')
    })

    it('matches by category', () => {
      const r = searchSettings('terminal')
      expect(r.every((x) => x.matchedOn.includes('category') || x.matchedOn.includes('key'))).toBe(true)
      expect(r.length).toBeGreaterThan(0)
    })

    it('returns nothing for a term that matches no key/description/category', () => {
      expect(searchSettings('zzz-no-such-term-xyz')).toEqual([])
    })
  })
})
