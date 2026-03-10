import type { IpcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { readFileContent, writeFileContent, deleteItem, renameItem, buildFileTree, detectLanguage } from '../filesystem/operations'
import { startWatching, stopWatching } from '../filesystem/watcher'

export function registerFilesystemHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.FS_READ_FILE, async (_event, filePath: string) => {
    const content = await readFileContent(filePath)
    const language = detectLanguage(filePath)
    return { content, language }
  })

  ipcMain.handle(IPC.FS_WRITE_FILE, async (_event, filePath: string, content: string) => {
    await writeFileContent(filePath, content)
  })

  ipcMain.handle(IPC.FS_DELETE, async (_event, itemPath: string) => {
    await deleteItem(itemPath)
  })

  ipcMain.handle(IPC.FS_RENAME, async (_event, oldPath: string, newPath: string) => {
    await renameItem(oldPath, newPath)
  })

  ipcMain.handle(IPC.FS_READ_DIR, async (_event, dirPath: string) => {
    return buildFileTree(dirPath)
  })

  ipcMain.on(IPC.FS_WATCH_START, (_event, dirPath: string) => {
    startWatching(dirPath, getWindow)
  })

  ipcMain.on(IPC.FS_WATCH_STOP, () => {
    stopWatching()
  })
}
