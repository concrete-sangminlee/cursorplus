import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useChatStore } from '@/store/chat'
import { useAgentStore } from '@/store/agents'
import {
  Bot, Cpu, Zap, AlertCircle, Workflow,
  Server, Activity, CircleDot,
  Code2, Bug, RefreshCw, TestTube2, FileText, Eye, HelpCircle,
  Play, CheckCircle2, XCircle, Clock, RotateCcw,
  ChevronDown, ChevronRight, Settings, Key, Thermometer, Hash,
  Sparkles, Wrench, Search, MessageSquare,
  FileCode, FileDiff, Check, X, Trash2, Copy, MoreHorizontal,
  Loader2, ArrowRight, ChevronUp, Terminal, Pause, Square,
  History, Filter, SlidersHorizontal, AlignLeft, Layers,
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

type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

type TaskStep = {
  id: string
  label: string
  status: TaskStatus
  duration?: number
}

type FileChange = {
  id: string
  path: string
  language: string
  status: 'added' | 'modified' | 'deleted'
  additions: number
  deletions: number
  diffPreview: string
  accepted?: boolean | null // null = pending
}

type AgentTask = {
  id: string
  description: string
  status: TaskStatus
  timestamp: number
  completedAt?: number
  capability: string
  model: string
  steps: TaskStep[]
  currentStep: number
  totalSteps: number
  estimatedTimeRemaining?: number
  fileChanges: FileChange[]
  outputLog: OutputLine[]
  tokenUsage?: { prompt: number; completion: number; total: number }
  error?: string
}

type OutputLine = {
  id: string
  timestamp: number
  type: 'text' | 'code' | 'thinking' | 'tool-call' | 'tool-result' | 'error' | 'success'
  content: string
  language?: string
}

type AgentConfig = {
  model: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  apiKey: string
  showApiKey: boolean
  autoApply: boolean
}

type TaskTemplate = {
  id: string
  icon: typeof Code2
  title: string
  description: string
  prompt: string
  color: string
  steps: string[]
}

type PanelView = 'main' | 'task-detail' | 'history' | 'config'

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

/* ── Task templates ───────────────────────────────────── */

const taskTemplates: TaskTemplate[] = [
  {
    id: 'tmpl-refactor',
    icon: RefreshCw,
    title: 'Refactor Module',
    description: 'Extract functions, improve naming, reduce complexity',
    prompt: 'Refactor the selected module: extract reusable functions, improve variable naming, reduce cyclomatic complexity, and add JSDoc comments.',
    color: '#d2a8ff',
    steps: ['Analyze structure', 'Identify patterns', 'Extract functions', 'Rename variables', 'Add documentation', 'Validate'],
  },
  {
    id: 'tmpl-tests',
    icon: TestTube2,
    title: 'Generate Test Suite',
    description: 'Unit tests with edge cases and mocks',
    prompt: 'Generate a comprehensive test suite: unit tests for all exported functions, edge case coverage, proper mocking of dependencies, and snapshot tests where appropriate.',
    color: '#3fb950',
    steps: ['Scan exports', 'Identify dependencies', 'Generate unit tests', 'Add edge cases', 'Setup mocks', 'Verify coverage'],
  },
  {
    id: 'tmpl-bugfix',
    icon: Bug,
    title: 'Diagnose & Fix Bug',
    description: 'Trace error, identify root cause, apply fix',
    prompt: 'Diagnose and fix the following bug: trace the error through the call stack, identify the root cause, apply a minimal fix, and add a regression test.',
    color: '#f85149',
    steps: ['Reproduce issue', 'Trace call stack', 'Identify root cause', 'Implement fix', 'Add regression test', 'Verify fix'],
  },
  {
    id: 'tmpl-docs',
    icon: FileText,
    title: 'Generate Documentation',
    description: 'JSDoc, README sections, API docs',
    prompt: 'Generate comprehensive documentation: JSDoc comments for all exports, update README with usage examples, and create API reference documentation.',
    color: '#e3b341',
    steps: ['Analyze API surface', 'Generate JSDoc', 'Write examples', 'Create API reference', 'Format output'],
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

/* ── Mock data generators ────────────────────────────── */

const mockFileChanges: FileChange[] = [
  {
    id: 'fc-1',
    path: 'src/components/UserDashboard.tsx',
    language: 'tsx',
    status: 'modified',
    additions: 42,
    deletions: 18,
    diffPreview: `@@ -15,7 +15,12 @@\n-  const [data, setData] = useState(null)\n+  const [data, setData] = useState<DashboardData | null>(null)\n+  const [isLoading, setIsLoading] = useState(true)\n+  const [error, setError] = useState<Error | null>(null)\n \n   useEffect(() => {\n-    fetchData().then(setData)\n+    fetchData()\n+      .then(setData)\n+      .catch(setError)\n+      .finally(() => setIsLoading(false))`,
    accepted: null,
  },
  {
    id: 'fc-2',
    path: 'src/utils/api.ts',
    language: 'ts',
    status: 'modified',
    additions: 8,
    deletions: 3,
    diffPreview: `@@ -22,4 +22,9 @@\n-  return fetch(url).then(r => r.json())\n+  const response = await fetch(url)\n+  if (!response.ok) {\n+    throw new ApiError(response.status, await response.text())\n+  }\n+  return response.json()`,
    accepted: null,
  },
  {
    id: 'fc-3',
    path: 'src/types/dashboard.ts',
    language: 'ts',
    status: 'added',
    additions: 24,
    deletions: 0,
    diffPreview: `+export interface DashboardData {\n+  user: UserProfile\n+  stats: DashboardStats\n+  recentActivity: Activity[]\n+}\n+\n+export interface DashboardStats {\n+  totalProjects: number\n+  activeIssues: number\n+}`,
    accepted: null,
  },
]

const mockOutputLog: OutputLine[] = [
  { id: 'ol-1', timestamp: Date.now() - 45000, type: 'thinking', content: 'Analyzing the UserDashboard component structure and identifying areas for improvement...' },
  { id: 'ol-2', timestamp: Date.now() - 42000, type: 'tool-call', content: 'Reading file: src/components/UserDashboard.tsx' },
  { id: 'ol-3', timestamp: Date.now() - 40000, type: 'tool-result', content: 'File read successfully (142 lines)' },
  { id: 'ol-4', timestamp: Date.now() - 38000, type: 'thinking', content: 'Found several issues: missing TypeScript types, no error handling in useEffect, potential memory leak from uncontrolled fetch.' },
  { id: 'ol-5', timestamp: Date.now() - 35000, type: 'text', content: 'I\'ll fix the following issues:\n1. Add proper TypeScript types\n2. Add error handling to the data fetch\n3. Add loading state management' },
  { id: 'ol-6', timestamp: Date.now() - 30000, type: 'code', content: 'const [data, setData] = useState<DashboardData | null>(null)\nconst [isLoading, setIsLoading] = useState(true)\nconst [error, setError] = useState<Error | null>(null)', language: 'typescript' },
  { id: 'ol-7', timestamp: Date.now() - 25000, type: 'tool-call', content: 'Writing file: src/components/UserDashboard.tsx' },
  { id: 'ol-8', timestamp: Date.now() - 23000, type: 'tool-result', content: 'File written successfully' },
  { id: 'ol-9', timestamp: Date.now() - 20000, type: 'tool-call', content: 'Creating file: src/types/dashboard.ts' },
  { id: 'ol-10', timestamp: Date.now() - 18000, type: 'success', content: 'All changes applied successfully. 3 files modified, 74 additions, 21 deletions.' },
]

const mockSteps: TaskStep[] = [
  { id: 'step-1', label: 'Analyzing codebase', status: 'completed', duration: 3200 },
  { id: 'step-2', label: 'Reading target files', status: 'completed', duration: 1800 },
  { id: 'step-3', label: 'Planning changes', status: 'completed', duration: 5400 },
  { id: 'step-4', label: 'Applying modifications', status: 'running', duration: undefined },
  { id: 'step-5', label: 'Creating new files', status: 'queued' },
  { id: 'step-6', label: 'Validating changes', status: 'queued' },
]

const initialTasks: AgentTask[] = [
  {
    id: 'task-1',
    description: 'Add TypeScript types and error handling to UserDashboard',
    status: 'running',
    timestamp: Date.now() - 1000 * 60 * 2,
    capability: 'refactor',
    model: 'claude-3-opus',
    steps: mockSteps,
    currentStep: 3,
    totalSteps: 6,
    estimatedTimeRemaining: 28,
    fileChanges: mockFileChanges,
    outputLog: mockOutputLog,
    tokenUsage: { prompt: 2840, completion: 1560, total: 4400 },
  },
  {
    id: 'task-2',
    description: 'Generate test suite for auth module',
    status: 'completed',
    timestamp: Date.now() - 1000 * 60 * 15,
    completedAt: Date.now() - 1000 * 60 * 12,
    capability: 'test-gen',
    model: 'gpt-4-turbo',
    steps: [
      { id: 's2-1', label: 'Scanning exports', status: 'completed', duration: 2100 },
      { id: 's2-2', label: 'Analyzing dependencies', status: 'completed', duration: 3400 },
      { id: 's2-3', label: 'Generating tests', status: 'completed', duration: 8200 },
      { id: 's2-4', label: 'Adding edge cases', status: 'completed', duration: 4100 },
      { id: 's2-5', label: 'Verifying coverage', status: 'completed', duration: 1900 },
    ],
    currentStep: 5,
    totalSteps: 5,
    fileChanges: [
      { id: 'fc-t2-1', path: 'src/__tests__/auth.test.ts', language: 'ts', status: 'added', additions: 186, deletions: 0, diffPreview: '+describe("AuthService", () => {\n+  it("should authenticate valid credentials", async () => {\n+    const result = await authService.login(validCreds)\n+    expect(result.token).toBeDefined()\n+  })', accepted: true },
    ],
    outputLog: [
      { id: 'ol-t2-1', timestamp: Date.now() - 1000 * 60 * 15, type: 'text', content: 'Generating comprehensive test suite for auth module...' },
      { id: 'ol-t2-2', timestamp: Date.now() - 1000 * 60 * 12, type: 'success', content: 'Test suite generated: 24 test cases, 94% coverage.' },
    ],
    tokenUsage: { prompt: 3200, completion: 4800, total: 8000 },
  },
  {
    id: 'task-3',
    description: 'Fix null reference in payment processing',
    status: 'failed',
    timestamp: Date.now() - 1000 * 60 * 45,
    completedAt: Date.now() - 1000 * 60 * 42,
    capability: 'bug-fix',
    model: 'gpt-4',
    steps: [
      { id: 's3-1', label: 'Reproducing issue', status: 'completed', duration: 4200 },
      { id: 's3-2', label: 'Tracing call stack', status: 'completed', duration: 6800 },
      { id: 's3-3', label: 'Applying fix', status: 'failed', duration: 3100 },
    ],
    currentStep: 2,
    totalSteps: 5,
    fileChanges: [],
    outputLog: [
      { id: 'ol-t3-1', timestamp: Date.now() - 1000 * 60 * 45, type: 'text', content: 'Analyzing null reference error in payment processing...' },
      { id: 'ol-t3-2', timestamp: Date.now() - 1000 * 60 * 42, type: 'error', content: 'Failed: Unable to resolve circular dependency in payment module. Manual intervention required.' },
    ],
    error: 'Circular dependency detected in payment module. The fix requires restructuring the module boundary.',
    tokenUsage: { prompt: 1800, completion: 920, total: 2720 },
  },
  {
    id: 'task-4',
    description: 'Document API endpoints for user service',
    status: 'completed',
    timestamp: Date.now() - 1000 * 60 * 120,
    completedAt: Date.now() - 1000 * 60 * 115,
    capability: 'docs',
    model: 'claude-3-sonnet',
    steps: [
      { id: 's4-1', label: 'Scanning endpoints', status: 'completed', duration: 2800 },
      { id: 's4-2', label: 'Generating JSDoc', status: 'completed', duration: 5200 },
      { id: 's4-3', label: 'Writing examples', status: 'completed', duration: 3600 },
      { id: 's4-4', label: 'Formatting output', status: 'completed', duration: 1200 },
    ],
    currentStep: 4,
    totalSteps: 4,
    fileChanges: [
      { id: 'fc-t4-1', path: 'docs/api/user-service.md', language: 'md', status: 'added', additions: 320, deletions: 0, diffPreview: '+# User Service API\n+\n+## Endpoints\n+\n+### GET /api/users\n+Returns paginated list of users.', accepted: true },
      { id: 'fc-t4-2', path: 'src/routes/users.ts', language: 'ts', status: 'modified', additions: 48, deletions: 2, diffPreview: '+/**\n+ * @route GET /api/users\n+ * @description Returns paginated user list\n+ * @param {number} page - Page number\n+ * @returns {UserListResponse}\n+ */', accepted: true },
    ],
    outputLog: [
      { id: 'ol-t4-1', timestamp: Date.now() - 1000 * 60 * 120, type: 'text', content: 'Documenting user service API endpoints...' },
      { id: 'ol-t4-2', timestamp: Date.now() - 1000 * 60 * 115, type: 'success', content: 'Documentation complete: 12 endpoints documented, 2 files updated.' },
    ],
    tokenUsage: { prompt: 2100, completion: 3600, total: 5700 },
  },
]

/* ── Helpers ──────────────────────────────────────────── */

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = (ms / 1000).toFixed(1)
  return `${secs}s`
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return `${n}`
}

const taskStatusConfig: Record<TaskStatus, { color: string; icon: typeof CheckCircle2; label: string; bgColor: string }> = {
  queued: { color: '#484f58', icon: Clock, label: 'Queued', bgColor: 'rgba(72,79,88,0.1)' },
  running: { color: '#e3b341', icon: Loader2, label: 'Running', bgColor: 'rgba(227,179,65,0.1)' },
  completed: { color: '#3fb950', icon: CheckCircle2, label: 'Completed', bgColor: 'rgba(63,185,80,0.1)' },
  failed: { color: '#f85149', icon: XCircle, label: 'Failed', bgColor: 'rgba(248,81,73,0.1)' },
  cancelled: { color: '#484f58', icon: Square, label: 'Cancelled', bgColor: 'rgba(72,79,88,0.1)' },
}

const fileStatusConfig: Record<string, { color: string; label: string }> = {
  added: { color: '#3fb950', label: 'A' },
  modified: { color: '#e3b341', label: 'M' },
  deleted: { color: '#f85149', label: 'D' },
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

/* ── Task status badge ──────────────────────────────────── */

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const sc = taskStatusConfig[status]
  const StatusIcon = sc.icon

  return (
    <span
      className="flex items-center gap-1"
      style={{
        fontSize: 9,
        fontWeight: 600,
        color: sc.color,
        background: sc.bgColor,
        padding: '2px 7px',
        borderRadius: 4,
        letterSpacing: '0.02em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <StatusIcon
        size={9}
        style={{
          animation: status === 'running' ? 'agent-spin 1s linear infinite' : 'none',
        }}
      />
      {sc.label}
    </span>
  )
}

/* ── File change row ──────────────────────────────────── */

function FileChangeRow({
  file,
  onAccept,
  onReject,
  onToggleDiff,
  showDiff,
}: {
  file: FileChange
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onToggleDiff: (id: string) => void
  showDiff: boolean
}) {
  const fsc = fileStatusConfig[file.status]
  const fileName = file.path.split('/').pop() || file.path
  const dirPath = file.path.split('/').slice(0, -1).join('/')

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        className="flex items-center gap-2 transition-all duration-150"
        style={{
          padding: '5px 8px',
          borderRadius: 6,
          cursor: 'pointer',
        }}
        onClick={() => onToggleDiff(file.id)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        {/* status badge */}
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: fsc.color,
            background: fsc.color + '18',
            width: 16,
            height: 16,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {fsc.label}
        </span>

        {/* file icon */}
        <FileCode size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />

        {/* path */}
        <div className="flex-1 min-w-0" style={{ overflow: 'hidden' }}>
          <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500 }}>
            {fileName}
          </span>
          {dirPath && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
              {dirPath}
            </span>
          )}
        </div>

        {/* additions/deletions */}
        <span style={{ fontSize: 9, color: '#3fb950', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
          +{file.additions}
        </span>
        <span style={{ fontSize: 9, color: '#f85149', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
          -{file.deletions}
        </span>

        {/* accept/reject or status */}
        {file.accepted === null ? (
          <div className="flex items-center gap-1" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onAccept(file.id)}
              title="Accept changes"
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: 'rgba(63,185,80,0.1)',
                border: '1px solid rgba(63,185,80,0.2)',
                color: '#3fb950',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(63,185,80,0.2)'
                e.currentTarget.style.borderColor = 'rgba(63,185,80,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(63,185,80,0.1)'
                e.currentTarget.style.borderColor = 'rgba(63,185,80,0.2)'
              }}
            >
              <Check size={10} />
            </button>
            <button
              onClick={() => onReject(file.id)}
              title="Reject changes"
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                background: 'rgba(248,81,73,0.1)',
                border: '1px solid rgba(248,81,73,0.2)',
                color: '#f85149',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(248,81,73,0.2)'
                e.currentTarget.style.borderColor = 'rgba(248,81,73,0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(248,81,73,0.1)'
                e.currentTarget.style.borderColor = 'rgba(248,81,73,0.2)'
              }}
            >
              <X size={10} />
            </button>
          </div>
        ) : (
          <span
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: file.accepted ? '#3fb950' : '#f85149',
              textTransform: 'uppercase',
              flexShrink: 0,
            }}
          >
            {file.accepted ? 'Accepted' : 'Rejected'}
          </span>
        )}

        {/* expand arrow */}
        {showDiff ? <ChevronDown size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronRight size={10} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
      </div>

      {/* diff preview */}
      {showDiff && (
        <div
          style={{
            margin: '2px 8px 6px 26px',
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          <pre
            style={{
              margin: 0,
              padding: '8px 10px',
              fontSize: 10,
              fontFamily: 'var(--font-mono, monospace)',
              lineHeight: 1.6,
              background: 'rgba(0,0,0,0.15)',
              color: 'var(--text-secondary)',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {file.diffPreview.split('\n').map((line, i) => {
              let lineColor = 'var(--text-secondary)'
              let lineBg = 'transparent'
              if (line.startsWith('+')) {
                lineColor = '#3fb950'
                lineBg = 'rgba(63,185,80,0.08)'
              } else if (line.startsWith('-')) {
                lineColor = '#f85149'
                lineBg = 'rgba(248,81,73,0.08)'
              } else if (line.startsWith('@@')) {
                lineColor = '#d2a8ff'
                lineBg = 'rgba(210,168,255,0.05)'
              }
              return (
                <div key={i} style={{ color: lineColor, background: lineBg, padding: '0 4px', marginLeft: -4, marginRight: -4 }}>
                  {line}
                </div>
              )
            })}
          </pre>
        </div>
      )}
    </div>
  )
}

/* ── Output stream ──────────────────────────────────────── */

function OutputStreamView({ lines, isLive }: { lines: OutputLine[]; isLive: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current && isLive) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines.length, isLive])

  const lineStyles: Record<OutputLine['type'], { color: string; prefix: string; bg: string }> = {
    text: { color: 'var(--text-secondary)', prefix: '', bg: 'transparent' },
    code: { color: '#79c0ff', prefix: '', bg: 'rgba(0,0,0,0.2)' },
    thinking: { color: '#d2a8ff', prefix: 'Thinking: ', bg: 'rgba(210,168,255,0.04)' },
    'tool-call': { color: '#e3b341', prefix: '> ', bg: 'rgba(227,179,65,0.04)' },
    'tool-result': { color: '#58a6ff', prefix: '  <- ', bg: 'rgba(88,166,255,0.04)' },
    error: { color: '#f85149', prefix: 'Error: ', bg: 'rgba(248,81,73,0.06)' },
    success: { color: '#3fb950', prefix: '', bg: 'rgba(63,185,80,0.06)' },
  }

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight: 240,
        overflowY: 'auto',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.12)',
      }}
    >
      {lines.map((line) => {
        const ls = lineStyles[line.type]
        if (line.type === 'code') {
          return (
            <div key={line.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                style={{
                  padding: '3px 10px',
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  background: 'rgba(0,0,0,0.1)',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono, monospace)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>{line.language || 'code'}</span>
                <button
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Copy code"
                  onClick={() => navigator.clipboard?.writeText(line.content)}
                >
                  <Copy size={9} />
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '8px 10px',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono, monospace)',
                  lineHeight: 1.6,
                  color: '#79c0ff',
                  background: ls.bg,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {line.content}
              </pre>
            </div>
          )
        }
        return (
          <div
            key={line.id}
            style={{
              padding: '5px 10px',
              fontSize: 11,
              lineHeight: 1.5,
              color: ls.color,
              background: ls.bg,
              fontFamily: line.type === 'tool-call' || line.type === 'tool-result' ? 'var(--font-mono, monospace)' : 'inherit',
              borderBottom: '1px solid rgba(255,255,255,0.02)',
              wordBreak: 'break-word',
            }}
          >
            {ls.prefix && (
              <span style={{ opacity: 0.6, fontStyle: line.type === 'thinking' ? 'italic' : 'normal' }}>
                {ls.prefix}
              </span>
            )}
            <span style={{ fontStyle: line.type === 'thinking' ? 'italic' : 'normal' }}>
              {line.content}
            </span>
          </div>
        )
      })}
      {isLive && (
        <div
          style={{
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span className="agent-typing-indicator" />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Agent is working...
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Step progress ───────────────────────────────────── */

function StepProgressView({ steps, currentStep, totalSteps, estimatedTimeRemaining }: {
  steps: TaskStep[]
  currentStep: number
  totalSteps: number
  estimatedTimeRemaining?: number
}) {
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Step {currentStep + 1} of {totalSteps}
          </span>
          {estimatedTimeRemaining !== undefined && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
              ~{estimatedTimeRemaining}s remaining
            </span>
          )}
        </div>
        <div
          style={{
            height: 4,
            borderRadius: 2,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              borderRadius: 2,
              width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--accent, #58a6ff), #3fb950)',
              transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: '0 0 8px rgba(88,166,255,0.3)',
            }}
          />
        </div>
      </div>

      {/* Steps list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {steps.map((step, i) => {
          const sc = taskStatusConfig[step.status]
          const StepIcon = sc.icon
          return (
            <div
              key={step.id}
              className="flex items-center gap-2"
              style={{
                padding: '3px 6px',
                borderRadius: 4,
                background: step.status === 'running' ? 'rgba(227,179,65,0.06)' : 'transparent',
              }}
            >
              <StepIcon
                size={10}
                style={{
                  color: sc.color,
                  flexShrink: 0,
                  animation: step.status === 'running' ? 'agent-spin 1s linear infinite' : 'none',
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  color: step.status === 'queued' ? 'var(--text-muted)' : 'var(--text-secondary)',
                  flex: 1,
                  fontWeight: step.status === 'running' ? 600 : 400,
                }}
              >
                {step.label}
              </span>
              {step.duration !== undefined && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {formatDuration(step.duration)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Task detail view ────────────────────────────────── */

function TaskDetailView({
  task,
  onBack,
  onAcceptFile,
  onRejectFile,
  onAcceptAll,
  onRejectAll,
  onCancel,
  onRerun,
}: {
  task: AgentTask
  onBack: () => void
  onAcceptFile: (taskId: string, fileId: string) => void
  onRejectFile: (taskId: string, fileId: string) => void
  onAcceptAll: (taskId: string) => void
  onRejectAll: (taskId: string) => void
  onCancel: (taskId: string) => void
  onRerun: (taskId: string) => void
}) {
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'output' | 'files' | 'steps'>('output')
  const cap = capabilities.find((c) => c.id === task.capability)
  const CapIcon = cap?.icon || Code2

  const pendingFileChanges = task.fileChanges.filter(f => f.accepted === null)

  const toggleDiff = useCallback((fileId: string) => {
    setExpandedDiffs((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '3px 6px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            fontSize: 10,
            gap: 3,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <ChevronRight size={10} style={{ transform: 'rotate(180deg)' }} />
          Back
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CapIcon size={12} style={{ color: cap?.color || 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.description}
            </span>
          </div>
        </div>

        <TaskStatusBadge status={task.status} />
      </div>

      {/* Meta info */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: 9,
          color: 'var(--text-muted)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          Model: <span style={{ color: 'var(--text-secondary)' }}>{task.model}</span>
        </span>
        <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
          Started: <span style={{ color: 'var(--text-secondary)' }}>{timeAgo(task.timestamp)}</span>
        </span>
        {task.tokenUsage && (
          <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            Tokens: <span style={{ color: 'var(--text-secondary)' }}>{formatTokens(task.tokenUsage.total)}</span>
          </span>
        )}
        {task.fileChanges.length > 0 && (
          <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>
            Files: <span style={{ color: 'var(--text-secondary)' }}>{task.fileChanges.length}</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex"
        style={{
          borderBottom: '1px solid var(--border)',
        }}
      >
        {(['output', 'files', 'steps'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: '6px 8px',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--accent, #58a6ff)' : '2px solid transparent',
              color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {tab === 'output' && <Terminal size={10} />}
            {tab === 'files' && <FileDiff size={10} />}
            {tab === 'steps' && <Layers size={10} />}
            {tab}
            {tab === 'files' && pendingFileChanges.length > 0 && (
              <span
                style={{
                  fontSize: 8,
                  background: '#e3b341',
                  color: '#000',
                  borderRadius: 6,
                  padding: '1px 4px',
                  fontWeight: 700,
                }}
              >
                {pendingFileChanges.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
        {activeTab === 'output' && (
          <OutputStreamView lines={task.outputLog} isLive={task.status === 'running'} />
        )}

        {activeTab === 'files' && (
          <div>
            {task.fileChanges.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                No file changes yet
              </div>
            ) : (
              <>
                {/* Bulk actions */}
                {pendingFileChanges.length > 0 && (
                  <div
                    className="flex items-center gap-2"
                    style={{
                      padding: '6px 8px',
                      marginBottom: 6,
                      borderRadius: 6,
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>
                      {pendingFileChanges.length} pending change{pendingFileChanges.length > 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => onAcceptAll(task.id)}
                      style={{
                        padding: '3px 10px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        background: 'rgba(63,185,80,0.12)',
                        border: '1px solid rgba(63,185,80,0.25)',
                        color: '#3fb950',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(63,185,80,0.2)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(63,185,80,0.12)' }}
                    >
                      Accept All
                    </button>
                    <button
                      onClick={() => onRejectAll(task.id)}
                      style={{
                        padding: '3px 10px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 4,
                        background: 'rgba(248,81,73,0.12)',
                        border: '1px solid rgba(248,81,73,0.25)',
                        color: '#f85149',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,81,73,0.2)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(248,81,73,0.12)' }}
                    >
                      Reject All
                    </button>
                  </div>
                )}

                {task.fileChanges.map((file) => (
                  <FileChangeRow
                    key={file.id}
                    file={file}
                    onAccept={(fid) => onAcceptFile(task.id, fid)}
                    onReject={(fid) => onRejectFile(task.id, fid)}
                    onToggleDiff={toggleDiff}
                    showDiff={expandedDiffs.has(file.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'steps' && (
          <StepProgressView
            steps={task.steps}
            currentStep={task.currentStep}
            totalSteps={task.totalSteps}
            estimatedTimeRemaining={task.estimatedTimeRemaining}
          />
        )}
      </div>

      {/* Error banner */}
      {task.error && (
        <div
          style={{
            padding: '8px 12px',
            borderTop: '1px solid rgba(248,81,73,0.2)',
            background: 'rgba(248,81,73,0.06)',
            display: 'flex',
            alignItems: 'start',
            gap: 8,
          }}
        >
          <AlertCircle size={12} style={{ color: '#f85149', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 10, color: '#f85149', lineHeight: 1.5, wordBreak: 'break-word' }}>
            {task.error}
          </span>
        </div>
      )}

      {/* Action bar */}
      <div
        className="flex items-center gap-2"
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
        }}
      >
        {task.status === 'running' && (
          <button
            onClick={() => onCancel(task.id)}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 5,
              background: 'rgba(248,81,73,0.1)',
              border: '1px solid rgba(248,81,73,0.2)',
              color: '#f85149',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <Square size={10} />
            Cancel Task
          </button>
        )}
        {(task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') && (
          <button
            onClick={() => onRerun(task.id)}
            style={{
              flex: 1,
              padding: '6px 12px',
              fontSize: 10,
              fontWeight: 600,
              borderRadius: 5,
              background: 'rgba(88,166,255,0.1)',
              border: '1px solid rgba(88,166,255,0.2)',
              color: '#58a6ff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <RotateCcw size={10} />
            Re-run Task
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Task list item ──────────────────────────────────── */

function TaskListItem({
  task,
  onSelect,
}: {
  task: AgentTask
  onSelect: (id: string) => void
}) {
  const cap = capabilities.find((c) => c.id === task.capability)
  const CapIcon = cap?.icon || Code2
  const progress = task.totalSteps > 0 ? (task.currentStep / task.totalSteps) * 100 : 0
  const pendingFiles = task.fileChanges.filter(f => f.accepted === null).length

  return (
    <div
      className="transition-all duration-200"
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 10px',
        cursor: 'pointer',
      }}
      onClick={() => onSelect(task.id)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = (cap?.color || 'var(--accent)') + '40'
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: (cap?.color || '#58a6ff') + '14',
            border: `1px solid ${(cap?.color || '#58a6ff')}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <CapIcon size={12} style={{ color: cap?.color || '#58a6ff' }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {task.description}
            </span>
            <TaskStatusBadge status={task.status} />
          </div>

          {/* Meta line */}
          <div className="flex items-center gap-2" style={{ marginTop: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {timeAgo(task.timestamp)}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
              {task.model}
            </span>
            {task.fileChanges.length > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                {task.fileChanges.length} file{task.fileChanges.length > 1 ? 's' : ''}
              </span>
            )}
            {pendingFiles > 0 && (
              <span style={{ fontSize: 8, background: '#e3b341', color: '#000', borderRadius: 6, padding: '1px 4px', fontWeight: 700 }}>
                {pendingFiles} pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress for running tasks */}
      {task.status === 'running' && (
        <div style={{ marginTop: 6 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              {task.steps[task.currentStep]?.label || 'Working...'}
            </span>
            <span style={{ fontSize: 9, color: 'var(--accent, #58a6ff)', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
              {Math.round(progress)}%
            </span>
          </div>
          <div
            style={{
              height: 3,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.04)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                borderRadius: 2,
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--accent, #58a6ff), #3fb950)',
                transition: 'width 0.6s ease',
                boxShadow: '0 0 6px rgba(88,166,255,0.3)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Task template card ──────────────────────────────── */

function TaskTemplateCard({
  template,
  onLaunch,
}: {
  template: TaskTemplate
  onLaunch: (template: TaskTemplate) => void
}) {
  return (
    <button
      onClick={() => onLaunch(template)}
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
        e.currentTarget.style.borderColor = template.color + '60'
        e.currentTarget.style.background = template.color + '08'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
      }}
    >
      <div className="flex items-center gap-2">
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: template.color + '14',
            border: `1px solid ${template.color}20`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <template.icon size={12} style={{ color: template.color }} />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>
            {template.title}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {template.description}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2 }}>
        {template.steps.map((step, i) => (
          <span
            key={i}
            style={{
              fontSize: 8,
              color: 'var(--text-muted)',
              background: 'rgba(255,255,255,0.04)',
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid var(--border)',
            }}
          >
            {step}
          </span>
        ))}
      </div>
    </button>
  )
}

/* ── Configuration section ────────────────────────────── */

function ConfigurationSection({
  config,
  onUpdate,
}: {
  config: AgentConfig
  onUpdate: (update: Partial<AgentConfig>) => void
}) {
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
            type={config.showApiKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder="sk-..."
            style={inputStyle}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
          />
          <button
            onClick={() => onUpdate({ showApiKey: !config.showApiKey })}
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
            {config.showApiKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Model Selector */}
      <div>
        <div style={labelStyle}>
          <Sparkles size={9} /> Model
        </div>
        <select
          value={config.model}
          onChange={(e) => onUpdate({ model: e.target.value })}
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
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
          <option value="claude-3-opus">Claude 3 Opus</option>
          <option value="claude-3-sonnet">Claude 3.5 Sonnet</option>
          <option value="claude-3-haiku">Claude 3 Haiku</option>
          <option value="codellama">CodeLlama</option>
          <option value="deepseek-coder">DeepSeek Coder</option>
          <option value="deepseek-v3">DeepSeek V3</option>
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
            {config.temperature.toFixed(2)}
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
            value={config.temperature}
            onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
            style={{
              width: '100%',
              height: 4,
              appearance: 'none',
              background: `linear-gradient(to right, var(--accent) ${config.temperature * 100}%, rgba(255,255,255,0.08) ${config.temperature * 100}%)`,
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
          max={128000}
          step={256}
          value={config.maxTokens}
          onChange={(e) => onUpdate({ maxTokens: parseInt(e.target.value, 10) || 256 })}
          style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 3 }}>
          256 - 128,000 tokens
        </div>
      </div>

      {/* System Prompt */}
      <div>
        <div style={labelStyle}>
          <AlignLeft size={9} /> System Prompt
        </div>
        <textarea
          value={config.systemPrompt}
          onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
          placeholder="You are a helpful coding assistant..."
          rows={3}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: 60,
            lineHeight: 1.5,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
      </div>

      {/* Auto-apply toggle */}
      <div className="flex items-center justify-between" style={{ padding: '2px 0' }}>
        <div style={labelStyle}>
          <Zap size={9} /> Auto-apply changes
        </div>
        <button
          onClick={() => onUpdate({ autoApply: !config.autoApply })}
          style={{
            width: 32,
            height: 18,
            borderRadius: 9,
            background: config.autoApply ? 'var(--accent, #58a6ff)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 2,
              left: config.autoApply ? 16 : 2,
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'white',
              transition: 'left 0.2s',
            }}
          />
        </button>
      </div>
    </div>
  )
}

/* ── History view ─────────────────────────────────────── */

function HistoryView({
  tasks,
  onSelect,
  onBack,
  onClearHistory,
}: {
  tasks: AgentTask[]
  onSelect: (id: string) => void
  onBack: () => void
  onClearHistory: () => void
}) {
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all')

  const filtered = filterStatus === 'all'
    ? tasks
    : tasks.filter((t) => t.status === filterStatus)

  const stats = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    running: tasks.filter(t => t.status === 'running').length,
    totalTokens: tasks.reduce((sum, t) => sum + (t.tokenUsage?.total || 0), 0),
  }), [tasks])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '3px 6px',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            fontSize: 10,
            gap: 3,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
        >
          <ChevronRight size={10} style={{ transform: 'rotate(180deg)' }} />
          Back
        </button>
        <History size={12} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          Agent History
        </span>
        {tasks.length > 0 && (
          <button
            onClick={onClearHistory}
            title="Clear history"
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '3px 6px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#f85149'; e.currentTarget.style.borderColor = 'rgba(248,81,73,0.3)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <Trash2 size={9} />
            Clear
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 12,
          fontSize: 9,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        <span>Total: <span style={{ color: 'var(--text-secondary)' }}>{stats.total}</span></span>
        <span style={{ color: '#3fb950' }}>Passed: {stats.completed}</span>
        <span style={{ color: '#f85149' }}>Failed: {stats.failed}</span>
        <span>Tokens: <span style={{ color: 'var(--text-secondary)' }}>{formatTokens(stats.totalTokens)}</span></span>
      </div>

      {/* Filter */}
      <div
        className="flex"
        style={{
          padding: '4px 8px',
          borderBottom: '1px solid var(--border)',
          gap: 2,
        }}
      >
        {(['all', 'running', 'completed', 'failed', 'cancelled'] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            style={{
              padding: '3px 8px',
              fontSize: 9,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              background: filterStatus === status ? 'rgba(255,255,255,0.06)' : 'transparent',
              border: '1px solid',
              borderColor: filterStatus === status ? 'var(--border)' : 'transparent',
              borderRadius: 4,
              color: filterStatus === status ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
            {filterStatus === 'all' ? 'No tasks in history' : `No ${filterStatus} tasks`}
          </div>
        ) : (
          filtered.map((task) => (
            <TaskListItem key={task.id} task={task} onSelect={onSelect} />
          ))
        )}
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

  const [tasks, setTasks] = useState<AgentTask[]>(initialTasks)
  const [view, setView] = useState<PanelView>('main')
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [config, setConfig] = useState<AgentConfig>({
    model: 'claude-3-sonnet',
    temperature: 0.7,
    maxTokens: 4096,
    systemPrompt: '',
    apiKey: '',
    showApiKey: false,
    autoApply: false,
  })

  // Determine overall status
  const overallStatus: OverallStatus = !ollamaAvailable
    ? 'offline'
    : workingCount > 0 || tasks.some(t => t.status === 'running')
      ? 'processing'
      : 'ready'
  const osc = overallStatusConfig[overallStatus]

  const runningTasks = tasks.filter(t => t.status === 'running')
  const completedTasks = tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
  const selectedTask = tasks.find(t => t.id === selectedTaskId) || null

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

  // Select a task and switch to detail view
  const selectTask = useCallback((id: string) => {
    setSelectedTaskId(id)
    setView('task-detail')
  }, [])

  // Accept file change
  const acceptFile = useCallback((taskId: string, fileId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, fileChanges: t.fileChanges.map(f => f.id === fileId ? { ...f, accepted: true } : f) }
        : t
    ))
  }, [])

  // Reject file change
  const rejectFile = useCallback((taskId: string, fileId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, fileChanges: t.fileChanges.map(f => f.id === fileId ? { ...f, accepted: false } : f) }
        : t
    ))
  }, [])

  // Accept all files in a task
  const acceptAllFiles = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, fileChanges: t.fileChanges.map(f => f.accepted === null ? { ...f, accepted: true } : f) }
        : t
    ))
  }, [])

  // Reject all files in a task
  const rejectAllFiles = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, fileChanges: t.fileChanges.map(f => f.accepted === null ? { ...f, accepted: false } : f) }
        : t
    ))
  }, [])

  // Cancel a task
  const cancelTask = useCallback((taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId
        ? { ...t, status: 'cancelled' as TaskStatus, completedAt: Date.now() }
        : t
    ))
  }, [])

  // Re-run a task
  const rerunTask = useCallback((taskId: string) => {
    const original = tasks.find(t => t.id === taskId)
    if (!original) return
    const cap = capabilities.find(c => c.id === original.capability)
    if (cap) dispatchToChat(cap.prompt + original.description)

    const newTask: AgentTask = {
      ...original,
      id: `task-${Date.now()}`,
      status: 'running',
      timestamp: Date.now(),
      completedAt: undefined,
      currentStep: 0,
      steps: original.steps.map(s => ({ ...s, status: 'queued' as TaskStatus, duration: undefined })),
      fileChanges: [],
      outputLog: [
        { id: `ol-${Date.now()}`, timestamp: Date.now(), type: 'text', content: `Re-running: ${original.description}` },
      ],
      error: undefined,
      tokenUsage: undefined,
    }
    setTasks(prev => [newTask, ...prev])
    setSelectedTaskId(newTask.id)
    setView('task-detail')
  }, [tasks, dispatchToChat])

  // Launch a template
  const launchTemplate = useCallback((template: TaskTemplate) => {
    dispatchToChat(template.prompt)
    const newTask: AgentTask = {
      id: `task-${Date.now()}`,
      description: template.title,
      status: 'running',
      timestamp: Date.now(),
      capability: template.id.replace('tmpl-', ''),
      model: config.model,
      steps: template.steps.map((s, i) => ({
        id: `step-${Date.now()}-${i}`,
        label: s,
        status: i === 0 ? 'running' as TaskStatus : 'queued' as TaskStatus,
      })),
      currentStep: 0,
      totalSteps: template.steps.length,
      estimatedTimeRemaining: template.steps.length * 8,
      fileChanges: [],
      outputLog: [
        { id: `ol-${Date.now()}`, timestamp: Date.now(), type: 'text', content: `Starting: ${template.title}` },
        { id: `ol-${Date.now()}-2`, timestamp: Date.now(), type: 'thinking', content: `Analyzing project structure for ${template.description.toLowerCase()}...` },
      ],
    }
    setTasks(prev => [newTask, ...prev])
    setSelectedTaskId(newTask.id)
    setView('task-detail')
  }, [config.model, dispatchToChat])

  // Clear history
  const clearHistory = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status === 'running'))
  }, [])

  // Update config
  const updateConfig = useCallback((update: Partial<AgentConfig>) => {
    setConfig(prev => ({ ...prev, ...update }))
  }, [])

  // ── Render views ────────────────────────────────────

  if (view === 'task-detail' && selectedTask) {
    return (
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <TaskDetailView
          task={selectedTask}
          onBack={() => setView('main')}
          onAcceptFile={acceptFile}
          onRejectFile={rejectFile}
          onAcceptAll={acceptAllFiles}
          onRejectAll={rejectAllFiles}
          onCancel={cancelTask}
          onRerun={rerunTask}
        />
        <style>{agentStyles}</style>
      </div>
    )
  }

  if (view === 'history') {
    return (
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <HistoryView
          tasks={tasks}
          onSelect={selectTask}
          onBack={() => setView('main')}
          onClearHistory={clearHistory}
        />
        <style>{agentStyles}</style>
      </div>
    )
  }

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
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setView('history')}
            title="Task history"
            style={{
              background: 'none',
              border: '1px solid transparent',
              borderRadius: 4,
              padding: 3,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <History size={12} />
          </button>
          <button
            onClick={() => setView('config')}
            title="Configuration"
            style={{
              background: 'none',
              border: '1px solid transparent',
              borderRadius: 4,
              padding: 3,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'var(--border)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent' }}
          >
            <Settings size={12} />
          </button>
          {activeCount > 0 && (
            <span
              className="flex items-center gap-1.5"
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
            {runningTasks.length > 0 && (
              <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>
                ({runningTasks.length} task{runningTasks.length > 1 ? 's' : ''} running)
              </span>
            )}
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

      {/* ── Running Tasks ─────────────────────────────────── */}
      {runningTasks.length > 0 && (
        <Section
          title="Running Tasks"
          icon={Loader2}
          defaultOpen={true}
          badge={
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: '#e3b341',
                background: 'rgba(227,179,65,0.15)',
                padding: '1px 6px',
                borderRadius: 6,
              }}
            >
              {runningTasks.length}
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {runningTasks.map((task) => (
              <TaskListItem key={task.id} task={task} onSelect={selectTask} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Recent Completed Tasks ────────────────────────── */}
      {completedTasks.length > 0 && (
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
              {completedTasks.length}
            </span>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
            {completedTasks.slice(0, 5).map((task) => (
              <TaskListItem key={task.id} task={task} onSelect={selectTask} />
            ))}
            {completedTasks.length > 5 && (
              <button
                onClick={() => setView('history')}
                style={{
                  padding: '6px 0',
                  fontSize: 10,
                  color: 'var(--accent, #58a6ff)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'center',
                  fontWeight: 500,
                }}
              >
                View all {completedTasks.length} tasks in history
              </button>
            )}
          </div>
        </Section>
      )}

      {/* ── Task Templates ────────────────────────────────── */}
      <Section title="Task Templates" icon={Sparkles} defaultOpen={tasks.length === 0}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
          }}
        >
          {taskTemplates.map((template) => (
            <TaskTemplateCard
              key={template.id}
              template={template}
              onLaunch={launchTemplate}
            />
          ))}
        </div>
      </Section>

      {/* ── Configuration ────────────────────────────────── */}
      <Section title="Configuration" icon={Settings} defaultOpen={false}>
        <ConfigurationSection config={config} onUpdate={updateConfig} />
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
          <StatusRow
            Icon={Sparkles}
            label="Model"
            value={config.model}
            valueColor="var(--text-secondary)"
            dotColor="var(--accent)"
          />
        </div>
      </div>

      <style>{agentStyles}</style>
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

/* ── Shared styles ────────────────────────────────────── */

const agentStyles = `
  @keyframes agent-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  @keyframes agent-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes agent-typing-blink {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
  .agent-typing-indicator {
    display: inline-flex;
    gap: 3px;
  }
  .agent-typing-indicator::before,
  .agent-typing-indicator::after,
  .agent-typing-indicator {
    content: '';
  }
  .agent-typing-indicator {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: agent-typing-blink 1.2s ease-in-out infinite;
    position: relative;
  }
  .agent-typing-indicator::before,
  .agent-typing-indicator::after {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--text-muted);
    animation: agent-typing-blink 1.2s ease-in-out infinite;
  }
  .agent-typing-indicator::before {
    left: -7px;
    animation-delay: -0.3s;
  }
  .agent-typing-indicator::after {
    left: 7px;
    animation-delay: 0.3s;
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
`
