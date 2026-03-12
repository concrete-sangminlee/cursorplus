import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { ChatMessage } from '@shared/types'

/* ── Types ─────────────────────────────────────────────── */

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

interface ChatHistoryStore {
  conversations: Conversation[]
  activeConversationId: string | null

  createConversation: () => string
  switchConversation: (id: string) => void
  deleteConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  syncMessages: (messages: ChatMessage[]) => void
  getActiveConversation: () => Conversation | undefined
}

/* ── Constants ─────────────────────────────────────────── */

const STORAGE_KEY = 'orion-chat-history'
const MAX_CONVERSATIONS = 100

/* ── Persistence helpers ───────────────────────────────── */

function loadFromStorage(): { conversations: Conversation[]; activeConversationId: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      return {
        conversations: Array.isArray(data.conversations) ? data.conversations : [],
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

/* ── Prune oldest conversations beyond MAX ─────────────── */

function pruneConversations(convos: Conversation[]): Conversation[] {
  if (convos.length <= MAX_CONVERSATIONS) return convos
  // Sort by updatedAt descending, keep the newest MAX_CONVERSATIONS
  const sorted = [...convos].sort((a, b) => b.updatedAt - a.updatedAt)
  return sorted.slice(0, MAX_CONVERSATIONS)
}

/* ── Store ─────────────────────────────────────────────── */

const initial = loadFromStorage()

export const useChatHistoryStore = create<ChatHistoryStore>((set, get) => ({
  conversations: initial.conversations,
  activeConversationId: initial.activeConversationId,

  createConversation: () => {
    const id = uuid()
    const now = Date.now()
    const conversation: Conversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
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
}))
