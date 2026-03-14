// Comprehensive type declarations for the Electron preload API.
// These mirror every method exposed via contextBridge in electron/preload.ts
// with precise return types derived from the IPC handlers.

interface FileTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

interface SearchMatch {
  file: string
  line: number
  content: string
}

interface GitStatusResult {
  isRepo: boolean
  branch: string
  files: { path: string; state: string }[]
  staged: { path: string; state: string }[]
  unstaged: { path: string; state: string }[]
  ahead: number
  behind: number
}

interface GitLogEntry {
  fullHash: string
  hash: string
  author: string
  email: string
  date: string
  message: string
}

interface GitBlameEntry {
  hash: string
  author: string
  date: string
  line: number
  content: string
}

interface GitShowResult {
  fullHash: string
  hash: string
  author: string
  email: string
  date: string
  message: string
  filesChanged: { file: string; changes: string }[]
  summary: string
}

interface DiffHunk {
  type: 'added' | 'modified' | 'deleted'
  startLine: number
  count: number
}

interface GitBranch {
  name: string
  current: boolean
}

interface FileStatResult {
  success: boolean
  error?: string
  stat?: {
    size: number
    created: string
    modified: string
    isDirectory: boolean
    isFile: boolean
    isSymbolicLink: boolean
  }
}

interface SuccessResult {
  success: boolean
  error?: string
}

interface SuccessResultWithPath {
  success: boolean
  error?: string
  newPath?: string
}

interface ReadFileResult {
  content: string
  language: string
  error?: string
}

interface ReadBinaryResult {
  success: boolean
  data?: string
  error?: string
}

interface GitStashEntry {
  index: number
  hash: string
  message: string
}

interface TaskRunArgs {
  command: string
  cwd: string
  label: string
}

interface TaskRunResult {
  taskId: string
  label: string
  command: string
}

interface TaskOutputData {
  taskId: string
  data: string
  stream: 'stdout' | 'stderr'
}

interface TaskCompleteData {
  taskId: string
  code: number
}

interface TaskScript {
  name: string
  command: string
}

interface MessageBoxOptions {
  type?: 'none' | 'info' | 'error' | 'question' | 'warning'
  title?: string
  message: string
  detail?: string
  buttons?: string[]
  defaultId?: number
  cancelId?: number
  noLink?: boolean
}

interface MessageBoxResult {
  response: number
  checkboxChecked: boolean
}

interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  v8: string
  platform: string
  arch: string
}

interface SystemInfoResult {
  platform: string
  arch: string
  osVersion: string
  totalMemory: number
  freeMemory: number
  cpus: { model: string; speed: number }[]
  uptime: number
}

interface PlatformResult {
  platform: string
  arch: string
  osVersion: string
}

interface UpdateStatusData {
  status: string
  version?: string
  error?: string
}

/** Unsubscribe function returned by all event listeners. */
type Unsubscribe = () => void

export interface ElectronAPI {
  // =========================================================================
  // Filesystem
  // =========================================================================
  readFile: (filePath: string) => Promise<ReadFileResult>
  writeFile: (filePath: string, content: string) => Promise<SuccessResult>
  deleteFile: (filePath: string) => Promise<SuccessResult>
  renameFile: (oldPath: string, newPath: string) => Promise<SuccessResult>
  readDir: (dirPath: string) => Promise<FileTreeNode[]>
  openFolder: () => Promise<string | null>
  createFile: (filePath: string, content?: string) => Promise<SuccessResult>
  createDir: (dirPath: string) => Promise<SuccessResult>
  searchFiles: (rootPath: string, query: string, options?: { caseSensitive?: boolean; regex?: boolean }) => Promise<SearchMatch[]>
  trashItem: (filePath: string) => Promise<SuccessResult>
  copyPathToClipboard: (filePath: string) => Promise<SuccessResult>
  duplicateFile: (filePath: string) => Promise<SuccessResultWithPath>
  showItemInFolder: (filePath: string) => Promise<SuccessResult>
  copyFile: (srcPath: string, destDir: string) => Promise<SuccessResultWithPath>
  watchStart: (dirPath: string) => void
  watchStop: () => void
  onFsChange: (callback: (event: string, filePath: string) => void) => Unsubscribe
  onExternalFileChange: (callback: (data: { path: string; type: 'change' | 'delete' | 'add' }) => void) => Unsubscribe

  // =========================================================================
  // File operations
  // =========================================================================
  fileRename: (oldPath: string, newPath: string) => Promise<SuccessResult>
  fileCopy: (sourcePath: string, destPath: string) => Promise<SuccessResult>
  fileMove: (sourcePath: string, destPath: string) => Promise<SuccessResult>
  fileStat: (filePath: string) => Promise<FileStatResult>
  fileExists: (filePath: string) => Promise<boolean>
  fileCreateDirectory: (dirPath: string) => Promise<SuccessResult>
  fileDeleteDirectory: (dirPath: string) => Promise<SuccessResult>
  fileWatch: (watchPath: string) => Promise<SuccessResult>
  onFileWatchEvent: (callback: (data: { watchPath: string; event: string; path: string }) => void) => Unsubscribe
  fileReadBinary: (filePath: string) => Promise<ReadBinaryResult>

  // =========================================================================
  // Clipboard
  // =========================================================================
  clipboardReadText: () => Promise<SuccessResult & { text?: string }>
  clipboardWriteText: (text: string) => Promise<SuccessResult>
  clipboardReadImage: () => Promise<SuccessResult & { data?: string | null }>

  // =========================================================================
  // Shell
  // =========================================================================
  shellOpenExternal: (url: string) => Promise<SuccessResult>
  shellShowItemInFolder: (filePath: string) => Promise<SuccessResult>
  shellOpenPath: (filePath: string) => Promise<SuccessResult>

  // =========================================================================
  // Git
  // =========================================================================
  gitStatus: (cwd: string) => Promise<GitStatusResult>
  gitLog: (cwd: string, count?: number) => Promise<GitLogEntry[]>
  gitDiff: (cwd: string, filePath?: string) => Promise<string>
  gitStage: (cwd: string, filePath: string) => Promise<boolean>
  gitUnstage: (cwd: string, filePath: string) => Promise<boolean>
  gitCommit: (cwd: string, message: string) => Promise<boolean>
  gitDiscard: (cwd: string, filePath: string) => Promise<boolean>
  gitBranches: (cwd: string) => Promise<GitBranch[]>
  gitCheckout: (cwd: string, branch: string) => Promise<string>
  gitShow: (cwd: string, hash: string) => Promise<GitShowResult | null>
  gitBlame: (cwd: string, filePath: string) => Promise<GitBlameEntry[]>
  gitFileDiff: (cwd: string, filePath: string) => Promise<DiffHunk[]>
  gitDiffFile: (cwd: string, filePath: string) => Promise<DiffHunk[]>
  gitPush: (cwd: string) => Promise<string>
  gitPull: (cwd: string) => Promise<string>
  gitFetch: (cwd: string) => Promise<string>
  gitStash: (cwd: string) => Promise<string>
  gitStashPop: (cwd: string) => Promise<string>
  gitStashList: (cwd: string) => Promise<GitStashEntry[]>
  gitStashDrop: (cwd: string, index: number) => Promise<string>
  gitStashApply: (cwd: string, index: number) => Promise<string>
  gitStashSave: (cwd: string, message: string) => Promise<string>
  gitMergeStatus: (cwd: string) => Promise<{ merging: boolean }>
  gitConflictFiles: (cwd: string) => Promise<string[]>
  gitMergeAbort: (cwd: string) => Promise<string>
  gitCreateBranch: (cwd: string, branchName: string) => Promise<string>
  gitStageAll: (cwd: string) => Promise<boolean>
  gitUnstageAll: (cwd: string) => Promise<boolean>

  // =========================================================================
  // Terminal
  // =========================================================================
  termCreate: (id: string, shellOptions?: { shellPath?: string; shellArgs?: string[] }) => Promise<void>
  termWrite: (id: string, data: string) => void
  termResize: (id: string, cols: number, rows: number) => void
  termKill: (id: string) => void
  onTermData: (callback: (id: string, data: string) => void) => Unsubscribe

  // =========================================================================
  // Settings
  // =========================================================================
  getSettings: () => Promise<Record<string, unknown>>
  setSettings: (settings: unknown) => Promise<void>

  // =========================================================================
  // Workspace settings
  // =========================================================================
  workspaceReadSettings: (rootPath: string) => Promise<Record<string, unknown>>
  workspaceWriteSettings: (rootPath: string, settings: unknown) => Promise<void>

  // =========================================================================
  // OMO / AI assistant
  // =========================================================================
  omoStart: (projectPath: string) => Promise<void>
  omoStop: () => Promise<void>
  omoSend: (message: unknown) => void
  omoSetApiKeys: (keys: Record<string, string>) => Promise<void>
  omoSetPrompts: (prompts: { systemPrompt?: string; userPromptTemplate?: string }) => Promise<void>
  onOmoMessage: (callback: (message: unknown) => void) => Unsubscribe

  // =========================================================================
  // Tasks
  // =========================================================================
  taskRun: (args: TaskRunArgs) => Promise<TaskRunResult>
  taskKill: (taskId: string) => Promise<SuccessResult>
  taskListScripts: (cwd: string) => Promise<TaskScript[]>
  onTaskOutput: (callback: (data: TaskOutputData) => void) => Unsubscribe
  onTaskComplete: (callback: (data: TaskCompleteData) => void) => Unsubscribe

  // =========================================================================
  // Window controls
  // =========================================================================
  minimize: () => void
  maximize: () => void
  close: () => void
  windowSetTitle: (title: string) => Promise<void>
  windowIsMaximized: () => Promise<boolean>

  // =========================================================================
  // App-level IPC
  // =========================================================================
  appNewWindow: () => void
  appCheckForUpdates: () => Promise<void>
  appGetInfo: () => Promise<AppInfo>
  appGetVersion: () => Promise<string>
  appGetPath: (name: string) => Promise<string>
  appGetPlatform: () => Promise<PlatformResult>
  appGetSystemInfo: () => Promise<SystemInfoResult>

  // =========================================================================
  // App events (main -> renderer)
  // =========================================================================
  onAppOpenFile: (callback: (filePath: string) => void) => Unsubscribe
  onAppOpenFolder: (callback: (folderPath: string) => void) => Unsubscribe
  onAppNewFile: (callback: () => void) => Unsubscribe
  onAppSave: (callback: () => void) => Unsubscribe
  onAppSaveAs: (callback: () => void) => Unsubscribe
  onAppSaveAll: (callback: () => void) => Unsubscribe
  onAppOpenSettings: (callback: () => void) => Unsubscribe
  onAppFind: (callback: () => void) => Unsubscribe
  onAppReplace: (callback: () => void) => Unsubscribe
  onAppFindInFiles: (callback: () => void) => Unsubscribe
  onAppReplaceInFiles: (callback: () => void) => Unsubscribe
  onAppCommandPalette: (callback: () => void) => Unsubscribe
  onAppToggleSidebar: (callback: (panel?: string) => void) => Unsubscribe
  onAppTogglePanel: (callback: () => void) => Unsubscribe
  onAppQuickOpen: (callback: () => void) => Unsubscribe
  onAppGoToSymbol: (callback: () => void) => Unsubscribe
  onAppGoToLine: (callback: () => void) => Unsubscribe
  onAppGoBack: (callback: () => void) => Unsubscribe
  onAppGoForward: (callback: () => void) => Unsubscribe
  onAppGoToDefinition: (callback: () => void) => Unsubscribe
  onAppPeekDefinition: (callback: () => void) => Unsubscribe
  onAppStartDebugging: (callback: () => void) => Unsubscribe
  onAppRunWithoutDebugging: (callback: () => void) => Unsubscribe
  onAppStopDebugging: (callback: () => void) => Unsubscribe
  onAppRestartDebugging: (callback: () => void) => Unsubscribe
  onAppToggleBreakpoint: (callback: () => void) => Unsubscribe
  onAppRunTask: (callback: () => void) => Unsubscribe
  onAppRunBuildTask: (callback: () => void) => Unsubscribe
  onAppNewTerminal: (callback: () => void) => Unsubscribe
  onAppSplitTerminal: (callback: () => void) => Unsubscribe
  onAppRunActiveFile: (callback: () => void) => Unsubscribe
  onAppRunSelectedText: (callback: () => void) => Unsubscribe
  onAppShowWelcome: (callback: () => void) => Unsubscribe
  onAppShowReleaseNotes: (callback: () => void) => Unsubscribe
  onAppShowKeybindings: (callback: () => void) => Unsubscribe
  onAppUpdateStatus: (callback: (status: UpdateStatusData) => void) => Unsubscribe

  // =========================================================================
  // Dialogs
  // =========================================================================
  dialogShowMessageBox: (options: MessageBoxOptions) => Promise<MessageBoxResult>
  dialogShowErrorBox: (title: string, content: string) => Promise<void>
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
