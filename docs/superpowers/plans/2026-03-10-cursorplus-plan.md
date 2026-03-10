# CursorPlus Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build CursorPlus, an Agent-First AI IDE (Cursor clone) powered by oh-my-openagent, as an Electron desktop app with Monaco Editor, multi-agent panel, AI chat, integrated terminal, and file explorer.

**Architecture:** Electron main process handles filesystem, terminal (node-pty), and OMO bridge. React renderer provides Monaco Editor, Agent Panel, AI Chat, File Explorer, and Terminal via xterm.js. oh-my-openagent orchestrates multi-model AI agents in background processes, communicating via WebSocket.

**Tech Stack:** Electron 33+, React 19, TypeScript, Monaco Editor, xterm.js, node-pty, Zustand, TailwindCSS, Vite, electron-builder, oh-my-openagent

**Spec:** `docs/superpowers/specs/2026-03-10-cursorplus-design.md`

---

## File Map

### Electron Main Process
| File | Responsibility |
|------|---------------|
| `electron/main.ts` | App entry, window creation, IPC registration |
| `electron/preload.ts` | Context bridge, expose IPC API to renderer |
| `electron/ipc/filesystem.ts` | File read/write/delete/rename IPC handlers |
| `electron/ipc/terminal.ts` | Terminal create/write/resize/kill IPC handlers |
| `electron/ipc/settings.ts` | Settings get/set, API key encryption IPC handlers |
| `electron/ipc/omo.ts` | OMO bridge start/stop/message IPC handlers |
| `electron/terminal/manager.ts` | node-pty process pool, shell detection |
| `electron/filesystem/watcher.ts` | chokidar file watcher, change events |
| `electron/filesystem/operations.ts` | File CRUD, directory tree building |
| `electron/omo-bridge/bridge.ts` | OMO child process lifecycle, WebSocket relay |
| `electron/omo-bridge/protocol.ts` | Message types between Electron and OMO |

### Renderer (React)
| File | Responsibility |
|------|---------------|
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Root layout: ActivityBar + SidePanel + Editor + RightPanel |
| `src/components/ActivityBar.tsx` | Left icon strip, panel switching |
| `src/components/TabBar.tsx` | Editor tabs with AI badge |
| `src/components/Resizer.tsx` | Draggable panel resizer |
| `src/panels/EditorPanel.tsx` | Monaco Editor wrapper, inline AI suggestions |
| `src/panels/AgentPanel.tsx` | Agent cards, status, progress, delegation log |
| `src/panels/FileExplorer.tsx` | Tree view, context menu, git status |
| `src/panels/ChatPanel.tsx` | AI chat with Agent/Chat mode, model selector |
| `src/panels/TerminalPanel.tsx` | xterm.js wrapper, multi-tab, agent output |
| `src/panels/BottomPanel.tsx` | Terminal + Agent Log + Problems tabs |
| `src/store/editor.ts` | Open files, active tab, editor state |
| `src/store/agents.ts` | Agent statuses, logs, delegation chain |
| `src/store/chat.ts` | Chat messages, mode, model selection |
| `src/store/settings.ts` | API keys, theme, preferences |
| `src/store/files.ts` | File tree, git status |
| `src/store/terminal.ts` | Terminal sessions, active tab |
| `src/hooks/useIpc.ts` | IPC communication hook |
| `src/hooks/useMonaco.ts` | Monaco Editor setup hook |
| `src/hooks/useTerminal.ts` | xterm.js lifecycle hook |

### Shared
| File | Responsibility |
|------|---------------|
| `shared/types.ts` | Shared TypeScript types (Agent, File, Message, etc.) |
| `shared/ipc-channels.ts` | IPC channel name constants |
| `shared/constants.ts` | App-wide constants |

### Config
| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript config (base) |
| `tsconfig.node.json` | TypeScript config (Electron main) |
| `vite.config.ts` | Vite config for renderer |
| `electron-builder.yml` | Build/packaging config |
| `tailwind.config.ts` | TailwindCSS theme (dark Agent-First palette) |
| `postcss.config.js` | PostCSS config for Tailwind |
| `index.html` | Electron renderer HTML entry |

### Tests
| File | Responsibility |
|------|---------------|
| `tests/electron/filesystem.test.ts` | File operations unit tests |
| `tests/electron/terminal.test.ts` | Terminal manager unit tests |
| `tests/electron/omo-bridge.test.ts` | OMO bridge unit tests |
| `tests/src/store/*.test.ts` | Zustand store unit tests |
| `tests/src/panels/*.test.ts` | Panel component tests |

---

## Chunk 1: Project Scaffold & Electron Shell

### Task 1: Initialize project with package.json and dependencies

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`

- [ ] **Step 1: Create package.json with all dependencies**

```json
{
  "name": "cursorplus",
  "version": "0.1.0",
  "description": "Agent-First AI IDE powered by oh-my-openagent",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build && electron-builder",
    "preview": "vite preview",
    "test": "vitest",
    "electron:dev": "vite build && electron ."
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "monaco-editor": "^0.52.0",
    "@monaco-editor/react": "^4.7.0",
    "xterm": "^5.5.0",
    "xterm-addon-fit": "^0.10.0",
    "xterm-addon-web-links": "^0.11.0",
    "zustand": "^5.0.0",
    "electron-store": "^10.0.0",
    "chokidar": "^4.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "vite-plugin-electron": "^0.28.0",
    "vite-plugin-electron-renderer": "^0.14.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "node-pty": "^1.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"],
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "shared"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist-electron",
    "rootDir": ".",
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["electron", "shared", "vite.config.ts"]
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json tsconfig.node.json package-lock.json
git commit -m "chore: initialize project with dependencies"
```

### Task 2: Vite + Electron + Tailwind configuration

**Files:**
- Create: `vite.config.ts`
- Create: `electron-builder.yml`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Create: `index.html`

- [ ] **Step 1: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['node-pty', 'electron-store', 'chokidar'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
})
```

- [ ] **Step 2: Create electron-builder.yml**

```yaml
appId: com.cursorplus.app
productName: CursorPlus
directories:
  buildResources: build
  output: release
files:
  - dist-electron
  - dist
npmRebuild: true
publish:
  provider: github
  owner: concrete-sangminlee
  repo: cursorplus
win:
  target: nsis
mac:
  target: dmg
linux:
  target: AppImage
```

- [ ] **Step 3: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0d1117',
          secondary: '#161b22',
          tertiary: '#010409',
          hover: '#1c2128',
        },
        border: {
          primary: '#21262d',
          active: '#58a6ff',
        },
        text: {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#484f58',
        },
        accent: {
          blue: '#58a6ff',
          green: '#3fb950',
          orange: '#f78166',
          yellow: '#d29922',
          purple: '#bc8cff',
          red: '#f85149',
        },
        agent: {
          active: '#3fb950',
          working: '#58a6ff',
          idle: '#484f58',
        },
      },
      fontFamily: {
        mono: ['Cascadia Code', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 4: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
  },
}
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CursorPlus</title>
  </head>
  <body class="bg-bg-primary text-text-primary overflow-hidden">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Commit**

```bash
git add vite.config.ts electron-builder.yml tailwind.config.ts postcss.config.js index.html
git commit -m "chore: add Vite, Electron, Tailwind configuration"
```

### Task 3: Shared types and IPC channel constants

**Files:**
- Create: `shared/types.ts`
- Create: `shared/ipc-channels.ts`
- Create: `shared/constants.ts`

- [ ] **Step 1: Create shared/types.ts**

```typescript
// Agent types
export type AgentStatus = 'active' | 'working' | 'idle' | 'error'

export interface Agent {
  id: string
  name: string
  role: string
  status: AgentStatus
  currentTask?: string
  progress?: number // 0-100
  model?: string
}

export interface AgentLogEntry {
  id: string
  agentId: string
  timestamp: number
  message: string
  type: 'info' | 'action' | 'delegation' | 'error'
}

// File types
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  gitStatus?: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed'
}

export interface OpenFile {
  path: string
  name: string
  content: string
  language: string
  isModified: boolean
  aiModified: boolean
}

// Chat types
export type ChatMode = 'agent' | 'chat'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentName?: string
  model?: string
  timestamp: number
  taskProgress?: TaskProgress[]
}

export interface TaskProgress {
  name: string
  status: 'done' | 'working' | 'pending'
}

// Terminal types
export interface TerminalSession {
  id: string
  name: string
  type: 'shell' | 'agent-output'
}

// Settings types
export interface ModelConfig {
  provider: string
  modelId: string
  apiKey: string
  temperature?: number
  maxTokens?: number
}

export interface AppSettings {
  theme: 'dark'
  fontSize: number
  fontFamily: string
  models: ModelConfig[]
  activeModelId: string
  agentModelMapping: Record<string, string>
}

// OMO types
export interface OmoMessage {
  type: 'agent-status' | 'agent-log' | 'file-edit' | 'task-complete' | 'error'
  payload: unknown
}
```

- [ ] **Step 2: Create shared/ipc-channels.ts**

```typescript
export const IPC = {
  // Filesystem
  FS_READ_FILE: 'fs:read-file',
  FS_WRITE_FILE: 'fs:write-file',
  FS_DELETE: 'fs:delete',
  FS_RENAME: 'fs:rename',
  FS_READ_DIR: 'fs:read-dir',
  FS_WATCH_START: 'fs:watch-start',
  FS_WATCH_STOP: 'fs:watch-stop',
  FS_CHANGE: 'fs:change',
  FS_OPEN_FOLDER: 'fs:open-folder',

  // Terminal
  TERM_CREATE: 'term:create',
  TERM_WRITE: 'term:write',
  TERM_RESIZE: 'term:resize',
  TERM_KILL: 'term:kill',
  TERM_DATA: 'term:data',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // OMO
  OMO_START: 'omo:start',
  OMO_STOP: 'omo:stop',
  OMO_SEND: 'omo:send',
  OMO_MESSAGE: 'omo:message',

  // Window
  WIN_MINIMIZE: 'win:minimize',
  WIN_MAXIMIZE: 'win:maximize',
  WIN_CLOSE: 'win:close',
} as const
```

- [ ] **Step 3: Create shared/constants.ts**

```typescript
export const APP_NAME = 'CursorPlus'
export const DEFAULT_FONT_SIZE = 14
export const DEFAULT_FONT_FAMILY = 'Cascadia Code, Fira Code, Consolas, monospace'
export const MIN_PANEL_WIDTH = 200
export const DEFAULT_SIDE_PANEL_WIDTH = 260
export const DEFAULT_RIGHT_PANEL_WIDTH = 320
export const DEFAULT_BOTTOM_PANEL_HEIGHT = 200
export const ACTIVITY_BAR_WIDTH = 48
```

- [ ] **Step 4: Commit**

```bash
git add shared/
git commit -m "feat: add shared types, IPC channels, and constants"
```

### Task 4: Electron main process entry and preload

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`

- [ ] **Step 1: Create electron/main.ts**

```typescript
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { registerFilesystemHandlers } from './ipc/filesystem'
import { registerTerminalHandlers } from './ipc/terminal'
import { registerSettingsHandlers } from './ipc/settings'
import { registerOmoHandlers } from './ipc/omo'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function registerIpcHandlers() {
  registerFilesystemHandlers(ipcMain, () => mainWindow)
  registerTerminalHandlers(ipcMain, () => mainWindow)
  registerSettingsHandlers(ipcMain)
  registerOmoHandlers(ipcMain, () => mainWindow)

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
```

- [ ] **Step 2: Create electron/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

const api = {
  // Filesystem
  readFile: (filePath: string) => ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke(IPC.FS_WRITE_FILE, filePath, content),
  deleteFile: (filePath: string) => ipcRenderer.invoke(IPC.FS_DELETE, filePath),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke(IPC.FS_RENAME, oldPath, newPath),
  readDir: (dirPath: string) => ipcRenderer.invoke(IPC.FS_READ_DIR, dirPath),
  openFolder: () => ipcRenderer.invoke(IPC.FS_OPEN_FOLDER),
  watchStart: (dirPath: string) => ipcRenderer.send(IPC.FS_WATCH_START, dirPath),
  watchStop: () => ipcRenderer.send(IPC.FS_WATCH_STOP),
  onFsChange: (callback: (event: string, filePath: string) => void) => {
    const handler = (_: unknown, event: string, filePath: string) => callback(event, filePath)
    ipcRenderer.on(IPC.FS_CHANGE, handler)
    return () => ipcRenderer.removeListener(IPC.FS_CHANGE, handler)
  },

  // Terminal
  termCreate: (id: string) => ipcRenderer.invoke(IPC.TERM_CREATE, id),
  termWrite: (id: string, data: string) => ipcRenderer.send(IPC.TERM_WRITE, id, data),
  termResize: (id: string, cols: number, rows: number) => ipcRenderer.send(IPC.TERM_RESIZE, id, cols, rows),
  termKill: (id: string) => ipcRenderer.send(IPC.TERM_KILL, id),
  onTermData: (callback: (id: string, data: string) => void) => {
    const handler = (_: unknown, id: string, data: string) => callback(id, data)
    ipcRenderer.on(IPC.TERM_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.TERM_DATA, handler)
  },

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (settings: unknown) => ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  // OMO
  omoStart: (projectPath: string) => ipcRenderer.invoke(IPC.OMO_START, projectPath),
  omoStop: () => ipcRenderer.invoke(IPC.OMO_STOP),
  omoSend: (message: unknown) => ipcRenderer.send(IPC.OMO_SEND, message),
  onOmoMessage: (callback: (message: unknown) => void) => {
    const handler = (_: unknown, message: unknown) => callback(message)
    ipcRenderer.on(IPC.OMO_MESSAGE, handler)
    return () => ipcRenderer.removeListener(IPC.OMO_MESSAGE, handler)
  },

  // Window
  minimize: () => ipcRenderer.send(IPC.WIN_MINIMIZE),
  maximize: () => ipcRenderer.send(IPC.WIN_MAXIMIZE),
  close: () => ipcRenderer.send(IPC.WIN_CLOSE),
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
```

- [ ] **Step 3: Commit**

```bash
git add electron/main.ts electron/preload.ts
git commit -m "feat: add Electron main process and preload script"
```

### Task 5: IPC handlers (filesystem, terminal, settings, OMO stubs)

**Files:**
- Create: `electron/ipc/filesystem.ts`
- Create: `electron/ipc/terminal.ts`
- Create: `electron/ipc/settings.ts`
- Create: `electron/ipc/omo.ts`
- Create: `electron/filesystem/operations.ts`
- Create: `electron/filesystem/watcher.ts`
- Create: `electron/terminal/manager.ts`
- Create: `electron/omo-bridge/bridge.ts`
- Create: `electron/omo-bridge/protocol.ts`

- [ ] **Step 1: Create electron/filesystem/operations.ts**

```typescript
import fs from 'fs/promises'
import path from 'path'
import type { FileNode } from '../../shared/types'

const IGNORED = new Set(['node_modules', '.git', '.DS_Store', 'dist', 'dist-electron', '.superpowers'])

export async function readFileContent(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

export async function writeFileContent(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function deleteItem(itemPath: string): Promise<void> {
  await fs.rm(itemPath, { recursive: true })
}

export async function renameItem(oldPath: string, newPath: string): Promise<void> {
  await fs.rename(oldPath, newPath)
}

export async function buildFileTree(dirPath: string): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue

    const fullPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const children = await buildFileTree(fullPath)
      nodes.push({ name: entry.name, path: fullPath, type: 'directory', children })
    } else {
      nodes.push({ name: entry.name, path: fullPath, type: 'file' })
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescriptreact',
    '.js': 'javascript', '.jsx': 'javascriptreact',
    '.json': 'json', '.md': 'markdown', '.html': 'html',
    '.css': 'css', '.scss': 'scss', '.py': 'python',
    '.rs': 'rust', '.go': 'go', '.java': 'java',
    '.c': 'c', '.cpp': 'cpp', '.h': 'c',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
    '.sql': 'sql', '.graphql': 'graphql', '.xml': 'xml',
    '.svg': 'xml', '.vue': 'vue', '.svelte': 'svelte',
  }
  return map[ext] || 'plaintext'
}
```

- [ ] **Step 2: Create electron/filesystem/watcher.ts**

```typescript
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
```

- [ ] **Step 3: Create electron/ipc/filesystem.ts**

```typescript
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
```

- [ ] **Step 4: Create electron/terminal/manager.ts**

```typescript
import os from 'os'

interface PtyProcess {
  onData: (callback: (data: string) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

const terminals = new Map<string, PtyProcess>()

function detectShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

export async function createTerminal(
  id: string,
  onData: (data: string) => void
): Promise<void> {
  // Dynamic import because node-pty is a native module
  const pty = await import('node-pty')

  const shell = detectShell()
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env as Record<string, string>,
  })

  term.onData(onData)
  terminals.set(id, term)
}

export function writeToTerminal(id: string, data: string) {
  terminals.get(id)?.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  terminals.get(id)?.resize(cols, rows)
}

export function killTerminal(id: string) {
  const term = terminals.get(id)
  if (term) {
    term.kill()
    terminals.delete(id)
  }
}

export function killAllTerminals() {
  for (const [id, term] of terminals) {
    term.kill()
    terminals.delete(id)
  }
}
```

- [ ] **Step 5: Create electron/ipc/terminal.ts**

```typescript
import type { IpcMain, BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { createTerminal, writeToTerminal, resizeTerminal, killTerminal } from '../terminal/manager'

export function registerTerminalHandlers(ipcMain: IpcMain, getWindow: () => BrowserWindow | null) {
  ipcMain.handle(IPC.TERM_CREATE, async (_event, id: string) => {
    await createTerminal(id, (data) => {
      getWindow()?.webContents.send(IPC.TERM_DATA, id, data)
    })
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
```

- [ ] **Step 6: Create electron/ipc/settings.ts**

```typescript
import type { IpcMain } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { AppSettings } from '../../shared/types'

// electron-store is loaded dynamically since it's ESM
let store: any = null

async function getStore() {
  if (!store) {
    const Store = (await import('electron-store')).default
    store = new Store<AppSettings>({
      name: 'cursorplus-settings',
      defaults: {
        theme: 'dark',
        fontSize: 14,
        fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
        models: [],
        activeModelId: '',
        agentModelMapping: {},
      },
    })
  }
  return store
}

export function registerSettingsHandlers(ipcMain: IpcMain) {
  ipcMain.handle(IPC.SETTINGS_GET, async () => {
    const s = await getStore()
    return s.store
  })

  ipcMain.handle(IPC.SETTINGS_SET, async (_event, settings: Partial<AppSettings>) => {
    const s = await getStore()
    for (const [key, value] of Object.entries(settings)) {
      s.set(key, value)
    }
    return s.store
  })
}
```

- [ ] **Step 7: Create electron/omo-bridge/protocol.ts**

```typescript
export interface OmoBridgeMessage {
  type: 'chat' | 'agent-command' | 'cancel'
  payload: {
    message?: string
    mode?: 'agent' | 'chat'
    model?: string
    projectPath?: string
    files?: string[]
  }
}

export interface OmoEvent {
  type: 'agent-status' | 'agent-log' | 'file-edit' | 'chat-response' | 'task-complete' | 'error'
  payload: unknown
}
```

- [ ] **Step 8: Create electron/omo-bridge/bridge.ts**

```typescript
import { ChildProcess, fork } from 'child_process'
import type { OmoBridgeMessage, OmoEvent } from './protocol'

let omoProcess: ChildProcess | null = null
let messageHandler: ((event: OmoEvent) => void) | null = null

export function startOmo(projectPath: string, onMessage: (event: OmoEvent) => void): void {
  stopOmo()
  messageHandler = onMessage

  // TODO: Replace with actual oh-my-openagent integration
  // For now, stub the process to enable UI development
  onMessage({
    type: 'agent-status',
    payload: {
      agents: [
        { id: 'sisyphus', name: 'Sisyphus', role: 'orchestrator', status: 'idle' },
        { id: 'hephaestus', name: 'Hephaestus', role: 'deep worker', status: 'idle' },
        { id: 'prometheus', name: 'Prometheus', role: 'planner', status: 'idle' },
        { id: 'oracle', name: 'Oracle', role: 'debugger', status: 'idle' },
      ],
    },
  })
}

export function sendToOmo(message: OmoBridgeMessage): void {
  if (omoProcess) {
    omoProcess.send(message)
  } else {
    // Stub: echo back a simulated response
    messageHandler?.({
      type: 'chat-response',
      payload: {
        agentName: 'Sisyphus',
        content: `[Stub] Received: ${message.payload.message}`,
        model: message.payload.model || 'stub',
      },
    })
  }
}

export function stopOmo(): void {
  if (omoProcess) {
    omoProcess.kill()
    omoProcess = null
  }
  messageHandler = null
}
```

- [ ] **Step 9: Create electron/ipc/omo.ts**

```typescript
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
```

- [ ] **Step 10: Commit**

```bash
git add electron/
git commit -m "feat: add IPC handlers for filesystem, terminal, settings, and OMO bridge"
```

---

## Chunk 2: React Renderer — Stores & Layout Shell

### Task 6: Zustand stores

**Files:**
- Create: `src/store/editor.ts`
- Create: `src/store/agents.ts`
- Create: `src/store/chat.ts`
- Create: `src/store/settings.ts`
- Create: `src/store/files.ts`
- Create: `src/store/terminal.ts`

- [ ] **Step 1: Create src/store/editor.ts**

```typescript
import { create } from 'zustand'
import type { OpenFile } from '@shared/types'

interface EditorStore {
  openFiles: OpenFile[]
  activeFilePath: string | null
  openFile: (file: OpenFile) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  updateFileContent: (path: string, content: string) => void
  markAiModified: (path: string) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  openFiles: [],
  activeFilePath: null,

  openFile: (file) =>
    set((state) => {
      const exists = state.openFiles.find((f) => f.path === file.path)
      if (exists) return { activeFilePath: file.path }
      return { openFiles: [...state.openFiles, file], activeFilePath: file.path }
    }),

  closeFile: (path) =>
    set((state) => {
      const files = state.openFiles.filter((f) => f.path !== path)
      const activePath =
        state.activeFilePath === path
          ? files[files.length - 1]?.path ?? null
          : state.activeFilePath
      return { openFiles: files, activeFilePath: activePath }
    }),

  setActiveFile: (path) => set({ activeFilePath: path }),

  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content, isModified: true } : f
      ),
    })),

  markAiModified: (path) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, aiModified: true } : f
      ),
    })),
}))
```

- [ ] **Step 2: Create src/store/agents.ts**

```typescript
import { create } from 'zustand'
import type { Agent, AgentLogEntry } from '@shared/types'

interface AgentStore {
  agents: Agent[]
  logs: AgentLogEntry[]
  setAgents: (agents: Agent[]) => void
  updateAgent: (id: string, update: Partial<Agent>) => void
  addLog: (entry: AgentLogEntry) => void
  clearLogs: () => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  logs: [],

  setAgents: (agents) => set({ agents }),

  updateAgent: (id, update) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...update } : a)),
    })),

  addLog: (entry) =>
    set((state) => ({ logs: [...state.logs.slice(-200), entry] })),

  clearLogs: () => set({ logs: [] }),
}))
```

- [ ] **Step 3: Create src/store/chat.ts**

```typescript
import { create } from 'zustand'
import type { ChatMessage, ChatMode } from '@shared/types'

interface ChatStore {
  messages: ChatMessage[]
  mode: ChatMode
  selectedModel: string
  isStreaming: boolean
  addMessage: (message: ChatMessage) => void
  updateLastAssistant: (content: string) => void
  setMode: (mode: ChatMode) => void
  setModel: (model: string) => void
  setStreaming: (streaming: boolean) => void
  clearMessages: () => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  mode: 'agent',
  selectedModel: '',
  isStreaming: false,

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  updateLastAssistant: (content) =>
    set((state) => {
      const msgs = [...state.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content }
          break
        }
      }
      return { messages: msgs }
    }),

  setMode: (mode) => set({ mode }),
  setModel: (model) => set({ selectedModel: model }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearMessages: () => set({ messages: [] }),
}))
```

- [ ] **Step 4: Create src/store/settings.ts**

```typescript
import { create } from 'zustand'
import type { AppSettings, ModelConfig } from '@shared/types'
import { DEFAULT_FONT_SIZE, DEFAULT_FONT_FAMILY } from '@shared/constants'

interface SettingsStore {
  settings: AppSettings
  setSettings: (settings: AppSettings) => void
  addModel: (model: ModelConfig) => void
  removeModel: (modelId: string) => void
  setActiveModel: (modelId: string) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: {
    theme: 'dark',
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: DEFAULT_FONT_FAMILY,
    models: [],
    activeModelId: '',
    agentModelMapping: {},
  },

  setSettings: (settings) => set({ settings }),

  addModel: (model) =>
    set((state) => ({
      settings: { ...state.settings, models: [...state.settings.models, model] },
    })),

  removeModel: (modelId) =>
    set((state) => ({
      settings: {
        ...state.settings,
        models: state.settings.models.filter((m) => m.modelId !== modelId),
      },
    })),

  setActiveModel: (modelId) =>
    set((state) => ({
      settings: { ...state.settings, activeModelId: modelId },
    })),
}))
```

- [ ] **Step 5: Create src/store/files.ts**

```typescript
import { create } from 'zustand'
import type { FileNode } from '@shared/types'

interface FileStore {
  rootPath: string | null
  fileTree: FileNode[]
  expandedDirs: Set<string>
  setRootPath: (path: string) => void
  setFileTree: (tree: FileNode[]) => void
  toggleDir: (path: string) => void
}

export const useFileStore = create<FileStore>((set) => ({
  rootPath: null,
  fileTree: [],
  expandedDirs: new Set<string>(),

  setRootPath: (path) => set({ rootPath: path }),

  setFileTree: (tree) => set({ fileTree: tree }),

  toggleDir: (path) =>
    set((state) => {
      const next = new Set(state.expandedDirs)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { expandedDirs: next }
    }),
}))
```

- [ ] **Step 6: Create src/store/terminal.ts**

```typescript
import { create } from 'zustand'
import type { TerminalSession } from '@shared/types'

interface TerminalStore {
  sessions: TerminalSession[]
  activeSessionId: string | null
  addSession: (session: TerminalSession) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string) => void
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  sessions: [],
  activeSessionId: null,

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    })),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      return {
        sessions,
        activeSessionId:
          state.activeSessionId === id
            ? sessions[sessions.length - 1]?.id ?? null
            : state.activeSessionId,
      }
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),
}))
```

- [ ] **Step 7: Commit**

```bash
git add src/store/
git commit -m "feat: add Zustand stores for editor, agents, chat, settings, files, terminal"
```

### Task 7: Root layout shell — App.tsx + ActivityBar + Resizer

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/globals.css`
- Create: `src/components/ActivityBar.tsx`
- Create: `src/components/Resizer.tsx`
- Create: `src/components/TitleBar.tsx`
- Create: `src/types/electron.d.ts`

- [ ] **Step 1: Create src/types/electron.d.ts**

```typescript
import type { ElectronAPI } from '../../electron/preload'

declare global {
  interface Window {
    api: ElectronAPI
  }
}
```

- [ ] **Step 2: Create src/globals.css**

```css
@import 'tailwindcss';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
  background: #0d1117;
  color: #e6edf3;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #484f58;
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: #8b949e;
}

::selection {
  background: rgba(88, 166, 255, 0.3);
}
```

- [ ] **Step 3: Create src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 4: Create src/components/TitleBar.tsx**

```typescript
export default function TitleBar() {
  return (
    <div className="h-8 bg-bg-tertiary flex items-center px-3 select-none"
         style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <span className="text-accent-blue font-bold text-sm mr-2">⚡</span>
      <span className="text-text-secondary text-xs">CursorPlus</span>
      <div className="ml-auto flex gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button onClick={() => window.api.minimize()}
                className="w-8 h-6 flex items-center justify-center text-text-secondary hover:bg-bg-hover rounded text-xs">
          ─
        </button>
        <button onClick={() => window.api.maximize()}
                className="w-8 h-6 flex items-center justify-center text-text-secondary hover:bg-bg-hover rounded text-xs">
          □
        </button>
        <button onClick={() => window.api.close()}
                className="w-8 h-6 flex items-center justify-center text-text-secondary hover:bg-red-600 rounded text-xs">
          ✕
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create src/components/ActivityBar.tsx**

```typescript
import { useState } from 'react'

type PanelView = 'explorer' | 'search' | 'git' | 'agents'

interface Props {
  activeView: PanelView
  onViewChange: (view: PanelView) => void
}

const icons: { view: PanelView; icon: string; label: string }[] = [
  { view: 'explorer', icon: '📁', label: 'Explorer' },
  { view: 'search', icon: '🔍', label: 'Search' },
  { view: 'git', icon: '🔀', label: 'Git' },
  { view: 'agents', icon: '🤖', label: 'Agents' },
]

export default function ActivityBar({ activeView, onViewChange }: Props) {
  return (
    <div className="w-12 bg-bg-tertiary border-r border-border-primary flex flex-col items-center py-2 gap-1">
      {icons.map(({ view, icon, label }) => (
        <button
          key={view}
          title={label}
          onClick={() => onViewChange(view)}
          className={`w-9 h-9 flex items-center justify-center rounded-md text-base transition-colors relative
            ${activeView === view ? 'bg-bg-hover border border-accent-blue' : 'hover:bg-bg-hover'}`}
        >
          {icon}
          {view === 'agents' && (
            <span className="absolute top-1 right-1 w-2 h-2 bg-accent-green rounded-full" />
          )}
        </button>
      ))}
      <div className="flex-1" />
      <button
        title="Settings"
        className="w-9 h-9 flex items-center justify-center rounded-md text-base hover:bg-bg-hover"
      >
        ⚙️
      </button>
    </div>
  )
}

export type { PanelView }
```

- [ ] **Step 6: Create src/components/Resizer.tsx**

```typescript
import { useCallback, useRef } from 'react'

interface Props {
  direction: 'horizontal' | 'vertical'
  onResize: (delta: number) => void
}

export default function Resizer({ direction, onResize }: Props) {
  const startPos = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      startPos.current = direction === 'horizontal' ? e.clientX : e.clientY

      const onMouseMove = (e: MouseEvent) => {
        const current = direction === 'horizontal' ? e.clientX : e.clientY
        const delta = current - startPos.current
        startPos.current = current
        onResize(delta)
      }

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'
    },
    [direction, onResize]
  )

  return (
    <div
      onMouseDown={onMouseDown}
      className={`${
        direction === 'horizontal'
          ? 'w-1 cursor-col-resize hover:bg-accent-blue'
          : 'h-1 cursor-row-resize hover:bg-accent-blue'
      } bg-border-primary transition-colors flex-shrink-0`}
    />
  )
}
```

- [ ] **Step 7: Create src/App.tsx**

```typescript
import { useState, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import ActivityBar, { type PanelView } from './components/ActivityBar'
import Resizer from './components/Resizer'
import AgentPanel from './panels/AgentPanel'
import FileExplorer from './panels/FileExplorer'
import EditorPanel from './panels/EditorPanel'
import ChatPanel from './panels/ChatPanel'
import BottomPanel from './panels/BottomPanel'
import {
  DEFAULT_SIDE_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
} from '@shared/constants'

export default function App() {
  const [activeView, setActiveView] = useState<PanelView>('agents')
  const [sidePanelWidth, setSidePanelWidth] = useState(DEFAULT_SIDE_PANEL_WIDTH)
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT)

  const handleSideResize = useCallback((delta: number) => {
    setSidePanelWidth((w) => Math.max(MIN_PANEL_WIDTH, w + delta))
  }, [])

  const handleRightResize = useCallback((delta: number) => {
    setRightPanelWidth((w) => Math.max(MIN_PANEL_WIDTH, w - delta))
  }, [])

  const handleBottomResize = useCallback((delta: number) => {
    setBottomPanelHeight((h) => Math.max(100, h - delta))
  }, [])

  return (
    <div className="h-screen flex flex-col">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <ActivityBar activeView={activeView} onViewChange={setActiveView} />

        {/* Side Panel */}
        <div className="flex flex-col overflow-hidden" style={{ width: sidePanelWidth }}>
          {activeView === 'agents' && <AgentPanel />}
          <FileExplorer />
        </div>

        <Resizer direction="horizontal" onResize={handleSideResize} />

        {/* Center: Editor + Bottom Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <EditorPanel />
          </div>
          <Resizer direction="vertical" onResize={handleBottomResize} />
          <div style={{ height: bottomPanelHeight }}>
            <BottomPanel />
          </div>
        </div>

        <Resizer direction="horizontal" onResize={handleRightResize} />

        {/* Right Panel: Chat */}
        <div style={{ width: rightPanelWidth }}>
          <ChatPanel />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Commit**

```bash
git add src/main.tsx src/App.tsx src/globals.css src/components/ src/types/
git commit -m "feat: add root layout shell with ActivityBar, TitleBar, and Resizer"
```

---

## Chunk 3: UI Panels — Agent, FileExplorer, Editor

### Task 8: Agent Panel

**Files:**
- Create: `src/panels/AgentPanel.tsx`

- [ ] **Step 1: Create src/panels/AgentPanel.tsx**

```typescript
import { useAgentStore } from '@/store/agents'
import type { Agent, AgentStatus } from '@shared/types'

const statusColors: Record<AgentStatus, string> = {
  active: 'bg-accent-green',
  working: 'bg-accent-blue',
  idle: 'bg-text-muted',
  error: 'bg-accent-red',
}

const statusBorders: Record<AgentStatus, string> = {
  active: 'border-accent-green',
  working: 'border-accent-blue',
  idle: 'border-border-primary',
  error: 'border-accent-red',
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className={`bg-bg-secondary rounded-lg p-3 mb-1.5 border ${statusBorders[agent.status]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${statusColors[agent.status]} ${agent.status === 'active' ? 'animate-pulse' : ''}`} />
        <span className={`font-semibold text-xs ${agent.status === 'idle' ? 'text-text-secondary' : agent.status === 'active' ? 'text-accent-green' : 'text-accent-blue'}`}>
          {agent.name}
        </span>
        <span className="text-text-muted text-[10px] ml-auto">{agent.role}</span>
      </div>
      {agent.currentTask && (
        <p className="text-text-secondary text-[11px] mb-1.5">{agent.currentTask}</p>
      )}
      {agent.status === 'working' && agent.progress !== undefined && (
        <div className="bg-bg-primary rounded-full overflow-hidden h-0.5">
          <div className="h-full bg-accent-blue rounded-full transition-all" style={{ width: `${agent.progress}%` }} />
        </div>
      )}
    </div>
  )
}

export default function AgentPanel() {
  const agents = useAgentStore((s) => s.agents)
  const activeCount = agents.filter((a) => a.status !== 'idle').length

  return (
    <div className="flex flex-col border-b border-border-primary">
      <div className="px-3 py-2.5 border-b border-border-primary flex items-center">
        <span className="text-text-secondary text-[10px] font-semibold tracking-wider">AGENTS</span>
        {activeCount > 0 && (
          <span className="ml-auto bg-accent-green text-white text-[9px] px-1.5 py-px rounded-full">
            {activeCount} active
          </span>
        )}
      </div>
      <div className="p-2 max-h-72 overflow-y-auto">
        {agents.length === 0 ? (
          <p className="text-text-muted text-xs text-center py-4">No agents running</p>
        ) : (
          agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panels/AgentPanel.tsx
git commit -m "feat: add Agent Panel with status cards and progress"
```

### Task 9: File Explorer

**Files:**
- Create: `src/panels/FileExplorer.tsx`

- [ ] **Step 1: Create src/panels/FileExplorer.tsx**

```typescript
import { useFileStore } from '@/store/files'
import { useEditorStore } from '@/store/editor'
import type { FileNode } from '@shared/types'

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const { expandedDirs, toggleDir } = useFileStore()
  const openFile = useEditorStore((s) => s.openFile)
  const isExpanded = expandedDirs.has(node.path)

  const handleClick = async () => {
    if (node.type === 'directory') {
      toggleDir(node.path)
    } else {
      try {
        const result = await window.api.readFile(node.path)
        openFile({
          path: node.path,
          name: node.name,
          content: result.content,
          language: result.language,
          isModified: false,
          aiModified: false,
        })
      } catch (e) {
        console.error('Failed to open file:', e)
      }
    }
  }

  const gitColor = node.gitStatus === 'modified' ? 'text-accent-yellow'
    : node.gitStatus === 'added' ? 'text-accent-green'
    : node.gitStatus === 'deleted' ? 'text-accent-red'
    : node.gitStatus === 'untracked' ? 'text-accent-orange'
    : ''

  return (
    <div>
      <div
        onClick={handleClick}
        className={`flex items-center py-0.5 px-2 cursor-pointer hover:bg-bg-hover rounded text-xs ${gitColor || 'text-text-primary'}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="mr-1.5 text-[11px]">
          {node.type === 'directory' ? (isExpanded ? '📂' : '📁') : '📄'}
        </span>
        <span className="truncate">{node.name}</span>
      </div>
      {node.type === 'directory' && isExpanded && node.children?.map((child) => (
        <FileTreeNode key={child.path} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export default function FileExplorer() {
  const { fileTree, rootPath } = useFileStore()
  const setRootPath = useFileStore((s) => s.setRootPath)
  const setFileTree = useFileStore((s) => s.setFileTree)

  const handleOpenFolder = async () => {
    const path = await window.api.openFolder()
    if (path) {
      setRootPath(path)
      const tree = await window.api.readDir(path)
      setFileTree(tree)
      window.api.watchStart(path)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border-primary flex items-center">
        <span className="text-text-secondary text-[10px] font-semibold tracking-wider">EXPLORER</span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {fileTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <p className="text-text-muted text-xs">No folder open</p>
            <button
              onClick={handleOpenFolder}
              className="text-accent-blue text-xs hover:underline"
            >
              Open Folder
            </button>
          </div>
        ) : (
          fileTree.map((node) => <FileTreeNode key={node.path} node={node} depth={0} />)
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panels/FileExplorer.tsx
git commit -m "feat: add File Explorer with tree view and file opening"
```

### Task 10: Editor Panel with Monaco + Tab Bar

**Files:**
- Create: `src/components/TabBar.tsx`
- Create: `src/panels/EditorPanel.tsx`

- [ ] **Step 1: Create src/components/TabBar.tsx**

```typescript
import { useEditorStore } from '@/store/editor'

export default function TabBar() {
  const { openFiles, activeFilePath, setActiveFile, closeFile } = useEditorStore()

  if (openFiles.length === 0) return null

  return (
    <div className="h-9 bg-bg-tertiary border-b border-border-primary flex items-center px-2 gap-0.5 overflow-x-auto">
      {openFiles.map((file) => (
        <div
          key={file.path}
          onClick={() => setActiveFile(file.path)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs cursor-pointer whitespace-nowrap
            ${activeFilePath === file.path
              ? 'bg-bg-secondary border border-border-primary border-b-bg-secondary -mb-px text-accent-blue'
              : 'text-text-secondary hover:text-text-primary'}`}
        >
          {file.aiModified && <span className="text-accent-green text-[10px]">●</span>}
          <span>{file.name}</span>
          {file.isModified && <span className="text-accent-orange text-[10px]">●</span>}
          {file.aiModified && (
            <span className="text-[8px] text-accent-green bg-accent-green/10 px-1 rounded">AI</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); closeFile(file.path) }}
            className="text-text-muted hover:text-text-primary ml-1 text-[10px]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create src/panels/EditorPanel.tsx**

```typescript
import { useRef, useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useEditorStore } from '@/store/editor'
import TabBar from '@/components/TabBar'

export default function EditorPanel() {
  const { openFiles, activeFilePath, updateFileContent } = useEditorStore()
  const editorRef = useRef<any>(null)

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  const handleChange = (value: string | undefined) => {
    if (activeFilePath && value !== undefined) {
      updateFileContent(activeFilePath, value)
    }
  }

  // Save file on Ctrl+S
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (activeFile) {
          await window.api.writeFile(activeFile.path, activeFile.content)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFile])

  return (
    <div className="h-full flex flex-col">
      <TabBar />
      <div className="flex-1">
        {activeFile ? (
          <Editor
            theme="vs-dark"
            language={activeFile.language}
            value={activeFile.content}
            onChange={handleChange}
            onMount={handleMount}
            options={{
              fontSize: 14,
              fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              padding: { top: 12 },
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted">
            <span className="text-4xl mb-4">⚡</span>
            <h2 className="text-lg font-semibold text-text-secondary mb-2">CursorPlus</h2>
            <p className="text-xs">Open a file or folder to get started</p>
            <div className="mt-4 text-xs space-y-1 text-center">
              <p><kbd className="bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary">Ctrl+O</kbd> Open Folder</p>
              <p><kbd className="bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary">Ctrl+L</kbd> AI Chat</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TabBar.tsx src/panels/EditorPanel.tsx
git commit -m "feat: add Editor Panel with Monaco Editor and TabBar"
```

---

## Chunk 4: UI Panels — Chat, Terminal, Bottom Panel

### Task 11: Chat Panel

**Files:**
- Create: `src/panels/ChatPanel.tsx`

- [ ] **Step 1: Create src/panels/ChatPanel.tsx**

```typescript
import { useState, useRef, useEffect } from 'react'
import { useChatStore } from '@/store/chat'
import { v4 as uuid } from 'uuid'
import type { ChatMessage } from '@shared/types'

const models = ['Claude Opus', 'GPT-5.3', 'Kimi K2.5', 'Gemini']

function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1">
        {message.role === 'user' ? (
          <span className="text-text-secondary text-[10px]">You</span>
        ) : (
          <>
            <span className="text-accent-blue text-[10px]">{message.agentName || 'AI'}</span>
            {message.model && (
              <span className="text-text-muted text-[10px]">via {message.model}</span>
            )}
          </>
        )}
      </div>
      <div className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
        message.role === 'user'
          ? 'bg-bg-secondary rounded-bl-sm'
          : 'bg-accent-blue/5 border border-accent-blue/10 rounded-bl-sm'
      }`}>
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.taskProgress && (
          <div className="bg-bg-primary rounded-md p-2 mt-2 text-[11px]">
            {message.taskProgress.map((task, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className={
                  task.status === 'done' ? 'text-accent-green' :
                  task.status === 'working' ? 'text-accent-blue' : 'text-text-muted'
                }>
                  {task.status === 'done' ? '✓' : task.status === 'working' ? '⟳' : '◌'}
                </span>
                <span>{task.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const { messages, mode, selectedModel, addMessage, setMode, setModel } = useChatStore()
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const userMsg: ChatMessage = {
      id: uuid(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    }
    addMessage(userMsg)
    setInput('')

    // Send to OMO
    window.api.omoSend({
      type: 'chat',
      payload: { message: input.trim(), mode, model: selectedModel },
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="h-full flex flex-col border-l border-border-primary bg-bg-primary">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-border-primary flex items-center">
        <span className="text-text-primary font-semibold text-sm">✦ AI Chat</span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setMode('agent')}
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              mode === 'agent' ? 'bg-accent-green text-white' : 'bg-bg-secondary text-text-secondary'
            }`}
          >
            Agent
          </button>
          <button
            onClick={() => setMode('chat')}
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              mode === 'chat' ? 'bg-accent-blue text-white' : 'bg-bg-secondary text-text-secondary'
            }`}
          >
            Chat
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-text-muted text-xs">
            <p>Ask anything about your code</p>
            <p className="mt-1 text-text-muted/60">Use @file to reference files</p>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border-primary">
        <div className="bg-bg-secondary border border-border-primary rounded-xl flex items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything... (Ctrl+L)"
            rows={1}
            className="flex-1 bg-transparent text-xs text-text-primary px-3.5 py-2.5 resize-none outline-none placeholder:text-text-muted"
          />
          <button
            onClick={handleSend}
            className="text-accent-blue px-3 py-2.5 text-sm hover:text-accent-blue/80"
          >
            ↑
          </button>
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {models.map((model) => (
            <button
              key={model}
              onClick={() => setModel(model)}
              className={`text-[9px] px-2 py-0.5 rounded-full ${
                selectedModel === model
                  ? 'bg-accent-blue/20 text-accent-blue'
                  : 'bg-bg-secondary text-text-secondary'
              }`}
            >
              {model}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/panels/ChatPanel.tsx
git commit -m "feat: add Chat Panel with Agent/Chat mode and model selector"
```

### Task 12: Terminal Panel and Bottom Panel

**Files:**
- Create: `src/panels/TerminalPanel.tsx`
- Create: `src/panels/BottomPanel.tsx`

- [ ] **Step 1: Create src/panels/TerminalPanel.tsx**

```typescript
import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useTerminalStore } from '@/store/terminal'
import { v4 as uuid } from 'uuid'
import 'xterm/css/xterm.css'

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { sessions, activeSessionId, addSession } = useTerminalStore()

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#76e3ea',
        white: '#e6edf3',
      },
      fontSize: 13,
      fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
      cursorBlink: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    // Create a session if none exists
    const sessionId = uuid()
    addSession({ id: sessionId, name: 'Terminal', type: 'shell' })

    window.api.termCreate(sessionId).then(() => {
      term.onData((data) => window.api.termWrite(sessionId, data))
      term.onResize(({ cols, rows }) => window.api.termResize(sessionId, cols, rows))
    })

    const cleanup = window.api.onTermData((id, data) => {
      if (id === sessionId) term.write(data)
    })

    const resizeObserver = new ResizeObserver(() => fit.fit())
    resizeObserver.observe(containerRef.current)

    return () => {
      cleanup()
      resizeObserver.disconnect()
      term.dispose()
      window.api.termKill(sessionId)
    }
  }, [])

  return <div ref={containerRef} className="h-full w-full" />
}
```

- [ ] **Step 2: Create src/panels/BottomPanel.tsx**

```typescript
import { useState } from 'react'
import TerminalPanel from './TerminalPanel'
import { useAgentStore } from '@/store/agents'

type Tab = 'terminal' | 'agent-log' | 'problems' | 'output'

export default function BottomPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('terminal')
  const logs = useAgentStore((s) => s.logs)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'terminal', label: 'TERMINAL' },
    { id: 'agent-log', label: 'AGENT LOG' },
    { id: 'problems', label: 'PROBLEMS' },
    { id: 'output', label: 'OUTPUT' },
  ]

  return (
    <div className="h-full flex flex-col border-t border-border-primary">
      <div className="flex items-center px-3 h-7 bg-bg-tertiary border-b border-border-primary gap-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-[10px] font-semibold py-1.5 ${
              activeTab === tab.id
                ? 'text-accent-blue border-b-2 border-accent-blue'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && <TerminalPanel />}
        {activeTab === 'agent-log' && (
          <div className="h-full overflow-y-auto p-2 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-text-muted text-center py-4">No agent activity yet</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2 py-0.5">
                  <span className="text-text-muted text-[10px] shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={
                    log.type === 'error' ? 'text-accent-red' :
                    log.type === 'action' ? 'text-accent-green' :
                    log.type === 'delegation' ? 'text-accent-blue' : 'text-text-secondary'
                  }>
                    [{log.agentId}]
                  </span>
                  <span className="text-text-primary">{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'problems' && (
          <div className="h-full flex items-center justify-center text-text-muted text-xs">
            No problems detected
          </div>
        )}
        {activeTab === 'output' && (
          <div className="h-full flex items-center justify-center text-text-muted text-xs">
            No output
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/panels/TerminalPanel.tsx src/panels/BottomPanel.tsx
git commit -m "feat: add Terminal Panel and Bottom Panel with tabs"
```

---

## Chunk 5: OMO Integration, Wiring, Build & Deploy

### Task 13: Wire up OMO message handling in renderer

**Files:**
- Create: `src/hooks/useIpc.ts`
- Create: `src/hooks/useOmo.ts`

- [ ] **Step 1: Create src/hooks/useIpc.ts**

```typescript
import { useEffect } from 'react'
import { useFileStore } from '@/store/files'

export function useFileWatcher() {
  const { rootPath, setFileTree } = useFileStore()

  useEffect(() => {
    if (!rootPath) return

    const cleanup = window.api.onFsChange(async () => {
      const tree = await window.api.readDir(rootPath)
      setFileTree(tree)
    })

    return cleanup
  }, [rootPath, setFileTree])
}
```

- [ ] **Step 2: Create src/hooks/useOmo.ts**

```typescript
import { useEffect } from 'react'
import { useAgentStore } from '@/store/agents'
import { useChatStore } from '@/store/chat'
import { useEditorStore } from '@/store/editor'
import { v4 as uuid } from 'uuid'
import type { Agent } from '@shared/types'

export function useOmo() {
  const { setAgents, updateAgent, addLog } = useAgentStore()
  const { addMessage } = useChatStore()
  const { markAiModified } = useEditorStore()

  useEffect(() => {
    const cleanup = window.api.onOmoMessage((raw: any) => {
      const event = raw as { type: string; payload: any }

      switch (event.type) {
        case 'agent-status': {
          const agents = event.payload.agents as Agent[]
          setAgents(agents)
          break
        }
        case 'agent-log': {
          addLog({
            id: uuid(),
            agentId: event.payload.agentId,
            timestamp: Date.now(),
            message: event.payload.message,
            type: event.payload.logType || 'info',
          })
          break
        }
        case 'chat-response': {
          addMessage({
            id: uuid(),
            role: 'assistant',
            content: event.payload.content,
            agentName: event.payload.agentName,
            model: event.payload.model,
            timestamp: Date.now(),
            taskProgress: event.payload.taskProgress,
          })
          break
        }
        case 'file-edit': {
          markAiModified(event.payload.filePath)
          break
        }
        case 'error': {
          addLog({
            id: uuid(),
            agentId: 'system',
            timestamp: Date.now(),
            message: event.payload.message,
            type: 'error',
          })
          break
        }
      }
    })

    return cleanup
  }, [setAgents, updateAgent, addLog, addMessage, markAiModified])
}
```

- [ ] **Step 3: Update src/App.tsx — add hooks**

Add imports and hook calls to App.tsx:

```typescript
// Add at top of App.tsx
import { useFileWatcher } from './hooks/useIpc'
import { useOmo } from './hooks/useOmo'

// Add inside App component, before return
useFileWatcher()
useOmo()
```

- [ ] **Step 4: Commit**

```bash
git add src/hooks/ src/App.tsx
git commit -m "feat: add OMO message handling and file watcher hooks"
```

### Task 14: Add .gitignore and project metadata

**Files:**
- Create: `.gitignore`
- Create: `README.md`

- [ ] **Step 1: Create .gitignore**

```
node_modules/
dist/
dist-electron/
release/
.superpowers/
*.env
*.env.local
.DS_Store
Thumbs.db
```

- [ ] **Step 2: Create README.md**

```markdown
# CursorPlus ⚡

Agent-First AI IDE powered by oh-my-openagent.

## Features

- Monaco Editor with AI inline suggestions
- Multi-agent panel (OMO orchestration)
- AI Chat with Agent/Chat modes
- Integrated terminal
- Multi-model support (Claude, GPT, Kimi, Gemini)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Tech Stack

Electron + React 19 + TypeScript + Monaco Editor + xterm.js + oh-my-openagent
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore README.md
git commit -m "chore: add .gitignore and README"
```

### Task 15: Verify build and push to GitHub

- [ ] **Step 1: Verify project builds**

Run: `npm run dev`
Expected: Electron window opens with CursorPlus layout

- [ ] **Step 2: Fix any build errors**

Address TypeScript or bundling issues that arise.

- [ ] **Step 3: Add remote and push**

```bash
git remote add origin https://github.com/concrete-sangminlee/cursorplus.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Verify on GitHub**

Run: `gh repo view concrete-sangminlee/cursorplus --web`
Expected: Repository shows all committed files
