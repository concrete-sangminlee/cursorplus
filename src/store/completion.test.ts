import { beforeEach, describe, expect, it } from 'vitest'
import { useCompletionStore } from './completion'

// Capture the pristine initial values so every test starts from a known baseline.
// We reset DATA fields (not actions) in beforeEach via setState({...}), without replace: true.
const INITIAL = {
  enabled: true,
  ghostText: null as string | null,
  triggerLine: null as number | null,
  triggerColumn: null as number | null,
  isLoading: false,
  debounceMs: 500,
}

describe('useCompletionStore', () => {
  beforeEach(() => {
    useCompletionStore.setState({ ...INITIAL })
  })

  describe('initial state', () => {
    it('exposes the documented default field values', () => {
      const s = useCompletionStore.getState()
      expect(s.enabled).toBe(true)
      expect(s.ghostText).toBeNull()
      expect(s.triggerLine).toBeNull()
      expect(s.triggerColumn).toBeNull()
      expect(s.isLoading).toBe(false)
      expect(s.debounceMs).toBe(500)
    })

    it('exposes all four actions as functions', () => {
      const s = useCompletionStore.getState()
      expect(typeof s.setEnabled).toBe('function')
      expect(typeof s.setGhostText).toBe('function')
      expect(typeof s.setLoading).toBe('function')
      expect(typeof s.clear).toBe('function')
    })
  })

  describe('setEnabled', () => {
    it('disables completion when passed false', () => {
      useCompletionStore.getState().setEnabled(false)
      expect(useCompletionStore.getState().enabled).toBe(false)
    })

    it('re-enables completion when passed true', () => {
      useCompletionStore.getState().setEnabled(false)
      useCompletionStore.getState().setEnabled(true)
      expect(useCompletionStore.getState().enabled).toBe(true)
    })

    it('does not disturb other fields', () => {
      useCompletionStore.setState({ ghostText: 'abc', triggerLine: 3, triggerColumn: 7, isLoading: true })
      useCompletionStore.getState().setEnabled(false)
      const s = useCompletionStore.getState()
      expect(s.ghostText).toBe('abc')
      expect(s.triggerLine).toBe(3)
      expect(s.triggerColumn).toBe(7)
      expect(s.isLoading).toBe(true)
      expect(s.debounceMs).toBe(500)
    })
  })

  describe('setGhostText', () => {
    it('sets ghost text with explicit line and column', () => {
      useCompletionStore.getState().setGhostText('const x = 1', 10, 4)
      const s = useCompletionStore.getState()
      expect(s.ghostText).toBe('const x = 1')
      expect(s.triggerLine).toBe(10)
      expect(s.triggerColumn).toBe(4)
    })

    it('always clears isLoading to false (resolving a pending request)', () => {
      useCompletionStore.getState().setLoading(true)
      useCompletionStore.getState().setGhostText('done', 1, 1)
      expect(useCompletionStore.getState().isLoading).toBe(false)
    })

    it('defaults line/column to null when they are omitted', () => {
      // Pre-seed non-null position to prove it gets overwritten, not preserved.
      useCompletionStore.setState({ triggerLine: 99, triggerColumn: 99 })
      useCompletionStore.getState().setGhostText('hello')
      const s = useCompletionStore.getState()
      expect(s.ghostText).toBe('hello')
      expect(s.triggerLine).toBeNull()
      expect(s.triggerColumn).toBeNull()
    })

    it('coerces only the missing positional arg via the ?? null fallback', () => {
      // line provided, column omitted -> column becomes null, line kept.
      useCompletionStore.getState().setGhostText('partial', 5)
      const s = useCompletionStore.getState()
      expect(s.triggerLine).toBe(5)
      expect(s.triggerColumn).toBeNull()
    })

    it('accepts an explicit null text to represent "no suggestion"', () => {
      useCompletionStore.getState().setGhostText('temp', 2, 2)
      useCompletionStore.getState().setGhostText(null)
      const s = useCompletionStore.getState()
      expect(s.ghostText).toBeNull()
      expect(s.triggerLine).toBeNull()
      expect(s.triggerColumn).toBeNull()
    })

    it('preserves line/column 0 instead of treating them as missing', () => {
      // ?? (nullish) keeps 0; this guards against a regression to || which would null out 0.
      useCompletionStore.getState().setGhostText('zero', 0, 0)
      const s = useCompletionStore.getState()
      expect(s.triggerLine).toBe(0)
      expect(s.triggerColumn).toBe(0)
    })

    it('does not modify enabled or debounceMs', () => {
      useCompletionStore.getState().setGhostText('keep', 1, 1)
      const s = useCompletionStore.getState()
      expect(s.enabled).toBe(true)
      expect(s.debounceMs).toBe(500)
    })
  })

  describe('setLoading', () => {
    it('marks the store as loading', () => {
      useCompletionStore.getState().setLoading(true)
      expect(useCompletionStore.getState().isLoading).toBe(true)
    })

    it('clears the loading flag', () => {
      useCompletionStore.getState().setLoading(true)
      useCompletionStore.getState().setLoading(false)
      expect(useCompletionStore.getState().isLoading).toBe(false)
    })

    it('does not clear any pending ghost text/position', () => {
      useCompletionStore.setState({ ghostText: 'pending', triggerLine: 8, triggerColumn: 2 })
      useCompletionStore.getState().setLoading(true)
      const s = useCompletionStore.getState()
      expect(s.ghostText).toBe('pending')
      expect(s.triggerLine).toBe(8)
      expect(s.triggerColumn).toBe(2)
    })
  })

  describe('clear', () => {
    it('resets ghost text, trigger position, and loading to their empty state', () => {
      useCompletionStore.setState({
        ghostText: 'suggestion',
        triggerLine: 12,
        triggerColumn: 6,
        isLoading: true,
      })
      useCompletionStore.getState().clear()
      const s = useCompletionStore.getState()
      expect(s.ghostText).toBeNull()
      expect(s.triggerLine).toBeNull()
      expect(s.triggerColumn).toBeNull()
      expect(s.isLoading).toBe(false)
    })

    it('leaves enabled and debounceMs untouched', () => {
      useCompletionStore.setState({ enabled: false, debounceMs: 250 })
      useCompletionStore.getState().clear()
      const s = useCompletionStore.getState()
      expect(s.enabled).toBe(false)
      expect(s.debounceMs).toBe(250)
    })

    it('is idempotent when already empty', () => {
      useCompletionStore.getState().clear()
      useCompletionStore.getState().clear()
      const s = useCompletionStore.getState()
      expect(s.ghostText).toBeNull()
      expect(s.triggerLine).toBeNull()
      expect(s.triggerColumn).toBeNull()
      expect(s.isLoading).toBe(false)
    })
  })

  describe('lifecycle sequence', () => {
    it('models a full request -> result -> accept/clear flow', () => {
      const store = useCompletionStore.getState

      // 1. user types, completion request kicks off
      store().setLoading(true)
      expect(store().isLoading).toBe(true)

      // 2. suggestion arrives and supersedes the loading flag
      store().setGhostText('autocompleted();', 4, 9)
      expect(store().isLoading).toBe(false)
      expect(store().ghostText).toBe('autocompleted();')
      expect(store().triggerLine).toBe(4)
      expect(store().triggerColumn).toBe(9)

      // 3. user accepts or moves on -> state cleared
      store().clear()
      expect(store().ghostText).toBeNull()
      expect(store().triggerLine).toBeNull()
      expect(store().triggerColumn).toBeNull()
    })
  })
})
