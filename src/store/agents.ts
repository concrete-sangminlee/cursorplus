import { create } from 'zustand'
import type { Agent, AgentLogEntry } from '@shared/types'

interface AgentStore {
  agents: Agent[]
  logs: AgentLogEntry[]
  setAgents: (agents: Agent[]) => void
  updateAgent: (id: string, update: Partial<Agent>) => void
  addLog: (entry: AgentLogEntry) => void
  clearLogs: () => void
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  logs: [],

  setAgents: (agents) => set({ agents }),

  updateAgent: (id, update) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...update } : a)),
    })),

  addLog: (entry) =>
    // Keep the most recent 200 entries (slice -199 leaves room for the new one).
    set((state) => ({ logs: [...state.logs.slice(-199), entry] })),

  clearLogs: () => set({ logs: [] }),
}))
