import { create } from 'zustand'
import type { AppSettings, ModelConfig } from '@shared/types'
import { DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY } from '@shared/constants'
import { useWorkspaceStore } from './workspace'

interface SettingsStore {
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  addModel: (model: ModelConfig) => void
  removeModel: (modelId: string) => void
  setActiveModel: (modelId: string) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: {
    theme: 'dark',
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    models: [],
    activeModelId: '',
    agentModelMapping: {},
  },

  setSettings: (settings) => set({ settings }),

  addModel: (model) =>
    set((state) => ({
      settings: { ...state.settings, models: [...state.settings.models, model] },
    })),

  removeModel: (modelId) =>
    set((state) => ({
      settings: {
        ...state.settings,
        models: state.settings.models.filter((m) => m.modelId !== modelId),
      },
    })),

  setActiveModel: (modelId) =>
    set((state) => ({
      settings: { ...state.settings, activeModelId: modelId },
    })),
}))

/**
 * Get the effective value for a setting key.
 * Workspace-level overrides (from .orion/settings.json) take priority over
 * global app settings. Falls back to the global setting value if no workspace
 * override exists for the given key.
 */
export function getEffectiveSetting(key: string): any {
  const { workspaceOverrides } = useWorkspaceStore.getState()
  if (key in workspaceOverrides) {
    return workspaceOverrides[key]
  }
  const appSettings = useSettingsStore.getState().settings as Record<string, any>
  return appSettings[key]
}
