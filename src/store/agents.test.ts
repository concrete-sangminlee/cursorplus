import { describe, it, expect, beforeEach } from 'vitest'
import { useAgentStore } from './agents'
import type { Agent, AgentLogEntry } from '@shared/types'

// The agents store is a module-level zustand singleton with no IPC, window,
// localStorage, or document usage, so no environment pragma or mocks are needed.
//
// Store shape (pinned from src/store/agents.ts):
//   data fields : agents: Agent[], logs: AgentLogEntry[]
//   actions     : setAgents, updateAgent, addLog, clearLogs

const store = () => useAgentStore.getState()

// Reset only the data fields before each test (no replace: true) so action
// references stay intact across tests.
beforeEach(() => {
  useAgentStore.setState({ agents: [], logs: [] })
})

const makeAgent = (over: Partial<Agent> = {}): Agent => ({
  id: 'a1',
  name: 'Planner',
  role: 'planner',
  status: 'idle',
  ...over,
})

const makeLog = (over: Partial<AgentLogEntry> = {}): AgentLogEntry => ({
  id: 'l1',
  agentId: 'a1',
  timestamp: 1000,
  message: 'hello',
  type: 'info',
  ...over,
})

describe('useAgentStore', () => {
  it('starts with empty agents and logs', () => {
    expect(store().agents).toEqual([])
    expect(store().logs).toEqual([])
  })

  describe('setAgents', () => {
    it('replaces the entire agents array', () => {
      const a = makeAgent({ id: 'a1' })
      const b = makeAgent({ id: 'a2', name: 'Coder', role: 'coder' })
      store().setAgents([a, b])

      expect(store().agents).toHaveLength(2)
      expect(store().agents.map((x) => x.id)).toEqual(['a1', 'a2'])
      expect(store().agents[1].name).toBe('Coder')
    })

    it('overwrites previous agents rather than merging', () => {
      store().setAgents([makeAgent({ id: 'old' })])
      store().setAgents([makeAgent({ id: 'new' })])

      expect(store().agents).toHaveLength(1)
      expect(store().agents[0].id).toBe('new')
    })

    it('can clear agents by setting an empty array', () => {
      store().setAgents([makeAgent()])
      store().setAgents([])
      expect(store().agents).toEqual([])
    })

    it('does not touch the logs field', () => {
      const log = makeLog()
      store().addLog(log)
      store().setAgents([makeAgent()])
      expect(store().logs).toEqual([log])
    })
  })

  describe('updateAgent', () => {
    it('shallow-merges the partial update into the matching agent', () => {
      store().setAgents([makeAgent({ id: 'a1', status: 'idle', progress: 0 })])
      store().updateAgent('a1', { status: 'working', progress: 42 })

      const updated = store().agents[0]
      expect(updated.status).toBe('working')
      expect(updated.progress).toBe(42)
      // unchanged fields are preserved
      expect(updated.name).toBe('Planner')
      expect(updated.role).toBe('planner')
    })

    it('updates an agent status through the AgentStatus lifecycle', () => {
      store().setAgents([makeAgent({ id: 'a1', status: 'idle' })])
      store().updateAgent('a1', { status: 'active' })
      expect(store().agents[0].status).toBe('active')
      store().updateAgent('a1', { status: 'error' })
      expect(store().agents[0].status).toBe('error')
    })

    it('only mutates the targeted agent, leaving siblings unchanged', () => {
      store().setAgents([
        makeAgent({ id: 'a1', status: 'idle' }),
        makeAgent({ id: 'a2', status: 'idle' }),
      ])
      store().updateAgent('a2', { currentTask: 'build' })

      expect(store().agents[0].currentTask).toBeUndefined()
      expect(store().agents[1].currentTask).toBe('build')
      expect(store().agents[0].status).toBe('idle')
    })

    it('is a no-op when the id does not match any agent', () => {
      const original = makeAgent({ id: 'a1' })
      store().setAgents([original])
      store().updateAgent('missing', { status: 'error' })

      expect(store().agents).toHaveLength(1)
      expect(store().agents[0].status).toBe('idle')
    })

    it('does nothing when the agents list is empty', () => {
      store().updateAgent('a1', { status: 'active' })
      expect(store().agents).toEqual([])
    })

    it('produces a new agent object reference for the updated entry (immutability)', () => {
      const original = makeAgent({ id: 'a1' })
      store().setAgents([original])
      store().updateAgent('a1', { progress: 10 })

      // map() builds a fresh object via spread, so identity must differ
      expect(store().agents[0]).not.toBe(original)
    })

    it('can overwrite a field with an explicit value via the partial', () => {
      store().setAgents([makeAgent({ id: 'a1', model: 'opus' })])
      store().updateAgent('a1', { model: 'sonnet' })
      expect(store().agents[0].model).toBe('sonnet')
    })
  })

  describe('addLog', () => {
    it('appends a log entry to the end of the logs array', () => {
      const first = makeLog({ id: 'l1' })
      const second = makeLog({ id: 'l2' })
      store().addLog(first)
      store().addLog(second)

      expect(store().logs).toHaveLength(2)
      expect(store().logs.map((l) => l.id)).toEqual(['l1', 'l2'])
    })

    it('preserves entry contents exactly', () => {
      const entry = makeLog({ id: 'x', message: 'did thing', type: 'action' })
      store().addLog(entry)
      expect(store().logs[0]).toEqual(entry)
    })

    it('keeps the most recent 201 entries (slice(-200) of prior logs, then append)', () => {
      // Seed 250 existing logs directly, then add one more via the action.
      const seeded = Array.from({ length: 250 }, (_, i) => makeLog({ id: `seed-${i}` }))
      useAgentStore.setState({ logs: seeded })
      store().addLog(makeLog({ id: 'newest' }))

      const logs = store().logs
      // SUSPECTED BUG: the cap is applied to the PRIOR logs (slice(-200)) and
      // then the new entry is appended, so the array settles at 201, not 200.
      // The trailing 200 of the previous 250 are kept (seed-50 .. seed-249),
      // and 'newest' is appended -> 201 total.
      expect(logs).toHaveLength(201)
      expect(logs[0].id).toBe('seed-50')
      expect(logs[199].id).toBe('seed-249')
      expect(logs[200].id).toBe('newest')
    })

    it('does not trim when fewer than the cap exist', () => {
      const seeded = Array.from({ length: 5 }, (_, i) => makeLog({ id: `s${i}` }))
      useAgentStore.setState({ logs: seeded })
      store().addLog(makeLog({ id: 'extra' }))

      expect(store().logs).toHaveLength(6)
      expect(store().logs[5].id).toBe('extra')
    })

    it('does not modify the agents field', () => {
      const agent = makeAgent()
      store().setAgents([agent])
      store().addLog(makeLog())
      expect(store().agents).toEqual([agent])
    })
  })

  describe('clearLogs', () => {
    it('empties the logs array', () => {
      store().addLog(makeLog({ id: 'l1' }))
      store().addLog(makeLog({ id: 'l2' }))
      store().clearLogs()
      expect(store().logs).toEqual([])
    })

    it('leaves agents untouched', () => {
      const agent = makeAgent()
      store().setAgents([agent])
      store().addLog(makeLog())
      store().clearLogs()
      expect(store().agents).toEqual([agent])
      expect(store().logs).toEqual([])
    })

    it('is safe to call when logs are already empty', () => {
      store().clearLogs()
      expect(store().logs).toEqual([])
    })
  })
})
