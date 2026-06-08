<h1 align="center">
  <br>
  <img src="https://raw.githubusercontent.com/concrete-sangminlee/orion/main/public/icon.svg" width="120" alt="Orion">
  <br>
  Orion
  <br>
</h1>

<h3 align="center">AI-powered coding assistant and desktop IDE</h3>

<p align="center">
  <a href="#quick-start"><strong>Quick Start</strong></a> |
  <a href="#cli-commands"><strong>CLI Commands</strong></a> |
  <a href="#desktop-ide"><strong>Desktop IDE</strong></a> |
  <a href="#development"><strong>Development</strong></a> |
  <a href="#contributing"><strong>Contributing</strong></a>
</p>

<p align="center">
  <a href="https://github.com/concrete-sangminlee/orion/actions"><img src="https://img.shields.io/github/actions/workflow/status/concrete-sangminlee/orion/ci.yml?style=flat-square&label=CI" alt="CI"></a>
  <img src="https://img.shields.io/github/license/concrete-sangminlee/orion?style=flat-square&color=22C55E" alt="License">
  <img src="https://img.shields.io/badge/version-2.2.0-7C5CFC?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/commands-60%2B-38BDF8?style=flat-square" alt="Commands">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-F59E0B?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/AI-Claude%20%7C%20GPT%20%7C%20Ollama-9B59B6?style=flat-square" alt="AI">
</p>

---

## What is Orion?

Orion is an open-source coding tool with two working surfaces:

**CLI:** A terminal assistant for asking questions, reviewing diffs, fixing files, generating tests, searching codebases, and automating common development tasks.

**Desktop IDE:** An Electron app with Monaco Editor, an integrated terminal, source control panels, workspace tooling, themes, and AI-assisted coding workflows.

```bash
+----------------------------------+
| ORION                            |
| AI-powered coding assistant      |
| v2.2.0 - Windows/macOS/Linux     |
+----------------------------------+

orion ask "How do I optimize this React component?" @src/App.tsx
orion fix src/auth.ts --auto

git diff | orion review
orion chat
```

---

## Why Orion?

| Capability | Orion | Claude Code | Codex CLI | Aider |
|---|---:|---:|---:|---:|
| Cross-platform desktop app | Yes | No | No | No |
| Terminal-first AI workflow | Yes | Yes | Yes | Yes |
| Local model support | Ollama | No | No | Yes |
| Provider switching | Claude, GPT, Ollama | Limited | Limited | Yes |
| AI review/fix/test commands | Yes | Manual | Manual | Yes |
| File operations in chat | Yes | Yes | Yes | Limited |
| Custom project commands | Yes | Yes | Yes | No |
| Integrated editor and terminal | Yes | No | No | No |
| Open source | Yes | No | No | Yes |

---

## Install

```bash
npm install -g orion-ide
orion tutorial
```

### Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 22.12+ | Required for CLI and builds |
| Native build tools | Windows Build Tools, Xcode Command Line Tools, or Linux build-essential |
| Ollama | Optional local model runtime |
| API keys | Optional for Anthropic and OpenAI providers |

---

## Quick Start

```bash
git clone https://github.com/concrete-sangminlee/orion.git
cd orion
npm install
npm run cli:build
npm install -g .

orion status
orion chat
orion ask "What does this file do?" @src/App.tsx
```

To launch the desktop app during development:

```bash
npm run dev
```

To package the desktop app:

```bash
npm run package
```

---

## CLI Commands

Orion includes 60+ commands grouped by workflow.

```text
Core:       chat, ask, explain, review, fix, edit, commit
Code:       search, diff, pr, run, test, agent, refactor, compare
Generate:   plan, generate, docs, snippet, scaffold
Tools:      shell, todo, fetch, changelog, log, summarize, migrate, deps, format, translate, env
Analysis:   debug, benchmark, security, typecheck, optimize
AI:         learn, pair, context
Safety:     undo, status, doctor, clean
Session:    session, watch, config, init, gui, completions
Git:        hooks, alias, blame
Extend:     plugin, api, regex, cron
Data:       csv, http, diff-files, stats
Insights:   map, cost
Meta:       history, config-export
Help:       tutorial, examples, update, info
```

### Common examples

```bash
orion ask "question" @file1 @file2
orion explain src/app.ts
orion review src/app.ts
orion fix src/app.ts --auto
orion search "authentication"
orion diff --staged
orion test --generate src/auth.ts
orion deps --security
orion todo --fix
orion shell
```

### Pipe support

```bash
cat error.log | orion ask "What is wrong?"
git diff | orion review
cat app.ts | orion explain
```

### Chat tools

Inside `orion chat`:

```text
/read src/app.ts
/write output.ts
/run npm test
/ls
/cat src/app.ts
/cd src
/fetch https://docs.example.com
/claude
/gpt
/ollama
/models
```

---

## Desktop IDE

The desktop app provides:

| Area | Features |
|---|---|
| Editor | Monaco Editor, tabs, minimap, inline AI actions, diff views |
| Workspace | Explorer, quick open, breadcrumbs, search, outline, problems |
| Terminal | Integrated terminal sessions, profiles, links, task runner |
| Source control | Git panels, blame, stash, timeline, merge conflict tools |
| AI | Chat, multi-provider bridge, code actions, context-aware prompts |
| Extensions | Built-in extension API and TODO highlighter |
| UI | Themes, command palette, status bar, settings, notifications |

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick Open |
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+K` | Inline AI Edit |
| `Ctrl+L` | Focus AI Chat |
| `Ctrl+B` | Toggle Sidebar |
| `` Ctrl+` `` | Toggle Terminal |

---

## AI Providers

| Provider | Models | Setup |
|---|---|---|
| Ollama | Local models such as llama3.2, mistral, qwen, deepseek-r1 | Install Ollama and pull a model |
| Anthropic | Claude models | Configure an Anthropic API key |
| OpenAI | GPT and reasoning models | Configure an OpenAI API key |

Run configuration interactively:

```bash
orion config
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| CLI | Node.js, Commander, Chalk, Ora, Marked |
| Desktop | Electron, React, TypeScript |
| Editor | Monaco Editor |
| Terminal | xterm.js, node-pty |
| State | Zustand |
| Styling | Tailwind CSS |
| Build | Vite, esbuild, electron-builder |
| AI | Anthropic SDK, OpenAI SDK, Ollama API |

---

## Project Structure

```text
orion/
|-- cli/                    # CLI entrypoint and command implementations
|   |-- commands/            # Individual CLI commands
|   |-- __tests__/           # CLI tests
|   |-- ai-client.ts         # Multi-provider AI client
|   |-- index.ts             # CLI registration
|   `-- ui.ts                # Terminal UI helpers
|-- electron/                # Electron main process, preload, IPC, terminal bridge
|   |-- ipc/                 # IPC handlers and guards
|   |-- omo-bridge/          # AI bridge for desktop workflows
|   |-- terminal/            # Terminal session manager
|   `-- workspace/           # Workspace helpers
|-- src/                     # React renderer
|   |-- components/          # UI components
|   |-- panels/              # IDE panels
|   |-- store/               # Zustand stores
|   |-- themes/              # Theme definitions
|   `-- utils/               # Renderer utilities
|-- shared/                  # Shared IPC, safety, and type definitions
|-- public/                  # Static assets
|-- docs/                    # Project documentation
|-- package.json
|-- vite.config.ts
`-- electron-builder.yml
```

---

## Development

```bash
npm install
npm run dev
npm run typecheck
npm run test
npm run build
npm run cli:build
```

Packaging shortcuts:

```bash
npm run package:win
npm run package:mac
npm run package:linux
npm run package:all
```

---

## Contributing

1. Fork the repository.
2. Create a focused branch.
3. Make the smallest coherent change.
4. Run the relevant checks.
5. Open a pull request with a clear description.

Useful contribution areas:

| Area | Examples |
|---|---|
| Bugs | Reproduction cases, regression fixes, edge-case tests |
| CLI | New commands, better command output, improved safety flags |
| Desktop | Panel behavior, editor features, terminal reliability |
| AI | Prompt quality, provider support, context handling |
| Docs | Tutorials, examples, architecture notes |
| Tests | Unit tests, integration coverage, fixtures |

---

## Roadmap

- MCP support
- Workspace checkpoints
- Sandboxed execution environment
- Web search grounding
- Voice-to-code input
- Session sharing
- VS Code extension marketplace compatibility
- Plugin system for custom commands

---

## License

[MIT](LICENSE) - free to use, modify, and distribute.
