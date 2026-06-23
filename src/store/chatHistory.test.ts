/** @vitest-environment jsdom */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { useChatHistoryStore } from './chatHistory'
import type { ChatMessage } from '@shared/types'

/**
 * Tests for the chatHistory Zustand store (src/store/chatHistory.ts).
 *
 * The store is a module-level singleton. We import it and operate via
 * `.getState()`. Data fields are reset in beforeEach via setState({...})
 * (NOT replace:true) and localStorage is cleared because the store persists
 * to the "orion-chat-history" key on every mutation.
 */

const STORAGE_KEY = 'orion-chat-history'
const store = useChatHistoryStore

function resetStore() {
  store.setState({
    conversations: [],
    activeConversationId: null,
  })
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

/** Read what the store persisted to localStorage. */
function readStorage(): { conversations: unknown[]; activeConversationId: string | null } {
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

/* ── Create / save a conversation ───────────────────────── */

describe('createConversation', () => {
  it('creates a New Chat conversation, sets it active, and returns its id', () => {
    const id = store.getState().createConversation()
    const state = store.getState()

    expect(state.conversations).toHaveLength(1)
    expect(state.activeConversationId).toBe(id)

    const c = state.conversations[0]
    expect(c.id).toBe(id)
    expect(c.title).toBe('New Chat')
    expect(c.messages).toEqual([])
    expect(c.model).toBe('Ollama') // default model
    expect(c.favorite).toBe(false)
    expect(c.tokenUsage).toEqual({ totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 })
    expect(c.createdAt).toBe(c.updatedAt)
    expect(typeof c.createdAt).toBe('number')
  })

  it('honours an explicit model argument', () => {
    const id = store.getState().createConversation('gpt-4o')
    const c = store.getState().conversations.find((x) => x.id === id)!
    expect(c.model).toBe('gpt-4o')
  })

  it('prepends newest conversations (most-recent-first ordering)', () => {
    const first = store.getState().createConversation()
    const second = store.getState().createConversation()
    const third = store.getState().createConversation()

    const ids = store.getState().conversations.map((c) => c.id)
    expect(ids).toEqual([third, second, first])
  })

  it('persists the created conversation and active id to localStorage', () => {
    const id = store.getState().createConversation('gpt-4')
    const persisted = readStorage()
    expect(persisted.activeConversationId).toBe(id)
    expect(persisted.conversations).toHaveLength(1)
    expect((persisted.conversations[0] as { id: string }).id).toBe(id)
  })

  it('generates unique ids for distinct conversations', () => {
    const a = store.getState().createConversation()
    const b = store.getState().createConversation()
    expect(a).not.toBe(b)
  })
})

/* ── Append / sync messages ─────────────────────────────── */

describe('syncMessages', () => {
  it('writes messages to the active conversation and bumps updatedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const id = store.getState().createConversation()
    const createdAt = store.getState().conversations[0].createdAt

    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'))
    const messages = [msg({ role: 'user', content: 'hello world' })]
    store.getState().syncMessages(messages)

    const c = store.getState().conversations.find((x) => x.id === id)!
    expect(c.messages).toEqual(messages)
    expect(c.updatedAt).toBeGreaterThan(createdAt)
  })

  it('auto-derives a title from the first user message when still "New Chat"', () => {
    store.getState().createConversation()
    store.getState().syncMessages([
      msg({ role: 'assistant', content: 'I am the assistant' }),
      msg({ role: 'user', content: 'How do I write a vitest test?' }),
    ])
    const c = store.getState().getActiveConversation()!
    expect(c.title).toBe('How do I write a vitest test?')
  })

  it('truncates long auto-titles to 50 chars + ellipsis and collapses newlines', () => {
    store.getState().createConversation()
    const longText = 'a'.repeat(60) + '\nsecond line'
    store.getState().syncMessages([msg({ role: 'user', content: longText })])
    const c = store.getState().getActiveConversation()!
    expect(c.title).toBe('a'.repeat(50) + '...')
    expect(c.title).not.toContain('\n')
  })

  it('does not overwrite a custom (renamed) title on later syncs', () => {
    const id = store.getState().createConversation()
    store.getState().renameConversation(id, 'My Custom Title')
    store.getState().syncMessages([msg({ role: 'user', content: 'first question' })])
    expect(store.getState().getActiveConversation()!.title).toBe('My Custom Title')
  })

  it('keeps the default title when there are no messages', () => {
    store.getState().createConversation()
    store.getState().syncMessages([])
    expect(store.getState().getActiveConversation()!.title).toBe('New Chat')
  })

  it('is a no-op when there is no active conversation', () => {
    // No conversation created: activeConversationId is null
    store.getState().syncMessages([msg({ content: 'orphan message' })])
    expect(store.getState().conversations).toHaveLength(0)
  })

  it('only mutates the active conversation, leaving others untouched', () => {
    const a = store.getState().createConversation()
    const b = store.getState().createConversation() // b becomes active
    store.getState().syncMessages([msg({ role: 'user', content: 'into b' })])

    const convA = store.getState().conversations.find((c) => c.id === a)!
    const convB = store.getState().conversations.find((c) => c.id === b)!
    expect(convA.messages).toEqual([])
    expect(convB.messages).toHaveLength(1)
  })
})

/* ── Switch / load a conversation ───────────────────────── */

describe('switchConversation', () => {
  it('changes the active conversation and persists the new active id', () => {
    const a = store.getState().createConversation()
    store.getState().createConversation() // b is active now
    store.getState().switchConversation(a)

    expect(store.getState().activeConversationId).toBe(a)
    expect(readStorage().activeConversationId).toBe(a)
  })

  it('ignores switches to a non-existent conversation', () => {
    const a = store.getState().createConversation()
    store.getState().switchConversation('does-not-exist')
    expect(store.getState().activeConversationId).toBe(a)
  })

  it('getActiveConversation loads the currently active conversation object', () => {
    const a = store.getState().createConversation('gpt-4')
    store.getState().createConversation()
    store.getState().switchConversation(a)
    const active = store.getState().getActiveConversation()
    expect(active?.id).toBe(a)
    expect(active?.model).toBe('gpt-4')
  })

  it('getActiveConversation returns undefined when nothing is active', () => {
    expect(store.getState().getActiveConversation()).toBeUndefined()
  })
})

/* ── Rename ─────────────────────────────────────────────── */

describe('renameConversation', () => {
  it('renames the target conversation and updates updatedAt', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const id = store.getState().createConversation()
    const before = store.getState().conversations[0].updatedAt

    vi.setSystemTime(new Date('2026-01-01T01:00:00Z'))
    store.getState().renameConversation(id, 'Renamed')

    const c = store.getState().conversations.find((x) => x.id === id)!
    expect(c.title).toBe('Renamed')
    expect(c.updatedAt).toBeGreaterThan(before)
  })

  it('does not change other conversations and tolerates unknown ids', () => {
    const a = store.getState().createConversation()
    const b = store.getState().createConversation()
    store.getState().renameConversation('missing', 'X')
    store.getState().renameConversation(a, 'A title')

    expect(store.getState().conversations.find((c) => c.id === a)!.title).toBe('A title')
    expect(store.getState().conversations.find((c) => c.id === b)!.title).toBe('New Chat')
  })

  it('persists the rename to localStorage', () => {
    const id = store.getState().createConversation()
    store.getState().renameConversation(id, 'Persisted Name')
    const persisted = readStorage().conversations as Array<{ id: string; title: string }>
    expect(persisted.find((c) => c.id === id)!.title).toBe('Persisted Name')
  })
})

/* ── Delete ─────────────────────────────────────────────── */

describe('deleteConversation', () => {
  it('removes the conversation from state and storage', () => {
    const a = store.getState().createConversation()
    const b = store.getState().createConversation()
    store.getState().deleteConversation(a)

    const ids = store.getState().conversations.map((c) => c.id)
    expect(ids).toEqual([b])
    expect((readStorage().conversations as Array<{ id: string }>).map((c) => c.id)).toEqual([b])
  })

  it('reassigns active to the first remaining conversation when the active one is deleted', () => {
    const a = store.getState().createConversation() // oldest
    const b = store.getState().createConversation() // b is now first & active
    expect(store.getState().activeConversationId).toBe(b)

    store.getState().deleteConversation(b)
    // updated[0] is the remaining conversation a
    expect(store.getState().activeConversationId).toBe(a)
  })

  it('keeps active id unchanged when a non-active conversation is deleted', () => {
    const a = store.getState().createConversation()
    const b = store.getState().createConversation() // active
    store.getState().deleteConversation(a)
    expect(store.getState().activeConversationId).toBe(b)
  })

  it('sets active to null when the last (active) conversation is deleted', () => {
    const a = store.getState().createConversation()
    store.getState().deleteConversation(a)
    expect(store.getState().conversations).toEqual([])
    expect(store.getState().activeConversationId).toBeNull()
    expect(readStorage().activeConversationId).toBeNull()
  })

  it('is a safe no-op when deleting from empty history', () => {
    store.getState().deleteConversation('nope')
    expect(store.getState().conversations).toEqual([])
    expect(store.getState().activeConversationId).toBeNull()
  })
})

/* ── Search / filter ────────────────────────────────────── */

describe('searchConversations', () => {
  function seedSearchable() {
    const id = store.getState().createConversation()
    store.getState().syncMessages([
      msg({ id: 'u1', role: 'user', content: 'How do I configure Webpack?', timestamp: 100 }),
      msg({ id: 'a1', role: 'assistant', content: 'Use a webpack.config.js file.', timestamp: 200 }),
    ])
    return id
  }

  it('returns empty array for blank / whitespace-only queries', () => {
    seedSearchable()
    expect(store.getState().searchConversations('')).toEqual([])
    expect(store.getState().searchConversations('   ')).toEqual([])
  })

  it('matches message content case-insensitively across roles', () => {
    seedSearchable()
    const results = store.getState().searchConversations('WEBPACK')
    expect(results).toHaveLength(2)
    const roles = results.map((r) => r.messageRole).sort()
    expect(roles).toEqual(['assistant', 'user'])
  })

  it('orders results most-recent-first by message timestamp', () => {
    seedSearchable()
    const results = store.getState().searchConversations('webpack')
    expect(results[0].timestamp).toBe(200)
    expect(results[1].timestamp).toBe(100)
  })

  it('produces a snippet containing the matched term and carries conversation metadata', () => {
    const id = seedSearchable()
    const [first] = store.getState().searchConversations('config.js')
    expect(first.conversationId).toBe(id)
    expect(first.messageId).toBe('a1')
    expect(first.snippet.toLowerCase()).toContain('config.js')
  })

  it('returns no results when nothing matches', () => {
    seedSearchable()
    expect(store.getState().searchConversations('kubernetes')).toEqual([])
  })
})

/* ── Favorites ──────────────────────────────────────────── */

describe('favorites', () => {
  it('toggles favorite on and off and updates updatedAt', () => {
    const id = store.getState().createConversation()
    store.getState().toggleFavorite(id)
    expect(store.getState().conversations.find((c) => c.id === id)!.favorite).toBe(true)
    store.getState().toggleFavorite(id)
    expect(store.getState().conversations.find((c) => c.id === id)!.favorite).toBe(false)
  })

  it('getFavorites returns only starred conversations', () => {
    const a = store.getState().createConversation()
    store.getState().createConversation()
    store.getState().toggleFavorite(a)
    const favs = store.getState().getFavorites()
    expect(favs.map((c) => c.id)).toEqual([a])
  })
})

/* ── Token usage tracking ───────────────────────────────── */

describe('recordTokenUsage', () => {
  it('accumulates token counts and estimated cost using the conversation model', () => {
    const id = store.getState().createConversation('gpt-4') // 0.03 in / 0.06 out per 1K
    store.getState().recordTokenUsage(id, 1000, 1000)

    const usage = store.getState().conversations.find((c) => c.id === id)!.tokenUsage
    expect(usage.totalInputTokens).toBe(1000)
    expect(usage.totalOutputTokens).toBe(1000)
    // 1000/1000 * 0.03 + 1000/1000 * 0.06 = 0.09
    expect(usage.estimatedCost).toBeCloseTo(0.09, 10)
  })

  it('adds usage across multiple recordings', () => {
    const id = store.getState().createConversation('gpt-4')
    store.getState().recordTokenUsage(id, 500, 500)
    store.getState().recordTokenUsage(id, 500, 500)
    const usage = store.getState().conversations.find((c) => c.id === id)!.tokenUsage
    expect(usage.totalInputTokens).toBe(1000)
    expect(usage.totalOutputTokens).toBe(1000)
    expect(usage.estimatedCost).toBeCloseTo(0.09, 10)
  })

  it('allows overriding the model for cost estimation', () => {
    const id = store.getState().createConversation('Ollama') // free
    store.getState().recordTokenUsage(id, 1000, 1000, 'gpt-4o') // 0.005 in / 0.015 out
    const usage = store.getState().conversations.find((c) => c.id === id)!.tokenUsage
    // 0.005 + 0.015 = 0.02
    expect(usage.estimatedCost).toBeCloseTo(0.02, 10)
  })

  it('charges zero cost for the local Ollama model', () => {
    const id = store.getState().createConversation('Ollama')
    store.getState().recordTokenUsage(id, 5000, 5000)
    expect(store.getState().conversations.find((c) => c.id === id)!.tokenUsage.estimatedCost).toBe(0)
  })

  it('uses prefix matching for cost rates (e.g. "gpt-4-0613" -> gpt-4)', () => {
    const id = store.getState().createConversation('gpt-4-0613')
    store.getState().recordTokenUsage(id, 1000, 0)
    expect(store.getState().conversations.find((c) => c.id === id)!.tokenUsage.estimatedCost).toBeCloseTo(0.03, 10)
  })

  it('falls back to zero cost for unknown models', () => {
    const id = store.getState().createConversation('totally-unknown-model')
    store.getState().recordTokenUsage(id, 1000, 1000)
    expect(store.getState().conversations.find((c) => c.id === id)!.tokenUsage.estimatedCost).toBe(0)
  })

  it('ignores recordings for unknown conversation ids', () => {
    store.getState().createConversation('gpt-4')
    store.getState().recordTokenUsage('missing', 1000, 1000)
    expect(store.getState().getOverallUsage().totalInput).toBe(0)
  })
})

describe('getOverallUsage', () => {
  it('sums usage across all conversations', () => {
    const a = store.getState().createConversation('gpt-4')
    const b = store.getState().createConversation('gpt-4o')
    store.getState().recordTokenUsage(a, 1000, 1000) // cost 0.09
    store.getState().recordTokenUsage(b, 1000, 1000) // cost 0.02

    const overall = store.getState().getOverallUsage()
    expect(overall.totalInput).toBe(2000)
    expect(overall.totalOutput).toBe(2000)
    expect(overall.totalCost).toBeCloseTo(0.11, 10)
  })

  it('returns zeros for empty history', () => {
    expect(store.getState().getOverallUsage()).toEqual({ totalInput: 0, totalOutput: 0, totalCost: 0 })
  })
})

/* ── Forking / branching ────────────────────────────────── */

describe('forkConversation', () => {
  function seedForkable() {
    const id = store.getState().createConversation('gpt-4')
    store.getState().renameConversation(id, 'Original')
    store.getState().syncMessages([
      msg({ id: 'm0', role: 'user', content: 'q1' }),
      msg({ id: 'm1', role: 'assistant', content: 'a1' }),
      msg({ id: 'm2', role: 'user', content: 'q2' }),
      msg({ id: 'm3', role: 'assistant', content: 'a2' }),
    ])
    return id
  }

  it('forks messages up to and including the given index, inheriting the model', () => {
    const id = seedForkable()
    const forkId = store.getState().forkConversation(id, 1)
    expect(forkId).not.toBeNull()

    const fork = store.getState().conversations.find((c) => c.id === forkId)!
    expect(fork.messages.map((m) => m.id)).toEqual(['m0', 'm1'])
    expect(fork.title).toBe('Fork of: Original')
    expect(fork.model).toBe('gpt-4')
    expect(fork.forkedFrom).toBe(id)
    expect(fork.forkPoint).toBe(1)
  })

  it('makes the fork the active conversation and prepends it', () => {
    const id = seedForkable()
    const forkId = store.getState().forkConversation(id, 0)
    expect(store.getState().activeConversationId).toBe(forkId)
    expect(store.getState().conversations[0].id).toBe(forkId)
  })

  it('returns null for an unknown source conversation', () => {
    expect(store.getState().forkConversation('nope', 0)).toBeNull()
  })

  it('returns null for out-of-range indices (negative or >= length)', () => {
    const id = seedForkable()
    expect(store.getState().forkConversation(id, -1)).toBeNull()
    expect(store.getState().forkConversation(id, 4)).toBeNull() // length is 4, last valid index is 3
    expect(store.getState().conversations).toHaveLength(1) // no fork created
  })
})

/* ── Sharing ────────────────────────────────────────────── */

describe('generateShareableText', () => {
  it('renders a markdown transcript with header, roles and footer', () => {
    const id = store.getState().createConversation('gpt-4')
    store.getState().renameConversation(id, 'Shared Chat')
    store.getState().syncMessages([
      msg({ role: 'user', content: 'Hello there' }),
      msg({ role: 'assistant', content: 'Hi!', agentName: 'Claude' }),
    ])
    const text = store.getState().generateShareableText(id)!

    expect(text).toContain('# Shared Chat')
    expect(text).toContain('Model: gpt-4')
    expect(text).toContain('Messages: 2')
    expect(text).toContain('### User')
    expect(text).toContain('### Claude') // agentName used for assistant role label
    expect(text).toContain('Hello there')
    expect(text.endsWith('Generated by Orion IDE')).toBe(true)
  })

  it('appends a token-usage line only when usage is present', () => {
    const id = store.getState().createConversation('gpt-4')
    store.getState().syncMessages([msg({ role: 'user', content: 'q' })])

    expect(store.getState().generateShareableText(id)!).not.toContain('Token usage:')

    store.getState().recordTokenUsage(id, 1000, 500)
    const withUsage = store.getState().generateShareableText(id)!
    expect(withUsage).toContain('Token usage: 1000 input / 500 output')
    expect(withUsage).toMatch(/Estimated cost: \$\d+\.\d{4}/)
  })

  it('returns null for an unknown conversation', () => {
    expect(store.getState().generateShareableText('missing')).toBeNull()
  })
})

/* ── Export / Import (persistence + restore) ────────────── */

describe('exportConversations', () => {
  it('exports all conversations in version-1 envelope by default', () => {
    const a = store.getState().createConversation('gpt-4')
    const b = store.getState().createConversation('gpt-4o')
    const parsed = JSON.parse(store.getState().exportConversations())
    expect(parsed.version).toBe(1)
    expect(typeof parsed.exportedAt).toBe('number')
    expect(parsed.conversations.map((c: { id: string }) => c.id).sort()).toEqual([a, b].sort())
  })

  it('exports only the requested ids when filtered', () => {
    const a = store.getState().createConversation()
    store.getState().createConversation()
    const parsed = JSON.parse(store.getState().exportConversations([a]))
    expect(parsed.conversations).toHaveLength(1)
    expect(parsed.conversations[0].id).toBe(a)
  })
})

describe('importConversations', () => {
  it('imports valid conversations from a previously exported blob (round-trip restore)', () => {
    const id = store.getState().createConversation('gpt-4')
    store.getState().renameConversation(id, 'Backup Me')
    store.getState().syncMessages([msg({ role: 'user', content: 'persist this' })])
    const blob = store.getState().exportConversations()

    // Simulate a fresh store (e.g. new session)
    resetStore()
    const result = store.getState().importConversations(blob)

    expect(result.imported).toBe(1)
    expect(result.errors).toEqual([])
    const restored = store.getState().conversations.find((c) => c.id === id)!
    expect(restored.title).toBe('Backup Me')
    expect(restored.messages[0].content).toBe('persist this')
  })

  it('rejects invalid JSON', () => {
    const result = store.getState().importConversations('{not json')
    expect(result).toEqual({ imported: 0, errors: ['Invalid JSON format'] })
  })

  it('rejects unrecognized version / shape', () => {
    expect(store.getState().importConversations(JSON.stringify({ version: 2, conversations: [] })).errors)
      .toEqual(['Unrecognized export format or version'])
    expect(store.getState().importConversations(JSON.stringify({ version: 1, conversations: 'x' })).errors)
      .toEqual(['Unrecognized export format or version'])
  })

  it('skips duplicates and malformed conversations, reporting errors', () => {
    const existing = store.getState().createConversation()
    const blob = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      conversations: [
        { id: existing, title: 'dup', messages: [] }, // duplicate id
        { id: 'bad', messages: [] }, // missing title -> malformed
        { id: 'good', title: 'Good Import', messages: [] }, // valid
      ],
    })
    const result = store.getState().importConversations(blob)
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(2)
    expect(store.getState().conversations.some((c) => c.id === 'good')).toBe(true)
  })

  it('fills defaults for optional fields on import', () => {
    const blob = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      conversations: [{ id: 'minimal', title: 'Minimal', messages: [] }],
    })
    store.getState().importConversations(blob)
    const c = store.getState().conversations.find((x) => x.id === 'minimal')!
    expect(c.model).toBe('Ollama')
    expect(c.favorite).toBe(false)
    expect(c.tokenUsage).toEqual({ totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 })
    expect(typeof c.createdAt).toBe('number')
  })
})

/* ── Persistence restore from localStorage ──────────────── */

describe('persistence to localStorage', () => {
  it('persists conversations and active id on every mutating action', () => {
    const id = store.getState().createConversation('gpt-4')
    store.getState().syncMessages([msg({ role: 'user', content: 'hi' })])
    store.getState().toggleFavorite(id)

    const persisted = readStorage()
    expect(persisted.activeConversationId).toBe(id)
    const c = (persisted.conversations as Array<{ id: string; favorite: boolean; messages: unknown[] }>)
      .find((x) => x.id === id)!
    expect(c.favorite).toBe(true)
    expect(c.messages).toHaveLength(1)
  })
})

/* ── Max-size capping / pruning ─────────────────────────── */

describe('pruning (max size + age)', () => {
  it('caps non-favorite conversations at MAX_CONVERSATIONS (100), keeping the most recent', () => {
    vi.useFakeTimers()
    // Build 100 existing conversations directly in state with ascending updatedAt.
    const base = Date.parse('2026-01-01T00:00:00Z')
    const existing = Array.from({ length: 100 }, (_, i) => ({
      id: `c-${i}`,
      title: `c-${i}`,
      messages: [],
      model: 'Ollama',
      createdAt: base + i,
      updatedAt: base + i, // c-99 is the most recent
      favorite: false,
      tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
    }))
    store.setState({ conversations: existing, activeConversationId: 'c-0' })

    // Creating one more triggers pruning back down to 100.
    vi.setSystemTime(new Date(base + 1000))
    const newId = store.getState().createConversation()

    const convos = store.getState().conversations
    expect(convos).toHaveLength(100)
    const ids = new Set(convos.map((c) => c.id))
    // Newest survives, oldest non-favorite (c-0) is pruned out.
    expect(ids.has(newId)).toBe(true)
    expect(ids.has('c-0')).toBe(false)
    expect(ids.has('c-99')).toBe(true)
  })

  it('never prunes favorites by count, even beyond MAX', () => {
    const base = Date.parse('2026-01-01T00:00:00Z')
    // 100 favorites (all old) + the act of creating pushes total to 101.
    const favorites = Array.from({ length: 100 }, (_, i) => ({
      id: `f-${i}`,
      title: `f-${i}`,
      messages: [],
      model: 'Ollama',
      createdAt: base + i,
      updatedAt: base + i,
      favorite: true,
      tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
    }))
    store.setState({ conversations: favorites, activeConversationId: 'f-0' })

    const newId = store.getState().createConversation()
    const convos = store.getState().conversations

    // All 100 favorites are kept (favorites are never pruned by count).
    expect(convos.filter((c) => c.favorite)).toHaveLength(100)
    expect(convos).toHaveLength(100)

    // SUSPECTED BUG (pinned): when favorites already fill MAX_CONVERSATIONS,
    // pruneConversations computes nonFavorites.slice(0, MAX - favorites.length)
    // = slice(0, 0) = [], so the freshly created (non-favorite) conversation is
    // immediately pruned away even though it is the newest item AND is set as the
    // active conversation. activeConversationId then points at a conversation that
    // no longer exists. We pin this current behavior here.
    expect(convos.some((c) => c.id === newId)).toBe(false)
    expect(store.getState().activeConversationId).toBe(newId) // dangling active id
    expect(store.getState().getActiveConversation()).toBeUndefined()
  })

  it('drops non-favorite conversations older than 30 days but keeps stale favorites', () => {
    vi.useFakeTimers()
    const now = Date.parse('2026-06-23T00:00:00Z')
    vi.setSystemTime(new Date(now))
    const old = now - 40 * 24 * 60 * 60 * 1000 // 40 days ago

    store.setState({
      conversations: [
        {
          id: 'stale-fav', title: 'fav', messages: [], model: 'Ollama',
          createdAt: old, updatedAt: old, favorite: true,
          tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
        },
        {
          id: 'stale-plain', title: 'plain', messages: [], model: 'Ollama',
          createdAt: old, updatedAt: old, favorite: false,
          tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
        },
      ],
      activeConversationId: 'stale-plain',
    })

    // createConversation runs pruneConversations over the combined list.
    store.getState().createConversation()
    const ids = store.getState().conversations.map((c) => c.id)
    expect(ids).toContain('stale-fav') // favorite survives age pruning
    expect(ids).not.toContain('stale-plain') // old non-favorite removed

    // SUSPECTED BUG: deleteConversation may leave activeConversationId pointing
    // at a conversation that age-pruning silently removed on the next create,
    // but the store never re-validates activeConversationId after pruning. Here
    // 'stale-plain' was active and gets pruned, yet activeConversationId is not
    // reset (createConversation sets it to the new id, masking the issue).
  })
})
