import { create } from 'zustand'

export type ProblemSeverity = 'error' | 'warning' | 'info'

export interface Problem {
  id: string
  severity: ProblemSeverity
  message: string
  file: string
  line: number
  column?: number
  endLine?: number
  endColumn?: number
  source: string
  quickFix?: string
}

export interface ProblemsCount {
  errors: number
  warnings: number
  info: number
}

interface ProblemsStore {
  problems: Problem[]
  scanFile: (path: string, content: string) => void
  clearFile: (path: string) => void
}

/* ── Store ──────────────────────────────────────────────── */

let idCounter = 0

/** Check for mismatched brackets/braces/parens across the file */
function detectBracketMismatches(filePath: string, lines: string[]): Problem[] {
  const problems: Problem[] = []
  const stack: { char: string; line: number; col: number }[] = []
  const openers: Record<string, string> = { '(': ')', '[': ']', '{': '}' }
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    let inString: string | null = null
    let escaped = false

    for (let j = 0; j < line.length; j++) {
      const ch = line[j]

      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }

      // Track string context (skip brackets inside strings)
      if (ch === '"' || ch === "'" || ch === '`') {
        if (inString === ch) { inString = null }
        else if (!inString) { inString = ch }
        continue
      }
      if (inString) continue

      // Skip single-line comments
      if (ch === '/' && j + 1 < line.length && line[j + 1] === '/') break

      if (openers[ch]) {
        stack.push({ char: ch, line: i + 1, col: j + 1 })
      } else if (closers[ch]) {
        if (stack.length === 0) {
          problems.push({
            id: `p-${++idCounter}`,
            file: filePath,
            line: i + 1,
            column: j + 1,
            endColumn: j + 2,
            message: `Unexpected closing '${ch}' with no matching opener`,
            severity: 'error',
            source: 'bracket-matcher',
            quickFix: `Remove the unmatched '${ch}'`,
          })
        } else {
          const top = stack[stack.length - 1]
          if (openers[top.char] !== ch) {
            problems.push({
              id: `p-${++idCounter}`,
              file: filePath,
              line: i + 1,
              column: j + 1,
              endColumn: j + 2,
              message: `Mismatched bracket: expected '${openers[top.char]}' but found '${ch}' (opener at line ${top.line})`,
              severity: 'error',
              source: 'bracket-matcher',
              quickFix: `Replace '${ch}' with '${openers[top.char]}'`,
            })
            stack.pop()
          } else {
            stack.pop()
          }
        }
      }
    }
  }

  // Any remaining unclosed brackets
  for (const item of stack) {
    problems.push({
      id: `p-${++idCounter}`,
      file: filePath,
      line: item.line,
      column: item.col,
      endColumn: item.col + 1,
      message: `Unclosed '${item.char}' - missing closing '${
        item.char === '(' ? ')' : item.char === '[' ? ']' : '}'
      }'`,
      severity: 'error',
      source: 'bracket-matcher',
      quickFix: `Add a closing '${item.char === '(' ? ')' : item.char === '[' ? ']' : '}'}' bracket`,
    })
  }

  return problems
}

/** Detect duplicate function/variable declarations in same scope (top-level only) */
function detectDuplicateNames(filePath: string, lines: string[]): Problem[] {
  const problems: Problem[] = []
  const seen: Record<string, { line: number; kind: string }> = {}

  // Patterns for top-level declarations (approximation: lines starting at indent 0 or 2)
  const funcRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/
  const constRegex = /^(?:export\s+)?(?:const|let|var)\s+(\w+)/
  const classRegex = /^(?:export\s+)?class\s+(\w+)/

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Only consider top-level-ish declarations (no leading whitespace beyond 2 spaces)
    if (/^\s{3,}/.test(line)) continue

    const regexes = [
      { regex: funcRegex, kind: 'function' },
      { regex: constRegex, kind: 'variable' },
      { regex: classRegex, kind: 'class' },
    ]

    for (const { regex, kind } of regexes) {
      const match = line.match(regex)
      if (match) {
        const name = match[1]
        if (seen[name]) {
          problems.push({
            id: `p-${++idCounter}`,
            file: filePath,
            line: i + 1,
            column: line.indexOf(name) + 1,
            endColumn: line.indexOf(name) + 1 + name.length,
            message: `Duplicate ${kind} name '${name}' (first declared at line ${seen[name].line})`,
            severity: 'warning',
            source: 'code-quality',
            quickFix: `Rename one of the '${name}' declarations`,
          })
        } else {
          seen[name] = { line: i + 1, kind }
        }
        break
      }
    }
  }

  return problems
}

/** Detect unused imports (import names not referenced elsewhere in the file) */
function detectUnusedImports(filePath: string, content: string, lines: string[]): Problem[] {
  const problems: Problem[] = []

  // Only run on JS/TS-like files
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  if (!['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return problems

  // Collect all import specifiers
  const importRegex = /^import\s+(?:(?:type\s+)?(\w+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s+['"]/gm
  let match: RegExpExecArray | null

  const importedNames: { name: string; line: number; col: number }[] = []

  while ((match = importRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length

    // Default import
    if (match[1]) {
      const name = match[1]
      const col = match[0].indexOf(name) + 1
      importedNames.push({ name, line: lineNum, col })
    }

    // Named imports
    if (match[2]) {
      const namedImports = match[2].split(',')
      for (const ni of namedImports) {
        const cleaned = ni.trim().replace(/\s+as\s+\w+/, '')
        const aliasMatch = ni.trim().match(/\w+\s+as\s+(\w+)/)
        const name = aliasMatch ? aliasMatch[1] : cleaned.replace(/^type\s+/, '')
        if (name && /^\w+$/.test(name)) {
          importedNames.push({ name, line: lineNum, col: 1 })
        }
      }
    }
  }

  // Check if each imported name is used elsewhere in the file (outside import lines)
  const nonImportContent = lines
    .filter(l => !l.trimStart().startsWith('import '))
    .join('\n')

  for (const imp of importedNames) {
    // Use word boundary regex to check usage
    const usageRegex = new RegExp(`\\b${imp.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (!usageRegex.test(nonImportContent)) {
      problems.push({
        id: `p-${++idCounter}`,
        file: filePath,
        line: imp.line,
        column: imp.col,
        message: `'${imp.name}' is imported but never used`,
        severity: 'warning',
        source: 'imports',
        quickFix: `Remove unused import '${imp.name}'`,
      })
    }
  }

  return problems
}

export const useProblemsStore = create<ProblemsStore>((set) => ({
  problems: [],

  scanFile: (filePath: string, content: string) => {
    if (!content) return

    const problems: Problem[] = []
    const lines = content.split('\n')

    lines.forEach((line, idx) => {
      const lineNum = idx + 1
      const trimmed = line.trim()

      // TODO/FIXME/HACK/BUG/XXX comments
      const todoMatch = trimmed.match(/\/\/\s*(TODO|FIXME|HACK|BUG|XXX)[\s:]+(.+)/i)
      if (todoMatch) {
        const tag = todoMatch[1].toUpperCase()
        const severity: ProblemSeverity = tag === 'FIXME' || tag === 'BUG' ? 'warning' : 'info'
        const col = line.indexOf(todoMatch[0]) + 1
        problems.push({
          id: `p-${++idCounter}`,
          file: filePath,
          line: lineNum,
          column: col > 0 ? col : 1,
          endColumn: col > 0 ? col + todoMatch[0].length : line.length + 1,
          message: `${tag}: ${todoMatch[2].trim()}`,
          severity,
          source: 'todo-scanner',
        })
      }

      // console.log detection (common code smell)
      if (/console\.(log|debug|warn|error|info)\s*\(/.test(trimmed) && !trimmed.startsWith('//')) {
        const consoleMatch = line.match(/console\.\w+/)
        const col = consoleMatch ? line.indexOf(consoleMatch[0]) + 1 : 1
        problems.push({
          id: `p-${++idCounter}`,
          file: filePath,
          line: lineNum,
          column: col,
          endColumn: consoleMatch ? col + consoleMatch[0].length : line.length + 1,
          message: `console.${trimmed.match(/console\.(\w+)/)?.[1] || 'log'} statement found`,
          severity: 'info',
          source: 'code-quality',
          quickFix: 'Remove the console statement before shipping',
        })
      }

      // @ts-ignore / @ts-nocheck / @ts-expect-error
      if (/@ts-(ignore|nocheck|expect-error)/.test(trimmed)) {
        const match = trimmed.match(/@ts-(ignore|nocheck|expect-error)/)
        const tsMatch = line.match(/@ts-(ignore|nocheck|expect-error)/)
        const col = tsMatch ? line.indexOf(tsMatch[0]) + 1 : 1
        problems.push({
          id: `p-${++idCounter}`,
          file: filePath,
          line: lineNum,
          column: col,
          endColumn: tsMatch ? col + tsMatch[0].length : line.length + 1,
          message: `TypeScript check suppressed with @ts-${match?.[1]}`,
          severity: 'warning',
          source: 'typescript',
          quickFix: 'Fix the underlying type error instead of suppressing it',
        })
      }

      // eslint-disable
      if (/eslint-disable/.test(trimmed)) {
        const eslintMatch = line.match(/eslint-disable[\w-]*/)
        const col = eslintMatch ? line.indexOf(eslintMatch[0]) + 1 : 1
        problems.push({
          id: `p-${++idCounter}`,
          file: filePath,
          line: lineNum,
          column: col,
          endColumn: eslintMatch ? col + eslintMatch[0].length : line.length + 1,
          message: 'ESLint rule disabled',
          severity: 'info',
          source: 'eslint',
        })
      }

      // Very long lines (>200 chars)
      if (line.length > 200 && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        problems.push({
          id: `p-${++idCounter}`,
          file: filePath,
          line: lineNum,
          column: 200,
          endColumn: line.length + 1,
          message: `Line is ${line.length} characters long (consider splitting)`,
          severity: 'info',
          source: 'style',
          quickFix: 'Break the line into multiple shorter lines',
        })
      }

      // Debugger statements
      if (/^\s*debugger\s*;?\s*$/.test(line)) {
        const col = line.indexOf('debugger') + 1
        problems.push({
          id: `p-${++idCounter}`,
          file: filePath,
          line: lineNum,
          column: col,
          endColumn: col + 8,
          message: 'Debugger statement found',
          severity: 'warning',
          source: 'code-quality',
          quickFix: 'Remove the debugger statement',
        })
      }

      // Empty catch blocks
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        const catchMatch = line.match(/catch\s*\([^)]*\)\s*\{\s*\}/)
        const col = catchMatch ? line.indexOf(catchMatch[0]) + 1 : 1
        problems.push({
          id: `p-${++idCounter}`,
          file: filePath,
          line: lineNum,
          column: col,
          endColumn: catchMatch ? col + catchMatch[0].length : line.length + 1,
          message: 'Empty catch block',
          severity: 'warning',
          source: 'code-quality',
          quickFix: 'Add error handling or at least log the error',
        })
      }
    })

    // ── Advanced matchers (file-level analysis) ──────────────────

    // Bracket mismatch detection
    problems.push(...detectBracketMismatches(filePath, lines))

    // Duplicate top-level names
    problems.push(...detectDuplicateNames(filePath, lines))

    // Unused imports
    problems.push(...detectUnusedImports(filePath, content, lines))

    set((state) => ({
      problems: [
        ...state.problems.filter((p) => p.file !== filePath),
        ...problems,
      ],
    }))

    // Dispatch event so TabBar and other consumers can react to marker changes
    window.dispatchEvent(new CustomEvent('orion:markers-changed', {
      detail: { file: filePath, problems },
    }))
  },

  clearFile: (path: string) => {
    set((state) => ({
      problems: state.problems.filter((p) => p.file !== path),
    }))
    window.dispatchEvent(new CustomEvent('orion:markers-changed', {
      detail: { file: path, problems: [] },
    }))
  },
}))

/* ── Selectors ─────────────────────────────────────────── */

export function getProblemsCount(problems: Problem[]): ProblemsCount {
  let errors = 0
  let warnings = 0
  let info = 0
  for (const p of problems) {
    if (p.severity === 'error') errors++
    else if (p.severity === 'warning') warnings++
    else info++
  }
  return { errors, warnings, info }
}

export function getProblemsForFile(problems: Problem[], path: string): Problem[] {
  return problems.filter((p) => p.file === path)
}
