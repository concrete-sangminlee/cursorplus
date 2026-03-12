import { useEffect, useRef, useCallback } from 'react'
import type { editor as MonacoEditor, languages as MonacoLanguages } from 'monaco-editor'
import type { Monaco } from '@monaco-editor/react'
import { useCompletionStore } from '@/store/completion'

interface GhostTextProviderProps {
  editor: MonacoEditor.IStandaloneCodeEditor | null
  monaco: Monaco | null
  language: string
  filePath: string
}

export default function GhostTextProvider({ editor, monaco, language, filePath }: GhostTextProviderProps) {
  const enabled = useCompletionStore((s) => s.enabled)
  const setGhostText = useCompletionStore((s) => s.setGhostText)
  const setLoading = useCompletionStore((s) => s.setLoading)
  const clear = useCompletionStore((s) => s.clear)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disposableRef = useRef<{ dispose: () => void } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const requestCompletion = useCallback(async (
    model: MonacoEditor.ITextModel,
    position: MonacoEditor.IPosition,
  ) => {
    if (!enabled) return

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()

    setLoading(true)

    try {
      // Get context: lines before and after cursor
      const lineCount = model.getLineCount()
      const startLine = Math.max(1, position.lineNumber - 50)
      const endLine = Math.min(lineCount, position.lineNumber + 10)

      const prefix = model.getValueInRange({
        startLineNumber: startLine,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const suffix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: endLine,
        endColumn: model.getLineMaxColumn(endLine),
      })

      const currentLine = model.getLineContent(position.lineNumber)
      const textBeforeCursor = currentLine.substring(0, position.column - 1)

      // Don't trigger on empty lines at the start, or inside comments/strings heuristically
      if (textBeforeCursor.trim() === '' && position.lineNumber <= 2) {
        clear()
        return
      }

      // Build the completion prompt
      const prompt = `<|file:${filePath.split('/').pop() || 'untitled'}|>
<|language:${language}|>
<|prefix|>
${prefix}
<|suffix|>
${suffix}
<|completion|>`

      // Try to get completion from the AI backend
      const response = await (window as any).api?.omoComplete?.({
        prompt,
        maxTokens: 128,
        temperature: 0.2,
        stop: ['\n\n', '<|', '```'],
      })

      if (abortRef.current?.signal.aborted) return

      if (response?.text) {
        // Clean up the completion text
        let completionText = response.text
        // Remove any trailing whitespace-only lines
        completionText = completionText.replace(/\n\s*$/, '')

        if (completionText.trim()) {
          setGhostText(completionText, position.lineNumber, position.column)
        } else {
          clear()
        }
      } else {
        clear()
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        clear()
      }
    }
  }, [enabled, filePath, language, setGhostText, setLoading, clear])

  useEffect(() => {
    if (!editor || !monaco || !enabled) return

    // Register inline completions provider
    const provider: MonacoLanguages.InlineCompletionsProvider = {
      provideInlineCompletions: async (model, position, context, token) => {
        const store = useCompletionStore.getState()
        if (!store.enabled) return { items: [] }

        // Only provide if we have a ghost text for this position
        if (
          store.ghostText &&
          store.triggerLine === position.lineNumber &&
          store.triggerColumn === position.column
        ) {
          return {
            items: [{
              insertText: store.ghostText,
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column,
              },
            }],
          }
        }

        return { items: [] }
      },
      freeInlineCompletions: () => {},
    }

    const disposable = monaco.languages.registerInlineCompletionsProvider(
      { pattern: '**' },
      provider,
    )
    disposableRef.current = disposable

    // Listen for cursor position changes to trigger completions
    const cursorDisposable = editor.onDidChangeCursorPosition((e) => {
      if (e.reason === 3) return // Explicit cursor set, skip

      if (debounceRef.current) clearTimeout(debounceRef.current)
      clear()

      debounceRef.current = setTimeout(() => {
        const model = editor.getModel()
        if (!model) return
        const pos = editor.getPosition()
        if (!pos) return
        requestCompletion(model, pos)
      }, 600)
    })

    // Clear ghost text on content changes
    const contentDisposable = editor.onDidChangeModelContent(() => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      clear()
    })

    return () => {
      disposable.dispose()
      cursorDisposable.dispose()
      contentDisposable.dispose()
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) abortRef.current.abort()
    }
  }, [editor, monaco, enabled, requestCompletion, clear])

  // Register Tab to accept completion
  useEffect(() => {
    if (!editor || !monaco) return

    const action = editor.addAction({
      id: 'orion-accept-ghost-text',
      label: 'Accept AI Completion',
      keybindings: [monaco.KeyCode.Tab],
      precondition: undefined,
      run: () => {
        const store = useCompletionStore.getState()
        if (store.ghostText && store.triggerLine && store.triggerColumn) {
          const model = editor.getModel()
          if (!model) return

          // Insert the ghost text
          editor.executeEdits('ghost-text', [{
            range: {
              startLineNumber: store.triggerLine,
              startColumn: store.triggerColumn,
              endLineNumber: store.triggerLine,
              endColumn: store.triggerColumn,
            },
            text: store.ghostText,
          }])

          clear()
        } else {
          // If no ghost text, do normal tab
          editor.trigger('keyboard', 'tab', null)
        }
      },
    })

    return () => action.dispose()
  }, [editor, monaco, clear])

  // Render nothing - this is a behavior-only component
  return null
}
