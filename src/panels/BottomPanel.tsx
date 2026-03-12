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
  ChevronDown, Columns2, Ban,
} from 'lucide-react'
import { v4 as uuid } from 'uuid'

type Tab = 'terminal' | 'agent-log' | 'problems' | 'output'

const tabs: { id: Tab; label: string; Icon: typeof Terminal }[] = [
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'agent-log', label: 'Agent Log', Icon: Activity },
  { id: 'problems', label: 'Problems', Icon: AlertTriangle },
  { id: 'output', label: 'Output', Icon: FileOutput },
]

/* ── CSS keyframes injected once ──────────────────────── */

const styleId = 'bottom-panel-animations'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    @keyframes bp-tab-slide-in {
      from { opacity: 0; transform: translateY(2px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes bp-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes bp-accent-grow {
      from { transform: scaleX(0); }
      to   { transform: scaleX(1); }
    }
    @keyframes bp-split-slide {
      from { opacity: 0; flex-basis: 0; }
      to   { opacity: 1; }
    }
    .bp-term-tab { transition: background 0.15s, color 0.15s, box-shadow 0.15s; }
    .bp-term-tab:hover { background: rgba(255,255,255,0.05) !important; }
    .bp-term-tab[data-active="true"] {
      background: rgba(255,255,255,0.08) !important;
      box-shadow: inset 0 -1px 0 var(--accent);
    }
    .bp-toolbar-btn {
      transition: background 0.12s, color 0.12s, transform 0.1s;
    }
    .bp-toolbar-btn:hover {
      background: rgba(255,255,255,0.08) !important;
      color: var(--text-primary) !important;
    }
    .bp-toolbar-btn:active { transform: scale(0.92); }
    .bp-rename-input {
      background: var(--bg-primary) !important;
      border: 1px solid var(--accent) !important;
      border-radius: 2px;
      outline: none;
      color: var(--text-primary);
      font-size: 10px;
      padding: 0 4px;
      height: 18px;
      width: 80px;
      font-family: inherit;
    }
  `
  document.head.appendChild(style)
}

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
  /** ID of the terminal this one is split with (shares a row) */
  splitParentId?: string
}

export default function BottomPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('terminal')
  const [terminals, setTerminals] = useState<TermInstance[]>([
    { id: uuid(), name: 'Terminal 1' },
  ])
  const [activeTerminal, setActiveTerminal] = useState<string>(() => terminals[0]?.id || '')
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; termId: string } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
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
      // Also remove any split children of this terminal
      const next = prev.filter(t => t.id !== id && t.splitParentId !== id)
      // If we're closing a split child, just remove it
      const closing = prev.find(t => t.id === id)
      const finalNext = closing?.splitParentId
        ? prev.filter(t => t.id !== id)
        : next
      if (finalNext.length === 0) {
        const t: TermInstance = { id: uuid(), name: 'Terminal 1' }
        setActiveTerminal(t.id)
        return [t]
      }
      if (activeTerminal === id) setActiveTerminal(finalNext[0].id)
      return finalNext
    })
  }, [activeTerminal])

  /* ── Split terminal ──────────────────────────────────── */
  const splitTerminal = useCallback(() => {
    const current = terminals.find(t => t.id === activeTerminal)
    if (!current) return
    // Determine the parent: if current is already a split child, use its parent
    const parentId = current.splitParentId || current.id
    const num = terminals.length + 1
    const t: TermInstance = {
      id: uuid(),
      name: `Terminal ${num}`,
      splitParentId: parentId,
    }
    setTerminals(prev => {
      // Insert the split right after the parent group
      const parentIdx = prev.findIndex(x => x.id === parentId)
      // Find last index of the group
      let lastIdx = parentIdx
      for (let i = parentIdx + 1; i < prev.length; i++) {
        if (prev[i].splitParentId === parentId) lastIdx = i
        else break
      }
      const copy = [...prev]
      copy.splice(lastIdx + 1, 0, t)
      return copy
    })
    setActiveTerminal(t.id)
    setActiveTab('terminal')
  }, [terminals, activeTerminal])

  /* ── Terminal title tracking ─────────────────────────── */
  const handleTitleChange = useCallback((sessionId: string, title: string) => {
    setTerminals(prev =>
      prev.map(t =>
        t.id === sessionId ? { ...t, name: title || t.name } : t
      )
    )
  }, [])

  /* ── Rename terminal (double-click) ──────────────────── */
  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      setTerminals(prev =>
        prev.map(t => t.id === renamingId ? { ...t, name: renameValue.trim() } : t)
      )
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue])

  const cancelRename = useCallback(() => {
    setRenamingId(null)
    setRenameValue('')
  }, [])

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  /* ── Clear terminal ──────────────────────────────────── */
  const clearTerminal = useCallback(() => {
    // Dispatch a custom event that TerminalPanel can listen for
    window.dispatchEvent(new CustomEvent('terminal:clear', { detail: { sessionId: activeTerminal } }))
  }, [activeTerminal])

  /* ── Kill terminal (explicit pty kill + remove tab) ──── */
  const killTerminal = useCallback((id: string) => {
    // Explicitly send kill signal to the backend pty
    window.api?.termKill?.(id)
    // Then close the tab
    closeTerminal(id)
    setContextMenu(null)
  }, [closeTerminal])

  /* ── Close context menu on outside click ─────────────── */
  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

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

  /* ── Build split groups for rendering ────────────────── */
  // A "group" is a parent terminal + its split children, rendered side-by-side
  const terminalGroups = buildTerminalGroups(terminals)

  // Find which group the active terminal belongs to
  const activeGroup = terminalGroups.find(g =>
    g.some(t => t.id === activeTerminal)
  )
  const activeGroupParentId = activeGroup?.[0]?.splitParentId || activeGroup?.[0]?.id

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
          height: 34,
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
            id === 'output' && outputActiveChannel !== 'Orion'
              ? `${label}: ${outputActiveChannel}`
              : label

          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-1.5 relative"
              style={{
                height: 34,
                padding: '0 12px',
                fontSize: 11,
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: isActive ? 500 : 400,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-muted)'
                  e.currentTarget.style.background = 'transparent'
                }
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
                    animation: 'bp-fade-in 0.2s ease',
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
                    animation: 'bp-accent-grow 0.2s ease',
                    transformOrigin: 'center',
                  }}
                />
              )}
            </button>
          )
        })}

        {/* ── Separator ────────────────────────────────────── */}
        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--border)',
            margin: '0 4px',
            opacity: 0.5,
          }}
        />

        {/* Right side: terminal sub-tabs + controls */}
        <div className="ml-auto flex items-center gap-0.5" style={{ paddingRight: 4 }}>
          {activeTab === 'terminal' && (
            <>
              {/* Terminal instance tabs */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  marginRight: 4,
                  maxWidth: 400,
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  scrollbarWidth: 'none',
                }}
              >
                {terminals.filter(t => !t.splitParentId).map(t => {
                  const isActive = activeTerminal === t.id ||
                    terminals.some(s => s.splitParentId === t.id && s.id === activeTerminal)
                  const splitChildren = terminals.filter(s => s.splitParentId === t.id)
                  const hasSplits = splitChildren.length > 0

                  const tooltipParts = [t.name]
                  if (t.shellPath) tooltipParts.push(`Shell: ${t.shellPath}`)
                  if (hasSplits) tooltipParts.push(`+${splitChildren.length} split`)

                  return (
                    <div
                      key={t.id}
                      className="bp-term-tab"
                      data-active={isActive}
                      onClick={() => setActiveTerminal(t.id)}
                      onDoubleClick={() => startRename(t.id, t.name)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setContextMenu({ x: e.clientX, y: e.clientY, termId: t.id })
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        height: 24, padding: '0 6px 0 8px',
                        fontSize: 10, borderRadius: 4,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                        border: 'none', cursor: 'pointer',
                        maxWidth: 160,
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        animation: 'bp-tab-slide-in 0.15s ease',
                        position: 'relative',
                      }}
                      title={tooltipParts.join('\n')}
                    >
                      <Terminal size={10} style={{ flexShrink: 0, opacity: 0.7 }} />
                      {renamingId === t.id ? (
                        <input
                          ref={renameInputRef}
                          className="bp-rename-input"
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') cancelRename()
                          }}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {t.name}
                        </span>
                      )}
                      {hasSplits && (
                        <Columns2 size={9} style={{ flexShrink: 0, opacity: 0.4 }} />
                      )}
                      <span
                        onClick={e => { e.stopPropagation(); closeTerminal(t.id) }}
                        style={{
                          display: 'flex', alignItems: 'center',
                          marginLeft: 2, opacity: 0, cursor: 'pointer', flexShrink: 0,
                          transition: 'opacity 0.1s',
                          padding: 1,
                          borderRadius: 2,
                        }}
                        className="bp-close-x"
                        onMouseEnter={e => {
                          e.currentTarget.style.opacity = '1'
                          e.currentTarget.style.background = 'rgba(248,81,73,0.15)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.opacity = '0'
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <X size={10} />
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* ── Action buttons ──────────────────────────── */}

              {/* New terminal button */}
              <button
                className="bp-toolbar-btn"
                onClick={addDefaultTerminal}
                title="New Terminal (Ctrl+Shift+`)"
                style={{
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', background: 'transparent',
                }}
              >
                <Plus size={13} />
              </button>

              {/* Split terminal button */}
              <button
                className="bp-toolbar-btn"
                onClick={splitTerminal}
                title="Split Terminal"
                style={{
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', background: 'transparent',
                }}
              >
                <Columns2 size={13} />
              </button>

              {/* Profile dropdown button */}
              <div style={{ position: 'relative' }} ref={profileMenuRef}>
                <button
                  className="bp-toolbar-btn"
                  onClick={() => setShowProfileMenu(prev => !prev)}
                  title="Select Terminal Profile"
                  style={{
                    width: 24, height: 24,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 4, border: 'none', cursor: 'pointer',
                    color: showProfileMenu ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: showProfileMenu ? 'rgba(255,255,255,0.08)' : 'transparent',
                  }}
                >
                  <ChevronDown size={13} />
                </button>

                {/* Profile dropdown menu */}
                {showProfileMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 28,
                      right: 0,
                      minWidth: 200,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 0',
                      zIndex: 1000,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      animation: 'bp-fade-in 0.12s ease',
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
                          transition: 'background 0.12s, color 0.12s',
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

              {/* Separator */}
              <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 3px', opacity: 0.4 }} />

              {/* Clear terminal button */}
              <button
                className="bp-toolbar-btn"
                onClick={clearTerminal}
                title="Clear Terminal"
                style={{
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', background: 'transparent',
                }}
              >
                <Ban size={13} />
              </button>

              {/* Kill terminal button */}
              <button
                className="bp-toolbar-btn"
                onClick={() => closeTerminal(activeTerminal)}
                title="Kill Terminal"
                style={{
                  width: 24, height: 24,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 4, border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', background: 'transparent',
                }}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Content area ───────────────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && (
          <div style={{ height: '100%' }}>
            {terminalGroups.map(group => {
              const parentId = group[0].splitParentId || group[0].id
              const isGroupVisible = parentId === activeGroupParentId
              if (!isGroupVisible) {
                // Still render hidden to preserve terminal state
                return (
                  <div key={parentId} style={{ display: 'none' }}>
                    {group.map(t => (
                      <TerminalPanel
                        key={t.id}
                        sessionId={t.id}
                        shellPath={t.shellPath}
                        shellArgs={t.shellArgs}
                        onTitleChange={handleTitleChange}
                      />
                    ))}
                  </div>
                )
              }

              // Visible group: render side by side
              return (
                <div
                  key={parentId}
                  style={{
                    display: 'flex',
                    height: '100%',
                    gap: 0,
                  }}
                >
                  {group.map((t, idx) => (
                    <div
                      key={t.id}
                      style={{
                        flex: 1,
                        height: '100%',
                        position: 'relative',
                        borderLeft: idx > 0 ? '1px solid var(--border)' : 'none',
                        animation: group.length > 1 ? 'bp-split-slide 0.2s ease' : undefined,
                      }}
                      onClick={() => setActiveTerminal(t.id)}
                    >
                      {/* Split pane header */}
                      {group.length > 1 && (
                        <div
                          style={{
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0 8px',
                            background: activeTerminal === t.id
                              ? 'rgba(88,166,255,0.06)'
                              : 'rgba(255,255,255,0.01)',
                            borderBottom: `1px solid ${activeTerminal === t.id ? 'rgba(88,166,255,0.2)' : 'var(--border)'}`,
                            fontSize: 10,
                            color: activeTerminal === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                            transition: 'background 0.15s, border-color 0.15s',
                            cursor: 'pointer',
                            userSelect: 'none',
                          }}
                        >
                          <Terminal size={10} style={{ opacity: 0.6 }} />
                          {renamingId === t.id ? (
                            <input
                              ref={renameInputRef}
                              className="bp-rename-input"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRename()
                                if (e.key === 'Escape') cancelRename()
                              }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <span
                              onDoubleClick={() => startRename(t.id, t.name)}
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t.name}
                            </span>
                          )}
                          <span style={{ flex: 1 }} />
                          <span
                            onClick={e => { e.stopPropagation(); closeTerminal(t.id) }}
                            className="bp-toolbar-btn"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: 18, height: 18,
                              borderRadius: 3,
                              cursor: 'pointer',
                              color: 'var(--text-muted)',
                              background: 'transparent',
                              border: 'none',
                            }}
                            title="Close split"
                          >
                            <X size={10} />
                          </span>
                        </div>
                      )}
                      <div style={{ height: group.length > 1 ? 'calc(100% - 24px)' : '100%' }}>
                        <TerminalPanel
                          key={t.id}
                          sessionId={t.id}
                          shellPath={t.shellPath}
                          shellArgs={t.shellArgs}
                          onTitleChange={handleTitleChange}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

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
                      transition: 'background 0.1s',
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

      {/* ── Terminal tab context menu ────────────────────── */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            minWidth: 180,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 0',
            zIndex: 10000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            animation: 'bp-fade-in 0.1s ease',
          }}
        >
          {[
            { label: 'Rename', action: () => {
              const t = terminals.find(t => t.id === contextMenu.termId)
              if (t) startRename(t.id, t.name)
              setContextMenu(null)
            }},
            { label: 'Split Terminal', action: () => {
              setActiveTerminal(contextMenu.termId)
              setTimeout(() => splitTerminal(), 0)
              setContextMenu(null)
            }},
            { label: 'Clear Terminal', action: () => {
              window.dispatchEvent(new CustomEvent('terminal:clear', { detail: { sessionId: contextMenu.termId } }))
              setContextMenu(null)
            }},
            { divider: true } as any,
            { label: 'Kill Terminal', danger: true, action: () => {
              killTerminal(contextMenu.termId)
            }},
          ].map((item, i) =>
            item.divider ? (
              <div
                key={`div-${i}`}
                style={{ height: 1, background: 'var(--border)', margin: '4px 0', opacity: 0.5 }}
              />
            ) : (
              <button
                key={item.label}
                onClick={item.action}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '5px 12px',
                  fontSize: 11,
                  color: item.danger ? 'var(--accent-red)' : 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = item.danger
                    ? 'rgba(248,81,73,0.1)'
                    : 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color = item.danger
                    ? 'var(--accent-red)'
                    : 'var(--text-primary)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = item.danger
                    ? 'var(--accent-red)'
                    : 'var(--text-secondary)'
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}

      {/* ── Global style for close-on-hover terminal tabs ── */}
      <style>{`
        .bp-term-tab:hover .bp-close-x { opacity: 0.5 !important; }
        .bp-term-tab .bp-close-x:hover { opacity: 1 !important; }
      `}</style>
    </div>
  )
}

/* ── Build terminal groups (parent + splits) ──────────── */

function buildTerminalGroups(terminals: TermInstance[]): TermInstance[][] {
  const groups: TermInstance[][] = []
  const used = new Set<string>()

  for (const t of terminals) {
    if (used.has(t.id)) continue
    if (t.splitParentId) continue // will be picked up by parent

    const group = [t]
    used.add(t.id)

    // Find all splits of this parent
    for (const s of terminals) {
      if (s.splitParentId === t.id && !used.has(s.id)) {
        group.push(s)
        used.add(s.id)
      }
    }
    groups.push(group)
  }
  return groups
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
