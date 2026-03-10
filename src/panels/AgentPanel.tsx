import { useAgentStore } from '@/store/agents'
import type { Agent, AgentStatus } from '@shared/types'

const statusColors: Record<AgentStatus, string> = {
  active: 'bg-accent-green',
  working: 'bg-accent-blue',
  idle: 'bg-text-muted',
  error: 'bg-accent-red',
}

const statusBorders: Record<AgentStatus, string> = {
  active: 'border-accent-green',
  working: 'border-accent-blue',
  idle: 'border-border-primary',
  error: 'border-accent-red',
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className={`bg-bg-secondary rounded-lg p-3 mb-1.5 border ${statusBorders[agent.status]}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${statusColors[agent.status]} ${agent.status === 'active' ? 'animate-pulse' : ''}`} />
        <span className={`font-semibold text-xs ${agent.status === 'idle' ? 'text-text-secondary' : agent.status === 'active' ? 'text-accent-green' : 'text-accent-blue'}`}>
          {agent.name}
        </span>
        <span className="text-text-muted text-[10px] ml-auto">{agent.role}</span>
      </div>
      {agent.currentTask && (
        <p className="text-text-secondary text-[11px] mb-1.5">{agent.currentTask}</p>
      )}
      {agent.status === 'working' && agent.progress !== undefined && (
        <div className="bg-bg-primary rounded-full overflow-hidden h-0.5">
          <div className="h-full bg-accent-blue rounded-full transition-all" style={{ width: `${agent.progress}%` }} />
        </div>
      )}
    </div>
  )
}

export default function AgentPanel() {
  const agents = useAgentStore((s) => s.agents)
  const activeCount = agents.filter((a) => a.status !== 'idle').length

  return (
    <div className="flex flex-col border-b border-border-primary">
      <div className="px-3 py-2.5 border-b border-border-primary flex items-center">
        <span className="text-text-secondary text-[10px] font-semibold tracking-wider">AGENTS</span>
        {activeCount > 0 && (
          <span className="ml-auto bg-accent-green text-white text-[9px] px-1.5 py-px rounded-full">
            {activeCount} active
          </span>
        )}
      </div>
      <div className="p-2 max-h-72 overflow-y-auto">
        {agents.length === 0 ? (
          <p className="text-text-muted text-xs text-center py-4">No agents running</p>
        ) : (
          agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)
        )}
      </div>
    </div>
  )
}
