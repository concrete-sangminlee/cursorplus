import { useEditorStore } from '@/store/editor'

export default function TabBar() {
  const { openFiles, activeFilePath, setActiveFile, closeFile } = useEditorStore()

  if (openFiles.length === 0) return null

  return (
    <div className="h-9 bg-bg-tertiary border-b border-border-primary flex items-center px-2 gap-0.5 overflow-x-auto">
      {openFiles.map((file) => (
        <div
          key={file.path}
          onClick={() => setActiveFile(file.path)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-xs cursor-pointer whitespace-nowrap
            ${activeFilePath === file.path
              ? 'bg-bg-secondary border border-border-primary border-b-bg-secondary -mb-px text-accent-blue'
              : 'text-text-secondary hover:text-text-primary'}`}
        >
          {file.aiModified && <span className="text-accent-green text-[10px]">●</span>}
          <span>{file.name}</span>
          {file.isModified && <span className="text-accent-orange text-[10px]">●</span>}
          {file.aiModified && (
            <span className="text-[8px] text-accent-green bg-accent-green/10 px-1 rounded">AI</span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); closeFile(file.path) }}
            className="text-text-muted hover:text-text-primary ml-1 text-[10px]"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
