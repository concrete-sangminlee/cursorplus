import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, FileText, Settings, Terminal, FolderOpen, MessageSquare, Zap, ChevronRight, Columns, Eye, EyeOff, Type, Minus, Plus, GitBranch, Paintbrush, WrapText, Map, PanelLeft, PanelBottom, X, Save, RotateCcw, RotateCw, Scissors, Copy, Clipboard, Keyboard, MousePointer, CaseSensitive, ArrowUpDown, ArrowDownUp, Merge, MessageSquareCode, Braces, ChevronsDownUp, ChevronsUpDown, Palette, Code, Rows2, Link2, GitCompare, Hash, Eraser, Bug, Maximize2, Clock, ArrowLeftRight } from 'lucide-react'
import { useEditorStore } from '@/store/editor'
import { useFileStore } from '@/store/files'
import { useThemeStore } from '@/store/theme'
import { useRecentFilesStore } from '@/store/recentFiles'
import FileIcon from '@/components/FileIcon'

interface PaletteItem {
  id: string
  label: string
  category: 'file' | 'command' | 'setting' | 'symbol' | 'goto-line'
  icon: React.ReactNode
  shortcut?: string
  action: () => void
  description?: string
  badge?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onOpenSettings: () => void
}

function flattenFiles(nodes: any[], prefix = ''): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = []
  for (const node of nodes) {
    if (node.type === 'file') {
      result.push({ name: node.name, path: node.path })
    } else if (node.children) {
      result.push(...flattenFiles(node.children, node.path))
    }
  }
  return result
}

function getParentDir(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts.slice(-3, -1).join('/')
}

// Symbol extraction regex patterns
const SYMBOL_PATTERNS = [
  // TypeScript/JavaScript: function declarations, arrow functions assigned to const/let/var
  { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' },
  { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*=>/gm, kind: 'function' },
  // Classes
  { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: 'class' },
  // Interfaces and types
  { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
  { regex: /^(?:export\s+)?type\s+(\w+)\s*[=<]/gm, kind: 'type' },
  // Enums
  { regex: /^(?:export\s+)?enum\s+(\w+)/gm, kind: 'enum' },
  // Python: def, class
  { regex: /^(?:async\s+)?def\s+(\w+)/gm, kind: 'function' },
  // Rust: fn, struct, enum, trait
  { regex: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm, kind: 'function' },
  { regex: /^(?:pub\s+)?struct\s+(\w+)/gm, kind: 'class' },
  { regex: /^(?:pub\s+)?trait\s+(\w+)/gm, kind: 'interface' },
  // Go: func
  { regex: /^func\s+(?:\([^)]*\)\s+)?(\w+)/gm, kind: 'function' },
]

interface SymbolResult {
  name: string
  kind: string
  fileName: string
  filePath: string
  lineNumber: number
}

function extractSymbols(content: string, fileName: string, filePath: string): SymbolResult[] {
  const results: SymbolResult[] = []

  for (const pattern of SYMBOL_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)
    let match
    while ((match = regex.exec(content)) !== null) {
      const symbolName = match[1]
      const beforeMatch = content.slice(0, match.index)
      const lineNumber = beforeMatch.split('\n').length
      if (!results.some(r => r.name === symbolName && r.lineNumber === lineNumber)) {
        results.push({
          name: symbolName,
          kind: pattern.kind,
          fileName,
          filePath,
          lineNumber,
        })
      }
    }
  }

  return results
}

export default function CommandPalette({ open, onClose, onOpenSettings }: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [themeMode, setThemeMode] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { openFile, openFiles, activeFilePath } = useEditorStore()
  const { fileTree } = useFileStore()
  const { themes: allThemes, setTheme, activeThemeId, previewTheme } = useThemeStore()
  const { recentFiles } = useRecentFilesStore()

  // Determine mode based on prefix
  const isSymbolMode = !themeMode && query.startsWith('#')
  const isGotoLineMode = !themeMode && query.startsWith(':')
  const isCommandMode = !themeMode && !isSymbolMode && !isGotoLineMode && query.startsWith('>')
  const isFileMode = !themeMode && !isSymbolMode && !isGotoLineMode && !isCommandMode

  const searchQuery = themeMode
    ? query.trim()
    : isCommandMode ? query.slice(1).trim()
    : isSymbolMode ? query.slice(1).trim()
    : isGotoLineMode ? query.slice(1).trim()
    : query.trim()

  const dispatch = (event: string, detail?: any) => window.dispatchEvent(new CustomEvent(event, { detail }))

  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python',
    rs: 'rust', go: 'go', java: 'java', yml: 'yaml', yaml: 'yaml',
    scss: 'scss', less: 'less', vue: 'vue', sh: 'shell', bash: 'shell',
    toml: 'toml', xml: 'xml', svg: 'xml', sql: 'sql', graphql: 'graphql',
  }

  const openFileAction = (f: { path: string; name: string }) => {
    window.api?.readFile(f.path).then((result: any) => {
      const content = typeof result === 'string' ? result : result?.content || ''
      const ext = f.name.split('.').pop() || ''
      openFile({
        path: f.path, name: f.name, content,
        language: result?.language || langMap[ext] || ext,
        isModified: false, aiModified: false,
      })
    })
    onClose()
  }

  const commands: PaletteItem[] = useMemo(() => [
    // File
    { id: 'save', label: 'File: Save', category: 'command', icon: <Save size={14} />, shortcut: 'Ctrl+S', action: () => { dispatch('orion:save-file'); onClose() } },
    { id: 'folder', label: 'File: Open Folder', category: 'command', icon: <FolderOpen size={14} />, shortcut: 'Ctrl+O', action: () => { window.api?.openFolder(); onClose() } },
    { id: 'close-tab', label: 'File: Close Editor', category: 'command', icon: <X size={14} />, shortcut: 'Ctrl+W', action: () => { dispatch('orion:close-tab'); onClose() } },
    { id: 'close-all', label: 'File: Close All Editors', category: 'command', icon: <X size={14} />, action: () => { dispatch('orion:close-all-tabs'); onClose() } },
    // Edit
    { id: 'undo', label: 'Edit: Undo', category: 'command', icon: <RotateCcw size={14} />, shortcut: 'Ctrl+Z', action: () => { document.execCommand('undo'); onClose() } },
    { id: 'redo', label: 'Edit: Redo', category: 'command', icon: <RotateCw size={14} />, shortcut: 'Ctrl+Y', action: () => { document.execCommand('redo'); onClose() } },
    { id: 'cut', label: 'Edit: Cut', category: 'command', icon: <Scissors size={14} />, shortcut: 'Ctrl+X', action: () => { document.execCommand('cut'); onClose() } },
    { id: 'copy', label: 'Edit: Copy', category: 'command', icon: <Copy size={14} />, shortcut: 'Ctrl+C', action: () => { document.execCommand('copy'); onClose() } },
    { id: 'paste', label: 'Edit: Paste', category: 'command', icon: <Clipboard size={14} />, shortcut: 'Ctrl+V', action: () => { document.execCommand('paste'); onClose() } },
    { id: 'find', label: 'Edit: Find', category: 'command', icon: <Search size={14} />, shortcut: 'Ctrl+F', action: () => { dispatch('orion:editor-find'); onClose() } },
    { id: 'replace', label: 'Edit: Find and Replace', category: 'command', icon: <Search size={14} />, shortcut: 'Ctrl+H', action: () => { dispatch('orion:editor-replace'); onClose() } },
    // View
    { id: 'toggle-sidebar', label: 'View: Toggle Sidebar', category: 'command', icon: <PanelLeft size={14} />, shortcut: 'Ctrl+B', action: () => { dispatch('orion:toggle-sidebar'); onClose() } },
    { id: 'toggle-terminal', label: 'View: Toggle Terminal', category: 'command', icon: <PanelBottom size={14} />, shortcut: 'Ctrl+`', action: () => { dispatch('orion:toggle-terminal'); onClose() } },
    { id: 'toggle-chat', label: 'View: Toggle Chat Panel', category: 'command', icon: <MessageSquare size={14} />, shortcut: 'Ctrl+L', action: () => { dispatch('orion:toggle-chat'); onClose() } },
    { id: 'toggle-zen-mode', label: 'View: Toggle Zen Mode', category: 'command', icon: <Maximize2 size={14} />, shortcut: 'Ctrl+K Z', action: () => { dispatch('orion:toggle-zen-mode'); onClose() } },
    { id: 'show-explorer', label: 'View: Show Explorer', category: 'command', icon: <FileText size={14} />, shortcut: 'Ctrl+Shift+E', action: () => { dispatch('orion:show-explorer'); onClose() } },
    { id: 'show-search', label: 'View: Show Search', category: 'command', icon: <Search size={14} />, shortcut: 'Ctrl+Shift+F', action: () => { dispatch('orion:show-search'); onClose() } },
    { id: 'show-git', label: 'View: Show Source Control', category: 'command', icon: <GitBranch size={14} />, shortcut: 'Ctrl+Shift+G', action: () => { dispatch('orion:show-git'); onClose() } },
    { id: 'show-agents', label: 'View: Show Agents', category: 'command', icon: <Zap size={14} />, action: () => { dispatch('orion:show-agents'); onClose() } },
    { id: 'toggle-timeline', label: 'View: Toggle Timeline', category: 'command', icon: <Clock size={14} />, action: () => { dispatch('orion:toggle-timeline'); onClose() } },
    // Editor
    { id: 'toggle-wordwrap', label: 'Editor: Toggle Word Wrap', category: 'command', icon: <WrapText size={14} />, action: () => { dispatch('orion:toggle-wordwrap'); onClose() } },
    { id: 'toggle-minimap', label: 'Editor: Toggle Minimap', category: 'command', icon: <Map size={14} />, action: () => { dispatch('orion:toggle-minimap'); onClose() } },
    { id: 'format', label: 'Editor: Format Document', category: 'command', icon: <Paintbrush size={14} />, shortcut: 'Shift+Alt+F', action: () => { dispatch('orion:format-document'); onClose() } },
    { id: 'split-editor', label: 'Editor: Split Editor Right', category: 'command', icon: <Columns size={14} />, shortcut: 'Ctrl+\\', action: () => { dispatch('orion:split-editor-right'); onClose() } },
    { id: 'split-editor-down', label: 'Editor: Split Editor Down', category: 'command', icon: <Rows2 size={14} />, action: () => { dispatch('orion:split-editor-down'); onClose() } },
    { id: 'toggle-split-direction', label: 'Editor: Toggle Split Direction', category: 'command', icon: <ArrowLeftRight size={14} />, action: () => { dispatch('orion:toggle-split-direction'); onClose() } },
    { id: 'toggle-sync-scroll', label: 'Editor: Toggle Sync Scroll', category: 'command', icon: <Link2 size={14} />, action: () => { dispatch('orion:toggle-sync-scroll'); onClose() } },
    { id: 'compare-files', label: 'Compare Active File With...', category: 'command', icon: <GitCompare size={14} />, action: () => { dispatch('orion:compare-files'); onClose() } },
    { id: 'font-increase', label: 'Editor: Increase Font Size', category: 'command', icon: <Plus size={14} />, shortcut: 'Ctrl+=', action: () => { dispatch('orion:font-increase'); onClose() } },
    { id: 'font-decrease', label: 'Editor: Decrease Font Size', category: 'command', icon: <Minus size={14} />, shortcut: 'Ctrl+-', action: () => { dispatch('orion:font-decrease'); onClose() } },
    { id: 'font-reset', label: 'Editor: Reset Font Size', category: 'command', icon: <Type size={14} />, action: () => { dispatch('orion:font-reset'); onClose() } },
    // Multi-cursor / Selection
    { id: 'add-selection-next', label: 'Editor: Add Selection to Next Find Match', category: 'command', icon: <MousePointer size={14} />, shortcut: 'Ctrl+D', action: () => { dispatch('orion:add-selection-next-match'); onClose() } },
    { id: 'select-all-occurrences', label: 'Editor: Select All Occurrences', category: 'command', icon: <MousePointer size={14} />, shortcut: 'Ctrl+Shift+L', action: () => { dispatch('orion:select-all-occurrences'); onClose() } },
    { id: 'add-cursor-above', label: 'Editor: Add Cursor Above', category: 'command', icon: <MousePointer size={14} />, shortcut: 'Ctrl+Alt+Up', action: () => { dispatch('orion:add-cursor-above'); onClose() } },
    { id: 'add-cursor-below', label: 'Editor: Add Cursor Below', category: 'command', icon: <MousePointer size={14} />, shortcut: 'Ctrl+Alt+Down', action: () => { dispatch('orion:add-cursor-below'); onClose() } },
    { id: 'cursors-to-line-ends', label: 'Editor: Add Cursors to Line Ends', category: 'command', icon: <MousePointer size={14} />, shortcut: 'Shift+Alt+I', action: () => { dispatch('orion:cursors-to-line-ends'); onClose() } },
    { id: 'column-select', label: 'Editor: Column Select Mode', category: 'command', icon: <MousePointer size={14} />, action: () => { dispatch('orion:column-select'); onClose() } },
    // Transform
    { id: 'transform-uppercase', label: 'Editor: Transform to Uppercase', category: 'command', icon: <CaseSensitive size={14} />, action: () => { dispatch('orion:transform-uppercase'); onClose() } },
    { id: 'transform-lowercase', label: 'Editor: Transform to Lowercase', category: 'command', icon: <CaseSensitive size={14} />, action: () => { dispatch('orion:transform-lowercase'); onClose() } },
    { id: 'transform-titlecase', label: 'Editor: Transform to Title Case', category: 'command', icon: <CaseSensitive size={14} />, action: () => { dispatch('orion:transform-titlecase'); onClose() } },
    // Find in Selection
    { id: 'find-in-selection', label: 'Edit: Find in Selection', category: 'command', icon: <Search size={14} />, action: () => { dispatch('orion:find-in-selection'); onClose() } },
    // Sort / Join
    { id: 'sort-lines-asc', label: 'Editor: Sort Lines Ascending', category: 'command', icon: <ArrowUpDown size={14} />, action: () => { dispatch('orion:sort-lines-asc'); onClose() } },
    { id: 'sort-lines-desc', label: 'Editor: Sort Lines Descending', category: 'command', icon: <ArrowDownUp size={14} />, action: () => { dispatch('orion:sort-lines-desc'); onClose() } },
    { id: 'join-lines', label: 'Editor: Join Lines', category: 'command', icon: <Merge size={14} />, action: () => { dispatch('orion:join-lines'); onClose() } },
    // Comments
    { id: 'toggle-line-comment', label: 'Editor: Toggle Line Comment', category: 'command', icon: <MessageSquareCode size={14} />, shortcut: 'Ctrl+/', action: () => { dispatch('orion:toggle-line-comment'); onClose() } },
    { id: 'toggle-block-comment', label: 'Editor: Toggle Block Comment', category: 'command', icon: <Braces size={14} />, shortcut: 'Ctrl+Shift+/', action: () => { dispatch('orion:toggle-block-comment'); onClose() } },
    // Folding
    { id: 'fold-all', label: 'Editor: Fold All', category: 'command', icon: <ChevronsDownUp size={14} />, shortcut: 'Ctrl+K Ctrl+0', action: () => { dispatch('orion:fold-all'); onClose() } },
    { id: 'unfold-all', label: 'Editor: Unfold All', category: 'command', icon: <ChevronsUpDown size={14} />, shortcut: 'Ctrl+K Ctrl+J', action: () => { dispatch('orion:unfold-all'); onClose() } },
    // Go to Line
    { id: 'go-to-line', label: 'Go to Line...', category: 'command', icon: <Hash size={14} />, shortcut: 'Ctrl+G', action: () => { dispatch('orion:go-to-line'); onClose() } },
    // Duplicate / Trim
    { id: 'duplicate-selection', label: 'Duplicate Selection', category: 'command', icon: <Copy size={14} />, action: () => { dispatch('orion:duplicate-selection'); onClose() } },
    { id: 'trim-whitespace', label: 'Trim Trailing Whitespace', category: 'command', icon: <Eraser size={14} />, action: () => { dispatch('orion:trim-whitespace'); onClose() } },
    // Window / Developer
    { id: 'new-window', label: 'New Window', category: 'command', icon: <Maximize2 size={14} />, action: () => { dispatch('orion:new-window'); onClose() } },
    { id: 'reload-window', label: 'Developer: Reload Window', category: 'command', icon: <RotateCw size={14} />, action: () => { window.location.reload() } },
    { id: 'toggle-devtools', label: 'Developer: Toggle DevTools', category: 'command', icon: <Bug size={14} />, action: () => { dispatch('orion:toggle-devtools'); onClose() } },
    // Git
    { id: 'git-toggle-blame', label: 'Git: Toggle Blame Annotations', category: 'command', icon: <GitBranch size={14} />, action: () => { dispatch('orion:git-toggle-blame'); onClose() } },
    { id: 'git-show-log', label: 'Git: Show Log / History', category: 'command', icon: <GitBranch size={14} />, action: () => { dispatch('orion:show-git'); dispatch('orion:git-show-history'); onClose() } },
    // Terminal
    { id: 'terminal', label: 'Terminal: Create New Terminal', category: 'command', icon: <Terminal size={14} />, shortcut: 'Ctrl+`', action: () => { dispatch('orion:toggle-terminal'); onClose() } },
    // AI
    { id: 'inline-edit', label: 'AI: Inline Edit (Ctrl+K)', category: 'command', icon: <Zap size={14} />, shortcut: 'Ctrl+K', action: () => { dispatch('orion:inline-edit'); onClose() } },
    // Preferences
    { id: 'color-theme', label: 'Preferences: Color Theme', category: 'command', icon: <Palette size={14} />, action: () => { setThemeMode(true); setQuery(''); setSelectedIndex(0) } },
    { id: 'settings', label: 'Preferences: Open Settings', category: 'command', icon: <Settings size={14} />, shortcut: 'Ctrl+,', action: () => { onClose(); onOpenSettings() } },
    { id: 'shortcuts', label: 'Preferences: Keyboard Shortcuts', category: 'command', icon: <Keyboard size={14} />, shortcut: 'Ctrl+K Ctrl+S', action: () => { onClose(); onOpenSettings() } },
    { id: 'snippets', label: 'Preferences: Configure User Snippets', category: 'command', icon: <Code size={14} />, action: () => { dispatch('orion:open-snippets'); onClose() } },
  ], [onClose, onOpenSettings, setThemeMode])

  // File items with prioritization: open tabs first, then recent files, then workspace files
  const fileItems: PaletteItem[] = useMemo(() => {
    const allFiles = flattenFiles(fileTree)
    const openTabPaths = new Set(openFiles.map(f => f.path))
    const recentPaths = new Set(recentFiles.map(f => f.path))

    const makeItem = (f: { name: string; path: string }, badge?: string): PaletteItem => ({
      id: f.path,
      label: f.name,
      category: 'file' as const,
      icon: <FileIcon fileName={f.name} size={14} />,
      badge,
      description: getParentDir(f.path),
      action: () => openFileAction(f),
    })

    // Open tabs (currently open in editor)
    const openTabItems = openFiles.map(f => makeItem(
      { name: f.name, path: f.path },
      'open'
    ))

    // Recent files that are NOT currently open
    const recentOnlyItems = recentFiles
      .filter(f => !openTabPaths.has(f.path))
      .map(f => makeItem(f, 'recent'))

    // Workspace files that are NOT open and NOT recent
    const workspaceOnlyItems = allFiles
      .filter(f => !openTabPaths.has(f.path) && !recentPaths.has(f.path))
      .map(f => makeItem(f))

    return [...openTabItems, ...recentOnlyItems, ...workspaceOnlyItems]
  }, [fileTree, openFile, onClose, openFiles, recentFiles])

  // Symbol search items (# mode)
  const symbolItems: PaletteItem[] = useMemo(() => {
    if (!isSymbolMode) return []

    const symbols: SymbolResult[] = []
    for (const file of openFiles) {
      if (file.content) {
        symbols.push(...extractSymbols(file.content, file.name, file.path))
      }
    }

    return symbols.map(sym => ({
      id: `symbol-${sym.filePath}-${sym.name}-${sym.lineNumber}`,
      label: sym.name,
      category: 'symbol' as const,
      icon: <Code size={14} />,
      description: `${sym.fileName}:${sym.lineNumber}`,
      badge: sym.kind,
      action: () => {
        const file = openFiles.find(f => f.path === sym.filePath)
        if (file) {
          useEditorStore.getState().setActiveFile(sym.filePath)
          setTimeout(() => {
            dispatch('orion:go-to-line', { line: sym.lineNumber })
          }, 50)
        }
        onClose()
      },
    }))
  }, [isSymbolMode, openFiles, onClose])

  // Go to line items (: mode)
  const gotoLineItems: PaletteItem[] = useMemo(() => {
    if (!isGotoLineMode) return []

    const lineNum = parseInt(searchQuery, 10)
    const activeFile = openFiles.find(f => f.path === activeFilePath)
    const totalLines = activeFile?.content?.split('\n').length ?? 0

    if (!activeFile) {
      return [{
        id: 'goto-line-no-file',
        label: 'No active editor',
        category: 'goto-line' as const,
        icon: <Hash size={14} />,
        description: 'Open a file first',
        action: () => {},
      }]
    }

    if (!searchQuery) {
      return [{
        id: 'goto-line-prompt',
        label: `Type a line number (1 - ${totalLines})`,
        category: 'goto-line' as const,
        icon: <Hash size={14} />,
        description: activeFile.name,
        action: () => {},
      }]
    }

    if (isNaN(lineNum) || lineNum < 1) {
      return [{
        id: 'goto-line-invalid',
        label: 'Enter a valid line number',
        category: 'goto-line' as const,
        icon: <Hash size={14} />,
        description: activeFile.name,
        action: () => {},
      }]
    }

    const clampedLine = Math.min(lineNum, totalLines)
    return [{
      id: `goto-line-${clampedLine}`,
      label: `Go to Line ${clampedLine}`,
      category: 'goto-line' as const,
      icon: <Hash size={14} />,
      description: `${activeFile.name} (${totalLines} lines)`,
      action: () => {
        dispatch('orion:go-to-line', { line: clampedLine })
        onClose()
      },
    }]
  }, [isGotoLineMode, searchQuery, openFiles, activeFilePath, onClose])

  // Theme picker items (shown in theme-mode)
  const themeItems: PaletteItem[] = useMemo(() => {
    return allThemes.map((t) => ({
      id: `theme-${t.id}`,
      label: `${t.name}${t.id === activeThemeId ? '  (active)' : ''}`,
      category: 'command' as const,
      icon: <Palette size={14} />,
      badge: t.type,
      action: () => { setTheme(t.id); onClose() },
    }))
  }, [allThemes, activeThemeId, setTheme, onClose])

  const items = useMemo(() => {
    const source = themeMode
      ? themeItems
      : isGotoLineMode
        ? gotoLineItems
        : isSymbolMode
          ? symbolItems
          : isFileMode
            ? fileItems
            : commands

    if (!searchQuery) return source.slice(0, 30)

    // For goto-line mode, items are already computed based on query
    if (isGotoLineMode) return source

    const lower = searchQuery.toLowerCase()

    // Fuzzy match: each character must appear in order
    const fuzzyMatch = (text: string, query: string) => {
      let qi = 0
      const tl = text.toLowerCase()
      for (let i = 0; i < tl.length && qi < query.length; i++) {
        if (tl[i] === query[qi]) qi++
      }
      return qi === query.length
    }

    // Score: prefer exact substring > starts with > fuzzy
    const scored = source
      .filter(item => {
        if (fuzzyMatch(item.label, lower)) return true
        if (item.description && fuzzyMatch(item.description, lower)) return true
        return false
      })
      .map(item => {
        const ll = item.label.toLowerCase()
        let score = 0
        if (ll === lower) score = 100
        else if (ll.startsWith(lower)) score = 80
        else if (ll.includes(lower)) score = 60
        else if (item.description?.toLowerCase().includes(lower)) score = 40
        else score = 30 // fuzzy only

        // Boost open tabs and recent files when searching
        if (isFileMode && item.badge === 'open') score += 5
        else if (isFileMode && item.badge === 'recent') score += 3

        return { item, score }
      })
      .sort((a, b) => b.score - a.score)

    return scored.map(s => s.item).slice(0, 30)
  }, [themeMode, isFileMode, isSymbolMode, isGotoLineMode, searchQuery, themeItems, fileItems, commands, symbolItems, gotoLineItems])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setThemeMode(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // Live-preview theme when navigating in theme mode
  useEffect(() => {
    if (themeMode && items[selectedIndex]) {
      const item = items[selectedIndex]
      const themeId = item.id.replace('theme-', '')
      previewTheme(themeId)
    }
  }, [selectedIndex, themeMode, items, previewTheme])

  // Revert preview when leaving theme mode or closing palette
  useEffect(() => {
    if (!open || !themeMode) {
      previewTheme(null)
    }
  }, [open, themeMode, previewTheme])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { previewTheme(null); onClose(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, items.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && items[selectedIndex]) {
      items[selectedIndex].action()
    }
  }

  const getPlaceholder = () => {
    if (themeMode) return 'Select a color theme...'
    if (isSymbolMode) return 'Search symbols in open files...'
    if (isGotoLineMode) return 'Type a line number to go to...'
    if (isCommandMode) return 'Type a command...'
    return 'Search files (> commands, # symbols, : go to line)'
  }

  const getInputIcon = () => {
    if (themeMode) return <Palette size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
    if (isSymbolMode) return <Hash size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
    if (isGotoLineMode) return <Hash size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
    if (isCommandMode) return <ChevronRight size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
    return <Search size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', justifyContent: 'center',
        paddingTop: 80,
      }}
      onClick={onClose}
    >
      <div
        className="anim-scale-in"
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxHeight: 400,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-bright)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          {getInputIcon()}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            style={{
              flex: 1, background: 'transparent',
              border: 'none', outline: 'none',
              fontSize: 13, color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
            }}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={{
          flex: 1, overflowY: 'auto',
          padding: '4px 0',
        }}>
          {items.length === 0 ? (
            <div style={{
              padding: '24px 16px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 12,
            }}>
              {isSymbolMode ? 'No symbols found in open files' : 'No results found'}
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                onClick={item.action}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 14px',
                  cursor: 'pointer',
                  background: idx === selectedIndex ? 'var(--bg-active)' : 'transparent',
                  color: idx === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontSize: 13,
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <span style={{ flexShrink: 0, display: 'flex' }}>
                  {item.icon}
                </span>
                <span className="truncate" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span className="truncate">{item.label}</span>
                  {item.category === 'symbol' && item.description && (
                    <span style={{ fontSize: 11, opacity: 0.5, flexShrink: 0 }}>
                      — {item.description}
                    </span>
                  )}
                  {item.category === 'file' && item.description && (
                    <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description}
                    </span>
                  )}
                  {item.category === 'goto-line' && item.description && (
                    <span style={{ fontSize: 11, opacity: 0.5 }}>
                      {item.description}
                    </span>
                  )}
                </span>
                {/* Badge for open/recent files */}
                {item.badge === 'open' && (
                  <span style={{
                    fontSize: 10, color: 'var(--accent)', opacity: 0.7,
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <Eye size={10} /> open
                  </span>
                )}
                {item.badge === 'recent' && (
                  <span style={{
                    fontSize: 10, color: 'var(--text-muted)', opacity: 0.7,
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    <Clock size={10} /> recent
                  </span>
                )}
                {item.badge && item.category === 'symbol' && (
                  <span style={{
                    fontSize: 9, color: 'var(--text-muted)',
                    background: 'var(--bg-tertiary)',
                    padding: '1px 5px', borderRadius: 3,
                    flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.5px',
                  }}>
                    {item.badge}
                  </span>
                )}
                {item.shortcut && (
                  <span className="kbd">{item.shortcut}</span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '6px 14px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 12,
          fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span><span className="kbd" style={{ marginRight: 4 }}>↑↓</span> navigate</span>
          <span><span className="kbd" style={{ marginRight: 4 }}>↵</span> select</span>
          <span><span className="kbd" style={{ marginRight: 4 }}>esc</span> close</span>
        </div>
      </div>
    </div>
  )
}
