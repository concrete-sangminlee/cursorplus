/**
 * ProcessExplorer.tsx
 *
 * VS Code-style Process Explorer for Orion IDE.
 * Shows a tree view of all IDE processes with real-time CPU/memory stats,
 * sparkline charts, sortable columns, kill confirmation, and search/filter.
 * Uses an inline Zustand store with mock data simulating ~15 IDE processes.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  memo,
} from 'react'
import { create } from 'zustand'
import {
  Cpu,
  HardDrive,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Play,
  Pause,
  Settings,
  Monitor,
  Terminal,
  Puzzle,
  Bug,
  Code,
  Server,
  Layers,
  Activity,
  Clock,
  Grip,
  Copy,
  Info,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Zap,
  MemoryStick,
  Filter,
  Eye,
  EyeOff,
  MoreHorizontal,
  Maximize2,
  Minimize2,
} from 'lucide-react'

// ── Injected Styles ──────────────────────────────────────────────────────────

const INJECTED_STYLES = `
.pe-scrollbar::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.pe-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.pe-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color, #3e3e42);
  border-radius: 4px;
}
.pe-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary, #858585);
}

@keyframes pe-fade-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.pe-fade-in {
  animation: pe-fade-in 0.15s ease-out;
}

@keyframes pe-pulse {
  0%   { opacity: 1; }
  50%  { opacity: 0.5; }
  100% { opacity: 1; }
}
.pe-pulse {
  animation: pe-pulse 1.5s ease-in-out infinite;
}

@keyframes pe-bar-grow {
  from { width: 0%; }
}
.pe-bar-grow {
  animation: pe-bar-grow 0.5s ease-out;
}

@keyframes pe-kill-flash {
  0%   { background: rgba(239, 68, 68, 0.3); }
  100% { background: transparent; }
}
.pe-kill-flash {
  animation: pe-kill-flash 0.4s ease-out;
}

.pe-sparkline-canvas {
  image-rendering: pixelated;
}

.pe-row-hover:hover {
  background: rgba(255, 255, 255, 0.04) !important;
}

.pe-row-selected {
  background: rgba(var(--accent-primary-rgb, 0, 122, 204), 0.15) !important;
}

.pe-tooltip {
  pointer-events: none;
  white-space: pre-wrap;
  max-width: 500px;
  word-break: break-all;
}
`

// ── Types ────────────────────────────────────────────────────────────────────

type ProcessType =
  | 'main'
  | 'renderer'
  | 'extension-host'
  | 'terminal'
  | 'lsp-server'
  | 'debug-adapter'
  | 'gpu'
  | 'utility'
  | 'worker'

type SortColumn = 'name' | 'pid' | 'type' | 'cpu' | 'memory' | 'uptime'
type SortDirection = 'asc' | 'desc'

interface ProcessInfo {
  pid: number
  name: string
  type: ProcessType
  cpu: number
  memoryRSS: number
  memoryHeap: number
  uptime: number
  commandLine: string
  parentPid: number | null
  children: number[]
  cpuHistory: number[]
  memoryHistory: number[]
  status: 'running' | 'sleeping' | 'idle'
}

interface ProcessExplorerState {
  processes: Map<number, ProcessInfo>
  selectedPid: number | null
  expandedPids: Set<number>
  searchQuery: string
  sortColumn: SortColumn
  sortDirection: SortDirection
  autoRefresh: boolean
  refreshInterval: number
  groupByType: boolean
  showSparklines: boolean
  killConfirmPid: number | null

  setSelectedPid: (pid: number | null) => void
  toggleExpanded: (pid: number) => void
  setSearchQuery: (q: string) => void
  setSortColumn: (col: SortColumn) => void
  toggleSortDirection: () => void
  setAutoRefresh: (on: boolean) => void
  setRefreshInterval: (ms: number) => void
  setGroupByType: (on: boolean) => void
  setShowSparklines: (on: boolean) => void
  setKillConfirmPid: (pid: number | null) => void
  killProcess: (pid: number) => void
  tickProcesses: () => void
  initProcesses: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const HISTORY_SIZE = 60

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function jitter(base: number, range: number) {
  return clamp(base + (Math.random() - 0.5) * range, 0, 100)
}

function memJitter(base: number, range: number) {
  return Math.max(1, base + (Math.random() - 0.5) * range)
}

function formatBytes(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(1)} MB`
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function pushHistory(arr: number[], val: number): number[] {
  const next = [...arr, val]
  if (next.length > HISTORY_SIZE) next.shift()
  return next
}

const PROCESS_TYPE_LABELS: Record<ProcessType, string> = {
  main: 'Main Process',
  renderer: 'Renderer',
  'extension-host': 'Extension Host',
  terminal: 'Terminal',
  'lsp-server': 'Language Server',
  'debug-adapter': 'Debug Adapter',
  gpu: 'GPU Process',
  utility: 'Utility',
  worker: 'Worker',
}

const PROCESS_TYPE_ORDER: ProcessType[] = [
  'main',
  'renderer',
  'gpu',
  'extension-host',
  'lsp-server',
  'terminal',
  'debug-adapter',
  'utility',
  'worker',
]

function getProcessIcon(type: ProcessType) {
  switch (type) {
    case 'main':
      return Monitor
    case 'renderer':
      return Layers
    case 'extension-host':
      return Puzzle
    case 'terminal':
      return Terminal
    case 'lsp-server':
      return Server
    case 'debug-adapter':
      return Bug
    case 'gpu':
      return Zap
    case 'utility':
      return Settings
    case 'worker':
      return Code
  }
}

// ── Mock process seed data ───────────────────────────────────────────────────

interface ProcessSeed {
  pid: number
  name: string
  type: ProcessType
  cpuBase: number
  cpuRange: number
  memBase: number
  memRange: number
  commandLine: string
  parentPid: number | null
  children: number[]
}

const PROCESS_SEEDS: ProcessSeed[] = [
  {
    pid: 1,
    name: 'Orion IDE (Main)',
    type: 'main',
    cpuBase: 3,
    cpuRange: 4,
    memBase: 180,
    memRange: 30,
    commandLine: '/usr/lib/orion-ide/orion --no-sandbox --unity-launch',
    parentPid: null,
    children: [2, 3, 4, 5, 13, 14, 15],
  },
  {
    pid: 2,
    name: 'GPU Process',
    type: 'gpu',
    cpuBase: 5,
    cpuRange: 8,
    memBase: 120,
    memRange: 20,
    commandLine: '/usr/lib/orion-ide/orion --type=gpu-process --gpu-preferences=...',
    parentPid: 1,
    children: [],
  },
  {
    pid: 3,
    name: 'Window (Renderer)',
    type: 'renderer',
    cpuBase: 12,
    cpuRange: 15,
    memBase: 320,
    memRange: 60,
    commandLine: '/usr/lib/orion-ide/orion --type=renderer --orion-window-id=1',
    parentPid: 1,
    children: [],
  },
  {
    pid: 4,
    name: 'Extension Host',
    type: 'extension-host',
    cpuBase: 8,
    cpuRange: 12,
    memBase: 250,
    memRange: 50,
    commandLine: '/usr/lib/orion-ide/orion --type=extensionHost --uriTransformerPath=...',
    parentPid: 1,
    children: [6, 7, 8, 9, 10, 11, 12],
  },
  {
    pid: 5,
    name: 'Shared Process',
    type: 'utility',
    cpuBase: 1,
    cpuRange: 2,
    memBase: 45,
    memRange: 10,
    commandLine: '/usr/lib/orion-ide/orion --type=utility --shared-process',
    parentPid: 1,
    children: [],
  },
  {
    pid: 6,
    name: 'TypeScript Language Server',
    type: 'lsp-server',
    cpuBase: 15,
    cpuRange: 20,
    memBase: 280,
    memRange: 80,
    commandLine: 'node /usr/lib/orion-ide/extensions/typescript/server/tsserver.js --useInferredProjectPerProjectRoot',
    parentPid: 4,
    children: [],
  },
  {
    pid: 7,
    name: 'ESLint Language Server',
    type: 'lsp-server',
    cpuBase: 6,
    cpuRange: 10,
    memBase: 90,
    memRange: 25,
    commandLine: 'node /home/user/.orion/extensions/dbaeumer.vscode-eslint/server/eslintServer.js --stdio',
    parentPid: 4,
    children: [],
  },
  {
    pid: 8,
    name: 'Tailwind CSS IntelliSense',
    type: 'lsp-server',
    cpuBase: 4,
    cpuRange: 6,
    memBase: 65,
    memRange: 15,
    commandLine: 'node /home/user/.orion/extensions/bradlc.tailwindcss/dist/server/index.js --stdio',
    parentPid: 4,
    children: [],
  },
  {
    pid: 9,
    name: 'Prettier Formatter',
    type: 'worker',
    cpuBase: 2,
    cpuRange: 5,
    memBase: 40,
    memRange: 10,
    commandLine: 'node /home/user/.orion/extensions/esbenp.prettier/dist/worker.js',
    parentPid: 4,
    children: [],
  },
  {
    pid: 10,
    name: 'GitLens Extension',
    type: 'worker',
    cpuBase: 3,
    cpuRange: 5,
    memBase: 55,
    memRange: 12,
    commandLine: 'node /home/user/.orion/extensions/eamodio.gitlens/dist/gitlens.js',
    parentPid: 4,
    children: [],
  },
  {
    pid: 11,
    name: 'Debug Adapter (Node.js)',
    type: 'debug-adapter',
    cpuBase: 2,
    cpuRange: 4,
    memBase: 35,
    memRange: 8,
    commandLine: 'node /usr/lib/orion-ide/extensions/js-debug/src/dapDebugServer.js 45321',
    parentPid: 4,
    children: [],
  },
  {
    pid: 12,
    name: 'Python Language Server',
    type: 'lsp-server',
    cpuBase: 10,
    cpuRange: 14,
    memBase: 190,
    memRange: 40,
    commandLine: 'python3 -m pylsp --tcp --host 127.0.0.1 --port 2087',
    parentPid: 4,
    children: [],
  },
  {
    pid: 13,
    name: 'Terminal: bash',
    type: 'terminal',
    cpuBase: 1,
    cpuRange: 3,
    memBase: 18,
    memRange: 6,
    commandLine: '/bin/bash --init-file /usr/lib/orion-ide/shell-integration-bash.sh',
    parentPid: 1,
    children: [],
  },
  {
    pid: 14,
    name: 'Terminal: zsh',
    type: 'terminal',
    cpuBase: 1,
    cpuRange: 3,
    memBase: 22,
    memRange: 5,
    commandLine: '/bin/zsh -i -l',
    parentPid: 1,
    children: [],
  },
  {
    pid: 15,
    name: 'File Watcher',
    type: 'utility',
    cpuBase: 1,
    cpuRange: 2,
    memBase: 30,
    memRange: 8,
    commandLine: '/usr/lib/orion-ide/orion --type=fileWatcher --watcherExec=/usr/lib/orion-ide/rg',
    parentPid: 1,
    children: [],
  },
]

function buildInitialProcesses(): Map<number, ProcessInfo> {
  const map = new Map<number, ProcessInfo>()
  const baseTime = Math.floor(Date.now() / 1000) - 3600

  for (const seed of PROCESS_SEEDS) {
    const cpu = jitter(seed.cpuBase, seed.cpuRange)
    const mem = memJitter(seed.memBase, seed.memRange)
    const cpuHistory: number[] = []
    const memHistory: number[] = []

    for (let i = 0; i < HISTORY_SIZE; i++) {
      cpuHistory.push(jitter(seed.cpuBase, seed.cpuRange))
      memHistory.push(memJitter(seed.memBase, seed.memRange))
    }

    map.set(seed.pid, {
      pid: seed.pid,
      name: seed.name,
      type: seed.type,
      cpu,
      memoryRSS: mem,
      memoryHeap: mem * (0.5 + Math.random() * 0.3),
      uptime: Math.floor(Date.now() / 1000) - baseTime + seed.pid * 120,
      commandLine: seed.commandLine,
      parentPid: seed.parentPid,
      children: seed.children,
      cpuHistory,
      memoryHistory: memHistory,
      status: 'running',
    })
  }
  return map
}

// ── Zustand Store ────────────────────────────────────────────────────────────

const useProcessExplorerStore = create<ProcessExplorerState>((set, get) => ({
  processes: new Map(),
  selectedPid: null,
  expandedPids: new Set([1, 4]),
  searchQuery: '',
  sortColumn: 'cpu',
  sortDirection: 'desc',
  autoRefresh: true,
  refreshInterval: 1000,
  groupByType: false,
  showSparklines: true,
  killConfirmPid: null,

  setSelectedPid: (pid) => set({ selectedPid: pid }),

  toggleExpanded: (pid) =>
    set((s) => {
      const next = new Set(s.expandedPids)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return { expandedPids: next }
    }),

  setSearchQuery: (q) => set({ searchQuery: q }),

  setSortColumn: (col) =>
    set((s) => {
      if (s.sortColumn === col) {
        return { sortDirection: s.sortDirection === 'asc' ? 'desc' : 'asc' }
      }
      return { sortColumn: col, sortDirection: col === 'name' ? 'asc' : 'desc' }
    }),

  toggleSortDirection: () =>
    set((s) => ({
      sortDirection: s.sortDirection === 'asc' ? 'desc' : 'asc',
    })),

  setAutoRefresh: (on) => set({ autoRefresh: on }),
  setRefreshInterval: (ms) => set({ refreshInterval: ms }),
  setGroupByType: (on) => set({ groupByType: on }),
  setShowSparklines: (on) => set({ showSparklines: on }),
  setKillConfirmPid: (pid) => set({ killConfirmPid: pid }),

  killProcess: (pid) =>
    set((s) => {
      const next = new Map(s.processes)
      const proc = next.get(pid)
      if (!proc) return { killConfirmPid: null }

      // Remove from parent's children
      if (proc.parentPid !== null) {
        const parent = next.get(proc.parentPid)
        if (parent) {
          next.set(proc.parentPid, {
            ...parent,
            children: parent.children.filter((c) => c !== pid),
          })
        }
      }

      // Recursively kill children
      const killRecursive = (p: number) => {
        const child = next.get(p)
        if (child) {
          child.children.forEach(killRecursive)
          next.delete(p)
        }
      }
      proc.children.forEach(killRecursive)
      next.delete(pid)

      return {
        processes: next,
        killConfirmPid: null,
        selectedPid: s.selectedPid === pid ? null : s.selectedPid,
      }
    }),

  tickProcesses: () =>
    set((s) => {
      const next = new Map<number, ProcessInfo>()
      const seeds = new Map(PROCESS_SEEDS.map((s) => [s.pid, s]))

      for (const [pid, proc] of s.processes) {
        const seed = seeds.get(pid)
        const cpuBase = seed?.cpuBase ?? proc.cpu
        const cpuRange = seed?.cpuRange ?? 5
        const memBase = seed?.memBase ?? proc.memoryRSS
        const memRange = seed?.memRange ?? 10
        const newCpu = jitter(cpuBase, cpuRange)
        const newMem = memJitter(memBase, memRange)

        next.set(pid, {
          ...proc,
          cpu: newCpu,
          memoryRSS: newMem,
          memoryHeap: newMem * (0.5 + Math.random() * 0.3),
          uptime: proc.uptime + 1,
          cpuHistory: pushHistory(proc.cpuHistory, newCpu),
          memoryHistory: pushHistory(proc.memoryHistory, newMem),
        })
      }
      return { processes: next }
    }),

  initProcesses: () => set({ processes: buildInitialProcesses() }),
}))

// ── Sparkline Component ──────────────────────────────────────────────────────

interface SparklineProps {
  data: number[]
  width: number
  height: number
  color: string
  maxVal?: number
  fillOpacity?: number
}

const Sparkline = memo(function Sparkline({
  data,
  width,
  height,
  color,
  maxVal,
  fillOpacity = 0.15,
}: SparklineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || data.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, width, height)

    const max = maxVal ?? Math.max(...data, 1)
    const step = width / (data.length - 1)

    // Fill
    ctx.beginPath()
    ctx.moveTo(0, height)
    for (let i = 0; i < data.length; i++) {
      const x = i * step
      const y = height - (data[i] / max) * (height - 2)
      if (i === 0) ctx.lineTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.lineTo(width, height)
    ctx.closePath()
    ctx.fillStyle =
      color +
      Math.round(fillOpacity * 255)
        .toString(16)
        .padStart(2, '0')
    ctx.fill()

    // Line
    ctx.beginPath()
    for (let i = 0; i < data.length; i++) {
      const x = i * step
      const y = height - (data[i] / max) * (height - 2)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }, [data, width, height, color, maxVal, fillOpacity])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="pe-sparkline-canvas"
      style={{ width, height }}
    />
  )
})

// ── CPU/Memory bar ───────────────────────────────────────────────────────────

function usageColor(pct: number): string {
  if (pct >= 80) return '#ef4444'
  if (pct >= 50) return '#eab308'
  return '#22c55e'
}

function usageTextClass(pct: number): string {
  if (pct >= 80) return 'text-red-400'
  if (pct >= 50) return 'text-yellow-400'
  return 'text-green-400'
}

interface UsageBarProps {
  value: number
  max: number
  label: string
  width?: number
}

const UsageBar = memo(function UsageBar({
  value,
  max,
  label,
  width = 60,
}: UsageBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0
  const color = usageColor(pct)

  return (
    <div className="flex items-center gap-1.5" style={{ minWidth: width }}>
      <div
        className="relative h-[6px] rounded-full overflow-hidden flex-1"
        style={{ background: 'var(--bg-tertiary, #2d2d30)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full pe-bar-grow"
          style={{ width: `${clamp(pct, 0, 100)}%`, background: color }}
        />
      </div>
      <span
        className="text-[10px] font-mono tabular-nums"
        style={{ color, minWidth: 32, textAlign: 'right' }}
      >
        {label}
      </span>
    </div>
  )
})

// ── Kill Confirmation Dialog ─────────────────────────────────────────────────

interface KillDialogProps {
  proc: ProcessInfo
  onConfirm: () => void
  onCancel: () => void
}

const KillDialog = memo(function KillDialog({
  proc,
  onConfirm,
  onCancel,
}: KillDialogProps) {
  const hasChildren = proc.children.length > 0

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onCancel}
    >
      <div
        className="rounded-lg shadow-2xl border pe-fade-in"
        style={{
          background: 'var(--bg-secondary, #252526)',
          borderColor: 'var(--border-color, #3e3e42)',
          minWidth: 380,
          maxWidth: 460,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-2 px-4 py-3 border-b"
          style={{ borderColor: 'var(--border-color, #3e3e42)' }}
        >
          <AlertTriangle size={18} className="text-yellow-400" />
          <span
            className="font-semibold text-sm"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            Kill Process
          </span>
        </div>
        <div className="px-4 py-4">
          <p
            className="text-sm mb-2"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            Are you sure you want to kill{' '}
            <span className="font-mono font-semibold">{proc.name}</span> (PID{' '}
            {proc.pid})?
          </p>
          {hasChildren && (
            <p className="text-xs text-yellow-400 mb-2">
              This process has {proc.children.length} child process
              {proc.children.length > 1 ? 'es' : ''} that will also be
              terminated.
            </p>
          )}
          <p
            className="text-xs font-mono break-all"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            {proc.commandLine}
          </p>
        </div>
        <div
          className="flex justify-end gap-2 px-4 py-3 border-t"
          style={{ borderColor: 'var(--border-color, #3e3e42)' }}
        >
          <button
            className="px-3 py-1.5 text-xs rounded border cursor-pointer transition-colors hover:brightness-110"
            style={{
              background: 'var(--bg-tertiary, #2d2d30)',
              borderColor: 'var(--border-color, #3e3e42)',
              color: 'var(--text-primary, #cccccc)',
            }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-xs rounded border cursor-pointer transition-colors hover:brightness-110"
            style={{
              background: '#dc2626',
              borderColor: '#b91c1c',
              color: '#ffffff',
            }}
            onClick={onConfirm}
          >
            Kill Process
          </button>
        </div>
      </div>
    </div>
  )
})

// ── Column Header ────────────────────────────────────────────────────────────

interface ColumnHeaderProps {
  label: string
  column: SortColumn
  currentSort: SortColumn
  direction: SortDirection
  onClick: (col: SortColumn) => void
  align?: 'left' | 'right'
  flex?: string
  minWidth?: number
}

const ColumnHeader = memo(function ColumnHeader({
  label,
  column,
  currentSort,
  direction,
  onClick,
  align = 'left',
  flex,
  minWidth,
}: ColumnHeaderProps) {
  const active = currentSort === column
  return (
    <button
      className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer hover:brightness-125 transition-colors select-none"
      style={{
        color: active
          ? 'var(--text-primary, #cccccc)'
          : 'var(--text-secondary, #858585)',
        flex: flex ?? 'none',
        minWidth,
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        background: 'transparent',
        border: 'none',
      }}
      onClick={() => onClick(column)}
    >
      {label}
      {active ? (
        direction === 'asc' ? (
          <ArrowUp size={12} />
        ) : (
          <ArrowDown size={12} />
        )
      ) : (
        <ArrowUpDown size={10} className="opacity-30" />
      )}
    </button>
  )
})

// ── Process Row ──────────────────────────────────────────────────────────────

interface ProcessRowProps {
  proc: ProcessInfo
  depth: number
  isExpanded: boolean
  hasChildren: boolean
  isSelected: boolean
  showSparklines: boolean
  onToggle: () => void
  onSelect: () => void
  onKill: () => void
}

const ProcessRow = memo(function ProcessRow({
  proc,
  depth,
  isExpanded,
  hasChildren,
  isSelected,
  showSparklines,
  onToggle,
  onSelect,
  onKill,
}: ProcessRowProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const rowRef = useRef<HTMLDivElement>(null)
  const Icon = getProcessIcon(proc.type)

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent) => {
      setTooltipPos({ x: e.clientX, y: e.clientY })
      setShowTooltip(true)
    },
    []
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setTooltipPos({ x: e.clientX, y: e.clientY })
    },
    []
  )

  const cpuColor = usageColor(proc.cpu)
  const memPct = (proc.memoryRSS / 500) * 100
  const memColor = usageColor(clamp(memPct, 0, 100))

  return (
    <>
      <div
        ref={rowRef}
        className={`flex items-center pe-row-hover ${isSelected ? 'pe-row-selected' : ''}`}
        style={{
          height: 28,
          borderBottom: '1px solid var(--border-color, #3e3e420a)',
          cursor: 'default',
        }}
        onClick={onSelect}
        onDoubleClick={hasChildren ? onToggle : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Name */}
        <div
          className="flex items-center gap-1 px-2 flex-1 min-w-0"
          style={{ paddingLeft: 8 + depth * 16 }}
        >
          {hasChildren ? (
            <button
              className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10 transition-colors"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                onToggle()
              }}
            >
              {isExpanded ? (
                <ChevronDown size={12} style={{ color: 'var(--text-secondary, #858585)' }} />
              ) : (
                <ChevronRight size={12} style={{ color: 'var(--text-secondary, #858585)' }} />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <Icon
            size={14}
            style={{ color: 'var(--accent-primary, #007acc)', flexShrink: 0 }}
          />
          <span
            className="truncate text-xs"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            {proc.name}
          </span>
          {proc.status === 'sleeping' && (
            <span
              className="text-[9px] px-1 rounded"
              style={{
                background: 'var(--bg-tertiary, #2d2d30)',
                color: 'var(--text-secondary, #858585)',
              }}
            >
              sleeping
            </span>
          )}
        </div>

        {/* PID */}
        <div
          className="text-xs font-mono tabular-nums text-right px-2"
          style={{ width: 64, color: 'var(--text-secondary, #858585)' }}
        >
          {proc.pid}
        </div>

        {/* Type */}
        <div
          className="text-[11px] px-2 truncate"
          style={{
            width: 120,
            color: 'var(--text-secondary, #858585)',
          }}
        >
          {PROCESS_TYPE_LABELS[proc.type]}
        </div>

        {/* CPU */}
        <div className="flex items-center gap-1 px-2" style={{ width: showSparklines ? 160 : 80 }}>
          {showSparklines && (
            <Sparkline
              data={proc.cpuHistory}
              width={60}
              height={18}
              color={cpuColor}
              maxVal={100}
            />
          )}
          <span
            className={`text-xs font-mono tabular-nums ${usageTextClass(proc.cpu)}`}
            style={{ minWidth: 40, textAlign: 'right' }}
          >
            {proc.cpu.toFixed(1)}%
          </span>
        </div>

        {/* Memory */}
        <div className="flex items-center gap-1 px-2" style={{ width: showSparklines ? 180 : 90 }}>
          {showSparklines && (
            <Sparkline
              data={proc.memoryHistory}
              width={60}
              height={18}
              color={memColor}
              maxVal={500}
            />
          )}
          <span
            className="text-xs font-mono tabular-nums"
            style={{
              color: memColor,
              minWidth: 55,
              textAlign: 'right',
            }}
          >
            {formatBytes(proc.memoryRSS)}
          </span>
        </div>

        {/* Uptime */}
        <div
          className="text-xs font-mono tabular-nums text-right px-2"
          style={{ width: 72, color: 'var(--text-secondary, #858585)' }}
        >
          {formatUptime(proc.uptime)}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 px-2" style={{ width: 40 }}>
          <button
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-red-500/20 transition-colors"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Kill process"
            onClick={(e) => {
              e.stopPropagation()
              onKill()
            }}
          >
            <X size={12} className="text-red-400 opacity-50 hover:opacity-100" />
          </button>
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="fixed z-[9999] pe-tooltip px-3 py-2 rounded shadow-lg border pe-fade-in"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y + 12,
            background: 'var(--bg-primary, #1e1e1e)',
            borderColor: 'var(--border-color, #3e3e42)',
            color: 'var(--text-primary, #cccccc)',
            fontSize: 11,
          }}
        >
          <div className="font-semibold mb-1">{proc.name}</div>
          <div style={{ color: 'var(--text-secondary, #858585)' }}>
            PID: {proc.pid} | Type: {PROCESS_TYPE_LABELS[proc.type]}
          </div>
          <div style={{ color: 'var(--text-secondary, #858585)' }}>
            CPU: {proc.cpu.toFixed(1)}% | RSS: {formatBytes(proc.memoryRSS)} |
            Heap: {formatBytes(proc.memoryHeap)}
          </div>
          <div style={{ color: 'var(--text-secondary, #858585)' }}>
            Uptime: {formatUptime(proc.uptime)}
          </div>
          <div
            className="mt-1 font-mono text-[10px] break-all"
            style={{ color: 'var(--text-secondary, #858585)', maxWidth: 420 }}
          >
            $ {proc.commandLine}
          </div>
        </div>
      )}
    </>
  )
})

// ── Group Header Row ─────────────────────────────────────────────────────────

interface GroupHeaderProps {
  type: ProcessType
  count: number
  totalCpu: number
  totalMem: number
  isExpanded: boolean
  onToggle: () => void
}

const GroupHeader = memo(function GroupHeader({
  type,
  count,
  totalCpu,
  totalMem,
  isExpanded,
  onToggle,
}: GroupHeaderProps) {
  const Icon = getProcessIcon(type)

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 cursor-pointer pe-row-hover"
      style={{
        background: 'var(--bg-tertiary, #2d2d30)',
        borderBottom: '1px solid var(--border-color, #3e3e42)',
      }}
      onClick={onToggle}
    >
      {isExpanded ? (
        <ChevronDown size={12} style={{ color: 'var(--text-secondary, #858585)' }} />
      ) : (
        <ChevronRight size={12} style={{ color: 'var(--text-secondary, #858585)' }} />
      )}
      <Icon size={14} style={{ color: 'var(--accent-primary, #007acc)' }} />
      <span
        className="text-xs font-semibold"
        style={{ color: 'var(--text-primary, #cccccc)' }}
      >
        {PROCESS_TYPE_LABELS[type]}
      </span>
      <span
        className="text-[10px] px-1.5 rounded-full"
        style={{
          background: 'var(--bg-secondary, #252526)',
          color: 'var(--text-secondary, #858585)',
        }}
      >
        {count}
      </span>
      <div className="flex-1" />
      <span
        className={`text-[10px] font-mono tabular-nums ${usageTextClass(totalCpu)}`}
      >
        {totalCpu.toFixed(1)}% CPU
      </span>
      <span
        className="text-[10px] font-mono tabular-nums"
        style={{ color: 'var(--text-secondary, #858585)' }}
      >
        {formatBytes(totalMem)}
      </span>
    </div>
  )
})

// ── Summary Bar ──────────────────────────────────────────────────────────────

interface SummaryBarProps {
  processes: ProcessInfo[]
}

const SummaryBar = memo(function SummaryBar({ processes }: SummaryBarProps) {
  const totalCpu = processes.reduce((s, p) => s + p.cpu, 0)
  const totalMem = processes.reduce((s, p) => s + p.memoryRSS, 0)
  const totalHeap = processes.reduce((s, p) => s + p.memoryHeap, 0)
  const processCount = processes.length

  const avgCpu = processCount > 0 ? totalCpu / processCount : 0
  const maxCpu = processCount > 0 ? Math.max(...processes.map((p) => p.cpu)) : 0
  const maxMem = processCount > 0 ? Math.max(...processes.map((p) => p.memoryRSS)) : 0

  const topCpuProc = processes.reduce(
    (top, p) => (p.cpu > (top?.cpu ?? 0) ? p : top),
    processes[0]
  )
  const topMemProc = processes.reduce(
    (top, p) => (p.memoryRSS > (top?.memoryRSS ?? 0) ? p : top),
    processes[0]
  )

  return (
    <div
      className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 border-b"
      style={{
        background: 'var(--bg-secondary, #252526)',
        borderColor: 'var(--border-color, #3e3e42)',
      }}
    >
      {/* Process count */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md"
          style={{ background: 'var(--bg-tertiary, #2d2d30)' }}
        >
          <Layers size={14} style={{ color: 'var(--accent-primary, #007acc)' }} />
        </div>
        <div>
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Processes
          </div>
          <div
            className="text-sm font-semibold font-mono tabular-nums"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            {processCount}
          </div>
        </div>
      </div>

      {/* Total CPU */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md"
          style={{ background: 'var(--bg-tertiary, #2d2d30)' }}
        >
          <Cpu size={14} style={{ color: usageColor(avgCpu) }} />
        </div>
        <div>
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Total CPU
          </div>
          <div
            className={`text-sm font-semibold font-mono tabular-nums ${usageTextClass(avgCpu)}`}
          >
            {totalCpu.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Total Memory */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md"
          style={{ background: 'var(--bg-tertiary, #2d2d30)' }}
        >
          <HardDrive size={14} style={{ color: 'var(--accent-primary, #007acc)' }} />
        </div>
        <div>
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Total Memory
          </div>
          <div
            className="text-sm font-semibold font-mono tabular-nums"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            {formatBytes(totalMem)}
          </div>
        </div>
      </div>

      {/* Heap */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center w-7 h-7 rounded-md"
          style={{ background: 'var(--bg-tertiary, #2d2d30)' }}
        >
          <Activity size={14} style={{ color: '#a78bfa' }} />
        </div>
        <div>
          <div
            className="text-[10px] uppercase tracking-wider"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Heap Usage
          </div>
          <div
            className="text-sm font-semibold font-mono tabular-nums"
            style={{ color: '#a78bfa' }}
          >
            {formatBytes(totalHeap)}
          </div>
        </div>
      </div>

      {/* Top CPU consumer */}
      {topCpuProc && (
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md"
            style={{ background: 'var(--bg-tertiary, #2d2d30)' }}
          >
            <Zap size={14} className="text-yellow-400" />
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--text-secondary, #858585)' }}
            >
              Top CPU
            </div>
            <div
              className="text-xs font-mono tabular-nums truncate"
              style={{
                color: 'var(--text-primary, #cccccc)',
                maxWidth: 140,
              }}
            >
              {topCpuProc.name} ({topCpuProc.cpu.toFixed(1)}%)
            </div>
          </div>
        </div>
      )}

      {/* Top Memory consumer */}
      {topMemProc && (
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-md"
            style={{ background: 'var(--bg-tertiary, #2d2d30)' }}
          >
            <AlertTriangle size={14} className="text-orange-400" />
          </div>
          <div>
            <div
              className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--text-secondary, #858585)' }}
            >
              Top Memory
            </div>
            <div
              className="text-xs font-mono tabular-nums truncate"
              style={{
                color: 'var(--text-primary, #cccccc)',
                maxWidth: 140,
              }}
            >
              {topMemProc.name} ({formatBytes(topMemProc.memoryRSS)})
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// ── Settings Popover ─────────────────────────────────────────────────────────

interface SettingsPopoverProps {
  autoRefresh: boolean
  refreshInterval: number
  groupByType: boolean
  showSparklines: boolean
  onToggleAutoRefresh: () => void
  onSetInterval: (ms: number) => void
  onToggleGroupByType: () => void
  onToggleSparklines: () => void
  onClose: () => void
}

const SettingsPopover = memo(function SettingsPopover({
  autoRefresh,
  refreshInterval,
  groupByType,
  showSparklines,
  onToggleAutoRefresh,
  onSetInterval,
  onToggleGroupByType,
  onToggleSparklines,
  onClose,
}: SettingsPopoverProps) {
  const intervals = [
    { label: '500ms', value: 500 },
    { label: '1s', value: 1000 },
    { label: '2s', value: 2000 },
    { label: '5s', value: 5000 },
  ]

  return (
    <div
      className="absolute right-0 top-full mt-1 z-[999] rounded-lg shadow-2xl border pe-fade-in"
      style={{
        background: 'var(--bg-secondary, #252526)',
        borderColor: 'var(--border-color, #3e3e42)',
        minWidth: 240,
      }}
    >
      <div
        className="px-3 py-2 border-b text-xs font-semibold"
        style={{
          borderColor: 'var(--border-color, #3e3e42)',
          color: 'var(--text-primary, #cccccc)',
        }}
      >
        Settings
      </div>

      <div className="px-3 py-2 flex flex-col gap-2">
        {/* Auto refresh toggle */}
        <label className="flex items-center justify-between cursor-pointer">
          <span
            className="text-xs"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            Auto Refresh
          </span>
          <button
            className="relative w-8 h-4 rounded-full transition-colors"
            style={{
              background: autoRefresh
                ? 'var(--accent-primary, #007acc)'
                : 'var(--bg-tertiary, #2d2d30)',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={onToggleAutoRefresh}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full transition-transform bg-white"
              style={{
                left: autoRefresh ? 17 : 2,
              }}
            />
          </button>
        </label>

        {/* Refresh interval */}
        {autoRefresh && (
          <div>
            <div
              className="text-[10px] mb-1"
              style={{ color: 'var(--text-secondary, #858585)' }}
            >
              Refresh Interval
            </div>
            <div className="flex gap-1">
              {intervals.map(({ label, value }) => (
                <button
                  key={value}
                  className="px-2 py-0.5 text-[10px] rounded border transition-colors cursor-pointer"
                  style={{
                    background:
                      refreshInterval === value
                        ? 'var(--accent-primary, #007acc)'
                        : 'var(--bg-tertiary, #2d2d30)',
                    borderColor:
                      refreshInterval === value
                        ? 'var(--accent-primary, #007acc)'
                        : 'var(--border-color, #3e3e42)',
                    color:
                      refreshInterval === value
                        ? '#ffffff'
                        : 'var(--text-secondary, #858585)',
                  }}
                  onClick={() => onSetInterval(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Group by type */}
        <label className="flex items-center justify-between cursor-pointer">
          <span
            className="text-xs"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            Group by Type
          </span>
          <button
            className="relative w-8 h-4 rounded-full transition-colors"
            style={{
              background: groupByType
                ? 'var(--accent-primary, #007acc)'
                : 'var(--bg-tertiary, #2d2d30)',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={onToggleGroupByType}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full transition-transform bg-white"
              style={{
                left: groupByType ? 17 : 2,
              }}
            />
          </button>
        </label>

        {/* Show sparklines */}
        <label className="flex items-center justify-between cursor-pointer">
          <span
            className="text-xs"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            Show Sparklines
          </span>
          <button
            className="relative w-8 h-4 rounded-full transition-colors"
            style={{
              background: showSparklines
                ? 'var(--accent-primary, #007acc)'
                : 'var(--bg-tertiary, #2d2d30)',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={onToggleSparklines}
          >
            <div
              className="absolute top-0.5 w-3 h-3 rounded-full transition-transform bg-white"
              style={{
                left: showSparklines ? 17 : 2,
              }}
            />
          </button>
        </label>
      </div>
    </div>
  )
})

// ── Process Detail Panel ─────────────────────────────────────────────────────

interface ProcessDetailPanelProps {
  proc: ProcessInfo
  onClose: () => void
}

const ProcessDetailPanel = memo(function ProcessDetailPanel({
  proc,
  onClose,
}: ProcessDetailPanelProps) {
  const Icon = getProcessIcon(proc.type)
  const cpuColor = usageColor(proc.cpu)
  const memPct = clamp((proc.memoryRSS / 500) * 100, 0, 100)
  const memColor = usageColor(memPct)

  return (
    <div
      className="border-t pe-fade-in"
      style={{
        background: 'var(--bg-secondary, #252526)',
        borderColor: 'var(--border-color, #3e3e42)',
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: 'var(--border-color, #3e3e42)' }}
      >
        <div className="flex items-center gap-2">
          <Icon size={14} style={{ color: 'var(--accent-primary, #007acc)' }} />
          <span
            className="text-xs font-semibold"
            style={{ color: 'var(--text-primary, #cccccc)' }}
          >
            {proc.name}
          </span>
          <span
            className="text-[10px] font-mono"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            PID {proc.pid}
          </span>
        </div>
        <button
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-white/10 transition-colors"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={onClose}
        >
          <X size={12} style={{ color: 'var(--text-secondary, #858585)' }} />
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 py-3">
        {/* CPU section */}
        <div>
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            CPU Usage
          </div>
          <div className={`text-lg font-semibold font-mono tabular-nums ${usageTextClass(proc.cpu)}`}>
            {proc.cpu.toFixed(1)}%
          </div>
          <UsageBar value={proc.cpu} max={100} label={`${proc.cpu.toFixed(0)}%`} width={120} />
          <div className="mt-2">
            <Sparkline
              data={proc.cpuHistory}
              width={140}
              height={32}
              color={cpuColor}
              maxVal={100}
            />
          </div>
        </div>

        {/* Memory section */}
        <div>
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Memory (RSS)
          </div>
          <div
            className="text-lg font-semibold font-mono tabular-nums"
            style={{ color: memColor }}
          >
            {formatBytes(proc.memoryRSS)}
          </div>
          <div
            className="text-[10px] font-mono"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Heap: {formatBytes(proc.memoryHeap)}
          </div>
          <div className="mt-2">
            <Sparkline
              data={proc.memoryHistory}
              width={140}
              height={32}
              color={memColor}
              maxVal={500}
            />
          </div>
        </div>

        {/* Info section */}
        <div>
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Process Info
          </div>
          <div className="space-y-1">
            <DetailRow label="Type" value={PROCESS_TYPE_LABELS[proc.type]} />
            <DetailRow label="Status" value={proc.status} />
            <DetailRow label="Uptime" value={formatUptime(proc.uptime)} />
            <DetailRow
              label="Parent PID"
              value={proc.parentPid !== null ? String(proc.parentPid) : 'None'}
            />
            <DetailRow label="Children" value={String(proc.children.length)} />
          </div>
        </div>

        {/* Command line section */}
        <div>
          <div
            className="text-[10px] uppercase tracking-wider mb-1"
            style={{ color: 'var(--text-secondary, #858585)' }}
          >
            Command Line
          </div>
          <div
            className="text-[10px] font-mono break-all pe-scrollbar overflow-y-auto"
            style={{
              color: 'var(--text-secondary, #858585)',
              maxHeight: 80,
              lineHeight: '1.5',
            }}
          >
            {proc.commandLine}
          </div>
          <button
            className="flex items-center gap-1 mt-1 text-[10px] hover:underline"
            style={{
              color: 'var(--accent-primary, #007acc)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            onClick={() => {
              navigator.clipboard?.writeText(proc.commandLine)
            }}
          >
            <Copy size={10} />
            Copy command line
          </button>
        </div>
      </div>
    </div>
  )
})

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[10px]"
        style={{ color: 'var(--text-secondary, #858585)', minWidth: 65 }}
      >
        {label}:
      </span>
      <span
        className="text-[10px] font-mono"
        style={{ color: 'var(--text-primary, #cccccc)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Expanded Process Row with Command Line ───────────────────────────────────

interface ExpandedCommandRowProps {
  proc: ProcessInfo
  depth: number
}

const ExpandedCommandRow = memo(function ExpandedCommandRow({
  proc,
  depth,
}: ExpandedCommandRowProps) {
  return (
    <div
      className="flex items-center px-2 pe-fade-in"
      style={{
        height: 22,
        paddingLeft: 8 + depth * 16 + 20,
        background: 'rgba(255, 255, 255, 0.02)',
        borderBottom: '1px solid var(--border-color, #3e3e420a)',
      }}
    >
      <span
        className="text-[10px] font-mono truncate"
        style={{ color: 'var(--text-secondary, #858585)' }}
        title={proc.commandLine}
      >
        $ {proc.commandLine}
      </span>
    </div>
  )
})

// ── Main Component ───────────────────────────────────────────────────────────

function ProcessExplorer() {
  const {
    processes,
    selectedPid,
    expandedPids,
    searchQuery,
    sortColumn,
    sortDirection,
    autoRefresh,
    refreshInterval,
    groupByType,
    showSparklines,
    killConfirmPid,
    setSelectedPid,
    toggleExpanded,
    setSearchQuery,
    setSortColumn,
    setAutoRefresh,
    setRefreshInterval,
    setGroupByType,
    setShowSparklines,
    setKillConfirmPid,
    killProcess,
    tickProcesses,
    initProcesses,
  } = useProcessExplorerStore()

  const [showSettings, setShowSettings] = useState(false)
  const [expandedCommandPids, setExpandedCommandPids] = useState<Set<number>>(
    new Set()
  )
  const settingsRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)

  // Inject styles
  useEffect(() => {
    if (!styleRef.current) {
      const style = document.createElement('style')
      style.textContent = INJECTED_STYLES
      document.head.appendChild(style)
      styleRef.current = style
    }
    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current)
        styleRef.current = null
      }
    }
  }, [])

  // Init processes
  useEffect(() => {
    initProcesses()
  }, [initProcesses])

  // Auto-refresh tick
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(tickProcesses, refreshInterval)
    return () => clearInterval(id)
  }, [autoRefresh, refreshInterval, tickProcesses])

  // Close settings on outside click
  useEffect(() => {
    if (!showSettings) return
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+F to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      // Escape to clear search or close settings
      if (e.key === 'Escape') {
        if (showSettings) setShowSettings(false)
        else if (searchQuery) setSearchQuery('')
        else if (selectedPid !== null) setSelectedPid(null)
      }
      // Delete to kill selected
      if (e.key === 'Delete' && selectedPid !== null) {
        setKillConfirmPid(selectedPid)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [
    searchQuery,
    selectedPid,
    showSettings,
    setSearchQuery,
    setSelectedPid,
    setKillConfirmPid,
  ])

  // Get process list as array
  const processList = useMemo(() => {
    return Array.from(processes.values())
  }, [processes])

  // Filter processes
  const filteredProcesses = useMemo(() => {
    if (!searchQuery.trim()) return processList
    const q = searchQuery.toLowerCase()
    return processList.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        p.commandLine.toLowerCase().includes(q) ||
        PROCESS_TYPE_LABELS[p.type].toLowerCase().includes(q)
    )
  }, [processList, searchQuery])

  // Sort processes
  const sortedProcesses = useMemo(() => {
    const sorted = [...filteredProcesses]
    const dir = sortDirection === 'asc' ? 1 : -1

    sorted.sort((a, b) => {
      switch (sortColumn) {
        case 'name':
          return dir * a.name.localeCompare(b.name)
        case 'pid':
          return dir * (a.pid - b.pid)
        case 'type':
          return dir * a.type.localeCompare(b.type)
        case 'cpu':
          return dir * (a.cpu - b.cpu)
        case 'memory':
          return dir * (a.memoryRSS - b.memoryRSS)
        case 'uptime':
          return dir * (a.uptime - b.uptime)
        default:
          return 0
      }
    })
    return sorted
  }, [filteredProcesses, sortColumn, sortDirection])

  // Build tree rows for tree view (non-grouped)
  const buildTreeRows = useCallback(
    (
      parentPid: number | null,
      depth: number,
      available: Set<number>
    ): { proc: ProcessInfo; depth: number }[] => {
      const rows: { proc: ProcessInfo; depth: number }[] = []
      const children = sortedProcesses.filter(
        (p) => p.parentPid === parentPid && available.has(p.pid)
      )

      for (const child of children) {
        rows.push({ proc: child, depth })
        if (expandedPids.has(child.pid) && child.children.length > 0) {
          rows.push(...buildTreeRows(child.pid, depth + 1, available))
        }
      }
      return rows
    },
    [sortedProcesses, expandedPids]
  )

  // Grouped view data
  const groupedData = useMemo(() => {
    if (!groupByType) return null

    const groups = new Map<
      ProcessType,
      { procs: ProcessInfo[]; totalCpu: number; totalMem: number }
    >()

    for (const proc of sortedProcesses) {
      if (!groups.has(proc.type)) {
        groups.set(proc.type, { procs: [], totalCpu: 0, totalMem: 0 })
      }
      const g = groups.get(proc.type)!
      g.procs.push(proc)
      g.totalCpu += proc.cpu
      g.totalMem += proc.memoryRSS
    }

    return PROCESS_TYPE_ORDER
      .filter((t) => groups.has(t))
      .map((t) => ({
        type: t,
        ...groups.get(t)!,
      }))
  }, [sortedProcesses, groupByType])

  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Set<ProcessType>>(
    new Set(PROCESS_TYPE_ORDER)
  )

  const toggleGroup = useCallback((type: ProcessType) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  // Tree rows for non-grouped view
  const treeRows = useMemo(() => {
    if (groupByType) return []
    const available = new Set(sortedProcesses.map((p) => p.pid))
    // If searching, show flat list
    if (searchQuery.trim()) {
      return sortedProcesses.map((p) => ({ proc: p, depth: 0 }))
    }
    return buildTreeRows(null, 0, available)
  }, [groupByType, sortedProcesses, searchQuery, buildTreeRows])

  // Selected process
  const selectedProcess = useMemo(() => {
    if (selectedPid === null) return null
    return processes.get(selectedPid) ?? null
  }, [processes, selectedPid])

  // Kill confirm process
  const killConfirmProcess = useMemo(() => {
    if (killConfirmPid === null) return null
    return processes.get(killConfirmPid) ?? null
  }, [processes, killConfirmPid])

  const handleManualRefresh = useCallback(() => {
    tickProcesses()
  }, [tickProcesses])

  const toggleCommandExpand = useCallback((pid: number) => {
    setExpandedCommandPids((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: 'var(--bg-primary, #1e1e1e)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-2 border-b"
        style={{
          background: 'var(--bg-secondary, #252526)',
          borderColor: 'var(--border-color, #3e3e42)',
        }}
      >
        <Activity size={16} style={{ color: 'var(--accent-primary, #007acc)' }} />
        <span
          className="text-sm font-semibold"
          style={{ color: 'var(--text-primary, #cccccc)' }}
        >
          Process Explorer
        </span>
        <span
          className="text-[10px] font-mono"
          style={{ color: 'var(--text-secondary, #858585)' }}
        >
          Orion IDE
        </span>

        <div className="flex-1" />

        {/* Search */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded border"
          style={{
            background: 'var(--bg-primary, #1e1e1e)',
            borderColor: 'var(--border-color, #3e3e42)',
            width: 220,
          }}
        >
          <Search size={12} style={{ color: 'var(--text-secondary, #858585)' }} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Filter processes... (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs outline-none"
            style={{
              color: 'var(--text-primary, #cccccc)',
              border: 'none',
            }}
          />
          {searchQuery && (
            <button
              className="flex items-center justify-center w-4 h-4 rounded hover:bg-white/10"
              style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              onClick={() => setSearchQuery('')}
            >
              <X size={10} style={{ color: 'var(--text-secondary, #858585)' }} />
            </button>
          )}
        </div>

        {/* Auto-refresh indicator */}
        <div className="flex items-center gap-1">
          {autoRefresh && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 pe-pulse" />
              <span
                className="text-[10px] font-mono"
                style={{ color: 'var(--text-secondary, #858585)' }}
              >
                {refreshInterval >= 1000
                  ? `${refreshInterval / 1000}s`
                  : `${refreshInterval}ms`}
              </span>
            </div>
          )}
        </div>

        {/* Manual refresh */}
        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/10 transition-colors"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          title="Refresh now"
          onClick={handleManualRefresh}
        >
          <RefreshCw size={14} style={{ color: 'var(--text-secondary, #858585)' }} />
        </button>

        {/* Auto-refresh toggle */}
        <button
          className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/10 transition-colors"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          title={autoRefresh ? 'Pause auto-refresh' : 'Resume auto-refresh'}
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          {autoRefresh ? (
            <Pause size={14} style={{ color: 'var(--accent-primary, #007acc)' }} />
          ) : (
            <Play size={14} style={{ color: 'var(--text-secondary, #858585)' }} />
          )}
        </button>

        {/* Settings */}
        <div className="relative" ref={settingsRef}>
          <button
            className="flex items-center justify-center w-7 h-7 rounded hover:bg-white/10 transition-colors"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            title="Settings"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings
              size={14}
              style={{
                color: showSettings
                  ? 'var(--accent-primary, #007acc)'
                  : 'var(--text-secondary, #858585)',
              }}
            />
          </button>
          {showSettings && (
            <SettingsPopover
              autoRefresh={autoRefresh}
              refreshInterval={refreshInterval}
              groupByType={groupByType}
              showSparklines={showSparklines}
              onToggleAutoRefresh={() => setAutoRefresh(!autoRefresh)}
              onSetInterval={setRefreshInterval}
              onToggleGroupByType={() => setGroupByType(!groupByType)}
              onToggleSparklines={() => setShowSparklines(!showSparklines)}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>

      {/* Summary Bar */}
      <SummaryBar processes={processList} />

      {/* Column Headers */}
      <div
        className="flex items-center border-b"
        style={{
          background: 'var(--bg-tertiary, #2d2d30)',
          borderColor: 'var(--border-color, #3e3e42)',
        }}
      >
        <ColumnHeader
          label="Process"
          column="name"
          currentSort={sortColumn}
          direction={sortDirection}
          onClick={setSortColumn}
          flex="1"
          minWidth={180}
        />
        <ColumnHeader
          label="PID"
          column="pid"
          currentSort={sortColumn}
          direction={sortDirection}
          onClick={setSortColumn}
          align="right"
          minWidth={64}
        />
        <ColumnHeader
          label="Type"
          column="type"
          currentSort={sortColumn}
          direction={sortDirection}
          onClick={setSortColumn}
          minWidth={120}
        />
        <ColumnHeader
          label="CPU"
          column="cpu"
          currentSort={sortColumn}
          direction={sortDirection}
          onClick={setSortColumn}
          align="right"
          minWidth={showSparklines ? 160 : 80}
        />
        <ColumnHeader
          label="Memory"
          column="memory"
          currentSort={sortColumn}
          direction={sortDirection}
          onClick={setSortColumn}
          align="right"
          minWidth={showSparklines ? 180 : 90}
        />
        <ColumnHeader
          label="Uptime"
          column="uptime"
          currentSort={sortColumn}
          direction={sortDirection}
          onClick={setSortColumn}
          align="right"
          minWidth={72}
        />
        {/* Kill column placeholder */}
        <div style={{ width: 40 }} />
      </div>

      {/* Process List */}
      <div
        ref={listContainerRef}
        className="flex-1 overflow-auto pe-scrollbar"
        style={{ background: 'var(--bg-primary, #1e1e1e)' }}
      >
        {/* Empty state */}
        {sortedProcesses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Search
              size={32}
              style={{ color: 'var(--text-secondary, #858585)', opacity: 0.4 }}
            />
            <span
              className="text-sm"
              style={{ color: 'var(--text-secondary, #858585)' }}
            >
              No processes match "{searchQuery}"
            </span>
            <button
              className="text-xs hover:underline"
              style={{
                color: 'var(--accent-primary, #007acc)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => setSearchQuery('')}
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Grouped view */}
        {groupByType && groupedData && (
          <div>
            {groupedData.map(({ type, procs, totalCpu, totalMem }) => (
              <div key={type}>
                <GroupHeader
                  type={type}
                  count={procs.length}
                  totalCpu={totalCpu}
                  totalMem={totalMem}
                  isExpanded={expandedGroups.has(type)}
                  onToggle={() => toggleGroup(type)}
                />
                {expandedGroups.has(type) &&
                  procs.map((proc) => (
                    <React.Fragment key={proc.pid}>
                      <ProcessRow
                        proc={proc}
                        depth={0}
                        isExpanded={expandedCommandPids.has(proc.pid)}
                        hasChildren={proc.children.length > 0}
                        isSelected={selectedPid === proc.pid}
                        showSparklines={showSparklines}
                        onToggle={() => toggleCommandExpand(proc.pid)}
                        onSelect={() =>
                          setSelectedPid(
                            selectedPid === proc.pid ? null : proc.pid
                          )
                        }
                        onKill={() => setKillConfirmPid(proc.pid)}
                      />
                      {expandedCommandPids.has(proc.pid) && (
                        <ExpandedCommandRow proc={proc} depth={0} />
                      )}
                    </React.Fragment>
                  ))}
              </div>
            ))}
          </div>
        )}

        {/* Tree view */}
        {!groupByType && (
          <div>
            {treeRows.map(({ proc, depth }) => (
              <React.Fragment key={proc.pid}>
                <ProcessRow
                  proc={proc}
                  depth={depth}
                  isExpanded={expandedPids.has(proc.pid)}
                  hasChildren={proc.children.length > 0}
                  isSelected={selectedPid === proc.pid}
                  showSparklines={showSparklines}
                  onToggle={() => toggleExpanded(proc.pid)}
                  onSelect={() =>
                    setSelectedPid(
                      selectedPid === proc.pid ? null : proc.pid
                    )
                  }
                  onKill={() => setKillConfirmPid(proc.pid)}
                />
                {expandedPids.has(proc.pid) &&
                  proc.children.length === 0 && (
                    <ExpandedCommandRow proc={proc} depth={depth} />
                  )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedProcess && (
        <ProcessDetailPanel
          proc={selectedProcess}
          onClose={() => setSelectedPid(null)}
        />
      )}

      {/* Status Bar */}
      <div
        className="flex items-center justify-between px-4 py-1 border-t text-[10px]"
        style={{
          background: 'var(--bg-secondary, #252526)',
          borderColor: 'var(--border-color, #3e3e42)',
          color: 'var(--text-secondary, #858585)',
        }}
      >
        <div className="flex items-center gap-3">
          <span>
            {filteredProcesses.length} of {processList.length} processes
          </span>
          {searchQuery && (
            <span className="font-mono">
              Filter: "{searchQuery}"
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono tabular-nums">
            CPU:{' '}
            <span className={usageTextClass(processList.reduce((s, p) => s + p.cpu, 0) / Math.max(processList.length, 1))}>
              {processList.reduce((s, p) => s + p.cpu, 0).toFixed(1)}%
            </span>
          </span>
          <span className="font-mono tabular-nums">
            Mem: {formatBytes(processList.reduce((s, p) => s + p.memoryRSS, 0))}
          </span>
          <span>
            {autoRefresh ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
          </span>
          <span>
            {groupByType ? 'Grouped' : 'Tree'} view
          </span>
        </div>
      </div>

      {/* Kill Confirmation Dialog */}
      {killConfirmProcess && (
        <KillDialog
          proc={killConfirmProcess}
          onConfirm={() => killProcess(killConfirmPid!)}
          onCancel={() => setKillConfirmPid(null)}
        />
      )}
    </div>
  )
}

export default ProcessExplorer
