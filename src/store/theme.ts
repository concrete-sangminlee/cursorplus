import { create } from 'zustand'
import { themes, getThemeById, type Theme } from '@/themes'

const STORAGE_KEY = 'orion-theme'

/** Apply every CSS variable defined in a theme to the document root. */
function applyThemeToDOM(theme: Theme) {
  const root = document.documentElement
  for (const [variable, value] of Object.entries(theme.colors)) {
    root.style.setProperty(variable, value)
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
  /** Set and apply a theme by id. */
  setTheme: (id: string) => void
  /** Convenience getter for the full Theme object. */
  activeTheme: () => Theme
}

/** Determine the initial theme: persisted choice or default. */
const initialId = loadPersistedThemeId() || 'orion-dark'

export const useThemeStore = create<ThemeStore>((set, get) => ({
  themes,
  activeThemeId: initialId,

  setTheme: (id: string) => {
    const theme = getThemeById(id)
    applyThemeToDOM(theme)
    persistThemeId(theme.id)

    // Notify Monaco editors so they can switch their theme
    window.dispatchEvent(
      new CustomEvent('orion:theme-changed', { detail: { monacoTheme: theme.monacoTheme, themeId: theme.id } })
    )

    set({ activeThemeId: theme.id })
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
