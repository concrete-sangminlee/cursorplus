import type { IpcMain, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { IPC } from '../../shared/ipc-channels'

const runningTasks = new Map<string, ChildProcess>()
let taskCounter = 0

export function registerTaskHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle(
    IPC.TASK_RUN,
    async (_event, args: { command: string; cwd: string; label: string }) => {
      const taskId = `task-${++taskCounter}-${Date.now()}`
      const { command, cwd, label } = args

      const isWindows = process.platform === 'win32'
      const shell = isWindows ? 'cmd.exe' : '/bin/sh'
      const shellArgs = isWindows ? ['/c', command] : ['-c', command]

      const child = spawn(shell, shellArgs, {
        cwd,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      runningTasks.set(taskId, child)

      const win = getWindow()

      child.stdout?.on('data', (data: Buffer) => {
        win?.webContents.send(IPC.TASK_OUTPUT, {
          taskId,
          data: data.toString(),
          stream: 'stdout',
        })
      })

      child.stderr?.on('data', (data: Buffer) => {
        win?.webContents.send(IPC.TASK_OUTPUT, {
          taskId,
          data: data.toString(),
          stream: 'stderr',
        })
      })

      child.on('close', (code) => {
        runningTasks.delete(taskId)
        win?.webContents.send(IPC.TASK_COMPLETE, {
          taskId,
          code: code ?? 1,
        })
      })

      child.on('error', (err) => {
        runningTasks.delete(taskId)
        win?.webContents.send(IPC.TASK_OUTPUT, {
          taskId,
          data: `Error: ${err.message}\n`,
          stream: 'stderr',
        })
        win?.webContents.send(IPC.TASK_COMPLETE, {
          taskId,
          code: 1,
        })
      })

      return { taskId, label, command }
    }
  )

  ipcMain.handle(IPC.TASK_KILL, async (_event, taskId: string) => {
    const child = runningTasks.get(taskId)
    if (!child) return { success: false, error: 'Task not found' }

    try {
      // On Windows, use taskkill to kill the process tree
      if (process.platform === 'win32' && child.pid) {
        spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
      } else {
        child.kill('SIGTERM')
      }
      runningTasks.delete(taskId)
      return { success: true }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  ipcMain.handle(IPC.TASK_LIST_SCRIPTS, async (_event, cwd: string) => {
    try {
      const pkgPath = path.join(cwd, 'package.json')
      const content = fs.readFileSync(pkgPath, 'utf-8')
      const pkg = JSON.parse(content)
      const scripts = pkg.scripts || {}

      return Object.entries(scripts).map(([name, command]) => ({
        name,
        command: command as string,
      }))
    } catch {
      return []
    }
  })
}
