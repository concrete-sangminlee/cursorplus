import { app, BrowserWindow, ipcMain, dialog, Menu, screen, globalShortcut } from 'electron'
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

// --- Constants ---
const isMac = process.platform === 'darwin'
const isWindows = process.platform === 'win32'

const SUPPORTED_FILE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.py',
  '.html', '.css', '.scss', '.less', '.yaml', '.yml',
  '.toml', '.xml', '.svg', '.sh', '.bash', '.zsh',
  '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.java',
  '.rb', '.php', '.vue', '.svelte', '.astro',
]

// --- Crash reporter / logging ---
const logDir = path.join(app.getPath('userData'), 'logs')
const crashLogPath = path.join(logDir, 'crash.log')

function ensureLogDir(): void {
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }
  } catch {
    // Best-effort
  }
}

function logCrash(prefix: string, err: unknown): void {
  const timestamp = new Date().toISOString()
  const message = err instanceof Error
    ? `${err.message}\n${err.stack || ''}`
    : String(err)
  const entry = `[${timestamp}] ${prefix}: ${message}\n`

  console.error(`[Main] ${prefix}:`, err)

  try {
    ensureLogDir()
    fs.appendFileSync(crashLogPath, entry)
  } catch {
    // Best-effort
  }
}

process.on('uncaughtException', (err) => {
  logCrash('Uncaught exception', err)
})
process.on('unhandledRejection', (err) => {
  logCrash('Unhandled rejection', err)
})

// --- Performance: V8 flags ---
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

// --- Window state persistence ---
interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
  displayId?: string
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

/**
 * Validate that saved position is visible on a currently-connected display.
 * If the saved display is gone or the window would be off-screen, reset position
 * so Electron centers on the primary display.
 */
function validateWindowPosition(state: WindowState): WindowState {
  if (state.x === undefined || state.y === undefined) return state

  const displays = screen.getAllDisplays()
  const windowCenter = {
    x: state.x + Math.floor(state.width / 2),
    y: state.y + Math.floor(state.height / 2),
  }

  const isOnScreen = displays.some((display) => {
    const { x, y, width, height } = display.workArea
    return (
      windowCenter.x >= x &&
      windowCenter.x < x + width &&
      windowCenter.y >= y &&
      windowCenter.y < y + height
    )
  })

  if (!isOnScreen) {
    // Reset to center of primary display
    const primary = screen.getPrimaryDisplay()
    return {
      ...state,
      x: Math.floor(primary.workArea.x + (primary.workArea.width - state.width) / 2),
      y: Math.floor(primary.workArea.y + (primary.workArea.height - state.height) / 2),
    }
  }

  return state
}

// --- Multi-window tracking ---
const windows: Set<BrowserWindow> = new Set()
let mainWindow: BrowserWindow | null = null

function getActiveWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() || mainWindow
}

// --- Auto-updater placeholder ---
interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  error?: string
}

function sendUpdateStatus(win: BrowserWindow, updateStatus: UpdateStatus): void {
  if (!win.isDestroyed()) {
    win.webContents.send('app:update-status', updateStatus)
  }
}

async function checkForUpdates(win: BrowserWindow): Promise<void> {
  try {
    sendUpdateStatus(win, { status: 'checking' })

    // Simulated update check - replace with electron-updater in production
    await new Promise((resolve) => setTimeout(resolve, 2000))

    sendUpdateStatus(win, { status: 'not-available' })

    console.log('[AutoUpdater] Update check complete (simulated: no update available)')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    sendUpdateStatus(win, { status: 'error', error: message })
    console.error('[AutoUpdater] Update check failed:', err)
  }
}

// --- File associations ---
function getFilesFromArgs(argv: string[]): string[] {
  return argv
    .slice(app.isPackaged ? 1 : 2) // skip electron path and script path in dev
    .filter((arg) => {
      if (arg.startsWith('-')) return false
      try {
        const ext = path.extname(arg).toLowerCase()
        return SUPPORTED_FILE_EXTENSIONS.includes(ext) && fs.existsSync(arg)
      } catch {
        return false
      }
    })
    .map((arg) => path.resolve(arg))
}

function openFilesInWindow(win: BrowserWindow, filePaths: string[]): void {
  if (filePaths.length > 0 && !win.isDestroyed()) {
    // Wait for renderer to be ready, then send file open requests
    const send = () => {
      filePaths.forEach((filePath) => {
        win.webContents.send('app:open-file', filePath)
      })
    }
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send)
    } else {
      send()
    }
  }
}

// --- Application Menu ---
function buildAppMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = []

  // macOS App menu
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'Cmd+,',
          click: () => getActiveWindow()?.webContents.send('app:open-settings'),
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    })
  }

  // File menu
  template.push({
    label: 'File',
    submenu: [
      {
        label: 'New File',
        accelerator: 'CmdOrCtrl+N',
        click: () => getActiveWindow()?.webContents.send('app:new-file'),
      },
      {
        label: 'New Window',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => createWindow(),
      },
      { type: 'separator' },
      {
        label: 'Open File...',
        accelerator: 'CmdOrCtrl+O',
        click: async () => {
          const win = getActiveWindow()
          if (!win) return
          const result = await dialog.showOpenDialog(win, {
            properties: ['openFile', 'multiSelections'],
            filters: [
              { name: 'All Supported', extensions: SUPPORTED_FILE_EXTENSIONS.map((e) => e.slice(1)) },
              { name: 'All Files', extensions: ['*'] },
            ],
          })
          if (!result.canceled) {
            openFilesInWindow(win, result.filePaths)
          }
        },
      },
      {
        label: 'Open Folder...',
        accelerator: 'CmdOrCtrl+K CmdOrCtrl+O',
        click: async () => {
          const win = getActiveWindow()
          if (!win) return
          const result = await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
          })
          if (!result.canceled && result.filePaths[0]) {
            win.webContents.send('app:open-folder', result.filePaths[0])
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => getActiveWindow()?.webContents.send('app:save'),
      },
      {
        label: 'Save As...',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => getActiveWindow()?.webContents.send('app:save-as'),
      },
      {
        label: 'Save All',
        accelerator: isMac ? 'Cmd+Alt+S' : 'Ctrl+K S',
        click: () => getActiveWindow()?.webContents.send('app:save-all'),
      },
      { type: 'separator' },
      ...(!isMac
        ? [
            {
              label: 'Preferences',
              accelerator: 'Ctrl+,' as const,
              click: () => getActiveWindow()?.webContents.send('app:open-settings'),
            },
            { type: 'separator' as const },
          ]
        : []),
      isMac ? { role: 'close' as const } : { role: 'quit' as const },
    ],
  })

  // Edit menu
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo', accelerator: 'CmdOrCtrl+Z' },
      { role: 'redo', accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y' },
      { type: 'separator' },
      { role: 'cut', accelerator: 'CmdOrCtrl+X' },
      { role: 'copy', accelerator: 'CmdOrCtrl+C' },
      { role: 'paste', accelerator: 'CmdOrCtrl+V' },
      { role: 'selectAll', accelerator: 'CmdOrCtrl+A' },
      { type: 'separator' },
      {
        label: 'Find',
        accelerator: 'CmdOrCtrl+F',
        click: () => getActiveWindow()?.webContents.send('app:find'),
      },
      {
        label: 'Replace',
        accelerator: 'CmdOrCtrl+H',
        click: () => getActiveWindow()?.webContents.send('app:replace'),
      },
      { type: 'separator' },
      {
        label: 'Find in Files',
        accelerator: 'CmdOrCtrl+Shift+F',
        click: () => getActiveWindow()?.webContents.send('app:find-in-files'),
      },
      {
        label: 'Replace in Files',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => getActiveWindow()?.webContents.send('app:replace-in-files'),
      },
    ],
  })

  // View menu
  template.push({
    label: 'View',
    submenu: [
      {
        label: 'Command Palette...',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: () => getActiveWindow()?.webContents.send('app:command-palette'),
      },
      { type: 'separator' },
      {
        label: 'Explorer',
        accelerator: 'CmdOrCtrl+Shift+E',
        click: () => getActiveWindow()?.webContents.send('app:toggle-sidebar', 'explorer'),
      },
      {
        label: 'Search',
        accelerator: 'CmdOrCtrl+Shift+F',
        click: () => getActiveWindow()?.webContents.send('app:toggle-sidebar', 'search'),
      },
      {
        label: 'Source Control',
        accelerator: 'CmdOrCtrl+Shift+G',
        click: () => getActiveWindow()?.webContents.send('app:toggle-sidebar', 'git'),
      },
      {
        label: 'Extensions',
        accelerator: 'CmdOrCtrl+Shift+X',
        click: () => getActiveWindow()?.webContents.send('app:toggle-sidebar', 'extensions'),
      },
      { type: 'separator' },
      {
        label: 'Toggle Sidebar',
        accelerator: 'CmdOrCtrl+B',
        click: () => getActiveWindow()?.webContents.send('app:toggle-sidebar'),
      },
      {
        label: 'Toggle Panel',
        accelerator: 'CmdOrCtrl+J',
        click: () => getActiveWindow()?.webContents.send('app:toggle-panel'),
      },
      { type: 'separator' },
      {
        label: 'Zoom In',
        accelerator: 'CmdOrCtrl+=',
        click: () => {
          const win = getActiveWindow()
          if (win) {
            const current = win.webContents.getZoomLevel()
            win.webContents.setZoomLevel(current + 0.5)
          }
        },
      },
      {
        label: 'Zoom Out',
        accelerator: 'CmdOrCtrl+-',
        click: () => {
          const win = getActiveWindow()
          if (win) {
            const current = win.webContents.getZoomLevel()
            win.webContents.setZoomLevel(current - 0.5)
          }
        },
      },
      {
        label: 'Reset Zoom',
        accelerator: 'CmdOrCtrl+0',
        click: () => getActiveWindow()?.webContents.setZoomLevel(0),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'toggleDevTools', accelerator: isMac ? 'Cmd+Alt+I' : 'Ctrl+Shift+I' },
    ],
  })

  // Go menu
  template.push({
    label: 'Go',
    submenu: [
      {
        label: 'Go to File...',
        accelerator: 'CmdOrCtrl+P',
        click: () => getActiveWindow()?.webContents.send('app:quick-open'),
      },
      {
        label: 'Go to Symbol...',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: () => getActiveWindow()?.webContents.send('app:go-to-symbol'),
      },
      {
        label: 'Go to Line...',
        accelerator: 'CmdOrCtrl+G',
        click: () => getActiveWindow()?.webContents.send('app:go-to-line'),
      },
      { type: 'separator' },
      {
        label: 'Go Back',
        accelerator: isMac ? 'Ctrl+-' : 'Alt+Left',
        click: () => getActiveWindow()?.webContents.send('app:go-back'),
      },
      {
        label: 'Go Forward',
        accelerator: isMac ? 'Ctrl+Shift+-' : 'Alt+Right',
        click: () => getActiveWindow()?.webContents.send('app:go-forward'),
      },
      { type: 'separator' },
      {
        label: 'Go to Definition',
        accelerator: 'F12',
        click: () => getActiveWindow()?.webContents.send('app:go-to-definition'),
      },
      {
        label: 'Peek Definition',
        accelerator: isMac ? 'Alt+F12' : 'Alt+F12',
        click: () => getActiveWindow()?.webContents.send('app:peek-definition'),
      },
    ],
  })

  // Run menu
  template.push({
    label: 'Run',
    submenu: [
      {
        label: 'Start Debugging',
        accelerator: 'F5',
        click: () => getActiveWindow()?.webContents.send('app:start-debugging'),
      },
      {
        label: 'Run Without Debugging',
        accelerator: 'Ctrl+F5',
        click: () => getActiveWindow()?.webContents.send('app:run-without-debugging'),
      },
      {
        label: 'Stop Debugging',
        accelerator: 'Shift+F5',
        click: () => getActiveWindow()?.webContents.send('app:stop-debugging'),
      },
      {
        label: 'Restart Debugging',
        accelerator: 'CmdOrCtrl+Shift+F5',
        click: () => getActiveWindow()?.webContents.send('app:restart-debugging'),
      },
      { type: 'separator' },
      {
        label: 'Toggle Breakpoint',
        accelerator: 'F9',
        click: () => getActiveWindow()?.webContents.send('app:toggle-breakpoint'),
      },
      { type: 'separator' },
      {
        label: 'Run Task...',
        click: () => getActiveWindow()?.webContents.send('app:run-task'),
      },
      {
        label: 'Run Build Task',
        accelerator: 'CmdOrCtrl+Shift+B',
        click: () => getActiveWindow()?.webContents.send('app:run-build-task'),
      },
    ],
  })

  // Terminal menu
  template.push({
    label: 'Terminal',
    submenu: [
      {
        label: 'New Terminal',
        accelerator: 'CmdOrCtrl+`',
        click: () => getActiveWindow()?.webContents.send('app:new-terminal'),
      },
      {
        label: 'Split Terminal',
        accelerator: 'CmdOrCtrl+Shift+`',
        click: () => getActiveWindow()?.webContents.send('app:split-terminal'),
      },
      { type: 'separator' },
      {
        label: 'Run Active File',
        click: () => getActiveWindow()?.webContents.send('app:run-active-file'),
      },
      {
        label: 'Run Selected Text',
        click: () => getActiveWindow()?.webContents.send('app:run-selected-text'),
      },
    ],
  })

  // Help menu
  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'Welcome',
        click: () => getActiveWindow()?.webContents.send('app:show-welcome'),
      },
      {
        label: 'Documentation',
        click: () => {
          const { shell } = require('electron')
          shell.openExternal('https://github.com/orion-ide/orion')
        },
      },
      {
        label: 'Release Notes',
        click: () => getActiveWindow()?.webContents.send('app:show-release-notes'),
      },
      { type: 'separator' },
      {
        label: 'Keyboard Shortcuts',
        accelerator: 'CmdOrCtrl+K CmdOrCtrl+S',
        click: () => getActiveWindow()?.webContents.send('app:show-keybindings'),
      },
      { type: 'separator' },
      {
        label: 'Report Issue...',
        click: () => {
          const { shell } = require('electron')
          shell.openExternal('https://github.com/orion-ide/orion/issues')
        },
      },
      { type: 'separator' },
      {
        label: 'Check for Updates...',
        click: () => {
          const win = getActiveWindow()
          if (win) checkForUpdates(win)
        },
      },
      { type: 'separator' },
      ...(!isMac
        ? [
            {
              label: `About ${app.name}`,
              click: () => {
                const win = getActiveWindow()
                if (win) {
                  dialog.showMessageBox(win, {
                    type: 'info',
                    title: `About ${app.name}`,
                    message: app.name,
                    detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode.js: ${process.versions.node}\nV8: ${process.versions.v8}\nOS: ${process.platform} ${process.arch}`,
                  })
                }
              },
            },
          ]
        : []),
      {
        label: 'Toggle Developer Tools',
        accelerator: isMac ? 'Cmd+Alt+I' : 'F12',
        click: () => getActiveWindow()?.webContents.toggleDevTools(),
      },
    ],
  })

  return Menu.buildFromTemplate(template)
}

// --- Window creation ---
function createWindow(filesToOpen?: string[]): BrowserWindow {
  const savedState = validateWindowPosition(loadWindowState())

  const win = new BrowserWindow({
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
      backgroundThrottling: false, // Keep terminals responsive when in background
    },
  })

  windows.add(win)

  // Set mainWindow reference (first window or when mainWindow is gone)
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = win
  }

  if (savedState.isMaximized) {
    win.maximize()
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Open DevTools in development
  if (process.env.VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools()
  }

  // Open files passed as arguments
  if (filesToOpen && filesToOpen.length > 0) {
    openFilesInWindow(win, filesToOpen)
  }

  // Auto-updater check on first window
  if (windows.size === 1) {
    win.webContents.once('did-finish-load', () => {
      // Delay update check slightly to not interfere with startup
      setTimeout(() => checkForUpdates(win), 5000)
    })
  }

  // --- Track window bounds for persistence ---
  let boundsTimeout: ReturnType<typeof setTimeout> | null = null
  const debounceSaveBounds = () => {
    if (boundsTimeout) clearTimeout(boundsTimeout)
    boundsTimeout = setTimeout(() => {
      if (win && !win.isDestroyed() && !win.isMaximized()) {
        const bounds = win.getBounds()
        savedState.x = bounds.x
        savedState.y = bounds.y
        savedState.width = bounds.width
        savedState.height = bounds.height
        // Track which display the window is on
        const currentDisplay = screen.getDisplayMatching(bounds)
        savedState.displayId = String(currentDisplay.id)
      }
    }, 300)
  }

  win.on('resize', debounceSaveBounds)
  win.on('move', debounceSaveBounds)

  win.on('close', () => {
    if (!win.isDestroyed()) {
      const isMaximized = win.isMaximized()
      if (!isMaximized) {
        const bounds = win.getBounds()
        savedState.x = bounds.x
        savedState.y = bounds.y
        savedState.width = bounds.width
        savedState.height = bounds.height
      }
      savedState.isMaximized = isMaximized
      saveWindowState(savedState)
    }
  })

  win.on('closed', () => {
    windows.delete(win)
    if (mainWindow === win) {
      mainWindow = windows.size > 0 ? Array.from(windows)[0] : null
    }
  })

  return win
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

  // New window via IPC (renderer can also request it)
  ipcMain.on('app:new-window', () => {
    createWindow()
  })

  // Update check via IPC
  ipcMain.handle('app:check-for-updates', async () => {
    const win = getActiveWindow()
    if (win) await checkForUpdates(win)
  })

  // Get app info
  ipcMain.handle('app:get-info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    v8: process.versions.v8,
    platform: process.platform,
    arch: process.arch,
  }))
}

// --- Single instance lock & file open protocol ---
const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  // Another instance is already running - pass args and quit
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Someone tried to run a second instance or open a file
    const filesToOpen = getFilesFromArgs(argv)

    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      openFilesInWindow(mainWindow, filesToOpen)
    }
  })

  // macOS: open-file event for file associations
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    if (mainWindow) {
      openFilesInWindow(mainWindow, [filePath])
    } else {
      // App not ready yet, store for later
      pendingFilesToOpen.push(filePath)
    }
  })

  app.whenReady().then(() => {
    registerIpcHandlers()

    // Build and set application menu
    // On Windows with custom title bar, the menu is hidden but accelerators still work
    const menu = buildAppMenu()
    Menu.setApplicationMenu(isWindows ? null : menu)

    // On Windows, keep the menu available for accelerators even though it's hidden
    if (isWindows) {
      Menu.setApplicationMenu(menu)
      // The menu won't show because frame: false, but accelerators are active
    }

    // Parse files from command line arguments
    const cliFiles = getFilesFromArgs(process.argv)
    const filesToOpen = [...pendingFilesToOpen, ...cliFiles]

    createWindow(filesToOpen.length > 0 ? filesToOpen : undefined)

    // Register global shortcut for new window
    globalShortcut.register('CmdOrCtrl+Shift+N', () => {
      createWindow()
    })
  })

  app.on('window-all-closed', () => {
    globalShortcut.unregisterAll()
    app.quit()
  })

  app.on('activate', () => {
    if (windows.size === 0) createWindow()
  })
}

// Files received before app is ready (macOS open-file)
const pendingFilesToOpen: string[] = []
