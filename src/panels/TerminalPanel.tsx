import { useEffect, useRef } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useTerminalStore } from '@/store/terminal'
import { v4 as uuid } from 'uuid'
import 'xterm/css/xterm.css'

export default function TerminalPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const { sessions, activeSessionId, addSession } = useTerminalStore()

  useEffect(() => {
    if (!containerRef.current) return

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

    // Create a session if none exists
    const sessionId = uuid()
    addSession({ id: sessionId, name: 'Terminal', type: 'shell' })

    window.api.termCreate(sessionId).then(() => {
      term.onData((data) => window.api.termWrite(sessionId, data))
      term.onResize(({ cols, rows }) => window.api.termResize(sessionId, cols, rows))
    })

    const cleanup = window.api.onTermData((id, data) => {
      if (id === sessionId) term.write(data)
    })

    const resizeObserver = new ResizeObserver(() => fit.fit())
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
