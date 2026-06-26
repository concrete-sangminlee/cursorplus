/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  useTerminalSessionStore,
  type TerminalPane,
  type TerminalProfile,
} from './terminalSessions'

/**
 * The store under test is the rich, multi-feature terminal store
 * (terminalSessions.ts), NOT the simpler terminal.ts store.
 *
 * It is a module-level zustand singleton with NO IPC / window.* / event
 * interactions — its only external side effect is localStorage persistence
 * (saveLayout/restoreLayout) and a read of process.cwd() during session
 * creation. Hence we run under jsdom (for localStorage) and clear storage
 * in beforeEach. No window.api / window.electron mocking is required.
 *
 * Data fields are reset via setState({...}) in beforeEach (never replace:true)
 * so the action functions remain attached. The built-in profiles are seeded
 * by the store factory, so we snapshot them once and restore them each test.
 */

const store = () => useTerminalSessionStore.getState()

// Snapshot the genuine seeded built-in profiles before any test mutates them.
const BUILT_IN_PROFILES_SNAPSHOT = structuredClone(
  useTerminalSessionStore.getState().profiles
)

beforeEach(() => {
  localStorage.clear()
  useTerminalSessionStore.setState({
    sessions: {},
    activeSessionId: null,
    panes: {},
    rootPaneId: null,
    profiles: structuredClone(BUILT_IN_PROFILES_SNAPSHOT),
    tabGroups: {},
    backgroundTasks: {},
    linkedGroups: {},
  })
})

/* ── Helpers ─────────────────────────────────────────────── */

// Seed a single root leaf pane directly, since the public API exposes no
// "create root pane" action (splitPane only operates on an existing pane).
function seedRootPane(sessionId: string | null): string {
  const paneId = `pane_root_seed`
  const pane: TerminalPane = {
    id: paneId,
    sessionId,
    splitDirection: null,
    children: [],
    size: 100,
    parentId: null,
  }
  useTerminalSessionStore.setState((s) => ({
    panes: { ...s.panes, [paneId]: pane },
    rootPaneId: paneId,
  }))
  return paneId
}

/* ── Session create / spawn ──────────────────────────────── */

describe('createSession', () => {
  it('creates a running session with defaults and sets it active when none active', () => {
    const id = store().createSession()
    const sess = store().sessions[id]
    expect(sess).toBeDefined()
    expect(sess.id).toBe(id)
    expect(sess.status).toBe('running')
    expect(sess.shellType).toBe('bash')
    expect(sess.pid).toBeNull()
    expect(sess.commandHistory).toEqual([])
    expect(sess.scrollbackBuffer).toEqual([])
    expect(sess.tabGroupId).toBeNull()
    expect(sess.linkedGroup).toBeNull()
    // first session becomes active
    expect(store().activeSessionId).toBe(id)
  })

  it('does not steal active focus from an already-active session', () => {
    const first = store().createSession()
    const second = store().createSession()
    expect(first).not.toBe(second)
    expect(store().activeSessionId).toBe(first)
  })

  it('auto-numbers session names from the current session count', () => {
    const a = store().createSession()
    const b = store().createSession()
    expect(store().sessions[a].name).toBe('Terminal 1')
    expect(store().sessions[b].name).toBe('Terminal 2')
  })

  it('applies a profile shell/name and merges profile env with override env', () => {
    const id = store().createSession({
      profile: 'profile-node',
      env: { EXTRA: '1', NODE_ENV: 'production' },
    })
    const sess = store().sessions[id]
    expect(sess.profile).toBe('profile-node')
    expect(sess.shellType).toBe('bash')
    expect(sess.name).toBe('Node.js')
    // opts.env overrides profile.env on key collision
    expect(sess.env.NODE_ENV).toBe('production')
    expect(sess.env.EXTRA).toBe('1')
  })

  it('explicit opts take precedence over profile defaults', () => {
    const id = store().createSession({
      profile: 'profile-powershell',
      name: 'MyShell',
      shellType: 'cmd',
      cwd: '/tmp/work',
    })
    const sess = store().sessions[id]
    expect(sess.name).toBe('MyShell')
    expect(sess.shellType).toBe('cmd')
    expect(sess.cwd).toBe('/tmp/work')
  })

  it('ignores an unknown profile id but still records it on the session', () => {
    const id = store().createSession({ profile: 'does-not-exist' })
    const sess = store().sessions[id]
    // No matching profile -> falls back to default shell/name
    expect(sess.shellType).toBe('bash')
    expect(sess.name).toBe('Terminal 1')
    // The requested profile id is still stored verbatim
    expect(sess.profile).toBe('does-not-exist')
  })
})

/* ── rename / active selection / status / cwd ────────────── */

describe('session mutation actions', () => {
  it('renameSession updates the name and is a no-op for unknown ids', () => {
    const id = store().createSession()
    store().renameSession(id, 'Renamed')
    expect(store().sessions[id].name).toBe('Renamed')
    const before = store().sessions
    store().renameSession('ghost', 'X')
    expect(store().sessions).toBe(before)
  })

  it('setActiveSession only switches to existing sessions', () => {
    const a = store().createSession()
    const b = store().createSession()
    store().setActiveSession(b)
    expect(store().activeSessionId).toBe(b)
    store().setActiveSession('ghost')
    expect(store().activeSessionId).toBe(b)
    store().setActiveSession(a)
    expect(store().activeSessionId).toBe(a)
  })

  it('updateSessionStatus and setSessionCwd mutate only the target session', () => {
    const id = store().createSession()
    store().updateSessionStatus(id, 'error')
    expect(store().sessions[id].status).toBe('error')
    store().setSessionCwd(id, '/var/log')
    expect(store().sessions[id].cwd).toBe('/var/log')
  })
})

/* ── command history / env ───────────────────────────────── */

describe('command history and env', () => {
  it('pushCommand appends and caps history at MAX_HISTORY (100), keeping newest', () => {
    const id = store().createSession()
    for (let i = 0; i < 150; i++) {
      store().pushCommand(id, `cmd-${i}`)
    }
    const history = store().sessions[id].commandHistory
    expect(history).toHaveLength(100)
    // oldest 50 dropped; window is cmd-50..cmd-149
    expect(history[0]).toBe('cmd-50')
    expect(history[history.length - 1]).toBe('cmd-149')
  })

  it('setSessionEnv adds/overwrites and removeSessionEnv deletes a key', () => {
    const id = store().createSession()
    store().setSessionEnv(id, 'FOO', 'bar')
    expect(store().sessions[id].env.FOO).toBe('bar')
    store().setSessionEnv(id, 'FOO', 'baz')
    expect(store().sessions[id].env.FOO).toBe('baz')
    store().removeSessionEnv(id, 'FOO')
    expect(store().sessions[id].env.FOO).toBeUndefined()
  })

  it('env mutations on a missing session are no-ops', () => {
    const before = store().sessions
    store().setSessionEnv('ghost', 'A', 'B')
    store().removeSessionEnv('ghost', 'A')
    store().pushCommand('ghost', 'x')
    expect(store().sessions).toBe(before)
  })
})

/* ── closeSession + active reassignment ──────────────────── */

describe('closeSession', () => {
  it('removes the session and reassigns active to a remaining session', () => {
    const a = store().createSession()
    const b = store().createSession()
    expect(store().activeSessionId).toBe(a)
    store().closeSession(a)
    expect(store().sessions[a]).toBeUndefined()
    // active was the closed one -> reassigned to a survivor
    expect(store().activeSessionId).toBe(b)
  })

  it('clears active when the last session is closed', () => {
    const a = store().createSession()
    store().closeSession(a)
    expect(store().activeSessionId).toBeNull()
    expect(Object.keys(store().sessions)).toHaveLength(0)
  })

  it('does not change active when a non-active session is closed', () => {
    const a = store().createSession()
    const b = store().createSession()
    store().closeSession(b)
    expect(store().activeSessionId).toBe(a)
  })

  it('is a no-op for an unknown session id', () => {
    const a = store().createSession()
    const before = store()
    store().closeSession('ghost')
    expect(store().sessions).toBe(before.sessions)
    expect(store().activeSessionId).toBe(a)
  })

  it('removes a closed session from its tab group and reassigns the group active', () => {
    const a = store().createSession()
    const b = store().createSession()
    const grp = store().createTabGroup('G')
    store().addSessionToTabGroup(grp, a)
    store().addSessionToTabGroup(grp, b)
    store().setTabGroupActiveSession(grp, a)
    store().closeSession(a)
    const g = store().tabGroups[grp]
    expect(g.sessionIds).toEqual([b])
    expect(g.activeSessionId).toBe(b)
  })

  it('removes a closed session from its linked group and deletes empty groups', () => {
    const a = store().createSession()
    const b = store().createSession()
    const link = store().linkSessions('pair', [a, b])
    store().closeSession(a)
    expect(store().linkedGroups[link].sessionIds).toEqual([b])
    store().closeSession(b)
    // group emptied -> removed entirely
    expect(store().linkedGroups[link]).toBeUndefined()
  })
})

/* ── splits / panes ──────────────────────────────────────── */

describe('splitPane', () => {
  it('returns null when the target pane does not exist', () => {
    expect(store().splitPane('nope', 'horizontal')).toBeNull()
  })

  it('spawns a new session and converts a leaf into a split container', () => {
    const sessA = store().createSession()
    const root = seedRootPane(sessA)
    const sessionCountBefore = Object.keys(store().sessions).length

    const newPaneId = store().splitPane(root, 'vertical')
    expect(newPaneId).not.toBeNull()

    // A brand-new session was spawned for the new pane
    expect(Object.keys(store().sessions).length).toBe(sessionCountBefore + 1)

    const parent = store().panes[root]
    expect(parent.splitDirection).toBe('vertical')
    expect(parent.sessionId).toBeNull()
    expect(parent.children).toHaveLength(2)

    // The new pane is the second child, parented to root
    const newPane = store().panes[newPaneId as string]
    expect(newPane.parentId).toBe(root)
    expect(parent.children[1]).toBe(newPaneId)

    // The first child preserves the original session
    const originalChild = store().panes[parent.children[0]]
    expect(originalChild.sessionId).toBe(sessA)
    expect(originalChild.parentId).toBe(root)
  })

  it('reuses a provided session id instead of spawning a new one', () => {
    const sessA = store().createSession()
    const sessB = store().createSession()
    const root = seedRootPane(sessA)
    const countBefore = Object.keys(store().sessions).length

    const newPaneId = store().splitPane(root, 'horizontal', sessB)
    expect(Object.keys(store().sessions).length).toBe(countBefore)
    expect(store().panes[newPaneId as string].sessionId).toBe(sessB)
  })
})

describe('closeSplitPane', () => {
  it('collapses the parent into the surviving sibling when one child remains', () => {
    const sessA = store().createSession()
    const root = seedRootPane(sessA)
    const newPaneId = store().splitPane(root, 'vertical') as string

    const parent = store().panes[root]
    const survivingChildId = parent.children[0]
    const survivingSession = store().panes[survivingChildId].sessionId

    // Close the newly split-off pane
    store().closeSplitPane(newPaneId)

    expect(store().panes[newPaneId]).toBeUndefined()
    // The other child was promoted into the root, so root holds its session
    // again and is a leaf once more.
    const collapsedRoot = store().panes[root]
    expect(collapsedRoot.sessionId).toBe(survivingSession)
    expect(collapsedRoot.splitDirection).toBeNull()
    expect(collapsedRoot.children).toEqual([])
    // surviving child pane object was removed after promotion
    expect(store().panes[survivingChildId]).toBeUndefined()
  })

  it('recursively removes descendants and clears rootPaneId when root is closed', () => {
    const sessA = store().createSession()
    const root = seedRootPane(sessA)
    store().splitPane(root, 'vertical')
    expect(Object.keys(store().panes).length).toBeGreaterThan(1)

    store().closeSplitPane(root)
    expect(store().panes[root]).toBeUndefined()
    expect(store().rootPaneId).toBeNull()
    // all descendant panes removed too
    expect(Object.keys(store().panes)).toHaveLength(0)
  })

  it('is a no-op for an unknown pane id', () => {
    const root = seedRootPane(store().createSession())
    const before = store().panes
    store().closeSplitPane('ghost')
    expect(store().panes).toBe(before)
  })
})

describe('resizePane', () => {
  it('clamps size to the 5..95 range', () => {
    const root = seedRootPane(store().createSession())
    store().resizePane(root, 1000)
    expect(store().panes[root].size).toBe(95)
    store().resizePane(root, -50)
    expect(store().panes[root].size).toBe(5)
  })

  it('adjusts the sibling to complement to 100', () => {
    const sessA = store().createSession()
    const root = seedRootPane(sessA)
    const newPaneId = store().splitPane(root, 'vertical') as string
    const siblingId = store().panes[root].children.find((id) => id !== newPaneId) as string

    store().resizePane(newPaneId, 30)
    expect(store().panes[newPaneId].size).toBe(30)
    expect(store().panes[siblingId].size).toBe(70)
  })

  it('is a no-op for an unknown pane id', () => {
    const before = store().panes
    store().resizePane('ghost', 50)
    expect(store().panes).toBe(before)
  })
})

/* ── tab groups ──────────────────────────────────────────── */

describe('tab groups', () => {
  it('createTabGroup creates an empty group with no active session', () => {
    const id = store().createTabGroup('Build')
    const g = store().tabGroups[id]
    expect(g.name).toBe('Build')
    expect(g.sessionIds).toEqual([])
    expect(g.activeSessionId).toBeNull()
  })

  it('addSessionToTabGroup links the session and sets first as active', () => {
    const a = store().createSession()
    const b = store().createSession()
    const grp = store().createTabGroup('G')
    store().addSessionToTabGroup(grp, a)
    store().addSessionToTabGroup(grp, b)
    expect(store().tabGroups[grp].sessionIds).toEqual([a, b])
    expect(store().tabGroups[grp].activeSessionId).toBe(a)
    // back-reference on the session
    expect(store().sessions[a].tabGroupId).toBe(grp)
    expect(store().sessions[b].tabGroupId).toBe(grp)
  })

  it('addSessionToTabGroup ignores duplicates and unknown sessions/groups', () => {
    const a = store().createSession()
    const grp = store().createTabGroup('G')
    store().addSessionToTabGroup(grp, a)
    store().addSessionToTabGroup(grp, a) // duplicate
    expect(store().tabGroups[grp].sessionIds).toEqual([a])
    const before = store().tabGroups
    store().addSessionToTabGroup(grp, 'ghost') // unknown session
    store().addSessionToTabGroup('ghostgrp', a) // unknown group
    expect(store().tabGroups).toBe(before)
  })

  it('setTabGroupActiveSession only accepts members', () => {
    const a = store().createSession()
    const b = store().createSession()
    const grp = store().createTabGroup('G')
    store().addSessionToTabGroup(grp, a)
    store().setTabGroupActiveSession(grp, b) // not a member -> no-op
    expect(store().tabGroups[grp].activeSessionId).toBe(a)
    store().addSessionToTabGroup(grp, b)
    store().setTabGroupActiveSession(grp, b)
    expect(store().tabGroups[grp].activeSessionId).toBe(b)
  })

  it('removeSessionFromTabGroup reassigns active and clears the back-reference', () => {
    const a = store().createSession()
    const b = store().createSession()
    const grp = store().createTabGroup('G')
    store().addSessionToTabGroup(grp, a)
    store().addSessionToTabGroup(grp, b)
    store().setTabGroupActiveSession(grp, a)
    store().removeSessionFromTabGroup(grp, a)
    expect(store().tabGroups[grp].sessionIds).toEqual([b])
    expect(store().tabGroups[grp].activeSessionId).toBe(b)
    expect(store().sessions[a].tabGroupId).toBeNull()
  })

  it('removeTabGroup deletes the group and clears tabGroupId on its sessions', () => {
    const a = store().createSession()
    const grp = store().createTabGroup('G')
    store().addSessionToTabGroup(grp, a)
    store().removeTabGroup(grp)
    expect(store().tabGroups[grp]).toBeUndefined()
    expect(store().sessions[a].tabGroupId).toBeNull()
  })
})

/* ── profiles ────────────────────────────────────────────── */

describe('profiles', () => {
  it('seeds the five built-in profiles', () => {
    const ids = Object.keys(store().profiles)
    expect(ids).toEqual(
      expect.arrayContaining([
        'profile-node',
        'profile-python',
        'profile-docker',
        'profile-ssh',
        'profile-powershell',
      ])
    )
  })

  it('addProfile assigns an id and stores the profile', () => {
    const partial: Omit<TerminalProfile, 'id'> = {
      name: 'Custom',
      shell: 'fish',
      args: ['-l'],
      env: { X: '1' },
      icon: 'fish',
      color: '#fff',
    }
    const id = store().addProfile(partial)
    expect(store().profiles[id]).toMatchObject({ ...partial, id })
  })

  it('updateProfile merges updates and is a no-op for unknown ids', () => {
    store().updateProfile('profile-node', { color: '#000000', name: 'Node18' })
    expect(store().profiles['profile-node'].color).toBe('#000000')
    expect(store().profiles['profile-node'].name).toBe('Node18')
    const before = store().profiles
    store().updateProfile('ghost', { color: 'x' })
    expect(store().profiles).toBe(before)
  })

  it('removeProfile deletes the profile', () => {
    store().removeProfile('profile-docker')
    expect(store().profiles['profile-docker']).toBeUndefined()
  })
})

/* ── linked groups / broadcast ───────────────────────────── */

describe('linked groups', () => {
  it('linkSessions creates a group and back-references each existing session', () => {
    const a = store().createSession()
    const b = store().createSession()
    const id = store().linkSessions('mygroup', [a, b])
    expect(store().linkedGroups[id].name).toBe('mygroup')
    expect(store().linkedGroups[id].sessionIds).toEqual([a, b])
    expect(store().sessions[a].linkedGroup).toBe(id)
    expect(store().sessions[b].linkedGroup).toBe(id)
  })

  it('addToLinkedGroup appends, dedupes, and rejects unknowns', () => {
    const a = store().createSession()
    const b = store().createSession()
    const id = store().linkSessions('g', [a])
    store().addToLinkedGroup(id, b)
    expect(store().linkedGroups[id].sessionIds).toEqual([a, b])
    const before = store().linkedGroups
    store().addToLinkedGroup(id, b) // duplicate
    store().addToLinkedGroup(id, 'ghost') // unknown session
    store().addToLinkedGroup('ghostgrp', a) // unknown group
    expect(store().linkedGroups).toBe(before)
  })

  it('removeFromLinkedGroup clears back-ref and deletes the group when empty', () => {
    const a = store().createSession()
    const b = store().createSession()
    const id = store().linkSessions('g', [a, b])
    store().removeFromLinkedGroup(id, a)
    expect(store().linkedGroups[id].sessionIds).toEqual([b])
    expect(store().sessions[a].linkedGroup).toBeNull()
    store().removeFromLinkedGroup(id, b)
    expect(store().linkedGroups[id]).toBeUndefined()
  })

  it('unlinkSessions removes the group and clears all back-references', () => {
    const a = store().createSession()
    const b = store().createSession()
    const id = store().linkSessions('g', [a, b])
    store().unlinkSessions(id)
    expect(store().linkedGroups[id]).toBeUndefined()
    expect(store().sessions[a].linkedGroup).toBeNull()
    expect(store().sessions[b].linkedGroup).toBeNull()
  })

  it('broadcastInput pushes the command to every linked session history', () => {
    const a = store().createSession()
    const b = store().createSession()
    const id = store().linkSessions('g', [a, b])
    const recipients = store().broadcastInput(id, 'ls -la')
    expect(recipients).toEqual([a, b])
    expect(store().sessions[a].commandHistory).toEqual(['ls -la'])
    expect(store().sessions[b].commandHistory).toEqual(['ls -la'])
  })

  it('broadcastInput returns [] for an unknown group', () => {
    expect(store().broadcastInput('ghost', 'x')).toEqual([])
  })
})

/* ── persistence (saveLayout / restoreLayout) ────────────── */

describe('layout persistence', () => {
  it('saveLayout serializes pane + tab-group layout to localStorage', () => {
    const a = store().createSession()
    seedRootPane(a)
    const grp = store().createTabGroup('Saved')
    store().addSessionToTabGroup(grp, a)

    store().saveLayout()
    const raw = localStorage.getItem('terminal-session-layout')
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw as string)
    expect(parsed.rootPaneId).toBe('pane_root_seed')
    expect(parsed.tabGroups[grp].name).toBe('Saved')
    // sessions are intentionally NOT part of the persisted layout
    expect(parsed.sessions).toBeUndefined()
  })

  it('restoreLayout returns false when nothing is persisted', () => {
    expect(store().restoreLayout()).toBe(false)
  })

  it('restoreLayout rehydrates panes/tabGroups/root and returns true', () => {
    const a = store().createSession()
    seedRootPane(a)
    const grp = store().createTabGroup('Persist')
    store().addSessionToTabGroup(grp, a)
    store().saveLayout()

    // Wipe in-memory layout, then restore from storage
    useTerminalSessionStore.setState({ panes: {}, rootPaneId: null, tabGroups: {} })
    expect(store().restoreLayout()).toBe(true)
    expect(store().rootPaneId).toBe('pane_root_seed')
    expect(store().panes['pane_root_seed']).toBeDefined()
    expect(store().tabGroups[grp].name).toBe('Persist')
  })

  it('restoreLayout returns false on corrupted JSON', () => {
    localStorage.setItem('terminal-session-layout', '{not valid json')
    expect(store().restoreLayout()).toBe(false)
  })
})

/* ── background tasks ─────────────────────────────────────── */

describe('background tasks', () => {
  it('addBackgroundTask creates a running task with sensible defaults', () => {
    const sess = store().createSession()
    const id = store().addBackgroundTask(sess, 'npm run build')
    const task = store().backgroundTasks[id]
    expect(task.sessionId).toBe(sess)
    expect(task.command).toBe('npm run build')
    expect(task.status).toBe('running')
    expect(task.completedAt).toBeNull()
    expect(task.exitCode).toBeNull()
    expect(task.output).toEqual([])
  })

  it('updateBackgroundTask applies output/exitCode and stamps completedAt on terminal states', () => {
    const id = store().addBackgroundTask(store().createSession(), 'cmd')
    store().updateBackgroundTask(id, { output: ['line1'], exitCode: 0, status: 'completed' })
    const task = store().backgroundTasks[id]
    expect(task.output).toEqual(['line1'])
    expect(task.exitCode).toBe(0)
    expect(task.status).toBe('completed')
    expect(typeof task.completedAt).toBe('number')
  })

  it('updateBackgroundTask does not stamp completedAt while still running', () => {
    const id = store().addBackgroundTask(store().createSession(), 'cmd')
    store().updateBackgroundTask(id, { output: ['partial'] })
    expect(store().backgroundTasks[id].completedAt).toBeNull()
    expect(store().backgroundTasks[id].status).toBe('running')
  })

  it('cancelBackgroundTask cancels only running tasks', () => {
    const id = store().addBackgroundTask(store().createSession(), 'cmd')
    store().cancelBackgroundTask(id)
    expect(store().backgroundTasks[id].status).toBe('cancelled')
    expect(typeof store().backgroundTasks[id].completedAt).toBe('number')

    // Already-finished task cannot be re-cancelled
    const id2 = store().addBackgroundTask(store().createSession(), 'cmd2')
    store().updateBackgroundTask(id2, { status: 'completed' })
    const before = store().backgroundTasks[id2]
    store().cancelBackgroundTask(id2)
    expect(store().backgroundTasks[id2]).toBe(before)
    expect(store().backgroundTasks[id2].status).toBe('completed')
  })

  it('removeBackgroundTask deletes the task', () => {
    const id = store().addBackgroundTask(store().createSession(), 'cmd')
    store().removeBackgroundTask(id)
    expect(store().backgroundTasks[id]).toBeUndefined()
  })

  it('getSessionTasks returns only tasks for the given session', () => {
    const s1 = store().createSession()
    const s2 = store().createSession()
    const t1 = store().addBackgroundTask(s1, 'a')
    const t2 = store().addBackgroundTask(s1, 'b')
    store().addBackgroundTask(s2, 'c')
    const s1Tasks = store().getSessionTasks(s1)
    expect(s1Tasks.map((t) => t.id).sort()).toEqual([t1, t2].sort())
    expect(store().getSessionTasks(s2)).toHaveLength(1)
    expect(store().getSessionTasks('ghost')).toEqual([])
  })
})
