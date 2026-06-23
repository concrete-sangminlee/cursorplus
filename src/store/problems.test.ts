/** @vitest-environment jsdom */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  useProblemsStore,
  getProblemsCount,
  getProblemsForFile,
  type Problem,
} from './problems'

/* ──────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────── */

const store = useProblemsStore

/** Scan a snippet under a default .ts path and return only that file's problems. */
function scan(content: string, path = 'foo.ts'): Problem[] {
  store.getState().scanFile(path, content)
  return getProblemsForFile(store.getState().problems, path)
}

/** Filter problems emitted by a particular source. */
function bySource(problems: Problem[], source: string): Problem[] {
  return problems.filter((p) => p.source === source)
}

beforeEach(() => {
  // Reset the singleton's data field. Do NOT use replace:true — keeps actions intact.
  store.setState({ problems: [] })
})

describe('useProblemsStore.scanFile — TODO/FIXME/HACK comment scanning', () => {
  it('detects // TODO with a colon and classifies it as info', () => {
    const problems = bySource(scan('// TODO: refactor this loop'), 'todo-scanner')
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({
      severity: 'info',
      message: 'TODO: refactor this loop',
      source: 'todo-scanner',
      line: 1,
    })
  })

  it('detects //TODO with no space after the slashes (space optional)', () => {
    const problems = bySource(scan('//TODO fix the spacing'), 'todo-scanner')
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toBe('TODO: fix the spacing')
  })

  it('classifies FIXME and BUG as warning, HACK/XXX/TODO as info', () => {
    const content = [
      '// TODO a',
      '// FIXME b',
      '// HACK c',
      '// BUG d',
      '// XXX e',
    ].join('\n')
    const problems = bySource(scan(content), 'todo-scanner')
    const sev = Object.fromEntries(
      problems.map((p) => [p.message.split(':')[0], p.severity]),
    )
    expect(sev).toEqual({
      TODO: 'info',
      FIXME: 'warning',
      HACK: 'info',
      BUG: 'warning',
      XXX: 'info',
    })
  })

  it('is case-insensitive on the tag but normalizes the tag to uppercase', () => {
    const problems = bySource(scan('// todo: lowercase tag'), 'todo-scanner')
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toBe('TODO: lowercase tag')
  })

  it('accepts whitespace (not just colon) as the separator after the tag', () => {
    const problems = bySource(scan('// FIXME   broken without a colon'), 'todo-scanner')
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toBe('FIXME: broken without a colon')
  })

  it('does NOT match the bare word "todo" inside a string with no // comment', () => {
    const problems = bySource(scan('const label = "todo list app"'), 'todo-scanner')
    expect(problems).toHaveLength(0)
  })

  it('does NOT match a TODO tag with no trailing message text', () => {
    // regex requires [\s:]+(.+) — a tag with nothing after it fails to match.
    const problems = bySource(scan('// TODO'), 'todo-scanner')
    expect(problems).toHaveLength(0)
  })

  it('matches a trailing // TODO comment after code and reports a column > 1', () => {
    const problems = bySource(scan('doWork() // TODO: clean up'), 'todo-scanner')
    expect(problems).toHaveLength(1)
    // column points at the start of the matched "// TODO..." segment, not col 1
    expect(problems[0].column).toBeGreaterThan(1)
    expect(problems[0].message).toBe('TODO: clean up')
  })

  it('does NOT detect block-comment style /* HACK */ (current behavior, regex is // only)', () => {
    // Documents a known limitation: the scanner only recognizes line comments.
    const problems = bySource(scan('/* HACK: this should arguably be flagged */'), 'todo-scanner')
    expect(problems).toHaveLength(0)
  })
})

describe('useProblemsStore.scanFile — other line-level matchers', () => {
  it('flags console.log calls as info but ignores commented-out console calls', () => {
    const content = [
      'console.log("hi")',
      '// console.log("commented out")',
    ].join('\n')
    const problems = bySource(scan(content), 'code-quality').filter((p) =>
      p.message.includes('console'),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ severity: 'info', line: 1 })
    expect(problems[0].message).toBe('console.log statement found')
  })

  it('reports the specific console method name in the message', () => {
    const problems = bySource(scan('console.warn("careful")'), 'code-quality').filter((p) =>
      p.message.includes('console'),
    )
    expect(problems[0].message).toBe('console.warn statement found')
  })

  it('flags @ts-ignore / @ts-expect-error as warning from the typescript source', () => {
    const content = ['// @ts-ignore', '// @ts-expect-error reason'].join('\n')
    const problems = bySource(scan(content), 'typescript')
    expect(problems).toHaveLength(2)
    expect(problems.map((p) => p.severity)).toEqual(['warning', 'warning'])
    expect(problems[0].message).toContain('@ts-ignore')
    expect(problems[1].message).toContain('@ts-expect-error')
  })

  it('flags eslint-disable as info', () => {
    const problems = bySource(scan('// eslint-disable-next-line no-console'), 'eslint')
    expect(problems).toHaveLength(1)
    expect(problems[0].severity).toBe('info')
  })

  it('flags very long (>200 char) code lines but not long comment lines', () => {
    const longCode = 'const x = "' + 'a'.repeat(220) + '"'
    const longComment = '// ' + 'b'.repeat(220)
    const problems = bySource(scan([longCode, longComment].join('\n')), 'style')
    expect(problems).toHaveLength(1)
    expect(problems[0].line).toBe(1)
    expect(problems[0].message).toMatch(/characters long/)
  })

  it('flags a standalone debugger statement as warning', () => {
    const problems = scan('  debugger;').filter((p) => p.message === 'Debugger statement found')
    expect(problems).toHaveLength(1)
    expect(problems[0].severity).toBe('warning')
  })

  it('flags an empty catch block as warning', () => {
    const problems = scan('try { risky() } catch (e) {}').filter(
      (p) => p.message === 'Empty catch block',
    )
    expect(problems).toHaveLength(1)
    expect(problems[0].severity).toBe('warning')
  })
})

describe('useProblemsStore.scanFile — bracket mismatch detection', () => {
  it('produces no bracket problems for balanced brackets', () => {
    const problems = bySource(scan('function f() { return [1, 2, 3] }'), 'bracket-matcher')
    expect(problems).toHaveLength(0)
  })

  it('reports an unexpected closing bracket with no opener', () => {
    const problems = bySource(scan('foo)'), 'bracket-matcher')
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toContain("Unexpected closing ')'")
    expect(problems[0].severity).toBe('error')
  })

  it('reports an unclosed opener at end of file', () => {
    const problems = bySource(scan('function f() {'), 'bracket-matcher')
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toContain("Unclosed '{'")
  })

  it('reports a mismatched bracket pairing', () => {
    const problems = bySource(scan('foo(]'), 'bracket-matcher')
    const mismatch = problems.find((p) => p.message.includes('Mismatched bracket'))
    expect(mismatch).toBeDefined()
    expect(mismatch!.message).toContain("expected ')' but found ']'")
  })

  it('ignores brackets inside string literals', () => {
    const problems = bySource(scan('const s = "a ) b ] c }"'), 'bracket-matcher')
    expect(problems).toHaveLength(0)
  })

  it('ignores brackets after a // line comment', () => {
    const problems = bySource(scan('const x = 1 // closing ) ] } here'), 'bracket-matcher')
    expect(problems).toHaveLength(0)
  })
})

describe('useProblemsStore.scanFile — duplicate top-level names', () => {
  it('flags a duplicate top-level function declaration as a warning', () => {
    const content = ['function foo() {}', 'function foo() {}'].join('\n')
    const problems = bySource(scan(content), 'code-quality').filter((p) =>
      p.message.includes('Duplicate'),
    )
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ severity: 'warning', line: 2 })
    expect(problems[0].message).toContain("Duplicate function name 'foo'")
    expect(problems[0].message).toContain('first declared at line 1')
  })

  it('does NOT flag deeply-indented (non-top-level) declarations', () => {
    // 4-space indent matches /^\s{3,}/ and is skipped.
    const content = [
      'const a = () => {',
      '    const dup = 1',
      '    const dup = 2',
      '}',
    ].join('\n')
    const problems = bySource(scan(content), 'code-quality').filter((p) =>
      p.message.includes('Duplicate'),
    )
    expect(problems).toHaveLength(0)
  })
})

describe('useProblemsStore.scanFile — unused imports', () => {
  it('flags an imported-but-unused default import in a .ts file', () => {
    const content = ['import foo from "bar"', 'const x = 1'].join('\n')
    const problems = bySource(scan(content), 'imports')
    expect(problems).toHaveLength(1)
    expect(problems[0].message).toBe("'foo' is imported but never used")
    expect(problems[0].severity).toBe('warning')
  })

  it('does NOT flag an import that is referenced later', () => {
    const content = ['import foo from "bar"', 'foo()'].join('\n')
    const problems = bySource(scan(content), 'imports')
    expect(problems).toHaveLength(0)
  })

  it('handles named imports and aliases', () => {
    const content = ['import { a, b as c } from "m"', 'console.log(a)'].join('\n')
    const problems = bySource(scan(content), 'imports')
    // a is used, c (alias of b) is unused
    expect(problems.map((p) => p.message)).toEqual([
      "'c' is imported but never used",
    ])
  })

  it('does NOT run unused-import analysis on non JS/TS files', () => {
    const content = ['import foo from "bar"', 'noop'].join('\n')
    const problems = bySource(scan(content, 'styles.css'), 'imports')
    expect(problems).toHaveLength(0)
  })
})

describe('useProblemsStore — state mutation, replacement and clearing', () => {
  it('returns early and adds nothing for empty content', () => {
    store.getState().scanFile('empty.ts', '')
    expect(store.getState().problems).toHaveLength(0)
  })

  it('replaces previous problems for the same file on re-scan', () => {
    scan('// TODO: first', 'a.ts')
    expect(getProblemsForFile(store.getState().problems, 'a.ts')).toHaveLength(1)

    // Re-scan with clean content — old problems for a.ts should be gone.
    store.getState().scanFile('a.ts', 'const ok = 1')
    expect(getProblemsForFile(store.getState().problems, 'a.ts')).toHaveLength(0)
  })

  it('keeps problems from other files when scanning one file', () => {
    scan('// TODO: in a', 'a.ts')
    scan('// FIXME: in b', 'b.ts')
    expect(getProblemsForFile(store.getState().problems, 'a.ts')).toHaveLength(1)
    expect(getProblemsForFile(store.getState().problems, 'b.ts')).toHaveLength(1)

    // Re-scanning a.ts must not disturb b.ts
    store.getState().scanFile('a.ts', 'const ok = 1')
    expect(getProblemsForFile(store.getState().problems, 'a.ts')).toHaveLength(0)
    expect(getProblemsForFile(store.getState().problems, 'b.ts')).toHaveLength(1)
  })

  it('clearFile removes only the targeted file', () => {
    scan('// TODO: in a', 'a.ts')
    scan('// TODO: in b', 'b.ts')
    store.getState().clearFile('a.ts')
    expect(getProblemsForFile(store.getState().problems, 'a.ts')).toHaveLength(0)
    expect(getProblemsForFile(store.getState().problems, 'b.ts')).toHaveLength(1)
  })

  it('assigns unique ids across all generated problems', () => {
    const problems = scan(
      ['// TODO: t', 'console.log(1)', '// @ts-ignore'].join('\n'),
    )
    const ids = problems.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => id.startsWith('p-'))).toBe(true)
  })
})

describe('useProblemsStore — event dispatching', () => {
  let received: Array<{ file: string; problems: Problem[] }>
  let handler: (e: Event) => void

  beforeEach(() => {
    received = []
    handler = (e: Event) => received.push((e as CustomEvent).detail)
    window.addEventListener('orion:markers-changed', handler)
  })

  afterEach(() => {
    window.removeEventListener('orion:markers-changed', handler)
  })

  it('dispatches orion:markers-changed with the scanned problems on scanFile', () => {
    scan('// TODO: notify me', 'notify.ts')
    expect(received).toHaveLength(1)
    expect(received[0].file).toBe('notify.ts')
    expect(received[0].problems.length).toBeGreaterThan(0)
  })

  it('dispatches orion:markers-changed with an empty list on clearFile', () => {
    store.getState().clearFile('notify.ts')
    expect(received).toHaveLength(1)
    expect(received[0]).toEqual({ file: 'notify.ts', problems: [] })
  })

  it('does NOT dispatch when scanFile is called with empty content', () => {
    const spy = vi.fn()
    window.addEventListener('orion:markers-changed', spy)
    store.getState().scanFile('x.ts', '')
    window.removeEventListener('orion:markers-changed', spy)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('getProblemsCount selector', () => {
  const mk = (severity: Problem['severity']): Problem => ({
    id: `id-${Math.random()}`,
    severity,
    message: 'm',
    file: 'f.ts',
    line: 1,
    source: 's',
  })

  it('groups counts by severity', () => {
    const count = getProblemsCount([
      mk('error'),
      mk('error'),
      mk('warning'),
      mk('info'),
    ])
    expect(count).toEqual({ errors: 2, warnings: 1, info: 1 })
  })

  it('returns all zeros for an empty list', () => {
    expect(getProblemsCount([])).toEqual({ errors: 0, warnings: 0, info: 0 })
  })

  it('counts an unrecognized severity as info (else branch)', () => {
    // Documents current behavior: the else branch buckets anything non-error/
    // non-warning into info.
    const weird = { ...mk('info'), severity: 'fatal' as unknown as Problem['severity'] }
    expect(getProblemsCount([weird])).toEqual({ errors: 0, warnings: 0, info: 1 })
  })
})

describe('getProblemsForFile selector', () => {
  it('returns only problems matching the given path', () => {
    const problems: Problem[] = [
      { id: '1', severity: 'error', message: 'a', file: 'x.ts', line: 1, source: 's' },
      { id: '2', severity: 'info', message: 'b', file: 'y.ts', line: 1, source: 's' },
    ]
    expect(getProblemsForFile(problems, 'x.ts')).toHaveLength(1)
    expect(getProblemsForFile(problems, 'x.ts')[0].id).toBe('1')
    expect(getProblemsForFile(problems, 'z.ts')).toHaveLength(0)
  })
})
