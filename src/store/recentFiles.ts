import { create } from 'zustand'

interface RecentFile {
  path: string
  name: string
  timestamp: number
}

interface RecentFilesStore {
  recentFiles: RecentFile[]
  addRecentFile: (path: string, name: string) => void
  clearRecent: () => void
  getRecent: (limit?: number) => RecentFile[]
}

export const useRecentFilesStore = create<RecentFilesStore>((set, get) => ({
  recentFiles: JSON.parse(localStorage.getItem('orion-recent-files') || '[]'),

  addRecentFile: (path, name) =>
    set((state) => {
      const filtered = state.recentFiles.filter((f) => f.path !== path)
      const updated = [{ path, name, timestamp: Date.now() }, ...filtered].slice(0, 30)
      localStorage.setItem('orion-recent-files', JSON.stringify(updated))
      return { recentFiles: updated }
    }),

  clearRecent: () => {
    localStorage.removeItem('orion-recent-files')
    set({ recentFiles: [] })
  },

  getRecent: (limit = 10) => get().recentFiles.slice(0, limit),
}))
