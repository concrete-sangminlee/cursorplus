import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { SearchAddon } from 'xterm-addon-search'
import { WebLinksAddon } from 'xterm-addon-web-links'
import { useTerminalStore } from '@/store/terminal'
import 'xterm/css/xterm.css'
import {
  Play, Copy, Pencil, RefreshCw, X, Sparkles, Clock,
  ChevronDown, Loader2, Plus, Columns2, Trash2, Ban,
  Maximize2, Minimize2, Search, ArrowUp, ArrowDown,
  Terminal as TerminalIcon,
} from 'lucide-react'

/* ── Inject TerminalPanel-specific styles once ─────────── */
const tpStyleId = 'terminal-panel-v2-styles'
if (typeof document !== 'undefined' && !document.getElementById(tpStyleId)) {
  const style = document.createElement('style')
  style.id = tpStyleId
  style.textContent = `
    @keyframes tp-tab-slide-in {
      from { opacity: 0; transform: translateX(-4px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    @keyframes tp-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes tp-find-slide {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes tp-split-grow {
      from { opacity: 0; flex-basis: 0; }
      to   { opacity: 1; }
    }
    .tp-tab {
      transition: background 0.12s, color 0.12s, box-shadow 0.12s;
    }
    .tp-tab:hover {
      background: var(--bg-tertiary) !important;
    }
    .tp-tab[data-active="true"] {
      background: var(--bg-secondary) !important;
      color: var(--text-primary) !important;
    }
    .tp-tab .tp-tab-close {
      opacity: 0;
      transition: opacity 0.1s, background 0.1s;
    }
    .tp-tab:hover .tp-tab-close {
      opacity: 0.6;
    }
    .tp-tab .tp-tab-close:hover {
      opacity: 1 !important;
      background: rgba(248,81,73,0.15);
    }
    .tp-toolbar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      background: transparent;
      transition: background 0.12s, color 0.12s, transform 0.1s;
    }
    .tp-toolbar-btn:hover {
      background: rgba(255,255,255,0.08);
      color: var(--text-primary);
    }
    .tp-toolbar-btn:active {
      transform: scale(0.92);
    }
    .tp-toolbar-btn[data-active="true"] {
      color: var(--accent-blue);
      background: rgba(88,166,255,0.1);
    }
    .tp-rename-input {
      background: var(--bg-primary);
      border: 1px solid var(--accent-blue);
      border-radius: 2px;
      outline: none;
      color: var(--text-primary);
      font-size: 11px;
      padding: 0 4px;
      height: 18px;
      width: 90px;
      font-family: inherit;
    }
    .tp-shell-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      min-width: 200px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 4px 0;
      z-index: 1000;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: tp-fade-in 0.12s ease;
    }
    .tp-shell-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 10px;
      font-size: 11px;
      color: var(--text-muted);
      background: transparent;
      border: none;
      cursor: pointer;
      text-align: left;
      transition: background 0.12s, color 0.12s;
    }
    .tp-shell-item:hover {
      background: rgba(255,255,255,0.06);
      color: var(--text-primary);
    }
    .tp-find-bar {
      animation: tp-find-slide 0.15s ease;
    }
    .tp-find-input {
      flex: 1;
      background: var(--bg-primary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      color: var(--text-primary);
      font-size: 12px;
      padding: 3px 8px;
      height: 26px;
      outline: none;
      font-family: inherit;
      transition: border-color 0.15s;
    }
    .tp-find-input:focus {
      border-color: var(--accent-blue);
    }
    .tp-find-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: 3px;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      background: transparent;
      transition: background 0.1s, color 0.1s;
    }
    .tp-find-btn:hover {
      background: rgba(255,255,255,0.08);
      color: var(--text-primary);
    }
    .tp-split-divider {
      width: 4px;
      cursor: col-resize;
      background: transparent;
      transition: background 0.15s;
      position: relative;
      flex-shrink: 0;
      z-index: 5;
    }
    .tp-split-divider::after {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      left: 1px;
      width: 2px;
      background: var(--border-color);
      transition: background 0.15s;
    }
    .tp-split-divider:hover::after,
    .tp-split-divider.dragging::after {
      background: var(--accent-blue);
    }
    .tp-split-header {
      transition: background 0.15s, border-color 0.15s;
      cursor: pointer;
      user-select: none;
    }
    .tp-split-header:hover {
      background: rgba(255,255,255,0.03) !important;
    }
    .tp-kill-btn {
      color: var(--accent-red, #f85149) !important;
      opacity: 0.85;
    }
    .tp-kill-btn:hover {
      background: rgba(248,81,73,0.15) !important;
      color: var(--accent-red, #f85149) !important;
      opacity: 1;
    }
    .tp-xterm-container {
      padding: 6px 4px 4px 6px;
      border-radius: 0 0 6px 6px;
      overflow: hidden;
    }
    .tp-xterm-container .xterm {
      border-radius: 4px;
    }
    .tp-xterm-container .xterm-viewport {
      border-radius: 4px;
    }
  `
  document.head.appendChild(style)
}

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

/* ── Shell profile definitions ────────────────────────── */
interface ShellProfile {
  id: string
  name: string
  shellPath: string
  args: string[]
  icon: string
}

const windowsShellProfiles: ShellProfile[] = [
  { id: 'powershell', name: 'PowerShell', shellPath: 'powershell.exe', args: [], icon: 'PS' },
  { id: 'cmd', name: 'Command Prompt', shellPath: 'cmd.exe', args: [], icon: '>' },
  { id: 'gitbash', name: 'Git Bash', shellPath: 'C:\\Program Files\\Git\\bin\\bash.exe', args: ['--login', '-i'], icon: '$' },
  { id: 'wsl', name: 'WSL', shellPath: 'wsl.exe', args: [], icon: '#' },
]

const unixShellProfiles: ShellProfile[] = [
  { id: 'bash', name: 'bash', shellPath: '/bin/bash', args: ['--login'], icon: '$' },
  { id: 'zsh', name: 'zsh', shellPath: '/bin/zsh', args: ['--login'], icon: '%' },
]

const shellProfiles = isWindows ? windowsShellProfiles : unixShellProfiles

/* ── Detect shell type icon from path ─────────────────── */
function getShellIcon(shellPath?: string): string {
  if (!shellPath) return isWindows ? 'PS' : '$'
  const lower = shellPath.toLowerCase()
  if (lower.includes('powershell') || lower.includes('pwsh')) return 'PS'
  if (lower.includes('cmd')) return '>'
  if (lower.includes('bash')) return '$'
  if (lower.includes('zsh')) return '%'
  if (lower.includes('wsl')) return '#'
  if (lower.includes('fish')) return '><'
  return '$'
}

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
  { keywords: ['install package', 'install dep', 'add package', 'add dep', 'npm install', 'yarn add', 'pip install'],
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
  { keywords: ['git commit', 'commit change', 'commit all', 'save changes'],
    generate: (input) => {
      const msgMatch = input.match(/(?:message|msg|with)\s+["']([^"']+)["']/i)
      const msg = msgMatch ? msgMatch[1] : 'Update changes'
      return `git add -A && git commit -m "${msg}"`
    },
  },
  { keywords: ['git push', 'push to remote', 'push changes'], generate: () => 'git push origin HEAD' },
  { keywords: ['git pull', 'pull latest', 'pull changes'], generate: () => 'git pull origin main' },
  { keywords: ['git status', 'check status', 'what changed'], generate: () => 'git status' },
  { keywords: ['git branch', 'list branch', 'show branch', 'current branch'], generate: () => 'git branch -a' },
  { keywords: ['create branch', 'new branch', 'checkout new', 'switch branch'],
    generate: (input) => {
      const nameMatch = input.match(/(?:branch|named?)\s+["']?([a-zA-Z0-9/_-]+)["']?/i)
      const name = nameMatch ? nameMatch[1] : 'feature/new-branch'
      return `git checkout -b ${name}`
    },
  },
  { keywords: ['git log', 'commit history', 'show log', 'recent commits'], generate: () => 'git log --oneline -20' },
  { keywords: ['git diff', 'show diff', 'what changed', 'show changes'], generate: () => 'git diff' },
  { keywords: ['git stash', 'stash changes'], generate: () => 'git stash' },
  { keywords: ['list process', 'show process', 'running process', 'task list', 'ps aux'],
    generate: () => isWindows ? 'tasklist' : 'ps aux',
  },
  { keywords: ['kill process', 'stop process', 'end task'],
    generate: (input) => {
      const nameMatch = input.match(/(?:kill|stop|end)\s+(?:process|task)?\s*["']?([a-zA-Z0-9._-]+)["']?/i)
      const name = nameMatch ? nameMatch[1] : '<process-name>'
      return isWindows ? `taskkill /IM "${name}" /F` : `pkill -f "${name}"`
    },
  },
  { keywords: ['disk space', 'free space', 'storage', 'disk usage'],
    generate: () => isWindows ? 'Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{N="Used(GB)";E={[math]::Round($_.Used/1GB,2)}}, @{N="Free(GB)";E={[math]::Round($_.Free/1GB,2)}}' : 'df -h',
  },
  { keywords: ['memory', 'ram usage', 'free memory'],
    generate: () => isWindows ? 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 10 Name, @{N="Mem(MB)";E={[math]::Round($_.WorkingSet64/1MB,1)}}' : 'free -h',
  },
  { keywords: ['list files', 'show files', 'dir', 'ls', 'directory contents'],
    generate: (input) => {
      const dirMatch = input.match(/(?:in|of|from)\s+["']?([^\s"']+)["']?/i)
      const dir = dirMatch ? dirMatch[1] : '.'
      return isWindows ? `Get-ChildItem "${dir}" -Force` : `ls -la ${dir}`
    },
  },
  { keywords: ['create dir', 'make dir', 'mkdir', 'new folder', 'create folder'],
    generate: (input) => {
      const nameMatch = input.match(/(?:directory|dir|folder|named?)\s+["']?([^\s"']+)["']?/i)
      const name = nameMatch ? nameMatch[1] : 'new-folder'
      return isWindows ? `New-Item -ItemType Directory -Name "${name}"` : `mkdir -p ${name}`
    },
  },
  { keywords: ['port', 'listening', 'open port', 'what port', 'which port'],
    generate: () => isWindows ? 'netstat -ano | findstr LISTENING' : 'ss -tlnp',
  },
  { keywords: ['curl', 'http request', 'fetch url', 'download'],
    generate: (input) => {
      const urlMatch = input.match(/https?:\/\/[^\s]+/i)
      const url = urlMatch ? urlMatch[0] : 'https://example.com'
      return `curl -s "${url}"`
    },
  },
  { keywords: ['search in file', 'grep', 'find text', 'search text', 'search for', 'find string', 'search content'],
    generate: (input) => {
      const textMatch = input.match(/(?:for|text|string|content)\s+["']([^"']+)["']/i) || input.match(/["']([^"']+)["']/i)
      const text = textMatch ? textMatch[1] : '<search-term>'
      return isWindows
        ? `Get-ChildItem -Recurse -File | Select-String -Pattern "${text}" | Select-Object -First 20 Path, LineNumber, Line`
        : `grep -rn "${text}" . --include="*.{ts,tsx,js,jsx,py,go,rs}" | head -20`
    },
  },
  { keywords: ['docker', 'container', 'docker ps'],
    generate: (input) => {
      if (input.match(/stop|kill/i)) return 'docker stop $(docker ps -q)'
      if (input.match(/log/i)) return 'docker logs --tail 50 <container>'
      if (input.match(/build/i)) return 'docker build -t myapp .'
      if (input.match(/run/i)) return 'docker run -d -p 3000:3000 myapp'
      return 'docker ps -a'
    },
  },
  { keywords: ['run script', 'npm run', 'start dev', 'dev server', 'start server'],
    generate: (input) => {
      if (input.match(/build/i)) return 'npm run build'
      if (input.match(/test/i)) return 'npm test'
      if (input.match(/lint/i)) return 'npm run lint'
      return 'npm run dev'
    },
  },
  { keywords: ['delete', 'remove file', 'rm', 'remove dir', 'clean'],
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
  { keywords: ['env', 'environment variable', 'show env', 'path variable'],
    generate: (input) => {
      if (input.match(/path/i)) return isWindows ? '$env:PATH -split ";"' : 'echo $PATH | tr ":" "\\n"'
      return isWindows ? 'Get-ChildItem Env: | Format-Table Name, Value -AutoSize' : 'env | sort'
    },
  },
  { keywords: ['count lines', 'line count', 'wc', 'how many lines'],
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

  for (const pattern of commandPatterns) {
    for (const keyword of pattern.keywords) {
      if (lower.includes(keyword)) {
        return pattern.generate(description)
      }
    }
  }

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

  if (lower.match(/^(git|npm|yarn|pnpm|pip|docker|kubectl|curl|wget|cat|ls|dir|cd|mkdir|rm|cp|mv|chmod|chown|grep|find|sed|awk|tar|zip|ssh|scp)\s/)) {
    return description.trim()
  }

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
  if (command.startsWith('#')) return
  const filtered = history.filter(h => h.command !== command)
  filtered.unshift({ description, command, timestamp: Date.now() })
  if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered))
  } catch {}
}

/* ── Syntax highlighting for generated commands ───────── */
function highlightCommand(cmd: string): React.JSX.Element[] {
  const lines = cmd.split('\n')
  return lines.map((line, lineIdx) => {
    if (line.startsWith('#')) {
      return (
        <div key={lineIdx} style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {line}
        </div>
      )
    }
    const tokens = line.split(/(\s+|&&|\||;|"|'|`|\$\([^)]*\)|\$\{[^}]*\}|\$[A-Za-z_]\w*)/)
    return (
      <div key={lineIdx}>
        {tokens.map((token, i) => {
          if (/^(&&|\|{1,2}|;|>|>>|<)$/.test(token)) {
            return <span key={i} style={{ color: '#f9e2af' }}>{token}</span>
          }
          if (/^--?[a-zA-Z]/.test(token)) {
            return <span key={i} style={{ color: '#94e2d5' }}>{token}</span>
          }
          if (/^["'`]/.test(token)) {
            return <span key={i} style={{ color: '#a6e3a1' }}>{token}</span>
          }
          if (/^\$/.test(token)) {
            return <span key={i} style={{ color: '#cba6f7' }}>{token}</span>
          }
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

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.select()
    }
  }, [isEditing])

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
      {/* Input area */}
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

      {/* History dropdown */}
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

      {/* Generated command preview */}
      {generatedCommand && (
        <div style={{ padding: '0' }}>
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

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 10px',
              borderTop: '1px solid var(--border)',
            }}
          >
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

            <button className="cmd-suggest-btn" onClick={handleCopy} title="Copy to clipboard">
              <Copy size={11} />
              {copied ? 'Copied!' : 'Copy'}
            </button>

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

            <button className="cmd-suggest-btn" onClick={handleRegenerate} title="Regenerate command">
              <RefreshCw size={11} />
              Regenerate
            </button>

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

/* ── Terminal Find Bar component ──────────────────────── */

interface FindBarProps {
  visible: boolean
  onClose: () => void
  searchAddonRef: React.RefObject<SearchAddon | null>
}

function TerminalFindBar({ visible, onClose, searchAddonRef }: FindBarProps) {
  const [query, setQuery] = useState('')
  const [matchCount, setMatchCount] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setMatchCount('')
    }
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visible, onClose])

  const doSearch = useCallback((term: string, direction: 'next' | 'prev' = 'next') => {
    if (!searchAddonRef.current || !term) {
      setMatchCount('')
      return
    }
    const found = direction === 'next'
      ? searchAddonRef.current.findNext(term, { regex: false, wholeWord: false, caseSensitive: false, incremental: true })
      : searchAddonRef.current.findPrevious(term, { regex: false, wholeWord: false, caseSensitive: false, incremental: true })
    setMatchCount(found ? 'Found' : 'No results')
  }, [searchAddonRef])

  const handleQueryChange = useCallback((val: string) => {
    setQuery(val)
    doSearch(val, 'next')
  }, [doSearch])

  const findNext = useCallback(() => doSearch(query, 'next'), [doSearch, query])
  const findPrev = useCallback(() => doSearch(query, 'prev'), [doSearch, query])

  if (!visible) return null

  return (
    <div
      className="tp-find-bar"
      style={{
        position: 'absolute',
        top: 4,
        right: 12,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 6px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      <Search size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <input
        ref={inputRef}
        className="tp-find-input"
        value={query}
        onChange={e => handleQueryChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) findPrev()
            else findNext()
          }
        }}
        placeholder="Find in terminal..."
        style={{ width: 180 }}
      />
      {matchCount && (
        <span style={{
          fontSize: 10,
          color: matchCount === 'No results' ? 'var(--text-muted)' : 'var(--accent-blue)',
          whiteSpace: 'nowrap',
          padding: '0 4px',
        }}>
          {matchCount}
        </span>
      )}
      <button className="tp-find-btn" onClick={findPrev} title="Previous match (Shift+Enter)">
        <ArrowUp size={12} />
      </button>
      <button className="tp-find-btn" onClick={findNext} title="Next match (Enter)">
        <ArrowDown size={12} />
      </button>
      <button className="tp-find-btn" onClick={onClose} title="Close (Esc)">
        <X size={12} />
      </button>
    </div>
  )
}

/* ── Single xterm instance (inner component) ──────────── */

interface SingleTerminalProps {
  sessionId: string
  shellPath?: string
  shellArgs?: string[]
  onTitleChange?: (sessionId: string, title: string) => void
  isActive?: boolean
}

function SingleTerminal({ sessionId, shellPath, shellArgs, onTitleChange, isActive }: SingleTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const initRef = useRef(false)
  const [_error, setError] = useState<string | null>(null)
  const [showCmdSuggest, setShowCmdSuggest] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const { addSession } = useTerminalStore()

  /* ── Run a command in the terminal ────────────────────── */
  const runCommand = useCallback((cmd: string) => {
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

    const search = new SearchAddon()
    term.loadAddon(search)
    searchRef.current = search

    /* ── URL link detection ── */
    term.loadAddon(new WebLinksAddon((_event, uri) => {
      window.open(uri, '_blank')
    }))

    /* ── File path link detection ── */
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
          const startX = match.index + 1
          const endX = startX + fullMatch.length - 1
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

    /* ── Title tracking ── */
    term.onTitleChange((title) => {
      onTitleChange?.(sessionId, title)
    })

    /* ── Keyboard shortcuts ── */
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      // Ctrl+K: Open AI command suggestion overlay
      if (event.ctrlKey && !event.shiftKey && event.key === 'k' && event.type === 'keydown') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('terminal:toggle-cmd-suggest', {
          detail: { sessionId },
        }))
        return false
      }

      // Ctrl+F: Open terminal find bar
      if (event.ctrlKey && !event.shiftKey && event.key === 'f' && event.type === 'keydown') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent('terminal:toggle-find', {
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
        return false
      }

      // Ctrl+Shift+V: Paste to terminal
      if (event.ctrlKey && event.shiftKey && event.key === 'V' && event.type === 'keydown') {
        navigator.clipboard.readText().then((text) => {
          term.paste(text)
        })
        return false
      }

      // Ctrl+Shift+`: New terminal
      if (event.ctrlKey && event.shiftKey && event.key === '`') {
        return false
      }

      // Ctrl+L: Clear terminal
      if (event.ctrlKey && !event.shiftKey && event.key === 'l' && event.type === 'keydown') {
        term.clear()
        return true
      }

      return true
    })

    /* ── Create backend PTY ── */
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

    /* ── Listen for clear terminal events ── */
    const handleClear = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.sessionId === sessionId) {
        term.clear()
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

  /* ── Refit on visibility change ── */
  useEffect(() => {
    if (isActive && fitRef.current) {
      try { fitRef.current.fit() } catch {}
    }
  }, [isActive])

  /* ── Listen for Ctrl+K toggle event ── */
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

  /* ── Listen for Ctrl+F toggle event ── */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.sessionId === sessionId) {
        setShowFind(prev => !prev)
      }
    }
    window.addEventListener('terminal:toggle-find', handler)
    return () => window.removeEventListener('terminal:toggle-find', handler)
  }, [sessionId])

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} className="tp-xterm-container" style={{ height: '100%', width: '100%' }} />
      <TerminalFindBar
        visible={showFind}
        onClose={() => setShowFind(false)}
        searchAddonRef={searchRef}
      />
      <CommandSuggestOverlay
        visible={showCmdSuggest}
        onClose={() => setShowCmdSuggest(false)}
        onRun={runCommand}
      />
    </div>
  )
}

/* ── Terminal Tab interface ────────────────────────────── */

interface TerminalTab {
  id: string
  name: string
  shellPath?: string
  shellArgs?: string[]
  shellIcon: string
  /** If set, this tab is a split child of the parent tab */
  splitParentId?: string
}

let tabCounter = 0
function nextTabId(): string {
  tabCounter += 1
  return `term-tab-${Date.now()}-${tabCounter}`
}

/* ── Split Divider (drag-resizable) ───────────────────── */

interface SplitDividerProps {
  onResize: (deltaX: number) => void
}

function SplitDivider({ onResize }: SplitDividerProps) {
  const [dragging, setDragging] = useState(false)
  const startXRef = useRef(0)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    startXRef.current = e.clientX

    const handleMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current
      startXRef.current = ev.clientX
      onResize(delta)
    }

    const handleUp = () => {
      setDragging(false)
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }, [onResize])

  return (
    <div
      className={`tp-split-divider ${dragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
    />
  )
}

/* ── Main TerminalPanel component (exported) ──────────── */

interface Props {
  sessionId: string
  shellPath?: string
  shellArgs?: string[]
  onTitleChange?: (sessionId: string, title: string) => void
}

export default function TerminalPanel({ sessionId, shellPath, shellArgs, onTitleChange }: Props) {
  const [tabs, setTabs] = useState<TerminalTab[]>(() => [{
    id: sessionId,
    name: 'Terminal 1',
    shellPath,
    shellArgs,
    shellIcon: getShellIcon(shellPath),
  }])
  const [activeTabId, setActiveTabId] = useState(sessionId)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [showShellDropdown, setShowShellDropdown] = useState(false)
  const [isMaximized, setIsMaximized] = useState(false)
  const [splitSizes, setSplitSizes] = useState<Record<string, number>>({})
  const renameInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { maximizedSessionId, setMaximizedSession } = useTerminalStore()

  /* ── Derived: build split groups ────────────────────── */
  const { groups, activeGroup, activeGroupParentId } = useMemo(() => {
    const grps: TerminalTab[][] = []
    const used = new Set<string>()
    for (const t of tabs) {
      if (used.has(t.id) || t.splitParentId) continue
      const group = [t]
      used.add(t.id)
      for (const s of tabs) {
        if (s.splitParentId === t.id && !used.has(s.id)) {
          group.push(s)
          used.add(s.id)
        }
      }
      grps.push(group)
    }
    const ag = grps.find(g => g.some(t => t.id === activeTabId))
    const agpId = ag?.[0]?.splitParentId || ag?.[0]?.id
    return { groups: grps, activeGroup: ag, activeGroupParentId: agpId }
  }, [tabs, activeTabId])

  /* ── Create new terminal tab ────────────────────────── */
  const addTab = useCallback((profile?: ShellProfile) => {
    const num = tabs.length + 1
    const name = profile ? `${profile.name} ${num}` : `Terminal ${num}`
    const tab: TerminalTab = {
      id: nextTabId(),
      name,
      shellPath: profile?.shellPath,
      shellArgs: profile?.args,
      shellIcon: profile ? profile.icon : getShellIcon(undefined),
    }
    setTabs(prev => [...prev, tab])
    setActiveTabId(tab.id)
    setShowShellDropdown(false)
  }, [tabs.length])

  /* ── Close tab ──────────────────────────────────────── */
  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const closing = prev.find(t => t.id === id)
      let next: TerminalTab[]
      if (closing?.splitParentId) {
        // Closing a split child - just remove it
        next = prev.filter(t => t.id !== id)
      } else {
        // Closing a parent - also remove its splits
        next = prev.filter(t => t.id !== id && t.splitParentId !== id)
      }
      if (next.length === 0) {
        // Always keep at least one terminal
        const fallback: TerminalTab = {
          id: nextTabId(),
          name: 'Terminal 1',
          shellIcon: getShellIcon(undefined),
        }
        setActiveTabId(fallback.id)
        return [fallback]
      }
      if (activeTabId === id) {
        setActiveTabId(next[0].id)
      }
      return next
    })
    // Kill the PTY
    window.api?.termKill?.(id)
  }, [activeTabId])

  /* ── Split terminal ─────────────────────────────────── */
  const splitTerminal = useCallback(() => {
    const current = tabs.find(t => t.id === activeTabId)
    if (!current) return
    const parentId = current.splitParentId || current.id
    const num = tabs.length + 1
    const tab: TerminalTab = {
      id: nextTabId(),
      name: `Terminal ${num}`,
      shellIcon: getShellIcon(current.shellPath),
      shellPath: current.shellPath,
      shellArgs: current.shellArgs,
      splitParentId: parentId,
    }
    setTabs(prev => {
      const parentIdx = prev.findIndex(x => x.id === parentId)
      let lastIdx = parentIdx
      for (let i = parentIdx + 1; i < prev.length; i++) {
        if (prev[i].splitParentId === parentId) lastIdx = i
        else break
      }
      const copy = [...prev]
      copy.splice(lastIdx + 1, 0, tab)
      return copy
    })
    setActiveTabId(tab.id)
  }, [tabs, activeTabId])

  /* ── Clear active terminal ──────────────────────────── */
  const clearTerminal = useCallback(() => {
    window.dispatchEvent(new CustomEvent('terminal:clear', { detail: { sessionId: activeTabId } }))
  }, [activeTabId])

  /* ── Kill active terminal (same as close) ───────────── */
  const killTerminal = useCallback(() => {
    closeTab(activeTabId)
  }, [activeTabId, closeTab])

  /* ── Maximize toggle ────────────────────────────────── */
  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      setMaximizedSession(null)
      setIsMaximized(false)
    } else {
      setMaximizedSession(sessionId)
      setIsMaximized(true)
    }
    window.dispatchEvent(new CustomEvent('terminal:maximize-toggle', {
      detail: { sessionId, maximized: !isMaximized },
    }))
  }, [isMaximized, sessionId, setMaximizedSession])

  /* ── Rename ─────────────────────────────────────────── */
  const startRename = useCallback((id: string, currentName: string) => {
    setRenamingId(id)
    setRenameValue(currentName)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      setTabs(prev =>
        prev.map(t => t.id === renamingId ? { ...t, name: renameValue.trim() } : t)
      )
    }
    setRenamingId(null)
    setRenameValue('')
  }, [renamingId, renameValue])

  const cancelRename = useCallback(() => {
    setRenamingId(null)
    setRenameValue('')
  }, [])

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  /* ── Close dropdown on outside click ────────────────── */
  useEffect(() => {
    if (!showShellDropdown) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowShellDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showShellDropdown])

  /* ── Handle title changes from child terminals ──────── */
  const handleChildTitleChange = useCallback((sid: string, title: string) => {
    setTabs(prev =>
      prev.map(t => t.id === sid ? { ...t, name: title || t.name } : t)
    )
    // Propagate to parent if it's the original session
    if (sid === sessionId) {
      onTitleChange?.(sessionId, title)
    }
  }, [sessionId, onTitleChange])

  /* ── Handle split divider drag resize ───────────────── */
  const handleSplitResize = useCallback((groupId: string, index: number, deltaX: number) => {
    setSplitSizes(prev => {
      const key = `${groupId}-${index}`
      const current = prev[key] || 0
      return { ...prev, [key]: current + deltaX }
    })
  }, [])

  /* ── Only render parent (non-split) tabs in tab bar ─── */
  const parentTabs = useMemo(() =>
    tabs.filter(t => !t.splitParentId),
  [tabs])

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
      }}
    >
      {/* ── Terminal Tab Bar + Toolbar ─────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 32,
          flexShrink: 0,
          background: 'var(--bg-tertiary)',
          borderBottom: '1px solid var(--border-color)',
          padding: '0 2px',
          gap: 0,
        }}
      >
        {/* ── Tab list (scrollable) ───────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flex: 1,
            minWidth: 0,
            overflowX: 'auto',
            overflowY: 'hidden',
            scrollbarWidth: 'none',
            paddingLeft: 2,
          }}
        >
          {parentTabs.map(tab => {
            const isActive = activeTabId === tab.id ||
              tabs.some(s => s.splitParentId === tab.id && s.id === activeTabId)
            const splitChildren = tabs.filter(s => s.splitParentId === tab.id)
            const hasSplits = splitChildren.length > 0

            return (
              <div
                key={tab.id}
                className="tp-tab"
                data-active={isActive}
                onClick={() => setActiveTabId(tab.id)}
                onDoubleClick={() => startRename(tab.id, tab.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  height: 26,
                  padding: '0 4px 0 8px',
                  fontSize: 11,
                  borderRadius: 4,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: isActive ? 'var(--bg-secondary)' : 'transparent',
                  cursor: 'pointer',
                  maxWidth: 180,
                  animation: 'tp-tab-slide-in 0.15s ease',
                  position: 'relative',
                  whiteSpace: 'nowrap',
                  userSelect: 'none',
                }}
                title={tab.name + (tab.shellPath ? `\nShell: ${tab.shellPath}` : '') + (hasSplits ? `\n+${splitChildren.length} split` : '')}
              >
                {/* Shell type indicator */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background: isActive ? 'rgba(88,166,255,0.12)' : 'rgba(255,255,255,0.04)',
                    fontSize: 8,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono, monospace)',
                    color: isActive ? 'var(--accent-blue)' : 'var(--text-muted)',
                    flexShrink: 0,
                    transition: 'background 0.12s, color 0.12s',
                  }}
                >
                  {tab.shellIcon}
                </span>

                {/* Tab name (editable on double-click) */}
                {renamingId === tab.id ? (
                  <input
                    ref={renameInputRef}
                    className="tp-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') cancelRename()
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: 110,
                  }}>
                    {tab.name}
                  </span>
                )}

                {/* Split indicator */}
                {hasSplits && (
                  <Columns2 size={9} style={{ flexShrink: 0, opacity: 0.4 }} />
                )}

                {/* Close button */}
                <span
                  className="tp-tab-close"
                  onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    flexShrink: 0,
                    cursor: 'pointer',
                    marginLeft: 2,
                  }}
                >
                  <X size={10} />
                </span>
              </div>
            )
          })}
        </div>

        {/* ── Toolbar buttons ─────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexShrink: 0,
            paddingRight: 4,
            paddingLeft: 4,
          }}
        >
          {/* New terminal with default shell */}
          <button
            className="tp-toolbar-btn"
            onClick={() => addTab()}
            title="New Terminal"
            style={{ width: 24, height: 24 }}
          >
            <Plus size={13} />
          </button>

          {/* Shell type dropdown */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button
              className="tp-toolbar-btn"
              data-active={showShellDropdown}
              onClick={() => setShowShellDropdown(prev => !prev)}
              title="Select Shell Type"
              style={{ width: 24, height: 24 }}
            >
              <ChevronDown size={13} />
            </button>

            {showShellDropdown && (
              <div className="tp-shell-dropdown">
                <div
                  style={{
                    padding: '4px 10px',
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Select Shell
                </div>
                {shellProfiles.map(profile => (
                  <button
                    key={profile.id}
                    className="tp-shell-item"
                    onClick={() => addTab(profile)}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 4,
                        background: 'rgba(255,255,255,0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'var(--accent-blue)',
                        flexShrink: 0,
                      }}
                    >
                      {profile.icon}
                    </span>
                    <span style={{ flex: 1 }}>{profile.name}</span>
                    <span
                      style={{
                        fontSize: 9,
                        color: 'var(--text-muted)',
                        opacity: 0.5,
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      {profile.shellPath.split(/[/\\]/).pop()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Separator */}
          <div style={{ width: 1, height: 14, background: 'var(--border-color)', margin: '0 2px', opacity: 0.4 }} />

          {/* Split terminal */}
          <button
            className="tp-toolbar-btn"
            onClick={splitTerminal}
            title="Split Terminal"
            style={{ width: 24, height: 24 }}
          >
            <Columns2 size={13} />
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 14, background: 'var(--border-color)', margin: '0 2px', opacity: 0.4 }} />

          {/* Clear terminal */}
          <button
            className="tp-toolbar-btn"
            onClick={clearTerminal}
            title="Clear Terminal (Ctrl+L)"
            style={{ width: 24, height: 24 }}
          >
            <Ban size={13} />
          </button>

          {/* Terminal find */}
          <button
            className="tp-toolbar-btn"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('terminal:toggle-find', {
                detail: { sessionId: activeTabId },
              }))
            }}
            title="Find in Terminal (Ctrl+F)"
            style={{ width: 24, height: 24 }}
          >
            <Search size={13} />
          </button>

          {/* Maximize terminal */}
          <button
            className="tp-toolbar-btn"
            data-active={isMaximized}
            onClick={toggleMaximize}
            title={isMaximized ? 'Restore Terminal' : 'Maximize Terminal'}
            style={{ width: 24, height: 24 }}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {/* Separator */}
          <div style={{ width: 1, height: 14, background: 'var(--border-color)', margin: '0 2px', opacity: 0.4 }} />

          {/* Kill terminal */}
          <button
            className="tp-toolbar-btn tp-kill-btn"
            onClick={killTerminal}
            title="Kill Terminal"
            style={{ width: 24, height: 24 }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* ── Terminal Content Area ──────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {groups.map(group => {
          const parentId = group[0].splitParentId || group[0].id
          const isGroupVisible = parentId === activeGroupParentId

          if (!isGroupVisible) {
            // Render hidden to preserve terminal state
            return (
              <div key={parentId} style={{ display: 'none' }}>
                {group.map(t => (
                  <SingleTerminal
                    key={t.id}
                    sessionId={t.id}
                    shellPath={t.shellPath}
                    shellArgs={t.shellArgs}
                    onTitleChange={handleChildTitleChange}
                    isActive={false}
                  />
                ))}
              </div>
            )
          }

          // Visible group: render side by side with dividers
          return (
            <div
              key={parentId}
              style={{
                display: 'flex',
                height: '100%',
              }}
            >
              {group.map((t, idx) => {
                const isTabActive = activeTabId === t.id
                const sizeKey = `${parentId}-${idx}`
                const extraWidth = splitSizes[sizeKey] || 0

                return (
                  <div key={t.id} style={{ display: 'contents' }}>
                    {/* Split divider between panes */}
                    {idx > 0 && (
                      <SplitDivider
                        onResize={(delta) => {
                          handleSplitResize(parentId, idx - 1, delta)
                          handleSplitResize(parentId, idx, -delta)
                        }}
                      />
                    )}
                    <div
                      style={{
                        flex: `1 1 0`,
                        width: extraWidth ? `calc(${100 / group.length}% + ${extraWidth}px)` : undefined,
                        minWidth: 80,
                        height: '100%',
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        animation: group.length > 1 ? 'tp-split-grow 0.2s ease' : undefined,
                      }}
                      onClick={() => setActiveTabId(t.id)}
                    >
                      {/* Split pane header (only when there are splits) */}
                      {group.length > 1 && (
                        <div
                          className="tp-split-header"
                          style={{
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0 8px',
                            flexShrink: 0,
                            background: isTabActive
                              ? 'rgba(88,166,255,0.06)'
                              : 'rgba(255,255,255,0.01)',
                            borderBottom: `1px solid ${isTabActive ? 'rgba(88,166,255,0.2)' : 'var(--border-color)'}`,
                            fontSize: 10,
                            color: isTabActive ? 'var(--text-primary)' : 'var(--text-muted)',
                          }}
                          onClick={() => setActiveTabId(t.id)}
                        >
                          {/* Shell icon */}
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 14,
                              height: 14,
                              borderRadius: 2,
                              background: isTabActive ? 'rgba(88,166,255,0.1)' : 'rgba(255,255,255,0.04)',
                              fontSize: 7,
                              fontWeight: 700,
                              fontFamily: 'var(--font-mono, monospace)',
                              color: isTabActive ? 'var(--accent-blue)' : 'var(--text-muted)',
                              flexShrink: 0,
                            }}
                          >
                            {t.shellIcon}
                          </span>

                          <TerminalIcon size={10} style={{ opacity: 0.6, flexShrink: 0 }} />

                          {renamingId === t.id ? (
                            <input
                              ref={renameInputRef}
                              className="tp-rename-input"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={commitRename}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitRename()
                                if (e.key === 'Escape') cancelRename()
                              }}
                              onClick={e => e.stopPropagation()}
                              style={{ width: 70, height: 16, fontSize: 10 }}
                            />
                          ) : (
                            <span
                              onDoubleClick={() => startRename(t.id, t.name)}
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {t.name}
                            </span>
                          )}
                          <span style={{ flex: 1 }} />
                          <span
                            onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                            className="tp-toolbar-btn"
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: 3,
                              cursor: 'pointer',
                            }}
                            title="Close split"
                          >
                            <X size={10} />
                          </span>
                        </div>
                      )}

                      {/* Terminal instance */}
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <SingleTerminal
                          sessionId={t.id}
                          shellPath={t.shellPath}
                          shellArgs={t.shellArgs}
                          onTitleChange={handleChildTitleChange}
                          isActive={isTabActive}
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
