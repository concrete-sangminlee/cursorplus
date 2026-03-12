import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import {
  Search, RotateCcw, ChevronDown, ChevronRight, Check, Copy, X,
  Settings, Code, Terminal, Puzzle, Zap, Sparkles, Monitor, Palette,
  FileJson, Cloud, CloudOff, Clock, Pin, PinOff, AlertCircle, Info,
  ExternalLink, Filter, Star, Eye, EyeOff,
} from 'lucide-react'
import {
  useSettingsStore,
  SETTINGS_SCHEMA,
  SETTING_DEFAULTS,
  getEffectiveSetting,
  validateSetting,
  searchSettings,
  getSettingCategories,
  type SettingDescriptor,
  type SettingsLayer,
  type ValidationResult,
} from '@/store/settings'

// ── Types ─────────────────────────────────────────────────────────────────────

type SettingsScope = 'user' | 'workspace'

interface CategoryDef {
  id: string
  label: string
  icon: React.ReactNode
  description: string
  matchKeys: string[]
}

interface RecentlyModified {
  key: string
  timestamp: number
  layer: SettingsLayer
}

interface SettingGroupState {
  [groupKey: string]: boolean
}

// ── Extended Settings Schema ──────────────────────────────────────────────────
// We extend the store's SETTINGS_SCHEMA with additional entries to reach 50+
// realistic settings covering all the requested categories.

interface ExtendedSettingDescriptor extends SettingDescriptor {
  tags?: string[]
  markdownDescription?: string
  deprecationMessage?: string
  scope?: ('user' | 'workspace')[]
  pinned?: boolean
  group?: string
}

const ADDITIONAL_SETTINGS: ExtendedSettingDescriptor[] = [
  // ── Workbench ──────────────────────────────────────────────────────
  {
    key: 'workbench.colorTheme',
    type: 'string',
    default: 'Orion Dark',
    description: 'Specifies the color theme used in the workbench.',
    markdownDescription: 'Specifies the **color theme** used in the workbench. Use `Preferences: Color Theme` command to browse available themes.',
    enum: ['Orion Dark', 'Orion Light', 'Monokai', 'Dracula', 'Nord', 'Solarized Dark', 'Solarized Light', 'High Contrast'],
    category: 'workbench',
    tags: ['theme', 'appearance', 'colors'],
    group: 'Appearance',
    pinned: true,
  },
  {
    key: 'workbench.iconTheme',
    type: 'string',
    default: 'material-icon-theme',
    description: 'Specifies the file icon theme used in the workbench.',
    enum: ['material-icon-theme', 'seti', 'vscode-icons', 'none'],
    category: 'workbench',
    tags: ['icons', 'files', 'appearance'],
    group: 'Appearance',
  },
  {
    key: 'workbench.sideBar.location',
    type: 'string',
    default: 'left',
    description: 'Controls the position of the sidebar and activity bar.',
    enum: ['left', 'right'],
    category: 'workbench',
    tags: ['sidebar', 'layout'],
    group: 'Layout',
  },
  {
    key: 'workbench.activityBar.visible',
    type: 'boolean',
    default: true,
    description: 'Controls the visibility of the activity bar in the workbench.',
    category: 'workbench',
    tags: ['activity bar', 'layout'],
    group: 'Layout',
  },
  {
    key: 'workbench.statusBar.visible',
    type: 'boolean',
    default: true,
    description: 'Controls the visibility of the status bar at the bottom of the workbench.',
    category: 'workbench',
    tags: ['status bar', 'layout'],
    group: 'Layout',
  },
  {
    key: 'workbench.editor.showTabs',
    type: 'string',
    default: 'multiple',
    description: 'Controls whether opened editors show as individual tabs, or as a single tab.',
    enum: ['multiple', 'single', 'none'],
    category: 'workbench',
    tags: ['tabs', 'editor', 'layout'],
    group: 'Editor Management',
  },
  {
    key: 'workbench.editor.tabCloseButton',
    type: 'string',
    default: 'right',
    description: 'Controls the position of the editor tab close buttons.',
    enum: ['left', 'right', 'off'],
    category: 'workbench',
    tags: ['tabs', 'editor'],
    group: 'Editor Management',
  },
  {
    key: 'workbench.editor.enablePreview',
    type: 'boolean',
    default: true,
    description: 'Controls whether opened editors show in preview mode. Preview editors are reused until they are pinned.',
    markdownDescription: 'Controls whether opened editors show in **preview mode**. Preview editors are reused until they are pinned (via double click or edit).',
    category: 'workbench',
    tags: ['preview', 'tabs'],
    group: 'Editor Management',
    pinned: true,
  },
  {
    key: 'workbench.startupEditor',
    type: 'string',
    default: 'welcomePage',
    description: 'Controls which editor is shown at startup if the previous session is not restored.',
    enum: ['none', 'welcomePage', 'newUntitledFile', 'welcomePageInEmptyWorkbench'],
    category: 'workbench',
    tags: ['startup', 'welcome'],
    group: 'Startup',
  },
  {
    key: 'workbench.tree.indent',
    type: 'number',
    default: 8,
    description: 'Controls tree indentation in pixels.',
    min: 0,
    max: 40,
    category: 'workbench',
    tags: ['tree', 'explorer', 'indent'],
    group: 'Tree Widget',
  },
  {
    key: 'workbench.tree.renderIndentGuides',
    type: 'string',
    default: 'onHover',
    description: 'Controls whether the tree offers indent guides.',
    enum: ['none', 'onHover', 'always'],
    category: 'workbench',
    tags: ['tree', 'guides'],
    group: 'Tree Widget',
  },
  {
    key: 'workbench.breadcrumbs.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable or disable breadcrumb navigation.',
    category: 'workbench',
    tags: ['breadcrumbs', 'navigation'],
    group: 'Navigation',
  },

  // ── Features ───────────────────────────────────────────────────────
  {
    key: 'features.fileNesting.enabled',
    type: 'boolean',
    default: true,
    description: 'Controls whether file nesting is enabled in the explorer.',
    markdownDescription: 'Controls whether **file nesting** is enabled in the explorer. When enabled, related files (e.g. `tsconfig.json` and `tsconfig.node.json`) will nest under a parent.',
    category: 'features',
    tags: ['explorer', 'nesting', 'files'],
    group: 'Explorer',
  },
  {
    key: 'features.timeline.enabled',
    type: 'boolean',
    default: true,
    description: 'Enable the timeline panel in the explorer for viewing file history.',
    category: 'features',
    tags: ['timeline', 'history', 'git'],
    group: 'Explorer',
  },
  {
    key: 'features.search.useRipgrep',
    type: 'boolean',
    default: true,
    description: 'Use ripgrep for file search for improved performance on large workspaces.',
    category: 'features',
    tags: ['search', 'ripgrep', 'performance'],
    group: 'Search',
  },
  {
    key: 'features.search.maxResults',
    type: 'number',
    default: 20000,
    description: 'The maximum number of results returned by the search.',
    min: 100,
    max: 100000,
    category: 'features',
    tags: ['search', 'results'],
    group: 'Search',
  },
  {
    key: 'features.search.smartCase',
    type: 'boolean',
    default: true,
    description: 'Perform case-sensitive search only when the query contains an uppercase letter.',
    category: 'features',
    tags: ['search', 'case'],
    group: 'Search',
  },
  {
    key: 'features.git.enabled',
    type: 'boolean',
    default: true,
    description: 'Whether git integration is enabled.',
    category: 'features',
    tags: ['git', 'scm'],
    group: 'Source Control',
    pinned: true,
  },
  {
    key: 'features.git.autoFetch',
    type: 'boolean',
    default: false,
    description: 'Periodically fetch from remotes to keep your local repository up to date.',
    category: 'features',
    tags: ['git', 'fetch', 'remote'],
    group: 'Source Control',
  },
  {
    key: 'features.git.confirmSync',
    type: 'boolean',
    default: true,
    description: 'Confirm before synchronizing git repositories.',
    category: 'features',
    tags: ['git', 'sync'],
    group: 'Source Control',
  },
  {
    key: 'features.git.autostash',
    type: 'boolean',
    default: false,
    description: 'Stash any changes before pulling and restore them after.',
    category: 'features',
    tags: ['git', 'stash', 'pull'],
    group: 'Source Control',
  },
  {
    key: 'features.problems.decorations.enabled',
    type: 'boolean',
    default: true,
    description: 'Show problems (errors, warnings) as decorations in the explorer tree.',
    category: 'features',
    tags: ['problems', 'diagnostics', 'explorer'],
    group: 'Problems',
  },
  {
    key: 'features.autoSave',
    type: 'string',
    default: 'off',
    description: 'Controls auto-save of editors that have unsaved changes.',
    enum: ['off', 'afterDelay', 'onFocusChange', 'onWindowChange'],
    category: 'features',
    tags: ['save', 'auto'],
    group: 'Files',
    pinned: true,
  },
  {
    key: 'features.autoSaveDelay',
    type: 'number',
    default: 1000,
    description: 'Controls the delay in milliseconds after which an editor with unsaved changes is auto-saved.',
    min: 100,
    max: 60000,
    category: 'features',
    tags: ['save', 'delay'],
    group: 'Files',
  },
  {
    key: 'features.files.trimTrailingWhitespace',
    type: 'boolean',
    default: false,
    description: 'When enabled, will trim trailing whitespace when saving a file.',
    category: 'features',
    tags: ['whitespace', 'trim', 'save'],
    group: 'Files',
  },
  {
    key: 'features.files.insertFinalNewline',
    type: 'boolean',
    default: false,
    description: 'When enabled, insert a final new line at the end of the file when saving it.',
    category: 'features',
    tags: ['newline', 'save'],
    group: 'Files',
  },
  {
    key: 'features.files.encoding',
    type: 'string',
    default: 'utf8',
    description: 'The default character set encoding to use when reading and writing files.',
    enum: ['utf8', 'utf16le', 'utf16be', 'ascii', 'iso-8859-1', 'windows-1252', 'shift_jis', 'euc-kr', 'gb2312'],
    category: 'features',
    tags: ['encoding', 'charset'],
    group: 'Files',
  },

  // ── Extensions ─────────────────────────────────────────────────────
  {
    key: 'extensions.autoUpdate',
    type: 'boolean',
    default: true,
    description: 'Controls whether extensions are automatically updated.',
    category: 'extensions',
    tags: ['update', 'auto'],
    group: 'Management',
  },
  {
    key: 'extensions.autoCheckUpdates',
    type: 'boolean',
    default: true,
    description: 'Automatically check for extension updates.',
    category: 'extensions',
    tags: ['update', 'check'],
    group: 'Management',
  },
  {
    key: 'extensions.ignoreRecommendations',
    type: 'boolean',
    default: false,
    description: 'When true, extension recommendations will not be shown.',
    category: 'extensions',
    tags: ['recommendations'],
    group: 'Recommendations',
  },
  {
    key: 'extensions.closeExtensionDetailsOnViewChange',
    type: 'boolean',
    default: false,
    description: 'When enabled, the extension details view is closed when switching to another view.',
    category: 'extensions',
    tags: ['details', 'view'],
    group: 'Management',
  },
  {
    key: 'extensions.confirmedUriHandlerExtensionIds',
    type: 'array',
    default: [],
    description: 'Extension IDs that are allowed to handle URIs.',
    category: 'extensions',
    tags: ['uri', 'handler', 'security'],
    group: 'Security',
  },

  // ── AI ─────────────────────────────────────────────────────────────
  {
    key: 'ai.chat.contextWindow',
    type: 'number',
    default: 8192,
    description: 'Maximum number of tokens for conversation context window.',
    min: 1024,
    max: 200000,
    category: 'ai',
    tags: ['context', 'tokens', 'chat'],
    group: 'Chat',
  },
  {
    key: 'ai.chat.systemPrompt',
    type: 'string',
    default: '',
    description: 'Custom system prompt prepended to all AI conversations. Leave empty for default.',
    markdownDescription: 'Custom **system prompt** prepended to all AI conversations. Leave empty to use the built-in default prompt.',
    category: 'ai',
    tags: ['system', 'prompt', 'chat'],
    group: 'Chat',
  },
  {
    key: 'ai.chat.showReferences',
    type: 'boolean',
    default: true,
    description: 'Show file references and code context alongside AI responses.',
    category: 'ai',
    tags: ['references', 'context'],
    group: 'Chat',
  },
  {
    key: 'ai.codeActions.quickFix',
    type: 'boolean',
    default: true,
    description: 'Enable AI-powered quick fix suggestions for diagnostics.',
    category: 'ai',
    tags: ['quick fix', 'diagnostics', 'code actions'],
    group: 'Code Actions',
  },
  {
    key: 'ai.codeActions.refactor',
    type: 'boolean',
    default: true,
    description: 'Enable AI-powered refactoring suggestions.',
    category: 'ai',
    tags: ['refactor', 'code actions'],
    group: 'Code Actions',
  },
  {
    key: 'ai.agent.autoApprove',
    type: 'boolean',
    default: false,
    description: 'Automatically approve AI agent tool calls without prompting.',
    markdownDescription: 'Automatically approve AI agent tool calls **without prompting**. Use with caution as this allows the agent to execute file edits and terminal commands.',
    category: 'ai',
    tags: ['agent', 'approve', 'safety'],
    group: 'Agent',
  },
  {
    key: 'ai.agent.maxSteps',
    type: 'number',
    default: 25,
    description: 'Maximum number of steps the AI agent can take in a single task.',
    min: 1,
    max: 100,
    category: 'ai',
    tags: ['agent', 'steps', 'limit'],
    group: 'Agent',
  },
  {
    key: 'ai.agent.allowedTools',
    type: 'array',
    default: ['read', 'write', 'search', 'terminal'],
    description: 'Tools the AI agent is permitted to use.',
    category: 'ai',
    tags: ['agent', 'tools', 'permissions'],
    group: 'Agent',
  },
]

// Merge store schema with additional settings
const ALL_SETTINGS: ExtendedSettingDescriptor[] = [
  ...SETTINGS_SCHEMA.map((s): ExtendedSettingDescriptor => ({
    ...s,
    tags: s.key.split('.'),
    group: s.key.split('.').slice(0, -1).join(' > ') || s.category,
  })),
  ...ADDITIONAL_SETTINGS,
]

// Deduplicate by key (additional settings take priority for extended fields)
const SETTINGS_MAP = new Map<string, ExtendedSettingDescriptor>()
for (const s of ALL_SETTINGS) {
  SETTINGS_MAP.set(s.key, s)
}
const UNIQUE_SETTINGS = Array.from(SETTINGS_MAP.values())

// ── Category Definitions ──────────────────────────────────────────────────────

const CATEGORIES: CategoryDef[] = [
  {
    id: 'commonly-used',
    label: 'Commonly Used',
    icon: <Star size={15} />,
    description: 'Frequently changed settings',
    matchKeys: [],
  },
  {
    id: 'editor',
    label: 'Editor',
    icon: <Code size={15} />,
    description: 'Editor appearance, behavior, and formatting',
    matchKeys: ['editor'],
  },
  {
    id: 'workbench',
    label: 'Workbench',
    icon: <Monitor size={15} />,
    description: 'Window, sidebar, tabs, and layout',
    matchKeys: ['workbench', 'general', 'theme'],
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: <Terminal size={15} />,
    description: 'Integrated terminal appearance and behavior',
    matchKeys: ['terminal'],
  },
  {
    id: 'extensions',
    label: 'Extensions',
    icon: <Puzzle size={15} />,
    description: 'Extension management and marketplace',
    matchKeys: ['extensions'],
  },
  {
    id: 'features',
    label: 'Features',
    icon: <Zap size={15} />,
    description: 'Explorer, search, SCM, and file handling',
    matchKeys: ['features'],
  },
  {
    id: 'ai',
    label: 'AI',
    icon: <Sparkles size={15} />,
    description: 'AI completions, chat, agents, and models',
    matchKeys: ['ai'],
  },
]

// ── Pinned / Commonly Used ────────────────────────────────────────────────────

const COMMONLY_USED_KEYS = new Set([
  'editor.fontSize',
  'editor.fontFamily',
  'editor.tabSize',
  'editor.wordWrap',
  'editor.formatOnSave',
  'editor.minimap.enabled',
  'editor.cursorStyle',
  'editor.autoSave',
  'workbench.colorTheme',
  'workbench.editor.enablePreview',
  'features.autoSave',
  'features.git.enabled',
  'ai.inlineCompletions',
  'ai.streaming',
  'terminal.fontSize',
  ...UNIQUE_SETTINGS.filter(s => (s as ExtendedSettingDescriptor).pinned).map(s => s.key),
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object)
    const kb = Object.keys(b as object)
    if (ka.length !== kb.length) return false
    return ka.every(k => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return false
}

function renderMarkdown(text: string): React.ReactNode {
  // Minimal inline markdown: **bold**, `code`, *italic*
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*|`(.+?)`|\*(.+?)\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} style={{ fontWeight: 600 }}>{match[2]}</strong>)
    } else if (match[3]) {
      parts.push(
        <code key={match.index} style={{
          background: 'var(--bg-tertiary)',
          padding: '1px 4px',
          borderRadius: 3,
          fontSize: '0.9em',
          fontFamily: 'var(--font-mono, monospace)',
        }}>{match[3]}</code>
      )
    } else if (match[4]) {
      parts.push(<em key={match.index}>{match[4]}</em>)
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

function getSettingsForCategory(categoryId: string, settings: ExtendedSettingDescriptor[]): ExtendedSettingDescriptor[] {
  if (categoryId === 'commonly-used') {
    return settings.filter(s => COMMONLY_USED_KEYS.has(s.key))
  }
  const cat = CATEGORIES.find(c => c.id === categoryId)
  if (!cat) return []
  return settings.filter(s => cat.matchKeys.includes(s.category))
}

function groupByField(settings: ExtendedSettingDescriptor[]): Map<string, ExtendedSettingDescriptor[]> {
  const groups = new Map<string, ExtendedSettingDescriptor[]>()
  for (const s of settings) {
    const groupKey = s.group || s.category
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(s)
  }
  return groups
}

function fuzzyMatch(query: string, text: string): boolean {
  const lq = query.toLowerCase()
  const lt = text.toLowerCase()
  if (lt.includes(lq)) return true
  // Simple fuzzy: all query chars appear in order
  let qi = 0
  for (let ti = 0; ti < lt.length && qi < lq.length; ti++) {
    if (lt[ti] === lq[qi]) qi++
  }
  return qi === lq.length
}

// ── Sync Status ───────────────────────────────────────────────────────────────

type SyncStatus = 'synced' | 'syncing' | 'error' | 'disabled'

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    width: '100%',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
    fontSize: 13,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-secondary, #252526)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-primary)',
    marginRight: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  scopeTabs: {
    display: 'flex',
    gap: 0,
    borderRadius: 4,
    overflow: 'hidden',
    border: '1px solid var(--border-primary, #333)',
  },
  scopeTab: (active: boolean) => ({
    padding: '4px 14px',
    fontSize: 12,
    cursor: 'pointer',
    border: 'none',
    background: active ? 'var(--accent, #007acc)' : 'var(--bg-tertiary, #1e1e1e)',
    color: active ? '#fff' : 'var(--text-secondary, #999)',
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  }),
  syncBadge: (status: SyncStatus) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 10,
    background: status === 'synced' ? 'rgba(63,185,80,0.15)' :
                status === 'syncing' ? 'rgba(88,166,255,0.15)' :
                status === 'error' ? 'rgba(248,81,73,0.15)' :
                'rgba(139,148,158,0.15)',
    color: status === 'synced' ? 'var(--accent-green, #3fb950)' :
           status === 'syncing' ? 'var(--accent-blue, #58a6ff)' :
           status === 'error' ? 'var(--accent-red, #f85149)' :
           'var(--text-secondary, #8b949e)',
  }),
  searchBarWrap: {
    padding: '8px 20px',
    borderBottom: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-secondary, #252526)',
    flexShrink: 0,
  },
  searchInput: {
    width: '100%',
    padding: '7px 12px 7px 32px',
    border: '1px solid var(--border-primary, #3c3c3c)',
    borderRadius: 4,
    background: 'var(--bg-primary, #1e1e1e)',
    color: 'var(--text-primary)',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  searchIcon: {
    position: 'absolute' as const,
    left: 28,
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-tertiary, #666)',
    pointerEvents: 'none' as const,
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  sidebar: {
    width: 220,
    minWidth: 180,
    borderRight: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-secondary, #252526)',
    overflowY: 'auto' as const,
    flexShrink: 0,
    padding: '8px 0',
  },
  sidebarItem: (active: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 16px',
    cursor: 'pointer',
    fontSize: 13,
    color: active ? 'var(--text-primary)' : 'var(--text-secondary, #999)',
    background: active ? 'var(--bg-active, rgba(255,255,255,0.06))' : 'transparent',
    borderLeft: active ? '2px solid var(--accent, #007acc)' : '2px solid transparent',
    transition: 'all 0.12s',
    fontWeight: active ? 500 : 400,
    userSelect: 'none' as const,
  }),
  sidebarItemCount: {
    marginLeft: 'auto',
    fontSize: 11,
    color: 'var(--text-tertiary, #666)',
    background: 'var(--bg-tertiary, #1e1e1e)',
    padding: '1px 6px',
    borderRadius: 8,
    minWidth: 18,
    textAlign: 'center' as const,
  },
  content: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '0 0 40px 0',
  },
  recentSection: {
    padding: '12px 24px',
    borderBottom: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-secondary, #252526)',
  },
  recentHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    color: 'var(--text-tertiary, #666)',
    marginBottom: 8,
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 24px 6px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text-secondary, #ccc)',
    cursor: 'pointer',
    userSelect: 'none' as const,
    position: 'sticky' as const,
    top: 0,
    background: 'var(--bg-primary)',
    zIndex: 1,
    borderBottom: '1px solid var(--border-primary, #333)',
  },
  settingRow: {
    padding: '12px 24px',
    borderBottom: '1px solid var(--border-primary, rgba(255,255,255,0.04))',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
    position: 'relative' as const,
    transition: 'background 0.1s',
  },
  settingRowHover: {
    background: 'var(--bg-hover, rgba(255,255,255,0.03))',
  },
  settingHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
  },
  settingLabel: {
    fontWeight: 500,
    color: 'var(--text-primary)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  settingId: {
    fontSize: 11,
    color: 'var(--text-tertiary, #666)',
    fontFamily: 'var(--font-mono, monospace)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: 'var(--text-secondary, #999)',
    lineHeight: 1.5,
    maxWidth: 600,
  },
  modifiedDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent-blue, #58a6ff)',
    flexShrink: 0,
    marginTop: 4,
  },
  controlRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  // Toggle
  toggle: (on: boolean) => ({
    width: 36,
    height: 20,
    borderRadius: 10,
    background: on ? 'var(--accent, #007acc)' : 'var(--bg-tertiary, #3c3c3c)',
    border: '1px solid ' + (on ? 'var(--accent, #007acc)' : 'var(--border-primary, #555)'),
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'all 0.2s',
    flexShrink: 0,
  }),
  toggleKnob: (on: boolean) => ({
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute' as const,
    top: 2,
    left: on ? 19 : 2,
    transition: 'left 0.2s',
    boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
  }),
  // Dropdown
  dropdown: {
    padding: '5px 28px 5px 8px',
    border: '1px solid var(--border-primary, #3c3c3c)',
    borderRadius: 3,
    background: 'var(--bg-primary, #1e1e1e)',
    color: 'var(--text-primary)',
    fontSize: 13,
    cursor: 'pointer',
    fontFamily: 'inherit',
    outline: 'none',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23888\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
    minWidth: 160,
  },
  // Number input
  numberInput: {
    width: 80,
    padding: '5px 8px',
    border: '1px solid var(--border-primary, #3c3c3c)',
    borderRadius: 3,
    background: 'var(--bg-primary, #1e1e1e)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  },
  // Text input
  textInput: {
    width: '100%',
    maxWidth: 400,
    padding: '5px 8px',
    border: '1px solid var(--border-primary, #3c3c3c)',
    borderRadius: 3,
    background: 'var(--bg-primary, #1e1e1e)',
    color: 'var(--text-primary)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  // JSON editor
  jsonEditor: {
    width: '100%',
    maxWidth: 500,
    minHeight: 80,
    padding: '8px',
    border: '1px solid var(--border-primary, #3c3c3c)',
    borderRadius: 3,
    background: 'var(--bg-primary, #1e1e1e)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font-mono, "Cascadia Code", monospace)',
    outline: 'none',
    resize: 'vertical' as const,
    lineHeight: 1.5,
    boxSizing: 'border-box' as const,
  },
  // Reset button
  resetBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    border: 'none',
    borderRadius: 3,
    background: 'transparent',
    color: 'var(--text-tertiary, #666)',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  actionBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 6px',
    border: 'none',
    borderRadius: 3,
    background: 'transparent',
    color: 'var(--text-tertiary, #666)',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  overrideIndicator: {
    fontSize: 11,
    color: 'var(--accent-orange, #f0883e)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  validationError: {
    fontSize: 11,
    color: 'var(--accent-red, #f85149)',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  jsonOpenBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    border: '1px solid var(--border-primary, #3c3c3c)',
    borderRadius: 3,
    background: 'transparent',
    color: 'var(--text-secondary, #999)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
    color: 'var(--text-tertiary, #666)',
    gap: 12,
    fontSize: 13,
  },
  searchResultCount: {
    padding: '6px 24px',
    fontSize: 12,
    color: 'var(--text-tertiary, #666)',
    borderBottom: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-secondary, #252526)',
  },
  filterChip: (active: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 10,
    border: '1px solid ' + (active ? 'var(--accent, #007acc)' : 'var(--border-primary, #3c3c3c)'),
    background: active ? 'rgba(0,122,204,0.15)' : 'transparent',
    color: active ? 'var(--accent, #007acc)' : 'var(--text-tertiary, #666)',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }),
  copiedToast: {
    position: 'fixed' as const,
    bottom: 40,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    borderRadius: 6,
    background: 'var(--bg-elevated, #2d2d2d)',
    color: 'var(--text-primary)',
    fontSize: 12,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    zIndex: 10000,
    border: '1px solid var(--border-primary, #444)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
} as const

// ── Setting Control Components ────────────────────────────────────────────────

interface ControlProps {
  descriptor: ExtendedSettingDescriptor
  value: unknown
  onChange: (value: unknown) => void
  validationError?: string
}

const ToggleControl: React.FC<ControlProps> = ({ value, onChange }) => {
  const on = Boolean(value)
  return (
    <div
      style={styles.toggle(on)}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on) } }}
    >
      <div style={styles.toggleKnob(on)} />
    </div>
  )
}

const DropdownControl: React.FC<ControlProps> = ({ descriptor, value, onChange }) => {
  return (
    <select
      style={styles.dropdown}
      value={String(value ?? descriptor.default)}
      onChange={e => onChange(e.target.value)}
    >
      {(descriptor.enum ?? []).map(opt => (
        <option key={String(opt)} value={String(opt)}>
          {String(opt)}
        </option>
      ))}
    </select>
  )
}

const NumberControl: React.FC<ControlProps> = ({ descriptor, value, onChange, validationError }) => {
  const [localValue, setLocalValue] = useState(String(value ?? descriptor.default))

  useEffect(() => {
    setLocalValue(String(value ?? descriptor.default))
  }, [value, descriptor.default])

  const handleBlur = () => {
    const num = parseFloat(localValue)
    if (!isNaN(num)) {
      onChange(num)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          style={{
            ...styles.numberInput,
            borderColor: validationError ? 'var(--accent-red, #f85149)' : 'var(--border-primary, #3c3c3c)',
          }}
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') handleBlur() }}
          min={descriptor.min}
          max={descriptor.max}
          step={descriptor.max && descriptor.max <= 3 ? 0.1 : 1}
        />
        {descriptor.min !== undefined && descriptor.max !== undefined && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary, #666)' }}>
            ({descriptor.min} - {descriptor.max})
          </span>
        )}
      </div>
    </div>
  )
}

const TextControl: React.FC<ControlProps> = ({ descriptor, value, onChange }) => {
  const [localValue, setLocalValue] = useState(String(value ?? descriptor.default ?? ''))

  useEffect(() => {
    setLocalValue(String(value ?? descriptor.default ?? ''))
  }, [value, descriptor.default])

  const handleBlur = () => {
    onChange(localValue)
  }

  return (
    <input
      type="text"
      style={styles.textInput}
      value={localValue}
      onChange={e => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={e => { if (e.key === 'Enter') handleBlur() }}
      placeholder={String(descriptor.default || '')}
    />
  )
}

const JsonControl: React.FC<ControlProps> = ({ descriptor, value, onChange, validationError }) => {
  const [localValue, setLocalValue] = useState(() => {
    try {
      return JSON.stringify(value ?? descriptor.default, null, 2)
    } catch {
      return String(value ?? '{}')
    }
  })
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setLocalValue(JSON.stringify(value ?? descriptor.default, null, 2))
      setParseError(null)
    } catch {
      // keep current text
    }
  }, [value, descriptor.default])

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(localValue)
      setParseError(null)
      onChange(parsed)
    } catch (e) {
      setParseError((e as Error).message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        style={{
          ...styles.jsonEditor,
          borderColor: (parseError || validationError) ? 'var(--accent-red, #f85149)' : 'var(--border-primary, #3c3c3c)',
        }}
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        spellCheck={false}
      />
      {parseError && (
        <div style={styles.validationError}>
          <AlertCircle size={12} />
          JSON: {parseError}
        </div>
      )}
    </div>
  )
}

const ArrayControl: React.FC<ControlProps> = ({ descriptor, value, onChange, validationError }) => {
  const arr = Array.isArray(value) ? value : (Array.isArray(descriptor.default) ? descriptor.default : [])
  const [localValue, setLocalValue] = useState(() => {
    try {
      return JSON.stringify(arr, null, 2)
    } catch {
      return '[]'
    }
  })
  const [parseError, setParseError] = useState<string | null>(null)

  useEffect(() => {
    const currentArr = Array.isArray(value) ? value : (Array.isArray(descriptor.default) ? descriptor.default : [])
    try {
      setLocalValue(JSON.stringify(currentArr, null, 2))
      setParseError(null)
    } catch {
      // keep current
    }
  }, [value, descriptor.default])

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(localValue)
      if (!Array.isArray(parsed)) {
        setParseError('Value must be a JSON array')
        return
      }
      setParseError(null)
      onChange(parsed)
    } catch (e) {
      setParseError((e as Error).message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        style={{
          ...styles.jsonEditor,
          minHeight: 60,
          borderColor: (parseError || validationError) ? 'var(--accent-red, #f85149)' : 'var(--border-primary, #3c3c3c)',
        }}
        value={localValue}
        onChange={e => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        spellCheck={false}
      />
      {parseError && (
        <div style={styles.validationError}>
          <AlertCircle size={12} />
          {parseError}
        </div>
      )}
    </div>
  )
}

// ── Setting Row ───────────────────────────────────────────────────────────────

interface SettingRowProps {
  descriptor: ExtendedSettingDescriptor
  scope: SettingsScope
  onCopyId: (key: string) => void
  isRecentlyModified?: boolean
}

const SettingRow: React.FC<SettingRowProps> = React.memo(({ descriptor, scope, onCopyId, isRecentlyModified }) => {
  const [hovered, setHovered] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const layers = useSettingsStore(s => s.layers)
  const setSetting = useSettingsStore(s => s.setSetting)
  const resetSetting = useSettingsStore(s => s.resetSetting)
  const removeSetting = useSettingsStore(s => s.removeSetting)

  const effectiveValue = getEffectiveSetting(descriptor.key)
  const userValue = layers.user[descriptor.key]
  const workspaceValue = layers.workspace[descriptor.key]
  const defaultValue = descriptor.default

  const currentLayerValue = scope === 'workspace' ? workspaceValue : userValue
  const displayValue = effectiveValue ?? defaultValue

  const isModified = !deepEqual(displayValue, defaultValue)
  const isOverriddenInOtherScope = scope === 'user'
    ? workspaceValue !== undefined
    : userValue !== undefined && userValue !== undefined

  const handleChange = useCallback((newValue: unknown) => {
    const layer: SettingsLayer = scope === 'workspace' ? 'workspace' : 'user'
    const result = validateSetting(descriptor.key, newValue)
    if (!result.valid) {
      setValidationError(result.message ?? 'Invalid value')
      return
    }
    setValidationError(null)
    setSetting(descriptor.key, newValue, layer)
  }, [descriptor.key, scope, setSetting])

  const handleReset = useCallback(() => {
    if (scope === 'workspace') {
      removeSetting(descriptor.key, 'workspace')
    } else {
      resetSetting(descriptor.key)
    }
    setValidationError(null)
  }, [descriptor.key, scope, removeSetting, resetSetting])

  // Choose the right control
  const renderControl = () => {
    const controlProps: ControlProps = {
      descriptor,
      value: displayValue,
      onChange: handleChange,
      validationError: validationError ?? undefined,
    }

    if (descriptor.type === 'boolean') {
      return <ToggleControl {...controlProps} />
    }
    if (descriptor.enum && descriptor.enum.length > 0) {
      return <DropdownControl {...controlProps} />
    }
    if (descriptor.type === 'number') {
      return <NumberControl {...controlProps} />
    }
    if (descriptor.type === 'object') {
      return <JsonControl {...controlProps} />
    }
    if (descriptor.type === 'array') {
      return <ArrayControl {...controlProps} />
    }
    // string fallback
    return <TextControl {...controlProps} />
  }

  const descriptionText = (descriptor as ExtendedSettingDescriptor).markdownDescription || descriptor.description

  return (
    <div
      style={{
        ...styles.settingRow,
        ...(hovered ? styles.settingRowHover : {}),
        ...(isRecentlyModified ? { borderLeft: '3px solid var(--accent-blue, #58a6ff)', paddingLeft: 21 } : {}),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={styles.settingHeader}>
        {isModified && <div style={styles.modifiedDot} title="Modified from default" />}
        <div style={{ flex: 1 }}>
          <div style={styles.settingLabel}>
            {descriptor.key.split('.').pop()?.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
          </div>
          <div
            style={styles.settingId}
            onClick={() => onCopyId(descriptor.key)}
            title="Click to copy setting ID"
          >
            {descriptor.key}
            <Copy size={10} />
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>
          {isModified && (
            <button
              style={styles.resetBtn}
              onClick={handleReset}
              title="Reset to default"
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary, #666)' }}
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
        </div>
      </div>

      <div style={styles.settingDescription}>
        {renderMarkdown(descriptionText)}
      </div>

      <div style={styles.controlRow}>
        {renderControl()}
      </div>

      {validationError && (
        <div style={styles.validationError}>
          <AlertCircle size={12} />
          {validationError}
        </div>
      )}

      {isOverriddenInOtherScope && (
        <div style={styles.overrideIndicator}>
          <Info size={12} />
          Also modified in {scope === 'user' ? 'Workspace' : 'User'} settings
        </div>
      )}

      {(descriptor as ExtendedSettingDescriptor).deprecationMessage && (
        <div style={{ ...styles.validationError, color: 'var(--accent-orange, #f0883e)' }}>
          <AlertCircle size={12} />
          Deprecated: {(descriptor as ExtendedSettingDescriptor).deprecationMessage}
        </div>
      )}
    </div>
  )
})

SettingRow.displayName = 'SettingRow'

// ── Main Component ────────────────────────────────────────────────────────────

export const SettingsEditor: React.FC = () => {
  const [scope, setScope] = useState<SettingsScope>('user')
  const [activeCategory, setActiveCategory] = useState('commonly-used')
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedGroups, setCollapsedGroups] = useState<SettingGroupState>({})
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('synced')
  const [recentlyModified, setRecentlyModified] = useState<RecentlyModified[]>([])
  const [showModifiedOnly, setShowModifiedOnly] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const layers = useSettingsStore(s => s.layers)

  // Listen for setting changes to track recently modified
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { key: string; layer: SettingsLayer }
      setRecentlyModified(prev => {
        const filtered = prev.filter(r => r.key !== detail.key)
        return [{ key: detail.key, timestamp: Date.now(), layer: detail.layer }, ...filtered].slice(0, 10)
      })
    }
    window.addEventListener('orion:setting-changed', handler)
    return () => window.removeEventListener('orion:setting-changed', handler)
  }, [])

  // Keyboard shortcut: focus search with Ctrl+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Copy setting ID helper
  const handleCopyId = useCallback((key: string) => {
    navigator.clipboard.writeText(key).catch(() => {})
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }, [])

  // Toggle group collapse
  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }, [])

  // Filtered settings based on search + category
  const filteredSettings = useMemo(() => {
    let settings = UNIQUE_SETTINGS

    // Apply scope filtering
    settings = settings.filter(s => {
      const ext = s as ExtendedSettingDescriptor
      if (ext.scope && !ext.scope.includes(scope)) return false
      return true
    })

    // Apply search
    if (searchQuery.trim()) {
      settings = settings.filter(s =>
        fuzzyMatch(searchQuery, s.key) ||
        fuzzyMatch(searchQuery, s.description) ||
        fuzzyMatch(searchQuery, s.category) ||
        ((s as ExtendedSettingDescriptor).tags ?? []).some(t => fuzzyMatch(searchQuery, t)) ||
        ((s as ExtendedSettingDescriptor).markdownDescription
          ? fuzzyMatch(searchQuery, (s as ExtendedSettingDescriptor).markdownDescription!)
          : false)
      )
    } else {
      // Apply category
      settings = getSettingsForCategory(activeCategory, settings)
    }

    // Apply modified-only filter
    if (showModifiedOnly) {
      settings = settings.filter(s => {
        const effective = getEffectiveSetting(s.key)
        return !deepEqual(effective, s.default)
      })
    }

    return settings
  }, [searchQuery, activeCategory, scope, showModifiedOnly, layers])

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const cat of CATEGORIES) {
      counts[cat.id] = getSettingsForCategory(cat.id, UNIQUE_SETTINGS).length
    }
    return counts
  }, [])

  // Grouped settings
  const groupedSettings = useMemo(() => {
    return groupByField(filteredSettings)
  }, [filteredSettings])

  // Recently modified keys set for highlighting
  const recentKeys = useMemo(() => {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000
    return new Set(recentlyModified.filter(r => r.timestamp > fiveMinAgo).map(r => r.key))
  }, [recentlyModified])

  // Open settings JSON
  const handleOpenJson = useCallback(() => {
    // Dispatch event for the app to handle opening the JSON file
    window.dispatchEvent(new CustomEvent('orion:open-settings-json', {
      detail: { scope },
    }))
  }, [scope])

  // Toggle sync
  const handleToggleSync = useCallback(() => {
    setSyncStatus(prev => prev === 'disabled' ? 'synced' : 'disabled')
  }, [])

  const recentlyModifiedSettings = useMemo(() => {
    if (recentlyModified.length === 0) return []
    return recentlyModified
      .map(r => SETTINGS_MAP.get(r.key))
      .filter((s): s is ExtendedSettingDescriptor => s !== undefined)
      .slice(0, 5)
  }, [recentlyModified])

  return (
    <div style={styles.container}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <Settings size={15} />
          Settings
        </div>

        {/* User vs Workspace tabs */}
        <div style={styles.scopeTabs}>
          <button
            style={styles.scopeTab(scope === 'user')}
            onClick={() => setScope('user')}
          >
            User
          </button>
          <button
            style={styles.scopeTab(scope === 'workspace')}
            onClick={() => setScope('workspace')}
          >
            Workspace
          </button>
        </div>

        {/* Sync status */}
        <div
          style={{ ...styles.syncBadge(syncStatus), cursor: 'pointer' }}
          onClick={handleToggleSync}
          title={syncStatus === 'disabled' ? 'Click to enable settings sync' : 'Settings sync status'}
        >
          {syncStatus === 'synced' && <><Cloud size={12} /> Synced</>}
          {syncStatus === 'syncing' && <><Cloud size={12} /> Syncing...</>}
          {syncStatus === 'error' && <><CloudOff size={12} /> Sync Error</>}
          {syncStatus === 'disabled' && <><CloudOff size={12} /> Sync Off</>}
        </div>

        {/* Open JSON */}
        <button
          style={styles.jsonOpenBtn}
          onClick={handleOpenJson}
          title={`Open ${scope} settings JSON`}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent, #007acc)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-primary, #3c3c3c)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary, #999)' }}
        >
          <FileJson size={13} />
          Open JSON
        </button>
      </div>

      {/* ── Search Bar ──────────────────────────────────────────────────── */}
      <div style={styles.searchBarWrap}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={styles.searchIcon} />
          <input
            ref={searchInputRef}
            style={styles.searchInput}
            type="text"
            placeholder="Search settings (Ctrl+F)"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary, #666)',
                cursor: 'pointer',
                padding: 2,
                display: 'flex',
              }}
              onClick={() => setSearchQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            style={styles.filterChip(showModifiedOnly)}
            onClick={() => setShowModifiedOnly(v => !v)}
          >
            <Filter size={10} />
            Modified
          </button>
          {searchQuery && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary, #666)' }}>
              {filteredSettings.length} result{filteredSettings.length !== 1 ? 's' : ''} found
            </span>
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div style={styles.body}>
        {/* Sidebar */}
        {!searchQuery && (
          <div style={styles.sidebar}>
            {CATEGORIES.map(cat => (
              <div
                key={cat.id}
                style={styles.sidebarItem(activeCategory === cat.id)}
                onClick={() => { setActiveCategory(cat.id); contentRef.current?.scrollTo(0, 0) }}
                onMouseEnter={e => {
                  if (activeCategory !== cat.id) {
                    (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover, rgba(255,255,255,0.04))'
                  }
                }}
                onMouseLeave={e => {
                  if (activeCategory !== cat.id) {
                    (e.currentTarget as HTMLDivElement).style.background = 'transparent'
                  }
                }}
                title={cat.description}
              >
                {cat.icon}
                {cat.label}
                <span style={styles.sidebarItemCount}>
                  {categoryCounts[cat.id] ?? 0}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={styles.content} ref={contentRef}>
          {/* Recently modified section */}
          {!searchQuery && recentlyModifiedSettings.length > 0 && activeCategory === 'commonly-used' && (
            <div style={styles.recentSection}>
              <div style={styles.recentHeader}>
                <Clock size={12} />
                Recently Modified
              </div>
              {recentlyModifiedSettings.map(desc => (
                <SettingRow
                  key={`recent-${desc.key}`}
                  descriptor={desc}
                  scope={scope}
                  onCopyId={handleCopyId}
                  isRecentlyModified
                />
              ))}
            </div>
          )}

          {/* Search results count */}
          {searchQuery && (
            <div style={styles.searchResultCount}>
              {filteredSettings.length} setting{filteredSettings.length !== 1 ? 's' : ''} match &quot;{searchQuery}&quot;
            </div>
          )}

          {/* Empty state */}
          {filteredSettings.length === 0 && (
            <div style={styles.emptyState}>
              <Search size={32} strokeWidth={1.5} />
              <span>No settings found{searchQuery ? ` for "${searchQuery}"` : ''}</span>
              {showModifiedOnly && (
                <button
                  style={{ ...styles.filterChip(false), marginTop: 8, padding: '4px 12px', fontSize: 12 }}
                  onClick={() => setShowModifiedOnly(false)}
                >
                  Show all settings
                </button>
              )}
            </div>
          )}

          {/* Grouped settings */}
          {Array.from(groupedSettings.entries()).map(([groupKey, settings]) => {
            const isCollapsed = collapsedGroups[groupKey]
            return (
              <div key={groupKey}>
                <div
                  style={styles.groupHeader}
                  onClick={() => toggleGroup(groupKey)}
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  {groupKey}
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary, #666)', fontWeight: 400, marginLeft: 4 }}>
                    ({settings.length})
                  </span>
                </div>
                {!isCollapsed && settings.map(desc => (
                  <SettingRow
                    key={desc.key}
                    descriptor={desc}
                    scope={scope}
                    onCopyId={handleCopyId}
                    isRecentlyModified={recentKeys.has(desc.key)}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Copied Toast ───────────────────────────────────────────────── */}
      {copiedKey && (
        <div style={styles.copiedToast}>
          <Check size={13} style={{ color: 'var(--accent-green, #3fb950)' }} />
          Copied: {copiedKey}
        </div>
      )}
    </div>
  )
}

export default SettingsEditor
