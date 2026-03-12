import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Play,
  Square,
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
  SkipForward,
  Eye,
  EyeOff,
  BarChart3,
  FileCode,
  Hash,
  Shield,
  Tag,
  Plus,
  Settings,
  Terminal,
  Layers,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Wand2,
  Copy,
  AlertTriangle,
  Info,
  X,
  ChevronUp,
  Zap,
  Timer,
  GitBranch,
  List,
  Grid,
  Pause,
  ArrowRight,
  Workflow,
  FlaskConical,
  TriangleAlert,
  CircleDot,
  Braces,
  ArrowUpDown,
} from 'lucide-react'

/* ── Types ─────────────────────────────────────────────────────── */

type TestStatus = 'idle' | 'running' | 'passed' | 'failed' | 'skipped' | 'queued'

type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'cargo-test' | 'go-test'

type FilterMode = 'all' | 'passed' | 'failed' | 'skipped' | 'running'

type SortMode = 'name' | 'status' | 'duration' | 'file'

type RunMode = 'parallel' | 'sequential'

type ViewMode = 'tree' | 'flat'

interface TestTag {
  id: string
  label: string
  color: string
}

interface TestCase {
  id: string
  name: string
  status: TestStatus
  duration?: number
  errorMessage?: string
  stackTrace?: string
  expected?: string
  actual?: string
  stdout?: string
  stderr?: string
  tags: string[]
  lineNumber: number
  retryCount?: number
}

interface TestSuite {
  id: string
  name: string
  filePath: string
  framework: TestFramework
  status: TestStatus
  duration?: number
  expanded: boolean
  children: TestSuite[]
  tests: TestCase[]
  tags: string[]
}

interface CoverageFile {
  path: string
  name: string
  percentage: number
  coveredLines: number
  totalLines: number
  uncoveredRanges: [number, number][]
  branchCoverage: number
  functionCoverage: number
}

interface CoverageData {
  overall: number
  branchOverall: number
  functionOverall: number
  files: CoverageFile[]
}

interface TestRunHistory {
  id: string
  timestamp: number
  passed: number
  failed: number
  skipped: number
  total: number
  duration: number
  framework: TestFramework
}

interface GutterDecoration {
  file: string
  line: number
  status: TestStatus
  testName: string
}

/* ── Available Tags ────────────────────────────────────────────── */

const AVAILABLE_TAGS: TestTag[] = [
  { id: 'unit', label: 'unit', color: '#4fc3f7' },
  { id: 'integration', label: 'integration', color: '#81c784' },
  { id: 'e2e', label: 'e2e', color: '#ffb74d' },
  { id: 'smoke', label: 'smoke', color: '#ce93d8' },
  { id: 'regression', label: 'regression', color: '#ef5350' },
  { id: 'slow', label: 'slow', color: '#ff8a65' },
  { id: 'flaky', label: 'flaky', color: '#ffd54f' },
  { id: 'critical', label: 'critical', color: '#e57373' },
  { id: 'api', label: 'api', color: '#64b5f6' },
  { id: 'ui', label: 'ui', color: '#aed581' },
]

/* ── Mock Data: 3-level deep hierarchy with 30+ tests ─────────── */

function generateMockTestTree(): TestSuite[] {
  return [
    {
      id: 'suite-services',
      name: 'services',
      filePath: 'src/services',
      framework: 'vitest',
      status: 'idle',
      duration: undefined,
      expanded: true,
      tags: [],
      tests: [],
      children: [
        {
          id: 'suite-auth',
          name: 'auth.test.ts',
          filePath: 'src/services/__tests__/auth.test.ts',
          framework: 'vitest',
          status: 'idle',
          expanded: true,
          tags: ['unit', 'critical'],
          tests: [
            { id: 'auth-1', name: 'should login with valid credentials', status: 'idle', tags: ['unit', 'critical'], lineNumber: 12 },
            { id: 'auth-2', name: 'should reject invalid password', status: 'idle', tags: ['unit'], lineNumber: 28 },
            { id: 'auth-3', name: 'should handle token refresh', status: 'idle', tags: ['unit', 'api'], lineNumber: 45 },
            { id: 'auth-4', name: 'should logout and clear session', status: 'idle', tags: ['unit'], lineNumber: 67 },
            { id: 'auth-5', name: 'should enforce rate limiting on login', status: 'idle', tags: ['unit', 'api'], lineNumber: 89 },
            { id: 'auth-6', name: 'should validate JWT token expiry', status: 'idle', tags: ['unit', 'critical'], lineNumber: 112 },
          ],
          children: [],
          duration: undefined,
        },
        {
          id: 'suite-api',
          name: 'apiClient.test.ts',
          filePath: 'src/services/__tests__/apiClient.test.ts',
          framework: 'vitest',
          status: 'idle',
          expanded: false,
          tags: ['integration', 'api'],
          tests: [
            { id: 'api-1', name: 'should make GET request with auth headers', status: 'idle', tags: ['integration', 'api'], lineNumber: 8 },
            { id: 'api-2', name: 'should retry on 5xx errors', status: 'idle', tags: ['integration', 'api'], lineNumber: 25 },
            { id: 'api-3', name: 'should handle timeout gracefully', status: 'idle', tags: ['integration', 'slow'], lineNumber: 48 },
            { id: 'api-4', name: 'should serialize query parameters', status: 'idle', tags: ['unit', 'api'], lineNumber: 71 },
          ],
          children: [],
          duration: undefined,
        },
        {
          id: 'suite-fileops',
          name: 'fileOps.test.ts',
          filePath: 'src/services/__tests__/fileOps.test.ts',
          framework: 'jest',
          status: 'idle',
          expanded: false,
          tags: ['unit'],
          tests: [
            { id: 'file-1', name: 'should read file contents as UTF-8', status: 'idle', tags: ['unit'], lineNumber: 10 },
            { id: 'file-2', name: 'should write file with encoding', status: 'idle', tags: ['unit'], lineNumber: 30 },
            { id: 'file-3', name: 'should create directory recursively', status: 'idle', tags: ['unit'], lineNumber: 52 },
            { id: 'file-4', name: 'should delete file safely with backup', status: 'idle', tags: ['unit'], lineNumber: 74 },
            { id: 'file-5', name: 'should watch file for changes', status: 'idle', tags: ['unit', 'slow'], lineNumber: 95 },
          ],
          children: [],
          duration: undefined,
        },
      ],
    },
    {
      id: 'suite-store',
      name: 'store',
      filePath: 'src/store',
      framework: 'vitest',
      status: 'idle',
      duration: undefined,
      expanded: true,
      tags: [],
      tests: [],
      children: [
        {
          id: 'suite-editor-store',
          name: 'editor.spec.ts',
          filePath: 'src/store/__tests__/editor.spec.ts',
          framework: 'vitest',
          status: 'idle',
          expanded: false,
          tags: ['unit'],
          tests: [
            { id: 'editor-1', name: 'should open a file in a new tab', status: 'idle', tags: ['unit'], lineNumber: 15 },
            { id: 'editor-2', name: 'should switch active tab correctly', status: 'idle', tags: ['unit'], lineNumber: 35 },
            { id: 'editor-3', name: 'should close tab and select neighbor', status: 'idle', tags: ['unit'], lineNumber: 58 },
            { id: 'editor-4', name: 'should mark tab as modified on edit', status: 'idle', tags: ['unit'], lineNumber: 80 },
            { id: 'editor-5', name: 'should handle split editor groups', status: 'idle', tags: ['unit', 'ui'], lineNumber: 102 },
          ],
          children: [],
          duration: undefined,
        },
        {
          id: 'suite-file-store',
          name: 'files.spec.ts',
          filePath: 'src/store/__tests__/files.spec.ts',
          framework: 'vitest',
          status: 'idle',
          expanded: false,
          tags: ['unit'],
          tests: [
            { id: 'fstore-1', name: 'should initialize file tree from workspace', status: 'idle', tags: ['unit'], lineNumber: 10 },
            { id: 'fstore-2', name: 'should add new file to tree', status: 'idle', tags: ['unit'], lineNumber: 32 },
            { id: 'fstore-3', name: 'should rename file and update references', status: 'idle', tags: ['unit', 'integration'], lineNumber: 55 },
            { id: 'fstore-4', name: 'should delete file and remove from tree', status: 'idle', tags: ['unit'], lineNumber: 78 },
          ],
          children: [],
          duration: undefined,
        },
      ],
    },
    {
      id: 'suite-components',
      name: 'components',
      filePath: 'src/components',
      framework: 'vitest',
      status: 'idle',
      duration: undefined,
      expanded: false,
      tags: [],
      tests: [],
      children: [
        {
          id: 'suite-tabbar',
          name: 'TabBar.test.tsx',
          filePath: 'src/components/__tests__/TabBar.test.tsx',
          framework: 'vitest',
          status: 'idle',
          expanded: false,
          tags: ['unit', 'ui'],
          tests: [
            { id: 'tab-1', name: 'should render all open tabs', status: 'idle', tags: ['unit', 'ui'], lineNumber: 12 },
            { id: 'tab-2', name: 'should highlight active tab', status: 'idle', tags: ['unit', 'ui'], lineNumber: 30 },
            { id: 'tab-3', name: 'should show modified indicator', status: 'idle', tags: ['unit', 'ui'], lineNumber: 50 },
            { id: 'tab-4', name: 'should close tab on middle click', status: 'idle', tags: ['unit', 'ui'], lineNumber: 68 },
          ],
          children: [],
          duration: undefined,
        },
        {
          id: 'suite-statusbar',
          name: 'StatusBar.test.tsx',
          filePath: 'src/components/__tests__/StatusBar.test.tsx',
          framework: 'vitest',
          status: 'idle',
          expanded: false,
          tags: ['unit', 'ui'],
          tests: [
            { id: 'sb-1', name: 'should display git branch name', status: 'idle', tags: ['unit', 'ui'], lineNumber: 8 },
            { id: 'sb-2', name: 'should show line and column position', status: 'idle', tags: ['unit', 'ui'], lineNumber: 25 },
            { id: 'sb-3', name: 'should update encoding display', status: 'idle', tags: ['unit', 'ui'], lineNumber: 44 },
          ],
          children: [],
          duration: undefined,
        },
      ],
    },
    {
      id: 'suite-e2e',
      name: 'e2e',
      filePath: 'tests/e2e',
      framework: 'vitest',
      status: 'idle',
      duration: undefined,
      expanded: false,
      tags: ['e2e'],
      tests: [],
      children: [
        {
          id: 'suite-e2e-workspace',
          name: 'workspace.e2e.ts',
          filePath: 'tests/e2e/workspace.e2e.ts',
          framework: 'vitest',
          status: 'idle',
          expanded: false,
          tags: ['e2e', 'smoke'],
          tests: [
            { id: 'e2e-1', name: 'should open workspace from folder', status: 'idle', tags: ['e2e', 'smoke'], lineNumber: 15 },
            { id: 'e2e-2', name: 'should create and edit a new file', status: 'idle', tags: ['e2e'], lineNumber: 45 },
            { id: 'e2e-3', name: 'should search across all workspace files', status: 'idle', tags: ['e2e'], lineNumber: 78 },
            { id: 'e2e-4', name: 'should open terminal and run commands', status: 'idle', tags: ['e2e', 'slow'], lineNumber: 112 },
          ],
          children: [],
          duration: undefined,
        },
      ],
    },
  ]
}

/* ── Mock coverage data ────────────────────────────────────────── */

function generateMockCoverage(): CoverageData {
  return {
    overall: 73.8,
    branchOverall: 62.4,
    functionOverall: 81.2,
    files: [
      { path: 'src/services/auth.ts', name: 'auth.ts', percentage: 91.5, coveredLines: 183, totalLines: 200, uncoveredRanges: [[45, 52], [120, 128]], branchCoverage: 85.0, functionCoverage: 95.0 },
      { path: 'src/services/apiClient.ts', name: 'apiClient.ts', percentage: 84.0, coveredLines: 168, totalLines: 200, uncoveredRanges: [[88, 96], [145, 160]], branchCoverage: 72.0, functionCoverage: 90.0 },
      { path: 'src/store/editor.ts', name: 'editor.ts', percentage: 82.7, coveredLines: 248, totalLines: 300, uncoveredRanges: [[112, 130], [205, 220]], branchCoverage: 70.5, functionCoverage: 88.0 },
      { path: 'src/store/files.ts', name: 'files.ts', percentage: 76.0, coveredLines: 190, totalLines: 250, uncoveredRanges: [[50, 65], [180, 200]], branchCoverage: 60.0, functionCoverage: 80.0 },
      { path: 'src/services/fileOps.ts', name: 'fileOps.ts', percentage: 72.5, coveredLines: 145, totalLines: 200, uncoveredRanges: [[30, 48], [155, 172]], branchCoverage: 58.0, functionCoverage: 75.0 },
      { path: 'src/components/TabBar.tsx', name: 'TabBar.tsx', percentage: 65.3, coveredLines: 98, totalLines: 150, uncoveredRanges: [[40, 55], [100, 120]], branchCoverage: 50.0, functionCoverage: 70.0 },
      { path: 'src/components/StatusBar.tsx', name: 'StatusBar.tsx', percentage: 58.0, coveredLines: 58, totalLines: 100, uncoveredRanges: [[25, 42], [70, 85]], branchCoverage: 42.0, functionCoverage: 60.0 },
      { path: 'src/services/terminal.ts', name: 'terminal.ts', percentage: 52.0, coveredLines: 52, totalLines: 100, uncoveredRanges: [[20, 40], [60, 80]], branchCoverage: 38.0, functionCoverage: 55.0 },
    ],
  }
}

/* ── Mock run history ──────────────────────────────────────────── */

function generateMockHistory(): TestRunHistory[] {
  const now = Date.now()
  return [
    { id: 'run-1', timestamp: now - 86400000 * 9, passed: 28, failed: 4, skipped: 2, total: 34, duration: 12400, framework: 'vitest' },
    { id: 'run-2', timestamp: now - 86400000 * 8, passed: 30, failed: 2, skipped: 2, total: 34, duration: 11200, framework: 'vitest' },
    { id: 'run-3', timestamp: now - 86400000 * 7, passed: 26, failed: 6, skipped: 2, total: 34, duration: 14800, framework: 'vitest' },
    { id: 'run-4', timestamp: now - 86400000 * 6, passed: 31, failed: 1, skipped: 2, total: 34, duration: 10900, framework: 'vitest' },
    { id: 'run-5', timestamp: now - 86400000 * 5, passed: 29, failed: 3, skipped: 2, total: 34, duration: 12100, framework: 'vitest' },
    { id: 'run-6', timestamp: now - 86400000 * 4, passed: 32, failed: 0, skipped: 2, total: 34, duration: 9800, framework: 'vitest' },
    { id: 'run-7', timestamp: now - 86400000 * 3, passed: 27, failed: 5, skipped: 2, total: 34, duration: 15200, framework: 'vitest' },
    { id: 'run-8', timestamp: now - 86400000 * 2, passed: 30, failed: 2, skipped: 2, total: 34, duration: 11500, framework: 'vitest' },
    { id: 'run-9', timestamp: now - 86400000, passed: 31, failed: 1, skipped: 2, total: 34, duration: 10200, framework: 'vitest' },
    { id: 'run-10', timestamp: now - 3600000, passed: 29, failed: 3, skipped: 2, total: 34, duration: 12800, framework: 'vitest' },
  ]
}

/* ── Error generation helpers ──────────────────────────────────── */

const ERROR_MESSAGES = [
  `AssertionError: expected true to be false`,
  `TypeError: Cannot read properties of undefined (reading 'id')`,
  `Error: Timeout - Async callback was not invoked within 5000ms`,
  `expect(received).toBe(expected)\n\nExpected: 200\nReceived: 401`,
  `Error: connect ECONNREFUSED 127.0.0.1:3000`,
  `ReferenceError: mockService is not defined`,
  `expect(received).toEqual(expected)\n\nExpected: { status: "active" }\nReceived: { status: "inactive" }`,
  `Error: ENOENT: no such file or directory, open '/tmp/test.txt'`,
]

const STDOUT_SAMPLES = [
  `[auth] Initializing authentication service...\n[auth] Connecting to identity provider...\n[auth] Connection established\n[auth] Token cache loaded (23 entries)\n`,
  `[api] Request: GET /api/v1/users\n[api] Response: 200 OK (143ms)\n[api] Cache hit for /api/v1/users\n`,
  `[fs] Reading file: /workspace/src/index.ts\n[fs] File size: 2.4KB\n[fs] Encoding: UTF-8\n`,
  `[store] Dispatching action: SET_ACTIVE_TAB\n[store] State updated: { activeTab: "editor.ts" }\n`,
  `[test] Setting up mock environment...\n[test] Database seeded with 50 records\n[test] Server started on port 3001\n`,
]

const STDERR_SAMPLES = [
  `\x1b[33mWarning: React.createElement: type is invalid\x1b[0m\n`,
  `\x1b[31mError: Failed to fetch resource\x1b[0m\n\x1b[33mRetrying in 1000ms...\x1b[0m\n`,
  `\x1b[33m[DEPRECATION] Array.reduce will be removed in v3.0\x1b[0m\n`,
  `\x1b[31mUnhandled promise rejection: NetworkError\x1b[0m\n`,
]

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateStackTrace(filePath: string): string {
  const line = Math.floor(10 + Math.random() * 200)
  const col = Math.floor(1 + Math.random() * 40)
  return [
    `    at Object.<anonymous> (${filePath}:${line}:${col})`,
    `    at Module._compile (node:internal/modules/cjs/loader:1275:14)`,
    `    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
    `    at runTest (node_modules/vitest/dist/entry.js:112:20)`,
    `    at Suite.run (node_modules/vitest/dist/suite.js:58:10)`,
  ].join('\n')
}

/* ── Test simulation engine ────────────────────────────────────── */

function flattenTests(suites: TestSuite[]): TestCase[] {
  const result: TestCase[] = []
  for (const suite of suites) {
    result.push(...suite.tests)
    result.push(...flattenTests(suite.children))
  }
  return result
}

function flattenSuites(suites: TestSuite[]): TestSuite[] {
  const result: TestSuite[] = []
  for (const suite of suites) {
    result.push(suite)
    result.push(...flattenSuites(suite.children))
  }
  return result
}

function countTests(suites: TestSuite[]): { passed: number; failed: number; skipped: number; running: number; total: number } {
  const tests = flattenTests(suites)
  return {
    passed: tests.filter(t => t.status === 'passed').length,
    failed: tests.filter(t => t.status === 'failed').length,
    skipped: tests.filter(t => t.status === 'skipped').length,
    running: tests.filter(t => t.status === 'running' || t.status === 'queued').length,
    total: tests.length,
  }
}

function deepCloneSuites(suites: TestSuite[]): TestSuite[] {
  return suites.map(s => ({
    ...s,
    tests: s.tests.map(t => ({ ...t })),
    children: deepCloneSuites(s.children),
  }))
}

function updateSuiteStatus(suite: TestSuite): void {
  for (const child of suite.children) {
    updateSuiteStatus(child)
  }
  const allTests = flattenTests([suite])
  if (allTests.some(t => t.status === 'running' || t.status === 'queued')) {
    suite.status = 'running'
  } else if (allTests.some(t => t.status === 'failed')) {
    suite.status = 'failed'
  } else if (allTests.every(t => t.status === 'passed' || t.status === 'skipped')) {
    suite.status = allTests.some(t => t.status === 'passed') ? 'passed' : 'skipped'
  } else {
    suite.status = 'idle'
  }
}

async function simulateTestExecution(
  suites: TestSuite[],
  mode: RunMode,
  onUpdate: (suites: TestSuite[]) => void,
  abortSignal: AbortSignal,
  targetTestIds?: Set<string>,
): Promise<TestSuite[]> {
  const results = deepCloneSuites(suites)
  const allSuites = flattenSuites(results)

  // Mark targets as queued
  for (const suite of allSuites) {
    for (const test of suite.tests) {
      if (!targetTestIds || targetTestIds.has(test.id)) {
        test.status = 'queued'
      }
    }
    updateSuiteStatus(suite)
  }
  onUpdate(deepCloneSuites(results))

  // Collect all leaf suites with tests to run
  const leafSuites = allSuites.filter(s => s.tests.some(t => t.status === 'queued'))

  const runSuite = async (suite: TestSuite) => {
    const suiteStart = Date.now()
    for (const test of suite.tests) {
      if (abortSignal.aborted) return
      if (test.status !== 'queued') continue

      test.status = 'running'
      updateSuiteStatus(suite)
      // Also update parent statuses
      for (const s of flattenSuites(results)) updateSuiteStatus(s)
      onUpdate(deepCloneSuites(results))

      await new Promise(r => setTimeout(r, 60 + Math.random() * 200))
      if (abortSignal.aborted) return

      const roll = Math.random()
      const duration = Math.floor(5 + Math.random() * 250)
      test.duration = duration
      test.stdout = pickRandom(STDOUT_SAMPLES)

      if (roll < 0.62) {
        test.status = 'passed'
      } else if (roll < 0.85) {
        test.status = 'failed'
        test.duration = Math.floor(30 + Math.random() * 400)
        test.errorMessage = pickRandom(ERROR_MESSAGES)
        test.stackTrace = generateStackTrace(suite.filePath)
        test.stderr = pickRandom(STDERR_SAMPLES)
        if (roll < 0.75) {
          test.expected = '"active"'
          test.actual = '"inactive"'
        }
      } else {
        test.status = 'skipped'
        test.duration = undefined
      }

      updateSuiteStatus(suite)
      for (const s of flattenSuites(results)) updateSuiteStatus(s)
      onUpdate(deepCloneSuites(results))
    }
    suite.duration = Date.now() - suiteStart
  }

  if (mode === 'parallel') {
    await Promise.all(leafSuites.map(runSuite))
  } else {
    for (const suite of leafSuites) {
      if (abortSignal.aborted) break
      await runSuite(suite)
    }
  }

  // Final status pass
  for (const s of flattenSuites(results)) updateSuiteStatus(s)
  onUpdate(deepCloneSuites(results))
  return results
}

/* ── Test skeleton generator ───────────────────────────────────── */

function generateTestSkeleton(framework: TestFramework, name: string): string {
  switch (framework) {
    case 'jest':
    case 'vitest':
      return `import { describe, it, expect, beforeEach, afterEach } from '${framework === 'jest' ? '@jest/globals' : 'vitest'}'

describe('${name}', () => {
  beforeEach(() => {
    // Setup
  })

  afterEach(() => {
    // Cleanup
  })

  it('should handle the default case', () => {
    // Arrange
    const input = {}

    // Act
    const result = ${name.charAt(0).toLowerCase() + name.slice(1)}(input)

    // Assert
    expect(result).toBeDefined()
  })

  it('should handle edge cases', () => {
    expect(() => ${name.charAt(0).toLowerCase() + name.slice(1)}(null)).toThrow()
  })

  it('should return correct output for valid input', () => {
    // TODO: implement
    expect(true).toBe(true)
  })
})
`
    case 'mocha':
      return `import { describe, it, before, after } from 'mocha'
import { expect } from 'chai'

describe('${name}', () => {
  before(() => {
    // Setup
  })

  after(() => {
    // Cleanup
  })

  it('should handle the default case', () => {
    expect(true).to.be.true
  })

  it('should handle edge cases', () => {
    expect(() => { throw new Error() }).to.throw()
  })
})
`
    case 'pytest':
      return `import pytest


class Test${name}:
    @pytest.fixture(autouse=True)
    def setup(self):
        # Setup
        yield
        # Cleanup

    def test_default_case(self):
        assert True

    def test_edge_cases(self):
        with pytest.raises(ValueError):
            raise ValueError("expected")

    def test_valid_input(self):
        result = ${name.toLowerCase()}()
        assert result is not None
`
    case 'cargo-test':
      return `#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_case() {
        let result = ${name.toLowerCase()}();
        assert!(result.is_ok());
    }

    #[test]
    fn test_edge_cases() {
        let result = ${name.toLowerCase()}_with_invalid_input();
        assert!(result.is_err());
    }

    #[test]
    #[should_panic]
    fn test_panic_on_null() {
        ${name.toLowerCase()}(None);
    }
}
`
    case 'go-test':
      return `package ${name.toLowerCase()}_test

import (
    "testing"
)

func Test${name}_DefaultCase(t *testing.T) {
    result := ${name}()
    if result == nil {
        t.Fatal("expected non-nil result")
    }
}

func Test${name}_EdgeCases(t *testing.T) {
    defer func() {
        if r := recover(); r == nil {
            t.Fatal("expected panic")
        }
    }()
    ${name}WithInvalidInput()
}

func Benchmark${name}(b *testing.B) {
    for i := 0; i < b.N; i++ {
        ${name}()
    }
}
`
    default:
      return `// Test skeleton for ${name}\n`
  }
}

/* ── ANSI color parser ─────────────────────────────────────────── */

interface AnsiSegment {
  text: string
  color?: string
  bold?: boolean
}

function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  const regex = /\x1b\[(\d+(?:;\d+)*)m/g
  let lastIndex = 0
  let currentColor: string | undefined
  let bold = false
  let match: RegExpExecArray | null

  const colorMap: Record<string, string> = {
    '30': '#1e1e1e', '31': '#ef5350', '32': '#66bb6a', '33': '#ffa726',
    '34': '#42a5f5', '35': '#ab47bc', '36': '#26c6da', '37': '#bdbdbd',
    '90': '#757575', '91': '#ef9a9a', '92': '#a5d6a7', '93': '#ffe082',
    '94': '#90caf9', '95': '#ce93d8', '96': '#80deea', '97': '#fafafa',
  }

  while ((match = regex.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), color: currentColor, bold })
    }
    const codes = match[1].split(';')
    for (const code of codes) {
      if (code === '0') { currentColor = undefined; bold = false }
      else if (code === '1') { bold = true }
      else if (colorMap[code]) { currentColor = colorMap[code] }
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), color: currentColor, bold })
  }

  return segments
}

/* ── Gutter decoration extractor ───────────────────────────────── */

function extractGutterDecorations(suites: TestSuite[]): GutterDecoration[] {
  const decorations: GutterDecoration[] = []
  for (const suite of flattenSuites(suites)) {
    for (const test of suite.tests) {
      if (test.status !== 'idle' && test.status !== 'queued') {
        decorations.push({
          file: suite.filePath,
          line: test.lineNumber,
          status: test.status,
          testName: test.name,
        })
      }
    }
  }
  return decorations
}

/* ── Format helpers ────────────────────────────────────────────── */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function coverageColor(pct: number): string {
  if (pct >= 80) return 'var(--success)'
  if (pct >= 60) return 'var(--warning)'
  return 'var(--error)'
}

/* ══════════════════════════════════════════════════════════════════
   ██  TestExplorerPanel Component
   ══════════════════════════════════════════════════════════════════ */

const TestExplorerPanel: React.FC = () => {
  /* ── State ────────────────────────────────────────────────────── */
  const [suites, setSuites] = useState<TestSuite[]>(() => generateMockTestTree())
  const [coverage, setCoverage] = useState<CoverageData>(() => generateMockCoverage())
  const [history, setHistory] = useState<TestRunHistory[]>(() => generateMockHistory())
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const [runMode, setRunMode] = useState<RunMode>('sequential')
  const [viewMode, setViewMode] = useState<ViewMode>('tree')
  const [framework, setFramework] = useState<TestFramework>('vitest')
  const [isRunning, setIsRunning] = useState(false)
  const [watchMode, setWatchMode] = useState(false)
  const [showCoverage, setShowCoverage] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showOutput, setShowOutput] = useState(false)
  const [showDecorations, setShowDecorations] = useState(true)
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [showSkeletonDialog, setShowSkeletonDialog] = useState(false)
  const [skeletonName, setSkeletonName] = useState('')
  const [skeletonGenerated, setSkeletonGenerated] = useState('')
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [showConfigDropdown, setShowConfigDropdown] = useState(false)
  const [showSortDropdown, setShowSortDropdown] = useState(false)
  const [expandedCoverageFiles, setExpandedCoverageFiles] = useState<Set<string>>(new Set())
  const [outputTab, setOutputTab] = useState<'stdout' | 'stderr'>('stdout')

  const abortControllerRef = useRef<AbortController | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  /* ── Derived data ─────────────────────────────────────────────── */
  const counts = useMemo(() => countTests(suites), [suites])
  const totalDuration = useMemo(() => {
    let total = 0
    for (const s of flattenSuites(suites)) {
      if (s.duration) total += s.duration
    }
    return total
  }, [suites])

  const selectedTest = useMemo(() => {
    if (!selectedTestId) return null
    for (const t of flattenTests(suites)) {
      if (t.id === selectedTestId) return t
    }
    return null
  }, [selectedTestId, suites])

  const selectedTestSuite = useMemo(() => {
    if (!selectedTestId) return null
    for (const s of flattenSuites(suites)) {
      if (s.tests.some(t => t.id === selectedTestId)) return s
    }
    return null
  }, [selectedTestId, suites])

  const gutterDecorations = useMemo(() => {
    return showDecorations ? extractGutterDecorations(suites) : []
  }, [suites, showDecorations])

  /* ── Filter + sort logic ──────────────────────────────────────── */
  const filterTest = useCallback((test: TestCase): boolean => {
    if (searchQuery && !test.name.toLowerCase().includes(searchQuery.toLowerCase())) return false
    if (filterMode !== 'all' && test.status !== filterMode) return false
    if (selectedTags.size > 0 && !test.tags.some(t => selectedTags.has(t))) return false
    return true
  }, [searchQuery, filterMode, selectedTags])

  const filterSuite = useCallback((suite: TestSuite): TestSuite | null => {
    const filteredTests = suite.tests.filter(filterTest)
    const filteredChildren = suite.children
      .map(filterSuite)
      .filter((s): s is TestSuite => s !== null)

    if (filteredTests.length === 0 && filteredChildren.length === 0) return null

    return { ...suite, tests: filteredTests, children: filteredChildren }
  }, [filterTest])

  const filteredSuites = useMemo(() => {
    return suites.map(filterSuite).filter((s): s is TestSuite => s !== null)
  }, [suites, filterSuite])

  const sortTests = useCallback((tests: TestCase[]): TestCase[] => {
    return [...tests].sort((a, b) => {
      switch (sortMode) {
        case 'name': return a.name.localeCompare(b.name)
        case 'status': {
          const order: Record<TestStatus, number> = { failed: 0, running: 1, queued: 2, passed: 3, skipped: 4, idle: 5 }
          return order[a.status] - order[b.status]
        }
        case 'duration': return (b.duration ?? 0) - (a.duration ?? 0)
        case 'file': return a.name.localeCompare(b.name)
        default: return 0
      }
    })
  }, [sortMode])

  /* ── Actions ──────────────────────────────────────────────────── */
  const handleRunAll = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl

    const result = await simulateTestExecution(suites, runMode, setSuites, ctrl.signal)
    if (!ctrl.signal.aborted) {
      setSuites(result)
      const c = countTests(result)
      const dur = flattenSuites(result).reduce((sum, s) => sum + (s.duration ?? 0), 0)
      setHistory(prev => [...prev.slice(-9), {
        id: `run-${Date.now()}`,
        timestamp: Date.now(),
        passed: c.passed,
        failed: c.failed,
        skipped: c.skipped,
        total: c.total,
        duration: dur,
        framework,
      }])
    }
    setIsRunning(false)
  }, [isRunning, suites, runMode, framework])

  const handleRunFailed = useCallback(async () => {
    if (isRunning) return
    const failedIds = new Set(flattenTests(suites).filter(t => t.status === 'failed').map(t => t.id))
    if (failedIds.size === 0) return
    setIsRunning(true)
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl

    const result = await simulateTestExecution(suites, runMode, setSuites, ctrl.signal, failedIds)
    if (!ctrl.signal.aborted) {
      setSuites(result)
    }
    setIsRunning(false)
  }, [isRunning, suites, runMode])

  const handleRunSelected = useCallback(async () => {
    if (isRunning || !selectedTestId) return
    setIsRunning(true)
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl

    const result = await simulateTestExecution(suites, runMode, setSuites, ctrl.signal, new Set([selectedTestId]))
    if (!ctrl.signal.aborted) {
      setSuites(result)
    }
    setIsRunning(false)
  }, [isRunning, selectedTestId, suites, runMode])

  const handleStop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsRunning(false)
  }, [])

  const handleReset = useCallback(() => {
    setSuites(generateMockTestTree())
    setSelectedTestId(null)
  }, [])

  const toggleSuiteExpand = useCallback((suiteId: string) => {
    setSuites(prev => {
      const toggle = (suites: TestSuite[]): TestSuite[] =>
        suites.map(s => s.id === suiteId
          ? { ...s, expanded: !s.expanded }
          : { ...s, children: toggle(s.children) }
        )
      return toggle(prev)
    })
  }, [])

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }, [])

  const handleGenerateSkeleton = useCallback(() => {
    if (!skeletonName.trim()) return
    setSkeletonGenerated(generateTestSkeleton(framework, skeletonName.trim()))
  }, [framework, skeletonName])

  const handleCopySkeleton = useCallback(() => {
    navigator.clipboard?.writeText(skeletonGenerated)
  }, [skeletonGenerated])

  /* ── Watch mode effect ────────────────────────────────────────── */
  useEffect(() => {
    if (!watchMode || isRunning) return
    const interval = setInterval(() => {
      handleRunAll()
    }, 15000)
    return () => clearInterval(interval)
  }, [watchMode, isRunning, handleRunAll])

  /* ── Keyboard shortcuts ───────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'r') {
        e.preventDefault()
        handleRunAll()
      }
      if (e.ctrlKey && e.key === 'f' && panelRef.current?.contains(document.activeElement)) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleRunAll])

  /* ── Status icon renderer ─────────────────────────────────────── */
  const StatusIcon: React.FC<{ status: TestStatus; size?: number }> = ({ status, size = 14 }) => {
    switch (status) {
      case 'passed': return <CheckCircle2 size={size} style={{ color: 'var(--success)', flexShrink: 0 }} />
      case 'failed': return <XCircle size={size} style={{ color: 'var(--error)', flexShrink: 0 }} />
      case 'skipped': return <SkipForward size={size} style={{ color: 'var(--warning)', flexShrink: 0 }} />
      case 'running': return <Loader2 size={size} style={{ color: 'var(--accent-primary)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
      case 'queued': return <Clock size={size} style={{ color: 'var(--text-secondary, #888)', flexShrink: 0 }} />
      default: return <Circle size={size} style={{ color: 'var(--text-secondary, #666)', flexShrink: 0 }} />
    }
  }

  /* ── Suite tree renderer ──────────────────────────────────────── */
  const renderSuiteNode = (suite: TestSuite, depth: number = 0): React.ReactNode => {
    const isLeaf = suite.children.length === 0
    const hasFilteredContent = suite.tests.length > 0 || suite.children.length > 0
    if (!hasFilteredContent && isLeaf) return null

    const chevron = suite.expanded
      ? <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-secondary, #888)' }} />
      : <ChevronRight size={14} style={{ flexShrink: 0, color: 'var(--text-secondary, #888)' }} />

    const icon = isLeaf
      ? <FileText size={14} style={{ flexShrink: 0, color: 'var(--accent-primary)' }} />
      : <FolderOpen size={14} style={{ flexShrink: 0, color: 'var(--warning)' }} />

    return (
      <div key={suite.id}>
        <div
          onClick={() => toggleSuiteExpand(suite.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 6px',
            paddingLeft: depth * 16 + 6,
            cursor: 'pointer',
            userSelect: 'none',
            fontSize: 12,
            borderRadius: 3,
            transition: 'background 0.1s',
            background: 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.05))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {chevron}
          <StatusIcon status={suite.status} size={13} />
          {icon}
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }}>
            {suite.name}
          </span>
          {suite.tags.length > 0 && suite.tags.slice(0, 2).map(tagId => {
            const tag = AVAILABLE_TAGS.find(t => t.id === tagId)
            return tag ? (
              <span key={tagId} style={{
                fontSize: 9,
                padding: '1px 4px',
                borderRadius: 3,
                background: tag.color + '22',
                color: tag.color,
                fontWeight: 600,
              }}>
                {tag.label}
              </span>
            ) : null
          })}
          {suite.duration !== undefined && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginLeft: 4 }}>
              {formatDuration(suite.duration)}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>
            ({flattenTests([suite]).length})
          </span>
        </div>

        {suite.expanded && (
          <>
            {suite.children.map(child => renderSuiteNode(child, depth + 1))}
            {sortTests(suite.tests).map(test => renderTestNode(test, suite, depth + 1))}
          </>
        )}
      </div>
    )
  }

  /* ── Test node renderer ───────────────────────────────────────── */
  const renderTestNode = (test: TestCase, suite: TestSuite, depth: number): React.ReactNode => {
    const isSelected = test.id === selectedTestId
    return (
      <div
        key={test.id}
        onClick={() => {
          setSelectedTestId(test.id)
          setShowOutput(true)
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 6px',
          paddingLeft: depth * 16 + 22,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: 12,
          borderRadius: 3,
          background: isSelected ? 'var(--accent-primary)22' : 'transparent',
          borderLeft: isSelected ? '2px solid var(--accent-primary)' : '2px solid transparent',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => {
          if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))'
        }}
        onMouseLeave={e => {
          if (!isSelected) e.currentTarget.style.background = 'transparent'
        }}
      >
        <StatusIcon status={test.status} size={13} />
        <FlaskConical size={12} style={{ flexShrink: 0, color: 'var(--text-secondary, #888)' }} />
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: test.status === 'failed' ? 'var(--error)' : 'var(--text-primary)',
          fontWeight: isSelected ? 600 : 400,
        }}>
          {test.name}
        </span>
        {test.tags.slice(0, 1).map(tagId => {
          const tag = AVAILABLE_TAGS.find(t => t.id === tagId)
          return tag ? (
            <span key={tagId} style={{
              fontSize: 9,
              padding: '0px 3px',
              borderRadius: 2,
              background: tag.color + '22',
              color: tag.color,
            }}>
              {tag.label}
            </span>
          ) : null
        })}
        {test.duration !== undefined && (
          <span style={{
            fontSize: 10,
            color: test.duration > 200 ? 'var(--warning)' : 'var(--text-secondary, #888)',
            fontFamily: 'monospace',
          }}>
            {formatDuration(test.duration)}
          </span>
        )}
        {/* Inline run button */}
        <div
          onClick={e => {
            e.stopPropagation()
            if (!isRunning) {
              setSelectedTestId(test.id)
              // Simulate running just this test
              handleRunSelected()
            }
          }}
          style={{
            opacity: 0.5,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
        >
          <Play size={11} style={{ color: 'var(--success)' }} />
        </div>
      </div>
    )
  }

  /* ── Render ANSI text ─────────────────────────────────────────── */
  const renderAnsiText = (text: string): React.ReactNode => {
    const segments = parseAnsi(text)
    return segments.map((seg, i) => (
      <span key={i} style={{
        color: seg.color ?? 'var(--text-primary)',
        fontWeight: seg.bold ? 700 : 400,
      }}>
        {seg.text}
      </span>
    ))
  }

  /* ── Timeline chart renderer ──────────────────────────────────── */
  const renderTimeline = (): React.ReactNode => {
    const maxTotal = Math.max(...history.map(h => h.total), 1)
    const barWidth = 100 / history.length

    return (
      <div style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <TrendingUp size={14} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            Test Run History (Last {history.length} runs)
          </span>
        </div>

        {/* Stacked bar chart */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          height: 80,
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: 2,
        }}>
          {history.map((run, i) => {
            const total = run.total || 1
            const passH = (run.passed / total) * 72
            const failH = (run.failed / total) * 72
            const skipH = (run.skipped / total) * 72
            return (
              <div
                key={run.id}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0,
                  cursor: 'pointer',
                }}
                title={`${formatTimestamp(run.timestamp)}: ${run.passed}P / ${run.failed}F / ${run.skipped}S (${formatDuration(run.duration)})`}
              >
                <div style={{ width: '80%', display: 'flex', flexDirection: 'column-reverse' }}>
                  <div style={{ height: passH, background: 'var(--success)', borderRadius: '2px 2px 0 0', minHeight: run.passed > 0 ? 2 : 0 }} />
                  <div style={{ height: failH, background: 'var(--error)', minHeight: run.failed > 0 ? 2 : 0 }} />
                  <div style={{ height: skipH, background: 'var(--warning)', borderRadius: '2px 2px 0 0', minHeight: run.skipped > 0 ? 2 : 0 }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* X-axis labels */}
        <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
          {history.map((run, i) => (
            <div key={run.id} style={{ flex: 1, textAlign: 'center', fontSize: 8, color: 'var(--text-secondary, #888)' }}>
              {formatTimestamp(run.timestamp)}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--text-secondary, #888)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--success)' }} /> Passed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--error)' }} /> Failed
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--warning)' }} /> Skipped
          </span>
        </div>

        {/* Trend indicator */}
        {history.length >= 2 && (() => {
          const last = history[history.length - 1]
          const prev = history[history.length - 2]
          const trend = last.failed - prev.failed
          return (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginTop: 8,
              padding: '4px 8px',
              borderRadius: 4,
              background: trend > 0 ? 'var(--error)11' : trend < 0 ? 'var(--success)11' : 'var(--bg-secondary)',
              fontSize: 11,
              color: trend > 0 ? 'var(--error)' : trend < 0 ? 'var(--success)' : 'var(--text-secondary, #888)',
            }}>
              {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {trend > 0 ? `+${trend} failures since last run` : trend < 0 ? `${Math.abs(trend)} fewer failures` : 'No change in failures'}
            </div>
          )
        })()}
      </div>
    )
  }

  /* ── Coverage panel renderer ──────────────────────────────────── */
  const renderCoverage = (): React.ReactNode => {
    return (
      <div style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <Shield size={14} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            Code Coverage
          </span>
        </div>

        {/* Overall bars */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          {[
            { label: 'Lines', value: coverage.overall },
            { label: 'Branches', value: coverage.branchOverall },
            { label: 'Functions', value: coverage.functionOverall },
          ].map(item => (
            <div key={item.label} style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 2 }}>
                <span>{item.label}</span>
                <span style={{ color: coverageColor(item.value), fontWeight: 600 }}>{item.value.toFixed(1)}%</span>
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'var(--bg-secondary)' }}>
                <div style={{
                  height: '100%',
                  width: `${item.value}%`,
                  borderRadius: 2,
                  background: coverageColor(item.value),
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ))}
        </div>

        {/* File list */}
        <div style={{ fontSize: 11, color: 'var(--text-secondary, #888)', marginBottom: 6, fontWeight: 600 }}>
          Per-file coverage
        </div>
        {coverage.files.map(file => {
          const isExpanded = expandedCoverageFiles.has(file.path)
          return (
            <div key={file.path} style={{ marginBottom: 2 }}>
              <div
                onClick={() => {
                  setExpandedCoverageFiles(prev => {
                    const next = new Set(prev)
                    if (next.has(file.path)) next.delete(file.path)
                    else next.add(file.path)
                    return next
                  })
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 4px',
                  cursor: 'pointer',
                  borderRadius: 3,
                  fontSize: 11,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.04))')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <FileCode size={12} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ flex: 1, color: 'var(--text-primary)' }}>{file.name}</span>
                <span style={{ color: coverageColor(file.percentage), fontWeight: 600, fontFamily: 'monospace', fontSize: 10 }}>
                  {file.percentage.toFixed(1)}%
                </span>
                <div style={{ width: 50, height: 3, borderRadius: 2, background: 'var(--bg-secondary)' }}>
                  <div style={{
                    height: '100%',
                    width: `${file.percentage}%`,
                    borderRadius: 2,
                    background: coverageColor(file.percentage),
                  }} />
                </div>
              </div>

              {isExpanded && (
                <div style={{ paddingLeft: 28, fontSize: 10, color: 'var(--text-secondary, #888)', paddingBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                    <span>Lines: {file.coveredLines}/{file.totalLines}</span>
                    <span>Branches: <span style={{ color: coverageColor(file.branchCoverage) }}>{file.branchCoverage}%</span></span>
                    <span>Functions: <span style={{ color: coverageColor(file.functionCoverage) }}>{file.functionCoverage}%</span></span>
                  </div>
                  {file.uncoveredRanges.length > 0 && (
                    <div style={{ marginTop: 2 }}>
                      <span style={{ color: 'var(--error)', fontSize: 10 }}>
                        Uncovered: {file.uncoveredRanges.map(r => `L${r[0]}-${r[1]}`).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  /* ── Output panel renderer ────────────────────────────────────── */
  const renderOutputPanel = (): React.ReactNode => {
    if (!selectedTest) {
      return (
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary, #888)', fontSize: 12 }}>
          <Info size={24} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
          Select a test to view its output
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Output header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderBottom: '1px solid var(--border-color)',
          fontSize: 11,
        }}>
          <StatusIcon status={selectedTest.status} size={13} />
          <span style={{
            flex: 1,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {selectedTest.name}
          </span>
          {selectedTest.duration !== undefined && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)', fontFamily: 'monospace' }}>
              {formatDuration(selectedTest.duration)}
            </span>
          )}
          {selectedTestSuite && (
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>
              {selectedTestSuite.filePath}:{selectedTest.lineNumber}
            </span>
          )}
        </div>

        {/* Tabs for stdout/stderr */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          {(['stdout', 'stderr'] as const).map(tab => (
            <div
              key={tab}
              onClick={() => setOutputTab(tab)}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                cursor: 'pointer',
                borderBottom: outputTab === tab ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: outputTab === tab ? 'var(--text-primary)' : 'var(--text-secondary, #888)',
                fontWeight: outputTab === tab ? 600 : 400,
              }}
            >
              {tab === 'stdout' ? 'Output' : 'Errors'}
              {tab === 'stderr' && selectedTest.stderr && (
                <span style={{
                  marginLeft: 4,
                  fontSize: 9,
                  padding: '0 4px',
                  borderRadius: 6,
                  background: 'var(--error)33',
                  color: 'var(--error)',
                }}>!</span>
              )}
            </div>
          ))}
        </div>

        {/* Output content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px 10px',
          fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
          fontSize: 11,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {outputTab === 'stdout' && (
            <>
              {selectedTest.stdout ? renderAnsiText(selectedTest.stdout) : (
                <span style={{ color: 'var(--text-secondary, #888)', fontStyle: 'italic' }}>No output captured</span>
              )}
            </>
          )}
          {outputTab === 'stderr' && (
            <>
              {selectedTest.stderr ? renderAnsiText(selectedTest.stderr) : (
                <span style={{ color: 'var(--text-secondary, #888)', fontStyle: 'italic' }}>No errors</span>
              )}
            </>
          )}
        </div>

        {/* Error details */}
        {selectedTest.status === 'failed' && selectedTest.errorMessage && (
          <div style={{
            borderTop: '1px solid var(--border-color)',
            padding: '8px 10px',
            background: 'var(--error)08',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <XCircle size={12} style={{ color: 'var(--error)' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--error)' }}>Error</span>
            </div>
            <pre style={{
              fontSize: 11,
              color: 'var(--error)',
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontFamily: '"Cascadia Code", "Fira Code", monospace',
              lineHeight: 1.5,
            }}>
              {selectedTest.errorMessage}
            </pre>

            {selectedTest.expected && selectedTest.actual && (
              <div style={{ marginTop: 6, fontSize: 11 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <span>
                    <span style={{ color: 'var(--success)', fontWeight: 600 }}>Expected: </span>
                    <code style={{ fontFamily: 'monospace', color: 'var(--success)' }}>{selectedTest.expected}</code>
                  </span>
                  <span>
                    <span style={{ color: 'var(--error)', fontWeight: 600 }}>Received: </span>
                    <code style={{ fontFamily: 'monospace', color: 'var(--error)' }}>{selectedTest.actual}</code>
                  </span>
                </div>
              </div>
            )}

            {selectedTest.stackTrace && (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-secondary, #888)' }}>
                  Stack trace
                </summary>
                <pre style={{
                  fontSize: 10,
                  color: 'var(--text-secondary, #888)',
                  margin: '4px 0 0',
                  whiteSpace: 'pre-wrap',
                  fontFamily: 'monospace',
                  lineHeight: 1.4,
                }}>
                  {selectedTest.stackTrace}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    )
  }

  /* ── Gutter decorations panel ─────────────────────────────────── */
  const renderGutterDecorations = (): React.ReactNode => {
    if (gutterDecorations.length === 0) return null

    const byFile = new Map<string, GutterDecoration[]>()
    for (const d of gutterDecorations) {
      if (!byFile.has(d.file)) byFile.set(d.file, [])
      byFile.get(d.file)!.push(d)
    }

    return (
      <div style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <CircleDot size={14} style={{ color: 'var(--accent-primary)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            Inline Decorations
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>
            ({gutterDecorations.length} markers)
          </span>
        </div>

        {Array.from(byFile.entries()).map(([file, decs]) => (
          <div key={file} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <FileCode size={10} />
              {file}
            </div>
            {decs.sort((a, b) => a.line - b.line).map((dec, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '1px 0 1px 16px',
                fontSize: 11,
              }}>
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: 10,
                  color: 'var(--text-secondary, #888)',
                  minWidth: 30,
                }}>
                  L{dec.line}
                </span>
                <StatusIcon status={dec.status} size={11} />
                <span style={{
                  color: dec.status === 'failed' ? 'var(--error)' : 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 10,
                }}>
                  {dec.testName}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  /* ── Skeleton dialog ──────────────────────────────────────────── */
  const renderSkeletonDialog = (): React.ReactNode => {
    if (!showSkeletonDialog) return null
    return (
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}>
        <div style={{
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          width: 500,
          maxHeight: '80%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
          {/* Dialog header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Wand2 size={14} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Generate Test Skeleton
              </span>
            </div>
            <div
              onClick={() => { setShowSkeletonDialog(false); setSkeletonGenerated('') }}
              style={{ cursor: 'pointer', padding: 2 }}
            >
              <X size={14} style={{ color: 'var(--text-secondary, #888)' }} />
            </div>
          </div>

          {/* Dialog body */}
          <div style={{ padding: '12px 14px', flex: 1, overflow: 'auto' }}>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary, #888)', display: 'block', marginBottom: 4 }}>
                Test name / class name
              </label>
              <input
                value={skeletonName}
                onChange={e => setSkeletonName(e.target.value)}
                placeholder="e.g., UserService, AuthController"
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary, #888)', display: 'block', marginBottom: 4 }}>
                Framework: <strong>{framework}</strong>
              </label>
            </div>

            <button
              onClick={handleGenerateSkeleton}
              style={{
                padding: '6px 14px',
                fontSize: 12,
                background: 'var(--accent-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Generate
            </button>

            {skeletonGenerated && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary, #888)' }}>Generated skeleton:</span>
                  <div
                    onClick={handleCopySkeleton}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--accent-primary)' }}
                  >
                    <Copy size={10} /> Copy
                  </div>
                </div>
                <pre style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 4,
                  padding: '8px 10px',
                  fontSize: 11,
                  fontFamily: '"Cascadia Code", "Fira Code", monospace',
                  lineHeight: 1.5,
                  color: 'var(--text-primary)',
                  overflow: 'auto',
                  maxHeight: 300,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                }}>
                  {skeletonGenerated}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ── Filter panel ─────────────────────────────────────────────── */
  const renderFilterPanel = (): React.ReactNode => {
    if (!showFilterPanel) return null
    return (
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
      }}>
        {/* Status filters */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 4, fontWeight: 600 }}>
            STATUS
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {(['all', 'passed', 'failed', 'skipped', 'running'] as FilterMode[]).map(mode => (
              <div
                key={mode}
                onClick={() => setFilterMode(mode)}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: filterMode === mode ? 'var(--accent-primary)' : 'var(--bg-primary)',
                  color: filterMode === mode ? '#fff' : 'var(--text-primary)',
                  border: `1px solid ${filterMode === mode ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  textTransform: 'capitalize',
                  fontWeight: filterMode === mode ? 600 : 400,
                }}
              >
                {mode}
              </div>
            ))}
          </div>
        </div>

        {/* Tag filters */}
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 4, fontWeight: 600 }}>
            TAGS
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {AVAILABLE_TAGS.map(tag => {
              const active = selectedTags.has(tag.id)
              return (
                <div
                  key={tag.id}
                  onClick={() => toggleTag(tag.id)}
                  style={{
                    padding: '2px 8px',
                    fontSize: 10,
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: active ? tag.color + '33' : 'var(--bg-primary)',
                    color: active ? tag.color : 'var(--text-secondary, #888)',
                    border: `1px solid ${active ? tag.color : 'var(--border-color)'}`,
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <Tag size={8} style={{ marginRight: 3 }} />
                  {tag.label}
                </div>
              )
            })}
          </div>
        </div>

        {/* Sort mode */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)', marginBottom: 4, fontWeight: 600 }}>
            SORT BY
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['name', 'status', 'duration', 'file'] as SortMode[]).map(mode => (
              <div
                key={mode}
                onClick={() => setSortMode(mode)}
                style={{
                  padding: '2px 8px',
                  fontSize: 10,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: sortMode === mode ? 'var(--accent-primary)22' : 'var(--bg-primary)',
                  color: sortMode === mode ? 'var(--accent-primary)' : 'var(--text-secondary, #888)',
                  border: `1px solid ${sortMode === mode ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  textTransform: 'capitalize',
                }}
              >
                {mode}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════════════════════
     ██  MAIN RENDER
     ══════════════════════════════════════════════════════════════ */

  return (
    <div
      ref={panelRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Spin animation keyframes ──────────────────────────────── */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.5 } }
      `}</style>

      {/* ══ Top Toolbar ═══════════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '6px 8px',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        <FlaskConical size={14} style={{ color: 'var(--accent-primary)', marginRight: 4 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginRight: 8 }}>
          TEST EXPLORER
        </span>

        {/* Run all */}
        <div
          onClick={handleRunAll}
          title="Run All Tests (Ctrl+Shift+R)"
          style={{
            padding: '3px 5px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            opacity: isRunning ? 0.4 : 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Play size={13} style={{ color: 'var(--success)' }} />
        </div>

        {/* Run failed */}
        <div
          onClick={handleRunFailed}
          title="Re-run Failed Tests"
          style={{
            padding: '3px 5px',
            cursor: isRunning ? 'not-allowed' : 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            opacity: isRunning ? 0.4 : 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <RotateCw size={13} style={{ color: 'var(--error)' }} />
        </div>

        {/* Run selected */}
        <div
          onClick={handleRunSelected}
          title="Run Selected Test"
          style={{
            padding: '3px 5px',
            cursor: isRunning || !selectedTestId ? 'not-allowed' : 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            opacity: isRunning || !selectedTestId ? 0.4 : 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ArrowRight size={13} style={{ color: 'var(--accent-primary)' }} />
        </div>

        {/* Debug */}
        <div
          onClick={() => { if (!isRunning && selectedTestId) handleRunSelected() }}
          title="Debug Selected Test"
          style={{
            padding: '3px 5px',
            cursor: isRunning || !selectedTestId ? 'not-allowed' : 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            opacity: isRunning || !selectedTestId ? 0.4 : 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Bug size={13} style={{ color: 'var(--warning)' }} />
        </div>

        {/* Stop */}
        {isRunning && (
          <div
            onClick={handleStop}
            title="Stop Test Run"
            style={{
              padding: '3px 5px',
              cursor: 'pointer',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Square size={13} style={{ color: 'var(--error)' }} />
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Watch mode toggle */}
        <div
          onClick={() => setWatchMode(!watchMode)}
          title={watchMode ? 'Disable Watch Mode' : 'Enable Watch Mode'}
          style={{
            padding: '3px 5px',
            cursor: 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            background: watchMode ? 'var(--accent-primary)22' : 'transparent',
          }}
          onMouseEnter={e => { if (!watchMode) e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))' }}
          onMouseLeave={e => { if (!watchMode) e.currentTarget.style.background = 'transparent' }}
        >
          <Eye size={13} style={{ color: watchMode ? 'var(--accent-primary)' : 'var(--text-secondary, #888)' }} />
        </div>

        {/* Run mode toggle */}
        <div
          onClick={() => setRunMode(runMode === 'parallel' ? 'sequential' : 'parallel')}
          title={`Run mode: ${runMode} (click to toggle)`}
          style={{
            padding: '3px 5px',
            cursor: 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {runMode === 'parallel'
            ? <Layers size={13} style={{ color: 'var(--accent-primary)' }} title="Parallel" />
            : <List size={13} style={{ color: 'var(--text-secondary, #888)' }} title="Sequential" />
          }
        </div>

        {/* Decorations toggle */}
        <div
          onClick={() => setShowDecorations(!showDecorations)}
          title={showDecorations ? 'Hide Inline Decorations' : 'Show Inline Decorations'}
          style={{
            padding: '3px 5px',
            cursor: 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            background: showDecorations ? 'var(--accent-primary)11' : 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <CircleDot size={13} style={{ color: showDecorations ? 'var(--accent-primary)' : 'var(--text-secondary, #888)' }} />
        </div>

        {/* Filter toggle */}
        <div
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          title="Toggle Filter Panel"
          style={{
            padding: '3px 5px',
            cursor: 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            background: showFilterPanel ? 'var(--accent-primary)22' : 'transparent',
          }}
          onMouseEnter={e => { if (!showFilterPanel) e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))' }}
          onMouseLeave={e => { if (!showFilterPanel) e.currentTarget.style.background = 'transparent' }}
        >
          <Filter size={13} style={{ color: showFilterPanel || selectedTags.size > 0 || filterMode !== 'all' ? 'var(--accent-primary)' : 'var(--text-secondary, #888)' }} />
        </div>

        {/* Config dropdown */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => setShowConfigDropdown(!showConfigDropdown)}
            title="Test Framework"
            style={{
              padding: '3px 5px',
              cursor: 'pointer',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 10,
              color: 'var(--text-secondary, #888)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Settings size={13} />
          </div>

          {showConfigDropdown && (
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 2,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              zIndex: 50,
              minWidth: 160,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-secondary, #888)', borderBottom: '1px solid var(--border-color)', fontWeight: 600 }}>
                TEST FRAMEWORK
              </div>
              {(['jest', 'vitest', 'mocha', 'pytest', 'cargo-test', 'go-test'] as TestFramework[]).map(fw => (
                <div
                  key={fw}
                  onClick={() => { setFramework(fw); setShowConfigDropdown(false) }}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: fw === framework ? 'var(--accent-primary)' : 'var(--text-primary)',
                    background: fw === framework ? 'var(--accent-primary)11' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
                  onMouseLeave={e => (e.currentTarget.style.background = fw === framework ? 'var(--accent-primary)11' : 'transparent')}
                >
                  <Braces size={12} />
                  {fw}
                  {fw === framework && <CheckCircle2 size={11} style={{ marginLeft: 'auto', color: 'var(--accent-primary)' }} />}
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-color)', padding: '6px 10px' }}>
                <div
                  onClick={() => { setShowSkeletonDialog(true); setShowConfigDropdown(false) }}
                  style={{
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--accent-primary)',
                  }}
                >
                  <Wand2 size={12} />
                  Generate Test Skeleton
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Reset */}
        <div
          onClick={handleReset}
          title="Reset All Tests"
          style={{
            padding: '3px 5px',
            cursor: 'pointer',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover, rgba(255,255,255,0.08))')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <RefreshCw size={13} style={{ color: 'var(--text-secondary, #888)' }} />
        </div>
      </div>

      {/* ══ Search Bar ════════════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0,
      }}>
        <Search size={12} style={{ color: 'var(--text-secondary, #888)', flexShrink: 0 }} />
        <input
          ref={searchInputRef}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter tests by name..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 12,
            padding: '2px 0',
            fontFamily: 'inherit',
          }}
        />
        {searchQuery && (
          <div onClick={() => setSearchQuery('')} style={{ cursor: 'pointer' }}>
            <X size={12} style={{ color: 'var(--text-secondary, #888)' }} />
          </div>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>
          {flattenTests(filteredSuites).length}/{counts.total}
        </span>
      </div>

      {/* ══ Results Summary Bar ═══════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 10px',
        borderBottom: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
        fontSize: 11,
      }}>
        {isRunning && (
          <Loader2 size={12} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
        )}

        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <CheckCircle2 size={11} style={{ color: 'var(--success)' }} />
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>{counts.passed}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <XCircle size={11} style={{ color: 'var(--error)' }} />
          <span style={{ color: 'var(--error)', fontWeight: 600 }}>{counts.failed}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <SkipForward size={11} style={{ color: 'var(--warning)' }} />
          <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{counts.skipped}</span>
        </span>

        <div style={{ flex: 1 }} />

        <span style={{ color: 'var(--text-secondary, #888)', fontSize: 10 }}>
          {counts.total} tests
        </span>
        {totalDuration > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-secondary, #888)', fontSize: 10 }}>
            <Timer size={10} />
            {formatDuration(totalDuration)}
          </span>
        )}

        {watchMode && (
          <span style={{
            fontSize: 9,
            padding: '1px 5px',
            borderRadius: 8,
            background: 'var(--accent-primary)22',
            color: 'var(--accent-primary)',
            fontWeight: 600,
            animation: 'pulse 2s infinite',
          }}>
            WATCH
          </span>
        )}

        <span style={{
          fontSize: 9,
          padding: '1px 5px',
          borderRadius: 8,
          background: 'var(--bg-primary)',
          color: 'var(--text-secondary, #888)',
          border: '1px solid var(--border-color)',
        }}>
          {framework}
        </span>

        <span style={{
          fontSize: 9,
          padding: '1px 5px',
          borderRadius: 8,
          background: runMode === 'parallel' ? 'var(--accent-primary)11' : 'var(--bg-primary)',
          color: runMode === 'parallel' ? 'var(--accent-primary)' : 'var(--text-secondary, #888)',
          border: '1px solid var(--border-color)',
        }}>
          {runMode === 'parallel' ? 'PAR' : 'SEQ'}
        </span>
      </div>

      {/* ══ Filter Panel (collapsible) ════════════════════════════ */}
      {renderFilterPanel()}

      {/* ══ Progress bar when running ═════════════════════════════ */}
      {isRunning && (
        <div style={{ height: 2, background: 'var(--bg-secondary)', flexShrink: 0 }}>
          <div style={{
            height: '100%',
            background: 'var(--accent-primary)',
            width: `${((counts.passed + counts.failed + counts.skipped) / Math.max(counts.total, 1)) * 100}%`,
            transition: 'width 0.3s',
            borderRadius: 1,
          }} />
        </div>
      )}

      {/* ══ Main Content Area ═════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── Section toggle bar ────────────────────────────────── */}
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--border-color)',
          flexShrink: 0,
        }}>
          {[
            { key: 'tree', label: 'Tests', icon: <List size={11} /> },
            { key: 'output', label: 'Output', icon: <Terminal size={11} /> },
            { key: 'coverage', label: 'Coverage', icon: <Shield size={11} /> },
            { key: 'timeline', label: 'Timeline', icon: <BarChart3 size={11} /> },
            { key: 'decorations', label: 'Gutter', icon: <CircleDot size={11} /> },
          ].map(section => {
            const isActive =
              (section.key === 'tree') ||
              (section.key === 'output' && showOutput) ||
              (section.key === 'coverage' && showCoverage) ||
              (section.key === 'timeline' && showTimeline) ||
              (section.key === 'decorations' && showDecorations)

            return (
              <div
                key={section.key}
                onClick={() => {
                  if (section.key === 'output') setShowOutput(!showOutput)
                  else if (section.key === 'coverage') setShowCoverage(!showCoverage)
                  else if (section.key === 'timeline') setShowTimeline(!showTimeline)
                  else if (section.key === 'decorations') setShowDecorations(!showDecorations)
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: 10,
                  cursor: section.key === 'tree' ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary, #888)',
                  borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  fontWeight: isActive ? 600 : 400,
                  transition: 'color 0.15s',
                }}
              >
                {section.icon}
                {section.label}
              </div>
            )
          })}
        </div>

        {/* ── Scrollable content ────────────────────────────────── */}
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* ── Test Tree ────────────────────────────────────────── */}
          <div style={{
            borderBottom: (showOutput || showCoverage || showTimeline) ? '1px solid var(--border-color)' : 'none',
          }}>
            {filteredSuites.length === 0 ? (
              <div style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text-secondary, #888)',
                fontSize: 12,
              }}>
                <FlaskConical size={28} style={{ display: 'block', margin: '0 auto 8px', opacity: 0.3 }} />
                {searchQuery || filterMode !== 'all' || selectedTags.size > 0
                  ? 'No tests match the current filters'
                  : 'No tests discovered. Run test discovery to find tests.'}
              </div>
            ) : (
              <div style={{ padding: '2px 0' }}>
                {filteredSuites.map(suite => renderSuiteNode(suite))}
              </div>
            )}
          </div>

          {/* ── Test Output Panel ────────────────────────────────── */}
          {showOutput && (
            <div style={{
              borderBottom: '1px solid var(--border-color)',
              minHeight: 120,
              maxHeight: 280,
              overflow: 'auto',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)',
                position: 'sticky',
                top: 0,
                zIndex: 5,
              }}>
                <Terminal size={11} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>TEST OUTPUT</span>
                <div style={{ flex: 1 }} />
                <div
                  onClick={() => setShowOutput(false)}
                  style={{ cursor: 'pointer', padding: 1 }}
                >
                  <X size={11} style={{ color: 'var(--text-secondary, #888)' }} />
                </div>
              </div>
              {renderOutputPanel()}
            </div>
          )}

          {/* ── Coverage Panel ───────────────────────────────────── */}
          {showCoverage && (
            <div style={{
              borderBottom: '1px solid var(--border-color)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)',
                position: 'sticky',
                top: 0,
                zIndex: 5,
              }}>
                <Shield size={11} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>CODE COVERAGE</span>
                <div style={{ flex: 1 }} />
                <div
                  onClick={() => setShowCoverage(false)}
                  style={{ cursor: 'pointer', padding: 1 }}
                >
                  <X size={11} style={{ color: 'var(--text-secondary, #888)' }} />
                </div>
              </div>
              {renderCoverage()}
            </div>
          )}

          {/* ── Timeline Panel ───────────────────────────────────── */}
          {showTimeline && (
            <div style={{
              borderBottom: '1px solid var(--border-color)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)',
                position: 'sticky',
                top: 0,
                zIndex: 5,
              }}>
                <BarChart3 size={11} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>TEST TIMELINE</span>
                <div style={{ flex: 1 }} />
                <div
                  onClick={() => setShowTimeline(false)}
                  style={{ cursor: 'pointer', padding: 1 }}
                >
                  <X size={11} style={{ color: 'var(--text-secondary, #888)' }} />
                </div>
              </div>
              {renderTimeline()}
            </div>
          )}

          {/* ── Gutter Decorations Panel ─────────────────────────── */}
          {showDecorations && gutterDecorations.length > 0 && (
            <div style={{
              borderBottom: '1px solid var(--border-color)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-color)',
                position: 'sticky',
                top: 0,
                zIndex: 5,
              }}>
                <CircleDot size={11} style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)' }}>INLINE DECORATIONS</span>
                <div style={{ flex: 1 }} />
                <div
                  onClick={() => setShowDecorations(false)}
                  style={{ cursor: 'pointer', padding: 1 }}
                >
                  <X size={11} style={{ color: 'var(--text-secondary, #888)' }} />
                </div>
              </div>
              {renderGutterDecorations()}
            </div>
          )}
        </div>
      </div>

      {/* ══ Bottom Status Bar ═════════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '3px 10px',
        borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        flexShrink: 0,
        fontSize: 10,
        color: 'var(--text-secondary, #888)',
      }}>
        {isRunning ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-primary)' }}>
            <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
            Running tests...
          </span>
        ) : counts.failed > 0 ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--error)' }}>
            <XCircle size={10} />
            {counts.failed} test{counts.failed !== 1 ? 's' : ''} failed
          </span>
        ) : counts.passed > 0 ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success)' }}>
            <CheckCircle2 size={10} />
            All {counts.passed} tests passed
          </span>
        ) : (
          <span>Ready to run tests</span>
        )}

        <div style={{ flex: 1 }} />

        {selectedTags.size > 0 && (
          <span style={{ color: 'var(--accent-primary)' }}>
            {selectedTags.size} tag{selectedTags.size !== 1 ? 's' : ''} active
          </span>
        )}

        <span>{framework}</span>
        <span>{runMode}</span>

        {watchMode && (
          <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
            WATCH ON
          </span>
        )}
      </div>

      {/* ══ Skeleton Dialog Overlay ═══════════════════════════════ */}
      {renderSkeletonDialog()}

      {/* ══ Config dropdown backdrop ══════════════════════════════ */}
      {showConfigDropdown && (
        <div
          onClick={() => setShowConfigDropdown(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        />
      )}
    </div>
  )
}

export default TestExplorerPanel
