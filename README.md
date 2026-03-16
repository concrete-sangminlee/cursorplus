# Orion IDE

**The AI-Powered Code Editor for the Modern Developer**

<!-- Banner: The Orion IDE logo features the constellation Orion rendered inside a stylized "O" ring, with a gradient from purple to blue to green, set against a dark space-themed background. -->

Orion IDE is a professional desktop code editor built on Electron, combining the power of Monaco Editor with multi-model AI integration, multi-agent orchestration, and a polished developer experience. Think VS Code meets Cursor -- fully open-source and extensible.

---

## Screenshots

<!-- TODO: Add screenshots -->
<!--
![Editor View](docs/screenshots/editor.png)
![AI Chat](docs/screenshots/ai-chat.png)
![Terminal](docs/screenshots/terminal.png)
![Git Integration](docs/screenshots/git.png)
-->

*Screenshots coming soon. Run `npm run dev` to see Orion IDE in action.*

---

## Feature Highlights

### Editor

- **Monaco Editor** -- syntax highlighting, minimap, bracket colorization, sticky scroll, code folding
- **Multi-tab editing** with language auto-detection, pin/unpin, and split view
- **Breadcrumb navigation** with symbol dropdown picker
- **Inline AI editing** (Ctrl+K) with diff preview
- **Ghost text completions** powered by AI
- **Snippet engine** with tabstops, variables, and transforms
- **Hex editor**, **image editor**, **Markdown preview**, **JSON tree viewer**, **CSV table viewer**

### AI Integration

- **Six AI providers**: Claude (Anthropic), GPT-4o (OpenAI), Kimi (Moonshot), Gemini (Google), NVIDIA NIM, Ollama (local)
- **NVIDIA NIM models**: Llama 3.3, Nemotron, DeepSeek R1, Qwen 2.5
- **Ollama local models** -- no API key required
- **Agent/Chat dual mode** with streaming responses
- **Multi-agent orchestration** panel (Sisyphus, Hephaestus, Prometheus, Oracle)
- **AI Composer** for multi-file code generation
- **Customizable prompts** -- edit system and user prompt templates
- **Token counting** and cost estimation per conversation

### File Management

- **File Explorer** with context menu (new file, new folder, rename, delete)
- **Quick Open** (Ctrl+P) with fuzzy matching
- **Global search** with case-sensitive, whole-word, and regex support
- **File watcher** for external change detection
- **Recent files and projects** tracking
- **Drag-and-drop** file support

### Git Integration

- **Source Control panel** with staging, unstaging, and commit
- **Git blame** with per-line annotation
- **Git graph** visualization
- **Git stash** management
- **Git timeline** for file history
- **Merge conflict resolver** with 3-way merge view
- **Branch info** in status bar with changed file count and sync status

### Integrated Terminal

- **xterm.js + node-pty** powered terminal
- **Multiple sessions** with tab management
- **Terminal profiles** for custom shell configurations
- **Link detection** and click handling

### Developer Tools

- **Debug panel** with breakpoints, step controls, and debug console
- **Testing panel** with test explorer and code coverage visualization
- **Profiler panel** for performance analysis
- **Problems panel** with diagnostics aggregation
- **Output panel** with multiple channels
- **Database**, **API client**, **Docker**, and **CI/CD** panels
- **Notebook panel** for interactive computing

### Customization

- **Command Palette** (Ctrl+Shift+P) with fuzzy search
- **Theme editor** with live preview
- **Keybinding editor** with conflict detection
- **Extension system** with host API and built-in extensions
- **Settings sync** across devices
- **Layout persistence** across sessions

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+P` | Quick Open (file search) |
| `Ctrl+Shift+P` | Command Palette |
| `Ctrl+B` | Toggle Sidebar |
| `` Ctrl+` `` | Toggle Terminal |
| `Ctrl+J` | Toggle Bottom Panel |
| `Ctrl+L` | Focus Chat |
| `Ctrl+,` | Open Settings |
| `Ctrl+S` | Save File |
| `Ctrl+Shift+E` | Explorer |
| `Ctrl+Shift+F` | Search |
| `Ctrl+Shift+G` | Source Control |
| `Ctrl+K` | Inline AI Edit |

---

## Installation

### Download

Pre-built binaries for Windows, macOS, and Linux are available on the [Releases](https://github.com/concrete-sangminlee/orion/releases) page.

| Platform | Format |
|---|---|
| Windows | NSIS installer (.exe), Portable (.exe) |
| macOS | DMG (.dmg), ZIP (.zip) |
| Linux | AppImage, Debian (.deb), Snap (.snap) |

### Build from Source

```bash
git clone https://github.com/concrete-sangminlee/orion.git
cd orion
npm install
npm run package
```

Platform-specific builds:

```bash
npm run package:win      # Windows
npm run package:mac      # macOS
npm run package:linux    # Linux
npm run package:all      # All platforms
```

---

## Development Setup

### Prerequisites

- **Node.js** 18 or later (recommended: 22.x)
- **npm** 9 or later
- **C++ Build Tools** (required for `node-pty` native module):
  - **Windows**: `npm install -g windows-build-tools` (PowerShell 관리자 권한) 또는 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 설치
  - **macOS**: `xcode-select --install`
  - **Linux**: `sudo apt install build-essential python3`
- (Optional) [Ollama](https://ollama.com) for local AI models

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/concrete-sangminlee/orion.git
cd orion

# 2. Install dependencies
npm install

# 3. Start (Electron + Vite dev server with hot reload)
npm run dev
```

That's it! The app will open automatically.

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build locally |
| `npm test` | Run tests with Vitest |
| `npm run electron:dev` | Build and launch in Electron |
| `npm run icons` | Generate app icons from source PNG |
| `npm run package` | Build and package for current platform |
| `npm run package:all` | Build and package for all platforms |

### Setting Up Ollama (Optional)

```bash
# Install Ollama
winget install Ollama.Ollama   # Windows
brew install ollama             # macOS
curl -fsSL https://ollama.com/install.sh | sh  # Linux

# Pull a model
ollama pull llama3.2

# Ollama runs automatically on localhost:11434
```

### Generating App Icons

Place a 1024x1024 PNG source image at `public/icon.png`, then:

```bash
npm install -D electron-icon-builder
npm run icons
```

This generates `build/icon.ico` (Windows), `build/icon.icns` (macOS), and `build/icons/*.png` (Linux). See `build/ICON_README.txt` for manual methods using ImageMagick.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop framework | Electron 33 |
| UI framework | React 19 + TypeScript 5.7 |
| Code editor | Monaco Editor 0.52 |
| Terminal | xterm.js 5 + node-pty |
| State management | Zustand 5 (20+ stores) |
| Styling | TailwindCSS v4 |
| Build tooling | Vite 6 + vite-plugin-electron |
| AI clients | Anthropic SDK, OpenAI SDK |
| Agent orchestration | oh-my-openagent (OMO) |
| Icons | lucide-react |
| Testing | Vitest + Testing Library |
| Packaging | electron-builder 25 |

---

## AI Providers

| Provider | Models | API Key Required |
|---|---|---|
| Ollama | llama3.2, any local model | No |
| Anthropic | Claude Sonnet | Yes |
| OpenAI | GPT-4o | Yes |
| NVIDIA NIM | Llama 3.3, Nemotron, DeepSeek R1, Qwen 2.5 | Yes (free at [build.nvidia.com](https://build.nvidia.com)) |
| Moonshot | Kimi | Yes |
| Google | Gemini | Yes |

Configure API keys in **Settings** (Ctrl+,) under the AI section.

---

## Project Structure

```
orion-ide/
├── electron/                # Main process (Electron)
│   ├── main.ts              # Electron entry point
│   ├── preload.ts           # Context bridge (IPC)
│   ├── ipc/                 # IPC handlers (filesystem, terminal, git, settings)
│   ├── omo-bridge/          # AI client & multi-agent orchestration
│   ├── filesystem/          # File operations & watcher
│   └── terminal/            # Terminal session manager
├── src/                     # Renderer process (React)
│   ├── components/          # UI components (TitleBar, ActivityBar, TabBar, ...)
│   ├── panels/              # Main panels (Editor, Chat, FileExplorer, ...)
│   ├── store/               # Zustand stores (editor, chat, files, agents, ...)
│   ├── hooks/               # Custom hooks (useIpc, useOmo, useKeyboard, ...)
│   ├── utils/               # Utilities (search, git, LSP, formatting, ...)
│   ├── providers/           # Monaco providers (code actions, language, AI)
│   ├── extensions/          # Extension system & built-in extensions
│   ├── themes/              # Theme definitions
│   ├── i18n/                # Internationalization
│   └── globals.css          # Global theme & styles
├── shared/                  # Shared types & constants
├── public/                  # Static assets (icon.svg)
├── build/                   # Packaging resources (icons, entitlements)
├── electron-builder.yml     # Electron Builder configuration
├── vite.config.ts           # Vite configuration
├── tsconfig.json            # TypeScript configuration
└── package.json
```

---

## Contributing

Contributions are welcome! Here is how to get started:

1. **Fork** the repository
2. **Create a branch** for your feature or fix: `git checkout -b feat/my-feature`
3. **Make your changes** and ensure tests pass: `npm test`
4. **Commit** with a descriptive message following [Conventional Commits](https://www.conventionalcommits.org/)
5. **Push** to your fork and open a **Pull Request**

### Guidelines

- Follow the existing code style (see `.prettierrc` for formatting rules)
- Write tests for new features where applicable
- Keep pull requests focused on a single change
- Update documentation if your change affects user-facing behavior

### Reporting Issues

Use [GitHub Issues](https://github.com/concrete-sangminlee/orion/issues) to report bugs or request features. Please include:

- Steps to reproduce the issue
- Expected vs actual behavior
- OS, Node.js version, and Orion IDE version

---

## License

This project is licensed under the [MIT License](LICENSE).

---

*Built with Orion IDE by the Orion Team*
