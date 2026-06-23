import { beforeEach, describe, expect, it } from 'vitest'
import {
  useDiagnosticsStore,
  type Diagnostic,
  type DiagnosticSeverity,
} from './diagnosticsStore'

/* ──────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────── */

const store = useDiagnosticsStore

/** Build a minimal diagnostic-without-id with sensible defaults. */
function makeDiag(
  overrides: Partial<Omit<Diagnostic, 'id'>> = {},
): Omit<Diagnostic, 'id'> {
  return {
    filePath: 'a.ts',
    range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 10 },
    severity: 'error',
    message: 'something is wrong',
    source: 'ts',
    ...overrides,
  }
}

/** Convenience: set a batch of diagnostics for a file/source. */
function set(
  filePath: string,
  source: string,
  diags: Array<Partial<Omit<Diagnostic, 'id'>>>,
): void {
  store.getState().setDiagnostics(
    filePath,
    source,
    diags.map((d) => makeDiag({ filePath, source, ...d })),
  )
}

beforeEach(() => {
  // Reset only the data fields of the singleton; keep actions intact.
  // Do NOT use replace:true.
  store.setState({
    diagnosticsByFile: new Map(),
    diagnosticsBySource: new Map(),
    lastUpdateTimestamp: 0,
  })
})

/* ──────────────────────────────────────────────────────────
 * setDiagnostics — per-file / per-source replacement
 * ──────────────────────────────────────────────────────── */

describe('setDiagnostics', () => {
  it('stores diagnostics for a file and assigns ids + filePath + source', () => {
    set('a.ts', 'ts', [{ message: 'm1' }, { message: 'm2' }])
    const diags = store.getState().getDiagnosticsForFile('a.ts')
    expect(diags).toHaveLength(2)
    for (const d of diags) {
      expect(d.id).toMatch(/^diag-/)
      expect(d.filePath).toBe('a.ts')
      expect(d.source).toBe('ts')
    }
    expect(diags.map((d) => d.message)).toEqual(['m1', 'm2'])
  })

  it('replaces only diagnostics from the same source, keeping other sources', () => {
    set('a.ts', 'ts', [{ message: 'ts-1' }, { message: 'ts-2' }])
    set('a.ts', 'eslint', [{ message: 'eslint-1' }])
    expect(store.getState().getDiagnosticsForFile('a.ts')).toHaveLength(3)

    // Replace the ts source with a single new diagnostic.
    set('a.ts', 'ts', [{ message: 'ts-new' }])
    const diags = store.getState().getDiagnosticsForFile('a.ts')
    expect(diags).toHaveLength(2)
    expect(diags.filter((d) => d.source === 'ts').map((d) => d.message)).toEqual([
      'ts-new',
    ])
    expect(diags.filter((d) => d.source === 'eslint')).toHaveLength(1)
  })

  it('deletes the file entry when set with an empty array and no other diagnostics remain', () => {
    set('a.ts', 'ts', [{ message: 'm1' }])
    set('a.ts', 'ts', [])
    expect(store.getState().getDiagnosticsForFile('a.ts')).toEqual([])
    expect(store.getState().getFilesWithDiagnostics()).not.toContain('a.ts')
  })

  it('keeps the file entry when set with empty array but another source still has diagnostics', () => {
    set('a.ts', 'ts', [{ message: 'ts-1' }])
    set('a.ts', 'eslint', [{ message: 'eslint-1' }])
    set('a.ts', 'ts', [])
    const diags = store.getState().getDiagnosticsForFile('a.ts')
    expect(diags).toHaveLength(1)
    expect(diags[0].source).toBe('eslint')
  })

  it('tracks the source in diagnosticsBySource even when set with an empty array', () => {
    // NOTE: pinning current behavior — source registration happens regardless of
    // whether any diagnostics were actually added.
    set('a.ts', 'phantom', [])
    expect(store.getState().getSources()).toContain('phantom')
    // The bySource map records the filePath even though byFile dropped it.
    const bySource = store.getState().diagnosticsBySource.get('phantom')
    expect(bySource?.has('a.ts')).toBe(true)
  })

  it('bumps lastUpdateTimestamp away from the reset value of 0', () => {
    expect(store.getState().lastUpdateTimestamp).toBe(0)
    set('a.ts', 'ts', [{ message: 'm' }])
    expect(store.getState().lastUpdateTimestamp).toBeGreaterThan(0)
  })
})

/* ──────────────────────────────────────────────────────────
 * addDiagnostic / removeDiagnostic
 * ──────────────────────────────────────────────────────── */

describe('addDiagnostic / removeDiagnostic', () => {
  it('appends a single diagnostic and returns its generated id', () => {
    const id = store.getState().addDiagnostic(makeDiag({ filePath: 'b.ts' }))
    expect(id).toMatch(/^diag-/)
    const diags = store.getState().getDiagnosticsForFile('b.ts')
    expect(diags).toHaveLength(1)
    expect(diags[0].id).toBe(id)
  })

  it('appends without removing previous diagnostics on the same file', () => {
    store.getState().addDiagnostic(makeDiag({ filePath: 'b.ts', message: 'first' }))
    store.getState().addDiagnostic(makeDiag({ filePath: 'b.ts', message: 'second' }))
    expect(store.getState().getDiagnosticsForFile('b.ts')).toHaveLength(2)
  })

  it('removes a diagnostic by id', () => {
    const id1 = store.getState().addDiagnostic(makeDiag({ filePath: 'b.ts', message: '1' }))
    store.getState().addDiagnostic(makeDiag({ filePath: 'b.ts', message: '2' }))
    store.getState().removeDiagnostic(id1)
    const diags = store.getState().getDiagnosticsForFile('b.ts')
    expect(diags).toHaveLength(1)
    expect(diags[0].message).toBe('2')
  })

  it('deletes the file entry when the last diagnostic is removed', () => {
    const id = store.getState().addDiagnostic(makeDiag({ filePath: 'b.ts' }))
    store.getState().removeDiagnostic(id)
    expect(store.getState().getFilesWithDiagnostics()).not.toContain('b.ts')
  })

  it('is a no-op when removing an unknown id', () => {
    store.getState().addDiagnostic(makeDiag({ filePath: 'b.ts' }))
    store.getState().removeDiagnostic('does-not-exist')
    expect(store.getState().getDiagnosticsForFile('b.ts')).toHaveLength(1)
  })
})

/* ──────────────────────────────────────────────────────────
 * clearDiagnostics — per file / per source
 * ──────────────────────────────────────────────────────── */

describe('clearDiagnostics', () => {
  it('clears all diagnostics for a file when no source is given', () => {
    set('a.ts', 'ts', [{ message: 'm1' }])
    set('a.ts', 'eslint', [{ message: 'm2' }])
    store.getState().clearDiagnostics('a.ts')
    expect(store.getState().getDiagnosticsForFile('a.ts')).toEqual([])
    expect(store.getState().getFilesWithDiagnostics()).not.toContain('a.ts')
  })

  it('clears only the given source and keeps others', () => {
    set('a.ts', 'ts', [{ message: 'ts-1' }, { message: 'ts-2' }])
    set('a.ts', 'eslint', [{ message: 'eslint-1' }])
    store.getState().clearDiagnostics('a.ts', 'ts')
    const diags = store.getState().getDiagnosticsForFile('a.ts')
    expect(diags).toHaveLength(1)
    expect(diags[0].source).toBe('eslint')
  })

  it('removes the file entry when clearing the last remaining source', () => {
    set('a.ts', 'ts', [{ message: 'm1' }])
    store.getState().clearDiagnostics('a.ts', 'ts')
    expect(store.getState().getFilesWithDiagnostics()).not.toContain('a.ts')
  })

  it('is a no-op for an unknown file', () => {
    set('a.ts', 'ts', [{ message: 'm1' }])
    store.getState().clearDiagnostics('unknown.ts')
    expect(store.getState().getDiagnosticsForFile('a.ts')).toHaveLength(1)
  })
})

/* ──────────────────────────────────────────────────────────
 * clearAllDiagnostics
 * ──────────────────────────────────────────────────────── */

describe('clearAllDiagnostics', () => {
  it('removes everything when called without a source', () => {
    set('a.ts', 'ts', [{ message: 'm1' }])
    set('b.ts', 'eslint', [{ message: 'm2' }])
    store.getState().clearAllDiagnostics()
    expect(store.getState().getAllDiagnostics()).toEqual([])
    expect(store.getState().getFilesWithDiagnostics()).toEqual([])
    expect(store.getState().getSources()).toEqual([])
  })

  it('removes only the given source across all files', () => {
    set('a.ts', 'ts', [{ message: 'ts-a' }])
    set('a.ts', 'eslint', [{ message: 'eslint-a' }])
    set('b.ts', 'ts', [{ message: 'ts-b' }])
    store.getState().clearAllDiagnostics('ts')

    expect(store.getState().getDiagnosticsForFile('a.ts').map((d) => d.source)).toEqual([
      'eslint',
    ])
    // b.ts only had ts diagnostics, so it should be gone entirely.
    expect(store.getState().getFilesWithDiagnostics()).toEqual(['a.ts'])
    expect(store.getState().getSources()).toEqual(['eslint'])
  })
})

/* ──────────────────────────────────────────────────────────
 * Query selectors
 * ──────────────────────────────────────────────────────── */

describe('query selectors', () => {
  beforeEach(() => {
    set('a.ts', 'ts', [
      { message: 'a-err', severity: 'error', range: { startLine: 2, startColumn: 0, endLine: 4, endColumn: 0 } },
      { message: 'a-warn', severity: 'warning', range: { startLine: 10, startColumn: 0, endLine: 10, endColumn: 5 } },
    ])
    set('a.ts', 'eslint', [
      { message: 'a-info', severity: 'info', range: { startLine: 20, startColumn: 0, endLine: 20, endColumn: 5 } },
    ])
    set('b.ts', 'ts', [
      { message: 'b-warn', severity: 'warning', range: { startLine: 1, startColumn: 0, endLine: 1, endColumn: 5 } },
    ])
  })

  it('getDiagnosticsForFile returns [] for an unknown file', () => {
    expect(store.getState().getDiagnosticsForFile('nope.ts')).toEqual([])
  })

  it('getDiagnosticsForFileBySource filters by source', () => {
    expect(store.getState().getDiagnosticsForFileBySource('a.ts', 'ts')).toHaveLength(2)
    expect(store.getState().getDiagnosticsForFileBySource('a.ts', 'eslint')).toHaveLength(1)
    expect(store.getState().getDiagnosticsForFileBySource('a.ts', 'nope')).toEqual([])
  })

  it('getDiagnosticsAtLine matches diagnostics whose range spans the line (inclusive)', () => {
    // a-err spans lines 2-4 inclusive.
    expect(store.getState().getDiagnosticsAtLine('a.ts', 2).map((d) => d.message)).toEqual(['a-err'])
    expect(store.getState().getDiagnosticsAtLine('a.ts', 3).map((d) => d.message)).toEqual(['a-err'])
    expect(store.getState().getDiagnosticsAtLine('a.ts', 4).map((d) => d.message)).toEqual(['a-err'])
    // Line 5 is outside the only multi-line range.
    expect(store.getState().getDiagnosticsAtLine('a.ts', 5)).toEqual([])
    // Line 10 hits the warning.
    expect(store.getState().getDiagnosticsAtLine('a.ts', 10).map((d) => d.message)).toEqual(['a-warn'])
  })

  it('getDiagnosticsInRange uses overlap semantics', () => {
    // Range 3-21 overlaps a-err (2-4), a-warn (10), a-info (20).
    expect(store.getState().getDiagnosticsInRange('a.ts', 3, 21)).toHaveLength(3)
    // Range 5-9 overlaps nothing on a.ts.
    expect(store.getState().getDiagnosticsInRange('a.ts', 5, 9)).toEqual([])
    // Range touching only the end of a-err.
    expect(store.getState().getDiagnosticsInRange('a.ts', 4, 4).map((d) => d.message)).toEqual(['a-err'])
  })

  it('getAllDiagnostics aggregates across every file', () => {
    expect(store.getState().getAllDiagnostics()).toHaveLength(4)
  })

  it('getFilesWithErrors only returns files containing an error', () => {
    // Only a.ts has an error diagnostic.
    expect(store.getState().getFilesWithErrors()).toEqual(['a.ts'])
  })

  it('getFilesWithDiagnostics returns all keys', () => {
    expect(store.getState().getFilesWithDiagnostics().sort()).toEqual(['a.ts', 'b.ts'])
  })
})

/* ──────────────────────────────────────────────────────────
 * Summaries — severity counts / aggregation math
 * ──────────────────────────────────────────────────────── */

describe('summaries and severity counts', () => {
  beforeEach(() => {
    set('a.ts', 'ts', [
      { severity: 'error' },
      { severity: 'error' },
      { severity: 'warning' },
      { severity: 'info' },
      { severity: 'hint' },
    ])
    set('b.ts', 'eslint', [
      { severity: 'error' },
      { severity: 'warning' },
      { severity: 'warning' },
    ])
  })

  it('getFileSummary counts each severity and total correctly', () => {
    const s = store.getState().getFileSummary('a.ts')
    expect(s).toEqual({ errors: 2, warnings: 1, infos: 1, hints: 1, total: 5 })
  })

  it('getFileSummary for an unknown file is all-zero', () => {
    expect(store.getState().getFileSummary('nope.ts')).toEqual({
      errors: 0,
      warnings: 0,
      infos: 0,
      hints: 0,
      total: 0,
    })
  })

  it('getGlobalSummary aggregates across files', () => {
    // a.ts: 2e/1w/1i/1h (total 5) + b.ts: 1e/2w (total 3) = 3e/3w/1i/1h (total 8)
    expect(store.getState().getGlobalSummary()).toEqual({
      errors: 3,
      warnings: 3,
      infos: 1,
      hints: 1,
      total: 8,
    })
  })

  it('getSourceSummary counts only diagnostics from the given source', () => {
    expect(store.getState().getSourceSummary('ts')).toEqual({
      errors: 2,
      warnings: 1,
      infos: 1,
      hints: 1,
      total: 5,
    })
    expect(store.getState().getSourceSummary('eslint')).toEqual({
      errors: 1,
      warnings: 2,
      infos: 0,
      hints: 0,
      total: 3,
    })
  })

  it('getSourceSummary for an unknown source is all-zero', () => {
    expect(store.getState().getSourceSummary('nope')).toEqual({
      errors: 0,
      warnings: 0,
      infos: 0,
      hints: 0,
      total: 0,
    })
  })

  it('total always equals the sum of severity buckets', () => {
    const s = store.getState().getGlobalSummary()
    expect(s.errors + s.warnings + s.infos + s.hints).toBe(s.total)
  })
})

/* ──────────────────────────────────────────────────────────
 * Filtering: by severity / search / sources
 * ──────────────────────────────────────────────────────── */

describe('filtering and search', () => {
  beforeEach(() => {
    set('a.ts', 'ts', [
      { message: 'unused variable foo', severity: 'warning', code: 'no-unused' },
      { message: 'cannot find name bar', severity: 'error', code: 2304 },
    ])
    set('b.ts', 'eslint', [
      { message: 'prefer const', severity: 'info', code: 'prefer-const' },
    ])
  })

  it('getDiagnosticsBySeverity returns only matching severities across files', () => {
    expect(store.getState().getDiagnosticsBySeverity('error').map((d) => d.message)).toEqual([
      'cannot find name bar',
    ])
    expect(store.getState().getDiagnosticsBySeverity('warning')).toHaveLength(1)
    expect(store.getState().getDiagnosticsBySeverity('hint')).toEqual([])
  })

  it('searchDiagnostics matches on message (case-insensitive)', () => {
    expect(store.getState().searchDiagnostics('UNUSED').map((d) => d.message)).toEqual([
      'unused variable foo',
    ])
  })

  it('searchDiagnostics matches on filePath', () => {
    expect(store.getState().searchDiagnostics('b.ts')).toHaveLength(1)
  })

  it('searchDiagnostics matches on source', () => {
    expect(store.getState().searchDiagnostics('eslint').map((d) => d.source)).toEqual([
      'eslint',
    ])
  })

  it('searchDiagnostics matches on numeric code coerced to string', () => {
    const hits = store.getState().searchDiagnostics('2304')
    expect(hits).toHaveLength(1)
    expect(hits[0].message).toBe('cannot find name bar')
  })

  it('getSources lists every registered source', () => {
    expect(store.getState().getSources().sort()).toEqual(['eslint', 'ts'])
  })
})

/* ──────────────────────────────────────────────────────────
 * Navigation
 * ──────────────────────────────────────────────────────── */

describe('navigation', () => {
  beforeEach(() => {
    set('a.ts', 'ts', [
      { message: 'd5', severity: 'error', range: { startLine: 5, startColumn: 0, endLine: 5, endColumn: 0 } },
      { message: 'd10', severity: 'warning', range: { startLine: 10, startColumn: 0, endLine: 10, endColumn: 0 } },
      { message: 'd15', severity: 'error', range: { startLine: 15, startColumn: 0, endLine: 15, endColumn: 0 } },
    ])
  })

  it('getNextDiagnostic returns the first diagnostic strictly after the line', () => {
    expect(store.getState().getNextDiagnostic('a.ts', 6)?.message).toBe('d10')
  })

  it('getNextDiagnostic wraps to the first diagnostic when none is after the line', () => {
    // Past the last line -> wraps to lowest startLine (d5).
    expect(store.getState().getNextDiagnostic('a.ts', 99)?.message).toBe('d5')
  })

  it('getNextDiagnostic respects a severity filter', () => {
    // From line 6, next error is d15 (d10 is a warning and filtered out).
    expect(store.getState().getNextDiagnostic('a.ts', 6, 'error')?.message).toBe('d15')
  })

  it('getNextDiagnostic returns undefined when no diagnostics match the filter', () => {
    expect(store.getState().getNextDiagnostic('a.ts', 0, 'hint')).toBeUndefined()
  })

  it('getPrevDiagnostic returns the first diagnostic strictly before the line', () => {
    expect(store.getState().getPrevDiagnostic('a.ts', 12)?.message).toBe('d10')
  })

  it('getPrevDiagnostic wraps to the highest startLine when none is before the line', () => {
    // Before the first line -> wraps to highest startLine (d15).
    expect(store.getState().getPrevDiagnostic('a.ts', 1)?.message).toBe('d15')
  })

  it('getFirstError returns the first error encountered, scanning files', () => {
    expect(store.getState().getFirstError()?.message).toBe('d5')
  })

  it('getFirstError returns undefined when there are no errors', () => {
    store.getState().clearAllDiagnostics()
    set('a.ts', 'ts', [{ severity: 'warning' }])
    expect(store.getState().getFirstError()).toBeUndefined()
  })
})

/* ──────────────────────────────────────────────────────────
 * Edge cases on an empty store
 * ──────────────────────────────────────────────────────── */

describe('empty-store edge cases', () => {
  it('all aggregate selectors are empty / zero on a fresh store', () => {
    const st = store.getState()
    expect(st.getAllDiagnostics()).toEqual([])
    expect(st.getFilesWithDiagnostics()).toEqual([])
    expect(st.getFilesWithErrors()).toEqual([])
    expect(st.getSources()).toEqual([])
    expect(st.getFirstError()).toBeUndefined()
    expect(st.getGlobalSummary()).toEqual({
      errors: 0,
      warnings: 0,
      infos: 0,
      hints: 0,
      total: 0,
    })
    for (const sev of ['error', 'warning', 'info', 'hint'] as DiagnosticSeverity[]) {
      expect(st.getDiagnosticsBySeverity(sev)).toEqual([])
    }
  })

  it('navigation selectors return undefined on an unknown file', () => {
    expect(store.getState().getNextDiagnostic('nope.ts', 0)).toBeUndefined()
    expect(store.getState().getPrevDiagnostic('nope.ts', 0)).toBeUndefined()
  })
})
