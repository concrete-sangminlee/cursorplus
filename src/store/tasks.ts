import { create } from 'zustand'

export type TaskStatus = 'running' | 'completed' | 'failed' | 'killed'

export interface RunningTask {
  id: string
  label: string
  command: string
  status: TaskStatus
  output: string
}

export interface AvailableScript {
  name: string
  command: string
}

interface TaskStore {
  runningTasks: RunningTask[]
  availableScripts: AvailableScript[]

  runTask: (label: string, command: string, cwd: string) => Promise<string | null>
  killTask: (id: string) => Promise<void>
  loadScripts: (cwd: string) => Promise<void>

  // Internal actions used by IPC listeners
  _appendOutput: (taskId: string, data: string) => void
  _completeTask: (taskId: string, code: number) => void
  _removeTask: (taskId: string) => void
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  runningTasks: [],
  availableScripts: [],

  runTask: async (label, command, cwd) => {
    try {
      const result = await window.api.taskRun({ command, cwd, label })
      const task: RunningTask = {
        id: result.taskId,
        label,
        command,
        status: 'running',
        output: '',
      }
      set((state) => ({
        runningTasks: [...state.runningTasks, task],
      }))
      return result.taskId
    } catch (err) {
      console.error('[TaskStore] Failed to run task:', err)
      return null
    }
  },

  killTask: async (id) => {
    try {
      await window.api.taskKill(id)
      set((state) => ({
        runningTasks: state.runningTasks.map((t) =>
          t.id === id ? { ...t, status: 'killed' as TaskStatus } : t
        ),
      }))
    } catch (err) {
      console.error('[TaskStore] Failed to kill task:', err)
    }
  },

  loadScripts: async (cwd) => {
    try {
      const scripts = await window.api.taskListScripts(cwd)
      set({ availableScripts: scripts })
    } catch (err) {
      console.error('[TaskStore] Failed to load scripts:', err)
      set({ availableScripts: [] })
    }
  },

  _appendOutput: (taskId, data) => {
    set((state) => ({
      runningTasks: state.runningTasks.map((t) =>
        t.id === taskId ? { ...t, output: t.output + data } : t
      ),
    }))
  },

  _completeTask: (taskId, code) => {
    set((state) => ({
      runningTasks: state.runningTasks.map((t) =>
        t.id === taskId
          ? { ...t, status: (code === 0 ? 'completed' : 'failed') as TaskStatus }
          : t
      ),
    }))
  },

  _removeTask: (taskId) => {
    set((state) => ({
      runningTasks: state.runningTasks.filter((t) => t.id !== taskId),
    }))
  },
}))

// Set up IPC listeners for task output and completion.
// Call this once at app startup.
let listenersInitialized = false

export function initTaskListeners() {
  if (listenersInitialized) return
  listenersInitialized = true

  window.api.onTaskOutput((data) => {
    useTaskStore.getState()._appendOutput(data.taskId, data.data)
  })

  window.api.onTaskComplete((data) => {
    useTaskStore.getState()._completeTask(data.taskId, data.code)
  })
}
