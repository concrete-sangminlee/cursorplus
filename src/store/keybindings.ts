import { create } from 'zustand'

export interface Keybinding {
  id: string
  label: string
  shortcut: string
  category: string
  when?: string
}

const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // File
  { id: 'save', label: 'Save File', shortcut: 'Ctrl+S', category: 'File' },
  { id: 'open-folder', label: 'Open Folder', shortcut: 'Ctrl+O', category: 'File' },
  { id: 'close-tab', label: 'Close Tab', shortcut: 'Ctrl+W', category: 'File' },
  { id: 'new-file', label: 'New File', shortcut: 'Ctrl+N', category: 'File' },

  // Navigation
  { id: 'quick-open', label: 'Quick Open', shortcut: 'Ctrl+P', category: 'Navigation' },
  { id: 'command-palette', label: 'Command Palette', shortcut: 'Ctrl+Shift+P', category: 'Navigation' },
  { id: 'go-to-line', label: 'Go to Line', shortcut: 'Ctrl+G', category: 'Navigation' },
  { id: 'go-to-symbol', label: 'Go to Symbol', shortcut: 'Ctrl+Shift+O', category: 'Navigation' },
  { id: 'switch-tab', label: 'Next Tab', shortcut: 'Ctrl+Tab', category: 'Navigation' },
  { id: 'prev-tab', label: 'Previous Tab', shortcut: 'Ctrl+Shift+Tab', category: 'Navigation' },

  // Editor
  { id: 'find', label: 'Find', shortcut: 'Ctrl+F', category: 'Editor' },
  { id: 'find-replace', label: 'Find and Replace', shortcut: 'Ctrl+H', category: 'Editor' },
  { id: 'toggle-comment', label: 'Toggle Line Comment', shortcut: 'Ctrl+/', category: 'Editor' },
  { id: 'block-comment', label: 'Toggle Block Comment', shortcut: 'Shift+Alt+A', category: 'Editor' },
  { id: 'move-line-up', label: 'Move Line Up', shortcut: 'Alt+Up', category: 'Editor' },
  { id: 'move-line-down', label: 'Move Line Down', shortcut: 'Alt+Down', category: 'Editor' },
  { id: 'copy-line-up', label: 'Copy Line Up', shortcut: 'Shift+Alt+Up', category: 'Editor' },
  { id: 'copy-line-down', label: 'Copy Line Down', shortcut: 'Shift+Alt+Down', category: 'Editor' },
  { id: 'delete-line', label: 'Delete Line', shortcut: 'Ctrl+Shift+K', category: 'Editor' },
  { id: 'select-next', label: 'Add Next Occurrence', shortcut: 'Ctrl+D', category: 'Editor' },
  { id: 'select-all-occurrences', label: 'Select All Occurrences', shortcut: 'Ctrl+Shift+L', category: 'Editor' },
  { id: 'add-cursor-above', label: 'Add Cursor Above', shortcut: 'Ctrl+Alt+Up', category: 'Editor' },
  { id: 'add-cursor-below', label: 'Add Cursor Below', shortcut: 'Ctrl+Alt+Down', category: 'Editor' },
  { id: 'fold', label: 'Fold', shortcut: 'Ctrl+Shift+[', category: 'Editor' },
  { id: 'unfold', label: 'Unfold', shortcut: 'Ctrl+Shift+]', category: 'Editor' },
  { id: 'inline-edit', label: 'Inline AI Edit', shortcut: 'Ctrl+K', category: 'Editor' },
  { id: 'format-document', label: 'Format Document', shortcut: 'Shift+Alt+F', category: 'Editor' },

  // View
  { id: 'toggle-sidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', category: 'View' },
  { id: 'toggle-terminal', label: 'Toggle Terminal', shortcut: 'Ctrl+`', category: 'View' },
  { id: 'toggle-bottom', label: 'Toggle Bottom Panel', shortcut: 'Ctrl+J', category: 'View' },
  { id: 'focus-chat', label: 'Focus Chat', shortcut: 'Ctrl+L', category: 'View' },
  { id: 'settings', label: 'Settings', shortcut: 'Ctrl+,', category: 'View' },
  { id: 'zen-mode', label: 'Zen Mode', shortcut: 'Ctrl+K Z', category: 'View' },
  { id: 'show-explorer', label: 'Show Explorer', shortcut: 'Ctrl+Shift+E', category: 'View' },
  { id: 'show-search', label: 'Show Search', shortcut: 'Ctrl+Shift+F', category: 'View' },
  { id: 'show-git', label: 'Show Source Control', shortcut: 'Ctrl+Shift+G', category: 'View' },
  { id: 'show-extensions', label: 'Show Extensions', shortcut: 'Ctrl+Shift+X', category: 'View' },

  // AI
  { id: 'ai-chat', label: 'AI Chat', shortcut: 'Ctrl+L', category: 'AI' },
  { id: 'ai-inline', label: 'Inline AI Edit', shortcut: 'Ctrl+K', category: 'AI' },
  { id: 'ai-explain', label: 'AI Explain Selection', shortcut: '', category: 'AI', when: 'editorHasSelection' },
  { id: 'ai-refactor', label: 'AI Refactor Selection', shortcut: '', category: 'AI', when: 'editorHasSelection' },
]

const STORAGE_KEY = 'orion-custom-keybindings'

function loadCustomBindings(): Record<string, string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // ignore parse errors
  }
  return {}
}

function saveCustomBindings(bindings: Record<string, string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
  } catch {
    // ignore storage errors
  }
}

interface KeybindingsStore {
  keybindings: Keybinding[]
  customBindings: Record<string, string>
  searchQuery: string
  setSearchQuery: (query: string) => void
  getByCategory: (category: string) => Keybinding[]
  getCategories: () => string[]
  setCustomBinding: (commandId: string, shortcut: string) => void
  resetBinding: (commandId: string) => void
  resetAllBindings: () => void
  getEffectiveBinding: (commandId: string) => string
  getDefaultBinding: (commandId: string) => string
  isCustomized: (commandId: string) => boolean
  findConflicts: (shortcut: string, excludeId: string) => Keybinding[]
}

export const useKeybindingsStore = create<KeybindingsStore>((set, get) => ({
  keybindings: DEFAULT_KEYBINDINGS,
  customBindings: loadCustomBindings(),
  searchQuery: '',
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  getByCategory: (category) => get().keybindings.filter((k) => k.category === category),
  getCategories: () => [...new Set(get().keybindings.map((k) => k.category))],

  setCustomBinding: (commandId: string, shortcut: string) => {
    const customBindings = { ...get().customBindings, [commandId]: shortcut }
    saveCustomBindings(customBindings)
    set({ customBindings })
  },

  resetBinding: (commandId: string) => {
    const customBindings = { ...get().customBindings }
    delete customBindings[commandId]
    saveCustomBindings(customBindings)
    set({ customBindings })
  },

  resetAllBindings: () => {
    saveCustomBindings({})
    set({ customBindings: {} })
  },

  getEffectiveBinding: (commandId: string) => {
    const { customBindings, keybindings } = get()
    if (commandId in customBindings) {
      return customBindings[commandId]
    }
    const binding = keybindings.find((k) => k.id === commandId)
    return binding?.shortcut ?? ''
  },

  getDefaultBinding: (commandId: string) => {
    const binding = get().keybindings.find((k) => k.id === commandId)
    return binding?.shortcut ?? ''
  },

  isCustomized: (commandId: string) => {
    return commandId in get().customBindings
  },

  findConflicts: (shortcut: string, excludeId: string) => {
    if (!shortcut) return []
    const { keybindings, customBindings } = get()
    const normalizedShortcut = shortcut.toLowerCase()
    return keybindings.filter((k) => {
      if (k.id === excludeId) return false
      const effective = k.id in customBindings ? customBindings[k.id] : k.shortcut
      return effective.toLowerCase() === normalizedShortcut
    })
  },
}))
