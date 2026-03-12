import { useEffect, useRef, useCallback } from 'react'

const STORAGE_KEY = 'orion-layout'
const DEBOUNCE_MS = 300

export interface LayoutState {
  sidePanelWidth: number
  rightPanelWidth: number
  bottomPanelHeight: number
  sidebarVisible: boolean
  bottomVisible: boolean
  chatVisible: boolean
}

/**
 * Load persisted layout from localStorage, falling back to provided defaults.
 */
export function loadLayout(defaults: LayoutState): LayoutState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LayoutState>
      return {
        sidePanelWidth:
          typeof parsed.sidePanelWidth === 'number' ? parsed.sidePanelWidth : defaults.sidePanelWidth,
        rightPanelWidth:
          typeof parsed.rightPanelWidth === 'number' ? parsed.rightPanelWidth : defaults.rightPanelWidth,
        bottomPanelHeight:
          typeof parsed.bottomPanelHeight === 'number' ? parsed.bottomPanelHeight : defaults.bottomPanelHeight,
        sidebarVisible:
          typeof parsed.sidebarVisible === 'boolean' ? parsed.sidebarVisible : defaults.sidebarVisible,
        bottomVisible:
          typeof parsed.bottomVisible === 'boolean' ? parsed.bottomVisible : defaults.bottomVisible,
        chatVisible:
          typeof parsed.chatVisible === 'boolean' ? parsed.chatVisible : defaults.chatVisible,
      }
    }
  } catch {
    // Corrupted data — fall through to defaults
  }
  return defaults
}

/**
 * Hook that debounce-saves the layout state to localStorage whenever it changes.
 */
export function useLayoutPersistence(state: LayoutState): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use a ref to always have the latest state without re-creating the effect
  const stateRef = useRef(state)
  stateRef.current = state

  const save = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateRef.current))
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }, [])

  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }
    timerRef.current = setTimeout(save, DEBOUNCE_MS)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [
    state.sidePanelWidth,
    state.rightPanelWidth,
    state.bottomPanelHeight,
    state.sidebarVisible,
    state.bottomVisible,
    state.chatVisible,
    save,
  ])
}
