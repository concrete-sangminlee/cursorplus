import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { GitCommit, GitBranch, Tag, ChevronDown } from 'lucide-react'

// ── Types ────────────────────────────────────────────────

export interface GitGraphCommit {
  hash: string
  shortHash: string
  subject: string
  author: string
  date: string
  parents?: string[]
  refs?: string[]        // e.g. "HEAD -> main", "origin/main", "tag: v1.0"
}

export interface GitGraphProps {
  commits: GitGraphCommit[]
  currentHash?: string
  onCommitClick?: (hash: string) => void
  pageSize?: number
}

// ── Branch color palette ─────────────────────────────────

const BRANCH_COLORS = [
  '#58a6ff', // blue  (main / master)
  '#3fb950', // green (feature)
  '#d2a8ff', // purple
  '#f0883e', // orange
  '#f778ba', // pink
  '#79c0ff', // light blue
  '#d29922', // yellow
  '#56d4dd', // cyan
]

const KNOWN_BRANCH_COLORS: Record<string, string> = {
  main: BRANCH_COLORS[0],
  master: BRANCH_COLORS[0],
  develop: BRANCH_COLORS[2],
  dev: BRANCH_COLORS[2],
}

// ── Inject styles ────────────────────────────────────────

const styleId = 'git-graph-styles'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    .gg-root {
      font-family: var(--font-family, 'Segoe UI', system-ui, sans-serif);
      font-size: 12px;
      color: var(--text-primary, #e1e4e8);
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .gg-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
    .gg-scroll::-webkit-scrollbar { width: 6px; }
    .gg-scroll::-webkit-scrollbar-track { background: transparent; }
    .gg-scroll::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.12);
      border-radius: 3px;
    }
    .gg-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.2);
    }

    .gg-row {
      display: flex;
      align-items: stretch;
      min-height: 40px;
      cursor: pointer;
      transition: background 0.1s;
      position: relative;
    }
    .gg-row:hover {
      background: rgba(255,255,255,0.04);
    }
    .gg-row.gg-selected {
      background: rgba(88,166,255,0.08);
    }

    .gg-graph-col {
      width: 40px;
      min-width: 40px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .gg-info {
      flex: 1;
      min-width: 0;
      padding: 6px 12px 6px 4px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 2px;
    }

    .gg-subject-row {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .gg-head-badge {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 10px;
      font-weight: 600;
      color: #1b1f23;
      background: #58a6ff;
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
      flex-shrink: 0;
      line-height: 16px;
    }

    .gg-ref-pill {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-size: 10px;
      font-weight: 500;
      padding: 1px 6px;
      border-radius: 3px;
      white-space: nowrap;
      flex-shrink: 0;
      line-height: 16px;
      border: 1px solid;
    }

    .gg-subject {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text-primary, #e1e4e8);
      font-weight: 400;
      min-width: 0;
    }

    .gg-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--text-muted, #8b949e);
    }

    .gg-hash {
      font-family: var(--font-mono, 'Cascadia Code', 'Fira Code', monospace);
      color: var(--accent, #58a6ff);
      font-size: 11px;
      flex-shrink: 0;
    }

    .gg-author {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .gg-date {
      flex-shrink: 0;
      margin-left: auto;
      padding-right: 4px;
    }

    .gg-tooltip {
      position: fixed;
      z-index: 9999;
      max-width: 400px;
      padding: 8px 12px;
      background: #1e1e2e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      font-size: 12px;
      color: var(--text-primary, #e1e4e8);
      pointer-events: none;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
    }

    .gg-load-more {
      display: flex;
      justify-content: center;
      padding: 8px;
    }

    .gg-load-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      color: var(--text-muted, #8b949e);
      padding: 4px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .gg-load-btn:hover {
      background: rgba(255,255,255,0.06);
      color: var(--text-primary, #e1e4e8);
      border-color: rgba(255,255,255,0.2);
    }

    .gg-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--text-muted, #8b949e);
      gap: 8px;
    }

    .gg-merge-indicator {
      font-size: 10px;
      color: var(--text-muted, #8b949e);
      font-style: italic;
    }
  `
  document.head.appendChild(style)
}

// ── Graph layout helpers ─────────────────────────────────

interface Lane {
  hash: string
  color: string
}

interface GraphNode {
  column: number
  color: string
  isMerge: boolean
  mergeParentCols: number[]   // columns of merge parent lines
  continuations: number[]     // columns that have a line passing through
}

function buildGraphLayout(commits: GitGraphCommit[]): GraphNode[] {
  const nodes: GraphNode[] = []
  let lanes: (string | null)[] = []      // each lane tracks which commit hash it's heading toward
  let colorIndex = 0

  const hashToColor = new Map<string, string>()

  const getColor = (hash: string, hint?: string): string => {
    if (hashToColor.has(hash)) return hashToColor.get(hash)!
    // Check known branch name hints
    if (hint && KNOWN_BRANCH_COLORS[hint]) {
      const c = KNOWN_BRANCH_COLORS[hint]
      hashToColor.set(hash, c)
      return c
    }
    const c = BRANCH_COLORS[colorIndex % BRANCH_COLORS.length]
    colorIndex++
    hashToColor.set(hash, c)
    return c
  }

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const parents = commit.parents ?? []
    const isMerge = parents.length > 1

    // Find which lane this commit occupies (if any lane was expecting it)
    let col = lanes.indexOf(commit.hash)
    if (col === -1) {
      // New lane - find first empty slot or append
      col = lanes.indexOf(null)
      if (col === -1) {
        col = lanes.length
        lanes.push(null)
      }
    }

    // Determine color: inherit from the lane if it existed, else assign new
    const color = hashToColor.get(commit.hash) ?? getColor(commit.hash)

    // First parent takes over this lane
    if (parents.length > 0) {
      lanes[col] = parents[0]
      if (!hashToColor.has(parents[0])) {
        hashToColor.set(parents[0], color) // inherit color for first parent
      }
    } else {
      lanes[col] = null
    }

    // Merge parents get their own lanes
    const mergeParentCols: number[] = []
    for (let p = 1; p < parents.length; p++) {
      const parentHash = parents[p]
      // Check if this parent is already being tracked in another lane
      const existingLane = lanes.indexOf(parentHash)
      if (existingLane !== -1) {
        mergeParentCols.push(existingLane)
      } else {
        // Find or create a lane for the merge parent
        let mergeLane = lanes.indexOf(null)
        if (mergeLane === -1 || mergeLane <= col) {
          mergeLane = lanes.length
          lanes.push(null)
        }
        lanes[mergeLane] = parentHash
        const parentColor = getColor(parentHash)
        hashToColor.set(parentHash, parentColor)
        mergeParentCols.push(mergeLane)
      }
    }

    // Gather which lanes have continuing lines (lanes that are not null and not this commit)
    const continuations: number[] = []
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] !== null && l !== col) {
        continuations.push(l)
      }
    }

    // Trim trailing null lanes
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    nodes.push({ column: col, color, isMerge, mergeParentCols, continuations })
  }

  return nodes
}

// ── Parse ref strings ────────────────────────────────────

interface ParsedRef {
  type: 'head' | 'branch' | 'remote' | 'tag'
  name: string
  isHead: boolean
}

function parseRefs(refs?: string[]): ParsedRef[] {
  if (!refs || refs.length === 0) return []
  const parsed: ParsedRef[] = []
  for (const ref of refs) {
    const trimmed = ref.trim()
    if (!trimmed) continue
    if (trimmed.startsWith('HEAD -> ')) {
      parsed.push({ type: 'head', name: trimmed.replace('HEAD -> ', ''), isHead: true })
    } else if (trimmed.startsWith('tag: ')) {
      parsed.push({ type: 'tag', name: trimmed.replace('tag: ', ''), isHead: false })
    } else if (trimmed.startsWith('origin/') || trimmed.includes('/')) {
      parsed.push({ type: 'remote', name: trimmed, isHead: false })
    } else if (trimmed === 'HEAD') {
      // detached HEAD, skip or mark
    } else {
      parsed.push({ type: 'branch', name: trimmed, isHead: false })
    }
  }
  return parsed
}

function getRefColor(name: string): string {
  const base = name.replace(/^origin\//, '')
  if (KNOWN_BRANCH_COLORS[base]) return KNOWN_BRANCH_COLORS[base]
  // Simple hash-based color
  let h = 0
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0
  return BRANCH_COLORS[Math.abs(h) % BRANCH_COLORS.length]
}

// ── SVG graph column ─────────────────────────────────────

const ROW_HEIGHT = 40
const COL_WIDTH = 16
const NODE_RADIUS = 5
const GRAPH_LEFT_PAD = 12

interface GraphColumnProps {
  node: GraphNode
  prevNode?: GraphNode
  nextNode?: GraphNode
  isHead: boolean
  totalLanes: number
}

function GraphColumn({ node, prevNode, nextNode, isHead, totalLanes }: GraphColumnProps) {
  const width = Math.max(40, GRAPH_LEFT_PAD + totalLanes * COL_WIDTH + 8)
  const cx = GRAPH_LEFT_PAD + node.column * COL_WIDTH
  const cy = ROW_HEIGHT / 2

  return (
    <svg width={width} height={ROW_HEIGHT} style={{ display: 'block', flexShrink: 0 }}>
      {/* Continuation lines (lanes passing through) */}
      {node.continuations.map((lane) => {
        const lx = GRAPH_LEFT_PAD + lane * COL_WIDTH
        return (
          <line
            key={`cont-${lane}`}
            x1={lx} y1={0}
            x2={lx} y2={ROW_HEIGHT}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1.5}
          />
        )
      })}

      {/* Line from this node down to its first parent (next row in the list) */}
      {nextNode && (
        <line
          x1={cx} y1={cy}
          x2={GRAPH_LEFT_PAD + nextNode.column * COL_WIDTH} y2={ROW_HEIGHT}
          stroke={node.color}
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />
      )}

      {/* Line from previous node down to this node */}
      {prevNode && (
        <line
          x1={GRAPH_LEFT_PAD + prevNode.column * COL_WIDTH} y1={0}
          x2={cx} y2={cy}
          stroke={node.color}
          strokeWidth={1.5}
          strokeOpacity={0.6}
        />
      )}

      {/* Merge lines */}
      {node.mergeParentCols.map((mergeCol, idx) => {
        const mx = GRAPH_LEFT_PAD + mergeCol * COL_WIDTH
        return (
          <path
            key={`merge-${idx}`}
            d={`M ${cx} ${cy} C ${cx} ${cy + 12}, ${mx} ${ROW_HEIGHT - 12}, ${mx} ${ROW_HEIGHT}`}
            fill="none"
            stroke={BRANCH_COLORS[(mergeCol + 1) % BRANCH_COLORS.length]}
            strokeWidth={1.5}
            strokeOpacity={0.5}
            strokeDasharray={node.isMerge ? 'none' : '3,3'}
          />
        )
      })}

      {/* Commit node */}
      {isHead ? (
        <>
          <circle cx={cx} cy={cy} r={NODE_RADIUS + 2} fill="none" stroke={node.color} strokeWidth={2} />
          <circle cx={cx} cy={cy} r={NODE_RADIUS - 1} fill={node.color} />
        </>
      ) : node.isMerge ? (
        <>
          <circle cx={cx} cy={cy} r={NODE_RADIUS} fill="#1e1e2e" stroke={node.color} strokeWidth={2} />
          <circle cx={cx} cy={cy} r={2} fill={node.color} />
        </>
      ) : (
        <circle cx={cx} cy={cy} r={NODE_RADIUS} fill={node.color} />
      )}
    </svg>
  )
}

// ── Main component ───────────────────────────────────────

export default function GitGraph({
  commits,
  currentHash,
  onCommitClick,
  pageSize = 50,
}: GitGraphProps) {
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const visibleCommits = useMemo(() => commits.slice(0, visibleCount), [commits, visibleCount])
  const graphNodes = useMemo(() => buildGraphLayout(visibleCommits), [visibleCommits])
  const totalLanes = useMemo(
    () => graphNodes.reduce((max, n) => {
      const cols = [n.column, ...n.mergeParentCols, ...n.continuations]
      return Math.max(max, ...cols.map(c => c + 1))
    }, 1),
    [graphNodes]
  )

  const hasMore = visibleCount < commits.length

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !hasMore) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    if (scrollHeight - scrollTop - clientHeight < 200) {
      setVisibleCount(prev => Math.min(prev + pageSize, commits.length))
    }
  }, [hasMore, pageSize, commits.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  const handleRowClick = useCallback((hash: string) => {
    setSelectedHash(hash)
    onCommitClick?.(hash)
  }, [onCommitClick])

  const showTooltip = useCallback((e: React.MouseEvent, text: string) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ text, x: e.clientX + 12, y: e.clientY - 8 })
    }, 400)
  }, [])

  const hideTooltip = useCallback(() => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    setTooltip(null)
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    }
  }, [])

  if (commits.length === 0) {
    return (
      <div className="gg-empty">
        <GitCommit size={32} strokeWidth={1} style={{ opacity: 0.4 }} />
        <span>No commits to display</span>
      </div>
    )
  }

  return (
    <div className="gg-root">
      <div className="gg-scroll" ref={scrollRef}>
        {visibleCommits.map((commit, i) => {
          const node = graphNodes[i]
          const prevNode = i > 0 ? graphNodes[i - 1] : undefined
          const nextNode = i < graphNodes.length - 1 ? graphNodes[i + 1] : undefined
          const isHead = commit.hash === currentHash || commit.shortHash === currentHash
          const isSelected = selectedHash === commit.hash
          const refs = parseRefs(commit.refs)

          return (
            <div
              key={commit.hash}
              className={`gg-row${isSelected ? ' gg-selected' : ''}`}
              onClick={() => handleRowClick(commit.hash)}
              onMouseMove={(e) => showTooltip(e, commit.subject)}
              onMouseLeave={hideTooltip}
            >
              {/* Graph column with SVG lines */}
              <div className="gg-graph-col" style={{ width: Math.max(40, GRAPH_LEFT_PAD + totalLanes * COL_WIDTH + 8) }}>
                <GraphColumn
                  node={node}
                  prevNode={prevNode}
                  nextNode={nextNode}
                  isHead={isHead}
                  totalLanes={totalLanes}
                />
              </div>

              {/* Commit info */}
              <div className="gg-info">
                <div className="gg-subject-row">
                  {/* HEAD badge */}
                  {isHead && (
                    <span className="gg-head-badge">
                      <GitBranch size={10} /> HEAD
                    </span>
                  )}

                  {/* Ref pills */}
                  {refs.map((ref, ri) => {
                    const refColor = ref.isHead ? '#58a6ff' : ref.type === 'tag' ? '#d29922' : getRefColor(ref.name)
                    return (
                      <span
                        key={ri}
                        className="gg-ref-pill"
                        style={{
                          color: refColor,
                          borderColor: `${refColor}44`,
                          background: `${refColor}15`,
                        }}
                      >
                        {ref.type === 'tag' ? <Tag size={9} /> : <GitBranch size={9} />}
                        {ref.name}
                      </span>
                    )
                  })}

                  {/* Subject */}
                  <span className="gg-subject">{commit.subject}</span>

                  {/* Merge indicator */}
                  {node.isMerge && (
                    <span className="gg-merge-indicator">merge</span>
                  )}
                </div>

                <div className="gg-meta">
                  <span className="gg-hash">{commit.shortHash}</span>
                  <span className="gg-author">{commit.author}</span>
                  <span className="gg-date">{commit.date}</span>
                </div>
              </div>
            </div>
          )
        })}

        {/* Load more */}
        {hasMore && (
          <div className="gg-load-more">
            <button
              className="gg-load-btn"
              onClick={() => setVisibleCount(prev => Math.min(prev + pageSize, commits.length))}
            >
              <ChevronDown size={12} />
              Load more ({commits.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="gg-tooltip"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  )
}
