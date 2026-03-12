import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  Play,
  Square,
  Clock,
  Flame,
  BarChart3,
  MemoryStick,
  ZoomIn,
  ZoomOut,
  Download,
  Search,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
  Trash2,
  RotateCw,
  Filter,
  ArrowUpDown,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────── */

interface FlameNode {
  name: string
  selfTime: number
  totalTime: number
  invocations: number
  depth: number
  startOffset: number
  width: number
  color: string
  children: FlameNode[]
  isHotPath?: boolean
}

interface CallTreeRow {
  name: string
  selfTime: number
  totalTime: number
  invocations: number
  children: CallTreeRow[]
  isHotPath?: boolean
}

interface MemorySnapshot {
  time: number
  heapUsed: number
  heapTotal: number
  gcEvent?: boolean
}

interface TimelineSample {
  time: number
  cpu: number
  memory: number
}

interface SummaryStats {
  totalTime: number
  idleTime: number
  scriptingTime: number
  renderingTime: number
  paintingTime: number
}

type ProfilerTab = 'flame' | 'calltree' | 'memory'
type SortField = 'name' | 'selfTime' | 'totalTime' | 'invocations'
type SortDir = 'asc' | 'desc'

/* ── Demo data generators ──────────────────────────────────────── */

const FLAME_COLORS = [
  '#e25041', '#e8724a', '#f0a051', '#f7d94e',
  '#7ec863', '#4eaff7', '#9b6ef0', '#e06ebd',
]
const HOT_COLOR = '#ff2020'

function generateFlameData(): FlameNode[] {
  const root: FlameNode = {
    name: '(root)', selfTime: 2, totalTime: 1820, invocations: 1,
    depth: 0, startOffset: 0, width: 100, color: FLAME_COLORS[5],
    children: [],
  }
  const main: FlameNode = {
    name: 'main()', selfTime: 5, totalTime: 1810, invocations: 1,
    depth: 1, startOffset: 0, width: 99.5, color: FLAME_COLORS[4],
    children: [], isHotPath: true,
  }
  const renderApp: FlameNode = {
    name: 'renderApp()', selfTime: 12, totalTime: 980, invocations: 60,
    depth: 2, startOffset: 0, width: 53.8, color: FLAME_COLORS[2],
    children: [], isHotPath: true,
  }
  const reconcile: FlameNode = {
    name: 'reconcileChildren()', selfTime: 45, totalTime: 620, invocations: 180,
    depth: 3, startOffset: 0, width: 34.1, color: FLAME_COLORS[0],
    children: [], isHotPath: true,
  }
  const diffProps: FlameNode = {
    name: 'diffProps()', selfTime: 180, totalTime: 320, invocations: 540,
    depth: 4, startOffset: 0, width: 17.6, color: FLAME_COLORS[0],
    children: [], isHotPath: true,
  }
  const commitWork: FlameNode = {
    name: 'commitWork()', selfTime: 95, totalTime: 250, invocations: 60,
    depth: 4, startOffset: 17.6, width: 13.7, color: FLAME_COLORS[1],
    children: [],
  }
  const layoutEffects: FlameNode = {
    name: 'runLayoutEffects()', selfTime: 55, totalTime: 140, invocations: 60,
    depth: 5, startOffset: 0, width: 7.7, color: FLAME_COLORS[3],
    children: [],
  }
  const passiveEffects: FlameNode = {
    name: 'flushPassiveEffects()', selfTime: 120, totalTime: 190, invocations: 60,
    depth: 3, startOffset: 34.1, width: 10.4, color: FLAME_COLORS[6],
    children: [],
  }
  const processData: FlameNode = {
    name: 'processData()', selfTime: 8, totalTime: 740, invocations: 12,
    depth: 2, startOffset: 53.8, width: 40.7, color: FLAME_COLORS[1],
    children: [],
  }
  const parseJSON: FlameNode = {
    name: 'JSON.parse()', selfTime: 210, totalTime: 210, invocations: 48,
    depth: 3, startOffset: 53.8, width: 11.5, color: FLAME_COLORS[7],
    children: [],
  }
  const transformRows: FlameNode = {
    name: 'transformRows()', selfTime: 290, totalTime: 420, invocations: 48,
    depth: 3, startOffset: 65.3, width: 23.1, color: FLAME_COLORS[0],
    children: [],
  }
  const sortData: FlameNode = {
    name: 'Array.sort()', selfTime: 130, totalTime: 130, invocations: 48,
    depth: 4, startOffset: 65.3, width: 7.1, color: FLAME_COLORS[3],
    children: [],
  }
  const idle: FlameNode = {
    name: '(idle)', selfTime: 90, totalTime: 90, invocations: 1,
    depth: 2, startOffset: 94.5, width: 5.0, color: '#555',
    children: [],
  }

  transformRows.children = [sortData]
  processData.children = [parseJSON, transformRows]
  reconcile.children = [diffProps, commitWork]
  commitWork.children = [layoutEffects]
  renderApp.children = [reconcile, passiveEffects]
  main.children = [renderApp, processData, idle]
  root.children = [main]
  return [root]
}

function generateCallTree(): CallTreeRow[] {
  return [
    {
      name: 'main()', selfTime: 5, totalTime: 1810, invocations: 1, isHotPath: true,
      children: [
        {
          name: 'renderApp()', selfTime: 12, totalTime: 980, invocations: 60, isHotPath: true,
          children: [
            {
              name: 'reconcileChildren()', selfTime: 45, totalTime: 620, invocations: 180, isHotPath: true,
              children: [
                { name: 'diffProps()', selfTime: 180, totalTime: 320, invocations: 540, isHotPath: true, children: [] },
                {
                  name: 'commitWork()', selfTime: 95, totalTime: 250, invocations: 60, children: [
                    { name: 'runLayoutEffects()', selfTime: 55, totalTime: 140, invocations: 60, children: [] },
                  ],
                },
              ],
            },
            { name: 'flushPassiveEffects()', selfTime: 120, totalTime: 190, invocations: 60, children: [] },
          ],
        },
        {
          name: 'processData()', selfTime: 8, totalTime: 740, invocations: 12, children: [
            { name: 'JSON.parse()', selfTime: 210, totalTime: 210, invocations: 48, children: [] },
            {
              name: 'transformRows()', selfTime: 290, totalTime: 420, invocations: 48, children: [
                { name: 'Array.sort()', selfTime: 130, totalTime: 130, invocations: 48, children: [] },
              ],
            },
          ],
        },
      ],
    },
  ]
}

function generateTimeline(): TimelineSample[] {
  const samples: TimelineSample[] = []
  for (let t = 0; t <= 1820; t += 20) {
    const phase = t / 1820
    const cpu = Math.min(100, Math.max(5,
      60 + 30 * Math.sin(phase * Math.PI * 6) + (Math.random() - 0.5) * 20
    ))
    const memory = 40 + phase * 35 + 10 * Math.sin(phase * Math.PI * 3)
    samples.push({ time: t, cpu: Math.round(cpu), memory: Math.round(memory) })
  }
  return samples
}

function generateMemoryTimeline(): MemorySnapshot[] {
  const snapshots: MemorySnapshot[] = []
  let heapUsed = 42
  let heapTotal = 64
  for (let t = 0; t <= 1820; t += 30) {
    heapUsed += (Math.random() - 0.3) * 4
    if (heapUsed > heapTotal - 5) {
      heapTotal += 16
    }
    const gcEvent = Math.random() < 0.08
    if (gcEvent) {
      heapUsed = Math.max(30, heapUsed - 12 - Math.random() * 8)
    }
    heapUsed = Math.max(20, Math.min(heapTotal - 2, heapUsed))
    snapshots.push({
      time: t,
      heapUsed: Math.round(heapUsed * 10) / 10,
      heapTotal: Math.round(heapTotal * 10) / 10,
      gcEvent,
    })
  }
  return snapshots
}

const SUMMARY: SummaryStats = {
  totalTime: 1820,
  idleTime: 90,
  scriptingTime: 1290,
  renderingTime: 310,
  paintingTime: 130,
}

/* ── Helper components ─────────────────────────────────────────── */

function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  return `${ms.toFixed(1)} ms`
}

function formatMB(mb: number): string {
  return `${mb.toFixed(1)} MB`
}

/* ── Main component ────────────────────────────────────────────── */

export default function ProfilerPanel() {
  const [isRecording, setIsRecording] = useState(false)
  const [hasProfile, setHasProfile] = useState(true)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [activeTab, setActiveTab] = useState<ProfilerTab>('flame')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [filterText, setFilterText] = useState('')
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['main()', 'renderApp()', 'reconcileChildren()']))
  const [sortField, setSortField] = useState<SortField>('totalTime')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [hoveredFlame, setHoveredFlame] = useState<string | null>(null)
  const [selectedFlame, setSelectedFlame] = useState<string | null>(null)
  const recordingTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const flameContainerRef = useRef<HTMLDivElement>(null)

  const flameData = useMemo(() => generateFlameData(), [])
  const callTree = useMemo(() => generateCallTree(), [])
  const timeline = useMemo(() => generateTimeline(), [])
  const memoryTimeline = useMemo(() => generateMemoryTimeline(), [])

  /* Recording controls */
  const startRecording = useCallback(() => {
    setIsRecording(true)
    setHasProfile(false)
    setRecordingDuration(0)
    recordingTimer.current = setInterval(() => {
      setRecordingDuration(d => d + 100)
    }, 100)
  }, [])

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setHasProfile(true)
    if (recordingTimer.current) {
      clearInterval(recordingTimer.current)
      recordingTimer.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (recordingTimer.current) clearInterval(recordingTimer.current)
    }
  }, [])

  /* Zoom */
  const zoomIn = useCallback(() => setZoomLevel(z => Math.min(z * 1.5, 8)), [])
  const zoomOut = useCallback(() => setZoomLevel(z => Math.max(z / 1.5, 0.5)), [])
  const resetZoom = useCallback(() => setZoomLevel(1), [])

  /* Export */
  const exportProfile = useCallback(() => {
    const data = { flameData, callTree, timeline, memoryTimeline, summary: SUMMARY }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `profile-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [flameData, callTree, timeline, memoryTimeline])

  /* Call tree expand/collapse */
  const toggleNode = useCallback((name: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])

  /* Sorting for call tree */
  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        return prev
      }
      setSortDir('desc')
      return field
    })
  }, [])

  /* Filter matching */
  const matchesFilter = useCallback((name: string) => {
    if (!filterText) return true
    return name.toLowerCase().includes(filterText.toLowerCase())
  }, [filterText])

  /* ── Styles ────────────────────────────────────────────────── */

  const panelStyle: React.CSSProperties = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary, #1e1e1e)',
    color: 'var(--text-primary, #cccccc)',
    fontFamily: 'var(--font-family, "Segoe UI", sans-serif)',
    fontSize: '13px',
    overflow: 'hidden',
  }

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-secondary, #252526)',
    flexShrink: 0,
  }

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    border: '1px solid var(--border-primary, #555)',
    borderRadius: 3,
    background: active ? 'var(--accent, #007acc)' : 'transparent',
    color: active ? '#fff' : 'var(--text-primary, #ccc)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap',
  })

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 12px',
    border: 'none',
    borderBottom: active ? '2px solid var(--accent, #007acc)' : '2px solid transparent',
    background: 'transparent',
    color: active ? 'var(--accent, #007acc)' : 'var(--text-secondary, #999)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
  })

  const timelineContainerStyle: React.CSSProperties = {
    height: 80,
    padding: '4px 12px',
    borderBottom: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-secondary, #252526)',
    flexShrink: 0,
    position: 'relative',
  }

  const summaryBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 16,
    padding: '4px 12px',
    borderBottom: '1px solid var(--border-primary, #333)',
    background: 'var(--bg-tertiary, #2d2d2d)',
    fontSize: 11,
    flexShrink: 0,
  }

  const statStyle = (color: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  })

  const dotStyle = (color: string): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  })

  /* ── Timeline minimap renderer ─────────────────────────────── */

  const renderTimelineOverview = () => {
    const w = 800
    const h = 60
    const maxCpu = 100
    const cpuPoints = timeline.map((s, i) => {
      const x = (i / (timeline.length - 1)) * w
      const y = h - (s.cpu / maxCpu) * h
      return `${x},${y}`
    }).join(' ')
    const memPoints = timeline.map((s, i) => {
      const x = (i / (timeline.length - 1)) * w
      const y = h - (s.memory / maxCpu) * h
      return `${x},${y}`
    }).join(' ')

    return (
      <div style={timelineContainerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>Timeline Overview</span>
          <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>
            0 ms — {SUMMARY.totalTime} ms
          </span>
        </div>
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
          style={{ display: 'block' }}>
          <polyline points={cpuPoints} fill="none" stroke="#4eaff7" strokeWidth="1.5" />
          <polyline points={memPoints} fill="none" stroke="#7ec863" strokeWidth="1.5" />
          <line x1={0} y1={h * 0.2} x2={w} y2={h * 0.2}
            stroke="var(--border-primary, #444)" strokeWidth="0.5" strokeDasharray="4 4" />
          <line x1={0} y1={h * 0.5} x2={w} y2={h * 0.5}
            stroke="var(--border-primary, #444)" strokeWidth="0.5" strokeDasharray="4 4" />
        </svg>
        <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: '#4eaff7' }}>CPU</span>
          <span style={{ fontSize: 10, color: '#7ec863' }}>Memory</span>
        </div>
      </div>
    )
  }

  /* ── Summary stats bar ─────────────────────────────────────── */

  const renderSummary = () => (
    <div style={summaryBarStyle}>
      <span style={statStyle('#4eaff7')}>
        <span style={dotStyle('#4eaff7')} /> Total: {formatMs(SUMMARY.totalTime)}
      </span>
      <span style={statStyle('#888')}>
        <span style={dotStyle('#888')} /> Idle: {formatMs(SUMMARY.idleTime)}
      </span>
      <span style={statStyle('#f0a051')}>
        <span style={dotStyle('#f0a051')} /> Scripting: {formatMs(SUMMARY.scriptingTime)}
      </span>
      <span style={statStyle('#9b6ef0')}>
        <span style={dotStyle('#9b6ef0')} /> Rendering: {formatMs(SUMMARY.renderingTime)}
      </span>
      <span style={statStyle('#7ec863')}>
        <span style={dotStyle('#7ec863')} /> Painting: {formatMs(SUMMARY.paintingTime)}
      </span>
    </div>
  )

  /* ── Flame chart ───────────────────────────────────────────── */

  const renderFlameBar = (node: FlameNode, baseLeft: number = 0): React.ReactNode[] => {
    const bars: React.ReactNode[] = []
    const show = matchesFilter(node.name)
    const isHovered = hoveredFlame === node.name
    const isSelected = selectedFlame === node.name
    const barColor = node.isHotPath ? HOT_COLOR : node.color
    const opacity = show ? 1 : 0.2

    bars.push(
      <div
        key={`${node.name}-${node.depth}-${node.startOffset}`}
        onMouseEnter={() => setHoveredFlame(node.name)}
        onMouseLeave={() => setHoveredFlame(null)}
        onClick={() => setSelectedFlame(node.name === selectedFlame ? null : node.name)}
        title={`${node.name}\nSelf: ${formatMs(node.selfTime)} | Total: ${formatMs(node.totalTime)} | Calls: ${node.invocations}`}
        style={{
          position: 'absolute',
          left: `${node.startOffset * zoomLevel}%`,
          top: node.depth * 22,
          width: `${Math.max(node.width * zoomLevel, 0.3)}%`,
          height: 20,
          background: barColor,
          opacity,
          border: isSelected ? '2px solid #fff' : isHovered ? '1px solid rgba(255,255,255,0.6)' : '1px solid rgba(0,0,0,0.3)',
          borderRadius: 2,
          overflow: 'hidden',
          cursor: 'pointer',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 4,
          fontSize: 10,
          color: '#fff',
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
          transition: 'opacity 0.15s',
        }}
      >
        {node.width * zoomLevel > 4 ? node.name : ''}
      </div>
    )

    for (const child of node.children) {
      bars.push(...renderFlameBar(child, baseLeft))
    }
    return bars
  }

  const renderFlameChart = () => {
    const allBars: React.ReactNode[] = []
    for (const root of flameData) {
      allBars.push(...renderFlameBar(root))
    }
    const maxDepth = 6
    return (
      <div
        ref={flameContainerRef}
        style={{
          position: 'relative',
          height: maxDepth * 22 + 10,
          minWidth: `${100 * zoomLevel}%`,
          overflow: 'visible',
        }}
      >
        {allBars}
      </div>
    )
  }

  /* ── Call tree table ───────────────────────────────────────── */

  const renderCallTreeRow = (row: CallTreeRow, depth: number = 0): React.ReactNode[] => {
    if (!matchesFilter(row.name) && !row.children.some(c => matchesFilter(c.name))) {
      if (!matchesFilter(row.name)) return []
    }
    const isExpanded = expandedNodes.has(row.name)
    const hasChildren = row.children.length > 0
    const rows: React.ReactNode[] = []
    const pctSelf = ((row.selfTime / SUMMARY.totalTime) * 100).toFixed(1)
    const pctTotal = ((row.totalTime / SUMMARY.totalTime) * 100).toFixed(1)

    rows.push(
      <tr
        key={`${row.name}-${depth}`}
        style={{
          background: row.isHotPath
            ? 'rgba(255, 32, 32, 0.08)'
            : 'transparent',
          cursor: hasChildren ? 'pointer' : 'default',
        }}
        onClick={() => hasChildren && toggleNode(row.name)}
      >
        <td style={{ padding: '3px 6px', paddingLeft: 12 + depth * 16, whiteSpace: 'nowrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {hasChildren
              ? isExpanded
                ? <ChevronDown size={12} />
                : <ChevronRight size={12} />
              : <span style={{ width: 12 }} />}
            {row.isHotPath && <AlertTriangle size={11} color={HOT_COLOR} />}
            <span style={{ color: row.isHotPath ? HOT_COLOR : 'var(--text-primary, #ccc)' }}>
              {row.name}
            </span>
          </span>
        </td>
        <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatMs(row.selfTime)}
          <span style={{ color: 'var(--text-secondary, #777)', marginLeft: 4, fontSize: 10 }}>{pctSelf}%</span>
        </td>
        <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {formatMs(row.totalTime)}
          <span style={{ color: 'var(--text-secondary, #777)', marginLeft: 4, fontSize: 10 }}>{pctTotal}%</span>
        </td>
        <td style={{ padding: '3px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {row.invocations}
        </td>
        <td style={{ padding: '3px 8px', width: 100 }}>
          <div style={{
            height: 6,
            background: 'var(--bg-tertiary, #333)',
            borderRadius: 3,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${pctTotal}%`,
              background: row.isHotPath ? HOT_COLOR : '#4eaff7',
              borderRadius: 3,
            }} />
          </div>
        </td>
      </tr>
    )

    if (isExpanded && hasChildren) {
      const sorted = [...row.children].sort((a, b) => {
        const mul = sortDir === 'asc' ? 1 : -1
        if (sortField === 'name') return mul * a.name.localeCompare(b.name)
        return mul * ((a as any)[sortField] - (b as any)[sortField])
      })
      for (const child of sorted) {
        rows.push(...renderCallTreeRow(child, depth + 1))
      }
    }
    return rows
  }

  const renderCallTree = () => {
    const headerStyle: React.CSSProperties = {
      padding: '5px 8px',
      textAlign: 'left',
      borderBottom: '1px solid var(--border-primary, #444)',
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--text-secondary, #aaa)',
      cursor: 'pointer',
      userSelect: 'none',
      whiteSpace: 'nowrap',
    }
    const sortIndicator = (field: SortField) =>
      sortField === field ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
        <thead>
          <tr style={{ background: 'var(--bg-tertiary, #2d2d2d)' }}>
            <th style={headerStyle} onClick={() => handleSort('name')}>
              Function{sortIndicator('name')}
            </th>
            <th style={{ ...headerStyle, textAlign: 'right', width: 110 }} onClick={() => handleSort('selfTime')}>
              Self Time{sortIndicator('selfTime')}
            </th>
            <th style={{ ...headerStyle, textAlign: 'right', width: 110 }} onClick={() => handleSort('totalTime')}>
              Total Time{sortIndicator('totalTime')}
            </th>
            <th style={{ ...headerStyle, textAlign: 'right', width: 80 }} onClick={() => handleSort('invocations')}>
              Calls{sortIndicator('invocations')}
            </th>
            <th style={{ ...headerStyle, width: 110 }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {callTree.flatMap(row => renderCallTreeRow(row))}
        </tbody>
      </table>
    )
  }

  /* ── Memory tab ────────────────────────────────────────────── */

  const renderMemoryTab = () => {
    const w = 800
    const h = 200
    const maxMem = Math.max(...memoryTimeline.map(s => s.heapTotal)) + 10
    const usedPoints = memoryTimeline.map((s, i) => {
      const x = (i / (memoryTimeline.length - 1)) * w
      const y = h - (s.heapUsed / maxMem) * h
      return `${x},${y}`
    }).join(' ')
    const totalPoints = memoryTimeline.map((s, i) => {
      const x = (i / (memoryTimeline.length - 1)) * w
      const y = h - (s.heapTotal / maxMem) * h
      return `${x},${y}`
    }).join(' ')
    const usedFill = `${usedPoints} ${w},${h} 0,${h}`
    const gcEvents = memoryTimeline.filter(s => s.gcEvent)

    const peakHeap = Math.max(...memoryTimeline.map(s => s.heapUsed))
    const avgHeap = memoryTimeline.reduce((sum, s) => sum + s.heapUsed, 0) / memoryTimeline.length
    const gcCount = gcEvents.length

    return (
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
          <div style={{
            padding: '8px 14px',
            background: 'var(--bg-tertiary, #2d2d2d)',
            borderRadius: 4,
            border: '1px solid var(--border-primary, #444)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 2 }}>Peak Heap</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#e25041' }}>{formatMB(peakHeap)}</div>
          </div>
          <div style={{
            padding: '8px 14px',
            background: 'var(--bg-tertiary, #2d2d2d)',
            borderRadius: 4,
            border: '1px solid var(--border-primary, #444)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 2 }}>Avg Heap</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#4eaff7' }}>{formatMB(avgHeap)}</div>
          </div>
          <div style={{
            padding: '8px 14px',
            background: 'var(--bg-tertiary, #2d2d2d)',
            borderRadius: 4,
            border: '1px solid var(--border-primary, #444)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 2 }}>GC Events</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#f0a051' }}>{gcCount}</div>
          </div>
          <div style={{
            padding: '8px 14px',
            background: 'var(--bg-tertiary, #2d2d2d)',
            borderRadius: 4,
            border: '1px solid var(--border-primary, #444)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 2 }}>Heap Limit</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#7ec863' }}>
              {formatMB(Math.max(...memoryTimeline.map(s => s.heapTotal)))}
            </div>
          </div>
        </div>

        <div style={{
          background: 'var(--bg-secondary, #252526)',
          borderRadius: 4,
          border: '1px solid var(--border-primary, #444)',
          padding: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600 }}>Heap Usage Over Time</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>
              0 ms — {SUMMARY.totalTime} ms
            </span>
          </div>
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
            style={{ display: 'block' }}>
            {/* Grid */}
            {[0.25, 0.5, 0.75].map(frac => (
              <line key={frac} x1={0} y1={h * frac} x2={w} y2={h * frac}
                stroke="var(--border-primary, #333)" strokeWidth="0.5" strokeDasharray="4 4" />
            ))}
            {/* Heap total */}
            <polyline points={totalPoints} fill="none" stroke="#555" strokeWidth="1" strokeDasharray="3 3" />
            {/* Heap used fill */}
            <polygon points={usedFill} fill="rgba(78, 175, 247, 0.15)" />
            {/* Heap used line */}
            <polyline points={usedPoints} fill="none" stroke="#4eaff7" strokeWidth="1.5" />
            {/* GC markers */}
            {gcEvents.map((gc, i) => {
              const idx = memoryTimeline.indexOf(gc)
              const x = (idx / (memoryTimeline.length - 1)) * w
              return (
                <g key={`gc-${i}`}>
                  <line x1={x} y1={0} x2={x} y2={h} stroke="#f0a051" strokeWidth="1" strokeDasharray="2 2" />
                  <circle cx={x} cy={8} r={4} fill="#f0a051" />
                  <text x={x} y={11} textAnchor="middle" fontSize={6} fill="#fff">GC</text>
                </g>
              )
            })}
            {/* Axis labels */}
            <text x={4} y={12} fontSize={9} fill="var(--text-secondary, #888)">
              {formatMB(maxMem)}
            </text>
            <text x={4} y={h - 4} fontSize={9} fill="var(--text-secondary, #888)">0 MB</text>
          </svg>
          <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
            <span style={{ fontSize: 10, color: '#4eaff7' }}>Heap Used</span>
            <span style={{ fontSize: 10, color: '#555' }}>Heap Total (dashed)</span>
            <span style={{ fontSize: 10, color: '#f0a051' }}>GC Event</span>
          </div>
        </div>
      </div>
    )
  }

  /* ── Selected flame details ────────────────────────────────── */

  const renderFlameDetail = () => {
    if (!selectedFlame) return null
    const findNode = (nodes: FlameNode[]): FlameNode | null => {
      for (const n of nodes) {
        if (n.name === selectedFlame) return n
        const found = findNode(n.children)
        if (found) return found
      }
      return null
    }
    const node = findNode(flameData)
    if (!node) return null

    return (
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--border-primary, #333)',
        background: 'var(--bg-tertiary, #2d2d2d)',
        fontSize: 11,
        display: 'flex',
        gap: 20,
        flexShrink: 0,
      }}>
        <span style={{ fontWeight: 600, color: node.isHotPath ? HOT_COLOR : 'var(--text-primary, #ccc)' }}>
          {node.name}
        </span>
        <span>Self: <b>{formatMs(node.selfTime)}</b></span>
        <span>Total: <b>{formatMs(node.totalTime)}</b></span>
        <span>Invocations: <b>{node.invocations}</b></span>
        <span>% of total: <b>{((node.totalTime / SUMMARY.totalTime) * 100).toFixed(1)}%</b></span>
      </div>
    )
  }

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div style={panelStyle}>
      {/* Toolbar */}
      <div style={toolbarStyle}>
        {isRecording ? (
          <button style={btnStyle(true)} onClick={stopRecording}>
            <Square size={12} /> Stop
          </button>
        ) : (
          <button style={btnStyle()} onClick={startRecording}>
            <Play size={12} /> Record
          </button>
        )}
        {isRecording && (
          <span style={{ fontSize: 12, color: '#e25041', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: '#e25041',
              animation: 'pulse 1s infinite',
            }} />
            Recording... {formatMs(recordingDuration)}
          </span>
        )}

        <div style={{ width: 1, height: 18, background: 'var(--border-primary, #444)', margin: '0 4px' }} />

        {/* Tabs */}
        <button style={tabBtnStyle(activeTab === 'flame')} onClick={() => setActiveTab('flame')}>
          <Flame size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
          Flame Chart
        </button>
        <button style={tabBtnStyle(activeTab === 'calltree')} onClick={() => setActiveTab('calltree')}>
          <BarChart3 size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
          Call Tree
        </button>
        <button style={tabBtnStyle(activeTab === 'memory')} onClick={() => setActiveTab('memory')}>
          <MemoryStick size={12} style={{ marginRight: 3, verticalAlign: -2 }} />
          Memory
        </button>

        <div style={{ flex: 1 }} />

        {/* Filter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'var(--bg-primary, #1e1e1e)',
          border: '1px solid var(--border-primary, #555)',
          borderRadius: 3,
          padding: '2px 6px',
        }}>
          <Search size={12} color="var(--text-secondary, #888)" />
          <input
            type="text"
            placeholder="Filter functions..."
            value={filterText}
            onChange={e => setFilterText(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary, #ccc)',
              fontSize: 11,
              width: 120,
              outline: 'none',
            }}
          />
          {filterText && (
            <button
              onClick={() => setFilterText('')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary, #888)', cursor: 'pointer', padding: 0 }}
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>

        {/* Zoom */}
        <button style={btnStyle()} onClick={zoomOut} title="Zoom Out">
          <ZoomOut size={13} />
        </button>
        <span style={{ fontSize: 10, color: 'var(--text-secondary, #999)', minWidth: 32, textAlign: 'center' }}>
          {(zoomLevel * 100).toFixed(0)}%
        </span>
        <button style={btnStyle()} onClick={zoomIn} title="Zoom In">
          <ZoomIn size={13} />
        </button>
        <button style={btnStyle()} onClick={resetZoom} title="Reset Zoom">
          <RotateCw size={12} />
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border-primary, #444)', margin: '0 4px' }} />

        {/* Export */}
        <button style={btnStyle()} onClick={exportProfile} title="Export Profile as JSON">
          <Download size={12} /> Export
        </button>
      </div>

      {/* Timeline overview */}
      {hasProfile && renderTimelineOverview()}

      {/* Summary stats */}
      {hasProfile && renderSummary()}

      {/* Tab content */}
      {hasProfile ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {activeTab === 'flame' && (
            <div style={{ padding: 12, overflowX: 'auto' }}>
              {renderFlameChart()}
            </div>
          )}
          {activeTab === 'calltree' && (
            <div style={{ overflowX: 'auto' }}>
              {renderCallTree()}
            </div>
          )}
          {activeTab === 'memory' && renderMemoryTab()}
        </div>
      ) : (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary, #888)',
          gap: 8,
        }}>
          {isRecording ? (
            <>
              <Clock size={40} strokeWidth={1.5} />
              <span style={{ fontSize: 14 }}>Profiling in progress...</span>
              <span style={{ fontSize: 12 }}>Click Stop to analyze the recording.</span>
            </>
          ) : (
            <>
              <Flame size={40} strokeWidth={1.5} />
              <span style={{ fontSize: 14 }}>No profile data</span>
              <span style={{ fontSize: 12 }}>Click Record to start profiling.</span>
            </>
          )}
        </div>
      )}

      {/* Flame detail bar */}
      {hasProfile && activeTab === 'flame' && renderFlameDetail()}
    </div>
  )
}
