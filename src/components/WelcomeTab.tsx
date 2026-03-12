import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen, FileText, GitBranch, FilePlus,
  ChevronRight, Lightbulb, Check, RefreshCw,
  File, Code, Image, Database, FileJson, FileCode, Braces,
} from 'lucide-react'
import { useRecentFilesStore } from '@/store/recentFiles'
import { useEditorStore } from '@/store/editor'

interface WelcomeTabProps {
  onOpenFolder: () => void
  onOpenPalette: () => void
  onOpenTerminal: () => void
  onOpenSettings: () => void
  onOpenChat: () => void
}

const TIPS = [
  { text: 'Press Ctrl+K in the editor to use inline AI editing for quick code transformations.' },
  { text: 'Use Ctrl+Shift+P to open the Command Palette and access any command instantly.' },
  { text: 'Split your editor with Ctrl+\\ to view two files side by side.' },
  { text: 'Ctrl+D selects the next occurrence of the current word for multi-cursor editing.' },
  { text: 'Use Ctrl+` to toggle the integrated terminal without leaving the editor.' },
  { text: 'Press Ctrl+Shift+F to search across all files in your workspace.' },
  { text: 'Alt+Up/Down moves the current line up or down quickly.' },
  { text: 'Ctrl+L opens the AI chat panel for longer conversations about your code.' },
  { text: 'Right-click a file in the Explorer for options like rename, delete, and copy path.' },
  { text: 'Use Ctrl+, to open Settings and customize your editor experience.' },
  { text: 'Press F2 on a symbol to rename it across your entire project.' },
  { text: 'Ctrl+G lets you jump to a specific line number instantly.' },
  { text: 'Hold Alt and click to place multiple cursors anywhere in the document.' },
]

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const iconMap: Record<string, { icon: typeof FileText; color: string }> = {
    ts: { icon: FileCode, color: 'var(--accent)' },
    tsx: { icon: FileCode, color: 'var(--accent)' },
    js: { icon: FileCode, color: 'var(--accent-orange)' },
    jsx: { icon: FileCode, color: 'var(--accent-orange)' },
    json: { icon: FileJson, color: 'var(--accent-green)' },
    css: { icon: Braces, color: 'var(--accent-purple)' },
    scss: { icon: Braces, color: 'var(--accent-purple)' },
    html: { icon: Code, color: 'var(--accent-red)' },
    md: { icon: FileText, color: 'var(--text-secondary)' },
    py: { icon: FileCode, color: 'var(--accent-green)' },
    png: { icon: Image, color: 'var(--accent-cyan)' },
    jpg: { icon: Image, color: 'var(--accent-cyan)' },
    svg: { icon: Image, color: 'var(--accent-orange)' },
    sql: { icon: Database, color: 'var(--accent-orange)' },
  }
  return iconMap[ext] || { icon: File, color: 'var(--text-muted)' }
}

function getRelativePath(filePath: string) {
  const parts = filePath.replace(/\\/g, '/').split('/')
  if (parts.length <= 2) return parts.join('/')
  return parts.slice(-3).join('/')
}

const GETTING_STARTED_KEY = 'orion-getting-started'
const SHOW_WELCOME_KEY = 'orion-show-welcome'

function loadChecked(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(GETTING_STARTED_KEY) || '{}')
  } catch {
    return {}
  }
}

export default function WelcomeTab({ onOpenFolder, onOpenPalette, onOpenTerminal, onOpenSettings, onOpenChat }: WelcomeTabProps) {
  const recentFiles = useRecentFilesStore((s) => s.getRecent(15))
  const openFile = useEditorStore((s) => s.openFile)

  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length))
  const [hoveredAction, setHoveredAction] = useState<string | null>(null)
  const [hoveredRecent, setHoveredRecent] = useState<string | null>(null)
  const [hoveredStartItem, setHoveredStartItem] = useState<string | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked)
  const [showAllRecent, setShowAllRecent] = useState(false)
  const [showOnStartup, setShowOnStartup] = useState(() => {
    const stored = localStorage.getItem(SHOW_WELCOME_KEY)
    return stored === null ? true : stored === 'true'
  })

  useEffect(() => {
    localStorage.setItem(GETTING_STARTED_KEY, JSON.stringify(checked))
  }, [checked])

  useEffect(() => {
    localStorage.setItem(SHOW_WELCOME_KEY, String(showOnStartup))
  }, [showOnStartup])

  const toggleChecked = useCallback((key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const nextTip = useCallback(() => {
    setTipIndex((prev) => (prev + 1) % TIPS.length)
  }, [])

  const quickActions = [
    { id: 'new-file', icon: FilePlus, label: 'New File', shortcut: 'Ctrl+N', onClick: () => {
      openFile({ path: `untitled-${Date.now()}`, name: 'Untitled', content: '', language: 'plaintext', isModified: false, aiModified: false })
    }},
    { id: 'open-file', icon: FileText, label: 'Open File', shortcut: 'Ctrl+O', onClick: onOpenFolder },
    { id: 'open-folder', icon: FolderOpen, label: 'Open Folder', shortcut: '', onClick: onOpenFolder },
    { id: 'clone-repo', icon: GitBranch, label: 'Clone Git Repository', shortcut: '', onClick: () => window.dispatchEvent(new Event('orion:show-git')) },
  ]

  const gettingStarted = [
    { id: 'theme', label: 'Choose your theme', desc: 'Personalize the editor appearance', onClick: () => window.dispatchEvent(new Event('orion:open-settings')) },
    { id: 'shortcuts', label: 'Configure keyboard shortcuts', desc: 'Customize keybindings to your preference', onClick: () => window.dispatchEvent(new Event('orion:open-settings')) },
    { id: 'ai', label: 'Set up AI assistant', desc: 'Configure AI-powered code editing', onClick: onOpenChat },
    { id: 'extensions', label: 'Explore extensions', desc: 'Enhance your editor with plugins', onClick: () => window.dispatchEvent(new Event('orion:show-extensions')) },
  ]

  const displayedRecent = showAllRecent ? recentFiles : recentFiles.slice(0, 10)

  const completedCount = gettingStarted.filter((g) => checked[g.id]).length

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        overflow: 'auto',
        userSelect: 'none',
      }}
    >
      {/* Scrollable content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 40px 24px',
        minHeight: 0,
        overflow: 'auto',
      }}>
        {/* Logo/Brand */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 700,
              letterSpacing: '-2px',
              background: 'linear-gradient(135deg, var(--accent-purple) 0%, var(--accent) 50%, var(--accent-green) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: 6,
              lineHeight: 1.1,
            }}
          >
            Orion
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 400 }}>
            AI-Powered Code Editor
          </div>
        </div>

        {/* Two-column layout */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 48,
          maxWidth: 860,
          width: '100%',
        }}>
          {/* LEFT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Quick Actions */}
            <section>
              <SectionHeader>Quick Actions</SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {quickActions.map(({ id, icon: Icon, label, shortcut, onClick }) => (
                  <button
                    key={id}
                    onClick={onClick}
                    onMouseEnter={() => setHoveredAction(id)}
                    onMouseLeave={() => setHoveredAction(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      background: hoveredAction === id ? 'var(--bg-hover)' : 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: 400,
                      textAlign: 'left',
                      transition: 'background 0.12s',
                      width: '100%',
                    }}
                  >
                    <Icon size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {shortcut && (
                      <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}>
                        {shortcut}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>

            {/* Recent Files */}
            <section>
              <SectionHeader>Recent</SectionHeader>
              {recentFiles.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 12px' }}>
                  No recent files yet. Open a file to get started.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {displayedRecent.map((file) => {
                    const { icon: FileIcon, color } = getFileIcon(file.name)
                    return (
                      <button
                        key={file.path}
                        onClick={async () => {
                          try {
                            const result = await (window as any).api.readFile(file.path)
                            if (result) {
                              openFile({
                                path: file.path,
                                name: file.name,
                                content: result.content,
                                language: result.language || 'plaintext',
                                isModified: false,
                                aiModified: false,
                              })
                            }
                          } catch {}
                        }}
                        onMouseEnter={() => setHoveredRecent(file.path)}
                        onMouseLeave={() => setHoveredRecent(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '5px 12px',
                          background: hoveredRecent === file.path ? 'var(--bg-hover)' : 'transparent',
                          border: 'none',
                          borderRadius: 5,
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontSize: 12,
                          textAlign: 'left',
                          transition: 'background 0.12s',
                          width: '100%',
                        }}
                      >
                        <FileIcon size={14} style={{ color, flexShrink: 0 }} />
                        <span style={{
                          color: hoveredRecent === file.path ? 'var(--accent)' : 'var(--text-primary)',
                          transition: 'color 0.12s',
                          fontWeight: 400,
                        }}>
                          {file.name}
                        </span>
                        <span style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          textAlign: 'right',
                        }}>
                          {getRelativePath(file.path)}
                        </span>
                      </button>
                    )
                  })}
                  {recentFiles.length > 10 && !showAllRecent && (
                    <button
                      onClick={() => setShowAllRecent(true)}
                      onMouseEnter={() => setHoveredRecent('__more__')}
                      onMouseLeave={() => setHoveredRecent(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '5px 12px',
                        background: hoveredRecent === '__more__' ? 'var(--bg-hover)' : 'transparent',
                        border: 'none',
                        borderRadius: 5,
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        fontSize: 12,
                        textAlign: 'left',
                        transition: 'background 0.12s',
                        marginTop: 2,
                      }}
                    >
                      More...
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            {/* Getting Started */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <SectionHeader style={{ marginBottom: 0 }}>Getting Started</SectionHeader>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {completedCount}/{gettingStarted.length} done
                </span>
              </div>

              {/* Progress bar */}
              <div style={{
                height: 3,
                borderRadius: 2,
                background: 'var(--bg-hover)',
                marginBottom: 12,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${(completedCount / gettingStarted.length) * 100}%`,
                  background: 'var(--accent-green)',
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {gettingStarted.map(({ id, label, desc, onClick }) => (
                  <div
                    key={id}
                    onMouseEnter={() => setHoveredStartItem(id)}
                    onMouseLeave={() => setHoveredStartItem(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 6,
                      background: hoveredStartItem === id ? 'var(--bg-hover)' : 'transparent',
                      transition: 'background 0.12s',
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      toggleChecked(id)
                      onClick()
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: checked[id] ? 'none' : '1.5px solid var(--text-muted)',
                      background: checked[id] ? 'var(--accent-green)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: 1,
                      transition: 'all 0.15s',
                    }}>
                      {checked[id] && <Check size={12} style={{ color: 'var(--bg-primary)' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13,
                        color: checked[id] ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: checked[id] ? 'line-through' : 'none',
                        fontWeight: 400,
                        transition: 'color 0.15s',
                      }}>
                        {label}
                      </div>
                      <div style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        marginTop: 2,
                      }}>
                        {desc}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                      marginTop: 3,
                      opacity: hoveredStartItem === id ? 1 : 0,
                      transition: 'opacity 0.12s',
                    }} />
                  </div>
                ))}
              </div>
            </section>

            {/* Tips */}
            <section>
              <SectionHeader>Tip of the Day</SectionHeader>
              <div style={{
                padding: '14px 16px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <Lightbulb size={16} style={{ color: 'var(--accent-orange)', flexShrink: 0, marginTop: 1 }} />
                  <div style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {TIPS[tipIndex].text}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                  <button
                    onClick={nextTip}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 10px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 11,
                      transition: 'border-color 0.12s, color 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--text-muted)'
                      e.currentTarget.style.color = 'var(--text-primary)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.color = 'var(--text-secondary)'
                    }}
                  >
                    <RefreshCw size={11} />
                    Next Tip
                  </button>
                </div>
              </div>
            </section>

            {/* Helpful Links */}
            <section>
              <SectionHeader>Learn</SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[
                  { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', onClick: onOpenPalette },
                  { label: 'Open Terminal', shortcut: 'Ctrl+`', onClick: onOpenTerminal },
                  { label: 'Settings', shortcut: 'Ctrl+,', onClick: onOpenSettings },
                  { label: 'AI Chat', shortcut: 'Ctrl+L', onClick: onOpenChat },
                ].map(({ label, shortcut, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 5,
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 12,
                      textAlign: 'left',
                      transition: 'background 0.12s',
                      width: '100%',
                    }}
                  >
                    <span style={{ flex: 1 }}>{label}</span>
                    <span style={{
                      fontSize: 11,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}>
                      {shortcut}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          marginTop: 48,
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          maxWidth: 860,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          {/* Show on startup toggle */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            <div
              onClick={() => setShowOnStartup(!showOnStartup)}
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                border: showOnStartup ? 'none' : '1.5px solid var(--text-muted)',
                background: showOnStartup ? 'var(--accent)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {showOnStartup && <Check size={10} style={{ color: 'var(--bg-primary)' }} />}
            </div>
            Show Welcome Tab on Startup
          </label>

          {/* Version */}
          <div style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}>
            <span>Orion v1.0.0</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.8px',
      color: 'var(--text-muted)',
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  )
}
