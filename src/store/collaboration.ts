/**
 * Real-time collaboration store.
 * Manages presence, cursors, selections, operational transforms,
 * and real-time document sync for multi-user editing.
 */

import { create } from 'zustand'

/* ── Types ─────────────────────────────────────────────── */

export interface CollaboratorInfo {
  id: string
  name: string
  email?: string
  avatar?: string
  color: string
  isOnline: boolean
  lastSeen: number
}

export interface CursorPosition {
  collaboratorId: string
  filePath: string
  line: number
  column: number
  timestamp: number
}

export interface SelectionRange {
  collaboratorId: string
  filePath: string
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
  timestamp: number
}

export interface EditOperation {
  id: string
  collaboratorId: string
  filePath: string
  type: 'insert' | 'delete' | 'replace'
  position: { line: number; column: number }
  text: string
  rangeEnd?: { line: number; column: number }
  timestamp: number
  version: number
}

export interface FileVersion {
  filePath: string
  version: number
  lastModifiedBy: string
  lastModifiedAt: number
  checksum: string
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface CollaborationSession {
  id: string
  name: string
  hostId: string
  createdAt: number
  participants: string[]
  activeFile?: string
  isReadOnly: boolean
  maxParticipants: number
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: number
  type: 'message' | 'system' | 'code'
}

export interface ConflictInfo {
  filePath: string
  localVersion: number
  remoteVersion: number
  baseVersion: number
  localContent: string
  remoteContent: string
  resolvedBy?: string
}

/* ── Operational Transform Types ──────────────────────── */

export type OTOperation =
  | { type: 'retain'; count: number }
  | { type: 'insert'; text: string }
  | { type: 'delete'; count: number }

export interface OTDocument {
  content: string
  version: number
  operations: OTOperation[][]
}

/* ── CRDT Types ───────────────────────────────────────── */

export interface CRDTPosition {
  id: [number, string] // [lamport clock, siteId]
  after: [number, string] | null
}

export interface CRDTInsert {
  type: 'insert'
  position: CRDTPosition
  character: string
}

export interface CRDTDelete {
  type: 'delete'
  position: CRDTPosition
}

export type CRDTOperation = CRDTInsert | CRDTDelete

/* ── Store ─────────────────────────────────────────────── */

interface CollaborationState {
  // Connection
  connectionState: ConnectionState
  sessionId: string | null
  userId: string | null
  session: CollaborationSession | null

  // Participants
  collaborators: Map<string, CollaboratorInfo>
  cursors: Map<string, CursorPosition>
  selections: Map<string, SelectionRange>

  // Document state
  fileVersions: Map<string, FileVersion>
  pendingOperations: EditOperation[]
  operationHistory: EditOperation[]
  conflicts: ConflictInfo[]

  // Chat
  chatMessages: ChatMessage[]
  unreadCount: number

  // Settings
  followMode: string | null // collaboratorId to follow
  showCursors: boolean
  showSelections: boolean
  showChat: boolean

  // Connection management
  connect: (serverUrl: string, sessionId: string, userId: string) => void
  disconnect: () => void
  createSession: (name: string) => Promise<string>
  joinSession: (sessionId: string) => Promise<void>
  leaveSession: () => void
  setConnectionState: (state: ConnectionState) => void

  // Presence
  updateCursor: (filePath: string, line: number, column: number) => void
  updateSelection: (filePath: string, startLine: number, startColumn: number, endLine: number, endColumn: number) => void
  setCollaborators: (collaborators: CollaboratorInfo[]) => void
  addCollaborator: (collaborator: CollaboratorInfo) => void
  removeCollaborator: (id: string) => void
  updateCollaboratorStatus: (id: string, isOnline: boolean) => void

  // Remote events
  onRemoteCursor: (cursor: CursorPosition) => void
  onRemoteSelection: (selection: SelectionRange) => void
  onRemoteEdit: (operation: EditOperation) => void
  onRemoteFileVersion: (version: FileVersion) => void

  // Document operations
  sendEdit: (operation: Omit<EditOperation, 'id' | 'timestamp' | 'version'>) => void
  resolveConflict: (filePath: string, resolution: 'local' | 'remote' | 'merge', mergedContent?: string) => void
  getFileVersion: (filePath: string) => FileVersion | undefined

  // Chat
  sendMessage: (content: string) => void
  onChatMessage: (message: ChatMessage) => void
  markChatRead: () => void

  // Settings
  setFollowMode: (collaboratorId: string | null) => void
  toggleCursors: () => void
  toggleSelections: () => void
  toggleChat: () => void

  // Queries
  getCollaboratorColor: (id: string) => string
  getCollaboratorsInFile: (filePath: string) => CollaboratorInfo[]
  getFileCursors: (filePath: string) => CursorPosition[]
  getFileSelections: (filePath: string) => SelectionRange[]
  isFollowing: () => boolean
}

/* ── Collaborator Colors ──────────────────────────────── */

const COLLABORATOR_COLORS = [
  '#4fc1ff', '#ff6b6b', '#ffd93d', '#6bcb77', '#c084fc',
  '#fb923c', '#22d3ee', '#f472b6', '#a78bfa', '#34d399',
  '#fbbf24', '#60a5fa', '#f87171', '#a3e635', '#e879f9',
]

function getColorForIndex(index: number): string {
  return COLLABORATOR_COLORS[index % COLLABORATOR_COLORS.length]
}

/* ── WebSocket Connection (simulated) ─────────────────── */

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

/* ── Store Implementation ──────────────────────────────── */

export const useCollaborationStore = create<CollaborationState>()((set, get) => ({
  connectionState: 'disconnected',
  sessionId: null,
  userId: null,
  session: null,
  collaborators: new Map(),
  cursors: new Map(),
  selections: new Map(),
  fileVersions: new Map(),
  pendingOperations: [],
  operationHistory: [],
  conflicts: [],
  chatMessages: [],
  unreadCount: 0,
  followMode: null,
  showCursors: true,
  showSelections: true,
  showChat: false,

  connect: (serverUrl, sessionId, userId) => {
    set({ connectionState: 'connecting', sessionId, userId })

    try {
      ws = new WebSocket(serverUrl)

      ws.onopen = () => {
        set({ connectionState: 'connected' })
        // Send join message
        ws?.send(JSON.stringify({
          type: 'join',
          sessionId,
          userId,
        }))

        // Start heartbeat
        heartbeatTimer = setInterval(() => {
          ws?.send(JSON.stringify({ type: 'heartbeat' }))
        }, 30000)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleServerMessage(data)
        } catch {
          // ignore parse errors
        }
      }

      ws.onclose = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer)
        const state = get()
        if (state.connectionState !== 'disconnected') {
          set({ connectionState: 'reconnecting' })
          reconnectTimer = setTimeout(() => {
            get().connect(serverUrl, sessionId, userId)
          }, 3000)
        }
      }

      ws.onerror = () => {
        set({ connectionState: 'error' })
      }
    } catch {
      set({ connectionState: 'error' })
    }
  },

  disconnect: () => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    ws?.close()
    ws = null
    set({
      connectionState: 'disconnected',
      sessionId: null,
      session: null,
      collaborators: new Map(),
      cursors: new Map(),
      selections: new Map(),
    })
  },

  createSession: async (name) => {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const session: CollaborationSession = {
      id: sessionId,
      name,
      hostId: get().userId || '',
      createdAt: Date.now(),
      participants: [get().userId || ''],
      isReadOnly: false,
      maxParticipants: 10,
    }
    set({ session, sessionId })

    ws?.send(JSON.stringify({ type: 'createSession', session }))
    return sessionId
  },

  joinSession: async (sessionId) => {
    ws?.send(JSON.stringify({
      type: 'joinSession',
      sessionId,
      userId: get().userId,
    }))
    set({ sessionId })
  },

  leaveSession: () => {
    ws?.send(JSON.stringify({
      type: 'leaveSession',
      sessionId: get().sessionId,
      userId: get().userId,
    }))
    set({
      session: null,
      sessionId: null,
      collaborators: new Map(),
      cursors: new Map(),
      selections: new Map(),
    })
  },

  setConnectionState: (state) => set({ connectionState: state }),

  // Presence
  updateCursor: (filePath, line, column) => {
    const cursor: CursorPosition = {
      collaboratorId: get().userId || '',
      filePath,
      line,
      column,
      timestamp: Date.now(),
    }
    ws?.send(JSON.stringify({ type: 'cursor', ...cursor }))
  },

  updateSelection: (filePath, startLine, startColumn, endLine, endColumn) => {
    const selection: SelectionRange = {
      collaboratorId: get().userId || '',
      filePath,
      startLine,
      startColumn,
      endLine,
      endColumn,
      timestamp: Date.now(),
    }
    ws?.send(JSON.stringify({ type: 'selection', ...selection }))
  },

  setCollaborators: (collaborators) => {
    const map = new Map<string, CollaboratorInfo>()
    collaborators.forEach((c, i) => {
      map.set(c.id, { ...c, color: c.color || getColorForIndex(i) })
    })
    set({ collaborators: map })
  },

  addCollaborator: (collaborator) => {
    set(s => {
      const map = new Map(s.collaborators)
      const color = collaborator.color || getColorForIndex(map.size)
      map.set(collaborator.id, { ...collaborator, color })
      return { collaborators: map }
    })
  },

  removeCollaborator: (id) => {
    set(s => {
      const collaborators = new Map(s.collaborators)
      collaborators.delete(id)
      const cursors = new Map(s.cursors)
      cursors.delete(id)
      const selections = new Map(s.selections)
      selections.delete(id)
      return { collaborators, cursors, selections }
    })
  },

  updateCollaboratorStatus: (id, isOnline) => {
    set(s => {
      const collaborators = new Map(s.collaborators)
      const collab = collaborators.get(id)
      if (collab) {
        collaborators.set(id, { ...collab, isOnline, lastSeen: Date.now() })
      }
      return { collaborators }
    })
  },

  // Remote events
  onRemoteCursor: (cursor) => {
    set(s => {
      const cursors = new Map(s.cursors)
      cursors.set(cursor.collaboratorId, cursor)
      return { cursors }
    })
  },

  onRemoteSelection: (selection) => {
    set(s => {
      const selections = new Map(s.selections)
      selections.set(selection.collaboratorId, selection)
      return { selections }
    })
  },

  onRemoteEdit: (operation) => {
    set(s => ({
      operationHistory: [...s.operationHistory.slice(-999), operation],
    }))
  },

  onRemoteFileVersion: (version) => {
    set(s => {
      const fileVersions = new Map(s.fileVersions)
      fileVersions.set(version.filePath, version)
      return { fileVersions }
    })
  },

  // Document operations
  sendEdit: (operation) => {
    const fullOp: EditOperation = {
      ...operation,
      id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      version: (get().fileVersions.get(operation.filePath)?.version || 0) + 1,
    }

    set(s => ({
      pendingOperations: [...s.pendingOperations, fullOp],
    }))

    ws?.send(JSON.stringify({ type: 'edit', operation: fullOp }))
  },

  resolveConflict: (filePath, resolution, mergedContent) => {
    ws?.send(JSON.stringify({
      type: 'resolveConflict',
      filePath,
      resolution,
      mergedContent,
      userId: get().userId,
    }))

    set(s => ({
      conflicts: s.conflicts.filter(c => c.filePath !== filePath),
    }))
  },

  getFileVersion: (filePath) => get().fileVersions.get(filePath),

  // Chat
  sendMessage: (content) => {
    const message: ChatMessage = {
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderId: get().userId || '',
      senderName: get().collaborators.get(get().userId || '')?.name || 'You',
      content,
      timestamp: Date.now(),
      type: 'message',
    }
    set(s => ({ chatMessages: [...s.chatMessages, message] }))
    ws?.send(JSON.stringify({ type: 'chat', message }))
  },

  onChatMessage: (message) => {
    set(s => ({
      chatMessages: [...s.chatMessages, message],
      unreadCount: s.showChat ? s.unreadCount : s.unreadCount + 1,
    }))
  },

  markChatRead: () => set({ unreadCount: 0 }),

  // Settings
  setFollowMode: (collaboratorId) => set({ followMode: collaboratorId }),
  toggleCursors: () => set(s => ({ showCursors: !s.showCursors })),
  toggleSelections: () => set(s => ({ showSelections: !s.showSelections })),
  toggleChat: () => set(s => ({ showChat: !s.showChat, unreadCount: !s.showChat ? 0 : s.unreadCount })),

  // Queries
  getCollaboratorColor: (id) => {
    return get().collaborators.get(id)?.color || '#8b949e'
  },

  getCollaboratorsInFile: (filePath) => {
    const result: CollaboratorInfo[] = []
    const cursors = get().cursors
    for (const [id, cursor] of cursors) {
      if (cursor.filePath === filePath && id !== get().userId) {
        const collab = get().collaborators.get(id)
        if (collab) result.push(collab)
      }
    }
    return result
  },

  getFileCursors: (filePath) => {
    const result: CursorPosition[] = []
    for (const [id, cursor] of get().cursors) {
      if (cursor.filePath === filePath && id !== get().userId) {
        result.push(cursor)
      }
    }
    return result
  },

  getFileSelections: (filePath) => {
    const result: SelectionRange[] = []
    for (const [id, selection] of get().selections) {
      if (selection.filePath === filePath && id !== get().userId) {
        result.push(selection)
      }
    }
    return result
  },

  isFollowing: () => get().followMode !== null,
}))

/* ── Server Message Handler ───────────────────────────── */

function handleServerMessage(data: any) {
  const store = useCollaborationStore.getState()

  switch (data.type) {
    case 'participants':
      store.setCollaborators(data.collaborators)
      break
    case 'join':
      store.addCollaborator(data.collaborator)
      store.onChatMessage({
        id: `sys-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `${data.collaborator.name} joined the session`,
        timestamp: Date.now(),
        type: 'system',
      })
      break
    case 'leave':
      store.removeCollaborator(data.userId)
      break
    case 'cursor':
      store.onRemoteCursor(data)
      break
    case 'selection':
      store.onRemoteSelection(data)
      break
    case 'edit':
      store.onRemoteEdit(data.operation)
      break
    case 'fileVersion':
      store.onRemoteFileVersion(data.version)
      break
    case 'conflict':
      useCollaborationStore.setState(s => ({
        conflicts: [...s.conflicts, data.conflict],
      }))
      break
    case 'chat':
      store.onChatMessage(data.message)
      break
    case 'session':
      useCollaborationStore.setState({ session: data.session })
      break
    case 'status':
      store.updateCollaboratorStatus(data.userId, data.isOnline)
      break
  }
}

/* ── OT Transform Functions ───────────────────────────── */

export function transformOT(op1: OTOperation[], op2: OTOperation[]): [OTOperation[], OTOperation[]] {
  const result1: OTOperation[] = []
  const result2: OTOperation[] = []

  let i = 0, j = 0
  let op1Remaining: OTOperation | null = null
  let op2Remaining: OTOperation | null = null

  while (i < op1.length || j < op2.length || op1Remaining || op2Remaining) {
    const a: OTOperation | undefined = op1Remaining || op1[i]
    const b: OTOperation | undefined = op2Remaining || op2[j]

    if (!a && !b) break

    op1Remaining = null
    op2Remaining = null

    if (!a) {
      // Only b remaining
      if (b.type === 'insert') {
        result1.push({ type: 'retain', count: b.text.length })
        result2.push(b)
      }
      if (!op2Remaining) j++
      continue
    }

    if (!b) {
      // Only a remaining
      if (a.type === 'insert') {
        result1.push(a)
        result2.push({ type: 'retain', count: a.text.length })
      }
      if (!op1Remaining) i++
      continue
    }

    // Both ops exist
    if (a.type === 'insert') {
      result1.push(a)
      result2.push({ type: 'retain', count: a.text.length })
      if (!op1Remaining) i++
      continue
    }

    if (b.type === 'insert') {
      result1.push({ type: 'retain', count: b.text.length })
      result2.push(b)
      if (!op2Remaining) j++
      continue
    }

    if (a.type === 'retain' && b.type === 'retain') {
      const min = Math.min(a.count, b.count)
      result1.push({ type: 'retain', count: min })
      result2.push({ type: 'retain', count: min })

      if (a.count > min) op1Remaining = { type: 'retain', count: a.count - min }
      else if (!op1Remaining) i++

      if (b.count > min) op2Remaining = { type: 'retain', count: b.count - min }
      else if (!op2Remaining) j++

      continue
    }

    if (a.type === 'delete' && b.type === 'delete') {
      const min = Math.min(a.count, b.count)
      if (a.count > min) op1Remaining = { type: 'delete', count: a.count - min }
      else if (!op1Remaining) i++
      if (b.count > min) op2Remaining = { type: 'delete', count: b.count - min }
      else if (!op2Remaining) j++
      continue
    }

    if (a.type === 'delete' && b.type === 'retain') {
      const min = Math.min(a.count, b.count)
      result1.push({ type: 'delete', count: min })
      if (a.count > min) op1Remaining = { type: 'delete', count: a.count - min }
      else if (!op1Remaining) i++
      if (b.count > min) op2Remaining = { type: 'retain', count: b.count - min }
      else if (!op2Remaining) j++
      continue
    }

    if (a.type === 'retain' && b.type === 'delete') {
      const min = Math.min(a.count, b.count)
      result2.push({ type: 'delete', count: min })
      if (a.count > min) op1Remaining = { type: 'retain', count: a.count - min }
      else if (!op1Remaining) i++
      if (b.count > min) op2Remaining = { type: 'delete', count: b.count - min }
      else if (!op2Remaining) j++
      continue
    }

    // Safety: advance both
    if (!op1Remaining) i++
    if (!op2Remaining) j++
  }

  return [result1, result2]
}

export function applyOT(content: string, operations: OTOperation[]): string {
  let result = ''
  let cursor = 0

  for (const op of operations) {
    switch (op.type) {
      case 'retain':
        result += content.slice(cursor, cursor + op.count)
        cursor += op.count
        break
      case 'insert':
        result += op.text
        break
      case 'delete':
        cursor += op.count
        break
    }
  }

  // Append any remaining content
  result += content.slice(cursor)
  return result
}

export function composeOT(ops1: OTOperation[], ops2: OTOperation[]): OTOperation[] {
  const result: OTOperation[] = []
  let i = 0, j = 0

  while (i < ops1.length && j < ops2.length) {
    const a = ops1[i]
    const b = ops2[j]

    if (a.type === 'delete') {
      result.push(a)
      i++
    } else if (b.type === 'insert') {
      result.push(b)
      j++
    } else if (a.type === 'retain' && b.type === 'retain') {
      const min = Math.min(a.count, b.count)
      result.push({ type: 'retain', count: min })
      if (a.count > b.count) ops1[i] = { type: 'retain', count: a.count - min }
      else i++
      if (b.count > a.count) ops2[j] = { type: 'retain', count: b.count - min }
      else j++
    } else if (a.type === 'insert' && b.type === 'retain') {
      const min = Math.min(a.text.length, b.count)
      result.push({ type: 'insert', text: a.text.slice(0, min) })
      if (a.text.length > min) ops1[i] = { type: 'insert', text: a.text.slice(min) }
      else i++
      if (b.count > min) ops2[j] = { type: 'retain', count: b.count - min }
      else j++
    } else if (a.type === 'insert' && b.type === 'delete') {
      const min = Math.min(a.text.length, b.count)
      if (a.text.length > min) ops1[i] = { type: 'insert', text: a.text.slice(min) }
      else i++
      if (b.count > min) ops2[j] = { type: 'delete', count: b.count - min }
      else j++
    } else if (a.type === 'retain' && b.type === 'delete') {
      const min = Math.min(a.count, b.count)
      result.push({ type: 'delete', count: min })
      if (a.count > min) ops1[i] = { type: 'retain', count: a.count - min }
      else i++
      if (b.count > min) ops2[j] = { type: 'delete', count: b.count - min }
      else j++
    } else {
      i++
      j++
    }
  }

  while (i < ops1.length) { result.push(ops1[i++]) }
  while (j < ops2.length) { result.push(ops2[j++]) }

  return result
}
