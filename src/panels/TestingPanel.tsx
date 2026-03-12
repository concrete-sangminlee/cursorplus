import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Play,
  RotateCw,
  ChevronRight,
  ChevronDown,
  Circle,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
  FileText,
  FolderOpen,
  Clock,
  Bug,
  Search,
  ArrowUpDown,
  SkipForward,
  Eye,
  EyeOff,
  BarChart3,
  FileCode,
  ExternalLink,
  Hash,
  Shield,
} from 'lucide-react'
import { useFileStore } from '@/store/files'
import { useEditorStore } from '@/store/editor'

/* ── Types ─────────────────────────────────────────────────────── */

type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped'

type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'unknown'

interface TestCase {
  id: string
  name: string
  status: TestStatus
  duration?: number
  errorMessage?: string
  stackTrace?: string
  expected?: string
  actual?: string
}

interface TestSuite {
  id: string
  name: string
  filePath: string
  framework: TestFramework
  status: TestStatus
  duration?: number
  expanded: boolean
  tests: TestCase[]
}

type FilterMode = 'all' | 'passed' | 'failed' | 'skipped'
type SortMode = 'name' | 'status' | 'duration'
/* GroupMode can be extended: 'file' | 'suite' */

interface CoverageData {
  overall: number
  files: {
    path: string
    name: string
    percentage: number
    coveredLines: number
    totalLines: number
  }[]
}

/* ── Simulated test data ───────────────────────────────────────── */

function generateSimulatedSuites(): TestSuite[] {
  return [
    {
      id: 'suite-auth',
      name: 'Authentication',
      filePath: 'src/services/__tests__/auth.test.ts',
      framework: 'vitest',
      status: 'idle',
      expanded: true,
      tests: [
        { id: 'auth-1', name: 'should login with valid credentials', status: 'idle' },
        { id: 'auth-2', name: 'should reject invalid password', status: 'idle' },
        { id: 'auth-3', name: 'should handle token refresh', status: 'idle' },
        { id: 'auth-4', name: 'should logout and clear session', status: 'idle' },
        { id: 'auth-5', name: 'should enforce rate limiting', status: 'idle' },
      ],
    },
    {
      id: 'suite-editor',
      name: 'EditorStore',
      filePath: 'src/store/__tests__/editor.spec.ts',
      framework: 'vitest',
      status: 'idle',
      expanded: true,
      tests: [
        { id: 'editor-1', name: 'should open a file in a new tab', status: 'idle' },
        { id: 'editor-2', name: 'should switch active tab', status: 'idle' },
        { id: 'editor-3', name: 'should close tab and select neighbor', status: 'idle' },
        { id: 'editor-4', name: 'should mark tab as modified on edit', status: 'idle' },
        { id: 'editor-5', name: 'should handle split editor groups', status: 'idle' },
        { id: 'editor-6', name: 'should persist editor state to storage', status: 'idle' },
      ],
    },
    {
      id: 'suite-fileops',
      name: 'FileOperations',
      filePath: 'src/services/__tests__/fileOps.test.ts',
      framework: 'jest',
      status: 'idle',
      expanded: false,
      tests: [
        { id: 'file-1', name: 'should read file contents', status: 'idle' },
        { id: 'file-2', name: 'should write file with encoding', status: 'idle' },
        { id: 'file-3', name: 'should create directory recursively', status: 'idle' },
        { id: 'file-4', name: 'should delete file safely', status: 'idle' },
        { id: 'file-5', name: 'should watch file for changes', status: 'idle' },
      ],
    },
    {
      id: 'suite-components',
      name: 'TabBar',
      filePath: 'src/components/__tests__/TabBar.test.tsx',
      framework: 'vitest',
      status: 'idle',
      expanded: false,
      tests: [
        { id: 'tab-1', name: 'should render all open tabs', status: 'idle' },
        { id: 'tab-2', name: 'should highlight active tab', status: 'idle' },
        { id: 'tab-3', name: 'should show modified indicator', status: 'idle' },
        { id: 'tab-4', name: 'should close tab on middle click', status: 'idle' },
        { id: 'tab-5', name: 'should support drag-and-drop reorder', status: 'idle' },
      ],
    },
    {
      id: 'suite-search',
      name: 'SearchService',
      filePath: 'src/services/__tests__/search.spec.ts',
      framework: 'jest',
      status: 'idle',
      expanded: false,
      tests: [
        { id: 'search-1', name: 'should find exact text matches', status: 'idle' },
        { id: 'search-2', name: 'should support regex patterns', status: 'idle' },
        { id: 'search-3', name: 'should respect .gitignore exclusions', status: 'idle' },
        { id: 'search-4', name: 'should handle case-insensitive search', status: 'idle' },
      ],
    },
    {
      id: 'suite-terminal',
      name: 'TerminalManager',
      filePath: 'src/services/__tests__/terminal.test.ts',
      framework: 'mocha',
      status: 'idle',
      expanded: false,
      tests: [
        { id: 'term-1', name: 'should spawn shell process', status: 'idle' },
        { id: 'term-2', name: 'should write data to PTY', status: 'idle' },
        { id: 'term-3', name: 'should resize terminal', status: 'idle' },
      ],
    },
    {
      id: 'suite-config',
      name: 'ConfigParser',
      filePath: 'src/utils/__tests__/config.test.ts',
      framework: 'vitest',
      status: 'idle',
      expanded: false,
      tests: [
        { id: 'cfg-1', name: 'should parse JSON config', status: 'idle' },
        { id: 'cfg-2', name: 'should merge user and default settings', status: 'idle' },
        { id: 'cfg-3', name: 'should validate schema constraints', status: 'idle' },
        { id: 'cfg-4', name: 'should handle missing config file gracefully', status: 'idle' },
      ],
    },
  ]
}

function generateSimulatedCoverage(): CoverageData {
  return {
    overall: 74.2,
    files: [
      { path: 'src/services/auth.ts', name: 'auth.ts', percentage: 92.1, coveredLines: 184, totalLines: 200 },
      { path: 'src/store/editor.ts', name: 'editor.ts', percentage: 85.3, coveredLines: 256, totalLines: 300 },
      { path: 'src/services/fileOps.ts', name: 'fileOps.ts', percentage: 78.0, coveredLines: 156, totalLines: 200 },
      { path: 'src/components/TabBar.tsx', name: 'TabBar.tsx', percentage: 66.7, coveredLines: 100, totalLines: 150 },
      { path: 'src/services/search.ts', name: 'search.ts', percentage: 71.4, coveredLines: 100, totalLines: 140 },
      { path: 'src/services/terminal.ts', name: 'terminal.ts', percentage: 55.0, coveredLines: 55, totalLines: 100 },
      { path: 'src/utils/config.ts', name: 'config.ts', percentage: 62.5, coveredLines: 50, totalLines: 80 },
    ],
  }
}

/** Simulate running tests with realistic delays and outcomes */
async function simulateTestRun(
  suites: TestSuite[],
  onUpdate: (suites: TestSuite[]) => void,
): Promise<TestSuite[]> {
  const results = suites.map((s) => ({ ...s, tests: s.tests.map((t) => ({ ...t })) }))

  // Mark all as running
  for (const suite of results) {
    suite.status = 'running'
    suite.expanded = true
    for (const test of suite.tests) {
      test.status = 'running'
    }
  }
  onUpdate([...results])

  // Run each suite sequentially with per-test delays
  for (const suite of results) {
    const suiteStart = Date.now()
    for (const test of suite.tests) {
      await new Promise((r) => setTimeout(r, 80 + Math.random() * 250))
      const roll = Math.random()
      const duration = Math.floor(8 + Math.random() * 180)
      test.duration = duration

      if (roll < 0.65) {
        test.status = 'passed'
      } else if (roll < 0.85) {
        test.status = 'failed'
        test.duration = Math.floor(30 + Math.random() * 300)
        test.errorMessage = generateErrorMessage(test.name)
        test.stackTrace = generateStackTrace(suite.filePath)
        if (roll < 0.78) {
          test.expected = generateExpected(test.name)
          test.actual = generateActual(test.name)
        }
      } else {
        test.status = 'skipped'
        test.duration = undefined
      }
      onUpdate([...results.map((s) => ({ ...s, tests: [...s.tests] }))])
    }

    suite.duration = Date.now() - suiteStart
    if (suite.tests.some((t) => t.status === 'failed')) {
      suite.status = 'failed'
    } else if (suite.tests.every((t) => t.status === 'passed' || t.status === 'skipped')) {
      suite.status = suite.tests.some((t) => t.status === 'passed') ? 'passed' : 'skipped'
    }
    onUpdate([...results.map((s) => ({ ...s, tests: [...s.tests] }))])
  }

  return results
}

function generateErrorMessage(testName: string): string {
  const errors = [
    `AssertionError: expected true to be false`,
    `TypeError: Cannot read properties of undefined (reading 'id')`,
    `Error: Timeout - Async callback was not invoked within 5000ms`,
    `expect(received).toBe(expected)\n\nExpected: 200\nReceived: 401`,
    `Error: connect ECONNREFUSED 127.0.0.1:3000`,
    `ReferenceError: mockService is not defined`,
  ]
  return errors[Math.floor(Math.random() * errors.length)]
}

function generateStackTrace(filePath: string): string {
  const line = Math.floor(10 + Math.random() * 200)
  const col = Math.floor(1 + Math.random() * 40)
  return [
    `    at Object.<anonymous> (${filePath}:${line}:${col})`,
    `    at Promise.then.completed (node_modules/jest-circus/build/utils.js:298:28)`,
    `    at new Promise (<anonymous>)`,
    `    at callAsyncCircusFn (node_modules/jest-circus/build/utils.js:231:10)`,
    `    at _callCircusTest (node_modules/jest-circus/build/run.js:316:40)`,
  ].join('\n')
}

function generateExpected(testName: string): string {
  if (testName.includes('login') || testName.includes('credentials')) return '{ status: 200, token: "abc123" }'
  if (testName.includes('read') || testName.includes('file')) return '"file content here"'
  if (testName.includes('render') || testName.includes('tab')) return '<div class="tab active">index.ts</div>'
  return '"expected value"'
}

function generateActual(testName: string): string {
  if (testName.includes('login') || testName.includes('credentials')) return '{ status: 401, error: "Unauthorized" }'
  if (testName.includes('read') || testName.includes('file')) return 'undefined'
  if (testName.includes('render') || testName.includes('tab')) return '<div class="tab">index.ts</div>'
  return '"actual value"'
}

/* ── Test file pattern matching ────────────────────────────────── */

/* Test file patterns for framework detection */
const TEST_PATTERNS = [
  /\.test\.[tj]sx?$/,   // Jest
  /\.spec\.[tj]sx?$/,   // Vitest / Mocha
  /__tests__\/.*\.[tj]sx?$/, // Jest convention
  /test_.*\.py$/,        // Pytest
  /_test\.py$/,          // Pytest alt
]
void TEST_PATTERNS // referenced for documentation; discovery uses simulated data

function getFrameworkLabel(fw: TestFramework): string {
  switch (fw) {
    case 'jest': return 'Jest'
    case 'vitest': return 'Vitest'
    case 'mocha': return 'Mocha'
    case 'pytest': return 'Pytest'
    default: return 'Test'
  }
}

function getFrameworkColor(fw: TestFramework): string {
  switch (fw) {
    case 'jest': return 'var(--accent-red, #f85149)'
    case 'vitest': return 'var(--accent-green, #3fb950)'
    case 'mocha': return 'var(--accent-yellow, #d29922)'
    case 'pytest': return 'var(--accent-blue, #388bfd)'
    default: return 'var(--text-muted)'
  }
}

/* ── Inline styles as CSS-variable-driven objects ──────────────── */

const styles = {
  panel: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    overflow: 'hidden',
    fontSize: 12,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    gap: 4,
    flexShrink: 0,
    background: 'var(--bg-secondary)',
  },
  toolbarGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  toolbarDivider: {
    width: 1,
    height: 16,
    background: 'var(--border)',
    margin: '0 4px',
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    padding: '3px 8px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text-primary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono, monospace)',
    outline: 'none',
  },
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderBottom: '1px solid var(--border)',
    gap: 4,
    flexShrink: 0,
  },
  treeContainer: {
    flex: 1,
    overflow: 'auto',
    minHeight: 0,
  },
  suiteRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '4px 8px',
    background: 'none',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 12,
    cursor: 'pointer',
    gap: 4,
    userSelect: 'none' as const,
  },
  testRow: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    padding: '3px 8px 3px 36px',
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 11,
    cursor: 'pointer',
    gap: 6,
    userSelect: 'none' as const,
  },
  errorBlock: {
    margin: '0 8px 4px 36px',
    padding: '6px 10px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--accent-red, #f85149)',
    borderLeft: '3px solid var(--accent-red, #f85149)',
    borderRadius: '0 4px 4px 0',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    lineHeight: 1.5,
    overflow: 'auto',
    maxHeight: 200,
  },
  diffContainer: {
    marginTop: 6,
    borderRadius: 3,
    overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  diffHeader: {
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
  },
  diffLine: {
    padding: '2px 8px',
    fontFamily: 'var(--font-mono, monospace)',
    fontSize: 11,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-all' as const,
  },
  coverageBar: {
    height: 6,
    borderRadius: 3,
    background: 'var(--bg-tertiary)',
    overflow: 'hidden',
    flex: 1,
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '5px 10px',
    borderTop: '1px solid var(--border)',
    fontSize: 11,
    color: 'var(--text-muted)',
    flexShrink: 0,
    gap: 8,
    background: 'var(--bg-secondary)',
    flexWrap: 'wrap' as const,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    height: 16,
    padding: '0 5px',
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 700,
    lineHeight: 1,
  },
}

/* ── Icon Button ───────────────────────────────────────────────── */

function IconBtn({
  icon: Icon,
  title,
  onClick,
  size = 14,
  disabled = false,
  color,
  active = false,
}: {
  icon: typeof Play
  title: string
  onClick?: () => void
  size?: number
  disabled?: boolean
  color?: string
  active?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: active ? 'var(--bg-tertiary)' : 'none',
        border: 'none',
        color: disabled ? 'var(--text-muted)' : active ? 'var(--text-primary)' : color || 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 3,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.1s ease',
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = 'var(--bg-tertiary)'
          e.currentTarget.style.color = color || 'var(--text-primary)'
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = active ? 'var(--bg-tertiary)' : 'none'
          e.currentTarget.style.color = active ? 'var(--text-primary)' : color || 'var(--text-muted)'
        }
      }}
    >
      <Icon size={size} strokeWidth={1.6} />
    </button>
  )
}

/* ── Status Icon ───────────────────────────────────────────────── */

function StatusIcon({ status, size = 14 }: { status: TestStatus; size?: number }) {
  switch (status) {
    case 'idle':
      return <Circle size={size} strokeWidth={1.4} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    case 'running':
      return (
        <Loader2
          size={size}
          strokeWidth={1.8}
          style={{
            color: 'var(--accent-blue, #388bfd)',
            animation: 'spin 1s linear infinite',
            flexShrink: 0,
          }}
        />
      )
    case 'passed':
      return <CheckCircle2 size={size} strokeWidth={1.6} style={{ color: 'var(--accent-green, #3fb950)', flexShrink: 0 }} />
    case 'failed':
      return <XCircle size={size} strokeWidth={1.6} style={{ color: 'var(--accent-red, #f85149)', flexShrink: 0 }} />
    case 'skipped':
      return <SkipForward size={size} strokeWidth={1.6} style={{ color: 'var(--accent-yellow, #d29922)', flexShrink: 0 }} />
  }
}

/* ── Filter Toggle Pill ────────────────────────────────────────── */

function FilterPill({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? (color ? color + '20' : 'var(--accent-blue, #388bfd)22') : 'transparent',
        color: active ? color || 'var(--accent-blue, #388bfd)' : 'var(--text-muted)',
        border: active
          ? `1px solid ${color ? color + '44' : 'var(--accent-blue, #388bfd)44'}`
          : '1px solid transparent',
        borderRadius: 10,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          style={{
            ...styles.badge,
            background: active ? (color || 'var(--accent-blue, #388bfd)') : 'var(--bg-tertiary)',
            color: active ? '#fff' : 'var(--text-muted)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/* ── Diff view for assertion failures ──────────────────────────── */

function DiffView({ expected, actual }: { expected: string; actual: string }) {
  return (
    <div style={styles.diffContainer}>
      <div
        style={{
          ...styles.diffHeader,
          background: 'rgba(63, 185, 80, 0.1)',
          color: 'var(--accent-green, #3fb950)',
        }}
      >
        Expected
      </div>
      <div
        style={{
          ...styles.diffLine,
          background: 'rgba(63, 185, 80, 0.06)',
          color: 'var(--accent-green, #3fb950)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        + {expected}
      </div>
      <div
        style={{
          ...styles.diffHeader,
          background: 'rgba(248, 81, 73, 0.1)',
          color: 'var(--accent-red, #f85149)',
        }}
      >
        Actual
      </div>
      <div
        style={{
          ...styles.diffLine,
          background: 'rgba(248, 81, 73, 0.06)',
          color: 'var(--accent-red, #f85149)',
        }}
      >
        - {actual}
      </div>
    </div>
  )
}

/* ── Stack trace with clickable file links ─────────────────────── */

function StackTrace({ trace, onClick }: { trace: string; onClick: (path: string, line: number) => void }) {
  const lines = trace.split('\n')
  const fileLineRegex = /\(([^)]+):(\d+):(\d+)\)/

  return (
    <div style={{ marginTop: 4 }}>
      {lines.map((line, i) => {
        const match = fileLineRegex.exec(line)
        if (match) {
          const [, filePath, lineNum] = match
          const isProjectFile = !filePath.includes('node_modules')
          return (
            <div
              key={i}
              style={{
                color: isProjectFile ? 'var(--accent-blue, #388bfd)' : 'var(--text-muted)',
                cursor: isProjectFile ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                textDecoration: isProjectFile ? 'underline' : 'none',
                opacity: isProjectFile ? 1 : 0.6,
              }}
              onClick={() => isProjectFile && onClick(filePath, parseInt(lineNum, 10))}
              onMouseEnter={(e) => {
                if (isProjectFile) e.currentTarget.style.color = 'var(--accent-blue, #58a6ff)'
              }}
              onMouseLeave={(e) => {
                if (isProjectFile) e.currentTarget.style.color = 'var(--accent-blue, #388bfd)'
              }}
            >
              {isProjectFile && <ExternalLink size={10} />}
              {line.trim()}
            </div>
          )
        }
        return (
          <div key={i} style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            {line.trim()}
          </div>
        )
      })}
    </div>
  )
}

/* ── Coverage bar component ────────────────────────────────────── */

function CoverageBar({ percentage, height = 6 }: { percentage: number; height?: number }) {
  const color =
    percentage >= 80
      ? 'var(--accent-green, #3fb950)'
      : percentage >= 60
        ? 'var(--accent-yellow, #d29922)'
        : 'var(--accent-red, #f85149)'

  return (
    <div style={{ ...styles.coverageBar, height }}>
      <div
        style={{
          width: `${Math.min(100, percentage)}%`,
          height: '100%',
          background: color,
          borderRadius: 3,
          transition: 'width 0.5s ease',
        }}
      />
    </div>
  )
}

/* ── Test case row ─────────────────────────────────────────────── */

function TestCaseRow({
  test,
  onFileClick,
  suiteFilePath,
}: {
  test: TestCase
  onFileClick: (path: string, line: number) => void
  suiteFilePath: string
}) {
  const [errorExpanded, setErrorExpanded] = useState(test.status === 'failed')

  useEffect(() => {
    if (test.status === 'failed') setErrorExpanded(true)
  }, [test.status])

  return (
    <>
      <div
        style={{
          ...styles.testRow,
          background: test.status === 'failed' ? 'rgba(248, 81, 73, 0.04)' : 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background =
            test.status === 'failed' ? 'rgba(248, 81, 73, 0.08)' : 'var(--bg-tertiary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            test.status === 'failed' ? 'rgba(248, 81, 73, 0.04)' : 'none'
        }}
        onClick={() => {
          if (test.status === 'failed' && test.errorMessage) {
            setErrorExpanded((v) => !v)
          }
        }}
      >
        <StatusIcon status={test.status} size={13} />
        <span
          style={{
            flex: 1,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            color: test.status === 'failed' ? 'var(--accent-red, #f85149)' : 'var(--text-secondary)',
          }}
          title={test.name}
        >
          {test.name}
        </span>
        {test.duration !== undefined && (
          <span
            style={{
              color:
                test.duration > 200
                  ? 'var(--accent-yellow, #d29922)'
                  : 'var(--text-muted)',
              fontSize: 10,
              flexShrink: 0,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {test.duration}ms
          </span>
        )}
        {test.status === 'failed' && test.errorMessage && (
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {errorExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </div>

      {/* Inline error output for failed tests */}
      {test.status === 'failed' && test.errorMessage && errorExpanded && (
        <div style={styles.errorBlock}>
          <div style={{ color: 'var(--accent-red, #f85149)', marginBottom: 4, fontWeight: 600 }}>
            {test.errorMessage.split('\n')[0]}
          </div>
          {test.expected && test.actual && <DiffView expected={test.expected} actual={test.actual} />}
          {test.stackTrace && <StackTrace trace={test.stackTrace} onClick={onFileClick} />}
        </div>
      )}
    </>
  )
}

/* ── Suite group ───────────────────────────────────────────────── */

function SuiteGroup({
  suite,
  onToggle,
  onFileClick,
}: {
  suite: TestSuite
  onToggle: (id: string) => void
  onFileClick: (path: string, line: number) => void
}) {
  const passedCount = suite.tests.filter((t) => t.status === 'passed').length
  const failedCount = suite.tests.filter((t) => t.status === 'failed').length
  const skippedCount = suite.tests.filter((t) => t.status === 'skipped').length
  const totalCount = suite.tests.length

  return (
    <div>
      <div
        style={{
          ...styles.suiteRow,
          borderLeft: suite.status === 'failed'
            ? '3px solid var(--accent-red, #f85149)'
            : suite.status === 'passed'
              ? '3px solid var(--accent-green, #3fb950)'
              : suite.status === 'running'
                ? '3px solid var(--accent-blue, #388bfd)'
                : '3px solid transparent',
        }}
        onClick={() => onToggle(suite.id)}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none'
        }}
      >
        {suite.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <StatusIcon status={suite.status} />
        <FolderOpen size={14} style={{ color: 'var(--accent-blue, #388bfd)', flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
            fontSize: 12,
          }}
          title={suite.filePath}
        >
          {suite.name}
        </span>
        <span
          style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 3,
            background: getFrameworkColor(suite.framework) + '18',
            color: getFrameworkColor(suite.framework),
            fontWeight: 600,
            flexShrink: 0,
            letterSpacing: '0.3px',
            textTransform: 'uppercase',
          }}
        >
          {getFrameworkLabel(suite.framework)}
        </span>
        {/* Mini test count badges */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          {passedCount > 0 && (
            <span
              style={{
                ...styles.badge,
                background: 'rgba(63, 185, 80, 0.15)',
                color: 'var(--accent-green, #3fb950)',
              }}
            >
              {passedCount}
            </span>
          )}
          {failedCount > 0 && (
            <span
              style={{
                ...styles.badge,
                background: 'rgba(248, 81, 73, 0.15)',
                color: 'var(--accent-red, #f85149)',
              }}
            >
              {failedCount}
            </span>
          )}
          {skippedCount > 0 && (
            <span
              style={{
                ...styles.badge,
                background: 'rgba(210, 153, 34, 0.15)',
                color: 'var(--accent-yellow, #d29922)',
              }}
            >
              {skippedCount}
            </span>
          )}
          {suite.status === 'idle' && (
            <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{totalCount}</span>
          )}
        </span>
        {suite.duration !== undefined && (
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: 10,
              flexShrink: 0,
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {suite.duration >= 1000
              ? `${(suite.duration / 1000).toFixed(1)}s`
              : `${suite.duration}ms`}
          </span>
        )}
      </div>

      {/* Suite file path sub-line */}
      {suite.expanded && (
        <div
          style={{
            padding: '1px 8px 3px 40px',
            fontSize: 10,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            opacity: 0.7,
            cursor: 'pointer',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={suite.filePath}
          onClick={() => onFileClick(suite.filePath, 1)}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent-blue, #388bfd)'
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.opacity = '0.7'
          }}
        >
          {suite.filePath}
        </div>
      )}

      {/* Individual tests */}
      {suite.expanded &&
        suite.tests.map((test) => (
          <TestCaseRow
            key={test.id}
            test={test}
            onFileClick={onFileClick}
            suiteFilePath={suite.filePath}
          />
        ))}
    </div>
  )
}

/* ── Coverage Section ──────────────────────────────────────────── */

function CoverageSection({ coverage, expanded, onToggle }: {
  coverage: CoverageData
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '6px 10px',
          background: 'var(--bg-secondary)',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          cursor: 'pointer',
          gap: 6,
          userSelect: 'none',
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <BarChart3 size={13} style={{ color: 'var(--accent-blue, #388bfd)' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>Coverage</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color:
              coverage.overall >= 80
                ? 'var(--accent-green, #3fb950)'
                : coverage.overall >= 60
                  ? 'var(--accent-yellow, #d29922)'
                  : 'var(--accent-red, #f85149)',
          }}
        >
          {coverage.overall.toFixed(1)}%
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '4px 10px 8px', background: 'var(--bg-primary)' }}>
          {/* Overall coverage bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '4px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 50, flexShrink: 0 }}>Overall</span>
            <CoverageBar percentage={coverage.overall} height={8} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                width: 42,
                textAlign: 'right',
                flexShrink: 0,
                color:
                  coverage.overall >= 80
                    ? 'var(--accent-green, #3fb950)'
                    : coverage.overall >= 60
                      ? 'var(--accent-yellow, #d29922)'
                      : 'var(--accent-red, #f85149)',
              }}
            >
              {coverage.overall.toFixed(1)}%
            </span>
          </div>

          {/* Per-file coverage */}
          {coverage.files.map((file) => (
            <div
              key={file.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 0',
                fontSize: 11,
              }}
            >
              <FileCode size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span
                style={{
                  width: 90,
                  flexShrink: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono, monospace)',
                  fontSize: 10,
                  color: 'var(--text-secondary)',
                }}
                title={file.path}
              >
                {file.name}
              </span>
              <CoverageBar percentage={file.percentage} />
              <span
                style={{
                  width: 38,
                  textAlign: 'right',
                  flexShrink: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono, monospace)',
                  color:
                    file.percentage >= 80
                      ? 'var(--accent-green, #3fb950)'
                      : file.percentage >= 60
                        ? 'var(--accent-yellow, #d29922)'
                        : 'var(--accent-red, #f85149)',
                }}
              >
                {file.percentage.toFixed(0)}%
              </span>
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {file.coveredLines}/{file.totalLines}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Output section ────────────────────────────────────────────── */

function OutputSection({
  expanded,
  onToggle,
  output,
  isRunning,
}: {
  expanded: boolean
  onToggle: () => void
  output: string
  isRunning: boolean
}) {
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  return (
    <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '6px 10px',
          background: 'var(--bg-secondary)',
          border: 'none',
          color: 'var(--text-primary)',
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          cursor: 'pointer',
          gap: 6,
          userSelect: 'none',
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FileText size={13} style={{ color: 'var(--text-muted)' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>Test Output</span>
        {isRunning && (
          <Loader2
            size={12}
            strokeWidth={2}
            style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue, #388bfd)' }}
          />
        )}
      </button>

      {expanded && (
        <div
          ref={outputRef}
          style={{
            maxHeight: 180,
            overflow: 'auto',
            padding: '6px 10px',
            background: 'var(--bg-primary)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {output ? (
            output.split('\n').map((line, i) => {
              let color = 'var(--text-secondary)'
              if (/^\s*(PASS|RUNS|\u2713|passed)/i.test(line)) color = 'var(--accent-green, #3fb950)'
              if (/^\s*(FAIL|\u2717|failed|Error|Expected|Received)/i.test(line))
                color = 'var(--accent-red, #f85149)'
              if (/^\s*(SKIP|skipped|pending|todo)/i.test(line))
                color = 'var(--accent-yellow, #d29922)'
              if (/^(Tests|Test Suites|Time|Snapshots)/i.test(line))
                color = 'var(--text-primary)'

              return (
                <div key={i} style={{ color }}>
                  {line || '\u00A0'}
                </div>
              )
            })
          ) : (
            <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {isRunning ? 'Running tests...' : 'No output yet. Run tests to see results.'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Main Testing Panel ────────────────────────────────────────── */

export default function TestingPanel() {
  const fileTree = useFileStore((s) => s.fileTree)
  const openFile = useEditorStore((s) => s.openFile)

  const [suites, setSuites] = useState<TestSuite[]>(() => generateSimulatedSuites())
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  /* groupMode state reserved for future file/suite grouping toggle */
  const [searchQuery, setSearchQuery] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [autoRunOnSave, setAutoRunOnSave] = useState(false)
  const [output, setOutput] = useState('')
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [coverageExpanded, setCoverageExpanded] = useState(false)
  const [coverage] = useState<CoverageData>(() => generateSimulatedCoverage())
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  // Close sort dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Detect test runner
  const runner = useMemo(() => {
    const hasVitest = fileTree.some(
      (n) => n.name === 'vitest.config.ts' || n.name === 'vitest.config.js',
    )
    if (hasVitest) return 'vitest'
    const hasJest = fileTree.some(
      (n) => n.name === 'jest.config.ts' || n.name === 'jest.config.js',
    )
    if (hasJest) return 'jest'
    return 'npm'
  }, [fileTree])

  // Compute counts
  const counts = useMemo(() => {
    const all = suites.flatMap((s) => s.tests)
    return {
      total: all.length,
      passed: all.filter((t) => t.status === 'passed').length,
      failed: all.filter((t) => t.status === 'failed').length,
      skipped: all.filter((t) => t.status === 'skipped').length,
      running: all.filter((t) => t.status === 'running').length,
      idle: all.filter((t) => t.status === 'idle').length,
      suiteCount: suites.length,
    }
  }, [suites])

  // Filtered and sorted suites
  const filteredSuites = useMemo(() => {
    let result = suites.map((s) => {
      let tests = s.tests

      // Apply search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const suiteMatches = s.name.toLowerCase().includes(q)
        if (!suiteMatches) {
          tests = tests.filter((t) => t.name.toLowerCase().includes(q))
        }
      }

      // Apply status filter
      if (filterMode === 'passed') tests = tests.filter((t) => t.status === 'passed')
      else if (filterMode === 'failed') tests = tests.filter((t) => t.status === 'failed')
      else if (filterMode === 'skipped') tests = tests.filter((t) => t.status === 'skipped')

      return { ...s, tests }
    })

    // Remove empty suites after filtering
    result = result.filter((s) => s.tests.length > 0 || (searchQuery.trim() && s.name.toLowerCase().includes(searchQuery.toLowerCase())))

    // Sort suites
    result.sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name)
      if (sortMode === 'status') {
        const order: Record<TestStatus, number> = { failed: 0, running: 1, passed: 2, skipped: 3, idle: 4 }
        return (order[a.status] ?? 4) - (order[b.status] ?? 4)
      }
      if (sortMode === 'duration') return (b.duration ?? 0) - (a.duration ?? 0)
      return 0
    })

    // Sort tests within suites
    result = result.map((s) => ({
      ...s,
      tests: [...s.tests].sort((a, b) => {
        if (sortMode === 'name') return a.name.localeCompare(b.name)
        if (sortMode === 'status') {
          const order: Record<TestStatus, number> = { failed: 0, running: 1, passed: 2, skipped: 3, idle: 4 }
          return (order[a.status] ?? 4) - (order[b.status] ?? 4)
        }
        if (sortMode === 'duration') return (b.duration ?? 0) - (a.duration ?? 0)
        return 0
      }),
    }))

    return result
  }, [suites, filterMode, sortMode, searchQuery])

  // Toggle suite expand/collapse
  const toggleSuite = useCallback((id: string) => {
    setSuites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, expanded: !s.expanded } : s)),
    )
  }, [])

  // Handle file click (from stack traces or suite paths)
  const handleFileClick = useCallback(
    async (path: string, _line: number) => {
      try {
        const result = await window.api.readFile(path)
        openFile(
          {
            path,
            name: path.replace(/\\/g, '/').split('/').pop() || path,
            content: result.content,
            language: result.language,
            isModified: false,
            aiModified: false,
          },
          { preview: true },
        )
      } catch {
        // File read failed
      }
    },
    [openFile],
  )

  // Build output text from suite results
  const buildOutput = useCallback((finalSuites: TestSuite[]): string => {
    const lines: string[] = []
    lines.push('')
    for (const suite of finalSuites) {
      const suiteLabel = suite.status === 'passed' ? ' PASS ' : suite.status === 'failed' ? ' FAIL ' : ' SKIP '
      lines.push(`${suiteLabel} ${suite.filePath}${suite.duration ? ` (${suite.duration}ms)` : ''}`)
      for (const test of suite.tests) {
        const icon = test.status === 'passed' ? '\u2713' : test.status === 'failed' ? '\u2717' : '\u25CB'
        lines.push(`  ${icon} ${test.name}${test.duration ? ` (${test.duration}ms)` : ''}`)
        if (test.status === 'failed' && test.errorMessage) {
          lines.push(`    ${test.errorMessage.split('\n')[0]}`)
        }
      }
      lines.push('')
    }

    const allTests = finalSuites.flatMap((s) => s.tests)
    const passed = allTests.filter((t) => t.status === 'passed').length
    const failed = allTests.filter((t) => t.status === 'failed').length
    const skipped = allTests.filter((t) => t.status === 'skipped').length
    const totalDuration = finalSuites.reduce((sum, s) => sum + (s.duration ?? 0), 0)

    lines.push('Test Suites: ' +
      (finalSuites.filter((s) => s.status === 'passed').length > 0 ? `${finalSuites.filter((s) => s.status === 'passed').length} passed, ` : '') +
      (finalSuites.filter((s) => s.status === 'failed').length > 0 ? `${finalSuites.filter((s) => s.status === 'failed').length} failed, ` : '') +
      `${finalSuites.length} total`)
    lines.push(`Tests:       ${passed > 0 ? `${passed} passed, ` : ''}${failed > 0 ? `${failed} failed, ` : ''}${skipped > 0 ? `${skipped} skipped, ` : ''}${allTests.length} total`)
    lines.push(`Time:        ${(totalDuration / 1000).toFixed(2)}s`)
    lines.push(`Ran all test suites.`)

    return lines.join('\n')
  }, [])

  // Run all tests
  const handleRunAll = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setOutput('')
    setOutputExpanded(true)

    // Reset all to idle first
    setSuites((prev) =>
      prev.map((s) => ({
        ...s,
        status: 'idle' as TestStatus,
        duration: undefined,
        expanded: true,
        tests: s.tests.map((t) => ({
          ...t,
          status: 'idle' as TestStatus,
          duration: undefined,
          errorMessage: undefined,
          stackTrace: undefined,
          expected: undefined,
          actual: undefined,
        })),
      })),
    )

    try {
      const results = await simulateTestRun(
        suites.map((s) => ({
          ...s,
          tests: s.tests.map((t) => ({
            ...t,
            status: 'idle' as TestStatus,
            duration: undefined,
            errorMessage: undefined,
            stackTrace: undefined,
            expected: undefined,
            actual: undefined,
          })),
        })),
        setSuites,
      )
      setSuites(results)
      setOutput(buildOutput(results))
    } catch (err: any) {
      setOutput(`Error running tests:\n${err?.message || err}`)
    } finally {
      setIsRunning(false)
    }
  }, [isRunning, suites, buildOutput])

  // Run only failed tests
  const handleRunFailed = useCallback(async () => {
    if (isRunning) return
    const failedSuites = suites.filter((s) => s.tests.some((t) => t.status === 'failed'))
    if (failedSuites.length === 0) return

    setIsRunning(true)
    setOutput('')
    setOutputExpanded(true)

    // Reset only failed tests
    const resetSuites = suites.map((s) => {
      if (!s.tests.some((t) => t.status === 'failed')) return s
      return {
        ...s,
        status: 'idle' as TestStatus,
        duration: undefined,
        expanded: true,
        tests: s.tests.map((t) =>
          t.status === 'failed'
            ? { ...t, status: 'idle' as TestStatus, duration: undefined, errorMessage: undefined, stackTrace: undefined, expected: undefined, actual: undefined }
            : t,
        ),
      }
    })
    setSuites(resetSuites)

    try {
      const toRun = resetSuites.filter((s) => s.tests.some((t) => t.status === 'idle'))
      const results = await simulateTestRun(toRun, (updated) => {
        setSuites((prev) => {
          const updatedMap = new Map(updated.map((s) => [s.id, s]))
          return prev.map((s) => updatedMap.get(s.id) || s)
        })
      })
      setSuites((prev) => {
        const resultMap = new Map(results.map((s) => [s.id, s]))
        return prev.map((s) => resultMap.get(s.id) || s)
      })
      setOutput(buildOutput(results))
    } catch (err: any) {
      setOutput(`Error running tests:\n${err?.message || err}`)
    } finally {
      setIsRunning(false)
    }
  }, [isRunning, suites, buildOutput])

  // Reset all tests
  const handleReset = useCallback(() => {
    setSuites(generateSimulatedSuites())
    setOutput('')
    setFilterMode('all')
    setSearchQuery('')
  }, [])

  // Keyboard shortcut for running tests
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        // Panel toggle handled elsewhere
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const totalDuration = useMemo(
    () => suites.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    [suites],
  )

  const hasRun = counts.passed > 0 || counts.failed > 0 || counts.skipped > 0

  return (
    <div style={styles.panel}>
      {/* ── Spin animation ─────────────────────────────────────── */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* ── Toolbar ────────────────────────────────────────────── */}
      <div style={styles.toolbar}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginRight: 4,
          }}
        >
          Testing
        </span>
        {counts.total > 0 && (
          <span
            style={{
              ...styles.badge,
              background: 'var(--accent-blue, #388bfd)',
              color: '#fff',
              fontSize: 9,
            }}
          >
            {counts.total}
          </span>
        )}
        <span style={{ flex: 1 }} />

        <div style={styles.toolbarGroup}>
          <IconBtn
            icon={Play}
            title="Run All Tests"
            onClick={handleRunAll}
            disabled={isRunning}
            color="var(--accent-green, #3fb950)"
          />
          <IconBtn
            icon={RotateCw}
            title="Run Failed Tests"
            onClick={handleRunFailed}
            disabled={isRunning || counts.failed === 0}
            color="var(--accent-red, #f85149)"
          />
          <IconBtn
            icon={Bug}
            title="Debug Tests"
            onClick={() => {/* Debug mode placeholder */}}
            disabled={isRunning}
            color="var(--accent-yellow, #d29922)"
          />
        </div>

        <div style={styles.toolbarDivider} />

        {/* Sort dropdown */}
        <div ref={sortRef} style={{ position: 'relative' }}>
          <IconBtn
            icon={ArrowUpDown}
            title={`Sort by ${sortMode}`}
            onClick={() => setSortDropdownOpen((v) => !v)}
            active={sortDropdownOpen}
          />
          {sortDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                zIndex: 100,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                padding: 4,
                minWidth: 130,
              }}
            >
              {(['name', 'status', 'duration'] as SortMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setSortMode(mode)
                    setSortDropdownOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    width: '100%',
                    padding: '5px 10px',
                    background: sortMode === mode ? 'var(--bg-tertiary)' : 'transparent',
                    border: 'none',
                    borderRadius: 4,
                    color: sortMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 11,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-tertiary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = sortMode === mode ? 'var(--bg-tertiary)' : 'transparent' }}
                >
                  {mode === 'name' && <Hash size={12} />}
                  {mode === 'status' && <Shield size={12} />}
                  {mode === 'duration' && <Clock size={12} />}
                  Sort by {mode}
                  {sortMode === mode && (
                    <CheckCircle2 size={11} style={{ marginLeft: 'auto', color: 'var(--accent-blue, #388bfd)' }} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <IconBtn
          icon={autoRunOnSave ? Eye : EyeOff}
          title={autoRunOnSave ? 'Auto-run on save: ON' : 'Auto-run on save: OFF'}
          onClick={() => setAutoRunOnSave((v) => !v)}
          active={autoRunOnSave}
          color={autoRunOnSave ? 'var(--accent-green, #3fb950)' : undefined}
        />

        <div style={styles.toolbarDivider} />

        <IconBtn icon={RotateCw} title="Reset All Tests" onClick={handleReset} disabled={isRunning} />
      </div>

      {/* ── Search bar ─────────────────────────────────────────── */}
      <div style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <input
          type="text"
          placeholder="Search tests..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-blue, #388bfd)' }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
            }}
            title="Clear search"
          >
            <XCircle size={13} />
          </button>
        )}
      </div>

      {/* ── Filter pills ───────────────────────────────────────── */}
      <div style={styles.filterBar}>
        <Filter size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        <FilterPill label="All" count={counts.total} active={filterMode === 'all'} onClick={() => setFilterMode('all')} />
        <FilterPill
          label="Passed"
          count={counts.passed}
          active={filterMode === 'passed'}
          onClick={() => setFilterMode('passed')}
          color="var(--accent-green, #3fb950)"
        />
        <FilterPill
          label="Failed"
          count={counts.failed}
          active={filterMode === 'failed'}
          onClick={() => setFilterMode('failed')}
          color="var(--accent-red, #f85149)"
        />
        <FilterPill
          label="Skipped"
          count={counts.skipped}
          active={filterMode === 'skipped'}
          onClick={() => setFilterMode('skipped')}
          color="var(--accent-yellow, #d29922)"
        />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {suites.length} suite{suites.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Detected frameworks ────────────────────────────────── */}
      <div
        style={{
          padding: '3px 10px',
          borderBottom: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--text-muted)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>Frameworks:</span>
        {Array.from(new Set(suites.map((s) => s.framework))).map((fw) => (
          <span
            key={fw}
            style={{
              padding: '1px 6px',
              borderRadius: 3,
              background: getFrameworkColor(fw) + '18',
              color: getFrameworkColor(fw),
              fontWeight: 600,
              fontSize: 9,
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
            }}
          >
            {getFrameworkLabel(fw)}
          </span>
        ))}
        <span style={{ flex: 1 }} />
        {isRunning && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-blue, #388bfd)' }}>
            <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
            Running...
          </span>
        )}
      </div>

      {/* ── Test tree ──────────────────────────────────────────── */}
      <div style={styles.treeContainer}>
        {filteredSuites.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              gap: 8,
              padding: 24,
              textAlign: 'center',
            }}
          >
            {searchQuery ? (
              <>
                <Search size={32} strokeWidth={1} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 12 }}>No tests matching "{searchQuery}"</span>
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    color: 'var(--text-secondary)',
                    fontSize: 11,
                    padding: '4px 12px',
                    cursor: 'pointer',
                  }}
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <FileText size={32} strokeWidth={1} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 12 }}>No tests match current filter</span>
              </>
            )}
          </div>
        ) : (
          filteredSuites.map((suite) => (
            <SuiteGroup
              key={suite.id}
              suite={suite}
              onToggle={toggleSuite}
              onFileClick={handleFileClick}
            />
          ))
        )}
      </div>

      {/* ── Coverage section ───────────────────────────────────── */}
      {hasRun && (
        <CoverageSection
          coverage={coverage}
          expanded={coverageExpanded}
          onToggle={() => setCoverageExpanded((v) => !v)}
        />
      )}

      {/* ── Output section ─────────────────────────────────────── */}
      <OutputSection
        expanded={outputExpanded}
        onToggle={() => setOutputExpanded((v) => !v)}
        output={output}
        isRunning={isRunning}
      />

      {/* ── Status bar ─────────────────────────────────────────── */}
      <div style={styles.statusBar}>
        {hasRun ? (
          <>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tests:</span>
            {counts.passed > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <CheckCircle2 size={11} style={{ color: 'var(--accent-green, #3fb950)' }} />
                <span style={{ color: 'var(--accent-green, #3fb950)', fontWeight: 600 }}>
                  {counts.passed} passed
                </span>
              </span>
            )}
            {counts.failed > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <XCircle size={11} style={{ color: 'var(--accent-red, #f85149)' }} />
                <span style={{ color: 'var(--accent-red, #f85149)', fontWeight: 600 }}>
                  {counts.failed} failed
                </span>
              </span>
            )}
            {counts.skipped > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <SkipForward size={11} style={{ color: 'var(--accent-yellow, #d29922)' }} />
                <span style={{ color: 'var(--accent-yellow, #d29922)' }}>
                  {counts.skipped} skipped
                </span>
              </span>
            )}
            <span style={{ flex: 1 }} />
            {totalDuration > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10 }}>
                <Clock size={10} />
                {totalDuration >= 1000
                  ? `${(totalDuration / 1000).toFixed(2)}s`
                  : `${totalDuration}ms`}
              </span>
            )}
          </>
        ) : (
          <>
            <span>{counts.total} test{counts.total !== 1 ? 's' : ''} in {suites.length} suite{suites.length !== 1 ? 's' : ''}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10 }}>
              Press{' '}
              <kbd
                style={{
                  padding: '1px 4px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  fontSize: 9,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                Ctrl+Shift+T
              </kbd>{' '}
              to toggle
            </span>
          </>
        )}
      </div>
    </div>
  )
}
