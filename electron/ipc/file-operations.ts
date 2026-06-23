import type { IpcMain, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from '../../shared/ipc-channels'
import { resolveActiveWorkspacePath, WorkspacePathAccessError } from './workspace-path-guard'
import { warnLog } from '../logger'

// Track per-path watchers for file:watch
const fileWatchers = new Map<string, FSWatcher>()

export function registerFileOperationHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  // file:rename - rename/move a file or directory
  ipcMain.handle(IPC.FILE_RENAME, async (_event, oldPath: string, newPath: string) => {
    try {
      const safeOldPath = await resolveActiveWorkspacePath(oldPath, 'old path')
      const safeNewPath = await resolveActiveWorkspacePath(newPath, 'new path')
      await fs.rename(safeOldPath, safeNewPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:copy - copy a file from sourcePath to destPath
  ipcMain.handle(IPC.FILE_COPY, async (_event, sourcePath: string, destPath: string) => {
    try {
      const safeSourcePath = await resolveActiveWorkspacePath(sourcePath, 'source path')
      const safeDestPath = await resolveActiveWorkspacePath(destPath, 'destination path')
      await fs.mkdir(path.dirname(safeDestPath), { recursive: true })
      await fs.copyFile(safeSourcePath, safeDestPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:move - move a file from sourcePath to destPath
  ipcMain.handle(IPC.FILE_MOVE, async (_event, sourcePath: string, destPath: string) => {
    try {
      const safeSourcePath = await resolveActiveWorkspacePath(sourcePath, 'source path')
      const safeDestPath = await resolveActiveWorkspacePath(destPath, 'destination path')
      await fs.mkdir(path.dirname(safeDestPath), { recursive: true })
      await fs.rename(safeSourcePath, safeDestPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:stat - get file stats
  ipcMain.handle(IPC.FILE_STAT, async (_event, filePath: string) => {
    try {
      const safeFilePath = await resolveActiveWorkspacePath(filePath, 'file path')
      const stat = await fs.stat(safeFilePath)
      return {
        success: true,
        stat: {
          size: stat.size,
          created: stat.birthtime.toISOString(),
          modified: stat.mtime.toISOString(),
          isDirectory: stat.isDirectory(),
          isFile: stat.isFile(),
          isSymbolicLink: stat.isSymbolicLink(),
        },
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:exists - check if path exists
  ipcMain.handle(IPC.FILE_EXISTS, async (_event, filePath: string) => {
    try {
      const safeFilePath = await resolveActiveWorkspacePath(filePath, 'file path')
      await fs.access(safeFilePath)
      return true
    } catch (err: any) {
      if (err instanceof WorkspacePathAccessError) {
        warnLog('file-ops', 'Refused file existence check', err.message)
      }
      return false
    }
  })

  // file:create-directory - recursively create directory
  ipcMain.handle(IPC.FILE_CREATE_DIRECTORY, async (_event, dirPath: string) => {
    try {
      const safeDirPath = await resolveActiveWorkspacePath(dirPath, 'directory path')
      await fs.mkdir(safeDirPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:delete-directory - recursively delete directory
  ipcMain.handle(IPC.FILE_DELETE_DIRECTORY, async (_event, dirPath: string) => {
    try {
      const safeDirPath = await resolveActiveWorkspacePath(dirPath, 'directory path')
      await fs.rm(safeDirPath, { recursive: true, force: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:watch - watch a path for changes and send events to renderer
  ipcMain.handle(IPC.FILE_WATCH, async (_event, watchPath: string) => {
    try {
      const safeWatchPath = await resolveActiveWorkspacePath(watchPath, 'watch path')

      // Stop any existing watcher on this path
      const existing = fileWatchers.get(safeWatchPath)
      if (existing) {
        await existing.close()
        fileWatchers.delete(safeWatchPath)
      }

      const watcher = chokidar.watch(safeWatchPath, {
        persistent: true,
        ignoreInitial: true,
      })

      watcher
        .on('add', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath: safeWatchPath, event: 'add', path: filePath })
          }
        })
        .on('change', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath: safeWatchPath, event: 'change', path: filePath })
          }
        })
        .on('unlink', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath: safeWatchPath, event: 'unlink', path: filePath })
          }
        })
        .on('addDir', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath: safeWatchPath, event: 'addDir', path: filePath })
          }
        })
        .on('unlinkDir', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath: safeWatchPath, event: 'unlinkDir', path: filePath })
          }
        })

      fileWatchers.set(safeWatchPath, watcher)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:read-binary - read file as base64 (for images, etc.)
  ipcMain.handle(IPC.FILE_READ_BINARY, async (_event, filePath: string) => {
    try {
      const safeFilePath = await resolveActiveWorkspacePath(filePath, 'file path')
      const buffer = await fs.readFile(safeFilePath)
      return { success: true, data: buffer.toString('base64') }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
