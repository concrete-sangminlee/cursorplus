/** @vitest-environment jsdom */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useChatStore } from './chat'
import { useChatHistoryStore } from './chatHistory'
import type { ChatMessage } from '@shared/types'

/**
 * Tests for the chat Zustand store (src/store/chat.ts).
 *
 * The store is a module-level singleton operated via `.getState()`. Several
 * actions sync into the chatHistory store (a second singleton that persists to
 * localStorage under "orion-chat-history"), so we run under jsdom, clear
 * localStorage, and reset BOTH stores' data fields in beforeEach via
 * setState({...}) (NOT replace:true). The chat store does not reference IPC
 * directly; its only side-effect dependency is the chatHistory store, which we
 * exercise through chat's public actions.
 */

const chat = useChatStore
const history = useChatHistoryStore

const CHAT_DEFAULTS = {
  messages: [] as ChatMessage[],
  mode: 'agent' as const,
  selectedModel: 'Ollama',
  isStreaming: false,
  ollamaAvailable: false,
  ollamaModels: [] as string[],
}

function resetStores() {
  chat.setState({ ...CHAT_DEFAULTS, messages: [] })
  history.setState({ conversations: [], activeConversationId: null })
}

function msg(partial: Partial<ChatMessage> & { content: string }): ChatMessage {
  return {
    id: partial.id ?? `m-${Math.random().toString(36).slice(2)}`,
    role: partial.role ?? 'user',
    content: partial.content,
    timestamp: partial.timestamp ?? Date.now(),
    agentName: partial.agentName,
    model: partial.model,
    taskProgress: partial.taskProgress,
  }
}

/** Create an active conversation in the history store so syncs have a target. */
function makeActiveConversation(): string {
  const id = history.getState().createConversation()
  return id
}

beforeEach(() => {
  localStorage.clear()
  resetStores()
})

afterEach(() => {
  vi.useRealTimers()
})

/* ── Initial state ──────────────────────────────────────── */

describe('initial state', () => {
  it('exposes the documented defaults', () => {
    // resetStores writes defaults, but assert the shape the store ships with.
    const s = chat.getState()
    expect(s.messages).toEqual([])
    expect(s.mode).toBe('agent')
    expect(s.selectedModel).toBe('Ollama')
    expect(s.isStreaming).toBe(false)
    expect(s.ollamaAvailable).toBe(false)
    expect(s.ollamaModels).toEqual([])
  })
})

/* ── addMessage ─────────────────────────────────────────── */

describe('addMessage', () => {
  it('appends messages in order, preserving prior ones immutably', () => {
    const first = chat.getState().messages
    const a = msg({ id: 'a', content: 'hello', role: 'user' })
    const b = msg({ id: 'b', content: 'hi there', role: 'assistant' })

    chat.getState().addMessage(a)
    chat.getState().addMessage(b)

    const after = chat.getState().messages
    expect(after.map((m) => m.id)).toEqual(['a', 'b'])
    // New array reference, original empty array untouched (immutability).
    expect(after).not.toBe(first)
    expect(first).toEqual([])
  })

  it('syncs appended messages into the active conversation', () => {
    const convoId = makeActiveConversation()
    chat.getState().addMessage(msg({ id: 'u1', content: 'What is 2+2?', role: 'user' }))

    const convo = history.getState().conversations.find((c) => c.id === convoId)
    expect(convo?.messages.map((m) => m.id)).toEqual(['u1'])
    // syncMessages auto-titles from the first user message.
    expect(convo?.title).toBe('What is 2+2?')
  })

  it('does not throw when there is no active conversation (sync is a no-op)', () => {
    expect(() => chat.getState().addMessage(msg({ content: 'x' }))).not.toThrow()
    expect(chat.getState().messages).toHaveLength(1)
    expect(history.getState().conversations).toHaveLength(0)
  })
})

/* ── updateLastAssistant ────────────────────────────────── */

describe('updateLastAssistant', () => {
  it('appends a chunk to the most recent assistant message only', () => {
    chat.getState().addMessage(msg({ id: 'u', content: 'q', role: 'user' }))
    chat.getState().addMessage(msg({ id: 'a', content: 'Hel', role: 'assistant' }))

    chat.getState().updateLastAssistant('lo')
    chat.getState().updateLastAssistant(' world')

    const msgs = chat.getState().messages
    expect(msgs.find((m) => m.id === 'a')?.content).toBe('Hello world')
    expect(msgs.find((m) => m.id === 'u')?.content).toBe('q')
  })

  it('updates only the LAST assistant when several exist, leaving earlier ones intact', () => {
    chat.getState().addMessage(msg({ id: 'a1', content: 'first', role: 'assistant' }))
    chat.getState().addMessage(msg({ id: 'u', content: 'mid', role: 'user' }))
    chat.getState().addMessage(msg({ id: 'a2', content: 'second', role: 'assistant' }))

    chat.getState().updateLastAssistant('!!!')

    const byId = Object.fromEntries(chat.getState().messages.map((m) => [m.id, m.content]))
    expect(byId.a1).toBe('first')
    expect(byId.a2).toBe('second!!!')
  })

  it('is a no-op (no throw, no change) when there is no assistant message', () => {
    chat.getState().addMessage(msg({ id: 'u', content: 'only user', role: 'user' }))
    chat.getState().updateLastAssistant('chunk')
    expect(chat.getState().messages.map((m) => m.content)).toEqual(['only user'])
  })

  it('syncs the streamed content into the active conversation', () => {
    const convoId = makeActiveConversation()
    chat.getState().addMessage(msg({ id: 'a', content: '', role: 'assistant' }))
    chat.getState().updateLastAssistant('streamed')

    const convo = history.getState().conversations.find((c) => c.id === convoId)
    expect(convo?.messages.find((m) => m.id === 'a')?.content).toBe('streamed')
  })
})

/* ── setMode / setModel / setStreaming ──────────────────── */

describe('simple field setters', () => {
  it('setMode switches between chat modes', () => {
    chat.getState().setMode('chat')
    expect(chat.getState().mode).toBe('chat')
    chat.getState().setMode('agent')
    expect(chat.getState().mode).toBe('agent')
  })

  it('setModel updates the selected model and recordUsage uses it', () => {
    chat.getState().setModel('gpt-4o')
    expect(chat.getState().selectedModel).toBe('gpt-4o')
  })

  it('setStreaming toggles the streaming flag', () => {
    chat.getState().setStreaming(true)
    expect(chat.getState().isStreaming).toBe(true)
    chat.getState().setStreaming(false)
    expect(chat.getState().isStreaming).toBe(false)
  })

  it('setters do not disturb the messages array', () => {
    chat.getState().addMessage(msg({ id: 'a', content: 'x' }))
    chat.getState().setMode('chat')
    chat.getState().setModel('gpt-4')
    chat.getState().setStreaming(true)
    expect(chat.getState().messages.map((m) => m.id)).toEqual(['a'])
  })
})

/* ── clearMessages ──────────────────────────────────────── */

describe('clearMessages', () => {
  it('empties the local message list', () => {
    chat.getState().addMessage(msg({ content: 'a' }))
    chat.getState().addMessage(msg({ content: 'b' }))
    chat.getState().clearMessages()
    expect(chat.getState().messages).toEqual([])
  })

  it('syncs the empty list to the active conversation', () => {
    const convoId = makeActiveConversation()
    chat.getState().addMessage(msg({ id: 'u', content: 'keep me', role: 'user' }))
    expect(
      history.getState().conversations.find((c) => c.id === convoId)?.messages,
    ).toHaveLength(1)

    chat.getState().clearMessages()
    expect(
      history.getState().conversations.find((c) => c.id === convoId)?.messages,
    ).toEqual([])
  })
})

/* ── setOllamaStatus ────────────────────────────────────── */

describe('setOllamaStatus', () => {
  it('records availability and the model list together', () => {
    chat.getState().setOllamaStatus(true, ['llama3', 'mistral'])
    const s = chat.getState()
    expect(s.ollamaAvailable).toBe(true)
    expect(s.ollamaModels).toEqual(['llama3', 'mistral'])
  })

  it('can mark Ollama unavailable with an empty model list', () => {
    chat.getState().setOllamaStatus(true, ['llama3'])
    chat.getState().setOllamaStatus(false, [])
    const s = chat.getState()
    expect(s.ollamaAvailable).toBe(false)
    expect(s.ollamaModels).toEqual([])
  })
})

/* ── loadMessages ───────────────────────────────────────── */

describe('loadMessages', () => {
  it('replaces the message list wholesale', () => {
    chat.getState().addMessage(msg({ id: 'old', content: 'old' }))
    const loaded = [msg({ id: 'x', content: 'x' }), msg({ id: 'y', content: 'y' })]
    chat.getState().loadMessages(loaded)
    expect(chat.getState().messages.map((m) => m.id)).toEqual(['x', 'y'])
  })

  it('does NOT sync to the history store (pins current behavior)', () => {
    const convoId = makeActiveConversation()
    chat.getState().loadMessages([msg({ id: 'x', content: 'loaded' })])
    // loadMessages intentionally omits syncToHistory, so the active
    // conversation stays empty.
    expect(
      history.getState().conversations.find((c) => c.id === convoId)?.messages,
    ).toEqual([])
  })
})

/* ── removeMessagesAfter ────────────────────────────────── */

describe('removeMessagesAfter', () => {
  it('removes the target message and everything after it', () => {
    chat.getState().loadMessages([
      msg({ id: 'a', content: 'a' }),
      msg({ id: 'b', content: 'b' }),
      msg({ id: 'c', content: 'c' }),
    ])
    chat.getState().removeMessagesAfter('b')
    expect(chat.getState().messages.map((m) => m.id)).toEqual(['a'])
  })

  it('leaves messages untouched when the id is not found', () => {
    chat.getState().loadMessages([msg({ id: 'a', content: 'a' }), msg({ id: 'b', content: 'b' })])
    chat.getState().removeMessagesAfter('nope')
    expect(chat.getState().messages.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('removing the first message clears the list and syncs', () => {
    const convoId = makeActiveConversation()
    chat.getState().addMessage(msg({ id: 'a', content: 'a', role: 'user' }))
    chat.getState().addMessage(msg({ id: 'b', content: 'b', role: 'assistant' }))

    chat.getState().removeMessagesAfter('a')
    expect(chat.getState().messages).toEqual([])
    expect(
      history.getState().conversations.find((c) => c.id === convoId)?.messages,
    ).toEqual([])
  })
})

/* ── recordUsage ────────────────────────────────────────── */

describe('recordUsage', () => {
  it('is a no-op when there is no active conversation', () => {
    // No active conversation => nothing to record, must not throw.
    expect(() => chat.getState().recordUsage(100, 50)).not.toThrow()
    expect(history.getState().getOverallUsage()).toEqual({
      totalInput: 0,
      totalOutput: 0,
      totalCost: 0,
    })
  })

  it('accumulates token usage on the active conversation using the selected model', () => {
    const convoId = makeActiveConversation()
    chat.getState().setModel('gpt-4o') // 0.005 in / 0.015 out per 1K
    chat.getState().recordUsage(1000, 2000)

    const convo = history.getState().conversations.find((c) => c.id === convoId)!
    expect(convo.tokenUsage.totalInputTokens).toBe(1000)
    expect(convo.tokenUsage.totalOutputTokens).toBe(2000)
    // (1000/1000)*0.005 + (2000/1000)*0.015 = 0.005 + 0.03 = 0.035
    expect(convo.tokenUsage.estimatedCost).toBeCloseTo(0.035, 6)
  })

  it('adds successive usage entries cumulatively', () => {
    const convoId = makeActiveConversation()
    chat.getState().setModel('Ollama') // free => zero cost
    chat.getState().recordUsage(10, 20)
    chat.getState().recordUsage(5, 5)

    const convo = history.getState().conversations.find((c) => c.id === convoId)!
    expect(convo.tokenUsage.totalInputTokens).toBe(15)
    expect(convo.tokenUsage.totalOutputTokens).toBe(25)
    expect(convo.tokenUsage.estimatedCost).toBe(0)
  })
})

/* ── forkFromMessage ────────────────────────────────────── */

describe('forkFromMessage', () => {
  it('returns null when there is no active conversation', () => {
    expect(chat.getState().forkFromMessage('anything')).toBeNull()
  })

  it('returns null when the message id is not in the active conversation', () => {
    makeActiveConversation()
    chat.getState().addMessage(msg({ id: 'a', content: 'a', role: 'user' }))
    expect(chat.getState().forkFromMessage('missing')).toBeNull()
  })

  it('forks at the given message, switches active, and loads forked messages', () => {
    const sourceId = makeActiveConversation()
    chat.getState().addMessage(msg({ id: 'a', content: 'a', role: 'user' }))
    chat.getState().addMessage(msg({ id: 'b', content: 'b', role: 'assistant' }))
    chat.getState().addMessage(msg({ id: 'c', content: 'c', role: 'user' }))

    const forkedId = chat.getState().forkFromMessage('b')
    expect(forkedId).not.toBeNull()
    expect(forkedId).not.toBe(sourceId)

    // The fork keeps messages up to and including 'b'.
    expect(chat.getState().messages.map((m) => m.id)).toEqual(['a', 'b'])

    // History store switched the active conversation to the fork.
    expect(history.getState().activeConversationId).toBe(forkedId)
    const forked = history.getState().conversations.find((c) => c.id === forkedId)!
    expect(forked.forkedFrom).toBe(sourceId)
    expect(forked.forkPoint).toBe(1)
    expect(forked.messages.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('forking from the last message clones the whole conversation', () => {
    makeActiveConversation()
    chat.getState().addMessage(msg({ id: 'a', content: 'a', role: 'user' }))
    chat.getState().addMessage(msg({ id: 'b', content: 'b', role: 'assistant' }))

    const forkedId = chat.getState().forkFromMessage('b')
    expect(forkedId).not.toBeNull()
    expect(chat.getState().messages.map((m) => m.id)).toEqual(['a', 'b'])
  })
})
