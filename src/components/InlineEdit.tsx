import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Sparkles, X, Loader2, Check, RotateCcw, Pencil, ChevronRight } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged'
  content: string
}

interface Props {
  visible: boolean
  onClose: () => void
  onSubmit: (instruction: string) => void
  onAccept?: (code: string) => void
  onReject?: () => void
  isProcessing: boolean
  selectedText: string
  position: { top: number; left: number }
  selectionRange?: { startLine: number; endLine: number } | null
  aiResponse?: string | null
  language?: string
}

// ── Diff computation ───────────────────────────────────────

function computeInlineDiff(original: string, suggested: string): DiffLine[] {
  const oldLines = original.split('\n')
  const newLines = suggested.split('\n')
  const m = oldLines.length
  const n = newLines.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const stack: DiffLine[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'unchanged', content: oldLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', content: newLines[j - 1] })
      j--
    } else {
      stack.push({ type: 'removed', content: oldLines[i - 1] })
      i--
    }
  }

  return stack.reverse()
}

// ── Syntax highlighting (lightweight) ──────────────────────

const KEYWORDS = new Set([
  'import', 'export', 'from', 'default', 'function', 'const', 'let', 'var',
  'if', 'else', 'return', 'for', 'while', 'class', 'extends', 'new', 'this',
  'try', 'catch', 'throw', 'typeof', 'async', 'await', 'true', 'false',
  'null', 'undefined', 'interface', 'type', 'enum', 'static', 'readonly',
  'public', 'private', 'protected', 'void', 'string', 'number', 'boolean',
  'def', 'self', 'None', 'True', 'False', 'lambda', 'with',
])

function highlightLine(text: string) {
  const regex = /(\/\/.*$|#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|[a-zA-Z_$][\w$]*|[^\s\w]|\s+)/gm
  const tokens: { text: string; color: string }[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const t = match[0]
    let color = 'inherit'
    if (t.startsWith('//') || t.startsWith('#')) color = '#6a9955'
    else if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('`') && t.endsWith('`'))) color = '#ce9178'
    else if (/^\d/.test(t)) color = '#b5cea8'
    else if (KEYWORDS.has(t)) color = '#569cd6'
    else if (/^[^\s\w]$/.test(t)) color = '#d4d4d4'
    tokens.push({ text: t, color })
  }
  if (tokens.length === 0) return <span>{text}</span>
  return <>{tokens.map((tok, i) => <span key={i} style={{ color: tok.color }}>{tok.text}</span>)}</>
}

// ── Phase type ─────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'preview'

// ── Component ──────────────────────────────────────────────

export default function InlineEdit({
  visible,
  onClose,
  onSubmit,
  onAccept,
  onReject,
  isProcessing,
  selectedText,
  position,
  selectionRange,
  aiResponse,
  language,
}: Props) {
  const [instruction, setInstruction] = useState('')
  const [fadeIn, setFadeIn] = useState(false)
  const [showContext, setShowContext] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Determine the current phase
  const phase: Phase = useMemo(() => {
    if (aiResponse) return 'preview'
    if (isProcessing) return 'loading'
    return 'input'
  }, [aiResponse, isProcessing])

  // Compute diff for preview phase
  const diffLines = useMemo(() => {
    if (!aiResponse || !selectedText) return []
    return computeInlineDiff(selectedText, aiResponse)
  }, [aiResponse, selectedText])

  const addedCount = useMemo(() => diffLines.filter(l => l.type === 'added').length, [diffLines])
  const removedCount = useMemo(() => diffLines.filter(l => l.type === 'removed').length, [diffLines])

  // Fade-in animation
  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => setFadeIn(true))
    } else {
      setFadeIn(false)
    }
  }, [visible])

  // Auto-focus and reset on open
  useEffect(() => {
    if (visible && phase === 'input') {
      setInstruction('')
      setShowContext(false)
      setTimeout(() => inputRef.current?.focus(), 80)
    }
  }, [visible, phase])

  // Auto-resize textarea
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInstruction(e.target.value)
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [])

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (phase === 'preview' && onReject) {
        onReject()
      }
      onClose()
    }
    if (e.key === 'Enter' && !e.shiftKey && phase === 'input') {
      e.preventDefault()
      if (instruction.trim() && !isProcessing) {
        onSubmit(instruction.trim())
      }
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && phase === 'preview' && onAccept && aiResponse) {
      e.preventDefault()
      onAccept(aiResponse)
    }
    if (e.key === 'Tab' && phase === 'preview' && onAccept && aiResponse) {
      e.preventDefault()
      onAccept(aiResponse)
    }
  }, [phase, instruction, isProcessing, onSubmit, onClose, onAccept, onReject, aiResponse])

  // Global keyboard handler for preview phase
  useEffect(() => {
    if (!visible || phase !== 'preview') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (onReject) onReject()
        onClose()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (onAccept && aiResponse) onAccept(aiResponse)
      }
      if (e.key === 'Tab' && !e.ctrlKey && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        if (onAccept && aiResponse) onAccept(aiResponse)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, phase, onAccept, onReject, onClose, aiResponse])

  if (!visible) return null

  const lineCount = selectedText ? selectedText.split('\n').length : 0
  const hasSelection = selectedText.length > 0

  // ── Styles ─────────────────────────────────────────────────

  const kbdStyle: React.CSSProperties = {
    padding: '1px 5px',
    background: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    fontSize: 10,
    border: '1px solid rgba(255,255,255,0.1)',
    fontFamily: 'inherit',
    color: 'var(--text-muted)',
  }

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      style={{
        position: 'absolute',
        top: position.top,
        left: Math.max(position.left, 40),
        zIndex: 60,
        width: 520,
        maxWidth: 'calc(100vw - 80px)',
        opacity: fadeIn ? 1 : 0,
        transform: fadeIn ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
        transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          background: '#1e1e2e',
          border: '1px solid rgba(88,166,255,0.3)',
          borderRadius: 10,
          boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(88,166,255,0.1), 0 0 80px rgba(88,166,255,0.05)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'linear-gradient(135deg, rgba(88,166,255,0.08) 0%, rgba(139,92,246,0.05) 100%)',
        }}>
          <div style={{
            width: 20, height: 20,
            borderRadius: 5,
            background: 'linear-gradient(135deg, #58a6ff 0%, #8b5cf6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Sparkles size={11} style={{ color: '#fff' }} />
          </div>
          <span style={{ fontSize: 12, color: '#e4e4e7', fontWeight: 600, letterSpacing: '-0.01em' }}>
            {phase === 'preview' ? 'AI Edit Preview' : phase === 'loading' ? 'Generating...' : 'Edit with AI'}
          </span>

          {/* Selection info badge */}
          {hasSelection && selectionRange && (
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.06)',
              padding: '2px 8px',
              borderRadius: 10,
              fontFamily: "'Cascadia Code', 'Fira Code', monospace",
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ color: '#58a6ff' }}>L{selectionRange.startLine}</span>
              {selectionRange.startLine !== selectionRange.endLine && (
                <>
                  <ChevronRight size={8} style={{ opacity: 0.4 }} />
                  <span style={{ color: '#58a6ff' }}>L{selectionRange.endLine}</span>
                </>
              )}
              <span style={{ opacity: 0.6, marginLeft: 2 }}>({lineCount} line{lineCount !== 1 ? 's' : ''})</span>
            </span>
          )}
          {hasSelection && !selectionRange && (
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.06)',
              padding: '2px 8px',
              borderRadius: 10,
            }}>
              {lineCount} line{lineCount !== 1 ? 's' : ''} selected
            </span>
          )}

          {/* Phase indicators */}
          {phase === 'preview' && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              <span style={{
                fontSize: 10, color: '#3fb950',
                background: 'rgba(63,185,80,0.12)',
                padding: '2px 6px', borderRadius: 3, fontWeight: 500,
              }}>+{addedCount}</span>
              <span style={{
                fontSize: 10, color: '#f85149',
                background: 'rgba(248,81,73,0.12)',
                padding: '2px 6px', borderRadius: 3, fontWeight: 500,
              }}>-{removedCount}</span>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={() => {
              if (phase === 'preview' && onReject) onReject()
              onClose()
            }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 4,
              color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer',
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              marginLeft: phase === 'preview' ? 0 : 'auto',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255,255,255,0.3)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Input Phase ──────────────────────────────────── */}
        {phase === 'input' && (
          <>
            <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <textarea
                ref={inputRef}
                value={instruction}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={hasSelection
                  ? 'Describe changes to the selected code...'
                  : 'Describe code to generate at cursor...'}
                rows={1}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  outline: 'none',
                  fontSize: 13,
                  color: '#e4e4e7',
                  fontFamily: "'Inter', -apple-system, sans-serif",
                  resize: 'none',
                  lineHeight: '1.5',
                  minHeight: 36,
                  maxHeight: 120,
                  transition: 'border-color 0.15s',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(88,166,255,0.4)' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
              />
              <button
                onClick={() => {
                  if (instruction.trim() && !isProcessing) onSubmit(instruction.trim())
                }}
                disabled={!instruction.trim() || isProcessing}
                style={{
                  padding: '8px 16px',
                  background: instruction.trim()
                    ? 'linear-gradient(135deg, #58a6ff 0%, #8b5cf6 100%)'
                    : 'rgba(255,255,255,0.04)',
                  color: instruction.trim() ? '#fff' : 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: instruction.trim() ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.2s',
                  flexShrink: 0,
                  height: 36,
                  opacity: instruction.trim() ? 1 : 0.6,
                }}
              >
                <Sparkles size={12} />
                Edit
              </button>
            </div>

            {/* Selected text context preview */}
            {hasSelection && (
              <div style={{ padding: '0 12px 10px' }}>
                <button
                  onClick={() => setShowContext(!showContext)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 10,
                    cursor: 'pointer',
                    padding: '2px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontFamily: "'Inter', -apple-system, sans-serif",
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                >
                  <ChevronRight
                    size={10}
                    style={{
                      transform: showContext ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                    }}
                  />
                  {showContext ? 'Hide' : 'Show'} selected code
                </button>
                {showContext && (
                  <div style={{
                    marginTop: 6,
                    background: 'rgba(0,0,0,0.3)',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.04)',
                    maxHeight: 150,
                    overflow: 'auto',
                    padding: '8px 10px',
                    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
                    fontSize: 11,
                    lineHeight: '18px',
                    color: 'rgba(255,255,255,0.5)',
                    whiteSpace: 'pre',
                    tabSize: 2,
                  }}>
                    {selectedText.split('\n').map((line, i) => (
                      <div key={i} style={{ display: 'flex', minHeight: 18 }}>
                        <span style={{
                          width: 30, minWidth: 30, textAlign: 'right',
                          paddingRight: 10, color: 'rgba(255,255,255,0.15)',
                          userSelect: 'none', fontSize: 10,
                        }}>
                          {(selectionRange?.startLine ?? 1) + i}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>{highlightLine(line)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Hint bar */}
            <div style={{
              padding: '6px 12px',
              borderTop: '1px solid rgba(255,255,255,0.04)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              background: 'rgba(0,0,0,0.15)',
            }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={kbdStyle}>Enter</kbd> submit
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={kbdStyle}>Shift+Enter</kbd> new line
              </span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <kbd style={kbdStyle}>Esc</kbd> cancel
              </span>
            </div>
          </>
        )}

        {/* ── Loading Phase ────────────────────────────────── */}
        {phase === 'loading' && (
          <div style={{
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              position: 'relative',
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Spinning ring */}
              <div style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '2px solid rgba(88,166,255,0.1)',
                borderTopColor: '#58a6ff',
                animation: 'inlineEditSpin 0.8s linear infinite',
              }} />
              <Sparkles size={14} style={{ color: '#58a6ff' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: '#e4e4e7', fontWeight: 500 }}>
                Generating edit...
              </div>
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4,
              }}>
                {hasSelection
                  ? `Editing ${lineCount} line${lineCount !== 1 ? 's' : ''}`
                  : 'Generating code at cursor'}
              </div>
            </div>
            {/* Progress bar animation */}
            <div style={{
              width: '80%', height: 2, background: 'rgba(255,255,255,0.04)',
              borderRadius: 1, overflow: 'hidden',
            }}>
              <div style={{
                width: '40%', height: '100%',
                background: 'linear-gradient(90deg, transparent 0%, #58a6ff 50%, transparent 100%)',
                borderRadius: 1,
                animation: 'inlineEditProgress 1.5s ease-in-out infinite',
              }} />
            </div>
          </div>
        )}

        {/* ── Preview Phase (Diff) ─────────────────────────── */}
        {phase === 'preview' && aiResponse && (
          <>
            {/* Diff view */}
            <div style={{
              maxHeight: 350,
              overflow: 'auto',
              fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
              fontSize: 12,
              lineHeight: '20px',
            }}>
              {diffLines.length > 0 ? (
                <div style={{ padding: '4px 0' }}>
                  {diffLines.map((line, i) => {
                    const bg = line.type === 'added'
                      ? 'rgba(63,185,80,0.1)'
                      : line.type === 'removed'
                        ? 'rgba(248,81,73,0.1)'
                        : 'transparent'
                    const borderLeft = line.type === 'added'
                      ? '3px solid #3fb950'
                      : line.type === 'removed'
                        ? '3px solid #f85149'
                        : '3px solid transparent'
                    const textColor = line.type === 'removed'
                      ? 'rgba(255,255,255,0.4)'
                      : '#e4e4e7'
                    const textDecoration = line.type === 'removed' ? 'line-through' : 'none'
                    const marker = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '
                    const markerColor = line.type === 'added' ? '#3fb950' : line.type === 'removed' ? '#f85149' : 'transparent'

                    return (
                      <div
                        key={i}
                        style={{
                          display: 'flex',
                          background: bg,
                          borderLeft,
                          padding: '0 12px 0 0',
                          minHeight: 20,
                        }}
                      >
                        <span style={{
                          width: 20, minWidth: 20,
                          color: markerColor,
                          fontWeight: 700,
                          userSelect: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                        }}>
                          {marker}
                        </span>
                        <span style={{
                          flex: 1,
                          whiteSpace: 'pre',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          color: textColor,
                          textDecoration,
                          opacity: line.type === 'removed' ? 0.7 : 1,
                        }}>
                          {highlightLine(line.content)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                /* If no selection diff, just show the generated code */
                <div style={{ padding: '8px 12px' }}>
                  {aiResponse.split('\n').map((line, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      minHeight: 20,
                      background: 'rgba(63,185,80,0.08)',
                      borderLeft: '3px solid #3fb950',
                      padding: '0 12px 0 0',
                    }}>
                      <span style={{
                        width: 20, minWidth: 20,
                        color: '#3fb950', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11,
                      }}>+</span>
                      <span style={{ flex: 1, whiteSpace: 'pre', color: '#e4e4e7' }}>
                        {highlightLine(line)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(0,0,0,0.2)',
              gap: 8,
            }}>
              {/* Keyboard shortcuts hint */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <kbd style={kbdStyle}>Tab</kbd> accept
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <kbd style={kbdStyle}>Esc</kbd> reject
                </span>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {/* Edit/Refine button */}
                <button
                  onClick={() => {
                    if (onReject) onReject()
                    // Don't close - go back to input phase
                  }}
                  style={{
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.6)',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  }}
                >
                  <Pencil size={11} />
                  Refine
                </button>

                {/* Reject button */}
                <button
                  onClick={() => {
                    if (onReject) onReject()
                    onClose()
                  }}
                  style={{
                    padding: '5px 12px',
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'rgba(255,255,255,0.6)',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(248,81,73,0.12)'
                    e.currentTarget.style.borderColor = 'rgba(248,81,73,0.3)'
                    e.currentTarget.style.color = '#f85149'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
                  }}
                >
                  <X size={11} />
                  Reject
                </button>

                {/* Accept button */}
                <button
                  onClick={() => {
                    if (onAccept && aiResponse) onAccept(aiResponse)
                  }}
                  style={{
                    padding: '5px 14px',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#fff',
                    background: 'linear-gradient(135deg, #2ea043 0%, #3fb950 100%)',
                    border: '1px solid #3fb950',
                    borderRadius: 6,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    transition: 'all 0.15s',
                    boxShadow: '0 2px 8px rgba(63,185,80,0.3)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #238636 0%, #2ea043 100%)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #2ea043 0%, #3fb950 100%)'
                  }}
                >
                  <Check size={12} />
                  Accept
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes inlineEditSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes inlineEditProgress {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(200%); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  )
}
