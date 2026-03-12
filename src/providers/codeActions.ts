/**
 * Code Actions / Quick Fix provider for the Monaco editor.
 * Registers a CodeActionProvider that shows a lightbulb icon with fix suggestions
 * for TypeScript/JavaScript files.
 */
import type { Monaco } from '@monaco-editor/react'
import type { editor as MonacoEditorNs } from 'monaco-editor'

type MonacoEditor = MonacoEditorNs.IStandaloneCodeEditor

/**
 * Register code action providers for TS/JS languages and a "Fix with AI" command.
 */
export function registerCodeActionProviders(monaco: Monaco, editor: MonacoEditor) {
  const codeActionLanguages = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']

  for (const caLang of codeActionLanguages) {
    monaco.languages.registerCodeActionProvider(caLang, {
      provideCodeActions: (model, range) => {
        const actions: {
          title: string
          kind: string
          isPreferred?: boolean
          diagnostics?: any[]
          edit?: {
            edits: {
              resource: any
              versionId: undefined
              textEdit: { range: any; text: string }
            }[]
          }
          command?: { id: string; title: string; arguments?: any[] }
        }[] = []

        const lineNumber = range.startLineNumber
        const lineContent = model.getLineContent(lineNumber)
        const fullText = model.getValue()

        // ── Helpers ──────────────────────────────────────────────────
        const makeEdit = (
          startLine: number,
          startCol: number,
          endLine: number,
          endCol: number,
          text: string,
        ) => ({
          edits: [
            {
              resource: model.uri,
              versionId: undefined as undefined,
              textEdit: {
                range: new monaco.Range(startLine, startCol, endLine, endCol),
                text,
              },
            },
          ],
        })

        const makeInsert = (line: number, col: number, text: string) =>
          makeEdit(line, col, line, col, text)

        // ── 1. Missing semicolon ─────────────────────────────────────
        const trimmedLine = lineContent.trimEnd()
        if (
          trimmedLine.length > 0 &&
          !trimmedLine.endsWith(';') &&
          !trimmedLine.endsWith('{') &&
          !trimmedLine.endsWith('}') &&
          !trimmedLine.endsWith(',') &&
          !trimmedLine.endsWith('(') &&
          !trimmedLine.endsWith(':') &&
          !trimmedLine.endsWith('*/') &&
          !trimmedLine.startsWith('//') &&
          !trimmedLine.startsWith('*') &&
          !trimmedLine.startsWith('import ') &&
          !/^\s*(?:if|else|for|while|switch|try|catch|finally|do)\b/.test(trimmedLine) &&
          !/=>\s*$/.test(trimmedLine) &&
          /(?:const |let |var |return |throw |[a-zA-Z_$]\w*\s*\(.*\)\s*)$|[a-zA-Z0-9_$'")`\]]\s*$/.test(
            trimmedLine,
          )
        ) {
          actions.push({
            title: 'Add missing semicolon',
            kind: 'quickfix',
            isPreferred: true,
            edit: makeInsert(lineNumber, lineContent.length + 1, ';'),
          })
        }

        // ── 2. Convert var to let / const ────────────────────────────
        const varMatch = lineContent.match(/^(\s*)var\s+/)
        if (varMatch) {
          const startCol = varMatch[1].length + 1
          const endCol = startCol + 3
          actions.push({
            title: 'Convert var to const',
            kind: 'quickfix',
            isPreferred: true,
            edit: makeEdit(lineNumber, startCol, lineNumber, endCol, 'const'),
          })
          actions.push({
            title: 'Convert var to let',
            kind: 'quickfix',
            edit: makeEdit(lineNumber, startCol, lineNumber, endCol, 'let'),
          })
        }

        // ── 3. Remove console.log statement ──────────────────────────
        const consoleLogMatch = lineContent.match(
          /^(\s*)console\.(log|warn|error|info|debug)\s*\(/,
        )
        if (consoleLogMatch) {
          actions.push({
            title: `Remove console.${consoleLogMatch[2]} statement`,
            kind: 'quickfix',
            edit: makeEdit(lineNumber, 1, lineNumber + 1, 1, ''),
          })
        }

        // ── 4. Unused variable ───────────────────────────────────────
        const unusedVarMatch = lineContent.match(/^\s*(?:const|let|var)\s+(\w+)\s*=/)
        if (unusedVarMatch) {
          const varName = unusedVarMatch[1]
          const nameRegex = new RegExp(
            `\\b${varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            'g',
          )
          const allMatches = fullText.match(nameRegex)
          const count = allMatches ? allMatches.length : 0
          if (count <= 1) {
            const varStart = lineContent.indexOf(varName)
            actions.push({
              title: `Prefix unused variable '${varName}' with underscore`,
              kind: 'quickfix',
              edit: makeEdit(
                lineNumber,
                varStart + 1,
                lineNumber,
                varStart + 1 + varName.length,
                `_${varName}`,
              ),
            })
            actions.push({
              title: `Remove unused variable '${varName}'`,
              kind: 'quickfix',
              edit: makeEdit(lineNumber, 1, lineNumber + 1, 1, ''),
            })
          }
        }

        // ── 5. Missing import for PascalCase symbols ─────────────────
        const pascalCaseMatches = lineContent.match(/\b([A-Z][a-zA-Z0-9]+)\b/g)
        if (pascalCaseMatches) {
          const uniqueSymbols = [...new Set(pascalCaseMatches)]
          const globalSymbols = new Set([
            'React',
            'Array',
            'Object',
            'String',
            'Number',
            'Boolean',
            'Date',
            'Map',
            'Set',
            'Promise',
            'Error',
            'RegExp',
            'JSON',
            'Math',
            'Window',
            'Document',
            'Event',
            'HTMLElement',
            'HTMLDivElement',
            'HTMLInputElement',
            'MouseEvent',
            'KeyboardEvent',
            'Record',
            'Partial',
            'Required',
            'Readonly',
            'Pick',
            'Omit',
            'Exclude',
            'Extract',
            'ReturnType',
            'Parameters',
            'Console',
            'Element',
            'Node',
            'Function',
            'Uint8Array',
            'Int32Array',
            'Float64Array',
            'ArrayBuffer',
            'Symbol',
            'TypeError',
            'RangeError',
            'SyntaxError',
            'ReferenceError',
            'Infinity',
            'NaN',
            'URL',
            'Response',
            'Request',
            'Headers',
          ])
          for (const sym of uniqueSymbols) {
            if (globalSymbols.has(sym)) continue
            const importRegex = new RegExp(
              `import\\s+(?:.*\\b${sym}\\b.*\\s+from|${sym}\\s+from)`,
            )
            if (!importRegex.test(fullText)) {
              const declRegex = new RegExp(
                `(?:function|class|interface|type|enum|const|let|var)\\s+${sym}\\b`,
              )
              if (!declRegex.test(fullText)) {
                actions.push({
                  title: `Add import for '${sym}'`,
                  kind: 'quickfix',
                  isPreferred: true,
                  edit: makeInsert(1, 1, `import { ${sym} } from './${sym}'\n`),
                })
              }
            }
          }
        }

        // ── 6. Convert function declaration to arrow function ────────
        const funcDeclMatch = lineContent.match(
          /^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{?\s*$/,
        )
        if (funcDeclMatch) {
          const indent = funcDeclMatch[1]
          const isAsync = lineContent.includes('async ')
          const isExport = lineContent.includes('export ')
          const isDefault = lineContent.includes('default ')
          const funcName = funcDeclMatch[2]
          const params = funcDeclMatch[3]
          const returnTypeMatch = lineContent.match(/\)\s*:\s*([^{]+?)\s*\{?\s*$/)
          const returnType = returnTypeMatch ? `: ${returnTypeMatch[1].trim()}` : ''
          const prefix = (isExport ? 'export ' : '') + (isDefault ? 'default ' : '')
          const arrowFunc = `${indent}${prefix}const ${funcName} = ${isAsync ? 'async ' : ''}(${params})${returnType} => {`
          actions.push({
            title: 'Convert to arrow function',
            kind: 'refactor.rewrite',
            edit: makeEdit(lineNumber, 1, lineNumber, lineContent.length + 1, arrowFunc),
          })
        }

        // ── 7. Add missing return type annotation ────────────────────
        const arrowNoReturnType = lineContent.match(
          /^(\s*)(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(([^)]*)\)\s*=>\s*\{?\s*$/,
        )
        const funcNoReturnType = lineContent.match(
          /^(\s*)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)\s*\{\s*$/,
        )
        if (arrowNoReturnType || funcNoReturnType) {
          const parenIndex = lineContent.indexOf(')', lineContent.indexOf('('))
          if (parenIndex !== -1) {
            actions.push({
              title: 'Add return type annotation',
              kind: 'refactor.rewrite',
              edit: makeInsert(lineNumber, parenIndex + 2, ': void'),
            })
          }
        }

        // ── 8. Wrap in try/catch (selection required) ────────────────
        const currentSelection = editor.getSelection()
        if (currentSelection && !currentSelection.isEmpty()) {
          const selectedText = model.getValueInRange(currentSelection)
          if (selectedText.trim().length > 0) {
            const selStartLine = currentSelection.startLineNumber
            const selEndLine = currentSelection.endLineNumber
            const firstLine = model.getLineContent(selStartLine)
            const indentMatch = firstLine.match(/^(\s*)/)
            const baseIndent = indentMatch ? indentMatch[1] : ''
            const innerIndent = baseIndent + '  '
            const selectedLines = selectedText
              .split('\n')
              .map((l: string) => innerIndent + l.trimStart())
              .join('\n')
            const wrapped = `${baseIndent}try {\n${selectedLines}\n${baseIndent}} catch (error) {\n${innerIndent}console.error(error)\n${baseIndent}}`
            actions.push({
              title: 'Wrap in try/catch',
              kind: 'refactor.extract',
              edit: makeEdit(
                selStartLine,
                1,
                selEndLine,
                model.getLineContent(selEndLine).length + 1,
                wrapped,
              ),
            })
          }
        }

        // ── 9. Extract to variable (single-line expression) ─────────
        if (currentSelection && !currentSelection.isEmpty()) {
          const selectedText = model.getValueInRange(currentSelection)
          const trimmedSel = selectedText.trim()
          if (
            trimmedSel.length > 0 &&
            !trimmedSel.includes('\n') &&
            !/^\s*(?:const|let|var|function|class|import|export)\s/.test(trimmedSel) &&
            !trimmedSel.endsWith('{')
          ) {
            const firstLine = model.getLineContent(currentSelection.startLineNumber)
            const indentMatch = firstLine.match(/^(\s*)/)
            const indent = indentMatch ? indentMatch[1] : ''
            const varDecl = `${indent}const extracted = ${trimmedSel}\n`
            actions.push({
              title: 'Extract to variable',
              kind: 'refactor.extract',
              edit: {
                edits: [
                  {
                    resource: model.uri,
                    versionId: undefined as undefined,
                    textEdit: {
                      range: new monaco.Range(
                        currentSelection.startLineNumber,
                        currentSelection.startColumn,
                        currentSelection.endLineNumber,
                        currentSelection.endColumn,
                      ),
                      text: 'extracted',
                    },
                  },
                  {
                    resource: model.uri,
                    versionId: undefined as undefined,
                    textEdit: {
                      range: new monaco.Range(
                        currentSelection.startLineNumber,
                        1,
                        currentSelection.startLineNumber,
                        1,
                      ),
                      text: varDecl,
                    },
                  },
                ],
              },
            })
          }
        }

        // ── 10. Generate JSDoc comment ───────────────────────────────
        const jsdocFuncMatch = lineContent.match(
          /^(\s*)(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+\w+|(?:const|let)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*))\s*(?:=>|\()/,
        )
        if (jsdocFuncMatch) {
          const prevLine =
            lineNumber > 1 ? model.getLineContent(lineNumber - 1).trim() : ''
          if (!prevLine.endsWith('*/') && !prevLine.startsWith('/**')) {
            const indent = jsdocFuncMatch[1]
            const paramListMatch = lineContent.match(/\(([^)]*)\)/)
            const params = paramListMatch
              ? paramListMatch[1]
                  .split(',')
                  .map((p: string) => p.trim().split(/[:\s=]/)[0].trim())
                  .filter(Boolean)
              : []
            const paramLines = params
              .map((p: string) => `${indent} * @param ${p}\n`)
              .join('')
            const jsdoc = `${indent}/**\n${indent} * Description\n${paramLines}${indent} * @returns\n${indent} */\n`
            actions.push({
              title: 'Generate JSDoc comment',
              kind: 'refactor.rewrite',
              edit: makeInsert(lineNumber, 1, jsdoc),
            })
          }
        }

        // ── 11. Fix with AI – always last ────────────────────────────
        actions.push({
          title: '\u2728 Fix with AI',
          kind: 'quickfix',
          isPreferred: false,
          command: {
            id: 'orion-fix-with-ai',
            title: 'Fix with AI',
            arguments: [lineNumber, lineContent],
          },
        })

        return {
          actions,
          dispose: () => {},
        }
      },
    })
  }

  // Register "Fix with AI" command handler
  editor.addAction({
    id: 'orion-fix-with-ai',
    label: 'Fix with AI',
    run: (_ed, ...args) => {
      const [lineNum, lineText] = args as [number, string]
      const model = _ed.getModel()
      if (!model) return
      const startCtx = Math.max(1, (lineNum as number) - 5)
      const endCtx = Math.min(model.getLineCount(), (lineNum as number) + 5)
      const contextLines: string[] = []
      for (let i = startCtx; i <= endCtx; i++) {
        contextLines.push(`${i === lineNum ? '>' : ' '} ${model.getLineContent(i)}`)
      }
      const context = contextLines.join('\n')
      window.dispatchEvent(
        new CustomEvent('orion:send-chat-message', {
          detail: {
            message: `Fix the issue on the highlighted line in this code:\n\n\`\`\`\n${context}\n\`\`\`\n\nFile: ${model.uri.toString()}\nLine ${lineNum}: ${lineText}`,
          },
        }),
      )
      window.dispatchEvent(new Event('orion:toggle-chat'))
    },
  })
}
