/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  useTerminalStore,
  BUILTIN_PROFILES,
  createDefaultTerminalEnv,
  type ShellProfile,
} from './terminal'
import type { TerminalSession } from '@shared/types'

/**
 * Tests for the `useTerminalStore` Zustand store (src/store/terminal.ts).
 *
 * IPC / EVENT MAP
 * ---------------
 * This store performs NO Electron IPC and registers NO event listeners. There is
 * no `window.api` / `window.electron` / `window.electronAPI` usage anywhere in the
 * source. The only host interaction is `localStorage` (read/write of the
 * "orion-terminal-sessions" key inside `saveAllSessions` / `restoreSessions`),
 * hence the `@vitest-environment jsdom` directive above.
 *
 * Because there is no real PTY layer in this store, the lifecycle verbs from the
 * brief are pinned onto the store's actual actions:
 *   - "create a terminal session"  -> addSession
 *   - "write input"                -> addHistoryEntry (command history is the only
 *                                     write-side state the store models)
 *   - "receive / append output"    -> appendToScrollBuffer
 *   - "resize"                      -> setSplitRatio (pane sizing; the store has no
 *                                     cols/rows resize concept)
 *   - "active terminal selection"  -> setActiveSession / addSession side-effect
 *   - "kill / close a terminal"    -> removeSession (+ active reassignment)
 *
 * The store is a module-level singleton. We reset every data field in beforeEach
 * via setState (NOT replace:true) and clear localStorage.
 */

const store = useTerminalStore

function makeSession(over: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'term-1',
    name: 'Terminal 1',
    type: 'shell',
    ...over,
  }
}

function reset() {
  store.setState({
    sessions: [],
    activeSessionId: null,
    maximizedSessionId: null,
    profiles: BUILTIN_PROFILES,
    defaultProfileId: null,
    customProfiles: [],
    commandHistory: {},
    sessionEnvs: {},
    scrollBuffers: {},
    splitConfigs: {},
  })
}

beforeEach(() => {
  localStorage.clear()
  reset()
})

// ---------------------------------------------------------------------------
// Session creation + active selection
// ---------------------------------------------------------------------------

describe('addSession (create terminal)', () => {
  it('appends the session and makes the new session active', () => {
    store.getState().addSession(makeSession({ id: 'a', name: 'A' }))

    const { sessions, activeSessionId } = store.getState()
    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({ id: 'a', name: 'A', type: 'shell' })
    expect(activeSessionId).toBe('a')
  })

  it('keeps insertion order and switches active to each newly added session', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().addSession(makeSession({ id: 'b' }))
    store.getState().addSession(makeSession({ id: 'c' }))

    expect(store.getState().sessions.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    // adding always activates the latest
    expect(store.getState().activeSessionId).toBe('c')
  })
})

describe('setActiveSession', () => {
  it('changes the active session to an existing id', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().addSession(makeSession({ id: 'b' }))

    store.getState().setActiveSession('a')
    expect(store.getState().activeSessionId).toBe('a')
  })

  it('does not validate the id (pins current permissive behavior)', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    // SUSPECTED-BUG: setActiveSession accepts an id with no matching session,
    // leaving activeSessionId pointing at a non-existent terminal.
    store.getState().setActiveSession('ghost')
    expect(store.getState().activeSessionId).toBe('ghost')
  })
})

describe('renameSession', () => {
  it('renames only the matching session', () => {
    store.getState().addSession(makeSession({ id: 'a', name: 'A' }))
    store.getState().addSession(makeSession({ id: 'b', name: 'B' }))

    store.getState().renameSession('a', 'Renamed')

    const sessions = store.getState().sessions
    expect(sessions.find((s) => s.id === 'a')?.name).toBe('Renamed')
    expect(sessions.find((s) => s.id === 'b')?.name).toBe('B')
  })

  it('is a no-op for an unknown id', () => {
    store.getState().addSession(makeSession({ id: 'a', name: 'A' }))
    store.getState().renameSession('nope', 'X')
    expect(store.getState().sessions.find((s) => s.id === 'a')?.name).toBe('A')
  })
})

describe('setMaximizedSession', () => {
  it('sets and clears the maximized session id', () => {
    store.getState().setMaximizedSession('a')
    expect(store.getState().maximizedSessionId).toBe('a')
    store.getState().setMaximizedSession(null)
    expect(store.getState().maximizedSessionId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// "Write input" -> command history
// ---------------------------------------------------------------------------

describe('command history (write-side input)', () => {
  it('appends entries per session and preserves order', () => {
    store.getState().addHistoryEntry('s1', { command: 'ls', timestamp: 1 })
    store.getState().addHistoryEntry('s1', { command: 'pwd', timestamp: 2 })

    expect(store.getState().getHistory('s1').map((e) => e.command)).toEqual([
      'ls',
      'pwd',
    ])
  })

  it('isolates history between sessions', () => {
    store.getState().addHistoryEntry('s1', { command: 'a', timestamp: 1 })
    store.getState().addHistoryEntry('s2', { command: 'b', timestamp: 1 })

    expect(store.getState().getHistory('s1')).toHaveLength(1)
    expect(store.getState().getHistory('s2')[0].command).toBe('b')
  })

  it('getHistory returns an empty array for an unknown session', () => {
    expect(store.getState().getHistory('unknown')).toEqual([])
  })

  it('clearHistory empties the session history without affecting others', () => {
    store.getState().addHistoryEntry('s1', { command: 'a', timestamp: 1 })
    store.getState().addHistoryEntry('s2', { command: 'b', timestamp: 1 })

    store.getState().clearHistory('s1')

    expect(store.getState().getHistory('s1')).toEqual([])
    expect(store.getState().getHistory('s2')).toHaveLength(1)
  })

  it('searchHistory filters case-insensitively and returns all when query empty', () => {
    store.getState().addHistoryEntry('s1', { command: 'git STATUS', timestamp: 1 })
    store.getState().addHistoryEntry('s1', { command: 'npm test', timestamp: 2 })

    expect(
      store.getState().searchHistory('s1', 'status').map((e) => e.command)
    ).toEqual(['git STATUS'])
    expect(store.getState().searchHistory('s1', '')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// "Receive output" -> scroll buffer
// ---------------------------------------------------------------------------

describe('scroll buffer (output append)', () => {
  it('appends output lines in order', () => {
    store.getState().appendToScrollBuffer('s1', ['line 1', 'line 2'])
    store.getState().appendToScrollBuffer('s1', ['line 3'])

    expect(store.getState().scrollBuffers['s1']).toEqual([
      'line 1',
      'line 2',
      'line 3',
    ])
  })

  it('appends to an unknown session id by creating its buffer', () => {
    store.getState().appendToScrollBuffer('fresh', ['hello'])
    expect(store.getState().scrollBuffers['fresh']).toEqual(['hello'])
  })

  it('caps the buffer at 10,000 lines, keeping the most recent', () => {
    const first = Array.from({ length: 9_999 }, (_, i) => `old-${i}`)
    store.getState().appendToScrollBuffer('s1', first)
    // push 3 more -> total 10,002, should trim oldest 2
    store.getState().appendToScrollBuffer('s1', ['x', 'y', 'z'])

    const buf = store.getState().scrollBuffers['s1']
    expect(buf).toHaveLength(10_000)
    // oldest two ('old-0','old-1') dropped; tail preserved
    expect(buf[0]).toBe('old-2')
    expect(buf[buf.length - 1]).toBe('z')
  })

  it('clearScrollBuffer resets to empty array', () => {
    store.getState().appendToScrollBuffer('s1', ['a', 'b'])
    store.getState().clearScrollBuffer('s1')
    expect(store.getState().scrollBuffers['s1']).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// "Kill / close" -> removeSession with active reassignment + cleanup
// ---------------------------------------------------------------------------

describe('removeSession (kill / close terminal)', () => {
  it('removes the session and reassigns active to the last remaining session', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().addSession(makeSession({ id: 'b' }))
    store.getState().addSession(makeSession({ id: 'c' }))
    // active is 'c'
    store.getState().removeSession('c')

    expect(store.getState().sessions.map((s) => s.id)).toEqual(['a', 'b'])
    // reassigned to last remaining
    expect(store.getState().activeSessionId).toBe('b')
  })

  it('leaves active untouched when a non-active session is removed', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().addSession(makeSession({ id: 'b' }))
    store.getState().setActiveSession('a')

    store.getState().removeSession('b')
    expect(store.getState().activeSessionId).toBe('a')
  })

  it('sets active to null when the last session is removed', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().removeSession('a')

    expect(store.getState().sessions).toHaveLength(0)
    expect(store.getState().activeSessionId).toBeNull()
  })

  it('clears maximized session when the maximized terminal is removed', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().setMaximizedSession('a')

    store.getState().removeSession('a')
    expect(store.getState().maximizedSessionId).toBeNull()
  })

  it('cleans up history, env, scroll buffer and split config for the removed session', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().addHistoryEntry('a', { command: 'ls', timestamp: 1 })
    store.getState().setSessionEnv('a', createDefaultTerminalEnv())
    store.getState().appendToScrollBuffer('a', ['out'])
    store.getState().setSplitConfig('a', {
      direction: 'horizontal',
      ratio: 0.5,
      secondSessionId: 'b',
    })

    store.getState().removeSession('a')

    expect(store.getState().commandHistory).not.toHaveProperty('a')
    expect(store.getState().sessionEnvs).not.toHaveProperty('a')
    expect(store.getState().scrollBuffers).not.toHaveProperty('a')
    expect(store.getState().splitConfigs).not.toHaveProperty('a')
  })

  it('removes any split that referenced the killed session as the second pane', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().addSession(makeSession({ id: 'b' }))
    // 'a' is split with 'b' as the second pane
    store.getState().splitSession('a', 'b', 'vertical', 0.5)

    // kill the second-pane terminal
    store.getState().removeSession('b')

    expect(store.getState().splitConfigs).not.toHaveProperty('a')
  })

  it('is a no-op for an unknown id (edge case)', () => {
    store.getState().addSession(makeSession({ id: 'a' }))
    store.getState().removeSession('does-not-exist')

    expect(store.getState().sessions.map((s) => s.id)).toEqual(['a'])
    expect(store.getState().activeSessionId).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// Multiple sessions integration
// ---------------------------------------------------------------------------

describe('multiple sessions lifecycle', () => {
  it('supports creating several terminals then closing them one at a time', () => {
    const ids = ['t1', 't2', 't3', 't4']
    ids.forEach((id) => store.getState().addSession(makeSession({ id })))
    expect(store.getState().sessions).toHaveLength(4)

    store.getState().removeSession('t2')
    store.getState().removeSession('t4') // active was t4
    expect(store.getState().sessions.map((s) => s.id)).toEqual(['t1', 't3'])
    expect(store.getState().activeSessionId).toBe('t3')

    store.getState().removeSession('t1')
    store.getState().removeSession('t3')
    expect(store.getState().sessions).toHaveLength(0)
    expect(store.getState().activeSessionId).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// "Resize" -> split pane sizing
// ---------------------------------------------------------------------------

describe('split terminals (pane sizing / resize)', () => {
  it('splitSession creates a split config with the given direction and ratio', () => {
    store.getState().splitSession('a', 'b', 'horizontal', 0.3)
    expect(store.getState().splitConfigs['a']).toEqual({
      direction: 'horizontal',
      ratio: 0.3,
      secondSessionId: 'b',
    })
  })

  it('splitSession defaults the ratio to 0.5', () => {
    store.getState().splitSession('a', 'b', 'vertical')
    expect(store.getState().splitConfigs['a'].ratio).toBe(0.5)
  })

  it('splitSession refuses to re-split an already-split session', () => {
    store.getState().splitSession('a', 'b', 'vertical', 0.4)
    store.getState().splitSession('a', 'c', 'horizontal', 0.9)

    // original config preserved, second call ignored
    expect(store.getState().splitConfigs['a']).toEqual({
      direction: 'vertical',
      ratio: 0.4,
      secondSessionId: 'b',
    })
  })

  it('setSplitRatio clamps the ratio between 0.1 and 0.9', () => {
    store.getState().splitSession('a', 'b', 'vertical', 0.5)

    store.getState().setSplitRatio('a', 5)
    expect(store.getState().splitConfigs['a'].ratio).toBe(0.9)

    store.getState().setSplitRatio('a', -1)
    expect(store.getState().splitConfigs['a'].ratio).toBe(0.1)

    store.getState().setSplitRatio('a', 0.42)
    expect(store.getState().splitConfigs['a'].ratio).toBeCloseTo(0.42)
  })

  it('setSplitRatio is a no-op when the session is not split', () => {
    store.getState().setSplitRatio('nope', 0.5)
    expect(store.getState().splitConfigs).not.toHaveProperty('nope')
  })

  it('unsplitSession and setSplitConfig(null) both remove the split entry', () => {
    store.getState().splitSession('a', 'b', 'vertical', 0.5)
    store.getState().splitSession('x', 'y', 'horizontal', 0.5)

    store.getState().unsplitSession('a')
    expect(store.getState().splitConfigs).not.toHaveProperty('a')

    store.getState().setSplitConfig('x', null)
    expect(store.getState().splitConfigs).not.toHaveProperty('x')
  })

  it('setSplitConfig stores a provided config', () => {
    store.getState().setSplitConfig('a', {
      direction: 'horizontal',
      ratio: 0.7,
      secondSessionId: 'z',
    })
    expect(store.getState().splitConfigs['a'].secondSessionId).toBe('z')
  })
})

// ---------------------------------------------------------------------------
// Shell profiles
// ---------------------------------------------------------------------------

describe('shell profiles', () => {
  const custom: ShellProfile = {
    id: 'my-shell',
    name: 'My Shell',
    path: '/usr/bin/myshell',
    platform: null,
  }

  it('addCustomProfile marks it custom and merges it into profiles', () => {
    store.getState().addCustomProfile(custom)

    const { customProfiles, profiles } = store.getState()
    expect(customProfiles).toHaveLength(1)
    expect(customProfiles[0].isCustom).toBe(true)
    expect(profiles).toHaveLength(BUILTIN_PROFILES.length + 1)
    expect(store.getState().getProfileById('my-shell')?.name).toBe('My Shell')
  })

  it('addCustomProfile supports adding several profiles', () => {
    store.getState().addCustomProfile(custom)
    store.getState().addCustomProfile({ ...custom, id: 'second' })

    expect(store.getState().customProfiles.map((p) => p.id)).toEqual([
      'my-shell',
      'second',
    ])
    expect(store.getState().profiles).toHaveLength(BUILTIN_PROFILES.length + 2)
  })

  it('updateCustomProfile patches fields and reflects in profiles', () => {
    store.getState().addCustomProfile(custom)
    store.getState().updateCustomProfile('my-shell', { name: 'Updated' })

    expect(store.getState().getProfileById('my-shell')?.name).toBe('Updated')
  })

  it('removeCustomProfile removes it and clears defaultProfileId if it pointed there', () => {
    store.getState().addCustomProfile(custom)
    store.getState().setDefaultProfile('my-shell')
    expect(store.getState().defaultProfileId).toBe('my-shell')

    store.getState().removeCustomProfile('my-shell')
    expect(store.getState().customProfiles).toHaveLength(0)
    expect(store.getState().profiles).toHaveLength(BUILTIN_PROFILES.length)
    expect(store.getState().defaultProfileId).toBeNull()
  })

  it('removeCustomProfile keeps an unrelated defaultProfileId', () => {
    store.getState().addCustomProfile(custom)
    store.getState().setDefaultProfile('powershell')
    store.getState().removeCustomProfile('my-shell')
    expect(store.getState().defaultProfileId).toBe('powershell')
  })

  it('getProfilesForPlatform returns matching-platform plus cross-platform profiles', () => {
    store.getState().addCustomProfile(custom) // platform: null
    const winProfiles = store.getState().getProfilesForPlatform('windows')

    expect(winProfiles.every((p) => p.platform === 'windows' || p.platform === null)).toBe(
      true
    )
    // builtins designed for macos/linux are excluded
    expect(winProfiles.some((p) => p.id === 'zsh')).toBe(false)
    // windows builtin + cross-platform custom included
    expect(winProfiles.some((p) => p.id === 'powershell')).toBe(true)
    expect(winProfiles.some((p) => p.id === 'my-shell')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Session environment overrides
// ---------------------------------------------------------------------------

describe('session environment', () => {
  it('setSessionEnv stores the full env object', () => {
    const env = { ...createDefaultTerminalEnv(), inheritEnv: false }
    store.getState().setSessionEnv('s1', env)
    expect(store.getState().sessionEnvs['s1']).toEqual(env)
  })

  it('updateSessionEnvVar creates a default env on first use and sets the variable', () => {
    store.getState().updateSessionEnvVar('s1', 'FOO', 'bar')
    expect(store.getState().sessionEnvs['s1'].variables).toEqual({ FOO: 'bar' })
    // defaults filled in
    expect(store.getState().sessionEnvs['s1'].inheritEnv).toBe(true)
  })

  it('removeSessionEnvVar deletes a variable, leaving others intact', () => {
    store.getState().updateSessionEnvVar('s1', 'A', '1')
    store.getState().updateSessionEnvVar('s1', 'B', '2')
    store.getState().removeSessionEnvVar('s1', 'A')

    expect(store.getState().sessionEnvs['s1'].variables).toEqual({ B: '2' })
  })

  it('setSessionInheritEnv toggles inheritEnv', () => {
    store.getState().setSessionInheritEnv('s1', false)
    expect(store.getState().sessionEnvs['s1'].inheritEnv).toBe(false)
  })

  it('addSessionPathEntry / removeSessionPathEntry manage prepend and append lists', () => {
    store.getState().addSessionPathEntry('s1', '/a', 'prepend')
    store.getState().addSessionPathEntry('s1', '/b', 'append')
    store.getState().addSessionPathEntry('s1', '/c', 'prepend')

    expect(store.getState().sessionEnvs['s1'].pathPrepend).toEqual(['/a', '/c'])
    expect(store.getState().sessionEnvs['s1'].pathAppend).toEqual(['/b'])

    store.getState().removeSessionPathEntry('s1', '/a', 'prepend')
    expect(store.getState().sessionEnvs['s1'].pathPrepend).toEqual(['/c'])
  })
})

// ---------------------------------------------------------------------------
// Serialization (localStorage round-trip)
// ---------------------------------------------------------------------------

describe('saveAllSessions / restoreSessions (persistence)', () => {
  const PWSH_PATH = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

  it('persists sessions to localStorage and restores them with associated state', () => {
    store.getState().addSession(
      makeSession({ id: 'p1', name: 'Persisted', type: 'shell', shellPath: PWSH_PATH })
    )
    store.getState().addHistoryEntry('p1', { command: 'echo hi', timestamp: 5 })
    store.getState().appendToScrollBuffer('p1', ['saved output'])
    store.getState().updateSessionEnvVar('p1', 'KEY', 'val')
    store.getState().setSplitConfig('p1', {
      direction: 'vertical',
      ratio: 0.6,
      secondSessionId: 'other',
    })

    store.getState().saveAllSessions()

    // raw write happened
    const raw = localStorage.getItem('orion-terminal-sessions')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed[0].id).toBe('p1')
    // profileId resolved from shellPath -> powershell builtin
    expect(parsed[0].profileId).toBe('powershell')

    // wipe live state, then restore from storage
    reset()
    expect(store.getState().sessions).toHaveLength(0)

    store.getState().restoreSessions()

    const restored = store.getState()
    expect(restored.sessions).toHaveLength(1)
    expect(restored.sessions[0]).toMatchObject({
      id: 'p1',
      name: 'Persisted',
      // shellPath reconstructed from the resolved profile
      shellPath: PWSH_PATH,
    })
    expect(restored.activeSessionId).toBe('p1')
    expect(restored.getHistory('p1').map((e) => e.command)).toEqual(['echo hi'])
    expect(restored.scrollBuffers['p1']).toEqual(['saved output'])
    expect(restored.sessionEnvs['p1'].variables).toEqual({ KEY: 'val' })
    expect(restored.splitConfigs['p1'].ratio).toBe(0.6)
  })

  it('restoreSessions is a no-op when nothing is stored', () => {
    store.getState().addSession(makeSession({ id: 'live' }))
    store.getState().restoreSessions()
    // existing live session left untouched, no throw
    expect(store.getState().sessions.map((s) => s.id)).toEqual(['live'])
  })

  it('restoreSessions tolerates corrupted localStorage data', () => {
    localStorage.setItem('orion-terminal-sessions', '{ not json')
    expect(() => store.getState().restoreSessions()).not.toThrow()
    expect(store.getState().sessions).toHaveLength(0)
  })
})
