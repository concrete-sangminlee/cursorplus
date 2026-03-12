import { create } from 'zustand'

/* ── Types ──────────────────────────────────────────────── */

export type OutputLineType = 'info' | 'warn' | 'error' | 'success'

export interface OutputLine {
  id: number
  text: string
  type: OutputLineType
  timestamp: number
}

const DEFAULT_CHANNELS = ['Orion', 'Git', 'Extensions', 'AI', 'Tasks'] as const
export type DefaultChannel = (typeof DEFAULT_CHANNELS)[number]

const MAX_LINES_PER_CHANNEL = 1000

/* ── Store interface ────────────────────────────────────── */

interface OutputStore {
  channels: Map<string, OutputLine[]>
  activeChannel: string

  /** Append output lines to a channel (alias: addOutput) */
  appendOutput: (channel: string, text: string, type?: OutputLineType) => void
  /** Alias for appendOutput matching the requested API */
  addOutput: (channel: string, message: string, level?: 'info' | 'warn' | 'error') => void
  clearChannel: (channel: string) => void
  setActiveChannel: (channel: string) => void
}

/* ── Counter for stable line ids ────────────────────────── */

let lineIdCounter = 0

/* ── Helper: append lines to a channel map ──────────────── */

function appendLines(
  channels: Map<string, OutputLine[]>,
  channel: string,
  text: string,
  type: OutputLineType,
): Map<string, OutputLine[]> {
  const next = new Map(channels)
  const existing = next.get(channel) ?? []

  const lines = text.split('\n')
  const newLines: OutputLine[] = lines.map((line) => ({
    id: ++lineIdCounter,
    text: line,
    type,
    timestamp: Date.now(),
  }))

  const combined = [...existing, ...newLines]
  const trimmed =
    combined.length > MAX_LINES_PER_CHANNEL
      ? combined.slice(combined.length - MAX_LINES_PER_CHANNEL)
      : combined

  next.set(channel, trimmed)
  return next
}

/* ── Selector: get output lines for a channel ───────────── */

export function getChannelOutput(state: OutputStore, channel: string): OutputLine[] {
  return state.channels.get(channel) ?? []
}

/* ── Store ──────────────────────────────────────────────── */

export const useOutputStore = create<OutputStore>((set) => {
  // Initialize default channels
  const initial = new Map<string, OutputLine[]>()
  for (const ch of DEFAULT_CHANNELS) {
    initial.set(ch, [])
  }

  const appendOutput = (channel: string, text: string, type: OutputLineType = 'info') =>
    set((state) => ({ channels: appendLines(state.channels, channel, text, type) }))

  return {
    channels: initial,
    activeChannel: 'Orion',

    appendOutput,

    addOutput: (channel: string, message: string, level: 'info' | 'warn' | 'error' = 'info') =>
      appendOutput(channel, message, level),

    clearChannel: (channel) =>
      set((state) => {
        const channels = new Map(state.channels)
        channels.set(channel, [])
        return { channels }
      }),

    setActiveChannel: (channel) => set({ activeChannel: channel }),
  }
})
