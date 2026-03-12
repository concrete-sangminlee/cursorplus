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
  FS_CREATE_FILE: 'fs:create-file',
  FS_CREATE_DIR: 'fs:create-dir',
  FS_SEARCH: 'fs:search',
  FS_DUPLICATE: 'fs:duplicate',
  FS_COPY_PATH: 'fs:copy-path',
  FS_TRASH: 'fs:trash',
  FS_SHOW_ITEM: 'fs:show-item',
  FS_COPY_FILE: 'fs:copy-file',
  FS_EXTERNAL_CHANGE: 'fs:external-change',
  FILE_RENAME: 'file:rename',
  FILE_COPY: 'file:copy',
  FILE_MOVE: 'file:move',
  FILE_STAT: 'file:stat',
  FILE_EXISTS: 'file:exists',
  FILE_CREATE_DIRECTORY: 'file:create-directory',
  FILE_DELETE_DIRECTORY: 'file:delete-directory',
  FILE_WATCH: 'file:watch',
  FILE_WATCH_EVENT: 'file:watch-event',
  FILE_READ_BINARY: 'file:read-binary',

  // Git
  GIT_STATUS: 'git:status',
  GIT_LOG: 'git:log',
  GIT_DIFF: 'git:diff',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_COMMIT: 'git:commit',
  GIT_DISCARD: 'git:discard',
  GIT_BRANCHES: 'git:branches',
  GIT_CHECKOUT: 'git:checkout',
  GIT_SHOW: 'git:show',
  GIT_BLAME: 'git:blame',
  GIT_FILE_DIFF: 'git:file-diff',
  GIT_DIFF_FILE: 'git:diff-file',
  GIT_PUSH: 'git:push',
  GIT_PULL: 'git:pull',
  GIT_FETCH: 'git:fetch',
  GIT_STASH: 'git:stash',
  GIT_STASH_POP: 'git:stash-pop',
  GIT_STASH_LIST: 'git:stash-list',
  GIT_STASH_DROP: 'git:stash-drop',
  GIT_STASH_APPLY: 'git:stash-apply',
  GIT_STASH_SAVE: 'git:stash-save',
  GIT_MERGE_STATUS: 'git:merge-status',
  GIT_CONFLICT_FILES: 'git:conflict-files',
  GIT_MERGE_ABORT: 'git:merge-abort',
  GIT_CREATE_BRANCH: 'git:create-branch',
  GIT_STAGE_ALL: 'git:stage-all',
  GIT_UNSTAGE_ALL: 'git:unstage-all',

  // Terminal
  TERM_CREATE: 'term:create',
  TERM_WRITE: 'term:write',
  TERM_RESIZE: 'term:resize',
  TERM_KILL: 'term:kill',
  TERM_DATA: 'term:data',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Workspace
  WORKSPACE_READ_SETTINGS: 'workspace:read-settings',
  WORKSPACE_WRITE_SETTINGS: 'workspace:write-settings',

  // OMO
  OMO_START: 'omo:start',
  OMO_STOP: 'omo:stop',
  OMO_SEND: 'omo:send',
  OMO_MESSAGE: 'omo:message',

  // Clipboard
  CLIPBOARD_READ_TEXT: 'clipboard:read-text',
  CLIPBOARD_WRITE_TEXT: 'clipboard:write-text',
  CLIPBOARD_READ_IMAGE: 'clipboard:read-image',

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell:open-external',
  SHELL_SHOW_ITEM_IN_FOLDER: 'shell:show-item-in-folder',
  SHELL_OPEN_PATH: 'shell:open-path',

  // Tasks
  TASK_RUN: 'task:run',
  TASK_KILL: 'task:kill',
  TASK_LIST_SCRIPTS: 'task:list-scripts',
  TASK_OUTPUT: 'task:output',
  TASK_COMPLETE: 'task:complete',

  // Window
  WIN_MINIMIZE: 'win:minimize',
  WIN_MAXIMIZE: 'win:maximize',
  WIN_CLOSE: 'win:close',
} as const
