import chokidar from 'chokidar'
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'

let watcher: chokidar.FSWatcher | null = null

export function startWatching(dirPath: string, getWindow: () => BrowserWindow | null) {
  stopWatching()

  watcher = chokidar.watch(dirPath, {
    ignored: /(node_modules|\.git|dist|dist-electron|\.superpowers)/,
    persistent: true,
    ignoreInitial: true,
  })

  watcher
    .on('add', (filePath) => getWindow()?.webContents.send(IPC.FS_CHANGE, 'add', filePath))
    .on('change', (filePath) => getWindow()?.webContents.send(IPC.FS_CHANGE, 'change', filePath))
    .on('unlink', (filePath) => getWindow()?.webContents.send(IPC.FS_CHANGE, 'unlink', filePath))
    .on('addDir', (filePath) => getWindow()?.webContents.send(IPC.FS_CHANGE, 'addDir', filePath))
    .on('unlinkDir', (filePath) => getWindow()?.webContents.send(IPC.FS_CHANGE, 'unlinkDir', filePath))
}

export function stopWatching() {
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
