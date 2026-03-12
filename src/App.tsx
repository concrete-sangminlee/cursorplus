import { useState, useCallback, useEffect, useRef } from 'react'
import { useFileWatcher } from './hooks/useIpc'
import { useOmo } from './hooks/useOmo'
import TitleBar from './components/TitleBar'
import ActivityBar, { type PanelView } from './components/ActivityBar'
import Resizer from './components/Resizer'
import StatusBar from './components/StatusBar'
import SettingsModal from './components/SettingsModal'
import AboutDialog from './components/AboutDialog'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import CommandPalette from '@/components/CommandPalette'
import ToastContainer from '@/components/Toast'
import AgentPanel from './panels/AgentPanel'
import FileExplorer from './panels/FileExplorer'
import SearchPanel from '@/panels/SearchPanel'
import SourceControlPanel from '@/panels/SourceControlPanel'
import OutlinePanel from '@/panels/OutlinePanel'
import EditorPanel from './panels/EditorPanel'
import ChatPanel from './panels/ChatPanel'
import BottomPanel from './panels/BottomPanel'
import {
  DEFAULT_SIDE_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  DEFAULT_BOTTOM_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
} from '@shared/constants'

export default function App() {
  const [activeView, setActiveView] = useState<PanelView>('explorer')
  const [sidePanelWidth, setSidePanelWidth] = useState(DEFAULT_SIDE_PANEL_WIDTH)
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_RIGHT_PANEL_WIDTH)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(DEFAULT_BOTTOM_PANEL_HEIGHT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [bottomVisible, setBottomVisible] = useState(true)
  const [chatVisible, setChatVisible] = useState(true)
  const [zenMode, setZenMode] = useState(false)
  const [zenExitHovered, setZenExitHovered] = useState(false)

  // Store pre-zen state so we can restore on exit
  const preZenState = useRef<{
    sidebar: boolean
    bottom: boolean
    chat: boolean
  } | null>(null)

  const toggleZenMode = useCallback(() => {
    setZenMode((prev) => {
      if (!prev) {
        // Entering zen mode: save current state and hide everything
        preZenState.current = {
          sidebar: sidebarVisible,
          bottom: bottomVisible,
          chat: chatVisible,
        }
        setSidebarVisible(false)
        setBottomVisible(false)
        setChatVisible(false)
      } else {
        // Exiting zen mode: restore previous state
        if (preZenState.current) {
          setSidebarVisible(preZenState.current.sidebar)
          setBottomVisible(preZenState.current.bottom)
          setChatVisible(preZenState.current.chat)
          preZenState.current = null
        } else {
          setSidebarVisible(true)
          setBottomVisible(true)
          setChatVisible(true)
        }
      }
      return !prev
    })
  }, [sidebarVisible, bottomVisible, chatVisible])

  const handleSideResize = useCallback((delta: number) => {
    setSidePanelWidth((w) => Math.max(MIN_PANEL_WIDTH, w + delta))
  }, [])
  const handleRightResize = useCallback((delta: number) => {
    setRightPanelWidth((w) => Math.max(MIN_PANEL_WIDTH, w - delta))
  }, [])
  const handleBottomResize = useCallback((delta: number) => {
    setBottomPanelHeight((h) => Math.max(100, h - delta))
  }, [])

  useFileWatcher()
  useOmo()

  // Load saved API keys on startup
  useEffect(() => {
    try {
      const stored = localStorage.getItem('orion-api-keys')
      if (stored) {
        const keys = JSON.parse(stored)
        window.api?.omoSetApiKeys(keys)
      }
      const storedPrompts = localStorage.getItem('orion-prompts')
      if (storedPrompts) {
        const prompts = JSON.parse(storedPrompts)
        window.api?.omoSetPrompts(prompts)
      }
    } catch {}
  }, [])

  // Listen for custom events from menu bar / commands
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      'orion:toggle-sidebar': () => setSidebarVisible((v) => !v),
      'orion:toggle-terminal': () => setBottomVisible((v) => !v),
      'orion:toggle-chat': () => setChatVisible((v) => !v),
      'orion:open-settings': () => setSettingsOpen(true),
      'orion:open-palette': () => setPaletteOpen(true),
      'orion:keyboard-shortcuts': () => setShortcutsOpen(true),
      'orion:zen-mode': () => toggleZenMode(),
      'orion:about': () => setAboutOpen(true),
      'orion:show-explorer': () => { setSidebarVisible(true); setActiveView('explorer') },
      'orion:show-search': () => { setSidebarVisible(true); setActiveView('search') },
      'orion:show-git': () => { setSidebarVisible(true); setActiveView('git') },
      'orion:show-agents': () => { setSidebarVisible(true); setActiveView('agents') },
      'orion:show-outline': () => { setSidebarVisible(true); setActiveView('outline') },
    }
    Object.entries(handlers).forEach(([event, handler]) => {
      window.addEventListener(event, handler)
    })
    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        window.removeEventListener(event, handler)
      })
    }
  }, [toggleZenMode])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey

      // Ctrl+Shift+P -> command palette
      if (ctrl && e.shiftKey && e.key === 'P') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
        return
      }
      // Ctrl+P -> quick open (file mode)
      if (ctrl && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
        return
      }
      // Ctrl+B -> toggle sidebar
      if (ctrl && e.key === 'b') {
        e.preventDefault()
        setSidebarVisible((v) => !v)
        return
      }
      // Ctrl+` -> toggle terminal
      if (ctrl && e.key === '`') {
        e.preventDefault()
        setBottomVisible((v) => !v)
        return
      }
      // Ctrl+J -> toggle bottom panel
      if (ctrl && e.key === 'j') {
        e.preventDefault()
        setBottomVisible((v) => !v)
        return
      }
      // Ctrl+L -> focus chat
      if (ctrl && e.key === 'l') {
        e.preventDefault()
        setChatVisible(true)
        return
      }
      // Ctrl+, -> settings
      if (ctrl && e.key === ',') {
        e.preventDefault()
        setSettingsOpen(true)
        return
      }
      // Ctrl+Shift+E -> explorer
      if (ctrl && e.shiftKey && e.key === 'E') {
        e.preventDefault()
        setSidebarVisible(true)
        setActiveView('explorer')
        return
      }
      // Ctrl+Shift+F -> search
      if (ctrl && e.shiftKey && e.key === 'F') {
        e.preventDefault()
        setSidebarVisible(true)
        setActiveView('search')
        return
      }
      // Ctrl+Shift+G -> git
      if (ctrl && e.shiftKey && e.key === 'G') {
        e.preventDefault()
        setSidebarVisible(true)
        setActiveView('git')
        return
      }
      // Ctrl+Shift+O -> outline
      if (ctrl && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        setSidebarVisible(true)
        setActiveView('outline')
        return
      }
      // Escape -> exit zen mode
      if (e.key === 'Escape' && zenMode) {
        e.preventDefault()
        toggleZenMode()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zenMode, toggleZenMode])

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Title Bar - hidden in zen mode with smooth transition */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: zenMode ? 0 : 38,
          opacity: zenMode ? 0 : 1,
          transition: 'max-height 0.3s ease, opacity 0.2s ease',
        }}
      >
        <TitleBar />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Activity Bar - hidden in zen mode */}
        <div
          style={{
            overflow: 'hidden',
            maxWidth: zenMode ? 0 : 48,
            opacity: zenMode ? 0 : 1,
            transition: 'max-width 0.3s ease, opacity 0.2s ease',
          }}
        >
          <ActivityBar
            activeView={activeView}
            onViewChange={(v) => {
              if (v === activeView && sidebarVisible) {
                setSidebarVisible(false)
              } else {
                setSidebarVisible(true)
                setActiveView(v)
              }
            }}
            onSettingsClick={() => setSettingsOpen(true)}
          />
        </div>

        {/* Side Panel */}
        {sidebarVisible && !zenMode && (
          <>
            <div
              style={{
                width: sidePanelWidth,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--bg-secondary)',
                borderRight: '1px solid var(--border)',
              }}
            >
              {activeView === 'agents' && <AgentPanel />}
              {activeView === 'search' && <SearchPanel />}
              {activeView === 'explorer' && <FileExplorer />}
              {activeView === 'git' && <SourceControlPanel />}
              {activeView === 'outline' && <OutlinePanel />}
            </div>

            <Resizer direction="horizontal" onResize={handleSideResize} />
          </>
        )}

        {/* Center */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <EditorPanel />
          </div>
          {bottomVisible && !zenMode && (
            <>
              <Resizer direction="vertical" onResize={handleBottomResize} />
              <div style={{ height: bottomPanelHeight }}>
                <BottomPanel />
              </div>
            </>
          )}
        </div>

        {/* Right Panel: Chat */}
        {chatVisible && !zenMode && (
          <>
            <Resizer direction="horizontal" onResize={handleRightResize} />
            <div style={{ width: rightPanelWidth }}>
              <ChatPanel />
            </div>
          </>
        )}
      </div>

      {/* Status Bar - hidden in zen mode with smooth transition */}
      <div
        style={{
          overflow: 'hidden',
          maxHeight: zenMode ? 0 : 22,
          opacity: zenMode ? 0 : 1,
          transition: 'max-height 0.3s ease, opacity 0.2s ease',
        }}
      >
        <StatusBar
          onToggleTerminal={() => setBottomVisible((v) => !v)}
          onToggleChat={() => setChatVisible((v) => !v)}
        />
      </div>

      {/* Zen Mode: floating exit button */}
      {zenMode && (
        <button
          onClick={toggleZenMode}
          onMouseEnter={() => setZenExitHovered(true)}
          onMouseLeave={() => setZenExitHovered(false)}
          style={{
            position: 'fixed',
            top: 10,
            right: 10,
            zIndex: 50,
            padding: '5px 14px',
            fontSize: 11,
            fontWeight: 600,
            color: zenExitHovered ? 'var(--text-primary)' : 'var(--text-muted)',
            background: zenExitHovered
              ? 'rgba(255, 255, 255, 0.12)'
              : 'rgba(255, 255, 255, 0.06)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            cursor: 'pointer',
            transition: 'background 0.15s, color 0.15s, opacity 0.3s',
            opacity: zenExitHovered ? 1 : 0.6,
            backdropFilter: 'blur(8px)',
            animation: 'fade-in 0.3s ease-out',
          }}
        >
          Exit Zen Mode
        </button>
      )}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <ToastContainer />
    </div>
  )
}
