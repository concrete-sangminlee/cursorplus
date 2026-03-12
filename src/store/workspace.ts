import { create } from 'zustand'
import type { WorkspaceSettings } from '@shared/types'

const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  '.next',
  '__pycache__',
  '.DS_Store',
]

const DEFAULT_SEARCH_EXCLUDES = [
  'node_modules',
  '.git',
  'dist',
  '.next',
  '__pycache__',
  'dist-electron',
  '.venv',
]

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
  searchExcludes: DEFAULT_SEARCH_EXCLUDES,
  autoSave: true,
  formatOnSave: false,
  tabSize: 2,
  insertSpaces: true,
  fileAssociations: {},
}

const LOCAL_STORAGE_KEY = 'orion-workspace-settings'

function loadUserSettings(): Partial<WorkspaceSettings> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

function saveUserSettings(settings: WorkspaceSettings) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings))
  } catch {}
}

interface WorkspaceStore {
  settings: WorkspaceSettings
  /** Raw workspace-level overrides (only keys explicitly set in .orion/settings.json) */
  workspaceOverrides: Record<string, any>
  /** Whether current settings were loaded from a workspace .orion/settings.json */
  isWorkspaceLevel: boolean
  setSettings: (settings: WorkspaceSettings) => void
  updateSettings: (patch: Partial<WorkspaceSettings>) => void
  loadWorkspaceSettings: (rootPath: string) => Promise<void>
  saveWorkspaceSettings: (rootPath: string) => Promise<void>
  /** Merge a single key/value into the workspace .orion/settings.json and persist */
  saveWorkspaceSetting: (rootPath: string, key: string, value: any) => Promise<void>
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...loadUserSettings() },
  workspaceOverrides: {},
  isWorkspaceLevel: false,

  setSettings: (settings) => set({ settings }),

  updateSettings: (patch) =>
    set((state) => ({
      settings: { ...state.settings, ...patch },
    })),

  loadWorkspaceSettings: async (rootPath: string) => {
    try {
      const result = await window.api.workspaceReadSettings(rootPath)
      if (result.settings) {
        // Merge workspace settings on top of defaults
        const merged: WorkspaceSettings = {
          ...DEFAULT_WORKSPACE_SETTINGS,
          ...result.settings,
        }
        set({ settings: merged, workspaceOverrides: result.settings, isWorkspaceLevel: true })
      } else {
        // Fall back to user-level settings from localStorage
        const userSettings = loadUserSettings()
        set({
          settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...userSettings },
          workspaceOverrides: {},
          isWorkspaceLevel: false,
        })
      }
    } catch {
      const userSettings = loadUserSettings()
      set({
        settings: { ...DEFAULT_WORKSPACE_SETTINGS, ...userSettings },
        workspaceOverrides: {},
        isWorkspaceLevel: false,
      })
    }
  },

  saveWorkspaceSettings: async (rootPath: string) => {
    const { settings } = get()
    try {
      await window.api.workspaceWriteSettings(rootPath, settings)
      set({ isWorkspaceLevel: true })
    } catch (err) {
      console.error('Failed to save workspace settings:', err)
    }
    // Also persist to localStorage as user-level fallback
    saveUserSettings(settings)
  },

  saveWorkspaceSetting: async (rootPath: string, key: string, value: any) => {
    const { workspaceOverrides, settings } = get()
    const newOverrides = { ...workspaceOverrides, [key]: value }
    const newSettings = { ...settings, [key]: value } as WorkspaceSettings
    try {
      await window.api.workspaceWriteSettings(rootPath, newOverrides)
      set({ settings: newSettings, workspaceOverrides: newOverrides, isWorkspaceLevel: true })
    } catch (err) {
      console.error('Failed to save workspace setting:', err)
    }
  },
}))
