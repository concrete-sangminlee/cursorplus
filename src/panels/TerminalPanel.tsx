import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useTerminalStore } from '@/store/terminal'
import 'xterm/css/xterm.css'

/* ── Catppuccin-inspired dark theme matching the app ──── */
const terminalTheme = {
  background: '#0d1117',
  foreground: '#d4d4d4',
  cursor: '#58a6ff',
  cursorAccent: '#1e1e2e',
  selectionBackground: 'rgba(88, 166, 255, 0.3)',
  black: '#1e1e2e',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#cba6f7',
  cyan: '#94e2d5',
  white: '#cdd6f4',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#cba6f7',
  brightCyan: '#94e2d5',
  brightWhite: '#ffffff',
}

interface Props {
  sessionId: string
  shellPath?: string
  shellArgs?: string[]
  onTitleChange?: (sessionId: string, title: string) => void
}

export default function TerminalPanel({ sessionId, shellPath, shellArgs, onTitleChange }: Props) {
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
      theme: terminalTheme,
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

    /* ── Title tracking ────────────────────────────────── */
    term.onTitleChange((title) => {
      onTitleChange?.(sessionId, title)
    })

    /* ── Keyboard shortcuts ────────────────────────────── */
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+Shift+C: Copy from terminal
      if (event.ctrlKey && event.shiftKey && event.key === 'C' && event.type === 'keydown') {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
        }
        return false // prevent xterm from handling it
      }

      // Ctrl+Shift+V: Paste to terminal
      if (event.ctrlKey && event.shiftKey && event.key === 'V' && event.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          term.paste(text)
        })
        return false
      }

      // Ctrl+Shift+`: New terminal (handled by BottomPanel via global listener)
      // Let the event propagate so the parent catches it
      if (event.ctrlKey && event.shiftKey && event.key === '`') {
        return false
      }

      return true
    })

    /* ── Create backend PTY ────────────────────────────── */
    const shellOptions = shellPath ? { shellPath, shellArgs: shellArgs || [] } : undefined

    window.api.termCreate(sessionId, shellOptions).then((result: any) => {
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
