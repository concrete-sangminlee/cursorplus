import { create } from 'zustand'

interface CompletionStore {
  enabled: boolean
  ghostText: string | null
  triggerLine: number | null
  triggerColumn: number | null
  isLoading: boolean
  debounceMs: number
  setEnabled: (enabled: boolean) => void
  setGhostText: (text: string | null, line?: number, column?: number) => void
  setLoading: (loading: boolean) => void
  clear: () => void
}

export const useCompletionStore = create<CompletionStore>((set) => ({
  enabled: true,
  ghostText: null,
  triggerLine: null,
  triggerColumn: null,
  isLoading: false,
  debounceMs: 500,
  setEnabled: (enabled) => set({ enabled }),
  setGhostText: (text, line, column) => set({
    ghostText: text,
    triggerLine: line ?? null,
    triggerColumn: column ?? null,
    isLoading: false,
  }),
  setLoading: (isLoading) => set({ isLoading }),
  clear: () => set({ ghostText: null, triggerLine: null, triggerColumn: null, isLoading: false }),
}))
