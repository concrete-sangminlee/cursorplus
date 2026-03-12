import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useTerminalStore } from '@/store/terminal'
import 'xterm/css/xterm.css'
import {
  Play, Copy, Pencil, RefreshCw, X, Sparkles, Clock,
  ChevronDown, Loader2,
} from 'lucide-react'

/* ── Catppuccin-inspired dark theme matching the app ──── */
const terminalTheme = {
  background: '#0d1117',
  foreground: '#d4d4d4',
  cursor: '#58a6ff',
  cursorAccent: '#1e1e2e',
  selectionBackground: 'rgba(88, 166, 255, 0.3)',
  black: '#1e1e2e',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#cba6f7',
  cyan: '#94e2d5',
  white: '#cdd6f4',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#cba6f7',
  brightCyan: '#94e2d5',
  brightWhite: '#ffffff',
}

/* ── File path regex patterns for link detection ──────── */
// Matches absolute paths (Windows: C:\... or /unix/...) and relative paths (./foo, ../bar, src/file.ts)
// Optionally followed by :line or :line:col
const FILE_PATH_RE = /(?:(?:[a-zA-Z]:\\|\/)[^\s:*?"<>|]+|(?:\.\.?\/|\b(?:src|lib|app|components|pages|utils|hooks|store|config|test|spec|electron|shared)\/)[^\s:*?"<>|]+)(?::(\d+)(?::(\d+))?)?/g

/* ── Inject overlay styles once ───────────────────────── */
const cmdStyleId = 'terminal-cmd-suggest-styles'
if (typeof document !== 'undefined' && !document.getElementById(cmdStyleId)) {
  const style = document.createElement('style')
  style.id = cmdStyleId
  style.textContent = `
    @keyframes cmd-overlay-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes cmd-pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    @keyframes cmd-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .cmd-suggest-overlay {
      animation: cmd-overlay-in 0.15s ease;
    }
    .cmd-suggest-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: rgba(255,255,255,0.04);
      color: var(--text-secondary);
      font-size: 11px;
      cursor: pointer;
      transition: background 0.12s, color 0.12s, border-color 0.12s;
      font-family: inherit;
      white-space: nowrap;
    }
    .cmd-suggest-btn:hover {
      background: rgba(255,255,255,0.08);
      color: var(--text-primary);
      border-color: rgba(255,255,255,0.15);
    }
    .cmd-suggest-btn.primary {
      background: rgba(88,166,255,0.12);
      border-color: rgba(88,166,255,0.3);
      color: var(--accent);
    }
    .cmd-suggest-btn.primary:hover {
      background: rgba(88,166,255,0.2);
      border-color: rgba(88,166,255,0.5);
      color: #79c0ff;
    }
    .cmd-suggest-history-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      width: 100%;
      text-align: left;
      border: none;
      background: transparent;
      color: var(--text-secondary);
      font-size: 11px;
      font-family: var(--font-mono, monospace);
      cursor: pointer;
      transition: background 0.1s;
    }
    .cmd-suggest-history-item:hover {
      background: rgba(255,255,255,0.05);
      color: var(--text-primary);
    }
  `
  document.head.appendChild(style)
}

/* ── OS detection ─────────────────────────────────────── */
const isWindows = navigator.userAgent.includes('Windows') || navigator.platform?.startsWith('Win')

/* ── Command pattern database (fallback without AI) ───── */
interface CommandPattern {
  keywords: string[]
  generate: (input: string) => string
}

const commandPatterns: CommandPattern[] = [
  // File finding
  {
    keywords: ['find file', 'find files', 'search file', 'locate file', 'find all'],
    generate: (input) => {
      const extMatch = input.match(/\.(ts|tsx|js|jsx|py|go|rs|java|css|html|json|md|txt|yaml|yml|xml|sql|sh|bat|rb|php|c|cpp|h)\b/i)
      const ext = extMatch ? extMatch[1] : '*'
      const sizeMatch = input.match(/(\d+)\s*(kb|mb|gb)/i)
      if (sizeMatch) {
        const size = parseInt(sizeMatch[1])
        const unit = sizeMatch[2].toLowerCase()
        const bytes = unit === 'kb' ? size * 1024 : unit === 'mb' ? size * 1024 * 1024 : size * 1024 * 1024 * 1024
        return isWindows
          ? `Get-ChildItem -Recurse -File -Filter "*.${ext}" | Where-Object { $_.Length -gt ${bytes} } | Select-Object FullName, @{N='Size(KB)';E={[math]::Round($_.Length/1KB,1)}}`
          : `find . -name "*.${ext}" -size +${sizeMatch[1]}${unit === 'kb' ? 'k' : unit === 'mb' ? 'M' : 'G'} -exec ls -lh {} \\;`
      }
      const nameMatch = input.match(/named?\s+["']?([^\s"']+)["']?/i)
      const pattern = nameMatch ? nameMatch[1] : `*.${ext}`
      return isWindows
        ? `Get-ChildItem -Recurse -Filter "${pattern}" | Select-Object FullName`
        : `find . -name "${pattern}" -type f`
    },
  },
  // Install package
  {
    keywords: ['install package', 'install dep', 'add package', 'add dep', 'npm install', 'yarn add', 'pip install'],
    generate: (input) => {
      const pkgMatch = input.match(/(?:install|add)\s+(?:package\s+)?["']?([a-zA-Z0-9@/._-]+)["']?/i)
      const pkg = pkgMatch ? pkgMatch[1] : '<package-name>'
      if (input.match(/pip|python/i)) return `pip install ${pkg}`
      if (input.match(/yarn/i)) return `yarn add ${pkg}`
      if (input.match(/pnpm/i)) return `pnpm add ${pkg}`
      if (input.match(/dev\s*dep/i)) return `npm install --save-dev ${pkg}`
      return `npm install ${pkg}`
    },
  },
  // Git operations
  {
    keywords: ['git commit', 'commit change', 'commit all', 'save changes'],
    generate: (input) => {
      const msgMatch = input.match(/(?:message|msg|with)\s+["']([^"']+)["']/i)
      const msg = msgMatch ? msgMatch[1] : 'Update changes'
      return `git add -A && git commit -m "${msg}"`
    },
  },
  {
    keywords: ['git push', 'push to remote', 'push changes'],
    generate: () => 'git push origin HEAD',
  },
  {
    keywords: ['git pull', 'pull latest', 'pull changes'],
    generate: () => 'git pull origin main',
  },
  {
    keywords: ['git status', 'check status', 'what changed'],
    generate: () => 'git status',
  },
  {
    keywords: ['git branch', 'list branch', 'show branch', 'current branch'],
    generate: () => 'git branch -a',
  },
  {
    keywords: ['create branch', 'new branch', 'checkout new', 'switch branch'],
    generate: (input) => {
      const nameMatch = input.match(/(?:branch|named?)\s+["']?([a-zA-Z0-9/_-]+)["']?/i)
      const name = nameMatch ? nameMatch[1] : 'feature/new-branch'
      return `git checkout -b ${name}`
    },
  },
  {
    keywords: ['git log', 'commit history', 'show log', 'recent commits'],
    generate: () => 'git log --oneline -20',
  },
  {
    keywords: ['git diff', 'show diff', 'what changed', 'show changes'],
    generate: () => 'git diff',
  },
  {
    keywords: ['git stash', 'stash changes'],
    generate: () => 'git stash',
  },
  // Process management
  {
    keywords: ['list process', 'show process', 'running process', 'task list', 'ps aux'],
    generate: () => isWindows ? 'tasklist' : 'ps aux',
  },
  {
    keywords: ['kill process', 'stop process', 'end task'],
    generate: (input) => {
      const nameMatch = input.match(/(?:kill|stop|end)\s+(?:process|task)?\s*["']?([a-zA-Z0-9._-]+)["']?/i)
      const name = nameMatch ? nameMatch[1] : '<process-name>'
      return isWindows ? `taskkill /IM "${name}" /F` : `pkill -f "${name}"`
    },
  },
  // Disk / system info
  {
    keywords: ['disk space', 'free space', 'storage', 'disk usage'],
    generate: () => isWindows ? 'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N="Used(GB)";E={[math]::Round($_.Used/1GB,2)}}, @{N="Free(GB)";E={[math]::Round($_.Free/1GB,2)}}' : 'df -h',
  },
  {
    keywords: ['memory', 'ram usage', 'free memory'],
    generate: () => isWindows ? 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name, @{N="Mem(MB)";E={[math]::Round($_.WorkingSet64/1MB,1)}}' : 'free -h',
  },
  // Directory operations
  {
    keywords: ['list files', 'show files', 'dir', 'ls', 'directory contents'],
    generate: (input) => {
      const dirMatch = input.match(/(?:in|of|from)\s+["']?([^\s"']+)["']?/i)
      const dir = dirMatch ? dirMatch[1] : '.'
      return isWindows ? `Get-ChildItem "${dir}" -Force` : `ls -la ${dir}`
    },
  },
  {
    keywords: ['create dir', 'make dir', 'mkdir', 'new folder', 'create folder'],
    generate: (input) => {
      const nameMatch = input.match(/(?:directory|dir|folder|named?)\s+["']?([^\s"']+)["']?/i)
      const name = nameMatch ? nameMatch[1] : 'new-folder'
      return isWindows ? `New-Item -ItemType Directory -Name "${name}"` : `mkdir -p ${name}`
    },
  },
  // Network
  {
    keywords: ['port', 'listening', 'open port', 'what port', 'which port'],
    generate: () => isWindows ? 'netstat -ano | findstr LISTENING' : 'ss -tlnp',
  },
  {
    keywords: ['curl', 'http request', 'fetch url', 'download'],
    generate: (input) => {
      const urlMatch = input.match(/https?:\/\/[^\s]+/i)
      const url = urlMatch ? urlMatch[0] : 'https://example.com'
      return `curl -s "${url}"`
    },
  },
  // Search in files
  {
    keywords: ['search in file', 'grep', 'find text', 'search text', 'search for', 'find string', 'search content'],
    generate: (input) => {
      const textMatch = input.match(/(?:for|text|string|content)\s+["']([^"']+)["']/i) || input.match(/["']([^"']+)["']/i)
      const text = textMatch ? textMatch[1] : '<search-term>'
      return isWindows
        ? `Get-ChildItem -Recurse -File | Select-String -Pattern "${text}" | Select-Object -First 20 Path, LineNumber, Line`
        : `grep -rn "${text}" . --include="*.{ts,tsx,js,jsx,py,go,rs}" | head -20`
    },
  },
  // Docker
  {
    keywords: ['docker', 'container', 'docker ps'],
    generate: (input) => {
      if (input.match(/stop|kill/i)) return 'docker stop $(docker ps -q)'
      if (input.match(/log/i)) return 'docker logs --tail 50 <container>'
      if (input.match(/build/i)) return 'docker build -t myapp .'
      if (input.match(/run/i)) return 'docker run -d -p 3000:3000 myapp'
      return 'docker ps -a'
    },
  },
  // npm scripts
  {
    keywords: ['run script', 'npm run', 'start dev', 'dev server', 'start server'],
    generate: (input) => {
      if (input.match(/build/i)) return 'npm run build'
      if (input.match(/test/i)) return 'npm test'
      if (input.match(/lint/i)) return 'npm run lint'
      return 'npm run dev'
    },
  },
  // Delete / remove
  {
    keywords: ['delete', 'remove file', 'rm', 'remove dir', 'clean'],
    generate: (input) => {
      if (input.match(/node_modules/i)) return isWindows ? 'Remove-Item -Recurse -Force node_modules' : 'rm -rf node_modules'
      if (input.match(/dist|build|out/i)) {
        const dir = input.match(/(dist|build|out)/i)?.[1] || 'dist'
        return isWindows ? `Remove-Item -Recurse -Force ${dir}` : `rm -rf ${dir}`
      }
      const fileMatch = input.match(/(?:delete|remove|rm)\s+["']?([^\s"']+)["']?/i)
      const file = fileMatch ? fileMatch[1] : '<file>'
      return isWindows ? `Remove-Item "${file}"` : `rm "${file}"`
    },
  },
  // Environment / path
  {
    keywords: ['env', 'environment variable', 'show env', 'path variable'],
    generate: (input) => {
      if (input.match(/path/i)) return isWindows ? '$env:PATH -split ";"' : 'echo $PATH | tr ":" "\\n"'
      return isWindows ? 'Get-ChildItem Env: | Format-Table Name, Value -AutoSize' : 'env | sort'
    },
  },
  // Count lines
  {
    keywords: ['count lines', 'line count', 'wc', 'how many lines'],
    generate: (input) => {
      const fileMatch = input.match(/(?:in|of)\s+["']?([^\s"']+)["']?/i)
      const file = fileMatch ? fileMatch[1] : '.'
      if (file === '.' || input.match(/project|all|total/i)) {
        return isWindows
          ? `Get-ChildItem -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx | Get-Content | Measure-Object -Line | Select-Object Lines`
          : `find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | xargs wc -l | tail -1`
      }
      return isWindows ? `(Get-Content "${file}" | Measure-Object -Line).Lines` : `wc -l "${file}"`
    },
  },
]

/* ── Generate command from user description ───────────── */
function generateCommand(description: string): string {
  const lower = description.toLowerCase().trim()

  // Try to match a pattern
  for (const pattern of commandPatterns) {
    for (const keyword of pattern.keywords) {
      if (lower.includes(keyword)) {
        return pattern.generate(description)
      }
    }
  }

  // Fuzzy matching: check if individual words match
  const words = lower.split(/\s+/)
  for (const pattern of commandPatterns) {
    for (const keyword of pattern.keywords) {
      const kwWords = keyword.split(/\s+/)
      const matchCount = kwWords.filter(kw => words.some(w => w.includes(kw) || kw.includes(w))).length
      if (matchCount >= kwWords.length * 0.7) {
        return pattern.generate(description)
      }
    }
  }

  // If description looks like a command already, return it
  if (lower.match(/^(git|npm|yarn|pnpm|pip|docker|kubectl|curl|wget|cat|ls|dir|cd|mkdir|rm|cp|mv|chmod|chown|grep|find|sed|awk|tar|zip|ssh|scp)\s/)) {
    return description.trim()
  }

  // Generic fallback
  return isWindows
    ? `# Could not generate a specific command for: "${description}"\n# Try describing the task more specifically, e.g.:\n#   "find all .ts files larger than 50KB"\n#   "git commit with message 'fix: update login'\n#   "kill process named node"`
    : `# Could not generate a specific command for: "${description}"\n# Try describing the task more specifically, e.g.:\n#   "find all .ts files larger than 50KB"\n#   "git commit with message 'fix: update login'"\n#   "kill process named node"`
}

/* ── localStorage history ─────────────────────────────── */
const HISTORY_KEY = 'terminal-cmd-suggest-history'
const MAX_HISTORY = 10

interface HistoryEntry {
  description: string
  command: string
  timestamp: number
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveToHistory(description: string, command: string) {
  const history = loadHistory()
  // Don't save fallback/error commands
  if (command.startsWith('#')) return
  // Deduplicate by command
  const filtered = history.filter(h => h.command !== command)
  filtered.unshift({ description, command, timestamp: Date.now() })
  if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered))
  } catch {}
}

/* ── Syntax highlighting for generated commands ───────── */
function highlightCommand(cmd: string): JSX.Element[] {
  const lines = cmd.split('\n')
  return lines.map((line, lineIdx) => {
    if (line.startsWith('#')) {
      return (
        <div key={lineIdx} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {line}
        </div>
      )
    }
    // Simple token highlighting
    const tokens = line.split(/(\s+|&&|\||;|"|'|`|\$\([^)]*\)|\$\{[^}]*\}|\$[A-Za-z_]\w*)/)
    return (
      <div key={lineIdx}>
        {tokens.map((token, i) => {
          // Operators
          if (/^(&&|\|{1,2}|;|>|>>|<)$/.test(token)) {
            return <span key={i} style={{ color: '#f9e2af' }}>{token}</span>
          }
          // Flags
          if (/^--?[a-zA-Z]/.test(token)) {
            return <span key={i} style={{ color: '#94e2d5' }}>{token}</span>
          }
          // Strings
          if (/^["'`]/.test(token)) {
            return <span key={i} style={{ color: '#a6e3a1' }}>{token}</span>
          }
          // Variables
          if (/^\$/.test(token)) {
            return <span key={i} style={{ color: '#cba6f7' }}>{token}</span>
          }
          // First real token on the line is the command name
          if (i === 0 && token.trim()) {
            return <span key={i} style={{ color: '#89b4fa', fontWeight: 600 }}>{token}</span>
          }
          return <span key={i}>{token}</span>
        })}
      </div>
    )
  })
}

/* ── Command Suggestion Overlay component ─────────────── */

interface CmdSuggestProps {
  visible: boolean
  onClose: () => void
  onRun: (command: string) => void
}

function CommandSuggestOverlay({ visible, onClose, onRun }: CmdSuggestProps) {
  const [query, setQuery] = useState('')
  const [generatedCommand, setGeneratedCommand] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const history = loadHistory()

  // Focus input when visible
  useEffect(() => {
    if (visible) {
      setQuery('')
      setGeneratedCommand(null)
      setIsEditing(false)
      setEditValue('')
      setShowHistory(false)
      setCopied(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [visible])

  // Focus edit textarea when editing
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [isEditing])

  // Close on Escape
  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (isEditing) {
          setIsEditing(false)
        } else if (generatedCommand) {
          setGeneratedCommand(null)
          setQuery('')
          setTimeout(() => inputRef.current?.focus(), 50)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, isEditing, generatedCommand, onClose])

  // Close when clicking outside
  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [visible, onClose])

  const handleGenerate = useCallback(() => {
    if (!query.trim()) return
    setIsGenerating(true)
    // Simulate brief generation delay for UX
    setTimeout(() => {
      const cmd = generateCommand(query)
      setGeneratedCommand(cmd)
      setEditValue(cmd)
      setIsGenerating(false)
      if (!cmd.startsWith('#')) {
        saveToHistory(query, cmd)
      }
    }, 300 + Math.random() * 200)
  }, [query])

  const handleRegenerate = useCallback(() => {
    if (!query.trim()) return
    setIsGenerating(true)
    setTimeout(() => {
      const cmd = generateCommand(query)
      setGeneratedCommand(cmd)
      setEditValue(cmd)
      setIsGenerating(false)
    }, 300 + Math.random() * 200)
  }, [query])

  const handleRun = useCallback(() => {
    const cmd = isEditing ? editValue : generatedCommand
    if (!cmd || cmd.startsWith('#')) return
    onRun(cmd)
    onClose()
  }, [generatedCommand, isEditing, editValue, onRun, onClose])

  const handleCopy = useCallback(() => {
    const cmd = isEditing ? editValue : generatedCommand
    if (!cmd) return
    navigator.clipboard.writeText(cmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [generatedCommand, isEditing, editValue])

  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    setQuery(entry.description)
    setGeneratedCommand(entry.command)
    setEditValue(entry.command)
    setShowHistory(false)
  }, [])

  if (!visible) return null

  return (
    <div
      ref={overlayRef}
      className="cmd-suggest-overlay"
      style={{
        position: 'absolute',
        bottom: 8,
        left: 12,
        right: 12,
        zIndex: 100,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 -4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(88,166,255,0.1)',
        overflow: 'hidden',
      }}
    >
      {/* ── Input area ──────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderBottom: generatedCommand || showHistory ? '1px solid var(--border)' : 'none',
        }}
      >
        <Sparkles
          size={14}
          style={{
            color: 'var(--accent)',
            flexShrink: 0,
            animation: isGenerating ? 'cmd-pulse 1s infinite' : undefined,
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value)
            if (generatedCommand) {
              setGeneratedCommand(null)
              setIsEditing(false)
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (generatedCommand && !generatedCommand.startsWith('#')) {
                handleRun()
              } else {
                handleGenerate()
              }
            }
          }}
          placeholder="Describe what you want to do..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-primary)',
            fontSize: 13,
            fontFamily: 'inherit',
            padding: 0,
          }}
        />
        {/* History toggle */}
        {history.length > 0 && !generatedCommand && (
          <button
            className="cmd-suggest-btn"
            onClick={() => setShowHistory(prev => !prev)}
            title="Command history"
            style={{ padding: '3px 6px' }}
          >
            <Clock size={12} />
            <ChevronDown
              size={10}
              style={{
                transform: showHistory ? 'rotate(180deg)' : 'rotate(0)',
                transition: 'transform 0.15s',
              }}
            />
          </button>
        )}
        {/* Generate button */}
        {!generatedCommand && (
          <button
            className="cmd-suggest-btn primary"
            onClick={handleGenerate}
            disabled={isGenerating || !query.trim()}
            style={{
              opacity: isGenerating || !query.trim() ? 0.5 : 1,
            }}
          >
            {isGenerating ? (
              <Loader2 size={12} style={{ animation: 'cmd-spin 1s linear infinite' }} />
            ) : (
              <Sparkles size={12} />
            )}
            Generate
          </button>
        )}
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 4,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            transition: 'background 0.1s, color 0.1s',
            flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          title="Close (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── History dropdown ────────────────────────────── */}
      {showHistory && !generatedCommand && (
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
          <div
            style={{
              padding: '4px 12px 2px',
              fontSize: 10,
              color: 'var(--text-muted)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Recent Commands
          </div>
          {history.map((entry, i) => (
            <button
              key={i}
              className="cmd-suggest-history-item"
              onClick={() => handleHistorySelect(entry)}
            >
              <Clock size={10} style={{ flexShrink: 0, opacity: 0.4 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.command}
              </span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }}>
                {new Date(entry.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Generated command preview ───────────────────── */}
      {generatedCommand && (
        <div style={{ padding: '0' }}>
          {/* Command display */}
          <div
            style={{
              padding: '10px 14px',
              fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              background: 'rgba(0,0,0,0.2)',
              overflowX: 'auto',
              whiteSpace: 'pre',
            }}
          >
            {isEditing ? (
              <textarea
                ref={editRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault()
                    handleRun()
                  }
                }}
                style={{
                  width: '100%',
                  minHeight: 40,
                  background: 'transparent',
                  border: '1px solid rgba(88,166,255,0.3)',
                  borderRadius: 4,
                  color: 'var(--text-primary)',
                  fontFamily: 'inherit',
                  fontSize: 'inherit',
                  lineHeight: 'inherit',
                  resize: 'vertical',
                  outline: 'none',
                  padding: '4px 6px',
                }}
              />
            ) : (
              highlightCommand(generatedCommand)
            )}
          </div>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderTop: '1px solid var(--border)',
            }}
          >
            {/* Run */}
            <button
              className="cmd-suggest-btn primary"
              onClick={handleRun}
              disabled={generatedCommand.startsWith('#')}
              style={{
                opacity: generatedCommand.startsWith('#') ? 0.4 : 1,
              }}
              title={isEditing ? 'Run edited command (Ctrl+Enter)' : 'Run command (Enter)'}
            >
              <Play size={11} />
              Run
            </button>

            {/* Copy */}
            <button className="cmd-suggest-btn" onClick={handleCopy} title="Copy to clipboard">
              <Copy size={11} />
              {copied ? 'Copied!' : 'Copy'}
            </button>

            {/* Edit / Done editing */}
            <button
              className="cmd-suggest-btn"
              onClick={() => {
                if (isEditing) {
                  setGeneratedCommand(editValue)
                  setIsEditing(false)
                } else {
                  setIsEditing(true)
                }
              }}
              title={isEditing ? 'Done editing' : 'Edit command before running'}
            >
              <Pencil size={11} />
              {isEditing ? 'Done' : 'Edit'}
            </button>

            {/* Regenerate */}
            <button className="cmd-suggest-btn" onClick={handleRegenerate} title="Regenerate command">
              <RefreshCw size={11} />
              Regenerate
            </button>

            {/* Spacer + hint */}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>
              {isEditing ? 'Ctrl+Enter to run' : 'Enter to run  |  Esc to dismiss'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main TerminalPanel component ─────────────────────── */

interface Props {
  sessionId: string
  shellPath?: string
  shellArgs?: string[]
  onTitleChange?: (sessionId: string, title: string) => void
}

export default function TerminalPanel({ sessionId, shellPath, shellArgs, onTitleChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const initRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [showCmdSuggest, setShowCmdSuggest] = useState(false)
  const { addSession } = useTerminalStore()

  /* ── Run a command in the terminal ────────────────────── */
  const runCommand = useCallback((cmd: string) => {
    // Send each line to the terminal PTY
    const lines = cmd.split('\n').filter(l => !l.startsWith('#'))
    const finalCmd = lines.join(' && ')
    if (finalCmd.trim()) {
      window.api.termWrite(sessionId, finalCmd + '\r')
    }
  }, [sessionId])

  useEffect(() => {
    if (!containerRef.current || initRef.current) return
    initRef.current = true

    const term = new Terminal({
      theme: terminalTheme,
      fontSize: 13,
      fontFamily: 'Cascadia Code, Fira Code, Consolas, monospace',
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      scrollback: 5000,
      smoothScrollDuration: 100,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)

    /* ── URL link detection (opens in external browser) ── */
    term.loadAddon(new WebLinksAddon((_event, uri) => {
      if (window.api?.showItemInFolder) {
        // Use Electron shell.openExternal equivalent
        // For URLs, we open them externally; the WebLinksAddon handles http/https
        window.open(uri, '_blank')
      } else {
        window.open(uri, '_blank')
      }
    }))

    /* ── File path link detection ────────────────────────── */
    term.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const line = term.buffer.active.getLine(bufferLineNumber - 1)
        if (!line) { callback(undefined); return }

        const text = line.translateToString(true)
        const links: Array<{
          range: { start: { x: number; y: number }; end: { x: number; y: number } }
          text: string
          activate: (_event: MouseEvent, linkText: string) => void
          hover?: (_event: MouseEvent, linkText: string) => void
        }> = []

        FILE_PATH_RE.lastIndex = 0
        let match: RegExpExecArray | null
        while ((match = FILE_PATH_RE.exec(text)) !== null) {
          const fullMatch = match[0]
          const startX = match.index + 1 // xterm is 1-based
          const endX = startX + fullMatch.length - 1

          // Extract the file path without :line:col suffix
          const pathOnly = fullMatch.replace(/:\d+(?::\d+)?$/, '')
          const lineNum = match[1] ? parseInt(match[1], 10) : undefined
          const colNum = match[2] ? parseInt(match[2], 10) : undefined

          links.push({
            range: {
              start: { x: startX, y: bufferLineNumber },
              end: { x: endX, y: bufferLineNumber },
            },
            text: fullMatch,
            activate: () => {
              window.dispatchEvent(new CustomEvent('orion:open-file', {
                detail: { path: pathOnly, line: lineNum, column: colNum },
              }))
            },
          })
        }

        callback(links.length > 0 ? links : undefined)
      },
    })

    term.open(containerRef.current)
    fit.fit()

    termRef.current = term
    fitRef.current = fit

    addSession({ id: sessionId, name: 'Terminal', type: 'shell', shellPath })

    /* ── Title tracking ────────────────────────────────── */
    term.onTitleChange((title) => {
      onTitleChange?.(sessionId, title)
    })

    /* ── Keyboard shortcuts ────────────────────────────── */
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+K: Open AI command suggestion overlay
      if (event.ctrlKey && !event.shiftKey && event.key === 'k' && event.type === 'keydown') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('terminal:toggle-cmd-suggest', {
          detail: { sessionId },
        }))
        return false
      }

      // Ctrl+Shift+C: Copy from terminal
      if (event.ctrlKey && event.shiftKey && event.key === 'C' && event.type === 'keydown') {
        const sel = term.getSelection()
        if (sel) {
          navigator.clipboard.writeText(sel)
        }
        return false // prevent xterm from handling it
      }

      // Ctrl+Shift+V: Paste to terminal
      if (event.ctrlKey && event.shiftKey && event.key === 'V' && event.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          term.paste(text)
        })
        return false
      }

      // Ctrl+Shift+`: New terminal (handled by BottomPanel via global listener)
      // Let the event propagate so the parent catches it
      if (event.ctrlKey && event.shiftKey && event.key === '`') {
        return false
      }

      // Ctrl+L: Clear terminal (also send to shell for native handling)
      if (event.ctrlKey && !event.shiftKey && event.key === 'l' && event.type === 'keydown') {
        term.clear()
        // Still let the event through to the shell
        return true
      }

      return true
    })

    /* ── Create backend PTY ────────────────────────────── */
    const shellOptions = shellPath ? { shellPath, shellArgs: shellArgs || [] } : undefined

    window.api.termCreate(sessionId, shellOptions).then((result: any) => {
      if (result && !result.success) {
        setError(result.error || 'Failed to create terminal')
        term.writeln('\x1b[31mTerminal failed to start: ' + (result.error || 'Unknown error') + '\x1b[0m')
        term.writeln('\x1b[33mThis is a known issue with node-pty on some Windows configurations.\x1b[0m')
        return
      }
      term.onData((data) => window.api.termWrite(sessionId, data))
      term.onResize(({ cols, rows }) => window.api.termResize(sessionId, cols, rows))
    }).catch((err: any) => {
      setError(err.message)
      term.writeln('\x1b[31mTerminal error: ' + err.message + '\x1b[0m')
    })

    const cleanup = window.api.onTermData((id: string, data: string) => {
      if (id === sessionId) term.write(data)
    })

    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit() } catch {}
    })
    resizeObserver.observe(containerRef.current)

    /* ── Listen for clear terminal events ──────────────── */
    const handleClear = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.sessionId === sessionId) {
        term.clear()
        // Also write a clear-screen escape to reset visual state
        term.write('\x1b[2J\x1b[H')
      }
    }
    window.addEventListener('terminal:clear', handleClear)

    return () => {
      cleanup()
      resizeObserver.disconnect()
      window.removeEventListener('terminal:clear', handleClear)
      term.dispose()
      window.api.termKill(sessionId)
    }
  }, [])

  /* ── Listen for Ctrl+K toggle event from the terminal ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.sessionId === sessionId) {
        setShowCmdSuggest(prev => !prev)
      }
    }
    window.addEventListener('terminal:toggle-cmd-suggest', handler)
    return () => window.removeEventListener('terminal:toggle-cmd-suggest', handler)
  }, [sessionId])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} className="h-full w-full" />
      <CommandSuggestOverlay
        visible={showCmdSuggest}
        onClose={() => setShowCmdSuggest(false)}
        onRun={runCommand}
      />
    </div>
  )
}
