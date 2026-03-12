/**
 * AI state management store.
 * Manages AI sessions, context, generation state, and model preferences.
 */

import { create } from 'zustand'

/* ── Types ─────────────────────────────────────────────── */

export type AIMode = 'chat' | 'compose' | 'edit' | 'explain' | 'fix' | 'review' | 'test' | 'commit'

export interface AISession {
  id: string
  mode: AIMode
  title: string
  messages: AIMessage[]
  context: AIContextEntry[]
  model: string
  createdAt: number
  lastActive: number
  tokenUsage: { input: number; output: number }
  status: 'idle' | 'generating' | 'streaming' | 'error'
  error?: string
}

export interface AIMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  timestamp: number
  model?: string
  tokenCount?: number
  codeBlocks?: CodeBlock[]
  appliedEdits?: AppliedEdit[]
}

export interface CodeBlock {
  language: string
  code: string
  file?: string
  startLine?: number
  applied: boolean
}

export interface AppliedEdit {
  file: string
  original: string
  modified: string
  applied: boolean
  timestamp: number
}

export interface AIContextEntry {
  type: 'file' | 'selection' | 'terminal' | 'error' | 'git-diff' | 'documentation'
  content: string
  path?: string
  label: string
  tokenEstimate: number
}

export interface AIPreferences {
  defaultModel: string
  temperature: number
  maxTokens: number
  streamResponses: boolean
  includeFileContext: boolean
  includeGitContext: boolean
  includeTerminalContext: boolean
  maxContextTokens: number
  autoApplyEdits: boolean
  showTokenCount: boolean
  saveHistory: boolean
}

/* ── Store ─────────────────────────────────────────────── */

interface AIStore {
  // State
  sessions: AISession[]
  activeSessionId: string | null
  preferences: AIPreferences
  isGenerating: boolean
  streamContent: string
  contextEntries: AIContextEntry[]
  recentModels: string[]
  totalTokensUsed: number

  // Session management
  createSession: (mode: AIMode, title?: string) => string
  deleteSession: (id: string) => void
  setActiveSession: (id: string) => void
  clearSessionMessages: (id: string) => void
  renameSession: (id: string, title: string) => void

  // Messages
  addMessage: (sessionId: string, role: AIMessage['role'], content: string, model?: string) => void
  updateLastMessage: (sessionId: string, content: string) => void
  appendToLastMessage: (sessionId: string, delta: string) => void

  // Context
  addContext: (entry: AIContextEntry) => void
  removeContext: (index: number) => void
  clearContext: () => void
  addFileContext: (path: string, content: string) => void
  addSelectionContext: (selection: string, file: string, startLine: number) => void

  // Generation state
  setGenerating: (generating: boolean) => void
  setStreamContent: (content: string) => void
  appendStreamContent: (delta: string) => void
  setSessionStatus: (sessionId: string, status: AISession['status'], error?: string) => void
  setSessionError: (sessionId: string, error: string) => void

  // Preferences
  updatePreferences: (prefs: Partial<AIPreferences>) => void
  setModel: (model: string) => void

  // Token tracking
  addTokenUsage: (input: number, output: number) => void

  // Code actions
  markCodeApplied: (sessionId: string, messageId: string, blockIndex: number) => void
  addAppliedEdit: (sessionId: string, edit: AppliedEdit) => void

  // Helpers
  getActiveSession: () => AISession | undefined
  getSessionMessages: (sessionId: string) => AIMessage[]
  getTotalContextTokens: () => number
}

const PREFS_KEY = 'orion:ai-preferences'
const HISTORY_KEY = 'orion:ai-history'

let nextSessionId = 1
let nextMessageId = 1

function loadPreferences(): AIPreferences {
  try {
    const stored = localStorage.getItem(PREFS_KEY)
    if (stored) return { ...DEFAULT_PREFS, ...JSON.parse(stored) }
  } catch {}
  return { ...DEFAULT_PREFS }
}

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

export const useAIStore = create<AIStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  preferences: loadPreferences(),
  isGenerating: false,
  streamContent: '',
  contextEntries: [],
  recentModels: ['claude-sonnet-4-6', 'gpt-4o', 'claude-haiku-4-5-20251001'],
  totalTokensUsed: 0,

  /* ── Session Management ──────────────────────────── */

  createSession: (mode, title) => {
    const id = `ai-session-${nextSessionId++}`
    const session: AISession = {
      id,
      mode,
      title: title || `${mode.charAt(0).toUpperCase() + mode.slice(1)} Session`,
      messages: [],
      context: [...get().contextEntries],
      model: get().preferences.defaultModel,
      createdAt: Date.now(),
      lastActive: Date.now(),
      tokenUsage: { input: 0, output: 0 },
      status: 'idle',
    }

    set(s => ({
      sessions: [session, ...s.sessions].slice(0, 50),
      activeSessionId: id,
    }))

    return id
  },

  deleteSession: (id) => {
    set(s => ({
      sessions: s.sessions.filter(sess => sess.id !== id),
      activeSessionId: s.activeSessionId === id
        ? s.sessions.find(sess => sess.id !== id)?.id || null
        : s.activeSessionId,
    }))
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  clearSessionMessages: (id) => {
    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.id === id ? { ...sess, messages: [], tokenUsage: { input: 0, output: 0 } } : sess
      ),
    }))
  },

  renameSession: (id, title) => {
    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.id === id ? { ...sess, title } : sess
      ),
    }))
  },

  /* ── Messages ───────────────────────────────────── */

  addMessage: (sessionId, role, content, model) => {
    const msg: AIMessage = {
      id: `msg-${nextMessageId++}`,
      role,
      content,
      timestamp: Date.now(),
      model,
      tokenCount: Math.ceil(content.length / 4),
      codeBlocks: extractCodeBlocks(content),
    }

    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.id === sessionId ? {
          ...sess,
          messages: [...sess.messages, msg],
          lastActive: Date.now(),
        } : sess
      ),
    }))
  },

  updateLastMessage: (sessionId, content) => {
    set(s => ({
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId || sess.messages.length === 0) return sess
        const messages = [...sess.messages]
        messages[messages.length - 1] = {
          ...messages[messages.length - 1],
          content,
          codeBlocks: extractCodeBlocks(content),
        }
        return { ...sess, messages }
      }),
    }))
  },

  appendToLastMessage: (sessionId, delta) => {
    set(s => ({
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId || sess.messages.length === 0) return sess
        const messages = [...sess.messages]
        const last = messages[messages.length - 1]
        messages[messages.length - 1] = {
          ...last,
          content: last.content + delta,
        }
        return { ...sess, messages }
      }),
    }))
  },

  /* ── Context ────────────────────────────────────── */

  addContext: (entry) => {
    set(s => ({
      contextEntries: [...s.contextEntries, entry],
    }))
  },

  removeContext: (index) => {
    set(s => ({
      contextEntries: s.contextEntries.filter((_, i) => i !== index),
    }))
  },

  clearContext: () => set({ contextEntries: [] }),

  addFileContext: (path, content) => {
    const truncated = content.length > 10000 ? content.slice(0, 10000) + '\n... [truncated]' : content
    get().addContext({
      type: 'file',
      content: truncated,
      path,
      label: path.split(/[/\\]/).pop() || path,
      tokenEstimate: Math.ceil(truncated.length / 4),
    })
  },

  addSelectionContext: (selection, file, startLine) => {
    get().addContext({
      type: 'selection',
      content: selection,
      path: file,
      label: `${file.split(/[/\\]/).pop()}:${startLine}`,
      tokenEstimate: Math.ceil(selection.length / 4),
    })
  },

  /* ── Generation State ───────────────────────────── */

  setGenerating: (generating) => set({ isGenerating: generating }),
  setStreamContent: (content) => set({ streamContent: content }),
  appendStreamContent: (delta) => set(s => ({ streamContent: s.streamContent + delta })),

  setSessionStatus: (sessionId, status, error) => {
    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.id === sessionId ? { ...sess, status, error } : sess
      ),
    }))
  },

  setSessionError: (sessionId, error) => {
    set(s => ({
      sessions: s.sessions.map(sess =>
        sess.id === sessionId ? { ...sess, status: 'error' as const, error } : sess
      ),
    }))
  },

  /* ── Preferences ────────────────────────────────── */

  updatePreferences: (prefs) => {
    set(s => {
      const updated = { ...s.preferences, ...prefs }
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(updated)) } catch {}
      return { preferences: updated }
    })
  },

  setModel: (model) => {
    get().updatePreferences({ defaultModel: model })
    set(s => ({
      recentModels: [model, ...s.recentModels.filter(m => m !== model)].slice(0, 5),
    }))
  },

  /* ── Token Tracking ─────────────────────────────── */

  addTokenUsage: (input, output) => {
    set(s => ({ totalTokensUsed: s.totalTokensUsed + input + output }))
    const sessionId = get().activeSessionId
    if (sessionId) {
      set(s => ({
        sessions: s.sessions.map(sess =>
          sess.id === sessionId ? {
            ...sess,
            tokenUsage: {
              input: sess.tokenUsage.input + input,
              output: sess.tokenUsage.output + output,
            },
          } : sess
        ),
      }))
    }
  },

  /* ── Code Actions ───────────────────────────────── */

  markCodeApplied: (sessionId, messageId, blockIndex) => {
    set(s => ({
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId) return sess
        return {
          ...sess,
          messages: sess.messages.map(msg => {
            if (msg.id !== messageId || !msg.codeBlocks) return msg
            const codeBlocks = [...msg.codeBlocks]
            if (codeBlocks[blockIndex]) {
              codeBlocks[blockIndex] = { ...codeBlocks[blockIndex], applied: true }
            }
            return { ...msg, codeBlocks }
          }),
        }
      }),
    }))
  },

  addAppliedEdit: (sessionId, edit) => {
    set(s => ({
      sessions: s.sessions.map(sess => {
        if (sess.id !== sessionId) return sess
        const messages = [...sess.messages]
        if (messages.length > 0) {
          const last = messages[messages.length - 1]
          messages[messages.length - 1] = {
            ...last,
            appliedEdits: [...(last.appliedEdits || []), edit],
          }
        }
        return { ...sess, messages }
      }),
    }))
  },

  /* ── Helpers ────────────────────────────────────── */

  getActiveSession: () => {
    const s = get()
    return s.sessions.find(sess => sess.id === s.activeSessionId)
  },

  getSessionMessages: (sessionId) => {
    return get().sessions.find(s => s.id === sessionId)?.messages || []
  },

  getTotalContextTokens: () => {
    return get().contextEntries.reduce((sum, e) => sum + e.tokenEstimate, 0)
  },
}))

/* ── Helpers ──────────────────────────────────────────── */

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g

  let match: RegExpExecArray | null
  while ((match = regex.exec(content))) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
      applied: false,
    })
  }

  return blocks
}
