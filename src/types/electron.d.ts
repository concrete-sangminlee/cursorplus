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

export interface ElectronAPI {
  // Filesystem
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
  onFsChange: (callback: (event: string, filePath: string) => void) => () => void
  onExternalFileChange: (callback: (data: { path: string; type: 'change' | 'delete' | 'add' }) => void) => () => void

  // File operations
  fileRename: (oldPath: string, newPath: string) => Promise<SuccessResult>
  fileCopy: (sourcePath: string, destPath: string) => Promise<SuccessResult>
  fileMove: (sourcePath: string, destPath: string) => Promise<SuccessResult>
  fileStat: (filePath: string) => Promise<FileStatResult>
  fileExists: (filePath: string) => Promise<boolean>
  fileCreateDirectory: (dirPath: string) => Promise<SuccessResult>
  fileDeleteDirectory: (dirPath: string) => Promise<SuccessResult>
  fileWatch: (watchPath: string) => Promise<SuccessResult>
  onFileWatchEvent: (callback: (data: { watchPath: string; event: string; path: string }) => void) => () => void
  fileReadBinary: (filePath: string) => Promise<ReadBinaryResult>

  // Clipboard
  clipboardReadText: () => Promise<string>
  clipboardWriteText: (text: string) => Promise<void>
  clipboardReadImage: () => Promise<string>

  // Shell
  shellOpenExternal: (url: string) => Promise<void>
  shellShowItemInFolder: (filePath: string) => Promise<void>
  shellOpenPath: (filePath: string) => Promise<string>

  // Git
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
  gitCreateBranch: (cwd: string, branchName: string) => Promise<string>
  gitStageAll: (cwd: string) => Promise<boolean>
  gitUnstageAll: (cwd: string) => Promise<boolean>

  // Terminal
  termCreate: (id: string, shellOptions?: { shellPath?: string; shellArgs?: string[] }) => Promise<any>
  termWrite: (id: string, data: string) => void
  termResize: (id: string, cols: number, rows: number) => void
  termKill: (id: string) => void
  onTermData: (callback: (id: string, data: string) => void) => () => void

  // Settings
  getSettings: () => Promise<any>
  setSettings: (settings: unknown) => Promise<void>

  // Workspace settings
  workspaceReadSettings: (rootPath: string) => Promise<any>
  workspaceWriteSettings: (rootPath: string, settings: unknown) => Promise<void>

  // OMO
  omoStart: (projectPath: string) => Promise<any>
  omoStop: () => Promise<void>
  omoSend: (message: unknown) => void
  omoSetApiKeys: (keys: Record<string, string>) => Promise<void>
  omoSetPrompts: (prompts: { systemPrompt?: string; userPromptTemplate?: string }) => Promise<void>
  onOmoMessage: (callback: (message: unknown) => void) => () => void

  // Window
  minimize: () => void
  maximize: () => void
  close: () => void
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
