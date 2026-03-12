import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

// ---------------------------------------------------------------------------
// Helper: create a listener that returns an unsubscribe function
// ---------------------------------------------------------------------------
type Unsubscribe = () => void

function onEvent<T extends unknown[]>(
  channel: string,
  callback: (...args: T) => void,
): Unsubscribe {
  const handler = (_event: unknown, ...args: unknown[]) =>
    callback(...(args as T))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// ---------------------------------------------------------------------------
// MessageBox options mirroring Electron's subset we expose
// ---------------------------------------------------------------------------
export interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning'
  title?: string
  message: string
  detail?: string
  buttons?: string[]
  defaultId?: number
  cancelId?: number
  noLink?: boolean
}

export interface MessageBoxResult {
  response: number
  checkboxChecked: boolean
}

// ---------------------------------------------------------------------------
// System info shape
// ---------------------------------------------------------------------------
export interface SystemInfo {
  platform: string
  arch: string
  version: string
  electron: string
  chrome: string
  node: string
  v8: string
}

// ---------------------------------------------------------------------------
// File stat shape (matches file-operations.ts response)
// ---------------------------------------------------------------------------
export interface FileStat {
  size: number
  created: string
  modified: string
  isDirectory: boolean
  isFile: boolean
  isSymbolicLink: boolean
}

// ---------------------------------------------------------------------------
// Git types
// ---------------------------------------------------------------------------
export interface GitStatusFile {
  path: string
  state: string
}

export interface GitStatus {
  isRepo: boolean
  branch: string
  files: GitStatusFile[]
  staged: GitStatusFile[]
  unstaged: GitStatusFile[]
  ahead: number
  behind: number
}

export interface GitLogEntry {
  fullHash: string
  hash: string
  author: string
  email: string
  date: string
  message: string
}

export interface GitBlameEntry {
  hash: string
  author: string
  date: string
  line: number
  content: string
}

export interface GitShowResult {
  fullHash: string
  hash: string
  author: string
  email: string
  date: string
  message: string
  filesChanged: { file: string; changes: string }[]
  summary: string
}

export interface GitDiffHunk {
  type: 'added' | 'modified' | 'deleted'
  startLine: number
  count: number
}

export interface GitBranch {
  name: string
  current: boolean
}

export interface GitStashEntry {
  index: number
  hash: string
  message: string
}

// ---------------------------------------------------------------------------
// Task types
// ---------------------------------------------------------------------------
export interface TaskRunArgs {
  command: string
  cwd: string
  label: string
}

export interface TaskRunResult {
  taskId: string
  label: string
  command: string
}

export interface TaskOutputData {
  taskId: string
  data: string
  stream: 'stdout' | 'stderr'
}

export interface TaskCompleteData {
  taskId: string
  code: number
}

export interface TaskScript {
  name: string
  command: string
}

// ---------------------------------------------------------------------------
// File watch event
// ---------------------------------------------------------------------------
export interface FileWatchEvent {
  watchPath: string
  event: string
  path: string
}

// ---------------------------------------------------------------------------
// Result wrapper used by many IPC handlers
// ---------------------------------------------------------------------------
export interface IpcResult<T = void> {
  success: boolean
  error?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// App info shape (matches app:get-info in main.ts)
// ---------------------------------------------------------------------------
export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  v8: string
  platform: string
  arch: string
}

// ---------------------------------------------------------------------------
// The full API object
// ---------------------------------------------------------------------------
const api = {
  // =======================================================================
  // Filesystem (registered via ipc/filesystem.ts)
  // =======================================================================
  readFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.FS_READ_FILE, filePath),
  writeFile: (filePath: string, content: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_WRITE_FILE, filePath, content),
  deleteFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_DELETE, filePath),
  renameFile: (oldPath: string, newPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_RENAME, oldPath, newPath),
  readDir: (dirPath: string): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.FS_READ_DIR, dirPath),
  openFolder: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.FS_OPEN_FOLDER),
  createFile: (filePath: string, content?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_CREATE_FILE, filePath, content || ''),
  createDir: (dirPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_CREATE_DIR, dirPath),
  searchFiles: (
    rootPath: string,
    query: string,
    options?: { caseSensitive?: boolean; regex?: boolean },
  ): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC.FS_SEARCH, rootPath, query, options),
  trashItem: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_TRASH, filePath),
  copyPathToClipboard: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_COPY_PATH, filePath),
  duplicateFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.FS_DUPLICATE, filePath),
  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_SHOW_ITEM, filePath),
  copyFile: (srcPath: string, destDir: string): Promise<void> =>
    ipcRenderer.invoke(IPC.FS_COPY_FILE, srcPath, destDir),

  // FS watcher (send/on pattern)
  watchStart: (dirPath: string): void =>
    ipcRenderer.send(IPC.FS_WATCH_START, dirPath),
  watchStop: (): void =>
    ipcRenderer.send(IPC.FS_WATCH_STOP),
  onFsChange: (callback: (event: string, filePath: string) => void): Unsubscribe => {
    const handler = (_: unknown, event: string, filePath: string) => callback(event, filePath)
    ipcRenderer.on(IPC.FS_CHANGE, handler)
    return () => ipcRenderer.removeListener(IPC.FS_CHANGE, handler)
  },
  onExternalFileChange: (callback: (data: { path: string; type: 'change' | 'delete' | 'add' }) => void): Unsubscribe => {
    const handler = (_: unknown, data: { path: string; type: 'change' | 'delete' | 'add' }) => callback(data)
    ipcRenderer.on(IPC.FS_EXTERNAL_CHANGE, handler)
    return () => ipcRenderer.removeListener(IPC.FS_EXTERNAL_CHANGE, handler)
  },

  // =======================================================================
  // File operations (registered via ipc/file-operations.ts)
  // =======================================================================
  fileRename: (oldPath: string, newPath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.FILE_RENAME, oldPath, newPath),
  fileCopy: (sourcePath: string, destPath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.FILE_COPY, sourcePath, destPath),
  fileMove: (sourcePath: string, destPath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.FILE_MOVE, sourcePath, destPath),
  fileStat: (filePath: string): Promise<IpcResult & { stat?: FileStat }> =>
    ipcRenderer.invoke(IPC.FILE_STAT, filePath),
  fileExists: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.FILE_EXISTS, filePath),
  fileCreateDirectory: (dirPath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.FILE_CREATE_DIRECTORY, dirPath),
  fileDeleteDirectory: (dirPath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.FILE_DELETE_DIRECTORY, dirPath),
  fileWatch: (watchPath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.FILE_WATCH, watchPath),
  onFileWatchEvent: (callback: (data: FileWatchEvent) => void): Unsubscribe =>
    onEvent<[FileWatchEvent]>(IPC.FILE_WATCH_EVENT, callback),
  fileReadBinary: (filePath: string): Promise<IpcResult & { data?: string }> =>
    ipcRenderer.invoke(IPC.FILE_READ_BINARY, filePath),

  // =======================================================================
  // Clipboard (registered via ipc/clipboard.ts)
  // =======================================================================
  clipboardReadText: (): Promise<IpcResult & { text?: string }> =>
    ipcRenderer.invoke(IPC.CLIPBOARD_READ_TEXT),
  clipboardWriteText: (text: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.CLIPBOARD_WRITE_TEXT, text),
  clipboardReadImage: (): Promise<IpcResult & { data?: string | null }> =>
    ipcRenderer.invoke(IPC.CLIPBOARD_READ_IMAGE),

  // =======================================================================
  // Shell (registered via ipc/shell.ts)
  // =======================================================================
  shellOpenExternal: (url: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.SHELL_OPEN_EXTERNAL, url),
  shellShowItemInFolder: (filePath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.SHELL_SHOW_ITEM_IN_FOLDER, filePath),
  shellOpenPath: (filePath: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.SHELL_OPEN_PATH, filePath),

  // =======================================================================
  // Git (registered via ipc/git.ts)
  // =======================================================================
  gitStatus: (cwd: string): Promise<GitStatus> =>
    ipcRenderer.invoke(IPC.GIT_STATUS, cwd),
  gitLog: (cwd: string, count?: number): Promise<GitLogEntry[]> =>
    ipcRenderer.invoke(IPC.GIT_LOG, cwd, count),
  gitDiff: (cwd: string, filePath?: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_DIFF, cwd, filePath),
  gitStage: (cwd: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GIT_STAGE, cwd, filePath),
  gitUnstage: (cwd: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GIT_UNSTAGE, cwd, filePath),
  gitCommit: (cwd: string, message: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GIT_COMMIT, cwd, message),
  gitDiscard: (cwd: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GIT_DISCARD, cwd, filePath),
  gitBranches: (cwd: string): Promise<GitBranch[]> =>
    ipcRenderer.invoke(IPC.GIT_BRANCHES, cwd),
  gitCheckout: (cwd: string, branch: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_CHECKOUT, cwd, branch),
  gitShow: (cwd: string, hash: string): Promise<GitShowResult | null> =>
    ipcRenderer.invoke(IPC.GIT_SHOW, cwd, hash),
  gitBlame: (cwd: string, filePath: string): Promise<GitBlameEntry[]> =>
    ipcRenderer.invoke(IPC.GIT_BLAME, cwd, filePath),
  gitFileDiff: (cwd: string, filePath: string): Promise<GitDiffHunk[]> =>
    ipcRenderer.invoke(IPC.GIT_FILE_DIFF, cwd, filePath),
  gitDiffFile: (cwd: string, filePath: string): Promise<GitDiffHunk[]> =>
    ipcRenderer.invoke(IPC.GIT_DIFF_FILE, cwd, filePath),
  gitPush: (cwd: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_PUSH, cwd),
  gitPull: (cwd: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_PULL, cwd),
  gitFetch: (cwd: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_FETCH, cwd),
  gitStash: (cwd: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_STASH, cwd),
  gitStashPop: (cwd: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_STASH_POP, cwd),
  gitStashList: (cwd: string): Promise<GitStashEntry[]> =>
    ipcRenderer.invoke(IPC.GIT_STASH_LIST, cwd),
  gitStashDrop: (cwd: string, index: number): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_STASH_DROP, cwd, index),
  gitStashApply: (cwd: string, index: number): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_STASH_APPLY, cwd, index),
  gitStashSave: (cwd: string, message: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_STASH_SAVE, cwd, message),
  gitMergeStatus: (cwd: string): Promise<{ merging: boolean }> =>
    ipcRenderer.invoke(IPC.GIT_MERGE_STATUS, cwd),
  gitConflictFiles: (cwd: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.GIT_CONFLICT_FILES, cwd),
  gitMergeAbort: (cwd: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_MERGE_ABORT, cwd),
  gitCreateBranch: (cwd: string, branchName: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_CREATE_BRANCH, cwd, branchName),
  gitStageAll: (cwd: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GIT_STAGE_ALL, cwd),
  gitUnstageAll: (cwd: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.GIT_UNSTAGE_ALL, cwd),

  // =======================================================================
  // Terminal (registered via ipc/terminal.ts)
  // =======================================================================
  termCreate: (id: string, shellOptions?: { shellPath?: string; shellArgs?: string[] }): Promise<void> =>
    ipcRenderer.invoke(IPC.TERM_CREATE, id, shellOptions),
  termWrite: (id: string, data: string): void =>
    ipcRenderer.send(IPC.TERM_WRITE, id, data),
  termResize: (id: string, cols: number, rows: number): void =>
    ipcRenderer.send(IPC.TERM_RESIZE, id, cols, rows),
  termKill: (id: string): void =>
    ipcRenderer.send(IPC.TERM_KILL, id),
  onTermData: (callback: (id: string, data: string) => void): Unsubscribe => {
    const handler = (_: unknown, id: string, data: string) => callback(id, data)
    ipcRenderer.on(IPC.TERM_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.TERM_DATA, handler)
  },

  // =======================================================================
  // Settings (registered via ipc/settings.ts)
  // =======================================================================
  getSettings: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (settings: unknown): Promise<void> =>
    ipcRenderer.invoke(IPC.SETTINGS_SET, settings),

  // =======================================================================
  // Workspace settings (registered via ipc/workspace.ts)
  // =======================================================================
  workspaceReadSettings: (rootPath: string): Promise<unknown> =>
    ipcRenderer.invoke(IPC.WORKSPACE_READ_SETTINGS, rootPath),
  workspaceWriteSettings: (rootPath: string, settings: unknown): Promise<void> =>
    ipcRenderer.invoke(IPC.WORKSPACE_WRITE_SETTINGS, rootPath, settings),

  // =======================================================================
  // OMO / AI assistant (registered via ipc/omo.ts)
  // =======================================================================
  omoStart: (projectPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.OMO_START, projectPath),
  omoStop: (): Promise<void> =>
    ipcRenderer.invoke(IPC.OMO_STOP),
  omoSend: (message: unknown): void =>
    ipcRenderer.send(IPC.OMO_SEND, message),
  omoSetApiKeys: (keys: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke('omo:set-api-keys', keys),
  omoSetPrompts: (prompts: { systemPrompt?: string; userPromptTemplate?: string }): Promise<void> =>
    ipcRenderer.invoke('omo:set-prompts', prompts),
  onOmoMessage: (callback: (message: unknown) => void): Unsubscribe =>
    onEvent<[unknown]>(IPC.OMO_MESSAGE, callback),

  // =======================================================================
  // Tasks (registered via ipc/tasks.ts)
  // =======================================================================
  taskRun: (args: TaskRunArgs): Promise<TaskRunResult> =>
    ipcRenderer.invoke(IPC.TASK_RUN, args),
  taskKill: (taskId: string): Promise<IpcResult> =>
    ipcRenderer.invoke(IPC.TASK_KILL, taskId),
  taskListScripts: (cwd: string): Promise<TaskScript[]> =>
    ipcRenderer.invoke(IPC.TASK_LIST_SCRIPTS, cwd),
  onTaskOutput: (callback: (data: TaskOutputData) => void): Unsubscribe =>
    onEvent<[TaskOutputData]>(IPC.TASK_OUTPUT, callback),
  onTaskComplete: (callback: (data: TaskCompleteData) => void): Unsubscribe =>
    onEvent<[TaskCompleteData]>(IPC.TASK_COMPLETE, callback),

  // =======================================================================
  // Window controls (registered in main.ts registerIpcHandlers)
  // =======================================================================
  minimize: (): void =>
    ipcRenderer.send(IPC.WIN_MINIMIZE),
  maximize: (): void =>
    ipcRenderer.send(IPC.WIN_MAXIMIZE),
  close: (): void =>
    ipcRenderer.send(IPC.WIN_CLOSE),

  // =======================================================================
  // App-level IPC (registered in main.ts registerIpcHandlers)
  // =======================================================================
  /** Request a new window from the main process */
  appNewWindow: (): void =>
    ipcRenderer.send('app:new-window'),
  /** Trigger an update check */
  appCheckForUpdates: (): Promise<void> =>
    ipcRenderer.invoke('app:check-for-updates'),
  /** Get detailed app/runtime info */
  appGetInfo: (): Promise<AppInfo> =>
    ipcRenderer.invoke('app:get-info'),

  // =======================================================================
  // App-level events sent FROM main process (menu actions, file associations)
  // The renderer listens for these to react to menu commands.
  // =======================================================================
  onAppOpenFile: (callback: (filePath: string) => void): Unsubscribe =>
    onEvent<[string]>('app:open-file', callback),
  onAppOpenFolder: (callback: (folderPath: string) => void): Unsubscribe =>
    onEvent<[string]>('app:open-folder', callback),
  onAppNewFile: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:new-file', callback),
  onAppSave: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:save', callback),
  onAppSaveAs: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:save-as', callback),
  onAppSaveAll: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:save-all', callback),
  onAppOpenSettings: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:open-settings', callback),
  onAppFind: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:find', callback),
  onAppReplace: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:replace', callback),
  onAppFindInFiles: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:find-in-files', callback),
  onAppReplaceInFiles: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:replace-in-files', callback),
  onAppCommandPalette: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:command-palette', callback),
  onAppToggleSidebar: (callback: (panel?: string) => void): Unsubscribe =>
    onEvent<[string | undefined]>('app:toggle-sidebar', callback),
  onAppTogglePanel: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:toggle-panel', callback),
  onAppQuickOpen: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:quick-open', callback),
  onAppGoToSymbol: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:go-to-symbol', callback),
  onAppGoToLine: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:go-to-line', callback),
  onAppGoBack: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:go-back', callback),
  onAppGoForward: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:go-forward', callback),
  onAppGoToDefinition: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:go-to-definition', callback),
  onAppPeekDefinition: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:peek-definition', callback),
  onAppStartDebugging: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:start-debugging', callback),
  onAppRunWithoutDebugging: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:run-without-debugging', callback),
  onAppStopDebugging: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:stop-debugging', callback),
  onAppRestartDebugging: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:restart-debugging', callback),
  onAppToggleBreakpoint: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:toggle-breakpoint', callback),
  onAppRunTask: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:run-task', callback),
  onAppRunBuildTask: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:run-build-task', callback),
  onAppNewTerminal: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:new-terminal', callback),
  onAppSplitTerminal: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:split-terminal', callback),
  onAppRunActiveFile: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:run-active-file', callback),
  onAppRunSelectedText: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:run-selected-text', callback),
  onAppShowWelcome: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:show-welcome', callback),
  onAppShowReleaseNotes: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:show-release-notes', callback),
  onAppShowKeybindings: (callback: () => void): Unsubscribe =>
    onEvent<[]>('app:show-keybindings', callback),
  onAppUpdateStatus: (callback: (status: { status: string; version?: string; error?: string }) => void): Unsubscribe =>
    onEvent<[{ status: string; version?: string; error?: string }]>('app:update-status', callback),

  // =======================================================================
  // New utility APIs
  // =======================================================================

  // -- app namespace --
  appGetVersion: (): Promise<string> =>
    ipcRenderer.invoke('app:get-version'),
  appGetPath: (name: string): Promise<string> =>
    ipcRenderer.invoke('app:get-path', name),
  appGetPlatform: (): Promise<{ platform: string; arch: string; osVersion: string }> =>
    ipcRenderer.invoke('app:get-platform'),
  appGetSystemInfo: (): Promise<{
    platform: string
    arch: string
    osVersion: string
    totalMemory: number
    freeMemory: number
    cpus: { model: string; speed: number }[]
    uptime: number
  }> =>
    ipcRenderer.invoke('app:get-system-info'),

  // -- window namespace --
  windowSetTitle: (title: string): Promise<void> =>
    ipcRenderer.invoke('win:set-title', title),
  windowIsMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('win:is-maximized'),

  // -- dialog namespace --
  dialogShowMessageBox: (options: MessageBoxOptions): Promise<MessageBoxResult> =>
    ipcRenderer.invoke('dialog:show-message-box', options),
  dialogShowErrorBox: (title: string, content: string): Promise<void> =>
    ipcRenderer.invoke('dialog:show-error-box', title, content),
}

// ---------------------------------------------------------------------------
// Expose to renderer
// ---------------------------------------------------------------------------
contextBridge.exposeInMainWorld('api', api)

// ---------------------------------------------------------------------------
// Exported type that matches the exposed API exactly
// ---------------------------------------------------------------------------
export type ElectronAPI = typeof api

