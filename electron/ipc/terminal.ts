import type { IpcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { createTerminal, writeToTerminal, resizeTerminal, killTerminal } from '../terminal/manager'
import { validateShellOptions } from './terminal-options-guard'

export function registerTerminalHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.TERM_CREATE, async (_event, id: string, shellOptions?: unknown) => {
    let safeOptions
    try {
      safeOptions = validateShellOptions(shellOptions)
    } catch (err: any) {
      return { success: false, error: err.message }
    }
    return await createTerminal(id, (data) => {
      getWindow()?.webContents.send(IPC.TERM_DATA, id, data)
    }, safeOptions)
  })

  ipcMain.on(IPC.TERM_WRITE, (_event, id: string, data: string) => {
    writeToTerminal(id, data)
  })

  ipcMain.on(IPC.TERM_RESIZE, (_event, id: string, cols: number, rows: number) => {
    resizeTerminal(id, cols, rows)
  })

  ipcMain.on(IPC.TERM_KILL, (_event, id: string) => {
    killTerminal(id)
  })
}
