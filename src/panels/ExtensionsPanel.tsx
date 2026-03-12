import { useState, useMemo } from 'react'
import { Search, Download, Star, Puzzle, ArrowLeft, Settings, ExternalLink, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'

interface Extension {
  id: string
  name: string
  publisher: string
  description: string
  iconColor: string
  iconLetter: string
  installed: boolean
  enabled: boolean
  stars: number
  downloads: string
  category: string
  version: string
  fullDescription: string
  features: string[]
  changelog: string
  license: string
  repository: string
}

const EXTENSIONS: Extension[] = [
  // Built-in (installed)
  {
    id: 'orion-ai', name: 'Orion AI Assistant', publisher: 'Orion', description: 'Inline AI editing, chat, code generation, and refactoring powered by multiple LLM providers',
    iconColor: '#bc8cff', iconLetter: 'O', installed: true, enabled: true, stars: 4.9, downloads: '2.1M', category: 'AI', version: '3.8.1',
    fullDescription: 'Orion AI Assistant provides intelligent code generation, refactoring suggestions, and inline editing powered by state-of-the-art large language models. Supports multiple providers including OpenAI, Anthropic, and local models.',
    features: ['Inline code completion', 'Chat-based code generation', 'Refactoring suggestions', 'Multi-model support', 'Context-aware completions'],
    changelog: 'v3.8.1 - Bug fixes for streaming responses\nv3.8.0 - Added Claude 3.5 support\nv3.7.0 - Improved context window handling',
    license: 'MIT', repository: 'https://github.com/orion/ai-assistant',
  },
  {
    id: 'orion-git', name: 'Git Integration', publisher: 'Orion', description: 'Full Git support with staging, commits, branch management, push/pull, and inline diff decorations',
    iconColor: '#f85149', iconLetter: 'G', installed: true, enabled: true, stars: 4.8, downloads: '3.5M', category: 'Git', version: '2.4.0',
    fullDescription: 'Complete Git integration with visual diff, staging area, branch management, merge conflict resolution, and blame annotations.',
    features: ['Visual diff viewer', 'Interactive staging', 'Branch management', 'Merge conflict resolution', 'Git blame annotations'],
    changelog: 'v2.4.0 - Added interactive rebase UI\nv2.3.0 - Improved merge conflict resolution',
    license: 'MIT', repository: 'https://github.com/orion/git-integration',
  },
  {
    id: 'orion-terminal', name: 'Integrated Terminal', publisher: 'Orion', description: 'Embedded terminal with split panes, multiple sessions, and customizable themes',
    iconColor: '#3fb950', iconLetter: 'T', installed: true, enabled: true, stars: 4.7, downloads: '3.2M', category: 'All', version: '1.9.3',
    fullDescription: 'A full-featured terminal emulator embedded in the editor with support for multiple shell types, split panes, and theme customization.',
    features: ['Multiple shell support', 'Split panes', 'Customizable themes', 'Shell integration', 'Link detection'],
    changelog: 'v1.9.3 - Fixed shell integration on Windows\nv1.9.0 - Added PowerShell 7 support',
    license: 'MIT', repository: 'https://github.com/orion/terminal',
  },
  {
    id: 'orion-themes', name: 'Theme Engine', publisher: 'Orion', description: '7 built-in themes including Dracula, Nord, Monokai Pro, One Dark Pro, and more',
    iconColor: '#d29922', iconLetter: 'T', installed: true, enabled: true, stars: 4.6, downloads: '1.8M', category: 'Themes', version: '4.1.0',
    fullDescription: 'A comprehensive theme engine with 7 built-in themes and support for custom themes. Includes editor, terminal, and UI theming.',
    features: ['7 built-in themes', 'Custom theme support', 'Editor theming', 'Terminal theming', 'Icon theme support'],
    changelog: 'v4.1.0 - Added Catppuccin theme\nv4.0.0 - Complete theme engine rewrite',
    license: 'MIT', repository: 'https://github.com/orion/themes',
  },
  {
    id: 'orion-typescript', name: 'TypeScript & JavaScript', publisher: 'Orion', description: 'Rich language support for TypeScript and JavaScript with IntelliSense',
    iconColor: '#3178c6', iconLetter: 'TS', installed: true, enabled: true, stars: 4.9, downloads: '5.1M', category: 'Languages', version: '5.2.0',
    fullDescription: 'Full TypeScript and JavaScript language support including IntelliSense, code navigation, refactoring, and debugging.',
    features: ['IntelliSense', 'Go to definition', 'Find all references', 'Rename symbol', 'Auto imports'],
    changelog: 'v5.2.0 - TypeScript 5.4 support\nv5.1.0 - Improved performance for large projects',
    license: 'MIT', repository: 'https://github.com/orion/typescript',
  },

  // Available extensions
  {
    id: 'prettier', name: 'Prettier - Code Formatter', publisher: 'Prettier', description: 'Code formatter supporting JavaScript, TypeScript, CSS, HTML, JSON, and more',
    iconColor: '#f7b93e', iconLetter: 'P', installed: false, enabled: false, stars: 4.5, downloads: '41.2M', category: 'Formatters', version: '10.4.0',
    fullDescription: 'Prettier is an opinionated code formatter that supports many languages and integrates with most editors. It removes all original styling and ensures that all outputted code conforms to a consistent style.',
    features: ['Auto-format on save', 'Multi-language support', 'Configurable rules', 'EditorConfig support', 'Ignore patterns'],
    changelog: 'v10.4.0 - Added CSS nesting support\nv10.3.0 - Improved TypeScript formatting',
    license: 'MIT', repository: 'https://github.com/prettier/prettier-vscode',
  },
  {
    id: 'eslint', name: 'ESLint', publisher: 'Microsoft', description: 'Integrates ESLint into the editor for JavaScript and TypeScript linting',
    iconColor: '#4b32c3', iconLetter: 'ES', installed: false, enabled: false, stars: 4.6, downloads: '32.8M', category: 'Linters', version: '3.0.5',
    fullDescription: 'Integrates ESLint JavaScript linting into the editor. Provides real-time feedback, auto-fix on save, and inline diagnostics for code quality issues.',
    features: ['Real-time linting', 'Auto-fix on save', 'Custom rule support', 'Flat config support', 'Inline diagnostics'],
    changelog: 'v3.0.5 - ESLint 9 flat config support\nv3.0.0 - Major rewrite with improved performance',
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-eslint',
  },
  {
    id: 'gitlens', name: 'GitLens', publisher: 'GitKraken', description: 'Supercharge Git — Visualize code authorship, navigate history, and gain insights',
    iconColor: '#2ea043', iconLetter: 'GL', installed: false, enabled: false, stars: 4.7, downloads: '28.5M', category: 'Git', version: '15.1.0',
    fullDescription: 'GitLens supercharges your Git experience. It helps you visualize code authorship at a glance via Git blame annotations and CodeLens, seamlessly navigate and explore Git repositories, and gain valuable insights via rich visualizations.',
    features: ['Git blame annotations', 'Repository explorer', 'Commit graph', 'Interactive rebase', 'Worktrees support'],
    changelog: 'v15.1.0 - New commit graph visualization\nv15.0.0 - Performance improvements',
    license: 'MIT', repository: 'https://github.com/gitkraken/vscode-gitlens',
  },
  {
    id: 'python', name: 'Python', publisher: 'Microsoft', description: 'Rich Python language support with IntelliSense, linting, debugging, and Jupyter',
    iconColor: '#3776ab', iconLetter: 'Py', installed: false, enabled: false, stars: 4.7, downloads: '89.3M', category: 'Languages', version: '2024.4.0',
    fullDescription: 'A rich Python editing experience with IntelliSense (Pylance), linting, debugging (Python Debugger), code navigation, formatting, refactoring, and Jupyter notebook support.',
    features: ['IntelliSense via Pylance', 'Debugging support', 'Jupyter notebooks', 'Virtual environment support', 'Testing integration'],
    changelog: 'v2024.4.0 - Improved Pylance performance\nv2024.3.0 - Added Python 3.13 support',
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-python',
  },
  {
    id: 'go', name: 'Go', publisher: 'Go Team at Google', description: 'Rich Go language support including IntelliSense, debugging, and code navigation',
    iconColor: '#00add8', iconLetter: 'Go', installed: false, enabled: false, stars: 4.7, downloads: '12.1M', category: 'Languages', version: '0.42.0',
    fullDescription: 'This extension adds rich language support for the Go programming language, including IntelliSense, code navigation, debugging, testing, and more using gopls and Delve.',
    features: ['IntelliSense via gopls', 'Debugging with Delve', 'Test explorer', 'Code generation', 'Linting integration'],
    changelog: 'v0.42.0 - Go 1.22 support\nv0.41.0 - Improved workspace module support',
    license: 'MIT', repository: 'https://github.com/golang/vscode-go',
  },
  {
    id: 'rust-analyzer', name: 'rust-analyzer', publisher: 'rust-lang', description: 'Fast and feature-rich Rust language server with completions and diagnostics',
    iconColor: '#dea584', iconLetter: 'R', installed: false, enabled: false, stars: 4.8, downloads: '8.4M', category: 'Languages', version: '0.4.1890',
    fullDescription: 'rust-analyzer is a fast, feature-rich implementation of the Language Server Protocol for Rust. It provides smart completions, inline type hints, and powerful code navigation.',
    features: ['Smart completions', 'Inline type hints', 'Macro expansion', 'Cargo integration', 'Proc-macro support'],
    changelog: 'v0.4.1890 - Improved trait completion\nv0.4.1880 - Better macro support',
    license: 'MIT', repository: 'https://github.com/rust-lang/rust-analyzer',
  },
  {
    id: 'docker', name: 'Docker', publisher: 'Microsoft', description: 'Build, manage, and deploy containerized applications from the editor',
    iconColor: '#2496ed', iconLetter: 'D', installed: false, enabled: false, stars: 4.4, downloads: '21.7M', category: 'All', version: '1.29.0',
    fullDescription: 'The Docker extension makes it easy to build, manage, and deploy containerized applications. It provides syntax highlighting for Dockerfiles, compose files, and one-click debugging of Node.js, Python, and .NET in containers.',
    features: ['Dockerfile support', 'Docker Compose support', 'Container explorer', 'Image management', 'One-click debugging'],
    changelog: 'v1.29.0 - Added Docker Scout integration\nv1.28.0 - Improved Compose support',
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-docker',
  },
  {
    id: 'remote-ssh', name: 'Remote - SSH', publisher: 'Microsoft', description: 'Open any folder on a remote machine using SSH and take advantage of the full editor',
    iconColor: '#0098ff', iconLetter: 'RS', installed: false, enabled: false, stars: 4.3, downloads: '16.2M', category: 'All', version: '0.110.0',
    fullDescription: 'The Remote - SSH extension lets you open any folder on a remote machine with SSH access, enabling the same editing experience as working locally.',
    features: ['Remote file editing', 'Port forwarding', 'Terminal access', 'Extension host on remote', 'Multi-hop SSH'],
    changelog: 'v0.110.0 - Improved connection stability\nv0.109.0 - Added SSH config validation',
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-remote-release',
  },
  {
    id: 'copilot', name: 'GitHub Copilot', publisher: 'GitHub', description: 'AI pair programmer that suggests code completions in real-time as you type',
    iconColor: '#6e40c9', iconLetter: 'CP', installed: false, enabled: false, stars: 4.5, downloads: '18.9M', category: 'AI', version: '1.180.0',
    fullDescription: 'GitHub Copilot is an AI pair programmer that provides autocomplete-style suggestions as you code. It draws context from comments and code to suggest individual lines and whole functions instantly.',
    features: ['Inline suggestions', 'Multi-line completions', 'Chat interface', 'Code explanations', 'Test generation'],
    changelog: 'v1.180.0 - Improved suggestion quality\nv1.170.0 - Added workspace context',
    license: 'Proprietary', repository: 'https://github.com/features/copilot',
  },
  {
    id: 'import-cost', name: 'Import Cost', publisher: 'Wix', description: 'Display inline the size of imported packages in JavaScript and TypeScript',
    iconColor: '#cc6699', iconLetter: 'IC', installed: false, enabled: false, stars: 4.2, downloads: '5.8M', category: 'All', version: '3.3.0',
    fullDescription: 'This extension displays inline in the editor the size of the imported package. It supports JavaScript, TypeScript, and various bundler formats.',
    features: ['Inline size display', 'Bundle size calculation', 'Gzip size estimation', 'Caching for speed', 'Configurable size limits'],
    changelog: 'v3.3.0 - ESM support improvements\nv3.2.0 - Added tree-shaking estimation',
    license: 'MIT', repository: 'https://github.com/nicolo-ribaudo/import-cost',
  },
  {
    id: 'error-lens', name: 'Error Lens', publisher: 'Alexander', description: 'Improve highlighting of errors, warnings, and other diagnostics inline',
    iconColor: '#ff6b6b', iconLetter: 'EL', installed: false, enabled: false, stars: 4.8, downloads: '9.2M', category: 'Linters', version: '3.16.0',
    fullDescription: 'ErrorLens turbocharges language diagnostic features by making diagnostics stand out more prominently, highlighting the entire line and displaying the diagnostic message inline at the end of the line.',
    features: ['Inline diagnostics', 'Line highlighting', 'Gutter icons', 'Status bar info', 'Customizable colors'],
    changelog: 'v3.16.0 - Performance improvements for large files\nv3.15.0 - Added message truncation',
    license: 'MIT', repository: 'https://github.com/usernamehw/vscode-error-lens',
  },
  {
    id: 'todo-tree', name: 'Todo Tree', publisher: 'Gruntfuggly', description: 'Show TODO, FIXME, and other annotation tags in a tree view for quick navigation',
    iconColor: '#ffca28', iconLetter: 'TT', installed: false, enabled: false, stars: 4.7, downloads: '7.1M', category: 'All', version: '0.0.226',
    fullDescription: 'Todo Tree searches your workspace for comment tags like TODO and FIXME, and displays them in a tree view in the activity bar. Clicking a tag will open the file and navigate to the line.',
    features: ['Tree view of tags', 'Custom tag support', 'Regex filtering', 'Highlight customization', 'Multi-workspace support'],
    changelog: 'v0.0.226 - Added exclusion patterns\nv0.0.225 - Performance improvements',
    license: 'MIT', repository: 'https://github.com/Gruntfuggly/todo-tree',
  },
  {
    id: 'material-icon-theme', name: 'Material Icon Theme', publisher: 'Philipp Kief', description: 'Material Design icons for files and folders in the file explorer',
    iconColor: '#42a5f5', iconLetter: 'MI', installed: false, enabled: false, stars: 4.8, downloads: '19.6M', category: 'Themes', version: '5.2.0',
    fullDescription: 'The Material Icon Theme provides Material Design icons for files and folders in the file explorer. It includes over 1000 file and folder icons.',
    features: ['1000+ file icons', 'Folder color customization', 'Icon associations', 'Custom icon packs', 'Light/dark variants'],
    changelog: 'v5.2.0 - Added Bun and Deno icons\nv5.1.0 - New folder icons',
    license: 'MIT', repository: 'https://github.com/PKief/vscode-material-icon-theme',
  },
  {
    id: 'path-intellisense', name: 'Path Intellisense', publisher: 'Christian Kohler', description: 'Autocomplete filenames and paths as you type in import statements',
    iconColor: '#e0e0e0', iconLetter: 'PI', installed: false, enabled: false, stars: 4.4, downloads: '11.3M', category: 'All', version: '2.9.0',
    fullDescription: 'Path Intellisense provides intelligent path completion for filenames. It supports custom mappings, file extensions filtering, and works with all import syntaxes.',
    features: ['Path autocompletion', 'Custom path mappings', 'Extension filtering', 'Relative/absolute paths', 'Workspace-aware'],
    changelog: 'v2.9.0 - Added monorepo support\nv2.8.0 - Improved performance',
    license: 'MIT', repository: 'https://github.com/ChristianKohler/PathIntellisense',
  },
  {
    id: 'auto-rename-tag', name: 'Auto Rename Tag', publisher: 'Jun Han', description: 'Automatically rename paired HTML/XML tags when one is edited',
    iconColor: '#e06c75', iconLetter: 'AR', installed: false, enabled: false, stars: 4.3, downloads: '14.7M', category: 'All', version: '0.1.10',
    fullDescription: 'Auto Rename Tag automatically renames paired HTML/XML/JSX tags. When you edit an opening tag, the closing tag is automatically updated to match, and vice versa.',
    features: ['Auto tag renaming', 'HTML/XML/JSX support', 'Multi-cursor support', 'Configurable patterns', 'Embedded language support'],
    changelog: 'v0.1.10 - Fixed JSX support\nv0.1.9 - Performance improvements',
    license: 'MIT', repository: 'https://github.com/formulahendry/vscode-auto-rename-tag',
  },
  {
    id: 'live-server', name: 'Live Server', publisher: 'Ritwick Dey', description: 'Launch a local development server with live reload for static and dynamic pages',
    iconColor: '#41b883', iconLetter: 'LS', installed: false, enabled: false, stars: 4.4, downloads: '38.1M', category: 'All', version: '5.7.9',
    fullDescription: 'Launch a local development server with live reload feature for static and dynamic pages. Right-click on an HTML file to open it in the browser with hot reload.',
    features: ['Live reload', 'Custom browser support', 'HTTPS support', 'Proxy support', 'Custom port configuration'],
    changelog: 'v5.7.9 - Bug fixes\nv5.7.8 - Added HTTPS support',
    license: 'MIT', repository: 'https://github.com/ritwickdey/vscode-live-server',
  },
  {
    id: 'rest-client', name: 'REST Client', publisher: 'Huachao Mao', description: 'Send HTTP requests and view responses directly within the editor',
    iconColor: '#d4a373', iconLetter: 'RC', installed: false, enabled: false, stars: 4.5, downloads: '6.9M', category: 'All', version: '0.25.1',
    fullDescription: 'REST Client allows you to send HTTP requests and view responses directly in the editor. It supports cURL, variables, environments, and response previewing.',
    features: ['HTTP request sending', 'Response preview', 'Environment variables', 'cURL import/export', 'Request history'],
    changelog: 'v0.25.1 - GraphQL support improvements\nv0.25.0 - Added gRPC support',
    license: 'MIT', repository: 'https://github.com/Huachao/vscode-restclient',
  },
  {
    id: 'thunder-client', name: 'Thunder Client', publisher: 'Thunder Client', description: 'Lightweight REST API client with GUI for testing APIs inside the editor',
    iconColor: '#7b61ff', iconLetter: 'TC', installed: false, enabled: false, stars: 4.6, downloads: '8.3M', category: 'All', version: '2.22.0',
    fullDescription: 'Thunder Client is a lightweight REST API client extension hand-crafted for testing APIs. It features a clean GUI, environment variables, collections, and Git sync.',
    features: ['GUI-based API testing', 'Collections support', 'Environment variables', 'Git sync', 'Code snippet generation'],
    changelog: 'v2.22.0 - Added WebSocket support\nv2.21.0 - Improved collection management',
    license: 'Proprietary', repository: 'https://github.com/rangav/thunder-client-support',
  },
  {
    id: 'tailwind', name: 'Tailwind CSS IntelliSense', publisher: 'Tailwind Labs', description: 'Intelligent Tailwind CSS tooling with autocomplete, syntax highlighting, and linting',
    iconColor: '#38bdf8', iconLetter: 'TW', installed: false, enabled: false, stars: 4.6, downloads: '15.4M', category: 'Languages', version: '0.12.0',
    fullDescription: 'Tailwind CSS IntelliSense enhances the Tailwind development experience with features like autocomplete, syntax highlighting, and linting. It works with Tailwind v3 and v4.',
    features: ['Class autocomplete', 'Hover preview', 'CSS linting', 'JIT mode support', 'Custom config support'],
    changelog: 'v0.12.0 - Tailwind v4 support\nv0.11.0 - Performance improvements',
    license: 'MIT', repository: 'https://github.com/tailwindlabs/tailwindcss-intellisense',
  },
  {
    id: 'bracket-pair', name: 'Bracket Pair Colorizer', publisher: 'CoenraadS', description: 'Colorize matching brackets with distinct colors for easier code navigation',
    iconColor: '#ffd700', iconLetter: 'BP', installed: false, enabled: false, stars: 4.3, downloads: '10.2M', category: 'All', version: '2.0.2',
    fullDescription: 'This extension allows matching brackets to be identified with colors. The user can define which characters to match, and which colors to use. Now built into many editors but still useful for custom configurations.',
    features: ['Colored brackets', 'Custom color schemes', 'Scope highlighting', 'Custom bracket pairs', 'Multi-language support'],
    changelog: 'v2.0.2 - Fixed compatibility issues\nv2.0.0 - Major performance rewrite',
    license: 'MIT', repository: 'https://github.com/CoenraadS/Bracket-Pair-Colorizer-2',
  },
]

const CATEGORIES = ['All', 'Popular', 'Themes', 'Languages', 'Linters', 'Formatters', 'AI', 'Git'] as const
type Category = typeof CATEGORIES[number]

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.3
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {[...Array(5)].map((_, i) => (
        <span key={i} style={{ color: i < full ? '#d29922' : (i === full && half) ? '#d29922' : 'var(--text-muted)', fontSize: 10, opacity: i < full || (i === full && half) ? 1 : 0.3 }}>
          {i < full ? '\u2605' : (i === full && half) ? '\u2605' : '\u2606'}
        </span>
      ))}
      <span style={{ marginLeft: 3, fontSize: 10, color: 'var(--text-muted)' }}>{rating}</span>
    </span>
  )
}

function ExtensionIcon({ letter, color, size = 40 }: { letter: string; color: string; size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: size >= 60 ? 12 : 6,
      background: `linear-gradient(135deg, ${color}22, ${color}44)`,
      border: `1px solid ${color}33`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: size >= 60 ? 28 : (letter.length > 1 ? 11 : 15),
      fontWeight: 700,
      color: color,
      fontFamily: 'monospace',
    }}>
      {letter}
    </div>
  )
}

function ExtensionDetail({ ext, onBack, onInstall, onUninstall, onToggle }: {
  ext: Extension
  onBack: () => void
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onToggle: (id: string) => void
}) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
          className="ext-back-btn"
        >
          <ArrowLeft size={16} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Extension Details</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
        {/* Top info */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 20 }}>
          <ExtensionIcon letter={ext.iconLetter} color={ext.iconColor} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{ext.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{ext.publisher}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StarRating rating={ext.stars} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Download size={10} /> {ext.downloads}
              </span>
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 4,
                background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontFamily: 'monospace',
              }}>
                v{ext.version}
              </span>
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              {ext.installed ? (
                <>
                  <button
                    onClick={() => onToggle(ext.id)}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: ext.enabled ? 'rgba(210,153,34,0.15)' : 'rgba(63,185,80,0.15)',
                      color: ext.enabled ? '#d29922' : '#3fb950',
                    }}
                  >
                    {ext.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => onUninstall(ext.id)}
                    style={{
                      padding: '5px 14px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: 'rgba(248,81,73,0.12)', color: '#f85149',
                    }}
                  >
                    Uninstall
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onInstall(ext.id)}
                  style={{
                    padding: '5px 18px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: 'var(--accent-blue, #388bfd)', color: '#fff',
                  }}
                >
                  Install
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Description</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{ext.fullDescription}</div>
        </div>

        {/* Features */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Features</div>
          <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc' }}>
            {ext.features.map((f, i) => (
              <li key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{f}</li>
            ))}
          </ul>
        </div>

        {/* Changelog */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Changelog</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-line', background: 'var(--bg-primary)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
            {ext.changelog}
          </div>
        </div>

        {/* More Info */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>More Info</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 11 }}>
            <span style={{ color: 'var(--text-muted)' }}>Version</span>
            <span style={{ color: 'var(--text-secondary)' }}>{ext.version}</span>
            <span style={{ color: 'var(--text-muted)' }}>Publisher</span>
            <span style={{ color: 'var(--text-secondary)' }}>{ext.publisher}</span>
            <span style={{ color: 'var(--text-muted)' }}>License</span>
            <span style={{ color: 'var(--text-secondary)' }}>{ext.license}</span>
            <span style={{ color: 'var(--text-muted)' }}>Category</span>
            <span style={{ color: 'var(--text-secondary)' }}>{ext.category}</span>
            <span style={{ color: 'var(--text-muted)' }}>Repository</span>
            <span style={{ color: '#58a6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              {ext.repository.replace('https://github.com/', '')}
              <ExternalLink size={10} />
            </span>
          </div>
        </div>
      </div>

      <style>{`
        .ext-back-btn:hover { background: var(--bg-hover, rgba(255,255,255,0.06)) !important; }
      `}</style>
    </div>
  )
}

export default function ExtensionsPanel() {
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<Category>('All')
  const [extensions, setExtensions] = useState<Extension[]>(EXTENSIONS)
  const [selectedExt, setSelectedExt] = useState<string | null>(null)
  const [installedCollapsed, setInstalledCollapsed] = useState(false)

  const handleInstall = (id: string) => {
    setExtensions(prev => prev.map(e => e.id === id ? { ...e, installed: true, enabled: true } : e))
  }

  const handleUninstall = (id: string) => {
    setExtensions(prev => prev.map(e => e.id === id ? { ...e, installed: false, enabled: false } : e))
  }

  const handleToggle = (id: string) => {
    setExtensions(prev => prev.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e))
  }

  const filtered = useMemo(() => {
    return extensions.filter(ext => {
      // Category filter
      if (category === 'Popular') {
        if (parseFloat(ext.downloads) < 10 && !ext.downloads.includes('M')) return false
      } else if (category !== 'All') {
        if (ext.category !== category) return false
      }
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          ext.name.toLowerCase().includes(q) ||
          ext.description.toLowerCase().includes(q) ||
          ext.publisher.toLowerCase().includes(q) ||
          ext.category.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [extensions, category, searchQuery])

  const installedExts = filtered.filter(e => e.installed)
  const availableExts = filtered.filter(e => !e.installed)

  const installedCount = extensions.filter(e => e.installed).length

  // Detail view
  if (selectedExt) {
    const ext = extensions.find(e => e.id === selectedExt)
    if (ext) {
      return (
        <ExtensionDetail
          ext={ext}
          onBack={() => setSelectedExt(null)}
          onInstall={handleInstall}
          onUninstall={handleUninstall}
          onToggle={handleToggle}
        />
      )
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="panel-header">
        <Puzzle size={12} style={{ marginRight: 6 }} />
        EXTENSIONS
        <span style={{ marginLeft: 'auto', fontSize: 10, background: 'var(--bg-tertiary)', borderRadius: 8, padding: '0 6px', lineHeight: '16px' }}>
          {installedCount}
        </span>
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <Search size={12} style={{ marginLeft: 8, color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search extensions..."
            style={{ flex: 1, padding: '6px 10px', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ padding: '4px 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            style={{
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: category === cat ? 600 : 400,
              borderRadius: 10,
              border: 'none',
              cursor: 'pointer',
              background: category === cat ? 'rgba(88,166,255,0.15)' : 'transparent',
              color: category === cat ? '#58a6ff' : 'var(--text-muted)',
              transition: 'all 0.15s',
              lineHeight: '16px',
            }}
            className="ext-cat-btn"
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Extension list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Installed section */}
        {installedExts.length > 0 && (
          <>
            <div
              onClick={() => setInstalledCollapsed(!installedCollapsed)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
                fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer',
                textTransform: 'uppercase', letterSpacing: '0.5px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                userSelect: 'none',
              }}
              className="ext-section-header"
            >
              {installedCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              Installed
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({installedExts.length})</span>
            </div>
            {!installedCollapsed && installedExts.map(ext => (
              <ExtensionCard
                key={ext.id}
                ext={ext}
                onClick={() => setSelectedExt(ext.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onToggle={handleToggle}
                showInstalledControls
              />
            ))}
          </>
        )}

        {/* Marketplace / Available section */}
        {availableExts.length > 0 && (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px',
              fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.5px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              marginTop: installedExts.length > 0 ? 4 : 0,
            }}>
              Marketplace
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({availableExts.length})</span>
            </div>
            {availableExts.map(ext => (
              <ExtensionCard
                key={ext.id}
                ext={ext}
                onClick={() => setSelectedExt(ext.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onToggle={handleToggle}
              />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No extensions found matching "{searchQuery}"
          </div>
        )}
      </div>

      <style>{`
        .ext-item:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); }
        .ext-cat-btn:hover { background: rgba(88,166,255,0.08) !important; }
        .ext-section-header:hover { background: rgba(255,255,255,0.02); }
        .ext-action-btn:hover { opacity: 1 !important; }
      `}</style>
    </div>
  )
}

function ExtensionCard({ ext, onClick, onInstall, onUninstall, onToggle, showInstalledControls }: {
  ext: Extension
  onClick: () => void
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onToggle: (id: string) => void
  showInstalledControls?: boolean
}) {
  return (
    <div
      className="ext-item"
      style={{
        display: 'flex',
        gap: 10,
        padding: '9px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}
      onClick={onClick}
    >
      <ExtensionIcon letter={ext.iconLetter} color={ext.iconColor} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ext.name}</span>
          <span style={{
            fontSize: 9, padding: '0px 5px', borderRadius: 4, flexShrink: 0,
            background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontFamily: 'monospace',
          }}>
            v{ext.version}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{ext.publisher}</div>
        <div style={{
          fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ext.description}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          <StarRating rating={ext.stars} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Download size={9} />
            {ext.downloads}
          </span>
          <span style={{ background: 'var(--bg-tertiary)', padding: '0 5px', borderRadius: 6, fontSize: 9 }}>
            {ext.category}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 4, flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {showInstalledControls && ext.installed ? (
          <>
            <button
              onClick={() => onToggle(ext.id)}
              title={ext.enabled ? 'Disable' : 'Enable'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 3,
                color: ext.enabled ? '#3fb950' : 'var(--text-muted)', display: 'flex', alignItems: 'center',
                opacity: 0.7,
              }}
              className="ext-action-btn"
            >
              {ext.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            </button>
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                onClick={() => onUninstall(ext.id)}
                title="Uninstall"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 3,
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', opacity: 0.5,
                }}
                className="ext-action-btn"
              >
                <Trash2 size={13} />
              </button>
              <button
                title="Settings"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 3,
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', opacity: 0.5,
                }}
                className="ext-action-btn"
              >
                <Settings size={13} />
              </button>
            </div>
          </>
        ) : !ext.installed ? (
          <button
            onClick={() => onInstall(ext.id)}
            style={{
              padding: '4px 12px',
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              background: 'var(--accent-blue, #388bfd)',
              color: '#fff',
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Install
          </button>
        ) : null}
      </div>
    </div>
  )
}
