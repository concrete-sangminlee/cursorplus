import { create } from 'zustand'
import type { TerminalSession } from '@shared/types'

// ---------------------------------------------------------------------------
// Shell Profiles
// ---------------------------------------------------------------------------

export type ShellProfilePlatform = 'windows' | 'macos' | 'linux'

export interface ShellProfile {
  id: string
  name: string
  path: string
  args?: string[]
  icon?: string
  /** Platform this profile is designed for; null means cross-platform / custom */
  platform: ShellProfilePlatform | null
  /** Custom environment variables merged into the shell env */
  env?: Record<string, string>
  /** Extra entries prepended to PATH */
  pathPrepend?: string[]
  /** Extra entries appended to PATH */
  pathAppend?: string[]
  /** If true, start with a clean env instead of inheriting the parent */
  cleanEnv?: boolean
  /** Whether this is a user-created custom profile */
  isCustom?: boolean
}

// Pre-defined shell profiles --------------------------------------------------

const WINDOWS_PROFILES: ShellProfile[] = [
  {
    id: 'powershell',
    name: 'PowerShell',
    path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    icon: 'terminal-powershell',
    platform: 'windows',
  },
  {
    id: 'pwsh',
    name: 'PowerShell 7',
    path: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    icon: 'terminal-powershell',
    platform: 'windows',
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    path: 'C:\\Windows\\System32\\cmd.exe',
    icon: 'terminal-cmd',
    platform: 'windows',
  },
  {
    id: 'git-bash',
    name: 'Git Bash',
    path: 'C:\\Program Files\\Git\\bin\\bash.exe',
    args: ['--login', '-i'],
    icon: 'terminal-bash',
    platform: 'windows',
  },
  {
    id: 'wsl',
    name: 'WSL',
    path: 'C:\\Windows\\System32\\wsl.exe',
    icon: 'terminal-linux',
    platform: 'windows',
  },
]

const UNIX_PROFILES: ShellProfile[] = [
  {
    id: 'bash',
    name: 'Bash',
    path: '/bin/bash',
    args: ['--login'],
    icon: 'terminal-bash',
    platform: 'linux',
  },
  {
    id: 'zsh',
    name: 'Zsh',
    path: '/bin/zsh',
    args: ['--login'],
    icon: 'terminal',
    platform: 'macos',
  },
  {
    id: 'fish',
    name: 'Fish',
    path: '/usr/bin/fish',
    args: ['--login'],
    icon: 'terminal',
    platform: 'linux',
  },
]

export const BUILTIN_PROFILES: ShellProfile[] = [
  ...WINDOWS_PROFILES,
  ...UNIX_PROFILES,
]

// ---------------------------------------------------------------------------
// Terminal History
// ---------------------------------------------------------------------------

export interface TerminalHistoryEntry {
  command: string
  timestamp: number
  /** Exit code if known */
  exitCode?: number | null
}

// ---------------------------------------------------------------------------
// Terminal Links
// ---------------------------------------------------------------------------

export type TerminalLinkKind = 'file' | 'url' | 'stacktrace'

export interface TerminalLink {
  kind: TerminalLinkKind
  /** Raw text that was matched */
  text: string
  /** Resolved file path (for file / stacktrace) */
  filePath?: string
  /** Line number (for stacktrace links) */
  line?: number
  /** Column number (for stacktrace links) */
  column?: number
  /** Full URL (for url links) */
  url?: string
}

/** Regex patterns used by the link detector */
export const LINK_PATTERNS = {
  /** Matches typical file paths – Unix and Windows */
  filePath:
    /(?:\/[\w.\-]+)+|(?:[A-Za-z]:\\[\w.\-\\]+)/g,
  /** Matches URLs with http/https */
  url:
    /https?:\/\/[^\s"'<>]+/g,
  /** Matches stack-trace style file:line or file:line:col */
  stackTrace:
    /(?:at\s+)?(?:\/[\w.\-/]+|[A-Za-z]:\\[\w.\-\\]+)[:\(](\d+)(?::(\d+))?\)?/g,
} as const

/**
 * Detect links inside a single line of terminal output.
 * Returns all matched links sorted by position in the string.
 */
export function detectTerminalLinks(line: string): TerminalLink[] {
  const links: TerminalLink[] = []

  // Stack traces (most specific – check first)
  for (const m of line.matchAll(LINK_PATTERNS.stackTrace)) {
    const fullMatch = m[0]
    // Extract the file path portion (before the colon/paren that holds line)
    const pathEnd = fullMatch.search(/[:\(]\d+/)
    const filePath = fullMatch.slice(fullMatch.startsWith('at ') ? 3 : 0, pathEnd).trim()
    links.push({
      kind: 'stacktrace',
      text: fullMatch,
      filePath,
      line: m[1] ? parseInt(m[1], 10) : undefined,
      column: m[2] ? parseInt(m[2], 10) : undefined,
    })
  }

  // URLs
  for (const m of line.matchAll(LINK_PATTERNS.url)) {
    links.push({ kind: 'url', text: m[0], url: m[0] })
  }

  // Plain file paths (only add if not already covered by stack trace)
  for (const m of line.matchAll(LINK_PATTERNS.filePath)) {
    const alreadyCovered = links.some(
      (l) => l.filePath === m[0] || l.text.includes(m[0])
    )
    if (!alreadyCovered) {
      links.push({ kind: 'file', text: m[0], filePath: m[0] })
    }
  }

  return links
}

// ---------------------------------------------------------------------------
// Terminal Environment helpers
// ---------------------------------------------------------------------------

export interface TerminalEnvironment {
  /** Custom env vars to set */
  variables: Record<string, string>
  /** Inherit from parent process env (default true) */
  inheritEnv: boolean
  /** Entries to prepend to PATH */
  pathPrepend: string[]
  /** Entries to append to PATH */
  pathAppend: string[]
}

export function createDefaultTerminalEnv(): TerminalEnvironment {
  return {
    variables: {},
    inheritEnv: true,
    pathPrepend: [],
    pathAppend: [],
  }
}

/**
 * Build a merged environment dict from a profile and per-session overrides.
 */
export function buildTerminalEnv(
  profile: ShellProfile | null,
  sessionEnv: TerminalEnvironment,
  parentEnv: Record<string, string> = {}
): Record<string, string> {
  const base: Record<string, string> = sessionEnv.inheritEnv && !profile?.cleanEnv
    ? { ...parentEnv }
    : {}

  // Merge profile env
  if (profile?.env) {
    Object.assign(base, profile.env)
  }

  // Merge session env
  Object.assign(base, sessionEnv.variables)

  // Build PATH
  const pathKey = Object.keys(base).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  const currentPath = base[pathKey] ?? ''
  const sep = currentPath.includes(';') ? ';' : ':'

  const prepend = [...(profile?.pathPrepend ?? []), ...sessionEnv.pathPrepend]
  const append = [...(profile?.pathAppend ?? []), ...sessionEnv.pathAppend]

  const parts: string[] = [
    ...prepend,
    ...(currentPath ? [currentPath] : []),
    ...append,
  ]

  base[pathKey] = parts.join(sep)

  return base
}

// ---------------------------------------------------------------------------
// Terminal Serialization
// ---------------------------------------------------------------------------

export interface SerializedTerminalSession {
  id: string
  name: string
  type: 'shell' | 'agent-output'
  profileId: string | null
  cwd?: string
  env: TerminalEnvironment
  scrollBuffer: string[]
  commandHistory: TerminalHistoryEntry[]
  splitConfig: SplitTerminalConfig | null
  createdAt: number
}

const STORAGE_KEY = 'orion-terminal-sessions'

function saveSessionsToStorage(sessions: SerializedTerminalSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // Storage quota exceeded or unavailable – silently ignore
  }
}

function loadSessionsFromStorage(): SerializedTerminalSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw) as SerializedTerminalSession[]
    }
  } catch {
    // Corrupted data – ignore
  }
  return []
}

// ---------------------------------------------------------------------------
// Split Terminal
// ---------------------------------------------------------------------------

export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitTerminalConfig {
  direction: SplitDirection
  /** Ratio of the first pane (0-1, e.g. 0.5 = equal split) */
  ratio: number
  /** ID of the session occupying the second pane */
  secondSessionId: string
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface TerminalStore {
  // -- Sessions ---------------------------------------------------------------
  sessions: TerminalSession[]
  activeSessionId: string | null
  maximizedSessionId: string | null

  addSession: (session: TerminalSession) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  setMaximizedSession: (id: string | null) => void

  // -- Shell Profiles ---------------------------------------------------------
  profiles: ShellProfile[]
  defaultProfileId: string | null
  customProfiles: ShellProfile[]

  addCustomProfile: (profile: ShellProfile) => void
  removeCustomProfile: (id: string) => void
  updateCustomProfile: (id: string, updates: Partial<ShellProfile>) => void
  setDefaultProfile: (id: string | null) => void
  getProfileById: (id: string) => ShellProfile | undefined
  getProfilesForPlatform: (platform: ShellProfilePlatform) => ShellProfile[]

  // -- Terminal History --------------------------------------------------------
  /** Command history keyed by session id */
  commandHistory: Record<string, TerminalHistoryEntry[]>

  addHistoryEntry: (sessionId: string, entry: TerminalHistoryEntry) => void
  clearHistory: (sessionId: string) => void
  getHistory: (sessionId: string) => TerminalHistoryEntry[]
  searchHistory: (sessionId: string, query: string) => TerminalHistoryEntry[]

  // -- Terminal Environment ----------------------------------------------------
  /** Per-session environment overrides keyed by session id */
  sessionEnvs: Record<string, TerminalEnvironment>

  setSessionEnv: (sessionId: string, env: TerminalEnvironment) => void
  updateSessionEnvVar: (sessionId: string, key: string, value: string) => void
  removeSessionEnvVar: (sessionId: string, key: string) => void
  setSessionInheritEnv: (sessionId: string, inherit: boolean) => void
  addSessionPathEntry: (
    sessionId: string,
    entry: string,
    position: 'prepend' | 'append'
  ) => void
  removeSessionPathEntry: (
    sessionId: string,
    entry: string,
    position: 'prepend' | 'append'
  ) => void

  // -- Terminal Serialization --------------------------------------------------
  /** Per-session scroll buffer keyed by session id */
  scrollBuffers: Record<string, string[]>

  appendToScrollBuffer: (sessionId: string, lines: string[]) => void
  clearScrollBuffer: (sessionId: string) => void
  saveAllSessions: () => void
  restoreSessions: () => void

  // -- Split Terminal ----------------------------------------------------------
  /** Split config keyed by session id */
  splitConfigs: Record<string, SplitTerminalConfig>

  setSplitConfig: (sessionId: string, config: SplitTerminalConfig | null) => void
  splitSession: (
    sessionId: string,
    newSessionId: string,
    direction: SplitDirection,
    ratio?: number
  ) => void
  unsplitSession: (sessionId: string) => void
  setSplitRatio: (sessionId: string, ratio: number) => void
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  // ==========================================================================
  // Sessions (existing)
  // ==========================================================================
  sessions: [],
  activeSessionId: null,
  maximizedSessionId: null,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    })),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)

      // Clean up associated state for the removed session
      const { [id]: _h, ...commandHistory } = state.commandHistory
      const { [id]: _e, ...sessionEnvs } = state.sessionEnvs
      const { [id]: _b, ...scrollBuffers } = state.scrollBuffers
      const { [id]: removedSplit, ...splitConfigs } = state.splitConfigs

      // Also clean up any split that references this session as the second pane
      const cleanedSplitConfigs: Record<string, SplitTerminalConfig> = {}
      for (const [key, cfg] of Object.entries(splitConfigs)) {
        if (cfg.secondSessionId !== id) {
          cleanedSplitConfigs[key] = cfg
        }
      }

      return {
        sessions,
        activeSessionId:
          state.activeSessionId === id
            ? sessions[sessions.length - 1]?.id ?? null
            : state.activeSessionId,
        maximizedSessionId:
          state.maximizedSessionId === id ? null : state.maximizedSessionId,
        commandHistory,
        sessionEnvs,
        scrollBuffers,
        splitConfigs: cleanedSplitConfigs,
      }
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),

  renameSession: (id, name) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, name } : s
      ),
    })),

  setMaximizedSession: (id) => set({ maximizedSessionId: id }),

  // ==========================================================================
  // Shell Profiles
  // ==========================================================================
  profiles: BUILTIN_PROFILES,
  defaultProfileId: null,
  customProfiles: [],

  addCustomProfile: (profile) =>
    set((state) => {
      const p: ShellProfile = { ...profile, isCustom: true }
      return {
        customProfiles: [...state.customProfiles, p],
        profiles: [...BUILTIN_PROFILES, ...state.customProfiles, p],
      }
    }),

  removeCustomProfile: (id) =>
    set((state) => {
      const customProfiles = state.customProfiles.filter((p) => p.id !== id)
      return {
        customProfiles,
        profiles: [...BUILTIN_PROFILES, ...customProfiles],
        defaultProfileId:
          state.defaultProfileId === id ? null : state.defaultProfileId,
      }
    }),

  updateCustomProfile: (id, updates) =>
    set((state) => {
      const customProfiles = state.customProfiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      )
      return {
        customProfiles,
        profiles: [...BUILTIN_PROFILES, ...customProfiles],
      }
    }),

  setDefaultProfile: (id) => set({ defaultProfileId: id }),

  getProfileById: (id) => {
    const state = get()
    return state.profiles.find((p) => p.id === id)
  },

  getProfilesForPlatform: (platform) => {
    const state = get()
    return state.profiles.filter(
      (p) => p.platform === null || p.platform === platform
    )
  },

  // ==========================================================================
  // Terminal History
  // ==========================================================================
  commandHistory: {},

  addHistoryEntry: (sessionId, entry) =>
    set((state) => {
      const existing = state.commandHistory[sessionId] ?? []
      return {
        commandHistory: {
          ...state.commandHistory,
          [sessionId]: [...existing, entry],
        },
      }
    }),

  clearHistory: (sessionId) =>
    set((state) => ({
      commandHistory: {
        ...state.commandHistory,
        [sessionId]: [],
      },
    })),

  getHistory: (sessionId) => {
    return get().commandHistory[sessionId] ?? []
  },

  searchHistory: (sessionId, query) => {
    const history = get().commandHistory[sessionId] ?? []
    if (!query) return history
    const lower = query.toLowerCase()
    return history.filter((e) => e.command.toLowerCase().includes(lower))
  },

  // ==========================================================================
  // Terminal Environment
  // ==========================================================================
  sessionEnvs: {},

  setSessionEnv: (sessionId, env) =>
    set((state) => ({
      sessionEnvs: { ...state.sessionEnvs, [sessionId]: env },
    })),

  updateSessionEnvVar: (sessionId, key, value) =>
    set((state) => {
      const current = state.sessionEnvs[sessionId] ?? createDefaultTerminalEnv()
      return {
        sessionEnvs: {
          ...state.sessionEnvs,
          [sessionId]: {
            ...current,
            variables: { ...current.variables, [key]: value },
          },
        },
      }
    }),

  removeSessionEnvVar: (sessionId, key) =>
    set((state) => {
      const current = state.sessionEnvs[sessionId] ?? createDefaultTerminalEnv()
      const { [key]: _, ...rest } = current.variables
      return {
        sessionEnvs: {
          ...state.sessionEnvs,
          [sessionId]: { ...current, variables: rest },
        },
      }
    }),

  setSessionInheritEnv: (sessionId, inherit) =>
    set((state) => {
      const current = state.sessionEnvs[sessionId] ?? createDefaultTerminalEnv()
      return {
        sessionEnvs: {
          ...state.sessionEnvs,
          [sessionId]: { ...current, inheritEnv: inherit },
        },
      }
    }),

  addSessionPathEntry: (sessionId, entry, position) =>
    set((state) => {
      const current = state.sessionEnvs[sessionId] ?? createDefaultTerminalEnv()
      const updated = { ...current }
      if (position === 'prepend') {
        updated.pathPrepend = [...current.pathPrepend, entry]
      } else {
        updated.pathAppend = [...current.pathAppend, entry]
      }
      return {
        sessionEnvs: { ...state.sessionEnvs, [sessionId]: updated },
      }
    }),

  removeSessionPathEntry: (sessionId, entry, position) =>
    set((state) => {
      const current = state.sessionEnvs[sessionId] ?? createDefaultTerminalEnv()
      const updated = { ...current }
      if (position === 'prepend') {
        updated.pathPrepend = current.pathPrepend.filter((e) => e !== entry)
      } else {
        updated.pathAppend = current.pathAppend.filter((e) => e !== entry)
      }
      return {
        sessionEnvs: { ...state.sessionEnvs, [sessionId]: updated },
      }
    }),

  // ==========================================================================
  // Terminal Serialization
  // ==========================================================================
  scrollBuffers: {},

  appendToScrollBuffer: (sessionId, lines) =>
    set((state) => {
      const existing = state.scrollBuffers[sessionId] ?? []
      // Cap buffer at 10 000 lines to avoid unbounded memory growth
      const combined = [...existing, ...lines]
      const maxLines = 10_000
      const trimmed =
        combined.length > maxLines
          ? combined.slice(combined.length - maxLines)
          : combined
      return {
        scrollBuffers: { ...state.scrollBuffers, [sessionId]: trimmed },
      }
    }),

  clearScrollBuffer: (sessionId) =>
    set((state) => ({
      scrollBuffers: { ...state.scrollBuffers, [sessionId]: [] },
    })),

  saveAllSessions: () => {
    const state = get()
    const serialized: SerializedTerminalSession[] = state.sessions.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      profileId:
        state.profiles.find((p) => p.path === s.shellPath)?.id ?? null,
      cwd: undefined,
      env: state.sessionEnvs[s.id] ?? createDefaultTerminalEnv(),
      scrollBuffer: state.scrollBuffers[s.id] ?? [],
      commandHistory: state.commandHistory[s.id] ?? [],
      splitConfig: state.splitConfigs[s.id] ?? null,
      createdAt: Date.now(),
    }))
    saveSessionsToStorage(serialized)
  },

  restoreSessions: () => {
    const saved = loadSessionsFromStorage()
    if (saved.length === 0) return

    const restoredSessions: TerminalSession[] = []
    const restoredHistory: Record<string, TerminalHistoryEntry[]> = {}
    const restoredEnvs: Record<string, TerminalEnvironment> = {}
    const restoredBuffers: Record<string, string[]> = {}
    const restoredSplits: Record<string, SplitTerminalConfig> = {}

    for (const s of saved) {
      const profile = s.profileId
        ? get().profiles.find((p) => p.id === s.profileId)
        : undefined

      restoredSessions.push({
        id: s.id,
        name: s.name,
        type: s.type,
        shellPath: profile?.path ?? undefined,
      })

      if (s.commandHistory.length > 0) {
        restoredHistory[s.id] = s.commandHistory
      }
      if (s.env) {
        restoredEnvs[s.id] = s.env
      }
      if (s.scrollBuffer.length > 0) {
        restoredBuffers[s.id] = s.scrollBuffer
      }
      if (s.splitConfig) {
        restoredSplits[s.id] = s.splitConfig
      }
    }

    set({
      sessions: restoredSessions,
      activeSessionId: restoredSessions[0]?.id ?? null,
      commandHistory: restoredHistory,
      sessionEnvs: restoredEnvs,
      scrollBuffers: restoredBuffers,
      splitConfigs: restoredSplits,
    })
  },

  // ==========================================================================
  // Split Terminal
  // ==========================================================================
  splitConfigs: {},

  setSplitConfig: (sessionId, config) =>
    set((state) => {
      if (config === null) {
        const { [sessionId]: _, ...rest } = state.splitConfigs
        return { splitConfigs: rest }
      }
      return {
        splitConfigs: { ...state.splitConfigs, [sessionId]: config },
      }
    }),

  splitSession: (sessionId, newSessionId, direction, ratio = 0.5) =>
    set((state) => {
      // Prevent splitting if already split
      if (state.splitConfigs[sessionId]) return state

      return {
        splitConfigs: {
          ...state.splitConfigs,
          [sessionId]: {
            direction,
            ratio,
            secondSessionId: newSessionId,
          },
        },
      }
    }),

  unsplitSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.splitConfigs
      return { splitConfigs: rest }
    }),

  setSplitRatio: (sessionId, ratio) =>
    set((state) => {
      const existing = state.splitConfigs[sessionId]
      if (!existing) return state
      return {
        splitConfigs: {
          ...state.splitConfigs,
          [sessionId]: { ...existing, ratio: Math.max(0.1, Math.min(0.9, ratio)) },
        },
      }
    }),
}))
