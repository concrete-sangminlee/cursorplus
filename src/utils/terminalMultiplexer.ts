/**
 * Terminal Multiplexer – session lifecycle, split management, shell integration,
 * link detection, broadcast mode, recording/replay, and workspace restore.
 *
 * Interfaces with the main process PTY layer via `(window as any).api?.ptyXxx()`
 * IPC calls. All renderer-side state lives in a single Zustand store.
 */

import { create } from 'zustand'

// ---------------------------------------------------------------------------
// IPC bridge
// ---------------------------------------------------------------------------

const api = () =>
  (window as any).api as
    | Record<string, (...args: any[]) => Promise<any>>
    | undefined

// ---------------------------------------------------------------------------
// Enums & Constants
// ---------------------------------------------------------------------------

export const DEFAULT_SCROLLBACK_SIZE = 10_000
export const MAX_SCROLLBACK_SIZE = 100_000
export const MAX_RECORDING_ENTRIES = 5_000
export const MAX_SEARCH_RESULTS = 500
export const AUTO_RESTART_DELAY_MS = 1_500
export const MAX_AUTO_RESTART_ATTEMPTS = 3

export const SESSION_TYPE_LABELS: Record<TerminalSessionType, string> = {
  shell: 'Shell',
  'task-runner': 'Task Runner',
  'debug-console': 'Debug Console',
  'output-channel': 'Output Channel',
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _nextId = 1
function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${_nextId++}`
}

// ---------------------------------------------------------------------------
// Types – Session
// ---------------------------------------------------------------------------

export type TerminalSessionType =
  | 'shell'
  | 'task-runner'
  | 'debug-console'
  | 'output-channel'

export type TerminalSessionStatus =
  | 'starting'
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'restarting'

export interface TerminalProcessInfo {
  pid: number | null
  exitCode: number | null
  signal: string | null
  command: string | null
}

export interface TerminalSession {
  id: string
  name: string
  type: TerminalSessionType
  status: TerminalSessionStatus
  profileId: string | null
  cwd: string
  env: Record<string, string>
  process: TerminalProcessInfo
  createdAt: number
  focusedAt: number
  /** Whether the session is visible in the viewport */
  isFocused: boolean
  /** Number of consecutive crash-restarts */
  autoRestartCount: number
  /** Configurable scrollback limit */
  scrollbackSize: number
  /** User-set title override (null = auto-title from shell) */
  titleOverride: string | null
}

// ---------------------------------------------------------------------------
// Types – Profile
// ---------------------------------------------------------------------------

export type TerminalProfileKind =
  | 'default-shell'
  | 'git-bash'
  | 'node'
  | 'python'
  | 'custom-command'

export interface TerminalProfile {
  id: string
  name: string
  kind: TerminalProfileKind
  shellPath: string
  args: string[]
  env: Record<string, string>
  icon: string
  color: string
  defaultCwd: string | null
  /** If true, start with a clean env instead of inheriting */
  cleanEnv: boolean
  isBuiltin: boolean
}

// ---------------------------------------------------------------------------
// Types – Split Layout
// ---------------------------------------------------------------------------

export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitNode {
  id: string
  /** Leaf nodes hold a session; branch nodes hold children */
  sessionId: string | null
  direction: SplitDirection | null
  children: string[]
  /** Size ratio relative to siblings (0-1) */
  ratio: number
  parentId: string | null
}

// ---------------------------------------------------------------------------
// Types – Shell Integration (command detection)
// ---------------------------------------------------------------------------

export interface ShellCommand {
  id: string
  sessionId: string
  command: string
  cwd: string
  startedAt: number
  finishedAt: number | null
  exitCode: number | null
  /** Index into the scrollback buffer where command output begins */
  outputStartLine: number
  outputEndLine: number | null
}

export type ShellIntegrationState =
  | 'idle'
  | 'awaiting-command'
  | 'command-running'

export interface ShellIntegration {
  state: ShellIntegrationState
  currentCommandId: string | null
  /** Sequence number for PS1 marker matching */
  seq: number
}

// ---------------------------------------------------------------------------
// Types – Terminal Links
// ---------------------------------------------------------------------------

export type TerminalLinkKind = 'file' | 'url' | 'stacktrace'

export interface TerminalLink {
  kind: TerminalLinkKind
  text: string
  filePath?: string
  line?: number
  column?: number
  url?: string
  /** Buffer line where the link was found */
  bufferLine: number
}

/** Regex patterns for link detection in terminal output */
export const LINK_PATTERNS = {
  /** Unix and Windows file paths */
  filePath:
    /(?:(?:\/[\w.\-]+){2,}|(?:[A-Za-z]:\\(?:[\w.\-]+\\?)+))/g,
  /** http/https URLs */
  url:
    /https?:\/\/[^\s"'<>\])}]+/g,
  /** Stack trace: file:line or file:line:col, optional "at " prefix */
  stackTrace:
    /(?:at\s+)?(?:(?:\/[\w.\-/]+)|(?:[A-Za-z]:\\[\w.\-\\]+))[:(](\d+)(?::(\d+))?\)?/g,
  /** Node.js style: (file:line:col) */
  nodeStackTrace:
    /\(([^)]+):(\d+):(\d+)\)/g,
  /** Python traceback: File "path", line N */
  pythonTraceback:
    /File\s+"([^"]+)",\s+line\s+(\d+)/g,
  /** Rust/Go style: path:line:col */
  rustGoTrace:
    /([\w./\\-]+\.\w+):(\d+):(\d+)/g,
} as const

// ---------------------------------------------------------------------------
// Types – Find / Search
// ---------------------------------------------------------------------------

export interface TerminalSearchState {
  query: string
  isRegex: boolean
  caseSensitive: boolean
  wholeWord: boolean
  matchCount: number
  currentMatchIndex: number
  /** Line indices in scrollback that contain matches */
  matchLines: number[]
}

// ---------------------------------------------------------------------------
// Types – Recording / Replay
// ---------------------------------------------------------------------------

export interface RecordingEntry {
  timestamp: number
  type: 'input' | 'output' | 'resize'
  data: string
}

export interface TerminalRecording {
  sessionId: string
  startedAt: number
  stoppedAt: number | null
  entries: RecordingEntry[]
  isRecording: boolean
}

// ---------------------------------------------------------------------------
// Types – Serialization (workspace restore)
// ---------------------------------------------------------------------------

export interface SerializedMuxSession {
  id: string
  name: string
  type: TerminalSessionType
  profileId: string | null
  cwd: string
  env: Record<string, string>
  scrollbackSize: number
  titleOverride: string | null
}

export interface SerializedMuxLayout {
  sessions: SerializedMuxSession[]
  activeSessionId: string | null
  splitNodes: Record<string, SplitNode>
  rootNodeId: string | null
  broadcastGroupIds: string[][]
}

const MUX_STORAGE_KEY = 'orion-terminal-mux'

function saveMuxToStorage(data: SerializedMuxLayout): void {
  try {
    localStorage.setItem(MUX_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // quota exceeded – silently ignore
  }
}

function loadMuxFromStorage(): SerializedMuxLayout | null {
  try {
    const raw = localStorage.getItem(MUX_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SerializedMuxLayout
  } catch {
    // corrupted – ignore
  }
  return null
}

// ---------------------------------------------------------------------------
// Link detection helpers
// ---------------------------------------------------------------------------

export function detectLinks(line: string, bufferLine: number): TerminalLink[] {
  const links: TerminalLink[] = []
  const seen = new Set<string>()

  // Stack traces (most specific)
  for (const m of line.matchAll(LINK_PATTERNS.stackTrace)) {
    const full = m[0]
    if (seen.has(full)) continue
    seen.add(full)
    const pathEnd = full.search(/[:(]\d+/)
    const filePath = full.slice(full.startsWith('at ') ? 3 : 0, pathEnd).trim()
    links.push({
      kind: 'stacktrace',
      text: full,
      filePath,
      line: m[1] ? parseInt(m[1], 10) : undefined,
      column: m[2] ? parseInt(m[2], 10) : undefined,
      bufferLine,
    })
  }

  // Python tracebacks
  for (const m of line.matchAll(LINK_PATTERNS.pythonTraceback)) {
    const full = m[0]
    if (seen.has(full)) continue
    seen.add(full)
    links.push({
      kind: 'stacktrace',
      text: full,
      filePath: m[1],
      line: parseInt(m[2], 10),
      bufferLine,
    })
  }

  // URLs
  for (const m of line.matchAll(LINK_PATTERNS.url)) {
    if (seen.has(m[0])) continue
    seen.add(m[0])
    links.push({ kind: 'url', text: m[0], url: m[0], bufferLine })
  }

  // Plain file paths (skip if already covered)
  for (const m of line.matchAll(LINK_PATTERNS.filePath)) {
    const already = links.some(
      (l) => l.filePath === m[0] || l.text.includes(m[0]),
    )
    if (!already && !seen.has(m[0])) {
      links.push({ kind: 'file', text: m[0], filePath: m[0], bufferLine })
    }
  }

  return links
}

// ---------------------------------------------------------------------------
// Search helpers
// ---------------------------------------------------------------------------

function buildSearchRegex(state: TerminalSearchState): RegExp | null {
  if (!state.query) return null
  try {
    let pattern = state.isRegex ? state.query : escapeRegex(state.query)
    if (state.wholeWord) pattern = `\\b${pattern}\\b`
    return new RegExp(pattern, state.caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Shell integration: PS1 marker patterns
// ---------------------------------------------------------------------------

/** OSC markers injected by shell integration scripts */
export const SHELL_INTEGRATION_MARKERS = {
  /** Emitted right before the prompt */
  promptStart: '\x1b]633;A\x07',
  /** Emitted right after the user presses Enter (command start) */
  commandStart: '\x1b]633;C\x07',
  /** Emitted when the command finishes, carrying the exit code */
  commandFinish: /\x1b\]633;D;?(\d*)\x07/,
  /** Emitted to set the CWD */
  setCwd: /\x1b\]633;P;Cwd=([^\x07]+)\x07/,
} as const

// ---------------------------------------------------------------------------
// Default profile definitions
// ---------------------------------------------------------------------------

const BUILTIN_PROFILES: TerminalProfile[] = [
  {
    id: 'mux-profile-default-shell',
    name: 'Default Shell',
    kind: 'default-shell',
    shellPath: '',
    args: [],
    env: {},
    icon: 'terminal',
    color: '#6c757d',
    defaultCwd: null,
    cleanEnv: false,
    isBuiltin: true,
  },
  {
    id: 'mux-profile-git-bash',
    name: 'Git Bash',
    kind: 'git-bash',
    shellPath: 'C:\\Program Files\\Git\\bin\\bash.exe',
    args: ['--login', '-i'],
    env: {},
    icon: 'terminal-bash',
    color: '#F05032',
    defaultCwd: null,
    cleanEnv: false,
    isBuiltin: true,
  },
  {
    id: 'mux-profile-node',
    name: 'Node.js',
    kind: 'node',
    shellPath: 'node',
    args: [],
    env: { NODE_ENV: 'development' },
    icon: 'node',
    color: '#68A063',
    defaultCwd: null,
    cleanEnv: false,
    isBuiltin: true,
  },
  {
    id: 'mux-profile-python',
    name: 'Python',
    kind: 'python',
    shellPath: 'python3',
    args: [],
    env: {},
    icon: 'python',
    color: '#3776AB',
    defaultCwd: null,
    cleanEnv: false,
    isBuiltin: true,
  },
]

// ---------------------------------------------------------------------------
// Create default helpers
// ---------------------------------------------------------------------------

function createDefaultSession(
  overrides: Partial<TerminalSession> = {},
): TerminalSession {
  const now = Date.now()
  return {
    id: uid('mux-sess'),
    name: 'Terminal',
    type: 'shell',
    status: 'starting',
    profileId: null,
    cwd: '~',
    env: {},
    process: { pid: null, exitCode: null, signal: null, command: null },
    createdAt: now,
    focusedAt: now,
    isFocused: false,
    autoRestartCount: 0,
    scrollbackSize: DEFAULT_SCROLLBACK_SIZE,
    titleOverride: null,
    ...overrides,
  }
}

function createDefaultSearchState(): TerminalSearchState {
  return {
    query: '',
    isRegex: false,
    caseSensitive: false,
    wholeWord: false,
    matchCount: 0,
    currentMatchIndex: -1,
    matchLines: [],
  }
}

function createDefaultShellIntegration(): ShellIntegration {
  return {
    state: 'idle',
    currentCommandId: null,
    seq: 0,
  }
}

// ---------------------------------------------------------------------------
// Store Interface
// ---------------------------------------------------------------------------

export interface TerminalMuxStore {
  // -- Sessions -------------------------------------------------------------
  sessions: Record<string, TerminalSession>
  activeSessionId: string | null
  sessionOrder: string[]

  createSession: (opts?: Partial<TerminalSession>) => Promise<string>
  destroySession: (id: string) => Promise<void>
  focusSession: (id: string) => void
  blurSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  setSessionTitle: (id: string, title: string | null) => void
  setSessionCwd: (id: string, cwd: string) => void
  setSessionStatus: (id: string, status: TerminalSessionStatus) => void
  updateSessionProcess: (id: string, info: Partial<TerminalProcessInfo>) => void
  getSessionDisplayName: (id: string) => string

  // -- Profiles -------------------------------------------------------------
  profiles: Record<string, TerminalProfile>
  defaultProfileId: string
  createProfile: (profile: Omit<TerminalProfile, 'id' | 'isBuiltin'>) => string
  updateProfile: (id: string, updates: Partial<Omit<TerminalProfile, 'id' | 'isBuiltin'>>) => void
  removeProfile: (id: string) => void
  setDefaultProfile: (id: string) => void
  getProfile: (id: string) => TerminalProfile | undefined

  // -- Split Layout ---------------------------------------------------------
  splitNodes: Record<string, SplitNode>
  rootNodeId: string | null
  splitTerminal: (sessionId: string, direction: SplitDirection) => Promise<string | null>
  unsplitTerminal: (nodeId: string) => void
  resizeSplitNode: (nodeId: string, ratio: number) => void
  getSplitLeaves: () => string[]

  // -- Scrollback -----------------------------------------------------------
  scrollbackBuffers: Record<string, string[]>
  appendToScrollback: (sessionId: string, data: string) => void
  clearScrollback: (sessionId: string) => void
  setScrollbackSize: (sessionId: string, size: number) => void
  getScrollback: (sessionId: string) => string[]

  // -- Terminal Links -------------------------------------------------------
  detectedLinks: Record<string, TerminalLink[]>
  scanForLinks: (sessionId: string) => void
  getLinksForSession: (sessionId: string) => TerminalLink[]
  activateLink: (link: TerminalLink) => Promise<void>

  // -- Shell Integration ----------------------------------------------------
  shellIntegrations: Record<string, ShellIntegration>
  shellCommands: Record<string, ShellCommand[]>
  processShellMarker: (sessionId: string, data: string) => void
  getCommandHistory: (sessionId: string) => ShellCommand[]
  getCurrentCommand: (sessionId: string) => ShellCommand | null

  // -- Terminal Environment -------------------------------------------------
  workspaceEnv: Record<string, string>
  setWorkspaceEnv: (key: string, value: string) => void
  removeWorkspaceEnv: (key: string) => void
  setWorkspaceEnvBulk: (env: Record<string, string>) => void
  buildSessionEnv: (sessionId: string) => Record<string, string>

  // -- Search ---------------------------------------------------------------
  searchStates: Record<string, TerminalSearchState>
  startSearch: (sessionId: string, query: string, opts?: Partial<TerminalSearchState>) => void
  nextMatch: (sessionId: string) => number
  previousMatch: (sessionId: string) => number
  clearSearch: (sessionId: string) => void

  // -- Broadcast Mode -------------------------------------------------------
  broadcastGroups: string[][]
  isBroadcasting: boolean
  enableBroadcast: (sessionIds: string[]) => void
  disableBroadcast: () => void
  broadcastInput: (input: string) => string[]
  addToBroadcast: (sessionId: string) => void
  removeFromBroadcast: (sessionId: string) => void

  // -- Recording / Replay ---------------------------------------------------
  recordings: Record<string, TerminalRecording>
  startRecording: (sessionId: string) => void
  stopRecording: (sessionId: string) => void
  addRecordingEntry: (sessionId: string, entry: Omit<RecordingEntry, 'timestamp'>) => void
  getRecording: (sessionId: string) => TerminalRecording | null
  replayRecording: (sessionId: string, speed?: number) => Promise<void>
  clearRecording: (sessionId: string) => void

  // -- Auto-restart ---------------------------------------------------------
  autoRestartEnabled: boolean
  setAutoRestart: (enabled: boolean) => void
  handleSessionCrash: (sessionId: string) => Promise<void>

  // -- Serialization / Restore ----------------------------------------------
  serializeState: () => SerializedMuxLayout
  restoreState: () => Promise<boolean>
  clearPersistedState: () => void
}

// ---------------------------------------------------------------------------
// Store Implementation
// ---------------------------------------------------------------------------

export const useTerminalMuxStore = create<TerminalMuxStore>((set, get) => {
  // Seed built-in profiles
  const initialProfiles: Record<string, TerminalProfile> = {}
  for (const p of BUILTIN_PROFILES) {
    initialProfiles[p.id] = p
  }

  return {
    // =====================================================================
    // Sessions
    // =====================================================================
    sessions: {},
    activeSessionId: null,
    sessionOrder: [],

    async createSession(opts = {}) {
      const state = get()
      const profileId = opts.profileId ?? state.defaultProfileId
      const profile = state.profiles[profileId] ?? null

      const session = createDefaultSession({
        name:
          opts.name ??
          profile?.name ??
          `Terminal ${Object.keys(state.sessions).length + 1}`,
        type: opts.type ?? 'shell',
        profileId,
        cwd: opts.cwd ?? profile?.defaultCwd ?? '~',
        env: { ...(profile?.env ?? {}), ...(opts.env ?? {}) },
        scrollbackSize: opts.scrollbackSize ?? DEFAULT_SCROLLBACK_SIZE,
        titleOverride: opts.titleOverride ?? null,
        ...opts,
        id: opts.id ?? uid('mux-sess'),
      })

      // Spawn the PTY process via IPC
      try {
        const result = await api()?.ptySpawn?.({
          id: session.id,
          shellPath: profile?.shellPath ?? '',
          args: profile?.args ?? [],
          cwd: session.cwd,
          env: get().buildSessionEnv(session.id),
          cols: 80,
          rows: 24,
        })

        if (result?.pid) {
          session.process = { ...session.process, pid: result.pid }
          session.status = 'running'
        }
      } catch {
        // PTY spawn failed – mark as starting so UI can still show the tab
        session.status = 'starting'
      }

      set((s) => ({
        sessions: { ...s.sessions, [session.id]: session },
        activeSessionId: s.activeSessionId ?? session.id,
        sessionOrder: [...s.sessionOrder, session.id],
        shellIntegrations: {
          ...s.shellIntegrations,
          [session.id]: createDefaultShellIntegration(),
        },
        scrollbackBuffers: { ...s.scrollbackBuffers, [session.id]: [] },
        detectedLinks: { ...s.detectedLinks, [session.id]: [] },
        shellCommands: { ...s.shellCommands, [session.id]: [] },
        searchStates: {
          ...s.searchStates,
          [session.id]: createDefaultSearchState(),
        },
      }))

      return session.id
    },

    async destroySession(id) {
      const session = get().sessions[id]
      if (!session) return

      // Kill the PTY process
      try {
        await api()?.ptyKill?.(id)
      } catch {
        // best-effort
      }

      set((s) => {
        const { [id]: _, ...sessions } = s.sessions
        const { [id]: _sb, ...scrollbackBuffers } = s.scrollbackBuffers
        const { [id]: _dl, ...detectedLinks } = s.detectedLinks
        const { [id]: _si, ...shellIntegrations } = s.shellIntegrations
        const { [id]: _sc, ...shellCommands } = s.shellCommands
        const { [id]: _ss, ...searchStates } = s.searchStates
        const { [id]: _rec, ...recordings } = s.recordings

        const sessionOrder = s.sessionOrder.filter((sid) => sid !== id)
        const remaining = Object.keys(sessions)
        const newActive =
          s.activeSessionId === id
            ? sessionOrder[sessionOrder.length - 1] ?? null
            : s.activeSessionId

        // Remove from broadcast groups
        const broadcastGroups = s.broadcastGroups
          .map((g) => g.filter((sid) => sid !== id))
          .filter((g) => g.length > 1)

        // Clean up split nodes that reference this session
        const splitNodes = { ...s.splitNodes }
        for (const [nodeId, node] of Object.entries(splitNodes)) {
          if (node.sessionId === id) {
            delete splitNodes[nodeId]
          }
        }

        return {
          sessions,
          activeSessionId: newActive,
          sessionOrder,
          scrollbackBuffers,
          detectedLinks,
          shellIntegrations,
          shellCommands,
          searchStates,
          recordings,
          broadcastGroups,
          splitNodes,
        }
      })
    },

    focusSession(id) {
      const session = get().sessions[id]
      if (!session) return
      set((s) => ({
        activeSessionId: id,
        sessions: {
          ...s.sessions,
          [id]: { ...session, isFocused: true, focusedAt: Date.now() },
        },
      }))
      api()?.ptyFocus?.(id).catch(() => {})
    },

    blurSession(id) {
      const session = get().sessions[id]
      if (!session) return
      set((s) => ({
        sessions: {
          ...s.sessions,
          [id]: { ...session, isFocused: false },
        },
      }))
      api()?.ptyBlur?.(id).catch(() => {})
    },

    renameSession(id, name) {
      set((s) => {
        const session = s.sessions[id]
        if (!session) return s
        return { sessions: { ...s.sessions, [id]: { ...session, name } } }
      })
    },

    setSessionTitle(id, title) {
      set((s) => {
        const session = s.sessions[id]
        if (!session) return s
        return {
          sessions: {
            ...s.sessions,
            [id]: { ...session, titleOverride: title },
          },
        }
      })
    },

    setSessionCwd(id, cwd) {
      set((s) => {
        const session = s.sessions[id]
        if (!session) return s
        return { sessions: { ...s.sessions, [id]: { ...session, cwd } } }
      })
    },

    setSessionStatus(id, status) {
      set((s) => {
        const session = s.sessions[id]
        if (!session) return s
        return { sessions: { ...s.sessions, [id]: { ...session, status } } }
      })
    },

    updateSessionProcess(id, info) {
      set((s) => {
        const session = s.sessions[id]
        if (!session) return s
        return {
          sessions: {
            ...s.sessions,
            [id]: { ...session, process: { ...session.process, ...info } },
          },
        }
      })
    },

    getSessionDisplayName(id) {
      const session = get().sessions[id]
      if (!session) return 'Terminal'
      if (session.titleOverride) return session.titleOverride
      const profile = session.profileId
        ? get().profiles[session.profileId]
        : null
      return session.name || profile?.name || 'Terminal'
    },

    // =====================================================================
    // Profiles
    // =====================================================================
    profiles: initialProfiles,
    defaultProfileId: 'mux-profile-default-shell',

    createProfile(profile) {
      const id = uid('mux-prof')
      const full: TerminalProfile = { ...profile, id, isBuiltin: false }
      set((s) => ({ profiles: { ...s.profiles, [id]: full } }))
      return id
    },

    updateProfile(id, updates) {
      set((s) => {
        const existing = s.profiles[id]
        if (!existing || existing.isBuiltin) return s
        return {
          profiles: { ...s.profiles, [id]: { ...existing, ...updates } },
        }
      })
    },

    removeProfile(id) {
      set((s) => {
        const existing = s.profiles[id]
        if (!existing || existing.isBuiltin) return s
        const { [id]: _, ...rest } = s.profiles
        return {
          profiles: rest,
          defaultProfileId:
            s.defaultProfileId === id
              ? 'mux-profile-default-shell'
              : s.defaultProfileId,
        }
      })
    },

    setDefaultProfile(id) {
      if (get().profiles[id]) {
        set({ defaultProfileId: id })
      }
    },

    getProfile(id) {
      return get().profiles[id]
    },

    // =====================================================================
    // Split Layout
    // =====================================================================
    splitNodes: {},
    rootNodeId: null,

    async splitTerminal(sessionId, direction) {
      const state = get()
      const session = state.sessions[sessionId]
      if (!session) return null

      // Create a new session for the split pane
      const newSessionId = await get().createSession({
        type: session.type,
        profileId: session.profileId,
        cwd: session.cwd,
      })

      const parentNodeId = uid('mux-node')
      const leftNodeId = uid('mux-node')
      const rightNodeId = uid('mux-node')

      const parentNode: SplitNode = {
        id: parentNodeId,
        sessionId: null,
        direction,
        children: [leftNodeId, rightNodeId],
        ratio: 1,
        parentId: null,
      }

      const leftNode: SplitNode = {
        id: leftNodeId,
        sessionId,
        direction: null,
        children: [],
        ratio: 0.5,
        parentId: parentNodeId,
      }

      const rightNode: SplitNode = {
        id: rightNodeId,
        sessionId: newSessionId,
        direction: null,
        children: [],
        ratio: 0.5,
        parentId: parentNodeId,
      }

      set((s) => ({
        splitNodes: {
          ...s.splitNodes,
          [parentNodeId]: parentNode,
          [leftNodeId]: leftNode,
          [rightNodeId]: rightNode,
        },
        rootNodeId: s.rootNodeId ?? parentNodeId,
      }))

      return newSessionId
    },

    unsplitTerminal(nodeId) {
      set((s) => {
        const node = s.splitNodes[nodeId]
        if (!node) return s

        const updated = { ...s.splitNodes }

        // Recursively collect all descendant node IDs
        const collectDescendants = (nid: string): string[] => {
          const n = updated[nid]
          if (!n) return [nid]
          const descendants = [nid]
          for (const childId of n.children) {
            descendants.push(...collectDescendants(childId))
          }
          return descendants
        }

        const toRemove = collectDescendants(nodeId)
        for (const rid of toRemove) {
          delete updated[rid]
        }

        // Remove from parent's children
        if (node.parentId && updated[node.parentId]) {
          const parent = updated[node.parentId]
          updated[node.parentId] = {
            ...parent,
            children: parent.children.filter((c) => c !== nodeId),
          }
          // If parent has only one child left, collapse
          if (updated[node.parentId].children.length === 1) {
            const remainingId = updated[node.parentId].children[0]
            const remaining = updated[remainingId]
            if (remaining) {
              updated[node.parentId] = {
                ...updated[node.parentId],
                sessionId: remaining.sessionId,
                direction: remaining.direction,
                children: remaining.children,
              }
              delete updated[remainingId]
            }
          }
        }

        const newRoot = s.rootNodeId === nodeId ? null : s.rootNodeId

        return { splitNodes: updated, rootNodeId: newRoot }
      })
    },

    resizeSplitNode(nodeId, ratio) {
      const clamped = Math.max(0.1, Math.min(0.9, ratio))
      set((s) => {
        const node = s.splitNodes[nodeId]
        if (!node) return s
        return {
          splitNodes: {
            ...s.splitNodes,
            [nodeId]: { ...node, ratio: clamped },
          },
        }
      })
    },

    getSplitLeaves() {
      const nodes = get().splitNodes
      return Object.values(nodes)
        .filter((n) => n.sessionId !== null && n.children.length === 0)
        .map((n) => n.sessionId!)
    },

    // =====================================================================
    // Scrollback
    // =====================================================================
    scrollbackBuffers: {},

    appendToScrollback(sessionId, data) {
      set((s) => {
        const session = s.sessions[sessionId]
        const maxLines = session?.scrollbackSize ?? DEFAULT_SCROLLBACK_SIZE
        const existing = s.scrollbackBuffers[sessionId] ?? []
        const newLines = data.split('\n')
        const combined = [...existing, ...newLines]
        const trimmed =
          combined.length > maxLines
            ? combined.slice(combined.length - maxLines)
            : combined
        return {
          scrollbackBuffers: {
            ...s.scrollbackBuffers,
            [sessionId]: trimmed,
          },
        }
      })

      // Record output if recording is active
      const recording = get().recordings[sessionId]
      if (recording?.isRecording) {
        get().addRecordingEntry(sessionId, { type: 'output', data })
      }
    },

    clearScrollback(sessionId) {
      set((s) => ({
        scrollbackBuffers: { ...s.scrollbackBuffers, [sessionId]: [] },
        detectedLinks: { ...s.detectedLinks, [sessionId]: [] },
      }))
      api()?.ptyClearBuffer?.(sessionId).catch(() => {})
    },

    setScrollbackSize(sessionId, size) {
      const clamped = Math.max(100, Math.min(MAX_SCROLLBACK_SIZE, size))
      set((s) => {
        const session = s.sessions[sessionId]
        if (!session) return s
        return {
          sessions: {
            ...s.sessions,
            [sessionId]: { ...session, scrollbackSize: clamped },
          },
        }
      })
    },

    getScrollback(sessionId) {
      return get().scrollbackBuffers[sessionId] ?? []
    },

    // =====================================================================
    // Terminal Links
    // =====================================================================
    detectedLinks: {},

    scanForLinks(sessionId) {
      const buffer = get().scrollbackBuffers[sessionId] ?? []
      const allLinks: TerminalLink[] = []
      for (let i = 0; i < buffer.length; i++) {
        const lineLinks = detectLinks(buffer[i], i)
        allLinks.push(...lineLinks)
      }
      set((s) => ({
        detectedLinks: { ...s.detectedLinks, [sessionId]: allLinks },
      }))
    },

    getLinksForSession(sessionId) {
      return get().detectedLinks[sessionId] ?? []
    },

    async activateLink(link) {
      if (link.kind === 'url' && link.url) {
        await api()?.openExternal?.(link.url)
      } else if (link.filePath) {
        await api()?.openFile?.({
          path: link.filePath,
          line: link.line,
          column: link.column,
        })
      }
    },

    // =====================================================================
    // Shell Integration
    // =====================================================================
    shellIntegrations: {},
    shellCommands: {},

    processShellMarker(sessionId, data) {
      const integration = get().shellIntegrations[sessionId]
      if (!integration) return

      // Check for CWD marker
      const cwdMatch = data.match(SHELL_INTEGRATION_MARKERS.setCwd)
      if (cwdMatch) {
        get().setSessionCwd(sessionId, cwdMatch[1])
      }

      // Check for command start marker
      if (data.includes(SHELL_INTEGRATION_MARKERS.commandStart)) {
        const cmdId = uid('cmd')
        const buffer = get().scrollbackBuffers[sessionId] ?? []

        const command: ShellCommand = {
          id: cmdId,
          sessionId,
          command: '',
          cwd: get().sessions[sessionId]?.cwd ?? '~',
          startedAt: Date.now(),
          finishedAt: null,
          exitCode: null,
          outputStartLine: buffer.length,
          outputEndLine: null,
        }

        set((s) => ({
          shellIntegrations: {
            ...s.shellIntegrations,
            [sessionId]: {
              ...integration,
              state: 'command-running',
              currentCommandId: cmdId,
              seq: integration.seq + 1,
            },
          },
          shellCommands: {
            ...s.shellCommands,
            [sessionId]: [...(s.shellCommands[sessionId] ?? []), command],
          },
        }))
      }

      // Check for command finish marker
      const finishMatch = data.match(SHELL_INTEGRATION_MARKERS.commandFinish)
      if (finishMatch && integration.currentCommandId) {
        const exitCode = finishMatch[1] ? parseInt(finishMatch[1], 10) : 0
        const buffer = get().scrollbackBuffers[sessionId] ?? []

        set((s) => {
          const commands = [...(s.shellCommands[sessionId] ?? [])]
          const idx = commands.findIndex(
            (c) => c.id === integration.currentCommandId,
          )
          if (idx >= 0) {
            commands[idx] = {
              ...commands[idx],
              finishedAt: Date.now(),
              exitCode,
              outputEndLine: buffer.length,
            }
          }

          return {
            shellIntegrations: {
              ...s.shellIntegrations,
              [sessionId]: {
                ...integration,
                state: 'idle',
                currentCommandId: null,
              },
            },
            shellCommands: { ...s.shellCommands, [sessionId]: commands },
          }
        })
      }

      // Check for prompt start marker (awaiting command)
      if (data.includes(SHELL_INTEGRATION_MARKERS.promptStart)) {
        set((s) => ({
          shellIntegrations: {
            ...s.shellIntegrations,
            [sessionId]: { ...integration, state: 'awaiting-command' },
          },
        }))
      }
    },

    getCommandHistory(sessionId) {
      return get().shellCommands[sessionId] ?? []
    },

    getCurrentCommand(sessionId) {
      const integration = get().shellIntegrations[sessionId]
      if (!integration?.currentCommandId) return null
      const commands = get().shellCommands[sessionId] ?? []
      return commands.find((c) => c.id === integration.currentCommandId) ?? null
    },

    // =====================================================================
    // Terminal Environment
    // =====================================================================
    workspaceEnv: {},

    setWorkspaceEnv(key, value) {
      set((s) => ({
        workspaceEnv: { ...s.workspaceEnv, [key]: value },
      }))
    },

    removeWorkspaceEnv(key) {
      set((s) => {
        const { [key]: _, ...rest } = s.workspaceEnv
        return { workspaceEnv: rest }
      })
    },

    setWorkspaceEnvBulk(env) {
      set((s) => ({
        workspaceEnv: { ...s.workspaceEnv, ...env },
      }))
    },

    buildSessionEnv(sessionId) {
      const state = get()
      const session = state.sessions[sessionId]
      const profile = session?.profileId
        ? state.profiles[session.profileId]
        : null

      const base: Record<string, string> = profile?.cleanEnv
        ? {}
        : { ...state.workspaceEnv }

      // Layer profile env
      if (profile?.env) {
        Object.assign(base, profile.env)
      }

      // Layer session-specific env
      if (session?.env) {
        Object.assign(base, session.env)
      }

      return base
    },

    // =====================================================================
    // Search
    // =====================================================================
    searchStates: {},

    startSearch(sessionId, query, opts = {}) {
      const buffer = get().scrollbackBuffers[sessionId] ?? []
      const searchState: TerminalSearchState = {
        ...createDefaultSearchState(),
        ...opts,
        query,
      }

      const regex = buildSearchRegex(searchState)
      if (regex) {
        const matchLines: number[] = []
        let totalMatches = 0
        for (let i = 0; i < buffer.length && totalMatches < MAX_SEARCH_RESULTS; i++) {
          const matches = buffer[i].match(regex)
          if (matches) {
            matchLines.push(i)
            totalMatches += matches.length
          }
        }
        searchState.matchLines = matchLines
        searchState.matchCount = totalMatches
        searchState.currentMatchIndex = matchLines.length > 0 ? 0 : -1
      }

      set((s) => ({
        searchStates: { ...s.searchStates, [sessionId]: searchState },
      }))
    },

    nextMatch(sessionId) {
      const state = get()
      const search = state.searchStates[sessionId]
      if (!search || search.matchLines.length === 0) return -1

      const nextIndex = (search.currentMatchIndex + 1) % search.matchLines.length
      set((s) => ({
        searchStates: {
          ...s.searchStates,
          [sessionId]: { ...search, currentMatchIndex: nextIndex },
        },
      }))
      return search.matchLines[nextIndex]
    },

    previousMatch(sessionId) {
      const state = get()
      const search = state.searchStates[sessionId]
      if (!search || search.matchLines.length === 0) return -1

      const prevIndex =
        (search.currentMatchIndex - 1 + search.matchLines.length) %
        search.matchLines.length
      set((s) => ({
        searchStates: {
          ...s.searchStates,
          [sessionId]: { ...search, currentMatchIndex: prevIndex },
        },
      }))
      return search.matchLines[prevIndex]
    },

    clearSearch(sessionId) {
      set((s) => ({
        searchStates: {
          ...s.searchStates,
          [sessionId]: createDefaultSearchState(),
        },
      }))
    },

    // =====================================================================
    // Broadcast Mode
    // =====================================================================
    broadcastGroups: [],
    isBroadcasting: false,

    enableBroadcast(sessionIds) {
      if (sessionIds.length < 2) return
      set((s) => ({
        broadcastGroups: [...s.broadcastGroups, [...sessionIds]],
        isBroadcasting: true,
      }))
    },

    disableBroadcast() {
      set({ broadcastGroups: [], isBroadcasting: false })
    },

    broadcastInput(input) {
      const state = get()
      const recipients: string[] = []

      for (const group of state.broadcastGroups) {
        for (const sessionId of group) {
          if (state.sessions[sessionId]?.status === 'running') {
            api()?.ptyWrite?.(sessionId, input).catch(() => {})
            recipients.push(sessionId)
          }
        }
      }

      return recipients
    },

    addToBroadcast(sessionId) {
      set((s) => {
        if (s.broadcastGroups.length === 0) {
          return { broadcastGroups: [[sessionId]], isBroadcasting: true }
        }
        const groups = [...s.broadcastGroups]
        const lastGroup = [...groups[groups.length - 1]]
        if (!lastGroup.includes(sessionId)) {
          lastGroup.push(sessionId)
          groups[groups.length - 1] = lastGroup
        }
        return { broadcastGroups: groups }
      })
    },

    removeFromBroadcast(sessionId) {
      set((s) => {
        const groups = s.broadcastGroups
          .map((g) => g.filter((sid) => sid !== sessionId))
          .filter((g) => g.length > 1)
        return {
          broadcastGroups: groups,
          isBroadcasting: groups.length > 0,
        }
      })
    },

    // =====================================================================
    // Recording / Replay
    // =====================================================================
    recordings: {},

    startRecording(sessionId) {
      set((s) => ({
        recordings: {
          ...s.recordings,
          [sessionId]: {
            sessionId,
            startedAt: Date.now(),
            stoppedAt: null,
            entries: [],
            isRecording: true,
          },
        },
      }))
    },

    stopRecording(sessionId) {
      set((s) => {
        const rec = s.recordings[sessionId]
        if (!rec) return s
        return {
          recordings: {
            ...s.recordings,
            [sessionId]: { ...rec, stoppedAt: Date.now(), isRecording: false },
          },
        }
      })
    },

    addRecordingEntry(sessionId, entry) {
      set((s) => {
        const rec = s.recordings[sessionId]
        if (!rec || !rec.isRecording) return s
        const entries = [...rec.entries, { ...entry, timestamp: Date.now() }]
        // Cap recording size
        const trimmed =
          entries.length > MAX_RECORDING_ENTRIES
            ? entries.slice(entries.length - MAX_RECORDING_ENTRIES)
            : entries
        return {
          recordings: {
            ...s.recordings,
            [sessionId]: { ...rec, entries: trimmed },
          },
        }
      })
    },

    getRecording(sessionId) {
      return get().recordings[sessionId] ?? null
    },

    async replayRecording(sessionId, speed = 1) {
      const recording = get().recordings[sessionId]
      if (!recording || recording.entries.length === 0) return

      const session = get().sessions[sessionId]
      if (!session || session.status !== 'running') return

      let prevTimestamp = recording.entries[0].timestamp

      for (const entry of recording.entries) {
        // Compute delay based on original timing
        const delay = (entry.timestamp - prevTimestamp) / speed
        prevTimestamp = entry.timestamp

        if (delay > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, delay))
        }

        if (entry.type === 'input') {
          await api()?.ptyWrite?.(sessionId, entry.data)
        }
        // Output entries are skipped during replay (the PTY will produce output)
      }
    },

    clearRecording(sessionId) {
      set((s) => {
        const { [sessionId]: _, ...rest } = s.recordings
        return { recordings: rest }
      })
    },

    // =====================================================================
    // Auto-restart
    // =====================================================================
    autoRestartEnabled: true,

    setAutoRestart(enabled) {
      set({ autoRestartEnabled: enabled })
    },

    async handleSessionCrash(sessionId) {
      const state = get()
      const session = state.sessions[sessionId]
      if (!session) return

      // Mark as crashed
      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: { ...session, status: 'crashed' },
        },
      }))

      if (
        !state.autoRestartEnabled ||
        session.autoRestartCount >= MAX_AUTO_RESTART_ATTEMPTS
      ) {
        return
      }

      // Wait before restarting
      await new Promise<void>((resolve) =>
        setTimeout(resolve, AUTO_RESTART_DELAY_MS),
      )

      // Check if session still exists and is still crashed
      const current = get().sessions[sessionId]
      if (!current || current.status !== 'crashed') return

      set((s) => ({
        sessions: {
          ...s.sessions,
          [sessionId]: {
            ...current,
            status: 'restarting',
            autoRestartCount: current.autoRestartCount + 1,
          },
        },
      }))

      // Attempt to respawn the PTY
      try {
        const profile = current.profileId
          ? get().profiles[current.profileId]
          : null

        const result = await api()?.ptySpawn?.({
          id: sessionId,
          shellPath: profile?.shellPath ?? '',
          args: profile?.args ?? [],
          cwd: current.cwd,
          env: get().buildSessionEnv(sessionId),
          cols: 80,
          rows: 24,
        })

        if (result?.pid) {
          set((s) => ({
            sessions: {
              ...s.sessions,
              [sessionId]: {
                ...s.sessions[sessionId],
                status: 'running',
                process: {
                  ...s.sessions[sessionId].process,
                  pid: result.pid,
                  exitCode: null,
                  signal: null,
                },
              },
            },
          }))
        } else {
          set((s) => ({
            sessions: {
              ...s.sessions,
              [sessionId]: { ...s.sessions[sessionId], status: 'crashed' },
            },
          }))
        }
      } catch {
        set((s) => ({
          sessions: {
            ...s.sessions,
            [sessionId]: { ...s.sessions[sessionId], status: 'crashed' },
          },
        }))
      }
    },

    // =====================================================================
    // Serialization / Restore
    // =====================================================================

    serializeState() {
      const state = get()
      const sessions: SerializedMuxSession[] = Object.values(
        state.sessions,
      ).map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        profileId: s.profileId,
        cwd: s.cwd,
        env: s.env,
        scrollbackSize: s.scrollbackSize,
        titleOverride: s.titleOverride,
      }))

      const layout: SerializedMuxLayout = {
        sessions,
        activeSessionId: state.activeSessionId,
        splitNodes: state.splitNodes,
        rootNodeId: state.rootNodeId,
        broadcastGroupIds: state.broadcastGroups,
      }

      saveMuxToStorage(layout)
      return layout
    },

    async restoreState() {
      const layout = loadMuxFromStorage()
      if (!layout || layout.sessions.length === 0) return false

      // Recreate sessions via the PTY layer
      for (const saved of layout.sessions) {
        await get().createSession({
          id: saved.id,
          name: saved.name,
          type: saved.type,
          profileId: saved.profileId,
          cwd: saved.cwd,
          env: saved.env,
          scrollbackSize: saved.scrollbackSize,
          titleOverride: saved.titleOverride,
        })
      }

      // Restore split layout
      if (layout.rootNodeId && Object.keys(layout.splitNodes).length > 0) {
        set({
          splitNodes: layout.splitNodes,
          rootNodeId: layout.rootNodeId,
        })
      }

      // Restore active session
      if (layout.activeSessionId && get().sessions[layout.activeSessionId]) {
        set({ activeSessionId: layout.activeSessionId })
      }

      // Restore broadcast groups (only groups where all sessions still exist)
      const validGroups = layout.broadcastGroupIds.filter((group) =>
        group.every((sid) => get().sessions[sid]),
      )
      if (validGroups.length > 0) {
        set({ broadcastGroups: validGroups, isBroadcasting: true })
      }

      return true
    },

    clearPersistedState() {
      try {
        localStorage.removeItem(MUX_STORAGE_KEY)
      } catch {
        // ignore
      }
    },
  }
})

// ---------------------------------------------------------------------------
// Selector helpers (for use in React components)
// ---------------------------------------------------------------------------

export const selectActiveSession = (state: TerminalMuxStore) =>
  state.activeSessionId ? state.sessions[state.activeSessionId] ?? null : null

export const selectSessionList = (state: TerminalMuxStore) =>
  state.sessionOrder
    .map((id) => state.sessions[id])
    .filter(Boolean) as TerminalSession[]

export const selectRunningSessionCount = (state: TerminalMuxStore) =>
  Object.values(state.sessions).filter((s) => s.status === 'running').length

export const selectSessionsByType = (
  state: TerminalMuxStore,
  type: TerminalSessionType,
) => Object.values(state.sessions).filter((s) => s.type === type)

export const selectBroadcastRecipients = (state: TerminalMuxStore) =>
  state.broadcastGroups.flat()

export const selectIsRecording = (
  state: TerminalMuxStore,
  sessionId: string,
) => state.recordings[sessionId]?.isRecording ?? false

export const selectSearchState = (
  state: TerminalMuxStore,
  sessionId: string,
) => state.searchStates[sessionId] ?? null

export const selectShellIntegrationState = (
  state: TerminalMuxStore,
  sessionId: string,
) => state.shellIntegrations[sessionId]?.state ?? 'idle'
