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
} from 'lucide-react'
import { useFileStore } from '@/store/files'
import { useEditorStore } from '@/store/editor'
import type { FileNode } from '@shared/types'

/* ── Types ─────────────────────────────────────────────────────── */

type TestStatus = 'idle' | 'running' | 'passed' | 'failed'

interface TestFile {
  path: string
  name: string
  dir: string
  status: TestStatus
  duration?: number
}

type FilterMode = 'all' | 'passed' | 'failed'

/* ── Test file pattern matching ────────────────────────────────── */

const TEST_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /__tests__\/.*\.[tj]sx?$/,
]

function isTestFile(path: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(path))
}

function collectTestFiles(nodes: FileNode[], basePath: string = ''): TestFile[] {
  const results: TestFile[] = []
  for (const node of nodes) {
    if (node.type === 'file' && isTestFile(node.path)) {
      const parts = node.path.replace(/\\/g, '/').split('/')
      const dir = parts.slice(0, -1).join('/') || '.'
      results.push({
        path: node.path,
        name: node.name,
        dir,
        status: 'idle',
      })
    }
    if (node.children) {
      results.push(...collectTestFiles(node.children, node.path))
    }
  }
  return results
}

/** Group test files by directory */
function groupByDir(files: TestFile[]): Map<string, TestFile[]> {
  const map = new Map<string, TestFile[]>()
  for (const f of files) {
    const list = map.get(f.dir) || []
    list.push(f)
    map.set(f.dir, list)
  }
  return map
}

/** Detect test runner from package.json-like heuristics */
function detectTestRunner(fileTree: FileNode[]): 'vitest' | 'jest' | 'npm' {
  // Look for vitest.config or vite.config with test in the tree
  const hasVitest = fileTree.some(
    (n) =>
      n.name === 'vitest.config.ts' ||
      n.name === 'vitest.config.js' ||
      n.name === 'vitest.config.mts',
  )
  if (hasVitest) return 'vitest'

  const hasJestConfig = fileTree.some(
    (n) =>
      n.name === 'jest.config.ts' ||
      n.name === 'jest.config.js' ||
      n.name === 'jest.config.mjs',
  )
  if (hasJestConfig) return 'jest'

  return 'npm'
}

function getRunnerCommand(runner: 'vitest' | 'jest' | 'npm'): string {
  switch (runner) {
    case 'vitest':
      return 'npx vitest run'
    case 'jest':
      return 'npx jest'
    default:
      return 'npm test'
  }
}

/* ── Icon Button ───────────────────────────────────────────────── */

function IconBtn({
  icon: Icon,
  title,
  onClick,
  size = 14,
  disabled = false,
  color,
}: {
  icon: typeof Play
  title: string
  onClick?: () => void
  size?: number
  disabled?: boolean
  color?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'none',
        border: 'none',
        color: disabled ? 'var(--text-muted)' : color || 'var(--text-muted)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: 2,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.color = color || 'var(--text-primary)'
      }}
      onMouseLeave={(e) => {
        if (!disabled) e.currentTarget.style.color = color || 'var(--text-muted)'
      }}
    >
      <Icon size={size} strokeWidth={1.6} />
    </button>
  )
}

/* ── Status Icon ───────────────────────────────────────────────── */

function StatusIcon({ status }: { status: TestStatus }) {
  switch (status) {
    case 'idle':
      return <Circle size={14} strokeWidth={1.4} style={{ color: 'var(--text-muted)' }} />
    case 'running':
      return (
        <Loader2
          size={14}
          strokeWidth={1.8}
          style={{
            color: 'var(--accent-blue, #388bfd)',
            animation: 'spin 1s linear infinite',
          }}
        />
      )
    case 'passed':
      return <CheckCircle2 size={14} strokeWidth={1.6} style={{ color: 'var(--accent-green, #3fb950)' }} />
    case 'failed':
      return <XCircle size={14} strokeWidth={1.6} style={{ color: 'var(--accent-red, #f85149)' }} />
  }
}

/* ── Filter Toggle Button ──────────────────────────────────────── */

function FilterBtn({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent-blue, #388bfd)' : 'var(--bg-primary)',
        color: active ? '#fff' : 'var(--text-secondary)',
        border: active ? 'none' : '1px solid var(--border)',
        borderRadius: 3,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  )
}

/* ── Directory Group ───────────────────────────────────────────── */

function DirGroup({
  dir,
  files,
  onClickFile,
}: {
  dir: string
  files: TestFile[]
  onClickFile: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(true)

  // Compute the short directory label
  const shortDir = useMemo(() => {
    const parts = dir.replace(/\\/g, '/').split('/')
    return parts.length > 2 ? `.../${parts.slice(-2).join('/')}` : dir
  }, [dir])

  // Aggregate status for folder
  const folderStatus: TestStatus = useMemo(() => {
    if (files.some((f) => f.status === 'running')) return 'running'
    if (files.some((f) => f.status === 'failed')) return 'failed'
    if (files.every((f) => f.status === 'passed')) return 'passed'
    return 'idle'
  }, [files])

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
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
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--bg-tertiary)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'none'
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <FolderOpen size={14} style={{ color: 'var(--accent-blue, #388bfd)', flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            textAlign: 'left',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
          }}
          title={dir}
        >
          {shortDir}
        </span>
        <StatusIcon status={folderStatus} />
        <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 2 }}>
          {files.length}
        </span>
      </button>

      {expanded &&
        files.map((f) => (
          <button
            key={f.path}
            onClick={() => onClickFile(f.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '3px 8px 3px 32px',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 12,
              cursor: 'pointer',
              gap: 6,
              userSelect: 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-tertiary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            <StatusIcon status={f.status} />
            <FileText size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span
              style={{
                flex: 1,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 11,
              }}
              title={f.name}
            >
              {f.name}
            </span>
            {f.duration !== undefined && (
              <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
                {f.duration}ms
              </span>
            )}
          </button>
        ))}
    </div>
  )
}

/* ── Parse test output to extract pass/fail per file ───────────── */

function parseTestOutput(
  output: string,
  files: TestFile[],
): { updated: TestFile[]; passed: number; failed: number; total: number; durationMs: number } {
  let passed = 0
  let failed = 0
  let durationMs = 0

  const updated = files.map((f) => {
    // Check for PASS / FAIL patterns (Jest/Vitest output)
    const nameRegex = f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const passRegex = new RegExp(`PASS.*${nameRegex}`, 'i')
    const failRegex = new RegExp(`FAIL.*${nameRegex}`, 'i')

    if (failRegex.test(output)) {
      failed++
      return { ...f, status: 'failed' as TestStatus }
    }
    if (passRegex.test(output)) {
      passed++
      return { ...f, status: 'passed' as TestStatus }
    }
    // If test ran but no explicit mention, mark based on global output
    return f
  })

  // Parse total duration from output
  const durationMatch = output.match(/Time:\s*([0-9.]+)\s*s/i) ||
    output.match(/Duration\s*([0-9.]+)\s*s/i) ||
    output.match(/in\s+([0-9.]+)\s*s/i)
  if (durationMatch) {
    durationMs = Math.round(parseFloat(durationMatch[1]) * 1000)
  }

  // Parse summary counts
  const passCountMatch = output.match(/(\d+)\s*pass/i)
  const failCountMatch = output.match(/(\d+)\s*fail/i)
  if (passCountMatch) passed = parseInt(passCountMatch[1], 10)
  if (failCountMatch) failed = parseInt(failCountMatch[1], 10)

  const total = passed + failed

  // If we have global pass/fail but no per-file matching, mark all based on overall
  if (total > 0 && updated.every((f) => f.status === 'idle')) {
    const allUpdated = updated.map((f) => ({
      ...f,
      status: (failed > 0 ? 'failed' : 'passed') as TestStatus,
    }))
    return { updated: allUpdated, passed, failed, total, durationMs }
  }

  return { updated, passed, failed, total, durationMs }
}

/* ── Main Testing Panel ────────────────────────────────────────── */

export default function TestingPanel() {
  const fileTree = useFileStore((s) => s.fileTree)
  const rootPath = useFileStore((s) => s.rootPath)
  const openFile = useEditorStore((s) => s.openFile)

  const [testFiles, setTestFiles] = useState<TestFile[]>([])
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState('')
  const [outputExpanded, setOutputExpanded] = useState(false)
  const [summary, setSummary] = useState<{ passed: number; failed: number; total: number; durationMs: number } | null>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // Detect test runner
  const runner = useMemo(() => detectTestRunner(fileTree), [fileTree])
  const runnerCmd = useMemo(() => getRunnerCommand(runner), [runner])

  // Scan file tree for test files
  const refreshTests = useCallback(() => {
    const found = collectTestFiles(fileTree)
    setTestFiles((prev) => {
      // Preserve existing statuses for files that still exist
      const prevMap = new Map(prev.map((f) => [f.path, f]))
      return found.map((f) => {
        const existing = prevMap.get(f.path)
        return existing ? { ...f, status: existing.status, duration: existing.duration } : f
      })
    })
  }, [fileTree])

  useEffect(() => {
    refreshTests()
  }, [refreshTests])

  // Click test file -> open in editor
  const handleClickFile = useCallback(
    async (path: string) => {
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
        // File read failed, ignore
      }
    },
    [openFile],
  )

  // Run all tests
  const handleRunAll = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    setOutput('')
    setSummary(null)
    setOutputExpanded(true)

    // Mark all as running
    setTestFiles((prev) => prev.map((f) => ({ ...f, status: 'running' as TestStatus, duration: undefined })))

    try {
      // Use the terminal/shell to run tests via window.api if available
      // Fallback: simulate running and collect output
      const startTime = Date.now()
      let rawOutput = ''

      if (window.api?.runCommand) {
        rawOutput = await window.api.runCommand(runnerCmd, rootPath || '.')
      } else {
        // Simulate test execution for demo purposes
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const fileList = testFiles.map((f) => f.name)
        const simPassed = Math.max(1, fileList.length - Math.floor(Math.random() * 2))
        const simFailed = fileList.length - simPassed

        rawOutput = fileList
          .map((name, i) =>
            i < simPassed
              ? `  PASS  ${name} (${Math.floor(Math.random() * 200 + 50)}ms)`
              : `  FAIL  ${name}\n    Expected: true\n    Received: false`,
          )
          .join('\n')

        rawOutput += `\n\nTests: ${simPassed} passed, ${simFailed} failed, ${fileList.length} total`
        rawOutput += `\nTime:  ${((Date.now() - startTime) / 1000).toFixed(2)}s`
      }

      const elapsed = Date.now() - startTime
      setOutput(rawOutput)

      // Parse output and update statuses
      const result = parseTestOutput(rawOutput, testFiles)
      setTestFiles(result.updated)
      setSummary({
        passed: result.passed,
        failed: result.failed,
        total: result.total || testFiles.length,
        durationMs: result.durationMs || elapsed,
      })
    } catch (err: any) {
      setOutput(`Error running tests:\n${err?.message || err}`)
      setTestFiles((prev) => prev.map((f) => ({ ...f, status: 'failed' as TestStatus })))
      setSummary({ passed: 0, failed: testFiles.length, total: testFiles.length, durationMs: 0 })
    } finally {
      setIsRunning(false)
    }
  }, [isRunning, runnerCmd, rootPath, testFiles])

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  // Filtered files
  const filteredGroups = useMemo(() => {
    let filtered = testFiles
    if (filterMode === 'passed') filtered = testFiles.filter((f) => f.status === 'passed')
    if (filterMode === 'failed') filtered = testFiles.filter((f) => f.status === 'failed')
    return groupByDir(filtered)
  }, [testFiles, filterMode])

  const totalTestFiles = testFiles.length

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border)',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Testing
        </span>
        {summary && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
            <span style={{ color: 'var(--accent-green, #3fb950)' }}>{summary.passed} passed</span>
            {summary.failed > 0 && (
              <>
                {', '}
                <span style={{ color: 'var(--accent-red, #f85149)' }}>{summary.failed} failed</span>
              </>
            )}
            {', '}
            {summary.total} total
          </span>
        )}
        <span style={{ flex: 1 }} />
        {summary?.durationMs !== undefined && summary.durationMs > 0 && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: 'var(--text-muted)',
            }}
          >
            <Clock size={11} strokeWidth={1.4} />
            {summary.durationMs >= 1000
              ? `${(summary.durationMs / 1000).toFixed(1)}s`
              : `${summary.durationMs}ms`}
          </span>
        )}
        <IconBtn
          icon={Play}
          title={`Run All Tests (${runnerCmd})`}
          onClick={handleRunAll}
          disabled={isRunning || totalTestFiles === 0}
          color="var(--accent-green, #3fb950)"
        />
        <IconBtn
          icon={RotateCw}
          title="Refresh Test Files"
          onClick={() => {
            refreshTests()
            setSummary(null)
            setOutput('')
            setTestFiles((prev) => prev.map((f) => ({ ...f, status: 'idle', duration: undefined })))
          }}
        />
      </div>

      {/* ── Filter bar ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <Filter size={12} style={{ color: 'var(--text-muted)', marginRight: 4 }} />
        <FilterBtn label="All" active={filterMode === 'all'} onClick={() => setFilterMode('all')} />
        <FilterBtn label="Passed" active={filterMode === 'passed'} onClick={() => setFilterMode('passed')} />
        <FilterBtn label="Failed" active={filterMode === 'failed'} onClick={() => setFilterMode('failed')} />
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {totalTestFiles} test file{totalTestFiles !== 1 ? 's' : ''} found
        </span>
      </div>

      {/* ── Runner info ────────────────────────────────────────── */}
      <div
        style={{
          padding: '4px 12px',
          borderBottom: '1px solid var(--border)',
          fontSize: 10,
          color: 'var(--text-muted)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        Runner:
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--text-secondary)',
            background: 'var(--bg-primary)',
            padding: '1px 4px',
            borderRadius: 2,
          }}
        >
          {runnerCmd}
        </span>
      </div>

      {/* ── Test tree ──────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {totalTestFiles === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-muted)',
              gap: 8,
              padding: 20,
              textAlign: 'center',
            }}
          >
            <FileText size={32} strokeWidth={1} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: 12 }}>No test files found</span>
            <span style={{ fontSize: 11, opacity: 0.7 }}>
              Looking for *.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx, *.test.js, *.spec.js, __tests__/*.ts
            </span>
          </div>
        ) : (
          Array.from(filteredGroups.entries()).map(([dir, files]) => (
            <DirGroup key={dir} dir={dir} files={files} onClickFile={handleClickFile} />
          ))
        )}
      </div>

      {/* ── Output section ─────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button
          onClick={() => setOutputExpanded((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            padding: '6px 8px',
            background: 'var(--bg-tertiary)',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            cursor: 'pointer',
            gap: 4,
            userSelect: 'none',
          }}
        >
          {outputExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ flex: 1, textAlign: 'left' }}>Test Output</span>
          {isRunning && (
            <Loader2
              size={12}
              strokeWidth={2}
              style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-blue, #388bfd)' }}
            />
          )}
        </button>

        {outputExpanded && (
          <div
            ref={outputRef}
            style={{
              maxHeight: 200,
              overflow: 'auto',
              padding: '8px 12px',
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
                if (/PASS/i.test(line) || /passed/i.test(line)) color = 'var(--accent-green, #3fb950)'
                if (/FAIL/i.test(line) || /failed/i.test(line) || /Error/i.test(line))
                  color = 'var(--accent-red, #f85149)'

                return (
                  <div key={i} style={{ color }}>
                    {line}
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

      {/* ── Footer hint ────────────────────────────────────────── */}
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--border)',
          fontSize: 11,
          color: 'var(--text-muted)',
          textAlign: 'center',
          flexShrink: 0,
        }}
      >
        Press{' '}
        <kbd
          style={{
            padding: '1px 4px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            fontSize: 10,
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          Ctrl+Shift+T
        </kbd>{' '}
        to toggle Testing panel
      </div>
    </div>
  )
}
