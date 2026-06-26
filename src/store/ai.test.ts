/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAIStore, type AIPreferences, type AIContextEntry } from './ai'

const store = () => useAIStore.getState()

// Mirror of DEFAULT_PREFS in ai.ts (not exported). Used to restore a pristine
// preferences object between tests. Kept in sync with the source manually.
const DEFAULT_PREFS: AIPreferences = {
  defaultModel: 'claude-sonnet-4-6',
  temperature: 0.3,
  maxTokens: 4096,
  streamResponses: true,
  includeFileContext: true,
  includeGitContext: true,
  includeTerminalContext: false,
  maxContextTokens: 8000,
  autoApplyEdits: false,
  showTokenCount: true,
  saveHistory: true,
}

const INITIAL_RECENT_MODELS = ['claude-sonnet-4-6', 'gpt-4o', 'claude-haiku-4-5-20251001']

describe('useAIStore', () => {
  beforeEach(() => {
    localStorage.clear()
    // Reset ONLY data fields. Do NOT use { replace: true } so action
    // implementations stay intact (module-level singleton store).
    useAIStore.setState({
      sessions: [],
      activeSessionId: null,
      preferences: { ...DEFAULT_PREFS },
      isGenerating: false,
      streamContent: '',
      contextEntries: [],
      recentModels: [...INITIAL_RECENT_MODELS],
      totalTokensUsed: 0,
    })
  })

  /* ── Defaults ─────────────────────────────────────── */

  describe('defaults', () => {
    it('exposes the default preferences', () => {
      expect(store().preferences).toEqual(DEFAULT_PREFS)
    })

    it('seeds the recent models list and uses the default model', () => {
      expect(store().recentModels).toEqual(INITIAL_RECENT_MODELS)
      expect(store().preferences.defaultModel).toBe('claude-sonnet-4-6')
    })

    it('starts with no sessions, no active session and zero tokens', () => {
      expect(store().sessions).toEqual([])
      expect(store().activeSessionId).toBeNull()
      expect(store().totalTokensUsed).toBe(0)
      expect(store().isGenerating).toBe(false)
    })
  })

  /* ── Session management ───────────────────────────── */

  describe('session management', () => {
    it('creates a session, makes it active and derives a title from the mode', () => {
      const id = store().createSession('chat')
      expect(id).toMatch(/^ai-session-\d+$/)
      expect(store().activeSessionId).toBe(id)

      const sess = store().sessions[0]
      expect(sess.id).toBe(id)
      expect(sess.title).toBe('Chat Session') // capitalized mode
      expect(sess.mode).toBe('chat')
      expect(sess.status).toBe('idle')
      expect(sess.messages).toEqual([])
      expect(sess.tokenUsage).toEqual({ input: 0, output: 0 })
      // model comes from current default preference
      expect(sess.model).toBe('claude-sonnet-4-6')
    })

    it('honors a custom title', () => {
      const id = store().createSession('edit', 'My Title')
      const sess = store().sessions.find(s => s.id === id)!
      expect(sess.title).toBe('My Title')
    })

    it('snapshots current context entries into the new session', () => {
      store().addContext({ type: 'file', content: 'x', label: 'a', tokenEstimate: 1 })
      const id = store().createSession('chat')
      const sess = store().sessions.find(s => s.id === id)!
      expect(sess.context).toHaveLength(1)
      // It is a copy: clearing global context does not affect the snapshot.
      store().clearContext()
      expect(store().sessions.find(s => s.id === id)!.context).toHaveLength(1)
    })

    it('prepends new sessions and caps the list at 50', () => {
      for (let i = 0; i < 55; i++) store().createSession('chat')
      expect(store().sessions).toHaveLength(50)
      // newest is first
      const first = store().sessions[0]
      const last = store().sessions[49]
      expect(Number(first.id.split('-').pop())).toBeGreaterThan(
        Number(last.id.split('-').pop()),
      )
    })

    it('deletes a session and reassigns active to a remaining session', () => {
      const a = store().createSession('chat')
      const b = store().createSession('chat')
      // b is active (most recent). Delete b -> active falls to another session.
      expect(store().activeSessionId).toBe(b)
      store().deleteSession(b)
      expect(store().sessions.find(s => s.id === b)).toBeUndefined()
      expect(store().activeSessionId).toBe(a)
    })

    it('sets active to null when the last session is deleted', () => {
      const a = store().createSession('chat')
      store().deleteSession(a)
      expect(store().sessions).toHaveLength(0)
      expect(store().activeSessionId).toBeNull()
    })

    it('does not change active session when deleting a non-active session', () => {
      const a = store().createSession('chat')
      const b = store().createSession('chat')
      expect(store().activeSessionId).toBe(b)
      store().deleteSession(a) // a is not active
      expect(store().activeSessionId).toBe(b)
    })

    it('setActiveSession changes the active id', () => {
      const a = store().createSession('chat')
      const b = store().createSession('chat')
      store().setActiveSession(a)
      expect(store().activeSessionId).toBe(a)
      expect(b).not.toBe(a)
    })

    it('renames a session', () => {
      const a = store().createSession('chat')
      store().renameSession(a, 'Renamed')
      expect(store().sessions.find(s => s.id === a)!.title).toBe('Renamed')
    })

    it('clears session messages and resets token usage', () => {
      const a = store().createSession('chat')
      store().addMessage(a, 'user', 'hello')
      store().setActiveSession(a)
      store().addTokenUsage(10, 5)
      expect(store().sessions.find(s => s.id === a)!.messages).toHaveLength(1)
      store().clearSessionMessages(a)
      const sess = store().sessions.find(s => s.id === a)!
      expect(sess.messages).toEqual([])
      expect(sess.tokenUsage).toEqual({ input: 0, output: 0 })
    })
  })

  /* ── Messages ─────────────────────────────────────── */

  describe('messages', () => {
    it('adds a message with estimated token count = ceil(len/4)', () => {
      const a = store().createSession('chat')
      const content = 'abcdefg' // length 7 -> ceil(7/4) = 2
      store().addMessage(a, 'user', content, 'gpt-4o')
      const msg = store().sessions.find(s => s.id === a)!.messages[0]
      expect(msg.role).toBe('user')
      expect(msg.content).toBe(content)
      expect(msg.model).toBe('gpt-4o')
      expect(msg.tokenCount).toBe(2)
      expect(msg.id).toMatch(/^msg-\d+$/)
    })

    it('extracts fenced code blocks from message content', () => {
      const a = store().createSession('chat')
      const content = 'Here:\n```ts\nconst x = 1\n```\nand\n```\nplain\n```'
      store().addMessage(a, 'assistant', content)
      const msg = store().sessions.find(s => s.id === a)!.messages[0]
      expect(msg.codeBlocks).toHaveLength(2)
      expect(msg.codeBlocks![0]).toEqual({ language: 'ts', code: 'const x = 1', applied: false })
      // no language -> 'text'
      expect(msg.codeBlocks![1].language).toBe('text')
      expect(msg.codeBlocks![1].code).toBe('plain')
    })

    it('updateLastMessage replaces content and re-extracts code blocks', () => {
      const a = store().createSession('chat')
      store().addMessage(a, 'assistant', 'old')
      store().updateLastMessage(a, 'new ```js\nfoo\n```')
      const msg = store().sessions.find(s => s.id === a)!.messages[0]
      expect(msg.content).toBe('new ```js\nfoo\n```')
      expect(msg.codeBlocks).toHaveLength(1)
      expect(msg.codeBlocks![0].language).toBe('js')
    })

    it('updateLastMessage is a no-op when the session has no messages', () => {
      const a = store().createSession('chat')
      expect(() => store().updateLastMessage(a, 'x')).not.toThrow()
      expect(store().sessions.find(s => s.id === a)!.messages).toEqual([])
    })

    it('appendToLastMessage concatenates the delta to the last message', () => {
      const a = store().createSession('chat')
      store().addMessage(a, 'assistant', 'foo')
      store().appendToLastMessage(a, 'bar')
      expect(store().sessions.find(s => s.id === a)!.messages[0].content).toBe('foobar')
    })
  })

  /* ── Context ──────────────────────────────────────── */

  describe('context', () => {
    const entry: AIContextEntry = { type: 'file', content: 'c', label: 'l', tokenEstimate: 3 }

    it('adds and removes context entries by index', () => {
      store().addContext({ ...entry, label: 'a' })
      store().addContext({ ...entry, label: 'b' })
      store().addContext({ ...entry, label: 'c' })
      expect(store().contextEntries.map(e => e.label)).toEqual(['a', 'b', 'c'])
      store().removeContext(1)
      expect(store().contextEntries.map(e => e.label)).toEqual(['a', 'c'])
    })

    it('clears all context', () => {
      store().addContext(entry)
      store().clearContext()
      expect(store().contextEntries).toEqual([])
    })

    it('addFileContext derives label from basename and estimates tokens', () => {
      store().addFileContext('C:\\proj\\src\\foo.ts', 'hello world!') // len 12 -> ceil(12/4)=3
      const e = store().contextEntries[0]
      expect(e.type).toBe('file')
      expect(e.path).toBe('C:\\proj\\src\\foo.ts')
      expect(e.label).toBe('foo.ts') // splits on both / and \
      expect(e.content).toBe('hello world!')
      expect(e.tokenEstimate).toBe(3)
    })

    it('addFileContext truncates content longer than 10000 chars', () => {
      const big = 'x'.repeat(10001)
      store().addFileContext('a/b.txt', big)
      const e = store().contextEntries[0]
      expect(e.content).toBe('x'.repeat(10000) + '\n... [truncated]')
      // token estimate uses the truncated length
      expect(e.tokenEstimate).toBe(Math.ceil((10000 + '\n... [truncated]'.length) / 4))
    })

    it('addSelectionContext builds a label with file basename and start line', () => {
      store().addSelectionContext('selected text', 'src/util/x.ts', 42)
      const e = store().contextEntries[0]
      expect(e.type).toBe('selection')
      expect(e.label).toBe('x.ts:42')
      expect(e.tokenEstimate).toBe(Math.ceil('selected text'.length / 4))
    })

    it('getTotalContextTokens sums all token estimates', () => {
      store().addContext({ ...entry, tokenEstimate: 3 })
      store().addContext({ ...entry, tokenEstimate: 7 })
      expect(store().getTotalContextTokens()).toBe(10)
    })
  })

  /* ── Generation state ─────────────────────────────── */

  describe('generation state', () => {
    it('toggles isGenerating', () => {
      store().setGenerating(true)
      expect(store().isGenerating).toBe(true)
      store().setGenerating(false)
      expect(store().isGenerating).toBe(false)
    })

    it('sets and appends stream content', () => {
      store().setStreamContent('Hello')
      expect(store().streamContent).toBe('Hello')
      store().appendStreamContent(' World')
      expect(store().streamContent).toBe('Hello World')
    })

    it('setSessionStatus updates status and optional error', () => {
      const a = store().createSession('chat')
      store().setSessionStatus(a, 'streaming')
      expect(store().sessions.find(s => s.id === a)!.status).toBe('streaming')
      store().setSessionStatus(a, 'error', 'boom')
      const sess = store().sessions.find(s => s.id === a)!
      expect(sess.status).toBe('error')
      expect(sess.error).toBe('boom')
    })

    it('setSessionError forces error status and stores the message', () => {
      const a = store().createSession('chat')
      store().setSessionError(a, 'kaput')
      const sess = store().sessions.find(s => s.id === a)!
      expect(sess.status).toBe('error')
      expect(sess.error).toBe('kaput')
    })
  })

  /* ── Preferences ──────────────────────────────────── */

  describe('preferences', () => {
    it('merges partial preference updates and persists to localStorage', () => {
      store().updatePreferences({ temperature: 0.9, maxTokens: 8192 })
      expect(store().preferences.temperature).toBe(0.9)
      expect(store().preferences.maxTokens).toBe(8192)
      // unchanged fields remain
      expect(store().preferences.streamResponses).toBe(true)

      const persisted = JSON.parse(localStorage.getItem('orion:ai-preferences')!)
      expect(persisted.temperature).toBe(0.9)
      expect(persisted.maxTokens).toBe(8192)
    })

    it('pins CURRENT behavior: temperature is NOT clamped/validated', () => {
      // SUSPECTED ISSUE: updatePreferences performs no range validation.
      // Out-of-range values (e.g. temperature > 2 or < 0) are stored verbatim.
      store().updatePreferences({ temperature: 99 })
      expect(store().preferences.temperature).toBe(99)
      store().updatePreferences({ temperature: -5 })
      expect(store().preferences.temperature).toBe(-5)
    })

    it('setModel updates the default model and bumps it to the front of recentModels (deduped)', () => {
      store().setModel('gpt-4o') // already present -> moves to front, no dupe
      expect(store().preferences.defaultModel).toBe('gpt-4o')
      expect(store().recentModels[0]).toBe('gpt-4o')
      expect(store().recentModels.filter(m => m === 'gpt-4o')).toHaveLength(1)
    })

    it('setModel prepends a brand-new model and caps recentModels at 5', () => {
      store().setModel('model-a')
      store().setModel('model-b')
      store().setModel('model-c')
      expect(store().recentModels[0]).toBe('model-c')
      expect(store().recentModels).toHaveLength(5)
      expect(store().recentModels.length).toBeLessThanOrEqual(5)
    })

    it('setModel persists the new default model to localStorage', () => {
      store().setModel('gpt-4o')
      const persisted = JSON.parse(localStorage.getItem('orion:ai-preferences')!)
      expect(persisted.defaultModel).toBe('gpt-4o')
    })

    it('switching the default model affects only newly created sessions', () => {
      const before = store().createSession('chat')
      store().setModel('gpt-4o')
      const after = store().createSession('chat')
      expect(store().sessions.find(s => s.id === before)!.model).toBe('claude-sonnet-4-6')
      expect(store().sessions.find(s => s.id === after)!.model).toBe('gpt-4o')
    })
  })

  /* ── Persistence + restore ────────────────────────── */

  describe('persistence and restore', () => {
    it('restores merged preferences from localStorage on fresh module load', async () => {
      // Persist a partial preference set, then re-import the module so its
      // initializer (loadPreferences) reads from localStorage.
      localStorage.setItem(
        'orion:ai-preferences',
        JSON.stringify({ temperature: 0.75, defaultModel: 'custom-model' }),
      )
      vi.resetModules()
      const fresh = await import('./ai')
      const prefs = fresh.useAIStore.getState().preferences
      expect(prefs.temperature).toBe(0.75)
      expect(prefs.defaultModel).toBe('custom-model')
      // Missing fields fall back to defaults via the spread merge.
      expect(prefs.maxTokens).toBe(DEFAULT_PREFS.maxTokens)
      expect(prefs.streamResponses).toBe(DEFAULT_PREFS.streamResponses)
    })

    it('falls back to defaults when stored preferences are invalid JSON', async () => {
      localStorage.setItem('orion:ai-preferences', '{not valid json')
      vi.resetModules()
      const fresh = await import('./ai')
      expect(fresh.useAIStore.getState().preferences).toEqual(DEFAULT_PREFS)
    })
  })

  /* ── Token tracking ───────────────────────────────── */

  describe('token tracking', () => {
    it('accumulates total tokens and per-active-session usage', () => {
      const a = store().createSession('chat') // becomes active
      store().addTokenUsage(10, 20)
      store().addTokenUsage(1, 2)
      expect(store().totalTokensUsed).toBe(33) // 30 + 3
      const sess = store().sessions.find(s => s.id === a)!
      expect(sess.tokenUsage).toEqual({ input: 11, output: 22 })
    })

    it('updates total even with no active session, but skips per-session usage', () => {
      // beforeEach leaves activeSessionId null with no sessions.
      expect(store().activeSessionId).toBeNull()
      store().addTokenUsage(5, 5)
      expect(store().totalTokensUsed).toBe(10)
    })
  })

  /* ── Code actions ─────────────────────────────────── */

  describe('code actions', () => {
    it('marks a specific code block as applied', () => {
      const a = store().createSession('chat')
      store().addMessage(a, 'assistant', '```js\none\n```\n```js\ntwo\n```')
      const msgId = store().sessions.find(s => s.id === a)!.messages[0].id
      store().markCodeApplied(a, msgId, 1)
      const blocks = store().sessions.find(s => s.id === a)!.messages[0].codeBlocks!
      expect(blocks[0].applied).toBe(false)
      expect(blocks[1].applied).toBe(true)
    })

    it('markCodeApplied is a no-op for an out-of-range block index', () => {
      const a = store().createSession('chat')
      store().addMessage(a, 'assistant', '```js\none\n```')
      const msgId = store().sessions.find(s => s.id === a)!.messages[0].id
      expect(() => store().markCodeApplied(a, msgId, 99)).not.toThrow()
      expect(store().sessions.find(s => s.id === a)!.messages[0].codeBlocks![0].applied).toBe(false)
    })

    it('addAppliedEdit appends an edit to the last message', () => {
      const a = store().createSession('chat')
      store().addMessage(a, 'assistant', 'change')
      const edit = {
        file: 'x.ts',
        original: 'a',
        modified: 'b',
        applied: true,
        timestamp: 123,
      }
      store().addAppliedEdit(a, edit)
      store().addAppliedEdit(a, { ...edit, original: 'c' })
      const msg = store().sessions.find(s => s.id === a)!.messages[0]
      expect(msg.appliedEdits).toHaveLength(2)
      expect(msg.appliedEdits![0]).toEqual(edit)
    })

    it('addAppliedEdit is a no-op when the session has no messages', () => {
      const a = store().createSession('chat')
      expect(() =>
        store().addAppliedEdit(a, { file: 'x', original: '', modified: '', applied: true, timestamp: 0 }),
      ).not.toThrow()
      expect(store().sessions.find(s => s.id === a)!.messages).toEqual([])
    })
  })

  /* ── Helpers ──────────────────────────────────────── */

  describe('helpers', () => {
    it('getActiveSession returns the active session or undefined', () => {
      expect(store().getActiveSession()).toBeUndefined()
      const a = store().createSession('chat')
      expect(store().getActiveSession()!.id).toBe(a)
    })

    it('getSessionMessages returns messages or an empty array for unknown ids', () => {
      const a = store().createSession('chat')
      store().addMessage(a, 'user', 'hi')
      expect(store().getSessionMessages(a)).toHaveLength(1)
      expect(store().getSessionMessages('nope')).toEqual([])
    })
  })
})
