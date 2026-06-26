/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useOutputChannelsStore,
  parseAnsi,
  stripAnsi,
  logToChannel,
  createOutputChannelAPI,
  type LogLevel,
} from './outputChannels'

/* ──────────────────────────────────────────────────────────────────────────
 * Notes on the store under test
 * --------------------------------------------------------------------------
 * - Module-level zustand singleton; we drive it via `.getState()`.
 * - The store bootstraps 8 DEFAULT_CHANNEL_NAMES on creation. We cannot easily
 *   reconstruct those exact objects here (createOutputChannel is not exported),
 *   so beforeEach resets `channels` to a known baseline containing only a fresh
 *   "Orion" channel (id "orion", which is also the default activeChannelId).
 *   Tests that need more channels create them explicitly.
 * - No IPC / window.electron namespace is referenced by the store. It DOES use
 *   navigator.clipboard (wrapped in try/catch) and React imports, hence jsdom.
 * - Fake timers are NOT used: timestamps are asserted via format regex to stay
 *   timezone-independent (formatTimestamp uses local getHours()).
 * ──────────────────────────────────────────────────────────────────────────*/

const store = useOutputChannelsStore

beforeEach(() => {
  // Reset only data fields (no replace:true), keep actions intact.
  store.setState({
    channels: {},
    activeChannelId: 'orion',
    autoScroll: true,
    wordWrap: true,
    showTimestamps: false,
    filterLevel: 'info',
    searchQuery: '',
    searchMatches: [],
  })
  // Recreate the default active channel so id "orion" exists and is active.
  store.getState().createChannel({ name: 'Orion' })
})

/* ──────────────────────────────────────────────────────────────────────────
 * parseAnsi / stripAnsi — parsing math
 * ──────────────────────────────────────────────────────────────────────────*/

describe('parseAnsi', () => {
  it('splits text around an SGR color code and resets on code 0', () => {
    const segs = parseAnsi('\x1b[31mred\x1b[0m normal')
    expect(segs).toHaveLength(2)
    expect(segs[0]).toMatchObject({ text: 'red', fg: '#cd3131' })
    // After reset (code 0), fg must be cleared.
    expect(segs[1]).toMatchObject({ text: ' normal' })
    expect(segs[1].fg).toBeUndefined()
  })

  it('applies multiple codes in a single escape (bold + fg)', () => {
    const segs = parseAnsi('\x1b[1;34mhi')
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ text: 'hi', bold: true, fg: '#2472c8' })
  })

  it('handles background colors and attribute resets (22/24/39/49)', () => {
    const segs = parseAnsi('\x1b[41;4mx\x1b[24;39;49my')
    expect(segs[0]).toMatchObject({ text: 'x', bg: '#cd3131', underline: true })
    // 24 clears underline, 39 clears fg (already none), 49 clears bg.
    expect(segs[1].text).toBe('y')
    expect(segs[1].underline).toBe(false)
    expect(segs[1].bg).toBeUndefined()
  })

  it('returns a single plain segment with no styling for unstyled text', () => {
    const segs = parseAnsi('plain')
    expect(segs).toHaveLength(1)
    expect(segs[0].text).toBe('plain')
    expect(segs[0].fg).toBeUndefined()
    expect(segs[0].bold).toBe(false)
  })

  it('returns an empty array for an empty string', () => {
    expect(parseAnsi('')).toEqual([])
  })

  it('does not emit an empty leading segment when text starts with an escape', () => {
    const segs = parseAnsi('\x1b[32monly')
    expect(segs).toHaveLength(1)
    expect(segs[0]).toMatchObject({ text: 'only', fg: '#0dbc79' })
  })
})

describe('stripAnsi', () => {
  it('removes all SGR escape sequences', () => {
    expect(stripAnsi('\x1b[31mred\x1b[0m \x1b[1mbold\x1b[22m')).toBe('red bold')
  })

  it('leaves plain text untouched', () => {
    expect(stripAnsi('no escapes here')).toBe('no escapes here')
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * createChannel / id derivation / language server channel
 * ──────────────────────────────────────────────────────────────────────────*/

describe('createChannel', () => {
  it('derives a slug id from the name (lowercase, non-alphanumerics → "-")', () => {
    const id = store.getState().createChannel({ name: 'My Channel!' })
    expect(id).toBe('my-channel-')
    const ch = store.getState().getChannel(id)
    expect(ch).toBeDefined()
    expect(ch!.name).toBe('My Channel!')
    expect(ch!.lines).toEqual([])
    expect(ch!.disposed).toBe(false)
    expect(ch!.visible).toBe(true)
    expect(ch!.isLanguageServer).toBe(false)
  })

  it('honors a custom maxBufferSize', () => {
    const id = store.getState().createChannel({ name: 'Cap', maxBufferSize: 5 })
    expect(store.getState().getChannel(id)!.maxBufferSize).toBe(5)
  })

  it('defaults maxBufferSize to 100_000', () => {
    const id = store.getState().createChannel({ name: 'Default Cap' })
    expect(store.getState().getChannel(id)!.maxBufferSize).toBe(100_000)
  })
})

describe('createLanguageServerChannel', () => {
  it('creates a channel named "<server> Language Server" flagged isLanguageServer', () => {
    const id = store.getState().createLanguageServerChannel('TypeScript')
    expect(id).toBe('typescript-language-server')
    const ch = store.getState().getChannel(id)!
    expect(ch.name).toBe('TypeScript Language Server')
    expect(ch.isLanguageServer).toBe(true)
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * append — single line
 * ──────────────────────────────────────────────────────────────────────────*/

describe('append', () => {
  it('adds one line with default level "info" and stores stripped + raw text', () => {
    store.getState().append('orion', '\x1b[31mhello\x1b[0m')
    const ch = store.getState().getChannel('orion')!
    expect(ch.lines).toHaveLength(1)
    expect(ch.lines[0].level).toBe('info')
    expect(ch.lines[0].text).toBe('hello') // ansi stripped
    expect(ch.lines[0].rawText).toBe('\x1b[31mhello\x1b[0m')
    expect(ch.lines[0].ansiSegments.length).toBeGreaterThan(0)
    expect(ch.lines[0].channelId).toBe('orion')
  })

  it('records the supplied level', () => {
    store.getState().append('orion', 'boom', 'error')
    expect(store.getState().getChannel('orion')!.lines[0].level).toBe('error')
  })

  it('keeps unreadCount at 0 when appending to the active channel', () => {
    store.getState().append('orion', 'a') // orion is active
    expect(store.getState().getChannel('orion')!.unreadCount).toBe(0)
  })

  it('increments unreadCount when appending to a non-active channel', () => {
    const id = store.getState().createChannel({ name: 'Git' })
    store.getState().append(id, 'a')
    store.getState().append(id, 'b')
    expect(store.getState().getChannel(id)!.unreadCount).toBe(2)
  })

  it('updates lastWriteAt to a non-zero timestamp', () => {
    expect(store.getState().getChannel('orion')!.lastWriteAt).toBe(0)
    store.getState().append('orion', 'a')
    expect(store.getState().getChannel('orion')!.lastWriteAt).toBeGreaterThan(0)
  })

  it('is a no-op for an unknown channel', () => {
    const before = store.getState().channels
    store.getState().append('does-not-exist', 'x')
    expect(store.getState().channels).toBe(before)
    expect(store.getState().getChannel('does-not-exist')).toBeUndefined()
  })

  it('is a no-op for a disposed channel', () => {
    const id = store.getState().createChannel({ name: 'Disp' })
    store.getState().disposeChannel(id)
    store.getState().append(id, 'x')
    expect(store.getState().getChannel(id)!.lines).toHaveLength(0)
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * appendLine — multi-line splitting
 * ──────────────────────────────────────────────────────────────────────────*/

describe('appendLine', () => {
  it('splits text on newlines into separate OutputLines', () => {
    store.getState().appendLine('orion', 'a\nb\nc')
    const lines = store.getState().getChannel('orion')!.lines
    expect(lines.map((l) => l.text)).toEqual(['a', 'b', 'c'])
  })

  it('increments unreadCount by the number of split lines for a non-active channel', () => {
    const id = store.getState().createChannel({ name: 'Tasks' })
    store.getState().appendLine(id, 'a\nb\nc')
    expect(store.getState().getChannel(id)!.unreadCount).toBe(3)
  })

  it('keeps unreadCount at 0 for the active channel', () => {
    store.getState().appendLine('orion', 'a\nb')
    expect(store.getState().getChannel('orion')!.unreadCount).toBe(0)
  })

  it('is a no-op for unknown / disposed channels', () => {
    store.getState().appendLine('nope', 'a\nb')
    expect(store.getState().getChannel('nope')).toBeUndefined()
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * Buffer cap / eviction
 * ──────────────────────────────────────────────────────────────────────────*/

describe('max-buffer cap and eviction', () => {
  it('append keeps only the last maxBufferSize lines (FIFO eviction)', () => {
    const id = store.getState().createChannel({ name: 'Ring', maxBufferSize: 3 })
    for (const t of ['a', 'b', 'c', 'd', 'e']) store.getState().append(id, t)
    const lines = store.getState().getChannel(id)!.lines
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => l.text)).toEqual(['c', 'd', 'e'])
    // ids stay monotonically increasing (oldest two evicted).
    expect(lines[0].id).toBeLessThan(lines[1].id)
    expect(lines[1].id).toBeLessThan(lines[2].id)
  })

  it('appendLine trims a single oversized batch down to the cap', () => {
    const id = store.getState().createChannel({ name: 'Batch', maxBufferSize: 2 })
    store.getState().appendLine(id, 'a\nb\nc\nd')
    const ch = store.getState().getChannel(id)!
    expect(ch.lines.map((l) => l.text)).toEqual(['c', 'd'])
    // QUIRK (pinned behavior, not capped): unreadCount counts all split lines
    // (4) even though only 2 survive the buffer cap.
    expect(ch.unreadCount).toBe(4)
  })

  it('does not trim when under the cap', () => {
    const id = store.getState().createChannel({ name: 'Under', maxBufferSize: 10 })
    for (const t of ['a', 'b', 'c']) store.getState().append(id, t)
    expect(store.getState().getChannel(id)!.lines).toHaveLength(3)
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * clear / clearAll
 * ──────────────────────────────────────────────────────────────────────────*/

describe('clear', () => {
  it('empties lines and resets unreadCount', () => {
    const id = store.getState().createChannel({ name: 'C' })
    store.getState().appendLine(id, 'a\nb\nc')
    store.getState().clear(id)
    const ch = store.getState().getChannel(id)!
    expect(ch.lines).toEqual([])
    expect(ch.unreadCount).toBe(0)
  })

  it('is a no-op for an unknown channel', () => {
    const before = store.getState().channels
    store.getState().clear('ghost')
    expect(store.getState().channels).toBe(before)
  })
})

describe('clearAll', () => {
  it('clears lines and unread counts across every channel', () => {
    const a = store.getState().createChannel({ name: 'A' })
    const b = store.getState().createChannel({ name: 'B' })
    store.getState().appendLine(a, 'x\ny')
    store.getState().appendLine(b, 'z')
    store.getState().clearAll()
    for (const id of ['orion', a, b]) {
      const ch = store.getState().getChannel(id)!
      expect(ch.lines).toEqual([])
      expect(ch.unreadCount).toBe(0)
    }
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * Active channel selection & visibility
 * ──────────────────────────────────────────────────────────────────────────*/

describe('setActiveChannel', () => {
  it('switches active channel and zeroes that channel unreadCount', () => {
    const id = store.getState().createChannel({ name: 'Git' })
    store.getState().append(id, 'a') // unread = 1 (non-active)
    store.getState().setActiveChannel(id)
    expect(store.getState().activeChannelId).toBe(id)
    expect(store.getState().getChannel(id)!.unreadCount).toBe(0)
  })

  it('is a no-op for an unknown channel', () => {
    store.getState().setActiveChannel('nope')
    expect(store.getState().activeChannelId).toBe('orion')
  })
})

describe('showChannel / hideChannel', () => {
  it('showChannel makes a channel visible and active', () => {
    const id = store.getState().createChannel({ name: 'Git' })
    store.getState().hideChannel(id)
    expect(store.getState().getChannel(id)!.visible).toBe(false)
    store.getState().showChannel(id)
    expect(store.getState().getChannel(id)!.visible).toBe(true)
    expect(store.getState().activeChannelId).toBe(id)
  })

  it('hideChannel does not change the active channel', () => {
    const id = store.getState().createChannel({ name: 'Git' })
    store.getState().hideChannel(id)
    expect(store.getState().activeChannelId).toBe('orion')
  })

  it('both are no-ops for unknown channels', () => {
    const before = store.getState().channels
    store.getState().showChannel('nope')
    store.getState().hideChannel('nope')
    expect(store.getState().channels).toBe(before)
  })
})

describe('markChannelRead', () => {
  it('zeroes unreadCount without touching active channel or lines', () => {
    const id = store.getState().createChannel({ name: 'Git' })
    store.getState().appendLine(id, 'a\nb')
    expect(store.getState().getChannel(id)!.unreadCount).toBe(2)
    store.getState().markChannelRead(id)
    expect(store.getState().getChannel(id)!.unreadCount).toBe(0)
    expect(store.getState().activeChannelId).toBe('orion')
    expect(store.getState().getChannel(id)!.lines).toHaveLength(2)
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * dispose / remove
 * ──────────────────────────────────────────────────────────────────────────*/

describe('disposeChannel', () => {
  it('marks the channel disposed + hidden but keeps it in the map', () => {
    const id = store.getState().createChannel({ name: 'Git' })
    store.getState().disposeChannel(id)
    const ch = store.getState().getChannel(id)!
    expect(ch.disposed).toBe(true)
    expect(ch.visible).toBe(false)
  })

  it('is a no-op for unknown channels', () => {
    const before = store.getState().channels
    store.getState().disposeChannel('nope')
    expect(store.getState().channels).toBe(before)
  })
})

describe('removeChannel', () => {
  it('deletes the channel from the map', () => {
    const id = store.getState().createChannel({ name: 'Git' })
    store.getState().removeChannel(id)
    expect(store.getState().getChannel(id)).toBeUndefined()
  })

  it('reassigns activeChannelId to the first remaining channel when removing the active one', () => {
    const git = store.getState().createChannel({ name: 'Git' })
    store.getState().setActiveChannel(git)
    store.getState().removeChannel(git)
    // Only "orion" remains.
    expect(store.getState().activeChannelId).toBe('orion')
    expect(Object.keys(store.getState().channels)).toEqual(['orion'])
  })

  it('falls back to "orion" when removing the only/active channel leaves none', () => {
    store.getState().removeChannel('orion')
    expect(store.getState().activeChannelId).toBe('orion')
    expect(store.getState().channels).toEqual({})
  })

  it('leaves activeChannelId unchanged when removing a non-active channel', () => {
    const git = store.getState().createChannel({ name: 'Git' })
    store.getState().removeChannel(git)
    expect(store.getState().activeChannelId).toBe('orion')
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * Filtering by level / search
 * ──────────────────────────────────────────────────────────────────────────*/

describe('getFilteredLines — level filtering', () => {
  function seedLevels(id: string) {
    const levels: LogLevel[] = ['trace', 'debug', 'info', 'warning', 'error']
    for (const lvl of levels) store.getState().append(id, lvl, lvl)
  }

  it('default filterLevel "info" excludes trace/debug (severity < 2)', () => {
    seedLevels('orion')
    const out = store.getState().getFilteredLines('orion').map((l) => l.level)
    expect(out).toEqual(['info', 'warning', 'error'])
  })

  it('filterLevel "trace" includes every level', () => {
    seedLevels('orion')
    store.getState().setFilterLevel('trace')
    expect(store.getState().getFilteredLines('orion')).toHaveLength(5)
  })

  it('filterLevel "error" includes only errors', () => {
    seedLevels('orion')
    store.getState().setFilterLevel('error')
    const out = store.getState().getFilteredLines('orion').map((l) => l.level)
    expect(out).toEqual(['error'])
  })

  it('returns [] for an unknown channel', () => {
    expect(store.getState().getFilteredLines('nope')).toEqual([])
  })
})

describe('getFilteredLines — combined search + level filter', () => {
  it('intersects the level filter with the active searchQuery', () => {
    store.getState().append('orion', 'apple info', 'info')
    store.getState().append('orion', 'apple debug', 'debug') // excluded by level
    store.getState().append('orion', 'banana info', 'info')  // excluded by search
    store.getState().setSearchQuery('apple')
    const out = store.getState().getFilteredLines('orion').map((l) => l.text)
    expect(out).toEqual(['apple info'])
  })
})

describe('setSearchQuery / searchMatches', () => {
  it('computes matching line ids (case-insensitive) for the active channel', () => {
    store.getState().appendLine('orion', 'Hello World\nfoo\nhello again')
    store.getState().setSearchQuery('hello')
    const ch = store.getState().getChannel('orion')!
    const expected = ch.lines
      .filter((l) => l.text.toLowerCase().includes('hello'))
      .map((l) => l.id)
    expect(store.getState().searchMatches).toEqual(expected)
    expect(store.getState().searchMatches).toHaveLength(2)
    expect(store.getState().searchQuery).toBe('hello')
  })

  it('clears query and matches when given an empty string', () => {
    store.getState().appendLine('orion', 'abc')
    store.getState().setSearchQuery('abc')
    expect(store.getState().searchMatches).toHaveLength(1)
    store.getState().setSearchQuery('')
    expect(store.getState().searchQuery).toBe('')
    expect(store.getState().searchMatches).toEqual([])
  })

  it('returns empty matches when the active channel has no lines', () => {
    store.getState().setSearchQuery('whatever')
    expect(store.getState().searchMatches).toEqual([])
    expect(store.getState().searchQuery).toBe('whatever')
  })
})

describe('getSearchResults', () => {
  it('returns ids of lines containing the query (case-insensitive)', () => {
    store.getState().appendLine('orion', 'Error: bad\nok\nanother ERROR')
    const ids = store.getState().getSearchResults('orion', 'error')
    const ch = store.getState().getChannel('orion')!
    const expected = ch.lines
      .filter((l) => l.text.toLowerCase().includes('error'))
      .map((l) => l.id)
    expect(ids).toEqual(expected)
    expect(ids).toHaveLength(2)
  })

  it('returns [] for an empty query or unknown channel', () => {
    store.getState().appendLine('orion', 'x')
    expect(store.getState().getSearchResults('orion', '')).toEqual([])
    expect(store.getState().getSearchResults('nope', 'x')).toEqual([])
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * getChannelNames — ordering & shape
 * ──────────────────────────────────────────────────────────────────────────*/

describe('getChannelNames', () => {
  it('excludes disposed channels', () => {
    const git = store.getState().createChannel({ name: 'Git' })
    store.getState().disposeChannel(git)
    const ids = store.getState().getChannelNames().map((c) => c.id)
    expect(ids).toContain('orion')
    expect(ids).not.toContain(git)
  })

  it('sorts language-server channels after non-language-server channels', () => {
    store.getState().createChannel({ name: 'Git' })
    store.getState().createLanguageServerChannel('TS')
    store.getState().createChannel({ name: 'Tasks' })
    const names = store.getState().getChannelNames()
    const lastIsLS = names[names.length - 1].isLanguageServer
    const lsIndex = names.findIndex((c) => c.isLanguageServer)
    // Every entry from the first LS onward must also be an LS channel.
    expect(lastIsLS).toBe(true)
    for (let i = lsIndex; i < names.length; i++) {
      expect(names[i].isLanguageServer).toBe(true)
    }
  })

  it('exposes unread counts', () => {
    const git = store.getState().createChannel({ name: 'Git' })
    store.getState().appendLine(git, 'a\nb')
    const entry = store.getState().getChannelNames().find((c) => c.id === git)!
    expect(entry.unread).toBe(2)
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * Bulk text output
 * ──────────────────────────────────────────────────────────────────────────*/

describe('copyAllOutput', () => {
  it('returns the stripped line text joined by newlines', () => {
    store.getState().appendLine('orion', 'one\ntwo\nthree')
    expect(store.getState().copyAllOutput('orion')).toBe('one\ntwo\nthree')
  })

  it('returns "" for an unknown channel', () => {
    expect(store.getState().copyAllOutput('nope')).toBe('')
  })
})

describe('getOutputAsText', () => {
  it('prefixes each line with a [HH:MM:SS.mmm] timestamp and [LEVEL] label', () => {
    store.getState().append('orion', 'hello', 'error')
    const text = store.getState().getOutputAsText('orion')
    // Pinned format: "[hh:mm:ss.mmm] [ERROR] hello"
    expect(text).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] \[ERROR\] hello$/)
  })

  it('uses the WARN label for the warning level', () => {
    store.getState().append('orion', 'careful', 'warning')
    expect(store.getState().getOutputAsText('orion')).toMatch(/\[WARN\] careful$/)
  })

  it('returns "" for an unknown channel', () => {
    expect(store.getState().getOutputAsText('nope')).toBe('')
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * UI toggles
 * ──────────────────────────────────────────────────────────────────────────*/

describe('UI toggles & setFilterLevel', () => {
  it('toggleAutoScroll / toggleWordWrap / toggleTimestamps flip their flags', () => {
    expect(store.getState().autoScroll).toBe(true)
    store.getState().toggleAutoScroll()
    expect(store.getState().autoScroll).toBe(false)

    expect(store.getState().wordWrap).toBe(true)
    store.getState().toggleWordWrap()
    expect(store.getState().wordWrap).toBe(false)

    expect(store.getState().showTimestamps).toBe(false)
    store.getState().toggleTimestamps()
    expect(store.getState().showTimestamps).toBe(true)
  })

  it('setFilterLevel updates the filter level', () => {
    store.getState().setFilterLevel('warning')
    expect(store.getState().filterLevel).toBe('warning')
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * Convenience helpers
 * ──────────────────────────────────────────────────────────────────────────*/

describe('logToChannel', () => {
  it('auto-creates a missing channel and appends the line at the given level', () => {
    logToChannel('Brand New', 'first message', 'warning')
    const ch = store.getState().getChannel('brand-new')!
    expect(ch).toBeDefined()
    expect(ch.lines).toHaveLength(1)
    expect(ch.lines[0].text).toBe('first message')
    expect(ch.lines[0].level).toBe('warning')
  })

  it('reuses an existing channel (no duplicate creation)', () => {
    const id = store.getState().createChannel({ name: 'Reuse' })
    logToChannel('Reuse', 'line1')
    logToChannel('Reuse', 'line2')
    const ch = store.getState().getChannel(id)!
    expect(ch.lines.map((l) => l.text)).toEqual(['line1', 'line2'])
  })
})

describe('createOutputChannelAPI', () => {
  it('creates a plain channel and exposes working append/appendLine/clear', () => {
    const api = createOutputChannelAPI('Build')
    expect(api.channelId).toBe('build')
    expect(store.getState().getChannel('build')!.isLanguageServer).toBe(false)

    api.append('chunk')
    api.appendLine('a\nb')
    let ch = store.getState().getChannel('build')!
    expect(ch.lines.map((l) => l.text)).toEqual(['chunk', 'a', 'b'])

    api.clear()
    expect(store.getState().getChannel('build')!.lines).toEqual([])
  })

  it('creates a language-server channel when { log: true }', () => {
    const api = createOutputChannelAPI('Pyright', { log: true })
    expect(api.channelId).toBe('pyright-language-server')
    expect(store.getState().getChannel(api.channelId)!.isLanguageServer).toBe(true)
  })

  it('maps level helpers to the correct LogLevel', () => {
    const api = createOutputChannelAPI('Levels')
    api.trace('t')
    api.debug('d')
    api.info('i')
    api.warn('w')
    api.error('e')
    const levels = store.getState().getChannel('levels')!.lines.map((l) => l.level)
    expect(levels).toEqual(['trace', 'debug', 'info', 'warning', 'error'])
  })

  it('replace() clears existing output then writes the new value', () => {
    const api = createOutputChannelAPI('Rep')
    api.appendLine('old1\nold2')
    api.replace('fresh')
    expect(store.getState().getChannel('rep')!.lines.map((l) => l.text)).toEqual(['fresh'])
  })

  it('dispose() marks the underlying channel disposed', () => {
    const api = createOutputChannelAPI('Temp')
    api.dispose()
    expect(store.getState().getChannel(api.channelId)!.disposed).toBe(true)
  })
})
