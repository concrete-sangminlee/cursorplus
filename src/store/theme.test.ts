/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from './theme'
import type { CustomTheme } from './theme'
import { themes as builtInThemes, getThemeById } from '@/themes'

const store = useThemeStore

const ORION_DARK = getThemeById('orion-dark') // builtInThemes[0] — the default/fallback
const GITHUB_LIGHT = getThemeById('github-light')

/** Read a CSS custom property off the document root. */
function rootVar(name: string): string {
  return document.documentElement.style.getPropertyValue(name)
}

/**
 * jsdom does not implement window.matchMedia. The auto-theme tests need a
 * controllable stub. This returns the install helper plus the captured handlers
 * so a test can simulate an OS preference change.
 */
function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const mql = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_evt: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb)),
    removeEventListener: vi.fn((_evt: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb)),
  }
  const matchMedia = vi.fn(() => mql)
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia
  return {
    mql,
    matchMedia,
    /** Fire a change event to all registered listeners. */
    fireChange(matches: boolean) {
      mql.matches = matches
      for (const cb of listeners) cb({ matches } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
  }
}

/** Restore the store data fields to a known clean baseline (no replace:true). */
function reset() {
  // Tear down any auto-theme media listener left behind by a prior test.
  const cleanup = store.getState()._autoThemeCleanup
  if (cleanup) cleanup()

  store.setState({
    themes: [...builtInThemes],
    customThemes: [],
    activeThemeId: 'orion-dark',
    previewThemeId: null,
    autoThemeConfig: { enabled: false, lightThemeId: 'github-light', darkThemeId: 'orion-dark' },
    _autoThemeCleanup: null,
    colorOverrides: { workbench: {}, tokenColors: [] },
    iconTheme: 'seti',
  })
}

beforeEach(() => {
  localStorage.clear()
  // Reset the DOM root so leaked CSS variables don't cross test boundaries.
  document.documentElement.removeAttribute('style')
  document.documentElement.removeAttribute('data-theme-type')
  document.documentElement.removeAttribute('data-icon-theme')
  reset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
describe('setTheme — selecting / switching', () => {
  it('applies every CSS variable of the chosen theme to the document root', () => {
    store.getState().setTheme('github-light')

    expect(store.getState().activeThemeId).toBe('github-light')
    // Spot-check a handful of variables against the theme definition.
    expect(rootVar('--bg-primary')).toBe(GITHUB_LIGHT.colors['--bg-primary'])
    expect(rootVar('--text-primary')).toBe(GITHUB_LIGHT.colors['--text-primary'])
    expect(rootVar('--accent')).toBe(GITHUB_LIGHT.colors['--accent'])
    // Every key in the theme should be present on the root.
    for (const [k, v] of Object.entries(GITHUB_LIGHT.colors)) {
      expect(rootVar(k)).toBe(v)
    }
  })

  it('sets the data-theme-type attribute to the theme type (light/dark)', () => {
    store.getState().setTheme('github-light')
    expect(document.documentElement.getAttribute('data-theme-type')).toBe('light')

    store.getState().setTheme('tokyo-night')
    expect(document.documentElement.getAttribute('data-theme-type')).toBe('dark')
  })

  it('persists the active theme id to localStorage', () => {
    store.getState().setTheme('dracula')
    expect(localStorage.getItem('orion-theme')).toBe('dracula')
  })

  it('clears any active preview when a theme is committed', () => {
    store.setState({ previewThemeId: 'nord' })
    store.getState().setTheme('dracula')
    expect(store.getState().previewThemeId).toBeNull()
  })

  it('dispatches orion:theme-changed with the monaco theme name and id', () => {
    const handler = vi.fn()
    window.addEventListener('orion:theme-changed', handler as EventListener)
    store.getState().setTheme('nord')
    window.removeEventListener('orion:theme-changed', handler as EventListener)

    expect(handler).toHaveBeenCalledTimes(1)
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail
    expect(detail).toEqual({ monacoTheme: 'nord', themeId: 'nord' })
  })

  it('layers workbench color overrides on top of the theme colors', () => {
    store.setState({ colorOverrides: { workbench: { '--bg-primary': '#abcdef' }, tokenColors: [] } })
    store.getState().setTheme('github-light')
    // Override wins over the theme's own --bg-primary.
    expect(rootVar('--bg-primary')).toBe('#abcdef')
    // Non-overridden variable still comes from the theme.
    expect(rootVar('--text-primary')).toBe(GITHUB_LIGHT.colors['--text-primary'])
  })
})

// ---------------------------------------------------------------------------
describe('setTheme — fallback for unknown theme id', () => {
  it('falls back to the default (orion-dark) when the id is unknown', () => {
    store.getState().setTheme('does-not-exist')
    // findThemeById returns builtInThemes[0] => orion-dark.
    expect(store.getState().activeThemeId).toBe('orion-dark')
    expect(rootVar('--bg-primary')).toBe(ORION_DARK.colors['--bg-primary'])
    // It persists the resolved fallback id, not the requested one.
    expect(localStorage.getItem('orion-theme')).toBe('orion-dark')
  })
})

// ---------------------------------------------------------------------------
describe('activeTheme getter', () => {
  it('returns the full Theme object for the active id', () => {
    store.getState().setTheme('catppuccin-mocha')
    const t = store.getState().activeTheme()
    expect(t.id).toBe('catppuccin-mocha')
    expect(t.name).toBe('Catppuccin Mocha')
  })

  it('returns the fallback theme when activeThemeId is unknown', () => {
    store.setState({ activeThemeId: 'ghost-theme' })
    expect(store.getState().activeTheme().id).toBe('orion-dark')
  })
})

// ---------------------------------------------------------------------------
describe('previewTheme', () => {
  it('applies the previewed theme to the DOM and records previewThemeId, without persisting', () => {
    store.getState().setTheme('orion-dark')
    localStorage.clear()

    store.getState().previewTheme('github-light')
    expect(store.getState().previewThemeId).toBe('github-light')
    expect(rootVar('--bg-primary')).toBe(GITHUB_LIGHT.colors['--bg-primary'])
    // Preview must NOT change the active theme nor persist.
    expect(store.getState().activeThemeId).toBe('orion-dark')
    expect(localStorage.getItem('orion-theme')).toBeNull()
  })

  it('does NOT layer workbench overrides while previewing (overrides omitted)', () => {
    store.setState({ colorOverrides: { workbench: { '--bg-primary': '#deadbe' }, tokenColors: [] } })
    store.getState().previewTheme('github-light')
    // applyThemeToDOM is called without overrides in the preview branch,
    // so the theme's own value wins.
    expect(rootVar('--bg-primary')).toBe(GITHUB_LIGHT.colors['--bg-primary'])
  })

  it('reverts to the active theme (with overrides) when passed null', () => {
    store.setState({ colorOverrides: { workbench: { '--accent': '#123456' }, tokenColors: [] } })
    store.getState().setTheme('orion-dark')
    store.getState().previewTheme('github-light')

    store.getState().previewTheme(null)
    expect(store.getState().previewThemeId).toBeNull()
    // Back to orion-dark colors...
    expect(rootVar('--bg-primary')).toBe(ORION_DARK.colors['--bg-primary'])
    // ...with the active override re-applied on revert.
    expect(rootVar('--accent')).toBe('#123456')
  })
})

// ---------------------------------------------------------------------------
describe('createCustomTheme', () => {
  it('clones a base theme, marks it custom, and registers it in the store', () => {
    const created = store.getState().createCustomTheme('dracula', 'My Dracula')
    expect(created.isCustom).toBe(true)
    expect(created.clonedFrom).toBe('dracula')
    expect(created.name).toBe('My Dracula')
    expect(created.author).toBe('Custom')
    expect(created.id).toMatch(/^custom-/)
    expect(created.monacoTheme).toBe(created.id)
    expect(created.createdAt).toBeGreaterThan(0)
    // Inherits the base palette.
    expect(created.colors['--bg-primary']).toBe(getThemeById('dracula').colors['--bg-primary'])

    expect(store.getState().customThemes).toHaveLength(1)
    // themes array is rebuilt to include built-ins plus the custom one.
    expect(store.getState().themes).toHaveLength(builtInThemes.length + 1)
    expect(store.getState().themes.some((t) => t.id === created.id)).toBe(true)
  })

  it("strips the 'default' tag and adds 'custom'", () => {
    // orion-dark has the 'default' tag.
    const created = store.getState().createCustomTheme('orion-dark', 'Clone')
    expect(created.tags).toContain('custom')
    expect(created.tags).not.toContain('default')
  })

  it('applies color edits and recomputes previewColors from them', () => {
    const edits = { '--bg-primary': '#111111', '--text-primary': '#eeeeee', '--accent-blue': '#0000ff' }
    const created = store.getState().createCustomTheme('orion-dark', 'Edited', edits)
    expect(created.colors['--bg-primary']).toBe('#111111')
    expect(created.colors['--text-primary']).toBe('#eeeeee')
    // previewColors[0]=bg, [1]=text, [2]=accent-blue||accent.
    expect(created.previewColors[0]).toBe('#111111')
    expect(created.previewColors[1]).toBe('#eeeeee')
    expect(created.previewColors[2]).toBe('#0000ff')
  })

  it('does a shallow clone of base colors — editing the clone does not mutate the base theme', () => {
    const before = getThemeById('orion-dark').colors['--bg-primary']
    const created = store.getState().createCustomTheme('orion-dark', 'Clone')
    created.colors['--bg-primary'] = '#000fff'
    expect(getThemeById('orion-dark').colors['--bg-primary']).toBe(before)
  })

  it('persists custom themes to localStorage', () => {
    const created = store.getState().createCustomTheme('nord', 'Nordish')
    const raw = localStorage.getItem('orion-custom-themes')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!) as CustomTheme[]
    expect(parsed).toHaveLength(1)
    expect(parsed[0].id).toBe(created.id)
  })
})

// ---------------------------------------------------------------------------
describe('updateCustomTheme', () => {
  it('updates name and colors of an existing custom theme', () => {
    const created = store.getState().createCustomTheme('orion-dark', 'Orig')
    store.getState().updateCustomTheme(created.id, {
      name: 'Renamed',
      colors: { ...created.colors, '--bg-primary': '#abc123' },
    })
    const updated = store.getState().customThemes.find((t) => t.id === created.id)!
    expect(updated.name).toBe('Renamed')
    expect(updated.colors['--bg-primary']).toBe('#abc123')
  })

  it('recomputes previewColors when colors are updated', () => {
    const created = store.getState().createCustomTheme('orion-dark', 'Orig')
    store.getState().updateCustomTheme(created.id, {
      colors: { ...created.colors, '--bg-primary': '#aaaaaa', '--text-primary': '#bbbbbb' },
    })
    const updated = store.getState().customThemes.find((t) => t.id === created.id)!
    expect(updated.previewColors[0]).toBe('#aaaaaa')
    expect(updated.previewColors[1]).toBe('#bbbbbb')
  })

  it('re-applies to the DOM when the updated theme is currently active', () => {
    const created = store.getState().createCustomTheme('orion-dark', 'Active')
    store.getState().setTheme(created.id)
    store.getState().updateCustomTheme(created.id, {
      colors: { ...created.colors, '--bg-primary': '#fedcba' },
    })
    expect(rootVar('--bg-primary')).toBe('#fedcba')
  })

  it('does NOT re-apply to the DOM when the updated theme is not active', () => {
    const created = store.getState().createCustomTheme('orion-dark', 'Inactive')
    store.getState().setTheme('github-light')
    const bgBefore = rootVar('--bg-primary')
    store.getState().updateCustomTheme(created.id, {
      colors: { ...created.colors, '--bg-primary': '#fedcba' },
    })
    expect(rootVar('--bg-primary')).toBe(bgBefore)
  })

  it('is a no-op for an unknown theme id', () => {
    const before = store.getState().customThemes
    store.getState().updateCustomTheme('nope', { name: 'X' })
    expect(store.getState().customThemes).toBe(before)
  })
})

// ---------------------------------------------------------------------------
describe('deleteCustomTheme', () => {
  it('removes the theme from customThemes and the themes list, and persists', () => {
    const created = store.getState().createCustomTheme('nord', 'Temp')
    store.getState().deleteCustomTheme(created.id)
    expect(store.getState().customThemes).toHaveLength(0)
    expect(store.getState().themes.some((t) => t.id === created.id)).toBe(false)
    const raw = JSON.parse(localStorage.getItem('orion-custom-themes')!) as CustomTheme[]
    expect(raw).toHaveLength(0)
  })

  it('reverts to the default theme when deleting the active custom theme', () => {
    const created = store.getState().createCustomTheme('github-light', 'Active Light')
    store.getState().setTheme(created.id)
    expect(store.getState().activeThemeId).toBe(created.id)

    store.getState().deleteCustomTheme(created.id)
    expect(store.getState().activeThemeId).toBe('orion-dark')
    expect(store.getState().previewThemeId).toBeNull()
    expect(localStorage.getItem('orion-theme')).toBe('orion-dark')
    expect(rootVar('--bg-primary')).toBe(ORION_DARK.colors['--bg-primary'])
  })

  it('does not change the active theme when deleting a non-active custom theme', () => {
    const created = store.getState().createCustomTheme('nord', 'Other')
    store.getState().setTheme('dracula')
    store.getState().deleteCustomTheme(created.id)
    expect(store.getState().activeThemeId).toBe('dracula')
  })
})

// ---------------------------------------------------------------------------
describe('importVSCodeTheme', () => {
  const vscodeJson = JSON.stringify({
    name: 'My VSC Theme',
    type: 'dark',
    colors: {
      'editor.background': '#101010',
      'editor.foreground': '#fafafa',
      'button.background': '#ff00ff',
    },
    tokenColors: [
      { scope: 'comment', settings: { foreground: '#888888', fontStyle: 'italic' } },
      { scope: ['keyword', 'storage'], settings: { foreground: '#ff0000' } },
    ],
  })

  it('parses VS Code JSON into a custom theme and stores it', () => {
    const created = store.getState().importVSCodeTheme(vscodeJson)
    expect(created.isCustom).toBe(true)
    expect(created.id).toMatch(/^imported-/)
    expect(created.name).toBe('My VSC Theme')
    expect(created.type).toBe('dark')
    expect(created.author).toBe('Imported')
    // Mapped colors: editor.background -> --bg-primary, button.background -> --accent.
    expect(created.colors['--bg-primary']).toBe('#101010')
    expect(created.colors['--text-primary']).toBe('#fafafa')
    expect(created.colors['--accent']).toBe('#ff00ff')
    expect(store.getState().customThemes).toHaveLength(1)
  })

  it('builds Monaco rules from tokenColors (strips leading # from foreground)', () => {
    const created = store.getState().importVSCodeTheme(vscodeJson)
    const rules = created.monacoThemeData!.rules
    // First rule is the base foreground.
    expect(rules[0]).toEqual({ token: '', foreground: 'fafafa' })
    // Array scopes are expanded into one rule each.
    const tokens = rules.map((r) => r.token)
    expect(tokens).toContain('keyword')
    expect(tokens).toContain('storage')
    const comment = rules.find((r) => r.token === 'comment')!
    expect(comment.foreground).toBe('888888')
    expect(comment.fontStyle).toBe('italic')
  })

  it('defaults type to dark and falls back to orion-dark colors for unmapped variables', () => {
    const created = store.getState().importVSCodeTheme(JSON.stringify({ name: 'Sparse' }))
    expect(created.type).toBe('dark')
    // No colors provided => base fallback (orion-dark) supplies the palette.
    expect(created.colors['--bg-primary']).toBe(ORION_DARK.colors['--bg-primary'])
    expect(created.name).toBe('Sparse')
  })

  it('treats type:light as a light theme based on the github-light fallback', () => {
    const created = store.getState().importVSCodeTheme(JSON.stringify({ name: 'L', type: 'light' }))
    expect(created.type).toBe('light')
    expect(created.colors['--bg-primary']).toBe(GITHUB_LIGHT.colors['--bg-primary'])
    expect(created.monacoThemeData!.base).toBe('vs')
  })

  it('throws a helpful error on invalid JSON', () => {
    expect(() => store.getState().importVSCodeTheme('{ not json')).toThrowError(/Invalid JSON/)
    // Nothing should have been added.
    expect(store.getState().customThemes).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
describe('exportTheme', () => {
  it('serializes a built-in theme to a re-importable JSON string', () => {
    const json = store.getState().exportTheme('nord')
    const parsed = JSON.parse(json)
    const nord = getThemeById('nord')
    expect(parsed.name).toBe(nord.name)
    expect(parsed.type).toBe('dark')
    expect(parsed.colors).toEqual(nord.colors)
    expect(parsed.monacoTheme).toBe('nord')
    // id is intentionally NOT part of the export payload.
    expect(parsed.id).toBeUndefined()
  })

  it('exports the fallback theme for an unknown id', () => {
    const json = store.getState().exportTheme('unknown')
    expect(JSON.parse(json).name).toBe(ORION_DARK.name)
  })
})

// ---------------------------------------------------------------------------
describe('shareThemeToClipboard', () => {
  it('writes the exported JSON to the clipboard and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    const ok = await store.getState().shareThemeToClipboard('dracula')
    expect(ok).toBe(true)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(JSON.parse(writeText.mock.calls[0][0]).name).toBe('Dracula')
  })

  it('returns false when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const ok = await store.getState().shareThemeToClipboard('dracula')
    expect(ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
describe('auto dark/light switching', () => {
  it('applies the dark theme immediately when enabled and OS prefers dark', () => {
    const mm = installMatchMedia(true) // OS prefers dark
    store.setState({ autoThemeConfig: { enabled: false, lightThemeId: 'github-light', darkThemeId: 'nord' } })

    store.getState().setAutoThemeEnabled(true)

    expect(mm.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
    expect(store.getState().autoThemeConfig.enabled).toBe(true)
    // Dark preference => darkThemeId (nord) applied.
    expect(store.getState().activeThemeId).toBe('nord')
    expect(store.getState()._autoThemeCleanup).toBeTypeOf('function')
  })

  it('applies the light theme immediately when OS prefers light', () => {
    installMatchMedia(false) // OS prefers light
    store.setState({ autoThemeConfig: { enabled: false, lightThemeId: 'github-light', darkThemeId: 'nord' } })
    store.getState().setAutoThemeEnabled(true)
    expect(store.getState().activeThemeId).toBe('github-light')
  })

  it('reacts to OS preference changes via the media query listener', () => {
    const mm = installMatchMedia(true)
    store.setState({ autoThemeConfig: { enabled: false, lightThemeId: 'github-light', darkThemeId: 'nord' } })
    store.getState().setAutoThemeEnabled(true)
    expect(store.getState().activeThemeId).toBe('nord')

    mm.fireChange(false) // OS switches to light
    expect(store.getState().activeThemeId).toBe('github-light')

    mm.fireChange(true) // back to dark
    expect(store.getState().activeThemeId).toBe('nord')
  })

  it('tears down the media query listener when disabled', () => {
    const mm = installMatchMedia(true)
    store.setState({ autoThemeConfig: { enabled: false, lightThemeId: 'github-light', darkThemeId: 'nord' } })
    store.getState().setAutoThemeEnabled(true)
    expect(mm.listenerCount()).toBe(1)

    store.getState().setAutoThemeEnabled(false)
    expect(mm.listenerCount()).toBe(0)
    expect(store.getState()._autoThemeCleanup).toBeNull()
    expect(store.getState().autoThemeConfig.enabled).toBe(false)
  })

  it('persists the auto-theme config to localStorage', () => {
    installMatchMedia(true)
    store.getState().setAutoThemeEnabled(true)
    const cfg = JSON.parse(localStorage.getItem('orion-auto-theme-config')!)
    expect(cfg.enabled).toBe(true)
  })

  it('setAutoThemePair stores the pair and re-applies immediately when auto is on', () => {
    const mm = installMatchMedia(true) // dark
    store.getState().setAutoThemeEnabled(true)

    store.getState().setAutoThemePair('solarized-light', 'tokyo-night')
    const cfg = store.getState().autoThemeConfig
    expect(cfg.lightThemeId).toBe('solarized-light')
    expect(cfg.darkThemeId).toBe('tokyo-night')
    // OS prefers dark, so the new dark theme is applied.
    expect(store.getState().activeThemeId).toBe('tokyo-night')
    expect(mm.matchMedia).toHaveBeenCalled()
  })

  it('setAutoThemePair does NOT re-apply when auto is disabled', () => {
    installMatchMedia(true)
    store.getState().setTheme('dracula')
    store.getState().setAutoThemePair('solarized-light', 'tokyo-night')
    // Config updated...
    expect(store.getState().autoThemeConfig.darkThemeId).toBe('tokyo-night')
    // ...but active theme untouched.
    expect(store.getState().activeThemeId).toBe('dracula')
  })
})

// ---------------------------------------------------------------------------
describe('workbench color overrides', () => {
  it('sets an override, persists it, and applies it to the active theme on the DOM', () => {
    store.getState().setTheme('orion-dark')
    store.getState().setWorkbenchColorOverride('--accent', '#ff0000')

    expect(store.getState().colorOverrides.workbench['--accent']).toBe('#ff0000')
    expect(rootVar('--accent')).toBe('#ff0000')
    const persisted = JSON.parse(localStorage.getItem('orion-color-overrides')!)
    expect(persisted.workbench['--accent']).toBe('#ff0000')
  })

  it('applies the override on top of the previewed theme when previewing', () => {
    store.getState().setTheme('orion-dark')
    store.setState({ previewThemeId: 'github-light' })
    store.getState().setWorkbenchColorOverride('--bg-primary', '#abcabc')
    // Re-applied against the preview theme (github-light) + override.
    expect(rootVar('--bg-primary')).toBe('#abcabc')
    expect(rootVar('--text-primary')).toBe(GITHUB_LIGHT.colors['--text-primary'])
  })

  it('removes an override and reverts the variable to the theme value', () => {
    store.getState().setTheme('orion-dark')
    store.getState().setWorkbenchColorOverride('--accent', '#ff0000')
    store.getState().removeWorkbenchColorOverride('--accent')

    expect(store.getState().colorOverrides.workbench['--accent']).toBeUndefined()
    // After re-apply the original theme value is restored.
    expect(rootVar('--accent')).toBe(ORION_DARK.colors['--accent'])
  })

  it('clearAllColorOverrides empties both workbench and token overrides and re-applies the theme', () => {
    store.getState().setTheme('orion-dark')
    store.getState().setWorkbenchColorOverride('--accent', '#ff0000')
    store.getState().setTokenColorOverrides([{ scope: 'comment', settings: { foreground: '#999' } }])

    store.getState().clearAllColorOverrides()
    expect(store.getState().colorOverrides).toEqual({ workbench: {}, tokenColors: [] })
    expect(JSON.parse(localStorage.getItem('orion-color-overrides')!)).toEqual({ workbench: {}, tokenColors: [] })
    // Theme re-applied without overrides.
    expect(rootVar('--accent')).toBe(ORION_DARK.colors['--accent'])
  })
})

// ---------------------------------------------------------------------------
describe('token color overrides', () => {
  it('stores token colors, persists them, and dispatches orion:token-colors-changed', () => {
    const handler = vi.fn()
    window.addEventListener('orion:token-colors-changed', handler as EventListener)
    const tokens = [{ scope: 'keyword', settings: { foreground: '#abcdef' } }]
    store.getState().setTokenColorOverrides(tokens)
    window.removeEventListener('orion:token-colors-changed', handler as EventListener)

    expect(store.getState().colorOverrides.tokenColors).toEqual(tokens)
    expect(JSON.parse(localStorage.getItem('orion-color-overrides')!).tokenColors).toEqual(tokens)
    expect(handler).toHaveBeenCalledTimes(1)
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ tokenColors: tokens })
  })
})

// ---------------------------------------------------------------------------
describe('icon theme', () => {
  it('sets the icon theme, persists it, sets the data attribute, and dispatches an event', () => {
    const handler = vi.fn()
    window.addEventListener('orion:icon-theme-changed', handler as EventListener)
    store.getState().setIconTheme('material')
    window.removeEventListener('orion:icon-theme-changed', handler as EventListener)

    expect(store.getState().iconTheme).toBe('material')
    expect(localStorage.getItem('orion-icon-theme')).toBe('material')
    expect(document.documentElement.getAttribute('data-icon-theme')).toBe('material')
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ iconTheme: 'material' })
  })
})

// ---------------------------------------------------------------------------
describe('persistence + restore (light/dark) edge cases', () => {
  it('round-trips a custom theme through localStorage so it can be restored', () => {
    const created = store.getState().createCustomTheme('dracula', 'Persisted')
    // Simulate a fresh load by reading what was persisted.
    const restored = JSON.parse(localStorage.getItem('orion-custom-themes')!) as CustomTheme[]
    expect(restored).toHaveLength(1)
    expect(restored[0].id).toBe(created.id)
    expect(restored[0].isCustom).toBe(true)
    expect(restored[0].colors['--bg-primary']).toBe(getThemeById('dracula').colors['--bg-primary'])
  })

  it('toggles cleanly between a light and a dark theme, updating data-theme-type each time', () => {
    store.getState().setTheme('github-light')
    expect(document.documentElement.getAttribute('data-theme-type')).toBe('light')
    expect(rootVar('--bg-primary')).toBe(GITHUB_LIGHT.colors['--bg-primary'])

    store.getState().setTheme('orion-dark')
    expect(document.documentElement.getAttribute('data-theme-type')).toBe('dark')
    expect(rootVar('--bg-primary')).toBe(ORION_DARK.colors['--bg-primary'])
    expect(localStorage.getItem('orion-theme')).toBe('orion-dark')
  })

  it('a created custom theme is selectable and applies its (possibly edited) colors', () => {
    const created = store.getState().createCustomTheme('orion-dark', 'Selectable', { '--bg-primary': '#0a0a0a' })
    store.getState().setTheme(created.id)
    expect(store.getState().activeThemeId).toBe(created.id)
    expect(rootVar('--bg-primary')).toBe('#0a0a0a')
  })
})
