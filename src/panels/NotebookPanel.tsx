import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Play,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Square,
  RotateCcw,
  Save,
  Download,
  X,
  Code,
  FileText,
  Zap,
  CheckCircle,
  AlertCircle,
  Loader,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Terminal,
  Table,
  Image as ImageIcon,
  Type,
  PlayCircle,
  StopCircle,
  Eraser,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type CellType = 'code' | 'markdown';
type CellStatus = 'idle' | 'running' | 'success' | 'error';
type KernelLanguage = 'python' | 'javascript' | 'typescript';
type OutputKind = 'text' | 'html' | 'image' | 'table' | 'error';

interface CellOutput {
  kind: OutputKind;
  content: string;
  /** base64 data for images */
  data?: string;
  /** table rows for table output */
  tableData?: { headers: string[]; rows: string[][] };
}

interface NotebookCell {
  id: string;
  type: CellType;
  source: string;
  outputs: CellOutput[];
  status: CellStatus;
  executionCount: number | null;
  collapsed: boolean;
}

interface InspectorVariable {
  name: string;
  type: string;
  value: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let cellIdCounter = 0;
const newCellId = () => `cell-${++cellIdCounter}`;

let globalExecutionCount = 0;

const createCell = (type: CellType, source = ''): NotebookCell => ({
  id: newCellId(),
  type,
  source,
  outputs: [],
  status: 'idle',
  executionCount: null,
  collapsed: false,
});

// Tiny markdown-to-HTML converter for markdown cells (handles basics)
const renderMarkdown = (md: string): string => {
  let html = md
    // headers
    .replace(/^### (.+)$/gm, '<h3 style="margin:4px 0;color:var(--text-primary)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:4px 0;color:var(--text-primary)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:6px 0;color:var(--text-primary)">$1</h1>')
    // bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:1px 4px;border-radius:3px;font-size:12px">$1</code>')
    // unordered list
    .replace(/^- (.+)$/gm, '<li style="margin-left:16px;color:var(--text-secondary)">$1</li>')
    // links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:var(--accent-primary)">$1</a>')
    // line breaks
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
  return html;
};

// Simulated execution results per kernel
const simulateExecution = (
  source: string,
  kernel: KernelLanguage
): { outputs: CellOutput[]; variables: InspectorVariable[] } => {
  const outputs: CellOutput[] = [];
  const variables: InspectorVariable[] = [];
  const trimmed = source.trim();

  // Detect print / console.log
  const printRegex =
    kernel === 'python'
      ? /print\(["'](.+?)["']\)/g
      : /console\.log\(["'](.+?)["']\)/g;
  let m: RegExpExecArray | null;
  while ((m = printRegex.exec(trimmed)) !== null) {
    outputs.push({ kind: 'text', content: m[1] });
  }

  // Detect variable assignments
  const assignRegex =
    kernel === 'python'
      ? /^(\w+)\s*=\s*(.+)$/gm
      : /(?:const|let|var)\s+(\w+)\s*=\s*(.+)/gm;
  while ((m = assignRegex.exec(trimmed)) !== null) {
    const name = m[1];
    const val = m[2].replace(/;$/, '').trim();
    let type = 'unknown';
    if (/^\d+$/.test(val)) type = 'int';
    else if (/^\d+\.\d+$/.test(val)) type = 'float';
    else if (/^["']/.test(val)) type = 'str';
    else if (/^\[/.test(val)) type = 'list';
    else if (/^\{/.test(val)) type = 'dict';
    variables.push({ name, type, value: val });
  }

  // Detect table-like data (pd.DataFrame or array-of-objects)
  if (trimmed.includes('DataFrame') || trimmed.includes('createTable')) {
    outputs.push({
      kind: 'table',
      content: '',
      tableData: {
        headers: ['Name', 'Age', 'City'],
        rows: [
          ['Alice', '30', 'New York'],
          ['Bob', '25', 'San Francisco'],
          ['Charlie', '35', 'Chicago'],
          ['Diana', '28', 'Seattle'],
        ],
      },
    });
  }

  // Detect image output
  if (trimmed.includes('plt.show') || trimmed.includes('displayImage')) {
    outputs.push({
      kind: 'image',
      content: 'Generated plot output',
      data: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iIzFhMWEyZSIvPjxyZWN0IHg9IjMwIiB5PSIxMjAiIHdpZHRoPSIzMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzRlYzliMCIvPjxyZWN0IHg9IjcwIiB5PSI4MCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjNGVjOWIwIi8+PHJlY3QgeD0iMTEwIiB5PSI1MCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjNGVjOWIwIi8+PHJlY3QgeD0iMTUwIiB5PSI3MCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjcwIiBmaWxsPSIjNGVjOWIwIi8+PHJlY3QgeD0iMTkwIiB5PSIzMCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjExMCIgZmlsbD0iIzRlYzliMCIvPjxyZWN0IHg9IjIzMCIgeT0iMTAiIHdpZHRoPSIzMCIgaGVpZ2h0PSIxMzAiIGZpbGw9IiM0ZWM5YjAiLz48L3N2Zz4=',
    });
  }

  // Detect HTML output
  if (trimmed.includes('HTML(') || trimmed.includes('renderHTML')) {
    outputs.push({
      kind: 'html',
      content:
        '<div style="padding:8px;background:var(--bg-tertiary);border-radius:4px;color:var(--accent-primary);font-weight:600">Rich HTML Output: Styled content rendered inline</div>',
    });
  }

  // Detect errors
  if (trimmed.includes('raise') || trimmed.includes('throw')) {
    outputs.push({
      kind: 'error',
      content: kernel === 'python'
        ? `Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\nValueError: Something went wrong in the computation`
        : `Error: Something went wrong in the computation\n    at Object.<anonymous> (<stdin>:1:7)\n    at Module._compile (internal/modules/cjs/loader.js:1085:14)`,
    });
  }

  // If nothing detected, echo last expression
  if (outputs.length === 0 && trimmed.length > 0) {
    const lines = trimmed.split('\n');
    const last = lines[lines.length - 1].trim();
    if (last && !last.includes('=') && !last.startsWith('#') && !last.startsWith('//') && !last.startsWith('import')) {
      outputs.push({ kind: 'text', content: last });
    }
  }

  return { outputs, variables };
};

// ─── Demo cells ───────────────────────────────────────────────────────────────

const createDemoCells = (): NotebookCell[] => {
  const cells: NotebookCell[] = [];

  const md1 = createCell('markdown', '# Data Analysis Notebook\n\nThis notebook demonstrates **interactive code execution** with rich outputs.\n\n- Run cells with the play button or Shift+Enter\n- Add new cells with the toolbar\n- Drag cells to reorder them');
  md1.status = 'success';
  cells.push(md1);

  const c1 = createCell('code', 'import pandas as pd\nimport numpy as np\n\ndata = {"Name": ["Alice", "Bob", "Charlie", "Diana"], "Age": [30, 25, 35, 28], "City": ["New York", "San Francisco", "Chicago", "Seattle"]}\ndf = pd.DataFrame(data)\ndf');
  c1.executionCount = 1;
  c1.status = 'success';
  c1.outputs = [
    {
      kind: 'table',
      content: '',
      tableData: {
        headers: ['Name', 'Age', 'City'],
        rows: [
          ['Alice', '30', 'New York'],
          ['Bob', '25', 'San Francisco'],
          ['Charlie', '35', 'Chicago'],
          ['Diana', '28', 'Seattle'],
        ],
      },
    },
  ];
  cells.push(c1);

  const c2 = createCell('code', 'x = 42\nname = "Notebook"\nscores = [95, 87, 72, 88]\nprint("Hello from the notebook!")');
  c2.executionCount = 2;
  c2.status = 'success';
  c2.outputs = [{ kind: 'text', content: 'Hello from the notebook!' }];
  cells.push(c2);

  const md2 = createCell('markdown', '## Visualization\n\nThe cell below generates a **bar chart** using matplotlib.');
  md2.status = 'success';
  cells.push(md2);

  const c3 = createCell('code', 'import matplotlib.pyplot as plt\n\ncategories = ["A", "B", "C", "D", "E", "F"]\nvalues = [20, 60, 50, 70, 110, 130]\n\nplt.bar(categories, values, color="#4ec9b0")\nplt.title("Sample Bar Chart")\nplt.show()');
  c3.executionCount = 3;
  c3.status = 'success';
  c3.outputs = [
    {
      kind: 'image',
      content: 'matplotlib bar chart',
      data: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iIzFhMWEyZSIvPjxyZWN0IHg9IjMwIiB5PSIxMjAiIHdpZHRoPSIzMCIgaGVpZ2h0PSIyMCIgZmlsbD0iIzRlYzliMCIvPjxyZWN0IHg9IjcwIiB5PSI4MCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjYwIiBmaWxsPSIjNGVjOWIwIi8+PHJlY3QgeD0iMTEwIiB5PSI1MCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjkwIiBmaWxsPSIjNGVjOWIwIi8+PHJlY3QgeD0iMTUwIiB5PSI3MCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjcwIiBmaWxsPSIjNGVjOWIwIi8+PHJlY3QgeD0iMTkwIiB5PSIzMCIgd2lkdGg9IjMwIiBoZWlnaHQ9IjExMCIgZmlsbD0iIzRlYzliMCIvPjxyZWN0IHg9IjIzMCIgeT0iMTAiIHdpZHRoPSIzMCIgaGVpZ2h0PSIxMzAiIGZpbGw9IiM0ZWM5YjAiLz48L3N2Zz4=',
    },
  ];
  cells.push(c3);

  const c4 = createCell('code', '# This cell demonstrates error output\nraise ValueError("Something went wrong in the computation")');
  c4.executionCount = 4;
  c4.status = 'error';
  c4.outputs = [
    {
      kind: 'error',
      content: 'Traceback (most recent call last):\n  File "<stdin>", line 1, in <module>\nValueError: Something went wrong in the computation',
    },
  ];
  cells.push(c4);

  const c5 = createCell('code', 'from IPython.display import HTML\nHTML("<b>Rich</b> <span style=\'color:#4ec9b0\'>HTML rendering</span> is supported!")');
  c5.executionCount = 5;
  c5.status = 'success';
  c5.outputs = [
    {
      kind: 'html',
      content: '<div style="padding:8px;background:var(--bg-tertiary);border-radius:4px"><b>Rich</b> <span style="color:#4ec9b0">HTML rendering</span> is supported!</div>',
    },
  ];
  cells.push(c5);

  return cells;
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-primary, #1e1e2e)',
    color: 'var(--text-primary, #cdd6f4)',
    fontFamily: 'var(--font-family, "Segoe UI", system-ui, sans-serif)',
    fontSize: 13,
    overflow: 'hidden',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-primary, #313244)',
    background: 'var(--bg-secondary, #181825)',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
  toolbarBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    border: '1px solid var(--border-primary, #313244)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--text-secondary, #a6adc8)',
    cursor: 'pointer',
    fontSize: 12,
    whiteSpace: 'nowrap' as const,
  },
  toolbarBtnPrimary: {
    background: 'var(--accent-primary, #4ec9b0)',
    color: '#000',
    border: 'none',
    fontWeight: 600,
  },
  toolbarDivider: {
    width: 1,
    height: 20,
    background: 'var(--border-primary, #313244)',
    margin: '0 4px',
  },
  kernelSelect: {
    padding: '4px 8px',
    border: '1px solid var(--border-primary, #313244)',
    borderRadius: 4,
    background: 'var(--bg-tertiary, #11111b)',
    color: 'var(--text-primary, #cdd6f4)',
    fontSize: 12,
    cursor: 'pointer',
    outline: 'none',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  cellList: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: '12px 16px',
  },
  sidebar: {
    width: 260,
    borderLeft: '1px solid var(--border-primary, #313244)',
    background: 'var(--bg-secondary, #181825)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0,
  },
  sidebarHeader: {
    padding: '8px 12px',
    fontWeight: 600,
    fontSize: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: 'var(--text-muted, #6c7086)',
    borderBottom: '1px solid var(--border-primary, #313244)',
  },
  sidebarBody: {
    flex: 1,
    overflowY: 'auto' as const,
    padding: 8,
  },
  variableRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 12,
    marginBottom: 2,
  },
  variableName: {
    color: 'var(--accent-secondary, #89b4fa)',
    fontFamily: 'var(--font-mono, "Cascadia Code", Consolas, monospace)',
    fontWeight: 600,
  },
  variableType: {
    color: 'var(--text-muted, #6c7086)',
    fontSize: 11,
    fontStyle: 'italic' as const,
  },
  variableValue: {
    color: 'var(--text-secondary, #a6adc8)',
    fontFamily: 'var(--font-mono, "Cascadia Code", Consolas, monospace)',
    fontSize: 11,
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  // Cell styles
  cell: {
    marginBottom: 8,
    borderRadius: 6,
    border: '1px solid var(--border-primary, #313244)',
    background: 'var(--bg-secondary, #181825)',
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  cellSelected: {
    borderColor: 'var(--accent-primary, #4ec9b0)',
  },
  cellHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    background: 'var(--bg-tertiary, #11111b)',
    borderBottom: '1px solid var(--border-primary, #313244)',
    fontSize: 12,
  },
  execCount: {
    fontFamily: 'var(--font-mono, "Cascadia Code", Consolas, monospace)',
    fontSize: 11,
    color: 'var(--text-muted, #6c7086)',
    minWidth: 40,
    textAlign: 'right' as const,
    marginRight: 4,
  },
  cellTypeBadge: {
    padding: '1px 6px',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
  },
  cellActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
  },
  cellActionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    border: 'none',
    borderRadius: 3,
    background: 'transparent',
    color: 'var(--text-muted, #6c7086)',
    cursor: 'pointer',
    padding: 0,
  },
  codeArea: {
    padding: '8px 12px',
    fontFamily: 'var(--font-mono, "Cascadia Code", Consolas, monospace)',
    fontSize: 13,
    lineHeight: '20px',
    background: 'var(--bg-primary, #1e1e2e)',
    minHeight: 40,
  },
  textarea: {
    width: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-primary, #cdd6f4)',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    lineHeight: 'inherit',
    resize: 'vertical' as const,
    minHeight: 40,
    padding: 0,
  },
  outputArea: {
    borderTop: '1px solid var(--border-primary, #313244)',
    padding: '8px 12px',
    fontSize: 13,
    lineHeight: '18px',
  },
  outputText: {
    fontFamily: 'var(--font-mono, "Cascadia Code", Consolas, monospace)',
    whiteSpace: 'pre-wrap' as const,
    color: 'var(--text-secondary, #a6adc8)',
  },
  outputError: {
    fontFamily: 'var(--font-mono, "Cascadia Code", Consolas, monospace)',
    whiteSpace: 'pre-wrap' as const,
    color: '#f38ba8',
    background: 'rgba(243, 139, 168, 0.08)',
    padding: 8,
    borderRadius: 4,
  },
  outputImage: {
    maxWidth: '100%',
    borderRadius: 4,
    marginTop: 4,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: 12,
    fontFamily: 'var(--font-mono, "Cascadia Code", Consolas, monospace)',
  },
  th: {
    padding: '6px 10px',
    borderBottom: '2px solid var(--border-primary, #313244)',
    textAlign: 'left' as const,
    color: 'var(--text-primary, #cdd6f4)',
    fontWeight: 600,
    background: 'var(--bg-tertiary, #11111b)',
  },
  td: {
    padding: '4px 10px',
    borderBottom: '1px solid var(--border-primary, #313244)',
    color: 'var(--text-secondary, #a6adc8)',
  },
  markdownPreview: {
    padding: '10px 14px',
    lineHeight: '1.6',
    color: 'var(--text-primary, #cdd6f4)',
    fontSize: 14,
  },
  addCellBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '4px 0',
    opacity: 0,
    transition: 'opacity 0.15s',
  },
  addCellBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 10px',
    border: '1px dashed var(--border-primary, #313244)',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--text-muted, #6c7086)',
    cursor: 'pointer',
    fontSize: 11,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
    marginRight: 4,
    flexShrink: 0,
  },
  kernelStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--text-muted, #6c7086)',
    marginLeft: 8,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    borderTop: '1px solid var(--border-primary, #313244)',
    background: 'var(--bg-secondary, #181825)',
    fontSize: 11,
    color: 'var(--text-muted, #6c7086)',
    flexShrink: 0,
  },
};

// ─── Status color helper ──────────────────────────────────────────────────────

const statusColor = (status: CellStatus): string => {
  switch (status) {
    case 'running': return '#f9e2af';
    case 'success': return '#a6e3a1';
    case 'error':   return '#f38ba8';
    default:        return '#6c7086';
  }
};

const statusIcon = (status: CellStatus, size = 14) => {
  switch (status) {
    case 'running': return <Loader size={size} style={{ color: '#f9e2af', animation: 'spin 1s linear infinite' }} />;
    case 'success': return <CheckCircle size={size} style={{ color: '#a6e3a1' }} />;
    case 'error':   return <AlertCircle size={size} style={{ color: '#f38ba8' }} />;
    default:        return null;
  }
};

// ─── NotebookPanel Component ──────────────────────────────────────────────────

const NotebookPanel: React.FC = () => {
  const [cells, setCells] = useState<NotebookCell[]>(createDemoCells);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [kernel, setKernel] = useState<KernelLanguage>('python');
  const [kernelBusy, setKernelBusy] = useState(false);
  const [showInspector, setShowInspector] = useState(true);
  const [variables, setVariables] = useState<InspectorVariable[]>([
    { name: 'df', type: 'DataFrame', value: 'DataFrame(4x3)' },
    { name: 'x', type: 'int', value: '42' },
    { name: 'name', type: 'str', value: '"Notebook"' },
    { name: 'scores', type: 'list', value: '[95, 87, 72, 88]' },
  ]);
  const [editingMarkdown, setEditingMarkdown] = useState<string | null>(null);
  const cellListRef = useRef<HTMLDivElement>(null);

  // ── Cell operations ─────────────────────────────────────────────────────

  const updateCellSource = useCallback((id: string, source: string) => {
    setCells(prev => prev.map(c => (c.id === id ? { ...c, source } : c)));
  }, []);

  const runCell = useCallback(
    (id: string) => {
      setCells(prev => {
        const idx = prev.findIndex(c => c.id === id);
        if (idx === -1) return prev;
        const cell = prev[idx];
        if (cell.type === 'markdown') {
          const updated = [...prev];
          updated[idx] = { ...cell, status: 'success' };
          setEditingMarkdown(null);
          return updated;
        }
        // Mark running
        const updated = [...prev];
        updated[idx] = { ...cell, status: 'running', outputs: [] };
        return updated;
      });

      // Simulate async execution
      setKernelBusy(true);
      setTimeout(() => {
        setCells(prev => {
          const idx = prev.findIndex(c => c.id === id);
          if (idx === -1) return prev;
          const cell = prev[idx];
          if (cell.type !== 'code') return prev;
          globalExecutionCount++;
          const { outputs, variables: newVars } = simulateExecution(cell.source, kernel);
          const hasError = outputs.some(o => o.kind === 'error');
          const updated = [...prev];
          updated[idx] = {
            ...cell,
            status: hasError ? 'error' : 'success',
            executionCount: globalExecutionCount,
            outputs,
          };

          if (newVars.length > 0) {
            setVariables(prev => {
              const merged = [...prev];
              for (const nv of newVars) {
                const existing = merged.findIndex(v => v.name === nv.name);
                if (existing !== -1) merged[existing] = nv;
                else merged.push(nv);
              }
              return merged;
            });
          }
          return updated;
        });
        setKernelBusy(false);
      }, 600 + Math.random() * 400);
    },
    [kernel]
  );

  const runAllCells = useCallback(() => {
    const codeCells = cells.filter(c => c.type === 'code' || c.type === 'markdown');
    let delay = 0;
    for (const cell of codeCells) {
      setTimeout(() => runCell(cell.id), delay);
      delay += 800;
    }
  }, [cells, runCell]);

  const addCell = useCallback(
    (type: CellType, afterId?: string) => {
      setCells(prev => {
        const cell = createCell(type, type === 'code' ? '' : '## New Section\n\nWrite your markdown here.');
        if (!afterId) return [...prev, cell];
        const idx = prev.findIndex(c => c.id === afterId);
        const updated = [...prev];
        updated.splice(idx + 1, 0, cell);
        return updated;
      });
    },
    []
  );

  const addCellAbove = useCallback(
    (id: string, type: CellType) => {
      setCells(prev => {
        const idx = prev.findIndex(c => c.id === id);
        const cell = createCell(type);
        const updated = [...prev];
        updated.splice(idx, 0, cell);
        return updated;
      });
    },
    []
  );

  const deleteCell = useCallback((id: string) => {
    setCells(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(c => c.id !== id);
    });
  }, []);

  const moveCell = useCallback((id: string, direction: 'up' | 'down') => {
    setCells(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx === -1) return prev;
      if (direction === 'up' && idx === 0) return prev;
      if (direction === 'down' && idx === prev.length - 1) return prev;
      const updated = [...prev];
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
      return updated;
    });
  }, []);

  const changeCellType = useCallback((id: string, newType: CellType) => {
    setCells(prev =>
      prev.map(c =>
        c.id === id ? { ...c, type: newType, outputs: [], executionCount: null, status: 'idle' } : c
      )
    );
  }, []);

  const toggleCellCollapse = useCallback((id: string) => {
    setCells(prev => prev.map(c => (c.id === id ? { ...c, collapsed: !c.collapsed } : c)));
  }, []);

  const clearAllOutputs = useCallback(() => {
    setCells(prev =>
      prev.map(c => ({ ...c, outputs: [], status: 'idle', executionCount: null }))
    );
    globalExecutionCount = 0;
  }, []);

  const restartKernel = useCallback(() => {
    setKernelBusy(true);
    setVariables([]);
    globalExecutionCount = 0;
    setCells(prev => prev.map(c => ({ ...c, outputs: [], status: 'idle', executionCount: null })));
    setTimeout(() => setKernelBusy(false), 1000);
  }, []);

  const exportAsIpynb = useCallback(() => {
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { display_name: kernel, language: kernel, name: kernel } },
      cells: cells.map(c => ({
        cell_type: c.type,
        source: c.source.split('\n'),
        metadata: {},
        ...(c.type === 'code'
          ? { execution_count: c.executionCount, outputs: c.outputs.map(o => ({ output_type: 'stream', text: [o.content] })) }
          : {}),
      })),
    };
    const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notebook.ipynb';
    a.click();
    URL.revokeObjectURL(url);
  }, [cells, kernel]);

  const exportAsPy = useCallback(() => {
    const lines: string[] = [];
    for (const c of cells) {
      if (c.type === 'markdown') {
        lines.push('# %%  [markdown]');
        c.source.split('\n').forEach(l => lines.push(`# ${l}`));
      } else {
        lines.push('# %%');
        lines.push(c.source);
      }
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notebook.py';
    a.click();
    URL.revokeObjectURL(url);
  }, [cells]);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'Enter' && selectedCellId) {
        e.preventDefault();
        runCell(selectedCellId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedCellId, runCell]);

  // ── Render output ───────────────────────────────────────────────────────

  const renderOutput = (output: CellOutput, idx: number) => {
    switch (output.kind) {
      case 'text':
        return (
          <div key={idx} style={styles.outputText}>
            {output.content}
          </div>
        );
      case 'error':
        return (
          <div key={idx} style={styles.outputError}>
            {output.content}
          </div>
        );
      case 'html':
        return (
          <div
            key={idx}
            dangerouslySetInnerHTML={{ __html: output.content }}
            style={{ marginTop: 4 }}
          />
        );
      case 'image':
        return (
          <div key={idx}>
            {output.data ? (
              <img src={output.data} alt={output.content} style={styles.outputImage} />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
                [Image: {output.content}]
              </div>
            )}
          </div>
        );
      case 'table':
        if (!output.tableData) return null;
        return (
          <table key={idx} style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, color: 'var(--text-muted)', width: 30 }}>#</th>
                {output.tableData.headers.map((h, i) => (
                  <th key={i} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {output.tableData.rows.map((row, ri) => (
                <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={{ ...styles.td, color: 'var(--text-muted)' }}>{ri}</td>
                  {row.map((val, ci) => (
                    <td key={ci} style={styles.td}>{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      default:
        return null;
    }
  };

  // ── Render cell ─────────────────────────────────────────────────────────

  const renderCell = (cell: NotebookCell, index: number) => {
    const isSelected = selectedCellId === cell.id;
    const isMarkdownEditing = editingMarkdown === cell.id;
    const showMarkdownPreview = cell.type === 'markdown' && !isMarkdownEditing;

    return (
      <React.Fragment key={cell.id}>
        {/* Add cell bar between cells */}
        {index > 0 && (
          <div
            style={styles.addCellBar}
            className="add-cell-bar"
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.opacity = '0'; }}
          >
            <button
              style={styles.addCellBtn}
              onClick={() => addCellAbove(cell.id, 'code')}
              title="Add code cell above"
            >
              <Code size={10} /> Code
            </button>
            <button
              style={styles.addCellBtn}
              onClick={() => addCellAbove(cell.id, 'markdown')}
              title="Add markdown cell above"
            >
              <FileText size={10} /> Markdown
            </button>
          </div>
        )}

        <div
          style={{
            ...styles.cell,
            ...(isSelected ? styles.cellSelected : {}),
          }}
          onClick={() => setSelectedCellId(cell.id)}
        >
          {/* Cell header */}
          <div style={styles.cellHeader}>
            {/* Status indicator */}
            <div style={{ ...styles.statusDot, background: statusColor(cell.status) }} />

            {/* Execution count */}
            <span style={styles.execCount}>
              {cell.type === 'code'
                ? cell.executionCount !== null
                  ? `[${cell.executionCount}]`
                  : '[ ]'
                : ''}
            </span>

            {/* Cell type badge */}
            <span
              style={{
                ...styles.cellTypeBadge,
                background: cell.type === 'code' ? 'rgba(137,180,250,0.15)' : 'rgba(166,227,161,0.15)',
                color: cell.type === 'code' ? '#89b4fa' : '#a6e3a1',
              }}
            >
              {cell.type === 'code' ? 'Code' : 'MD'}
            </span>

            {/* Status icon */}
            <span style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}>
              {statusIcon(cell.status)}
            </span>

            {/* Cell actions */}
            <div style={styles.cellActions}>
              {cell.type === 'code' && (
                <button
                  style={{ ...styles.cellActionBtn, color: '#a6e3a1' }}
                  onClick={(e) => { e.stopPropagation(); runCell(cell.id); }}
                  title="Run cell (Shift+Enter)"
                >
                  <Play size={13} />
                </button>
              )}
              <button
                style={styles.cellActionBtn}
                onClick={(e) => { e.stopPropagation(); toggleCellCollapse(cell.id); }}
                title={cell.collapsed ? 'Expand' : 'Collapse'}
              >
                {cell.collapsed ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                style={styles.cellActionBtn}
                onClick={(e) => { e.stopPropagation(); moveCell(cell.id, 'up'); }}
                title="Move up"
              >
                <ChevronUp size={13} />
              </button>
              <button
                style={styles.cellActionBtn}
                onClick={(e) => { e.stopPropagation(); moveCell(cell.id, 'down'); }}
                title="Move down"
              >
                <ChevronDown size={13} />
              </button>
              <select
                style={{ ...styles.kernelSelect, padding: '1px 4px', fontSize: 10 }}
                value={cell.type}
                onChange={(e) => changeCellType(cell.id, e.target.value as CellType)}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="code">Code</option>
                <option value="markdown">Markdown</option>
              </select>
              <button
                style={{ ...styles.cellActionBtn, color: '#f38ba8' }}
                onClick={(e) => { e.stopPropagation(); deleteCell(cell.id); }}
                title="Delete cell"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Cell body */}
          {!cell.collapsed && (
            <>
              {showMarkdownPreview ? (
                <div
                  style={styles.markdownPreview}
                  onDoubleClick={() => setEditingMarkdown(cell.id)}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source) }}
                  title="Double-click to edit"
                />
              ) : (
                <div style={styles.codeArea}>
                  <textarea
                    style={styles.textarea}
                    value={cell.source}
                    onChange={(e) => updateCellSource(cell.id, e.target.value)}
                    onFocus={() => {
                      setSelectedCellId(cell.id);
                      if (cell.type === 'markdown') setEditingMarkdown(cell.id);
                    }}
                    onBlur={() => {
                      if (cell.type === 'markdown') setEditingMarkdown(null);
                    }}
                    rows={Math.max(2, cell.source.split('\n').length)}
                    spellCheck={false}
                    placeholder={cell.type === 'code' ? `# Enter ${kernel} code...` : '# Enter markdown...'}
                  />
                </div>
              )}

              {/* Outputs */}
              {cell.outputs.length > 0 && (
                <div style={styles.outputArea}>
                  {cell.outputs.map((o, oi) => renderOutput(o, oi))}
                </div>
              )}

              {/* Running indicator */}
              {cell.status === 'running' && (
                <div style={{ ...styles.outputArea, color: '#f9e2af', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} />
                  Executing...
                </div>
              )}
            </>
          )}
        </div>
      </React.Fragment>
    );
  };

  // ── Main render ─────────────────────────────────────────────────────────

  const totalCells = cells.length;
  const executedCells = cells.filter(c => c.executionCount !== null).length;

  return (
    <div style={styles.container}>
      {/* Spin animation for loader */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button
          style={{ ...styles.toolbarBtn, ...styles.toolbarBtnPrimary }}
          onClick={runAllCells}
          title="Run all cells"
        >
          <PlayCircle size={14} /> Run All
        </button>
        <button style={styles.toolbarBtn} onClick={restartKernel} title="Restart kernel">
          <RotateCcw size={14} /> Restart
        </button>
        <button style={styles.toolbarBtn} onClick={clearAllOutputs} title="Clear all outputs">
          <Eraser size={14} /> Clear
        </button>

        <div style={styles.toolbarDivider} />

        <button style={styles.toolbarBtn} onClick={() => addCell('code')} title="Add code cell">
          <Plus size={14} /> <Code size={13} /> Code
        </button>
        <button style={styles.toolbarBtn} onClick={() => addCell('markdown')} title="Add markdown cell">
          <Plus size={14} /> <FileText size={13} /> Markdown
        </button>

        <div style={styles.toolbarDivider} />

        <select
          style={styles.kernelSelect}
          value={kernel}
          onChange={(e) => setKernel(e.target.value as KernelLanguage)}
        >
          <option value="python">Python 3</option>
          <option value="javascript">JavaScript (Node)</option>
          <option value="typescript">TypeScript</option>
        </select>

        <div style={styles.kernelStatus}>
          <div
            style={{
              ...styles.statusDot,
              background: kernelBusy ? '#f9e2af' : '#a6e3a1',
            }}
          />
          {kernelBusy ? 'Busy' : 'Idle'}
        </div>

        <div style={{ flex: 1 }} />

        <button style={styles.toolbarBtn} onClick={exportAsIpynb} title="Export as .ipynb">
          <Download size={14} /> .ipynb
        </button>
        <button style={styles.toolbarBtn} onClick={exportAsPy} title="Export as .py">
          <Download size={14} /> .py
        </button>
        <button style={styles.toolbarBtn} onClick={() => alert('Notebook saved!')} title="Save">
          <Save size={14} /> Save
        </button>

        <div style={styles.toolbarDivider} />

        <button
          style={styles.toolbarBtn}
          onClick={() => setShowInspector(!showInspector)}
          title={showInspector ? 'Hide variable inspector' : 'Show variable inspector'}
        >
          {showInspector ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </button>
      </div>

      {/* Body */}
      <div style={styles.body}>
        {/* Cell list */}
        <div style={styles.cellList} ref={cellListRef}>
          {cells.map((cell, idx) => renderCell(cell, idx))}

          {/* Bottom add cell bar */}
          <div style={{ ...styles.addCellBar, opacity: 1, paddingTop: 12 }}>
            <button style={styles.addCellBtn} onClick={() => addCell('code')}>
              <Code size={10} /> Add Code Cell
            </button>
            <button style={styles.addCellBtn} onClick={() => addCell('markdown')}>
              <FileText size={10} /> Add Markdown Cell
            </button>
          </div>
        </div>

        {/* Variable Inspector Sidebar */}
        {showInspector && (
          <div style={styles.sidebar}>
            <div style={styles.sidebarHeader}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={12} /> Variable Inspector
              </span>
            </div>
            <div style={styles.sidebarBody}>
              {variables.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: 8, textAlign: 'center' }}>
                  No variables defined yet. Run a code cell to populate this panel.
                </div>
              ) : (
                variables.map((v, i) => (
                  <div
                    key={v.name}
                    style={{
                      ...styles.variableRow,
                      background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    }}
                  >
                    <div>
                      <span style={styles.variableName}>{v.name}</span>
                      <span style={{ ...styles.variableType, marginLeft: 6 }}>({v.type})</span>
                    </div>
                    <span style={styles.variableValue} title={v.value}>
                      {v.value}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Kernel info in sidebar */}
            <div
              style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--border-primary, #313244)',
                fontSize: 11,
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Terminal size={11} />
                <span style={{ fontWeight: 600 }}>Kernel</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{kernel === 'python' ? 'Python 3.11' : kernel === 'javascript' ? 'Node 20 LTS' : 'ts-node 10.9'}</span>
                <span style={{ color: kernelBusy ? '#f9e2af' : '#a6e3a1' }}>
                  {kernelBusy ? 'Busy' : 'Ready'}
                </span>
              </div>
              <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Variables</span>
                <span>{variables.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Executed</span>
                <span>{executedCells} / {totalCells}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div style={styles.statusBar}>
        <span>
          {totalCells} cell{totalCells !== 1 ? 's' : ''} | {executedCells} executed | Kernel:{' '}
          {kernel === 'python' ? 'Python 3' : kernel === 'javascript' ? 'Node.js' : 'TypeScript'}
        </span>
        <span>
          {kernelBusy ? 'Kernel busy...' : 'Ready'} | Execution count: {globalExecutionCount}
        </span>
      </div>
    </div>
  );
};

export default NotebookPanel;
