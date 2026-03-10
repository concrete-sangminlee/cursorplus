import { useEffect } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { useEditorStore } from '@/store/editor'
import TabBar from '@/components/TabBar'

export default function EditorPanel() {
  const { openFiles, activeFilePath, updateFileContent } = useEditorStore()

  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const handleChange = (value: string | undefined) => {
    if (activeFilePath && value !== undefined) {
      updateFileContent(activeFilePath, value)
    }
  }

  // Save file on Ctrl+S
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (activeFile) {
          await window.api.writeFile(activeFile.path, activeFile.content)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeFile])

  return (
    <div className="h-full flex flex-col">
      <TabBar />
      <div className="flex-1">
        {activeFile ? (
          <Editor
            theme="vs-dark"
            language={activeFile.language}
            value={activeFile.content}
            onChange={handleChange}
            options={{
              fontSize: 14,
              fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
              minimap: { enabled: true },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              padding: { top: 12 },
            }}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-text-muted">
            <span className="text-4xl mb-4">⚡</span>
            <h2 className="text-lg font-semibold text-text-secondary mb-2">CursorPlus</h2>
            <p className="text-xs">Open a file or folder to get started</p>
            <div className="mt-4 text-xs space-y-1 text-center">
              <p><kbd className="bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary">Ctrl+O</kbd> Open Folder</p>
              <p><kbd className="bg-bg-secondary px-1.5 py-0.5 rounded text-text-secondary">Ctrl+L</kbd> AI Chat</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
