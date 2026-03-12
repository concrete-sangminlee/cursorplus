import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { ChatMessage } from '@shared/types'

/* ── Types ─────────────────────────────────────────────── */

/** Per-model cost rates in USD per 1K tokens */
export interface ModelCostRate {
  inputPer1K: number
  outputPer1K: number
}

/** Token usage tracking for a single conversation */
export interface TokenUsage {
  totalInputTokens: number
  totalOutputTokens: number
  /** Estimated cost in USD */
  estimatedCost: number
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  model: string
  createdAt: number
  updatedAt: number
  /** Whether this conversation is starred / favorited */
  favorite: boolean
  /** Token usage tracking */
  tokenUsage: TokenUsage
  /** ID of the conversation this was forked from (if any) */
  forkedFrom?: string
  /** Message index in parent conversation where fork occurred */
  forkPoint?: number
}

/** Exportable conversation format */
export interface ExportedConversation {
  version: 1
  exportedAt: number
  conversations: Conversation[]
}

interface SearchResult {
  conversationId: string
  conversationTitle: string
  messageId: string
  messageRole: 'user' | 'assistant'
  snippet: string
  timestamp: number
}

interface ChatHistoryStore {
  conversations: Conversation[]
  activeConversationId: string | null

  /* ── Core CRUD ────────────────────────────────────── */
  createConversation: (model?: string) => string
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  syncMessages: (messages: ChatMessage[]) => void
  getActiveConversation: () => Conversation | undefined

  /* ── Search ───────────────────────────────────────── */
  searchConversations: (query: string) => SearchResult[]

  /* ── Export / Import ──────────────────────────────── */
  exportConversations: (ids?: string[]) => string
  importConversations: (json: string) => { imported: number; errors: string[] }

  /* ── Branching ────────────────────────────────────── */
  forkConversation: (conversationId: string, afterMessageIndex: number) => string | null

  /* ── Sharing ──────────────────────────────────────── */
  generateShareableText: (conversationId: string) => string | null

  /* ── Usage tracking ───────────────────────────────── */
  recordTokenUsage: (conversationId: string, inputTokens: number, outputTokens: number, model?: string) => void
  getOverallUsage: () => { totalInput: number; totalOutput: number; totalCost: number }

  /* ── Favorites ────────────────────────────────────── */
  toggleFavorite: (id: string) => void
  getFavorites: () => Conversation[]
}

/* ── Constants ─────────────────────────────────────────── */

const STORAGE_KEY = 'orion-chat-history'
const MAX_CONVERSATIONS = 100
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

/** Approximate cost rates per model (USD per 1K tokens) */
const MODEL_COST_RATES: Record<string, ModelCostRate> = {
  'gpt-4': { inputPer1K: 0.03, outputPer1K: 0.06 },
  'gpt-4-turbo': { inputPer1K: 0.01, outputPer1K: 0.03 },
  'gpt-4o': { inputPer1K: 0.005, outputPer1K: 0.015 },
  'gpt-3.5-turbo': { inputPer1K: 0.0005, outputPer1K: 0.0015 },
  'claude-3-opus': { inputPer1K: 0.015, outputPer1K: 0.075 },
  'claude-3-sonnet': { inputPer1K: 0.003, outputPer1K: 0.015 },
  'claude-3-haiku': { inputPer1K: 0.00025, outputPer1K: 0.00125 },
  'Ollama': { inputPer1K: 0, outputPer1K: 0 }, // local, free
}

function getCostRate(model: string): ModelCostRate {
  // Try exact match first, then prefix match
  if (MODEL_COST_RATES[model]) return MODEL_COST_RATES[model]
  const key = Object.keys(MODEL_COST_RATES).find((k) => model.toLowerCase().startsWith(k.toLowerCase()))
  return key ? MODEL_COST_RATES[key] : { inputPer1K: 0, outputPer1K: 0 }
}

function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const rate = getCostRate(model)
  return (inputTokens / 1000) * rate.inputPer1K + (outputTokens / 1000) * rate.outputPer1K
}

/* ── Persistence helpers ───────────────────────────────── */

function loadFromStorage(): { conversations: Conversation[]; activeConversationId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      const conversations: Conversation[] = Array.isArray(data.conversations)
        ? data.conversations.map((c: Partial<Conversation>) => ({
            ...c,
            model: c.model ?? 'Ollama',
            favorite: c.favorite ?? false,
            tokenUsage: c.tokenUsage ?? { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
          }))
        : []
      return {
        conversations,
        activeConversationId: data.activeConversationId ?? null,
      }
    }
  } catch {
    // corrupt data — start fresh
  }
  return { conversations: [], activeConversationId: null }
}

function saveToStorage(conversations: Conversation[], activeConversationId: string | null) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ conversations, activeConversationId }),
    )
  } catch {
    // quota exceeded — silently fail
  }
}

/* ── Auto-title helper ─────────────────────────────────── */

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user')
  if (!firstUser) return 'New Chat'
  const text = firstUser.content.trim().replace(/\n/g, ' ')
  return text.length > 50 ? text.slice(0, 50) + '...' : text
}

/* ── Prune conversations beyond MAX and older than 30 days ── */

function pruneConversations(convos: Conversation[]): Conversation[] {
  const now = Date.now()

  // First: remove non-favorite conversations older than 30 days
  let pruned = convos.filter(
    (c) => c.favorite || now - c.updatedAt < MAX_AGE_MS,
  )

  // Second: if still over MAX, sort by updatedAt descending and keep MAX
  // (favorites always float to top so they are never pruned by count)
  if (pruned.length <= MAX_CONVERSATIONS) return pruned

  const favorites = pruned.filter((c) => c.favorite)
  const nonFavorites = pruned
    .filter((c) => !c.favorite)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS - favorites.length)

  return [...favorites, ...nonFavorites]
}

/* ── Snippet extraction helper ─────────────────────────── */

function extractSnippet(content: string, query: string, contextChars: number = 80): string {
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerContent.indexOf(lowerQuery)
  if (idx === -1) return content.slice(0, contextChars * 2)
  const start = Math.max(0, idx - contextChars)
  const end = Math.min(content.length, idx + query.length + contextChars)
  let snippet = content.slice(start, end).replace(/\n/g, ' ')
  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'
  return snippet
}

/* ── Store ─────────────────────────────────────────────── */

const initial = loadFromStorage()

export const useChatHistoryStore = create<ChatHistoryStore>((set, get) => ({
  conversations: initial.conversations,
  activeConversationId: initial.activeConversationId,

  /* ── Core CRUD ────────────────────────────────────── */

  createConversation: (model?: string) => {
    const id = uuid()
    const now = Date.now()
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      model: model ?? 'Ollama',
      createdAt: now,
      updatedAt: now,
      favorite: false,
      tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
    }
    set((state) => {
      const updated = pruneConversations([conversation, ...state.conversations])
      saveToStorage(updated, id)
      return { conversations: updated, activeConversationId: id }
    })
    return id
  },

  switchConversation: (id) => {
    const convo = get().conversations.find((c) => c.id === id)
    if (!convo) return
    set({ activeConversationId: id })
    saveToStorage(get().conversations, id)
  },

  deleteConversation: (id) => {
    set((state) => {
      const updated = state.conversations.filter((c) => c.id !== id)
      const newActive =
        state.activeConversationId === id
          ? updated[0]?.id ?? null
          : state.activeConversationId
      saveToStorage(updated, newActive)
      return { conversations: updated, activeConversationId: newActive }
    })
  },

  renameConversation: (id, title) => {
    set((state) => {
      const updated = state.conversations.map((c) =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
      )
      saveToStorage(updated, state.activeConversationId)
      return { conversations: updated }
    })
  },

  syncMessages: (messages) => {
    const { activeConversationId } = get()
    if (!activeConversationId) return

    set((state) => {
      const updated = state.conversations.map((c) => {
        if (c.id !== activeConversationId) return c
        // Auto-title from first user message if still default
        const title =
          c.title === 'New Chat' && messages.length > 0
            ? deriveTitle(messages)
            : c.title
        return { ...c, messages, title, updatedAt: Date.now() }
      })
      saveToStorage(updated, state.activeConversationId)
      return { conversations: updated }
    })
  },

  getActiveConversation: () => {
    const { conversations, activeConversationId } = get()
    return conversations.find((c) => c.id === activeConversationId)
  },

  /* ── Search ───────────────────────────────────────── */

  searchConversations: (query: string): SearchResult[] => {
    if (!query.trim()) return []
    const lowerQuery = query.toLowerCase()
    const results: SearchResult[] = []

    for (const convo of get().conversations) {
      for (const msg of convo.messages) {
        if (msg.content.toLowerCase().includes(lowerQuery)) {
          results.push({
            conversationId: convo.id,
            conversationTitle: convo.title,
            messageId: msg.id,
            messageRole: msg.role,
            snippet: extractSnippet(msg.content, query),
            timestamp: msg.timestamp,
          })
        }
      }
    }

    // Sort by timestamp descending (most recent matches first)
    return results.sort((a, b) => b.timestamp - a.timestamp)
  },

  /* ── Export / Import ──────────────────────────────── */

  exportConversations: (ids?: string[]): string => {
    const { conversations } = get()
    const toExport = ids
      ? conversations.filter((c) => ids.includes(c.id))
      : conversations

    const payload: ExportedConversation = {
      version: 1,
      exportedAt: Date.now(),
      conversations: toExport,
    }
    return JSON.stringify(payload, null, 2)
  },

  importConversations: (json: string): { imported: number; errors: string[] } => {
    const errors: string[] = []
    let parsed: ExportedConversation

    try {
      parsed = JSON.parse(json)
    } catch {
      return { imported: 0, errors: ['Invalid JSON format'] }
    }

    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.conversations)) {
      return { imported: 0, errors: ['Unrecognized export format or version'] }
    }

    const existingIds = new Set(get().conversations.map((c) => c.id))
    const toImport: Conversation[] = []

    for (const convo of parsed.conversations) {
      if (!convo.id || !convo.title || !Array.isArray(convo.messages)) {
        errors.push(`Skipped malformed conversation: ${convo.id ?? 'unknown'}`)
        continue
      }
      if (existingIds.has(convo.id)) {
        errors.push(`Skipped duplicate conversation: ${convo.title} (${convo.id})`)
        continue
      }
      toImport.push({
        id: convo.id,
        title: convo.title,
        messages: convo.messages,
        model: convo.model ?? 'Ollama',
        createdAt: convo.createdAt ?? Date.now(),
        updatedAt: convo.updatedAt ?? Date.now(),
        favorite: convo.favorite ?? false,
        tokenUsage: convo.tokenUsage ?? { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
        forkedFrom: convo.forkedFrom,
        forkPoint: convo.forkPoint,
      })
    }

    if (toImport.length > 0) {
      set((state) => {
        const merged = pruneConversations([...toImport, ...state.conversations])
        saveToStorage(merged, state.activeConversationId)
        return { conversations: merged }
      })
    }

    return { imported: toImport.length, errors }
  },

  /* ── Branching ────────────────────────────────────── */

  forkConversation: (conversationId: string, afterMessageIndex: number): string | null => {
    const source = get().conversations.find((c) => c.id === conversationId)
    if (!source) return null
    if (afterMessageIndex < 0 || afterMessageIndex >= source.messages.length) return null

    const forkedMessages = source.messages.slice(0, afterMessageIndex + 1)
    const id = uuid()
    const now = Date.now()

    const forked: Conversation = {
      id,
      title: `Fork of: ${source.title}`,
      messages: forkedMessages,
      model: source.model,
      createdAt: now,
      updatedAt: now,
      favorite: false,
      tokenUsage: { totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0 },
      forkedFrom: conversationId,
      forkPoint: afterMessageIndex,
    }

    set((state) => {
      const updated = pruneConversations([forked, ...state.conversations])
      saveToStorage(updated, id)
      return { conversations: updated, activeConversationId: id }
    })

    return id
  },

  /* ── Sharing ──────────────────────────────────────── */

  generateShareableText: (conversationId: string): string | null => {
    const convo = get().conversations.find((c) => c.id === conversationId)
    if (!convo) return null

    const lines: string[] = [
      `# ${convo.title}`,
      `Model: ${convo.model}`,
      `Date: ${new Date(convo.createdAt).toLocaleDateString()}`,
      `Messages: ${convo.messages.length}`,
      '',
      '---',
      '',
    ]

    for (const msg of convo.messages) {
      const roleLabel = msg.role === 'user' ? 'User' : (msg.agentName ?? 'Assistant')
      const time = new Date(msg.timestamp).toLocaleTimeString()
      lines.push(`### ${roleLabel} (${time})`)
      lines.push('')
      lines.push(msg.content)
      lines.push('')
      lines.push('---')
      lines.push('')
    }

    if (convo.tokenUsage.totalInputTokens > 0 || convo.tokenUsage.totalOutputTokens > 0) {
      lines.push(`Token usage: ${convo.tokenUsage.totalInputTokens} input / ${convo.tokenUsage.totalOutputTokens} output`)
      if (convo.tokenUsage.estimatedCost > 0) {
        lines.push(`Estimated cost: $${convo.tokenUsage.estimatedCost.toFixed(4)}`)
      }
      lines.push('')
    }

    lines.push('Generated by Orion IDE')
    return lines.join('\n')
  },

  /* ── Usage tracking ───────────────────────────────── */

  recordTokenUsage: (conversationId: string, inputTokens: number, outputTokens: number, model?: string) => {
    set((state) => {
      const updated = state.conversations.map((c) => {
        if (c.id !== conversationId) return c
        const effectiveModel = model ?? c.model
        const addedCost = estimateCost(inputTokens, outputTokens, effectiveModel)
        return {
          ...c,
          tokenUsage: {
            totalInputTokens: c.tokenUsage.totalInputTokens + inputTokens,
            totalOutputTokens: c.tokenUsage.totalOutputTokens + outputTokens,
            estimatedCost: c.tokenUsage.estimatedCost + addedCost,
          },
          updatedAt: Date.now(),
        }
      })
      saveToStorage(updated, state.activeConversationId)
      return { conversations: updated }
    })
  },

  getOverallUsage: () => {
    const { conversations } = get()
    let totalInput = 0
    let totalOutput = 0
    let totalCost = 0
    for (const c of conversations) {
      totalInput += c.tokenUsage.totalInputTokens
      totalOutput += c.tokenUsage.totalOutputTokens
      totalCost += c.tokenUsage.estimatedCost
    }
    return { totalInput, totalOutput, totalCost }
  },

  /* ── Favorites ────────────────────────────────────── */

  toggleFavorite: (id: string) => {
    set((state) => {
      const updated = state.conversations.map((c) =>
        c.id === id ? { ...c, favorite: !c.favorite, updatedAt: Date.now() } : c,
      )
      saveToStorage(updated, state.activeConversationId)
      return { conversations: updated }
    })
  },

  getFavorites: () => {
    return get().conversations.filter((c) => c.favorite)
  },
}))
