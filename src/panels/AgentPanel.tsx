import { useState, useCallback } from 'react'
import { useChatStore } from '@/store/chat'
import { useAgentStore } from '@/store/agents'
import {
  Bot, Cpu, Zap, AlertCircle, Workflow,
  Server, Activity, CircleDot,
  Code2, Bug, RefreshCw, TestTube2, FileText, Eye, HelpCircle,
  Play, CheckCircle2, XCircle, Clock, RotateCcw,
  ChevronDown, ChevronRight, Settings, Key, Thermometer, Hash,
  Sparkles, Wrench, Search, MessageSquare,
} from 'lucide-react'
import type { Agent, AgentStatus } from '@shared/types'

/* ── Types ────────────────────────────────────────────── */

type AgentCapability = {
  id: string
  icon: typeof Code2
  title: string
  description: string
  prompt: string
  color: string
}

type TaskStatus = 'completed' | 'failed' | 'in-progress'

type RecentTask = {
  id: string
  description: string
  status: TaskStatus
  timestamp: number
  capability: string
}

/* ── Agent capabilities ───────────────────────────────── */

const capabilities: AgentCapability[] = [
  {
    id: 'code-gen',
    icon: Code2,
    title: 'Code Generation',
    description: 'Generates code from natural language',
    prompt: 'Generate code for: ',
    color: '#58a6ff',
  },
  {
    id: 'bug-fix',
    icon: Bug,
    title: 'Bug Fix',
    description: 'Analyzes errors and suggests fixes',
    prompt: 'Fix the following bug: ',
    color: '#f85149',
  },
  {
    id: 'refactor',
    icon: RefreshCw,
    title: 'Refactor',
    description: 'Restructures code for better quality',
    prompt: 'Refactor the following code for better quality: ',
    color: '#d2a8ff',
  },
  {
    id: 'test-gen',
    icon: TestTube2,
    title: 'Test Generation',
    description: 'Creates unit tests',
    prompt: 'Generate unit tests for: ',
    color: '#3fb950',
  },
  {
    id: 'docs',
    icon: FileText,
    title: 'Documentation',
    description: 'Generates docs and comments',
    prompt: 'Generate documentation for: ',
    color: '#e3b341',
  },
  {
    id: 'code-review',
    icon: Eye,
    title: 'Code Review',
    description: 'Reviews code for issues',
    prompt: 'Review the following code for issues: ',
    color: '#f78166',
  },
  {
    id: 'explain',
    icon: HelpCircle,
    title: 'Explain Code',
    description: 'Explains what code does',
    prompt: 'Explain what this code does: ',
    color: '#79c0ff',
  },
]

/* ── Status config ─────────────────────────────────────── */

const statusConfig: Record<AgentStatus, {
  color: string
  bgColor: string
  borderColor: string
  Icon: typeof Bot
  label: string
}> = {
  active: {
    color: '#3fb950',
    bgColor: 'rgba(63,185,80,0.08)',
    borderColor: 'rgba(63,185,80,0.2)',
    Icon: Zap,
    label: 'Active',
  },
  working: {
    color: '#58a6ff',
    bgColor: 'rgba(88,166,255,0.08)',
    borderColor: 'rgba(88,166,255,0.2)',
    Icon: Cpu,
    label: 'Working',
  },
  idle: {
    color: '#484f58',
    bgColor: 'transparent',
    borderColor: 'var(--border)',
    Icon: Bot,
    label: 'Idle',
  },
  error: {
    color: '#f85149',
    bgColor: 'rgba(248,81,73,0.06)',
    borderColor: 'rgba(248,81,73,0.2)',
    Icon: AlertCircle,
    label: 'Error',
  },
}

/* ── Agent overall status ─────────────────────────────── */

type OverallStatus = 'ready' | 'processing' | 'offline'

const overallStatusConfig: Record<OverallStatus, { color: string; label: string }> = {
  ready: { color: '#3fb950', label: 'Ready' },
  processing: { color: '#e3b341', label: 'Processing' },
  offline: { color: '#f85149', label: 'Error/Offline' },
}

/* ── Mock recent tasks (demo data) ────────────────────── */

const initialRecentTasks: RecentTask[] = [
  {
    id: 'rt-1',
    description: 'Generated React component for user dashboard',
    status: 'completed',
    timestamp: Date.now() - 1000 * 60 * 12,
    capability: 'code-gen',
  },
  {
    id: 'rt-2',
    description: 'Fixed null reference error in auth module',
    status: 'completed',
    timestamp: Date.now() - 1000 * 60 * 38,
    capability: 'bug-fix',
  },
  {
    id: 'rt-3',
    description: 'Refactored API service layer',
    status: 'failed',
    timestamp: Date.now() - 1000 * 60 * 65,
    capability: 'refactor',
  },
  {
    id: 'rt-4',
    description: 'Generated tests for utils/string.ts',
    status: 'in-progress',
    timestamp: Date.now() - 1000 * 60 * 3,
    capability: 'test-gen',
  },
]

/* ── Helpers ──────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const taskStatusConfig: Record<TaskStatus, { color: string; icon: typeof CheckCircle2; label: string }> = {
  completed: { color: '#3fb950', icon: CheckCircle2, label: 'Completed' },
  failed: { color: '#f85149', icon: XCircle, label: 'Failed' },
  'in-progress': { color: '#e3b341', icon: Clock, label: 'In Progress' },
}

/* ── Agent card ────────────────────────────────────────── */

function AgentCard({ agent }: { agent: Agent }) {
  const c = statusConfig[agent.status]

  return (
    <div
      className="transition-all duration-200"
      style={{
        background: c.bgColor,
        border: `1px solid ${c.borderColor}`,
        borderRadius: 10,
        padding: '10px 12px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = c.color + '50'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = c.borderColor
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: c.color + '12',
            border: `1px solid ${c.color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <c.Icon size={14} style={{ color: c.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color:
                  agent.status === 'idle'
                    ? 'var(--text-secondary)'
                    : 'var(--text-primary)',
              }}
            >
              {agent.name}
            </span>

            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: c.color,
                flexShrink: 0,
                boxShadow:
                  agent.status === 'active' || agent.status === 'working'
                    ? `0 0 8px ${c.color}80`
                    : 'none',
                animation:
                  agent.status === 'active' || agent.status === 'working'
                    ? 'agent-pulse 2s ease-in-out infinite'
                    : 'none',
              }}
            />

            <span
              style={{
                marginLeft: 'auto',
                fontSize: 9,
                fontWeight: 500,
                color: c.color,
                background: c.color + '12',
                padding: '2px 7px',
                borderRadius: 4,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {c.label}
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              display: 'block',
              marginTop: 1,
            }}
          >
            {agent.role}
          </span>
        </div>
      </div>

      {agent.currentTask && (
        <div
          style={{
            marginTop: 8,
            marginLeft: 40,
            padding: '6px 10px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 6,
            borderLeft: `2px solid ${c.color}40`,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono, monospace)',
              lineHeight: 1.5,
              wordBreak: 'break-word',
            }}
          >
            {agent.currentTask}
          </span>
        </div>
      )}

      {agent.status === 'working' && agent.progress !== undefined && (
        <div style={{ marginTop: 8, marginLeft: 40 }}>
          <div
            className="flex items-center justify-between"
            style={{ marginBottom: 4 }}
          >
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              Progress
            </span>
            <span
              style={{
                fontSize: 9,
                color: c.color,
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
              }}
            >
              {agent.progress}%
            </span>
          </div>
          <div
            style={{
              height: 4,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.04)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                width: `${agent.progress}%`,
                background: `linear-gradient(90deg, ${c.color}, ${c.color}cc)`,
                transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: `0 0 8px ${c.color}40`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Capability list item ─────────────────────────────── */

function CapabilityItem({ cap }: { cap: AgentCapability }) {
  return (
    <div
      className="flex items-center gap-2.5 transition-all duration-150"
      style={{
        padding: '5px 8px',
        borderRadius: 6,
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: cap.color + '14',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <cap.icon size={11} style={{ color: cap.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
          {cap.title}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>
          {cap.description}
        </span>
      </div>
    </div>
  )
}

/* ── Quick action card ────────────────────────────────── */

function QuickActionCard({
  cap,
  onDispatch,
}: {
  cap: AgentCapability
  onDispatch: (prompt: string) => void
}) {
  return (
    <button
      onClick={() => onDispatch(cap.prompt)}
      className="transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 10px 8px',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        width: '100%',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = cap.color + '60'
        e.currentTarget.style.background = cap.color + '08'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: cap.color + '14',
          border: `1px solid ${cap.color}20`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <cap.icon size={13} style={{ color: cap.color }} />
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
          {cap.title}
        </div>
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {cap.description}
        </div>
      </div>
    </button>
  )
}

/* ── Recent task row ──────────────────────────────────── */

function RecentTaskRow({
  task,
  onRerun,
}: {
  task: RecentTask
  onRerun: (task: RecentTask) => void
}) {
  const sc = taskStatusConfig[task.status]
  const StatusIcon = sc.icon

  return (
    <div
      className="flex items-start gap-2 transition-all duration-150"
      style={{
        padding: '6px 8px',
        borderRadius: 6,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <StatusIcon
        size={12}
        style={{ color: sc.color, flexShrink: 0, marginTop: 1 }}
      />
      <div className="flex-1 min-w-0">
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            lineHeight: 1.4,
            wordBreak: 'break-word',
          }}
        >
          {task.description}
        </div>
        <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              color: sc.color,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            {sc.label}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
            {timeAgo(task.timestamp)}
          </span>
        </div>
      </div>
      <button
        onClick={() => onRerun(task)}
        title="Re-run task"
        style={{
          background: 'none',
          border: '1px solid transparent',
          borderRadius: 4,
          padding: 3,
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--accent)'
          e.currentTarget.style.borderColor = 'var(--border)'
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-muted)'
          e.currentTarget.style.borderColor = 'transparent'
          e.currentTarget.style.background = 'none'
        }}
      >
        <RotateCcw size={10} />
      </button>
    </div>
  )
}

/* ── Collapsible section ──────────────────────────────── */

function Section({
  title,
  icon: Icon,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string
  icon: typeof Settings
  defaultOpen?: boolean
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center w-full"
        style={{
          padding: '7px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          gap: 5,
        }}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <Icon size={10} style={{ opacity: 0.7 }} />
        <span>{title}</span>
        {badge && <span style={{ marginLeft: 'auto' }}>{badge}</span>}
      </button>
      {open && (
        <div style={{ padding: '0 8px 8px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

/* ── Configuration section ────────────────────────────── */

function ConfigurationSection() {
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4096)
  const [showKey, setShowKey] = useState(false)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    fontSize: 11,
    fontFamily: 'var(--font-mono, monospace)',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    color: 'var(--text-primary)',
    outline: 'none',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--text-muted)',
    marginBottom: 4,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* API Key */}
      <div>
        <div style={labelStyle}>
          <Key size={9} /> API Key
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          <button
            onClick={() => setShowKey(!showKey)}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 2,
              fontSize: 9,
            }}
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div>
        <div style={labelStyle}>
          <Sparkles size={9} /> Model
        </div>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          style={{
            ...inputStyle,
            cursor: 'pointer',
            appearance: 'none',
            paddingRight: 24,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 6px center',
          }}
        >
          <option value="gpt-4">GPT-4</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          <option value="claude-3-opus">Claude 3 Opus</option>
          <option value="claude-3-sonnet">Claude 3 Sonnet</option>
          <option value="codellama">CodeLlama</option>
          <option value="deepseek-coder">DeepSeek Coder</option>
        </select>
      </div>

      {/* Temperature */}
      <div>
        <div style={labelStyle}>
          <Thermometer size={9} /> Temperature
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--accent)',
              fontWeight: 500,
              fontSize: 10,
            }}
          >
            {temperature.toFixed(2)}
          </span>
        </div>
        <div
          style={{
            position: 'relative',
            height: 20,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            style={{
              width: '100%',
              height: 4,
              appearance: 'none',
              background: `linear-gradient(to right, var(--accent) ${temperature * 100}%, rgba(255,255,255,0.08) ${temperature * 100}%)`,
              borderRadius: 2,
              outline: 'none',
              cursor: 'pointer',
            }}
          />
        </div>
        <div
          className="flex justify-between"
          style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}
        >
          <span>Precise</span>
          <span>Creative</span>
        </div>
      </div>

      {/* Max Tokens */}
      <div>
        <div style={labelStyle}>
          <Hash size={9} /> Max Tokens
        </div>
        <input
          type="number"
          min={256}
          max={32768}
          step={256}
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 256)}
          style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
          256 - 32,768 tokens
        </div>
      </div>
    </div>
  )
}

/* ── Main panel ────────────────────────────────────────── */

export default function AgentPanel() {
  const agents = useAgentStore((s) => s.agents)
  const logs = useAgentStore((s) => s.logs)
  const { ollamaAvailable, ollamaModels } = useChatStore()
  const addMessage = useChatStore((s) => s.addMessage)
  const activeCount = agents.filter((a) => a.status !== 'idle').length
  const workingCount = agents.filter((a) => a.status === 'working').length
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>(initialRecentTasks)

  // Determine overall status
  const overallStatus: OverallStatus = !ollamaAvailable
    ? 'offline'
    : workingCount > 0
      ? 'processing'
      : 'ready'
  const osc = overallStatusConfig[overallStatus]

  // Dispatch a prompt to chat
  const dispatchToChat = useCallback(
    (prompt: string) => {
      addMessage({
        id: `agent-${Date.now()}`,
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
      })
    },
    [addMessage],
  )

  // Re-run a task
  const handleRerun = useCallback(
    (task: RecentTask) => {
      const cap = capabilities.find((c) => c.id === task.capability)
      if (cap) {
        dispatchToChat(cap.prompt + task.description)
      }
      setRecentTasks((prev) => [
        {
          ...task,
          id: `rt-${Date.now()}`,
          status: 'in-progress',
          timestamp: Date.now(),
        },
        ...prev,
      ])
    },
    [dispatchToChat],
  )

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center px-4"
        style={{
          height: 34,
          color: 'var(--text-secondary)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Workflow size={12} style={{ marginRight: 6, opacity: 0.7 }} />
        AI AGENTS
        {activeCount > 0 && (
          <span
            className="ml-auto flex items-center gap-1.5"
            style={{
              color: 'var(--accent-green)',
              fontWeight: 500,
              letterSpacing: 0,
              fontSize: 10,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--accent-green)',
                boxShadow: '0 0 8px rgba(63,185,80,0.5)',
                animation: 'agent-pulse 2s ease-in-out infinite',
              }}
            />
            {activeCount} active
          </span>
        )}
      </div>

      {/* ── Agent Status Indicator ───────────────────────── */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: osc.color + '12',
            border: `1px solid ${osc.color}25`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Bot size={17} style={{ color: osc.color }} />
        </div>
        <div className="flex-1">
          <div
            className="flex items-center gap-2"
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}
          >
            Agent Status
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: osc.color,
                display: 'inline-block',
                boxShadow: `0 0 8px ${osc.color}60`,
                animation:
                  overallStatus === 'processing'
                    ? 'agent-pulse 1.5s ease-in-out infinite'
                    : 'none',
              }}
            />
          </div>
          <div style={{ fontSize: 10, color: osc.color, fontWeight: 500, marginTop: 1 }}>
            {osc.label}
          </div>
        </div>
        <div
          style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            textAlign: 'right',
          }}
        >
          <div>{agents.length} agents</div>
          <div>{workingCount} working</div>
        </div>
      </div>

      {/* ── Agent Cards ──────────────────────────────────── */}
      {agents.length > 0 && (
        <div
          style={{
            padding: '6px 8px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}

      {/* ── Capabilities ─────────────────────────────────── */}
      <Section
        title="Capabilities"
        icon={Zap}
        defaultOpen={true}
        badge={
          <span
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {capabilities.length}
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {capabilities.map((cap) => (
            <CapabilityItem key={cap.id} cap={cap} />
          ))}
        </div>
      </Section>

      {/* ── Quick Actions ────────────────────────────────── */}
      <Section title="Quick Actions" icon={Sparkles} defaultOpen={true}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
          }}
        >
          {capabilities.slice(0, 6).map((cap) => (
            <QuickActionCard
              key={cap.id}
              cap={cap}
              onDispatch={dispatchToChat}
            />
          ))}
        </div>
      </Section>

      {/* ── Recent Tasks ─────────────────────────────────── */}
      <Section
        title="Recent Tasks"
        icon={Clock}
        defaultOpen={true}
        badge={
          <span
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {recentTasks.length}
          </span>
        }
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {recentTasks.length === 0 ? (
            <div
              style={{
                padding: '12px 0',
                textAlign: 'center',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              No recent tasks
            </div>
          ) : (
            recentTasks.map((task) => (
              <RecentTaskRow key={task.id} task={task} onRerun={handleRerun} />
            ))
          )}
        </div>
      </Section>

      {/* ── Configuration ────────────────────────────────── */}
      <Section title="Configuration" icon={Settings} defaultOpen={false}>
        <ConfigurationSection />
      </Section>

      {/* ── System Status ────────────────────────────────── */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          padding: '8px 12px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-muted)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          System Status
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <StatusRow
            Icon={Server}
            label="Ollama"
            value={ollamaAvailable ? 'Connected' : 'Unavailable'}
            valueColor={
              ollamaAvailable ? 'var(--accent-green)' : 'var(--text-muted)'
            }
            dotColor={ollamaAvailable ? '#3fb950' : '#484f58'}
          />
          <StatusRow
            Icon={CircleDot}
            label="Models"
            value={
              ollamaAvailable
                ? `${ollamaModels.length} loaded`
                : 'None'
            }
            valueColor="var(--text-secondary)"
            dotColor="var(--accent)"
          />
          <StatusRow
            Icon={Activity}
            label="Activity"
            value={
              agents.length === 0
                ? 'No agents'
                : `${activeCount} active, ${workingCount} working`
            }
            valueColor="var(--text-secondary)"
            dotColor={activeCount > 0 ? '#3fb950' : '#484f58'}
          />
        </div>
      </div>

      <style>{`
        @keyframes agent-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        /* Range slider thumb styling */
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent, #58a6ff);
          border: 2px solid var(--bg-primary, #1e1e2e);
          cursor: pointer;
          box-shadow: 0 0 4px rgba(88,166,255,0.3);
        }
        input[type="range"]::-moz-range-thumb {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--accent, #58a6ff);
          border: 2px solid var(--bg-primary, #1e1e2e);
          cursor: pointer;
          box-shadow: 0 0 4px rgba(88,166,255,0.3);
        }
        select option {
          background: var(--bg-primary, #1e1e2e);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  )
}

/* ── Status row component ──────────────────────────────── */

function StatusRow({
  Icon,
  label,
  value,
  valueColor,
  dotColor,
}: {
  Icon: typeof Server
  label: string
  value: string
  valueColor: string
  dotColor: string
}) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        fontSize: 11,
        padding: '3px 4px',
        borderRadius: 4,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <Icon
        size={11}
        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
      />
      <span style={{ color: 'var(--text-muted)', flex: 1 }}>{label}</span>
      <span
        style={{
          color: valueColor,
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 10,
          fontWeight: 500,
        }}
      >
        {value}
      </span>
    </div>
  )
}
