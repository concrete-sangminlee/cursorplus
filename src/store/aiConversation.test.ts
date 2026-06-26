/** @vitest-environment jsdom */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useAIConversationStore } from './aiConversation'
import type { ChatMessage } from './aiConversation'

/**
 * Tests for the aiConversation Zustand store (src/store/aiConversation.ts).
 *
 * The store is a module-level singleton wrapped in zustand `persist`. We import
 * it and operate via `.getState()`. The store does NOT reference any IPC /
 * window.api namespace, so nothing IPC-related is mocked.
 *
 * Data fields are reset in beforeEach via setState({...}) (NOT replace:true) and
 * localStorage is cleared because the store persists to the
 * "orion-ai-conversations" key on every mutation.
 *
 * Behavior is *pinned* (characterization tests): we assert what the code
 * currently does, not what it ideally should do. Suspected bugs are flagged in
 * comments and asserted as the current (possibly wrong) behavior.
 */

const STORAGE_KEY = 'orion-ai-conversations'
const store = useAIConversationStore

function resetStore() {
  store.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
    currentStreamContent: '',
    context: { visibleFiles: [], diagnostics: [] },
    defaultModel: 'claude-3.5-sonnet',
    defaultSystemPrompt:
      'You are an expert software engineer. Help the user with their coding tasks. Be concise and provide working code.',
  })
}

/** Read what the store persisted to localStorage. */
function readStorage(): {
  state: {
    conversations: any[]
    defaultModel: string
    defaultSystemPrompt: string
  }
} {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) throw new Error('nothing persisted to localStorage')
  return JSON.parse(raw)
}

beforeEach(() => {
  localStorage.clear()
  resetStore()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ── Conversation management ─────────────────────────────── */

describe('createConversation', () => {
  it('creates a "New Chat" conversation, prepends it, sets it active, and returns its id', () => {
    const id = store.getState().createConversation()
    const s = store.getState()

    expect(s.conversations).toHaveLength(1)
    expect(s.activeConversationId).toBe(id)

    const conv = s.conversations[0]
    expect(conv.id).toBe(id)
    expect(conv.title).toBe('New Chat')
    expect(conv.messages).toEqual([])
    expect(conv.model).toBe('claude-3.5-sonnet') // falls back to defaultModel
    expect(conv.systemPrompt).toBe(s.defaultSystemPrompt)
    expect(conv.contextFiles).toEqual([])
    expect(conv.pinned).toBe(false)
    expect(conv.archived).toBe(false)
    expect(conv.totalTokens).toBe(0)
    expect(conv.tags).toEqual([])
  })

  it('honours an explicit title and model and uses defaultModel only as fallback', () => {
    store.getState().setDefaultModel('default-model')
    const id = store.getState().createConversation('My Chat', 'gpt-4o')
    const conv = store.getState().conversations.find(c => c.id === id)!

    expect(conv.title).toBe('My Chat')
    expect(conv.model).toBe('gpt-4o')
  })

  it('prepends newer conversations (most-recent-first ordering)', () => {
    const first = store.getState().createConversation('first')
    const second = store.getState().createConversation('second')

    const ids = store.getState().conversations.map(c => c.id)
    expect(ids).toEqual([second, first])
  })
})

describe('deleteConversation', () => {
  it('removes the conversation and clears activeConversationId when it was active', () => {
    const id = store.getState().createConversation()
    store.getState().deleteConversation(id)

    expect(store.getState().conversations).toHaveLength(0)
    expect(store.getState().activeConversationId).toBeNull()
  })

  it('keeps activeConversationId when deleting a different conversation', () => {
    const keep = store.getState().createConversation('keep')
    const drop = store.getState().createConversation('drop')
    // `keep` is no longer active (drop became active), force active back to keep
    store.getState().setActiveConversation(keep)

    store.getState().deleteConversation(drop)

    expect(store.getState().conversations.map(c => c.id)).toEqual([keep])
    expect(store.getState().activeConversationId).toBe(keep)
  })
})

describe('archiveConversation', () => {
  it('toggles the archived flag on each call', () => {
    const id = store.getState().createConversation()
    expect(store.getState().conversations[0].archived).toBe(false)

    store.getState().archiveConversation(id)
    expect(store.getState().conversations[0].archived).toBe(true)

    store.getState().archiveConversation(id)
    expect(store.getState().conversations[0].archived).toBe(false)
  })
})

describe('renameConversation', () => {
  it('updates the title and bumps updatedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const id = store.getState().createConversation('old')
    const createdAt = store.getState().conversations[0].createdAt

    vi.setSystemTime(5_000)
    store.getState().renameConversation(id, 'new')

    const conv = store.getState().conversations[0]
    expect(conv.title).toBe('new')
    expect(conv.updatedAt).toBe(5_000)
    expect(conv.createdAt).toBe(createdAt) // createdAt unchanged
  })
})

describe('duplicateConversation', () => {
  it('returns "" and does nothing for an unknown id', () => {
    const newId = store.getState().duplicateConversation('does-not-exist')
    expect(newId).toBe('')
    expect(store.getState().conversations).toHaveLength(0)
  })

  it('duplicates a conversation with "(copy)" title, fresh id, unpinned, and active', () => {
    const id = store.getState().createConversation('Original')
    store.getState().pinConversation(id)
    // assistant role → does not trigger auto-titling, keeps "Original"
    store.getState().addMessage(id, { role: 'assistant', content: 'hi' })

    const newId = store.getState().duplicateConversation(id)
    expect(newId).not.toBe('')
    expect(newId).not.toBe(id)

    const dup = store.getState().conversations.find(c => c.id === newId)!
    expect(dup.title).toBe('Original (copy)')
    expect(dup.pinned).toBe(false) // copies are never pinned
    expect(store.getState().activeConversationId).toBe(newId)
    // Messages are carried over.
    expect(dup.messages.map(m => m.content)).toEqual(['hi'])
  })

  it('gives the duplicate an independent messages array (same contents, different reference)', () => {
    const id = store.getState().createConversation('Original')
    store.getState().addMessage(id, { role: 'assistant', content: 'hi' })
    const newId = store.getState().duplicateConversation(id)

    const orig = store.getState().conversations.find(c => c.id === id)!
    const dup = store.getState().conversations.find(c => c.id === newId)!
    expect(dup.messages).not.toBe(orig.messages)
    expect(dup.messages).toEqual(orig.messages)
  })
})

describe('pin / unpin', () => {
  it('sets and clears the pinned flag', () => {
    const id = store.getState().createConversation()
    store.getState().pinConversation(id)
    expect(store.getState().conversations[0].pinned).toBe(true)

    store.getState().unpinConversation(id)
    expect(store.getState().conversations[0].pinned).toBe(false)
  })
})

describe('tagConversation', () => {
  it('replaces the tags array wholesale', () => {
    const id = store.getState().createConversation()
    store.getState().tagConversation(id, ['a', 'b'])
    expect(store.getState().conversations[0].tags).toEqual(['a', 'b'])

    store.getState().tagConversation(id, ['c'])
    expect(store.getState().conversations[0].tags).toEqual(['c'])
  })
})

describe('clearAll', () => {
  it('wipes all conversations and the active id but keeps settings', () => {
    store.getState().createConversation()
    store.getState().setDefaultModel('keep-me')

    store.getState().clearAll()

    expect(store.getState().conversations).toEqual([])
    expect(store.getState().activeConversationId).toBeNull()
    expect(store.getState().defaultModel).toBe('keep-me')
  })
})

/* ── Messages ────────────────────────────────────────────── */

describe('addMessage', () => {
  it('appends a message with generated id + timestamp and returns the id', () => {
    vi.useFakeTimers()
    vi.setSystemTime(42_000)
    const id = store.getState().createConversation()
    const msgId = store.getState().addMessage(id, { role: 'user', content: 'hello' })

    const msgs = store.getState().conversations[0].messages
    expect(msgs).toHaveLength(1)
    expect(msgs[0].id).toBe(msgId)
    expect(msgs[0].timestamp).toBe(42_000)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toBe('hello')
  })

  it('auto-titles the conversation from the first user message (truncated past 50 chars)', () => {
    const id = store.getState().createConversation()
    const long = 'x'.repeat(60)
    store.getState().addMessage(id, { role: 'user', content: long })

    const conv = store.getState().conversations[0]
    expect(conv.title).toBe('x'.repeat(50) + '...')
  })

  it('does NOT auto-title from the first message when it is an assistant message', () => {
    const id = store.getState().createConversation()
    store.getState().addMessage(id, { role: 'assistant', content: 'I am the assistant' })
    expect(store.getState().conversations[0].title).toBe('New Chat')
  })

  it('does NOT re-title once the conversation already has messages', () => {
    const id = store.getState().createConversation()
    store.getState().addMessage(id, { role: 'user', content: 'first' })
    store.getState().addMessage(id, { role: 'user', content: 'second message that is different' })
    expect(store.getState().conversations[0].title).toBe('first')
  })

  it('accumulates totalTokens from each message tokenCount (missing counts as 0)', () => {
    const id = store.getState().createConversation()
    store.getState().addMessage(id, { role: 'user', content: 'a', tokenCount: 10 })
    store.getState().addMessage(id, { role: 'assistant', content: 'b' }) // no tokenCount
    store.getState().addMessage(id, { role: 'assistant', content: 'c', tokenCount: 5 })

    expect(store.getState().conversations[0].totalTokens).toBe(15)
  })

  it('does not throw and adds nothing for an unknown conversation id', () => {
    const before = store.getState().conversations
    expect(() => store.getState().addMessage('nope', { role: 'user', content: 'x' })).not.toThrow()
    expect(store.getState().conversations).toEqual(before)
  })
})

describe('updateMessage', () => {
  it('merges partial updates into the matching message and bumps updatedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const id = store.getState().createConversation()
    const msgId = store.getState().addMessage(id, { role: 'assistant', content: '' })

    vi.setSystemTime(2_000)
    store.getState().updateMessage(id, msgId, { content: 'done', model: 'gpt-4o' })

    const conv = store.getState().conversations[0]
    const msg = conv.messages.find(m => m.id === msgId)!
    expect(msg.content).toBe('done')
    expect(msg.model).toBe('gpt-4o')
    expect(conv.updatedAt).toBe(2_000)
  })

  it('leaves other messages untouched', () => {
    const id = store.getState().createConversation()
    const a = store.getState().addMessage(id, { role: 'user', content: 'a' })
    const b = store.getState().addMessage(id, { role: 'assistant', content: 'b' })
    store.getState().updateMessage(id, b, { content: 'B!' })

    const msgs = store.getState().conversations[0].messages
    expect(msgs.find(m => m.id === a)!.content).toBe('a')
    expect(msgs.find(m => m.id === b)!.content).toBe('B!')
  })
})

describe('deleteMessage', () => {
  it('removes only the targeted message', () => {
    const id = store.getState().createConversation()
    const a = store.getState().addMessage(id, { role: 'user', content: 'a' })
    const b = store.getState().addMessage(id, { role: 'assistant', content: 'b' })

    store.getState().deleteMessage(id, a)

    const msgs = store.getState().conversations[0].messages
    expect(msgs.map(m => m.id)).toEqual([b])
  })

  it('SUSPECTED BUG: deleteMessage does not refund the message tokens from totalTokens', () => {
    const id = store.getState().createConversation()
    const a = store.getState().addMessage(id, { role: 'user', content: 'a', tokenCount: 10 })
    expect(store.getState().conversations[0].totalTokens).toBe(10)

    store.getState().deleteMessage(id, a)
    // totalTokens stays at 10 even though the only message was removed.
    expect(store.getState().conversations[0].totalTokens).toBe(10)
  })
})

describe('editMessage', () => {
  it('SUSPECTED BUG: stores newContent in editedContent but leaves content unchanged', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().addMessage(id, { role: 'user', content: 'original' })

    store.getState().editMessage(id, msgId, 'edited!')

    const msg = store.getState().conversations[0].messages.find(m => m.id === msgId)!
    // The original content is preserved; only editedContent is set. Consumers
    // must know to prefer editedContent. This is the current behavior.
    expect(msg.content).toBe('original')
    expect(msg.editedContent).toBe('edited!')
  })
})

describe('setMessageFeedback', () => {
  it('sets and clears feedback', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().addMessage(id, { role: 'assistant', content: 'hi' })

    store.getState().setMessageFeedback(id, msgId, 'positive')
    expect(store.getState().conversations[0].messages[0].feedback).toBe('positive')

    store.getState().setMessageFeedback(id, msgId, undefined)
    expect(store.getState().conversations[0].messages[0].feedback).toBeUndefined()
  })
})

/* ── Streaming ───────────────────────────────────────────── */

describe('streaming lifecycle', () => {
  it('startStreaming adds an empty streaming assistant message and flips isStreaming', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().startStreaming(id)

    const s = store.getState()
    expect(s.isStreaming).toBe(true)
    expect(s.currentStreamContent).toBe('')

    const msg = s.conversations[0].messages.find(m => m.id === msgId)!
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('')
    expect(msg.isStreaming).toBe(true)
  })

  it('appendStreamContent accumulates into currentStreamContent without touching the message', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().startStreaming(id)

    store.getState().appendStreamContent('Hello')
    store.getState().appendStreamContent(', world')

    expect(store.getState().currentStreamContent).toBe('Hello, world')
    // The message content is only written on endStreaming.
    const msg = store.getState().conversations[0].messages.find(m => m.id === msgId)!
    expect(msg.content).toBe('')
  })

  it('endStreaming finalizes the message content and resets streaming state', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().startStreaming(id)
    store.getState().appendStreamContent('final answer')

    store.getState().endStreaming(id, msgId)

    const s = store.getState()
    expect(s.isStreaming).toBe(false)
    expect(s.currentStreamContent).toBe('')
    const msg = s.conversations[0].messages.find(m => m.id === msgId)!
    expect(msg.content).toBe('final answer')
    expect(msg.isStreaming).toBe(false)
  })

  it('startStreaming does not auto-title (assistant role) even as the first message', () => {
    const id = store.getState().createConversation()
    store.getState().startStreaming(id)
    expect(store.getState().conversations[0].title).toBe('New Chat')
  })

  it('cancelStreaming resets streaming state but leaves the (empty) message in place', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().startStreaming(id)
    store.getState().appendStreamContent('partial')

    store.getState().cancelStreaming()

    const s = store.getState()
    expect(s.isStreaming).toBe(false)
    expect(s.currentStreamContent).toBe('')
    // The streaming message is NOT removed and stays flagged isStreaming.
    const msg = s.conversations[0].messages.find(m => m.id === msgId)!
    expect(msg.isStreaming).toBe(true)
    expect(msg.content).toBe('')
  })

  /* edge cases */

  it('appendStreamContent works even with no active stream (append to empty)', () => {
    store.getState().appendStreamContent('orphan')
    expect(store.getState().currentStreamContent).toBe('orphan')
    expect(store.getState().isStreaming).toBe(false)
  })

  it('endStreaming without a prior start writes the (empty) currentStreamContent', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().addMessage(id, { role: 'assistant', content: 'preexisting' })

    // No startStreaming/appendStreamContent → currentStreamContent is ''.
    store.getState().endStreaming(id, msgId)

    const msg = store.getState().conversations[0].messages.find(m => m.id === msgId)!
    expect(msg.content).toBe('') // overwrites the previous content with empty string
    expect(msg.isStreaming).toBe(false)
    expect(store.getState().isStreaming).toBe(false)
  })
})

/* ── Context & attachments ───────────────────────────────── */

describe('setContext', () => {
  it('shallow-merges partial context updates', () => {
    store.getState().setContext({ activeFile: '/a.ts', selectedText: 'foo' })
    store.getState().setContext({ activeFile: '/b.ts' })

    const ctx = store.getState().context
    expect(ctx.activeFile).toBe('/b.ts')
    expect(ctx.selectedText).toBe('foo') // preserved across merge
    expect(ctx.visibleFiles).toEqual([]) // untouched default
  })
})

describe('context files', () => {
  it('addContextFile appends and de-duplicates', () => {
    const id = store.getState().createConversation()
    store.getState().addContextFile(id, '/a.ts')
    store.getState().addContextFile(id, '/b.ts')
    store.getState().addContextFile(id, '/a.ts') // dup

    expect(store.getState().conversations[0].contextFiles).toEqual(['/a.ts', '/b.ts'])
  })

  it('removeContextFile removes the matching path only', () => {
    const id = store.getState().createConversation()
    store.getState().addContextFile(id, '/a.ts')
    store.getState().addContextFile(id, '/b.ts')

    store.getState().removeContextFile(id, '/a.ts')
    expect(store.getState().conversations[0].contextFiles).toEqual(['/b.ts'])
  })
})

describe('message attachments', () => {
  it('preserves attachments and codeBlocks attached to a message', () => {
    const id = store.getState().createConversation()
    const msgId = store.getState().addMessage(id, {
      role: 'user',
      content: 'look at this',
      attachments: [{ type: 'file', name: 'a.ts', content: 'export {}' }],
      codeBlocks: [{ language: 'ts', code: 'const x = 1' }],
    })

    const msg = store.getState().conversations[0].messages.find(m => m.id === msgId)!
    expect(msg.attachments).toEqual([{ type: 'file', name: 'a.ts', content: 'export {}' }])
    expect(msg.codeBlocks).toEqual([{ language: 'ts', code: 'const x = 1' }])
  })
})

/* ── Queries ─────────────────────────────────────────────── */

describe('queries', () => {
  it('getActiveConversation returns the active conversation or undefined', () => {
    expect(store.getState().getActiveConversation()).toBeUndefined()
    const id = store.getState().createConversation()
    expect(store.getState().getActiveConversation()!.id).toBe(id)

    store.getState().setActiveConversation(null)
    expect(store.getState().getActiveConversation()).toBeUndefined()
  })

  it('getConversationMessages returns messages or an empty array for unknown id', () => {
    const id = store.getState().createConversation()
    store.getState().addMessage(id, { role: 'user', content: 'x' })
    expect(store.getState().getConversationMessages(id).map(m => m.content)).toEqual(['x'])
    expect(store.getState().getConversationMessages('unknown')).toEqual([])
  })

  it('searchConversations matches title, message content, and tags, excluding archived', () => {
    const byTitle = store.getState().createConversation('TypeScript help')
    const byMsg = store.getState().createConversation('chat two')
    store.getState().addMessage(byMsg, { role: 'user', content: 'how to use zustand' })
    const byTag = store.getState().createConversation('chat three')
    store.getState().tagConversation(byTag, ['zustand-tag'])
    const archived = store.getState().createConversation('zustand archived')
    store.getState().archiveConversation(archived)

    const hits = store.getState().searchConversations('zustand').map(c => c.id)
    expect(hits).toContain(byMsg)
    expect(hits).toContain(byTag)
    expect(hits).not.toContain(byTitle)
    expect(hits).not.toContain(archived) // archived excluded
  })

  it('searchConversations is case-insensitive on the title', () => {
    const id = store.getState().createConversation('HELLO World')
    const hits = store.getState().searchConversations('hello world').map(c => c.id)
    expect(hits).toContain(id)
  })

  it('getRecentConversations sorts by updatedAt desc, excludes archived, respects limit', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const a = store.getState().createConversation('a')
    vi.setSystemTime(2_000)
    const b = store.getState().createConversation('b')
    vi.setSystemTime(3_000)
    const c = store.getState().createConversation('c')

    // Touch `a` so it becomes the most recently updated.
    vi.setSystemTime(4_000)
    store.getState().renameConversation(a, 'a-renamed')

    const recent = store.getState().getRecentConversations().map(x => x.id)
    expect(recent).toEqual([a, c, b])

    const limited = store.getState().getRecentConversations(2).map(x => x.id)
    expect(limited).toEqual([a, c])
  })

  it('getPinnedConversations returns pinned, non-archived conversations only', () => {
    const p1 = store.getState().createConversation('p1')
    store.getState().pinConversation(p1)
    const p2 = store.getState().createConversation('p2')
    store.getState().pinConversation(p2)
    store.getState().archiveConversation(p2) // pinned but archived → excluded
    store.getState().createConversation('unpinned')

    const pinned = store.getState().getPinnedConversations().map(c => c.id)
    expect(pinned).toEqual([p1])
  })

  it('getAllTags returns a sorted, de-duplicated union of tags', () => {
    const a = store.getState().createConversation('a')
    store.getState().tagConversation(a, ['z', 'a'])
    const b = store.getState().createConversation('b')
    store.getState().tagConversation(b, ['a', 'm'])

    expect(store.getState().getAllTags()).toEqual(['a', 'm', 'z'])
  })
})

/* ── Settings ────────────────────────────────────────────── */

describe('settings', () => {
  it('setDefaultModel and setDefaultSystemPrompt update defaults used by new conversations', () => {
    store.getState().setDefaultModel('o3-mini')
    store.getState().setDefaultSystemPrompt('be terse')

    const id = store.getState().createConversation()
    const conv = store.getState().conversations.find(c => c.id === id)!
    expect(conv.model).toBe('o3-mini')
    expect(conv.systemPrompt).toBe('be terse')
  })
})

/* ── Persistence ─────────────────────────────────────────── */

describe('persistence (localStorage "orion-ai-conversations")', () => {
  it('persists conversations and settings after a mutation', () => {
    store.getState().setDefaultModel('persist-model')
    const id = store.getState().createConversation('persisted')
    // assistant role keeps the explicit title (user role would auto-retitle)
    store.getState().addMessage(id, { role: 'assistant', content: 'remember me' })

    const persisted = readStorage().state
    expect(persisted.defaultModel).toBe('persist-model')
    expect(persisted.conversations).toHaveLength(1)
    expect(persisted.conversations[0].title).toBe('persisted')
    expect(persisted.conversations[0].messages[0].content).toBe('remember me')
  })

  it('partialize forces persisted messages to isStreaming:false', () => {
    const id = store.getState().createConversation()
    store.getState().startStreaming(id) // in-memory message has isStreaming:true

    const persistedMsg = readStorage().state.conversations[0].messages[0]
    expect(persistedMsg.isStreaming).toBe(false)
    // but the live in-memory state still has it true
    expect(store.getState().conversations[0].messages[0].isStreaming).toBe(true)
  })

  it('does not persist transient streaming fields (isStreaming / currentStreamContent / context)', () => {
    store.getState().createConversation()
    store.getState().appendStreamContent('transient')

    const persisted = readStorage().state as Record<string, unknown>
    expect(persisted).not.toHaveProperty('isStreaming')
    expect(persisted).not.toHaveProperty('currentStreamContent')
    expect(persisted).not.toHaveProperty('context')
  })
})

/* ── Type-level smoke check (keeps imported type used) ───── */

describe('type wiring', () => {
  it('addMessage accepts a fully-typed ChatMessage payload', () => {
    const id = store.getState().createConversation()
    const payload: Omit<ChatMessage, 'id' | 'timestamp'> = {
      role: 'system',
      content: 'system note',
      model: 'x',
      tokenCount: 3,
    }
    const msgId = store.getState().addMessage(id, payload)
    expect(store.getState().conversations[0].messages.find(m => m.id === msgId)!.role).toBe('system')
  })
})
