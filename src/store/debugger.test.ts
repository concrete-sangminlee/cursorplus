/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useDebuggerStore,
  type DebugSession,
  type DebugScope,
  type LaunchConfiguration,
} from './debugger'

/* ──────────────────────────────────────────────────────────
 * Setup
 *
 * Module-level zustand singleton. We import it, reset only the
 * DATA fields in beforeEach (never replace:true, so the actions
 * stay intact), and drive it through `.getState()`.
 *
 * IPC: the store reads the namespace `window.api` (see
 * `const api = () => (window as any).api`) and calls methods like
 * debugStart / debugStop / debugEvaluate / debugGetVariables /
 * debugSetBreakpoint, etc. Several of those are awaited
 * (`.then().catch()`), so the mocks for the async ones must
 * return promises. We stub exactly the methods the store uses.
 *
 * The store also touches localStorage in setLastUsedConfig, which
 * is why the jsdom environment directive sits at the top.
 *
 * NOTE on ids: nextBreakpointId / nextWatchId / nextConsoleId /
 * nextSessionId are module-level counters that are NOT reset
 * between tests. Tests therefore assert on ids returned by the
 * store (or found via lookup) rather than hard-coded values.
 * ──────────────────────────────────────────────────────────── */

const store = useDebuggerStore

let apiMock: Record<string, ReturnType<typeof vi.fn>>

/** Drain the microtask/timer queue so awaited IPC `.then()` runs. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

function makeConfig(overrides: Partial<LaunchConfiguration> = {}): LaunchConfiguration {
  return {
    name: 'Node.js: Current File',
    type: 'node',
    request: 'launch',
    program: '${file}',
    ...overrides,
  }
}

/** Build a session object directly (so we can control its state). */
function makeSession(overrides: Partial<DebugSession> = {}): DebugSession {
  return {
    id: 'session-x',
    name: 'sess',
    type: 'node',
    state: 'running',
    config: makeConfig(),
    threads: [],
    scopes: [],
    startTime: 0,
    capabilities: {
      supportsConditionalBreakpoints: true,
      supportsHitConditionalBreakpoints: true,
      supportsLogPoints: true,
      supportsEvaluateForHovers: true,
      supportsStepBack: false,
      supportsRestartFrame: true,
      supportsExceptionInfoRequest: true,
      supportsTerminateRequest: true,
      supportsDataBreakpoints: false,
      supportsSetVariable: true,
    },
    ...overrides,
  }
}

/** Install a paused, active session and return its id. */
function installPausedSession(id = 'session-paused'): string {
  store.setState({
    sessions: [makeSession({ id, state: 'paused' })],
    activeSessionId: id,
  })
  return id
}

beforeEach(() => {
  // Reset ONLY the data fields. No replace:true — keep the actions.
  store.setState({
    sessions: [],
    activeSessionId: null,
    breakpoints: [],
    watchExpressions: [],
    consoleEntries: [],
    exceptionBreakpoints: [
      { filter: 'uncaught', enabled: true },
      { filter: 'caught', enabled: false },
    ],
    showDebugToolbar: false,
    lastUsedConfig: null,
    configurations: [],
  })

  apiMock = {
    debugStart: vi.fn().mockResolvedValue(undefined),
    debugStop: vi.fn(),
    debugPause: vi.fn(),
    debugContinue: vi.fn(),
    debugStepOver: vi.fn(),
    debugStepInto: vi.fn(),
    debugStepOut: vi.fn(),
    debugStepBack: vi.fn(),
    debugRunToCursor: vi.fn(),
    debugSetBreakpoint: vi.fn(),
    debugRemoveBreakpoint: vi.fn(),
    debugEvaluate: vi.fn().mockResolvedValue({ value: '42', type: 'number' }),
    debugGetVariables: vi.fn().mockResolvedValue([]),
    debugSetVariable: vi.fn(),
  }
  ;(window as any).api = apiMock
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  delete (window as any).api
})

/* ── Breakpoints: add / remove / toggle / enable ─────────── */

describe('breakpoints', () => {
  it('addBreakpoint creates an enabled, unverified breakpoint and notifies IPC', () => {
    const bp = store.getState().addBreakpoint('a.ts', 10)

    expect(bp.file).toBe('a.ts')
    expect(bp.line).toBe(10)
    expect(bp.enabled).toBe(true)
    expect(bp.verified).toBe(false)
    expect(bp.hitCountValue).toBe(0)
    expect(bp.id).toMatch(/^bp-\d+$/)

    expect(store.getState().breakpoints).toHaveLength(1)
    expect(store.getState().breakpoints[0]).toBe(bp)
    expect(apiMock.debugSetBreakpoint).toHaveBeenCalledWith('a.ts', 10)
  })

  it('assigns unique ids to successive breakpoints', () => {
    const a = store.getState().addBreakpoint('a.ts', 1)
    const b = store.getState().addBreakpoint('a.ts', 2)
    expect(a.id).not.toBe(b.id)
    expect(store.getState().breakpoints.map(b => b.id)).toEqual([a.id, b.id])
  })

  it('removeBreakpoint deletes by id and notifies IPC with file+line', () => {
    const bp = store.getState().addBreakpoint('a.ts', 10)
    store.getState().removeBreakpoint(bp.id)

    expect(store.getState().breakpoints).toHaveLength(0)
    expect(apiMock.debugRemoveBreakpoint).toHaveBeenCalledWith('a.ts', 10)
  })

  it('removeBreakpoint with an unknown id is a no-op and does not call IPC', () => {
    store.getState().addBreakpoint('a.ts', 10)
    store.getState().removeBreakpoint('bp-does-not-exist')

    expect(store.getState().breakpoints).toHaveLength(1)
    expect(apiMock.debugRemoveBreakpoint).not.toHaveBeenCalled()
  })

  it('toggleBreakpoint adds when none exists at file+line', () => {
    store.getState().toggleBreakpoint('a.ts', 5)
    const bps = store.getState().breakpoints
    expect(bps).toHaveLength(1)
    expect(bps[0]).toMatchObject({ file: 'a.ts', line: 5 })
    expect(apiMock.debugSetBreakpoint).toHaveBeenCalledWith('a.ts', 5)
  })

  it('toggleBreakpoint removes the existing breakpoint at the same file+line', () => {
    store.getState().toggleBreakpoint('a.ts', 5)
    store.getState().toggleBreakpoint('a.ts', 5)
    expect(store.getState().breakpoints).toHaveLength(0)
    expect(apiMock.debugRemoveBreakpoint).toHaveBeenCalledWith('a.ts', 5)
  })

  it('toggleBreakpoint distinguishes between lines and between files', () => {
    store.getState().toggleBreakpoint('a.ts', 5)
    store.getState().toggleBreakpoint('a.ts', 6) // different line -> add
    store.getState().toggleBreakpoint('b.ts', 5) // different file -> add
    expect(store.getState().breakpoints).toHaveLength(3)
  })

  it('enableBreakpoint flips the enabled flag without removing the breakpoint', () => {
    const bp = store.getState().addBreakpoint('a.ts', 1)
    store.getState().enableBreakpoint(bp.id, false)
    expect(store.getState().breakpoints[0].enabled).toBe(false)
    store.getState().enableBreakpoint(bp.id, true)
    expect(store.getState().breakpoints[0].enabled).toBe(true)
  })

  it('enableBreakpoint with an unknown id leaves all breakpoints unchanged', () => {
    const bp = store.getState().addBreakpoint('a.ts', 1)
    store.getState().enableBreakpoint('nope', false)
    expect(store.getState().breakpoints[0]).toEqual(bp)
  })
})

/* ── Breakpoints: conditional / hit count / log message ──── */

describe('conditional and log breakpoints', () => {
  it('setBreakpointCondition stores the condition on the matching breakpoint', () => {
    const bp = store.getState().addBreakpoint('a.ts', 1)
    store.getState().setBreakpointCondition(bp.id, 'x > 5')
    expect(store.getState().breakpoints[0].condition).toBe('x > 5')
  })

  it('setBreakpointHitCount stores the hit-count expression', () => {
    const bp = store.getState().addBreakpoint('a.ts', 1)
    store.getState().setBreakpointHitCount(bp.id, '>= 3')
    expect(store.getState().breakpoints[0].hitCount).toBe('>= 3')
  })

  it('setBreakpointLogMessage turns the breakpoint into a logpoint', () => {
    const bp = store.getState().addBreakpoint('a.ts', 1)
    store.getState().setBreakpointLogMessage(bp.id, 'value={x}')
    expect(store.getState().breakpoints[0].logMessage).toBe('value={x}')
  })

  it('breakpoint metadata setters do not affect other breakpoints', () => {
    const a = store.getState().addBreakpoint('a.ts', 1)
    const b = store.getState().addBreakpoint('a.ts', 2)
    store.getState().setBreakpointCondition(a.id, 'cond')
    const after = store.getState().breakpoints.find(x => x.id === b.id)!
    expect(after.condition).toBeUndefined()
  })
})

/* ── Breakpoints: bulk operations and queries ────────────── */

describe('breakpoint bulk operations', () => {
  it('removeAllBreakpoints clears every breakpoint', () => {
    store.getState().addBreakpoint('a.ts', 1)
    store.getState().addBreakpoint('b.ts', 2)
    store.getState().removeAllBreakpoints()
    expect(store.getState().breakpoints).toEqual([])
  })

  it('removeBreakpointsInFile only removes breakpoints for that file', () => {
    store.getState().addBreakpoint('a.ts', 1)
    store.getState().addBreakpoint('a.ts', 2)
    store.getState().addBreakpoint('b.ts', 3)
    store.getState().removeBreakpointsInFile('a.ts')
    const remaining = store.getState().breakpoints
    expect(remaining).toHaveLength(1)
    expect(remaining[0].file).toBe('b.ts')
  })

  it('getBreakpointsForFile returns only the matching file breakpoints', () => {
    store.getState().addBreakpoint('a.ts', 1)
    store.getState().addBreakpoint('b.ts', 2)
    store.getState().addBreakpoint('a.ts', 3)
    const result = store.getState().getBreakpointsForFile('a.ts')
    expect(result.map(b => b.line)).toEqual([1, 3])
  })

  it('getBreakpointsForFile returns an empty array for an unknown file', () => {
    store.getState().addBreakpoint('a.ts', 1)
    expect(store.getState().getBreakpointsForFile('zzz.ts')).toEqual([])
  })
})

/* ── Session lifecycle ───────────────────────────────────── */

describe('session lifecycle', () => {
  it('startSession registers an initializing session, activates it, and shows the toolbar', () => {
    const id = store.getState().startSession(makeConfig({ name: 'MyConfig' }))
    const s = store.getState()
    expect(id).toMatch(/^session-\d+$/)
    expect(s.sessions).toHaveLength(1)
    expect(s.sessions[0].state).toBe('initializing')
    expect(s.sessions[0].name).toBe('MyConfig')
    expect(s.activeSessionId).toBe(id)
    expect(s.showDebugToolbar).toBe(true)
    expect(apiMock.debugStart).toHaveBeenCalledWith(expect.objectContaining({ name: 'MyConfig' }))
  })

  it('startSession records the last used config in state and localStorage', () => {
    store.getState().startSession(makeConfig({ name: 'CfgABC' }))
    expect(store.getState().lastUsedConfig).toBe('CfgABC')
    expect(localStorage.getItem('orion:last-debug-config')).toBe('CfgABC')
  })

  it('startSession transitions the session to running once debugStart resolves', async () => {
    const id = store.getState().startSession(makeConfig())
    expect(store.getState().sessions[0].state).toBe('initializing')
    await flush()
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('running')
  })

  it('startSession marks the session stopped and logs an error when debugStart rejects', async () => {
    apiMock.debugStart.mockRejectedValueOnce(new Error('boom'))
    const id = store.getState().startSession(makeConfig({ name: 'BadCfg' }))
    await flush()
    expect(store.getState().sessions.find(s => s.id === id)!.state).toBe('stopped')
    const errs = store.getState().consoleEntries.filter(e => e.type === 'error')
    expect(errs.some(e => e.text.includes('Failed to start debug session: BadCfg'))).toBe(true)
  })

  it('stopSession removes the active session, clears the active id, and hides the toolbar', () => {
    const id = store.getState().startSession(makeConfig())
    store.getState().stopSession()
    const s = store.getState()
    expect(s.sessions).toHaveLength(0)
    expect(s.activeSessionId).toBeNull()
    expect(s.showDebugToolbar).toBe(false)
    expect(apiMock.debugStop).toHaveBeenCalledWith(id)
  })

  it('stopSession with multiple sessions keeps the toolbar and selects a remaining session', () => {
    const a = store.getState().startSession(makeConfig({ name: 'A' }))
    const b = store.getState().startSession(makeConfig({ name: 'B' }))
    store.getState().stopSession(a)
    const s = store.getState()
    expect(s.sessions.map(x => x.id)).toEqual([b])
    expect(s.activeSessionId).toBe(b)
    expect(s.showDebugToolbar).toBe(true)
  })

  it('stopSession is a no-op when there is no active session and no id given', () => {
    store.getState().stopSession()
    expect(apiMock.debugStop).not.toHaveBeenCalled()
  })

  it('pauseSession moves the targeted session to paused and calls IPC', () => {
    const id = store.getState().startSession(makeConfig())
    store.getState().pauseSession()
    expect(store.getState().sessions[0].state).toBe('paused')
    expect(apiMock.debugPause).toHaveBeenCalledWith(id)
  })

  it('continueSession moves a paused session back to running and calls IPC', () => {
    const id = installPausedSession()
    store.getState().continueSession()
    expect(store.getState().sessions[0].state).toBe('running')
    expect(apiMock.debugContinue).toHaveBeenCalledWith(id)
  })

  it('setSessionState updates a specific session by id', () => {
    store.setState({
      sessions: [makeSession({ id: 's1', state: 'running' }), makeSession({ id: 's2', state: 'running' })],
    })
    store.getState().setSessionState('s2', 'paused')
    expect(store.getState().sessions.find(s => s.id === 's1')!.state).toBe('running')
    expect(store.getState().sessions.find(s => s.id === 's2')!.state).toBe('paused')
  })

  it('setActiveSession swaps the active session id', () => {
    store.getState().setActiveSession('whatever')
    expect(store.getState().activeSessionId).toBe('whatever')
  })

  it('restartSession stops then re-launches the same config after a delay', () => {
    vi.useFakeTimers()
    const id = store.getState().startSession(makeConfig({ name: 'RestartMe' }))
    store.getState().restartSession(id)
    // After stop the original session is gone.
    expect(store.getState().sessions.find(s => s.id === id)).toBeUndefined()
    vi.advanceTimersByTime(500)
    const sessions = store.getState().sessions
    expect(sessions).toHaveLength(1)
    expect(sessions[0].name).toBe('RestartMe')
    expect(sessions[0].id).not.toBe(id)
  })
})

/* ── Execution / stepping control ────────────────────────── */

describe('execution control', () => {
  it('stepOver calls IPC with the active session id and its active thread id', () => {
    store.setState({
      sessions: [makeSession({ id: 's1', activeThreadId: 7 })],
      activeSessionId: 's1',
    })
    store.getState().stepOver()
    expect(apiMock.debugStepOver).toHaveBeenCalledWith('s1', 7)
  })

  it('stepInto / stepOut forward the active thread id', () => {
    store.setState({
      sessions: [makeSession({ id: 's1', activeThreadId: 3 })],
      activeSessionId: 's1',
    })
    store.getState().stepInto()
    store.getState().stepOut()
    expect(apiMock.debugStepInto).toHaveBeenCalledWith('s1', 3)
    expect(apiMock.debugStepOut).toHaveBeenCalledWith('s1', 3)
  })

  it('stepBack calls IPC with only the session id', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: 's1' })
    store.getState().stepBack()
    expect(apiMock.debugStepBack).toHaveBeenCalledWith('s1')
  })

  it('an explicit session id argument overrides the active session', () => {
    store.setState({
      sessions: [makeSession({ id: 's1', activeThreadId: 1 }), makeSession({ id: 's2', activeThreadId: 9 })],
      activeSessionId: 's1',
    })
    store.getState().stepOver('s2')
    expect(apiMock.debugStepOver).toHaveBeenCalledWith('s2', 9)
  })

  it('stepping is a no-op with no active session', () => {
    store.getState().stepOver()
    store.getState().stepInto()
    store.getState().stepBack()
    expect(apiMock.debugStepOver).not.toHaveBeenCalled()
    expect(apiMock.debugStepInto).not.toHaveBeenCalled()
    expect(apiMock.debugStepBack).not.toHaveBeenCalled()
  })

  it('runToCursor forwards file and line for the active session', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: 's1' })
    store.getState().runToCursor('main.ts', 42)
    expect(apiMock.debugRunToCursor).toHaveBeenCalledWith('s1', 'main.ts', 42)
  })

  it('runToCursor is a no-op without an active session', () => {
    store.getState().runToCursor('main.ts', 42)
    expect(apiMock.debugRunToCursor).not.toHaveBeenCalled()
  })
})

/* ── Threads / call stack / scopes ───────────────────────── */

describe('threads, call stack and scopes', () => {
  it('setThreads replaces the thread list (with their stack frames) on a session', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: 's1' })
    const threads = [
      {
        id: 1,
        name: 'main',
        status: 'paused' as const,
        stackFrames: [{ id: 11, name: 'foo', file: 'a.ts', line: 3, column: 0 }],
      },
    ]
    store.getState().setThreads('s1', threads)
    const s = store.getState().sessions[0]
    expect(s.threads).toEqual(threads)
    expect(s.threads[0].stackFrames[0].name).toBe('foo')
  })

  it('setActiveThread updates the active thread of the active session', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: 's1' })
    store.getState().setActiveThread(5)
    expect(store.getState().sessions[0].activeThreadId).toBe(5)
  })

  it('setActiveThread is a no-op when no session is active', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: null })
    store.getState().setActiveThread(5)
    expect(store.getState().sessions[0].activeThreadId).toBeUndefined()
  })

  it('setActiveFrame updates the active frame of the active session', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: 's1' })
    store.getState().setActiveFrame(99)
    expect(store.getState().sessions[0].activeFrameId).toBe(99)
  })

  it('setScopes replaces the scope list (variables) for a session', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: 's1' })
    const scopes: DebugScope[] = [
      { name: 'Locals', variablesReference: 100, expensive: false, variables: [
        { name: 'x', value: '1', variablesReference: 0 },
      ] },
    ]
    store.getState().setScopes('s1', scopes)
    expect(store.getState().sessions[0].scopes).toEqual(scopes)
  })
})

/* ── Watch expressions ───────────────────────────────────── */

describe('watch expressions', () => {
  it('addWatch appends an expression without evaluating when not paused', () => {
    store.getState().addWatch('a + b')
    const w = store.getState().watchExpressions
    expect(w).toHaveLength(1)
    expect(w[0].expression).toBe('a + b')
    expect(w[0].value).toBeUndefined()
    expect(apiMock.debugEvaluate).not.toHaveBeenCalled()
  })

  it('addWatch evaluates immediately via IPC when the session is paused', async () => {
    const id = installPausedSession()
    apiMock.debugEvaluate.mockResolvedValueOnce({ value: '7', type: 'number' })
    store.getState().addWatch('a + b')
    expect(apiMock.debugEvaluate).toHaveBeenCalledWith(id, 'a + b')
    await flush()
    const w = store.getState().watchExpressions[0]
    expect(w.value).toBe('7')
    expect(w.type).toBe('number')
  })

  it('addWatch records an error when evaluation rejects', async () => {
    installPausedSession()
    apiMock.debugEvaluate.mockRejectedValueOnce(new Error('nope'))
    store.getState().addWatch('bad')
    await flush()
    const w = store.getState().watchExpressions[0]
    expect(w.error).toBe('Unable to evaluate')
    expect(w.value).toBeUndefined()
  })

  it('removeWatch deletes the matching expression', () => {
    store.getState().addWatch('a')
    store.getState().addWatch('b')
    const firstId = store.getState().watchExpressions[0].id
    store.getState().removeWatch(firstId)
    expect(store.getState().watchExpressions.map(w => w.expression)).toEqual(['b'])
  })

  it('editWatch changes the expression and clears its previous value/error', () => {
    store.getState().addWatch('a')
    const id = store.getState().watchExpressions[0].id
    store.getState().updateWatchValue(id, '1', 'number')
    store.getState().editWatch(id, 'a + 1')
    const w = store.getState().watchExpressions[0]
    expect(w.expression).toBe('a + 1')
    expect(w.value).toBeUndefined()
    expect(w.error).toBeUndefined()
  })

  it('updateWatchValue sets value/type and clears any error', () => {
    store.getState().addWatch('a')
    const id = store.getState().watchExpressions[0].id
    store.getState().setWatchError(id, 'boom')
    store.getState().updateWatchValue(id, '5', 'number')
    const w = store.getState().watchExpressions[0]
    expect(w.value).toBe('5')
    expect(w.type).toBe('number')
    expect(w.error).toBeUndefined()
  })

  it('setWatchError sets the error and clears the value', () => {
    store.getState().addWatch('a')
    const id = store.getState().watchExpressions[0].id
    store.getState().updateWatchValue(id, '5')
    store.getState().setWatchError(id, 'failed')
    const w = store.getState().watchExpressions[0]
    expect(w.error).toBe('failed')
    expect(w.value).toBeUndefined()
  })

  it('refreshWatches re-evaluates every watch when paused', async () => {
    installPausedSession()
    store.setState({
      watchExpressions: [
        { id: 'w1', expression: 'a' },
        { id: 'w2', expression: 'b' },
      ],
    })
    apiMock.debugEvaluate.mockResolvedValue({ value: 'V', type: 't' })
    store.getState().refreshWatches()
    expect(apiMock.debugEvaluate).toHaveBeenCalledTimes(2)
    await flush()
    expect(store.getState().watchExpressions.every(w => w.value === 'V')).toBe(true)
  })

  it('refreshWatches does nothing when not paused', () => {
    store.setState({ watchExpressions: [{ id: 'w1', expression: 'a' }] })
    store.getState().refreshWatches()
    expect(apiMock.debugEvaluate).not.toHaveBeenCalled()
  })
})

/* ── Console ─────────────────────────────────────────────── */

describe('debug console', () => {
  it('addConsoleEntry appends an entry with id, type, text, and timestamp', () => {
    store.getState().addConsoleEntry('info', 'hello', 'stdout')
    const entries = store.getState().consoleEntries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: 'info', text: 'hello', source: 'stdout' })
    expect(entries[0].id).toMatch(/^console-\d+$/)
    expect(typeof entries[0].timestamp).toBe('number')
  })

  it('addConsoleEntry caps the buffer at 1000 entries (keeps the most recent)', () => {
    for (let i = 0; i < 1005; i++) store.getState().addConsoleEntry('output', `line-${i}`)
    const entries = store.getState().consoleEntries
    expect(entries).toHaveLength(1000)
    expect(entries[entries.length - 1].text).toBe('line-1004')
  })

  it('clearConsole empties the buffer', () => {
    store.getState().addConsoleEntry('output', 'x')
    store.getState().clearConsole()
    expect(store.getState().consoleEntries).toEqual([])
  })

  it('evaluateInConsole logs an input then an error when not paused', () => {
    store.getState().evaluateInConsole('1 + 1')
    const types = store.getState().consoleEntries.map(e => ({ type: e.type, text: e.text }))
    expect(types).toEqual([
      { type: 'input', text: '1 + 1' },
      { type: 'error', text: 'Not paused in debug session' },
    ])
    expect(apiMock.debugEvaluate).not.toHaveBeenCalled()
  })

  it('evaluateInConsole logs the result as output when paused', async () => {
    const id = installPausedSession()
    apiMock.debugEvaluate.mockResolvedValueOnce({ value: 'result-value' })
    store.getState().evaluateInConsole('expr')
    expect(apiMock.debugEvaluate).toHaveBeenCalledWith(id, 'expr')
    await flush()
    const outputs = store.getState().consoleEntries.filter(e => e.type === 'output')
    expect(outputs.map(e => e.text)).toContain('result-value')
  })

  it('evaluateInConsole logs an error entry when evaluation rejects', async () => {
    installPausedSession()
    apiMock.debugEvaluate.mockRejectedValueOnce(new Error('eval blew up'))
    store.getState().evaluateInConsole('expr')
    await flush()
    const errs = store.getState().consoleEntries.filter(e => e.type === 'error')
    expect(errs.some(e => e.text === 'eval blew up')).toBe(true)
  })
})

/* ── Variables ───────────────────────────────────────────── */

describe('variables', () => {
  it('expandVariable fetches children via IPC and attaches them to the matching variable', async () => {
    const scopes: DebugScope[] = [
      {
        name: 'Locals',
        variablesReference: 1,
        expensive: false,
        variables: [{ name: 'obj', value: '{...}', variablesReference: 55 }],
      },
    ]
    store.setState({ sessions: [makeSession({ id: 's1', scopes })], activeSessionId: 's1' })
    const children = [{ name: 'inner', value: '1', variablesReference: 0 }]
    apiMock.debugGetVariables.mockResolvedValueOnce(children)

    store.getState().expandVariable(1, 55)
    expect(apiMock.debugGetVariables).toHaveBeenCalledWith('s1', 55)
    await flush()
    const variable = store.getState().sessions[0].scopes[0].variables[0]
    expect(variable.children).toEqual(children)
  })

  it('expandVariable is a no-op without an active session', () => {
    store.getState().expandVariable(1, 2)
    expect(apiMock.debugGetVariables).not.toHaveBeenCalled()
  })

  it('setVariableValue forwards the change to IPC for the active session', () => {
    store.setState({ sessions: [makeSession({ id: 's1' })], activeSessionId: 's1' })
    store.getState().setVariableValue(10, 'x', '99')
    expect(apiMock.debugSetVariable).toHaveBeenCalledWith('s1', 10, 'x', '99')
  })

  it('setVariableValue is a no-op without an active session', () => {
    store.getState().setVariableValue(10, 'x', '99')
    expect(apiMock.debugSetVariable).not.toHaveBeenCalled()
  })
})

/* ── Launch configurations ───────────────────────────────── */

describe('launch configurations', () => {
  it('addConfiguration appends a configuration', () => {
    store.getState().addConfiguration(makeConfig({ name: 'New' }))
    expect(store.getState().configurations.map(c => c.name)).toEqual(['New'])
  })

  it('removeConfiguration removes by name', () => {
    store.setState({ configurations: [makeConfig({ name: 'A' }), makeConfig({ name: 'B' })] })
    store.getState().removeConfiguration('A')
    expect(store.getState().configurations.map(c => c.name)).toEqual(['B'])
  })

  it('updateConfiguration merges a partial into the matching configuration', () => {
    store.setState({ configurations: [makeConfig({ name: 'A', port: 1 })] })
    store.getState().updateConfiguration('A', { port: 9229, request: 'attach' })
    const cfg = store.getState().configurations[0]
    expect(cfg.port).toBe(9229)
    expect(cfg.request).toBe('attach')
    expect(cfg.name).toBe('A')
  })

  it('setLastUsedConfig updates state and persists to localStorage', () => {
    store.getState().setLastUsedConfig('Chosen')
    expect(store.getState().lastUsedConfig).toBe('Chosen')
    expect(localStorage.getItem('orion:last-debug-config')).toBe('Chosen')
  })
})

/* ── Exception breakpoints ───────────────────────────────── */

describe('exception breakpoints', () => {
  it('setExceptionBreakpoints replaces the filter list', () => {
    store.getState().setExceptionBreakpoints([{ filter: 'all', enabled: true }])
    expect(store.getState().exceptionBreakpoints).toEqual([{ filter: 'all', enabled: true }])
  })

  it('toggleExceptionBreakpoint flips only the matching filter', () => {
    store.getState().toggleExceptionBreakpoint('uncaught')
    const ebs = store.getState().exceptionBreakpoints
    expect(ebs.find(e => e.filter === 'uncaught')!.enabled).toBe(false)
    expect(ebs.find(e => e.filter === 'caught')!.enabled).toBe(false)
  })

  it('toggleExceptionBreakpoint with an unknown filter changes nothing', () => {
    const before = store.getState().exceptionBreakpoints
    store.getState().toggleExceptionBreakpoint('does-not-exist')
    expect(store.getState().exceptionBreakpoints).toEqual(before)
  })
})

/* ── Helpers / derived state ─────────────────────────────── */

describe('helpers', () => {
  it('getActiveSession returns the session matching the active id', () => {
    store.setState({
      sessions: [makeSession({ id: 's1' }), makeSession({ id: 's2' })],
      activeSessionId: 's2',
    })
    expect(store.getState().getActiveSession()!.id).toBe('s2')
  })

  it('getActiveSession returns undefined when there is no active session', () => {
    expect(store.getState().getActiveSession()).toBeUndefined()
  })

  it('isDebugging is true for running/initializing/paused sessions and false for stopped/inactive', () => {
    store.setState({ sessions: [makeSession({ id: 's1', state: 'paused' })] })
    expect(store.getState().isDebugging()).toBe(true)

    store.setState({ sessions: [makeSession({ id: 's1', state: 'stopped' })] })
    expect(store.getState().isDebugging()).toBe(false)

    store.setState({ sessions: [makeSession({ id: 's1', state: 'inactive' })] })
    expect(store.getState().isDebugging()).toBe(false)
  })

  it('isPaused reflects the active session state', () => {
    store.setState({ sessions: [makeSession({ id: 's1', state: 'running' })], activeSessionId: 's1' })
    expect(store.getState().isPaused()).toBe(false)
    store.getState().setSessionState('s1', 'paused')
    expect(store.getState().isPaused()).toBe(true)
  })

  it('isPaused is false when no session is active', () => {
    store.setState({ sessions: [makeSession({ id: 's1', state: 'paused' })], activeSessionId: null })
    expect(store.getState().isPaused()).toBe(false)
  })
})
