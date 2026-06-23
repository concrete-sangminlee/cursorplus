/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useTaskRunnerStore, type TaskDefinition } from './taskRunner'

/* ──────────────────────────────────────────────────────────
 * Setup
 *
 * The store is a module-level zustand singleton wrapped in the
 * persist() middleware (key "orion-task-runner", localStorage).
 * Because of that it touches localStorage on every set(), so the
 * jsdom environment is required (see directive at top of file).
 *
 * IPC: the store calls `window.electron?.invoke(channel, payload)`.
 * NOTE: the project convention is `window.electronAPI`, but THIS
 * store actually reads `window.electron`. We pin the real behavior
 * here (stub `window.electron.invoke`) and flag the mismatch below.
 * `invoke` returns a Promise, and runTask chains `.then().catch()`
 * to feed the resolved exitCode back into setExitCode().
 * ──────────────────────────────────────────────────────────── */

const store = useTaskRunnerStore

// invoke mock — each test can control the resolved value / rejection.
let invokeMock: ReturnType<typeof vi.fn>

/** Add a task directly and return its generated id. */
function addTask(overrides: Partial<Omit<TaskDefinition, 'id'>> = {}): string {
  return store.getState().addTask({
    name: 'Build',
    type: 'build',
    command: 'npm run build',
    source: 'custom',
    ...overrides,
  })
}

/** Wait for the microtask queue to drain (so invoke().then() runs). */
const flush = () => new Promise<void>((r) => setTimeout(r, 0))

beforeEach(() => {
  // Reset only the data fields. Do NOT use replace:true — keep actions intact.
  store.setState({
    tasks: [],
    executions: [],
    history: [],
    activeExecutionId: null,
    defaultBuildTask: null,
    defaultTestTask: null,
    maxHistory: 100,
    maxOutputLines: 10000,
    autoDetect: true,
  })

  invokeMock = vi.fn().mockResolvedValue({ exitCode: 0 })
  ;(window as any).electron = { invoke: invokeMock }
})

afterEach(() => {
  vi.restoreAllMocks()
  delete (window as any).electron
})

/* ──────────────────────────────────────────────────────────
 * Task management
 * ──────────────────────────────────────────────────────── */

describe('addTask / updateTask / removeTask / duplicateTask', () => {
  it('addTask appends a task with a generated id and returns that id', () => {
    const id = addTask({ name: 'Lint', type: 'lint', command: 'eslint .' })
    const tasks = store.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe(id)
    expect(id).toMatch(/^task-/)
    expect(tasks[0]).toMatchObject({ name: 'Lint', type: 'lint', command: 'eslint .' })
  })

  it('updateTask mutates only the matching task', () => {
    const a = addTask({ name: 'A' })
    const b = addTask({ name: 'B' })
    store.getState().updateTask(a, { name: 'A-renamed', command: 'echo a' })
    expect(store.getState().getTask(a)).toMatchObject({ name: 'A-renamed', command: 'echo a' })
    expect(store.getState().getTask(b)!.name).toBe('B')
  })

  it('removeTask drops the task and nulls default build/test references to it', () => {
    const id = addTask({ type: 'build' })
    store.getState().setDefaultBuildTask(id)
    store.getState().setDefaultTestTask(id)
    expect(store.getState().defaultBuildTask).toBe(id)

    store.getState().removeTask(id)
    expect(store.getState().tasks).toHaveLength(0)
    expect(store.getState().defaultBuildTask).toBeNull()
    expect(store.getState().defaultTestTask).toBeNull()
  })

  it('removeTask leaves an unrelated default reference intact', () => {
    const keep = addTask({ name: 'Keep', type: 'build' })
    const drop = addTask({ name: 'Drop', type: 'test' })
    store.getState().setDefaultBuildTask(keep)
    store.getState().removeTask(drop)
    expect(store.getState().defaultBuildTask).toBe(keep)
  })

  it('duplicateTask creates a "(copy)" with a new id and returns it', () => {
    const id = addTask({ name: 'Orig', command: 'go build' })
    const copyId = store.getState().duplicateTask(id)
    expect(copyId).not.toBe(id)
    expect(copyId).toMatch(/^task-/)
    expect(store.getState().tasks).toHaveLength(2)
    const copy = store.getState().getTask(copyId)!
    expect(copy.name).toBe('Orig (copy)')
    expect(copy.command).toBe('go build')
  })

  it('duplicateTask returns "" for an unknown id and adds nothing', () => {
    const result = store.getState().duplicateTask('nope')
    expect(result).toBe('')
    expect(store.getState().tasks).toHaveLength(0)
  })
})

/* ──────────────────────────────────────────────────────────
 * Starting a task (IPC + running list)
 * ──────────────────────────────────────────────────────── */

describe('runTask — start execution & IPC', () => {
  it('creates a running execution, sets it active, and invokes task:run with command details', () => {
    const id = addTask({
      command: 'npm run build',
      args: ['--watch'],
      cwd: '/repo',
      env: { CI: '1' },
      shell: 'bash',
    })
    const execId = store.getState().runTask(id)

    expect(execId).toMatch(/^exec-/)
    const exec = store.getState().getExecution(execId)!
    expect(exec.state).toBe('running')
    expect(exec.taskId).toBe(id)
    expect(exec.taskName).toBe('Build')
    expect(exec.output).toEqual([])
    expect(store.getState().activeExecutionId).toBe(execId)
    expect(store.getState().getRunningExecutions().map((e) => e.id)).toContain(execId)
    expect(store.getState().isTaskRunning(id)).toBe(true)

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('task:run', {
      executionId: execId,
      command: 'npm run build',
      args: ['--watch'],
      cwd: '/repo',
      env: { CI: '1' },
      shell: 'bash',
    })
  })

  it('returns "" and does not invoke IPC for an unknown task id', () => {
    const execId = store.getState().runTask('missing')
    expect(execId).toBe('')
    expect(invokeMock).not.toHaveBeenCalled()
    expect(store.getState().executions).toHaveLength(0)
  })

  it('marks execution success via setExitCode when IPC resolves with exitCode 0', async () => {
    invokeMock.mockResolvedValue({ exitCode: 0 })
    const id = addTask()
    const execId = store.getState().runTask(id)
    await flush()
    const exec = store.getState().getExecution(execId)!
    expect(exec.state).toBe('success')
    expect(exec.exitCode).toBe(0)
    expect(exec.endTime).toBeDefined()
  })

  it('marks execution error when IPC resolves with a non-zero exitCode', async () => {
    invokeMock.mockResolvedValue({ exitCode: 2 })
    const id = addTask()
    const execId = store.getState().runTask(id)
    await flush()
    const exec = store.getState().getExecution(execId)!
    expect(exec.state).toBe('error')
    expect(exec.exitCode).toBe(2)
  })

  it('defaults exitCode to 0 (success) when IPC resolves without an exitCode field', async () => {
    invokeMock.mockResolvedValue({})
    const id = addTask()
    const execId = store.getState().runTask(id)
    await flush()
    expect(store.getState().getExecution(execId)!.exitCode).toBe(0)
    expect(store.getState().getExecution(execId)!.state).toBe('success')
  })

  it('marks execution error with exitCode 1 when the IPC call rejects', async () => {
    invokeMock.mockRejectedValue(new Error('spawn failed'))
    const id = addTask()
    const execId = store.getState().runTask(id)
    await flush()
    const exec = store.getState().getExecution(execId)!
    expect(exec.state).toBe('error')
    expect(exec.exitCode).toBe(1)
  })

  it('runs dependencies first when dependsOn references not-yet-running tasks', () => {
    const dep = addTask({ name: 'Dep', type: 'custom', command: 'prep' })
    const main = addTask({ name: 'Main', dependsOn: [dep] })
    store.getState().runTask(main)
    // both the dependency and the main task should have running executions
    expect(store.getState().isTaskRunning(dep)).toBe(true)
    expect(store.getState().isTaskRunning(main)).toBe(true)
    expect(invokeMock).toHaveBeenCalledTimes(2)
  })

  it('does not double-start a dependency that is already running', () => {
    const dep = addTask({ name: 'Dep', command: 'prep' })
    const main = addTask({ name: 'Main', dependsOn: [dep] })
    store.getState().runTask(dep) // dep already running
    invokeMock.mockClear()
    store.getState().runTask(main)
    // only the main task should be invoked now (dep already running)
    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('skips IPC silently when window.electron is undefined (optional chaining)', () => {
    delete (window as any).electron
    const id = addTask()
    const execId = store.getState().runTask(id)
    // execution still created & running; no throw
    expect(store.getState().getExecution(execId)!.state).toBe('running')
  })
})

/* ──────────────────────────────────────────────────────────
 * Output appending + problem matching
 * ──────────────────────────────────────────────────────── */

describe('appendOutput', () => {
  it('appends stdout lines to output (not errorOutput)', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    store.getState().appendOutput(execId, 'hello')
    store.getState().appendOutput(execId, 'world')
    const exec = store.getState().getExecution(execId)!
    expect(exec.output).toEqual(['hello', 'world'])
    expect(exec.errorOutput).toEqual([])
  })

  it('appends to errorOutput when isError is true', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    store.getState().appendOutput(execId, 'boom', true)
    const exec = store.getState().getExecution(execId)!
    expect(exec.output).toEqual([])
    expect(exec.errorOutput).toEqual(['boom'])
  })

  it('parses generic-matcher problems out of appended output', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    // generic matcher: /^(.+):(\d+)(?::(\d+))?\s*[-:]\s*(error|warning|info)?\s*[-:]?\s*(.+)$/
    // NOTE: pinning ACTUAL behavior. The leading `(.+)` is greedy, so for the
    // input below "src/app.ts:12" is captured as the file and "5" as the line.
    // (Suspected matcher quirk: a `file:line:col` line does not split the way
    //  one might intuitively expect — see "Suspected bugs" in the summary.)
    store.getState().appendOutput(execId, 'src/app.ts:12:5 - error - Unexpected token')
    const problems = store.getState().getExecution(execId)!.problems
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({
      file: 'src/app.ts:12',
      line: 5,
      column: undefined,
      severity: 'error',
      message: 'Unexpected token',
      source: 'generic',
    })
  })

  it('caps stored output lines at maxOutputLines (keeps the most recent)', () => {
    store.setState({ maxOutputLines: 3 })
    const id = addTask()
    const execId = store.getState().runTask(id)
    for (const n of ['1', '2', '3', '4', '5']) {
      store.getState().appendOutput(execId, n)
    }
    expect(store.getState().getExecution(execId)!.output).toEqual(['3', '4', '5'])
  })

  it('is a no-op for an unknown execution id (does not throw, no new execution)', () => {
    const before = store.getState().executions.length
    expect(() => store.getState().appendOutput('ghost', 'data')).not.toThrow()
    expect(store.getState().executions).toHaveLength(before)
  })
})

/* ──────────────────────────────────────────────────────────
 * Completion / failure on exit
 * ──────────────────────────────────────────────────────── */

describe('setExitCode — completion on exit event', () => {
  it('sets success state on exit code 0 and records history', () => {
    const id = addTask({ name: 'Tester', type: 'test' })
    const execId = store.getState().runTask(id)
    store.getState().setExitCode(execId, 0)
    const exec = store.getState().getExecution(execId)!
    expect(exec.state).toBe('success')
    expect(exec.exitCode).toBe(0)
    expect(exec.endTime).toBeDefined()

    const history = store.getState().getTaskHistory(id)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ taskId: id, taskName: 'Tester', exitCode: 0 })
    expect(history[0].duration).toBeGreaterThanOrEqual(0)
  })

  it('sets error state on a non-zero exit code and records that code in history', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    store.getState().setExitCode(execId, 137)
    expect(store.getState().getExecution(execId)!.state).toBe('error')
    expect(store.getState().history[0].exitCode).toBe(137)
  })
})

describe('setExecutionState — explicit transitions & history', () => {
  it('sets endTime for terminal states (success/error/cancelled)', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    store.getState().setExecutionState(execId, 'cancelled')
    expect(store.getState().getExecution(execId)!.state).toBe('cancelled')
    expect(store.getState().getExecution(execId)!.endTime).toBeDefined()
  })

  it('does not set endTime for non-terminal states (e.g. watching)', () => {
    const id = addTask({ type: 'watch' })
    const execId = store.getState().runTask(id)
    store.getState().setExecutionState(execId, 'watching')
    expect(store.getState().getExecution(execId)!.state).toBe('watching')
    expect(store.getState().getExecution(execId)!.endTime).toBeUndefined()
  })

  it('pushes history for success/error but NOT for cancelled', () => {
    const id = addTask()
    const c = store.getState().runTask(id)
    store.getState().setExecutionState(c, 'cancelled')
    expect(store.getState().history).toHaveLength(0)

    const s = store.getState().runTask(id)
    store.getState().setExecutionState(s, 'success')
    expect(store.getState().history).toHaveLength(1)
  })

  it('uses fallback exit codes in history when none was set (0 for success, 1 for error)', () => {
    const id = addTask()
    const okExec = store.getState().runTask(id)
    store.getState().setExecutionState(okExec, 'success')
    expect(store.getState().history[0].exitCode).toBe(0)

    const badExec = store.getState().runTask(id)
    store.getState().setExecutionState(badExec, 'error')
    expect(store.getState().history[0].exitCode).toBe(1)
  })

  it('caps history at maxHistory, keeping the newest first', () => {
    store.setState({ maxHistory: 2 })
    const id = addTask({ name: 'H' })
    for (let i = 0; i < 4; i++) {
      const e = store.getState().runTask(id)
      store.getState().setExecutionState(e, 'success')
    }
    expect(store.getState().history).toHaveLength(2)
    // newest-first ordering: all share same taskId/name here
    expect(store.getState().history.every((h) => h.taskId === id)).toBe(true)
  })
})

/* ──────────────────────────────────────────────────────────
 * Killing / cancelling a task
 * ──────────────────────────────────────────────────────── */

describe('cancelExecution — kill a task', () => {
  it('sends task:kill with the pid and transitions to cancelled', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    // simulate the backend having reported a pid
    store.setState({
      executions: store.getState().executions.map((e) =>
        e.id === execId ? { ...e, pid: 4242 } : e
      ),
    })
    invokeMock.mockClear()

    store.getState().cancelExecution(execId)
    expect(invokeMock).toHaveBeenCalledWith('task:kill', { pid: 4242 })
    expect(store.getState().getExecution(execId)!.state).toBe('cancelled')
    expect(store.getState().isTaskRunning(id)).toBe(false)
  })

  it('still transitions to cancelled but skips task:kill when there is no pid', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    invokeMock.mockClear()
    store.getState().cancelExecution(execId)
    // no pid → no kill IPC
    expect(invokeMock).not.toHaveBeenCalledWith('task:kill', expect.anything())
    expect(store.getState().getExecution(execId)!.state).toBe('cancelled')
  })

  it('does not throw when cancelling an unknown execution id', () => {
    expect(() => store.getState().cancelExecution('ghost')).not.toThrow()
    expect(invokeMock).not.toHaveBeenCalledWith('task:kill', expect.anything())
  })
})

describe('restartExecution', () => {
  it('cancels a running execution then starts a fresh execution for the same task', () => {
    const id = addTask()
    const first = store.getState().runTask(id)
    invokeMock.mockClear()

    store.getState().restartExecution(first)
    // original cancelled
    expect(store.getState().getExecution(first)!.state).toBe('cancelled')
    // a new running execution exists for the task
    const running = store.getState().getRunningExecutions()
    expect(running).toHaveLength(1)
    expect(running[0].id).not.toBe(first)
    expect(invokeMock).toHaveBeenCalledTimes(1) // the re-run
  })

  it('is a no-op for an unknown execution id', () => {
    expect(() => store.getState().restartExecution('ghost')).not.toThrow()
    expect(store.getState().executions).toHaveLength(0)
  })
})

/* ──────────────────────────────────────────────────────────
 * Default build/test tasks + convenience runners
 * ──────────────────────────────────────────────────────── */

describe('runBuildTask / runTestTask', () => {
  it('runBuildTask returns null when no default build task is set', () => {
    expect(store.getState().runBuildTask()).toBeNull()
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('runBuildTask runs the configured default build task', () => {
    const id = addTask({ type: 'build', command: 'npm run build' })
    store.getState().setDefaultBuildTask(id)
    const execId = store.getState().runBuildTask()
    expect(execId).toMatch(/^exec-/)
    expect(store.getState().getExecution(execId!)!.taskId).toBe(id)
  })

  it('runTestTask returns null with no default and runs the default when set', () => {
    expect(store.getState().runTestTask()).toBeNull()
    const id = addTask({ type: 'test', command: 'npm test' })
    store.getState().setDefaultTestTask(id)
    expect(store.getState().runTestTask()).toMatch(/^exec-/)
  })
})

describe('runAllTasks', () => {
  it('runs every task when no group is given', () => {
    addTask({ name: 'a' })
    addTask({ name: 'b' })
    const execIds = store.getState().runAllTasks()
    expect(execIds).toHaveLength(2)
    expect(execIds.every((e) => e.startsWith('exec-'))).toBe(true)
    expect(store.getState().getRunningExecutions()).toHaveLength(2)
  })

  it('runs only tasks in the requested group', () => {
    addTask({ name: 'a', group: 'g1' })
    addTask({ name: 'b', group: 'g2' })
    addTask({ name: 'c', group: 'g1' })
    const execIds = store.getState().runAllTasks('g1')
    expect(execIds).toHaveLength(2)
  })
})

/* ──────────────────────────────────────────────────────────
 * Queries
 * ──────────────────────────────────────────────────────── */

describe('queries', () => {
  it('getActiveExecution returns the execution pointed to by activeExecutionId', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    expect(store.getState().getActiveExecution()!.id).toBe(execId)
    store.getState().setActiveExecution(null)
    expect(store.getState().getActiveExecution()).toBeUndefined()
  })

  it('getTasksByType / getTasksByGroup filter correctly', () => {
    addTask({ name: 'b1', type: 'build', group: 'g' })
    addTask({ name: 't1', type: 'test', group: 'g' })
    addTask({ name: 'b2', type: 'build' })
    expect(store.getState().getTasksByType('build')).toHaveLength(2)
    expect(store.getState().getTasksByType('test')).toHaveLength(1)
    expect(store.getState().getTasksByGroup('g')).toHaveLength(2)
  })

  it('getProblems aggregates problems across all executions', () => {
    const id = addTask()
    const e1 = store.getState().runTask(id)
    const e2 = store.getState().runTask(id)
    store.getState().appendOutput(e1, 'a.ts:1:1 - error - x')
    store.getState().appendOutput(e2, 'b.ts:2:2 - warning - y')
    expect(store.getState().getProblems()).toHaveLength(2)
  })

  it('isTaskRunning is false once the execution leaves the running state', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    expect(store.getState().isTaskRunning(id)).toBe(true)
    store.getState().setExitCode(execId, 0)
    expect(store.getState().isTaskRunning(id)).toBe(false)
  })
})

/* ──────────────────────────────────────────────────────────
 * Clearing output & history
 * ──────────────────────────────────────────────────────── */

describe('clearOutput / clearHistory', () => {
  it('clearOutput empties output, errorOutput and problems for one execution only', () => {
    const id = addTask()
    const a = store.getState().runTask(id)
    const b = store.getState().runTask(id)
    store.getState().appendOutput(a, 'a.ts:1:1 - error - x')
    store.getState().appendOutput(a, 'stderr line', true)
    store.getState().appendOutput(b, 'kept')

    store.getState().clearOutput(a)
    const ea = store.getState().getExecution(a)!
    expect(ea.output).toEqual([])
    expect(ea.errorOutput).toEqual([])
    expect(ea.problems).toEqual([])
    // other execution untouched
    expect(store.getState().getExecution(b)!.output).toEqual(['kept'])
  })

  it('clearOutput on an unknown id does not throw or alter state', () => {
    const id = addTask()
    const a = store.getState().runTask(id)
    store.getState().appendOutput(a, 'data')
    expect(() => store.getState().clearOutput('ghost')).not.toThrow()
    expect(store.getState().getExecution(a)!.output).toEqual(['data'])
  })

  it('clearHistory empties the history list', () => {
    const id = addTask()
    const execId = store.getState().runTask(id)
    store.getState().setExitCode(execId, 0)
    expect(store.getState().history.length).toBeGreaterThan(0)
    store.getState().clearHistory()
    expect(store.getState().history).toEqual([])
  })
})

/* ──────────────────────────────────────────────────────────
 * Auto-detection
 * ──────────────────────────────────────────────────────── */

describe('detectTasks', () => {
  it('derives npm tasks with correct type mapping from package.json scripts', () => {
    store.getState().detectTasks([], {
      scripts: {
        build: 'tsc',
        test: 'vitest',
        lint: 'eslint .',
        prettier: 'prettier -w .',
        dev: 'vite',
        watch: 'tsc -w',
        deploy: 'gh-pages',
      },
    })
    const byName = (n: string) => store.getState().tasks.find((t) => t.name === n)!
    expect(byName('npm: build').type).toBe('build')
    expect(byName('npm: build').problemMatcher).toBe('typescript')
    expect(byName('npm: test').type).toBe('test')
    expect(byName('npm: lint').type).toBe('lint')
    expect(byName('npm: lint').problemMatcher).toBe('eslint')
    expect(byName('npm: prettier').type).toBe('format')
    expect(byName('npm: dev').type).toBe('serve')
    expect(byName('npm: dev').isBackground).toBe(true)
    expect(byName('npm: watch').type).toBe('watch')
    expect(byName('npm: deploy').type).toBe('deploy')
  })

  it('detects Makefile / Cargo.toml / go.mod tasks from file lists', () => {
    store.getState().detectTasks(['Makefile', 'Cargo.toml', 'go.mod'])
    const names = store.getState().tasks.map((t) => t.name)
    expect(names).toContain('make: build')
    expect(names).toContain('cargo: clippy')
    expect(names).toContain('go: vet')
  })

  it('does not add a task whose name already exists', () => {
    store.getState().detectTasks([], { scripts: { build: 'tsc' } })
    const countAfterFirst = store.getState().tasks.length
    store.getState().detectTasks([], { scripts: { build: 'tsc' } })
    expect(store.getState().tasks.length).toBe(countAfterFirst)
  })

  it('auto-assigns default build and test tasks when none are set', () => {
    expect(store.getState().defaultBuildTask).toBeNull()
    store.getState().detectTasks([], { scripts: { build: 'tsc', test: 'vitest' } })
    const build = store.getState().tasks.find((t) => t.type === 'build')!
    const test = store.getState().tasks.find((t) => t.type === 'test')!
    expect(store.getState().defaultBuildTask).toBe(build.id)
    expect(store.getState().defaultTestTask).toBe(test.id)
  })
})
