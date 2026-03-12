/**
 * Git commit graph renderer.
 * Draws branch/merge lines for git log visualizations
 * using canvas or SVG, with colored rails per branch.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface GitCommit {
  hash: string
  abbreviatedHash: string
  message: string
  author: string
  authorEmail: string
  authorDate: string
  parents: string[]
  refs: GitRef[]
}

export interface GitRef {
  name: string
  type: 'branch' | 'tag' | 'remote' | 'head'
  isCurrent: boolean
}

export interface GraphNode {
  commit: GitCommit
  column: number
  row: number
  color: string
  parentConnections: ParentConnection[]
  isMerge: boolean
  isBranch: boolean
}

export interface ParentConnection {
  fromColumn: number
  fromRow: number
  toColumn: number
  toRow: number
  color: string
  isMerge: boolean
}

export interface GraphLine {
  type: 'straight' | 'curve-left' | 'curve-right' | 'merge'
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
}

export interface GraphOptions {
  cellWidth: number
  cellHeight: number
  dotRadius: number
  lineWidth: number
  maxColumns: number
  colors: string[]
}

/* ── Constants ────────────────────────────────────────── */

const DEFAULT_COLORS = [
  '#4fc1ff', '#f14e32', '#2ea043', '#ffd93d', '#c084fc',
  '#fb923c', '#22d3ee', '#f472b6', '#a78bfa', '#34d399',
  '#60a5fa', '#ef4444', '#84cc16', '#e879f9', '#06b6d4',
]

const DEFAULT_OPTIONS: GraphOptions = {
  cellWidth: 16,
  cellHeight: 28,
  dotRadius: 4,
  lineWidth: 2,
  maxColumns: 20,
  colors: DEFAULT_COLORS,
}

/* ── Graph Builder ────────────────────────────────────── */

export function buildGraph(commits: GitCommit[], options: Partial<GraphOptions> = {}): GraphNode[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const nodes: GraphNode[] = []
  const commitMap = new Map<string, number>() // hash → row
  const activeColumns: (string | null)[] = [] // hash occupying each column

  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row]
    commitMap.set(commit.hash, row)

    // Find column for this commit
    let column = activeColumns.indexOf(commit.hash)
    if (column === -1) {
      // New branch - find first empty column
      column = activeColumns.indexOf(null)
      if (column === -1) {
        column = Math.min(activeColumns.length, opts.maxColumns - 1)
        activeColumns.push(null)
      }
    }

    // Remove this commit from its column
    activeColumns[column] = null

    // Assign parents to columns
    const parentConnections: ParentConnection[] = []
    const isMerge = commit.parents.length > 1

    for (let pi = 0; pi < commit.parents.length; pi++) {
      const parentHash = commit.parents[pi]
      let parentColumn = activeColumns.indexOf(parentHash)

      if (parentColumn === -1) {
        if (pi === 0) {
          // First parent stays in same column
          parentColumn = column
        } else {
          // Other parents get a new column
          parentColumn = activeColumns.indexOf(null)
          if (parentColumn === -1) {
            parentColumn = Math.min(activeColumns.length, opts.maxColumns - 1)
            if (parentColumn >= activeColumns.length) {
              activeColumns.push(null)
            }
          }
        }
      }

      activeColumns[parentColumn] = parentHash

      // Find parent row (may not be in the visible range)
      const parentRow = commitMap.get(parentHash) ?? row + 1

      parentConnections.push({
        fromColumn: column,
        fromRow: row,
        toColumn: parentColumn,
        toRow: parentRow,
        color: opts.colors[parentColumn % opts.colors.length],
        isMerge: pi > 0,
      })
    }

    // Clean up unused columns from the right
    while (activeColumns.length > 0 && activeColumns[activeColumns.length - 1] === null) {
      activeColumns.pop()
    }

    const isBranch = commit.refs.some(r => r.type === 'branch')

    nodes.push({
      commit,
      column,
      row,
      color: opts.colors[column % opts.colors.length],
      parentConnections,
      isMerge,
      isBranch,
    })
  }

  return nodes
}

/* ── Canvas Renderer ──────────────────────────────────── */

export function renderGraphToCanvas(
  ctx: CanvasRenderingContext2D,
  nodes: GraphNode[],
  options: Partial<GraphOptions> = {},
  scrollTop: number = 0,
  viewHeight: number = 600,
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { cellWidth, cellHeight, dotRadius, lineWidth } = opts

  // Calculate visible range
  const startRow = Math.max(0, Math.floor(scrollTop / cellHeight) - 1)
  const endRow = Math.min(nodes.length, Math.ceil((scrollTop + viewHeight) / cellHeight) + 1)

  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Draw connections first (below dots)
  for (let i = startRow; i < endRow && i < nodes.length; i++) {
    const node = nodes[i]
    const y = node.row * cellHeight + cellHeight / 2 - scrollTop
    const x = node.column * cellWidth + cellWidth / 2

    for (const conn of node.parentConnections) {
      const toY = conn.toRow * cellHeight + cellHeight / 2 - scrollTop
      const toX = conn.toColumn * cellWidth + cellWidth / 2

      ctx.strokeStyle = conn.color
      ctx.globalAlpha = conn.isMerge ? 0.7 : 1

      ctx.beginPath()

      if (conn.fromColumn === conn.toColumn) {
        // Straight line
        ctx.moveTo(x, y)
        ctx.lineTo(toX, toY)
      } else {
        // Curved connection
        const midY = y + (toY - y) * 0.4
        ctx.moveTo(x, y)
        ctx.bezierCurveTo(x, midY, toX, midY, toX, toY)
      }

      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  // Draw dots on top
  for (let i = startRow; i < endRow && i < nodes.length; i++) {
    const node = nodes[i]
    const y = node.row * cellHeight + cellHeight / 2 - scrollTop
    const x = node.column * cellWidth + cellWidth / 2

    // Dot
    ctx.fillStyle = node.color
    ctx.beginPath()

    if (node.isMerge) {
      // Diamond shape for merge commits
      ctx.moveTo(x, y - dotRadius - 1)
      ctx.lineTo(x + dotRadius + 1, y)
      ctx.lineTo(x, y + dotRadius + 1)
      ctx.lineTo(x - dotRadius - 1, y)
      ctx.closePath()
    } else {
      // Circle for normal commits
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2)
    }

    ctx.fill()

    // White inner dot for head commit
    if (node.commit.refs.some(r => r.type === 'head')) {
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(x, y, dotRadius - 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/* ── SVG Renderer ─────────────────────────────────────── */

export function renderGraphToSVG(
  nodes: GraphNode[],
  options: Partial<GraphOptions> = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { cellWidth, cellHeight, dotRadius, lineWidth } = opts

  const maxColumn = Math.max(...nodes.map(n => n.column), 0)
  const width = (maxColumn + 2) * cellWidth
  const height = nodes.length * cellHeight

  const lines: string[] = []
  const dots: string[] = []

  for (const node of nodes) {
    const y = node.row * cellHeight + cellHeight / 2
    const x = node.column * cellWidth + cellWidth / 2

    // Connections
    for (const conn of node.parentConnections) {
      const toY = conn.toRow * cellHeight + cellHeight / 2
      const toX = conn.toColumn * cellWidth + cellWidth / 2

      if (conn.fromColumn === conn.toColumn) {
        lines.push(`<line x1="${x}" y1="${y}" x2="${toX}" y2="${toY}" stroke="${conn.color}" stroke-width="${lineWidth}" stroke-linecap="round" opacity="${conn.isMerge ? 0.7 : 1}"/>`)
      } else {
        const midY = y + (toY - y) * 0.4
        lines.push(`<path d="M${x},${y} C${x},${midY} ${toX},${midY} ${toX},${toY}" stroke="${conn.color}" stroke-width="${lineWidth}" fill="none" stroke-linecap="round" opacity="${conn.isMerge ? 0.7 : 1}"/>`)
      }
    }

    // Dot
    if (node.isMerge) {
      const d = dotRadius + 1
      dots.push(`<polygon points="${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}" fill="${node.color}"/>`)
    } else {
      dots.push(`<circle cx="${x}" cy="${y}" r="${dotRadius}" fill="${node.color}"/>`)
    }

    // HEAD indicator
    if (node.commit.refs.some(r => r.type === 'head')) {
      dots.push(`<circle cx="${x}" cy="${y}" r="${dotRadius - 1.5}" fill="white"/>`)
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${lines.join('')}${dots.join('')}</svg>`
}

/* ── Ref Badges ───────────────────────────────────────── */

export function getRefBadgeStyle(ref: GitRef): { background: string; color: string; border: string } {
  switch (ref.type) {
    case 'branch':
      return ref.isCurrent
        ? { background: '#2ea043', color: '#ffffff', border: '#2ea043' }
        : { background: '#21262d', color: '#c9d1d9', border: '#30363d' }
    case 'tag':
      return { background: '#1f1d2e', color: '#ffd93d', border: '#ffd93d44' }
    case 'remote':
      return { background: '#1f1d2e', color: '#4fc1ff', border: '#4fc1ff44' }
    case 'head':
      return { background: '#2ea043', color: '#ffffff', border: '#2ea043' }
    default:
      return { background: '#21262d', color: '#c9d1d9', border: '#30363d' }
  }
}

/* ── Commit Parsing ───────────────────────────────────── */

export function parseGitLogOutput(output: string): GitCommit[] {
  const commits: GitCommit[] = []
  const entries = output.split('\x00').filter(Boolean)

  for (const entry of entries) {
    const parts = entry.split('\x01')
    if (parts.length < 6) continue

    const [hash, abbrev, parentStr, authorName, authorEmail, authorDate, ...messageParts] = parts
    const message = messageParts.join('\x01').trim()
    const parents = parentStr ? parentStr.split(' ').filter(Boolean) : []

    commits.push({
      hash: hash.trim(),
      abbreviatedHash: abbrev.trim(),
      message,
      author: authorName.trim(),
      authorEmail: authorEmail.trim(),
      authorDate: authorDate.trim(),
      parents,
      refs: [],
    })
  }

  return commits
}

export function parseGitRefs(output: string): Map<string, GitRef[]> {
  const refMap = new Map<string, GitRef[]>()
  const lines = output.trim().split('\n').filter(Boolean)

  for (const line of lines) {
    const [hash, refName] = line.split(/\s+/, 2)
    if (!hash || !refName) continue

    let name = refName
    let type: GitRef['type'] = 'branch'
    const isCurrent = refName.startsWith('*')

    if (refName.startsWith('refs/heads/')) {
      name = refName.slice(11)
      type = 'branch'
    } else if (refName.startsWith('refs/tags/')) {
      name = refName.slice(10)
      type = 'tag'
    } else if (refName.startsWith('refs/remotes/')) {
      name = refName.slice(13)
      type = 'remote'
    } else if (refName === 'HEAD') {
      name = 'HEAD'
      type = 'head'
    }

    if (!refMap.has(hash)) refMap.set(hash, [])
    refMap.get(hash)!.push({ name, type, isCurrent })
  }

  return refMap
}

/* ── Relative Date Formatting ─────────────────────────── */

export function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  const diffWeek = Math.floor(diffDay / 7)
  const diffMonth = Math.floor(diffDay / 30)
  const diffYear = Math.floor(diffDay / 365)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  if (diffWeek < 5) return `${diffWeek}w ago`
  if (diffMonth < 12) return `${diffMonth}mo ago`
  return `${diffYear}y ago`
}

/* ── Author Avatar ────────────────────────────────────── */

export function getAvatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 50%)`
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/* ── Graph Width Calculation ──────────────────────────── */

export function getGraphWidth(nodes: GraphNode[], options: Partial<GraphOptions> = {}): number {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const maxColumn = Math.max(...nodes.map(n => n.column), 0)
  return (maxColumn + 2) * opts.cellWidth
}

export function getGraphHeight(nodes: GraphNode[], options: Partial<GraphOptions> = {}): number {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  return nodes.length * opts.cellHeight
}
