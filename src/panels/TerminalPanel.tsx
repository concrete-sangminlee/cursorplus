import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useTerminalStore } from '@/store/terminal'
import 'xterm/css/xterm.css'

interface Props {
  sessionId: string
}

export default function TerminalPanel({ sessionId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const initRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const { addSession } = useTerminalStore()

  useEffect(() => {
    if (!containerRef.current || initRef.current) return
    initRef.current = true

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#58a6ff',
        cursorAccent: '#0d1117',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
        black: '#484f58',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#76e3ea',
        white: '#e6edf3',
      },
      fontSize: 13,
      fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
      cursorBlink: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    addSession({ id: sessionId, name: 'Terminal', type: 'shell' })

    window.api.termCreate(sessionId).then((result: any) => {
      if (result && !result.success) {
        setError(result.error || 'Failed to create terminal')
        term.writeln('\x1b[31mTerminal failed to start: ' + (result.error || 'Unknown error') + '\x1b[0m')
        term.writeln('\x1b[33mThis is a known issue with node-pty on some Windows configurations.\x1b[0m')
        return
      }
      term.onData((data) => window.api.termWrite(sessionId, data))
      term.onResize(({ cols, rows }) => window.api.termResize(sessionId, cols, rows))
    }).catch((err: any) => {
      setError(err.message)
      term.writeln('\x1b[31mTerminal error: ' + err.message + '\x1b[0m')
    })

    const cleanup = window.api.onTermData((id: string, data: string) => {
      if (id === sessionId) term.write(data)
    })

    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit() } catch {}
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      cleanup()
      resizeObserver.disconnect()
      term.dispose()
      window.api.termKill(sessionId)
    }
  }, [])

  return <div ref={containerRef} className="h-full w-full" />
}
