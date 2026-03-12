/**
 * Editor enhancement hooks.
 * Provides advanced Monaco editor features: sticky scroll, inlay hints,
 * code lens, minimap decorations, and more.
 */

import { useEffect, useCallback, useRef, useMemo } from 'react'
import type { editor as MonacoEditor, languages, IDisposable } from 'monaco-editor'

/* ── Types ─────────────────────────────────────────────── */

interface EditorEnhancementOptions {
  stickyScroll?: boolean
  bracketPairGuides?: boolean
  inlayHints?: boolean
  linkedEditing?: boolean
  colorDecorators?: boolean
  parameterHints?: boolean
  suggestOnTriggerCharacters?: boolean
  quickSuggestions?: boolean
  snippetSuggestions?: 'top' | 'bottom' | 'inline' | 'none'
  formatOnPaste?: boolean
  formatOnType?: boolean
  autoClosingBrackets?: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never'
  autoClosingQuotes?: 'always' | 'languageDefined' | 'beforeWhitespace' | 'never'
  autoSurround?: 'languageDefined' | 'brackets' | 'quotes' | 'never'
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded'
  fontLigatures?: boolean
  renderWhitespace?: 'none' | 'boundary' | 'selection' | 'trailing' | 'all'
  smoothScrolling?: boolean
  cursorBlinking?: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
  cursorSmoothCaretAnimation?: 'off' | 'explicit' | 'on'
  mouseWheelZoom?: boolean
  minimap?: { enabled: boolean; maxColumn: number; renderCharacters: boolean; scale: number }
}

const DEFAULT_ENHANCEMENTS: EditorEnhancementOptions = {
  stickyScroll: true,
  bracketPairGuides: true,
  inlayHints: true,
  linkedEditing: true,
  colorDecorators: true,
  parameterHints: true,
  suggestOnTriggerCharacters: true,
  quickSuggestions: true,
  snippetSuggestions: 'inline',
  formatOnPaste: false,
  formatOnType: false,
  autoClosingBrackets: 'languageDefined',
  autoClosingQuotes: 'languageDefined',
  autoSurround: 'languageDefined',
  wordWrap: 'off',
  fontLigatures: true,
  renderWhitespace: 'selection',
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  mouseWheelZoom: true,
  minimap: { enabled: true, maxColumn: 80, renderCharacters: false, scale: 1 },
}

/* ── Main Enhancement Hook ────────────────────────────── */

export function useEditorEnhancements(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>,
  options?: Partial<EditorEnhancementOptions>
) {
  const opts = useMemo(() => ({ ...DEFAULT_ENHANCEMENTS, ...options }), [options])
  const disposablesRef = useRef<IDisposable[]>([])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    // Apply editor options
    editor.updateOptions({
      'bracketPairColorization.enabled': opts.bracketPairGuides,
      'guides.bracketPairs': opts.bracketPairGuides,
      'guides.indentation': true,
      'guides.highlightActiveBracketPair': true,
      'stickyScroll.enabled': opts.stickyScroll,
      'inlayHints.enabled': opts.inlayHints ? 'on' : 'off',
      'linkedEditing': opts.linkedEditing,
      'colorDecorators': opts.colorDecorators,
      'parameterHints.enabled': opts.parameterHints,
      'suggest.snippetsPreventQuickSuggestions': false,
      'snippetSuggestions': opts.snippetSuggestions,
      'formatOnPaste': opts.formatOnPaste,
      'formatOnType': opts.formatOnType,
      'autoClosingBrackets': opts.autoClosingBrackets,
      'autoClosingQuotes': opts.autoClosingQuotes,
      'autoSurround': opts.autoSurround,
      'wordWrap': opts.wordWrap,
      'fontLigatures': opts.fontLigatures,
      'renderWhitespace': opts.renderWhitespace,
      'smoothScrolling': opts.smoothScrolling,
      'cursorBlinking': opts.cursorBlinking,
      'cursorSmoothCaretAnimation': opts.cursorSmoothCaretAnimation,
      'mouseWheelZoom': opts.mouseWheelZoom,
      minimap: opts.minimap,
    } as any)

    return () => {
      disposablesRef.current.forEach(d => d.dispose())
      disposablesRef.current = []
    }
  }, [editorRef, opts])
}

/* ── Indent Rainbow Hook ──────────────────────────────── */

export function useIndentRainbow(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>,
  enabled = true
) {
  const decorationsRef = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !enabled) return

    const colors = [
      'rgba(255,255,64,0.07)',
      'rgba(127,255,127,0.07)',
      'rgba(255,127,255,0.07)',
      'rgba(79,236,236,0.07)',
      'rgba(255,179,71,0.07)',
      'rgba(147,112,219,0.07)',
    ]

    const updateDecorations = () => {
      const model = editor.getModel()
      if (!model) return

      const decorations: MonacoEditor.IModelDeltaDecoration[] = []
      const lineCount = model.getLineCount()
      const tabSize = model.getOptions().tabSize

      for (let i = 1; i <= Math.min(lineCount, 5000); i++) {
        const line = model.getLineContent(i)
        if (!line.trim()) continue

        let spaces = 0
        for (const ch of line) {
          if (ch === ' ') spaces++
          else if (ch === '\t') spaces += tabSize
          else break
        }

        const levels = Math.floor(spaces / tabSize)
        for (let level = 0; level < levels; level++) {
          const startCol = level * tabSize + 1
          const endCol = (level + 1) * tabSize + 1
          decorations.push({
            range: { startLineNumber: i, startColumn: startCol, endLineNumber: i, endColumn: endCol },
            options: {
              inlineClassName: undefined,
              className: undefined,
              isWholeLine: false,
              overviewRuler: undefined,
              beforeContentClassName: undefined,
              afterContentClassName: undefined,
            },
          })
        }
      }

      // Inject CSS for indent levels
      injectIndentRainbowCSS(colors, tabSize)

      if (decorationsRef.current) {
        decorationsRef.current.clear()
      }
      decorationsRef.current = editor.createDecorationsCollection(decorations)
    }

    const disposable = editor.onDidChangeModelContent(() => {
      requestAnimationFrame(updateDecorations)
    })

    updateDecorations()

    return () => {
      disposable.dispose()
      decorationsRef.current?.clear()
    }
  }, [editorRef, enabled])
}

function injectIndentRainbowCSS(colors: string[], tabSize: number): void {
  const id = 'indent-rainbow-styles'
  let style = document.getElementById(id) as HTMLStyleElement
  if (!style) {
    style = document.createElement('style')
    style.id = id
    document.head.appendChild(style)
  }
  style.textContent = colors.map((color, i) =>
    `.indent-rainbow-${i} { background: ${color}; }`
  ).join('\n')
}

/* ── Cursor Trail Hook ────────────────────────────────── */

export function useCursorTrail(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>,
  enabled = false
) {
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !enabled) return

    const container = editor.getDomNode()
    if (!container) return

    const trails: HTMLElement[] = []
    const MAX_TRAILS = 5

    const handleCursorChange = () => {
      const cursor = container.querySelector('.cursor') as HTMLElement
      if (!cursor) return

      const rect = cursor.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      const trail = document.createElement('div')
      trail.style.cssText = `
        position: absolute;
        left: ${rect.left - containerRect.left}px;
        top: ${rect.top - containerRect.top}px;
        width: 2px;
        height: ${rect.height}px;
        background: var(--accent-primary);
        opacity: 0.3;
        pointer-events: none;
        transition: opacity 0.5s ease;
        z-index: 100;
      `
      container.appendChild(trail)
      trails.push(trail)

      requestAnimationFrame(() => {
        trail.style.opacity = '0'
      })

      setTimeout(() => {
        trail.remove()
        const idx = trails.indexOf(trail)
        if (idx >= 0) trails.splice(idx, 1)
      }, 500)

      // Limit trail count
      while (trails.length > MAX_TRAILS) {
        const old = trails.shift()
        old?.remove()
      }
    }

    const disposable = editor.onDidChangeCursorPosition(handleCursorChange)
    return () => {
      disposable.dispose()
      trails.forEach(t => t.remove())
    }
  }, [editorRef, enabled])
}

/* ── Smart Select Hook ────────────────────────────────── */

export function useSmartSelect(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>
) {
  const selectWord = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const selection = editor.getSelection()
    if (!selection) return

    const model = editor.getModel()
    if (!model) return

    const word = model.getWordAtPosition(selection.getStartPosition())
    if (word) {
      editor.setSelection({
        startLineNumber: selection.startLineNumber,
        startColumn: word.startColumn,
        endLineNumber: selection.startLineNumber,
        endColumn: word.endColumn,
      })
    }
  }, [editorRef])

  const selectLine = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const selection = editor.getSelection()
    if (!selection) return

    editor.setSelection({
      startLineNumber: selection.startLineNumber,
      startColumn: 1,
      endLineNumber: selection.endLineNumber,
      endColumn: editor.getModel()?.getLineMaxColumn(selection.endLineNumber) || 1,
    })
  }, [editorRef])

  const selectBlock = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection) return

    const line = selection.startLineNumber
    const content = model.getLineContent(line)

    // Find matching bracket pair
    const bracketMatch = model.bracketPairs?.matchBracket?.(selection.getStartPosition())
    if (bracketMatch) {
      editor.setSelection({
        startLineNumber: bracketMatch[0].startLineNumber,
        startColumn: bracketMatch[0].startColumn,
        endLineNumber: bracketMatch[1].endLineNumber,
        endColumn: bracketMatch[1].endColumn,
      })
    }
  }, [editorRef])

  const expandSelection = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.trigger('keyboard', 'editor.action.smartSelect.expand', {})
  }, [editorRef])

  const shrinkSelection = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    editor.trigger('keyboard', 'editor.action.smartSelect.shrink', {})
  }, [editorRef])

  return { selectWord, selectLine, selectBlock, expandSelection, shrinkSelection }
}

/* ── Multi-Cursor Enhancement Hook ────────────────────── */

export function useMultiCursor(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>
) {
  const addCursorAbove = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.insertCursorAbove', {})
  }, [editorRef])

  const addCursorBelow = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.insertCursorBelow', {})
  }, [editorRef])

  const addCursorToAllOccurrences = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.selectHighlights', {})
  }, [editorRef])

  const addCursorToNextOccurrence = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.addSelectionToNextFindMatch', {})
  }, [editorRef])

  return {
    addCursorAbove,
    addCursorBelow,
    addCursorToAllOccurrences,
    addCursorToNextOccurrence,
  }
}

/* ── Go to Definition Enhancement ─────────────────────── */

export function useGoToDefinition(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>
) {
  const goToDefinition = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.revealDefinition', {})
  }, [editorRef])

  const peekDefinition = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.peekDefinition', {})
  }, [editorRef])

  const goToTypeDefinition = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.goToTypeDefinition', {})
  }, [editorRef])

  const goToImplementation = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.goToImplementation', {})
  }, [editorRef])

  const findAllReferences = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.referenceSearch.trigger', {})
  }, [editorRef])

  return {
    goToDefinition,
    peekDefinition,
    goToTypeDefinition,
    goToImplementation,
    findAllReferences,
  }
}

/* ── Code Folding Enhancement ─────────────────────────── */

export function useCodeFolding(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>
) {
  const foldAll = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.foldAll', {})
  }, [editorRef])

  const unfoldAll = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.unfoldAll', {})
  }, [editorRef])

  const foldLevel = useCallback((level: number) => {
    editorRef.current?.trigger('keyboard', `editor.foldLevel${level}`, {})
  }, [editorRef])

  const toggleFold = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.toggleFold', {})
  }, [editorRef])

  const foldAllComments = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.foldAllBlockComments', {})
  }, [editorRef])

  return { foldAll, unfoldAll, foldLevel, toggleFold, foldAllComments }
}

/* ── Editor Actions Enhancement ───────────────────────── */

export function useEditorActions(
  editorRef: React.RefObject<MonacoEditor.IStandaloneCodeEditor | null>
) {
  const formatDocument = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.formatDocument', {})
  }, [editorRef])

  const formatSelection = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.formatSelection', {})
  }, [editorRef])

  const organizeImports = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.organizeImports', {})
  }, [editorRef])

  const sortLines = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.sortLinesAscending', {})
  }, [editorRef])

  const toggleComment = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.commentLine', {})
  }, [editorRef])

  const toggleBlockComment = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.blockComment', {})
  }, [editorRef])

  const transformToUppercase = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.transformToUppercase', {})
  }, [editorRef])

  const transformToLowercase = useCallback(() => {
    editorRef.current?.trigger('keyboard', 'editor.action.transformToLowercase', {})
  }, [editorRef])

  return {
    formatDocument,
    formatSelection,
    organizeImports,
    sortLines,
    toggleComment,
    toggleBlockComment,
    transformToUppercase,
    transformToLowercase,
  }
}
