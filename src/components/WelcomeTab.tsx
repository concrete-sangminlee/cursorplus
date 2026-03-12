import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FolderOpen, FileText, GitBranch, FilePlus,
  ChevronRight, ChevronDown, Lightbulb, Check, RefreshCw,
  File, Code, Image, Database, FileJson, FileCode, Braces,
  Palette, Settings, Keyboard, Terminal, Sparkles, Zap,
  Star, ExternalLink, BookOpen, MessageCircle, X,
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

const VERSION = '1.2.0'

const TIPS = [
  { shortcut: 'Ctrl+P', text: 'Quickly open any file in your workspace by typing part of its name.' },
  { shortcut: 'Ctrl+Shift+P', text: 'Open the Command Palette to access every command in Orion.' },
  { shortcut: 'Ctrl+K', text: 'Use inline AI editing to transform, refactor, or generate code in place.' },
  { shortcut: 'Ctrl+D', text: 'Select the next occurrence of the current word for multi-cursor editing.' },
  { shortcut: 'Ctrl+\\', text: 'Split your editor to view two files side by side.' },
  { shortcut: 'Ctrl+`', text: 'Toggle the integrated terminal without leaving the editor.' },
  { shortcut: 'Ctrl+Shift+F', text: 'Search across all files in your workspace instantly.' },
  { shortcut: 'Alt+Up/Down', text: 'Move the current line up or down for quick rearranging.' },
  { shortcut: 'Ctrl+L', text: 'Open the AI chat panel for longer conversations about your code.' },
  { shortcut: 'F2', text: 'Rename a symbol across your entire project with a single keystroke.' },
  { shortcut: 'Ctrl+G', text: 'Jump to a specific line number instantly.' },
  { shortcut: 'Alt+Click', text: 'Place multiple cursors anywhere in the document for parallel editing.' },
  { shortcut: 'Ctrl+,', text: 'Open Settings to customize every aspect of your editing experience.' },
]

const WHATS_NEW = [
  { icon: Zap, title: 'Split Editor', desc: 'View and edit two files side by side with Ctrl+\\.' },
  { icon: Sparkles, title: 'AI Inline Edits', desc: 'Press Ctrl+K to transform code with natural language.' },
  { icon: Terminal, title: 'Terminal Themes', desc: 'Choose from multiple terminal color schemes.' },
  { icon: Palette, title: 'Status Bar Dropdowns', desc: 'Quick access to language mode, encoding, and EOL settings.' },
  { icon: Star, title: 'Chat History', desc: 'Your AI conversations are now saved and searchable.' },
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

/* ---------- Inline Orion Logo SVG ---------- */
function OrionLogo({ size = 64 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      style={{ filter: 'drop-shadow(0 0 24px rgba(99,102,241,0.4))' }}
    >
      <defs>
        <linearGradient id="wlcBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>
        <linearGradient id="wlcOGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C7D2FE" />
          <stop offset="100%" stopColor="#E0E7FF" />
        </linearGradient>
        <linearGradient id="wlcStarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="100%" stopColor="#FCD34D" />
        </linearGradient>
        <filter id="wlcGlow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="16" y="16" width="480" height="480" rx="96" ry="96" fill="url(#wlcBgGrad)" />
      <circle cx="256" cy="270" r="140" fill="none" stroke="url(#wlcOGrad)" strokeWidth="36" strokeLinecap="round" opacity="0.95" />
      <circle cx="256" cy="270" r="140" fill="none" stroke="url(#wlcBgGrad)" strokeWidth="40" strokeDasharray="60 820" strokeDashoffset="-40" transform="rotate(-45 256 270)" />
      <circle cx="348" cy="178" r="12" fill="url(#wlcStarGrad)" filter="url(#wlcGlow)" />
      <circle cx="164" cy="362" r="9" fill="url(#wlcStarGrad)" filter="url(#wlcGlow)" />
      <circle cx="178" cy="192" r="7" fill="url(#wlcStarGrad)" filter="url(#wlcGlow)" opacity="0.9" />
      <circle cx="340" cy="352" r="7" fill="url(#wlcStarGrad)" filter="url(#wlcGlow)" opacity="0.9" />
      <circle cx="222" cy="270" r="5" fill="#FDE68A" filter="url(#wlcGlow)" opacity="0.85" />
      <circle cx="256" cy="262" r="6" fill="#FDE68A" filter="url(#wlcGlow)" opacity="0.95" />
      <circle cx="290" cy="270" r="5" fill="#FDE68A" filter="url(#wlcGlow)" opacity="0.85" />
      <line x1="178" y1="192" x2="222" y2="270" stroke="#C7D2FE" strokeWidth="1.5" opacity="0.3" />
      <line x1="222" y1="270" x2="256" y2="262" stroke="#C7D2FE" strokeWidth="1.5" opacity="0.3" />
      <line x1="256" y1="262" x2="290" y2="270" stroke="#C7D2FE" strokeWidth="1.5" opacity="0.3" />
      <line x1="290" y1="270" x2="340" y2="352" stroke="#C7D2FE" strokeWidth="1.5" opacity="0.3" />
      <line x1="348" y1="178" x2="290" y2="270" stroke="#C7D2FE" strokeWidth="1.5" opacity="0.3" />
      <line x1="178" y1="192" x2="348" y2="178" stroke="#C7D2FE" strokeWidth="1" opacity="0.2" />
      <line x1="164" y1="362" x2="222" y2="270" stroke="#C7D2FE" strokeWidth="1.5" opacity="0.3" />
      <line x1="164" y1="362" x2="340" y2="352" stroke="#C7D2FE" strokeWidth="1" opacity="0.2" />
      <circle cx="120" cy="120" r="2" fill="#E0E7FF" opacity="0.5" />
      <circle cx="400" cy="100" r="2.5" fill="#E0E7FF" opacity="0.4" />
      <circle cx="390" cy="420" r="2" fill="#E0E7FF" opacity="0.45" />
      <circle cx="100" cy="400" r="1.5" fill="#E0E7FF" opacity="0.35" />
      <circle cx="300" cy="130" r="1.5" fill="#E0E7FF" opacity="0.4" />
      <circle cx="430" cy="260" r="2" fill="#E0E7FF" opacity="0.3" />
      <circle cx="80" cy="280" r="1.5" fill="#E0E7FF" opacity="0.35" />
    </svg>
  )
}

/* ---------- Shared style injection ---------- */
const styleId = 'orion-welcome-styles'
function injectStyles() {
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes orionFadeInUp {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes orionPulseGlow {
      0%, 100% { box-shadow: 0 0 20px rgba(99,102,241,0.15); }
      50% { box-shadow: 0 0 35px rgba(99,102,241,0.3); }
    }
    @keyframes orionShimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    .orion-welcome-action:hover {
      background: var(--bg-hover) !important;
      transform: translateX(2px);
    }
    .orion-welcome-action:active {
      transform: translateX(0);
    }
    .orion-welcome-recent:hover {
      background: var(--bg-hover) !important;
    }
    .orion-welcome-recent:hover .orion-recent-name {
      color: var(--accent) !important;
    }
    .orion-welcome-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .orion-welcome-card:hover {
      border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
      box-shadow: 0 2px 16px rgba(0,0,0,0.08);
    }
    .orion-welcome-checklist-item:hover {
      background: var(--bg-hover) !important;
    }
    .orion-welcome-footer-link {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 4px;
      color: var(--text-muted);
      font-size: 12px;
      text-decoration: none;
      cursor: pointer;
      transition: color 0.15s, background 0.15s;
      border: none;
      background: none;
    }
    .orion-welcome-footer-link:hover {
      color: var(--text-primary);
      background: var(--bg-hover);
    }
    .orion-whats-new-item:hover {
      background: var(--bg-hover) !important;
    }
    .orion-tip-next:hover {
      border-color: var(--text-muted) !important;
      color: var(--text-primary) !important;
      background: var(--bg-hover) !important;
    }
    .orion-clear-btn:hover {
      color: var(--text-primary) !important;
      background: var(--bg-hover) !important;
    }
  `
  document.head.appendChild(style)
}

/* ---------- Main Component ---------- */
export default function WelcomeTab({ onOpenFolder, onOpenPalette, onOpenTerminal, onOpenSettings, onOpenChat }: WelcomeTabProps) {
  const recentFiles = useRecentFilesStore((s) => s.getRecent(10))
  const clearRecent = useRecentFilesStore((s) => s.clearRecent)
  const openFile = useEditorStore((s) => s.openFile)

  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length))
  const [checked, setChecked] = useState<Record<string, boolean>>(loadChecked)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    quickstart: true,
    recent: true,
    gettingStarted: true,
    whatsNew: false,
  })
  const [showOnStartup, setShowOnStartup] = useState(() => {
    const stored = localStorage.getItem(SHOW_WELCOME_KEY)
    return stored === null ? true : stored === 'true'
  })

  useEffect(() => { injectStyles() }, [])

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

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const quickActions = useMemo(() => [
    { id: 'new-file', icon: FilePlus, label: 'New File', shortcut: 'Ctrl+N', onClick: () => {
      openFile({ path: `untitled-${Date.now()}`, name: 'Untitled', content: '', language: 'plaintext', isModified: false, aiModified: false })
    }},
    { id: 'open-file', icon: FileText, label: 'Open File', shortcut: 'Ctrl+O', onClick: onOpenFolder },
    { id: 'open-folder', icon: FolderOpen, label: 'Open Folder', shortcut: '', onClick: onOpenFolder },
    { id: 'clone-repo', icon: GitBranch, label: 'Clone Git Repository', shortcut: '', onClick: () => window.dispatchEvent(new Event('orion:show-git')) },
  ], [openFile, onOpenFolder])

  const gettingStarted = useMemo(() => [
    { id: 'theme', icon: Palette, label: 'Choose a color theme', desc: 'Personalize the look and feel of your editor', onClick: () => window.dispatchEvent(new Event('orion:open-settings')) },
    { id: 'ai', icon: Sparkles, label: 'Configure AI provider', desc: 'Set up AI-powered code assistance', onClick: onOpenSettings },
    { id: 'shortcuts', icon: Keyboard, label: 'Learn keyboard shortcuts', desc: 'Master the keybindings to boost productivity', onClick: onOpenPalette },
    { id: 'terminal', icon: Terminal, label: 'Explore the terminal', desc: 'Use the integrated terminal for your workflow', onClick: onOpenTerminal },
  ], [onOpenSettings, onOpenPalette, onOpenTerminal])

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
      {/* Subtle top gradient overlay */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 300,
        background: 'radial-gradient(ellipse 80% 50% at 50% 0%, color-mix(in srgb, var(--accent-purple) 6%, transparent), transparent)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 40px 24px',
        minHeight: 0,
        overflow: 'auto',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* ===== HERO SECTION ===== */}
        <div style={{
          textAlign: 'center',
          marginBottom: 44,
          animation: 'orionFadeInUp 0.5s ease both',
        }}>
          <div style={{
            marginBottom: 16,
            animation: 'orionPulseGlow 4s ease-in-out infinite',
            borderRadius: 24,
            display: 'inline-block',
          }}>
            <OrionLogo size={72} />
          </div>

          <div style={{
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: '-2.5px',
            background: 'linear-gradient(135deg, #818CF8 0%, #6366F1 25%, #A78BFA 50%, #34D399 75%, #6EE7B7 100%)',
            backgroundSize: '200% auto',
            animation: 'orionShimmer 6s linear infinite',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            lineHeight: 1.1,
            marginBottom: 8,
          }}>
            Orion IDE
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}>
            <span style={{
              fontSize: 14,
              color: 'var(--text-secondary)',
              fontWeight: 400,
              letterSpacing: '0.3px',
            }}>
              AI-Powered Code Editor
            </span>
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--accent)',
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              padding: '2px 8px',
              borderRadius: 10,
              letterSpacing: '0.5px',
            }}>
              v{VERSION}
            </span>
          </div>
        </div>

        {/* ===== TWO-COLUMN LAYOUT ===== */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 40,
          maxWidth: 920,
          width: '100%',
          animation: 'orionFadeInUp 0.5s ease 0.1s both',
        }}>

          {/* ===== LEFT COLUMN ===== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* --- Quick Start --- */}
            <section>
              <CollapsibleHeader
                title="Quick Start"
                expanded={expandedSections.quickstart}
                onToggle={() => toggleSection('quickstart')}
              />
              {expandedSections.quickstart && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {quickActions.map(({ id, icon: Icon, label, shortcut, onClick }) => (
                    <button
                      key={id}
                      onClick={onClick}
                      className="orion-welcome-action"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 12px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 7,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 400,
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        width: '100%',
                      }}
                    >
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <Icon size={15} style={{ color: 'var(--accent)' }} />
                      </div>
                      <span style={{ flex: 1 }}>{label}</span>
                      {shortcut && (
                        <kbd style={{
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono, monospace)',
                          background: 'var(--bg-secondary)',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: '1px solid var(--border)',
                        }}>
                          {shortcut}
                        </kbd>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* --- Recent Files --- */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CollapsibleHeader
                  title="Recent"
                  expanded={expandedSections.recent}
                  onToggle={() => toggleSection('recent')}
                  badge={recentFiles.length > 0 ? String(recentFiles.length) : undefined}
                />
                {recentFiles.length > 0 && expandedSections.recent && (
                  <button
                    className="orion-clear-btn"
                    onClick={(e) => { e.stopPropagation(); clearRecent() }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: 10,
                      fontWeight: 500,
                      transition: 'all 0.15s',
                      marginBottom: 10,
                    }}
                  >
                    <X size={10} />
                    Clear
                  </button>
                )}
              </div>
              {expandedSections.recent && (
                <>
                  {recentFiles.length === 0 ? (
                    <div style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      padding: '16px',
                      textAlign: 'center',
                      background: 'var(--bg-secondary)',
                      borderRadius: 8,
                      border: '1px dashed var(--border)',
                    }}>
                      No recent files yet. Open a file to get started.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {recentFiles.map((file) => {
                        const { icon: FileIcon, color } = getFileIcon(file.name)
                        return (
                          <button
                            key={file.path}
                            className="orion-welcome-recent"
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
                              } catch { /* ignore */ }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '6px 12px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: 12,
                              textAlign: 'left',
                              transition: 'background 0.12s',
                              width: '100%',
                            }}
                          >
                            <FileIcon size={14} style={{ color, flexShrink: 0 }} />
                            <span className="orion-recent-name" style={{
                              color: 'var(--text-primary)',
                              transition: 'color 0.12s',
                              fontWeight: 400,
                              whiteSpace: 'nowrap',
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
                    </div>
                  )}
                </>
              )}
            </section>

            {/* --- Tips & Tricks --- */}
            <section>
              <SectionHeader>Tips & Tricks</SectionHeader>
              <div className="orion-welcome-card" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--accent-orange) 12%, transparent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Lightbulb size={16} style={{ color: 'var(--accent-orange)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {TIPS[tipIndex].shortcut && (
                      <kbd style={{
                        display: 'inline-block',
                        fontSize: 10,
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'var(--accent)',
                        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        padding: '1px 7px',
                        borderRadius: 4,
                        marginBottom: 6,
                      }}>
                        {TIPS[tipIndex].shortcut}
                      </kbd>
                    )}
                    <div style={{
                      fontSize: 12,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.55,
                    }}>
                      {TIPS[tipIndex].text}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <button
                    onClick={nextTip}
                    className="orion-tip-next"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 12px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 5,
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 500,
                      transition: 'all 0.15s',
                    }}
                  >
                    <RefreshCw size={11} />
                    Next Tip
                  </button>
                </div>
              </div>
            </section>
          </div>

          {/* ===== RIGHT COLUMN ===== */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* --- Getting Started --- */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <CollapsibleHeader
                  title="Getting Started"
                  expanded={expandedSections.gettingStarted}
                  onToggle={() => toggleSection('gettingStarted')}
                />
                <span style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: completedCount === gettingStarted.length ? 'var(--accent-green)' : 'var(--text-muted)',
                  marginBottom: 10,
                }}>
                  {completedCount}/{gettingStarted.length} completed
                </span>
              </div>

              {/* Progress bar */}
              <div style={{
                height: 4,
                borderRadius: 2,
                background: 'var(--bg-hover)',
                marginBottom: 14,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${(completedCount / gettingStarted.length) * 100}%`,
                  background: completedCount === gettingStarted.length
                    ? 'var(--accent-green)'
                    : 'linear-gradient(90deg, var(--accent-purple), var(--accent))',
                  borderRadius: 2,
                  transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }} />
              </div>

              {expandedSections.gettingStarted && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {gettingStarted.map(({ id, icon: ItemIcon, label, desc, onClick }) => (
                    <div
                      key={id}
                      className="orion-welcome-checklist-item"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        padding: '9px 10px',
                        borderRadius: 7,
                        background: 'transparent',
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
                        width: 20,
                        height: 20,
                        borderRadius: 5,
                        border: checked[id] ? 'none' : '2px solid var(--text-muted)',
                        background: checked[id]
                          ? 'linear-gradient(135deg, var(--accent-green), #34D399)'
                          : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: 1,
                        transition: 'all 0.2s',
                      }}>
                        {checked[id] && <Check size={12} style={{ color: '#fff' }} />}
                      </div>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: checked[id]
                          ? 'var(--bg-hover)'
                          : 'color-mix(in srgb, var(--accent-purple) 10%, transparent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.2s',
                      }}>
                        <ItemIcon size={14} style={{
                          color: checked[id] ? 'var(--text-muted)' : 'var(--accent-purple)',
                          transition: 'color 0.2s',
                        }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          color: checked[id] ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: checked[id] ? 'line-through' : 'none',
                          fontWeight: 400,
                          transition: 'all 0.15s',
                        }}>
                          {label}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          marginTop: 2,
                          lineHeight: 1.3,
                        }}>
                          {desc}
                        </div>
                      </div>
                      <ChevronRight size={14} style={{
                        color: 'var(--text-muted)',
                        flexShrink: 0,
                        marginTop: 5,
                        transition: 'opacity 0.12s',
                      }} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* --- What's New --- */}
            <section>
              <CollapsibleHeader
                title={`What's New in v${VERSION}`}
                expanded={expandedSections.whatsNew}
                onToggle={() => toggleSection('whatsNew')}
              />
              {expandedSections.whatsNew && (
                <div className="orion-welcome-card" style={{ padding: 0, overflow: 'hidden' }}>
                  {WHATS_NEW.map(({ icon: WIcon, title, desc }, i) => (
                    <div
                      key={title}
                      className="orion-whats-new-item"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 12,
                        padding: '12px 16px',
                        borderBottom: i < WHATS_NEW.length - 1 ? '1px solid var(--border)' : 'none',
                        transition: 'background 0.12s',
                      }}
                    >
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <WIcon size={14} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                          {title}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                          {desc}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* --- Learn shortcuts --- */}
            <section>
              <SectionHeader>Learn</SectionHeader>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {[
                  { icon: Code, label: 'Command Palette', shortcut: 'Ctrl+Shift+P', onClick: onOpenPalette },
                  { icon: Terminal, label: 'Open Terminal', shortcut: 'Ctrl+`', onClick: onOpenTerminal },
                  { icon: Settings, label: 'Settings', shortcut: 'Ctrl+,', onClick: onOpenSettings },
                  { icon: MessageCircle, label: 'AI Chat', shortcut: 'Ctrl+L', onClick: onOpenChat },
                ].map(({ icon: LIcon, label, shortcut, onClick }) => (
                  <button
                    key={label}
                    onClick={onClick}
                    className="orion-welcome-action"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 6,
                      color: 'var(--accent)',
                      cursor: 'pointer',
                      fontSize: 12,
                      textAlign: 'left',
                      transition: 'all 0.15s',
                      width: '100%',
                    }}
                  >
                    <LIcon size={14} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{label}</span>
                    <kbd style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono, monospace)',
                      background: 'var(--bg-secondary)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      border: '1px solid var(--border)',
                    }}>
                      {shortcut}
                    </kbd>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <footer style={{
          marginTop: 48,
          paddingTop: 20,
          borderTop: '1px solid var(--border)',
          maxWidth: 920,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          animation: 'orionFadeInUp 0.5s ease 0.2s both',
        }}>
          {/* Footer links row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            flexWrap: 'wrap',
          }}>
            <button className="orion-welcome-footer-link" onClick={() => window.open('#', '_blank')}>
              <BookOpen size={12} />
              Documentation
            </button>
            <span style={{ color: 'var(--border)', fontSize: 11 }}>|</span>
            <button className="orion-welcome-footer-link" onClick={() => window.open('#', '_blank')}>
              <ExternalLink size={12} />
              GitHub
            </button>
            <span style={{ color: 'var(--border)', fontSize: 11 }}>|</span>
            <button className="orion-welcome-footer-link" onClick={() => window.open('#', '_blank')}>
              <MessageCircle size={12} />
              Discord
            </button>
            <span style={{ color: 'var(--border)', fontSize: 11 }}>|</span>
            <button className="orion-welcome-footer-link" onClick={() => window.open('#', '_blank')}>
              <ExternalLink size={12} />
              Twitter
            </button>
          </div>

          {/* Bottom bar: startup toggle + version */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
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

            <div style={{
              fontSize: 11,
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span>Orion IDE v{VERSION}</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* ---------- Subcomponents ---------- */

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

function CollapsibleHeader({
  title,
  expanded,
  onToggle,
  badge,
}: {
  title: string
  expanded: boolean
  onToggle: () => void
  badge?: string
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.8px',
        color: 'var(--text-muted)',
        marginBottom: 10,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        transition: 'color 0.15s',
      }}
    >
      {expanded
        ? <ChevronDown size={12} style={{ transition: 'transform 0.2s' }} />
        : <ChevronRight size={12} style={{ transition: 'transform 0.2s' }} />
      }
      {title}
      {badge && (
        <span style={{
          fontSize: 9,
          fontWeight: 700,
          color: 'var(--accent)',
          background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
          padding: '0 5px',
          borderRadius: 8,
          lineHeight: '16px',
          textTransform: 'none',
          letterSpacing: 0,
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}
