import { create } from 'zustand'
import type { ChatMessage, ChatMode } from '@shared/types'
import { useChatHistoryStore } from './chatHistory'

interface ChatStore {
  messages: ChatMessage[]
  mode: ChatMode
  selectedModel: string
  isStreaming: boolean
  ollamaAvailable: boolean
  ollamaModels: string[]
  addMessage: (message: ChatMessage) => void
  updateLastAssistant: (content: string) => void
  setMode: (mode: ChatMode) => void
  setModel: (model: string) => void
  setStreaming: (streaming: boolean) => void
  clearMessages: () => void
  setOllamaStatus: (available: boolean, models: string[]) => void
  loadMessages: (messages: ChatMessage[]) => void
  removeMessagesAfter: (messageId: string) => void
  /** Record token usage for the current active conversation */
  recordUsage: (inputTokens: number, outputTokens: number) => void
  /** Fork the active conversation from a specific message, switching to the fork */
  forkFromMessage: (messageId: string) => string | null
}

/** Sync current messages to the active conversation in chatHistory store. */
function syncToHistory(messages: ChatMessage[]) {
  useChatHistoryStore.getState().syncMessages(messages)
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  mode: 'agent',
  selectedModel: 'Ollama',
  isStreaming: false,
  ollamaAvailable: false,
  ollamaModels: [],

  addMessage: (message) => {
    set((state) => {
      const updated = [...state.messages, message]
      syncToHistory(updated)
      return { messages: updated }
    })
  },

  updateLastAssistant: (chunk) =>
    set((state) => {
      const msgs = [...state.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') {
          msgs[i] = { ...msgs[i], content: msgs[i].content + chunk }
          break
        }
      }
      syncToHistory(msgs)
      return { messages: msgs }
    }),

  setMode: (mode) => set({ mode }),
  setModel: (model) => set({ selectedModel: model }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),

  clearMessages: () => {
    set({ messages: [] })
    syncToHistory([])
  },

  setOllamaStatus: (available, models) =>
    set({ ollamaAvailable: available, ollamaModels: models }),

  loadMessages: (messages) => set({ messages }),

  removeMessagesAfter: (messageId) =>
    set((state) => {
      const idx = state.messages.findIndex((m) => m.id === messageId)
      if (idx === -1) return state
      const updated = state.messages.slice(0, idx)
      syncToHistory(updated)
      return { messages: updated }
    }),

  recordUsage: (inputTokens: number, outputTokens: number) => {
    const historyStore = useChatHistoryStore.getState()
    const activeId = historyStore.activeConversationId
    if (!activeId) return
    historyStore.recordTokenUsage(activeId, inputTokens, outputTokens, get().selectedModel)
  },

  forkFromMessage: (messageId: string): string | null => {
    const historyStore = useChatHistoryStore.getState()
    const activeId = historyStore.activeConversationId
    if (!activeId) return null

    const convo = historyStore.conversations.find((c) => c.id === activeId)
    if (!convo) return null

    const msgIndex = convo.messages.findIndex((m) => m.id === messageId)
    if (msgIndex === -1) return null

    const forkedId = historyStore.forkConversation(activeId, msgIndex)
    if (forkedId) {
      // Load the forked messages into the chat store
      const forkedConvo = useChatHistoryStore.getState().conversations.find((c) => c.id === forkedId)
      if (forkedConvo) {
        set({ messages: forkedConvo.messages })
      }
    }
    return forkedId
  },
}))
