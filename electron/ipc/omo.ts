import type { IpcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { startOmo, sendToOmo, stopOmo } from '../omo-bridge/bridge'

export function registerOmoHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.OMO_START, async (_event, projectPath: string) => {
    startOmo(projectPath, (event) => {
      getWindow()?.webContents.send(IPC.OMO_MESSAGE, event)
    })
  })

  ipcMain.handle(IPC.OMO_STOP, async () => {
    stopOmo()
  })

  ipcMain.on(IPC.OMO_SEND, (_event, message) => {
    sendToOmo(message)
  })
}
