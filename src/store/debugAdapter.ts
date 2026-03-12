/**
 * Debug Adapter Protocol (DAP) store.
 * Manages debug sessions, breakpoints, call stacks,
 * variables, watches, and debug console.
 */

import { create } from 'zustand'

/* ── Types ─────────────────────────────────────────────── */

export type DebugState = 'inactive' | 'initializing' | 'running' | 'paused' | 'stopped'

export type BreakpointType = 'line' | 'conditional' | 'logpoint' | 'function' | 'data' | 'exception'

export interface Breakpoint {
  id: string
  type: BreakpointType
  filePath: string
  line: number
  column?: number
  enabled: boolean
  verified: boolean
  condition?: string
  hitCondition?: string
  logMessage?: string
  hitCount: number
}

export interface StackFrame {
  id: number
  name: string
  filePath: string
  line: number
  column: number
  moduleId?: string
  presentationHint?: 'normal' | 'label' | 'subtle'
  source?: DebugSource
}

export interface DebugSource {
  name: string
  path: string
  sourceReference?: number
  presentationHint?: 'normal' | 'emphasize' | 'deemphasize'
}

export interface DebugThread {
  id: number
  name: string
  state: 'running' | 'paused' | 'stopped'
  stackFrames: StackFrame[]
}

export interface Variable {
  name: string
  value: string
  type: string
  variablesReference: number
  evaluateName?: string
  children?: Variable[]
  expandable: boolean
  memoryReference?: string
  presentationHint?: {
    kind?: 'property' | 'method' | 'class' | 'data' | 'event' | 'baseClass' | 'innerClass' | 'interface' | 'virtual'
    attributes?: ('static' | 'constant' | 'readOnly' | 'rawString' | 'hasObjectId' | 'canHaveObjectId' | 'hasSideEffects')[]
    visibility?: 'public' | 'private' | 'protected' | 'internal' | 'final'
  }
}

export interface Scope {
  name: string
  variablesReference: number
  expensive: boolean
  namedVariables?: number
  indexedVariables?: number
  variables: Variable[]
}

export interface WatchExpression {
  id: string
  expression: string
  value?: string
  type?: string
  error?: string
}

export interface DebugConsoleEntry {
  id: string
  type: 'input' | 'output' | 'error' | 'warning' | 'info'
  text: string
  timestamp: number
  source?: string
  variablesReference?: number
}

export interface DebugConfiguration {
  name: string
  type: string
  request: 'launch' | 'attach'
  program?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  port?: number
  host?: string
  sourceMaps?: boolean
  outFiles?: string[]
  stopOnEntry?: boolean
  console?: 'internalConsole' | 'integratedTerminal' | 'externalTerminal'
  preLaunchTask?: string
  postDebugTask?: string
  [key: string]: any
}

export interface DebugSession {
  id: string
  name: string
  type: string
  configuration: DebugConfiguration
  state: DebugState
  threads: DebugThread[]
  activeThreadId: number | null
  activeFrameId: number | null
  scopes: Scope[]
  startedAt: number
  supportsConfigurationDone: boolean
  supportsSetVariable: boolean
  supportsRestartFrame: boolean
  supportsStepBack: boolean
  supportsCompletions: boolean
  exceptionBreakpointFilters: ExceptionBreakpointFilter[]
}

export interface ExceptionBreakpointFilter {
  filter: string
  label: string
  description?: string
  default?: boolean
  enabled: boolean
}

export type DebugAction =
  | 'continue'
  | 'pause'
  | 'stepOver'
  | 'stepInto'
  | 'stepOut'
  | 'restart'
  | 'stop'
  | 'stepBack'
  | 'reverseContinue'

/* ── Store ─────────────────────────────────────────────── */

interface DebugAdapterState {
  sessions: DebugSession[]
  activeSessionId: string | null
  breakpoints: Breakpoint[]
  watchExpressions: WatchExpression[]
  consoleEntries: DebugConsoleEntry[]
  configurations: DebugConfiguration[]
  recentConfigurations: string[]
  showDebugConsole: boolean
  maxConsoleEntries: number

  // Session management
  startSession: (config: DebugConfiguration) => string
  stopSession: (sessionId: string) => void
  pauseSession: (sessionId: string) => void
  resumeSession: (sessionId: string) => void
  restartSession: (sessionId: string) => void
  setActiveSession: (sessionId: string | null) => void
  getActiveSession: () => DebugSession | undefined
  updateSessionState: (sessionId: string, state: DebugState) => void

  // Thread & stack management
  setThreads: (sessionId: string, threads: DebugThread[]) => void
  setActiveThread: (threadId: number) => void
  setActiveFrame: (frameId: number) => void
  setStackFrames: (sessionId: string, threadId: number, frames: StackFrame[]) => void

  // Scopes & variables
  setScopes: (sessionId: string, scopes: Scope[]) => void
  setVariables: (scopeRef: number, variables: Variable[]) => void
  expandVariable: (variablesReference: number) => void

  // Breakpoints
  addBreakpoint: (bp: Omit<Breakpoint, 'id' | 'hitCount' | 'verified'>) => string
  removeBreakpoint: (id: string) => void
  toggleBreakpoint: (id: string) => void
  toggleBreakpointAtLine: (filePath: string, line: number) => void
  updateBreakpoint: (id: string, updates: Partial<Breakpoint>) => void
  verifyBreakpoint: (id: string, verified: boolean, line?: number) => void
  getBreakpointsForFile: (filePath: string) => Breakpoint[]
  clearBreakpoints: (filePath?: string) => void
  enableAllBreakpoints: () => void
  disableAllBreakpoints: () => void

  // Watch expressions
  addWatch: (expression: string) => string
  removeWatch: (id: string) => void
  editWatch: (id: string, expression: string) => void
  updateWatchValue: (id: string, value: string, type?: string, error?: string) => void
  refreshWatches: () => void

  // Console
  addConsoleEntry: (entry: Omit<DebugConsoleEntry, 'id' | 'timestamp'>) => void
  clearConsole: () => void
  evaluateInConsole: (expression: string) => void

  // Configurations
  addConfiguration: (config: DebugConfiguration) => void
  removeConfiguration: (name: string) => void
  updateConfiguration: (name: string, config: Partial<DebugConfiguration>) => void
  getConfigurationsByType: (type: string) => DebugConfiguration[]

  // Debug actions
  performAction: (action: DebugAction, threadId?: number) => void

  // Queries
  isDebugging: () => boolean
  isPaused: () => boolean
  getActiveThread: () => DebugThread | undefined
  getActiveFrame: () => StackFrame | undefined
  getVisibleBreakpointLines: (filePath: string) => Set<number>
}

/* ── Default Configurations ───────────────────────────── */

const DEFAULT_CONFIGS: DebugConfiguration[] = [
  {
    name: 'Node.js: Launch Program',
    type: 'node',
    request: 'launch',
    program: '${workspaceFolder}/src/index.ts',
    sourceMaps: true,
    outFiles: ['${workspaceFolder}/dist/**/*.js'],
    console: 'integratedTerminal',
  },
  {
    name: 'Node.js: Attach',
    type: 'node',
    request: 'attach',
    port: 9229,
    sourceMaps: true,
  },
  {
    name: 'Python: Current File',
    type: 'python',
    request: 'launch',
    program: '${file}',
    console: 'integratedTerminal',
  },
  {
    name: 'Chrome: Launch',
    type: 'chrome',
    request: 'launch',
    url: 'http://localhost:3000',
    sourceMaps: true,
  },
  {
    name: 'Rust: Launch',
    type: 'lldb',
    request: 'launch',
    program: '${workspaceFolder}/target/debug/${workspaceFolderBasename}',
    args: [],
    cwd: '${workspaceFolder}',
  },
  {
    name: 'Go: Launch',
    type: 'go',
    request: 'launch',
    program: '${workspaceFolder}',
  },
]

/* ── Store Implementation ──────────────────────────────── */

export const useDebugAdapterStore = create<DebugAdapterState>()((set, get) => ({
  sessions: [],
  activeSessionId: null,
  breakpoints: [],
  watchExpressions: [],
  consoleEntries: [],
  configurations: DEFAULT_CONFIGS,
  recentConfigurations: [],
  showDebugConsole: false,
  maxConsoleEntries: 5000,

  startSession: (config) => {
    const id = `debug-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const session: DebugSession = {
      id,
      name: config.name,
      type: config.type,
      configuration: config,
      state: 'initializing',
      threads: [],
      activeThreadId: null,
      activeFrameId: null,
      scopes: [],
      startedAt: Date.now(),
      supportsConfigurationDone: true,
      supportsSetVariable: false,
      supportsRestartFrame: false,
      supportsStepBack: false,
      supportsCompletions: false,
      exceptionBreakpointFilters: [
        { filter: 'all', label: 'All Exceptions', enabled: false },
        { filter: 'uncaught', label: 'Uncaught Exceptions', enabled: true },
      ],
    }

    set(s => ({
      sessions: [...s.sessions, session],
      activeSessionId: id,
      showDebugConsole: true,
      recentConfigurations: [config.name, ...s.recentConfigurations.filter(n => n !== config.name)].slice(0, 10),
    }))

    get().addConsoleEntry({ type: 'info', text: `Debug session started: ${config.name}` })

    // Simulate DAP initialization via IPC
    window.electron?.invoke('debug:start', { sessionId: id, config }).catch(() => {
      get().updateSessionState(id, 'stopped')
    })

    return id
  },

  stopSession: (sessionId) => {
    window.electron?.invoke('debug:stop', { sessionId }).catch(() => {})
    set(s => {
      const sessions = s.sessions.filter(ss => ss.id !== sessionId)
      return {
        sessions,
        activeSessionId: s.activeSessionId === sessionId
          ? sessions[sessions.length - 1]?.id || null
          : s.activeSessionId,
      }
    })
    get().addConsoleEntry({ type: 'info', text: 'Debug session ended' })
  },

  pauseSession: (sessionId) => {
    window.electron?.invoke('debug:pause', { sessionId }).catch(() => {})
    get().updateSessionState(sessionId, 'paused')
  },

  resumeSession: (sessionId) => {
    window.electron?.invoke('debug:continue', { sessionId }).catch(() => {})
    get().updateSessionState(sessionId, 'running')
  },

  restartSession: (sessionId) => {
    const session = get().sessions.find(s => s.id === sessionId)
    if (session) {
      get().stopSession(sessionId)
      get().startSession(session.configuration)
    }
  },

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  getActiveSession: () => {
    const { sessions, activeSessionId } = get()
    return sessions.find(s => s.id === activeSessionId)
  },

  updateSessionState: (sessionId, state) => {
    set(s => ({
      sessions: s.sessions.map(ss =>
        ss.id === sessionId ? { ...ss, state } : ss
      ),
    }))
  },

  setThreads: (sessionId, threads) => {
    set(s => ({
      sessions: s.sessions.map(ss =>
        ss.id === sessionId
          ? { ...ss, threads, activeThreadId: ss.activeThreadId || threads[0]?.id || null }
          : ss
      ),
    }))
  },

  setActiveThread: (threadId) => {
    set(s => ({
      sessions: s.sessions.map(ss =>
        ss.id === s.activeSessionId
          ? { ...ss, activeThreadId: threadId }
          : ss
      ),
    }))
  },

  setActiveFrame: (frameId) => {
    set(s => ({
      sessions: s.sessions.map(ss =>
        ss.id === s.activeSessionId
          ? { ...ss, activeFrameId: frameId }
          : ss
      ),
    }))
  },

  setStackFrames: (sessionId, threadId, frames) => {
    set(s => ({
      sessions: s.sessions.map(ss =>
        ss.id === sessionId
          ? {
              ...ss,
              threads: ss.threads.map(t =>
                t.id === threadId ? { ...t, stackFrames: frames } : t
              ),
            }
          : ss
      ),
    }))
  },

  setScopes: (sessionId, scopes) => {
    set(s => ({
      sessions: s.sessions.map(ss =>
        ss.id === sessionId ? { ...ss, scopes } : ss
      ),
    }))
  },

  setVariables: (scopeRef, variables) => {
    set(s => ({
      sessions: s.sessions.map(ss =>
        ss.id === s.activeSessionId
          ? {
              ...ss,
              scopes: ss.scopes.map(sc =>
                sc.variablesReference === scopeRef ? { ...sc, variables } : sc
              ),
            }
          : ss
      ),
    }))
  },

  expandVariable: (variablesReference) => {
    window.electron?.invoke('debug:variables', { variablesReference }).catch(() => {})
  },

  // Breakpoints
  addBreakpoint: (bp) => {
    const id = `bp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const breakpoint: Breakpoint = {
      ...bp,
      id,
      hitCount: 0,
      verified: false,
    }
    set(s => ({ breakpoints: [...s.breakpoints, breakpoint] }))

    // Notify debug adapter
    window.electron?.invoke('debug:setBreakpoints', {
      filePath: bp.filePath,
      breakpoints: [...get().breakpoints.filter(b => b.filePath === bp.filePath), breakpoint],
    }).catch(() => {})

    return id
  },

  removeBreakpoint: (id) => {
    const bp = get().breakpoints.find(b => b.id === id)
    set(s => ({ breakpoints: s.breakpoints.filter(b => b.id !== id) }))
    if (bp) {
      window.electron?.invoke('debug:setBreakpoints', {
        filePath: bp.filePath,
        breakpoints: get().breakpoints.filter(b => b.filePath === bp.filePath),
      }).catch(() => {})
    }
  },

  toggleBreakpoint: (id) => {
    set(s => ({
      breakpoints: s.breakpoints.map(b =>
        b.id === id ? { ...b, enabled: !b.enabled } : b
      ),
    }))
  },

  toggleBreakpointAtLine: (filePath, line) => {
    const existing = get().breakpoints.find(b => b.filePath === filePath && b.line === line)
    if (existing) {
      get().removeBreakpoint(existing.id)
    } else {
      get().addBreakpoint({ type: 'line', filePath, line, enabled: true })
    }
  },

  updateBreakpoint: (id, updates) => {
    set(s => ({
      breakpoints: s.breakpoints.map(b =>
        b.id === id ? { ...b, ...updates } : b
      ),
    }))
  },

  verifyBreakpoint: (id, verified, line) => {
    set(s => ({
      breakpoints: s.breakpoints.map(b =>
        b.id === id ? { ...b, verified, line: line ?? b.line } : b
      ),
    }))
  },

  getBreakpointsForFile: (filePath) => {
    return get().breakpoints.filter(b => b.filePath === filePath)
  },

  clearBreakpoints: (filePath) => {
    if (filePath) {
      set(s => ({ breakpoints: s.breakpoints.filter(b => b.filePath !== filePath) }))
    } else {
      set({ breakpoints: [] })
    }
  },

  enableAllBreakpoints: () => {
    set(s => ({
      breakpoints: s.breakpoints.map(b => ({ ...b, enabled: true })),
    }))
  },

  disableAllBreakpoints: () => {
    set(s => ({
      breakpoints: s.breakpoints.map(b => ({ ...b, enabled: false })),
    }))
  },

  // Watch expressions
  addWatch: (expression) => {
    const id = `watch-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
    set(s => ({
      watchExpressions: [...s.watchExpressions, { id, expression }],
    }))
    return id
  },

  removeWatch: (id) => {
    set(s => ({
      watchExpressions: s.watchExpressions.filter(w => w.id !== id),
    }))
  },

  editWatch: (id, expression) => {
    set(s => ({
      watchExpressions: s.watchExpressions.map(w =>
        w.id === id ? { ...w, expression, value: undefined, error: undefined } : w
      ),
    }))
  },

  updateWatchValue: (id, value, type, error) => {
    set(s => ({
      watchExpressions: s.watchExpressions.map(w =>
        w.id === id ? { ...w, value, type, error } : w
      ),
    }))
  },

  refreshWatches: () => {
    const session = get().getActiveSession()
    if (!session || session.state !== 'paused') return

    for (const watch of get().watchExpressions) {
      window.electron?.invoke('debug:evaluate', {
        sessionId: session.id,
        expression: watch.expression,
        frameId: session.activeFrameId,
      }).then((result: any) => {
        get().updateWatchValue(watch.id, result.result, result.type)
      }).catch((err: any) => {
        get().updateWatchValue(watch.id, '', undefined, err.message)
      })
    }
  },

  // Console
  addConsoleEntry: (entry) => {
    const id = `console-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    set(s => {
      const entries = [...s.consoleEntries, { ...entry, id, timestamp: Date.now() }]
      if (entries.length > s.maxConsoleEntries) {
        entries.splice(0, entries.length - s.maxConsoleEntries)
      }
      return { consoleEntries: entries }
    })
  },

  clearConsole: () => set({ consoleEntries: [] }),

  evaluateInConsole: (expression) => {
    get().addConsoleEntry({ type: 'input', text: expression })

    const session = get().getActiveSession()
    if (!session) {
      get().addConsoleEntry({ type: 'error', text: 'No active debug session' })
      return
    }

    window.electron?.invoke('debug:evaluate', {
      sessionId: session.id,
      expression,
      frameId: session.activeFrameId,
      context: 'repl',
    }).then((result: any) => {
      get().addConsoleEntry({
        type: 'output',
        text: result.result,
        variablesReference: result.variablesReference,
      })
    }).catch((err: any) => {
      get().addConsoleEntry({ type: 'error', text: err.message || 'Evaluation failed' })
    })
  },

  // Configurations
  addConfiguration: (config) => {
    set(s => ({
      configurations: [...s.configurations.filter(c => c.name !== config.name), config],
    }))
  },

  removeConfiguration: (name) => {
    set(s => ({
      configurations: s.configurations.filter(c => c.name !== name),
    }))
  },

  updateConfiguration: (name, updates) => {
    set(s => ({
      configurations: s.configurations.map(c =>
        c.name === name ? { ...c, ...updates } : c
      ),
    }))
  },

  getConfigurationsByType: (type) => {
    return get().configurations.filter(c => c.type === type)
  },

  // Debug actions
  performAction: (action, threadId) => {
    const session = get().getActiveSession()
    if (!session) return

    const tid = threadId ?? session.activeThreadId
    const sessionId = session.id

    switch (action) {
      case 'continue':
        window.electron?.invoke('debug:continue', { sessionId, threadId: tid }).catch(() => {})
        get().updateSessionState(sessionId, 'running')
        break
      case 'pause':
        window.electron?.invoke('debug:pause', { sessionId, threadId: tid }).catch(() => {})
        break
      case 'stepOver':
        window.electron?.invoke('debug:stepOver', { sessionId, threadId: tid }).catch(() => {})
        break
      case 'stepInto':
        window.electron?.invoke('debug:stepInto', { sessionId, threadId: tid }).catch(() => {})
        break
      case 'stepOut':
        window.electron?.invoke('debug:stepOut', { sessionId, threadId: tid }).catch(() => {})
        break
      case 'restart':
        get().restartSession(sessionId)
        break
      case 'stop':
        get().stopSession(sessionId)
        break
      case 'stepBack':
        window.electron?.invoke('debug:stepBack', { sessionId, threadId: tid }).catch(() => {})
        break
      case 'reverseContinue':
        window.electron?.invoke('debug:reverseContinue', { sessionId, threadId: tid }).catch(() => {})
        break
    }
  },

  // Queries
  isDebugging: () => {
    return get().sessions.some(s => s.state === 'running' || s.state === 'paused')
  },

  isPaused: () => {
    const session = get().getActiveSession()
    return session?.state === 'paused'
  },

  getActiveThread: () => {
    const session = get().getActiveSession()
    if (!session) return undefined
    return session.threads.find(t => t.id === session.activeThreadId)
  },

  getActiveFrame: () => {
    const thread = get().getActiveThread()
    const session = get().getActiveSession()
    if (!thread || !session) return undefined
    return thread.stackFrames.find(f => f.id === session.activeFrameId)
  },

  getVisibleBreakpointLines: (filePath) => {
    return new Set(
      get().breakpoints
        .filter(b => b.filePath === filePath && b.enabled)
        .map(b => b.line)
    )
  },
}))
