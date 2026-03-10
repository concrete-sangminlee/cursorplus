import os from 'os'

interface PtyProcess {
  onData: (callback: (data: string) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

const terminals = new Map<string, PtyProcess>()

function detectShell(): string {
  if (process.platform === 'win32') {
    return process.env.COMSPEC || 'powershell.exe'
  }
  return process.env.SHELL || '/bin/bash'
}

export async function createTerminal(
  id: string,
  onData: (data: string) => void
): Promise<void> {
  const pty = await import('node-pty')

  const shell = detectShell()
  const term = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: os.homedir(),
    env: process.env as Record<string, string>,
  })

  term.onData(onData)
  terminals.set(id, term)
}

export function writeToTerminal(id: string, data: string) {
  terminals.get(id)?.write(data)
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  terminals.get(id)?.resize(cols, rows)
}

export function killTerminal(id: string) {
  const term = terminals.get(id)
  if (term) {
    term.kill()
    terminals.delete(id)
  }
}

export function killAllTerminals() {
  for (const [id, term] of terminals) {
    term.kill()
    terminals.delete(id)
  }
}
