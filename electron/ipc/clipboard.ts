import type { IpcMain } from 'electron'
import { clipboard, nativeImage } from 'electron'
import { IPC } from '../../shared/ipc-channels'

export function registerClipboardHandlers(ipcMain: IpcMain) {
  // clipboard:read-text - read text from clipboard
  ipcMain.handle(IPC.CLIPBOARD_READ_TEXT, async () => {
    try {
      const text = clipboard.readText()
      return { success: true, text }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // clipboard:write-text - write text to clipboard
  ipcMain.handle(IPC.CLIPBOARD_WRITE_TEXT, async (_event, text: string) => {
    try {
      clipboard.writeText(text)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })

  // clipboard:read-image - read image from clipboard as base64 PNG
  ipcMain.handle(IPC.CLIPBOARD_READ_IMAGE, async () => {
    try {
      const image = clipboard.readImage()
      if (image.isEmpty()) {
        return { success: true, data: null }
      }
      const base64 = image.toPNG().toString('base64')
      return { success: true, data: base64 }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  })
}
