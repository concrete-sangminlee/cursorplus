/**
 * Enhanced language providers for Monaco editor.
 *
 * Registers DefinitionProvider, ReferenceProvider, HoverProvider,
 * DocumentSymbolProvider, and RenameProvider for TS/JS/TSX/JSX.
 * Uses regex-based parsing -- no TypeScript compiler required.
 */

import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'

// ── Languages to register providers for ──────────────────
const PROVIDER_LANGUAGES = ['typescript', 'javascript', 'typescriptreact', 'javascriptreact']

// ── Import parsing ──────────────────
const IMPORT_PATH_REGEX = /(?:import\s+.*\s+from\s+['"](.+?)['"]|require\s*\(\s*['"](.+?)['"]\s*\))/
const IMPORT_FULL_SRC = /import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?\s+from\s+['"](.+?)['"]/.source

interface ImportInfo {
  name: string
  alias?: string
  path: string
  isDefault: boolean
}

function parseImports(text: string): ImportInfo[] {
  const results: ImportInfo[] = []
  const regex = new RegExp(IMPORT_FULL_SRC, 'gm')
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    const defaultName = m[1]
    const namedPart = m[2]
    const importPath = m[3]
    if (defaultName) results.push({ name: defaultName, path: importPath, isDefault: true })
    if (namedPart) {
      for (const n of namedPart.split(',').map((s) => s.trim()).filter(Boolean)) {
        const asParts = n.split(/\s+as\s+/)
        if (asParts.length === 2) results.push({ name: asParts[0].trim(), alias: asParts[1].trim(), path: importPath, isDefault: false })
        else results.push({ name: n.trim(), path: importPath, isDefault: false })
      }
    }
  }
  return results
}

// ── Definition finding ──────────────────
interface DefLocation {
  lineNum: number
  col: number
  endCol: number
  content: string
}

function findDefinitionInText(symbolName: string, text: string): DefLocation | null {
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const defRegex = new RegExp(
    `(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(?:function\\s*\\*?\\s+(${escaped})\\b|(?:const|let|var)\\s+(${escaped})\\s*[=:]|class\\s+(${escaped})\\b|interface\\s+(${escaped})\\b|type\\s+(${escaped})\\b|enum\\s+(${escaped})\\b)`,
  )
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const match = defRegex.exec(lines[i])
    if (match) {
      const matchedName = match[1] || match[2] || match[3] || match[4] || match[5] || match[6]
      const nameIdx = lines[i].indexOf(matchedName, match.index)
      return { lineNum: i + 1, col: nameIdx + 1, endCol: nameIdx + 1 + matchedName.length, content: lines[i] }
    }
  }
  // Check export { name } patterns
  const exportRegex = new RegExp(`export\\s+\\{[^}]*\\b${escaped}\\b[^}]*\\}`)
  for (let i = 0; i < lines.length; i++) {
    if (exportRegex.test(lines[i])) {
      const nameIdx = lines[i].indexOf(symbolName)
      return { lineNum: i + 1, col: nameIdx + 1, endCol: nameIdx + 1 + symbolName.length, content: lines[i] }
    }
  }
  return null
}

// ── Occurrence finding ──────────────────
interface Occurrence {
  lineNum: number
  col: number
  endCol: number
}

function findAllOccurrences(symbolName: string, text: string): Occurrence[] {
  const escaped = symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`\\b${escaped}\\b`, 'g')
  const results: Occurrence[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    let match: RegExpExecArray | null
    regex.lastIndex = 0
    while ((match = regex.exec(lines[i])) !== null) {
      results.push({ lineNum: i + 1, col: match.index + 1, endCol: match.index + 1 + symbolName.length })
    }
  }
  return results
}

// ── JSDoc extraction ──────────────────
function extractJSDoc(lines: string[], defLineIdx: number): string | null {
  let endIdx = defLineIdx - 1
  while (endIdx >= 0 && lines[endIdx].trim() === '') endIdx--
  if (endIdx < 0 || !lines[endIdx].trim().endsWith('*/')) return null
  let startIdx = endIdx
  while (startIdx >= 0 && !lines[startIdx].includes('/**')) startIdx--
  if (startIdx < 0) return null
  return lines
    .slice(startIdx, endIdx + 1)
    .map((l) => l.trim().replace(/^\/\*\*\s?|\s?\*\/$/g, '').replace(/^\*\s?/, ''))
    .filter((l) => l.length > 0)
    .join('\n')
}

// ── Signature extraction ──────────────────
function extractSignature(lines: string[], lineIdx: number): string | null {
  const line = lines[lineIdx]

  // function declaration
  const funcMatch = line.match(
    /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*(\w+)\s*(<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+))?/,
  )
  if (funcMatch) return `function ${funcMatch[1]}${funcMatch[2] || ''}(${funcMatch[3].trim()}): ${funcMatch[4] || 'void'}`

  // arrow function
  const arrowMatch = line.match(
    /(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+(\w+)\s*(?::\s*([^=]+?)\s*)?=\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*(?::\s*([^\s=>]+))?\s*=>/,
  )
  if (arrowMatch) {
    if (arrowMatch[2]) return `const ${arrowMatch[1]}: ${arrowMatch[2].trim()}`
    const params = arrowMatch[3] !== undefined ? arrowMatch[3].trim() : arrowMatch[4]
    return `const ${arrowMatch[1]} = (${params}) => ${arrowMatch[5] || 'inferred'}`
  }

  // class
  const classMatch = line.match(
    /(?:export\s+(?:default\s+)?)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+(.+?))?(?:\s*\{)?$/,
  )
  if (classMatch) {
    let s = `class ${classMatch[1]}`
    if (classMatch[2]) s += ` extends ${classMatch[2]}`
    if (classMatch[3]) s += ` implements ${classMatch[3]}`
    return s
  }

  // interface
  const ifMatch = line.match(/(?:export\s+)?interface\s+(\w+)(?:<([^>]+)>)?(?:\s+extends\s+(.+?))?/)
  if (ifMatch) {
    let s = `interface ${ifMatch[1]}`
    if (ifMatch[2]) s += `<${ifMatch[2]}>`
    if (ifMatch[3]) s += ` extends ${ifMatch[3]}`
    return s
  }

  // type alias
  const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)(?:<([^>]+)>)?\s*=\s*(.+)/)
  if (typeMatch) return `type ${typeMatch[1]}${typeMatch[2] ? `<${typeMatch[2]}>` : ''} = ${typeMatch[3].trim()}`

  // enum
  const enumMatch = line.match(/(?:export\s+)?enum\s+(\w+)/)
  if (enumMatch) return `enum ${enumMatch[1]}`

  // variable with type annotation
  const varTyped = line.match(/(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+(\w+)\s*:\s*([^=]+?)\s*=/)
  if (varTyped) return `${(line.match(/const|let|var/) || ['const'])[0]} ${varTyped[1]}: ${varTyped[2].trim()}`

  // variable with inferred type
  const varInfer = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(.+?)(?:;|\s*$)/)
  if (varInfer) {
    const val = varInfer[2].trim()
    let inferred = 'unknown'
    if (/^['"`]/.test(val)) inferred = 'string'
    else if (/^\d/.test(val)) inferred = 'number'
    else if (/^(?:true|false)$/.test(val)) inferred = 'boolean'
    else if (/^\[/.test(val)) inferred = 'Array'
    else if (/^\{/.test(val)) inferred = 'object'
    else if (/^new\s+(\w+)/.test(val)) inferred = val.match(/^new\s+(\w+)/)![1]
    else if (/^null$/.test(val)) inferred = 'null'
    else if (/^undefined$/.test(val)) inferred = 'undefined'
    return `${(line.match(/const|let|var/) || ['const'])[0]} ${varInfer[1]}: ${inferred}`
  }

  return null
}

// ── Reserved keywords ──────────────────
const JS_KEYWORDS = new Set([
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof', 'new',
  'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'class', 'const', 'enum', 'export', 'extends', 'import',
  'super', 'implements', 'interface', 'let', 'package', 'private', 'protected',
  'public', 'static', 'yield', 'null', 'undefined', 'true', 'false',
  'async', 'await', 'of', 'type', 'namespace', 'abstract', 'as', 'from',
])

// ── TS keyword descriptions for hover ──────────────────
const TS_KEYWORDS: Record<string, string> = {
  'string': 'Primitive type: represents text data.',
  'number': 'Primitive type: represents numeric values (integers and floats).',
  'boolean': 'Primitive type: represents true/false values.',
  'void': 'Type: indicates no return value.',
  'null': 'Primitive type: intentional absence of any value.',
  'undefined': 'Primitive type: variable declared but not assigned.',
  'any': 'Type: opt out of type checking. Any value is allowed.',
  'unknown': 'Type: type-safe counterpart of any. Must narrow before use.',
  'never': 'Type: represents values that never occur (e.g. function that always throws).',
  'object': 'Type: represents non-primitive values.',
  'Array': 'Built-in generic type: Array<T> or T[].',
  'Promise': 'Built-in generic type: Promise<T> represents an async result.',
  'Record': 'Utility type: Record<K, V> constructs an object type.',
  'Partial': 'Utility type: Partial<T> makes all properties optional.',
  'Required': 'Utility type: Required<T> makes all properties required.',
  'Readonly': 'Utility type: Readonly<T> makes all properties readonly.',
  'Pick': 'Utility type: Pick<T, K> picks a set of properties.',
  'Omit': 'Utility type: Omit<T, K> omits a set of properties.',
  'Exclude': 'Utility type: Exclude<T, U> excludes types assignable to U.',
  'Extract': 'Utility type: Extract<T, U> extracts types assignable to U.',
  'ReturnType': 'Utility type: ReturnType<T> extracts the return type of a function type.',
  'Parameters': 'Utility type: Parameters<T> extracts parameter types of a function type.',
  'useState': 'React Hook: returns [state, setState]. Manages component state.',
  'useEffect': 'React Hook: runs side effects after render. Cleanup via return function.',
  'useRef': 'React Hook: returns a mutable ref object that persists across renders.',
  'useCallback': 'React Hook: returns a memoized callback function.',
  'useMemo': 'React Hook: returns a memoized value. Recomputes only when dependencies change.',
  'useContext': 'React Hook: accepts a context object and returns the current context value.',
  'useReducer': 'React Hook: alternative to useState for complex state logic.',
  'async': 'Keyword: declares an asynchronous function that returns a Promise.',
  'await': 'Keyword: pauses async function execution until a Promise settles.',
  'interface': 'Keyword: declares a TypeScript interface (structural type).',
  'type': 'Keyword: declares a TypeScript type alias.',
  'enum': 'Keyword: declares a TypeScript enum (set of named constants).',
  'const': 'Keyword: declares a block-scoped constant binding.',
  'let': 'Keyword: declares a block-scoped variable binding.',
  'function': 'Keyword: declares a function.',
  'class': 'Keyword: declares a class.',
  'extends': 'Keyword: used in class/interface inheritance.',
  'implements': 'Keyword: used to implement an interface in a class.',
  'import': 'Keyword: imports bindings from another module.',
  'export': 'Keyword: exports bindings from a module.',
}

// ── Color preview regexes ──────────────────
const CSS_HEX_REGEX = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/
const CSS_RGBA_REGEX = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/
const CSS_HSLA_REGEX = /hsla?\(\s*(\d+)\s*,\s*(\d+)%?\s*,\s*(\d+)%?\s*(?:,\s*([\d.]+))?\s*\)/
const HOVER_IMPORT_REGEX = /import\s+(?:\{[^}]*\}|[^{}]+)\s+from\s+['"](.+?)['"]/

/**
 * Options for the hover provider's diagnostic section.
 */
export interface LanguageProviderOptions {
  /** Returns the currently active file path so diagnostics can be matched. */
  getActiveFilePath?: () => string | null
  /** Returns problems from the problems store for quick-fix hints. */
  getProblems?: () => Array<{ file: string; line: number; message: string; quickFix?: string }>
}

/**
 * Register all enhanced language providers on the given Monaco instance.
 * Call this once during editor mount.
 */
export function registerLanguageProviders(
  monaco: Monaco,
  _editor: MonacoEditor.IStandaloneCodeEditor,
  options: LanguageProviderOptions = {},
): void {
  for (const lang of PROVIDER_LANGUAGES) {
    // ────────────────────────────────────────────────────────
    // 1. Definition provider
    // ────────────────────────────────────────────────────────
    monaco.languages.registerDefinitionProvider(lang, {
      provideDefinition: (model, position) => {
        const lineContent = model.getLineContent(position.lineNumber)
        const word = model.getWordAtPosition(position)
        if (!word) return null
        const symbolName = word.word
        const fullText = model.getValue()
        const allImports = parseImports(fullText)

        // Cursor on an import path string -- resolve the file
        const importMatch = IMPORT_PATH_REGEX.exec(lineContent)
        if (importMatch) {
          const importPath = importMatch[1] || importMatch[2]
          if (importPath) {
            window.dispatchEvent(
              new CustomEvent('orion:open-file-from-import', {
                detail: { importPath, currentFile: model.uri.toString() },
              }),
            )
          }
          return {
            uri: model.uri,
            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          }
        }

        // Symbol is imported -- try to locate definition in open models
        const importInfo = allImports.find((imp) => imp.name === symbolName || imp.alias === symbolName)
        if (importInfo) {
          const allModels = monaco.editor.getModels()
          for (const otherModel of allModels) {
            if (otherModel === model) continue
            const otherUri = otherModel.uri.toString()
            const importPathNorm = importInfo.path.replace(/^[.@/]+/, '').replace(/\.(tsx?|jsx?|js|ts)$/, '')
            const uriNorm = otherUri.replace(/\.(tsx?|jsx?|js|ts)$/, '')
            if (uriNorm.includes(importPathNorm) || uriNorm.endsWith(importPathNorm)) {
              const otherText = otherModel.getValue()
              const def = findDefinitionInText(importInfo.name, otherText)
              if (def) {
                return {
                  uri: otherModel.uri,
                  range: new monaco.Range(def.lineNum, def.col, def.lineNum, def.endCol),
                  originSelectionRange: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                } as any
              }
              // Default import -- look for export default
              if (importInfo.isDefault) {
                const lines = otherText.split('\n')
                for (let i = 0; i < lines.length; i++) {
                  if (/export\s+default\b/.test(lines[i])) {
                    return {
                      uri: otherModel.uri,
                      range: new monaco.Range(i + 1, 1, i + 1, lines[i].length + 1),
                      originSelectionRange: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
                    } as any
                  }
                }
              }
            }
          }
          // Fallback: dispatch open-file event
          window.dispatchEvent(
            new CustomEvent('orion:open-file-from-import', {
              detail: { importPath: importInfo.path, currentFile: model.uri.toString(), symbol: importInfo.name },
            }),
          )
          return {
            uri: model.uri,
            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          }
        }

        // Same-file definition
        const def = findDefinitionInText(symbolName, fullText)
        if (def && (def.lineNum !== position.lineNumber || def.col !== word.startColumn)) {
          return {
            uri: model.uri,
            range: new monaco.Range(def.lineNum, def.col, def.lineNum, def.endCol),
            originSelectionRange: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          } as any
        }

        return null
      },
    })

    // ────────────────────────────────────────────────────────
    // 2. Reference provider
    // ────────────────────────────────────────────────────────
    monaco.languages.registerReferenceProvider(lang, {
      provideReferences: (model, position, _context) => {
        const word = model.getWordAtPosition(position)
        if (!word) return []
        const symbolName = word.word
        const results: Array<{ uri: any; range: any }> = []

        // Current file
        for (const occ of findAllOccurrences(symbolName, model.getValue())) {
          results.push({
            uri: model.uri,
            range: new monaco.Range(occ.lineNum, occ.col, occ.lineNum, occ.endCol),
          })
        }

        // Other open models
        for (const otherModel of monaco.editor.getModels()) {
          if (otherModel === model) continue
          for (const occ of findAllOccurrences(symbolName, otherModel.getValue())) {
            results.push({
              uri: otherModel.uri,
              range: new monaco.Range(occ.lineNum, occ.col, occ.lineNum, occ.endCol),
            })
          }
        }

        return results
      },
    })

    // ────────────────────────────────────────────────────────
    // 3. Hover provider
    // ────────────────────────────────────────────────────────
    monaco.languages.registerHoverProvider(lang, {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position)
        const lineContent = model.getLineContent(position.lineNumber)

        // --- Diagnostic hover: show rich tooltip for errors/warnings ---
        const markers = monaco.editor.getModelMarkers({ resource: model.uri, owner: 'orion' })
        const hitMarkers = markers.filter(
          (m) =>
            m.startLineNumber <= position.lineNumber &&
            m.endLineNumber >= position.lineNumber &&
            (m.startLineNumber < position.lineNumber || m.startColumn <= position.column) &&
            (m.endLineNumber > position.lineNumber || m.endColumn >= position.column),
        )
        if (hitMarkers.length > 0) {
          const contents: { value: string }[] = []
          for (const marker of hitMarkers) {
            const sevIcon =
              marker.severity === monaco.MarkerSeverity.Error
                ? '\u26D4'
                : marker.severity === monaco.MarkerSeverity.Warning
                  ? '\u26A0\uFE0F'
                  : '\u2139\uFE0F'
            const sevLabel =
              marker.severity === monaco.MarkerSeverity.Error
                ? 'Error'
                : marker.severity === monaco.MarkerSeverity.Warning
                  ? 'Warning'
                  : 'Info'
            contents.push({ value: `${sevIcon} **${sevLabel}**: ${marker.message}` })
            if (marker.source) {
              contents.push({ value: `_Source: ${marker.source}_` })
            }
            // Quick fix hint from problems store
            if (options.getProblems && options.getActiveFilePath) {
              const storeProblems = options.getProblems()
              const activeFile = options.getActiveFilePath()
              const matchingProblem = storeProblems.find(
                (p) => p.file === activeFile && p.line === marker.startLineNumber && p.message === marker.message,
              )
              if (matchingProblem?.quickFix) {
                contents.push({ value: `\u{1F527} **Quick Fix**: ${matchingProblem.quickFix}` })
              }
            }
            contents.push({ value: `\u{1F916} [Fix with AI](command:orion-fix-with-ai)` })
          }
          const firstMarker = hitMarkers[0]
          return {
            range: new monaco.Range(firstMarker.startLineNumber, firstMarker.startColumn, firstMarker.endLineNumber, firstMarker.endColumn),
            contents,
          }
        }

        // --- Color previews ---
        const hexMatch = CSS_HEX_REGEX.exec(lineContent)
        if (hexMatch) {
          const startCol = hexMatch.index + 1
          const endCol = startCol + hexMatch[0].length
          if (position.column >= startCol && position.column <= endCol) {
            return {
              range: new monaco.Range(position.lineNumber, startCol, position.lineNumber, endCol),
              contents: [
                { value: '**Color Preview**' },
                { value: `\`${hexMatch[0]}\`\n\n${'\\'}u2588${'\\'}u2588${'\\'}u2588 \`${hexMatch[0]}\`` },
              ],
            }
          }
        }

        const rgbaMatch = CSS_RGBA_REGEX.exec(lineContent)
        if (rgbaMatch) {
          const startCol = rgbaMatch.index + 1
          const endCol = startCol + rgbaMatch[0].length
          if (position.column >= startCol && position.column <= endCol) {
            return {
              range: new monaco.Range(position.lineNumber, startCol, position.lineNumber, endCol),
              contents: [
                { value: '**Color Preview**' },
                { value: `\`${rgbaMatch[0]}\`\n\nR: ${rgbaMatch[1]} G: ${rgbaMatch[2]} B: ${rgbaMatch[3]} A: ${rgbaMatch[4] || '1'}` },
              ],
            }
          }
        }

        const hslaMatch = CSS_HSLA_REGEX.exec(lineContent)
        if (hslaMatch) {
          const startCol = hslaMatch.index + 1
          const endCol = startCol + hslaMatch[0].length
          if (position.column >= startCol && position.column <= endCol) {
            return {
              range: new monaco.Range(position.lineNumber, startCol, position.lineNumber, endCol),
              contents: [
                { value: '**Color Preview**' },
                { value: `\`${hslaMatch[0]}\`\n\nH: ${hslaMatch[1]} S: ${hslaMatch[2]}% L: ${hslaMatch[3]}% A: ${hslaMatch[4] || '1'}` },
              ],
            }
          }
        }

        if (!word) return null

        // --- Import path hover ---
        const importMatch = HOVER_IMPORT_REGEX.exec(lineContent)
        if (importMatch) {
          const importPath = importMatch[1]
          const braceStart = lineContent.indexOf('{')
          const braceEnd = lineContent.indexOf('}')
          if (braceStart !== -1 && braceEnd !== -1 && position.column > braceStart && position.column <= braceEnd + 1) {
            return {
              range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
              contents: [{ value: `**\`${word.word}\`**` }, { value: `Imported from \`${importPath}\`` }],
            }
          }
          const defaultImportMatch = lineContent.match(/import\s+(\w+)\s+from/)
          if (defaultImportMatch && defaultImportMatch[1] === word.word) {
            return {
              range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
              contents: [{ value: `**\`${word.word}\`** (default import)` }, { value: `Imported from \`${importPath}\`` }],
            }
          }
        }

        // --- Keyword hints ---
        if (TS_KEYWORDS[word.word]) {
          return {
            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
            contents: [{ value: `**\`${word.word}\`**` }, { value: TS_KEYWORDS[word.word] }],
          }
        }

        // --- Enhanced hover: signature + JSDoc + type info ---
        const fullText = model.getValue()
        const allLines = fullText.split('\n')
        const def = findDefinitionInText(word.word, fullText)
        if (def) {
          const contents: Array<{ value: string }> = []
          const sig = extractSignature(allLines, def.lineNum - 1)
          if (sig) contents.push({ value: '```typescript\n' + sig + '\n```' })
          const jsdoc = extractJSDoc(allLines, def.lineNum - 1)
          if (jsdoc) contents.push({ value: jsdoc })
          const allImports = parseImports(fullText)
          const impInfo = allImports.find((imp) => imp.name === word.word || imp.alias === word.word)
          if (impInfo) contents.push({ value: `*Imported from \`${impInfo.path}\`*` })
          if (contents.length > 0) {
            return {
              range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
              contents,
            }
          }
        }

        // --- Imported symbol hover: look up definition in other models ---
        const importLineRegex = new RegExp(
          `import\\s+(?:\\{[^}]*\\b${word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^}]*\\}|${word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s+from\\s+['"](.+?)['"]`,
        )
        const fileImportMatch = importLineRegex.exec(fullText)
        if (fileImportMatch) {
          const contents: Array<{ value: string }> = [
            { value: `**\`${word.word}\`**` },
            { value: `*Imported from \`${fileImportMatch[1]}\`*` },
          ]
          // Try to find richer info in other open models
          for (const otherModel of monaco.editor.getModels()) {
            if (otherModel === model) continue
            const otherText = otherModel.getValue()
            const otherDef = findDefinitionInText(word.word, otherText)
            if (otherDef) {
              const otherLines = otherText.split('\n')
              const sig = extractSignature(otherLines, otherDef.lineNum - 1)
              if (sig) contents.splice(1, 0, { value: '```typescript\n' + sig + '\n```' })
              const jsdoc = extractJSDoc(otherLines, otherDef.lineNum - 1)
              if (jsdoc) contents.splice(sig ? 2 : 1, 0, { value: jsdoc })
              break
            }
          }
          return {
            range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
            contents,
          }
        }

        return null
      },
    })

    // ────────────────────────────────────────────────────────
    // 4. Document symbol provider (Ctrl+Shift+O, breadcrumbs)
    // ────────────────────────────────────────────────────────
    monaco.languages.registerDocumentSymbolProvider(lang, {
      provideDocumentSymbols: (model) => {
        const symbols: Array<{
          name: string
          detail: string
          kind: any
          range: any
          selectionRange: any
          tags?: any[]
          children?: any[]
        }> = []
        const text = model.getValue()
        const lines = text.split('\n')
        const SK = monaco.languages.SymbolKind

        const patterns: Array<{ regex: RegExp; kind: any; detail: string }> = [
          { regex: /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s+(\w+)/, kind: SK.Function, detail: 'function' },
          { regex: /(?:export\s+(?:default\s+)?)?class\s+(\w+)/, kind: SK.Class, detail: 'class' },
          { regex: /(?:export\s+)?interface\s+(\w+)/, kind: SK.Interface, detail: 'interface' },
          { regex: /(?:export\s+)?type\s+(\w+)\s*(?:<[^>]*>)?\s*=/, kind: SK.TypeParameter, detail: 'type' },
          { regex: /(?:export\s+)?enum\s+(\w+)/, kind: SK.Enum, detail: 'enum' },
          {
            regex: /(?:export\s+(?:default\s+)?)?const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?(?:\(|(?:\w+)\s*=>)/,
            kind: SK.Function,
            detail: 'arrow function',
          },
          {
            regex: /(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=(?!\s*(?:async\s+)?(?:\(|(?:\w+)\s*=>))/,
            kind: SK.Variable,
            detail: 'variable',
          },
        ]

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
          for (const pat of patterns) {
            const match = pat.regex.exec(line)
            if (match && match[1]) {
              const name = match[1]
              const nameIdx = line.indexOf(name, match.index)
              const lineNum = i + 1

              // For container types, find the closing brace
              let endLine = lineNum
              if (pat.kind === SK.Class || pat.kind === SK.Interface || pat.kind === SK.Enum) {
                let braceDepth = 0
                let foundOpen = false
                for (let j = i; j < lines.length; j++) {
                  for (const ch of lines[j]) {
                    if (ch === '{') {
                      braceDepth++
                      foundOpen = true
                    } else if (ch === '}') braceDepth--
                  }
                  if (foundOpen && braceDepth <= 0) {
                    endLine = j + 1
                    break
                  }
                }
              }

              symbols.push({
                name,
                detail: pat.detail,
                kind: pat.kind,
                range: new monaco.Range(lineNum, 1, endLine, (lines[endLine - 1]?.length || 0) + 1),
                selectionRange: new monaco.Range(lineNum, nameIdx + 1, lineNum, nameIdx + 1 + name.length),
              })
              break // first matching pattern wins per line
            }
          }
        }

        return symbols
      },
    })

    // ────────────────────────────────────────────────────────
    // 5. Rename provider
    // ────────────────────────────────────────────────────────
    monaco.languages.registerRenameProvider(lang, {
      provideRenameEdits: (model, position, newName) => {
        const word = model.getWordAtPosition(position)
        if (!word) return { edits: [] }

        // Validate
        if (!newName || !/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(newName)) {
          return {
            rejectReason: 'Invalid identifier: must start with a letter, underscore, or $ and contain only alphanumeric characters.',
            edits: [],
          }
        }
        if (JS_KEYWORDS.has(newName)) {
          return {
            rejectReason: `"${newName}" is a reserved keyword and cannot be used as an identifier.`,
            edits: [],
          }
        }

        const symbolName = word.word
        const occurrences = findAllOccurrences(symbolName, model.getValue())

        const edits: Array<{ resource: any; textEdit: { range: any; text: string } }> = []
        for (const occ of occurrences) {
          edits.push({
            resource: model.uri,
            textEdit: {
              range: new monaco.Range(occ.lineNum, occ.col, occ.lineNum, occ.endCol),
              text: newName,
            },
          })
        }

        return { edits }
      },
      resolveRenameLocation: (model, position) => {
        const word = model.getWordAtPosition(position)
        if (!word) {
          return {
            rejectReason: 'No symbol found at this position.',
            range: new monaco.Range(1, 1, 1, 1),
            text: '',
          }
        }
        if (JS_KEYWORDS.has(word.word)) {
          return {
            rejectReason: `Cannot rename keyword "${word.word}".`,
            range: new monaco.Range(1, 1, 1, 1),
            text: '',
          }
        }
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          text: word.word,
        }
      },
    })
  }
}
