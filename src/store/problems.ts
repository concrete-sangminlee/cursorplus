import { create } from 'zustand'

export type ProblemSeverity = 'error' | 'warning' | 'info'

export interface Problem {
  id: string
  severity: ProblemSeverity
  message: string
  file: string
  line: number
}

interface ProblemsStore {
  problems: Problem[]
  scanFile: (path: string, content: string) => void
  clearFile: (path: string) => void
}

/* ── Pattern rules ──────────────────────────────────────── */

interface Rule {
  pattern: RegExp
  severity: ProblemSeverity
  message: (match: RegExpMatchArray) => string
}

const rules: Rule[] = [
  {
    pattern: /\/\/\s*TODO\b[:\s]*(.*)/i,
    severity: 'info',
    message: (m) => `TODO: ${m[1]?.trim() || '(no description)'}`,
  },
  {
    pattern: /\/\/\s*FIXME\b[:\s]*(.*)/i,
    severity: 'info',
    message: (m) => `FIXME: ${m[1]?.trim() || '(no description)'}`,
  },
  {
    pattern: /console\.log\s*\(/,
    severity: 'warning',
    message: () => 'Unexpected console.log statement',
  },
  {
    pattern: /console\.error\s*\(/,
    severity: 'warning',
    message: () => 'Unexpected console.error statement',
  },
  {
    pattern: /console\.warn\s*\(/,
    severity: 'warning',
    message: () => 'Unexpected console.warn statement',
  },
  {
    pattern: /\/\/\s*@ts-ignore/,
    severity: 'warning',
    message: () => '@ts-ignore suppresses type checking',
  },
  {
    pattern: /\/\/\s*@ts-expect-error/,
    severity: 'warning',
    message: () => '@ts-expect-error suppresses type checking',
  },
  {
    pattern: /\/\/\s*eslint-disable/,
    severity: 'warning',
    message: () => 'eslint-disable suppresses linting',
  },
  {
    pattern: /\/\*\s*eslint-disable/,
    severity: 'warning',
    message: () => 'eslint-disable suppresses linting',
  },
]

/* ── Store ──────────────────────────────────────────────── */

let idCounter = 0

export const useProblemsStore = create<ProblemsStore>((set) => ({
  problems: [],

  scanFile: (path: string, content: string) => {
    const found: Problem[] = []
    const lines = content.split('\n')

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      for (const rule of rules) {
        const match = line.match(rule.pattern)
        if (match) {
          found.push({
            id: `p-${++idCounter}`,
            severity: rule.severity,
            message: rule.message(match),
            file: path,
            line: i + 1,
          })
        }
      }
    }

    set((state) => ({
      problems: [
        ...state.problems.filter((p) => p.file !== path),
        ...found,
      ],
    }))
  },

  clearFile: (path: string) =>
    set((state) => ({
      problems: state.problems.filter((p) => p.file !== path),
    })),
}))
