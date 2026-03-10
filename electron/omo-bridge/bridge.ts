import { ChildProcess, fork } from 'child_process'
import type { OmoBridgeMessage, OmoEvent } from './protocol'

let omoProcess: ChildProcess | null = null
let messageHandler: ((event: OmoEvent) => void) | null = null

export function startOmo(projectPath: string, onMessage: (event: OmoEvent) => void): void {
  stopOmo()
  messageHandler = onMessage

  // TODO: Replace with actual oh-my-openagent integration
  onMessage({
    type: 'agent-status',
    payload: {
      agents: [
        { id: 'sisyphus', name: 'Sisyphus', role: 'orchestrator', status: 'idle' },
        { id: 'hephaestus', name: 'Hephaestus', role: 'deep worker', status: 'idle' },
        { id: 'prometheus', name: 'Prometheus', role: 'planner', status: 'idle' },
        { id: 'oracle', name: 'Oracle', role: 'debugger', status: 'idle' },
      ],
    },
  })
}

export function sendToOmo(message: OmoBridgeMessage): void {
  if (omoProcess) {
    omoProcess.send(message)
  } else {
    messageHandler?.({
      type: 'chat-response',
      payload: {
        agentName: 'Sisyphus',
        content: `[Stub] Received: ${message.payload.message}`,
        model: message.payload.model || 'stub',
      },
    })
  }
}

export function stopOmo(): void {
  if (omoProcess) {
    omoProcess.kill()
    omoProcess = null
  }
  messageHandler = null
}
