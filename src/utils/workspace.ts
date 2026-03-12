/**
 * Workspace management utilities.
 * Multi-root workspace support, .orion config, recent workspaces, trusted folders.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface WorkspaceFolder {
  uri: string
  name: string
  index: number
}

export interface WorkspaceConfig {
  folders: WorkspaceFolder[]
  settings: Record<string, any>
  extensions: {
    recommendations: string[]
    unwantedRecommendations: string[]
  }
  launch?: Record<string, any>
  tasks?: Record<string, any>
}

export interface RecentWorkspace {
  path: string
  name: string
  lastOpened: number
  folders: number
  pinned: boolean
}

/* ── Storage Keys ──────────────────────────────────────── */

const RECENT_KEY = 'orion:recent-workspaces'
const TRUSTED_KEY = 'orion:trusted-folders'
const MAX_RECENT = 20

/* ── Recent Workspaces ─────────────────────────────────── */

export function getRecentWorkspaces(): RecentWorkspace[] {
  try {
    const data = localStorage.getItem(RECENT_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function addRecentWorkspace(path: string, name: string, folders = 1): void {
  const recent = getRecentWorkspaces().filter(w => w.path !== path)
  recent.unshift({ path, name, lastOpened: Date.now(), folders, pinned: false })
  if (recent.length > MAX_RECENT) {
    // Remove oldest non-pinned
    const nonPinned = recent.filter(w => !w.pinned)
    if (nonPinned.length > MAX_RECENT) {
      const toRemove = nonPinned[nonPinned.length - 1]
      const idx = recent.indexOf(toRemove)
      if (idx >= 0) recent.splice(idx, 1)
    }
  }
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
}

export function removeRecentWorkspace(path: string): void {
  const recent = getRecentWorkspaces().filter(w => w.path !== path)
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
}

export function togglePinWorkspace(path: string): void {
  const recent = getRecentWorkspaces()
  const ws = recent.find(w => w.path === path)
  if (ws) {
    ws.pinned = !ws.pinned
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent))
  }
}

export function clearRecentWorkspaces(): void {
  const pinned = getRecentWorkspaces().filter(w => w.pinned)
  localStorage.setItem(RECENT_KEY, JSON.stringify(pinned))
}

/* ── Trusted Folders ───────────────────────────────────── */

export function getTrustedFolders(): string[] {
  try {
    const data = localStorage.getItem(TRUSTED_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function addTrustedFolder(path: string): void {
  const trusted = getTrustedFolders()
  if (!trusted.includes(path)) {
    trusted.push(path)
    localStorage.setItem(TRUSTED_KEY, JSON.stringify(trusted))
  }
}

export function removeTrustedFolder(path: string): void {
  const trusted = getTrustedFolders().filter(p => p !== path)
  localStorage.setItem(TRUSTED_KEY, JSON.stringify(trusted))
}

export function isTrustedFolder(path: string): boolean {
  const trusted = getTrustedFolders()
  return trusted.some(t => path.startsWith(t))
}

/* ── Workspace Config Parser ───────────────────────────── */

export function parseWorkspaceConfig(content: string): WorkspaceConfig | null {
  try {
    const data = JSON.parse(content)
    return {
      folders: (data.folders || []).map((f: any, i: number) => ({
        uri: typeof f === 'string' ? f : f.path || f.uri,
        name: f.name || f.path?.split(/[/\\]/).pop() || `Folder ${i}`,
        index: i,
      })),
      settings: data.settings || {},
      extensions: {
        recommendations: data.extensions?.recommendations || [],
        unwantedRecommendations: data.extensions?.unwantedRecommendations || [],
      },
      launch: data.launch,
      tasks: data.tasks,
    }
  } catch {
    return null
  }
}

export function serializeWorkspaceConfig(config: WorkspaceConfig): string {
  return JSON.stringify({
    folders: config.folders.map(f => ({ path: f.uri, name: f.name })),
    settings: config.settings,
    extensions: config.extensions,
    launch: config.launch,
    tasks: config.tasks,
  }, null, 2)
}

/* ── File Watcher Helpers ──────────────────────────────── */

export function shouldIgnorePath(path: string, patterns: string[]): boolean {
  const normalized = path.replace(/\\/g, '/')
  return patterns.some(pattern => {
    const re = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*')
    return new RegExp(re).test(normalized)
  })
}

export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/__pycache__/**',
  '**/.cache/**',
  '**/coverage/**',
  '**/.DS_Store',
  '**/Thumbs.db',
]
