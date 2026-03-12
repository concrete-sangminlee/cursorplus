import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { GitCommit, GitBranch, Tag, ChevronDown, Search, ZoomIn, ZoomOut, Copy, Check, X, User } from 'lucide-react'

// ── Types ────────────────────────────────────────────────

export interface GitGraphCommit {
  hash: string
  shortHash: string
  subject: string
  body?: string
  author: string
  authorEmail?: string
  date: string
  timestamp?: number
  parents?: string[]
  refs?: string[]        // e.g. "HEAD -> main", "origin/main", "tag: v1.0"
  changedFiles?: number
}

export interface GitGraphProps {
  commits: GitGraphCommit[]
  currentHash?: string
  onCommitClick?: (hash: string) => void
  onCommitDoubleClick?: (hash: string) => void
  onCherryPick?: (hash: string) => void
  onRevert?: (hash: string) => void
  onCreateBranch?: (hash: string) => void
  onResetTo?: (hash: string) => void
  pageSize?: number
}

// ── Branch color palette ─────────────────────────────────

const BRANCH_COLORS = [
  'var(--gg-color-blue, #58a6ff)',
  'var(--gg-color-green, #3fb950)',
  'var(--gg-color-purple, #d2a8ff)',
  'var(--gg-color-orange, #f0883e)',
  'var(--gg-color-pink, #f778ba)',
  'var(--gg-color-lightblue, #79c0ff)',
  'var(--gg-color-yellow, #d29922)',
  'var(--gg-color-cyan, #56d4dd)',
]

// Raw hex fallbacks for computed usage (SVG inline styles)
const BRANCH_COLORS_RAW = [
  '#58a6ff', '#3fb950', '#d2a8ff', '#f0883e',
  '#f778ba', '#79c0ff', '#d29922', '#56d4dd',
]

const KNOWN_BRANCH_COLORS: Record<string, number> = {
  main: 0,
  master: 0,
  develop: 2,
  dev: 2,
}

// ── Inject styles ────────────────────────────────────────

const styleId = 'git-graph-styles'
if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `
    /* ── CSS Variables for theming ── */
    :root {
      --gg-bg: #1e1e2e;
      --gg-bg-hover: rgba(255,255,255,0.04);
      --gg-bg-selected: rgba(88,166,255,0.08);
      --gg-bg-tooltip: #1e1e2e;
      --gg-bg-detail: #161622;
      --gg-bg-context: #252536;
      --gg-border: rgba(255,255,255,0.12);
      --gg-border-focus: rgba(88,166,255,0.5);
      --gg-text-primary: #e1e4e8;
      --gg-text-muted: #8b949e;
      --gg-text-accent: #58a6ff;
      --gg-font-family: 'Segoe UI', system-ui, sans-serif;
      --gg-font-mono: 'Cascadia Code', 'Fira Code', monospace;
      --gg-color-blue: #58a6ff;
      --gg-color-green: #3fb950;
      --gg-color-purple: #d2a8ff;
      --gg-color-orange: #f0883e;
      --gg-color-pink: #f778ba;
      --gg-color-lightblue: #79c0ff;
      --gg-color-yellow: #d29922;
      --gg-color-cyan: #56d4dd;
      --gg-color-tag: #d29922;
      --gg-color-head: #58a6ff;
      --gg-color-danger: #f85149;
      --gg-row-height: 40px;
      --gg-node-radius: 5px;
    }

    .gg-root {
      font-family: var(--gg-font-family);
      font-size: 12px;
      color: var(--gg-text-primary);
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
      user-select: none;
    }

    /* ── Toolbar ── */
    .gg-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--gg-border);
      flex-shrink: 0;
    }
    .gg-search-wrap {
      flex: 1;
      position: relative;
      display: flex;
      align-items: center;
    }
    .gg-search-icon {
      position: absolute;
      left: 8px;
      color: var(--gg-text-muted);
      pointer-events: none;
    }
    .gg-search-input {
      width: 100%;
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--gg-border);
      border-radius: 4px;
      color: var(--gg-text-primary);
      font-size: 11px;
      padding: 4px 28px 4px 28px;
      outline: none;
      font-family: var(--gg-font-family);
      transition: border-color 0.15s;
    }
    .gg-search-input:focus {
      border-color: var(--gg-border-focus);
    }
    .gg-search-input::placeholder {
      color: var(--gg-text-muted);
      opacity: 0.7;
    }
    .gg-search-clear {
      position: absolute;
      right: 4px;
      background: none;
      border: none;
      color: var(--gg-text-muted);
      cursor: pointer;
      padding: 2px;
      display: flex;
      align-items: center;
      border-radius: 2px;
    }
    .gg-search-clear:hover {
      color: var(--gg-text-primary);
    }
    .gg-search-count {
      font-size: 10px;
      color: var(--gg-text-muted);
      white-space: nowrap;
      padding: 0 4px;
    }
    .gg-zoom-btn {
      background: none;
      border: 1px solid var(--gg-border);
      color: var(--gg-text-muted);
      cursor: pointer;
      padding: 3px 6px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s, color 0.12s;
    }
    .gg-zoom-btn:hover {
      background: rgba(255,255,255,0.06);
      color: var(--gg-text-primary);
    }
    .gg-zoom-label {
      font-size: 10px;
      color: var(--gg-text-muted);
      min-width: 32px;
      text-align: center;
    }

    /* ── Scroll area ── */
    .gg-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      position: relative;
    }
    .gg-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
    .gg-scroll::-webkit-scrollbar-track { background: transparent; }
    .gg-scroll::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.12);
      border-radius: 3px;
    }
    .gg-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.2);
    }

    .gg-graph-body {
      transform-origin: top left;
    }

    /* ── Row ── */
    .gg-row {
      display: flex;
      align-items: stretch;
      cursor: pointer;
      transition: background 0.1s;
      position: relative;
    }
    .gg-row:hover {
      background: var(--gg-bg-hover);
    }
    .gg-row.gg-selected {
      background: var(--gg-bg-selected);
    }
    .gg-row.gg-search-match {
      background: rgba(210,169,34,0.08);
    }
    .gg-row.gg-search-match.gg-selected {
      background: rgba(210,169,34,0.14);
    }

    .gg-graph-col {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
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
      background: var(--gg-color-head);
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

    .gg-tag-pill {
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
      color: var(--gg-color-tag);
      border-color: rgba(210,153,34,0.27);
      background: rgba(210,153,34,0.08);
    }
    .gg-tag-pill svg {
      flex-shrink: 0;
    }

    .gg-subject {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--gg-text-primary);
      font-weight: 400;
      min-width: 0;
    }

    .gg-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      color: var(--gg-text-muted);
    }

    .gg-hash {
      font-family: var(--gg-font-mono);
      color: var(--gg-text-accent);
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

    .gg-merge-indicator {
      font-size: 10px;
      color: var(--gg-text-muted);
      font-style: italic;
    }

    /* ── Commit detail panel ── */
    .gg-detail-overlay {
      position: absolute;
      top: 0; right: 0; bottom: 0;
      width: 380px;
      max-width: 100%;
      background: var(--gg-bg-detail);
      border-left: 1px solid var(--gg-border);
      z-index: 100;
      display: flex;
      flex-direction: column;
      box-shadow: -4px 0 20px rgba(0,0,0,0.3);
      animation: gg-slide-in 0.15s ease-out;
    }
    @keyframes gg-slide-in {
      from { transform: translateX(20px); opacity: 0; }
      to   { transform: translateX(0); opacity: 1; }
    }
    .gg-detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid var(--gg-border);
    }
    .gg-detail-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--gg-text-primary);
    }
    .gg-detail-close {
      background: none;
      border: none;
      color: var(--gg-text-muted);
      cursor: pointer;
      padding: 2px;
      border-radius: 3px;
      display: flex;
    }
    .gg-detail-close:hover {
      background: rgba(255,255,255,0.08);
      color: var(--gg-text-primary);
    }
    .gg-detail-body {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .gg-detail-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .gg-detail-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--gg-text-muted);
    }
    .gg-detail-value {
      font-size: 12px;
      color: var(--gg-text-primary);
      line-height: 1.5;
    }
    .gg-detail-hash-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .gg-detail-hash {
      font-family: var(--gg-font-mono);
      font-size: 11px;
      color: var(--gg-text-accent);
      cursor: pointer;
      padding: 2px 4px;
      border-radius: 3px;
      transition: background 0.12s;
      word-break: break-all;
    }
    .gg-detail-hash:hover {
      background: rgba(88,166,255,0.1);
    }
    .gg-copy-btn {
      background: none;
      border: 1px solid var(--gg-border);
      color: var(--gg-text-muted);
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 3px;
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 10px;
      transition: background 0.12s, color 0.12s;
      flex-shrink: 0;
    }
    .gg-copy-btn:hover {
      background: rgba(255,255,255,0.06);
      color: var(--gg-text-primary);
    }
    .gg-detail-author-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .gg-avatar-placeholder {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .gg-avatar-info {
      display: flex;
      flex-direction: column;
      gap: 1px;
    }
    .gg-avatar-name {
      font-size: 12px;
      color: var(--gg-text-primary);
      font-weight: 500;
    }
    .gg-avatar-email {
      font-size: 10px;
      color: var(--gg-text-muted);
    }
    .gg-detail-message {
      font-size: 12px;
      color: var(--gg-text-primary);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      background: rgba(255,255,255,0.03);
      padding: 8px 10px;
      border-radius: 4px;
      border: 1px solid var(--gg-border);
    }
    .gg-detail-parents {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .gg-parent-hash {
      font-family: var(--gg-font-mono);
      font-size: 10px;
      color: var(--gg-text-accent);
      background: rgba(88,166,255,0.08);
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .gg-parent-hash:hover {
      background: rgba(88,166,255,0.16);
    }
    .gg-detail-stat {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .gg-detail-stat-badge {
      font-size: 11px;
      font-weight: 600;
      padding: 1px 8px;
      border-radius: 8px;
      background: rgba(255,255,255,0.06);
      color: var(--gg-text-primary);
    }
    .gg-detail-refs-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    /* ── Context menu ── */
    .gg-context-menu {
      position: fixed;
      z-index: 10000;
      background: var(--gg-bg-context);
      border: 1px solid var(--gg-border);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.45);
      padding: 4px 0;
      min-width: 180px;
      animation: gg-ctx-in 0.1s ease-out;
    }
    @keyframes gg-ctx-in {
      from { opacity: 0; transform: scale(0.95); }
      to   { opacity: 1; transform: scale(1); }
    }
    .gg-ctx-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      font-size: 12px;
      color: var(--gg-text-primary);
      cursor: pointer;
      transition: background 0.1s;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-family: var(--gg-font-family);
    }
    .gg-ctx-item:hover {
      background: rgba(255,255,255,0.06);
    }
    .gg-ctx-item.gg-ctx-danger {
      color: var(--gg-color-danger);
    }
    .gg-ctx-item.gg-ctx-danger:hover {
      background: rgba(248,81,73,0.1);
    }
    .gg-ctx-sep {
      height: 1px;
      background: var(--gg-border);
      margin: 4px 0;
    }
    .gg-ctx-hash {
      font-family: var(--gg-font-mono);
      font-size: 10px;
      color: var(--gg-text-muted);
      margin-left: auto;
    }

    /* ── Tooltip ── */
    .gg-tooltip {
      position: fixed;
      z-index: 9999;
      max-width: 400px;
      padding: 8px 12px;
      background: var(--gg-bg-tooltip);
      border: 1px solid var(--gg-border);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      font-size: 12px;
      color: var(--gg-text-primary);
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
      border: 1px solid var(--gg-border);
      color: var(--gg-text-muted);
      padding: 4px 14px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      font-family: var(--gg-font-family);
      transition: background 0.12s, color 0.12s, border-color 0.12s;
    }
    .gg-load-btn:hover {
      background: rgba(255,255,255,0.06);
      color: var(--gg-text-primary);
      border-color: rgba(255,255,255,0.2);
    }

    .gg-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--gg-text-muted);
      gap: 8px;
    }
  `
  document.head.appendChild(style)
}

// ── Relative date helper ─────────────────────────────────

function relativeDate(dateStr: string, timestamp?: number): string {
  try {
    const d = timestamp ? new Date(timestamp * 1000) : new Date(dateStr)
    const now = Date.now()
    const diffMs = now - d.getTime()
    if (diffMs < 0) return dateStr

    const sec = Math.floor(diffMs / 1000)
    if (sec < 60) return 'just now'
    const min = Math.floor(sec / 60)
    if (min < 60) return `${min}m ago`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h ago`
    const days = Math.floor(hr / 24)
    if (days < 30) return `${days}d ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo ago`
    const years = Math.floor(months / 12)
    return `${years}y ago`
  } catch {
    return dateStr
  }
}

function absoluteDate(dateStr: string, timestamp?: number): string {
  try {
    const d = timestamp ? new Date(timestamp * 1000) : new Date(dateStr)
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

// ── Graph layout helpers ─────────────────────────────────

interface Lane {
  hash: string
  color: number // index into BRANCH_COLORS
}

interface GraphNode {
  column: number
  colorIndex: number
  isMerge: boolean
  mergeParentCols: { col: number; colorIndex: number }[]
  continuations: { col: number; colorIndex: number }[]
  totalLanesAtRow: number
}

function buildGraphLayout(commits: GitGraphCommit[]): GraphNode[] {
  const nodes: GraphNode[] = []
  // Each lane tracks which commit hash it is heading toward, plus its color index
  let lanes: ({ hash: string; colorIndex: number } | null)[] = []
  let nextColorIndex = 1 // 0 reserved for main/master

  const hashToColorIndex = new Map<string, number>()

  const assignColor = (hash: string, branchHint?: string): number => {
    if (hashToColorIndex.has(hash)) return hashToColorIndex.get(hash)!
    if (branchHint && KNOWN_BRANCH_COLORS[branchHint] !== undefined) {
      const ci = KNOWN_BRANCH_COLORS[branchHint]
      hashToColorIndex.set(hash, ci)
      return ci
    }
    const ci = nextColorIndex % BRANCH_COLORS.length
    nextColorIndex++
    hashToColorIndex.set(hash, ci)
    return ci
  }

  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    const parents = commit.parents ?? []
    const isMerge = parents.length > 1

    // Detect branch hint from refs
    let branchHint: string | undefined
    if (commit.refs) {
      for (const r of commit.refs) {
        const t = r.trim()
        const headMatch = t.match(/^HEAD -> (.+)/)
        const name = headMatch ? headMatch[1] : (!t.startsWith('tag:') && !t.includes('/') ? t : undefined)
        if (name && KNOWN_BRANCH_COLORS[name] !== undefined) {
          branchHint = name
          break
        }
      }
    }

    // Find which lane this commit occupies
    let col = lanes.findIndex(l => l !== null && l.hash === commit.hash)
    let inheritedColor: number | undefined
    if (col !== -1) {
      inheritedColor = lanes[col]!.colorIndex
    } else {
      // New lane
      col = lanes.findIndex(l => l === null)
      if (col === -1) {
        col = lanes.length
        lanes.push(null)
      }
    }

    const colorIndex = inheritedColor ?? assignColor(commit.hash, branchHint)
    hashToColorIndex.set(commit.hash, colorIndex)

    // First parent inherits this lane
    if (parents.length > 0) {
      const parentColor = hashToColorIndex.get(parents[0]) ?? colorIndex
      lanes[col] = { hash: parents[0], colorIndex: parentColor }
      if (!hashToColorIndex.has(parents[0])) {
        hashToColorIndex.set(parents[0], colorIndex)
      }
    } else {
      lanes[col] = null
    }

    // Additional parents (merge) get their own lanes
    const mergeParentCols: { col: number; colorIndex: number }[] = []
    for (let p = 1; p < parents.length; p++) {
      const parentHash = parents[p]
      const existingLane = lanes.findIndex(l => l !== null && l.hash === parentHash)
      if (existingLane !== -1) {
        mergeParentCols.push({ col: existingLane, colorIndex: lanes[existingLane]!.colorIndex })
      } else {
        let mergeLane = -1
        // Find empty lane to the right of col
        for (let s = col + 1; s < lanes.length; s++) {
          if (lanes[s] === null) { mergeLane = s; break }
        }
        if (mergeLane === -1) {
          mergeLane = lanes.length
          lanes.push(null)
        }
        const pc = assignColor(parentHash)
        lanes[mergeLane] = { hash: parentHash, colorIndex: pc }
        mergeParentCols.push({ col: mergeLane, colorIndex: pc })
      }
    }

    // Close duplicate lanes pointing at same hash (minimize crossings)
    const seen = new Map<string, number>()
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] === null) continue
      const h = lanes[l]!.hash
      if (seen.has(h)) {
        // Keep the leftmost, close this one
        lanes[l] = null
      } else {
        seen.set(h, l)
      }
    }

    // Gather continuations
    const continuations: { col: number; colorIndex: number }[] = []
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] !== null && l !== col) {
        continuations.push({ col: l, colorIndex: lanes[l]!.colorIndex })
      }
    }

    // Trim trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop()
    }

    nodes.push({
      column: col,
      colorIndex,
      isMerge,
      mergeParentCols,
      continuations,
      totalLanesAtRow: lanes.length || 1,
    })
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
      // detached HEAD, skip
    } else {
      parsed.push({ type: 'branch', name: trimmed, isHead: false })
    }
  }
  return parsed
}

function getRefColorIndex(name: string): number {
  const base = name.replace(/^origin\//, '')
  if (KNOWN_BRANCH_COLORS[base] !== undefined) return KNOWN_BRANCH_COLORS[base]
  let h = 0
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0
  return Math.abs(h) % BRANCH_COLORS.length
}

// ── SVG graph column ─────────────────────────────────────

const COL_WIDTH = 16
const NODE_RADIUS = 5
const MERGE_DIAMOND = 6
const GRAPH_LEFT_PAD = 12

interface GraphColumnProps {
  node: GraphNode
  nextNode?: GraphNode
  rowHeight: number
  totalLanes: number
}

function GraphColumn({ node, nextNode, rowHeight, totalLanes }: GraphColumnProps) {
  const width = Math.max(40, GRAPH_LEFT_PAD + totalLanes * COL_WIDTH + 8)
  const cx = GRAPH_LEFT_PAD + node.column * COL_WIDTH
  const cy = rowHeight / 2

  return (
    <svg
      width={width}
      height={rowHeight}
      style={{ display: 'block', flexShrink: 0 }}
      shapeRendering="geometricPrecision"
    >
      {/* Continuation lines (lanes passing through) */}
      {node.continuations.map(({ col, colorIndex }) => {
        const lx = GRAPH_LEFT_PAD + col * COL_WIDTH
        return (
          <line
            key={`cont-${col}`}
            x1={lx} y1={0}
            x2={lx} y2={rowHeight}
            stroke={BRANCH_COLORS_RAW[colorIndex]}
            strokeWidth={1.5}
            strokeOpacity={0.35}
          />
        )
      })}

      {/* Primary line down from this commit to next row */}
      {nextNode && (
        (() => {
          const nx = GRAPH_LEFT_PAD + nextNode.column * COL_WIDTH
          const ny = rowHeight
          if (node.column === nextNode.column) {
            // Straight vertical
            return (
              <line
                x1={cx} y1={cy}
                x2={nx} y2={ny}
                stroke={BRANCH_COLORS_RAW[node.colorIndex]}
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
            )
          }
          // Bezier curve for lane changes
          return (
            <path
              d={`M ${cx} ${cy} C ${cx} ${cy + rowHeight * 0.4}, ${nx} ${ny - rowHeight * 0.4}, ${nx} ${ny}`}
              fill="none"
              stroke={BRANCH_COLORS_RAW[node.colorIndex]}
              strokeWidth={1.5}
              strokeOpacity={0.6}
            />
          )
        })()
      )}

      {/* Line from this node up (own lane) */}
      <line
        x1={cx} y1={0}
        x2={cx} y2={cy}
        stroke={BRANCH_COLORS_RAW[node.colorIndex]}
        strokeWidth={1.5}
        strokeOpacity={0.6}
      />

      {/* Merge lines (bezier curves to merge parent lanes) */}
      {node.mergeParentCols.map(({ col, colorIndex }, idx) => {
        const mx = GRAPH_LEFT_PAD + col * COL_WIDTH
        return (
          <path
            key={`merge-${idx}`}
            d={`M ${cx} ${cy} C ${cx} ${cy + rowHeight * 0.35}, ${mx} ${rowHeight - rowHeight * 0.35}, ${mx} ${rowHeight}`}
            fill="none"
            stroke={BRANCH_COLORS_RAW[colorIndex]}
            strokeWidth={1.5}
            strokeOpacity={0.5}
          />
        )
      })}

      {/* Commit node */}
      {node.isMerge ? (
        /* Diamond shape for merge commits */
        <g>
          <polygon
            points={`${cx},${cy - MERGE_DIAMOND} ${cx + MERGE_DIAMOND},${cy} ${cx},${cy + MERGE_DIAMOND} ${cx - MERGE_DIAMOND},${cy}`}
            fill="#1e1e2e"
            stroke={BRANCH_COLORS_RAW[node.colorIndex]}
            strokeWidth={2}
          />
          <polygon
            points={`${cx},${cy - 2.5} ${cx + 2.5},${cy} ${cx},${cy + 2.5} ${cx - 2.5},${cy}`}
            fill={BRANCH_COLORS_RAW[node.colorIndex]}
          />
        </g>
      ) : (
        <circle
          cx={cx} cy={cy} r={NODE_RADIUS}
          fill={BRANCH_COLORS_RAW[node.colorIndex]}
        />
      )}

      {/* HEAD ring */}
      {/* (drawn by parent based on isHead) */}
    </svg>
  )
}

function GraphColumnHead({ node, rowHeight, totalLanes }: { node: GraphNode; rowHeight: number; totalLanes: number }) {
  // Overlay ring for HEAD commits
  const width = Math.max(40, GRAPH_LEFT_PAD + totalLanes * COL_WIDTH + 8)
  const cx = GRAPH_LEFT_PAD + node.column * COL_WIDTH
  const cy = rowHeight / 2
  return (
    <svg
      width={width}
      height={rowHeight}
      style={{ display: 'block', flexShrink: 0, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
      shapeRendering="geometricPrecision"
    >
      <circle cx={cx} cy={cy} r={NODE_RADIUS + 3} fill="none" stroke={BRANCH_COLORS_RAW[node.colorIndex]} strokeWidth={2} strokeOpacity={0.8} />
    </svg>
  )
}

// ── Context menu type ────────────────────────────────────

interface ContextMenuState {
  x: number
  y: number
  hash: string
  shortHash: string
}

// ── Main component ───────────────────────────────────────

export default function GitGraph({
  commits,
  currentHash,
  onCommitClick,
  onCommitDoubleClick,
  onCherryPick,
  onRevert,
  onCreateBranch,
  onResetTo,
  pageSize = 50,
}: GitGraphProps) {
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [detailHash, setDetailHash] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [zoomLevel, setZoomLevel] = useState(1)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const doubleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickCount = useRef(0)

  // Search filtering
  const searchLower = searchQuery.toLowerCase().trim()
  const matchingHashes = useMemo(() => {
    if (!searchLower) return new Set<string>()
    const set = new Set<string>()
    for (const c of commits) {
      if (
        c.subject.toLowerCase().includes(searchLower) ||
        c.author.toLowerCase().includes(searchLower) ||
        c.hash.toLowerCase().startsWith(searchLower) ||
        c.shortHash.toLowerCase().startsWith(searchLower) ||
        (c.body && c.body.toLowerCase().includes(searchLower))
      ) {
        set.add(c.hash)
      }
    }
    return set
  }, [commits, searchLower])

  const visibleCommits = useMemo(() => commits.slice(0, visibleCount), [commits, visibleCount])
  const graphNodes = useMemo(() => buildGraphLayout(visibleCommits), [visibleCommits])
  const totalLanes = useMemo(
    () => graphNodes.reduce((max, n) => {
      const allCols = [n.column, ...n.mergeParentCols.map(m => m.col), ...n.continuations.map(c => c.col)]
      return Math.max(max, ...allCols.map(c => c + 1))
    }, 1),
    [graphNodes]
  )

  const rowHeight = Math.round(40 * zoomLevel)
  const hasMore = visibleCount < commits.length

  // Detail commit
  const detailCommit = useMemo(
    () => detailHash ? commits.find(c => c.hash === detailHash) : null,
    [detailHash, commits]
  )

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

  // Row click / double-click
  const handleRowClick = useCallback((hash: string) => {
    clickCount.current++
    if (clickCount.current === 1) {
      doubleClickTimer.current = setTimeout(() => {
        // Single click
        clickCount.current = 0
        setSelectedHash(hash)
        setDetailHash(hash)
        onCommitClick?.(hash)
      }, 250)
    } else {
      // Double click
      clickCount.current = 0
      if (doubleClickTimer.current) clearTimeout(doubleClickTimer.current)
      setSelectedHash(hash)
      setDetailHash(hash)
      onCommitDoubleClick?.(hash)
    }
  }, [onCommitClick, onCommitDoubleClick])

  // Right-click
  const handleContextMenu = useCallback((e: React.MouseEvent, hash: string, shortHash: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, hash, shortHash })
  }, [])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [contextMenu])

  const showTooltip = useCallback((e: React.MouseEvent, commit: GitGraphCommit) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    tooltipTimer.current = setTimeout(() => {
      const rel = relativeDate(commit.date, commit.timestamp)
      const abs = absoluteDate(commit.date, commit.timestamp)
      const lines = [
        commit.subject,
        '',
        `${commit.author} - ${rel} (${abs})`,
        commit.shortHash,
      ]
      if (commit.parents && commit.parents.length > 1) {
        lines.push(`Merge: ${commit.parents.map(p => p.slice(0, 7)).join(' + ')}`)
      }
      setTooltip({ text: lines.join('\n'), x: e.clientX + 12, y: e.clientY - 8 })
    }, 500)
  }, [])

  const hideTooltip = useCallback(() => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    setTooltip(null)
  }, [])

  // Copy hash helper
  const copyHash = useCallback(async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash)
      setCopiedHash(hash)
      setTimeout(() => setCopiedHash(null), 1500)
    } catch { /* clipboard not available */ }
  }, [])

  // Zoom
  const zoomIn = useCallback(() => setZoomLevel(z => Math.min(z + 0.15, 2)), [])
  const zoomOut = useCallback(() => setZoomLevel(z => Math.max(z - 0.15, 0.5)), [])

  // Keyboard zoom with Ctrl+scroll
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        if (e.deltaY < 0) setZoomLevel(z => Math.min(z + 0.08, 2))
        else setZoomLevel(z => Math.max(z - 0.08, 0.5))
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
      if (doubleClickTimer.current) clearTimeout(doubleClickTimer.current)
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

  const detailRefs = detailCommit ? parseRefs(detailCommit.refs) : []

  return (
    <div className="gg-root">
      {/* ── Toolbar: search + zoom ── */}
      <div className="gg-toolbar">
        <div className="gg-search-wrap">
          <Search size={12} className="gg-search-icon" />
          <input
            className="gg-search-input"
            type="text"
            placeholder="Search by message, author, or hash..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            spellCheck={false}
          />
          {searchQuery && (
            <button className="gg-search-clear" onClick={() => setSearchQuery('')}>
              <X size={12} />
            </button>
          )}
        </div>
        {searchLower && (
          <span className="gg-search-count">
            {matchingHashes.size} match{matchingHashes.size !== 1 ? 'es' : ''}
          </span>
        )}
        <button className="gg-zoom-btn" onClick={zoomOut} title="Zoom out"><ZoomOut size={13} /></button>
        <span className="gg-zoom-label">{Math.round(zoomLevel * 100)}%</span>
        <button className="gg-zoom-btn" onClick={zoomIn} title="Zoom in"><ZoomIn size={13} /></button>
      </div>

      {/* ── Main scroll area ── */}
      <div className="gg-scroll" ref={scrollRef} style={{ display: 'flex' }}>
        <div className="gg-graph-body" style={{ flex: detailHash ? '1 1 0' : '1 1 auto', minWidth: 0, overflow: 'hidden' }}>
          {visibleCommits.map((commit, i) => {
            const node = graphNodes[i]
            const nextNode = i < graphNodes.length - 1 ? graphNodes[i + 1] : undefined
            const isHead = commit.hash === currentHash || commit.shortHash === currentHash
            const isSelected = selectedHash === commit.hash
            const isMatch = searchLower ? matchingHashes.has(commit.hash) : false
            const refs = parseRefs(commit.refs)
            const rel = relativeDate(commit.date, commit.timestamp)

            return (
              <div
                key={commit.hash}
                className={`gg-row${isSelected ? ' gg-selected' : ''}${isMatch ? ' gg-search-match' : ''}`}
                style={{ minHeight: rowHeight }}
                onClick={() => handleRowClick(commit.hash)}
                onContextMenu={(e) => handleContextMenu(e, commit.hash, commit.shortHash)}
                onMouseMove={(e) => showTooltip(e, commit)}
                onMouseLeave={hideTooltip}
              >
                {/* Graph column */}
                <div className="gg-graph-col" style={{ width: Math.max(40, GRAPH_LEFT_PAD + totalLanes * COL_WIDTH + 8) }}>
                  <GraphColumn
                    node={node}
                    nextNode={nextNode}
                    rowHeight={rowHeight}
                    totalLanes={totalLanes}
                  />
                  {isHead && <GraphColumnHead node={node} rowHeight={rowHeight} totalLanes={totalLanes} />}
                </div>

                {/* Commit info */}
                <div className="gg-info">
                  <div className="gg-subject-row">
                    {isHead && (
                      <span className="gg-head-badge">
                        <GitBranch size={10} /> HEAD
                      </span>
                    )}

                    {/* Branch ref pills */}
                    {refs.filter(r => r.type !== 'tag').map((ref, ri) => {
                      const ci = ref.isHead ? 0 : getRefColorIndex(ref.name)
                      const refColor = BRANCH_COLORS_RAW[ci]
                      return (
                        <span
                          key={`ref-${ri}`}
                          className="gg-ref-pill"
                          style={{
                            color: refColor,
                            borderColor: `${refColor}44`,
                            background: `${refColor}15`,
                          }}
                        >
                          <GitBranch size={9} />
                          {ref.name}
                        </span>
                      )
                    })}

                    {/* Tag pills */}
                    {refs.filter(r => r.type === 'tag').map((ref, ri) => (
                      <span key={`tag-${ri}`} className="gg-tag-pill">
                        <Tag size={9} />
                        {ref.name}
                      </span>
                    ))}

                    <span className="gg-subject">{commit.subject}</span>

                    {node.isMerge && (
                      <span className="gg-merge-indicator">merge</span>
                    )}
                  </div>

                  <div className="gg-meta">
                    <span className="gg-hash">{commit.shortHash}</span>
                    <span className="gg-author">{commit.author}</span>
                    <span className="gg-date">{rel}</span>
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

        {/* ── Detail panel ── */}
        {detailCommit && detailHash && (
          <div className="gg-detail-overlay">
            <div className="gg-detail-header">
              <span className="gg-detail-title">Commit Details</span>
              <button className="gg-detail-close" onClick={() => setDetailHash(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="gg-detail-body">
              {/* Hash */}
              <div className="gg-detail-section">
                <span className="gg-detail-label">Commit</span>
                <div className="gg-detail-hash-row">
                  <span
                    className="gg-detail-hash"
                    onClick={() => copyHash(detailCommit.hash)}
                    title="Click to copy full hash"
                  >
                    {detailCommit.hash}
                  </span>
                  <button className="gg-copy-btn" onClick={() => copyHash(detailCommit.hash)}>
                    {copiedHash === detailCommit.hash ? <Check size={10} /> : <Copy size={10} />}
                    {copiedHash === detailCommit.hash ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Author */}
              <div className="gg-detail-section">
                <span className="gg-detail-label">Author</span>
                <div className="gg-detail-author-row">
                  <div className="gg-avatar-placeholder">
                    <User size={14} style={{ color: 'var(--gg-text-muted)' }} />
                  </div>
                  <div className="gg-avatar-info">
                    <span className="gg-avatar-name">{detailCommit.author}</span>
                    {detailCommit.authorEmail && (
                      <span className="gg-avatar-email">{detailCommit.authorEmail}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Date */}
              <div className="gg-detail-section">
                <span className="gg-detail-label">Date</span>
                <span className="gg-detail-value">
                  {relativeDate(detailCommit.date, detailCommit.timestamp)} &mdash; {absoluteDate(detailCommit.date, detailCommit.timestamp)}
                </span>
              </div>

              {/* Message */}
              <div className="gg-detail-section">
                <span className="gg-detail-label">Message</span>
                <div className="gg-detail-message">
                  {detailCommit.subject}
                  {detailCommit.body ? `\n\n${detailCommit.body}` : ''}
                </div>
              </div>

              {/* Refs */}
              {detailRefs.length > 0 && (
                <div className="gg-detail-section">
                  <span className="gg-detail-label">References</span>
                  <div className="gg-detail-refs-row">
                    {detailRefs.map((ref, ri) => {
                      if (ref.type === 'tag') {
                        return (
                          <span key={ri} className="gg-tag-pill">
                            <Tag size={9} /> {ref.name}
                          </span>
                        )
                      }
                      const ci = ref.isHead ? 0 : getRefColorIndex(ref.name)
                      const refColor = BRANCH_COLORS_RAW[ci]
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
                          <GitBranch size={9} /> {ref.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Changed files */}
              {detailCommit.changedFiles !== undefined && (
                <div className="gg-detail-section">
                  <span className="gg-detail-label">Changed Files</span>
                  <div className="gg-detail-stat">
                    <span className="gg-detail-stat-badge">{detailCommit.changedFiles} file{detailCommit.changedFiles !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              )}

              {/* Parents */}
              {detailCommit.parents && detailCommit.parents.length > 0 && (
                <div className="gg-detail-section">
                  <span className="gg-detail-label">Parent{detailCommit.parents.length > 1 ? 's' : ''}</span>
                  <div className="gg-detail-parents">
                    {detailCommit.parents.map((p, pi) => (
                      <span
                        key={pi}
                        className="gg-parent-hash"
                        onClick={() => {
                          setSelectedHash(p)
                          setDetailHash(p)
                          onCommitClick?.(p)
                        }}
                        title={`Navigate to ${p}`}
                      >
                        {p.slice(0, 7)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Context menu ── */}
      {contextMenu && (
        <div
          className="gg-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="gg-ctx-item"
            onClick={() => { copyHash(contextMenu.hash); setContextMenu(null) }}
          >
            <Copy size={12} /> Copy hash
            <span className="gg-ctx-hash">{contextMenu.shortHash}</span>
          </button>
          <div className="gg-ctx-sep" />
          <button
            className="gg-ctx-item"
            onClick={() => { onCherryPick?.(contextMenu.hash); setContextMenu(null) }}
          >
            <GitCommit size={12} /> Cherry-pick
          </button>
          <button
            className="gg-ctx-item"
            onClick={() => { onCreateBranch?.(contextMenu.hash); setContextMenu(null) }}
          >
            <GitBranch size={12} /> Create branch from here
          </button>
          <div className="gg-ctx-sep" />
          <button
            className="gg-ctx-item"
            onClick={() => { onRevert?.(contextMenu.hash); setContextMenu(null) }}
          >
            <X size={12} /> Revert this commit
          </button>
          <button
            className="gg-ctx-item gg-ctx-danger"
            onClick={() => { onResetTo?.(contextMenu.hash); setContextMenu(null) }}
          >
            <X size={12} /> Reset to this commit
          </button>
        </div>
      )}

      {/* ── Tooltip ── */}
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
