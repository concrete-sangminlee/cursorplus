import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react'
import { useChatStore } from '@/store/chat'
import { useChatHistoryStore, type Conversation } from '@/store/chatHistory'
import { v4 as uuid } from 'uuid'
import {
  Sparkles, Bot, User, Zap, MessageSquare,
  ArrowUp, Paperclip, AtSign, CheckCircle2, Loader2, Circle,
  ChevronDown, Copy, Check, Code, Lightbulb, Wrench, BookOpen,
  Play, Trash2, FileCode, X, Plus, PanelLeftClose, PanelLeftOpen,
  MoreHorizontal, Pencil,
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ChatMessage } from '@shared/types'
import { useEditorStore } from '@/store/editor'
import { useToastStore } from '@/store/toast'

/* ── Model definitions ─────────────────────────────────── */

const apiModels = [
  { id: 'Claude Opus', label: 'Claude', color: '#bc8cff' },
  { id: 'GPT-5.3', label: 'GPT-5', color: '#3fb950' },
  { id: 'Kimi K2.5', label: 'Kimi', color: '#f78166' },
  { id: 'Gemini', label: 'Gemini', color: '#58a6ff' },
]

const nvidiaModels = [
  { id: 'NVIDIA Llama', label: 'Llama 3.3', color: '#76b900' },
  { id: 'NVIDIA Nemotron', label: 'Nemotron', color: '#76b900' },
  { id: 'DeepSeek R1', label: 'DeepSeek', color: '#76b900' },
  { id: 'Qwen 2.5', label: 'Qwen', color: '#76b900' },
]

/* ── Simple markdown renderer ──────────────────────────── */

function renderMarkdown(text: string): ReactNode[] {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')
  let i = 0
  let blockKey = 0

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code blocks
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // skip closing ```
      blocks.push(
        <CodeBlock key={blockKey++} language={lang} code={codeLines.join('\n')} />
      )
      continue
    }

    // Headers
    if (line.startsWith('### ')) {
      blocks.push(
        <h4
          key={blockKey++}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: '14px 0 6px',
            lineHeight: 1.4,
          }}
        >
          {renderInline(line.slice(4))}
        </h4>
      )
      i++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(
        <h3
          key={blockKey++}
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: '16px 0 6px',
            lineHeight: 1.4,
          }}
        >
          {renderInline(line.slice(3))}
        </h3>
      )
      i++
      continue
    }
    if (line.startsWith('# ')) {
      blocks.push(
        <h2
          key={blockKey++}
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--text-primary)',
            margin: '18px 0 8px',
            lineHeight: 1.4,
          }}
        >
          {renderInline(line.slice(2))}
        </h2>
      )
      i++
      continue
    }

    // Bullet lists
    if (/^[\s]*[-*]\s/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^[\s]*[-*]\s/.test(lines[i])) {
        const content = lines[i].replace(/^[\s]*[-*]\s/, '')
        items.push(
          <li
            key={items.length}
            style={{
              fontSize: 12.5,
              lineHeight: 1.65,
              color: 'var(--text-primary)',
              paddingLeft: 4,
              position: 'relative',
            }}
          >
            {renderInline(content)}
          </li>
        )
        i++
      }
      blocks.push(
        <ul
          key={blockKey++}
          style={{
            margin: '6px 0',
            paddingLeft: 18,
            listStyleType: 'disc',
          }}
        >
          {items}
        </ul>
      )
      continue
    }

    // Numbered lists
    if (/^\d+\.\s/.test(line)) {
      const items: ReactNode[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const content = lines[i].replace(/^\d+\.\s/, '')
        items.push(
          <li
            key={items.length}
            style={{
              fontSize: 12.5,
              lineHeight: 1.65,
              color: 'var(--text-primary)',
              paddingLeft: 4,
            }}
          >
            {renderInline(content)}
          </li>
        )
        i++
      }
      blocks.push(
        <ol
          key={blockKey++}
          style={{
            margin: '6px 0',
            paddingLeft: 18,
            listStyleType: 'decimal',
          }}
        >
          {items}
        </ol>
      )
      continue
    }

    // Empty lines
    if (line.trim() === '') {
      i++
      continue
    }

    // Regular paragraph — collect consecutive non-empty lines
    const paraLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trimStart().startsWith('```') &&
      !lines[i].startsWith('#') &&
      !/^[\s]*[-*]\s/.test(lines[i]) &&
      !/^\d+\.\s/.test(lines[i])
    ) {
      paraLines.push(lines[i])
      i++
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p
          key={blockKey++}
          style={{
            fontSize: 12.5,
            lineHeight: 1.65,
            color: 'var(--text-primary)',
            margin: '4px 0',
            wordBreak: 'break-word',
          }}
        >
          {renderInline(paraLines.join(' '))}
        </p>
      )
    }
  }

  return blocks
}

/** Renders inline formatting: bold, italic, inline code */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = []
  // Match: `code`, **bold**, *italic*
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    // Push text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const segment = match[0]
    if (segment.startsWith('`')) {
      parts.push(
        <code
          key={key++}
          style={{
            fontSize: '0.9em',
            fontFamily: 'var(--font-mono, monospace)',
            background: 'rgba(255,255,255,0.06)',
            color: '#e2b657',
            padding: '1px 5px',
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {segment.slice(1, -1)}
        </code>
      )
    } else if (segment.startsWith('**')) {
      parts.push(
        <strong key={key++} style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          {segment.slice(2, -2)}
        </strong>
      )
    } else if (segment.startsWith('*')) {
      parts.push(
        <em key={key++} style={{ fontStyle: 'italic', color: 'var(--text-primary)' }}>
          {segment.slice(1, -1)}
        </em>
      )
    }
    lastIndex = match.index + segment.length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts
}

/* ── Code block component with copy ────────────────────── */

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const [applied, setApplied] = useState(false)
  const { openFiles, activeFilePath, updateFileContent } = useEditorStore()
  const { addToast } = useToastStore()

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleApply = async () => {
    const activeFile = openFiles.find((f) => f.path === activeFilePath)
    if (!activeFile || !activeFilePath) {
      addToast({ type: 'error', message: 'No file open to apply code' })
      return
    }
    updateFileContent(activeFilePath, code)
    try {
      await window.api.writeFile(activeFilePath, code)
    } catch {
      // file was still updated in-memory
    }
    const filename = activeFilePath.split(/[\\/]/).pop() || activeFilePath
    addToast({ type: 'success', message: `Code applied to ${filename}` })
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  // Map common language aliases to what react-syntax-highlighter expects
  const langMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    tsx: 'tsx',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    yml: 'yaml',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    md: 'markdown',
    cs: 'csharp',
    'c++': 'cpp',
    'c#': 'csharp',
  }
  const highlightLang = langMap[language.toLowerCase()] || language.toLowerCase() || 'text'

  return (
    <div
      style={{
        margin: '8px 0',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        background: '#282c34',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3"
        style={{
          height: 32,
          background: 'rgba(255,255,255,0.04)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'lowercase',
            letterSpacing: '0.02em',
          }}
        >
          {language || 'code'}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleApply}
            className="flex items-center gap-1 transition-colors duration-100"
            style={{
              fontSize: 10,
              color: applied ? 'var(--accent-green)' : 'var(--accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              if (!applied) e.currentTarget.style.color = 'var(--accent-purple)'
            }}
            onMouseLeave={(e) => {
              if (!applied) e.currentTarget.style.color = 'var(--accent)'
            }}
          >
            {applied ? <Check size={11} /> : <Play size={11} />}
            {applied ? 'Applied' : 'Apply'}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 transition-colors duration-100"
            style={{
              fontSize: 10,
              color: copied ? 'var(--accent-green)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
            }}
            onMouseEnter={(e) => {
              if (!copied) e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={(e) => {
              if (!copied) e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {/* Syntax-highlighted code */}
      <SyntaxHighlighter
        language={highlightLang}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '12px 14px',
          fontSize: 12,
          lineHeight: 1.6,
          background: 'transparent',
          border: 'none',
          borderRadius: 0,
          tabSize: 2,
        }}
        codeTagProps={{
          style: {
            fontFamily:
              "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
          },
        }}
        showLineNumbers={false}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

/* ── Relative timestamp formatter ──────────────────────── */

function formatTime(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(ts).toLocaleDateString()
}

/* ── Thinking / streaming indicator ───────────────────── */

function ThinkingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
      <span className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'thinking 1.4s ease-in-out infinite', animationDelay: '0s' }} />
      <span className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'thinking 1.4s ease-in-out infinite', animationDelay: '0.2s' }} />
      <span className="thinking-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'thinking 1.4s ease-in-out infinite', animationDelay: '0.4s' }} />
      <style>{`
        @keyframes thinking {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

function StreamingDots() {
  return (
    <div className="flex items-center gap-1" style={{ padding: '12px 0' }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: 6,
          flexShrink: 0,
          marginTop: 1,
          background: 'linear-gradient(135deg, rgba(188,140,255,0.15), rgba(88,166,255,0.15))',
          border: '1px solid rgba(188,140,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Bot size={12} style={{ color: 'var(--accent-purple)' }} />
      </div>
      <div className="flex items-center gap-1 ml-2.5" style={{ height: 24 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--accent-purple)',
              opacity: 0.4,
              animation: `thinking-dot 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
        <style>{`
          @keyframes thinking-dot {
            0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
            40% { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </div>
    </div>
  )
}

/* ── Message bubble ────────────────────────────────────── */

function MessageBubble({ message, showThinking }: { message: ChatMessage; showThinking?: boolean }) {
  const isUser = message.role === 'user'
  const rendered = useMemo(
    () => (isUser ? null : renderMarkdown(message.content)),
    [message.content, isUser],
  )

  return (
    <div
      className="group"
      style={{
        padding: '10px 0',
        ...(isUser
          ? {
              background: 'rgba(88, 166, 255, 0.06)',
              borderLeft: '2px solid var(--accent)',
              paddingLeft: 10,
              marginLeft: -12,
              marginRight: -12,
              paddingRight: 12,
            }
          : {}),
      }}
    >
      <div className="flex items-start gap-2.5">
        {/* Avatar */}
        {isUser ? (
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              flexShrink: 0,
              marginTop: 1,
              background: 'rgba(88,166,255,0.1)',
              border: '1px solid rgba(88,166,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User size={12} style={{ color: 'var(--accent)' }} />
          </div>
        ) : (
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {message.agentName?.[0] || 'A'}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5" style={{ marginBottom: 4 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isUser ? 'var(--text-primary)' : 'var(--accent-purple)',
              }}
            >
              {isUser ? 'You' : message.agentName || 'AI'}
            </span>
            {message.model && (
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  background: 'rgba(255,255,255,0.04)',
                  padding: '1px 5px',
                  borderRadius: 3,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {message.model}
              </span>
            )}
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginLeft: 'auto',
              }}
            >
              {formatTime(message.timestamp)}
            </span>
          </div>

          {/* Message body */}
          {isUser ? (
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.65,
                color: 'var(--text-primary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {message.content}
            </div>
          ) : (
            <div>
              {rendered}
              {showThinking && <ThinkingIndicator />}
            </div>
          )}

          {/* Task Progress */}
          {message.taskProgress && (
            <div
              style={{
                marginTop: 10,
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 8,
                padding: 10,
              }}
            >
              {message.taskProgress.map((task, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2"
                  style={{ padding: '3px 0', fontSize: 11 }}
                >
                  {task.status === 'done' ? (
                    <CheckCircle2
                      size={13}
                      style={{ color: 'var(--accent-green)', flexShrink: 0 }}
                    />
                  ) : task.status === 'working' ? (
                    <Loader2
                      size={13}
                      className="anim-spin"
                      style={{ color: 'var(--accent)', flexShrink: 0 }}
                    />
                  ) : (
                    <Circle
                      size={13}
                      style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                    />
                  )}
                  <span
                    style={{
                      color:
                        task.status === 'done'
                          ? 'var(--text-muted)'
                          : 'var(--text-primary)',
                      textDecoration:
                        task.status === 'done' ? 'line-through' : 'none',
                      opacity: task.status === 'done' ? 0.7 : 1,
                    }}
                  >
                    {task.name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Model selector dropdown ───────────────────────────── */

function ModelDropdown({
  models,
  selectedModel,
  onSelect,
}: {
  models: { id: string; label: string; color: string }[]
  selectedModel: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = models.find((m) => m.id === selectedModel)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 transition-colors duration-100"
        style={{
          fontSize: 10,
          padding: '3px 8px',
          borderRadius: 5,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          color: current?.color || 'var(--text-muted)',
          fontWeight: 500,
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-bright)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border)'
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: current?.color || 'var(--text-muted)',
            flexShrink: 0,
          }}
        />
        {current?.label || selectedModel}
        <ChevronDown
          size={10}
          style={{
            transition: 'transform 0.15s',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            minWidth: 180,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 4,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            zIndex: 50,
          }}
        >
          {/* API Models */}
          <div
            style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              padding: '4px 8px 2px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            API Models
          </div>
          {models
            .filter((m) => !nvidiaModels.some((n) => n.id === m.id))
            .map((model) => (
              <DropdownItem
                key={model.id}
                model={model}
                isSelected={selectedModel === model.id}
                onSelect={() => {
                  onSelect(model.id)
                  setOpen(false)
                }}
              />
            ))}

          {/* NIM Divider */}
          <div
            style={{
              height: 1,
              background: 'var(--border)',
              margin: '4px 8px',
            }}
          />
          <div
            style={{
              fontSize: 9,
              color: '#76b900',
              padding: '4px 8px 2px',
              fontWeight: 600,
              letterSpacing: '0.06em',
            }}
          >
            NVIDIA NIM
          </div>
          {models
            .filter((m) => nvidiaModels.some((n) => n.id === m.id))
            .map((model) => (
              <DropdownItem
                key={model.id}
                model={model}
                isSelected={selectedModel === model.id}
                onSelect={() => {
                  onSelect(model.id)
                  setOpen(false)
                }}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function DropdownItem({
  model,
  isSelected,
  onSelect,
}: {
  model: { id: string; label: string; color: string }
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      className="flex items-center gap-2 w-full transition-colors duration-75"
      style={{
        fontSize: 11,
        padding: '5px 8px',
        borderRadius: 5,
        background: isSelected ? model.color + '15' : 'transparent',
        color: isSelected ? model.color : 'var(--text-secondary)',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
      onMouseEnter={(e) => {
        if (!isSelected)
          e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: model.color,
          flexShrink: 0,
          opacity: isSelected ? 1 : 0.5,
        }}
      />
      <span style={{ flex: 1 }}>{model.label}</span>
      {isSelected && (
        <Check size={11} style={{ color: model.color, flexShrink: 0 }} />
      )}
    </button>
  )
}

/* ── Relative date formatter for conversation list ─────── */

function formatRelativeDate(ts: number): string {
  const now = Date.now()
  const diff = Math.floor((now - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  const days = Math.floor(diff / 86400)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(ts).toLocaleDateString()
}

/* ── Conversation list sidebar ─────────────────────────── */

function ConversationSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean
  onToggle: () => void
}) {
  const {
    conversations,
    activeConversationId,
    createConversation,
    switchConversation,
    deleteConversation,
    renameConversation,
  } = useChatHistoryStore()
  const { loadMessages, clearMessages } = useChatStore()
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleNewChat = useCallback(() => {
    createConversation()
    clearMessages()
  }, [createConversation, clearMessages])

  const handleSwitch = useCallback(
    (convo: Conversation) => {
      if (convo.id === activeConversationId) return
      switchConversation(convo.id)
      loadMessages(convo.messages)
    },
    [activeConversationId, switchConversation, loadMessages],
  )

  const handleDelete = useCallback(
    (id: string) => {
      const historyStore = useChatHistoryStore.getState()
      deleteConversation(id)
      setMenuOpenId(null)
      // If we deleted the active one, load the next conversation's messages
      if (id === activeConversationId) {
        const remaining = historyStore.conversations.filter((c) => c.id !== id)
        if (remaining.length > 0) {
          loadMessages(remaining[0].messages)
        } else {
          clearMessages()
        }
      }
    },
    [activeConversationId, deleteConversation, loadMessages, clearMessages],
  )

  const handleRenameStart = useCallback(
    (convo: Conversation) => {
      setRenamingId(convo.id)
      setRenameValue(convo.title)
      setMenuOpenId(null)
    },
    [],
  )

  const handleRenameSubmit = useCallback(
    (id: string) => {
      const trimmed = renameValue.trim()
      if (trimmed) {
        renameConversation(id, trimmed)
      }
      setRenamingId(null)
    },
    [renameValue, renameConversation],
  )

  // Sorted by most recently updated
  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )

  if (collapsed) {
    return (
      <div
        style={{
          width: 36,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 6,
          gap: 4,
        }}
      >
        <button
          onClick={onToggle}
          title="Show conversations"
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <PanelLeftOpen size={14} />
        </button>
        <button
          onClick={handleNewChat}
          title="New chat"
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(88,166,255,0.1)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-tertiary)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar header */}
      <div
        className="flex items-center px-2"
        style={{
          height: 38,
          borderBottom: '1px solid var(--border)',
          gap: 4,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onToggle}
          title="Hide conversations"
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <PanelLeftClose size={14} />
        </button>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-secondary)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          History
        </span>
        <button
          onClick={handleNewChat}
          title="New chat"
          className="flex items-center gap-1"
          style={{
            fontSize: 10,
            padding: '3px 8px',
            borderRadius: 5,
            background: 'rgba(88,166,255,0.1)',
            border: '1px solid rgba(88,166,255,0.2)',
            color: 'var(--accent)',
            fontWeight: 500,
            cursor: 'pointer',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(88,166,255,0.18)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(88,166,255,0.1)'
          }}
        >
          <Plus size={10} />
          New
        </button>
      </div>

      {/* Conversation list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 4,
        }}
      >
        {sortedConversations.length === 0 ? (
          <div
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              fontSize: 11,
              color: 'var(--text-muted)',
              lineHeight: 1.5,
            }}
          >
            No conversations yet.
            <br />
            Start a new chat!
          </div>
        ) : (
          sortedConversations.map((convo) => {
            const isActive = convo.id === activeConversationId
            const isRenaming = renamingId === convo.id

            return (
              <div
                key={convo.id}
                className="group"
                style={{
                  position: 'relative',
                  padding: '6px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isActive ? 'rgba(88,166,255,0.08)' : 'transparent',
                  border: isActive
                    ? '1px solid rgba(88,166,255,0.15)'
                    : '1px solid transparent',
                  marginBottom: 2,
                  transition: 'background 0.1s, border-color 0.1s',
                }}
                onClick={() => handleSwitch(convo)}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                  }
                }}
              >
                {/* Title row */}
                <div className="flex items-center gap-1" style={{ minHeight: 18 }}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(convo.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameSubmit(convo.id)
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        flex: 1,
                        fontSize: 11,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--accent)',
                        borderRadius: 3,
                        padding: '1px 4px',
                        outline: 'none',
                        minWidth: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        flex: 1,
                        fontSize: 11,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {convo.title}
                    </span>
                  )}

                  {/* Hover actions */}
                  {!isRenaming && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpenId(menuOpenId === convo.id ? null : convo.id)
                      }}
                      className="transition-opacity duration-75"
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        opacity: menuOpenId === convo.id ? 1 : 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                        e.currentTarget.style.color = 'var(--text-secondary)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--text-muted)'
                      }}
                    >
                      <MoreHorizontal size={12} />
                    </button>
                  )}
                </div>

                {/* Meta row */}
                <div
                  className="flex items-center gap-2"
                  style={{ marginTop: 2 }}
                >
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {formatRelativeDate(convo.updatedAt)}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {convo.messages.length} msg{convo.messages.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Context menu */}
                {menuOpenId === convo.id && (
                  <div
                    ref={menuRef}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 4,
                      zIndex: 60,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 3,
                      boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
                      minWidth: 120,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleRenameStart(convo)}
                      className="flex items-center gap-2 w-full"
                      style={{
                        fontSize: 11,
                        padding: '5px 8px',
                        borderRadius: 4,
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <Pencil size={11} />
                      Rename
                    </button>
                    <button
                      onClick={() => handleDelete(convo.id)}
                      className="flex items-center gap-2 w-full"
                      style={{
                        fontSize: 11,
                        padding: '5px 8px',
                        borderRadius: 4,
                        background: 'transparent',
                        color: '#f85149',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(248,81,73,0.08)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <Trash2 size={11} />
                      Delete
                    </button>
                  </div>
                )}

                {/* Make the hover "..." visible on group hover via CSS */}
                <style>{`
                  .group:hover button[class*="transition-opacity"] {
                    opacity: 1 !important;
                  }
                `}</style>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/* ── Main chat panel ───────────────────────────────────── */

export default function ChatPanel() {
  const {
    messages,
    mode,
    selectedModel,
    isStreaming,
    addMessage,
    setMode,
    setModel,
    clearMessages,
    loadMessages,
    ollamaAvailable,
    ollamaModels,
  } = useChatStore()

  const {
    activeConversationId,
    createConversation,
  } = useChatHistoryStore()

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // On first mount, ensure there is an active conversation
  useEffect(() => {
    if (!activeConversationId) {
      createConversation()
    } else {
      // Load messages from the persisted active conversation
      const convo = useChatHistoryStore.getState().getActiveConversation()
      if (convo && convo.messages.length > 0) {
        loadMessages(convo.messages)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const allModels = [
    {
      id: 'Ollama',
      label: ollamaAvailable ? `Ollama (${ollamaModels[0] || 'local'})` : 'Ollama',
      color: '#76e3ea',
    },
    ...apiModels,
    ...nvidiaModels,
  ]

  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const mentionRef = useRef<HTMLDivElement>(null)

  /* ── File context state ────────────────────────────────── */
  const activeFilePath = useEditorStore((s) => s.activeFilePath)
  const openFiles = useEditorStore((s) => s.openFiles)
  const activeFile = openFiles.find((f) => f.path === activeFilePath)

  const [includeContext, setIncludeContext] = useState(true)
  const [selectionText, setSelectionText] = useState<string | null>(null)
  const [showMentionDropdown, setShowMentionDropdown] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionedFiles, setMentionedFiles] = useState<string[]>([])

  // Listen for selection context from editor
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ text: string }>).detail
      if (detail?.text) {
        setSelectionText(detail.text)
      }
    }
    window.addEventListener('orion:selection-for-chat', handler)
    return () => window.removeEventListener('orion:selection-for-chat', handler)
  }, [])

  // Clear selection when active file changes
  useEffect(() => {
    setSelectionText(null)
  }, [activeFilePath])

  // Close mention dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mentionRef.current && !mentionRef.current.contains(e.target as Node)) {
        setShowMentionDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Listen for AI context-menu actions from EditorPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const { action, selectedText, filePath, language, fullContext } = detail as {
        action: string
        selectedText: string
        filePath: string
        language: string
        fullContext?: string
      }

      if (action === 'explain') {
        // "AI: Explain Selection" -- send to chat as a user question
        const fileName = filePath?.replace(/\\/g, '/').split('/').pop() || 'unknown'
        const userMsg = `Explain this code from ${fileName}:\n\`\`\`${language}\n${selectedText}\n\`\`\``
        addMessage({
          id: uuid(),
          role: 'user',
          content: userMsg,
          timestamp: Date.now(),
        })
        // Dispatch to AI backend
        window.api?.omoSend({
          type: 'chat',
          payload: {
            message: `Please explain the following code in detail:\n\`\`\`${language}\n${selectedText}\n\`\`\``,
            mode: 'chat',
            model: selectedModel,
          },
        })
      } else if (action === 'refactor' || action === 'add-comments' || action === 'fix-issues') {
        // Build instruction per action type
        let instruction = ''
        if (action === 'refactor') {
          instruction = 'Refactor the following code for better readability, performance, and best practices.'
        } else if (action === 'add-comments') {
          instruction = 'Add clear, helpful inline comments to the following code. Keep the code unchanged, only add comments.'
        } else if (action === 'fix-issues') {
          instruction = 'Analyze the following code for bugs, potential issues, and anti-patterns, then fix them.'
        }

        const aiMessage = `You are editing code inline. The user selected this code:\n\`\`\`\n${selectedText}\n\`\`\`\n\n${fullContext ? `From this file:\n\`\`\`${language}\n${fullContext}\n\`\`\`\n\n` : ''}Instruction: ${instruction}\n\nRespond with ONLY the replacement code, no explanation, no markdown fences. Just the raw code that should replace the selection.`

        window.api?.omoSend({
          type: 'chat',
          payload: { message: aiMessage, mode: 'chat', model: 'inline-edit' },
        })

        // Listen for the response and forward it as a context-response event
        const respHandler = (evt: any) => {
          if (evt?.detail?.type === 'inline-edit-response') {
            const suggestedCode = evt.detail.content
            if (suggestedCode) {
              window.dispatchEvent(
                new CustomEvent('orion:ai-context-response', {
                  detail: {
                    action,
                    suggestedCode,
                    originalText: selectedText,
                  },
                }),
              )
            }
            window.removeEventListener('orion:inline-edit-response', respHandler)
          }
        }
        window.addEventListener('orion:inline-edit-response', respHandler)

        // Timeout fallback
        setTimeout(() => {
          window.removeEventListener('orion:inline-edit-response', respHandler)
        }, 30000)
      }
    }
    window.addEventListener('orion:ai-context-action', handler)
    return () => window.removeEventListener('orion:ai-context-action', handler)
  }, [addMessage, selectedModel])

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages])

  const handleSend = () => {
    if (!input.trim()) return

    const userText = input.trim()

    // Build context-enriched message for the AI
    let aiMessage = userText

    if (includeContext) {
      // Gather mentioned file contents
      const mentionedFileContents = mentionedFiles
        .map((path) => openFiles.find((f) => f.path === path))
        .filter(Boolean)
        .map((f) => `[Referenced file: ${f!.name}]\n\`\`\`${f!.language}\n${f!.content}\n\`\`\``)
        .join('\n\n')

      if (selectionText && activeFile) {
        // Selection takes priority over full file content
        aiMessage = `[Current file: ${activeFile.name} (selection)]\n\`\`\`${activeFile.language}\n${selectionText}\n\`\`\`\n\n${mentionedFileContents ? mentionedFileContents + '\n\n' : ''}User question: ${userText}`
      } else if (activeFile) {
        aiMessage = `[Current file: ${activeFile.name}]\n\`\`\`${activeFile.language}\n${activeFile.content}\n\`\`\`\n\n${mentionedFileContents ? mentionedFileContents + '\n\n' : ''}User question: ${userText}`
      } else if (mentionedFileContents) {
        aiMessage = `${mentionedFileContents}\n\nUser question: ${userText}`
      }
    }

    addMessage({
      id: uuid(),
      role: 'user',
      content: userText,
      timestamp: Date.now(),
    })
    window.api?.omoSend({
      type: 'chat',
      payload: { message: aiMessage, mode, model: selectedModel },
    })
    setInput('')
    setMentionedFiles([])
    setSelectionText(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape' && showMentionDropdown) {
      setShowMentionDropdown(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)

    // Detect @ mentions
    const cursorPos = e.target.selectionStart ?? val.length
    const textBeforeCursor = val.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@(\S*)$/)

    if (atMatch) {
      setShowMentionDropdown(true)
      setMentionQuery(atMatch[1].toLowerCase())
    } else {
      setShowMentionDropdown(false)
      setMentionQuery('')
    }
  }

  const handleMentionSelect = (file: { path: string; name: string }) => {
    // Replace the @query with @filename in the input
    const cursorPos = input.length
    const textBeforeCursor = input.slice(0, cursorPos)
    const atMatch = textBeforeCursor.match(/@(\S*)$/)
    if (atMatch) {
      const before = input.slice(0, atMatch.index!)
      const after = input.slice(atMatch.index! + atMatch[0].length)
      setInput(before + '@' + file.name + ' ' + after)
    }
    if (!mentionedFiles.includes(file.path)) {
      setMentionedFiles((prev) => [...prev, file.path])
    }
    setShowMentionDropdown(false)
  }

  const filteredMentionFiles = openFiles.filter(
    (f) =>
      f.name.toLowerCase().includes(mentionQuery) &&
      !mentionedFiles.includes(f.path),
  )

  return (
    <div
      className="h-full flex"
      style={{
        borderLeft: '1px solid var(--border)',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Conversation history sidebar */}
      <ConversationSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="shrink-0 flex items-center px-3"
        style={{
          height: 38,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
        }}
      >
        <Sparkles size={13} style={{ color: 'var(--accent)', marginRight: 8 }} />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          AI Chat
        </span>

        {/* Mode Toggle */}
        <div
          className="ml-auto flex items-center"
          style={{
            background: 'var(--bg-primary)',
            borderRadius: 6,
            padding: 2,
            border: '1px solid var(--border)',
          }}
        >
          {[
            { m: 'agent' as const, label: 'Agent', Icon: Zap, color: '#3fb950' },
            { m: 'chat' as const, label: 'Chat', Icon: MessageSquare, color: '#58a6ff' },
          ].map(({ m, label, Icon, color }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="flex items-center gap-1 transition-all duration-150"
              style={{
                fontSize: 10,
                padding: '3px 8px',
                borderRadius: 4,
                fontWeight: mode === m ? 600 : 400,
                background: mode === m ? color + '18' : 'transparent',
                color: mode === m ? color : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Icon size={10} />
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            createConversation()
            clearMessages()
          }}
          title="New chat"
          className="flex items-center justify-center transition-colors duration-100"
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            marginLeft: 6,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.background = 'transparent'
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3">
        {messages.length === 0 ? (
          <EmptyChat />
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1
              const isLastAssistantEmpty =
                isLast &&
                isStreaming &&
                msg.role === 'assistant' &&
                msg.content.trim().length < 10
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  showThinking={isLastAssistantEmpty}
                />
              )
            })}
            {isStreaming &&
              (messages.length === 0 ||
                messages[messages.length - 1].role !== 'assistant') && (
                <StreamingDots />
              )}
          </>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        {/* Context badge */}
        {activeFile && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 12px',
              fontSize: 11,
              color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
              marginBottom: 6,
            }}
          >
            <FileCode size={12} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Context: {activeFile.name}
              {selectionText && (
                <span style={{ color: 'var(--accent-purple)', marginLeft: 4 }}>
                  (selection)
                </span>
              )}
            </span>
            <button
              onClick={() => setIncludeContext(!includeContext)}
              style={{
                fontSize: 10,
                padding: '1px 8px',
                borderRadius: 4,
                border: '1px solid',
                borderColor: includeContext ? 'var(--accent)' : 'var(--border)',
                background: includeContext ? 'rgba(88,166,255,0.1)' : 'transparent',
                color: includeContext ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {includeContext ? 'Attached' : 'Detached'}
            </button>
          </div>
        )}

        {/* Mentioned files badges */}
        {mentionedFiles.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              padding: '2px 4px 6px',
            }}
          >
            {mentionedFiles.map((path) => {
              const f = openFiles.find((of) => of.path === path)
              return (
                <span
                  key={path}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 4,
                    background: 'rgba(188,140,255,0.1)',
                    color: 'var(--accent-purple)',
                    border: '1px solid rgba(188,140,255,0.2)',
                  }}
                >
                  <FileCode size={10} />
                  {f?.name || path.split(/[\\/]/).pop()}
                  <button
                    onClick={() =>
                      setMentionedFiles((prev) => prev.filter((p) => p !== path))
                    }
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={10} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div
          className="transition-colors duration-150"
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            position: 'relative',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          {/* @ mention dropdown */}
          {showMentionDropdown && filteredMentionFiles.length > 0 && (
            <div
              ref={mentionRef}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: 4,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 4,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                zIndex: 50,
                maxHeight: 180,
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  padding: '4px 8px 2px',
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                Open Files
              </div>
              {filteredMentionFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => handleMentionSelect(file)}
                  className="flex items-center gap-2 w-full transition-colors duration-75"
                  style={{
                    fontSize: 11,
                    padding: '5px 8px',
                    borderRadius: 5,
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <FileCode size={12} style={{ color: 'var(--accent-purple)', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.name}
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono, monospace)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: 140,
                    }}
                  >
                    {file.path}
                  </span>
                </button>
              ))}
            </div>
          )}

          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'agent'
                ? 'Ask the agent to do something... (type @ to mention a file)'
                : 'Ask anything... (type @ to mention a file)'
            }
            rows={1}
            style={{
              width: '100%',
              background: 'transparent',
              fontSize: 12.5,
              color: 'var(--text-primary)',
              padding: '12px 14px 6px',
              resize: 'none',
              outline: 'none',
              border: 'none',
              minHeight: 38,
              maxHeight: 120,
            }}
          />
          <div className="flex items-center px-2 pb-2">
            <button
              style={{
                padding: 6,
                color: 'var(--text-muted)',
                borderRadius: 4,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Attach file"
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <Paperclip size={13} />
            </button>
            <button
              onClick={() => {
                setShowMentionDropdown(!showMentionDropdown)
                setMentionQuery('')
              }}
              style={{
                padding: 6,
                color: showMentionDropdown ? 'var(--accent)' : 'var(--text-muted)',
                borderRadius: 4,
                background: showMentionDropdown ? 'rgba(88,166,255,0.1)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Mention file (@)"
              onMouseEnter={(e) => {
                if (!showMentionDropdown) {
                  e.currentTarget.style.color = 'var(--text-secondary)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (!showMentionDropdown) {
                  e.currentTarget.style.color = 'var(--text-muted)'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <AtSign size={13} />
            </button>

            <div className="ml-auto flex items-center gap-2">
              <ModelDropdown
                models={allModels}
                selectedModel={selectedModel}
                onSelect={setModel}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="transition-all duration-150"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: input.trim()
                    ? 'var(--accent)'
                    : 'var(--bg-hover)',
                  color: input.trim() ? '#fff' : 'var(--text-muted)',
                  cursor: input.trim() ? 'pointer' : 'default',
                  border: 'none',
                  boxShadow: input.trim()
                    ? '0 2px 8px rgba(88,166,255,0.2)'
                    : 'none',
                }}
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>{/* end main chat area */}
    </div>
  )
}

/* ── Empty chat state ──────────────────────────────────── */

function EmptyChat() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-5 px-6">
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 18,
          background:
            'linear-gradient(135deg, rgba(88,166,255,0.1), rgba(188,140,255,0.12))',
          border: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}
      >
        <Sparkles size={28} style={{ color: 'var(--accent)' }} />
      </div>

      <div className="text-center">
        <h3
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 6,
          }}
        >
          How can I help?
        </h3>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
          }}
        >
          Ask questions, get code help, or let agents work autonomously
        </p>
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 260,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {[
          { icon: Code, text: '"Explain this codebase"' },
          { icon: Wrench, text: '"Fix the bug in auth.ts"' },
          { icon: Lightbulb, text: '"Add dark mode support"' },
          { icon: BookOpen, text: '"Write tests for utils.ts"' },
        ].map(({ icon: ExIcon, text }) => (
          <div
            key={text}
            className="flex items-center gap-2.5 transition-colors duration-100 cursor-pointer"
            style={{
              fontSize: 11,
              color: 'var(--text-secondary)',
              background: 'rgba(255,255,255,0.02)',
              padding: '9px 12px',
              borderRadius: 8,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
            }}
          >
            <ExIcon
              size={13}
              style={{ color: 'var(--text-muted)', flexShrink: 0 }}
            />
            {text}
          </div>
        ))}
      </div>
    </div>
  )
}
