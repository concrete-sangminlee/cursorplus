/**
 * Snippet template parser and expander.
 * Handles VS Code-style snippet syntax with tabstops,
 * placeholders, choices, variables, and transforms.
 */

/* ── Types ─────────────────────────────────────────────── */

export type SnippetToken =
  | { type: 'text'; value: string }
  | { type: 'tabstop'; index: number }
  | { type: 'placeholder'; index: number; children: SnippetToken[] }
  | { type: 'choice'; index: number; options: string[] }
  | { type: 'variable'; name: string; default?: SnippetToken[]; transform?: SnippetTransform }
  | { type: 'transform'; index: number; regex: string; replacement: string; flags: string }

export interface SnippetTransform {
  regex: string
  replacement: string
  flags: string
}

export interface ParsedSnippet {
  tokens: SnippetToken[]
  tabstopCount: number
  variables: string[]
  hasChoices: boolean
}

export interface SnippetSession {
  id: string
  snippet: ParsedSnippet
  currentTabstop: number
  tabstopValues: Map<number, string>
  variableValues: Map<string, string>
  insertPosition: { line: number; column: number }
  endPosition: { line: number; column: number }
  isActive: boolean
}

export interface SnippetExpansion {
  text: string
  tabstops: TabstopRange[]
  finalCursorOffset: number
}

export interface TabstopRange {
  index: number
  startOffset: number
  endOffset: number
  placeholder: string
  choices?: string[]
  isChoice: boolean
}

/* ── Snippet Variables ────────────────────────────────── */

export type SnippetVariableResolver = (name: string) => string | undefined

const BUILT_IN_VARIABLES: Record<string, (ctx: SnippetContext) => string> = {
  // Selection
  TM_SELECTED_TEXT: (ctx) => ctx.selectedText || '',
  TM_CURRENT_LINE: (ctx) => ctx.currentLine || '',
  TM_CURRENT_WORD: (ctx) => ctx.currentWord || '',

  // File
  TM_FILENAME: (ctx) => ctx.fileName || 'untitled',
  TM_FILENAME_BASE: (ctx) => (ctx.fileName || 'untitled').replace(/\.[^.]+$/, ''),
  TM_DIRECTORY: (ctx) => ctx.directory || '',
  TM_FILEPATH: (ctx) => ctx.filePath || '',
  RELATIVE_FILEPATH: (ctx) => ctx.relativePath || ctx.filePath || '',
  WORKSPACE_NAME: (ctx) => ctx.workspaceName || 'workspace',
  WORKSPACE_FOLDER: (ctx) => ctx.workspaceFolder || '',

  // Date/Time
  CURRENT_YEAR: () => new Date().getFullYear().toString(),
  CURRENT_YEAR_SHORT: () => new Date().getFullYear().toString().slice(2),
  CURRENT_MONTH: () => String(new Date().getMonth() + 1).padStart(2, '0'),
  CURRENT_MONTH_NAME: () => new Date().toLocaleString('en', { month: 'long' }),
  CURRENT_MONTH_NAME_SHORT: () => new Date().toLocaleString('en', { month: 'short' }),
  CURRENT_DATE: () => String(new Date().getDate()).padStart(2, '0'),
  CURRENT_DAY_NAME: () => new Date().toLocaleString('en', { weekday: 'long' }),
  CURRENT_DAY_NAME_SHORT: () => new Date().toLocaleString('en', { weekday: 'short' }),
  CURRENT_HOUR: () => String(new Date().getHours()).padStart(2, '0'),
  CURRENT_MINUTE: () => String(new Date().getMinutes()).padStart(2, '0'),
  CURRENT_SECOND: () => String(new Date().getSeconds()).padStart(2, '0'),
  CURRENT_SECONDS_UNIX: () => Math.floor(Date.now() / 1000).toString(),
  CURRENT_TIMEZONE_OFFSET: () => {
    const offset = new Date().getTimezoneOffset()
    const sign = offset <= 0 ? '+' : '-'
    const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0')
    const mins = String(Math.abs(offset) % 60).padStart(2, '0')
    return `${sign}${hours}:${mins}`
  },

  // Random
  RANDOM: () => Math.random().toString().slice(2, 8),
  RANDOM_HEX: () => Math.random().toString(16).slice(2, 8),
  UUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
  },

  // Comment
  BLOCK_COMMENT_START: (ctx) => ctx.blockCommentStart || '/*',
  BLOCK_COMMENT_END: (ctx) => ctx.blockCommentEnd || '*/',
  LINE_COMMENT: (ctx) => ctx.lineComment || '//',

  // Clipboard
  CLIPBOARD: (ctx) => ctx.clipboard || '',

  // Cursor
  CURSOR_INDEX: (ctx) => String(ctx.cursorLine || 0),
  CURSOR_NUMBER: (ctx) => String((ctx.cursorLine || 0) + 1),
}

export interface SnippetContext {
  selectedText?: string
  currentLine?: string
  currentWord?: string
  fileName?: string
  directory?: string
  filePath?: string
  relativePath?: string
  workspaceName?: string
  workspaceFolder?: string
  clipboard?: string
  cursorLine?: number
  blockCommentStart?: string
  blockCommentEnd?: string
  lineComment?: string
  languageId?: string
  indentation?: string
}

/* ── Parser ───────────────────────────────────────────── */

export function parseSnippet(body: string): ParsedSnippet {
  const tokens = parseTokens(body, 0).tokens
  const tabstops = new Set<number>()
  const variables = new Set<string>()
  let hasChoices = false

  function walk(tokens: SnippetToken[]): void {
    for (const token of tokens) {
      switch (token.type) {
        case 'tabstop':
          tabstops.add(token.index)
          break
        case 'placeholder':
          tabstops.add(token.index)
          walk(token.children)
          break
        case 'choice':
          tabstops.add(token.index)
          hasChoices = true
          break
        case 'variable':
          variables.add(token.name)
          if (token.default) walk(token.default)
          break
        case 'transform':
          tabstops.add(token.index)
          break
      }
    }
  }

  walk(tokens)

  return {
    tokens,
    tabstopCount: tabstops.size,
    variables: [...variables],
    hasChoices,
  }
}

function parseTokens(input: string, depth: number): { tokens: SnippetToken[]; consumed: number } {
  const tokens: SnippetToken[] = []
  let i = 0
  let textBuffer = ''

  function flushText(): void {
    if (textBuffer) {
      tokens.push({ type: 'text', value: textBuffer })
      textBuffer = ''
    }
  }

  while (i < input.length) {
    const ch = input[i]

    // Escape sequences
    if (ch === '\\' && i + 1 < input.length) {
      const next = input[i + 1]
      if ('${}\\|,'.includes(next)) {
        textBuffer += next
        i += 2
        continue
      }
    }

    // End of placeholder/choice scope
    if (ch === '}' && depth > 0) {
      flushText()
      return { tokens, consumed: i }
    }

    // Dollar sign - start of tabstop/variable
    if (ch === '$') {
      flushText()

      // $0, $1, etc.
      if (i + 1 < input.length && /\d/.test(input[i + 1])) {
        let numStr = ''
        let j = i + 1
        while (j < input.length && /\d/.test(input[j])) {
          numStr += input[j]
          j++
        }
        tokens.push({ type: 'tabstop', index: parseInt(numStr) })
        i = j
        continue
      }

      // ${...}
      if (i + 1 < input.length && input[i + 1] === '{') {
        const result = parseDollarBrace(input, i + 2, depth + 1)
        tokens.push(result.token)
        i = result.end + 1
        continue
      }

      // $VARIABLE_NAME
      if (i + 1 < input.length && /[a-zA-Z_]/.test(input[i + 1])) {
        let name = ''
        let j = i + 1
        while (j < input.length && /[a-zA-Z_0-9]/.test(input[j])) {
          name += input[j]
          j++
        }
        tokens.push({ type: 'variable', name })
        i = j
        continue
      }

      textBuffer += '$'
      i++
      continue
    }

    // Choice separator
    if (ch === '|' && depth > 0) {
      flushText()
      return { tokens, consumed: i }
    }

    textBuffer += ch
    i++
  }

  flushText()
  return { tokens, consumed: i }
}

function parseDollarBrace(input: string, start: number, depth: number): { token: SnippetToken; end: number } {
  let i = start

  // Check if it starts with a number (tabstop/placeholder/choice/transform)
  if (/\d/.test(input[i])) {
    let numStr = ''
    while (i < input.length && /\d/.test(input[i])) {
      numStr += input[i]
      i++
    }
    const index = parseInt(numStr)

    // Simple tabstop: ${1}
    if (input[i] === '}') {
      return { token: { type: 'tabstop', index }, end: i }
    }

    // Choice: ${1|one,two,three|}
    if (input[i] === '|') {
      i++
      const options: string[] = []
      let opt = ''
      while (i < input.length && !(input[i] === '|' && input[i + 1] === '}')) {
        if (input[i] === ',' && input[i - 1] !== '\\') {
          options.push(opt)
          opt = ''
        } else {
          opt += input[i]
        }
        i++
      }
      if (opt) options.push(opt)
      if (input[i] === '|') i++ // skip |
      return { token: { type: 'choice', index, options }, end: i }
    }

    // Transform: ${1/regex/replacement/flags}
    if (input[i] === '/') {
      i++
      let regex = '', replacement = '', flags = ''
      let part = 0

      while (i < input.length && input[i] !== '}') {
        if (input[i] === '/' && input[i - 1] !== '\\') {
          part++
          i++
          continue
        }
        if (part === 0) regex += input[i]
        else if (part === 1) replacement += input[i]
        else flags += input[i]
        i++
      }

      return { token: { type: 'transform', index, regex, replacement, flags }, end: i }
    }

    // Placeholder: ${1:default text}
    if (input[i] === ':') {
      i++
      const result = parseTokens(input.slice(i), depth)
      const end = i + result.consumed
      return { token: { type: 'placeholder', index, children: result.tokens }, end }
    }

    return { token: { type: 'tabstop', index }, end: i }
  }

  // Variable: ${VARIABLE_NAME} or ${VARIABLE_NAME:default} or ${VARIABLE_NAME/regex/replacement/flags}
  if (/[a-zA-Z_]/.test(input[i])) {
    let name = ''
    while (i < input.length && /[a-zA-Z_0-9]/.test(input[i])) {
      name += input[i]
      i++
    }

    // Simple variable: ${VAR}
    if (input[i] === '}') {
      return { token: { type: 'variable', name }, end: i }
    }

    // Variable with default: ${VAR:default}
    if (input[i] === ':') {
      i++
      const result = parseTokens(input.slice(i), depth)
      const end = i + result.consumed
      return { token: { type: 'variable', name, default: result.tokens }, end }
    }

    // Variable with transform: ${VAR/regex/replacement/flags}
    if (input[i] === '/') {
      i++
      let regex = '', replacement = '', flags = ''
      let part = 0

      while (i < input.length && input[i] !== '}') {
        if (input[i] === '/' && input[i - 1] !== '\\') {
          part++
          i++
          continue
        }
        if (part === 0) regex += input[i]
        else if (part === 1) replacement += input[i]
        else flags += input[i]
        i++
      }

      return {
        token: { type: 'variable', name, transform: { regex, replacement, flags } },
        end: i,
      }
    }

    return { token: { type: 'variable', name }, end: i }
  }

  // Fallback
  return { token: { type: 'text', value: '' }, end: i }
}

/* ── Expansion ────────────────────────────────────────── */

export function expandSnippet(
  snippet: ParsedSnippet,
  context: SnippetContext,
  tabstopValues?: Map<number, string>
): SnippetExpansion {
  const values = tabstopValues || new Map<number, string>()
  const tabstops: TabstopRange[] = []
  let offset = 0

  function resolveVariable(name: string): string {
    const resolver = BUILT_IN_VARIABLES[name]
    if (resolver) return resolver(context)
    return ''
  }

  function expandTokens(tokens: SnippetToken[]): string {
    let result = ''

    for (const token of tokens) {
      switch (token.type) {
        case 'text':
          result += token.value
          offset += token.value.length
          break

        case 'tabstop': {
          const value = values.get(token.index) || ''
          const startOffset = offset
          result += value
          offset += value.length
          tabstops.push({
            index: token.index,
            startOffset,
            endOffset: offset,
            placeholder: value,
            isChoice: false,
          })
          break
        }

        case 'placeholder': {
          const existingValue = values.get(token.index)
          const startOffset = offset
          if (existingValue !== undefined) {
            result += existingValue
            offset += existingValue.length
          } else {
            const defaultText = expandTokens(token.children)
            result += defaultText
            values.set(token.index, defaultText)
          }
          tabstops.push({
            index: token.index,
            startOffset,
            endOffset: offset,
            placeholder: values.get(token.index) || '',
            isChoice: false,
          })
          break
        }

        case 'choice': {
          const value = values.get(token.index) || token.options[0] || ''
          const startOffset = offset
          result += value
          offset += value.length
          tabstops.push({
            index: token.index,
            startOffset,
            endOffset: offset,
            placeholder: value,
            choices: token.options,
            isChoice: true,
          })
          break
        }

        case 'variable': {
          let value = resolveVariable(token.name)
          if (!value && token.default) {
            value = expandTokens(token.default)
          }
          if (token.transform) {
            try {
              const re = new RegExp(token.transform.regex, token.transform.flags)
              value = value.replace(re, token.transform.replacement)
            } catch { /* ignore bad regex */ }
          }
          result += value
          offset += value.length
          break
        }

        case 'transform': {
          const source = values.get(token.index) || ''
          let value = source
          try {
            const re = new RegExp(token.regex, token.flags)
            value = source.replace(re, token.replacement)
          } catch { /* ignore bad regex */ }
          result += value
          offset += value.length
          break
        }
      }
    }

    return result
  }

  const text = expandTokens(snippet.tokens)

  // Apply indentation
  const indentedText = applyIndentation(text, context.indentation || '')

  // Find $0 position (final cursor)
  const finalTabstop = tabstops.find(t => t.index === 0)
  const finalCursorOffset = finalTabstop?.startOffset ?? text.length

  // Sort tabstops by index (0 is always last)
  tabstops.sort((a, b) => {
    if (a.index === 0) return 1
    if (b.index === 0) return -1
    return a.index - b.index
  })

  return { text: indentedText, tabstops, finalCursorOffset }
}

function applyIndentation(text: string, baseIndent: string): string {
  if (!baseIndent) return text
  const lines = text.split('\n')
  return lines.map((line, i) => i === 0 ? line : baseIndent + line).join('\n')
}

/* ── Snippet Session Manager ──────────────────────────── */

export class SnippetSessionManager {
  private sessions: Map<string, SnippetSession> = new Map()

  createSession(
    snippetBody: string,
    context: SnippetContext,
    insertPosition: { line: number; column: number }
  ): SnippetSession {
    const id = `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const parsed = parseSnippet(snippetBody)
    const expansion = expandSnippet(parsed, context)

    const session: SnippetSession = {
      id,
      snippet: parsed,
      currentTabstop: 1,
      tabstopValues: new Map(),
      variableValues: new Map(),
      insertPosition,
      endPosition: { line: insertPosition.line, column: insertPosition.column + expansion.text.length },
      isActive: true,
    }

    this.sessions.set(id, session)
    return session
  }

  nextTabstop(sessionId: string): number | null {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) return null

    session.currentTabstop++
    if (session.currentTabstop > session.snippet.tabstopCount) {
      session.currentTabstop = 0
      session.isActive = false
    }

    return session.currentTabstop
  }

  previousTabstop(sessionId: string): number | null {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) return null

    session.currentTabstop = Math.max(1, session.currentTabstop - 1)
    return session.currentTabstop
  }

  setTabstopValue(sessionId: string, index: number, value: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.tabstopValues.set(index, value)
  }

  finishSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.isActive = false
      session.currentTabstop = 0
    }
  }

  cancelSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  getActiveSession(): SnippetSession | undefined {
    for (const session of this.sessions.values()) {
      if (session.isActive) return session
    }
    return undefined
  }

  hasActiveSession(): boolean {
    return !!this.getActiveSession()
  }

  clear(): void {
    this.sessions.clear()
  }
}

export const snippetSessionManager = new SnippetSessionManager()

/* ── VS Code Snippet Format Converter ─────────────────── */

export function convertVSCodeSnippet(vsCodeBody: string | string[]): string {
  if (Array.isArray(vsCodeBody)) {
    return vsCodeBody.join('\n')
  }
  return vsCodeBody
}

export function parseVSCodeSnippetFile(json: string): Map<string, { prefix: string; body: string; description: string }> {
  const result = new Map<string, { prefix: string; body: string; description: string }>()

  try {
    const data = JSON.parse(json)
    for (const [name, def] of Object.entries(data)) {
      const d = def as any
      result.set(name, {
        prefix: Array.isArray(d.prefix) ? d.prefix[0] : d.prefix,
        body: convertVSCodeSnippet(d.body),
        description: d.description || '',
      })
    }
  } catch {
    // invalid JSON
  }

  return result
}
