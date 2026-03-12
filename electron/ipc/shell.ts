import type { IpcMain } from 'electron'
import { shell } from 'electron'
import { IPC } from '../../shared/ipc-channels'

export function registerShellHandlers(ipcMain: IpcMain) {
  // shell:open-external - open URL in default browser
  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    try {
      await shell.openExternal(url)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // shell:show-item-in-folder - open file manager and select the file
  ipcMain.handle(IPC.SHELL_SHOW_ITEM_IN_FOLDER, async (_event, filePath: string) => {
    try {
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // shell:open-path - open file with default system application
  ipcMain.handle(IPC.SHELL_OPEN_PATH, async (_event, filePath: string) => {
    try {
      const errorMessage = await shell.openPath(filePath)
      if (errorMessage) {
        return { success: false, error: errorMessage }
      }
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
