import { useState } from 'react'
import TerminalPanel from './TerminalPanel'
import { useAgentStore } from '@/store/agents'

type Tab = 'terminal' | 'agent-log' | 'problems' | 'output'

export default function BottomPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('terminal')
  const logs = useAgentStore((s) => s.logs)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'terminal', label: 'TERMINAL' },
    { id: 'agent-log', label: 'AGENT LOG' },
    { id: 'problems', label: 'PROBLEMS' },
    { id: 'output', label: 'OUTPUT' },
  ]

  return (
    <div className="h-full flex flex-col border-t border-border-primary">
      <div className="flex items-center px-3 h-7 bg-bg-tertiary border-b border-border-primary gap-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-[10px] font-semibold py-1.5 ${
              activeTab === tab.id
                ? 'text-accent-blue border-b-2 border-accent-blue'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && <TerminalPanel />}
        {activeTab === 'agent-log' && (
          <div className="h-full overflow-y-auto p-2 font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-text-muted text-center py-4">No agent activity yet</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex gap-2 py-0.5">
                  <span className="text-text-muted text-[10px] shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className={
                    log.type === 'error' ? 'text-accent-red' :
                    log.type === 'action' ? 'text-accent-green' :
                    log.type === 'delegation' ? 'text-accent-blue' : 'text-text-secondary'
                  }>
                    [{log.agentId}]
                  </span>
                  <span className="text-text-primary">{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'problems' && (
          <div className="h-full flex items-center justify-center text-text-muted text-xs">
            No problems detected
          </div>
        )}
        {activeTab === 'output' && (
          <div className="h-full flex items-center justify-center text-text-muted text-xs">
            No output
          </div>
        )}
      </div>
    </div>
  )
}
