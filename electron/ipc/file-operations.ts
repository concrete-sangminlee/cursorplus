import type { IpcMain, BrowserWindow } from 'electron'
import fs from 'fs/promises'
import path from 'path'
import chokidar, { type FSWatcher } from 'chokidar'
import { IPC } from '../../shared/ipc-channels'

// Track per-path watchers for file:watch
const fileWatchers = new Map<string, FSWatcher>()

export function registerFileOperationHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  // file:rename - rename/move a file or directory
  ipcMain.handle(IPC.FILE_RENAME, async (_event, oldPath: string, newPath: string) => {
    try {
      await fs.rename(oldPath, newPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:copy - copy a file from sourcePath to destPath
  ipcMain.handle(IPC.FILE_COPY, async (_event, sourcePath: string, destPath: string) => {
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      await fs.copyFile(sourcePath, destPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:move - move a file from sourcePath to destPath
  ipcMain.handle(IPC.FILE_MOVE, async (_event, sourcePath: string, destPath: string) => {
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true })
      await fs.rename(sourcePath, destPath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:stat - get file stats
  ipcMain.handle(IPC.FILE_STAT, async (_event, filePath: string) => {
    try {
      const stat = await fs.stat(filePath)
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
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  })

  // file:create-directory - recursively create directory
  ipcMain.handle(IPC.FILE_CREATE_DIRECTORY, async (_event, dirPath: string) => {
    try {
      await fs.mkdir(dirPath, { recursive: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:delete-directory - recursively delete directory
  ipcMain.handle(IPC.FILE_DELETE_DIRECTORY, async (_event, dirPath: string) => {
    try {
      await fs.rm(dirPath, { recursive: true, force: true })
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:watch - watch a path for changes and send events to renderer
  ipcMain.handle(IPC.FILE_WATCH, async (_event, watchPath: string) => {
    try {
      // Stop any existing watcher on this path
      const existing = fileWatchers.get(watchPath)
      if (existing) {
        await existing.close()
        fileWatchers.delete(watchPath)
      }

      const watcher = chokidar.watch(watchPath, {
        persistent: true,
        ignoreInitial: true,
      })

      watcher
        .on('add', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath, event: 'add', path: filePath })
          }
        })
        .on('change', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath, event: 'change', path: filePath })
          }
        })
        .on('unlink', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath, event: 'unlink', path: filePath })
          }
        })
        .on('addDir', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath, event: 'addDir', path: filePath })
          }
        })
        .on('unlinkDir', (filePath: string) => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.webContents.send(IPC.FILE_WATCH_EVENT, { watchPath, event: 'unlinkDir', path: filePath })
          }
        })

      fileWatchers.set(watchPath, watcher)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // file:read-binary - read file as base64 (for images, etc.)
  ipcMain.handle(IPC.FILE_READ_BINARY, async (_event, filePath: string) => {
    try {
      const buffer = await fs.readFile(filePath)
      return { success: true, data: buffer.toString('base64') }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
