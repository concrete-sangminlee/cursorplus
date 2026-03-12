import { useState, useCallback, useEffect, useRef } from 'react'
import TerminalPanel from './TerminalPanel'
import ProblemsPanel from './ProblemsPanel'
import OutputPanel from './OutputPanel'
import { useAgentStore } from '@/store/agents'
import { useProblemsStore } from '@/store/problems'
import { useOutputStore } from '@/store/output'
import {
  Terminal, Activity, AlertTriangle, FileOutput,
  ChevronRight, AlertCircle, Info, Zap, Plus, X, Trash2,
  ChevronDown,
} from 'lucide-react'
import { v4 as uuid } from 'uuid'

type Tab = 'terminal' | 'agent-log' | 'problems' | 'output'

const tabs: { id: Tab; label: string; Icon: typeof Terminal }[] = [
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'agent-log', label: 'Agent Log', Icon: Activity },
  { id: 'problems', label: 'Problems', Icon: AlertTriangle },
  { id: 'output', label: 'Output', Icon: FileOutput },
]

/* ── Terminal profile definitions ─────────────────────── */

export interface TerminalProfile {
  id: string
  name: string
  shellPath: string
  args: string[]
  icon: string // emoji used as icon
}

const isWindows = navigator.userAgent.includes('Windows') || navigator.platform?.startsWith('Win')

const windowsProfiles: TerminalProfile[] = [
  { id: 'powershell', name: 'PowerShell', shellPath: 'powershell.exe', args: [], icon: 'PS' },
  { id: 'cmd', name: 'Command Prompt', shellPath: 'cmd.exe', args: [], icon: '>' },
  { id: 'gitbash', name: 'Git Bash', shellPath: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'], icon: '$' },
  { id: 'wsl', name: 'WSL', shellPath: 'wsl.exe', args: [], icon: '#' },
]

const unixProfiles: TerminalProfile[] = [
  { id: 'bash', name: 'bash', shellPath: '/bin/bash', args: ['--login'], icon: '$' },
  { id: 'zsh', name: 'zsh', shellPath: '/bin/zsh', args: ['--login'], icon: '%' },
]

const defaultProfiles = isWindows ? windowsProfiles : unixProfiles

/* ── Log type styling ──────────────────────────────────── */

const logTypeConfig: Record<string, { color: string; borderColor: string; Icon: typeof Info }> = {
  info:       { color: 'var(--accent)',        borderColor: 'rgba(88,166,255,0.3)',  Icon: Info },
  action:     { color: 'var(--accent-green)',  borderColor: 'rgba(63,185,80,0.3)',   Icon: Zap },
  delegation: { color: 'var(--accent-purple)', borderColor: 'rgba(188,140,255,0.3)', Icon: ChevronRight },
  error:      { color: 'var(--accent-red)',    borderColor: 'rgba(248,81,73,0.3)',   Icon: AlertCircle },
}

/* ── Main component ────────────────────────────────────── */

interface TermInstance {
  id: string
  name: string
  profileId?: string
  shellPath?: string
  shellArgs?: string[]
}

export default function BottomPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('terminal')
  const [terminals, setTerminals] = useState<TermInstance[]>([
    { id: uuid(), name: 'Terminal 1' },
  ])
  const [activeTerminal, setActiveTerminal] = useState<string>(() => terminals[0]?.id || '')
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const logs = useAgentStore((s) => s.logs)

  /* ── Create terminal with optional profile ───────────── */
  const addTerminal = useCallback((profile?: TerminalProfile) => {
    const num = terminals.length + 1
    const name = profile ? `${profile.name} ${num}` : `Terminal ${num}`
    const t: TermInstance = {
      id: uuid(),
      name,
      profileId: profile?.id,
      shellPath: profile?.shellPath,
      shellArgs: profile?.args,
    }
    setTerminals(prev => [...prev, t])
    setActiveTerminal(t.id)
    setActiveTab('terminal')
    setShowProfileMenu(false)
  }, [terminals.length])

  const addDefaultTerminal = useCallback(() => {
    addTerminal(undefined)
  }, [addTerminal])

  const closeTerminal = useCallback((id: string) => {
    setTerminals(prev => {
      const next = prev.filter(t => t.id !== id)
      if (next.length === 0) {
        const t: TermInstance = { id: uuid(), name: 'Terminal 1' }
        setActiveTerminal(t.id)
        return [t]
      }
      if (activeTerminal === id) setActiveTerminal(next[0].id)
      return next
    })
  }, [activeTerminal])

  /* ── Terminal title tracking ─────────────────────────── */
  const handleTitleChange = useCallback((sessionId: string, title: string) => {
    setTerminals(prev =>
      prev.map(t =>
        t.id === sessionId ? { ...t, name: title || t.name } : t
      )
    )
  }, [])

  /* ── Close profile dropdown on outside click ─────────── */
  useEffect(() => {
    if (!showProfileMenu) return
    const handler = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showProfileMenu])

  /* ── Global keyboard shortcut: Ctrl+Shift+` ─────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === '`') {
        e.preventDefault()
        addDefaultTerminal()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [addDefaultTerminal])

  // Output channel info
  const outputActiveChannel = useOutputStore((s) => s.activeChannel)
  const outputChannels = useOutputStore((s) => s.channels)
  const outputLineCount = outputChannels.get(outputActiveChannel)?.length ?? 0

  // Counts for badges
  const problems = useProblemsStore((s) => s.problems)
  const problemsErrorCount = problems.filter((p) => p.severity === 'error').length
  const problemsWarningCount = problems.filter((p) => p.severity === 'warning').length
  const problemsBadge = problemsErrorCount + problemsWarningCount
  const logCount = logs.length

  return (
    <div
      className="h-full flex flex-col"
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Tab Bar */}
      <div
        className="shrink-0 flex items-center px-1 gap-0"
        style={{
          height: 32,
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          const badge =
            id === 'problems'
              ? problemsBadge
              : id === 'agent-log'
                ? logCount
                : id === 'output'
                  ? outputLineCount
                  : 0
          // Show channel name in Output tab when not Main
          const displayLabel =
            id === 'output' && outputActiveChannel !== 'Main'
              ? `${label}: ${outputActiveChannel}`
              : label

          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-1.5 transition-colors duration-100 relative"
              style={{
                height: 32,
                padding: '0 12px',
                fontSize: 11,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: isActive ? 500 : 400,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <Icon size={12} />
              {displayLabel}

              {/* Badge */}
              {badge > 0 && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    background:
                      id === 'problems'
                        ? 'rgba(248,81,73,0.15)'
                        : 'rgba(88,166,255,0.12)',
                    color:
                      id === 'problems'
                        ? 'var(--accent-red)'
                        : 'var(--accent)',
                    fontFamily: 'var(--font-mono, monospace)',
                  }}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}

              {/* Active bottom accent line */}
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 8,
                    right: 8,
                    height: 2,
                    background: 'var(--accent)',
                    borderRadius: '2px 2px 0 0',
                  }}
                />
              )}
            </button>
          )
        })}

        {/* Right side: terminal sub-tabs + controls */}
        <div className="ml-auto flex items-center gap-1" style={{ paddingRight: 4 }}>
          {activeTab === 'terminal' && (
            <>
              {terminals.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTerminal(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    height: 22, padding: '0 6px',
                    fontSize: 10, borderRadius: 3,
                    color: activeTerminal === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: activeTerminal === t.id ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    transition: 'background 0.1s',
                    maxWidth: 140,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                  title={t.name}
                  onMouseEnter={e => { if (activeTerminal !== t.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
                  onMouseLeave={e => { if (activeTerminal !== t.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <Terminal size={10} style={{ flexShrink: 0 }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  {terminals.length > 1 && (
                    <span
                      onClick={e => { e.stopPropagation(); closeTerminal(t.id) }}
                      style={{ display: 'flex', marginLeft: 2, opacity: 0.5, cursor: 'pointer', flexShrink: 0 }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = '0.5' }}
                    >
                      <X size={10} />
                    </span>
                  )}
                </button>
              ))}

              {/* New terminal button */}
              <button
                onClick={addDefaultTerminal}
                title="New Terminal (Ctrl+Shift+`)"
                style={{
                  width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 3, border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', background: 'transparent',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <Plus size={12} />
              </button>

              {/* Profile dropdown button */}
              <div style={{ position: 'relative' }} ref={profileMenuRef}>
                <button
                  onClick={() => setShowProfileMenu(prev => !prev)}
                  title="Select Terminal Profile"
                  style={{
                    width: 22, height: 22,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 3, border: 'none', cursor: 'pointer',
                    color: showProfileMenu ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: showProfileMenu ? 'rgba(255,255,255,0.06)' : 'transparent',
                    transition: 'background 0.1s, color 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { if (!showProfileMenu) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' } }}
                >
                  <ChevronDown size={12} />
                </button>

                {/* Profile dropdown menu */}
                {showProfileMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 26,
                      right: 0,
                      minWidth: 200,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 0',
                      zIndex: 1000,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 10px',
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Terminal Profiles
                    </div>
                    {defaultProfiles.map(profile => (
                      <button
                        key={profile.id}
                        onClick={() => addTerminal(profile)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '6px 10px',
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                          e.currentTarget.style.color = 'var(--text-primary)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: 4,
                            background: 'rgba(255,255,255,0.04)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          {profile.icon}
                        </span>
                        <span>{profile.name}</span>
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: 9,
                            color: 'var(--text-muted)',
                            opacity: 0.6,
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          {profile.shellPath.split(/[/\\]/).pop()}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Kill terminal button */}
              <button
                onClick={() => closeTerminal(activeTerminal)}
                title="Kill Terminal"
                style={{
                  width: 22, height: 22,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 3, border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', background: 'transparent',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && terminals.map(t => (
          <div key={t.id} style={{ height: '100%', display: activeTerminal === t.id ? 'block' : 'none' }}>
            <TerminalPanel
              key={t.id}
              sessionId={t.id}
              shellPath={t.shellPath}
              shellArgs={t.shellArgs}
              onTitleChange={handleTitleChange}
            />
          </div>
        ))}

        {activeTab === 'agent-log' && (
          <div
            className="h-full overflow-y-auto"
            style={{
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: 11,
              padding: '4px 0',
            }}
          >
            {logs.length === 0 ? (
              <EmptyTabContent
                Icon={Activity}
                message="No agent activity yet"
                sub="Agent actions and decisions will appear here"
              />
            ) : (
              logs.map((log) => {
                const config = logTypeConfig[log.type] || logTypeConfig.info
                return (
                  <div
                    key={log.id}
                    className="flex items-start gap-2"
                    style={{
                      padding: '4px 10px 4px 10px',
                      borderLeft: `2px solid ${config.borderColor}`,
                      marginLeft: 4,
                      marginBottom: 1,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    {/* Timestamp */}
                    <span
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: 10,
                        flexShrink: 0,
                        width: 62,
                        opacity: 0.6,
                        paddingTop: 1,
                      }}
                    >
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>

                    {/* Type icon */}
                    <config.Icon
                      size={11}
                      style={{
                        color: config.color,
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    />

                    {/* Agent name */}
                    <span
                      style={{
                        flexShrink: 0,
                        fontWeight: 600,
                        color: 'var(--accent)',
                        fontSize: 11,
                        minWidth: 60,
                      }}
                    >
                      {log.agentId}
                    </span>

                    {/* Message */}
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      {log.message}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'problems' && <ProblemsPanel />}

        {activeTab === 'output' && <OutputPanel />}
      </div>
    </div>
  )
}

/* ── Empty tab content ─────────────────────────────────── */

function EmptyTabContent({
  Icon,
  message,
  sub,
}: {
  Icon: typeof Terminal
  message: string
  sub: string
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={18} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
      </div>
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: 12,
          fontWeight: 500,
          marginTop: 4,
        }}
      >
        {message}
      </p>
      <p
        style={{
          color: 'var(--text-muted)',
          fontSize: 11,
          opacity: 0.5,
        }}
      >
        {sub}
      </p>
    </div>
  )
}
