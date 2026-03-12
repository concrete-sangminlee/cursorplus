import { create } from 'zustand'
import { themes, getThemeById, type Theme } from '@/themes'

const STORAGE_KEY = 'orion-theme'

/** Track which custom Monaco themes have already been registered. */
const registeredMonacoThemes = new Set<string>()

/** Apply every CSS variable defined in a theme to the document root. */
function applyThemeToDOM(theme: Theme) {
  const root = document.documentElement
  for (const [variable, value] of Object.entries(theme.colors)) {
    root.style.setProperty(variable, value)
  }
  // Toggle a data-attribute so CSS can respond to light/dark
  root.setAttribute('data-theme-type', theme.type)
}

/**
 * Register a custom Monaco theme definition if it has not already been registered.
 * Monaco must be available on the window (via @monaco-editor/react) for this to work;
 * if it isn't yet loaded, the EditorPanel's onMount handler will pick it up.
 */
function registerMonacoThemeIfNeeded(theme: Theme) {
  if (!theme.monacoThemeData) return
  if (registeredMonacoThemes.has(theme.monacoTheme)) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monaco = (window as any).monaco
  if (monaco?.editor?.defineTheme) {
    monaco.editor.defineTheme(theme.monacoTheme, theme.monacoThemeData)
    registeredMonacoThemes.add(theme.monacoTheme)
  }
}

/** Read the persisted theme id from localStorage (may be null). */
function loadPersistedThemeId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Persist the chosen theme id to localStorage. */
function persistThemeId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // ignore quota errors
  }
}

interface ThemeStore {
  /** All available themes. */
  themes: Theme[]
  /** Id of the currently active theme. */
  activeThemeId: string
  /** Id of the theme currently being previewed (hovered), or null. */
  previewThemeId: string | null
  /** Set and apply a theme by id. */
  setTheme: (id: string) => void
  /** Preview a theme temporarily (on hover). Pass null to cancel. */
  previewTheme: (id: string | null) => void
  /** Convenience getter for the full Theme object. */
  activeTheme: () => Theme
}

/** Determine the initial theme: persisted choice or default. */
const initialId = loadPersistedThemeId() || 'orion-dark'

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themes,
  activeThemeId: initialId,
  previewThemeId: null,

  setTheme: (id: string) => {
    const theme = getThemeById(id)
    applyThemeToDOM(theme)
    persistThemeId(theme.id)
    registerMonacoThemeIfNeeded(theme)

    // Notify Monaco editors so they can switch their theme
    window.dispatchEvent(
      new CustomEvent('orion:theme-changed', { detail: { monacoTheme: theme.monacoTheme, themeId: theme.id } })
    )

    set({ activeThemeId: theme.id, previewThemeId: null })
  },

  previewTheme: (id: string | null) => {
    if (id === null) {
      // Revert to active theme
      const active = getThemeById(get().activeThemeId)
      applyThemeToDOM(active)
      registerMonacoThemeIfNeeded(active)
      window.dispatchEvent(
        new CustomEvent('orion:theme-changed', { detail: { monacoTheme: active.monacoTheme, themeId: active.id } })
      )
      set({ previewThemeId: null })
      return
    }

    const theme = getThemeById(id)
    applyThemeToDOM(theme)
    registerMonacoThemeIfNeeded(theme)

    window.dispatchEvent(
      new CustomEvent('orion:theme-changed', { detail: { monacoTheme: theme.monacoTheme, themeId: theme.id } })
    )

    set({ previewThemeId: id })
  },

  activeTheme: () => getThemeById(get().activeThemeId),
}))

// ---------------------------------------------------------------------------
// Boot: apply the initial theme as soon as this module is imported.
// ---------------------------------------------------------------------------
;(() => {
  const theme = getThemeById(initialId)
  applyThemeToDOM(theme)
})()
