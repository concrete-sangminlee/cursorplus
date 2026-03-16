import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import {
  MessageSquare,
  Send,
  X,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Trash2,
  Plus,
  Search,
  Sparkles,
  Code,
  FileText,
  FolderOpen,
  Globe,
  BookOpen,
  Terminal,
  GitBranch,
  Loader,
  AlertTriangle,
  Paperclip,
  ArrowDown,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Zap,
  Play,
  Square,
  Pin,
  Upload,
  Wand2,
  Eye,
  type LucideIcon,
} from 'lucide-react'
import {
  useAIConversationStore,
  type ChatMessage,
  type CodeBlock,
  type Attachment,
  type ConversationContext,
  type Conversation,
} from '@/store/aiConversation'
import { useEditorStore } from '@/store/editor'

// ── Injected Styles ──────────────────────────────────────────────────────────

const CHAT_STYLE_ID = 'orion-ai-chat-styles'

const CHAT_STYLES = `
@keyframes orion-chat-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes orion-chat-slide-in {
  from { opacity: 0; transform: translateX(16px); }
  to   { opacity: 1; transform: translateX(0); }
}
@keyframes orion-chat-pulse {
  0%, 100% { opacity: 0.4; }
  50%      { opacity: 1; }
}
@keyframes orion-chat-typing-dot {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
  40% { transform: scale(1); opacity: 1; }
}
@keyframes orion-chat-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes orion-chat-stream-cursor {
  0%, 49% { border-right-color: var(--orion-chat-accent, #8b5cf6); }
  50%, 100% { border-right-color: transparent; }
}
@keyframes orion-chat-bounce-in {
  0% { transform: scale(0.9); opacity: 0; }
  60% { transform: scale(1.02); }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes orion-chat-diff-added {
  from { background-color: rgba(35, 134, 54, 0.3); }
  to   { background-color: rgba(35, 134, 54, 0.15); }
}
@keyframes orion-chat-diff-removed {
  from { background-color: rgba(218, 54, 51, 0.3); }
  to   { background-color: rgba(218, 54, 51, 0.15); }
}
.orion-chat-scrollbar::-webkit-scrollbar { width: 6px; }
.orion-chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
.orion-chat-scrollbar::-webkit-scrollbar-thumb {
  background: var(--orion-chat-scrollbar, rgba(255,255,255,0.15));
  border-radius: 3px;
}
.orion-chat-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--orion-chat-scrollbar-hover, rgba(255,255,255,0.25));
}
.orion-chat-input-area textarea {
  scrollbar-width: thin;
  scrollbar-color: var(--orion-chat-scrollbar, rgba(255,255,255,0.15)) transparent;
}
.orion-chat-input-area textarea::-webkit-scrollbar { width: 4px; }
.orion-chat-input-area textarea::-webkit-scrollbar-track { background: transparent; }
.orion-chat-input-area textarea::-webkit-scrollbar-thumb {
  background: var(--orion-chat-scrollbar, rgba(255,255,255,0.15));
  border-radius: 2px;
}
`

function injectStyles() {
  if (typeof document === 'undefined') return
  if (document.getElementById(CHAT_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = CHAT_STYLE_ID
  style.textContent = CHAT_STYLES
  document.head.appendChild(style)
}

// ── Constants ────────────────────────────────────────────────────────────────

interface ModelOption {
  id: string
  name: string
  provider: string
  icon: string
  costPer1kInput: number
  costPer1kOutput: number
}

const MODELS: ModelOption[] = [
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', icon: '🟣', costPer1kInput: 0.003, costPer1kOutput: 0.015 },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic', icon: '🟣', costPer1kInput: 0.015, costPer1kOutput: 0.075 },
  { id: 'claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic', icon: '🟣', costPer1kInput: 0.00025, costPer1kOutput: 0.00125 },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', icon: '🟢', costPer1kInput: 0.005, costPer1kOutput: 0.015 },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI', icon: '🟢', costPer1kInput: 0.01, costPer1kOutput: 0.03 },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'Google', icon: '🔵', costPer1kInput: 0.0035, costPer1kOutput: 0.0105 },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'Google', icon: '🔵', costPer1kInput: 0.00035, costPer1kOutput: 0.00105 },
  { id: 'ollama-local', name: 'Ollama (Local)', provider: 'Ollama', icon: '🦙', costPer1kInput: 0, costPer1kOutput: 0 },
]

const CONTEXT_TYPES = [
  { id: 'file', label: '@file', icon: FileText, description: 'Reference a file' },
  { id: 'folder', label: '@folder', icon: FolderOpen, description: 'Reference a folder' },
  { id: 'web', label: '@web', icon: Globe, description: 'Search the web' },
  { id: 'docs', label: '@docs', icon: BookOpen, description: 'Search documentation' },
  { id: 'terminal', label: '@terminal', icon: Terminal, description: 'Terminal output' },
] as const

// ── Utility Helpers ──────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function formatTokenCost(tokens: number, model: ModelOption, isOutput: boolean): string {
  const rate = isOutput ? model.costPer1kOutput : model.costPer1kInput
  const cost = (tokens / 1000) * rate
  if (cost === 0) return 'Free'
  if (cost < 0.001) return `<$0.001`
  return `$${cost.toFixed(4)}`
}

function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000)
}

function highlightSyntax(code: string, lang: string): string {
  const escaped = escapeHtml(code)

  const jsKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|static|get|set|null|undefined|true|false|void|delete|super)\b/g
  const tsKeywords = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|static|get|set|null|undefined|true|false|void|delete|super|interface|type|enum|implements|namespace|abstract|declare|readonly|private|protected|public|as|keyof|infer|never|unknown|any)\b/g
  const pyKeywords = /\b(def|class|return|if|elif|else|for|while|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|and|or|not|in|is|None|True|False|self|global|nonlocal|assert|del|print)\b/g
  const rustKeywords = /\b(fn|let|mut|return|if|else|for|while|loop|match|break|continue|struct|enum|impl|trait|pub|use|mod|crate|self|super|where|async|await|move|ref|type|const|static|unsafe|extern|true|false)\b/g
  const goKeywords = /\b(func|return|if|else|for|range|switch|case|break|continue|var|const|type|struct|interface|map|chan|go|defer|select|package|import|nil|true|false)\b/g

  let keywords: RegExp
  const l = lang.toLowerCase()
  switch (l) {
    case 'javascript': case 'js': case 'jsx': keywords = jsKeywords; break
    case 'typescript': case 'ts': case 'tsx': keywords = tsKeywords; break
    case 'python': case 'py': keywords = pyKeywords; break
    case 'rust': case 'rs': keywords = rustKeywords; break
    case 'go': case 'golang': keywords = goKeywords; break
    default: keywords = tsKeywords
  }

  let result = escaped
  // Strings
  result = result.replace(/(["'`])(?:(?!\1|\\).|\\.)*?\1/g, '<span style="color:var(--orion-chat-syntax-string,#ce9178)">$&</span>')
  // Comments
  result = result.replace(/(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, '<span style="color:var(--orion-chat-syntax-comment,#6a9955)">$&</span>')
  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:var(--orion-chat-syntax-number,#b5cea8)">$&</span>')
  // Keywords
  result = result.replace(keywords, '<span style="color:var(--orion-chat-syntax-keyword,#569cd6)">$&</span>')

  return result
}

/** Parse markdown content into rendered HTML with code block extraction */
function parseMarkdown(content: string): { html: string; codeBlocks: ParsedCodeBlock[] } {
  const codeBlocks: ParsedCodeBlock[] = []
  let blockIndex = 0

  // Extract fenced code blocks
  let processed = content.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const id = `code-block-${blockIndex++}`
    const language = lang || 'text'
    codeBlocks.push({ id, language, code: code.trimEnd(), filePath: undefined })
    return `<CODE_BLOCK_${id}>`
  })

  // Inline code
  processed = processed.replace(/`([^`]+)`/g, '<code style="background:var(--orion-chat-code-bg,rgba(255,255,255,0.08));padding:1px 5px;border-radius:3px;font-size:0.88em;font-family:var(--orion-chat-mono,\'Cascadia Code\',\'Fira Code\',monospace)">$1</code>')

  // Bold
  processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  processed = processed.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Strikethrough
  processed = processed.replace(/~~(.+?)~~/g, '<del>$1</del>')

  // Headers
  processed = processed.replace(/^### (.+)$/gm, '<h4 style="margin:12px 0 4px;font-size:0.95em;font-weight:600">$1</h4>')
  processed = processed.replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 4px;font-size:1.05em;font-weight:600">$1</h3>')
  processed = processed.replace(/^# (.+)$/gm, '<h2 style="margin:12px 0 6px;font-size:1.15em;font-weight:600">$1</h2>')

  // Unordered lists
  processed = processed.replace(/^[-*] (.+)$/gm, '<li style="margin-left:16px;list-style:disc;margin-bottom:2px">$1</li>')
  // Ordered lists
  processed = processed.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;list-style:decimal;margin-bottom:2px">$1</li>')

  // Blockquotes
  processed = processed.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid var(--orion-chat-accent,#8b5cf6);padding-left:10px;margin:6px 0;opacity:0.85">$1</blockquote>')

  // Horizontal rules
  processed = processed.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--orion-chat-border,rgba(255,255,255,0.1));margin:10px 0">')

  // Links
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--orion-chat-link,#58a6ff);text-decoration:none" target="_blank" rel="noopener">$1</a>')

  // Line breaks: convert double newlines to paragraphs, single to <br>
  processed = processed.replace(/\n\n/g, '</p><p style="margin:6px 0">')
  processed = processed.replace(/\n/g, '<br>')

  const html = `<p style="margin:6px 0">${processed}</p>`

  return { html, codeBlocks }
}

interface ParsedCodeBlock {
  id: string
  language: string
  code: string
  filePath?: string
}

// ── Subcomponents ────────────────────────────────────────────────────────────

/** Typing indicator with animated dots */
function TypingIndicator() {
  const dotStyle = (delay: number): CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--orion-chat-accent, #8b5cf6)',
    animation: `orion-chat-typing-dot 1.4s ease-in-out ${delay}s infinite`,
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px' }}>
      <div style={dotStyle(0)} />
      <div style={dotStyle(0.2)} />
      <div style={dotStyle(0.4)} />
    </div>
  )
}

/** Skeleton loading placeholder */
function MessageSkeleton() {
  const shimmerBg: CSSProperties = {
    background: 'linear-gradient(90deg, var(--orion-chat-skeleton-a, rgba(255,255,255,0.04)) 25%, var(--orion-chat-skeleton-b, rgba(255,255,255,0.08)) 50%, var(--orion-chat-skeleton-a, rgba(255,255,255,0.04)) 75%)',
    backgroundSize: '200% 100%',
    animation: 'orion-chat-shimmer 1.5s ease-in-out infinite',
    borderRadius: 4,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 16px', animation: 'orion-chat-fade-in 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ ...shimmerBg, width: 24, height: 24, borderRadius: '50%' }} />
        <div style={{ ...shimmerBg, width: 80, height: 12 }} />
      </div>
      <div style={{ ...shimmerBg, width: '90%', height: 12 }} />
      <div style={{ ...shimmerBg, width: '75%', height: 12 }} />
      <div style={{ ...shimmerBg, width: '60%', height: 12 }} />
    </div>
  )
}

/** Code block with syntax highlighting, copy, apply, and insert buttons */
function CodeBlockRenderer({ block, onCopy, onApply, onInsert }: {
  block: ParsedCodeBlock; onCopy: (code: string) => void; onApply: (code: string, language: string) => void; onInsert: (code: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const highlighted = useMemo(() => highlightSyntax(block.code, block.language), [block.code, block.language])

  const handleCopy = useCallback(() => {
    onCopy(block.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [block.code, onCopy])

  const btnStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 7px',
    fontSize: 11,
    border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
    borderRadius: 4,
    background: 'var(--orion-chat-btn-bg, rgba(255,255,255,0.06))',
    color: 'var(--orion-chat-text-secondary, #a0a0a0)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    lineHeight: 1,
  }

  return (
    <div style={{
      margin: '8px 0',
      borderRadius: 6,
      border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.1))',
      overflow: 'hidden',
      background: 'var(--orion-chat-code-bg, rgba(0,0,0,0.3))',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 10px',
        background: 'var(--orion-chat-code-header, rgba(255,255,255,0.04))',
        borderBottom: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
        fontSize: 11,
        color: 'var(--orion-chat-text-secondary, #888)',
      }}>
        <span style={{ fontFamily: 'var(--orion-chat-mono, monospace)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {block.language}
          {block.filePath && <span style={{ marginLeft: 8, opacity: 0.7 }}>{block.filePath}</span>}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={btnStyle}
            onClick={handleCopy}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.12))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-bg, rgba(255,255,255,0.06))' }}
            title="Copy code"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            style={btnStyle}
            onClick={() => onApply(block.code, block.language)}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.12))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-bg, rgba(255,255,255,0.06))' }}
            title="Apply to active file"
          >
            <Wand2 size={11} /> Apply
          </button>
          <button
            style={btnStyle}
            onClick={() => onInsert(block.code)}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.12))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-bg, rgba(255,255,255,0.06))' }}
            title="Insert at cursor position"
          >
            <Play size={11} /> Insert
          </button>
        </div>
      </div>
      {/* Code body */}
      <div style={{ overflowX: 'auto', padding: '10px 14px' }}>
        <pre style={{
          margin: 0,
          fontFamily: 'var(--orion-chat-mono, "Cascadia Code", "Fira Code", "JetBrains Mono", monospace)',
          fontSize: 12.5,
          lineHeight: 1.55,
          whiteSpace: 'pre',
          tabSize: 2,
          color: 'var(--orion-chat-code-text, #d4d4d4)',
        }}>
          <code dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
      </div>
    </div>
  )
}

/** Inline diff preview for code suggestions */
function InlineDiffPreview({ original, suggested, language, onAccept, onReject }: {
  original: string; suggested: string; language: string; onAccept: () => void; onReject: () => void
}) {
  const origLines = original.split('\n')
  const sugLines = suggested.split('\n')
  const maxLen = Math.max(origLines.length, sugLines.length)
  const diffLines: Array<{ type: 'same' | 'added' | 'removed'; content: string }> = []

  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i], s = sugLines[i]
    if (o === undefined && s !== undefined) diffLines.push({ type: 'added', content: s })
    else if (s === undefined && o !== undefined) diffLines.push({ type: 'removed', content: o })
    else if (o !== s) { diffLines.push({ type: 'removed', content: o! }); diffLines.push({ type: 'added', content: s! }) }
    else diffLines.push({ type: 'same', content: o! })
  }

  const headerBtnStyle: CSSProperties = { padding: '2px 8px', fontSize: 11, borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' }

  return (
    <div style={{ margin: '8px 0', borderRadius: 6, border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.1))', overflow: 'hidden', background: 'var(--orion-chat-code-bg, rgba(0,0,0,0.3))' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: 'var(--orion-chat-code-header, rgba(255,255,255,0.04))', borderBottom: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))', fontSize: 11 }}>
        <span style={{ color: 'var(--orion-chat-text-secondary, #888)' }}>
          <Eye size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Diff Preview ({language})
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onAccept} style={{ ...headerBtnStyle, background: 'var(--orion-chat-success, #238636)' }}>
            <Check size={11} style={{ marginRight: 2, verticalAlign: 'middle' }} />Accept
          </button>
          <button onClick={onReject} style={{ ...headerBtnStyle, background: 'var(--orion-chat-danger, #da3633)' }}>
            <X size={11} style={{ marginRight: 2, verticalAlign: 'middle' }} />Reject
          </button>
        </div>
      </div>
      <div style={{ overflowX: 'auto', fontSize: 12, fontFamily: 'var(--orion-chat-mono, monospace)', lineHeight: 1.5 }}>
        {diffLines.map((line, i) => {
          const bgMap = { added: 'rgba(35,134,54,0.15)', removed: 'rgba(218,54,51,0.15)', same: 'transparent' }
          const borderMap = { added: '#3fb950', removed: '#f85149', same: 'transparent' }
          const prefixMap = { added: '+', removed: '-', same: ' ' }
          return (
            <div key={i} style={{
              padding: '0 14px', whiteSpace: 'pre',
              background: bgMap[line.type], borderLeft: `3px solid ${borderMap[line.type]}`,
              color: line.type === 'removed' ? '#f85149' : 'var(--orion-chat-code-text, #d4d4d4)',
              animation: line.type !== 'same' ? `orion-chat-diff-${line.type} 0.4s ease-out` : undefined,
            }}>
              <span style={{ display: 'inline-block', width: 16, opacity: 0.5, userSelect: 'none' }}>{prefixMap[line.type]}</span>
              {escapeHtml(line.content)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Context chip display (active file, selected text, etc.) */
function ContextChip({ label, icon: Icon, onRemove, color }: {
  label: string; icon: LucideIcon; onRemove?: () => void; color?: string
}) {
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      padding: '2px 8px',
      borderRadius: 10,
      background: `${color || 'var(--orion-chat-accent, #8b5cf6)'}20`,
      border: `1px solid ${color || 'var(--orion-chat-accent, #8b5cf6)'}40`,
      fontSize: 11,
      color: color || 'var(--orion-chat-accent, #8b5cf6)',
      maxWidth: 200,
      animation: 'orion-chat-bounce-in 0.2s ease-out',
    }}>
      <Icon size={11} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {onRemove && (
        <X
          size={11}
          style={{ cursor: 'pointer', opacity: 0.7, flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        />
      )}
    </div>
  )
}

/** Individual message actions bar */
function MessageActions({ message, conversationId, onEdit, onRegenerate, onCopy }: {
  message: ChatMessage; conversationId: string; onEdit: (id: string) => void; onRegenerate: (id: string) => void; onCopy: (text: string) => void
}) {
  const { setMessageFeedback, deleteMessage } = useAIConversationStore()
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)

  const abtn: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 24, height: 24, borderRadius: 4, border: 'none', background: 'transparent',
    color: 'var(--orion-chat-text-secondary, #777)', cursor: 'pointer', transition: 'all 0.15s ease', padding: 0,
  }
  const hoverIn = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.1))'; e.currentTarget.style.color = 'var(--orion-chat-text, #e0e0e0)' }
  const hoverOut = (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--orion-chat-text-secondary, #777)' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: 0, transition: 'opacity 0.15s ease', marginTop: 4 }} className="orion-msg-actions">
      <button style={abtn} onClick={() => onCopy(message.editedContent || message.content)} onMouseEnter={hoverIn} onMouseLeave={hoverOut} title="Copy"><Copy size={13} /></button>
      {message.role === 'user' && <button style={abtn} onClick={() => onEdit(message.id)} onMouseEnter={hoverIn} onMouseLeave={hoverOut} title="Edit"><Edit3 size={13} /></button>}
      {message.role === 'assistant' && (
        <>
          <button style={abtn} onClick={() => onRegenerate(message.id)} onMouseEnter={hoverIn} onMouseLeave={hoverOut} title="Regenerate"><RotateCcw size={13} /></button>
          <button style={{ ...abtn, color: message.feedback === 'positive' ? 'var(--orion-chat-success, #3fb950)' : abtn.color }}
            onClick={() => setMessageFeedback(conversationId, message.id, message.feedback === 'positive' ? undefined : 'positive')} title="Good response"><ThumbsUp size={13} /></button>
          <button style={{ ...abtn, color: message.feedback === 'negative' ? 'var(--orion-chat-danger, #f85149)' : abtn.color }}
            onClick={() => setMessageFeedback(conversationId, message.id, message.feedback === 'negative' ? undefined : 'negative')} title="Poor response"><ThumbsDown size={13} /></button>
        </>
      )}
      {showConfirmDelete ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}>
          <button style={{ ...abtn, color: 'var(--orion-chat-danger, #f85149)' }} onClick={() => { deleteMessage(conversationId, message.id); setShowConfirmDelete(false) }} title="Confirm"><Check size={13} /></button>
          <button style={abtn} onClick={() => setShowConfirmDelete(false)} title="Cancel"><X size={13} /></button>
        </div>
      ) : (
        <button style={abtn} onClick={() => setShowConfirmDelete(true)} onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--orion-chat-danger, #f85149)' }} onMouseLeave={hoverOut} title="Delete"><Trash2 size={13} /></button>
      )}
    </div>
  )
}

/** Render a single chat message (user or assistant) */
function ChatMessageBubble({
  message,
  conversationId,
  isStreaming,
  streamContent,
  selectedModel,
  onCopyCode,
  onApplyCode,
  onInsertCode,
  onEditMessage,
  onRegenerateMessage,
  onCopyMessage,
}: {
  message: ChatMessage
  conversationId: string
  isStreaming: boolean
  streamContent: string
  selectedModel: ModelOption
  onCopyCode: (code: string) => void
  onApplyCode: (code: string, language: string) => void
  onInsertCode: (code: string) => void
  onEditMessage: (messageId: string) => void
  onRegenerateMessage: (messageId: string) => void
  onCopyMessage: (text: string) => void
}) {
  const isUser = message.role === 'user'
  const isSystem = message.role === 'system'
  const displayContent = message.isStreaming ? streamContent : (message.editedContent || message.content)
  const { html, codeBlocks } = useMemo(() => parseMarkdown(displayContent), [displayContent])

  const tokens = useMemo(() => estimateTokens(displayContent), [displayContent])

  if (isSystem) {
    return (
      <div style={{
        padding: '6px 12px',
        margin: '4px 16px',
        fontSize: 11,
        color: 'var(--orion-chat-text-secondary, #888)',
        textAlign: 'center',
        fontStyle: 'italic',
        opacity: 0.7,
      }}>
        {displayContent}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        padding: '4px 16px',
        animation: 'orion-chat-fade-in 0.25s ease-out',
      }}
      onMouseEnter={(e) => {
        const actions = e.currentTarget.querySelector('.orion-msg-actions') as HTMLElement
        if (actions) actions.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        const actions = e.currentTarget.querySelector('.orion-msg-actions') as HTMLElement
        if (actions) actions.style.opacity = '0'
      }}
    >
      {/* Avatar + timestamp row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginBottom: 3,
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}>
        <div style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
          background: isUser
            ? 'var(--orion-chat-user-avatar, #3b82f6)'
            : 'var(--orion-chat-assistant-avatar, #8b5cf6)',
          color: '#fff',
          flexShrink: 0,
        }}>
          {isUser ? 'U' : <Sparkles size={12} />}
        </div>
        <span style={{ fontSize: 10, color: 'var(--orion-chat-text-secondary, #777)' }}>
          {isUser ? 'You' : (message.model || selectedModel.name)}
          {' \u00b7 '}
          {formatTimestamp(message.timestamp)}
        </span>
        {message.editedContent && (
          <span style={{ fontSize: 9, color: 'var(--orion-chat-text-secondary, #666)', fontStyle: 'italic' }}>(edited)</span>
        )}
      </div>

      {/* Message bubble */}
      <div style={{
        maxWidth: '88%',
        padding: '8px 12px',
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        background: isUser
          ? 'var(--orion-chat-user-bg, rgba(59,130,246,0.15))'
          : 'var(--orion-chat-assistant-bg, rgba(139,92,246,0.08))',
        border: `1px solid ${isUser
          ? 'var(--orion-chat-user-border, rgba(59,130,246,0.2))'
          : 'var(--orion-chat-assistant-border, rgba(139,92,246,0.15))'
        }`,
        color: 'var(--orion-chat-text, #e0e0e0)',
        fontSize: 13,
        lineHeight: 1.55,
        wordBreak: 'break-word',
        position: 'relative' as const,
      }}>
        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {message.attachments.map((att, i) => (
              <ContextChip
                key={i}
                label={att.name}
                icon={att.type === 'file' ? FileText : att.type === 'terminal' ? Terminal : att.type === 'diff' ? GitBranch : Code}
                color={att.type === 'terminal' ? '#f59e0b' : att.type === 'diff' ? '#3fb950' : undefined}
              />
            ))}
          </div>
        )}

        {/* Rendered markdown content, replacing code block placeholders */}
        {codeBlocks.length > 0 ? (
          <div>
            {html.split(/<CODE_BLOCK_(code-block-\d+)>/g).map((segment, idx) => {
              const block = codeBlocks.find(b => b.id === segment)
              if (block) {
                return (
                  <CodeBlockRenderer
                    key={block.id}
                    block={block}
                    onCopy={onCopyCode}
                    onApply={onApplyCode}
                    onInsert={onInsertCode}
                  />
                )
              }
              return (
                <span
                  key={idx}
                  dangerouslySetInnerHTML={{ __html: segment }}
                />
              )
            })}
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}

        {/* Streaming cursor */}
        {message.isStreaming && (
          <span style={{
            display: 'inline-block',
            width: 2,
            height: 14,
            background: 'var(--orion-chat-accent, #8b5cf6)',
            marginLeft: 2,
            verticalAlign: 'middle',
            animation: 'orion-chat-stream-cursor 1s step-end infinite',
            borderRadius: 1,
          }} />
        )}

        {/* Error display */}
        {message.error && (
          <div style={{
            marginTop: 6,
            padding: '4px 8px',
            borderRadius: 4,
            background: 'rgba(218,54,51,0.15)',
            border: '1px solid rgba(218,54,51,0.3)',
            color: '#f85149',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <AlertTriangle size={12} />
            {message.error}
          </div>
        )}
      </div>

      {/* Token / cost badge */}
      {!message.isStreaming && tokens > 0 && (
        <div style={{
          fontSize: 9,
          color: 'var(--orion-chat-text-secondary, #666)',
          marginTop: 2,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexDirection: isUser ? 'row-reverse' : 'row',
        }}>
          <span>{tokens} tokens</span>
          <span>{formatTokenCost(tokens, selectedModel, !isUser)}</span>
        </div>
      )}

      {/* Actions */}
      {!message.isStreaming && (
        <MessageActions
          message={message}
          conversationId={conversationId}
          onEdit={onEditMessage}
          onRegenerate={onRegenerateMessage}
          onCopy={onCopyMessage}
        />
      )}
    </div>
  )
}

/** Conversation history sidebar item */
function ConversationItem({ conversation, isActive, onClick, onDelete, onPin }: {
  conversation: Conversation; isActive: boolean; onClick: () => void; onDelete: (id: string) => void; onPin: (id: string) => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '7px 10px',
        borderRadius: 5,
        cursor: 'pointer',
        background: isActive
          ? 'var(--orion-chat-item-active, rgba(139,92,246,0.15))'
          : hovered
            ? 'var(--orion-chat-item-hover, rgba(255,255,255,0.05))'
            : 'transparent',
        borderLeft: isActive ? '2px solid var(--orion-chat-accent, #8b5cf6)' : '2px solid transparent',
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 6,
        position: 'relative' as const,
      }}
    >
      <MessageSquare size={13} style={{ marginTop: 2, opacity: 0.5, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: isActive ? 600 : 400,
          color: 'var(--orion-chat-text, #e0e0e0)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {conversation.pinned && <Pin size={10} style={{ marginRight: 3, verticalAlign: 'middle', color: 'var(--orion-chat-accent, #8b5cf6)' }} />}
          {conversation.title}
        </div>
        <div style={{ fontSize: 10, color: 'var(--orion-chat-text-secondary, #777)', marginTop: 1 }}>
          {conversation.messages.length} messages \u00b7 {formatTimestamp(conversation.updatedAt)}
        </div>
      </div>
      {hovered && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onPin(conversation.id) }}
            style={{
              width: 20, height: 20, borderRadius: 3, border: 'none', background: 'transparent',
              color: conversation.pinned ? 'var(--orion-chat-accent, #8b5cf6)' : 'var(--orion-chat-text-secondary, #777)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
            title={conversation.pinned ? 'Unpin' : 'Pin'}
          >
            <Pin size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(conversation.id) }}
            style={{
              width: 20, height: 20, borderRadius: 3, border: 'none', background: 'transparent',
              color: 'var(--orion-chat-text-secondary, #777)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
            title="Delete conversation"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

/** Model selector dropdown */
function ModelSelector({ selectedModel, onSelect }: { selectedModel: ModelOption; onSelect: (model: ModelOption) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 5,
          border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
          background: 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))',
          color: 'var(--orion-chat-text, #e0e0e0)',
          cursor: 'pointer',
          fontSize: 11,
          transition: 'all 0.15s ease',
        }}
      >
        <span>{selectedModel.icon}</span>
        <span>{selectedModel.name}</span>
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: 4,
          minWidth: 220,
          maxHeight: 300,
          overflowY: 'auto',
          background: 'var(--orion-chat-dropdown-bg, #1e1e2e)',
          border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
          borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          zIndex: 100,
          padding: 4,
          animation: 'orion-chat-fade-in 0.15s ease-out',
        }}>
          {/* Group by provider */}
          {['Anthropic', 'OpenAI', 'Google', 'Ollama'].map(provider => {
            const models = MODELS.filter(m => m.provider === provider)
            if (models.length === 0) return null
            return (
              <div key={provider}>
                <div style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--orion-chat-text-secondary, #777)',
                  padding: '4px 8px 2px',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  {provider}
                </div>
                {models.map(model => (
                  <button
                    key={model.id}
                    onClick={() => { onSelect(model); setOpen(false) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      width: '100%',
                      padding: '5px 8px',
                      border: 'none',
                      borderRadius: 4,
                      background: model.id === selectedModel.id ? 'var(--orion-chat-item-active, rgba(139,92,246,0.15))' : 'transparent',
                      color: 'var(--orion-chat-text, #e0e0e0)',
                      cursor: 'pointer',
                      fontSize: 12,
                      textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (model.id !== selectedModel.id) e.currentTarget.style.background = 'var(--orion-chat-item-hover, rgba(255,255,255,0.05))' }}
                    onMouseLeave={(e) => { if (model.id !== selectedModel.id) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span>{model.icon}</span>
                    <span style={{ flex: 1 }}>{model.name}</span>
                    {model.costPer1kInput === 0 && (
                      <span style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, background: 'var(--orion-chat-success, #238636)', color: '#fff' }}>Free</span>
                    )}
                    {model.id === selectedModel.id && <Check size={12} style={{ color: 'var(--orion-chat-accent, #8b5cf6)' }} />}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Context picker menu for @file, @folder, @web, @docs, @terminal */
function ContextPicker({ onSelect, onClose }: { onSelect: (type: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const dropdownStyle: CSSProperties = { position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: 'var(--orion-chat-dropdown-bg, #1e1e2e)', border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))', borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100, padding: 4, minWidth: 180, animation: 'orion-chat-fade-in 0.15s ease-out' }

  return (
    <div ref={ref} style={dropdownStyle}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--orion-chat-text-secondary, #777)', padding: '4px 8px 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>Add Context</div>
      {CONTEXT_TYPES.map(ctx => {
        const Icon = ctx.icon
        return (
          <button key={ctx.id} onClick={() => { onSelect(ctx.id); onClose() }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 8px', border: 'none', borderRadius: 4, background: 'transparent', color: 'var(--orion-chat-text, #e0e0e0)', cursor: 'pointer', fontSize: 12, textAlign: 'left', transition: 'background 0.1s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
            <Icon size={13} style={{ opacity: 0.7 }} />
            <div>
              <div style={{ fontWeight: 500 }}>{ctx.label}</div>
              <div style={{ fontSize: 10, color: '#777' }}>{ctx.description}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** Error retry indicator with exponential backoff */
function ErrorRetryIndicator({ attempt, maxAttempts, onRetryNow, onCancel }: {
  attempt: number; maxAttempts: number; onRetryNow: () => void; onCancel: () => void
}) {
  const [countdown, setCountdown] = useState(getRetryDelay(attempt) / 1000)

  useEffect(() => {
    if (countdown <= 0) { onRetryNow(); return }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, onRetryNow])

  const retryBtn: CSSProperties = { padding: '2px 8px', fontSize: 11, borderRadius: 4, background: 'transparent', cursor: 'pointer' }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', margin: '4px 16px', borderRadius: 6, background: 'rgba(218,54,51,0.1)', border: '1px solid rgba(218,54,51,0.2)', fontSize: 12, color: 'var(--orion-chat-danger, #f85149)', animation: 'orion-chat-fade-in 0.25s ease-out' }}>
      <AlertTriangle size={14} />
      <span style={{ flex: 1 }}>Request failed. Retry {attempt + 1}/{maxAttempts} in {Math.ceil(countdown)}s...</span>
      <button onClick={onRetryNow} style={{ ...retryBtn, border: '1px solid rgba(218,54,51,0.3)', color: '#f85149' }}>Retry Now</button>
      <button onClick={onCancel} style={{ ...retryBtn, border: '1px solid rgba(255,255,255,0.12)', color: '#888' }}>Cancel</button>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export interface AIChatWidgetProps {
  visible: boolean
  onClose: () => void
  docked?: boolean
  defaultWidth?: number
  defaultHeight?: number
}

export default function AIChatWidget({
  visible,
  onClose,
  docked = true,
  defaultWidth = 420,
  defaultHeight = 600,
}: AIChatWidgetProps) {
  // ── Store bindings ──
  const {
    conversations,
    activeConversationId,
    isStreaming,
    currentStreamContent,
    context,
    defaultModel,
    createConversation,
    deleteConversation,
    setActiveConversation,
    renameConversation,
    pinConversation,
    unpinConversation,
    addMessage,
    editMessage,
    startStreaming,
    appendStreamContent,
    endStreaming,
    cancelStreaming,
    setContext,
    addContextFile,
    removeContextFile,
    getActiveConversation,
    getRecentConversations,
    getPinnedConversations,
    searchConversations,
    setDefaultModel,
    clearAll,
  } = useAIConversationStore()

  // ── Local state ──
  const [inputValue, setInputValue] = useState('')
  const [panelWidth, setPanelWidth] = useState(defaultWidth)
  const [panelHeight, setPanelHeight] = useState(defaultHeight)
  const [isMaximized, setIsMaximized] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarSearchQuery, setSidebarSearchQuery] = useState('')
  const [showContextPicker, setShowContextPicker] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [selectedModel, setSelectedModel] = useState<ModelOption>(
    MODELS.find(m => m.id === defaultModel) || MODELS[0]
  )
  const [dragOver, setDragOver] = useState(false)
  const [contextChips, setContextChips] = useState<Array<{ type: string; label: string }>>([])
  const [retryState, setRetryState] = useState<{ active: boolean; attempt: number; messageId: string | null }>({
    active: false, attempt: 0, messageId: null,
  })
  const [showApplyAll, setShowApplyAll] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  // ── Refs ──
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resizeStartRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  // ── Derived ──
  const activeConversation = useMemo(() => getActiveConversation(), [conversations, activeConversationId])
  const messages = activeConversation?.messages || []
  const recentConversations = useMemo(() => getRecentConversations(50), [conversations])
  const pinnedConversations = useMemo(() => getPinnedConversations(), [conversations])

  const filteredConversations = useMemo(() => {
    if (!sidebarSearchQuery.trim()) return recentConversations
    return searchConversations(sidebarSearchQuery)
  }, [sidebarSearchQuery, recentConversations, searchConversations])

  const hasCodeBlocks = useMemo(() => {
    return messages.some(m => m.role === 'assistant' && /```\w*\n[\s\S]*?```/.test(m.content))
  }, [messages])

  // ── Effects ──
  useEffect(() => { injectStyles() }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, currentStreamContent])

  // Focus input when visible
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [visible])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+L to focus
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault()
        if (visible) {
          inputRef.current?.focus()
        }
      }
      // Escape to close
      if (e.key === 'Escape' && visible) {
        if (showContextPicker) {
          setShowContextPicker(false)
        } else if (editingMessageId) {
          setEditingMessageId(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onClose, showContextPicker, editingMessageId])

  // Update context from active editor
  useEffect(() => {
    try {
      const editorState = useEditorStore.getState()
      const activeFile = editorState.activeFilePath || undefined
      setContext({ activeFile })

      if (activeFile && !contextChips.find(c => c.type === 'activeFile')) {
        setContextChips(prev => {
          const filtered = prev.filter(c => c.type !== 'activeFile')
          if (activeFile) {
            return [...filtered, { type: 'activeFile', label: activeFile.split('/').pop() || activeFile }]
          }
          return filtered
        })
      }
    } catch {
      // store may not be initialized
    }
  }, [visible])

  // ── Resize handlers ──
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: panelWidth, h: panelHeight }

    const handleMove = (me: MouseEvent) => {
      if (!resizeStartRef.current) return
      const dx = resizeStartRef.current.x - me.clientX
      const dy = resizeStartRef.current.y - me.clientY
      setPanelWidth(Math.max(320, Math.min(800, resizeStartRef.current.w + dx)))
      setPanelHeight(Math.max(400, Math.min(1000, resizeStartRef.current.h + dy)))
    }

    const handleUp = () => {
      setIsResizing(false)
      resizeStartRef.current = null
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [panelWidth, panelHeight])

  // ── Message submission ──
  const simulateStreaming = useCallback((conversationId: string, userContent: string) => {
    // Simulated assistant streaming response for demo purposes
    const responses = [
      `I'll help you with that.\n\n\`\`\`typescript\nfunction processData(input: string[]): Record<string, number> {\n  return input.reduce((acc, item) => {\n    acc[item] = (acc[item] || 0) + 1;\n    return acc;\n  }, {} as Record<string, number>);\n}\n\`\`\`\n\nThis returns a frequency map of strings. Would you like me to add error handling?`,
      `Here's the refactored version:\n\n\`\`\`typescript\n// Use early return to reduce nesting\nif (!condition) return false;\ndoSomething();\nreturn true;\n\`\`\`\n\nThe **early return** pattern makes code more readable by eliminating unnecessary else blocks.`,
    ]

    const responseText = responses[Math.floor(Math.random() * responses.length)]
    const msgId = startStreaming(conversationId)

    let charIndex = 0
    const interval = setInterval(() => {
      if (charIndex < responseText.length) {
        const chunkSize = Math.floor(Math.random() * 4) + 1
        const chunk = responseText.slice(charIndex, charIndex + chunkSize)
        appendStreamContent(chunk)
        charIndex += chunkSize
      } else {
        clearInterval(interval)
        endStreaming(conversationId, msgId)
      }
    }, 15)

    return () => clearInterval(interval)
  }, [startStreaming, appendStreamContent, endStreaming])

  const handleSendMessage = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || isStreaming) return

    let convId = activeConversationId
    if (!convId) {
      convId = createConversation(undefined, selectedModel.id)
    }

    // Build attachments from context chips
    const attachments: Attachment[] = contextChips
      .filter(c => c.type !== 'activeFile')
      .map(c => ({
        type: c.type as Attachment['type'],
        name: c.label,
        content: '',
      }))

    if (context.activeFile) {
      attachments.unshift({
        type: 'file',
        name: context.activeFile.split('/').pop() || context.activeFile,
        content: '',
        filePath: context.activeFile,
      })
    }

    if (context.selectedText) {
      attachments.push({
        type: 'selection',
        name: 'Selected text',
        content: context.selectedText,
      })
    }

    addMessage(convId, {
      role: 'user',
      content: trimmed,
      model: selectedModel.id,
      tokenCount: estimateTokens(trimmed),
      attachments: attachments.length > 0 ? attachments : undefined,
    })

    setInputValue('')
    setContextChips(prev => prev.filter(c => c.type === 'activeFile'))

    // Simulate streaming response
    simulateStreaming(convId, trimmed)
  }, [inputValue, isStreaming, activeConversationId, createConversation, selectedModel, addMessage, context, contextChips, simulateStreaming])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
    // @ triggers context picker
    if (e.key === '@') {
      setShowContextPicker(true)
    }
  }, [handleSendMessage])

  const handleEditMessage = useCallback((messageId: string) => {
    const msg = messages.find(m => m.id === messageId)
    if (!msg) return
    setEditingMessageId(messageId)
    setEditingContent(msg.editedContent || msg.content)
  }, [messages])

  const handleSaveEdit = useCallback(() => {
    if (!editingMessageId || !activeConversationId) return
    editMessage(activeConversationId, editingMessageId, editingContent)
    setEditingMessageId(null)
    setEditingContent('')
  }, [editingMessageId, editingContent, activeConversationId, editMessage])

  const handleRegenerateMessage = useCallback((messageId: string) => {
    if (!activeConversationId || isStreaming) return
    // Find the user message before this assistant message
    const idx = messages.findIndex(m => m.id === messageId)
    if (idx <= 0) return
    const userMsg = messages[idx - 1]
    if (userMsg.role !== 'user') return

    simulateStreaming(activeConversationId, userMsg.content)
  }, [activeConversationId, isStreaming, messages, simulateStreaming])

  const handleCopyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      // fallback: could use textarea trick
    })
  }, [])

  const handleApplyCode = useCallback((_code: string, _language: string) => {
    // Integration point: apply code to active editor
    // This would dispatch to the editor store in a real implementation
  }, [])

  const handleInsertCode = useCallback((_code: string) => {
    // Integration point: insert code at cursor position in active editor
  }, [])

  const handleContextSelect = useCallback((type: string) => {
    const ctxType = CONTEXT_TYPES.find(c => c.id === type)
    if (!ctxType) return

    // For demo, add a chip. In real implementation, would open file/folder picker etc.
    setContextChips(prev => {
      if (prev.find(c => c.type === type)) return prev
      return [...prev, { type, label: ctxType.label }]
    })
  }, [])

  const handleRemoveContextChip = useCallback((type: string) => {
    setContextChips(prev => prev.filter(c => c.type !== type))
  }, [])

  // Drag and drop files
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => {
      setContextChips(prev => [...prev, { type: 'file', label: file.name }])
    })

    // Also handle text drops
    const text = e.dataTransfer.getData('text/plain')
    if (text && !files.length) {
      setInputValue(prev => prev + text)
    }
  }, [])

  const handleNewConversation = useCallback(() => {
    createConversation(undefined, selectedModel.id)
    setInputValue('')
    setContextChips([])
  }, [createConversation, selectedModel.id])

  const handleClearConversation = useCallback(() => {
    if (activeConversationId) {
      deleteConversation(activeConversationId)
    }
  }, [activeConversationId, deleteConversation])

  const handleTogglePin = useCallback((id: string) => {
    const conv = conversations.find(c => c.id === id)
    if (!conv) return
    if (conv.pinned) {
      unpinConversation(id)
    } else {
      pinConversation(id)
    }
  }, [conversations, pinConversation, unpinConversation])

  const handleApplyAllChanges = useCallback(() => {
    // Collect all code blocks from assistant messages
    // In real implementation, would apply each to respective files
    setShowApplyAll(false)
  }, [])

  const handleModelSelect = useCallback((model: ModelOption) => {
    setSelectedModel(model)
    setDefaultModel(model.id)
  }, [setDefaultModel])

  const handleRetryNow = useCallback(() => {
    setRetryState({ active: false, attempt: 0, messageId: null })
    if (activeConversationId) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      if (lastUserMsg) {
        simulateStreaming(activeConversationId, lastUserMsg.content)
      }
    }
  }, [activeConversationId, messages, simulateStreaming])

  const handleCancelRetry = useCallback(() => {
    setRetryState({ active: false, attempt: 0, messageId: null })
  }, [])

  // ── Render ──

  if (!visible) return null

  const panelStyle: CSSProperties = isMaximized
    ? {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--orion-chat-panel-bg, #1a1a2e)',
        color: 'var(--orion-chat-text, #e0e0e0)',
        fontFamily: 'var(--orion-chat-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
      }
    : docked
      ? {
          display: 'flex',
          flexDirection: 'column',
          width: panelWidth,
          height: '100%',
          background: 'var(--orion-chat-panel-bg, #1a1a2e)',
          color: 'var(--orion-chat-text, #e0e0e0)',
          fontFamily: 'var(--orion-chat-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
          borderLeft: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
          position: 'relative',
          overflow: 'hidden',
        }
      : {
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: panelWidth,
          height: panelHeight,
          zIndex: 9990,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--orion-chat-panel-bg, #1a1a2e)',
          color: 'var(--orion-chat-text, #e0e0e0)',
          fontFamily: 'var(--orion-chat-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
          borderRadius: 12,
          border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.1))',
          boxShadow: '0 16px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          overflow: 'hidden',
          animation: 'orion-chat-slide-in 0.25s ease-out',
        }

  return (
    <div ref={panelRef} style={panelStyle}>
      {/* Resize handle (floating mode) */}
      {!docked && !isMaximized && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 12,
            height: 12,
            cursor: 'nw-resize',
            zIndex: 10,
          }}
        />
      )}

      {/* Resize handle (docked mode - left edge) */}
      {docked && !isMaximized && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 4,
            height: '100%',
            cursor: 'ew-resize',
            zIndex: 10,
            background: isResizing ? 'var(--orion-chat-accent, #8b5cf6)' : 'transparent',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--orion-chat-accent, #8b5cf6)' }}
          onMouseLeave={(e) => { if (!isResizing) e.currentTarget.style.background = 'transparent' }}
        />
      )}

      {/* ── Header ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
        background: 'var(--orion-chat-header-bg, rgba(255,255,255,0.02))',
        flexShrink: 0,
        minHeight: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 5, border: 'none',
              background: sidebarOpen ? 'var(--orion-chat-item-active, rgba(139,92,246,0.15))' : 'transparent',
              color: 'var(--orion-chat-text-secondary, #aaa)', cursor: 'pointer', padding: 0,
              transition: 'all 0.15s ease',
            }}
            title="Toggle conversation history"
          >
            {sidebarOpen ? <PanelRightClose size={15} /> : <PanelRightOpen size={15} />}
          </button>
          <Sparkles size={15} style={{ color: 'var(--orion-chat-accent, #8b5cf6)' }} />
          <span style={{ fontWeight: 600, fontSize: 13 }}>AI Chat</span>
          {activeConversation && (
            <span style={{
              fontSize: 11,
              color: 'var(--orion-chat-text-secondary, #777)',
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              \u2014 {activeConversation.title}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <button
            onClick={handleNewConversation}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 5, border: 'none',
              background: 'transparent', color: 'var(--orion-chat-text-secondary, #aaa)',
              cursor: 'pointer', padding: 0, transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.08))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            title="New conversation"
          >
            <Plus size={15} />
          </button>

          {hasCodeBlocks && (
            <button
              onClick={handleApplyAllChanges}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                padding: '3px 8px', borderRadius: 5, fontSize: 11,
                border: '1px solid var(--orion-chat-accent, rgba(139,92,246,0.3))',
                background: 'var(--orion-chat-accent, rgba(139,92,246,0.1))',
                color: 'var(--orion-chat-accent, #8b5cf6)',
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)' }}
              title="Apply all code changes"
            >
              <Zap size={11} /> Apply All
            </button>
          )}

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 5, border: 'none',
              background: 'transparent', color: 'var(--orion-chat-text-secondary, #aaa)',
              cursor: 'pointer', padding: 0, transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.08))' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 5, border: 'none',
              background: 'transparent', color: 'var(--orion-chat-text-secondary, #aaa)',
              cursor: 'pointer', padding: 0, transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(218,54,51,0.15)'; e.currentTarget.style.color = '#f85149' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--orion-chat-text-secondary, #aaa)' }}
            title="Close (Escape)"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── Body (sidebar + messages) ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Conversation History Sidebar */}
        {sidebarOpen && (
          <div style={{
            width: 220,
            borderRight: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--orion-chat-sidebar-bg, rgba(0,0,0,0.15))',
            flexShrink: 0,
            animation: 'orion-chat-slide-in 0.2s ease-out',
          }}>
            {/* Search */}
            <div style={{ padding: '8px 8px 4px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 5,
                background: 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))',
                border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
              }}>
                <Search size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
                <input
                  value={sidebarSearchQuery}
                  onChange={(e) => setSidebarSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--orion-chat-text, #e0e0e0)',
                    fontSize: 11,
                    padding: 0,
                  }}
                />
                {sidebarSearchQuery && (
                  <X size={11} style={{ cursor: 'pointer', opacity: 0.5 }} onClick={() => setSidebarSearchQuery('')} />
                )}
              </div>
            </div>

            {/* Conversations list */}
            <div className="orion-chat-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
              {/* Pinned section */}
              {pinnedConversations.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--orion-chat-text-secondary, #666)', padding: '6px 4px 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Pinned
                  </div>
                  {pinnedConversations.map(conv => (
                    <ConversationItem
                      key={conv.id}
                      conversation={conv}
                      isActive={conv.id === activeConversationId}
                      onClick={() => setActiveConversation(conv.id)}
                      onDelete={deleteConversation}
                      onPin={handleTogglePin}
                    />
                  ))}
                </>
              )}

              {/* Recent section */}
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--orion-chat-text-secondary, #666)', padding: '6px 4px 2px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {sidebarSearchQuery ? 'Search Results' : 'Recent'}
              </div>
              {filteredConversations.filter(c => !c.pinned).map(conv => (
                <ConversationItem
                  key={conv.id}
                  conversation={conv}
                  isActive={conv.id === activeConversationId}
                  onClick={() => setActiveConversation(conv.id)}
                  onDelete={deleteConversation}
                  onPin={handleTogglePin}
                />
              ))}

              {filteredConversations.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--orion-chat-text-secondary, #666)' }}>
                  {sidebarSearchQuery ? 'No matching conversations' : 'No conversations yet'}
                </div>
              )}
            </div>

            {/* Sidebar footer */}
            <div style={{
              padding: '6px 8px',
              borderTop: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: 10, color: 'var(--orion-chat-text-secondary, #666)' }}>
                {conversations.length} chats
              </span>
              <button
                onClick={() => { if (confirm('Clear all conversations?')) clearAll() }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '2px 6px', fontSize: 10, borderRadius: 3,
                  border: 'none', background: 'transparent',
                  color: 'var(--orion-chat-text-secondary, #777)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--orion-chat-danger, #f85149)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--orion-chat-text-secondary, #777)' }}
                title="Clear all conversations"
              >
                <Trash2 size={10} /> Clear All
              </button>
            </div>
          </div>
        )}

        {/* ── Messages Area ── */}
        <div
          className="orion-chat-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {dragOver && (
            <div style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              background: 'rgba(139,92,246,0.1)',
              border: '2px dashed var(--orion-chat-accent, #8b5cf6)',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 8,
              pointerEvents: 'none',
            }}>
              <Upload size={32} style={{ color: 'var(--orion-chat-accent, #8b5cf6)', opacity: 0.7 }} />
              <span style={{ fontSize: 13, color: 'var(--orion-chat-accent, #8b5cf6)', fontWeight: 500 }}>
                Drop files to attach
              </span>
            </div>
          )}

          {/* Empty state */}
          {messages.length === 0 && !isStreaming && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              gap: 12,
              opacity: 0.7,
            }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--orion-chat-accent, rgba(139,92,246,0.15))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Sparkles size={24} style={{ color: 'var(--orion-chat-accent, #8b5cf6)' }} />
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--orion-chat-text, #e0e0e0)' }}>
                Orion AI Assistant
              </div>
              <div style={{ fontSize: 12, color: 'var(--orion-chat-text-secondary, #888)', textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
                Ask me about your code, get explanations, generate solutions, or refactor existing code.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 8 }}>
                {[
                  { label: 'Explain this code', icon: BookOpen },
                  { label: 'Fix the bug', icon: AlertTriangle },
                  { label: 'Write tests', icon: Code },
                  { label: 'Refactor', icon: Wand2 },
                ].map(suggestion => (
                  <button
                    key={suggestion.label}
                    onClick={() => { setInputValue(suggestion.label); inputRef.current?.focus() }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 10px',
                      borderRadius: 16,
                      border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
                      background: 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))',
                      color: 'var(--orion-chat-text-secondary, #aaa)',
                      cursor: 'pointer',
                      fontSize: 11,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.1))'
                      e.currentTarget.style.borderColor = 'var(--orion-chat-accent, rgba(139,92,246,0.3))'
                      e.currentTarget.style.color = 'var(--orion-chat-text, #e0e0e0)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))'
                      e.currentTarget.style.borderColor = 'var(--orion-chat-border, rgba(255,255,255,0.12))'
                      e.currentTarget.style.color = 'var(--orion-chat-text-secondary, #aaa)'
                    }}
                  >
                    <suggestion.icon size={12} />
                    {suggestion.label}
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 10, color: 'var(--orion-chat-text-secondary, #666)' }}>
                <kbd style={{
                  padding: '1px 5px', borderRadius: 3, fontSize: 10,
                  background: 'var(--orion-chat-code-bg, rgba(255,255,255,0.08))',
                  border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
                }}>
                  Cmd+L
                </kbd>
                {' '}to focus \u00b7{' '}
                <kbd style={{
                  padding: '1px 5px', borderRadius: 3, fontSize: 10,
                  background: 'var(--orion-chat-code-bg, rgba(255,255,255,0.08))',
                  border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
                }}>
                  Enter
                </kbd>
                {' '}to send \u00b7{' '}
                <kbd style={{
                  padding: '1px 5px', borderRadius: 3, fontSize: 10,
                  background: 'var(--orion-chat-code-bg, rgba(255,255,255,0.08))',
                  border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
                }}>
                  Shift+Enter
                </kbd>
                {' '}for newline
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, paddingTop: 8, paddingBottom: 8 }}>
            {messages.map((msg) => {
              if (editingMessageId === msg.id) {
                return (
                  <div key={msg.id} style={{ padding: '4px 16px', animation: 'orion-chat-fade-in 0.2s ease-out' }}>
                    <div style={{
                      borderRadius: 8,
                      border: '1px solid var(--orion-chat-accent, rgba(139,92,246,0.3))',
                      overflow: 'hidden',
                    }}>
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        style={{
                          width: '100%',
                          minHeight: 80,
                          padding: '8px 12px',
                          background: 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))',
                          border: 'none',
                          outline: 'none',
                          color: 'var(--orion-chat-text, #e0e0e0)',
                          fontSize: 13,
                          fontFamily: 'inherit',
                          resize: 'vertical',
                          boxSizing: 'border-box',
                        }}
                        autoFocus
                      />
                      <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 4,
                        padding: '4px 8px',
                        background: 'var(--orion-chat-code-header, rgba(255,255,255,0.03))',
                        borderTop: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
                      }}>
                        <button
                          onClick={() => setEditingMessageId(null)}
                          style={{
                            padding: '3px 10px', fontSize: 11, borderRadius: 4,
                            border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
                            background: 'transparent', color: 'var(--orion-chat-text-secondary, #aaa)',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          style={{
                            padding: '3px 10px', fontSize: 11, borderRadius: 4,
                            border: 'none', background: 'var(--orion-chat-accent, #8b5cf6)',
                            color: '#fff', cursor: 'pointer',
                          }}
                        >
                          Save Edit
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <ChatMessageBubble
                  key={msg.id}
                  message={msg}
                  conversationId={activeConversationId!}
                  isStreaming={isStreaming && msg.isStreaming === true}
                  streamContent={msg.isStreaming ? currentStreamContent : ''}
                  selectedModel={selectedModel}
                  onCopyCode={handleCopyToClipboard}
                  onApplyCode={handleApplyCode}
                  onInsertCode={handleInsertCode}
                  onEditMessage={handleEditMessage}
                  onRegenerateMessage={handleRegenerateMessage}
                  onCopyMessage={handleCopyToClipboard}
                />
              )
            })}

            {/* Loading skeleton when streaming starts */}
            {isStreaming && messages.length > 0 && !messages[messages.length - 1]?.isStreaming && (
              <MessageSkeleton />
            )}

            {/* Typing indicator */}
            {isStreaming && currentStreamContent === '' && (
              <div style={{ padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--orion-chat-assistant-avatar, #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Sparkles size={12} style={{ color: '#fff' }} />
                </div>
                <TypingIndicator />
              </div>
            )}

            {/* Error retry */}
            {retryState.active && (
              <ErrorRetryIndicator
                attempt={retryState.attempt}
                maxAttempts={5}
                onRetryNow={handleRetryNow}
                onCancel={handleCancelRetry}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* ── Input Area ── */}
      <div
        className="orion-chat-input-area"
        style={{
          borderTop: '1px solid var(--orion-chat-border, rgba(255,255,255,0.08))',
          background: 'var(--orion-chat-input-area-bg, rgba(255,255,255,0.02))',
          flexShrink: 0,
        }}
      >
        {/* Context chips row */}
        {contextChips.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: '6px 12px 0',
          }}>
            {contextChips.map((chip, i) => {
              const ctxDef = CONTEXT_TYPES.find(c => c.id === chip.type)
              return (
                <ContextChip
                  key={`${chip.type}-${i}`}
                  label={chip.label}
                  icon={ctxDef?.icon || FileText}
                  onRemove={() => handleRemoveContextChip(chip.type)}
                  color={
                    chip.type === 'terminal' ? '#f59e0b' :
                    chip.type === 'web' ? '#3b82f6' :
                    chip.type === 'docs' ? '#10b981' :
                    chip.type === 'activeFile' ? '#6366f1' :
                    undefined
                  }
                />
              )
            })}
          </div>
        )}

        {/* Input row */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          padding: '8px 12px',
          position: 'relative',
        }}>
          {/* Context picker button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowContextPicker(!showContextPicker)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 6,
                border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
                background: showContextPicker ? 'var(--orion-chat-item-active, rgba(139,92,246,0.15))' : 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))',
                color: 'var(--orion-chat-text-secondary, #aaa)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                padding: 0,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (!showContextPicker) e.currentTarget.style.background = 'var(--orion-chat-btn-hover, rgba(255,255,255,0.08))' }}
              onMouseLeave={(e) => { if (!showContextPicker) e.currentTarget.style.background = 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))' }}
              title="Add context (@file, @folder, @web, @docs, @terminal)"
            >
              <Plus size={14} />
            </button>
            {showContextPicker && (
              <ContextPicker
                onSelect={handleContextSelect}
                onClose={() => setShowContextPicker(false)}
              />
            )}
          </div>

          {/* Textarea */}
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'flex-end',
            borderRadius: 8,
            border: '1px solid var(--orion-chat-border, rgba(255,255,255,0.12))',
            background: 'var(--orion-chat-input-bg, rgba(255,255,255,0.05))',
            transition: 'border-color 0.15s',
            overflow: 'hidden',
          }}
          onFocus={(e) => {
            const container = e.currentTarget
            container.style.borderColor = 'var(--orion-chat-accent, rgba(139,92,246,0.5))'
          }}
          onBlur={(e) => {
            const container = e.currentTarget
            container.style.borderColor = 'var(--orion-chat-border, rgba(255,255,255,0.12))'
          }}
          >
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value)
                // Auto-resize
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder={isStreaming ? 'Waiting for response...' : 'Ask anything... (@ for context)'}
              disabled={isStreaming}
              rows={1}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--orion-chat-text, #e0e0e0)',
                fontSize: 13,
                lineHeight: 1.5,
                padding: '7px 10px',
                resize: 'none',
                fontFamily: 'inherit',
                maxHeight: 150,
                minHeight: 32,
                boxSizing: 'border-box',
              }}
            />

            {/* Attachment button */}
            <button
              onClick={() => {
                // Trigger file input
                const input = document.createElement('input')
                input.type = 'file'
                input.multiple = true
                input.onchange = () => {
                  if (input.files) {
                    Array.from(input.files).forEach(file => {
                      setContextChips(prev => [...prev, { type: 'file', label: file.name }])
                    })
                  }
                }
                input.click()
              }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 5, border: 'none',
                background: 'transparent', color: 'var(--orion-chat-text-secondary, #777)',
                cursor: 'pointer', padding: 0, margin: '2px 2px 2px 0',
                transition: 'all 0.15s ease', flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--orion-chat-text, #e0e0e0)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--orion-chat-text-secondary, #777)' }}
              title="Attach files"
            >
              <Paperclip size={14} />
            </button>
          </div>

          {/* Send / Stop button */}
          <button
            onClick={isStreaming ? cancelStreaming : handleSendMessage}
            disabled={!isStreaming && !inputValue.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 30,
              height: 30,
              borderRadius: 6,
              border: 'none',
              background: isStreaming
                ? 'var(--orion-chat-danger, #da3633)'
                : inputValue.trim()
                  ? 'var(--orion-chat-accent, #8b5cf6)'
                  : 'var(--orion-chat-btn-bg, rgba(255,255,255,0.06))',
              color: isStreaming || inputValue.trim() ? '#fff' : 'var(--orion-chat-text-secondary, #555)',
              cursor: isStreaming || inputValue.trim() ? 'pointer' : 'default',
              transition: 'all 0.15s ease',
              padding: 0,
              flexShrink: 0,
            }}
            title={isStreaming ? 'Stop generation' : 'Send message (Enter)'}
          >
            {isStreaming ? <Square size={13} /> : <Send size={14} />}
          </button>
        </div>

        {/* Footer row: model selector + token estimate */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 12px 6px',
          fontSize: 10,
          color: 'var(--orion-chat-text-secondary, #666)',
        }}>
          <ModelSelector selectedModel={selectedModel} onSelect={handleModelSelect} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {inputValue.trim() && (
              <span>
                ~{estimateTokens(inputValue)} tokens \u00b7 {formatTokenCost(estimateTokens(inputValue), selectedModel, false)}
              </span>
            )}
            {activeConversation && activeConversation.totalTokens > 0 && (
              <span style={{ opacity: 0.7 }}>
                Total: {activeConversation.totalTokens} tokens
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
