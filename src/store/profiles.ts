import { create } from 'zustand'
import { useThemeStore } from './theme'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Profile {
  id: string
  name: string
  icon: string            // emoji or icon name
  settings: Record<string, any>  // snapshot of settings from localStorage
  theme: string           // theme ID
  createdAt: string
  isDefault: boolean
}

interface ProfileStore {
  profiles: Profile[]
  activeProfileId: string
  createProfile: (name: string, icon: string) => Profile
  switchProfile: (id: string) => void
  updateProfile: (id: string) => void
  deleteProfile: (id: string) => boolean
  renameProfile: (id: string, name: string) => void
  exportProfile: (id: string) => string | null
  importProfile: (json: string) => Profile | null
  _load: () => void
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'orion-profiles'
const ACTIVE_KEY = 'orion-active-profile'

function generateId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/** Capture the current settings from localStorage into a snapshot. */
function snapshotSettings(): Record<string, any> {
  const keys = [
    'orion-editor-settings',
    'orion-terminal-settings',
    'orion-prompts',
  ]
  const snapshot: Record<string, any> = {}
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) snapshot[key] = JSON.parse(raw)
    } catch { /* skip */ }
  }
  return snapshot
}

/** Apply a settings snapshot back to localStorage and dispatch update events. */
function applySettings(settings: Record<string, any>) {
  const settingsKeys = [
    'orion-editor-settings',
    'orion-terminal-settings',
    'orion-prompts',
  ]
  for (const key of settingsKeys) {
    if (settings[key] !== undefined) {
      localStorage.setItem(key, JSON.stringify(settings[key]))
    }
  }
  // Dispatch events so editor/terminal pick up changes
  if (settings['orion-editor-settings']) {
    window.dispatchEvent(new CustomEvent('orion:editor-config', { detail: settings['orion-editor-settings'] }))
  }
  if (settings['orion-terminal-settings']) {
    window.dispatchEvent(new CustomEvent('orion:terminal-config', { detail: settings['orion-terminal-settings'] }))
  }
}

function persist(profiles: Profile[], activeId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles))
    localStorage.setItem(ACTIVE_KEY, activeId)
  } catch { /* storage full, etc. */ }
}

function loadProfiles(): { profiles: Profile[]; activeProfileId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const activeId = localStorage.getItem(ACTIVE_KEY)
    if (raw) {
      const profiles: Profile[] = JSON.parse(raw)
      return {
        profiles,
        activeProfileId: activeId || profiles.find(p => p.isDefault)?.id || profiles[0]?.id || '',
      }
    }
  } catch { /* ignore */ }

  // First run: create a default profile
  const defaultProfile: Profile = {
    id: generateId(),
    name: 'Default',
    icon: '\u2699\uFE0F',
    settings: snapshotSettings(),
    theme: useThemeStore.getState().activeThemeId,
    createdAt: new Date().toISOString(),
    isDefault: true,
  }
  persist([defaultProfile], defaultProfile.id)
  return { profiles: [defaultProfile], activeProfileId: defaultProfile.id }
}

/* ------------------------------------------------------------------ */
/*  Store                                                              */
/* ------------------------------------------------------------------ */

export const useProfileStore = create<ProfileStore>((set, get) => {
  const initial = loadProfiles()

  return {
    ...initial,

    /** Reload from localStorage (useful when SettingsModal opens). */
    _load: () => {
      const data = loadProfiles()
      set(data)
    },

    createProfile: (name, icon) => {
      const profile: Profile = {
        id: generateId(),
        name,
        icon,
        settings: snapshotSettings(),
        theme: useThemeStore.getState().activeThemeId,
        createdAt: new Date().toISOString(),
        isDefault: false,
      }
      const profiles = [...get().profiles, profile]
      persist(profiles, get().activeProfileId)
      set({ profiles })
      return profile
    },

    switchProfile: (id) => {
      const profile = get().profiles.find(p => p.id === id)
      if (!profile) return
      // Apply settings snapshot
      applySettings(profile.settings)
      // Switch theme
      useThemeStore.getState().setTheme(profile.theme)
      persist(get().profiles, id)
      set({ activeProfileId: id })
    },

    updateProfile: (id) => {
      const profiles = get().profiles.map(p =>
        p.id === id
          ? { ...p, settings: snapshotSettings(), theme: useThemeStore.getState().activeThemeId }
          : p
      )
      persist(profiles, get().activeProfileId)
      set({ profiles })
    },

    deleteProfile: (id) => {
      const profile = get().profiles.find(p => p.id === id)
      if (!profile || profile.isDefault) return false
      const profiles = get().profiles.filter(p => p.id !== id)
      const activeProfileId = get().activeProfileId === id
        ? (profiles.find(p => p.isDefault)?.id || profiles[0]?.id || '')
        : get().activeProfileId
      persist(profiles, activeProfileId)
      set({ profiles, activeProfileId })
      return true
    },

    renameProfile: (id, name) => {
      const profiles = get().profiles.map(p =>
        p.id === id ? { ...p, name } : p
      )
      persist(profiles, get().activeProfileId)
      set({ profiles })
    },

    exportProfile: (id) => {
      const profile = get().profiles.find(p => p.id === id)
      if (!profile) return null
      const exportData = {
        name: profile.name,
        icon: profile.icon,
        settings: profile.settings,
        theme: profile.theme,
        exportedAt: new Date().toISOString(),
      }
      return JSON.stringify(exportData, null, 2)
    },

    importProfile: (json) => {
      try {
        const data = JSON.parse(json)
        if (!data.name || !data.settings) return null
        const profile: Profile = {
          id: generateId(),
          name: data.name + ' (imported)',
          icon: data.icon || '\u{1F4E6}',
          settings: data.settings,
          theme: data.theme || 'github-dark',
          createdAt: new Date().toISOString(),
          isDefault: false,
        }
        const profiles = [...get().profiles, profile]
        persist(profiles, get().activeProfileId)
        set({ profiles })
        return profile
      } catch {
        return null
      }
    },
  }
})
