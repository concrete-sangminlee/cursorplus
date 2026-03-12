/**
 * Undo/Redo history manager.
 * Provides multi-file undo stacks, composite edits,
 * history branching, and workspace-level undo.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface TextEdit {
  offset: number
  length: number       // chars deleted
  text: string         // chars inserted
  cursorBefore: number
  cursorAfter: number
}

export interface UndoEntry {
  id: string
  edits: TextEdit[]
  timestamp: number
  description: string
  groupId?: string     // for composite edits
  filePath: string
  contentBefore?: string  // snapshot (optional, for large edits)
  contentAfter?: string
}

export interface UndoStackState {
  past: UndoEntry[]
  future: UndoEntry[]
  savedIndex: number   // index in past[] at last save
}

export interface CompositeEdit {
  id: string
  entries: UndoEntry[]
  description: string
  timestamp: number
}

/* ── ID generator ────────────────────────────────────── */

let _idCounter = 0
function genId(): string {
  return `undo-${Date.now()}-${++_idCounter}`
}

/* ── Single-file Undo Stack ──────────────────────────── */

export class UndoStack {
  private past: UndoEntry[] = []
  private future: UndoEntry[] = []
  private savedIndex: number = 0
  private maxSize: number
  private groupTimeout: number = 300 // ms
  private lastPushTime: number = 0

  constructor(
    public readonly filePath: string,
    maxSize: number = 1000
  ) {
    this.maxSize = maxSize
  }

  push(edits: TextEdit[], description: string = 'edit'): UndoEntry {
    const entry: UndoEntry = {
      id: genId(),
      edits,
      timestamp: Date.now(),
      description,
      filePath: this.filePath,
    }

    // Try to merge with last entry if within group timeout
    if (this.canMerge(entry)) {
      const last = this.past[this.past.length - 1]
      last.edits.push(...entry.edits)
      last.timestamp = entry.timestamp
      last.description = description
      this.future = []
      return last
    }

    this.past.push(entry)
    this.future = [] // clear redo stack on new edit

    // Trim history if over max
    if (this.past.length > this.maxSize) {
      const removed = this.past.length - this.maxSize
      this.past.splice(0, removed)
      this.savedIndex = Math.max(0, this.savedIndex - removed)
    }

    this.lastPushTime = Date.now()
    return entry
  }

  private canMerge(entry: UndoEntry): boolean {
    if (this.past.length === 0) return false
    const last = this.past[this.past.length - 1]
    const timeDiff = entry.timestamp - last.timestamp

    // Only merge single-char edits within timeout
    if (timeDiff > this.groupTimeout) return false
    if (entry.edits.length !== 1 || last.edits.length > 20) return false

    const edit = entry.edits[0]
    const lastEdit = last.edits[last.edits.length - 1]

    // Merge consecutive character insertions
    if (edit.length === 0 && edit.text.length === 1 &&
        lastEdit.length === 0 && lastEdit.text.length === 1) {
      if (edit.offset === lastEdit.offset + lastEdit.text.length) {
        return true
      }
    }

    // Merge consecutive character deletions
    if (edit.text === '' && edit.length === 1 &&
        lastEdit.text === '' && lastEdit.length === 1) {
      if (edit.offset === lastEdit.offset || edit.offset === lastEdit.offset - 1) {
        return true
      }
    }

    return false
  }

  undo(): UndoEntry | undefined {
    const entry = this.past.pop()
    if (!entry) return undefined
    this.future.push(entry)
    return entry
  }

  redo(): UndoEntry | undefined {
    const entry = this.future.pop()
    if (!entry) return undefined
    this.past.push(entry)
    return entry
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  markSaved(): void {
    this.savedIndex = this.past.length
  }

  isModified(): boolean {
    return this.past.length !== this.savedIndex
  }

  clear(): void {
    this.past = []
    this.future = []
    this.savedIndex = 0
  }

  getState(): UndoStackState {
    return {
      past: [...this.past],
      future: [...this.future],
      savedIndex: this.savedIndex,
    }
  }

  getUndoDescription(): string | undefined {
    return this.past[this.past.length - 1]?.description
  }

  getRedoDescription(): string | undefined {
    return this.future[this.future.length - 1]?.description
  }

  get undoCount(): number { return this.past.length }
  get redoCount(): number { return this.future.length }
}

/* ── Composite Edit Builder ──────────────────────────── */

export class CompositeEditBuilder {
  private entries: UndoEntry[] = []
  private readonly id: string

  constructor(public readonly description: string) {
    this.id = genId()
  }

  addEdit(filePath: string, edits: TextEdit[]): this {
    this.entries.push({
      id: genId(),
      edits,
      timestamp: Date.now(),
      description: this.description,
      filePath,
      groupId: this.id,
    })
    return this
  }

  build(): CompositeEdit {
    return {
      id: this.id,
      entries: [...this.entries],
      description: this.description,
      timestamp: Date.now(),
    }
  }
}

/* ── Workspace Undo Manager ──────────────────────────── */

export class WorkspaceUndoManager {
  private stacks: Map<string, UndoStack> = new Map()
  private globalHistory: UndoEntry[] = []
  private maxGlobalHistory: number = 5000
  private listeners: Set<(filePath: string, action: 'undo' | 'redo' | 'push') => void> = new Set()

  getStack(filePath: string): UndoStack {
    let stack = this.stacks.get(filePath)
    if (!stack) {
      stack = new UndoStack(filePath)
      this.stacks.set(filePath, stack)
    }
    return stack
  }

  pushEdit(filePath: string, edits: TextEdit[], description?: string): UndoEntry {
    const stack = this.getStack(filePath)
    const entry = stack.push(edits, description)

    this.globalHistory.push(entry)
    if (this.globalHistory.length > this.maxGlobalHistory) {
      this.globalHistory.splice(0, this.globalHistory.length - this.maxGlobalHistory)
    }

    this.notify(filePath, 'push')
    return entry
  }

  undo(filePath: string): UndoEntry | undefined {
    const stack = this.stacks.get(filePath)
    if (!stack) return undefined
    const entry = stack.undo()
    if (entry) this.notify(filePath, 'undo')
    return entry
  }

  redo(filePath: string): UndoEntry | undefined {
    const stack = this.stacks.get(filePath)
    if (!stack) return undefined
    const entry = stack.redo()
    if (entry) this.notify(filePath, 'redo')
    return entry
  }

  canUndo(filePath: string): boolean {
    return this.stacks.get(filePath)?.canUndo() ?? false
  }

  canRedo(filePath: string): boolean {
    return this.stacks.get(filePath)?.canRedo() ?? false
  }

  markSaved(filePath: string): void {
    this.stacks.get(filePath)?.markSaved()
  }

  isModified(filePath: string): boolean {
    return this.stacks.get(filePath)?.isModified() ?? false
  }

  getModifiedFiles(): string[] {
    const files: string[] = []
    for (const [path, stack] of this.stacks) {
      if (stack.isModified()) files.push(path)
    }
    return files
  }

  // Apply a composite edit across multiple files
  applyComposite(composite: CompositeEdit): void {
    for (const entry of composite.entries) {
      const stack = this.getStack(entry.filePath)
      stack.push(entry.edits, composite.description)
    }
    this.globalHistory.push(...composite.entries)
  }

  // Undo a composite edit (all files at once)
  undoComposite(groupId: string): UndoEntry[] {
    const undone: UndoEntry[] = []
    for (const [filePath, stack] of this.stacks) {
      const state = stack.getState()
      const last = state.past[state.past.length - 1]
      if (last?.groupId === groupId) {
        const entry = stack.undo()
        if (entry) undone.push(entry)
      }
    }
    return undone
  }

  clearFile(filePath: string): void {
    this.stacks.get(filePath)?.clear()
  }

  clearAll(): void {
    this.stacks.clear()
    this.globalHistory = []
  }

  removeFile(filePath: string): void {
    this.stacks.delete(filePath)
  }

  // Rename tracking
  renameFile(oldPath: string, newPath: string): void {
    const stack = this.stacks.get(oldPath)
    if (stack) {
      this.stacks.delete(oldPath)
      // Create new stack with same state
      const newStack = this.getStack(newPath)
      const state = stack.getState()
      for (const entry of state.past) {
        newStack.push(entry.edits, entry.description)
      }
      if (stack.isModified()) {
        // Don't mark as saved
      } else {
        newStack.markSaved()
      }
    }
  }

  // Global history query
  getRecentEdits(count: number = 50): UndoEntry[] {
    return this.globalHistory.slice(-count)
  }

  getFileEditHistory(filePath: string): UndoEntry[] {
    return this.globalHistory.filter(e => e.filePath === filePath)
  }

  // Statistics
  getStats(): {
    totalFiles: number
    modifiedFiles: number
    totalEdits: number
    totalUndoable: number
  } {
    let totalEdits = 0
    let totalUndoable = 0
    let modifiedFiles = 0

    for (const [, stack] of this.stacks) {
      totalEdits += stack.undoCount
      totalUndoable += stack.undoCount + stack.redoCount
      if (stack.isModified()) modifiedFiles++
    }

    return {
      totalFiles: this.stacks.size,
      modifiedFiles,
      totalEdits,
      totalUndoable,
    }
  }

  // Listeners
  onChange(listener: (filePath: string, action: 'undo' | 'redo' | 'push') => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(filePath: string, action: 'undo' | 'redo' | 'push'): void {
    for (const listener of this.listeners) {
      try { listener(filePath, action) } catch { /* ignore */ }
    }
  }
}

/* ── Edit application helpers ────────────────────────── */

export function applyEdits(content: string, edits: TextEdit[]): string {
  // Sort edits by offset descending to avoid index shifting
  const sorted = [...edits].sort((a, b) => b.offset - a.offset)

  let result = content
  for (const edit of sorted) {
    const before = result.slice(0, edit.offset)
    const after = result.slice(edit.offset + edit.length)
    result = before + edit.text + after
  }

  return result
}

export function invertEdits(content: string, edits: TextEdit[]): TextEdit[] {
  return edits.map(edit => ({
    offset: edit.offset,
    length: edit.text.length,
    text: content.slice(edit.offset, edit.offset + edit.length),
    cursorBefore: edit.cursorAfter,
    cursorAfter: edit.cursorBefore,
  }))
}

export function createInsertEdit(offset: number, text: string, cursor: number): TextEdit {
  return { offset, length: 0, text, cursorBefore: cursor, cursorAfter: cursor + text.length }
}

export function createDeleteEdit(offset: number, length: number, cursor: number): TextEdit {
  return { offset, length, text: '', cursorBefore: cursor, cursorAfter: offset }
}

export function createReplaceEdit(
  offset: number,
  length: number,
  text: string,
  cursorBefore: number,
  cursorAfter: number
): TextEdit {
  return { offset, length, text, cursorBefore, cursorAfter }
}

/* ── Line-based edit helpers ─────────────────────────── */

export function offsetToLineCol(content: string, offset: number): { line: number; col: number } {
  let line = 0
  let lastNewline = -1

  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') {
      line++
      lastNewline = i
    }
  }

  return { line, col: offset - lastNewline - 1 }
}

export function lineColToOffset(content: string, line: number, col: number): number {
  let currentLine = 0
  for (let i = 0; i < content.length; i++) {
    if (currentLine === line) return i + col
    if (content[i] === '\n') currentLine++
  }
  return content.length
}

export function getLineRange(content: string, lineNumber: number): { start: number; end: number } {
  const lines = content.split('\n')
  let start = 0
  for (let i = 0; i < lineNumber && i < lines.length; i++) {
    start += lines[i].length + 1
  }
  const end = start + (lines[lineNumber]?.length ?? 0)
  return { start, end }
}

/* ── Singleton ───────────────────────────────────────── */

let _instance: WorkspaceUndoManager | null = null

export function getUndoManager(): WorkspaceUndoManager {
  if (!_instance) _instance = new WorkspaceUndoManager()
  return _instance
}

export function resetUndoManager(): void {
  _instance?.clearAll()
  _instance = null
}
