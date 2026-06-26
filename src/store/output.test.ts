import { beforeEach, describe, expect, it } from 'vitest'
import {
  useOutputStore,
  getChannelOutput,
  type OutputLine,
  type OutputLineType,
} from './output'

/* ──────────────────────────────────────────────────────────
 * Notes on the store under test (src/store/output.ts):
 *   - State: channels: Map<string, OutputLine[]>, activeChannel: string
 *   - Actions: appendOutput, addOutput (alias), clearChannel, setActiveChannel
 *   - Selector: getChannelOutput(state, channel)
 *   - Constants (not exported): MAX_LINES_PER_CHANNEL = 1000,
 *     DEFAULT_CHANNELS = ['Orion','Git','Extensions','Tasks','TypeScript','ESLint']
 *   - Module-level lineIdCounter is monotonically increasing across the whole
 *     module lifetime (NOT reset per test). Tests therefore assert on relative
 *     ordering / uniqueness of ids, never absolute id values.
 * ──────────────────────────────────────────────────────── */

const store = useOutputStore

const DEFAULT_CHANNELS = ['Orion', 'Git', 'Extensions', 'Tasks', 'TypeScript', 'ESLint']
const MAX_LINES = 1000

/** Build a fresh default channel map matching the store's initial state. */
function freshChannels(): Map<string, OutputLine[]> {
  const m = new Map<string, OutputLine[]>()
  for (const ch of DEFAULT_CHANNELS) m.set(ch, [])
  return m
}

/** Convenience accessor for a channel's lines via the public selector. */
function linesOf(channel: string): OutputLine[] {
  return getChannelOutput(store.getState(), channel)
}

beforeEach(() => {
  // Reset only the data fields; keep the action implementations intact.
  // Do NOT use replace:true.
  store.setState({ channels: freshChannels(), activeChannel: 'Orion' })
})

/* ──────────────────────────────────────────────────────────
 * Initial / reset state
 * ──────────────────────────────────────────────────────── */

describe('initial state', () => {
  it('initializes all default channels as empty arrays', () => {
    const { channels } = store.getState()
    expect([...channels.keys()].sort()).toEqual([...DEFAULT_CHANNELS].sort())
    for (const ch of DEFAULT_CHANNELS) {
      expect(channels.get(ch)).toEqual([])
    }
  })

  it('defaults the active channel to "Orion"', () => {
    expect(store.getState().activeChannel).toBe('Orion')
  })
})

/* ──────────────────────────────────────────────────────────
 * getChannelOutput selector
 * ──────────────────────────────────────────────────────── */

describe('getChannelOutput', () => {
  it('returns the stored lines for an existing channel', () => {
    store.getState().appendOutput('Git', 'hello')
    const lines = getChannelOutput(store.getState(), 'Git')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('hello')
  })

  it('returns an empty array for an unknown channel (no throw)', () => {
    expect(getChannelOutput(store.getState(), 'DoesNotExist')).toEqual([])
  })
})

/* ──────────────────────────────────────────────────────────
 * appendOutput
 * ──────────────────────────────────────────────────────── */

describe('appendOutput', () => {
  it('appends a single line with default type "info"', () => {
    store.getState().appendOutput('Git', 'first line')
    const lines = linesOf('Git')
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('first line')
    expect(lines[0].type).toBe('info')
    expect(typeof lines[0].id).toBe('number')
    expect(typeof lines[0].timestamp).toBe('number')
  })

  it('honors an explicit line type', () => {
    const types: OutputLineType[] = ['info', 'warn', 'error', 'success']
    for (const t of types) {
      store.getState().appendOutput('Tasks', `msg-${t}`, t)
    }
    const lines = linesOf('Tasks')
    expect(lines.map((l) => l.type)).toEqual(types)
  })

  it('splits multi-line text on \\n into one OutputLine per line', () => {
    store.getState().appendOutput('Git', 'a\nb\nc', 'warn')
    const lines = linesOf('Git')
    expect(lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
    expect(lines.every((l) => l.type === 'warn')).toBe(true)
  })

  it('produces an empty-string line for a trailing newline (pins current split behavior)', () => {
    store.getState().appendOutput('Git', 'a\n')
    expect(linesOf('Git').map((l) => l.text)).toEqual(['a', ''])
  })

  it('treats an empty string as a single empty line (pins current behavior)', () => {
    store.getState().appendOutput('Git', '')
    expect(linesOf('Git').map((l) => l.text)).toEqual([''])
  })

  it('accumulates across multiple calls preserving order', () => {
    store.getState().appendOutput('Git', 'one')
    store.getState().appendOutput('Git', 'two')
    store.getState().appendOutput('Git', 'three')
    expect(linesOf('Git').map((l) => l.text)).toEqual(['one', 'two', 'three'])
  })

  it('assigns strictly increasing, unique ids', () => {
    store.getState().appendOutput('Git', 'x\ny\nz')
    const ids = linesOf('Git').map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBeGreaterThan(ids[i - 1])
    }
  })

  it('creates a brand new channel on demand', () => {
    expect(store.getState().channels.has('Custom')).toBe(false)
    store.getState().appendOutput('Custom', 'created')
    expect(store.getState().channels.has('Custom')).toBe(true)
    expect(linesOf('Custom').map((l) => l.text)).toEqual(['created'])
  })

  it('replaces the channels Map (immutability) but writes one channel', () => {
    const before = store.getState().channels
    store.getState().appendOutput('Git', 'change')
    const after = store.getState().channels
    expect(after).not.toBe(before)
    // Other channels are carried over untouched.
    expect(after.get('Tasks')).toEqual([])
  })

  it('does not mutate the previous channel array reference', () => {
    store.getState().appendOutput('Git', 'one')
    const firstArr = linesOf('Git')
    store.getState().appendOutput('Git', 'two')
    const secondArr = linesOf('Git')
    expect(secondArr).not.toBe(firstArr)
    expect(firstArr).toHaveLength(1) // old snapshot unchanged
    expect(secondArr).toHaveLength(2)
  })
})

/* ──────────────────────────────────────────────────────────
 * Line cap (MAX_LINES_PER_CHANNEL = 1000)
 * ──────────────────────────────────────────────────────── */

describe('line cap', () => {
  it('keeps exactly MAX_LINES when exceeded, dropping oldest first', () => {
    // Append 1200 lines in one multi-line call.
    const text = Array.from({ length: MAX_LINES + 200 }, (_, i) => `line-${i}`).join('\n')
    store.getState().appendOutput('Git', text)

    const lines = linesOf('Git')
    expect(lines).toHaveLength(MAX_LINES)
    // Oldest 200 dropped: first retained should be line-200, last line-1199.
    expect(lines[0].text).toBe('line-200')
    expect(lines[lines.length - 1].text).toBe(`line-${MAX_LINES + 200 - 1}`)
  })

  it('does not trim when exactly at the cap', () => {
    const text = Array.from({ length: MAX_LINES }, (_, i) => `l${i}`).join('\n')
    store.getState().appendOutput('Tasks', text)
    const lines = linesOf('Tasks')
    expect(lines).toHaveLength(MAX_LINES)
    expect(lines[0].text).toBe('l0')
  })

  it('trims across the boundary spanning multiple appends', () => {
    store.getState().appendOutput('Extensions', Array.from({ length: 999 }, (_, i) => `a${i}`).join('\n'))
    store.getState().appendOutput('Extensions', 'b0\nb1\nb2') // 999 + 3 = 1002 -> trim to 1000
    const lines = linesOf('Extensions')
    expect(lines).toHaveLength(MAX_LINES)
    // First 2 of the original 999 dropped.
    expect(lines[0].text).toBe('a2')
    expect(lines[lines.length - 1].text).toBe('b2')
  })
})

/* ──────────────────────────────────────────────────────────
 * addOutput (alias)
 * ──────────────────────────────────────────────────────── */

describe('addOutput alias', () => {
  it('behaves like appendOutput for a simple message', () => {
    store.getState().addOutput('Git', 'aliased')
    expect(linesOf('Git').map((l) => l.text)).toEqual(['aliased'])
    expect(linesOf('Git')[0].type).toBe('info')
  })

  it('forwards the level argument as the line type', () => {
    store.getState().addOutput('Git', 'warn-msg', 'warn')
    store.getState().addOutput('Git', 'error-msg', 'error')
    expect(linesOf('Git').map((l) => l.type)).toEqual(['warn', 'error'])
  })

  it('also splits multi-line messages', () => {
    store.getState().addOutput('Git', 'p\nq')
    expect(linesOf('Git').map((l) => l.text)).toEqual(['p', 'q'])
  })
})

/* ──────────────────────────────────────────────────────────
 * clearChannel
 * ──────────────────────────────────────────────────────── */

describe('clearChannel', () => {
  it('empties a channel that had lines', () => {
    store.getState().appendOutput('Git', 'a\nb\nc')
    expect(linesOf('Git')).toHaveLength(3)
    store.getState().clearChannel('Git')
    expect(linesOf('Git')).toEqual([])
  })

  it('leaves other channels untouched', () => {
    store.getState().appendOutput('Git', 'g')
    store.getState().appendOutput('Tasks', 't')
    store.getState().clearChannel('Git')
    expect(linesOf('Git')).toEqual([])
    expect(linesOf('Tasks').map((l) => l.text)).toEqual(['t'])
  })

  it('creates an empty entry when clearing a previously-unknown channel (pins current behavior)', () => {
    expect(store.getState().channels.has('Ghost')).toBe(false)
    store.getState().clearChannel('Ghost')
    expect(store.getState().channels.has('Ghost')).toBe(true)
    expect(linesOf('Ghost')).toEqual([])
  })

  it('replaces the channels Map reference (immutability)', () => {
    const before = store.getState().channels
    store.getState().clearChannel('Git')
    expect(store.getState().channels).not.toBe(before)
  })
})

/* ──────────────────────────────────────────────────────────
 * setActiveChannel
 * ──────────────────────────────────────────────────────── */

describe('setActiveChannel', () => {
  it('updates the active channel', () => {
    store.getState().setActiveChannel('TypeScript')
    expect(store.getState().activeChannel).toBe('TypeScript')
  })

  it('accepts an arbitrary channel name without validation (pins current behavior)', () => {
    store.getState().setActiveChannel('NotARealChannel')
    expect(store.getState().activeChannel).toBe('NotARealChannel')
  })

  it('does not alter channel contents', () => {
    store.getState().appendOutput('Git', 'keep')
    store.getState().setActiveChannel('Git')
    expect(linesOf('Git').map((l) => l.text)).toEqual(['keep'])
  })
})
