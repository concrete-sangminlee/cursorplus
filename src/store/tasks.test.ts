/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useTaskStore,
  initTaskListeners,
  type RunningTask,
} from './tasks'

/* ──────────────────────────────────────────────────────────────────────────
 * Setup
 *
 * `useTaskStore` is a module-level zustand singleton (no persist middleware).
 * The store talks to the preload bridge via `window.api`:
 *   - runTask      -> window.api.taskRun({ command, cwd, label })  => { taskId, ... }
 *   - killTask     -> window.api.taskKill(id)                       => { success }
 *   - loadScripts  -> window.api.taskListScripts(cwd)               => TaskScript[]
 *   - initTaskListeners() subscribes once via:
 *       window.api.onTaskOutput(cb)    -> cb({ taskId, data, stream })
 *       window.api.onTaskComplete(cb)  -> cb({ taskId, code })
 *     and routes those into the internal _appendOutput / _completeTask actions.
 *
 * The IPC listener wiring is guarded by a module-level `listenersInitialized`
 * flag, so initTaskListeners() only subscribes ONCE per module load. We capture
 * the callbacks the first time it runs; the captured callbacks call into the
 * singleton store directly, so they remain valid for every test.
 *
 * jsdom env is requested because the store module references `window`.
 * ──────────────────────────────────────────────────────────────────────── */

const store = useTaskStore

// Captured IPC event callbacks (set the first time initTaskListeners runs).
let outputCb: ((data: { taskId: string; data: string; stream: 'stdout' | 'stderr' }) => void) | undefined
let completeCb: ((data: { taskId: string; code: number }) => void) | undefined

// Unsubscribe spies returned from the on* subscriptions.
const outputUnsub = vi.fn()
const completeUnsub = vi.fn()

/** Read back the installed api mock with its typed shape. */
function getApi() {
  return (globalThis as unknown as { api: ReturnType<typeof makeApi> }).api
}

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    taskRun: vi.fn().mockResolvedValue({ taskId: 't1', label: 'Build', command: 'npm run build' }),
    taskKill: vi.fn().mockResolvedValue({ success: true }),
    taskListScripts: vi.fn().mockResolvedValue([]),
    onTaskOutput: vi.fn((cb: typeof outputCb) => {
      outputCb = cb
      return outputUnsub
    }),
    onTaskComplete: vi.fn((cb: typeof completeCb) => {
      completeCb = cb
      return completeUnsub
    }),
    ...overrides,
  }
}

/** Seed a task directly into store state (bypassing runTask). */
function seedTask(overrides: Partial<RunningTask> = {}): RunningTask {
  const task: RunningTask = {
    id: 't1',
    label: 'Build',
    command: 'npm run build',
    status: 'running',
    output: '',
    ...overrides,
  }
  store.setState({ runningTasks: [task] })
  return task
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(globalThis as { api?: unknown }).api = makeApi()
  // Reset data fields only — keep actions intact. (No replace:true.)
  store.setState({ runningTasks: [], availableScripts: [] })
  // Wire IPC listeners. Guarded internally, so only the first call subscribes
  // and captures outputCb/completeCb; later calls are no-ops.
  initTaskListeners()
})

describe('useTaskStore — runTask', () => {
  it('calls api.taskRun with command/cwd/label and tracks the task by returned taskId', async () => {
    const api = getApi()
    api.taskRun.mockResolvedValueOnce({ taskId: 'abc-123', label: 'Build', command: 'npm run build' })

    const returned = await store.getState().runTask('Build', 'npm run build', '/repo')

    expect(returned).toBe('abc-123')
    expect(api.taskRun).toHaveBeenCalledTimes(1)
    expect(api.taskRun).toHaveBeenCalledWith({ command: 'npm run build', cwd: '/repo', label: 'Build' })

    const tasks = store.getState().runningTasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toEqual({
      id: 'abc-123',
      label: 'Build',
      command: 'npm run build',
      status: 'running',
      output: '',
    })
  })

  it('appends multiple tasks rather than replacing existing ones', async () => {
    const api = getApi()
    api.taskRun
      .mockResolvedValueOnce({ taskId: 'one', label: 'A', command: 'a' })
      .mockResolvedValueOnce({ taskId: 'two', label: 'B', command: 'b' })

    await store.getState().runTask('A', 'a', '/x')
    await store.getState().runTask('B', 'b', '/y')

    expect(store.getState().runningTasks.map((t) => t.id)).toEqual(['one', 'two'])
  })

  it('returns null and does not add a task when api.taskRun rejects', async () => {
    const api = getApi()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.taskRun.mockRejectedValueOnce(new Error('spawn failed'))

    const returned = await store.getState().runTask('Build', 'npm run build', '/repo')

    expect(returned).toBeNull()
    expect(store.getState().runningTasks).toHaveLength(0)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('useTaskStore — onTaskOutput callback / _appendOutput', () => {
  it('wires up the output subscription on init', () => {
    expect(typeof outputCb).toBe('function')
  })

  it('appends streamed output (concatenating chunks) to the matching task only', () => {
    store.setState({
      runningTasks: [
        { id: 't1', label: 'A', command: 'a', status: 'running', output: '' },
        { id: 't2', label: 'B', command: 'b', status: 'running', output: 'pre-' },
      ],
    })

    outputCb!({ taskId: 't1', data: 'hello ', stream: 'stdout' })
    outputCb!({ taskId: 't1', data: 'world', stream: 'stderr' })
    outputCb!({ taskId: 't2', data: 'x', stream: 'stdout' })

    const tasks = store.getState().runningTasks
    expect(tasks.find((t) => t.id === 't1')!.output).toBe('hello world')
    expect(tasks.find((t) => t.id === 't2')!.output).toBe('pre-x')
  })

  it('is a no-op when output arrives for an unknown task id', () => {
    seedTask({ id: 't1', output: 'keep' })

    outputCb!({ taskId: 'ghost', data: 'lost', stream: 'stdout' })

    const tasks = store.getState().runningTasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].output).toBe('keep')
  })
})

describe('useTaskStore — onTaskComplete callback / _completeTask', () => {
  it('wires up the completion subscription on init', () => {
    expect(typeof completeCb).toBe('function')
  })

  it('marks the task completed when exit code is 0', () => {
    seedTask({ id: 't1', status: 'running' })

    completeCb!({ taskId: 't1', code: 0 })

    expect(store.getState().runningTasks[0].status).toBe('completed')
  })

  it('marks the task failed when exit code is non-zero', () => {
    seedTask({ id: 't1', status: 'running' })

    completeCb!({ taskId: 't1', code: 1 })

    expect(store.getState().runningTasks[0].status).toBe('failed')
  })

  it('preserves accumulated output when completing a task', () => {
    seedTask({ id: 't1', status: 'running', output: 'partial output' })

    completeCb!({ taskId: 't1', code: 0 })

    const t = store.getState().runningTasks[0]
    expect(t.status).toBe('completed')
    expect(t.output).toBe('partial output')
  })

  it('is a no-op when completion arrives for an unknown task id', () => {
    seedTask({ id: 't1', status: 'running' })

    completeCb!({ taskId: 'ghost', code: 0 })

    expect(store.getState().runningTasks[0].status).toBe('running')
  })
})

describe('useTaskStore — killTask', () => {
  it('calls api.taskKill(id) and flips the task status to "killed"', async () => {
    const api = getApi()
    seedTask({ id: 't1', status: 'running' })

    await store.getState().killTask('t1')

    expect(api.taskKill).toHaveBeenCalledTimes(1)
    expect(api.taskKill).toHaveBeenCalledWith('t1')
    expect(store.getState().runningTasks[0].status).toBe('killed')
  })

  it('only changes the targeted task, leaving siblings untouched', async () => {
    store.setState({
      runningTasks: [
        { id: 't1', label: 'A', command: 'a', status: 'running', output: '' },
        { id: 't2', label: 'B', command: 'b', status: 'running', output: '' },
      ],
    })

    await store.getState().killTask('t2')

    const tasks = store.getState().runningTasks
    expect(tasks.find((t) => t.id === 't1')!.status).toBe('running')
    expect(tasks.find((t) => t.id === 't2')!.status).toBe('killed')
  })

  it('does not mutate state when api.taskKill rejects', async () => {
    const api = getApi()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.taskKill.mockRejectedValueOnce(new Error('no such task'))
    seedTask({ id: 't1', status: 'running' })

    await store.getState().killTask('t1')

    expect(store.getState().runningTasks[0].status).toBe('running')
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('useTaskStore — loadScripts', () => {
  it('stores the scripts returned by api.taskListScripts', async () => {
    const api = getApi()
    const scripts = [
      { name: 'build', command: 'tsc' },
      { name: 'test', command: 'vitest' },
    ]
    api.taskListScripts.mockResolvedValueOnce(scripts)

    await store.getState().loadScripts('/repo')

    expect(api.taskListScripts).toHaveBeenCalledWith('/repo')
    expect(store.getState().availableScripts).toEqual(scripts)
  })

  it('resets availableScripts to [] when api.taskListScripts rejects', async () => {
    const api = getApi()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    store.setState({ availableScripts: [{ name: 'stale', command: 'old' }] })
    api.taskListScripts.mockRejectedValueOnce(new Error('no package.json'))

    await store.getState().loadScripts('/repo')

    expect(store.getState().availableScripts).toEqual([])
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})

describe('useTaskStore — _removeTask', () => {
  it('removes the matching task and keeps the rest', () => {
    store.setState({
      runningTasks: [
        { id: 't1', label: 'A', command: 'a', status: 'completed', output: '' },
        { id: 't2', label: 'B', command: 'b', status: 'running', output: '' },
      ],
    })

    store.getState()._removeTask('t1')

    expect(store.getState().runningTasks.map((t) => t.id)).toEqual(['t2'])
  })

  it('is a no-op for an unknown task id', () => {
    seedTask({ id: 't1' })

    store.getState()._removeTask('ghost')

    expect(store.getState().runningTasks).toHaveLength(1)
  })
})
