/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useCollaborationStore,
  transformOT,
  applyOT,
  composeOT,
  type CollaboratorInfo,
  type CursorPosition,
  type SelectionRange,
  type EditOperation,
  type FileVersion,
  type ChatMessage,
  type ConflictInfo,
  type OTOperation,
} from './collaboration'

/*
 * The store keeps a module-private `ws` (WebSocket) plus reconnect/heartbeat
 * timers. Most actions call `ws?.send(...)` which is a no-op while `ws` is null
 * (the default), so presence/edit/chat behaviour can be exercised without a
 * socket. For connect()/disconnect()/reconnect we install a MockWebSocket via
 * vi.stubGlobal and drive the lifecycle callbacks by hand.
 *
 * Note: the real WebSocket fires `onclose` asynchronously after the close
 * handshake, so MockWebSocket.close() deliberately does NOT invoke onclose
 * synchronously — tests trigger it explicitly when they want to model a drop.
 */
class MockWebSocket {
  static instances: MockWebSocket[] = []
  static last(): MockWebSocket {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1]
  }

  url: string
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.closed = true
  }

  // Test helpers
  open() {
    this.onopen?.()
  }
  message(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }
  rawMessage(raw: string) {
    this.onmessage?.({ data: raw })
  }
  drop() {
    this.onclose?.()
  }
  error() {
    this.onerror?.()
  }

  /** Parsed JSON of everything sent, in order. */
  sentJSON(): any[] {
    return this.sent.map((s) => JSON.parse(s))
  }
}

const store = () => useCollaborationStore.getState()

function collaborator(over: Partial<CollaboratorInfo> = {}): CollaboratorInfo {
  return {
    id: 'u1',
    name: 'Alice',
    color: '#ffffff',
    isOnline: true,
    lastSeen: 1,
    ...over,
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  // Reset data fields only (no `replace: true`) so action implementations
  // remain intact. Every Map/array/scalar listed in the store interface is
  // restored to its constructor default.
  useCollaborationStore.setState({
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
  })
})

afterEach(() => {
  // disconnect() clears the module-level reconnect/heartbeat timers and nulls
  // out `ws`, preventing leakage between tests.
  store().disconnect()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/* ── Connection lifecycle ──────────────────────────────── */

describe('connect / disconnect lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  })

  it('moves to connecting and records session/user before the socket opens', () => {
    store().connect('ws://srv', 's1', 'me')
    expect(store().connectionState).toBe('connecting')
    expect(store().sessionId).toBe('s1')
    expect(store().userId).toBe('me')
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.last().url).toBe('ws://srv')
  })

  it('transitions to connected and sends a join frame on open', () => {
    store().connect('ws://srv', 's1', 'me')
    MockWebSocket.last().open()

    expect(store().connectionState).toBe('connected')
    const frames = MockWebSocket.last().sentJSON()
    expect(frames[0]).toEqual({ type: 'join', sessionId: 's1', userId: 'me' })
  })

  it('emits heartbeat frames on a 30s interval after opening', () => {
    store().connect('ws://srv', 's1', 'me')
    const sock = MockWebSocket.last()
    sock.open()
    sock.sent = [] // drop the join frame

    vi.advanceTimersByTime(30_000)
    expect(sock.sentJSON()).toEqual([{ type: 'heartbeat' }])
    vi.advanceTimersByTime(60_000)
    expect(sock.sent.filter((s) => s.includes('heartbeat'))).toHaveLength(3)
  })

  it('goes to error state if the WebSocket constructor throws', () => {
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor() {
          throw new Error('boom')
        }
      } as unknown as typeof WebSocket,
    )
    store().connect('ws://srv', 's1', 'me')
    expect(store().connectionState).toBe('error')
  })

  it('sets error state on socket error event', () => {
    store().connect('ws://srv', 's1', 'me')
    MockWebSocket.last().open()
    MockWebSocket.last().error()
    expect(store().connectionState).toBe('error')
  })

  it('schedules a reconnect when the socket drops while not disconnected', () => {
    store().connect('ws://srv', 's1', 'me')
    const first = MockWebSocket.last()
    first.open()
    expect(store().connectionState).toBe('connected')

    first.drop()
    expect(store().connectionState).toBe('reconnecting')
    expect(MockWebSocket.instances).toHaveLength(1)

    // After 3s the reconnect timer fires and opens a fresh socket.
    vi.advanceTimersByTime(3000)
    expect(MockWebSocket.instances).toHaveLength(2)
    expect(store().connectionState).toBe('connecting')
  })

  it('does NOT reconnect when the drop happens after an explicit disconnect', () => {
    store().connect('ws://srv', 's1', 'me')
    const sock = MockWebSocket.last()
    sock.open()
    store().disconnect()
    expect(store().connectionState).toBe('disconnected')

    // A late onclose (real sockets fire it async) must be ignored.
    sock.drop()
    vi.advanceTimersByTime(3000)
    expect(store().connectionState).toBe('disconnected')
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('disconnect resets connection-scoped state and presence maps', () => {
    store().connect('ws://srv', 's1', 'me')
    MockWebSocket.last().open()
    store().addCollaborator(collaborator({ id: 'u2' }))
    store().onRemoteCursor({ collaboratorId: 'u2', filePath: 'a.ts', line: 1, column: 1, timestamp: 1 })

    store().disconnect()
    expect(store().connectionState).toBe('disconnected')
    expect(store().sessionId).toBeNull()
    expect(store().session).toBeNull()
    expect(store().collaborators.size).toBe(0)
    expect(store().cursors.size).toBe(0)
    expect(store().selections.size).toBe(0)
    expect(MockWebSocket.last().closed).toBe(true)
  })
})

/* ── Sessions ──────────────────────────────────────────── */

describe('session management', () => {
  it('createSession builds a session owned by the current user and returns its id', async () => {
    useCollaborationStore.setState({ userId: 'host-1' })
    const id = await store().createSession('My Room')

    expect(id).toMatch(/^session-\d+-[a-z0-9]+$/)
    expect(store().sessionId).toBe(id)
    const s = store().session!
    expect(s.id).toBe(id)
    expect(s.name).toBe('My Room')
    expect(s.hostId).toBe('host-1')
    expect(s.participants).toEqual(['host-1'])
    expect(s.isReadOnly).toBe(false)
    expect(s.maxParticipants).toBe(10)
  })

  it('createSession falls back to empty host id when no user is set', async () => {
    const id = await store().createSession('Anon')
    expect(store().session!.hostId).toBe('')
    expect(store().session!.participants).toEqual([''])
    expect(id).toBeTruthy()
  })

  it('joinSession records the target session id', async () => {
    useCollaborationStore.setState({ userId: 'me' })
    await store().joinSession('remote-session')
    expect(store().sessionId).toBe('remote-session')
  })

  it('leaveSession clears session + presence but keeps connectionState', () => {
    useCollaborationStore.setState({
      sessionId: 's1',
      session: {
        id: 's1', name: 'R', hostId: 'me', createdAt: 1,
        participants: ['me'], isReadOnly: false, maxParticipants: 10,
      },
      connectionState: 'connected',
      collaborators: new Map([['u2', collaborator({ id: 'u2' })]]),
      cursors: new Map([['u2', { collaboratorId: 'u2', filePath: 'a', line: 1, column: 1, timestamp: 1 }]]),
    })

    store().leaveSession()
    expect(store().session).toBeNull()
    expect(store().sessionId).toBeNull()
    expect(store().collaborators.size).toBe(0)
    expect(store().cursors.size).toBe(0)
    expect(store().connectionState).toBe('connected')
  })

  it('setConnectionState sets the raw connection state', () => {
    store().setConnectionState('reconnecting')
    expect(store().connectionState).toBe('reconnecting')
  })
})

/* ── Collaborators / presence roster ───────────────────── */

describe('collaborator roster', () => {
  it('setCollaborators replaces the map and fills missing colors by index', () => {
    store().setCollaborators([
      collaborator({ id: 'a', color: '' }),
      collaborator({ id: 'b', color: '' }),
      collaborator({ id: 'c', color: '#123456' }),
    ])
    expect(store().collaborators.size).toBe(3)
    expect(store().collaborators.get('a')!.color).toBe('#4fc1ff') // index 0
    expect(store().collaborators.get('b')!.color).toBe('#ff6b6b') // index 1
    expect(store().collaborators.get('c')!.color).toBe('#123456') // preserved
  })

  it('addCollaborator assigns a color based on current map size', () => {
    store().addCollaborator(collaborator({ id: 'a', color: '' }))
    store().addCollaborator(collaborator({ id: 'b', color: '' }))
    expect(store().collaborators.get('a')!.color).toBe('#4fc1ff')
    expect(store().collaborators.get('b')!.color).toBe('#ff6b6b')
  })

  it('addCollaborator keeps an explicitly supplied color', () => {
    store().addCollaborator(collaborator({ id: 'a', color: '#abcdef' }))
    expect(store().collaborators.get('a')!.color).toBe('#abcdef')
  })

  it('removeCollaborator drops the roster entry plus their cursor and selection', () => {
    store().addCollaborator(collaborator({ id: 'u2' }))
    store().onRemoteCursor({ collaboratorId: 'u2', filePath: 'a', line: 1, column: 1, timestamp: 1 })
    store().onRemoteSelection({ collaboratorId: 'u2', filePath: 'a', startLine: 1, startColumn: 0, endLine: 2, endColumn: 0, timestamp: 1 })

    store().removeCollaborator('u2')
    expect(store().collaborators.has('u2')).toBe(false)
    expect(store().cursors.has('u2')).toBe(false)
    expect(store().selections.has('u2')).toBe(false)
  })

  it('updateCollaboratorStatus flips online flag and bumps lastSeen', () => {
    store().addCollaborator(collaborator({ id: 'u2', isOnline: true, lastSeen: 1 }))
    store().updateCollaboratorStatus('u2', false)
    const c = store().collaborators.get('u2')!
    expect(c.isOnline).toBe(false)
    expect(c.lastSeen).toBeGreaterThan(1)
  })

  it('updateCollaboratorStatus is a no-op for unknown ids', () => {
    store().updateCollaboratorStatus('ghost', true)
    expect(store().collaborators.has('ghost')).toBe(false)
  })
})

/* ── Cursor / selection sharing ────────────────────────── */

describe('cursor and selection sharing', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
  })

  it('updateCursor sends a cursor frame stamped with the local user id (no local state mutation)', () => {
    useCollaborationStore.setState({ userId: 'me' })
    store().connect('ws://x', 's', 'me')
    MockWebSocket.last().open()
    MockWebSocket.last().sent = []

    store().updateCursor('a.ts', 10, 5)
    const frame = MockWebSocket.last().sentJSON()[0]
    expect(frame.type).toBe('cursor')
    expect(frame.collaboratorId).toBe('me')
    expect(frame.filePath).toBe('a.ts')
    expect(frame.line).toBe(10)
    expect(frame.column).toBe(5)
    // The local user's own cursor is intentionally not stored in `cursors`.
    expect(store().cursors.size).toBe(0)
  })

  it('updateSelection sends a selection frame with the full range', () => {
    useCollaborationStore.setState({ userId: 'me' })
    store().connect('ws://x', 's', 'me')
    MockWebSocket.last().open()
    MockWebSocket.last().sent = []

    store().updateSelection('a.ts', 1, 2, 3, 4)
    const frame = MockWebSocket.last().sentJSON()[0]
    expect(frame).toMatchObject({
      type: 'selection', collaboratorId: 'me', filePath: 'a.ts',
      startLine: 1, startColumn: 2, endLine: 3, endColumn: 4,
    })
  })

  it('onRemoteCursor / onRemoteSelection store the latest position keyed by collaborator', () => {
    const c1: CursorPosition = { collaboratorId: 'u2', filePath: 'a', line: 1, column: 1, timestamp: 1 }
    const c2: CursorPosition = { collaboratorId: 'u2', filePath: 'a', line: 9, column: 9, timestamp: 2 }
    store().onRemoteCursor(c1)
    store().onRemoteCursor(c2)
    expect(store().cursors.size).toBe(1)
    expect(store().cursors.get('u2')).toEqual(c2)

    const s1: SelectionRange = { collaboratorId: 'u2', filePath: 'a', startLine: 1, startColumn: 0, endLine: 1, endColumn: 5, timestamp: 1 }
    store().onRemoteSelection(s1)
    expect(store().selections.get('u2')).toEqual(s1)
  })
})

/* ── Query helpers ─────────────────────────────────────── */

describe('query helpers', () => {
  beforeEach(() => {
    useCollaborationStore.setState({ userId: 'me' })
    store().addCollaborator(collaborator({ id: 'u2', name: 'Bob', color: '#aaa' }))
    store().addCollaborator(collaborator({ id: 'u3', name: 'Carol', color: '#bbb' }))
  })

  it('getCollaboratorColor returns stored color or a neutral default', () => {
    expect(store().getCollaboratorColor('u2')).toBe('#aaa')
    expect(store().getCollaboratorColor('nope')).toBe('#8b949e')
  })

  it('getFileCursors returns other users in the file and excludes the local user', () => {
    store().onRemoteCursor({ collaboratorId: 'u2', filePath: 'a.ts', line: 1, column: 1, timestamp: 1 })
    store().onRemoteCursor({ collaboratorId: 'u3', filePath: 'b.ts', line: 1, column: 1, timestamp: 1 })
    store().onRemoteCursor({ collaboratorId: 'me', filePath: 'a.ts', line: 5, column: 1, timestamp: 1 })

    const inA = store().getFileCursors('a.ts')
    expect(inA.map((c) => c.collaboratorId)).toEqual(['u2'])
  })

  it('getFileSelections filters by file and excludes self', () => {
    store().onRemoteSelection({ collaboratorId: 'u2', filePath: 'a.ts', startLine: 1, startColumn: 0, endLine: 1, endColumn: 2, timestamp: 1 })
    store().onRemoteSelection({ collaboratorId: 'me', filePath: 'a.ts', startLine: 0, startColumn: 0, endLine: 0, endColumn: 0, timestamp: 1 })
    const sel = store().getFileSelections('a.ts')
    expect(sel.map((s) => s.collaboratorId)).toEqual(['u2'])
  })

  it('getCollaboratorsInFile resolves roster entries for cursors in that file', () => {
    store().onRemoteCursor({ collaboratorId: 'u2', filePath: 'a.ts', line: 1, column: 1, timestamp: 1 })
    store().onRemoteCursor({ collaboratorId: 'u3', filePath: 'a.ts', line: 2, column: 1, timestamp: 1 })
    const names = store().getCollaboratorsInFile('a.ts').map((c) => c.name).sort()
    expect(names).toEqual(['Bob', 'Carol'])
  })

  it('getCollaboratorsInFile skips cursors with no matching roster entry', () => {
    store().onRemoteCursor({ collaboratorId: 'unknown', filePath: 'a.ts', line: 1, column: 1, timestamp: 1 })
    expect(store().getCollaboratorsInFile('a.ts')).toEqual([])
  })

  it('isFollowing reflects followMode', () => {
    expect(store().isFollowing()).toBe(false)
    store().setFollowMode('u2')
    expect(store().followMode).toBe('u2')
    expect(store().isFollowing()).toBe(true)
    store().setFollowMode(null)
    expect(store().isFollowing()).toBe(false)
  })
})

/* ── Document edits / versions / conflicts ─────────────── */

describe('document operations', () => {
  it('sendEdit queues a fully-stamped op with version = existing + 1', () => {
    const fv: FileVersion = { filePath: 'a.ts', version: 4, lastModifiedBy: 'x', lastModifiedAt: 1, checksum: 'c' }
    useCollaborationStore.setState({ fileVersions: new Map([['a.ts', fv]]) })

    store().sendEdit({
      collaboratorId: 'me', filePath: 'a.ts', type: 'insert',
      position: { line: 1, column: 0 }, text: 'hi',
    })

    expect(store().pendingOperations).toHaveLength(1)
    const op = store().pendingOperations[0]
    expect(op.id).toMatch(/^op-\d+-[a-z0-9]+$/)
    expect(typeof op.timestamp).toBe('number')
    expect(op.version).toBe(5)
    expect(op.text).toBe('hi')
  })

  it('sendEdit uses version 1 for a previously-unseen file', () => {
    store().sendEdit({
      collaboratorId: 'me', filePath: 'fresh.ts', type: 'insert',
      position: { line: 0, column: 0 }, text: 'x',
    })
    expect(store().pendingOperations[0].version).toBe(1)
  })

  it('onRemoteEdit appends to history and caps it at 1000 entries', () => {
    const seed: EditOperation[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `o${i}`, collaboratorId: 'u2', filePath: 'a.ts', type: 'insert',
      position: { line: 0, column: 0 }, text: 't', timestamp: i, version: i,
    }))
    useCollaborationStore.setState({ operationHistory: seed })

    const fresh: EditOperation = {
      id: 'newest', collaboratorId: 'u2', filePath: 'a.ts', type: 'insert',
      position: { line: 0, column: 0 }, text: 'z', timestamp: 9999, version: 9999,
    }
    store().onRemoteEdit(fresh)

    const hist = store().operationHistory
    expect(hist).toHaveLength(1000)
    expect(hist[hist.length - 1].id).toBe('newest')
    expect(hist[0].id).toBe('o1') // oldest (o0) was dropped by slice(-999)
  })

  it('onRemoteFileVersion and getFileVersion round-trip a version record', () => {
    const fv: FileVersion = { filePath: 'a.ts', version: 7, lastModifiedBy: 'u2', lastModifiedAt: 1, checksum: 'abc' }
    store().onRemoteFileVersion(fv)
    expect(store().getFileVersion('a.ts')).toEqual(fv)
    expect(store().getFileVersion('missing.ts')).toBeUndefined()
  })

  it('resolveConflict removes the matching conflict and leaves others', () => {
    const c1: ConflictInfo = { filePath: 'a.ts', localVersion: 1, remoteVersion: 2, baseVersion: 0, localContent: 'L', remoteContent: 'R' }
    const c2: ConflictInfo = { filePath: 'b.ts', localVersion: 1, remoteVersion: 2, baseVersion: 0, localContent: 'L', remoteContent: 'R' }
    useCollaborationStore.setState({ conflicts: [c1, c2] })

    store().resolveConflict('a.ts', 'local')
    expect(store().conflicts.map((c) => c.filePath)).toEqual(['b.ts'])
  })
})

/* ── Chat ──────────────────────────────────────────────── */

describe('chat', () => {
  it('sendMessage appends an outgoing message using the roster display name', () => {
    useCollaborationStore.setState({ userId: 'me' })
    store().addCollaborator(collaborator({ id: 'me', name: 'Me Myself' }))

    store().sendMessage('hello team')
    const msg = store().chatMessages[0]
    expect(msg.content).toBe('hello team')
    expect(msg.senderId).toBe('me')
    expect(msg.senderName).toBe('Me Myself')
    expect(msg.type).toBe('message')
    expect(msg.id).toMatch(/^chat-/)
  })

  it("sendMessage falls back to 'You' when the sender is not in the roster", () => {
    useCollaborationStore.setState({ userId: 'me' })
    store().sendMessage('hi')
    expect(store().chatMessages[0].senderName).toBe('You')
  })

  it('onChatMessage increments unreadCount only while chat is hidden', () => {
    const m = (id: string): ChatMessage => ({ id, senderId: 'u2', senderName: 'Bob', content: 'c', timestamp: 1, type: 'message' })
    store().onChatMessage(m('1'))
    store().onChatMessage(m('2'))
    expect(store().unreadCount).toBe(2)
    expect(store().chatMessages).toHaveLength(2)

    useCollaborationStore.setState({ showChat: true })
    store().onChatMessage(m('3'))
    expect(store().unreadCount).toBe(2) // no increment while visible
    expect(store().chatMessages).toHaveLength(3)
  })

  it('markChatRead zeroes the unread count', () => {
    useCollaborationStore.setState({ unreadCount: 5 })
    store().markChatRead()
    expect(store().unreadCount).toBe(0)
  })
})

/* ── Settings toggles ──────────────────────────────────── */

describe('settings toggles', () => {
  it('toggleCursors / toggleSelections flip their booleans', () => {
    expect(store().showCursors).toBe(true)
    store().toggleCursors()
    expect(store().showCursors).toBe(false)

    expect(store().showSelections).toBe(true)
    store().toggleSelections()
    expect(store().showSelections).toBe(false)
  })

  it('toggleChat clears unread when opening and preserves it when closing', () => {
    useCollaborationStore.setState({ showChat: false, unreadCount: 4 })
    store().toggleChat() // open
    expect(store().showChat).toBe(true)
    expect(store().unreadCount).toBe(0)

    useCollaborationStore.setState({ unreadCount: 3 })
    store().toggleChat() // close
    expect(store().showChat).toBe(false)
    expect(store().unreadCount).toBe(3) // preserved on close
  })
})

/* ── Server message routing (integration via socket) ───── */

describe('handleServerMessage routing', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    useCollaborationStore.setState({ userId: 'me' })
    store().connect('ws://x', 's', 'me')
    MockWebSocket.last().open()
  })

  it("'participants' replaces the roster", () => {
    MockWebSocket.last().message({
      type: 'participants',
      collaborators: [collaborator({ id: 'u2', color: '' }), collaborator({ id: 'u3', color: '' })],
    })
    expect(store().collaborators.size).toBe(2)
    expect(store().collaborators.get('u2')!.color).toBe('#4fc1ff')
  })

  it("'join' adds the collaborator and posts a system chat message", () => {
    MockWebSocket.last().message({ type: 'join', collaborator: collaborator({ id: 'u2', name: 'Bob' }) })
    expect(store().collaborators.has('u2')).toBe(true)
    const last = store().chatMessages[store().chatMessages.length - 1]
    expect(last.type).toBe('system')
    expect(last.content).toContain('Bob joined')
  })

  it("'leave' removes the collaborator", () => {
    store().addCollaborator(collaborator({ id: 'u2' }))
    MockWebSocket.last().message({ type: 'leave', userId: 'u2' })
    expect(store().collaborators.has('u2')).toBe(false)
  })

  it("'cursor' and 'selection' route to remote presence handlers", () => {
    MockWebSocket.last().message({ type: 'cursor', collaboratorId: 'u2', filePath: 'a', line: 3, column: 2, timestamp: 1 })
    expect(store().cursors.get('u2')!.line).toBe(3)
    MockWebSocket.last().message({ type: 'selection', collaboratorId: 'u2', filePath: 'a', startLine: 1, startColumn: 0, endLine: 2, endColumn: 0, timestamp: 1 })
    expect(store().selections.has('u2')).toBe(true)
  })

  it("'edit' appends to operation history", () => {
    MockWebSocket.last().message({
      type: 'edit',
      operation: { id: 'r1', collaboratorId: 'u2', filePath: 'a', type: 'insert', position: { line: 0, column: 0 }, text: 'x', timestamp: 1, version: 1 },
    })
    expect(store().operationHistory.map((o) => o.id)).toEqual(['r1'])
  })

  it("'fileVersion' updates the version map", () => {
    MockWebSocket.last().message({
      type: 'fileVersion',
      version: { filePath: 'a.ts', version: 2, lastModifiedBy: 'u2', lastModifiedAt: 1, checksum: 'c' },
    })
    expect(store().getFileVersion('a.ts')!.version).toBe(2)
  })

  it("'conflict' appends to the conflict list", () => {
    MockWebSocket.last().message({
      type: 'conflict',
      conflict: { filePath: 'a.ts', localVersion: 1, remoteVersion: 2, baseVersion: 0, localContent: 'L', remoteContent: 'R' },
    })
    expect(store().conflicts).toHaveLength(1)
    expect(store().conflicts[0].filePath).toBe('a.ts')
  })

  it("'chat' routes through onChatMessage (counts as unread while hidden)", () => {
    MockWebSocket.last().message({ type: 'chat', message: { id: 'c1', senderId: 'u2', senderName: 'Bob', content: 'hey', timestamp: 1, type: 'message' } })
    expect(store().chatMessages.some((m) => m.id === 'c1')).toBe(true)
    expect(store().unreadCount).toBe(1)
  })

  it("'session' replaces the active session", () => {
    MockWebSocket.last().message({
      type: 'session',
      session: { id: 's9', name: 'Remote', hostId: 'u2', createdAt: 1, participants: ['u2'], isReadOnly: true, maxParticipants: 5 },
    })
    expect(store().session!.id).toBe('s9')
    expect(store().session!.isReadOnly).toBe(true)
  })

  it("'status' updates collaborator online state", () => {
    store().addCollaborator(collaborator({ id: 'u2', isOnline: true }))
    MockWebSocket.last().message({ type: 'status', userId: 'u2', isOnline: false })
    expect(store().collaborators.get('u2')!.isOnline).toBe(false)
  })

  it('ignores malformed JSON and unknown message types without throwing', () => {
    expect(() => MockWebSocket.last().rawMessage('not json{')).not.toThrow()
    expect(() => MockWebSocket.last().message({ type: 'mystery' })).not.toThrow()
  })
})

/* ── Operational Transform primitives ──────────────────── */

describe('applyOT', () => {
  it('retains, inserts, deletes, and appends trailing content', () => {
    const ops: OTOperation[] = [
      { type: 'retain', count: 2 },
      { type: 'insert', text: 'X' },
      { type: 'delete', count: 1 },
      { type: 'retain', count: 1 },
    ]
    // "hello": retain "he", insert "X", delete "l", retain "l" -> "heXl", then
    // trailing "o" appended.
    expect(applyOT('hello', ops)).toBe('heXlo')
  })

  it('returns the original string for an empty op list', () => {
    expect(applyOT('abc', [])).toBe('abc')
  })
})

describe('transformOT', () => {
  it('serializes two concurrent inserts so both apply and converge', () => {
    const a: OTOperation[] = [{ type: 'insert', text: 'a' }]
    const b: OTOperation[] = [{ type: 'insert', text: 'b' }]
    const [a2, b2] = transformOT(a, b)

    // Both paths from the empty doc must reach the same result.
    const viaA = applyOT(applyOT('', a), b2)
    const viaB = applyOT(applyOT('', b), a2)
    expect(viaA).toBe(viaB)
    expect(viaA).toBe('ab')
  })

  it('splits a longer retain against a shorter one without losing length', () => {
    const a: OTOperation[] = [{ type: 'retain', count: 5 }]
    const b: OTOperation[] = [{ type: 'retain', count: 2 }, { type: 'insert', text: 'Z' }]
    const [a2, b2] = transformOT(a, b)
    const viaA = applyOT(applyOT('hello', a), b2)
    const viaB = applyOT(applyOT('hello', b), a2)
    expect(viaA).toBe(viaB)
  })
})

describe('composeOT', () => {
  it('passes an insert through a retain', () => {
    const ops1: OTOperation[] = [{ type: 'insert', text: 'ab' }]
    const ops2: OTOperation[] = [{ type: 'retain', count: 2 }]
    expect(composeOT(ops1, ops2)).toEqual([{ type: 'insert', text: 'ab' }])
  })

  it('composes a retain-then-insert with a delete-then-retain', () => {
    // op1 inserts "XY" then keeps 3 chars; op2 deletes the first char then keeps 4.
    const base = 'abc'
    // SUSPECTED BUG: composeOT mutates its input arrays in place (e.g.
    // `ops1[i] = ...`), so the sequential reference MUST be computed on fresh
    // copies *before* calling composeOT, otherwise the inputs are clobbered.
    const sequential = applyOT(
      applyOT(base, [{ type: 'insert', text: 'XY' }, { type: 'retain', count: 3 }]),
      [{ type: 'delete', count: 1 }, { type: 'retain', count: 4 }],
    )
    const ops1: OTOperation[] = [{ type: 'insert', text: 'XY' }, { type: 'retain', count: 3 }]
    const ops2: OTOperation[] = [{ type: 'delete', count: 1 }, { type: 'retain', count: 4 }]
    const composed = composeOT(ops1, ops2)
    // Applying the composition to a base must equal applying ops1 then ops2.
    expect(sequential).toBe('Yabc')
    expect(applyOT(base, composed)).toBe(sequential)
  })

  it('does not mutate its input arrays (pure function)', () => {
    const ops1: OTOperation[] = [{ type: 'insert', text: 'XY' }, { type: 'retain', count: 3 }]
    const ops2: OTOperation[] = [{ type: 'delete', count: 1 }, { type: 'retain', count: 4 }]
    composeOT(ops1, ops2)
    // Inputs are left untouched so the caller can safely reuse them.
    expect(ops1).toEqual([{ type: 'insert', text: 'XY' }, { type: 'retain', count: 3 }])
    expect(ops2).toEqual([{ type: 'delete', count: 1 }, { type: 'retain', count: 4 }])
  })

  it('merges adjacent retains into the minimum overlap', () => {
    const ops1: OTOperation[] = [{ type: 'retain', count: 5 }]
    const ops2: OTOperation[] = [{ type: 'retain', count: 5 }]
    expect(composeOT(ops1, ops2)).toEqual([{ type: 'retain', count: 5 }])
  })
})
