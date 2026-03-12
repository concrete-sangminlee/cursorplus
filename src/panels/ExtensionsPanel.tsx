import { useState, useMemo, useCallback } from 'react'
import { Search, Download, Star, Puzzle, ArrowLeft, Settings, ExternalLink, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Trash2, Check, Loader2, Clock, TrendingUp, Sparkles, Briefcase, Filter, X, CheckCircle2, Flag, Package, FileText, Camera, List } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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
  downloads: number
  category: ExtCategory
  version: string
  lastUpdated: string
  fullDescription: string
  features: string[]
  changelog: ChangelogEntry[]
  dependencies: string[]
  settings: ExtSetting[]
  license: string
  repository: string
  ratingBreakdown: [number, number, number, number, number] // 5-star to 1-star counts
  recommended?: boolean
  workspaceRecommended?: boolean
}

interface ChangelogEntry {
  version: string
  date: string
  changes: string[]
}

interface ExtSetting {
  key: string
  type: 'boolean' | 'string' | 'number' | 'enum'
  default: string
  description: string
}

type ExtCategory = 'All' | 'AI' | 'Languages' | 'Themes' | 'Linters' | 'Formatters' | 'Debuggers' | 'Git' | 'Productivity'
type SortOption = 'installs' | 'rating' | 'name' | 'updated'
type DetailTab = 'details' | 'changelog' | 'dependencies' | 'settings'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(n)
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const days = Math.floor(diffMs / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

// ---------------------------------------------------------------------------
// Mock Data (25 extensions)
// ---------------------------------------------------------------------------
const EXTENSIONS: Extension[] = [
  {
    id: 'orion-ai', name: 'Orion AI Assistant', publisher: 'Orion', description: 'Inline AI editing, chat, code generation, and refactoring powered by multiple LLM providers',
    iconColor: '#bc8cff', iconLetter: 'O', installed: true, enabled: true, stars: 4.9, downloads: 2100000, category: 'AI', version: '3.8.1', lastUpdated: '2026-03-01',
    fullDescription: '## Orion AI Assistant\n\nOrion AI Assistant provides **intelligent code generation**, refactoring suggestions, and inline editing powered by state-of-the-art large language models.\n\nSupports multiple providers including **OpenAI**, **Anthropic**, and **local models** via Ollama.\n\n### Key Highlights\n- Context-aware completions that understand your entire project\n- Multi-turn chat for complex code transformations\n- Inline diff preview before applying changes',
    features: ['Inline code completion', 'Chat-based code generation', 'Refactoring suggestions', 'Multi-model support (GPT-4, Claude, Llama)', 'Context-aware completions', 'Code explanation on hover', 'Unit test generation', 'Docstring generation'],
    changelog: [
      { version: '3.8.1', date: '2026-03-01', changes: ['Bug fixes for streaming responses', 'Improved token counting accuracy'] },
      { version: '3.8.0', date: '2026-02-15', changes: ['Added Claude 3.5 Opus support', 'New inline diff preview'] },
      { version: '3.7.0', date: '2026-01-20', changes: ['Improved context window handling', 'Added Ollama support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'orion.ai.provider', type: 'enum', default: 'anthropic', description: 'Default AI provider' },
      { key: 'orion.ai.temperature', type: 'number', default: '0.7', description: 'Temperature for completions' },
      { key: 'orion.ai.inlineEnabled', type: 'boolean', default: 'true', description: 'Enable inline completions' },
    ],
    license: 'MIT', repository: 'https://github.com/orion/ai-assistant',
    ratingBreakdown: [1850, 180, 40, 15, 5], recommended: true,
  },
  {
    id: 'orion-git', name: 'Git Integration', publisher: 'Orion', description: 'Full Git support with staging, commits, branch management, push/pull, and inline diff decorations',
    iconColor: '#f85149', iconLetter: 'G', installed: true, enabled: true, stars: 4.8, downloads: 3500000, category: 'Git', version: '2.4.0', lastUpdated: '2026-02-20',
    fullDescription: '## Git Integration\n\nComplete Git integration with visual diff, staging area, branch management, merge conflict resolution, and blame annotations.\n\n### Merge Conflicts\nInteractive merge conflict resolution with accept current / incoming / both shortcuts.',
    features: ['Visual diff viewer', 'Interactive staging', 'Branch management', 'Merge conflict resolution', 'Git blame annotations', 'Stash management'],
    changelog: [
      { version: '2.4.0', date: '2026-02-20', changes: ['Added interactive rebase UI', 'Improved 3-way merge'] },
      { version: '2.3.0', date: '2026-01-10', changes: ['Improved merge conflict resolution', 'Added stash management'] },
    ],
    dependencies: [],
    settings: [
      { key: 'git.autofetch', type: 'boolean', default: 'true', description: 'Auto-fetch from remotes' },
      { key: 'git.confirmSync', type: 'boolean', default: 'true', description: 'Confirm before syncing' },
    ],
    license: 'MIT', repository: 'https://github.com/orion/git-integration',
    ratingBreakdown: [1620, 200, 60, 20, 10],
  },
  {
    id: 'orion-terminal', name: 'Integrated Terminal', publisher: 'Orion', description: 'Embedded terminal with split panes, multiple sessions, and customizable themes',
    iconColor: '#3fb950', iconLetter: 'T', installed: true, enabled: true, stars: 4.7, downloads: 3200000, category: 'Productivity', version: '1.9.3', lastUpdated: '2026-02-10',
    fullDescription: '## Integrated Terminal\n\nA full-featured terminal emulator embedded in the editor with support for multiple shell types, split panes, and theme customization.',
    features: ['Multiple shell support', 'Split panes', 'Customizable themes', 'Shell integration', 'Link detection'],
    changelog: [
      { version: '1.9.3', date: '2026-02-10', changes: ['Fixed shell integration on Windows'] },
      { version: '1.9.0', date: '2026-01-05', changes: ['Added PowerShell 7 support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'terminal.defaultShell', type: 'string', default: 'bash', description: 'Default shell path' },
      { key: 'terminal.fontSize', type: 'number', default: '13', description: 'Terminal font size' },
    ],
    license: 'MIT', repository: 'https://github.com/orion/terminal',
    ratingBreakdown: [1400, 250, 80, 20, 10],
  },
  {
    id: 'orion-themes', name: 'Theme Engine', publisher: 'Orion', description: '7 built-in themes including Dracula, Nord, Monokai Pro, One Dark Pro, and more',
    iconColor: '#d29922', iconLetter: 'T', installed: true, enabled: true, stars: 4.6, downloads: 1800000, category: 'Themes', version: '4.1.0', lastUpdated: '2026-01-25',
    fullDescription: '## Theme Engine\n\nA comprehensive theme engine with 7 built-in themes and support for custom themes. Includes editor, terminal, and UI theming.',
    features: ['7 built-in themes', 'Custom theme support', 'Editor theming', 'Terminal theming', 'Icon theme support'],
    changelog: [
      { version: '4.1.0', date: '2026-01-25', changes: ['Added Catppuccin theme'] },
      { version: '4.0.0', date: '2025-12-15', changes: ['Complete theme engine rewrite'] },
    ],
    dependencies: [],
    settings: [
      { key: 'themes.active', type: 'enum', default: 'dracula', description: 'Active theme name' },
    ],
    license: 'MIT', repository: 'https://github.com/orion/themes',
    ratingBreakdown: [1100, 300, 100, 40, 10],
  },
  {
    id: 'orion-typescript', name: 'TypeScript & JavaScript', publisher: 'Orion', description: 'Rich language support for TypeScript and JavaScript with IntelliSense',
    iconColor: '#3178c6', iconLetter: 'TS', installed: true, enabled: true, stars: 4.9, downloads: 5100000, category: 'Languages', version: '5.2.0', lastUpdated: '2026-03-05',
    fullDescription: '## TypeScript & JavaScript\n\nFull TypeScript and JavaScript language support including IntelliSense, code navigation, refactoring, and debugging.',
    features: ['IntelliSense', 'Go to definition', 'Find all references', 'Rename symbol', 'Auto imports', 'JSX/TSX support'],
    changelog: [
      { version: '5.2.0', date: '2026-03-05', changes: ['TypeScript 5.4 support'] },
      { version: '5.1.0', date: '2026-02-01', changes: ['Improved performance for large projects'] },
    ],
    dependencies: [],
    settings: [
      { key: 'typescript.suggest.autoImports', type: 'boolean', default: 'true', description: 'Enable auto imports' },
      { key: 'typescript.updateImportsOnFileMove', type: 'enum', default: 'prompt', description: 'Update imports on file move' },
    ],
    license: 'MIT', repository: 'https://github.com/orion/typescript',
    ratingBreakdown: [2100, 150, 30, 10, 5], recommended: true, workspaceRecommended: true,
  },
  {
    id: 'prettier', name: 'Prettier - Code Formatter', publisher: 'Prettier', description: 'Code formatter supporting JavaScript, TypeScript, CSS, HTML, JSON, and more',
    iconColor: '#f7b93e', iconLetter: 'P', installed: false, enabled: false, stars: 4.5, downloads: 41200000, category: 'Formatters', version: '10.4.0', lastUpdated: '2026-02-28',
    fullDescription: '## Prettier - Code Formatter\n\nPrettier is an **opinionated code formatter** that supports many languages and integrates with most editors.\n\nIt removes all original styling and ensures that all outputted code conforms to a consistent style.\n\n### Supported Languages\n- JavaScript / TypeScript\n- CSS / Less / SCSS\n- HTML / Vue / Angular\n- JSON / YAML / Markdown\n- GraphQL',
    features: ['Auto-format on save', 'Multi-language support', 'Configurable rules', 'EditorConfig support', 'Ignore patterns', 'Range formatting', 'Plugin system'],
    changelog: [
      { version: '10.4.0', date: '2026-02-28', changes: ['Added CSS nesting support', 'Improved Vue formatting'] },
      { version: '10.3.0', date: '2026-01-15', changes: ['Improved TypeScript formatting'] },
    ],
    dependencies: ['orion-typescript'],
    settings: [
      { key: 'prettier.printWidth', type: 'number', default: '80', description: 'Line width' },
      { key: 'prettier.singleQuote', type: 'boolean', default: 'false', description: 'Use single quotes' },
      { key: 'prettier.tabWidth', type: 'number', default: '2', description: 'Tab width' },
      { key: 'prettier.semi', type: 'boolean', default: 'true', description: 'Print semicolons' },
    ],
    license: 'MIT', repository: 'https://github.com/prettier/prettier-vscode',
    ratingBreakdown: [28000, 8000, 3000, 1200, 500], recommended: true, workspaceRecommended: true,
  },
  {
    id: 'eslint', name: 'ESLint', publisher: 'Microsoft', description: 'Integrates ESLint into the editor for JavaScript and TypeScript linting',
    iconColor: '#4b32c3', iconLetter: 'ES', installed: false, enabled: false, stars: 4.6, downloads: 32800000, category: 'Linters', version: '3.0.5', lastUpdated: '2026-03-02',
    fullDescription: '## ESLint\n\nIntegrates **ESLint** JavaScript linting into the editor.\n\nProvides real-time feedback, auto-fix on save, and inline diagnostics for code quality issues.',
    features: ['Real-time linting', 'Auto-fix on save', 'Custom rule support', 'Flat config support', 'Inline diagnostics'],
    changelog: [
      { version: '3.0.5', date: '2026-03-02', changes: ['ESLint 9 flat config support'] },
      { version: '3.0.0', date: '2026-01-01', changes: ['Major rewrite with improved performance'] },
    ],
    dependencies: ['orion-typescript'],
    settings: [
      { key: 'eslint.autoFixOnSave', type: 'boolean', default: 'true', description: 'Auto-fix on save' },
      { key: 'eslint.validate', type: 'string', default: 'javascript,typescript', description: 'Languages to validate' },
    ],
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-eslint',
    ratingBreakdown: [22000, 6500, 2300, 1000, 500], recommended: true, workspaceRecommended: true,
  },
  {
    id: 'gitlens', name: 'GitLens', publisher: 'GitKraken', description: 'Supercharge Git -- Visualize code authorship, navigate history, and gain insights',
    iconColor: '#2ea043', iconLetter: 'GL', installed: false, enabled: false, stars: 4.7, downloads: 28500000, category: 'Git', version: '15.1.0', lastUpdated: '2026-02-25',
    fullDescription: '## GitLens\n\nGitLens **supercharges** your Git experience. It helps you visualize code authorship at a glance via Git blame annotations and CodeLens.',
    features: ['Git blame annotations', 'Repository explorer', 'Commit graph', 'Interactive rebase', 'Worktrees support'],
    changelog: [
      { version: '15.1.0', date: '2026-02-25', changes: ['New commit graph visualization'] },
      { version: '15.0.0', date: '2026-01-10', changes: ['Performance improvements'] },
    ],
    dependencies: ['orion-git'],
    settings: [
      { key: 'gitlens.codeLens.enabled', type: 'boolean', default: 'true', description: 'Show CodeLens' },
      { key: 'gitlens.blame.format', type: 'string', default: '${author} (${date})', description: 'Blame annotation format' },
    ],
    license: 'MIT', repository: 'https://github.com/gitkraken/vscode-gitlens',
    ratingBreakdown: [19000, 5800, 2000, 700, 300],
  },
  {
    id: 'python', name: 'Python', publisher: 'Microsoft', description: 'Rich Python language support with IntelliSense, linting, debugging, and Jupyter',
    iconColor: '#3776ab', iconLetter: 'Py', installed: false, enabled: false, stars: 4.7, downloads: 89300000, category: 'Languages', version: '2024.4.0', lastUpdated: '2026-03-08',
    fullDescription: '## Python\n\nA rich Python editing experience with IntelliSense (Pylance), linting, debugging (Python Debugger), code navigation, formatting, refactoring, and Jupyter notebook support.',
    features: ['IntelliSense via Pylance', 'Debugging support', 'Jupyter notebooks', 'Virtual environment support', 'Testing integration', 'Linting with Ruff'],
    changelog: [
      { version: '2024.4.0', date: '2026-03-08', changes: ['Improved Pylance performance', 'Python 3.13 support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'python.defaultInterpreter', type: 'string', default: 'python3', description: 'Default Python interpreter' },
      { key: 'python.linting.enabled', type: 'boolean', default: 'true', description: 'Enable linting' },
    ],
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-python',
    ratingBreakdown: [62000, 16000, 6000, 3000, 1500],
  },
  {
    id: 'go', name: 'Go', publisher: 'Go Team at Google', description: 'Rich Go language support including IntelliSense, debugging, and code navigation',
    iconColor: '#00add8', iconLetter: 'Go', installed: false, enabled: false, stars: 4.7, downloads: 12100000, category: 'Languages', version: '0.42.0', lastUpdated: '2026-02-18',
    fullDescription: '## Go\n\nRich language support for the Go programming language, including IntelliSense, code navigation, debugging, testing, and more using **gopls** and **Delve**.',
    features: ['IntelliSense via gopls', 'Debugging with Delve', 'Test explorer', 'Code generation', 'Linting integration'],
    changelog: [
      { version: '0.42.0', date: '2026-02-18', changes: ['Go 1.22 support'] },
      { version: '0.41.0', date: '2026-01-05', changes: ['Improved workspace module support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'go.formatTool', type: 'enum', default: 'gofmt', description: 'Format tool' },
      { key: 'go.lintTool', type: 'enum', default: 'golangci-lint', description: 'Lint tool' },
    ],
    license: 'MIT', repository: 'https://github.com/golang/vscode-go',
    ratingBreakdown: [8500, 2200, 700, 300, 100],
  },
  {
    id: 'rust-analyzer', name: 'rust-analyzer', publisher: 'rust-lang', description: 'Fast and feature-rich Rust language server with completions and diagnostics',
    iconColor: '#dea584', iconLetter: 'R', installed: false, enabled: false, stars: 4.8, downloads: 8400000, category: 'Languages', version: '0.4.1890', lastUpdated: '2026-03-10',
    fullDescription: '## rust-analyzer\n\n**rust-analyzer** is a fast, feature-rich implementation of the Language Server Protocol for Rust.\n\nProvides smart completions, inline type hints, and powerful code navigation.',
    features: ['Smart completions', 'Inline type hints', 'Macro expansion', 'Cargo integration', 'Proc-macro support', 'Flycheck diagnostics'],
    changelog: [
      { version: '0.4.1890', date: '2026-03-10', changes: ['Improved trait completion', 'Better lifetime inference'] },
      { version: '0.4.1880', date: '2026-02-20', changes: ['Better macro support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'rust-analyzer.checkOnSave', type: 'boolean', default: 'true', description: 'Run cargo check on save' },
      { key: 'rust-analyzer.inlayHints.enable', type: 'boolean', default: 'true', description: 'Show inlay hints' },
    ],
    license: 'MIT', repository: 'https://github.com/rust-lang/rust-analyzer',
    ratingBreakdown: [6200, 1400, 400, 150, 50],
  },
  {
    id: 'docker', name: 'Docker', publisher: 'Microsoft', description: 'Build, manage, and deploy containerized applications from the editor',
    iconColor: '#2496ed', iconLetter: 'D', installed: false, enabled: false, stars: 4.4, downloads: 21700000, category: 'Productivity', version: '1.29.0', lastUpdated: '2026-02-12',
    fullDescription: '## Docker\n\nBuild, manage, and deploy containerized applications. Syntax highlighting for Dockerfiles, compose files, and one-click debugging.',
    features: ['Dockerfile support', 'Docker Compose support', 'Container explorer', 'Image management', 'One-click debugging'],
    changelog: [
      { version: '1.29.0', date: '2026-02-12', changes: ['Added Docker Scout integration'] },
    ],
    dependencies: [],
    settings: [
      { key: 'docker.defaultRegistryPath', type: 'string', default: '', description: 'Default registry path' },
    ],
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-docker',
    ratingBreakdown: [14000, 4500, 1800, 800, 400],
  },
  {
    id: 'remote-ssh', name: 'Remote - SSH', publisher: 'Microsoft', description: 'Open any folder on a remote machine using SSH and take advantage of the full editor',
    iconColor: '#0098ff', iconLetter: 'RS', installed: false, enabled: false, stars: 4.3, downloads: 16200000, category: 'Productivity', version: '0.110.0', lastUpdated: '2026-01-30',
    fullDescription: '## Remote - SSH\n\nOpen any folder on a remote machine with SSH access, enabling the same editing experience as working locally.',
    features: ['Remote file editing', 'Port forwarding', 'Terminal access', 'Extension host on remote', 'Multi-hop SSH'],
    changelog: [
      { version: '0.110.0', date: '2026-01-30', changes: ['Improved connection stability'] },
    ],
    dependencies: [],
    settings: [
      { key: 'remote.SSH.showLoginTerminal', type: 'boolean', default: 'false', description: 'Show login terminal' },
    ],
    license: 'MIT', repository: 'https://github.com/microsoft/vscode-remote-release',
    ratingBreakdown: [10000, 3500, 1500, 700, 400],
  },
  {
    id: 'copilot', name: 'GitHub Copilot', publisher: 'GitHub', description: 'AI pair programmer that suggests code completions in real-time as you type',
    iconColor: '#6e40c9', iconLetter: 'CP', installed: false, enabled: false, stars: 4.5, downloads: 18900000, category: 'AI', version: '1.180.0', lastUpdated: '2026-03-09',
    fullDescription: '## GitHub Copilot\n\nGitHub Copilot is an AI pair programmer that provides autocomplete-style suggestions as you code.',
    features: ['Inline suggestions', 'Multi-line completions', 'Chat interface', 'Code explanations', 'Test generation'],
    changelog: [
      { version: '1.180.0', date: '2026-03-09', changes: ['Improved suggestion quality'] },
    ],
    dependencies: [],
    settings: [
      { key: 'copilot.enable', type: 'boolean', default: 'true', description: 'Enable Copilot' },
    ],
    license: 'Proprietary', repository: 'https://github.com/features/copilot',
    ratingBreakdown: [12000, 3800, 1600, 800, 500], recommended: true,
  },
  {
    id: 'error-lens', name: 'Error Lens', publisher: 'Alexander', description: 'Improve highlighting of errors, warnings, and other diagnostics inline',
    iconColor: '#ff6b6b', iconLetter: 'EL', installed: false, enabled: false, stars: 4.8, downloads: 9200000, category: 'Linters', version: '3.16.0', lastUpdated: '2026-02-22',
    fullDescription: '## Error Lens\n\nErrorLens turbocharges language diagnostic features by making diagnostics stand out more prominently.',
    features: ['Inline diagnostics', 'Line highlighting', 'Gutter icons', 'Status bar info', 'Customizable colors'],
    changelog: [
      { version: '3.16.0', date: '2026-02-22', changes: ['Performance improvements for large files'] },
    ],
    dependencies: [],
    settings: [
      { key: 'errorLens.enabled', type: 'boolean', default: 'true', description: 'Enable Error Lens' },
      { key: 'errorLens.messageMaxChars', type: 'number', default: '300', description: 'Max message length' },
    ],
    license: 'MIT', repository: 'https://github.com/usernamehw/vscode-error-lens',
    ratingBreakdown: [6800, 1600, 400, 150, 50], recommended: true,
  },
  {
    id: 'material-icon-theme', name: 'Material Icon Theme', publisher: 'Philipp Kief', description: 'Material Design icons for files and folders in the file explorer',
    iconColor: '#42a5f5', iconLetter: 'MI', installed: false, enabled: false, stars: 4.8, downloads: 19600000, category: 'Themes', version: '5.2.0', lastUpdated: '2026-02-14',
    fullDescription: '## Material Icon Theme\n\nMaterial Design icons for files and folders with over 1000 file and folder icons.',
    features: ['1000+ file icons', 'Folder color customization', 'Icon associations', 'Custom icon packs', 'Light/dark variants'],
    changelog: [
      { version: '5.2.0', date: '2026-02-14', changes: ['Added Bun and Deno icons'] },
    ],
    dependencies: [],
    settings: [
      { key: 'material-icon-theme.activeIconPack', type: 'enum', default: 'angular', description: 'Active icon pack' },
    ],
    license: 'MIT', repository: 'https://github.com/PKief/vscode-material-icon-theme',
    ratingBreakdown: [14000, 3500, 1000, 400, 200],
  },
  {
    id: 'todo-tree', name: 'Todo Tree', publisher: 'Gruntfuggly', description: 'Show TODO, FIXME, and other annotation tags in a tree view for quick navigation',
    iconColor: '#ffca28', iconLetter: 'TT', installed: false, enabled: false, stars: 4.7, downloads: 7100000, category: 'Productivity', version: '0.0.226', lastUpdated: '2026-01-18',
    fullDescription: '## Todo Tree\n\nSearches your workspace for comment tags like TODO and FIXME, and displays them in a tree view.',
    features: ['Tree view of tags', 'Custom tag support', 'Regex filtering', 'Highlight customization', 'Multi-workspace support'],
    changelog: [
      { version: '0.0.226', date: '2026-01-18', changes: ['Added exclusion patterns'] },
    ],
    dependencies: [],
    settings: [
      { key: 'todo-tree.general.tags', type: 'string', default: 'TODO,FIXME,HACK', description: 'Tags to search for' },
    ],
    license: 'MIT', repository: 'https://github.com/Gruntfuggly/todo-tree',
    ratingBreakdown: [5200, 1200, 350, 150, 50],
  },
  {
    id: 'tailwind', name: 'Tailwind CSS IntelliSense', publisher: 'Tailwind Labs', description: 'Intelligent Tailwind CSS tooling with autocomplete, syntax highlighting, and linting',
    iconColor: '#38bdf8', iconLetter: 'TW', installed: false, enabled: false, stars: 4.6, downloads: 15400000, category: 'Languages', version: '0.12.0', lastUpdated: '2026-03-01',
    fullDescription: '## Tailwind CSS IntelliSense\n\nEnhances the Tailwind development experience with features like autocomplete, syntax highlighting, and linting.',
    features: ['Class autocomplete', 'Hover preview', 'CSS linting', 'JIT mode support', 'Custom config support'],
    changelog: [
      { version: '0.12.0', date: '2026-03-01', changes: ['Tailwind v4 support', 'Improved autocomplete speed'] },
    ],
    dependencies: [],
    settings: [
      { key: 'tailwindCSS.emmetCompletions', type: 'boolean', default: 'false', description: 'Enable emmet completions' },
    ],
    license: 'MIT', repository: 'https://github.com/tailwindlabs/tailwindcss-intellisense',
    ratingBreakdown: [10500, 2800, 1000, 500, 200], workspaceRecommended: true,
  },
  {
    id: 'live-server', name: 'Live Server', publisher: 'Ritwick Dey', description: 'Launch a local development server with live reload for static and dynamic pages',
    iconColor: '#41b883', iconLetter: 'LS', installed: false, enabled: false, stars: 4.4, downloads: 38100000, category: 'Productivity', version: '5.7.9', lastUpdated: '2025-12-15',
    fullDescription: '## Live Server\n\nLaunch a local development server with live reload feature for static and dynamic pages.',
    features: ['Live reload', 'Custom browser support', 'HTTPS support', 'Proxy support', 'Custom port configuration'],
    changelog: [
      { version: '5.7.9', date: '2025-12-15', changes: ['Bug fixes'] },
    ],
    dependencies: [],
    settings: [
      { key: 'liveServer.settings.port', type: 'number', default: '5500', description: 'Server port' },
    ],
    license: 'MIT', repository: 'https://github.com/ritwickdey/vscode-live-server',
    ratingBreakdown: [24000, 8000, 3500, 1500, 800],
  },
  {
    id: 'auto-rename-tag', name: 'Auto Rename Tag', publisher: 'Jun Han', description: 'Automatically rename paired HTML/XML tags when one is edited',
    iconColor: '#e06c75', iconLetter: 'AR', installed: false, enabled: false, stars: 4.3, downloads: 14700000, category: 'Productivity', version: '0.1.10', lastUpdated: '2025-11-20',
    fullDescription: '## Auto Rename Tag\n\nAutomatically renames paired HTML/XML/JSX tags.',
    features: ['Auto tag renaming', 'HTML/XML/JSX support', 'Multi-cursor support', 'Configurable patterns', 'Embedded language support'],
    changelog: [
      { version: '0.1.10', date: '2025-11-20', changes: ['Fixed JSX support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'auto-rename-tag.activationOnLanguage', type: 'string', default: 'html,xml,jsx', description: 'Activation languages' },
    ],
    license: 'MIT', repository: 'https://github.com/formulahendry/vscode-auto-rename-tag',
    ratingBreakdown: [9000, 3000, 1500, 600, 400],
  },
  {
    id: 'import-cost', name: 'Import Cost', publisher: 'Wix', description: 'Display inline the size of imported packages in JavaScript and TypeScript',
    iconColor: '#cc6699', iconLetter: 'IC', installed: false, enabled: false, stars: 4.2, downloads: 5800000, category: 'Productivity', version: '3.3.0', lastUpdated: '2025-10-10',
    fullDescription: '## Import Cost\n\nDisplays inline in the editor the size of the imported package.',
    features: ['Inline size display', 'Bundle size calculation', 'Gzip size estimation', 'Caching for speed', 'Configurable size limits'],
    changelog: [
      { version: '3.3.0', date: '2025-10-10', changes: ['ESM support improvements'] },
    ],
    dependencies: ['orion-typescript'],
    settings: [
      { key: 'importCost.smallPackageSize', type: 'number', default: '50', description: 'Small package threshold (KB)' },
    ],
    license: 'MIT', repository: 'https://github.com/nicolo-ribaudo/import-cost',
    ratingBreakdown: [3800, 1100, 450, 200, 100],
  },
  {
    id: 'path-intellisense', name: 'Path Intellisense', publisher: 'Christian Kohler', description: 'Autocomplete filenames and paths as you type in import statements',
    iconColor: '#e0e0e0', iconLetter: 'PI', installed: false, enabled: false, stars: 4.4, downloads: 11300000, category: 'Productivity', version: '2.9.0', lastUpdated: '2026-01-08',
    fullDescription: '## Path Intellisense\n\nProvides intelligent path completion for filenames.',
    features: ['Path autocompletion', 'Custom path mappings', 'Extension filtering', 'Relative/absolute paths', 'Workspace-aware'],
    changelog: [
      { version: '2.9.0', date: '2026-01-08', changes: ['Added monorepo support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'path-intellisense.mappings', type: 'string', default: '{}', description: 'Path mappings' },
    ],
    license: 'MIT', repository: 'https://github.com/ChristianKohler/PathIntellisense',
    ratingBreakdown: [7500, 2200, 800, 400, 200],
  },
  {
    id: 'rest-client', name: 'REST Client', publisher: 'Huachao Mao', description: 'Send HTTP requests and view responses directly within the editor',
    iconColor: '#d4a373', iconLetter: 'RC', installed: false, enabled: false, stars: 4.5, downloads: 6900000, category: 'Productivity', version: '0.25.1', lastUpdated: '2026-01-22',
    fullDescription: '## REST Client\n\nSend HTTP requests and view responses directly in the editor.',
    features: ['HTTP request sending', 'Response preview', 'Environment variables', 'cURL import/export', 'Request history'],
    changelog: [
      { version: '0.25.1', date: '2026-01-22', changes: ['GraphQL support improvements'] },
    ],
    dependencies: [],
    settings: [
      { key: 'rest-client.defaultHeaders', type: 'string', default: '{}', description: 'Default request headers' },
    ],
    license: 'MIT', repository: 'https://github.com/Huachao/vscode-restclient',
    ratingBreakdown: [4800, 1300, 400, 200, 100],
  },
  {
    id: 'bracket-pair', name: 'Bracket Pair Colorizer', publisher: 'CoenraadS', description: 'Colorize matching brackets with distinct colors for easier code navigation',
    iconColor: '#ffd700', iconLetter: 'BP', installed: false, enabled: false, stars: 4.3, downloads: 10200000, category: 'Productivity', version: '2.0.2', lastUpdated: '2025-09-10',
    fullDescription: '## Bracket Pair Colorizer\n\nAllows matching brackets to be identified with colors.',
    features: ['Colored brackets', 'Custom color schemes', 'Scope highlighting', 'Custom bracket pairs', 'Multi-language support'],
    changelog: [
      { version: '2.0.2', date: '2025-09-10', changes: ['Fixed compatibility issues'] },
    ],
    dependencies: [],
    settings: [
      { key: 'bracketPairColorizer.colors', type: 'string', default: 'Gold,Orchid,LightSkyBlue', description: 'Bracket colors' },
    ],
    license: 'MIT', repository: 'https://github.com/CoenraadS/Bracket-Pair-Colorizer-2',
    ratingBreakdown: [6500, 2000, 900, 400, 200],
  },
  {
    id: 'thunder-client', name: 'Thunder Client', publisher: 'Thunder Client', description: 'Lightweight REST API client with GUI for testing APIs inside the editor',
    iconColor: '#7b61ff', iconLetter: 'TC', installed: false, enabled: false, stars: 4.6, downloads: 8300000, category: 'Productivity', version: '2.22.0', lastUpdated: '2026-02-05',
    fullDescription: '## Thunder Client\n\nLightweight REST API client extension hand-crafted for testing APIs.',
    features: ['GUI-based API testing', 'Collections support', 'Environment variables', 'Git sync', 'Code snippet generation'],
    changelog: [
      { version: '2.22.0', date: '2026-02-05', changes: ['Added WebSocket support'] },
    ],
    dependencies: [],
    settings: [
      { key: 'thunder-client.saveToWorkspace', type: 'boolean', default: 'false', description: 'Save requests to workspace' },
    ],
    license: 'Proprietary', repository: 'https://github.com/rangav/thunder-client-support',
    ratingBreakdown: [5800, 1500, 500, 200, 100],
  },
  {
    id: 'debugger-for-chrome', name: 'Debugger for Chrome', publisher: 'Microsoft', description: 'Debug JavaScript code running in Google Chrome from within the editor',
    iconColor: '#4caf50', iconLetter: 'DC', installed: false, enabled: false, stars: 4.3, downloads: 14500000, category: 'Debuggers', version: '4.13.0', lastUpdated: '2025-12-01',
    fullDescription: '## Debugger for Chrome\n\nDebug JavaScript code running in Google Chrome from within the editor. Set breakpoints, step through code, and inspect variables.',
    features: ['Breakpoint support', 'Step debugging', 'Variable inspection', 'Console output', 'Source map support', 'Conditional breakpoints'],
    changelog: [
      { version: '4.13.0', date: '2025-12-01', changes: ['Improved source map resolution', 'Chrome 120 compatibility'] },
    ],
    dependencies: [],
    settings: [
      { key: 'chrome.debug.port', type: 'number', default: '9222', description: 'Chrome debug port' },
      { key: 'chrome.debug.sourceMapPathOverrides', type: 'string', default: '{}', description: 'Source map path overrides' },
    ],
    license: 'MIT', repository: 'https://github.com/nicolo-ribaudo/debugger-for-chrome',
    ratingBreakdown: [9000, 3000, 1200, 500, 300], recommended: true,
  },
]

const CATEGORIES: ExtCategory[] = ['All', 'AI', 'Languages', 'Themes', 'Linters', 'Formatters', 'Debuggers', 'Git', 'Productivity']
const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'installs', label: 'Installs' },
  { value: 'rating', label: 'Rating' },
  { value: 'name', label: 'Name' },
  { value: 'updated', label: 'Recently Updated' },
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StarRating({ rating, size = 10 }: { rating: number; size?: number }) {
  const full = Math.floor(rating)
  const frac = rating - full
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      {[...Array(5)].map((_, i) => {
        const isFull = i < full
        const isPartial = i === full && frac >= 0.25
        const fillPct = isFull ? 100 : isPartial ? Math.round(frac * 100) : 0
        return (
          <span key={i} style={{ position: 'relative', display: 'inline-block', width: size, height: size, fontSize: size, lineHeight: 1 }}>
            <span style={{ color: 'var(--text-muted)', opacity: 0.25, position: 'absolute', left: 0, top: 0 }}>{'\u2605'}</span>
            <span style={{
              color: '#d29922',
              position: 'absolute', left: 0, top: 0,
              width: `${fillPct}%`,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}>{'\u2605'}</span>
          </span>
        )
      })}
      <span style={{ marginLeft: 3, fontSize: size, color: 'var(--text-muted)' }}>{rating.toFixed(1)}</span>
    </span>
  )
}

function RatingBreakdown({ breakdown, total }: { breakdown: [number, number, number, number, number]; total: number }) {
  const max = Math.max(...breakdown)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {[5, 4, 3, 2, 1].map((star, idx) => {
        const count = breakdown[idx]
        const pct = total > 0 ? (count / max) * 100 : 0
        return (
          <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <span style={{ width: 12, textAlign: 'right', color: 'var(--text-muted)' }}>{star}</span>
            <Star size={9} style={{ color: '#d29922', flexShrink: 0 }} fill="#d29922" />
            <div style={{
              flex: 1, height: 6, borderRadius: 3,
              background: 'var(--bg-tertiary)', overflow: 'hidden',
            }}>
              <div style={{
                height: '100%', borderRadius: 3,
                background: '#d29922',
                width: `${pct}%`,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <span style={{ width: 40, textAlign: 'right', color: 'var(--text-muted)', fontSize: 10 }}>
              {formatDownloads(count)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ExtensionIcon({ letter, color, size = 40 }: { letter: string; color: string; size?: number }) {
  const isLarge = size >= 56
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: isLarge ? 12 : 6,
      background: `linear-gradient(135deg, ${color}33, ${color}55)`,
      border: `1.5px solid ${color}44`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      fontSize: isLarge ? 26 : (letter.length > 1 ? 11 : 15),
      fontWeight: 800,
      color: color,
      fontFamily: 'monospace',
      boxShadow: isLarge ? `0 4px 12px ${color}22` : 'none',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -size * 0.3, right: -size * 0.3,
        width: size * 0.6, height: size * 0.6,
        borderRadius: '50%',
        background: `${color}15`,
      }} />
      <span style={{ position: 'relative', zIndex: 1 }}>{letter}</span>
    </div>
  )
}

function LoadingSpinner({ size = 14 }: { size?: number }) {
  return (
    <span className="ext-spinner" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <Loader2 size={size} />
    </span>
  )
}

function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []

  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '14px 0 6px', lineHeight: 1.3 }}>{trimmed.slice(3)}</h3>)
    } else if (trimmed.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '12px 0 4px', lineHeight: 1.3 }}>{trimmed.slice(4)}</h4>)
    } else if (trimmed.startsWith('- ')) {
      elements.push(
        <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, paddingLeft: 4 }}>
          <span style={{ color: 'var(--text-muted)' }}>{'\u2022'}</span>
          <span>{renderInlineMarkdown(trimmed.slice(2))}</span>
        </div>
      )
    } else if (trimmed === '') {
      elements.push(<div key={i} style={{ height: 6 }} />)
    } else {
      elements.push(<p key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '2px 0' }}>{renderInlineMarkdown(trimmed)}</p>)
    }
  })

  return <div>{elements}</div>
}

function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /\*\*(.+?)\*\*/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    parts.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{match[1]}</strong>)
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 && typeof parts[0] === 'string' ? parts[0] : <>{parts}</>
}

// ---------------------------------------------------------------------------
// Detail View
// ---------------------------------------------------------------------------

function ExtensionDetail({ ext, onBack, onInstall, onUninstall, onToggle, loadingId }: {
  ext: Extension
  onBack: () => void
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onToggle: (id: string) => void
  loadingId: string | null
}) {
  const [tab, setTab] = useState<DetailTab>('details')
  const isLoading = loadingId === ext.id
  const totalRatings = ext.ratingBreakdown.reduce((a, b) => a + b, 0)

  const tabs: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
    { key: 'details', label: 'Details', icon: <FileText size={12} /> },
    { key: 'changelog', label: 'Changelog', icon: <List size={12} /> },
    { key: 'dependencies', label: 'Dependencies', icon: <Package size={12} /> },
    { key: 'settings', label: 'Settings', icon: <Settings size={12} /> },
  ]

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
        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          <ExtensionIcon letter={ext.iconLetter} color={ext.iconColor} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, lineHeight: 1.2 }}>{ext.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              {ext.publisher}
              <span style={{ margin: '0 6px', opacity: 0.4 }}>|</span>
              <span style={{ fontFamily: 'monospace', fontSize: 11 }}>v{ext.version}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
              {ext.description}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
              <StarRating rating={ext.stars} size={11} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Download size={11} /> {formatDownloads(ext.downloads)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={10} /> Updated {timeAgo(ext.lastUpdated)}
              </span>
            </div>
            {/* Actions */}
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ext.installed ? (
                <>
                  <button
                    onClick={() => onToggle(ext.id)}
                    disabled={isLoading}
                    style={{
                      padding: '6px 16px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: ext.enabled ? 'rgba(210,153,34,0.15)' : 'rgba(63,185,80,0.15)',
                      color: ext.enabled ? '#d29922' : '#3fb950',
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >
                    {ext.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => onUninstall(ext.id)}
                    disabled={isLoading}
                    style={{
                      padding: '6px 16px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                      background: 'rgba(248,81,73,0.12)', color: '#f85149',
                      display: 'flex', alignItems: 'center', gap: 5,
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >
                    {isLoading ? <LoadingSpinner size={12} /> : <Trash2 size={12} />}
                    Uninstall
                  </button>
                </>
              ) : (
                <button
                  onClick={() => onInstall(ext.id)}
                  disabled={isLoading}
                  style={{
                    padding: '6px 20px', fontSize: 11, fontWeight: 600, borderRadius: 4, border: 'none', cursor: 'pointer',
                    background: 'var(--accent-blue, #388bfd)', color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 5,
                    opacity: isLoading ? 0.7 : 1,
                  }}
                >
                  {isLoading ? <LoadingSpinner size={12} /> : <Download size={12} />}
                  {isLoading ? 'Installing...' : 'Install'}
                </button>
              )}
              <button
                style={{
                  padding: '6px 12px', fontSize: 11, fontWeight: 500, borderRadius: 4,
                  border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5,
                }}
                className="ext-report-btn"
              >
                <Flag size={11} /> Report Issue
              </button>
            </div>
          </div>
        </div>

        {/* Screenshots placeholder */}
        <div style={{
          marginBottom: 16, padding: '20px 0',
          display: 'flex', gap: 8, overflowX: 'auto',
        }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              width: 180, height: 108, borderRadius: 6, flexShrink: 0,
              background: `linear-gradient(135deg, ${ext.iconColor}15, ${ext.iconColor}08)`,
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 4,
            }}>
              <Camera size={18} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.5 }}>Screenshot {i}</span>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 14,
        }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '8px 14px', fontSize: 11, fontWeight: tab === t.key ? 600 : 400,
                background: 'none', border: 'none', cursor: 'pointer',
                color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: tab === t.key ? '2px solid var(--accent-blue, #388bfd)' : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 0.15s',
              }}
              className="ext-tab-btn"
            >
              {t.icon} {t.label}
              {t.key === 'dependencies' && ext.dependencies.length > 0 && (
                <span style={{ fontSize: 9, background: 'var(--bg-tertiary)', borderRadius: 6, padding: '0 5px', lineHeight: '14px' }}>
                  {ext.dependencies.length}
                </span>
              )}
              {t.key === 'settings' && ext.settings.length > 0 && (
                <span style={{ fontSize: 9, background: 'var(--bg-tertiary)', borderRadius: 6, padding: '0 5px', lineHeight: '14px' }}>
                  {ext.settings.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'details' && (
          <div>
            {/* Description with markdown */}
            <div style={{ marginBottom: 20 }}>
              <SimpleMarkdown text={ext.fullDescription} />
            </div>

            {/* Features */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Features</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ext.features.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <CheckCircle2 size={13} style={{ color: '#3fb950', flexShrink: 0, marginTop: 2 }} />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rating breakdown */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Ratings & Reviews</div>
              <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{ textAlign: 'center', minWidth: 70 }}>
                  <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{ext.stars.toFixed(1)}</div>
                  <StarRating rating={ext.stars} size={11} />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{formatDownloads(totalRatings)} ratings</div>
                </div>
                <div style={{ flex: 1 }}>
                  <RatingBreakdown breakdown={ext.ratingBreakdown} total={totalRatings} />
                </div>
              </div>
            </div>

            {/* More Info */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>More Info</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', fontSize: 11 }}>
                <span style={{ color: 'var(--text-muted)' }}>Version</span>
                <span style={{ color: 'var(--text-secondary)' }}>{ext.version}</span>
                <span style={{ color: 'var(--text-muted)' }}>Last Updated</span>
                <span style={{ color: 'var(--text-secondary)' }}>{ext.lastUpdated}</span>
                <span style={{ color: 'var(--text-muted)' }}>Publisher</span>
                <span style={{ color: 'var(--text-secondary)' }}>{ext.publisher}</span>
                <span style={{ color: 'var(--text-muted)' }}>License</span>
                <span style={{ color: 'var(--text-secondary)' }}>{ext.license}</span>
                <span style={{ color: 'var(--text-muted)' }}>Category</span>
                <span style={{
                  color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
                }}>
                  <span style={{
                    background: 'var(--bg-tertiary)', padding: '1px 8px', borderRadius: 8, fontSize: 10,
                  }}>{ext.category}</span>
                </span>
                <span style={{ color: 'var(--text-muted)' }}>Repository</span>
                <span style={{ color: '#58a6ff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                  {ext.repository.replace('https://github.com/', '')}
                  <ExternalLink size={10} />
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === 'changelog' && (
          <div>
            {ext.changelog.map((entry, i) => (
              <div key={i} style={{
                marginBottom: 16, padding: '12px 14px', borderRadius: 6,
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                    fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 4,
                  }}>
                    v{entry.version}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{entry.date}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {entry.changes.map((c, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <span style={{ color: '#3fb950', flexShrink: 0 }}>{'\u2022'}</span>
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'dependencies' && (
          <div>
            {ext.dependencies.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <Package size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                <div>No dependencies</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ext.dependencies.map(dep => {
                  const depExt = EXTENSIONS.find(e => e.id === dep)
                  return (
                    <div key={dep} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)',
                    }}>
                      {depExt ? (
                        <>
                          <ExtensionIcon letter={depExt.iconLetter} color={depExt.iconColor} size={28} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{depExt.name}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{depExt.publisher}</div>
                          </div>
                          {depExt.installed ? (
                            <span style={{ fontSize: 10, color: '#3fb950', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Check size={10} /> Installed
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: '#d29922' }}>Required</span>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{dep}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div>
            {ext.settings.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <Settings size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
                <div>No contributed settings</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {ext.settings.map(s => (
                  <div key={s.key} style={{
                    padding: '10px 12px',
                    background: 'var(--bg-primary)', borderRadius: 6, border: '1px solid var(--border)',
                    marginBottom: 4,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <code style={{
                        fontSize: 11, color: '#58a6ff', fontFamily: 'monospace',
                        background: 'rgba(88,166,255,0.08)', padding: '1px 6px', borderRadius: 3,
                      }}>
                        {s.key}
                      </code>
                      <span style={{
                        fontSize: 9, padding: '1px 5px', borderRadius: 3,
                        background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                      }}>
                        {s.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{s.description}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                      Default: <code style={{ fontFamily: 'monospace', color: '#d29922' }}>{s.default}</code>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .ext-back-btn:hover { background: var(--bg-hover, rgba(255,255,255,0.06)) !important; }
        .ext-tab-btn:hover { color: var(--text-primary) !important; background: rgba(255,255,255,0.03); }
        .ext-report-btn:hover { border-color: var(--text-muted) !important; color: var(--text-secondary) !important; }
        @keyframes ext-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ext-spinner svg { animation: ext-spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Extension Card
// ---------------------------------------------------------------------------

function ExtensionCard({ ext, onClick, onInstall, onUninstall, onToggle, showInstalledControls, loadingId }: {
  ext: Extension
  onClick: () => void
  onInstall: (id: string) => void
  onUninstall: (id: string) => void
  onToggle: (id: string) => void
  showInstalledControls?: boolean
  loadingId: string | null
}) {
  const isLoading = loadingId === ext.id
  return (
    <div
      className="ext-item"
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        cursor: 'pointer',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        transition: 'background 0.1s',
      }}
      onClick={onClick}
    >
      <ExtensionIcon letter={ext.iconLetter} color={ext.iconColor} size={44} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ext.name}</span>
          <span style={{
            fontSize: 9, padding: '0px 5px', borderRadius: 4, flexShrink: 0,
            background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontFamily: 'monospace', lineHeight: '14px',
          }}>
            v{ext.version}
          </span>
          {!ext.enabled && ext.installed && (
            <span style={{ fontSize: 9, color: '#d29922', fontWeight: 600 }}>Disabled</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 0 }}>{ext.publisher}</div>
        <div style={{
          fontSize: 11, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ext.description}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 10, color: 'var(--text-muted)' }}>
          <StarRating rating={ext.stars} size={9} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Download size={9} />
            {formatDownloads(ext.downloads)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Clock size={9} />
            {timeAgo(ext.lastUpdated)}
          </span>
          <span style={{ background: 'var(--bg-tertiary)', padding: '0 5px', borderRadius: 6, fontSize: 9, lineHeight: '14px' }}>
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
              disabled={isLoading}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 3,
                color: ext.enabled ? '#3fb950' : 'var(--text-muted)', display: 'flex', alignItems: 'center',
                opacity: isLoading ? 0.3 : 0.7,
              }}
              className="ext-action-btn"
            >
              {ext.enabled ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
            </button>
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                onClick={() => onUninstall(ext.id)}
                title="Uninstall"
                disabled={isLoading}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 3,
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center', opacity: isLoading ? 0.3 : 0.5,
                }}
                className="ext-action-btn"
              >
                {isLoading ? <LoadingSpinner size={13} /> : <Trash2 size={13} />}
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
            disabled={isLoading}
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
              display: 'flex', alignItems: 'center', gap: 4,
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? <LoadingSpinner size={11} /> : null}
            {isLoading ? 'Installing...' : 'Install'}
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section Header Component
// ---------------------------------------------------------------------------

function SectionHeader({ icon, label, count, collapsed, onToggle, badge }: {
  icon?: React.ReactNode
  label: string
  count: number
  collapsed?: boolean
  onToggle?: () => void
  badge?: string
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px',
        fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', cursor: onToggle ? 'pointer' : 'default',
        textTransform: 'uppercase', letterSpacing: '0.5px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        userSelect: 'none',
      }}
      className={onToggle ? 'ext-section-header' : undefined}
    >
      {onToggle && (collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />)}
      {icon}
      {label}
      <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>({count})</span>
      {badge && (
        <span style={{
          marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 8,
          background: 'rgba(88,166,255,0.12)', color: '#58a6ff', fontWeight: 600,
        }}>
          {badge}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

export default function ExtensionsPanel() {
  const [searchQuery, setSearchQuery] = useState('')
  const [category, setCategory] = useState<ExtCategory>('All')
  const [sortBy, setSortBy] = useState<SortOption>('installs')
  const [extensions, setExtensions] = useState<Extension[]>(EXTENSIONS)
  const [selectedExt, setSelectedExt] = useState<string | null>(null)
  const [installedCollapsed, setInstalledCollapsed] = useState(false)
  const [recommendedCollapsed, setRecommendedCollapsed] = useState(false)
  const [popularCollapsed, setPopularCollapsed] = useState(false)
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [showSortDropdown, setShowSortDropdown] = useState(false)

  const handleInstall = useCallback((id: string) => {
    setLoadingId(id)
    setTimeout(() => {
      setExtensions(prev => prev.map(e => e.id === id ? { ...e, installed: true, enabled: true } : e))
      setLoadingId(null)
    }, 1200)
  }, [])

  const handleUninstall = useCallback((id: string) => {
    setLoadingId(id)
    setTimeout(() => {
      setExtensions(prev => prev.map(e => e.id === id ? { ...e, installed: false, enabled: false } : e))
      setLoadingId(null)
    }, 800)
  }, [])

  const handleToggle = useCallback((id: string) => {
    setExtensions(prev => prev.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e))
  }, [])

  const sortFn = useCallback((a: Extension, b: Extension): number => {
    switch (sortBy) {
      case 'installs': return b.downloads - a.downloads
      case 'rating': return b.stars - a.stars
      case 'name': return a.name.localeCompare(b.name)
      case 'updated': return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
      default: return 0
    }
  }, [sortBy])

  const filtered = useMemo(() => {
    return extensions.filter(ext => {
      if (category !== 'All' && ext.category !== category) return false
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
    }).sort(sortFn)
  }, [extensions, category, searchQuery, sortFn])

  const installedExts = useMemo(() => filtered.filter(e => e.installed), [filtered])
  const availableExts = useMemo(() => filtered.filter(e => !e.installed), [filtered])

  const recommendedExts = useMemo(() =>
    extensions.filter(e => e.recommended && !e.installed).sort(sortFn).slice(0, 6),
    [extensions, sortFn]
  )
  const popularExts = useMemo(() =>
    extensions.filter(e => !e.installed).sort((a, b) => b.downloads - a.downloads).slice(0, 6),
    [extensions]
  )
  const workspaceExts = useMemo(() =>
    extensions.filter(e => e.workspaceRecommended && !e.installed).sort(sortFn),
    [extensions, sortFn]
  )

  const installedCount = extensions.filter(e => e.installed).length
  const showRecommendations = !searchQuery && category === 'All'

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
          loadingId={loadingId}
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
        <div style={{
          display: 'flex', alignItems: 'center',
          background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 4px)',
          overflow: 'hidden',
        }}>
          <Search size={12} style={{ marginLeft: 8, color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search extensions..."
            style={{ flex: 1, padding: '6px 10px', background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text-primary)' }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Category chips + Sort */}
      <div style={{ padding: '2px 12px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: category === cat ? 600 : 400,
                borderRadius: 10,
                border: category === cat ? '1px solid rgba(88,166,255,0.25)' : '1px solid transparent',
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
          <div style={{ marginLeft: 'auto', position: 'relative' }}>
            <button
              onClick={() => setShowSortDropdown(!showSortDropdown)}
              style={{
                padding: '3px 7px', fontSize: 10, borderRadius: 4,
                border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3,
              }}
              className="ext-sort-btn"
            >
              <Filter size={9} />
              {SORT_OPTIONS.find(s => s.value === sortBy)?.label}
              <ChevronDown size={9} />
            </button>
            {showSortDropdown && (
              <>
                <div
                  style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }}
                  onClick={() => setShowSortDropdown(false)}
                />
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 2,
                  background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 6,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 100, minWidth: 140, overflow: 'hidden',
                }}>
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortBy(opt.value); setShowSortDropdown(false) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        width: '100%', padding: '7px 12px', fontSize: 11, textAlign: 'left',
                        background: sortBy === opt.value ? 'rgba(88,166,255,0.1)' : 'transparent',
                        color: sortBy === opt.value ? '#58a6ff' : 'var(--text-secondary)',
                        border: 'none', cursor: 'pointer', fontWeight: sortBy === opt.value ? 600 : 400,
                      }}
                      className="ext-sort-option"
                    >
                      {sortBy === opt.value && <Check size={11} />}
                      <span style={{ marginLeft: sortBy === opt.value ? 0 : 17 }}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Extension list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Installed section */}
        {installedExts.length > 0 && (
          <>
            <SectionHeader
              label="Installed"
              count={installedExts.length}
              collapsed={installedCollapsed}
              onToggle={() => setInstalledCollapsed(!installedCollapsed)}
            />
            {!installedCollapsed && installedExts.map(ext => (
              <ExtensionCard
                key={ext.id}
                ext={ext}
                onClick={() => setSelectedExt(ext.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onToggle={handleToggle}
                showInstalledControls
                loadingId={loadingId}
              />
            ))}
          </>
        )}

        {/* Recommendations sections (only when browsing All with no search) */}
        {showRecommendations && (
          <>
            {/* Workspace Recommendations */}
            {workspaceExts.length > 0 && (
              <>
                <SectionHeader
                  icon={<Briefcase size={11} style={{ marginRight: 2 }} />}
                  label="Workspace Recommended"
                  count={workspaceExts.length}
                  collapsed={workspaceCollapsed}
                  onToggle={() => setWorkspaceCollapsed(!workspaceCollapsed)}
                  badge="workspace"
                />
                {!workspaceCollapsed && workspaceExts.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    onClick={() => setSelectedExt(ext.id)}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onToggle={handleToggle}
                    loadingId={loadingId}
                  />
                ))}
              </>
            )}

            {/* Recommended */}
            {recommendedExts.length > 0 && (
              <>
                <SectionHeader
                  icon={<Sparkles size={11} style={{ marginRight: 2 }} />}
                  label="Recommended"
                  count={recommendedExts.length}
                  collapsed={recommendedCollapsed}
                  onToggle={() => setRecommendedCollapsed(!recommendedCollapsed)}
                />
                {!recommendedCollapsed && recommendedExts.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    onClick={() => setSelectedExt(ext.id)}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onToggle={handleToggle}
                    loadingId={loadingId}
                  />
                ))}
              </>
            )}

            {/* Popular */}
            {popularExts.length > 0 && (
              <>
                <SectionHeader
                  icon={<TrendingUp size={11} style={{ marginRight: 2 }} />}
                  label="Popular"
                  count={popularExts.length}
                  collapsed={popularCollapsed}
                  onToggle={() => setPopularCollapsed(!popularCollapsed)}
                />
                {!popularCollapsed && popularExts.map(ext => (
                  <ExtensionCard
                    key={ext.id}
                    ext={ext}
                    onClick={() => setSelectedExt(ext.id)}
                    onInstall={handleInstall}
                    onUninstall={handleUninstall}
                    onToggle={handleToggle}
                    loadingId={loadingId}
                  />
                ))}
              </>
            )}
          </>
        )}

        {/* Marketplace / Available section (when searching or filtering) */}
        {!showRecommendations && availableExts.length > 0 && (
          <>
            <SectionHeader
              label="Marketplace"
              count={availableExts.length}
            />
            {availableExts.map(ext => (
              <ExtensionCard
                key={ext.id}
                ext={ext}
                onClick={() => setSelectedExt(ext.id)}
                onInstall={handleInstall}
                onUninstall={handleUninstall}
                onToggle={handleToggle}
                loadingId={loadingId}
              />
            ))}
          </>
        )}

        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            <Search size={24} style={{ opacity: 0.2, marginBottom: 10 }} />
            <div>No extensions found matching &quot;{searchQuery}&quot;</div>
            <button
              onClick={() => { setSearchQuery(''); setCategory('All') }}
              style={{
                marginTop: 10, padding: '5px 14px', fontSize: 11, borderRadius: 4,
                border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
                color: '#58a6ff',
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      <style>{`
        .ext-item:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); }
        .ext-cat-btn:hover { background: rgba(88,166,255,0.08) !important; }
        .ext-section-header:hover { background: rgba(255,255,255,0.02); }
        .ext-action-btn:hover { opacity: 1 !important; }
        .ext-sort-btn:hover { border-color: var(--text-muted) !important; color: var(--text-secondary) !important; }
        .ext-sort-option:hover { background: rgba(88,166,255,0.08) !important; }
        @keyframes ext-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .ext-spinner svg { animation: ext-spin 1s linear infinite; }
      `}</style>
    </div>
  )
}
