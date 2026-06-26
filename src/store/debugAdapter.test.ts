/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  useDebugAdapterStore,
  type DebugConfiguration,
  type DebugThread,
  type StackFrame,
  type Scope,
  type Variable,
} from './debugAdapter'

/* ──────────────────────────────────────────────────────────
 * Setup
 *
 * `useDebugAdapterStore` is a module-level zustand singleton. We
 * import it and operate through `.getState()`.
 *
 * IPC: the store talks to the debug adapter through
 * `window.electron?.invoke(channel, payload)` — a fire-and-forget
 * transport. There is NO event listener registration inside this
 * store; DAP-style events (stopped / continued / output /
 * terminated) are modelled by the renderer calling the state
 * mutators (`updateSessionState`, `setThreads`, `setStackFrames`,
 * `setScopes`, `setVariables`, `addConsoleEntry`). We stub the
 * transport, capture every (channel, payload), and drive the
 * resolve/reject paths to simulate adapter responses.
 *
 * NOTE (pinned mismatch): the rest of the project conventionally
 * exposes `window.api` / `window.electronAPI`, but THIS store reads
 * `window.electron`. We pin the real behaviour here.
 *
 * Reset strategy: reset ONLY the data fields in beforeEach via
 * setState({...}) (no replace:true) so the action implementations
 * stay intact. `configurations` is restored to the production
 * default snapshot captured at import time.
 * ──────────────────────────────────────────────────────────── */

const store = useDebugAdapterStore

// Snapshot the production default configurations (captured before any test mutates).
const INITIAL_CONFIGS = store.getState().configurations.map(c => ({ ...c }))

let invokeMock: ReturnType<typeof vi.fn>

/** Wait for the microtask queue + a macrotask tick so invoke().then() chains run. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

const baseConfig: DebugConfiguration = {
  name: 'Node.js: Launch Program',
  type: 'node',
  request: 'launch',
  program: '/proj/src/index.ts',
}

/** Return every (channel, payload) the store invoked. */
function invokeCalls(): Array<[string, any]> {
  return invokeMock.mock.calls.map(c => [c[0], c[1]]) as Array<[string, any]>
}

/** Return payloads for a given channel. */
function payloadsFor(channel: string): any[] {
  return invokeCalls().filter(([ch]) => ch === channel).map(([, p]) => p)
}

function startSession(config: Partial<DebugConfiguration> = {}): string {
  return store.getState().startSession({ ...baseConfig, ...config })
}

beforeEach(() => {
  // Reset data fields only — keep actions intact.
  store.setState({
    sessions: [],
    activeSessionId: null,
    breakpoints: [],
    watchExpressions: [],
    consoleEntries: [],
    configurations: INITIAL_CONFIGS.map(c => ({ ...c })),
    recentConfigurations: [],
    showDebugConsole: false,
    maxConsoleEntries: 5000,
  })

  invokeMock = vi.fn().mockResolvedValue({})
  ;(window as any).electron = { invoke: invokeMock }
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete (window as any).electron
})

/* ──────────────────────────────────────────────────────────
 * Session lifecycle: start / launch / attach
 * ──────────────────────────────────────────────────────── */

describe('startSession (launch / attach / connect)', () => {
  it('creates an initializing session, activates it, opens the console, and invokes debug:start', () => {
    const id = startSession()
    const st = store.getState()
    const session = st.sessions.find(s => s.id === id)!

    expect(st.sessions).toHaveLength(1)
    expect(session.state).toBe('initializing')
    expect(session.name).toBe('Node.js: Launch Program')
    expect(session.type).toBe('node')
    expect(session.threads).toEqual([])
    expect(session.activeThreadId).toBeNull()
    expect(session.activeFrameId).toBeNull()
    expect(st.activeSessionId).toBe(id)
    expect(st.showDebugConsole).toBe(true)

    // Default capabilities pinned.
    expect(session.supportsConfigurationDone).toBe(true)
    expect(session.supportsSetVariable).toBe(false)
    expect(session.supportsStepBack).toBe(false)
    // Default exception filters.
    expect(session.exceptionBreakpointFilters.map(f => f.filter)).toEqual(['all', 'uncaught'])
    expect(session.exceptionBreakpointFilters.find(f => f.filter === 'uncaught')!.enabled).toBe(true)

    const startPayloads = payloadsFor('debug:start')
    expect(startPayloads).toHaveLength(1)
    expect(startPayloads[0].sessionId).toBe(id)
    expect(startPayloads[0].config.name).toBe('Node.js: Launch Program')
  })

  it('handles an attach configuration just like a launch (request field is preserved)', () => {
    const id = startSession({ name: 'Node.js: Attach', request: 'attach', port: 9229, program: undefined })
    const session = store.getState().sessions.find(s => s.id === id)!
    expect(session.configuration.request).toBe('attach')
    expect(session.configuration.port).toBe(9229)
    expect(payloadsFor('debug:start')[0].config.request).toBe('attach')
  })

  it('writes a "session started" info entry to the debug console', () => {
    startSession()
    const entries = store.getState().consoleEntries
    expect(entries).toHaveLength(1)
    expect(entries[0].type).toBe('info')
    expect(entries[0].text).toContain('Debug session started')
    expect(typeof entries[0].id).toBe('string')
    expect(typeof entries[0].timestamp).toBe('number')
  })

  it('pushes config name to recentConfigurations, de-duplicating and capping at 10', () => {
    startSession({ name: 'A' })
    startSession({ name: 'B' })
    startSession({ name: 'A' }) // re-launch A → moves to front, no duplicate
    expect(store.getState().recentConfigurations).toEqual(['A', 'B'])

    for (let i = 0; i < 15; i++) startSession({ name: `cfg-${i}` })
    expect(store.getState().recentConfigurations).toHaveLength(10)
    expect(store.getState().recentConfigurations[0]).toBe('cfg-14')
  })

  it('returns distinct ids for sequential sessions', () => {
    const a = startSession()
    const b = startSession()
    expect(a).not.toBe(b)
    expect(store.getState().sessions).toHaveLength(2)
  })

  it('marks the session "stopped" when the adapter rejects debug:start', async () => {
    invokeMock.mockRejectedValueOnce(new Error('adapter not found'))
    const id = startSession()
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('initializing')
    await flush()
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('stopped')
  })
})

/* ──────────────────────────────────────────────────────────
 * Session control: stop / pause / resume / restart
 * ──────────────────────────────────────────────────────── */

describe('stopSession', () => {
  it('removes the session, invokes debug:stop, and logs an info entry', () => {
    const id = startSession()
    store.getState().clearConsole()
    store.getState().stopSession(id)

    expect(store.getState().sessions.find(s => s.id === id)).toBeUndefined()
    expect(payloadsFor('debug:stop')[0]).toEqual({ sessionId: id })
    const entries = store.getState().consoleEntries
    expect(entries[entries.length - 1].text).toBe('Debug session ended')
  })

  it('re-points activeSessionId to the last remaining session when the active one is stopped', () => {
    const a = startSession({ name: 'A' })
    const b = startSession({ name: 'B' })
    expect(store.getState().activeSessionId).toBe(b)
    store.getState().stopSession(b)
    expect(store.getState().activeSessionId).toBe(a)
  })

  it('sets activeSessionId to null when the last session is stopped', () => {
    const id = startSession()
    store.getState().stopSession(id)
    expect(store.getState().activeSessionId).toBeNull()
  })

  it('leaves activeSessionId untouched when a non-active session is stopped', () => {
    const a = startSession({ name: 'A' })
    const b = startSession({ name: 'B' }) // b is active
    store.getState().stopSession(a)
    expect(store.getState().activeSessionId).toBe(b)
  })
})

describe('pauseSession / resumeSession', () => {
  it('pauseSession invokes debug:pause and transitions state to paused', () => {
    const id = startSession()
    store.getState().pauseSession(id)
    expect(payloadsFor('debug:pause')[0]).toEqual({ sessionId: id })
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('paused')
  })

  it('resumeSession invokes debug:continue and transitions state to running', () => {
    const id = startSession()
    store.getState().resumeSession(id)
    expect(payloadsFor('debug:continue')[0]).toEqual({ sessionId: id })
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('running')
  })
})

describe('restartSession', () => {
  it('stops the old session and starts a fresh one from the same configuration', () => {
    const id = startSession({ name: 'Restartable' })
    store.getState().restartSession(id)

    const sessions = store.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].id).not.toBe(id) // new id
    expect(sessions[0].name).toBe('Restartable')
    expect(sessions[0].state).toBe('initializing')
    // stop + two starts worth of IPC.
    expect(payloadsFor('debug:stop')).toHaveLength(1)
    expect(payloadsFor('debug:start')).toHaveLength(2)
  })

  it('is a no-op for an unknown session id', () => {
    startSession()
    const before = store.getState().sessions.length
    store.getState().restartSession('does-not-exist')
    expect(store.getState().sessions).toHaveLength(before)
    expect(payloadsFor('debug:stop')).toHaveLength(0)
  })
})

describe('setActiveSession / getActiveSession / updateSessionState', () => {
  it('setActiveSession switches the active session and getActiveSession resolves it', () => {
    const a = startSession({ name: 'A' })
    const b = startSession({ name: 'B' })
    store.getState().setActiveSession(a)
    expect(store.getState().getActiveSession()!.id).toBe(a)
    store.getState().setActiveSession(b)
    expect(store.getState().getActiveSession()!.id).toBe(b)
  })

  it('getActiveSession returns undefined when activeSessionId is null', () => {
    expect(store.getState().getActiveSession()).toBeUndefined()
  })

  it('updateSessionState only mutates the targeted session', () => {
    const a = startSession({ name: 'A' })
    const b = startSession({ name: 'B' })
    store.getState().updateSessionState(a, 'running')
    expect(store.getState().sessions.find(s => s.id === a)!.state).toBe('running')
    expect(store.getState().sessions.find(s => s.id === b)!.state).toBe('initializing')
  })
})

/* ──────────────────────────────────────────────────────────
 * DAP events modelled as state mutations:
 * stopped → setThreads/setStackFrames + state 'paused'
 * continued → state 'running'
 * output → addConsoleEntry
 * terminated → updateSessionState 'stopped' / stopSession
 * ──────────────────────────────────────────────────────── */

const thread = (id: number, name = `thread-${id}`): DebugThread => ({
  id,
  name,
  state: 'paused',
  stackFrames: [],
})

const frame = (id: number, line: number): StackFrame => ({
  id,
  name: `frame-${id}`,
  filePath: '/proj/src/index.ts',
  line,
  column: 1,
})

describe('thread population (setThreads)', () => {
  it('populates threads and defaults the active thread to the first when none is set', () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(7), thread(8)])
    const session = store.getState().sessions.find(s => s.id === id)!
    expect(session.threads.map(t => t.id)).toEqual([7, 8])
    expect(session.activeThreadId).toBe(7)
  })

  it('keeps an already-selected active thread when new threads arrive', () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(7)])
    store.getState().setActiveThread(7)
    store.getState().setThreads(id, [thread(7), thread(8)])
    expect(store.getState().sessions.find(s => s.id === id)!.activeThreadId).toBe(7)
  })

  it('leaves activeThreadId null when an empty thread list is provided', () => {
    const id = startSession()
    store.getState().setThreads(id, [])
    expect(store.getState().sessions.find(s => s.id === id)!.activeThreadId).toBeNull()
  })
})

describe('stack frame / scope / variable population', () => {
  it('setStackFrames replaces frames on the matching thread only', () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(1), thread(2)])
    store.getState().setStackFrames(id, 1, [frame(100, 10), frame(101, 11)])
    const session = store.getState().sessions.find(s => s.id === id)!
    expect(session.threads.find(t => t.id === 1)!.stackFrames.map(f => f.id)).toEqual([100, 101])
    expect(session.threads.find(t => t.id === 2)!.stackFrames).toEqual([])
  })

  it('setScopes stores scopes on the session', () => {
    const id = startSession()
    const scopes: Scope[] = [
      { name: 'Locals', variablesReference: 1000, expensive: false, variables: [] },
      { name: 'Globals', variablesReference: 1001, expensive: true, variables: [] },
    ]
    store.getState().setScopes(id, scopes)
    expect(store.getState().sessions.find(s => s.id === id)!.scopes.map(s => s.name)).toEqual(['Locals', 'Globals'])
  })

  it('setVariables fills the matching scope of the ACTIVE session by variablesReference', () => {
    const id = startSession()
    store.getState().setScopes(id, [
      { name: 'Locals', variablesReference: 1000, expensive: false, variables: [] },
      { name: 'Globals', variablesReference: 1001, expensive: false, variables: [] },
    ])
    const vars: Variable[] = [
      { name: 'x', value: '42', type: 'number', variablesReference: 0, expandable: false },
    ]
    store.getState().setVariables(1000, vars)
    const scopes = store.getState().sessions.find(s => s.id === id)!.scopes
    expect(scopes.find(s => s.variablesReference === 1000)!.variables).toHaveLength(1)
    expect(scopes.find(s => s.variablesReference === 1000)!.variables[0].name).toBe('x')
    expect(scopes.find(s => s.variablesReference === 1001)!.variables).toHaveLength(0)
  })

  it('setVariables targets only the active session when several exist', () => {
    const a = startSession({ name: 'A' })
    const b = startSession({ name: 'B' }) // b active
    store.getState().setScopes(a, [{ name: 'L', variablesReference: 5, expensive: false, variables: [] }])
    store.getState().setScopes(b, [{ name: 'L', variablesReference: 5, expensive: false, variables: [] }])
    store.getState().setVariables(5, [{ name: 'y', value: '1', type: 'number', variablesReference: 0, expandable: false }])
    expect(store.getState().sessions.find(s => s.id === a)!.scopes[0].variables).toHaveLength(0)
    expect(store.getState().sessions.find(s => s.id === b)!.scopes[0].variables).toHaveLength(1)
  })

  it('expandVariable requests children over IPC via debug:variables', () => {
    startSession()
    store.getState().expandVariable(2002)
    expect(payloadsFor('debug:variables')[0]).toEqual({ variablesReference: 2002 })
  })
})

/* ──────────────────────────────────────────────────────────
 * Stepping & control requests (performAction)
 * ──────────────────────────────────────────────────────── */

describe('performAction (stepping / control requests)', () => {
  it('continue invokes debug:continue with the active thread and sets state running', () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(3)])
    store.getState().updateSessionState(id, 'paused')
    store.getState().performAction('continue')
    expect(payloadsFor('debug:continue')[0]).toEqual({ sessionId: id, threadId: 3 })
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('running')
  })

  it.each([
    ['pause', 'debug:pause'],
    ['stepOver', 'debug:stepOver'],
    ['stepInto', 'debug:stepInto'],
    ['stepOut', 'debug:stepOut'],
    ['stepBack', 'debug:stepBack'],
    ['reverseContinue', 'debug:reverseContinue'],
  ] as const)('%s invokes %s with sessionId + active threadId', (action, channel) => {
    const id = startSession()
    store.getState().setThreads(id, [thread(9)])
    store.getState().performAction(action)
    expect(payloadsFor(channel)[0]).toEqual({ sessionId: id, threadId: 9 })
  })

  it('honours an explicit threadId argument over the active thread', () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(1)])
    store.getState().performAction('stepOver', 99)
    expect(payloadsFor('debug:stepOver')[0]).toEqual({ sessionId: id, threadId: 99 })
  })

  it('restart routes through restartSession (stop + new session)', () => {
    const id = startSession({ name: 'R' })
    store.getState().performAction('restart')
    expect(payloadsFor('debug:stop')).toHaveLength(1)
    expect(store.getState().sessions[0].id).not.toBe(id)
    expect(store.getState().sessions[0].name).toBe('R')
  })

  it('stop routes through stopSession (session removed)', () => {
    const id = startSession()
    store.getState().performAction('stop')
    expect(store.getState().sessions.find(s => s.id === id)).toBeUndefined()
    expect(payloadsFor('debug:stop')[0]).toEqual({ sessionId: id })
  })

  it('is a no-op when there is no active session', () => {
    store.getState().performAction('continue')
    expect(invokeMock).not.toHaveBeenCalled()
  })
})

/* ──────────────────────────────────────────────────────────
 * Breakpoints
 * ──────────────────────────────────────────────────────── */

describe('breakpoints', () => {
  it('addBreakpoint generates an id, defaults hitCount=0 / verified=false, and notifies the adapter', () => {
    const id = store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 10, enabled: true })
    const bp = store.getState().breakpoints.find(b => b.id === id)!
    expect(bp.hitCount).toBe(0)
    expect(bp.verified).toBe(false)
    expect(bp.line).toBe(10)
    const payload = payloadsFor('debug:setBreakpoints')[0]
    expect(payload.filePath).toBe('/a.ts')

    // SUSPECTED BUG: the just-added breakpoint is already in get().breakpoints,
    // and addBreakpoint also appends `breakpoint` again to the IPC payload, so the
    // adapter receives the new breakpoint duplicated. Pinning current behaviour.
    expect(payload.breakpoints).toHaveLength(2)
    expect(payload.breakpoints[0].id).toBe(id)
    expect(payload.breakpoints[1].id).toBe(id)
  })

  it('removeBreakpoint deletes the breakpoint and re-syncs remaining ones for that file', () => {
    const a = store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 1, enabled: true })
    const b = store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 2, enabled: true })
    invokeMock.mockClear()
    store.getState().removeBreakpoint(a)
    expect(store.getState().breakpoints.map(x => x.id)).toEqual([b])
    const payload = payloadsFor('debug:setBreakpoints')[0]
    expect(payload.filePath).toBe('/a.ts')
    expect(payload.breakpoints.map((x: any) => x.id)).toEqual([b])
  })

  it('removeBreakpoint for an unknown id does not call the adapter', () => {
    store.getState().removeBreakpoint('nope')
    expect(payloadsFor('debug:setBreakpoints')).toHaveLength(0)
  })

  it('toggleBreakpoint flips the enabled flag', () => {
    const id = store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 5, enabled: true })
    store.getState().toggleBreakpoint(id)
    expect(store.getState().breakpoints.find(b => b.id === id)!.enabled).toBe(false)
    store.getState().toggleBreakpoint(id)
    expect(store.getState().breakpoints.find(b => b.id === id)!.enabled).toBe(true)
  })

  it('toggleBreakpointAtLine adds when absent and removes when present', () => {
    store.getState().toggleBreakpointAtLine('/a.ts', 12)
    expect(store.getState().getBreakpointsForFile('/a.ts')).toHaveLength(1)
    store.getState().toggleBreakpointAtLine('/a.ts', 12)
    expect(store.getState().getBreakpointsForFile('/a.ts')).toHaveLength(0)
  })

  it('updateBreakpoint merges partial fields (e.g. condition)', () => {
    const id = store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 1, enabled: true })
    store.getState().updateBreakpoint(id, { condition: 'x > 5', type: 'conditional' })
    const bp = store.getState().breakpoints.find(b => b.id === id)!
    expect(bp.condition).toBe('x > 5')
    expect(bp.type).toBe('conditional')
  })

  it('verifyBreakpoint sets verified and optionally relocates the line', () => {
    const id = store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 10, enabled: true })
    store.getState().verifyBreakpoint(id, true, 12)
    let bp = store.getState().breakpoints.find(b => b.id === id)!
    expect(bp.verified).toBe(true)
    expect(bp.line).toBe(12)
    // Without a line arg, the existing line is preserved.
    store.getState().verifyBreakpoint(id, false)
    bp = store.getState().breakpoints.find(b => b.id === id)!
    expect(bp.verified).toBe(false)
    expect(bp.line).toBe(12)
  })

  it('getBreakpointsForFile filters by file path', () => {
    store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 1, enabled: true })
    store.getState().addBreakpoint({ type: 'line', filePath: '/b.ts', line: 1, enabled: true })
    expect(store.getState().getBreakpointsForFile('/a.ts')).toHaveLength(1)
    expect(store.getState().getBreakpointsForFile('/b.ts')).toHaveLength(1)
    expect(store.getState().getBreakpointsForFile('/c.ts')).toHaveLength(0)
  })

  it('clearBreakpoints(filePath) removes only that file; clearBreakpoints() removes all', () => {
    store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 1, enabled: true })
    store.getState().addBreakpoint({ type: 'line', filePath: '/b.ts', line: 1, enabled: true })
    store.getState().clearBreakpoints('/a.ts')
    expect(store.getState().breakpoints.map(b => b.filePath)).toEqual(['/b.ts'])
    store.getState().clearBreakpoints()
    expect(store.getState().breakpoints).toHaveLength(0)
  })

  it('enableAllBreakpoints / disableAllBreakpoints toggle every breakpoint', () => {
    store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 1, enabled: false })
    store.getState().addBreakpoint({ type: 'line', filePath: '/b.ts', line: 1, enabled: false })
    store.getState().enableAllBreakpoints()
    expect(store.getState().breakpoints.every(b => b.enabled)).toBe(true)
    store.getState().disableAllBreakpoints()
    expect(store.getState().breakpoints.every(b => !b.enabled)).toBe(true)
  })

  it('getVisibleBreakpointLines returns only enabled lines for the file as a Set', () => {
    store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 10, enabled: true })
    store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 20, enabled: false })
    store.getState().addBreakpoint({ type: 'line', filePath: '/a.ts', line: 30, enabled: true })
    store.getState().addBreakpoint({ type: 'line', filePath: '/b.ts', line: 99, enabled: true })
    const lines = store.getState().getVisibleBreakpointLines('/a.ts')
    expect(lines).toBeInstanceOf(Set)
    expect([...lines].sort((x, y) => x - y)).toEqual([10, 30])
  })
})

/* ──────────────────────────────────────────────────────────
 * Watch expressions
 * ──────────────────────────────────────────────────────── */

describe('watch expressions', () => {
  it('addWatch / removeWatch manage the watch list', () => {
    const id = store.getState().addWatch('user.name')
    expect(store.getState().watchExpressions).toHaveLength(1)
    expect(store.getState().watchExpressions[0].expression).toBe('user.name')
    store.getState().removeWatch(id)
    expect(store.getState().watchExpressions).toHaveLength(0)
  })

  it('editWatch updates the expression and clears the stale value/error', () => {
    const id = store.getState().addWatch('old')
    store.getState().updateWatchValue(id, '123', 'number')
    store.getState().editWatch(id, 'new')
    const w = store.getState().watchExpressions[0]
    expect(w.expression).toBe('new')
    expect(w.value).toBeUndefined()
    expect(w.error).toBeUndefined()
  })

  it('updateWatchValue stores value, type, and error', () => {
    const id = store.getState().addWatch('x')
    store.getState().updateWatchValue(id, '5', 'number')
    expect(store.getState().watchExpressions[0]).toMatchObject({ value: '5', type: 'number' })
    store.getState().updateWatchValue(id, '', undefined, 'not available')
    expect(store.getState().watchExpressions[0].error).toBe('not available')
  })

  it('refreshWatches evaluates each watch over IPC and writes back results when paused', async () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(1)])
    store.getState().setActiveFrame(55)
    store.getState().updateSessionState(id, 'paused')
    const w1 = store.getState().addWatch('a')
    const w2 = store.getState().addWatch('b')

    invokeMock.mockImplementation((channel: string, payload: any) => {
      if (channel === 'debug:evaluate') {
        return Promise.resolve({ result: `val:${payload.expression}`, type: 'string' })
      }
      return Promise.resolve({})
    })

    store.getState().refreshWatches()
    await flush()

    const evalPayloads = payloadsFor('debug:evaluate')
    expect(evalPayloads).toHaveLength(2)
    expect(evalPayloads[0]).toMatchObject({ sessionId: id, frameId: 55 })
    expect(store.getState().watchExpressions.find(w => w.id === w1)!.value).toBe('val:a')
    expect(store.getState().watchExpressions.find(w => w.id === w2)!.value).toBe('val:b')
  })

  it('refreshWatches records the error message when evaluation rejects', async () => {
    const id = startSession()
    store.getState().updateSessionState(id, 'paused')
    const w = store.getState().addWatch('boom')
    invokeMock.mockRejectedValue(new Error('eval failed'))
    store.getState().refreshWatches()
    await flush()
    const watch = store.getState().watchExpressions.find(x => x.id === w)!
    expect(watch.error).toBe('eval failed')
    expect(watch.value).toBe('')
  })

  it('refreshWatches does nothing when the session is not paused', () => {
    const id = startSession()
    store.getState().updateSessionState(id, 'running')
    store.getState().addWatch('x')
    store.getState().refreshWatches()
    expect(payloadsFor('debug:evaluate')).toHaveLength(0)
  })

  it('refreshWatches does nothing without an active session', () => {
    store.getState().addWatch('x')
    store.getState().refreshWatches()
    expect(payloadsFor('debug:evaluate')).toHaveLength(0)
  })
})

/* ──────────────────────────────────────────────────────────
 * Debug console (incl. output events & evaluate)
 * ──────────────────────────────────────────────────────── */

describe('debug console', () => {
  it('addConsoleEntry stamps an id + timestamp and appends in order (models output events)', () => {
    store.getState().addConsoleEntry({ type: 'output', text: 'hello' })
    store.getState().addConsoleEntry({ type: 'error', text: 'oops', source: 'stderr' })
    const entries = store.getState().consoleEntries
    expect(entries).toHaveLength(2)
    expect(entries[0].text).toBe('hello')
    expect(entries[1].type).toBe('error')
    expect(entries[1].source).toBe('stderr')
    expect(entries.every(e => typeof e.id === 'string' && typeof e.timestamp === 'number')).toBe(true)
  })

  it('trims the oldest entries once maxConsoleEntries is exceeded', () => {
    store.setState({ maxConsoleEntries: 3 })
    for (let i = 0; i < 5; i++) store.getState().addConsoleEntry({ type: 'output', text: `line-${i}` })
    const entries = store.getState().consoleEntries
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.text)).toEqual(['line-2', 'line-3', 'line-4'])
  })

  it('clearConsole empties the console', () => {
    store.getState().addConsoleEntry({ type: 'output', text: 'x' })
    store.getState().clearConsole()
    expect(store.getState().consoleEntries).toHaveLength(0)
  })

  it('evaluateInConsole logs the input then the adapter result as output', async () => {
    const id = startSession()
    store.getState().setActiveFrame(7)
    store.getState().clearConsole()
    invokeMock.mockImplementation((channel: string) =>
      channel === 'debug:evaluate'
        ? Promise.resolve({ result: '42', variablesReference: 0 })
        : Promise.resolve({})
    )

    store.getState().evaluateInConsole('1 + 41')
    // Input entry is synchronous.
    expect(store.getState().consoleEntries.map(e => [e.type, e.text])).toEqual([['input', '1 + 41']])
    const evalPayload = payloadsFor('debug:evaluate')[0]
    expect(evalPayload).toMatchObject({ sessionId: id, expression: '1 + 41', frameId: 7, context: 'repl' })

    await flush()
    const entries = store.getState().consoleEntries
    expect(entries.map(e => [e.type, e.text])).toEqual([['input', '1 + 41'], ['output', '42']])
  })

  it('evaluateInConsole logs an error entry when no session is active', () => {
    store.getState().evaluateInConsole('foo')
    const entries = store.getState().consoleEntries
    expect(entries.map(e => [e.type, e.text])).toEqual([['input', 'foo'], ['error', 'No active debug session']])
    expect(payloadsFor('debug:evaluate')).toHaveLength(0)
  })

  it('evaluateInConsole logs an error entry when the adapter rejects', async () => {
    startSession()
    store.getState().clearConsole()
    invokeMock.mockRejectedValue(new Error('bad expr'))
    store.getState().evaluateInConsole('boom')
    await flush()
    const entries = store.getState().consoleEntries
    expect(entries[entries.length - 1]).toMatchObject({ type: 'error', text: 'bad expr' })
  })
})

/* ──────────────────────────────────────────────────────────
 * Launch configurations
 * ──────────────────────────────────────────────────────── */

describe('configurations', () => {
  it('ships the default configurations on init', () => {
    expect(store.getState().configurations.length).toBeGreaterThanOrEqual(6)
    expect(store.getState().configurations.map(c => c.name)).toContain('Node.js: Launch Program')
  })

  it('addConfiguration appends a new config and replaces one with the same name', () => {
    const before = store.getState().configurations.length
    store.getState().addConfiguration({ name: 'My Custom', type: 'node', request: 'launch' })
    expect(store.getState().configurations.length).toBe(before + 1)

    store.getState().addConfiguration({ name: 'My Custom', type: 'python', request: 'launch' })
    expect(store.getState().configurations.length).toBe(before + 1) // replaced, not duplicated
    expect(store.getState().configurations.find(c => c.name === 'My Custom')!.type).toBe('python')
  })

  it('removeConfiguration deletes by name', () => {
    store.getState().removeConfiguration('Node.js: Launch Program')
    expect(store.getState().configurations.find(c => c.name === 'Node.js: Launch Program')).toBeUndefined()
  })

  it('updateConfiguration merges partial fields by name', () => {
    store.getState().updateConfiguration('Node.js: Attach', { port: 5858 })
    expect(store.getState().configurations.find(c => c.name === 'Node.js: Attach')!.port).toBe(5858)
  })

  it('getConfigurationsByType filters by adapter type', () => {
    const nodeConfigs = store.getState().getConfigurationsByType('node')
    expect(nodeConfigs.length).toBeGreaterThanOrEqual(2)
    expect(nodeConfigs.every(c => c.type === 'node')).toBe(true)
    expect(store.getState().getConfigurationsByType('nonexistent')).toHaveLength(0)
  })
})

/* ──────────────────────────────────────────────────────────
 * Query selectors
 * ──────────────────────────────────────────────────────── */

describe('query selectors', () => {
  it('isDebugging is true when any session is running or paused', () => {
    const id = startSession()
    expect(store.getState().isDebugging()).toBe(false) // initializing only
    store.getState().updateSessionState(id, 'running')
    expect(store.getState().isDebugging()).toBe(true)
    store.getState().updateSessionState(id, 'paused')
    expect(store.getState().isDebugging()).toBe(true)
    store.getState().updateSessionState(id, 'stopped')
    expect(store.getState().isDebugging()).toBe(false)
  })

  it('isPaused reflects the active session state', () => {
    const id = startSession()
    expect(store.getState().isPaused()).toBe(false)
    store.getState().updateSessionState(id, 'paused')
    expect(store.getState().isPaused()).toBe(true)
  })

  it('getActiveThread / getActiveFrame resolve the selected thread and frame', () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(1), thread(2)])
    store.getState().setStackFrames(id, 1, [frame(500, 5), frame(501, 6)])
    store.getState().setActiveThread(1)
    store.getState().setActiveFrame(501)

    expect(store.getState().getActiveThread()!.id).toBe(1)
    expect(store.getState().getActiveFrame()!.id).toBe(501)
    expect(store.getState().getActiveFrame()!.line).toBe(6)
  })

  it('getActiveThread / getActiveFrame return undefined when nothing is selected', () => {
    expect(store.getState().getActiveThread()).toBeUndefined()
    expect(store.getState().getActiveFrame()).toBeUndefined()
    const id = startSession()
    store.getState().setThreads(id, [thread(1)])
    // active frame never set → undefined frame even though thread resolves.
    expect(store.getState().getActiveThread()!.id).toBe(1)
    expect(store.getState().getActiveFrame()).toBeUndefined()
  })
})

/* ──────────────────────────────────────────────────────────
 * Transport-absent resilience
 * ──────────────────────────────────────────────────────── */

describe('missing IPC transport', () => {
  it('startSession still updates local state when window.electron is absent', () => {
    delete (window as any).electron
    const id = startSession()
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('initializing')
    expect(store.getState().activeSessionId).toBe(id)
  })

  it('performAction tolerates a missing transport (optional chaining, no throw)', () => {
    const id = startSession()
    store.getState().setThreads(id, [thread(1)])
    delete (window as any).electron
    expect(() => store.getState().performAction('stepOver')).not.toThrow()
  })
})
