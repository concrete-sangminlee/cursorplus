import { create } from 'zustand'
import type { OpenFile } from '@shared/types'
import { useRecentFilesStore } from './recentFiles'

interface EditorStore {
  openFiles: OpenFile[]
  activeFilePath: string | null
  previewPath: string | null
  pinnedTabs: string[]
  openFile: (file: OpenFile, options?: { preview?: boolean }) => void
  closeFile: (path: string) => void
  closeAllFiles: () => void
  closeOtherFiles: (path: string) => void
  closeToRight: (path: string) => void
  closeSaved: () => void
  setActiveFile: (path: string) => void
  switchToNextTab: () => void
  switchToPrevTab: () => void
  updateFileContent: (path: string, content: string) => void
  markAiModified: (path: string) => void
  markSaved: (path: string) => void
  reorderFiles: (fromIndex: number, toIndex: number) => void
  pinFile: (path: string) => void
  pinTab: (path: string) => void
  unpinTab: (path: string) => void
  isTabPinned: (path: string) => boolean
  // External file change handling
  reloadFileContent: (path: string, content: string) => void
  markExternalChange: (path: string) => void
  dismissExternalChange: (path: string) => void
  markDeletedOnDisk: (path: string) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  openFiles: [],
  activeFilePath: null,
  previewPath: null,
  pinnedTabs: [],

  openFile: (file, options) => {
    // Track in recent files
    setTimeout(() => {
      useRecentFilesStore.getState().addRecentFile(file.path, file.name)
    }, 0)

    return set((state) => {
      const isPreview = options?.preview ?? false

      // If the file is already open
      const exists = state.openFiles.find((f) => f.path === file.path)
      if (exists) {
        // If opening as pinned (double-click) and currently a preview, pin it
        if (!isPreview && !exists.isPinned) {
          return {
            openFiles: state.openFiles.map((f) =>
              f.path === file.path ? { ...f, isPinned: true } : f
            ),
            activeFilePath: file.path,
            previewPath: state.previewPath === file.path ? null : state.previewPath,
          }
        }
        return { activeFilePath: file.path }
      }

      // Opening a new file
      if (isPreview) {
        // Replace existing preview tab if any
        const currentPreview = state.previewPath
        if (currentPreview) {
          const filtered = state.openFiles.filter((f) => f.path !== currentPreview)
          return {
            openFiles: [...filtered, { ...file, isPinned: false }],
            activeFilePath: file.path,
            previewPath: file.path,
          }
        }
        // No existing preview, just add as preview
        return {
          openFiles: [...state.openFiles, { ...file, isPinned: false }],
          activeFilePath: file.path,
          previewPath: file.path,
        }
      }

      // Opening as pinned (double-click, command palette, search, etc.)
      return {
        openFiles: [...state.openFiles, { ...file, isPinned: true }],
        activeFilePath: file.path,
        // If this file was somehow the preview, clear that
        previewPath: state.previewPath === file.path ? null : state.previewPath,
      }
    })
  },

  closeFile: (path) =>
    set((state) => {
      // Pinned tabs cannot be closed without unpinning first
      if (state.pinnedTabs.includes(path)) return state
      const files = state.openFiles.filter((f) => f.path !== path)
      const activePath =
        state.activeFilePath === path
          ? files[files.length - 1]?.path ?? null
          : state.activeFilePath
      return {
        openFiles: files,
        activeFilePath: activePath,
        previewPath: state.previewPath === path ? null : state.previewPath,
      }
    }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, isModified: true, isPinned: true } : f
      ),
      // Editing a file pins it
      previewPath: state.previewPath === path ? null : state.previewPath,
    })),

  markAiModified: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, aiModified: true, isPinned: true } : f
      ),
      previewPath: state.previewPath === path ? null : state.previewPath,
    })),

  markSaved: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, isModified: false } : f
      ),
    })),

  closeAllFiles: () =>
    set((state) => {
      const pinnedFiles = state.openFiles.filter((f) => state.pinnedTabs.includes(f.path))
      if (pinnedFiles.length === 0) {
        return { openFiles: [], activeFilePath: null, previewPath: null }
      }
      const activePath = pinnedFiles.find((f) => f.path === state.activeFilePath)
        ? state.activeFilePath
        : pinnedFiles[0]?.path ?? null
      return {
        openFiles: pinnedFiles,
        activeFilePath: activePath,
        previewPath: state.previewPath && pinnedFiles.find((f) => f.path === state.previewPath)
          ? state.previewPath
          : null,
      }
    }),

  closeOtherFiles: (path) =>
    set((state) => ({
      openFiles: state.openFiles.filter((f) => f.path === path || state.pinnedTabs.includes(f.path)),
      activeFilePath: path,
      previewPath: state.previewPath === path ? state.previewPath : null,
    })),

  closeToRight: (path) =>
    set((state) => {
      const idx = state.openFiles.findIndex((f) => f.path === path)
      if (idx === -1) return state
      // Keep tabs to the left (including target), plus any pinned tabs to the right
      const files = state.openFiles.filter((f, i) =>
        i <= idx || state.pinnedTabs.includes(f.path)
      )
      const activePath =
        state.activeFilePath && files.find((f) => f.path === state.activeFilePath)
          ? state.activeFilePath
          : path
      return {
        openFiles: files,
        activeFilePath: activePath,
        previewPath:
          state.previewPath && files.find((f) => f.path === state.previewPath)
            ? state.previewPath
            : null,
      }
    }),

  closeSaved: () =>
    set((state) => {
      const files = state.openFiles.filter((f) => f.isModified || state.pinnedTabs.includes(f.path))
      const activePath =
        state.activeFilePath && files.find((f) => f.path === state.activeFilePath)
          ? state.activeFilePath
          : files[files.length - 1]?.path ?? null
      return {
        openFiles: files,
        activeFilePath: activePath,
        previewPath:
          state.previewPath && files.find((f) => f.path === state.previewPath)
            ? state.previewPath
            : null,
      }
    }),

  switchToNextTab: () =>
    set((state) => {
      if (state.openFiles.length <= 1) return state
      const idx = state.openFiles.findIndex((f) => f.path === state.activeFilePath)
      const nextIdx = (idx + 1) % state.openFiles.length
      return { activeFilePath: state.openFiles[nextIdx].path }
    }),

  switchToPrevTab: () =>
    set((state) => {
      if (state.openFiles.length <= 1) return state
      const idx = state.openFiles.findIndex((f) => f.path === state.activeFilePath)
      const prevIdx = (idx - 1 + state.openFiles.length) % state.openFiles.length
      return { activeFilePath: state.openFiles[prevIdx].path }
    }),

  reorderFiles: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.openFiles.length ||
        toIndex >= state.openFiles.length ||
        fromIndex === toIndex
      ) {
        return state
      }
      const pinnedCount = state.openFiles.filter((f) => state.pinnedTabs.includes(f.path)).length
      const movedFile = state.openFiles[fromIndex]
      const isMovedPinned = state.pinnedTabs.includes(movedFile.path)
      // Pinned tabs cannot be moved past the pinned zone boundary
      if (isMovedPinned && toIndex >= pinnedCount) return state
      // Unpinned tabs cannot be moved into the pinned zone
      if (!isMovedPinned && toIndex < pinnedCount) return state
      const files = [...state.openFiles]
      const [moved] = files.splice(fromIndex, 1)
      files.splice(toIndex, 0, moved)
      return { openFiles: files }
    }),

  pinFile: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, isPinned: true } : f
      ),
      previewPath: state.previewPath === path ? null : state.previewPath,
    })),

  pinTab: (path) =>
    set((state) => {
      if (state.pinnedTabs.includes(path)) return state
      // Also ensure the file is "permanent" (not preview)
      const newPinnedTabs = [...state.pinnedTabs, path]
      // Move the pinned tab to end of pinned zone
      const pinnedCount = state.pinnedTabs.length // count before adding
      const fileIndex = state.openFiles.findIndex((f) => f.path === path)
      if (fileIndex === -1) return state
      const files = [...state.openFiles]
      if (fileIndex > pinnedCount) {
        const [moved] = files.splice(fileIndex, 1)
        files.splice(pinnedCount, 0, moved)
      }
      return {
        openFiles: files.map((f) =>
          f.path === path ? { ...f, isPinned: true } : f
        ),
        pinnedTabs: newPinnedTabs,
        previewPath: state.previewPath === path ? null : state.previewPath,
      }
    }),

  unpinTab: (path) =>
    set((state) => {
      if (!state.pinnedTabs.includes(path)) return state
      const newPinnedTabs = state.pinnedTabs.filter((p) => p !== path)
      // Move the unpinned tab to just after the remaining pinned zone
      const fileIndex = state.openFiles.findIndex((f) => f.path === path)
      if (fileIndex === -1) return state
      const files = [...state.openFiles]
      const newPinnedCount = newPinnedTabs.length
      if (fileIndex < newPinnedCount) {
        // Already in correct zone or before it
        const [moved] = files.splice(fileIndex, 1)
        files.splice(newPinnedCount, 0, moved)
      }
      return {
        openFiles: files,
        pinnedTabs: newPinnedTabs,
      }
    }),

  isTabPinned: (path) => {
    return useEditorStore.getState().pinnedTabs.includes(path)
  },

  // Silently reload file content (used when file has no unsaved changes)
  reloadFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path
          ? { ...f, content, isModified: false, hasExternalChange: false, isDeletedOnDisk: false }
          : f
      ),
    })),

  // Flag that a file has changed externally (used when file has unsaved changes)
  markExternalChange: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, hasExternalChange: true } : f
      ),
    })),

  // Dismiss the external change flag (user chose "Keep Mine")
  dismissExternalChange: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, hasExternalChange: false } : f
      ),
    })),

  // Mark a file as deleted on disk
  markDeletedOnDisk: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, isDeletedOnDisk: true, hasExternalChange: false } : f
      ),
    })),
}))
