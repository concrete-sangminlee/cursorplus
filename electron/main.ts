import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { registerFilesystemHandlers } from './ipc/filesystem'
import { registerTerminalHandlers } from './ipc/terminal'
import { registerSettingsHandlers } from './ipc/settings'
import { registerOmoHandlers } from './ipc/omo'
import { registerGitHandlers } from './ipc/git'
import { registerWorkspaceHandlers } from './ipc/workspace'
import { registerFileOperationHandlers } from './ipc/file-operations'
import { registerClipboardHandlers } from './ipc/clipboard'
import { registerShellHandlers } from './ipc/shell'
import { registerTaskHandlers } from './ipc/tasks'

// --- Window state persistence ---
interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

const stateFilePath = path.join(app.getPath('userData'), 'window-state.json')

function loadWindowState(): WindowState {
  try {
    const data = fs.readFileSync(stateFilePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { width: 1400, height: 900, isMaximized: false }
  }
}

function saveWindowState(state: WindowState): void {
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify(state))
  } catch (err) {
    console.error('[Main] Failed to save window state:', err)
  }
}
// --- End window state persistence ---

// Prevent error dialogs from crashing the app
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[Main] Unhandled rejection:', err)
})

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const savedState = loadWindowState()

  mainWindow = new BrowserWindow({
    width: savedState.width,
    height: savedState.height,
    ...(savedState.x !== undefined && savedState.y !== undefined
      ? { x: savedState.x, y: savedState.y }
      : {}),
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (savedState.isMaximized) {
    mainWindow.maximize()
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open DevTools in development
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools()
  }

  // --- Track window bounds for persistence ---
  let boundsTimeout: ReturnType<typeof setTimeout> | null = null
  const debounceSaveBounds = () => {
    if (boundsTimeout) clearTimeout(boundsTimeout)
    boundsTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isMaximized()) {
        const bounds = mainWindow.getBounds()
        savedState.x = bounds.x
        savedState.y = bounds.y
        savedState.width = bounds.width
        savedState.height = bounds.height
      }
    }, 300)
  }

  mainWindow.on('resize', debounceSaveBounds)
  mainWindow.on('move', debounceSaveBounds)

  mainWindow.on('close', () => {
    if (mainWindow) {
      const isMaximized = mainWindow.isMaximized()
      if (!isMaximized) {
        const bounds = mainWindow.getBounds()
        savedState.x = bounds.x
        savedState.y = bounds.y
        savedState.width = bounds.width
        savedState.height = bounds.height
      }
      savedState.isMaximized = isMaximized
      saveWindowState(savedState)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpcHandlers() {
  registerFilesystemHandlers(ipcMain, () => mainWindow)
  registerTerminalHandlers(ipcMain, () => mainWindow)
  registerSettingsHandlers(ipcMain)
  registerOmoHandlers(ipcMain, () => mainWindow)
  registerGitHandlers()
  registerWorkspaceHandlers(ipcMain)
  registerFileOperationHandlers(ipcMain, () => mainWindow)
  registerClipboardHandlers(ipcMain)
  registerShellHandlers(ipcMain)
  registerTaskHandlers(ipcMain, () => mainWindow)

  // Window controls
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('win:close', () => mainWindow?.close())

  // Open folder dialog
  ipcMain.handle('fs:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
