/**
 * Project/Workspace Manager.
 * Multi-root workspace support, project switching,
 * recent projects, workspace trust, and project detection.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface Project {
  id: string
  name: string
  rootPath: string
  type: ProjectType
  language: string
  framework?: string
  lastOpened: number
  pinned: boolean
  tags: string[]
  settings?: Record<string, unknown>
  iconColor?: string
}

export type ProjectType =
  | 'node' | 'python' | 'rust' | 'go' | 'java' | 'csharp'
  | 'cpp' | 'ruby' | 'php' | 'swift' | 'kotlin' | 'dart'
  | 'elixir' | 'zig' | 'unknown'

export interface WorkspaceRoot {
  path: string
  name: string
  includePatterns?: string[]
  excludePatterns?: string[]
}

export interface Workspace {
  id: string
  name: string
  roots: WorkspaceRoot[]
  settings: Record<string, unknown>
  extensions: string[]
  created: number
  lastOpened: number
}

export interface ProjectTemplate {
  id: string
  name: string
  description: string
  type: ProjectType
  framework?: string
  icon: string
  files: Array<{ path: string; content: string }>
  commands: string[]  // Post-creation commands
  dependencies?: Record<string, string>
}

export interface ProjectDetection {
  type: ProjectType
  language: string
  framework?: string
  buildSystem?: string
  packageManager?: string
  confidence: number
  indicators: string[]
}

/* ── Project type detection ────────────────────────────── */

interface DetectionRule {
  files: string[]
  type: ProjectType
  language: string
  framework?: string
  buildSystem?: string
  packageManager?: string
  weight: number
}

const DETECTION_RULES: DetectionRule[] = [
  // Node.js / JavaScript
  { files: ['package.json'], type: 'node', language: 'javascript', weight: 5 },
  { files: ['tsconfig.json'], type: 'node', language: 'typescript', weight: 8 },
  { files: ['next.config.js', 'next.config.mjs', 'next.config.ts'], type: 'node', language: 'typescript', framework: 'Next.js', weight: 10 },
  { files: ['nuxt.config.js', 'nuxt.config.ts'], type: 'node', language: 'typescript', framework: 'Nuxt', weight: 10 },
  { files: ['svelte.config.js'], type: 'node', language: 'typescript', framework: 'SvelteKit', weight: 10 },
  { files: ['astro.config.mjs', 'astro.config.ts'], type: 'node', language: 'typescript', framework: 'Astro', weight: 10 },
  { files: ['remix.config.js'], type: 'node', language: 'typescript', framework: 'Remix', weight: 10 },
  { files: ['angular.json'], type: 'node', language: 'typescript', framework: 'Angular', weight: 10 },
  { files: ['vite.config.ts', 'vite.config.js'], type: 'node', language: 'typescript', buildSystem: 'Vite', weight: 6 },
  { files: ['webpack.config.js', 'webpack.config.ts'], type: 'node', language: 'javascript', buildSystem: 'Webpack', weight: 6 },
  { files: ['electron-builder.yml', 'electron-builder.json5'], type: 'node', language: 'typescript', framework: 'Electron', weight: 9 },
  { files: ['pnpm-lock.yaml'], type: 'node', language: 'javascript', packageManager: 'pnpm', weight: 3 },
  { files: ['yarn.lock'], type: 'node', language: 'javascript', packageManager: 'yarn', weight: 3 },
  { files: ['bun.lockb'], type: 'node', language: 'javascript', packageManager: 'bun', weight: 3 },

  // Python
  { files: ['setup.py', 'setup.cfg', 'pyproject.toml'], type: 'python', language: 'python', weight: 8 },
  { files: ['requirements.txt'], type: 'python', language: 'python', weight: 5 },
  { files: ['Pipfile'], type: 'python', language: 'python', packageManager: 'pipenv', weight: 6 },
  { files: ['poetry.lock'], type: 'python', language: 'python', packageManager: 'poetry', weight: 6 },
  { files: ['manage.py'], type: 'python', language: 'python', framework: 'Django', weight: 9 },
  { files: ['app.py', 'wsgi.py'], type: 'python', language: 'python', framework: 'Flask', weight: 7 },
  { files: ['main.py', 'fastapi'], type: 'python', language: 'python', framework: 'FastAPI', weight: 7 },

  // Rust
  { files: ['Cargo.toml'], type: 'rust', language: 'rust', weight: 10 },
  { files: ['Cargo.lock'], type: 'rust', language: 'rust', weight: 5 },

  // Go
  { files: ['go.mod'], type: 'go', language: 'go', weight: 10 },
  { files: ['go.sum'], type: 'go', language: 'go', weight: 5 },

  // Java
  { files: ['pom.xml'], type: 'java', language: 'java', buildSystem: 'Maven', weight: 10 },
  { files: ['build.gradle', 'build.gradle.kts'], type: 'java', language: 'java', buildSystem: 'Gradle', weight: 10 },
  { files: ['settings.gradle', 'settings.gradle.kts'], type: 'java', language: 'java', buildSystem: 'Gradle', weight: 5 },

  // C#
  { files: ['*.csproj'], type: 'csharp', language: 'csharp', weight: 10 },
  { files: ['*.sln'], type: 'csharp', language: 'csharp', weight: 8 },

  // C/C++
  { files: ['CMakeLists.txt'], type: 'cpp', language: 'cpp', buildSystem: 'CMake', weight: 10 },
  { files: ['Makefile', 'makefile'], type: 'cpp', language: 'cpp', buildSystem: 'Make', weight: 5 },
  { files: ['meson.build'], type: 'cpp', language: 'cpp', buildSystem: 'Meson', weight: 10 },

  // Ruby
  { files: ['Gemfile'], type: 'ruby', language: 'ruby', weight: 8 },
  { files: ['Rakefile'], type: 'ruby', language: 'ruby', weight: 5 },
  { files: ['config/routes.rb'], type: 'ruby', language: 'ruby', framework: 'Rails', weight: 10 },

  // PHP
  { files: ['composer.json'], type: 'php', language: 'php', weight: 8 },
  { files: ['artisan'], type: 'php', language: 'php', framework: 'Laravel', weight: 10 },

  // Swift
  { files: ['Package.swift'], type: 'swift', language: 'swift', weight: 10 },
  { files: ['*.xcodeproj', '*.xcworkspace'], type: 'swift', language: 'swift', weight: 8 },

  // Kotlin
  { files: ['build.gradle.kts'], type: 'kotlin', language: 'kotlin', weight: 7 },

  // Dart/Flutter
  { files: ['pubspec.yaml'], type: 'dart', language: 'dart', weight: 10 },
  { files: ['lib/main.dart'], type: 'dart', language: 'dart', framework: 'Flutter', weight: 9 },

  // Elixir
  { files: ['mix.exs'], type: 'elixir', language: 'elixir', weight: 10 },

  // Zig
  { files: ['build.zig'], type: 'zig', language: 'zig', weight: 10 },
]

export function detectProject(existingFiles: string[]): ProjectDetection {
  const scores: Map<string, { rule: DetectionRule; matched: string[] }> = new Map()

  for (const rule of DETECTION_RULES) {
    for (const ruleFile of rule.files) {
      const isGlob = ruleFile.includes('*')

      for (const file of existingFiles) {
        const fileName = file.split('/').pop() || file
        let matches = false

        if (isGlob) {
          const ext = ruleFile.replace('*', '')
          matches = fileName.endsWith(ext)
        } else {
          matches = fileName === ruleFile || file === ruleFile || file.endsWith('/' + ruleFile)
        }

        if (matches) {
          const key = `${rule.type}:${rule.framework || rule.language}`
          const existing = scores.get(key)
          if (existing) {
            existing.matched.push(file)
          } else {
            scores.set(key, { rule, matched: [file] })
          }
          break
        }
      }
    }
  }

  // Find highest scoring detection
  let bestKey = ''
  let bestScore = 0

  for (const [key, { rule, matched }] of scores) {
    const score = rule.weight * matched.length
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  }

  if (bestKey && scores.has(bestKey)) {
    const { rule, matched } = scores.get(bestKey)!
    return {
      type: rule.type,
      language: rule.language,
      framework: rule.framework,
      buildSystem: rule.buildSystem,
      packageManager: rule.packageManager,
      confidence: Math.min(1, bestScore / 15),
      indicators: matched,
    }
  }

  return {
    type: 'unknown',
    language: 'unknown',
    confidence: 0,
    indicators: [],
  }
}

/* ── Workspace file format ─────────────────────────────── */

export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify({
    orionWorkspace: '1.0',
    name: workspace.name,
    roots: workspace.roots,
    settings: workspace.settings,
    extensions: workspace.extensions,
  }, null, 2)
}

export function deserializeWorkspace(json: string): Workspace | null {
  try {
    const data = JSON.parse(json)
    if (!data.orionWorkspace) return null

    return {
      id: generateId(),
      name: data.name || 'Workspace',
      roots: data.roots || [],
      settings: data.settings || {},
      extensions: data.extensions || [],
      created: Date.now(),
      lastOpened: Date.now(),
    }
  } catch {
    return null
  }
}

/* ── Project Manager ───────────────────────────────────── */

export class ProjectManager {
  private projects: Map<string, Project> = new Map()
  private workspaces: Map<string, Workspace> = new Map()
  private currentProject: Project | null = null
  private currentWorkspace: Workspace | null = null
  private recentLimit = 50
  private listeners: Set<(event: ProjectEvent) => void> = new Set()

  /* ── Project CRUD ──────────────────────────── */

  addProject(rootPath: string, options?: Partial<Project>): Project {
    const existing = this.findByPath(rootPath)
    if (existing) {
      existing.lastOpened = Date.now()
      this.notify({ type: 'project-updated', project: existing })
      return existing
    }

    const project: Project = {
      id: generateId(),
      name: options?.name || rootPath.split('/').pop() || rootPath.split('\\').pop() || 'Project',
      rootPath,
      type: options?.type || 'unknown',
      language: options?.language || 'unknown',
      framework: options?.framework,
      lastOpened: Date.now(),
      pinned: options?.pinned || false,
      tags: options?.tags || [],
      settings: options?.settings,
      iconColor: options?.iconColor,
    }

    this.projects.set(project.id, project)
    this.notify({ type: 'project-added', project })
    this.trimRecent()
    return project
  }

  removeProject(id: string): boolean {
    const project = this.projects.get(id)
    if (!project) return false
    this.projects.delete(id)
    if (this.currentProject?.id === id) this.currentProject = null
    this.notify({ type: 'project-removed', project })
    return true
  }

  updateProject(id: string, updates: Partial<Project>): Project | null {
    const project = this.projects.get(id)
    if (!project) return null
    Object.assign(project, updates)
    this.notify({ type: 'project-updated', project })
    return project
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id)
  }

  findByPath(rootPath: string): Project | undefined {
    for (const project of this.projects.values()) {
      if (normalizePath(project.rootPath) === normalizePath(rootPath)) {
        return project
      }
    }
    return undefined
  }

  /* ── Current project ───────────────────────── */

  openProject(project: Project): void {
    project.lastOpened = Date.now()
    this.currentProject = project
    this.notify({ type: 'project-opened', project })
  }

  closeProject(): void {
    const project = this.currentProject
    this.currentProject = null
    if (project) this.notify({ type: 'project-closed', project })
  }

  getCurrentProject(): Project | null {
    return this.currentProject
  }

  /* ── Workspace management ──────────────────── */

  createWorkspace(name: string, roots: WorkspaceRoot[]): Workspace {
    const workspace: Workspace = {
      id: generateId(),
      name,
      roots,
      settings: {},
      extensions: [],
      created: Date.now(),
      lastOpened: Date.now(),
    }
    this.workspaces.set(workspace.id, workspace)
    this.notify({ type: 'workspace-created', workspace })
    return workspace
  }

  openWorkspace(workspace: Workspace): void {
    workspace.lastOpened = Date.now()
    this.currentWorkspace = workspace
    this.notify({ type: 'workspace-opened', workspace })
  }

  addRootToWorkspace(workspaceId: string, root: WorkspaceRoot): boolean {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) return false
    if (workspace.roots.some(r => normalizePath(r.path) === normalizePath(root.path))) return false
    workspace.roots.push(root)
    this.notify({ type: 'workspace-updated', workspace })
    return true
  }

  removeRootFromWorkspace(workspaceId: string, rootPath: string): boolean {
    const workspace = this.workspaces.get(workspaceId)
    if (!workspace) return false
    const idx = workspace.roots.findIndex(r => normalizePath(r.path) === normalizePath(rootPath))
    if (idx === -1) return false
    workspace.roots.splice(idx, 1)
    this.notify({ type: 'workspace-updated', workspace })
    return true
  }

  getCurrentWorkspace(): Workspace | null {
    return this.currentWorkspace
  }

  /* ── Queries ───────────────────────────────── */

  getRecentProjects(limit: number = 20): Project[] {
    return [...this.projects.values()]
      .sort((a, b) => {
        // Pinned first, then by last opened
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.lastOpened - a.lastOpened
      })
      .slice(0, limit)
  }

  searchProjects(query: string): Project[] {
    const q = query.toLowerCase()
    return [...this.projects.values()].filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.rootPath.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      p.framework?.toLowerCase().includes(q) ||
      p.language.toLowerCase().includes(q)
    )
  }

  getProjectsByType(type: ProjectType): Project[] {
    return [...this.projects.values()].filter(p => p.type === type)
  }

  getProjectsByTag(tag: string): Project[] {
    return [...this.projects.values()].filter(p => p.tags.includes(tag))
  }

  getAllTags(): string[] {
    const tags = new Set<string>()
    for (const p of this.projects.values()) {
      for (const t of p.tags) tags.add(t)
    }
    return [...tags].sort()
  }

  /* ── Statistics ────────────────────────────── */

  getStats(): {
    totalProjects: number
    pinnedProjects: number
    byType: Record<string, number>
    byLanguage: Record<string, number>
    workspaces: number
  } {
    const byType: Record<string, number> = {}
    const byLanguage: Record<string, number> = {}

    for (const p of this.projects.values()) {
      byType[p.type] = (byType[p.type] || 0) + 1
      byLanguage[p.language] = (byLanguage[p.language] || 0) + 1
    }

    return {
      totalProjects: this.projects.size,
      pinnedProjects: [...this.projects.values()].filter(p => p.pinned).length,
      byType,
      byLanguage,
      workspaces: this.workspaces.size,
    }
  }

  /* ── Serialization ─────────────────────────── */

  serialize(): string {
    return JSON.stringify({
      projects: [...this.projects.values()],
      workspaces: [...this.workspaces.values()],
    })
  }

  deserialize(json: string): void {
    try {
      const data = JSON.parse(json)
      if (data.projects) {
        for (const p of data.projects) {
          this.projects.set(p.id, p)
        }
      }
      if (data.workspaces) {
        for (const w of data.workspaces) {
          this.workspaces.set(w.id, w)
        }
      }
    } catch { /* ignore */ }
  }

  /* ── Events ────────────────────────────────── */

  onChange(listener: (event: ProjectEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(event: ProjectEvent): void {
    for (const listener of this.listeners) {
      try { listener(event) } catch { /* ignore */ }
    }
  }

  /* ── Internal ──────────────────────────────── */

  private trimRecent(): void {
    const unpinned = [...this.projects.values()]
      .filter(p => !p.pinned)
      .sort((a, b) => b.lastOpened - a.lastOpened)

    if (unpinned.length > this.recentLimit) {
      for (const p of unpinned.slice(this.recentLimit)) {
        this.projects.delete(p.id)
      }
    }
  }

  clear(): void {
    this.projects.clear()
    this.workspaces.clear()
    this.currentProject = null
    this.currentWorkspace = null
  }
}

/* ── Event types ───────────────────────────────────────── */

export type ProjectEvent =
  | { type: 'project-added'; project: Project }
  | { type: 'project-removed'; project: Project }
  | { type: 'project-updated'; project: Project }
  | { type: 'project-opened'; project: Project }
  | { type: 'project-closed'; project: Project }
  | { type: 'workspace-created'; workspace: Workspace }
  | { type: 'workspace-opened'; workspace: Workspace }
  | { type: 'workspace-updated'; workspace: Workspace }

/* ── Helpers ───────────────────────────────────────────── */

let _idCounter = 0
function generateId(): string {
  return `proj-${Date.now()}-${++_idCounter}`
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/* ── Project color generation ──────────────────────────── */

const PROJECT_COLORS = [
  '#4fc1ff', '#f78c6c', '#c3e88d', '#c792ea',
  '#ff5370', '#82aaff', '#ffcb6b', '#89ddff',
  '#f07178', '#bb80b3', '#91b859', '#e2b93d',
  '#6796e6', '#cd9731', '#b267e6', '#d16969',
]

export function getProjectColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length]
}

/* ── Singleton ─────────────────────────────────────────── */

let _instance: ProjectManager | null = null

export function getProjectManager(): ProjectManager {
  if (!_instance) _instance = new ProjectManager()
  return _instance
}

export function resetProjectManager(): void {
  _instance?.clear()
  _instance = null
}
