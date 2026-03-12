import { create } from 'zustand'

// ── Types ──────────────────────────────────────────────

export interface FileSnapshot {
  id: string
  path: string
  content: string
  timestamp: number
  label: string // "Saved", "Auto-saved", "Before AI edit", etc.
  size: number
}

interface FileHistoryStore {
  snapshots: Map<string, FileSnapshot[]> // keyed by file path
  addSnapshot: (path: string, content: string, label: string) => void
  getSnapshots: (path: string) => FileSnapshot[]
  restoreSnapshot: (id: string) => FileSnapshot | null
  deleteSnapshot: (id: string) => void
  clearFileHistory: (path: string) => void
  _hydrated: boolean
}

// ── Constants ──────────────────────────────────────────

const STORAGE_KEY = 'orion-file-history'
const MAX_SNAPSHOTS_PER_FILE = 20
const MAX_TOTAL_STORAGE_BYTES = 5 * 1024 * 1024 // ~5MB
const AUTO_SAVE_MIN_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ── Helpers ────────────────────────────────────────────

function generateId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9)
}

/** Serialize the snapshots map to a JSON-friendly structure */
function serializeSnapshots(snapshots: Map<string, FileSnapshot[]>): Record<string, FileSnapshot[]> {
  const obj: Record<string, FileSnapshot[]> = {}
  for (const [key, value] of snapshots) {
    obj[key] = value
  }
  return obj
}

/** Deserialize from localStorage JSON */
function deserializeSnapshots(obj: Record<string, FileSnapshot[]>): Map<string, FileSnapshot[]> {
  const map = new Map<string, FileSnapshot[]>()
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      map.set(key, value)
    }
  }
  return map
}

/** Load snapshots from localStorage */
function loadFromStorage(): Map<string, FileSnapshot[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return deserializeSnapshots(parsed)
    }
  } catch {
    // Corrupted data - start fresh
  }
  return new Map()
}

/** Save snapshots to localStorage, pruning if needed */
function saveToStorage(snapshots: Map<string, FileSnapshot[]>) {
  try {
    const serialized = JSON.stringify(serializeSnapshots(snapshots))

    // Check total size and prune oldest entries if over limit
    if (serialized.length > MAX_TOTAL_STORAGE_BYTES) {
      pruneOldest(snapshots)
      const pruned = JSON.stringify(serializeSnapshots(snapshots))
      localStorage.setItem(STORAGE_KEY, pruned)
    } else {
      localStorage.setItem(STORAGE_KEY, serialized)
    }
  } catch {
    // localStorage full - try pruning aggressively
    pruneOldest(snapshots)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeSnapshots(snapshots)))
    } catch {
      // Give up silently
    }
  }
}

/** Remove the oldest snapshots across all files until under the size limit */
function pruneOldest(snapshots: Map<string, FileSnapshot[]>) {
  // Collect all snapshots with their file paths
  const allSnapshots: { path: string; snapshot: FileSnapshot; index: number }[] = []
  for (const [path, snaps] of snapshots) {
    snaps.forEach((s, i) => allSnapshots.push({ path, snapshot: s, index: i }))
  }

  // Sort by timestamp ascending (oldest first)
  allSnapshots.sort((a, b) => a.snapshot.timestamp - b.snapshot.timestamp)

  // Keep removing oldest until under limit
  let iterations = 0
  while (iterations < allSnapshots.length) {
    const serialized = JSON.stringify(serializeSnapshots(snapshots))
    if (serialized.length <= MAX_TOTAL_STORAGE_BYTES) break

    const oldest = allSnapshots[iterations]
    if (oldest) {
      const fileSnaps = snapshots.get(oldest.path)
      if (fileSnaps) {
        const idx = fileSnaps.findIndex((s) => s.id === oldest.snapshot.id)
        if (idx !== -1) {
          fileSnaps.splice(idx, 1)
          if (fileSnaps.length === 0) {
            snapshots.delete(oldest.path)
          }
        }
      }
    }
    iterations++
  }
}

// Track last auto-save timestamp per file (not persisted)
const lastAutoSaveTimestamps = new Map<string, number>()

// ── Store ──────────────────────────────────────────────

export const useFileHistoryStore = create<FileHistoryStore>((set, get) => ({
  snapshots: loadFromStorage(),
  _hydrated: true,

  addSnapshot: (path: string, content: string, label: string) => {
    // Throttle auto-save snapshots to every 5 minutes max
    if (label === 'Auto-saved') {
      const lastTime = lastAutoSaveTimestamps.get(path) || 0
      if (Date.now() - lastTime < AUTO_SAVE_MIN_INTERVAL_MS) {
        return // Skip - too soon since last auto-save snapshot
      }
      lastAutoSaveTimestamps.set(path, Date.now())
    }

    set((state) => {
      const newMap = new Map(state.snapshots)
      const existing = newMap.get(path) || []

      // Skip duplicate: don't create a snapshot if content is identical to the latest
      if (existing.length > 0 && existing[0].content === content) {
        return state
      }

      const snapshot: FileSnapshot = {
        id: generateId(),
        path,
        content,
        timestamp: Date.now(),
        label,
        size: new Blob([content]).size,
      }

      // Add at front (newest first), cap at MAX_SNAPSHOTS_PER_FILE
      const updated = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS_PER_FILE)
      newMap.set(path, updated)

      // Persist
      saveToStorage(newMap)

      return { snapshots: newMap }
    })
  },

  getSnapshots: (path: string) => {
    const snaps = get().snapshots.get(path) || []
    // Already sorted newest first by construction
    return snaps
  },

  restoreSnapshot: (id: string) => {
    const { snapshots } = get()
    for (const [, snaps] of snapshots) {
      const found = snaps.find((s) => s.id === id)
      if (found) {
        return found
      }
    }
    return null
  },

  deleteSnapshot: (id: string) => {
    set((state) => {
      const newMap = new Map(state.snapshots)
      for (const [path, snaps] of newMap) {
        const idx = snaps.findIndex((s) => s.id === id)
        if (idx !== -1) {
          const updated = [...snaps]
          updated.splice(idx, 1)
          if (updated.length === 0) {
            newMap.delete(path)
          } else {
            newMap.set(path, updated)
          }
          saveToStorage(newMap)
          return { snapshots: newMap }
        }
      }
      return state
    })
  },

  clearFileHistory: (path: string) => {
    set((state) => {
      const newMap = new Map(state.snapshots)
      newMap.delete(path)
      saveToStorage(newMap)
      return { snapshots: newMap }
    })
  },
}))

// ── Utility: format relative time ──────────────────────

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(diff / 3600000)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`

  const days = Math.floor(diff / 86400000)
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`

  // Fall back to date
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
