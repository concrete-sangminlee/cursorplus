/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useEditorStore, type EditorStore } from './editor'
import type { OpenFile } from '@shared/types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const store = () => useEditorStore.getState()

function makeFile(path: string, overrides: Partial<OpenFile> = {}): OpenFile {
  return {
    path,
    name: path.split('/').pop() ?? path,
    content: '',
    language: 'typescript',
    isModified: false,
    aiModified: false,
    ...overrides,
  }
}

const paths = (files: OpenFile[]) => files.map((f) => f.path)

// Default group shape, mirrored from createDefaultGroup() in production code.
function defaultGroup() {
  return {
    id: 'group-left',
    position: 'left' as const,
    openFiles: [] as OpenFile[],
    activeFilePath: null,
    previewPath: null,
    pinnedTabs: [] as string[],
  }
}

// Reset every data field to its documented initial value. We deliberately do
// NOT pass replace:true so the action implementations survive.
function resetStore() {
  useEditorStore.setState({
    openFiles: [],
    activeFilePath: null,
    previewPath: null,
    pinnedTabs: [],
    editorGroups: [defaultGroup()],
    activeGroupId: 'group-left',
    unsavedSnapshots: {},
    recoveryNotifications: [],
    fileStates: {},
    tabHistory: [],
    tabHistoryIndex: -1,
    sessions: [],
    activeSessionName: null,
  })
}

describe('useEditorStore', () => {
  beforeEach(() => {
    localStorage.clear()
    resetStore()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── openFile ────────────────────────────────────────────────────────────

  describe('openFile', () => {
    it('opens a brand-new file as pinned (permanent) and makes it active', () => {
      store().openFile(makeFile('/a.ts'))

      const s = store()
      expect(paths(s.openFiles)).toEqual(['/a.ts'])
      expect(s.openFiles[0].isPinned).toBe(true)
      expect(s.activeFilePath).toBe('/a.ts')
      expect(s.previewPath).toBeNull()
    })

    it('opens with preview:true as a non-pinned preview tab and tracks previewPath', () => {
      store().openFile(makeFile('/a.ts'), { preview: true })

      const s = store()
      expect(s.openFiles[0].isPinned).toBe(false)
      expect(s.previewPath).toBe('/a.ts')
      expect(s.activeFilePath).toBe('/a.ts')
    })

    it('replaces the existing preview tab when opening another preview', () => {
      store().openFile(makeFile('/a.ts'), { preview: true })
      store().openFile(makeFile('/b.ts'), { preview: true })

      const s = store()
      // Old preview is gone, only the new preview remains.
      expect(paths(s.openFiles)).toEqual(['/b.ts'])
      expect(s.previewPath).toBe('/b.ts')
      expect(s.activeFilePath).toBe('/b.ts')
    })

    it('promotes an existing preview tab to pinned when reopened non-preview', () => {
      store().openFile(makeFile('/a.ts'), { preview: true })
      expect(store().previewPath).toBe('/a.ts')

      store().openFile(makeFile('/a.ts')) // double-click / permanent open

      const s = store()
      expect(s.openFiles[0].isPinned).toBe(true)
      expect(s.previewPath).toBeNull()
      expect(paths(s.openFiles)).toEqual(['/a.ts']) // not duplicated
    })

    it('does not duplicate an already-open file, just re-activates it', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/a.ts'))

      const s = store()
      expect(paths(s.openFiles)).toEqual(['/a.ts', '/b.ts'])
      expect(s.activeFilePath).toBe('/a.ts')
    })

    it('pushes opened files onto tab history', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))

      const s = store()
      expect(s.tabHistory).toEqual(['/a.ts', '/b.ts'])
      expect(s.tabHistoryIndex).toBe(1)
    })
  })

  // ─── closeFile ───────────────────────────────────────────────────────────

  describe('closeFile', () => {
    it('removes the file and clears previewPath if it was the preview', () => {
      store().openFile(makeFile('/a.ts'), { preview: true })
      store().closeFile('/a.ts')

      const s = store()
      expect(s.openFiles).toHaveLength(0)
      expect(s.previewPath).toBeNull()
      expect(s.activeFilePath).toBeNull()
    })

    it('selects the last remaining file when the active file is closed', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))
      store().setActiveFile('/b.ts')

      store().closeFile('/b.ts')

      const s = store()
      expect(paths(s.openFiles)).toEqual(['/a.ts', '/c.ts'])
      // Active was the closed file -> falls back to last in the remaining list.
      expect(s.activeFilePath).toBe('/c.ts')
    })

    it('leaves active untouched when a non-active file is closed', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().setActiveFile('/a.ts')

      store().closeFile('/b.ts')

      expect(store().activeFilePath).toBe('/a.ts')
    })

    it('refuses to close a pinned tab', () => {
      store().openFile(makeFile('/a.ts'))
      store().pinTab('/a.ts')

      store().closeFile('/a.ts')

      expect(paths(store().openFiles)).toEqual(['/a.ts'])
    })
  })

  // ─── dirty / modified tracking ─────────────────────────────────────────────

  describe('dirty tracking', () => {
    it('updateFileContent sets content, marks modified+pinned, and clears preview', () => {
      store().openFile(makeFile('/a.ts'), { preview: true })

      store().updateFileContent('/a.ts', 'hello')

      const f = store().openFiles[0]
      expect(f.content).toBe('hello')
      expect(f.isModified).toBe(true)
      expect(f.isPinned).toBe(true)
      expect(store().previewPath).toBeNull()
    })

    it('markSaved clears the modified flag', () => {
      store().openFile(makeFile('/a.ts'))
      store().updateFileContent('/a.ts', 'x')
      expect(store().openFiles[0].isModified).toBe(true)

      store().markSaved('/a.ts')
      expect(store().openFiles[0].isModified).toBe(false)
    })

    it('markSaved also drops the recovery snapshot for the file', () => {
      store().openFile(makeFile('/a.ts'))
      store().trackUnsavedChange('/a.ts', 'new', 'orig')
      expect(store().unsavedSnapshots['/a.ts']).toBeDefined()

      store().markSaved('/a.ts')
      expect(store().unsavedSnapshots['/a.ts']).toBeUndefined()
    })

    it('markAiModified flags aiModified and pins the file', () => {
      store().openFile(makeFile('/a.ts'), { preview: true })

      store().markAiModified('/a.ts')

      const f = store().openFiles[0]
      expect(f.aiModified).toBe(true)
      expect(f.isPinned).toBe(true)
      expect(store().previewPath).toBeNull()
    })
  })

  // ─── bulk close operations ─────────────────────────────────────────────────

  describe('bulk close', () => {
    it('closeAllFiles wipes everything when nothing is pinned', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))

      store().closeAllFiles()

      const s = store()
      expect(s.openFiles).toHaveLength(0)
      expect(s.activeFilePath).toBeNull()
    })

    it('closeAllFiles keeps pinned tabs and reselects a pinned active', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().pinTab('/b.ts')
      store().setActiveFile('/a.ts')

      store().closeAllFiles()

      const s = store()
      expect(paths(s.openFiles)).toEqual(['/b.ts'])
      // /a.ts (active) got closed, so active falls back to first pinned.
      expect(s.activeFilePath).toBe('/b.ts')
    })

    it('closeOtherFiles keeps only the target (plus pinned) and activates target', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))
      store().pinTab('/a.ts')

      store().closeOtherFiles('/b.ts')

      const s = store()
      expect(paths(s.openFiles).sort()).toEqual(['/a.ts', '/b.ts'])
      expect(s.activeFilePath).toBe('/b.ts')
    })

    it('closeToRight removes tabs after the target but keeps pinned ones', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))
      store().openFile(makeFile('/d.ts'))
      store().pinTab('/d.ts') // pinning moves /d.ts into the pinned zone (front)

      store().closeToRight('/b.ts')

      const s = store()
      // /d.ts is pinned (now at index 0) so it survives; /c.ts is dropped.
      expect(paths(s.openFiles)).toContain('/d.ts')
      expect(paths(s.openFiles)).toContain('/a.ts')
      expect(paths(s.openFiles)).toContain('/b.ts')
      expect(paths(s.openFiles)).not.toContain('/c.ts')
    })

    it('closeToRight is a no-op when the path is not open', () => {
      store().openFile(makeFile('/a.ts'))
      const before = paths(store().openFiles)

      store().closeToRight('/missing.ts')

      expect(paths(store().openFiles)).toEqual(before)
    })

    it('closeSaved keeps only modified or pinned files', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))
      store().updateFileContent('/b.ts', 'dirty') // b is modified
      store().pinTab('/c.ts') // c is pinned

      store().closeSaved()

      const s = store()
      expect(paths(s.openFiles).sort()).toEqual(['/b.ts', '/c.ts'])
    })
  })

  // ─── tab switching ─────────────────────────────────────────────────────────

  describe('tab switching', () => {
    it('switchToNextTab wraps around to the first tab', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().setActiveFile('/b.ts')

      store().switchToNextTab()

      expect(store().activeFilePath).toBe('/a.ts')
    })

    it('switchToPrevTab wraps around to the last tab', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().setActiveFile('/a.ts')

      store().switchToPrevTab()

      expect(store().activeFilePath).toBe('/b.ts')
    })

    it('switchToNextTab is a no-op with a single tab', () => {
      store().openFile(makeFile('/a.ts'))
      store().switchToNextTab()
      expect(store().activeFilePath).toBe('/a.ts')
    })
  })

  // ─── reordering ──────────────────────────────────────────────────────────

  describe('reorderFiles', () => {
    it('moves an unpinned tab to a new index', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))

      store().reorderFiles(0, 2)

      expect(paths(store().openFiles)).toEqual(['/b.ts', '/c.ts', '/a.ts'])
    })

    it('is a no-op for out-of-range or equal indices', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      const before = paths(store().openFiles)

      store().reorderFiles(0, 0)
      store().reorderFiles(-1, 1)
      store().reorderFiles(0, 99)

      expect(paths(store().openFiles)).toEqual(before)
    })

    it('forbids moving an unpinned tab into the pinned zone', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().pinTab('/a.ts') // pinnedCount = 1, /a.ts at index 0
      const before = paths(store().openFiles)

      // Try to move unpinned /b.ts (index 1) into pinned zone (toIndex 0).
      store().reorderFiles(1, 0)

      expect(paths(store().openFiles)).toEqual(before)
    })
  })

  // ─── pin / unpin ───────────────────────────────────────────────────────────

  describe('pin / unpin', () => {
    it('pinTab adds to pinnedTabs, marks pinned, and moves into the pinned zone', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))

      store().pinTab('/b.ts')

      const s = store()
      expect(s.pinnedTabs).toContain('/b.ts')
      // /b.ts moves to the front (pinned zone is at index 0).
      expect(s.openFiles[0].path).toBe('/b.ts')
      expect(s.openFiles[0].isPinned).toBe(true)
    })

    it('pinTab is idempotent for an already-pinned path', () => {
      store().openFile(makeFile('/a.ts'))
      store().pinTab('/a.ts')
      store().pinTab('/a.ts')

      expect(store().pinnedTabs).toEqual(['/a.ts'])
    })

    it('unpinTab removes from pinnedTabs', () => {
      store().openFile(makeFile('/a.ts'))
      store().pinTab('/a.ts')

      store().unpinTab('/a.ts')

      expect(store().pinnedTabs).not.toContain('/a.ts')
    })

    it('isTabPinned reflects pinned state', () => {
      store().openFile(makeFile('/a.ts'))
      expect(store().isTabPinned('/a.ts')).toBe(false)

      store().pinTab('/a.ts')
      expect(store().isTabPinned('/a.ts')).toBe(true)
    })
  })

  // ─── external change / disk state ──────────────────────────────────────────

  describe('external change flags', () => {
    it('reloadFileContent replaces content and clears change/dirty flags', () => {
      store().openFile(makeFile('/a.ts', { hasExternalChange: true, isModified: true }))

      store().reloadFileContent('/a.ts', 'fresh')

      const f = store().openFiles[0]
      expect(f.content).toBe('fresh')
      expect(f.isModified).toBe(false)
      expect(f.hasExternalChange).toBe(false)
      expect(f.isDeletedOnDisk).toBe(false)
    })

    it('markExternalChange then dismissExternalChange toggles the flag', () => {
      store().openFile(makeFile('/a.ts'))

      store().markExternalChange('/a.ts')
      expect(store().openFiles[0].hasExternalChange).toBe(true)

      store().dismissExternalChange('/a.ts')
      expect(store().openFiles[0].hasExternalChange).toBe(false)
    })

    it('markDeletedOnDisk sets deleted and clears external change', () => {
      store().openFile(makeFile('/a.ts', { hasExternalChange: true }))

      store().markDeletedOnDisk('/a.ts')

      const f = store().openFiles[0]
      expect(f.isDeletedOnDisk).toBe(true)
      expect(f.hasExternalChange).toBe(false)
    })
  })

  // ─── editor groups / split ──────────────────────────────────────────────────

  describe('editor groups', () => {
    it('createGroup appends a group and makes it active', () => {
      const id = store().createGroup('right')

      const s = store()
      expect(s.editorGroups).toHaveLength(2)
      expect(s.activeGroupId).toBe(id)
      expect(s.getGroup(id)?.position).toBe('right')
    })

    it('closeGroup refuses to remove the last remaining group', () => {
      store().closeGroup('group-left')
      expect(store().editorGroups).toHaveLength(1)
    })

    it('closeGroup removes a group and reassigns active when the active group is closed', () => {
      const id = store().createGroup('right')
      expect(store().activeGroupId).toBe(id)

      store().closeGroup(id)

      const s = store()
      expect(s.editorGroups).toHaveLength(1)
      expect(s.activeGroupId).toBe('group-left')
    })

    it('openFileInGroup adds a pinned file to the target group', () => {
      store().openFileInGroup('group-left', makeFile('/a.ts'))

      const g = store().getGroup('group-left')!
      expect(paths(g.openFiles)).toEqual(['/a.ts'])
      expect(g.activeFilePath).toBe('/a.ts')
      expect(g.openFiles[0].isPinned).toBe(true)
    })

    it('closeFileInGroup removes the only file and collapses the empty extra group', () => {
      const id = store().createGroup('right')
      store().openFileInGroup(id, makeFile('/a.ts'))

      store().closeFileInGroup(id, '/a.ts')

      // The now-empty extra group is removed; only the default group remains.
      const s = store()
      expect(s.editorGroups.map((g) => g.id)).toEqual(['group-left'])
    })

    it('moveTabToGroup transfers a file between groups and removes the emptied source', () => {
      const right = store().createGroup('right')
      store().openFileInGroup('group-left', makeFile('/a.ts'))

      store().moveTabToGroup('group-left', right, '/a.ts')

      const s = store()
      // Source group-left is now empty -> removed; file lives in the right group.
      const rightGroup = s.getGroup(right)!
      expect(paths(rightGroup.openFiles)).toEqual(['/a.ts'])
      expect(s.getGroup('group-left')).toBeUndefined()
      expect(s.activeGroupId).toBe(right)
    })

    it('moveTabToGroup is a no-op when the file is not in the source group', () => {
      const right = store().createGroup('right')
      const before = JSON.stringify(store().editorGroups)

      store().moveTabToGroup('group-left', right, '/nope.ts')

      expect(JSON.stringify(store().editorGroups)).toBe(before)
    })

    it('splitEditor opens a copy of the active file in a new group without removing the source', () => {
      store().openFileInGroup('group-left', makeFile('/a.ts'))

      const newId = store().splitEditor('right')

      const s = store()
      expect(paths(s.getGroup('group-left')!.openFiles)).toEqual(['/a.ts'])
      expect(paths(s.getGroup(newId)!.openFiles)).toEqual(['/a.ts'])
    })
  })

  // ─── file recovery ──────────────────────────────────────────────────────────

  describe('file recovery', () => {
    it('trackUnsavedChange stores a snapshot and persists to localStorage', () => {
      store().trackUnsavedChange('/a.ts', 'edited', 'orig')

      const snap = store().unsavedSnapshots['/a.ts']
      expect(snap).toMatchObject({ path: '/a.ts', content: 'edited', originalContent: 'orig' })
      expect(typeof snap.timestamp).toBe('number')

      const persisted = JSON.parse(localStorage.getItem('orion-editor-recovery')!)
      expect(persisted['/a.ts'].content).toBe('edited')
    })

    it('getRecoverableFiles returns all snapshots', () => {
      store().trackUnsavedChange('/a.ts', '1', '')
      store().trackUnsavedChange('/b.ts', '2', '')

      expect(store().getRecoverableFiles().map((s) => s.path).sort()).toEqual(['/a.ts', '/b.ts'])
    })

    it('recoverFile applies snapshot content to the open file and dismisses its notification', () => {
      store().openFile(makeFile('/a.ts'))
      store().trackUnsavedChange('/a.ts', 'recovered', 'orig')
      store().checkForRecoverableFiles()

      const result = store().recoverFile('/a.ts')

      expect(result?.content).toBe('recovered')
      const f = store().openFiles[0]
      expect(f.content).toBe('recovered')
      expect(f.isModified).toBe(true)
      const note = store().recoveryNotifications.find((n) => n.path === '/a.ts')
      expect(note?.dismissed).toBe(true)
    })

    it('recoverFile returns null for an unknown path', () => {
      expect(store().recoverFile('/unknown.ts')).toBeNull()
    })

    it('clearRecoverySnapshot removes both the snapshot and its notification', () => {
      store().trackUnsavedChange('/a.ts', 'x', '')
      store().checkForRecoverableFiles()

      store().clearRecoverySnapshot('/a.ts')

      expect(store().unsavedSnapshots['/a.ts']).toBeUndefined()
      expect(store().recoveryNotifications.find((n) => n.path === '/a.ts')).toBeUndefined()
    })

    it('checkForRecoverableFiles creates notifications without duplicating existing ones', () => {
      store().trackUnsavedChange('/a.ts', 'x', '')
      store().checkForRecoverableFiles()
      store().checkForRecoverableFiles() // second call should not duplicate

      expect(store().recoveryNotifications.filter((n) => n.path === '/a.ts')).toHaveLength(1)
    })

    it('dismissAllRecoveryNotifications marks every notification dismissed', () => {
      store().trackUnsavedChange('/a.ts', 'x', '')
      store().trackUnsavedChange('/b.ts', 'y', '')
      store().checkForRecoverableFiles()

      store().dismissAllRecoveryNotifications()

      expect(store().recoveryNotifications.every((n) => n.dismissed)).toBe(true)
    })
  })

  // ─── editor file state persistence ───────────────────────────────────────────

  describe('file state persistence', () => {
    it('updateCursorPosition stores position with sensible defaults for other fields', () => {
      vi.useFakeTimers()
      store().updateCursorPosition('/a.ts', { line: 5, column: 9 })

      const state = store().getFileState('/a.ts')!
      expect(state.cursorPosition).toEqual({ line: 5, column: 9 })
      expect(state.scrollTop).toBe(0)
      expect(state.foldedRanges).toEqual([])
    })

    it('updateScrollPosition merges with an existing cursor entry', () => {
      vi.useFakeTimers()
      store().updateCursorPosition('/a.ts', { line: 3, column: 4 })
      store().updateScrollPosition('/a.ts', 120, 40)

      const state = store().getFileState('/a.ts')!
      expect(state.scrollTop).toBe(120)
      expect(state.scrollLeft).toBe(40)
      expect(state.cursorPosition).toEqual({ line: 3, column: 4 })
    })

    it('debounced persistence writes to localStorage only after the timer fires', () => {
      vi.useFakeTimers()
      store().updateCursorPosition('/a.ts', { line: 1, column: 1 })

      expect(localStorage.getItem('orion-editor-state')).toBeNull()

      vi.advanceTimersByTime(1000)

      const persisted = JSON.parse(localStorage.getItem('orion-editor-state')!)
      expect(persisted['/a.ts'].cursorPosition).toEqual({ line: 1, column: 1 })
    })
  })

  // ─── tab history navigation ──────────────────────────────────────────────────

  describe('tab history navigation', () => {
    it('navigateBack and navigateForward move through history of open files', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))
      expect(store().tabHistoryIndex).toBe(2)

      store().navigateBack()
      expect(store().activeFilePath).toBe('/b.ts')
      expect(store().canNavigateForward()).toBe(true)

      store().navigateForward()
      expect(store().activeFilePath).toBe('/c.ts')
    })

    it('navigateBack skips files that are no longer open', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))
      // Close the immediate previous entry so back must skip it.
      store().closeFile('/b.ts')

      store().navigateBack()

      // /b.ts is closed -> back skips to /a.ts.
      expect(store().activeFilePath).toBe('/a.ts')
    })

    it('canNavigateBack is false at the start of history', () => {
      store().openFile(makeFile('/a.ts'))
      expect(store().canNavigateBack()).toBe(false)
    })

    it('does not push duplicate history entries when re-activating the current tab', () => {
      store().openFile(makeFile('/a.ts'))
      store().setActiveFile('/a.ts')
      store().setActiveFile('/a.ts')

      expect(store().tabHistory).toEqual(['/a.ts'])
      expect(store().tabHistoryIndex).toBe(0)
    })

    it('truncates forward history when navigating to a new tab after going back', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))
      store().openFile(makeFile('/c.ts'))
      store().navigateBack() // index -> 1 (/b.ts), forward history = [/c.ts]

      store().openFile(makeFile('/d.ts')) // should truncate /c.ts

      expect(store().tabHistory).toEqual(['/a.ts', '/b.ts', '/d.ts'])
    })
  })

  // ─── workspace sessions ──────────────────────────────────────────────────────

  describe('workspace sessions', () => {
    it('saveSession captures open files and persists, setting it active', () => {
      store().openFile(makeFile('/a.ts'))
      store().openFile(makeFile('/b.ts'))

      store().saveSession('work')

      const s = store()
      const session = s.sessions.find((x) => x.name === 'work')!
      // No group files present -> falls back to flat state capture.
      expect(session.groups[0].filePaths).toEqual(['/a.ts', '/b.ts'])
      expect(s.activeSessionName).toBe('work')
      expect(JSON.parse(localStorage.getItem('orion-editor-sessions')!)[0].name).toBe('work')
    })

    it('saveSession overwrites an existing session of the same name', () => {
      store().openFile(makeFile('/a.ts'))
      store().saveSession('work')
      store().openFile(makeFile('/b.ts'))
      store().saveSession('work')

      const sessions = store().sessions.filter((s) => s.name === 'work')
      expect(sessions).toHaveLength(1)
      expect(sessions[0].groups[0].filePaths).toEqual(['/a.ts', '/b.ts'])
    })

    it('loadSession restores group structure (paths only) and sets active session', () => {
      store().openFileInGroup('group-left', makeFile('/a.ts'))
      store().saveSession('work')
      // Mutate live state, then load to confirm restore.
      store().openFileInGroup('group-left', makeFile('/b.ts'))

      store().loadSession('work')

      const s = store()
      expect(s.activeSessionName).toBe('work')
      // Restored groups carry no file content (consumer must reopen), only structure.
      expect(s.editorGroups[0].openFiles).toEqual([])
      expect(s.editorGroups[0].activeFilePath).toBe('/a.ts')
    })

    it('deleteSession removes the session and clears activeSessionName if it matched', () => {
      store().openFile(makeFile('/a.ts'))
      store().saveSession('work')
      expect(store().activeSessionName).toBe('work')

      store().deleteSession('work')

      const s = store()
      expect(s.sessions.find((x) => x.name === 'work')).toBeUndefined()
      expect(s.activeSessionName).toBeNull()
    })

    it('renameSession renames and refuses if the new name already exists', () => {
      store().openFile(makeFile('/a.ts'))
      store().saveSession('work')
      store().saveSession('other')

      // Collision -> no-op.
      store().renameSession('work', 'other')
      expect(store().sessions.map((s) => s.name).sort()).toEqual(['other', 'work'])

      // Valid rename.
      store().renameSession('work', 'renamed')
      expect(store().sessions.map((s) => s.name).sort()).toEqual(['other', 'renamed'])
    })

    it('autoSaveSession saves under the active session name (or __autosave__ when none)', () => {
      store().openFile(makeFile('/a.ts'))

      store().autoSaveSession()

      expect(store().sessions.some((s) => s.name === '__autosave__')).toBe(true)
    })
  })
})
