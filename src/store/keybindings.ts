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
  { id: 'ai-fix', label: 'AI Fix Bug', shortcut: '', category: 'AI', when: 'editorHasSelection' },
  { id: 'ai-test', label: 'AI Generate Tests', shortcut: '', category: 'AI', when: 'editorFocus' },
  { id: 'ai-doc', label: 'AI Generate Documentation', shortcut: '', category: 'AI', when: 'editorFocus' },
  { id: 'ai-accept-ghost', label: 'Accept AI Suggestion', shortcut: 'Tab', category: 'AI', when: 'suggestWidgetVisible' },
  { id: 'ai-dismiss-ghost', label: 'Dismiss AI Suggestion', shortcut: 'Escape', category: 'AI', when: 'suggestWidgetVisible' },
  { id: 'ai-accept-word', label: 'Accept Next Word', shortcut: 'Ctrl+Right', category: 'AI', when: 'suggestWidgetVisible' },

  // Editor — additional
  { id: 'select-line', label: 'Select Line', shortcut: 'Ctrl+L', category: 'Editor', when: 'editorFocus' },
  { id: 'join-lines', label: 'Join Lines', shortcut: 'Ctrl+J', category: 'Editor', when: 'editorFocus' },
  { id: 'indent-line', label: 'Indent Line', shortcut: 'Ctrl+]', category: 'Editor', when: 'editorFocus' },
  { id: 'outdent-line', label: 'Outdent Line', shortcut: 'Ctrl+[', category: 'Editor', when: 'editorFocus' },
  { id: 'uppercase', label: 'Transform to Uppercase', shortcut: '', category: 'Editor', when: 'editorHasSelection' },
  { id: 'lowercase', label: 'Transform to Lowercase', shortcut: '', category: 'Editor', when: 'editorHasSelection' },
  { id: 'title-case', label: 'Transform to Title Case', shortcut: '', category: 'Editor', when: 'editorHasSelection' },
  { id: 'sort-lines-asc', label: 'Sort Lines Ascending', shortcut: '', category: 'Editor', when: 'editorHasSelection' },
  { id: 'sort-lines-desc', label: 'Sort Lines Descending', shortcut: '', category: 'Editor', when: 'editorHasSelection' },
  { id: 'trim-whitespace', label: 'Trim Trailing Whitespace', shortcut: '', category: 'Editor' },
  { id: 'toggle-word-wrap', label: 'Toggle Word Wrap', shortcut: 'Alt+Z', category: 'Editor' },
  { id: 'fold-all', label: 'Fold All', shortcut: 'Ctrl+K Ctrl+0', category: 'Editor' },
  { id: 'unfold-all', label: 'Unfold All', shortcut: 'Ctrl+K Ctrl+J', category: 'Editor' },
  { id: 'fold-level-1', label: 'Fold Level 1', shortcut: 'Ctrl+K Ctrl+1', category: 'Editor' },
  { id: 'fold-level-2', label: 'Fold Level 2', shortcut: 'Ctrl+K Ctrl+2', category: 'Editor' },
  { id: 'fold-level-3', label: 'Fold Level 3', shortcut: 'Ctrl+K Ctrl+3', category: 'Editor' },
  { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', category: 'Editor' },
  { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Y', category: 'Editor' },
  { id: 'cut', label: 'Cut', shortcut: 'Ctrl+X', category: 'Editor' },
  { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', category: 'Editor' },
  { id: 'paste', label: 'Paste', shortcut: 'Ctrl+V', category: 'Editor' },
  { id: 'select-all', label: 'Select All', shortcut: 'Ctrl+A', category: 'Editor' },
  { id: 'duplicate-selection', label: 'Duplicate Selection', shortcut: '', category: 'Editor' },
  { id: 'expand-selection', label: 'Expand Selection', shortcut: 'Shift+Alt+Right', category: 'Editor' },
  { id: 'shrink-selection', label: 'Shrink Selection', shortcut: 'Shift+Alt+Left', category: 'Editor' },
  { id: 'rename-symbol', label: 'Rename Symbol', shortcut: 'F2', category: 'Editor' },
  { id: 'peek-definition', label: 'Peek Definition', shortcut: 'Alt+F12', category: 'Editor' },
  { id: 'go-to-definition', label: 'Go to Definition', shortcut: 'F12', category: 'Editor' },
  { id: 'go-to-references', label: 'Go to References', shortcut: 'Shift+F12', category: 'Editor' },
  { id: 'quick-fix', label: 'Quick Fix', shortcut: 'Ctrl+.', category: 'Editor' },
  { id: 'trigger-suggest', label: 'Trigger Suggest', shortcut: 'Ctrl+Space', category: 'Editor' },
  { id: 'trigger-param-hints', label: 'Trigger Parameter Hints', shortcut: 'Ctrl+Shift+Space', category: 'Editor' },

  // Navigation — additional
  { id: 'go-to-definition-nav', label: 'Go to Definition', shortcut: 'F12', category: 'Navigation' },
  { id: 'go-back', label: 'Go Back', shortcut: 'Alt+Left', category: 'Navigation' },
  { id: 'go-forward', label: 'Go Forward', shortcut: 'Alt+Right', category: 'Navigation' },
  { id: 'next-error', label: 'Next Error', shortcut: 'F8', category: 'Navigation' },
  { id: 'prev-error', label: 'Previous Error', shortcut: 'Shift+F8', category: 'Navigation' },
  { id: 'next-change', label: 'Next Change', shortcut: 'Alt+F5', category: 'Navigation' },
  { id: 'prev-change', label: 'Previous Change', shortcut: 'Shift+Alt+F5', category: 'Navigation' },
  { id: 'go-to-bracket', label: 'Go to Bracket', shortcut: 'Ctrl+Shift+\\', category: 'Navigation' },

  // Terminal — additional
  { id: 'new-terminal', label: 'New Terminal', shortcut: 'Ctrl+Shift+`', category: 'Terminal' },
  { id: 'split-terminal', label: 'Split Terminal', shortcut: '', category: 'Terminal' },
  { id: 'kill-terminal', label: 'Kill Terminal', shortcut: '', category: 'Terminal' },
  { id: 'clear-terminal', label: 'Clear Terminal', shortcut: '', category: 'Terminal' },
  { id: 'terminal-scroll-up', label: 'Terminal Scroll Up', shortcut: 'Ctrl+Shift+Up', category: 'Terminal', when: 'terminalFocus' },
  { id: 'terminal-scroll-down', label: 'Terminal Scroll Down', shortcut: 'Ctrl+Shift+Down', category: 'Terminal', when: 'terminalFocus' },
  { id: 'copy-terminal', label: 'Copy in Terminal', shortcut: 'Ctrl+Shift+C', category: 'Terminal', when: 'terminalFocus' },
  { id: 'paste-terminal', label: 'Paste in Terminal', shortcut: 'Ctrl+Shift+V', category: 'Terminal', when: 'terminalFocus' },

  // View — additional
  { id: 'show-debug', label: 'Show Debug', shortcut: 'Ctrl+Shift+D', category: 'View' },
  { id: 'toggle-minimap', label: 'Toggle Minimap', shortcut: '', category: 'View' },
  { id: 'toggle-breadcrumbs', label: 'Toggle Breadcrumbs', shortcut: '', category: 'View' },
  { id: 'toggle-activity-bar', label: 'Toggle Activity Bar', shortcut: '', category: 'View' },
  { id: 'toggle-status-bar', label: 'Toggle Status Bar', shortcut: '', category: 'View' },
  { id: 'focus-editor', label: 'Focus Editor', shortcut: 'Ctrl+1', category: 'View' },
  { id: 'focus-sidebar', label: 'Focus Sidebar', shortcut: 'Ctrl+0', category: 'View' },
  { id: 'focus-terminal', label: 'Focus Terminal', shortcut: '', category: 'View', when: 'terminalVisible' },
  { id: 'split-editor', label: 'Split Editor', shortcut: 'Ctrl+\\', category: 'View' },
  { id: 'close-editor-group', label: 'Close Editor Group', shortcut: 'Ctrl+K W', category: 'View' },
  { id: 'zoom-in', label: 'Zoom In', shortcut: 'Ctrl+=', category: 'View' },
  { id: 'zoom-out', label: 'Zoom Out', shortcut: 'Ctrl+-', category: 'View' },
  { id: 'reset-zoom', label: 'Reset Zoom', shortcut: 'Ctrl+0', category: 'View' },
  { id: 'fullscreen', label: 'Toggle Full Screen', shortcut: 'F11', category: 'View' },

  // Debug
  { id: 'start-debugging', label: 'Start Debugging', shortcut: 'F5', category: 'Debug' },
  { id: 'stop-debugging', label: 'Stop Debugging', shortcut: 'Shift+F5', category: 'Debug' },
  { id: 'restart-debugging', label: 'Restart Debugging', shortcut: 'Ctrl+Shift+F5', category: 'Debug' },
  { id: 'step-over', label: 'Step Over', shortcut: 'F10', category: 'Debug' },
  { id: 'step-into', label: 'Step Into', shortcut: 'F11', category: 'Debug' },
  { id: 'step-out', label: 'Step Out', shortcut: 'Shift+F11', category: 'Debug' },
  { id: 'toggle-breakpoint', label: 'Toggle Breakpoint', shortcut: 'F9', category: 'Debug' },
  { id: 'continue', label: 'Continue', shortcut: 'F5', category: 'Debug', when: 'debugActive' },
  { id: 'debug-console', label: 'Debug Console', shortcut: 'Ctrl+Shift+Y', category: 'Debug' },

  // Git
  { id: 'git-commit', label: 'Git: Commit', shortcut: '', category: 'Git' },
  { id: 'git-push', label: 'Git: Push', shortcut: '', category: 'Git' },
  { id: 'git-pull', label: 'Git: Pull', shortcut: '', category: 'Git' },
  { id: 'git-fetch', label: 'Git: Fetch', shortcut: '', category: 'Git' },
  { id: 'git-stage-all', label: 'Git: Stage All', shortcut: '', category: 'Git' },
  { id: 'git-unstage-all', label: 'Git: Unstage All', shortcut: '', category: 'Git' },
  { id: 'git-stash', label: 'Git: Stash', shortcut: '', category: 'Git' },
  { id: 'git-blame', label: 'Git: Toggle Blame', shortcut: '', category: 'Git' },

  // File — additional
  { id: 'save-as', label: 'Save As', shortcut: 'Ctrl+Shift+S', category: 'File' },
  { id: 'save-all', label: 'Save All', shortcut: '', category: 'File' },
  { id: 'close-all-tabs', label: 'Close All Tabs', shortcut: 'Ctrl+K Ctrl+W', category: 'File' },
  { id: 'close-others', label: 'Close Other Tabs', shortcut: '', category: 'File' },
  { id: 'revert-file', label: 'Revert File', shortcut: '', category: 'File' },
  { id: 'open-recent', label: 'Open Recent', shortcut: 'Ctrl+R', category: 'File' },
  { id: 'open-settings-json', label: 'Open Settings (JSON)', shortcut: '', category: 'File' },
  { id: 'open-keybindings-json', label: 'Open Keybindings (JSON)', shortcut: '', category: 'File' },

  // Search
  { id: 'find-in-files', label: 'Find in Files', shortcut: 'Ctrl+Shift+F', category: 'Search' },
  { id: 'replace-in-files', label: 'Replace in Files', shortcut: 'Ctrl+Shift+H', category: 'Search' },
  { id: 'find-next', label: 'Find Next', shortcut: 'F3', category: 'Search' },
  { id: 'find-previous', label: 'Find Previous', shortcut: 'Shift+F3', category: 'Search' },
  { id: 'next-search-result', label: 'Next Search Result', shortcut: 'F4', category: 'Search' },
  { id: 'prev-search-result', label: 'Previous Search Result', shortcut: 'Shift+F4', category: 'Search' },
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
  exportBindings: () => string
  importBindings: (json: string) => boolean
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

  exportBindings: () => {
    const { customBindings } = get()
    return JSON.stringify(customBindings, null, 2)
  },

  importBindings: (json: string) => {
    try {
      const bindings = JSON.parse(json)
      if (typeof bindings !== 'object' || bindings === null) return false
      saveCustomBindings(bindings)
      set({ customBindings: bindings })
      return true
    } catch {
      return false
    }
  },
}))
