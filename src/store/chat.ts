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
}))
