import { create } from 'zustand'
import type { OpenFile } from '@shared/types'

interface EditorStore {
  openFiles: OpenFile[]
  activeFilePath: string | null
  previewPath: string | null
  openFile: (file: OpenFile, options?: { preview?: boolean }) => void
  closeFile: (path: string) => void
  closeAllFiles: () => void
  setActiveFile: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  markAiModified: (path: string) => void
  markSaved: (path: string) => void
  reorderFiles: (fromIndex: number, toIndex: number) => void
  pinFile: (path: string) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  openFiles: [],
  activeFilePath: null,
  previewPath: null,

  openFile: (file, options) =>
    set((state) => {
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
    }),

  closeFile: (path) =>
    set((state) => {
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

  closeAllFiles: () => set({ openFiles: [], activeFilePath: null, previewPath: null }),

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
}))
