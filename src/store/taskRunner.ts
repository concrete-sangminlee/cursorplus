/**
 * Task runner store.
 * Manages build tasks, test runners, linting, formatting,
 * and custom task configurations with output streaming.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/* ── Types ─────────────────────────────────────────────── */

export type TaskType = 'build' | 'test' | 'lint' | 'format' | 'watch' | 'serve' | 'deploy' | 'custom' | 'script'
export type TaskState = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'cancelled' | 'watching'
export type TaskSource = 'package.json' | 'Makefile' | 'Cargo.toml' | 'go.mod' | 'custom' | 'auto-detect'

export interface TaskDefinition {
  id: string
  name: string
  type: TaskType
  command: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  shell?: string
  group?: string
  dependsOn?: string[]
  problemMatcher?: string
  isBackground?: boolean
  source: TaskSource
  presentation?: TaskPresentation
  runOptions?: TaskRunOptions
}

export interface TaskPresentation {
  reveal: 'always' | 'silent' | 'never'
  echo: boolean
  focus: boolean
  panel: 'shared' | 'dedicated' | 'new'
  showReuseMessage: boolean
  clear: boolean
}

export interface TaskRunOptions {
  reevaluateOnRerun?: boolean
  runOn?: 'default' | 'folderOpen'
  instanceLimit?: number
}

export interface TaskExecution {
  id: string
  taskId: string
  taskName: string
  state: TaskState
  startTime: number
  endTime?: number
  exitCode?: number
  output: string[]
  errorOutput: string[]
  problems: TaskProblem[]
  pid?: number
}

export interface TaskProblem {
  severity: 'error' | 'warning' | 'info'
  message: string
  file?: string
  line?: number
  column?: number
  source: string
}

export interface TaskGroup {
  id: string
  name: string
  tasks: string[]
}

export interface TaskHistory {
  taskId: string
  taskName: string
  exitCode: number
  duration: number
  timestamp: number
}

/* ── Problem Matchers ─────────────────────────────────── */

const PROBLEM_MATCHERS: Record<string, RegExp> = {
  typescript: /^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+TS\d+:\s+(.+)$/,
  eslint: /^\s*(.+):(\d+):(\d+):\s+(error|warning)\s+(.+)$/,
  gcc: /^(.+):(\d+):(\d+):\s+(error|warning):\s+(.+)$/,
  python: /^\s*File "(.+)", line (\d+).*\n\s*(.+)$/,
  rust: /^(error|warning)(?:\[E\d+\])?: (.+)\n\s*--> (.+):(\d+):(\d+)$/,
  go: /^(.+):(\d+):(\d+):\s+(.+)$/,
  jest: /^\s+at\s+.+\((.+):(\d+):(\d+)\)$/,
  generic: /^(.+):(\d+)(?::(\d+))?\s*[-:]\s*(error|warning|info)?\s*[-:]?\s*(.+)$/,
}

function matchProblems(output: string, matcher?: string): TaskProblem[] {
  const problems: TaskProblem[] = []
  const pattern = matcher ? PROBLEM_MATCHERS[matcher] : PROBLEM_MATCHERS.generic

  if (!pattern) return problems

  const lines = output.split('\n')
  for (const line of lines) {
    const match = line.match(pattern)
    if (match) {
      problems.push({
        severity: (match[4]?.toLowerCase() as 'error' | 'warning' | 'info') || 'error',
        message: match[5] || match[3] || line,
        file: match[1],
        line: parseInt(match[2]) || undefined,
        column: parseInt(match[3]) || undefined,
        source: matcher || 'generic',
      })
    }
  }

  return problems
}

/* ── Store ─────────────────────────────────────────────── */

interface TaskRunnerState {
  tasks: TaskDefinition[]
  executions: TaskExecution[]
  history: TaskHistory[]
  activeExecutionId: string | null
  defaultBuildTask: string | null
  defaultTestTask: string | null
  maxHistory: number
  maxOutputLines: number
  autoDetect: boolean

  // Task management
  addTask: (task: Omit<TaskDefinition, 'id'>) => string
  updateTask: (id: string, updates: Partial<TaskDefinition>) => void
  removeTask: (id: string) => void
  duplicateTask: (id: string) => string

  // Execution
  runTask: (taskId: string) => string
  cancelExecution: (executionId: string) => void
  restartExecution: (executionId: string) => void
  runBuildTask: () => string | null
  runTestTask: () => string | null
  runAllTasks: (group?: string) => string[]

  // Execution state
  setExecutionState: (executionId: string, state: TaskState) => void
  appendOutput: (executionId: string, output: string, isError?: boolean) => void
  setExitCode: (executionId: string, code: number) => void
  setActiveExecution: (executionId: string | null) => void

  // Queries
  getTask: (id: string) => TaskDefinition | undefined
  getExecution: (id: string) => TaskExecution | undefined
  getActiveExecution: () => TaskExecution | undefined
  getRunningExecutions: () => TaskExecution[]
  getTasksByType: (type: TaskType) => TaskDefinition[]
  getTasksByGroup: (group: string) => TaskDefinition[]
  getTaskHistory: (taskId: string) => TaskHistory[]
  getProblems: () => TaskProblem[]
  isTaskRunning: (taskId: string) => boolean

  // Auto-detection
  detectTasks: (files: string[], packageJson?: any) => void

  // Settings
  setDefaultBuildTask: (taskId: string | null) => void
  setDefaultTestTask: (taskId: string | null) => void
  clearHistory: () => void
  clearOutput: (executionId: string) => void
}

/* ── Store Implementation ──────────────────────────────── */

export const useTaskRunnerStore = create<TaskRunnerState>()(
  persist(
    (set, get) => ({
      tasks: [],
      executions: [],
      history: [],
      activeExecutionId: null,
      defaultBuildTask: null,
      defaultTestTask: null,
      maxHistory: 100,
      maxOutputLines: 10000,
      autoDetect: true,

      addTask: (task) => {
        const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        set(s => ({
          tasks: [...s.tasks, { ...task, id }],
        }))
        return id
      },

      updateTask: (id, updates) => {
        set(s => ({
          tasks: s.tasks.map(t => t.id === id ? { ...t, ...updates } : t),
        }))
      },

      removeTask: (id) => {
        set(s => ({
          tasks: s.tasks.filter(t => t.id !== id),
          defaultBuildTask: s.defaultBuildTask === id ? null : s.defaultBuildTask,
          defaultTestTask: s.defaultTestTask === id ? null : s.defaultTestTask,
        }))
      },

      duplicateTask: (id) => {
        const task = get().tasks.find(t => t.id === id)
        if (!task) return ''
        return get().addTask({ ...task, name: `${task.name} (copy)` })
      },

      runTask: (taskId) => {
        const task = get().tasks.find(t => t.id === taskId)
        if (!task) return ''

        // Check dependencies
        if (task.dependsOn?.length) {
          for (const depId of task.dependsOn) {
            if (!get().isTaskRunning(depId)) {
              get().runTask(depId)
            }
          }
        }

        const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
        const execution: TaskExecution = {
          id: executionId,
          taskId,
          taskName: task.name,
          state: 'running',
          startTime: Date.now(),
          output: [],
          errorOutput: [],
          problems: [],
        }

        set(s => ({
          executions: [...s.executions, execution],
          activeExecutionId: executionId,
        }))

        // Execute via IPC
        window.electron?.invoke('task:run', {
          executionId,
          command: task.command,
          args: task.args,
          cwd: task.cwd,
          env: task.env,
          shell: task.shell,
        }).then((result: any) => {
          get().setExitCode(executionId, result?.exitCode ?? 0)
        }).catch(() => {
          get().setExitCode(executionId, 1)
        })

        return executionId
      },

      cancelExecution: (executionId) => {
        const execution = get().executions.find(e => e.id === executionId)
        if (execution?.pid) {
          window.electron?.invoke('task:kill', { pid: execution.pid }).catch(() => {})
        }
        get().setExecutionState(executionId, 'cancelled')
      },

      restartExecution: (executionId) => {
        const execution = get().executions.find(e => e.id === executionId)
        if (!execution) return

        if (execution.state === 'running') {
          get().cancelExecution(executionId)
        }

        get().runTask(execution.taskId)
      },

      runBuildTask: () => {
        const id = get().defaultBuildTask
        if (!id) return null
        return get().runTask(id)
      },

      runTestTask: () => {
        const id = get().defaultTestTask
        if (!id) return null
        return get().runTask(id)
      },

      runAllTasks: (group) => {
        const tasks = group
          ? get().getTasksByGroup(group)
          : get().tasks
        return tasks.map(t => get().runTask(t.id))
      },

      setExecutionState: (executionId, state) => {
        set(s => ({
          executions: s.executions.map(e => {
            if (e.id !== executionId) return e
            const endTime = ['success', 'error', 'cancelled'].includes(state) ? Date.now() : undefined
            return { ...e, state, endTime }
          }),
        }))

        // Add to history if completed
        const execution = get().executions.find(e => e.id === executionId)
        if (execution && ['success', 'error'].includes(state)) {
          set(s => ({
            history: [{
              taskId: execution.taskId,
              taskName: execution.taskName,
              exitCode: execution.exitCode ?? (state === 'success' ? 0 : 1),
              duration: (execution.endTime || Date.now()) - execution.startTime,
              timestamp: Date.now(),
            }, ...s.history].slice(0, s.maxHistory),
          }))
        }
      },

      appendOutput: (executionId, output, isError) => {
        set(s => ({
          executions: s.executions.map(e => {
            if (e.id !== executionId) return e
            const lines = isError
              ? { errorOutput: [...e.errorOutput, output].slice(-s.maxOutputLines) }
              : { output: [...e.output, output].slice(-s.maxOutputLines) }

            // Match problems
            const problems = [...e.problems, ...matchProblems(output)]

            return { ...e, ...lines, problems }
          }),
        }))
      },

      setExitCode: (executionId, code) => {
        set(s => ({
          executions: s.executions.map(e =>
            e.id === executionId
              ? { ...e, exitCode: code, state: code === 0 ? 'success' as TaskState : 'error' as TaskState, endTime: Date.now() }
              : e
          ),
        }))

        const execution = get().executions.find(e => e.id === executionId)
        if (execution) {
          set(s => ({
            history: [{
              taskId: execution.taskId,
              taskName: execution.taskName,
              exitCode: code,
              duration: (execution.endTime || Date.now()) - execution.startTime,
              timestamp: Date.now(),
            }, ...s.history].slice(0, s.maxHistory),
          }))
        }
      },

      setActiveExecution: (executionId) => set({ activeExecutionId: executionId }),

      // Queries
      getTask: (id) => get().tasks.find(t => t.id === id),
      getExecution: (id) => get().executions.find(e => e.id === id),
      getActiveExecution: () => get().executions.find(e => e.id === get().activeExecutionId),
      getRunningExecutions: () => get().executions.filter(e => e.state === 'running'),
      getTasksByType: (type) => get().tasks.filter(t => t.type === type),
      getTasksByGroup: (group) => get().tasks.filter(t => t.group === group),
      getTaskHistory: (taskId) => get().history.filter(h => h.taskId === taskId),
      getProblems: () => get().executions.flatMap(e => e.problems),
      isTaskRunning: (taskId) => get().executions.some(e => e.taskId === taskId && e.state === 'running'),

      // Auto-detection
      detectTasks: (files, packageJson) => {
        const detectedTasks: Omit<TaskDefinition, 'id'>[] = []

        // Detect from package.json
        if (packageJson?.scripts) {
          for (const [name, command] of Object.entries(packageJson.scripts)) {
            let type: TaskType = 'script'
            if (name.includes('build')) type = 'build'
            else if (name.includes('test')) type = 'test'
            else if (name.includes('lint')) type = 'lint'
            else if (name.includes('format') || name.includes('prettier')) type = 'format'
            else if (name.includes('dev') || name.includes('start') || name.includes('serve')) type = 'serve'
            else if (name.includes('watch')) type = 'watch'
            else if (name.includes('deploy')) type = 'deploy'

            detectedTasks.push({
              name: `npm: ${name}`,
              type,
              command: `npm run ${name}`,
              source: 'package.json',
              isBackground: type === 'watch' || type === 'serve',
              problemMatcher: type === 'build' ? 'typescript' : type === 'lint' ? 'eslint' : undefined,
            })
          }
        }

        // Detect Makefile targets
        const hasMakefile = files.some(f => f.toLowerCase().endsWith('makefile') || f.toLowerCase() === 'makefile')
        if (hasMakefile) {
          detectedTasks.push(
            { name: 'make: build', type: 'build', command: 'make build', source: 'Makefile' },
            { name: 'make: test', type: 'test', command: 'make test', source: 'Makefile' },
            { name: 'make: clean', type: 'custom', command: 'make clean', source: 'Makefile' },
          )
        }

        // Detect Cargo.toml
        const hasCargo = files.some(f => f.endsWith('Cargo.toml'))
        if (hasCargo) {
          detectedTasks.push(
            { name: 'cargo: build', type: 'build', command: 'cargo build', source: 'Cargo.toml', problemMatcher: 'rust' },
            { name: 'cargo: test', type: 'test', command: 'cargo test', source: 'Cargo.toml', problemMatcher: 'rust' },
            { name: 'cargo: run', type: 'serve', command: 'cargo run', source: 'Cargo.toml', problemMatcher: 'rust' },
            { name: 'cargo: clippy', type: 'lint', command: 'cargo clippy', source: 'Cargo.toml', problemMatcher: 'rust' },
          )
        }

        // Detect go.mod
        const hasGoMod = files.some(f => f.endsWith('go.mod'))
        if (hasGoMod) {
          detectedTasks.push(
            { name: 'go: build', type: 'build', command: 'go build ./...', source: 'go.mod', problemMatcher: 'go' },
            { name: 'go: test', type: 'test', command: 'go test ./...', source: 'go.mod', problemMatcher: 'go' },
            { name: 'go: run', type: 'serve', command: 'go run .', source: 'go.mod', problemMatcher: 'go' },
            { name: 'go: vet', type: 'lint', command: 'go vet ./...', source: 'go.mod', problemMatcher: 'go' },
          )
        }

        // Add detected tasks (avoiding duplicates by name)
        const existingNames = new Set(get().tasks.map(t => t.name))
        for (const task of detectedTasks) {
          if (!existingNames.has(task.name)) {
            get().addTask(task)
          }
        }

        // Auto-set default build/test tasks
        if (!get().defaultBuildTask) {
          const buildTask = get().tasks.find(t => t.type === 'build')
          if (buildTask) set({ defaultBuildTask: buildTask.id })
        }
        if (!get().defaultTestTask) {
          const testTask = get().tasks.find(t => t.type === 'test')
          if (testTask) set({ defaultTestTask: testTask.id })
        }
      },

      // Settings
      setDefaultBuildTask: (taskId) => set({ defaultBuildTask: taskId }),
      setDefaultTestTask: (taskId) => set({ defaultTestTask: taskId }),
      clearHistory: () => set({ history: [] }),
      clearOutput: (executionId) => {
        set(s => ({
          executions: s.executions.map(e =>
            e.id === executionId ? { ...e, output: [], errorOutput: [], problems: [] } : e
          ),
        }))
      },
    }),
    {
      name: 'orion-task-runner',
      partialize: (state) => ({
        tasks: state.tasks,
        defaultBuildTask: state.defaultBuildTask,
        defaultTestTask: state.defaultTestTask,
        history: state.history.slice(0, 50),
      }),
    }
  )
)
