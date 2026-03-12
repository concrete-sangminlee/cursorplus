import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FileText,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Download,
  Upload,
  Settings,
  RefreshCw,
  Filter,
  Search,
  GitBranch,
  Flame,
  Target,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Hash,
  Code,
  Layers,
  Activity,
  Percent,
  FileCode,
  ChevronUp,
  ToggleLeft,
  ToggleRight,
  List,
  Grid,
  Copy,
  ExternalLink,
  Info,
  Zap,
  Shield,
  Award,
  Image,
  Clock,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface CoverageMetrics {
  lines: { covered: number; total: number; pct: number };
  branches: { covered: number; total: number; pct: number };
  functions: { covered: number; total: number; pct: number };
  statements: { covered: number; total: number; pct: number };
}

interface UncoveredLine {
  line: number;
  content: string;
  type: 'line' | 'branch' | 'function';
}

interface FunctionCoverage {
  name: string;
  startLine: number;
  endLine: number;
  hits: number;
  branches: { covered: number; total: number };
}

interface FileCoverageData {
  id: string;
  path: string;
  name: string;
  metrics: CoverageMetrics;
  uncoveredLines: UncoveredLine[];
  functions: FunctionCoverage[];
  recentlyChanged?: boolean;
  sparkline: number[];
}

interface FolderCoverageData {
  id: string;
  name: string;
  path: string;
  children: (FolderCoverageData | FileCoverageData)[];
  metrics: CoverageMetrics;
}

interface CoverageReport {
  id: string;
  timestamp: Date;
  commit: string;
  branch: string;
  overall: CoverageMetrics;
  tree: FolderCoverageData;
}

interface CoverageThresholds {
  lines: { warn: number; fail: number };
  branches: { warn: number; fail: number };
  functions: { warn: number; fail: number };
  statements: { warn: number; fail: number };
}

interface TrendPoint {
  runId: string;
  timestamp: Date;
  commit: string;
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

type ViewMode = 'summary' | 'tree' | 'heatmap' | 'diff' | 'functions' | 'uncovered' | 'badges';
type ImportFormat = 'lcov' | 'istanbul' | 'cobertura';

// ── Helpers ─────────────────────────────────────────────────────────────────

function isFolder(node: FolderCoverageData | FileCoverageData): node is FolderCoverageData {
  return 'children' in node;
}

function getCoverageColor(pct: number, thresholds: CoverageThresholds['lines']): string {
  if (pct >= thresholds.warn) return 'var(--vscode-testing-iconPassed, #4ec969)';
  if (pct >= thresholds.fail) return 'var(--vscode-editorWarning-foreground, #cca700)';
  return 'var(--vscode-testing-iconFailed, #f14c4c)';
}

function getCoverageColorSimple(pct: number): string {
  if (pct >= 80) return '#4ec969';
  if (pct >= 50) return '#cca700';
  return '#f14c4c';
}

function getHeatmapColor(pct: number): string {
  if (pct >= 90) return 'rgba(78, 201, 105, 0.35)';
  if (pct >= 80) return 'rgba(78, 201, 105, 0.20)';
  if (pct >= 70) return 'rgba(204, 167, 0, 0.20)';
  if (pct >= 60) return 'rgba(204, 167, 0, 0.30)';
  if (pct >= 50) return 'rgba(204, 167, 0, 0.40)';
  if (pct >= 40) return 'rgba(241, 76, 76, 0.20)';
  if (pct >= 30) return 'rgba(241, 76, 76, 0.30)';
  return 'rgba(241, 76, 76, 0.45)';
}

function formatPct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function generateSparkline(basePct: number, points: number = 10): number[] {
  const data: number[] = [];
  let current = basePct - (Math.random() * 12);
  for (let i = 0; i < points; i++) {
    current += (Math.random() - 0.35) * 4;
    current = Math.max(0, Math.min(100, current));
    data.push(Math.round(current * 10) / 10);
  }
  data[points - 1] = basePct;
  return data;
}

function getBadgeHexColor(pct: number): string {
  if (pct >= 90) return '#4c1';
  if (pct >= 80) return '#97ca00';
  if (pct >= 70) return '#a4a61d';
  if (pct >= 60) return '#dfb317';
  if (pct >= 50) return '#fe7d37';
  return '#e05d44';
}

function generateBadgeSvg(label: string, pct: number): string {
  const value = `${pct.toFixed(1)}%`;
  const color = getBadgeHexColor(pct);
  const labelWidth = label.length * 7 + 10;
  const valueWidth = value.length * 7 + 10;
  const totalWidth = labelWidth + valueWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14">${value}</text>
  </g>
</svg>`;
}

// ── Mock Data ───────────────────────────────────────────────────────────────

function mkMetrics(lPct: number, bPct: number, fPct: number, sPct: number, scale = 1): CoverageMetrics {
  const lTotal = Math.round(100 * scale);
  const bTotal = Math.round(40 * scale);
  const fTotal = Math.round(20 * scale);
  const sTotal = Math.round(120 * scale);
  return {
    lines: { covered: Math.round(lTotal * lPct / 100), total: lTotal, pct: lPct },
    branches: { covered: Math.round(bTotal * bPct / 100), total: bTotal, pct: bPct },
    functions: { covered: Math.round(fTotal * fPct / 100), total: fTotal, pct: fPct },
    statements: { covered: Math.round(sTotal * sPct / 100), total: sTotal, pct: sPct },
  };
}

function mkFile(id: string, name: string, path: string, lPct: number, bPct: number, fPct: number, sPct: number, recentlyChanged?: boolean): FileCoverageData {
  const metrics = mkMetrics(lPct, bPct, fPct, sPct);
  const uncoveredLines: UncoveredLine[] = [];
  const totalLines = metrics.lines.total;
  const uncoveredCount = totalLines - metrics.lines.covered;
  for (let i = 0; i < Math.min(uncoveredCount, 8); i++) {
    const line = Math.floor(Math.random() * 200) + 10;
    uncoveredLines.push({
      line,
      content: i % 3 === 0 ? `  if (condition${i}) { return null; }` : i % 3 === 1 ? `  const result = await fetchData(id);` : `  throw new Error('Unhandled case');`,
      type: i % 3 === 0 ? 'branch' : i % 3 === 1 ? 'line' : 'function',
    });
  }
  uncoveredLines.sort((a, b) => a.line - b.line);

  const funcNames = ['constructor', 'render', 'handleClick', 'getData', 'validate', 'transform', 'serialize', 'dispose', 'init', 'update'];
  const functions: FunctionCoverage[] = [];
  const fCount = metrics.functions.total;
  for (let i = 0; i < fCount; i++) {
    const startLine = 10 + i * 15;
    const hit = i < metrics.functions.covered ? Math.floor(Math.random() * 20) + 1 : 0;
    functions.push({
      name: funcNames[i % funcNames.length] + (i >= funcNames.length ? `_${i}` : ''),
      startLine,
      endLine: startLine + Math.floor(Math.random() * 12) + 3,
      hits: hit,
      branches: { covered: hit > 0 ? Math.floor(Math.random() * 3) + 1 : 0, total: Math.floor(Math.random() * 4) + 1 },
    });
  }

  return { id, path, name, metrics, uncoveredLines, functions, recentlyChanged, sparkline: generateSparkline(lPct) };
}

function aggregateMetrics(children: (FolderCoverageData | FileCoverageData)[]): CoverageMetrics {
  let lC = 0, lT = 0, bC = 0, bT = 0, fC = 0, fT = 0, sC = 0, sT = 0;
  for (const child of children) {
    lC += child.metrics.lines.covered; lT += child.metrics.lines.total;
    bC += child.metrics.branches.covered; bT += child.metrics.branches.total;
    fC += child.metrics.functions.covered; fT += child.metrics.functions.total;
    sC += child.metrics.statements.covered; sT += child.metrics.statements.total;
  }
  return {
    lines: { covered: lC, total: lT, pct: lT > 0 ? Math.round(lC / lT * 1000) / 10 : 0 },
    branches: { covered: bC, total: bT, pct: bT > 0 ? Math.round(bC / bT * 1000) / 10 : 0 },
    functions: { covered: fC, total: fT, pct: fT > 0 ? Math.round(fC / fT * 1000) / 10 : 0 },
    statements: { covered: sC, total: sT, pct: sT > 0 ? Math.round(sC / sT * 1000) / 10 : 0 },
  };
}

function mkFolder(id: string, name: string, path: string, children: (FolderCoverageData | FileCoverageData)[]): FolderCoverageData {
  return { id, name, path, children, metrics: aggregateMetrics(children) };
}

const MOCK_FILES: FileCoverageData[] = [
  mkFile('f1', 'App.tsx', 'src/App.tsx', 95.2, 88.5, 100, 94.8),
  mkFile('f2', 'index.ts', 'src/index.ts', 100, 100, 100, 100),
  mkFile('f3', 'Button.tsx', 'src/components/Button.tsx', 92.3, 85.0, 90.0, 91.5, true),
  mkFile('f4', 'Input.tsx', 'src/components/Input.tsx', 87.5, 72.0, 85.0, 86.2, true),
  mkFile('f5', 'Modal.tsx', 'src/components/Modal.tsx', 78.4, 65.3, 70.0, 76.8),
  mkFile('f6', 'Dropdown.tsx', 'src/components/Dropdown.tsx', 64.2, 48.0, 55.0, 62.1, true),
  mkFile('f7', 'Table.tsx', 'src/components/Table.tsx', 91.0, 82.5, 95.0, 90.3),
  mkFile('f8', 'Tooltip.tsx', 'src/components/Tooltip.tsx', 45.0, 30.0, 40.0, 43.5),
  mkFile('f9', 'useAuth.ts', 'src/hooks/useAuth.ts', 96.8, 91.2, 100, 95.9),
  mkFile('f10', 'useTheme.ts', 'src/hooks/useTheme.ts', 88.0, 80.0, 85.0, 87.2),
  mkFile('f11', 'useFetch.ts', 'src/hooks/useFetch.ts', 73.5, 58.0, 65.0, 72.0, true),
  mkFile('f12', 'api.ts', 'src/services/api.ts', 82.4, 75.0, 80.0, 81.6),
  mkFile('f13', 'auth.ts', 'src/services/auth.ts', 90.1, 85.5, 90.0, 89.4),
  mkFile('f14', 'storage.ts', 'src/services/storage.ts', 55.0, 40.0, 50.0, 53.8, true),
  mkFile('f15', 'websocket.ts', 'src/services/websocket.ts', 38.2, 25.0, 30.0, 36.5),
  mkFile('f16', 'format.ts', 'src/utils/format.ts', 98.0, 95.0, 100, 97.5),
  mkFile('f17', 'validate.ts', 'src/utils/validate.ts', 94.5, 90.0, 95.0, 93.8),
  mkFile('f18', 'transform.ts', 'src/utils/transform.ts', 85.3, 78.0, 80.0, 84.1, true),
  mkFile('f19', 'logger.ts', 'src/utils/logger.ts', 42.0, 28.0, 35.0, 40.5),
  mkFile('f20', 'UserStore.ts', 'src/stores/UserStore.ts', 88.7, 82.0, 85.0, 87.9),
  mkFile('f21', 'AppStore.ts', 'src/stores/AppStore.ts', 93.5, 88.0, 95.0, 92.8),
  mkFile('f22', 'ThemeStore.ts', 'src/stores/ThemeStore.ts', 76.0, 60.0, 70.0, 74.5),
  mkFile('f23', 'routes.tsx', 'src/routes.tsx', 85.0, 78.0, 80.0, 84.2),
  mkFile('f24', 'config.ts', 'src/config.ts', 100, 100, 100, 100),
];

const MOCK_TREE: FolderCoverageData = mkFolder('root', 'src', 'src', [
  MOCK_FILES[0],
  MOCK_FILES[1],
  MOCK_FILES[22],
  MOCK_FILES[23],
  mkFolder('comp', 'components', 'src/components', [
    MOCK_FILES[2], MOCK_FILES[3], MOCK_FILES[4], MOCK_FILES[5], MOCK_FILES[6], MOCK_FILES[7],
  ]),
  mkFolder('hooks', 'hooks', 'src/hooks', [
    MOCK_FILES[8], MOCK_FILES[9], MOCK_FILES[10],
  ]),
  mkFolder('services', 'services', 'src/services', [
    MOCK_FILES[11], MOCK_FILES[12], MOCK_FILES[13], MOCK_FILES[14],
  ]),
  mkFolder('utils', 'utils', 'src/utils', [
    MOCK_FILES[15], MOCK_FILES[16], MOCK_FILES[17], MOCK_FILES[18],
  ]),
  mkFolder('stores', 'stores', 'src/stores', [
    MOCK_FILES[19], MOCK_FILES[20], MOCK_FILES[21],
  ]),
]);

const MOCK_TREND: TrendPoint[] = Array.from({ length: 10 }, (_, i) => {
  const base = 78 + i * 1.2;
  return {
    runId: `run-${i + 1}`,
    timestamp: new Date(Date.now() - (10 - i) * 86400000),
    commit: Math.random().toString(36).substring(2, 9),
    lines: Math.min(100, base + (Math.random() - 0.3) * 4),
    branches: Math.min(100, base - 5 + (Math.random() - 0.3) * 5),
    functions: Math.min(100, base + 2 + (Math.random() - 0.3) * 3),
    statements: Math.min(100, base - 1 + (Math.random() - 0.3) * 4),
  };
});

function buildMockReport(index: number): CoverageReport {
  return {
    id: `report-${index}`,
    timestamp: MOCK_TREND[index]?.timestamp ?? new Date(),
    commit: MOCK_TREND[index]?.commit ?? 'abc1234',
    branch: index % 3 === 0 ? 'main' : index % 3 === 1 ? 'feature/auth' : 'fix/layout',
    overall: MOCK_TREE.metrics,
    tree: MOCK_TREE,
  };
}

const MOCK_REPORTS: CoverageReport[] = MOCK_TREND.map((_, i) => buildMockReport(i));

// ── Component ───────────────────────────────────────────────────────────────

const CodeCoveragePanel: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['root', 'comp', 'hooks', 'services', 'utils', 'stores']));
  const [selectedFile, setSelectedFile] = useState<FileCoverageData | null>(null);
  const [guttersEnabled, setGuttersEnabled] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [diffBaseIndex, setDiffBaseIndex] = useState(8);
  const [diffTargetIndex, setDiffTargetIndex] = useState(9);
  const [sortBy, setSortBy] = useState<'name' | 'lines' | 'branches' | 'functions' | 'statements'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterBelow, setFilterBelow] = useState<number | null>(null);
  const [filterRecentlyChanged, setFilterRecentlyChanged] = useState(false);
  const [importFormat, setImportFormat] = useState<ImportFormat>('lcov');
  const [thresholds, setThresholds] = useState<CoverageThresholds>({
    lines: { warn: 80, fail: 50 },
    branches: { warn: 80, fail: 50 },
    functions: { warn: 80, fail: 50 },
    statements: { warn: 80, fail: 50 },
  });
  const [showBranchCoverage, setShowBranchCoverage] = useState(true);
  const [activeReportIndex, setActiveReportIndex] = useState(9);
  const [copiedBadge, setCopiedBadge] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeReport = MOCK_REPORTS[activeReportIndex];
  const previousReport = activeReportIndex > 0 ? MOCK_REPORTS[activeReportIndex - 1] : null;

  const overallDelta = useMemo(() => {
    if (!previousReport) return null;
    return {
      lines: activeReport.overall.lines.pct - previousReport.overall.lines.pct,
      branches: activeReport.overall.branches.pct - previousReport.overall.branches.pct,
      functions: activeReport.overall.functions.pct - previousReport.overall.functions.pct,
      statements: activeReport.overall.statements.pct - previousReport.overall.statements.pct,
    };
  }, [activeReport, previousReport]);

  const allFiles = useMemo(() => {
    const files: FileCoverageData[] = [];
    function collect(node: FolderCoverageData | FileCoverageData) {
      if (isFolder(node)) node.children.forEach(collect);
      else files.push(node as FileCoverageData);
    }
    collect(MOCK_TREE);
    return files;
  }, []);

  const filteredFiles = useMemo(() => {
    let result = allFiles;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q));
    }
    if (filterBelow !== null) {
      result = result.filter(f => f.metrics.lines.pct < filterBelow);
    }
    if (filterRecentlyChanged) {
      result = result.filter(f => f.recentlyChanged);
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortBy === 'lines') cmp = a.metrics.lines.pct - b.metrics.lines.pct;
      else if (sortBy === 'branches') cmp = a.metrics.branches.pct - b.metrics.branches.pct;
      else if (sortBy === 'functions') cmp = a.metrics.functions.pct - b.metrics.functions.pct;
      else cmp = a.metrics.statements.pct - b.metrics.statements.pct;
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [allFiles, searchQuery, filterBelow, filterRecentlyChanged, sortBy, sortAsc]);

  const toggleFolder = useCallback((id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleExport = useCallback((format: 'html' | 'json') => {
    const reportData = {
      generated: new Date().toISOString(),
      commit: activeReport.commit,
      branch: activeReport.branch,
      overall: activeReport.overall,
      thresholds,
      files: allFiles.map(f => ({
        path: f.path,
        metrics: f.metrics,
        uncoveredLines: f.uncoveredLines.map(u => u.line),
        functions: f.functions.map(fn => ({ name: fn.name, hits: fn.hits, branches: fn.branches })),
      })),
    };
    let data: string;
    if (format === 'json') {
      data = JSON.stringify(reportData, null, 2);
    } else {
      const pctBar = (pct: number) => {
        const color = pct >= 80 ? '#4ec969' : pct >= 50 ? '#cca700' : '#f14c4c';
        return `<div style="width:200px;height:8px;background:#333;border-radius:4px;overflow:hidden;display:inline-block;vertical-align:middle;margin-left:8px"><div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div></div>`;
      };
      const fileRows = allFiles.map(f => `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #333">${f.path}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #333;text-align:right;color:${getCoverageColorSimple(f.metrics.lines.pct)}">${formatPct(f.metrics.lines.pct)} ${pctBar(f.metrics.lines.pct)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #333;text-align:right;color:${getCoverageColorSimple(f.metrics.branches.pct)}">${formatPct(f.metrics.branches.pct)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #333;text-align:right;color:${getCoverageColorSimple(f.metrics.functions.pct)}">${formatPct(f.metrics.functions.pct)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #333;text-align:right;color:${getCoverageColorSimple(f.metrics.statements.pct)}">${formatPct(f.metrics.statements.pct)}</td>
      </tr>`).join('\n');
      data = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Coverage Report - ${activeReport.branch}@${activeReport.commit.slice(0, 7)}</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;background:#1e1e1e;color:#ccc;margin:0;padding:24px}
h1{font-size:22px;margin-bottom:4px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #333;padding-bottom:8px}
.summary{display:flex;gap:16px;margin:20px 0}.card{flex:1;background:#2d2d2d;padding:16px;border-radius:8px}
.card .label{font-size:12px;text-transform:uppercase;color:#888;margin-bottom:8px}.card .value{font-size:28px;font-weight:700}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:8px 10px;border-bottom:2px solid #444;font-size:11px;text-transform:uppercase;color:#888}
.badge{display:inline-block;margin:4px}</style></head>
<body>
<h1>Coverage Report</h1>
<p style="color:#888">Branch: ${activeReport.branch} | Commit: ${activeReport.commit} | Generated: ${new Date().toLocaleString()}</p>
<div class="summary">
  <div class="card"><div class="label">Lines</div><div class="value" style="color:${getCoverageColorSimple(activeReport.overall.lines.pct)}">${formatPct(activeReport.overall.lines.pct)}</div><div style="font-size:12px;color:#888;margin-top:4px">${activeReport.overall.lines.covered}/${activeReport.overall.lines.total}</div></div>
  <div class="card"><div class="label">Branches</div><div class="value" style="color:${getCoverageColorSimple(activeReport.overall.branches.pct)}">${formatPct(activeReport.overall.branches.pct)}</div><div style="font-size:12px;color:#888;margin-top:4px">${activeReport.overall.branches.covered}/${activeReport.overall.branches.total}</div></div>
  <div class="card"><div class="label">Functions</div><div class="value" style="color:${getCoverageColorSimple(activeReport.overall.functions.pct)}">${formatPct(activeReport.overall.functions.pct)}</div><div style="font-size:12px;color:#888;margin-top:4px">${activeReport.overall.functions.covered}/${activeReport.overall.functions.total}</div></div>
  <div class="card"><div class="label">Statements</div><div class="value" style="color:${getCoverageColorSimple(activeReport.overall.statements.pct)}">${formatPct(activeReport.overall.statements.pct)}</div><div style="font-size:12px;color:#888;margin-top:4px">${activeReport.overall.statements.covered}/${activeReport.overall.statements.total}</div></div>
</div>
<h2>File Coverage</h2>
<table><thead><tr><th>File</th><th style="text-align:right">Lines</th><th style="text-align:right">Branches</th><th style="text-align:right">Functions</th><th style="text-align:right">Statements</th></tr></thead>
<tbody>${fileRows}</tbody></table>
</body></html>`;
    }
    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `coverage-report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeReport, thresholds, allFiles]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = importFormat === 'lcov' ? '.info,.lcov' : importFormat === 'istanbul' ? '.json' : '.xml';
    input.onchange = () => {
      console.log(`Importing ${importFormat} coverage report...`);
    };
    input.click();
  }, [importFormat]);

  const handleCopyBadge = useCallback((key: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedBadge(key);
      setTimeout(() => setCopiedBadge(null), 2000);
    });
  }, []);

  // ── Shared Styles ───────────────────────────────────────────────────────

  const panelBg = 'var(--vscode-panel-background, #1e1e1e)';
  const panelBorder = 'var(--vscode-panel-border, #2d2d2d)';
  const fg = 'var(--vscode-foreground, #cccccc)';
  const fgMuted = 'var(--vscode-descriptionForeground, #888888)';
  const inputBg = 'var(--vscode-input-background, #3c3c3c)';
  const inputBorder = 'var(--vscode-input-border, #4d4d4d)';
  const inputFg = 'var(--vscode-input-foreground, #cccccc)';
  const listHoverBg = 'var(--vscode-list-hoverBackground, #2a2d2e)';
  const listActiveBg = 'var(--vscode-list-activeSelectionBackground, #094771)';
  const listActiveFg = 'var(--vscode-list-activeSelectionForeground, #ffffff)';
  const badgeBg = 'var(--vscode-badge-background, #4d4d4d)';
  const badgeFg = 'var(--vscode-badge-foreground, #ffffff)';
  const buttonBg = 'var(--vscode-button-background, #0e639c)';
  const buttonFg = 'var(--vscode-button-foreground, #ffffff)';
  const successColor = 'var(--vscode-testing-iconPassed, #4ec969)';
  const warningColor = 'var(--vscode-editorWarning-foreground, #cca700)';
  const errorColor = 'var(--vscode-testing-iconFailed, #f14c4c)';

  // ── Coverage Bar Component ──────────────────────────────────────────────

  const CoverageBar: React.FC<{ pct: number; width?: number; height?: number; showLabel?: boolean }> = ({ pct, width = 100, height = 6, showLabel = false }) => {
    const color = getCoverageColor(pct, thresholds.lines);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width, height, borderRadius: height / 2, background: 'var(--vscode-progressBar-background, #333)', overflow: 'hidden', flexShrink: 0 }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', borderRadius: height / 2, background: color, transition: 'width 0.3s ease' }} />
        </div>
        {showLabel && <span style={{ fontSize: 11, color: color, fontWeight: 600, minWidth: 42, textAlign: 'right' }}>{formatPct(pct)}</span>}
      </div>
    );
  };

  // ── Sparkline Component ────────────────────────────────────────────────

  const Sparkline: React.FC<{ data: number[]; width?: number; height?: number; color?: string }> = ({ data, width = 60, height = 18, color: lineColor }) => {
    if (!data || data.length < 2) return null;
    const minVal = Math.min(...data) - 2;
    const maxVal = Math.max(...data) + 2;
    const range = maxVal - minVal || 1;
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - minVal) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const lastVal = data[data.length - 1];
    const resolvedColor = lineColor || getCoverageColorSimple(lastVal);
    const areaPath = `M 0,${height} L ${points} L ${width},${height} Z`;
    return (
      <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
        <path d={areaPath} fill={resolvedColor} opacity={0.12} />
        <polyline points={points} fill="none" stroke={resolvedColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={width} cy={height - ((lastVal - minVal) / range) * height} r={2} fill={resolvedColor} />
      </svg>
    );
  };

  // ── Delta Badge ─────────────────────────────────────────────────────────

  const DeltaBadge: React.FC<{ delta: number }> = ({ delta }) => {
    if (Math.abs(delta) < 0.05) return <span style={{ fontSize: 10, color: fgMuted, marginLeft: 4 }}>--</span>;
    const positive = delta > 0;
    const color = positive ? successColor : errorColor;
    const Icon = positive ? TrendingUp : TrendingDown;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color, marginLeft: 4, fontWeight: 600 }}>
        <Icon size={10} />
        {formatDelta(delta)}
      </span>
    );
  };

  // ── Metric Card ─────────────────────────────────────────────────────────

  const MetricCard: React.FC<{ label: string; metrics: CoverageMetrics[keyof CoverageMetrics]; delta?: number; icon: React.ReactNode }> = ({ label, metrics: m, delta, icon }) => {
    const color = getCoverageColor(m.pct, thresholds.lines);
    const passing = m.pct >= thresholds.lines.warn;
    return (
      <div style={{ flex: 1, minWidth: 160, padding: '14px 16px', background: inputBg, borderRadius: 6, border: `1px solid ${panelBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {icon}
            <span style={{ fontSize: 11, color: fgMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</span>
          </div>
          {passing ? <CheckCircle size={14} color={successColor as string} /> : <AlertTriangle size={14} color={errorColor as string} />}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 6 }}>{formatPct(m.pct)}</div>
        <div style={{ fontSize: 11, color: fgMuted, marginBottom: 8 }}>{m.covered}/{m.total} covered</div>
        <CoverageBar pct={m.pct} width={140} height={4} />
        {delta !== undefined && <div style={{ marginTop: 6 }}><DeltaBadge delta={delta} /></div>}
      </div>
    );
  };

  // ── Trend Chart ─────────────────────────────────────────────────────────

  const TrendChart: React.FC = () => {
    const chartWidth = 440;
    const chartHeight = 140;
    const padX = 36;
    const padY = 20;
    const innerW = chartWidth - padX * 2;
    const innerH = chartHeight - padY * 2;
    const data = MOCK_TREND;

    const minVal = 50;
    const maxVal = 100;

    const toX = (i: number) => padX + (i / (data.length - 1)) * innerW;
    const toY = (v: number) => padY + innerH - ((v - minVal) / (maxVal - minVal)) * innerH;

    const makePath = (values: number[]) => values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');

    const linesSeries = data.map(d => d.lines);
    const branchesSeries = data.map(d => d.branches);
    const functionsSeries = data.map(d => d.functions);

    return (
      <div style={{ background: inputBg, borderRadius: 6, border: `1px solid ${panelBorder}`, padding: 16, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} color={fgMuted as string} />
            <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Coverage Trend (Last 10 Runs)</span>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, background: '#4ec969', display: 'inline-block', borderRadius: 1 }} />Lines</span>
            <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, background: '#569cd6', display: 'inline-block', borderRadius: 1 }} />Branches</span>
            <span style={{ fontSize: 10, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, background: '#c586c0', display: 'inline-block', borderRadius: 1 }} />Functions</span>
          </div>
        </div>
        <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
          {/* Grid lines */}
          {[50, 60, 70, 80, 90, 100].map(v => (
            <g key={v}>
              <line x1={padX} y1={toY(v)} x2={chartWidth - padX} y2={toY(v)} stroke={panelBorder as string} strokeWidth={0.5} strokeDasharray={v === 80 ? '4,2' : undefined} />
              <text x={padX - 4} y={toY(v) + 3} textAnchor="end" fontSize={9} fill={fgMuted as string}>{v}%</text>
            </g>
          ))}
          {/* Threshold line */}
          <line x1={padX} y1={toY(thresholds.lines.warn)} x2={chartWidth - padX} y2={toY(thresholds.lines.warn)} stroke={warningColor as string} strokeWidth={1} strokeDasharray="6,3" opacity={0.6} />
          {/* Series */}
          <path d={makePath(linesSeries)} fill="none" stroke="#4ec969" strokeWidth={2} />
          <path d={makePath(branchesSeries)} fill="none" stroke="#569cd6" strokeWidth={2} />
          <path d={makePath(functionsSeries)} fill="none" stroke="#c586c0" strokeWidth={2} />
          {/* Dots */}
          {linesSeries.map((v, i) => <circle key={`l${i}`} cx={toX(i)} cy={toY(v)} r={3} fill="#4ec969" />)}
          {branchesSeries.map((v, i) => <circle key={`b${i}`} cx={toX(i)} cy={toY(v)} r={2.5} fill="#569cd6" />)}
          {functionsSeries.map((v, i) => <circle key={`f${i}`} cx={toX(i)} cy={toY(v)} r={2.5} fill="#c586c0" />)}
          {/* X labels */}
          {data.map((d, i) => (
            <text key={i} x={toX(i)} y={chartHeight - 2} textAnchor="middle" fontSize={8} fill={fgMuted as string}>
              {d.commit.slice(0, 5)}
            </text>
          ))}
        </svg>
      </div>
    );
  };

  // ── Summary View ────────────────────────────────────────────────────────

  const SummaryView: React.FC = () => (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <BarChart3 size={16} color={fg as string} />
        <span style={{ fontSize: 14, fontWeight: 600, color: fg }}>Coverage Summary</span>
        <span style={{ fontSize: 11, color: fgMuted, marginLeft: 'auto' }}>
          Report #{activeReportIndex + 1} &middot; {activeReport.commit.slice(0, 7)} &middot; {activeReport.branch}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MetricCard label="Lines" metrics={activeReport.overall.lines} delta={overallDelta?.lines} icon={<Hash size={13} color={fgMuted as string} />} />
        <MetricCard label="Branches" metrics={activeReport.overall.branches} delta={overallDelta?.branches} icon={<GitBranch size={13} color={fgMuted as string} />} />
        <MetricCard label="Functions" metrics={activeReport.overall.functions} delta={overallDelta?.functions} icon={<Code size={13} color={fgMuted as string} />} />
        <MetricCard label="Statements" metrics={activeReport.overall.statements} delta={overallDelta?.statements} icon={<Layers size={13} color={fgMuted as string} />} />
      </div>
      <TrendChart />
      {/* Threshold status */}
      <div style={{ marginTop: 16, padding: 12, background: inputBg, borderRadius: 6, border: `1px solid ${panelBorder}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: fg, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Shield size={14} color={fgMuted as string} />
          Threshold Status
        </div>
        {(['lines', 'branches', 'functions', 'statements'] as const).map(key => {
          const pct = activeReport.overall[key].pct;
          const th = thresholds[key];
          const status = pct >= th.warn ? 'pass' : pct >= th.fail ? 'warn' : 'fail';
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              {status === 'pass' && <CheckCircle size={13} color={successColor as string} />}
              {status === 'warn' && <AlertTriangle size={13} color={warningColor as string} />}
              {status === 'fail' && <XCircle size={13} color={errorColor as string} />}
              <span style={{ fontSize: 12, color: fg, width: 80, textTransform: 'capitalize' }}>{key}</span>
              <CoverageBar pct={pct} width={120} height={4} />
              <span style={{ fontSize: 11, color: getCoverageColor(pct, th), fontWeight: 600, width: 48, textAlign: 'right' }}>{formatPct(pct)}</span>
              <span style={{ fontSize: 10, color: fgMuted }}>/ {th.warn}% required</span>
            </div>
          );
        })}
      </div>
      {/* Worst performing files */}
      <div style={{ marginTop: 16, padding: 12, background: inputBg, borderRadius: 6, border: `1px solid ${panelBorder}` }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: fg, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={14} color={warningColor as string} />
          Files Below Threshold
        </div>
        {allFiles
          .filter(f => f.metrics.lines.pct < thresholds.lines.warn)
          .sort((a, b) => a.metrics.lines.pct - b.metrics.lines.pct)
          .slice(0, 8)
          .map(f => (
            <div
              key={f.id}
              onClick={() => { setSelectedFile(f); setViewMode('uncovered'); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 4px', cursor: 'pointer', borderRadius: 3 }}
              onMouseEnter={e => (e.currentTarget.style.background = listHoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <FileText size={12} color={fgMuted as string} />
              <span style={{ fontSize: 11, color: fg, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
              <Sparkline data={f.sparkline} width={48} height={14} />
              <CoverageBar pct={f.metrics.lines.pct} width={60} height={3} />
              <span style={{ fontSize: 10, color: getCoverageColorSimple(f.metrics.lines.pct), fontWeight: 600, width: 42, textAlign: 'right' }}>{formatPct(f.metrics.lines.pct)}</span>
            </div>
          ))}
      </div>
    </div>
  );

  // ── File Tree Node ──────────────────────────────────────────────────────

  const TreeNode: React.FC<{ node: FolderCoverageData | FileCoverageData; depth: number; isHeatmap?: boolean }> = ({ node, depth, isHeatmap }) => {
    const isFolderNode = isFolder(node);
    const expanded = isFolderNode && expandedFolders.has(node.id);
    const isSelected = !isFolderNode && selectedFile?.id === node.id;
    const pct = node.metrics.lines.pct;
    const color = getCoverageColor(pct, thresholds.lines);

    return (
      <>
        <div
          onClick={() => {
            if (isFolderNode) toggleFolder(node.id);
            else setSelectedFile(node as FileCoverageData);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '3px 8px',
            paddingLeft: depth * 16 + 8,
            cursor: 'pointer',
            background: isSelected ? listActiveBg : isHeatmap ? getHeatmapColor(pct) : 'transparent',
            color: isSelected ? listActiveFg : fg,
            fontSize: 12,
            borderRadius: 2,
            minHeight: 26,
          }}
          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = isHeatmap ? getHeatmapColor(pct) : listHoverBg; }}
          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isHeatmap ? getHeatmapColor(pct) : 'transparent'; }}
        >
          {isFolderNode ? (
            expanded ? <ChevronDown size={14} style={{ marginRight: 4, flexShrink: 0 }} /> : <ChevronRight size={14} style={{ marginRight: 4, flexShrink: 0 }} />
          ) : (
            <span style={{ width: 14, marginRight: 4, flexShrink: 0 }} />
          )}
          {isFolderNode ? (
            expanded ? <FolderOpen size={14} color="#dcb67a" style={{ marginRight: 6, flexShrink: 0 }} /> : <Folder size={14} color="#dcb67a" style={{ marginRight: 6, flexShrink: 0 }} />
          ) : (
            <FileCode size={14} color="#519aba" style={{ marginRight: 6, flexShrink: 0 }} />
          )}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
            {!isFolderNode && (node as FileCoverageData).recentlyChanged && (
              <span style={{ marginLeft: 6, fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(86,156,214,0.2)', color: '#569cd6', verticalAlign: 'middle' }}>changed</span>
            )}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
            {!isFolderNode && <Sparkline data={(node as FileCoverageData).sparkline} width={40} height={14} />}
            <CoverageBar pct={pct} width={50} height={3} />
            <span style={{ fontSize: 10, color, fontWeight: 600, width: 38, textAlign: 'right' }}>{formatPct(pct)}</span>
            {!isFolderNode && (
              <>
                <span style={{ fontSize: 9, color: getCoverageColor(node.metrics.branches.pct, thresholds.branches), width: 32, textAlign: 'right' }} title="Branch coverage">B:{formatPct(node.metrics.branches.pct).replace('%', '')}</span>
                <span style={{ fontSize: 9, color: getCoverageColor(node.metrics.functions.pct, thresholds.functions), width: 32, textAlign: 'right' }} title="Function coverage">F:{formatPct(node.metrics.functions.pct).replace('%', '')}</span>
              </>
            )}
          </div>
        </div>
        {isFolderNode && expanded && (node as FolderCoverageData).children.map(child => (
          <TreeNode key={isFolder(child) ? child.id : (child as FileCoverageData).id} node={child} depth={depth + 1} isHeatmap={isHeatmap} />
        ))}
      </>
    );
  };

  // ── Tree View ───────────────────────────────────────────────────────────

  const TreeView: React.FC = () => (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 8px', borderBottom: `1px solid ${panelBorder}` }}>
        <Folder size={14} color={fgMuted as string} />
        <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>File Coverage</span>
        <span style={{ fontSize: 10, color: fgMuted, marginLeft: 'auto' }}>{allFiles.length} files</span>
      </div>
      {/* Column headers */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 12px', fontSize: 10, color: fgMuted, borderBottom: `1px solid ${panelBorder}`, gap: 8 }}>
        <span style={{ flex: 1 }}>File</span>
        <span style={{ width: 40, textAlign: 'center' }}>Trend</span>
        <span style={{ width: 50, textAlign: 'center' }}>Coverage</span>
        <span style={{ width: 38, textAlign: 'right' }}>Lines</span>
        <span style={{ width: 32, textAlign: 'right' }}>Br</span>
        <span style={{ width: 32, textAlign: 'right' }}>Fn</span>
      </div>
      <div style={{ overflowY: 'auto', maxHeight: 500 }}>
        <TreeNode node={MOCK_TREE} depth={0} />
      </div>
    </div>
  );

  // ── Heatmap View ────────────────────────────────────────────────────────

  const HeatmapView: React.FC = () => {
    const heatmapFiles = useMemo(() => {
      return [...allFiles].sort((a, b) => a.metrics.lines.pct - b.metrics.lines.pct);
    }, []);

    return (
      <div style={{ padding: '8px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px 8px', borderBottom: `1px solid ${panelBorder}` }}>
          <Flame size={14} color="#e06c75" />
          <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Coverage Heatmap</span>
        </div>
        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', fontSize: 10, color: fgMuted }}>
          <span>0%</span>
          {[0, 20, 40, 60, 80, 100].map(v => (
            <div key={v} style={{ width: 20, height: 10, background: getHeatmapColor(v), borderRadius: 2 }} />
          ))}
          <span>100%</span>
        </div>
        {/* Grid heatmap */}
        <div style={{ padding: '8px 12px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: fg, marginBottom: 8 }}>Project Heatmap Grid</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
            {heatmapFiles.map(f => {
              const pct = f.metrics.lines.pct;
              return (
                <div
                  key={f.id}
                  onClick={() => { setSelectedFile(f); setViewMode('uncovered'); }}
                  title={`${f.path}: ${formatPct(pct)}`}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 4,
                    background: getHeatmapColor(pct),
                    border: `1px solid ${panelBorder}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 8,
                    fontWeight: 700,
                    color: pct >= 80 ? '#4ec969' : pct >= 50 ? '#cca700' : '#f14c4c',
                    transition: 'transform 0.15s ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.zIndex = '10'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.zIndex = '0'; }}
                >
                  {Math.round(pct)}
                </div>
              );
            })}
          </div>
        </div>
        {/* Tree heatmap */}
        <div style={{ padding: '0 0 8px', borderTop: `1px solid ${panelBorder}`, marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: fg, padding: '8px 12px' }}>Tree View</div>
          <div style={{ overflowY: 'auto', maxHeight: 400 }}>
            <TreeNode node={MOCK_TREE} depth={0} isHeatmap />
          </div>
        </div>
      </div>
    );
  };

  // ── Uncovered Lines View ────────────────────────────────────────────────

  const UncoveredLinesView: React.FC = () => {
    const file = selectedFile;
    if (!file) {
      return (
        <div style={{ padding: 24, textAlign: 'center', color: fgMuted }}>
          <Target size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
          <div style={{ fontSize: 13 }}>Select a file from the tree to view uncovered lines</div>
        </div>
      );
    }
    return (
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <FileText size={14} color="#519aba" />
          <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>{file.path}</span>
          <span style={{ fontSize: 10, color: fgMuted, marginLeft: 'auto' }}>{file.uncoveredLines.length} uncovered regions</span>
        </div>
        {/* Metrics mini bar with sparklines */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: '8px 10px', background: inputBg, borderRadius: 4 }}>
          {(['lines', 'branches', 'functions', 'statements'] as const).map(key => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: fgMuted, textTransform: 'capitalize', width: 62 }}>{key}:</span>
              <CoverageBar pct={file.metrics[key].pct} width={50} height={3} />
              <span style={{ fontSize: 10, color: getCoverageColor(file.metrics[key].pct, thresholds[key]), fontWeight: 600 }}>{formatPct(file.metrics[key].pct)}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto' }}>
            <Sparkline data={file.sparkline} width={60} height={18} />
          </div>
        </div>
        {/* Uncovered lines table */}
        <div style={{ border: `1px solid ${panelBorder}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: inputBg, borderBottom: `1px solid ${panelBorder}`, fontSize: 10, color: fgMuted }}>
            <span style={{ width: 50 }}>Line</span>
            <span style={{ width: 60 }}>Type</span>
            <span style={{ flex: 1 }}>Code</span>
          </div>
          {file.uncoveredLines.map((ul, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '5px 10px',
                borderBottom: i < file.uncoveredLines.length - 1 ? `1px solid ${panelBorder}` : 'none',
                cursor: 'pointer',
                fontSize: 11,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = listHoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              title={`Click to navigate to ${file.path}:${ul.line}`}
            >
              <span style={{ width: 50, color: errorColor, fontWeight: 600, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>{ul.line}</span>
              <span style={{
                width: 60,
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                background: ul.type === 'branch' ? 'rgba(86, 156, 214, 0.2)' : ul.type === 'function' ? 'rgba(197, 134, 192, 0.2)' : 'rgba(241, 76, 76, 0.2)',
                color: ul.type === 'branch' ? '#569cd6' : ul.type === 'function' ? '#c586c0' : errorColor,
                textAlign: 'center',
                display: 'inline-block',
              }}>{ul.type}</span>
              <code style={{ flex: 1, fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 11, color: fg, marginLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ul.content}</code>
              <ExternalLink size={11} color={fgMuted as string} style={{ flexShrink: 0, marginLeft: 4 }} />
            </div>
          ))}
        </div>
        {/* Branch coverage inline view */}
        {showBranchCoverage && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <GitBranch size={13} color="#569cd6" />
              <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Branch Coverage</span>
            </div>
            <div style={{ border: `1px solid ${panelBorder}`, borderRadius: 4, overflow: 'hidden' }}>
              {file.functions.filter(fn => fn.branches.total > 0).map((fn, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', borderBottom: `1px solid ${panelBorder}`, fontSize: 11 }}>
                  <Code size={11} color="#c586c0" style={{ marginRight: 6, flexShrink: 0 }} />
                  <span style={{ width: 140, fontFamily: 'var(--vscode-editor-font-family, monospace)', color: fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fn.name}()</span>
                  <span style={{ width: 60, fontSize: 10, color: fgMuted }}>L{fn.startLine}-{fn.endLine}</span>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {Array.from({ length: fn.branches.total }, (_, bi) => (
                      <div
                        key={bi}
                        style={{
                          width: 16, height: 16, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: bi < fn.branches.covered ? 'rgba(78, 201, 105, 0.2)' : 'rgba(241, 76, 76, 0.2)',
                          border: `1px solid ${bi < fn.branches.covered ? '#4ec96944' : '#f14c4c44'}`,
                          fontSize: 8, fontWeight: 600, color: bi < fn.branches.covered ? successColor : errorColor,
                        }}
                        title={bi < fn.branches.covered ? 'Branch covered' : 'Branch not covered'}
                      >
                        {bi < fn.branches.covered ? <CheckCircle size={9} /> : <XCircle size={9} />}
                      </div>
                    ))}
                  </div>
                  <span style={{ fontSize: 10, color: getCoverageColorSimple(fn.branches.total > 0 ? (fn.branches.covered / fn.branches.total) * 100 : 0), fontWeight: 600, width: 50, textAlign: 'right' }}>
                    {fn.branches.covered}/{fn.branches.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Diff View ───────────────────────────────────────────────────────────

  const DiffView: React.FC = () => {
    const baseReport = MOCK_REPORTS[diffBaseIndex];
    const targetReport = MOCK_REPORTS[diffTargetIndex];
    const [diffFilter, setDiffFilter] = useState<'all' | 'improved' | 'regressed' | 'new'>('all');

    const fileDiffs = useMemo(() => {
      return allFiles.map(f => {
        const basePct = Math.max(0, f.metrics.lines.pct - (Math.random() * 8 - 2));
        const targetPct = f.metrics.lines.pct;
        const isNew = Math.random() < 0.15;
        const newLinesCovered = Math.floor(Math.random() * 20) + 2;
        const newLinesTotal = newLinesCovered + Math.floor(Math.random() * 8);
        const newLineCovPct = newLinesTotal > 0 ? (newLinesCovered / newLinesTotal) * 100 : 0;
        return {
          path: f.path,
          base: isNew ? 0 : basePct,
          target: targetPct,
          delta: isNew ? targetPct : targetPct - basePct,
          isNew,
          recentlyChanged: f.recentlyChanged || false,
          newLinesCovered,
          newLinesTotal,
          newLineCovPct,
        };
      }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }, []);

    const displayDiffs = useMemo(() => {
      if (diffFilter === 'all') return fileDiffs;
      if (diffFilter === 'improved') return fileDiffs.filter(d => d.delta > 0.5);
      if (diffFilter === 'regressed') return fileDiffs.filter(d => d.delta < -0.5);
      return fileDiffs.filter(d => d.isNew);
    }, [fileDiffs, diffFilter]);

    return (
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Layers size={14} color={fgMuted as string} />
          <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Coverage Diff</span>
        </div>
        {/* Report selectors */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: fgMuted, marginBottom: 4 }}>Base Report</div>
            <select
              value={diffBaseIndex}
              onChange={e => setDiffBaseIndex(Number(e.target.value))}
              style={{ width: '100%', padding: '4px 8px', background: inputBg, color: inputFg, border: `1px solid ${inputBorder}`, borderRadius: 3, fontSize: 11, outline: 'none' }}
            >
              {MOCK_REPORTS.map((r, i) => (
                <option key={i} value={i}>Run #{i + 1} - {r.commit.slice(0, 7)} ({r.branch})</option>
              ))}
            </select>
          </div>
          <ArrowRight size={14} color={fgMuted as string} style={{ marginTop: 16 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: fgMuted, marginBottom: 4 }}>Target Report</div>
            <select
              value={diffTargetIndex}
              onChange={e => setDiffTargetIndex(Number(e.target.value))}
              style={{ width: '100%', padding: '4px 8px', background: inputBg, color: inputFg, border: `1px solid ${inputBorder}`, borderRadius: 3, fontSize: 11, outline: 'none' }}
            >
              {MOCK_REPORTS.map((r, i) => (
                <option key={i} value={i}>Run #{i + 1} - {r.commit.slice(0, 7)} ({r.branch})</option>
              ))}
            </select>
          </div>
        </div>
        {/* Overall diff summary */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12, padding: '10px 12px', background: inputBg, borderRadius: 4, border: `1px solid ${panelBorder}` }}>
          {(['lines', 'branches', 'functions', 'statements'] as const).map(key => {
            const basePct = baseReport.overall[key].pct;
            const targetPct = targetReport.overall[key].pct;
            const delta = targetPct - basePct;
            return (
              <div key={key} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: fgMuted, textTransform: 'capitalize', marginBottom: 4 }}>{key}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: getCoverageColorSimple(targetPct) }}>{formatPct(targetPct)}</div>
                <DeltaBadge delta={delta} />
              </div>
            );
          })}
        </div>
        {/* New code coverage summary */}
        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(86,156,214,0.08)', borderRadius: 4, border: '1px solid rgba(86,156,214,0.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#569cd6', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={12} />
            New Code Coverage
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
            <span style={{ color: fgMuted }}>Changed files: <strong style={{ color: fg }}>{fileDiffs.filter(d => d.recentlyChanged).length}</strong></span>
            <span style={{ color: fgMuted }}>New lines covered: <strong style={{ color: successColor as string }}>{fileDiffs.reduce((s, d) => s + d.newLinesCovered, 0)}</strong></span>
            <span style={{ color: fgMuted }}>New lines total: <strong style={{ color: fg }}>{fileDiffs.reduce((s, d) => s + d.newLinesTotal, 0)}</strong></span>
          </div>
        </div>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {([
            { key: 'all', label: 'All Files' },
            { key: 'improved', label: 'Improved' },
            { key: 'regressed', label: 'Regressed' },
            { key: 'new', label: 'New Files' },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setDiffFilter(f.key as typeof diffFilter)}
              style={{
                padding: '3px 10px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                background: diffFilter === f.key ? buttonBg : 'transparent',
                color: diffFilter === f.key ? buttonFg : fgMuted,
                border: `1px solid ${diffFilter === f.key ? buttonBg : panelBorder}`,
              }}
            >{f.label}</button>
          ))}
        </div>
        {/* Per-file diffs */}
        <div style={{ border: `1px solid ${panelBorder}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: inputBg, borderBottom: `1px solid ${panelBorder}`, fontSize: 10, color: fgMuted }}>
            <span style={{ flex: 1 }}>File</span>
            <span style={{ width: 60, textAlign: 'right' }}>Base</span>
            <span style={{ width: 60, textAlign: 'right' }}>Target</span>
            <span style={{ width: 60, textAlign: 'right' }}>New Cov</span>
            <span style={{ width: 70, textAlign: 'right' }}>Delta</span>
          </div>
          {displayDiffs.map((fd, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', borderBottom: i < displayDiffs.length - 1 ? `1px solid ${panelBorder}` : 'none', fontSize: 11 }}
              onMouseEnter={e => (e.currentTarget.style.background = listHoverBg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <FileText size={11} color={fgMuted as string} style={{ marginRight: 6, flexShrink: 0 }} />
              <span style={{ flex: 1, color: fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fd.path}
                {fd.isNew && <span style={{ marginLeft: 6, fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(78,201,105,0.15)', color: '#4ec969' }}>new</span>}
                {fd.recentlyChanged && !fd.isNew && <span style={{ marginLeft: 6, fontSize: 9, padding: '0 4px', borderRadius: 3, background: 'rgba(86,156,214,0.15)', color: '#569cd6' }}>modified</span>}
              </span>
              <span style={{ width: 60, textAlign: 'right', color: fd.isNew ? fgMuted : getCoverageColorSimple(fd.base), fontSize: 10 }}>{fd.isNew ? '--' : formatPct(fd.base)}</span>
              <span style={{ width: 60, textAlign: 'right', color: getCoverageColorSimple(fd.target), fontSize: 10 }}>{formatPct(fd.target)}</span>
              <span style={{ width: 60, textAlign: 'right', color: getCoverageColorSimple(fd.newLineCovPct), fontSize: 10 }}>{formatPct(fd.newLineCovPct)}</span>
              <span style={{
                width: 70, textAlign: 'right', fontSize: 10, fontWeight: 600,
                color: fd.delta > 0.5 ? successColor : fd.delta < -0.5 ? errorColor : fgMuted,
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2,
              }}>
                {fd.delta > 0.5 && <ArrowUp size={9} />}
                {fd.delta < -0.5 && <ArrowDown size={9} />}
                {Math.abs(fd.delta) <= 0.5 && <Minus size={9} />}
                {formatDelta(fd.delta)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // ── Functions View ──────────────────────────────────────────────────────

  const FunctionsView: React.FC = () => {
    const [funcSortBy, setFuncSortBy] = useState<'name' | 'hits' | 'coverage'>('hits');
    const [funcSortAsc, setFuncSortAsc] = useState(false);
    const [funcFilter, setFuncFilter] = useState<'all' | 'covered' | 'uncovered'>('all');

    const allFunctions = useMemo(() => {
      const fns: (FunctionCoverage & { filePath: string })[] = [];
      for (const file of allFiles) {
        for (const fn of file.functions) {
          fns.push({ ...fn, filePath: file.path });
        }
      }
      return fns;
    }, []);

    const filteredFunctions = useMemo(() => {
      let result = allFunctions;
      if (funcFilter === 'covered') result = result.filter(fn => fn.hits > 0);
      if (funcFilter === 'uncovered') result = result.filter(fn => fn.hits === 0);
      result = [...result].sort((a, b) => {
        let cmp = 0;
        if (funcSortBy === 'name') cmp = a.name.localeCompare(b.name);
        else if (funcSortBy === 'hits') cmp = a.hits - b.hits;
        else {
          const aCov = a.branches.total > 0 ? a.branches.covered / a.branches.total : (a.hits > 0 ? 1 : 0);
          const bCov = b.branches.total > 0 ? b.branches.covered / b.branches.total : (b.hits > 0 ? 1 : 0);
          cmp = aCov - bCov;
        }
        return funcSortAsc ? cmp : -cmp;
      });
      return result;
    }, [allFunctions, funcFilter, funcSortBy, funcSortAsc]);

    const totalFunctions = allFunctions.length;
    const coveredFunctions = allFunctions.filter(fn => fn.hits > 0).length;

    const toggleFuncSort = (col: 'name' | 'hits' | 'coverage') => {
      if (funcSortBy === col) setFuncSortAsc(!funcSortAsc);
      else { setFuncSortBy(col); setFuncSortAsc(col === 'name'); }
    };

    return (
      <div style={{ padding: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <Code size={14} color={fgMuted as string} />
          <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Function Coverage</span>
          <span style={{ fontSize: 10, color: fgMuted, marginLeft: 'auto' }}>
            {coveredFunctions}/{totalFunctions} covered ({totalFunctions > 0 ? formatPct(coveredFunctions / totalFunctions * 100) : '0%'})
          </span>
        </div>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['all', 'covered', 'uncovered'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFuncFilter(f)}
              style={{
                padding: '3px 10px', fontSize: 11, border: `1px solid ${funcFilter === f ? buttonBg : panelBorder}`,
                background: funcFilter === f ? buttonBg : 'transparent', color: funcFilter === f ? buttonFg : fgMuted,
                borderRadius: 3, cursor: 'pointer', textTransform: 'capitalize',
              }}
            >{f} ({f === 'all' ? totalFunctions : f === 'covered' ? coveredFunctions : totalFunctions - coveredFunctions})</button>
          ))}
        </div>
        {/* Table */}
        <div style={{ border: `1px solid ${panelBorder}`, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '6px 10px', background: inputBg, borderBottom: `1px solid ${panelBorder}`, fontSize: 10, color: fgMuted }}>
            <span style={{ width: 160, cursor: 'pointer' }} onClick={() => toggleFuncSort('name')}>
              Function {funcSortBy === 'name' && (funcSortAsc ? <ChevronUp size={9} style={{ display: 'inline' }} /> : <ChevronDown size={9} style={{ display: 'inline' }} />)}
            </span>
            <span style={{ width: 180, overflow: 'hidden' }}>File</span>
            <span style={{ width: 70, textAlign: 'center' }}>Lines</span>
            <span style={{ width: 60, textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleFuncSort('hits')}>
              Hits {funcSortBy === 'hits' && (funcSortAsc ? <ChevronUp size={9} style={{ display: 'inline' }} /> : <ChevronDown size={9} style={{ display: 'inline' }} />)}
            </span>
            <span style={{ width: 80, textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleFuncSort('coverage')}>
              Branches {funcSortBy === 'coverage' && (funcSortAsc ? <ChevronUp size={9} style={{ display: 'inline' }} /> : <ChevronDown size={9} style={{ display: 'inline' }} />)}
            </span>
            <span style={{ width: 60, textAlign: 'center' }}>Status</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredFunctions.slice(0, 60).map((fn, i) => {
              const branchPct = fn.branches.total > 0 ? (fn.branches.covered / fn.branches.total) * 100 : (fn.hits > 0 ? 100 : 0);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', borderBottom: `1px solid ${panelBorder}`, fontSize: 11 }}
                  onMouseEnter={e => (e.currentTarget.style.background = listHoverBg)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ width: 160, fontFamily: 'var(--vscode-editor-font-family, monospace)', color: fn.hits > 0 ? fg : errorColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {fn.name}()
                  </span>
                  <span style={{ width: 180, fontSize: 10, color: fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fn.filePath}</span>
                  <span style={{ width: 70, textAlign: 'center', fontSize: 10, color: fgMuted }}>{fn.startLine}-{fn.endLine}</span>
                  <span style={{ width: 60, textAlign: 'center', fontWeight: 600, color: fn.hits > 0 ? successColor : errorColor }}>{fn.hits}x</span>
                  <span style={{ width: 80, textAlign: 'center' }}>
                    <CoverageBar pct={branchPct} width={50} height={3} />
                  </span>
                  <span style={{ width: 60, textAlign: 'center' }}>
                    {fn.hits > 0 ? <CheckCircle size={12} color={successColor as string} /> : <XCircle size={12} color={errorColor as string} />}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Badge Generation View ──────────────────────────────────────────────

  const BadgesView: React.FC = () => {
    const badges = useMemo(() => {
      const metrics = activeReport.overall;
      return [
        { key: 'coverage', label: 'coverage', pct: metrics.lines.pct },
        { key: 'lines', label: 'lines', pct: metrics.lines.pct },
        { key: 'branches', label: 'branches', pct: metrics.branches.pct },
        { key: 'functions', label: 'functions', pct: metrics.functions.pct },
        { key: 'statements', label: 'statements', pct: metrics.statements.pct },
      ];
    }, [activeReport]);

    return (
      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Award size={16} color={fg as string} />
          <span style={{ fontSize: 14, fontWeight: 600, color: fg }}>Coverage Badges</span>
          <span style={{ fontSize: 11, color: fgMuted, marginLeft: 'auto' }}>For README and documentation</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {badges.map(badge => {
            const svgContent = generateBadgeSvg(badge.label, badge.pct);
            const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
            const markdownSnippet = `![${badge.label}](${svgDataUri})`;
            const htmlSnippet = `<img src="${svgDataUri}" alt="${badge.label}: ${formatPct(badge.pct)}" />`;
            return (
              <div key={badge.key} style={{ padding: 14, background: inputBg, borderRadius: 6, border: `1px solid ${panelBorder}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  {/* Badge preview */}
                  <div
                    dangerouslySetInnerHTML={{ __html: svgContent }}
                    style={{ flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 12, fontWeight: 600, color: fg, textTransform: 'capitalize' }}>{badge.label}</span>
                  <span style={{ fontSize: 11, color: getCoverageColorSimple(badge.pct), fontWeight: 600 }}>{formatPct(badge.pct)}</span>
                </div>
                {/* Markdown snippet */}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: fgMuted, fontWeight: 600 }}>Markdown</span>
                    <button
                      onClick={() => handleCopyBadge(`md-${badge.key}`, markdownSnippet)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'transparent', border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', color: copiedBadge === `md-${badge.key}` ? successColor : fgMuted, fontSize: 10 }}
                    >
                      {copiedBadge === `md-${badge.key}` ? <CheckCircle size={10} /> : <Copy size={10} />}
                      {copiedBadge === `md-${badge.key}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ padding: '6px 8px', background: panelBg, borderRadius: 3, fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 10, color: fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${panelBorder}` }}>
                    ![{badge.label}](coverage-badge-{badge.key}.svg)
                  </div>
                </div>
                {/* HTML snippet */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: fgMuted, fontWeight: 600 }}>HTML</span>
                    <button
                      onClick={() => handleCopyBadge(`html-${badge.key}`, htmlSnippet)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: 'transparent', border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', color: copiedBadge === `html-${badge.key}` ? successColor : fgMuted, fontSize: 10 }}
                    >
                      {copiedBadge === `html-${badge.key}` ? <CheckCircle size={10} /> : <Copy size={10} />}
                      {copiedBadge === `html-${badge.key}` ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div style={{ padding: '6px 8px', background: panelBg, borderRadius: 3, fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 10, color: fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${panelBorder}` }}>
                    {`<img src="coverage-badge-${badge.key}.svg" alt="${badge.label}" />`}
                  </div>
                </div>
                {/* Download SVG */}
                <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `coverage-badge-${badge.key}.svg`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', color: fgMuted, fontSize: 10 }}
                  >
                    <Download size={10} />
                    Download SVG
                  </button>
                  <button
                    onClick={() => handleCopyBadge(`svg-${badge.key}`, svgContent)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', color: copiedBadge === `svg-${badge.key}` ? successColor : fgMuted, fontSize: 10 }}
                  >
                    {copiedBadge === `svg-${badge.key}` ? <CheckCircle size={10} /> : <Copy size={10} />}
                    {copiedBadge === `svg-${badge.key}` ? 'Copied SVG' : 'Copy SVG'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Settings Panel ──────────────────────────────────────────────────────

  const SettingsPanel: React.FC = () => {
    const [localThresholds, setLocalThresholds] = useState(thresholds);

    const updateThreshold = (metric: keyof CoverageThresholds, level: 'warn' | 'fail', value: number) => {
      setLocalThresholds(prev => ({
        ...prev,
        [metric]: { ...prev[metric], [level]: value },
      }));
    };

    const applyThresholds = () => {
      setThresholds(localThresholds);
      setShowSettings(false);
    };

    return (
      <div style={{
        position: 'absolute', top: 40, right: 12, width: 340, background: panelBg,
        border: `1px solid ${panelBorder}`, borderRadius: 6, padding: 16, zIndex: 100,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings size={14} color={fgMuted as string} />
            <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Threshold Configuration</span>
          </div>
          <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: fgMuted, cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}>&times;</button>
        </div>
        {(['lines', 'branches', 'functions', 'statements'] as const).map(key => (
          <div key={key} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: fg, textTransform: 'capitalize', marginBottom: 6 }}>{key}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: fgMuted, display: 'block', marginBottom: 2 }}>Pass (%)</label>
                <input
                  type="number" min={0} max={100} value={localThresholds[key].warn}
                  onChange={e => updateThreshold(key, 'warn', Number(e.target.value))}
                  style={{ width: '100%', padding: '3px 6px', background: inputBg, color: inputFg, border: `1px solid ${inputBorder}`, borderRadius: 3, fontSize: 11, outline: 'none' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 10, color: fgMuted, display: 'block', marginBottom: 2 }}>Fail (%)</label>
                <input
                  type="number" min={0} max={100} value={localThresholds[key].fail}
                  onChange={e => updateThreshold(key, 'fail', Number(e.target.value))}
                  style={{ width: '100%', padding: '3px 6px', background: inputBg, color: inputFg, border: `1px solid ${inputBorder}`, borderRadius: 3, fontSize: 11, outline: 'none' }}
                />
              </div>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={applyThresholds} style={{ flex: 1, padding: '6px 12px', background: buttonBg, color: buttonFg, border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
            Apply
          </button>
          <button onClick={() => setShowSettings(false)} style={{ flex: 1, padding: '6px 12px', background: inputBg, color: fg, border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
            Cancel
          </button>
        </div>
        {/* Import section */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${panelBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Upload size={13} color={fgMuted as string} />
            <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Import Coverage Report</span>
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {(['lcov', 'istanbul', 'cobertura'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => setImportFormat(fmt)}
                style={{
                  padding: '3px 8px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                  background: importFormat === fmt ? buttonBg : 'transparent',
                  color: importFormat === fmt ? buttonFg : fgMuted,
                  border: `1px solid ${importFormat === fmt ? buttonBg : panelBorder}`,
                  textTransform: 'uppercase',
                }}
              >{fmt}</button>
            ))}
          </div>
          <button onClick={handleImport} style={{ width: '100%', padding: '6px 12px', background: inputBg, color: fg, border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Upload size={12} />
            Select {importFormat.toUpperCase()} File
          </button>
        </div>
        {/* Export section */}
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${panelBorder}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Download size={13} color={fgMuted as string} />
            <span style={{ fontSize: 12, fontWeight: 600, color: fg }}>Export Coverage Report</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleExport('html')} style={{ flex: 1, padding: '6px 12px', background: inputBg, color: fg, border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <FileText size={11} /> HTML
            </button>
            <button onClick={() => handleExport('json')} style={{ flex: 1, padding: '6px 12px', background: inputBg, color: fg, border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Code size={11} /> JSON
            </button>
          </div>
        </div>
      </div>
    );
  };

  // ── Main Render ─────────────────────────────────────────────────────────

  const viewTabs: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: 'summary', label: 'Summary', icon: <BarChart3 size={13} /> },
    { key: 'tree', label: 'Files', icon: <Folder size={13} /> },
    { key: 'heatmap', label: 'Heatmap', icon: <Flame size={13} /> },
    { key: 'functions', label: 'Functions', icon: <Code size={13} /> },
    { key: 'uncovered', label: 'Uncovered', icon: <Target size={13} /> },
    { key: 'diff', label: 'Diff', icon: <Layers size={13} /> },
    { key: 'badges', label: 'Badges', icon: <Award size={13} /> },
  ];

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: panelBg,
        color: fg,
        fontFamily: 'var(--vscode-font-family, system-ui, -apple-system, sans-serif)',
        fontSize: 13,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${panelBorder}`, flexShrink: 0 }}>
        <Percent size={16} color={successColor as string} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>Code Coverage</span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
          background: activeReport.overall.lines.pct >= thresholds.lines.warn ? 'rgba(78,201,105,0.15)' : activeReport.overall.lines.pct >= thresholds.lines.fail ? 'rgba(204,167,0,0.15)' : 'rgba(241,76,76,0.15)',
          color: getCoverageColor(activeReport.overall.lines.pct, thresholds.lines),
        }}>
          {formatPct(activeReport.overall.lines.pct)}
        </span>
        {overallDelta && <DeltaBadge delta={overallDelta.lines} />}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Gutters toggle */}
          <button
            onClick={() => setGuttersEnabled(!guttersEnabled)}
            title={guttersEnabled ? 'Disable coverage gutters' : 'Enable coverage gutters'}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: guttersEnabled ? 'rgba(78,201,105,0.15)' : 'transparent', border: `1px solid ${guttersEnabled ? 'rgba(78,201,105,0.3)' : panelBorder}`, borderRadius: 3, cursor: 'pointer', color: guttersEnabled ? successColor : fgMuted, fontSize: 10 }}
          >
            {guttersEnabled ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
            Gutters
          </button>
          {/* Branch coverage toggle */}
          <button
            onClick={() => setShowBranchCoverage(!showBranchCoverage)}
            title={showBranchCoverage ? 'Hide branch coverage' : 'Show branch coverage'}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: showBranchCoverage ? 'rgba(86,156,214,0.15)' : 'transparent', border: `1px solid ${showBranchCoverage ? 'rgba(86,156,214,0.3)' : panelBorder}`, borderRadius: 3, cursor: 'pointer', color: showBranchCoverage ? '#569cd6' : fgMuted, fontSize: 10 }}
          >
            <GitBranch size={12} />
            Branches
          </button>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={12} style={{ position: 'absolute', left: 6, top: 6 }} color={fgMuted as string} />
            <input
              type="text"
              placeholder="Filter files..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: 140, padding: '4px 8px 4px 24px', background: inputBg, color: inputFg, border: `1px solid ${inputBorder}`, borderRadius: 3, fontSize: 11, outline: 'none' }}
            />
          </div>
          {/* Filter below threshold */}
          <button
            onClick={() => setFilterBelow(filterBelow === null ? thresholds.lines.warn : null)}
            title={filterBelow !== null ? 'Show all files' : 'Show only files below threshold'}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: filterBelow !== null ? 'rgba(241,76,76,0.15)' : 'transparent', border: `1px solid ${filterBelow !== null ? 'rgba(241,76,76,0.3)' : panelBorder}`, borderRadius: 3, cursor: 'pointer', color: filterBelow !== null ? errorColor : fgMuted, fontSize: 10 }}
          >
            <Filter size={12} />
            Below {thresholds.lines.warn}%
          </button>
          {/* Recently changed filter */}
          <button
            onClick={() => setFilterRecentlyChanged(!filterRecentlyChanged)}
            title={filterRecentlyChanged ? 'Show all files' : 'Show recently changed files only'}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: filterRecentlyChanged ? 'rgba(86,156,214,0.15)' : 'transparent', border: `1px solid ${filterRecentlyChanged ? 'rgba(86,156,214,0.3)' : panelBorder}`, borderRadius: 3, cursor: 'pointer', color: filterRecentlyChanged ? '#569cd6' : fgMuted, fontSize: 10 }}
          >
            <Clock size={12} />
            Changed
          </button>
          {/* Settings */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            style={{ padding: '3px 6px', background: 'transparent', border: `1px solid ${panelBorder}`, borderRadius: 3, cursor: 'pointer', color: fgMuted, display: 'flex', alignItems: 'center' }}
          >
            <Settings size={13} />
          </button>
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${panelBorder}`, flexShrink: 0 }}>
        {viewTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setViewMode(tab.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', fontSize: 11,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: viewMode === tab.key ? fg : fgMuted,
              borderBottom: viewMode === tab.key ? `2px solid ${buttonBg}` : '2px solid transparent',
              fontWeight: viewMode === tab.key ? 600 : 400,
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        {/* Sort controls for applicable views */}
        {(viewMode === 'tree' || viewMode === 'heatmap') && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, paddingRight: 12 }}>
            <span style={{ fontSize: 10, color: fgMuted }}>Sort:</span>
            {(['name', 'lines', 'branches'] as const).map(s => (
              <button
                key={s}
                onClick={() => { if (sortBy === s) setSortAsc(!sortAsc); else { setSortBy(s); setSortAsc(true); } }}
                style={{
                  padding: '2px 6px', fontSize: 9, background: sortBy === s ? 'rgba(14,99,156,0.2)' : 'transparent',
                  border: `1px solid ${sortBy === s ? buttonBg : 'transparent'}`, borderRadius: 2,
                  cursor: 'pointer', color: sortBy === s ? fg : fgMuted, textTransform: 'capitalize',
                }}
              >
                {s} {sortBy === s && (sortAsc ? <ChevronUp size={8} style={{ display: 'inline' }} /> : <ChevronDown size={8} style={{ display: 'inline' }} />)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content area with split: tree + detail */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left panel: tree sidebar for uncovered view */}
        {viewMode === 'uncovered' && (
          <div style={{ width: 260, borderRight: `1px solid ${panelBorder}`, overflowY: 'auto', flexShrink: 0 }}>
            <div style={{ padding: '6px 8px', fontSize: 10, color: fgMuted, borderBottom: `1px solid ${panelBorder}`, fontWeight: 600 }}>FILES</div>
            {filteredFiles.map(f => (
              <div
                key={f.id}
                onClick={() => setSelectedFile(f)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', cursor: 'pointer',
                  background: selectedFile?.id === f.id ? listActiveBg : 'transparent',
                  color: selectedFile?.id === f.id ? listActiveFg : fg,
                  fontSize: 11,
                }}
                onMouseEnter={e => { if (selectedFile?.id !== f.id) e.currentTarget.style.background = listHoverBg; }}
                onMouseLeave={e => { if (selectedFile?.id !== f.id) e.currentTarget.style.background = 'transparent'; }}
              >
                <FileCode size={12} color="#519aba" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <Sparkline data={f.sparkline} width={30} height={12} />
                <span style={{ fontSize: 9, color: getCoverageColorSimple(f.metrics.lines.pct), fontWeight: 600 }}>{formatPct(f.metrics.lines.pct)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Main content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {viewMode === 'summary' && <SummaryView />}
          {viewMode === 'tree' && <TreeView />}
          {viewMode === 'heatmap' && <HeatmapView />}
          {viewMode === 'uncovered' && <UncoveredLinesView />}
          {viewMode === 'diff' && <DiffView />}
          {viewMode === 'functions' && <FunctionsView />}
          {viewMode === 'badges' && <BadgesView />}
        </div>
      </div>

      {/* Status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 12px', borderTop: `1px solid ${panelBorder}`, fontSize: 10, color: fgMuted, flexShrink: 0, background: inputBg }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Zap size={10} />
          {allFiles.length} files analyzed
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Hash size={10} />
          {activeReport.overall.lines.total} total lines
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <GitBranch size={10} />
          {activeReport.overall.branches.total} branches
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Code size={10} />
          {activeReport.overall.functions.total} functions
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          Gutters: {guttersEnabled ? <span style={{ color: successColor }}>On</span> : <span>Off</span>}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Report: #{activeReportIndex + 1}
        </span>
        <span>{activeReport.branch} @ {activeReport.commit.slice(0, 7)}</span>
      </div>

      {/* Settings overlay */}
      {showSettings && <SettingsPanel />}
    </div>
  );
};

export default CodeCoveragePanel;
