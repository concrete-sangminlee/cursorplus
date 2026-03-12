/**
 * File icon resolution system.
 * Maps file names, extensions, and folder names to
 * icon identifiers and colors — similar to vscode-icons
 * or Material Icon Theme.
 */

/* ── Types ─────────────────────────────────────────────── */

export interface FileIconInfo {
  icon: string        // SVG path or icon identifier
  color: string       // Icon color
  fontCharacter?: string // For icon fonts
  label: string       // Accessible label
}

export interface FolderIconInfo {
  icon: string
  iconOpen: string
  color: string
  label: string
}

/* ── Extension → Icon mapping ────────────────────────── */

interface IconDef {
  icon: string
  color: string
  label: string
}

const EXTENSION_ICONS: Record<string, IconDef> = {
  // TypeScript / JavaScript
  ts: { icon: 'typescript', color: '#3178c6', label: 'TypeScript' },
  tsx: { icon: 'react_ts', color: '#3178c6', label: 'TypeScript React' },
  js: { icon: 'javascript', color: '#f7df1e', label: 'JavaScript' },
  jsx: { icon: 'react', color: '#61dafb', label: 'React JSX' },
  mjs: { icon: 'javascript', color: '#f7df1e', label: 'ES Module' },
  cjs: { icon: 'javascript', color: '#f7df1e', label: 'CommonJS' },
  mts: { icon: 'typescript', color: '#3178c6', label: 'TypeScript ES Module' },
  cts: { icon: 'typescript', color: '#3178c6', label: 'TypeScript CommonJS' },
  'd.ts': { icon: 'typescript_def', color: '#3178c6', label: 'TypeScript Declaration' },

  // Web
  html: { icon: 'html', color: '#e34c26', label: 'HTML' },
  htm: { icon: 'html', color: '#e34c26', label: 'HTML' },
  css: { icon: 'css', color: '#1572b6', label: 'CSS' },
  scss: { icon: 'sass', color: '#cd6799', label: 'SCSS' },
  sass: { icon: 'sass', color: '#cd6799', label: 'Sass' },
  less: { icon: 'less', color: '#1d365d', label: 'Less' },
  styl: { icon: 'stylus', color: '#ff6347', label: 'Stylus' },
  svg: { icon: 'svg', color: '#ffb13b', label: 'SVG' },
  vue: { icon: 'vue', color: '#41b883', label: 'Vue' },
  svelte: { icon: 'svelte', color: '#ff3e00', label: 'Svelte' },
  astro: { icon: 'astro', color: '#ff5d01', label: 'Astro' },
  wasm: { icon: 'wasm', color: '#654ff0', label: 'WebAssembly' },

  // Data / Config
  json: { icon: 'json', color: '#cbcb41', label: 'JSON' },
  jsonc: { icon: 'json', color: '#cbcb41', label: 'JSON with Comments' },
  json5: { icon: 'json', color: '#cbcb41', label: 'JSON5' },
  yaml: { icon: 'yaml', color: '#cb171e', label: 'YAML' },
  yml: { icon: 'yaml', color: '#cb171e', label: 'YAML' },
  toml: { icon: 'toml', color: '#9c4121', label: 'TOML' },
  xml: { icon: 'xml', color: '#e37933', label: 'XML' },
  csv: { icon: 'csv', color: '#237346', label: 'CSV' },
  tsv: { icon: 'csv', color: '#237346', label: 'TSV' },
  ini: { icon: 'settings', color: '#6d8086', label: 'INI' },
  env: { icon: 'env', color: '#ecd53f', label: 'Environment' },
  properties: { icon: 'settings', color: '#6d8086', label: 'Properties' },
  graphql: { icon: 'graphql', color: '#e535ab', label: 'GraphQL' },
  gql: { icon: 'graphql', color: '#e535ab', label: 'GraphQL' },
  prisma: { icon: 'prisma', color: '#2d3748', label: 'Prisma' },
  proto: { icon: 'proto', color: '#4285f4', label: 'Protocol Buffers' },

  // Systems languages
  rs: { icon: 'rust', color: '#dea584', label: 'Rust' },
  go: { icon: 'go', color: '#00add8', label: 'Go' },
  c: { icon: 'c', color: '#555555', label: 'C' },
  h: { icon: 'c', color: '#555555', label: 'C Header' },
  cpp: { icon: 'cpp', color: '#004482', label: 'C++' },
  cxx: { icon: 'cpp', color: '#004482', label: 'C++' },
  cc: { icon: 'cpp', color: '#004482', label: 'C++' },
  hpp: { icon: 'cpp', color: '#004482', label: 'C++ Header' },
  hxx: { icon: 'cpp', color: '#004482', label: 'C++ Header' },
  cs: { icon: 'csharp', color: '#178600', label: 'C#' },
  java: { icon: 'java', color: '#b07219', label: 'Java' },
  kt: { icon: 'kotlin', color: '#7f52ff', label: 'Kotlin' },
  kts: { icon: 'kotlin', color: '#7f52ff', label: 'Kotlin Script' },
  swift: { icon: 'swift', color: '#f05138', label: 'Swift' },
  zig: { icon: 'zig', color: '#f7a41d', label: 'Zig' },
  nim: { icon: 'nim', color: '#ffe953', label: 'Nim' },
  v: { icon: 'vlang', color: '#5d87bf', label: 'V' },
  d: { icon: 'dlang', color: '#b03931', label: 'D' },

  // Scripting
  py: { icon: 'python', color: '#3572a5', label: 'Python' },
  pyi: { icon: 'python', color: '#3572a5', label: 'Python Stub' },
  pyw: { icon: 'python', color: '#3572a5', label: 'Python Windows' },
  rb: { icon: 'ruby', color: '#cc342d', label: 'Ruby' },
  php: { icon: 'php', color: '#777bb3', label: 'PHP' },
  lua: { icon: 'lua', color: '#000080', label: 'Lua' },
  pl: { icon: 'perl', color: '#0298c3', label: 'Perl' },
  r: { icon: 'r', color: '#276dc3', label: 'R' },
  R: { icon: 'r', color: '#276dc3', label: 'R' },
  jl: { icon: 'julia', color: '#9558b2', label: 'Julia' },
  ex: { icon: 'elixir', color: '#6e4a7e', label: 'Elixir' },
  exs: { icon: 'elixir', color: '#6e4a7e', label: 'Elixir Script' },
  erl: { icon: 'erlang', color: '#a90533', label: 'Erlang' },
  clj: { icon: 'clojure', color: '#5881d8', label: 'Clojure' },
  scala: { icon: 'scala', color: '#dc322f', label: 'Scala' },
  hs: { icon: 'haskell', color: '#5e5086', label: 'Haskell' },
  ml: { icon: 'ocaml', color: '#ec6813', label: 'OCaml' },
  fs: { icon: 'fsharp', color: '#b845fc', label: 'F#' },
  dart: { icon: 'dart', color: '#00b4ab', label: 'Dart' },

  // Shell
  sh: { icon: 'shell', color: '#89e051', label: 'Shell' },
  bash: { icon: 'shell', color: '#89e051', label: 'Bash' },
  zsh: { icon: 'shell', color: '#89e051', label: 'Zsh' },
  fish: { icon: 'shell', color: '#89e051', label: 'Fish' },
  ps1: { icon: 'powershell', color: '#012456', label: 'PowerShell' },
  psm1: { icon: 'powershell', color: '#012456', label: 'PowerShell Module' },
  bat: { icon: 'bat', color: '#c1f12e', label: 'Batch' },
  cmd: { icon: 'bat', color: '#c1f12e', label: 'Batch' },

  // Documents
  md: { icon: 'markdown', color: '#083fa1', label: 'Markdown' },
  mdx: { icon: 'mdx', color: '#fcb32c', label: 'MDX' },
  txt: { icon: 'document', color: '#6d8086', label: 'Text' },
  pdf: { icon: 'pdf', color: '#ff0000', label: 'PDF' },
  doc: { icon: 'word', color: '#2b579a', label: 'Word Document' },
  docx: { icon: 'word', color: '#2b579a', label: 'Word Document' },
  xls: { icon: 'excel', color: '#217346', label: 'Excel' },
  xlsx: { icon: 'excel', color: '#217346', label: 'Excel' },
  ppt: { icon: 'powerpoint', color: '#d24726', label: 'PowerPoint' },
  pptx: { icon: 'powerpoint', color: '#d24726', label: 'PowerPoint' },
  rst: { icon: 'document', color: '#6d8086', label: 'reStructuredText' },
  tex: { icon: 'tex', color: '#3d6117', label: 'LaTeX' },
  latex: { icon: 'tex', color: '#3d6117', label: 'LaTeX' },

  // Images
  png: { icon: 'image', color: '#a074c4', label: 'PNG Image' },
  jpg: { icon: 'image', color: '#a074c4', label: 'JPEG Image' },
  jpeg: { icon: 'image', color: '#a074c4', label: 'JPEG Image' },
  gif: { icon: 'image', color: '#a074c4', label: 'GIF Image' },
  webp: { icon: 'image', color: '#a074c4', label: 'WebP Image' },
  ico: { icon: 'image', color: '#a074c4', label: 'Icon' },
  bmp: { icon: 'image', color: '#a074c4', label: 'Bitmap' },
  tiff: { icon: 'image', color: '#a074c4', label: 'TIFF Image' },
  avif: { icon: 'image', color: '#a074c4', label: 'AVIF Image' },

  // Audio / Video
  mp3: { icon: 'audio', color: '#e06c75', label: 'MP3 Audio' },
  wav: { icon: 'audio', color: '#e06c75', label: 'WAV Audio' },
  ogg: { icon: 'audio', color: '#e06c75', label: 'OGG Audio' },
  flac: { icon: 'audio', color: '#e06c75', label: 'FLAC Audio' },
  mp4: { icon: 'video', color: '#fd971f', label: 'MP4 Video' },
  avi: { icon: 'video', color: '#fd971f', label: 'AVI Video' },
  mkv: { icon: 'video', color: '#fd971f', label: 'MKV Video' },
  webm: { icon: 'video', color: '#fd971f', label: 'WebM Video' },

  // Fonts
  ttf: { icon: 'font', color: '#f44336', label: 'TrueType Font' },
  otf: { icon: 'font', color: '#f44336', label: 'OpenType Font' },
  woff: { icon: 'font', color: '#f44336', label: 'WOFF Font' },
  woff2: { icon: 'font', color: '#f44336', label: 'WOFF2 Font' },
  eot: { icon: 'font', color: '#f44336', label: 'EOT Font' },

  // Archives
  zip: { icon: 'archive', color: '#afb42b', label: 'ZIP Archive' },
  tar: { icon: 'archive', color: '#afb42b', label: 'TAR Archive' },
  gz: { icon: 'archive', color: '#afb42b', label: 'GZip Archive' },
  bz2: { icon: 'archive', color: '#afb42b', label: 'BZ2 Archive' },
  xz: { icon: 'archive', color: '#afb42b', label: 'XZ Archive' },
  '7z': { icon: 'archive', color: '#afb42b', label: '7-Zip Archive' },
  rar: { icon: 'archive', color: '#afb42b', label: 'RAR Archive' },

  // Database
  sql: { icon: 'database', color: '#e38c00', label: 'SQL' },
  sqlite: { icon: 'database', color: '#0f80cc', label: 'SQLite' },
  db: { icon: 'database', color: '#e38c00', label: 'Database' },

  // CI/CD & DevOps
  tf: { icon: 'terraform', color: '#5c4ee5', label: 'Terraform' },
  hcl: { icon: 'terraform', color: '#5c4ee5', label: 'HCL' },

  // Testing
  spec: { icon: 'test', color: '#22da6e', label: 'Test Spec' },
  test: { icon: 'test', color: '#22da6e', label: 'Test' },

  // Lock files
  lock: { icon: 'lock', color: '#6d8086', label: 'Lock File' },

  // Binaries
  exe: { icon: 'binary', color: '#6d8086', label: 'Executable' },
  dll: { icon: 'binary', color: '#6d8086', label: 'Library' },
  so: { icon: 'binary', color: '#6d8086', label: 'Shared Library' },
  dylib: { icon: 'binary', color: '#6d8086', label: 'Dynamic Library' },
  o: { icon: 'binary', color: '#6d8086', label: 'Object File' },
  a: { icon: 'binary', color: '#6d8086', label: 'Static Library' },
}

/* ── Filename → Icon mapping ─────────────────────────── */

const FILENAME_ICONS: Record<string, IconDef> = {
  // Package managers
  'package.json': { icon: 'npm', color: '#cb3837', label: 'npm Package' },
  'package-lock.json': { icon: 'npm', color: '#cb3837', label: 'npm Lock' },
  'yarn.lock': { icon: 'yarn', color: '#2c8ebb', label: 'Yarn Lock' },
  'pnpm-lock.yaml': { icon: 'pnpm', color: '#f69220', label: 'pnpm Lock' },
  'bun.lockb': { icon: 'bun', color: '#fbf0df', label: 'Bun Lock' },
  'deno.json': { icon: 'deno', color: '#000000', label: 'Deno Config' },
  'deno.jsonc': { icon: 'deno', color: '#000000', label: 'Deno Config' },

  // Config files
  'tsconfig.json': { icon: 'tsconfig', color: '#3178c6', label: 'TypeScript Config' },
  'tsconfig.build.json': { icon: 'tsconfig', color: '#3178c6', label: 'TypeScript Build Config' },
  'jsconfig.json': { icon: 'jsconfig', color: '#f7df1e', label: 'JavaScript Config' },
  '.eslintrc': { icon: 'eslint', color: '#4b32c3', label: 'ESLint Config' },
  '.eslintrc.js': { icon: 'eslint', color: '#4b32c3', label: 'ESLint Config' },
  '.eslintrc.json': { icon: 'eslint', color: '#4b32c3', label: 'ESLint Config' },
  '.eslintrc.cjs': { icon: 'eslint', color: '#4b32c3', label: 'ESLint Config' },
  'eslint.config.js': { icon: 'eslint', color: '#4b32c3', label: 'ESLint Config' },
  'eslint.config.mjs': { icon: 'eslint', color: '#4b32c3', label: 'ESLint Config' },
  'eslint.config.ts': { icon: 'eslint', color: '#4b32c3', label: 'ESLint Config' },
  '.prettierrc': { icon: 'prettier', color: '#56b3b4', label: 'Prettier Config' },
  '.prettierrc.js': { icon: 'prettier', color: '#56b3b4', label: 'Prettier Config' },
  '.prettierrc.json': { icon: 'prettier', color: '#56b3b4', label: 'Prettier Config' },
  'prettier.config.js': { icon: 'prettier', color: '#56b3b4', label: 'Prettier Config' },
  '.editorconfig': { icon: 'editorconfig', color: '#e0efef', label: 'EditorConfig' },
  'vite.config.ts': { icon: 'vite', color: '#646cff', label: 'Vite Config' },
  'vite.config.js': { icon: 'vite', color: '#646cff', label: 'Vite Config' },
  'webpack.config.js': { icon: 'webpack', color: '#8dd6f9', label: 'Webpack Config' },
  'webpack.config.ts': { icon: 'webpack', color: '#8dd6f9', label: 'Webpack Config' },
  'rollup.config.js': { icon: 'rollup', color: '#ff3333', label: 'Rollup Config' },
  'rollup.config.ts': { icon: 'rollup', color: '#ff3333', label: 'Rollup Config' },
  'tailwind.config.js': { icon: 'tailwindcss', color: '#38bdf8', label: 'Tailwind Config' },
  'tailwind.config.ts': { icon: 'tailwindcss', color: '#38bdf8', label: 'Tailwind Config' },
  'postcss.config.js': { icon: 'postcss', color: '#dd3a0a', label: 'PostCSS Config' },
  'babel.config.js': { icon: 'babel', color: '#f5da55', label: 'Babel Config' },
  '.babelrc': { icon: 'babel', color: '#f5da55', label: 'Babel Config' },
  'jest.config.js': { icon: 'jest', color: '#99425b', label: 'Jest Config' },
  'jest.config.ts': { icon: 'jest', color: '#99425b', label: 'Jest Config' },
  'vitest.config.ts': { icon: 'vitest', color: '#729b1b', label: 'Vitest Config' },
  'vitest.config.js': { icon: 'vitest', color: '#729b1b', label: 'Vitest Config' },
  'playwright.config.ts': { icon: 'playwright', color: '#2ead33', label: 'Playwright Config' },
  'cypress.config.js': { icon: 'cypress', color: '#3c3c3c', label: 'Cypress Config' },
  'cypress.config.ts': { icon: 'cypress', color: '#3c3c3c', label: 'Cypress Config' },
  'next.config.js': { icon: 'next', color: '#000000', label: 'Next.js Config' },
  'next.config.mjs': { icon: 'next', color: '#000000', label: 'Next.js Config' },
  'next.config.ts': { icon: 'next', color: '#000000', label: 'Next.js Config' },
  'nuxt.config.ts': { icon: 'nuxt', color: '#00dc82', label: 'Nuxt Config' },
  'svelte.config.js': { icon: 'svelte', color: '#ff3e00', label: 'Svelte Config' },
  'astro.config.mjs': { icon: 'astro', color: '#ff5d01', label: 'Astro Config' },
  'angular.json': { icon: 'angular', color: '#dd0031', label: 'Angular Config' },

  // Git
  '.gitignore': { icon: 'git', color: '#f14e32', label: 'Git Ignore' },
  '.gitattributes': { icon: 'git', color: '#f14e32', label: 'Git Attributes' },
  '.gitmodules': { icon: 'git', color: '#f14e32', label: 'Git Submodules' },

  // Docker
  'Dockerfile': { icon: 'docker', color: '#2496ed', label: 'Dockerfile' },
  'docker-compose.yml': { icon: 'docker', color: '#2496ed', label: 'Docker Compose' },
  'docker-compose.yaml': { icon: 'docker', color: '#2496ed', label: 'Docker Compose' },
  '.dockerignore': { icon: 'docker', color: '#2496ed', label: 'Docker Ignore' },

  // CI/CD
  '.github': { icon: 'github', color: '#333', label: 'GitHub' },
  '.gitlab-ci.yml': { icon: 'gitlab', color: '#fc6d26', label: 'GitLab CI' },
  'Jenkinsfile': { icon: 'jenkins', color: '#d33833', label: 'Jenkinsfile' },
  '.travis.yml': { icon: 'travis', color: '#3eaaaf', label: 'Travis CI' },
  '.circleci': { icon: 'circleci', color: '#343434', label: 'CircleCI' },

  // Build tools
  'Makefile': { icon: 'makefile', color: '#6d8086', label: 'Makefile' },
  'CMakeLists.txt': { icon: 'cmake', color: '#064f8c', label: 'CMake' },
  'Cargo.toml': { icon: 'rust', color: '#dea584', label: 'Cargo Config' },
  'Cargo.lock': { icon: 'rust', color: '#dea584', label: 'Cargo Lock' },
  'go.mod': { icon: 'go', color: '#00add8', label: 'Go Module' },
  'go.sum': { icon: 'go', color: '#00add8', label: 'Go Checksum' },
  'Gemfile': { icon: 'ruby', color: '#cc342d', label: 'Gemfile' },
  'Gemfile.lock': { icon: 'ruby', color: '#cc342d', label: 'Gemfile Lock' },
  'requirements.txt': { icon: 'python', color: '#3572a5', label: 'Python Requirements' },
  'pyproject.toml': { icon: 'python', color: '#3572a5', label: 'Python Project' },
  'setup.py': { icon: 'python', color: '#3572a5', label: 'Python Setup' },
  'Pipfile': { icon: 'python', color: '#3572a5', label: 'Pipfile' },
  'Pipfile.lock': { icon: 'python', color: '#3572a5', label: 'Pipfile Lock' },
  'poetry.lock': { icon: 'python', color: '#3572a5', label: 'Poetry Lock' },
  'build.gradle': { icon: 'gradle', color: '#02303a', label: 'Gradle Build' },
  'build.gradle.kts': { icon: 'gradle', color: '#02303a', label: 'Gradle Build (Kotlin)' },
  'settings.gradle': { icon: 'gradle', color: '#02303a', label: 'Gradle Settings' },
  'pom.xml': { icon: 'maven', color: '#c71a36', label: 'Maven POM' },

  // Documentation
  'README.md': { icon: 'readme', color: '#083fa1', label: 'README' },
  'README': { icon: 'readme', color: '#083fa1', label: 'README' },
  'CHANGELOG.md': { icon: 'changelog', color: '#083fa1', label: 'Changelog' },
  'LICENSE': { icon: 'license', color: '#d4aa00', label: 'License' },
  'LICENSE.md': { icon: 'license', color: '#d4aa00', label: 'License' },
  'CONTRIBUTING.md': { icon: 'document', color: '#083fa1', label: 'Contributing' },
  'CODE_OF_CONDUCT.md': { icon: 'document', color: '#083fa1', label: 'Code of Conduct' },

  // Environment
  '.env': { icon: 'env', color: '#ecd53f', label: 'Environment' },
  '.env.local': { icon: 'env', color: '#ecd53f', label: 'Local Environment' },
  '.env.development': { icon: 'env', color: '#ecd53f', label: 'Dev Environment' },
  '.env.production': { icon: 'env', color: '#ecd53f', label: 'Prod Environment' },
  '.env.test': { icon: 'env', color: '#ecd53f', label: 'Test Environment' },
  '.env.example': { icon: 'env', color: '#ecd53f', label: 'Environment Example' },

  // IDE
  '.vscode': { icon: 'vscode', color: '#007acc', label: 'VS Code' },
  'CLAUDE.md': { icon: 'ai', color: '#d97706', label: 'Claude Config' },
}

/* ── Folder → Icon mapping ───────────────────────────── */

interface FolderDef {
  icon: string
  iconOpen: string
  color: string
  label: string
}

const FOLDER_ICONS: Record<string, FolderDef> = {
  src: { icon: 'folder-src', iconOpen: 'folder-src-open', color: '#42a5f5', label: 'Source' },
  source: { icon: 'folder-src', iconOpen: 'folder-src-open', color: '#42a5f5', label: 'Source' },
  lib: { icon: 'folder-lib', iconOpen: 'folder-lib-open', color: '#42a5f5', label: 'Library' },
  dist: { icon: 'folder-dist', iconOpen: 'folder-dist-open', color: '#ef6c00', label: 'Distribution' },
  build: { icon: 'folder-dist', iconOpen: 'folder-dist-open', color: '#ef6c00', label: 'Build' },
  out: { icon: 'folder-dist', iconOpen: 'folder-dist-open', color: '#ef6c00', label: 'Output' },
  bin: { icon: 'folder-bin', iconOpen: 'folder-bin-open', color: '#ef6c00', label: 'Binaries' },
  test: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Tests' },
  tests: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Tests' },
  __tests__: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Tests' },
  spec: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Specs' },
  specs: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Specs' },
  e2e: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'E2E Tests' },
  cypress: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Cypress' },
  node_modules: { icon: 'folder-node', iconOpen: 'folder-node-open', color: '#8bc34a', label: 'Node Modules' },
  '.git': { icon: 'folder-git', iconOpen: 'folder-git-open', color: '#f14e32', label: 'Git' },
  '.github': { icon: 'folder-github', iconOpen: 'folder-github-open', color: '#333', label: 'GitHub' },
  '.vscode': { icon: 'folder-vscode', iconOpen: 'folder-vscode-open', color: '#007acc', label: 'VS Code' },
  '.idea': { icon: 'folder-idea', iconOpen: 'folder-idea-open', color: '#000', label: 'IntelliJ' },
  config: { icon: 'folder-config', iconOpen: 'folder-config-open', color: '#ffab40', label: 'Config' },
  configs: { icon: 'folder-config', iconOpen: 'folder-config-open', color: '#ffab40', label: 'Configs' },
  public: { icon: 'folder-public', iconOpen: 'folder-public-open', color: '#42a5f5', label: 'Public' },
  static: { icon: 'folder-public', iconOpen: 'folder-public-open', color: '#42a5f5', label: 'Static' },
  assets: { icon: 'folder-images', iconOpen: 'folder-images-open', color: '#ab47bc', label: 'Assets' },
  images: { icon: 'folder-images', iconOpen: 'folder-images-open', color: '#ab47bc', label: 'Images' },
  img: { icon: 'folder-images', iconOpen: 'folder-images-open', color: '#ab47bc', label: 'Images' },
  icons: { icon: 'folder-images', iconOpen: 'folder-images-open', color: '#ab47bc', label: 'Icons' },
  fonts: { icon: 'folder-font', iconOpen: 'folder-font-open', color: '#f44336', label: 'Fonts' },
  styles: { icon: 'folder-css', iconOpen: 'folder-css-open', color: '#42a5f5', label: 'Styles' },
  css: { icon: 'folder-css', iconOpen: 'folder-css-open', color: '#42a5f5', label: 'CSS' },
  components: { icon: 'folder-components', iconOpen: 'folder-components-open', color: '#42a5f5', label: 'Components' },
  pages: { icon: 'folder-views', iconOpen: 'folder-views-open', color: '#42a5f5', label: 'Pages' },
  views: { icon: 'folder-views', iconOpen: 'folder-views-open', color: '#42a5f5', label: 'Views' },
  layouts: { icon: 'folder-layout', iconOpen: 'folder-layout-open', color: '#42a5f5', label: 'Layouts' },
  hooks: { icon: 'folder-hook', iconOpen: 'folder-hook-open', color: '#42a5f5', label: 'Hooks' },
  utils: { icon: 'folder-utils', iconOpen: 'folder-utils-open', color: '#ffab40', label: 'Utilities' },
  helpers: { icon: 'folder-utils', iconOpen: 'folder-utils-open', color: '#ffab40', label: 'Helpers' },
  types: { icon: 'folder-types', iconOpen: 'folder-types-open', color: '#3178c6', label: 'Types' },
  interfaces: { icon: 'folder-types', iconOpen: 'folder-types-open', color: '#3178c6', label: 'Interfaces' },
  models: { icon: 'folder-database', iconOpen: 'folder-database-open', color: '#e38c00', label: 'Models' },
  entities: { icon: 'folder-database', iconOpen: 'folder-database-open', color: '#e38c00', label: 'Entities' },
  schemas: { icon: 'folder-database', iconOpen: 'folder-database-open', color: '#e38c00', label: 'Schemas' },
  api: { icon: 'folder-api', iconOpen: 'folder-api-open', color: '#42a5f5', label: 'API' },
  routes: { icon: 'folder-routes', iconOpen: 'folder-routes-open', color: '#42a5f5', label: 'Routes' },
  middleware: { icon: 'folder-middleware', iconOpen: 'folder-middleware-open', color: '#ffab40', label: 'Middleware' },
  services: { icon: 'folder-api', iconOpen: 'folder-api-open', color: '#42a5f5', label: 'Services' },
  store: { icon: 'folder-store', iconOpen: 'folder-store-open', color: '#7c4dff', label: 'Store' },
  stores: { icon: 'folder-store', iconOpen: 'folder-store-open', color: '#7c4dff', label: 'Stores' },
  state: { icon: 'folder-store', iconOpen: 'folder-store-open', color: '#7c4dff', label: 'State' },
  panels: { icon: 'folder-views', iconOpen: 'folder-views-open', color: '#42a5f5', label: 'Panels' },
  docs: { icon: 'folder-docs', iconOpen: 'folder-docs-open', color: '#42a5f5', label: 'Documentation' },
  documentation: { icon: 'folder-docs', iconOpen: 'folder-docs-open', color: '#42a5f5', label: 'Documentation' },
  scripts: { icon: 'folder-scripts', iconOpen: 'folder-scripts-open', color: '#ffab40', label: 'Scripts' },
  tools: { icon: 'folder-tools', iconOpen: 'folder-tools-open', color: '#ffab40', label: 'Tools' },
  i18n: { icon: 'folder-i18n', iconOpen: 'folder-i18n-open', color: '#42a5f5', label: 'i18n' },
  locales: { icon: 'folder-i18n', iconOpen: 'folder-i18n-open', color: '#42a5f5', label: 'Locales' },
  plugins: { icon: 'folder-plugin', iconOpen: 'folder-plugin-open', color: '#42a5f5', label: 'Plugins' },
  extensions: { icon: 'folder-plugin', iconOpen: 'folder-plugin-open', color: '#42a5f5', label: 'Extensions' },
  vendor: { icon: 'folder-node', iconOpen: 'folder-node-open', color: '#8bc34a', label: 'Vendor' },
  migrations: { icon: 'folder-database', iconOpen: 'folder-database-open', color: '#e38c00', label: 'Migrations' },
  fixtures: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Fixtures' },
  mocks: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Mocks' },
  __mocks__: { icon: 'folder-test', iconOpen: 'folder-test-open', color: '#66bb6a', label: 'Mocks' },
  tmp: { icon: 'folder-temp', iconOpen: 'folder-temp-open', color: '#6d8086', label: 'Temporary' },
  temp: { icon: 'folder-temp', iconOpen: 'folder-temp-open', color: '#6d8086', label: 'Temporary' },
}

/* ── Default icons ───────────────────────────────────── */

const DEFAULT_FILE_ICON: IconDef = { icon: 'file', color: '#6d8086', label: 'File' }
const DEFAULT_FOLDER: FolderDef = { icon: 'folder', iconOpen: 'folder-open', color: '#90a4ae', label: 'Folder' }

/* ── Resolution API ──────────────────────────────────── */

export function getFileIcon(fileName: string): FileIconInfo {
  // Check exact filename match first
  const nameLower = fileName.toLowerCase()
  if (FILENAME_ICONS[fileName]) {
    return FILENAME_ICONS[fileName]
  }
  // Case-insensitive filename check
  for (const [key, val] of Object.entries(FILENAME_ICONS)) {
    if (key.toLowerCase() === nameLower) return val
  }

  // Check compound extensions (e.g., .d.ts, .spec.ts, .test.js)
  const parts = fileName.split('.')
  if (parts.length >= 3) {
    const compoundExt = parts.slice(-2).join('.')
    if (EXTENSION_ICONS[compoundExt]) return EXTENSION_ICONS[compoundExt]
  }

  // Check for test/spec files
  if (parts.length >= 2) {
    const pre = parts[parts.length - 2]
    if (pre === 'test' || pre === 'spec') {
      return { icon: 'test', color: '#22da6e', label: `Test (${parts[parts.length - 1]})` }
    }
    if (pre === 'stories' || pre === 'story') {
      return { icon: 'storybook', color: '#ff4785', label: 'Storybook Story' }
    }
  }

  // Check extension
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
  if (ext && EXTENSION_ICONS[ext]) {
    return EXTENSION_ICONS[ext]
  }

  // Check if hidden/dot file
  if (fileName.startsWith('.')) {
    return { icon: 'settings', color: '#6d8086', label: 'Hidden File' }
  }

  return DEFAULT_FILE_ICON
}

export function getFolderIcon(folderName: string, isOpen: boolean = false): FolderIconInfo {
  const lower = folderName.toLowerCase()
  const def = FOLDER_ICONS[lower] || FOLDER_ICONS[folderName]

  if (def) {
    return {
      icon: isOpen ? def.iconOpen : def.icon,
      iconOpen: def.iconOpen,
      color: def.color,
      label: def.label,
    }
  }

  return {
    icon: isOpen ? DEFAULT_FOLDER.iconOpen : DEFAULT_FOLDER.icon,
    iconOpen: DEFAULT_FOLDER.iconOpen,
    color: DEFAULT_FOLDER.color,
    label: folderName,
  }
}

/* ── Language detection from filename ─────────────────── */

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  mjs: 'javascript', cjs: 'javascript',
  mts: 'typescript', cts: 'typescript',
  py: 'python', pyi: 'python', pyw: 'python',
  rs: 'rust', go: 'go',
  c: 'c', h: 'c', cpp: 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp',
  cs: 'csharp', java: 'java', kt: 'kotlin', kts: 'kotlin',
  swift: 'swift', dart: 'dart',
  rb: 'ruby', php: 'php', lua: 'lua', pl: 'perl',
  r: 'r', jl: 'julia', ex: 'elixir', exs: 'elixir',
  erl: 'erlang', hs: 'haskell', ml: 'ocaml', fs: 'fsharp',
  scala: 'scala', clj: 'clojure', zig: 'zig',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', sass: 'sass', less: 'less',
  json: 'json', jsonc: 'jsonc',
  yaml: 'yaml', yml: 'yaml',
  xml: 'xml', svg: 'xml',
  md: 'markdown', mdx: 'mdx',
  sql: 'sql',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript',
  ps1: 'powershell',
  toml: 'toml', ini: 'ini',
  graphql: 'graphql', gql: 'graphql',
  proto: 'protobuf',
  vue: 'vue', svelte: 'svelte', astro: 'astro',
  tf: 'terraform', hcl: 'hcl',
  tex: 'latex', latex: 'latex',
  rst: 'restructuredtext',
  bat: 'bat', cmd: 'bat',
  dockerfile: 'dockerfile',
}

const FILENAME_TO_LANGUAGE: Record<string, string> = {
  'Dockerfile': 'dockerfile',
  'Makefile': 'makefile',
  'CMakeLists.txt': 'cmake',
  'Jenkinsfile': 'groovy',
  'Gemfile': 'ruby',
  'Rakefile': 'ruby',
  'Vagrantfile': 'ruby',
}

export function detectLanguageFromFilename(fileName: string): string {
  // Exact filename match
  if (FILENAME_TO_LANGUAGE[fileName]) {
    return FILENAME_TO_LANGUAGE[fileName]
  }

  // Extension-based
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  return EXTENSION_TO_LANGUAGE[ext] || 'plaintext'
}

/* ── SVG Icon Generation ─────────────────────────────── */

const FILE_SVG_PATHS: Record<string, string> = {
  file: 'M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-7-7z',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  'folder-open': 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v1H7l-2 8h15.2a2 2 0 0 0 1.8-2.8z',
  typescript: 'M3 3h18v18H3V3zm10.71 13.44v1.69c.28.14.61.24.99.32.38.08.78.12 1.19.12.4 0 .77-.05 1.1-.14.33-.09.62-.24.85-.44.24-.2.42-.44.55-.74.13-.3.19-.65.19-1.06 0-.29-.04-.54-.11-.76a2 2 0 0 0-.34-.59 2.5 2.5 0 0 0-.55-.47c-.22-.14-.47-.28-.76-.42-.21-.1-.39-.2-.54-.29a1.9 1.9 0 0 1-.38-.28.96.96 0 0 1-.22-.31.9.9 0 0 1-.07-.36c0-.14.03-.27.08-.38.06-.11.13-.2.23-.28.1-.07.22-.13.37-.17.14-.04.3-.06.48-.06.13 0 .27.01.41.04.14.03.27.07.4.12.13.06.25.12.36.2.11.08.21.16.3.25v-1.53c-.25-.11-.53-.19-.83-.24-.3-.05-.63-.08-.98-.08-.39 0-.75.05-1.08.16-.33.1-.61.26-.85.46-.24.2-.42.45-.55.74-.13.3-.2.64-.2 1.02 0 .49.13.9.39 1.22.26.33.66.61 1.18.84.21.1.4.19.57.28.17.09.32.19.44.29.12.1.21.22.28.35.07.13.1.28.1.46 0 .14-.03.27-.08.38-.05.11-.13.21-.24.29-.1.08-.23.14-.38.18-.16.04-.33.06-.52.06-.35 0-.68-.07-.98-.22a3.3 3.3 0 0 1-.84-.58zM8 10.36h2.42v6.58h1.54v-6.58H14.4V9.07H8v1.29z',
  javascript: 'M3 3h18v18H3V3zm4.73 15.04c.4.85 1.19 1.55 2.54 1.55 1.5 0 2.53-.77 2.53-2.42v-5.59h-1.75v5.49c0 .81-.33 1.02-.86 1.02-.53 0-.75-.36-.99-.78l-1.47.73zm5.86-.18c.49.93 1.43 1.73 3.03 1.73 1.59 0 2.78-.81 2.78-2.24 0-1.33-.76-1.93-2.1-2.49l-.38-.16c-.68-.3-.97-.49-.97-.97 0-.39.3-.69.77-.69.46 0 .76.2.99.69l1.38-.89c-.58-1.02-1.37-1.41-2.37-1.41-1.49 0-2.44.95-2.44 2.2 0 1.3.76 1.91 1.9 2.39l.38.16c.72.31 1.15.5 1.15 1.04 0 .45-.42.78-1.07.78-.78 0-1.23-.4-1.57-.93l-1.48.8z',
  react: 'M12 10.11c1.03 0 1.87.84 1.87 1.89 0 1-.84 1.85-1.87 1.85S10.13 13 10.13 12c0-1.05.84-1.89 1.87-1.89M7.37 20c.63.38 2.01-.2 3.6-1.7-.52-.59-1.03-1.23-1.51-1.9a22.7 22.7 0 0 1-2.4-.36c-.51 2.14-.32 3.61.31 3.96m.71-5.74l-.29-.51c-.11.29-.22.58-.29.86.27.06.57.11.88.16l-.3-.51m6.54-.76l.81-1.5-.81-1.5c-.3-.53-.62-1-.91-1.47C13.17 9 12.6 9 12 9c-.6 0-1.17 0-1.71.03-.29.47-.61.94-.91 1.47L8.57 12l.81 1.5c.3.53.62 1 .91 1.47.54.03 1.11.03 1.71.03.6 0 1.17 0 1.71-.03.29-.47.61-.94.91-1.47M12 6.78c-.19.22-.39.45-.59.72h1.18c-.2-.27-.4-.5-.59-.72m0 10.44c.19-.22.39-.45.59-.72h-1.18c.2.27.4.5.59.72M16.62 4c-.62-.38-2 .2-3.59 1.7.52.59 1.03 1.23 1.51 1.9.82.08 1.63.2 2.4.36.51-2.14.32-3.61-.32-3.96m-.7 5.74l.29.51c.11-.29.22-.58.29-.86-.27-.06-.57-.11-.88-.16l.3.51m1.45-7.05c1.47.84 1.63 3.05 1.01 5.63 2.54.75 4.37 1.99 4.37 3.68 0 1.69-1.83 2.93-4.37 3.68.62 2.58.46 4.79-1.01 5.63-1.46.84-3.45-.12-5.37-1.95-1.92 1.83-3.91 2.79-5.38 1.95-1.46-.84-1.62-3.05-1-5.63-2.54-.75-4.37-1.99-4.37-3.68 0-1.69 1.83-2.93 4.37-3.68-.62-2.58-.46-4.79 1-5.63 1.47-.84 3.46.12 5.38 1.95 1.92-1.83 3.91-2.79 5.37-1.95M17.08 12c.34.75.64 1.5.89 2.26 2.1-.63 3.28-1.53 3.28-2.26 0-.73-1.18-1.63-3.28-2.26-.25.76-.55 1.51-.89 2.26M6.92 12c-.34-.75-.64-1.5-.89-2.26-2.1.63-3.28 1.53-3.28 2.26 0 .73 1.18 1.63 3.28 2.26.25-.76.55-1.51.89-2.26m9 2.26l-.3.51c.31-.05.61-.1.88-.16-.07-.28-.18-.57-.29-.86l-.29.51m-9.82 1.7c.54.16 1.14.29 1.78.38.24-.44.47-.87.7-1.31l-.7-1.32c-.56.43-1.06.88-1.51 1.33l-.27.92m9.81-7.92c-.54-.16-1.14-.29-1.78-.38-.24.44-.47.87-.7 1.31l.7 1.32c.56-.43 1.06-.88 1.51-1.33l.27-.92M8.51 7.96c-.56.43-1.06.88-1.51 1.33l-.27.92c.54.16 1.14.29 1.78.38.24-.44.47-.87.7-1.31l-.7-1.32m6.97 8.08c.56-.43 1.06-.88 1.51-1.33l.27-.92c-.54-.16-1.14-.29-1.78-.38-.24.44-.47.87-.7 1.31l.7 1.32',
  python: 'M12 2c-1.67 0-3 .53-3.92 1.33-.83.72-1.33 1.73-1.33 2.92v1.75h4.5v.75H5.5c-1.15 0-2.17.46-2.92 1.33C1.83 10.83 1.33 12 1.33 13.5c0 1.67.5 2.83 1.25 3.67.75.83 1.77 1.33 2.92 1.33h1.75V16c0-1.33.97-2.5 2.25-2.75h4.5c.67 0 1.25-.25 1.67-.67.42-.42.67-1 .67-1.58V6.25c0-1.19-.5-2.2-1.33-2.92C14.08 2.53 13 2 12 2zm-2.25 1.5c.42 0 .75.33.75.75s-.33.75-.75.75-.75-.33-.75-.75.33-.75.75-.75zM18.5 8.5V11c0 1.33-.97 2.5-2.25 2.75h-4.5c-.67 0-1.25.25-1.67.67-.42.42-.67 1-.67 1.58v4.75c0 1.19.5 2.2 1.33 2.92.92.8 2 1.33 3.42 1.33 1.67 0 2.83-.53 3.75-1.33.83-.72 1.33-1.73 1.33-2.92v-1.75h-4.5v-.75h5.75c1.15 0 2.17-.46 2.92-1.33.75-.83 1.25-2 1.25-3.5 0-1.67-.5-2.83-1.25-3.67-.75-.83-1.77-1.33-2.92-1.33H18.5zm1.75 11c.42 0 .75.33.75.75s-.33.75-.75.75-.75-.33-.75-.75.33-.75.75-.75z',
  rust: 'M23.83 11.29l-1.47-.86a10.36 10.36 0 0 0-.14-1.1l1.22-1.16a.48.48 0 0 0-.16-.76l-1.47-.58a10.4 10.4 0 0 0-.47-1.01l.89-1.4a.48.48 0 0 0-.35-.73l-1.55-.26a10.3 10.3 0 0 0-.75-.85l.5-1.57a.48.48 0 0 0-.51-.62l-1.57.08c-.33-.23-.67-.44-1.03-.62l.08-1.57a.48.48 0 0 0-.62-.51l-1.57.5c-.3-.2-.6-.37-.91-.52L14.02.36a.48.48 0 0 0-.73-.35l-1.4.89c-.33-.14-.68-.26-1.03-.36L10.28.07a.48.48 0 0 0-.76-.16l-1.16 1.22c-.37.04-.73.09-1.1.18l-.86-1.47a.48.48 0 0 0-.79 0l-.86 1.47a10.3 10.3 0 0 0-1.1.14L2.49 0a.48.48 0 0 0-.76.16l-.58 1.47c-.35.14-.69.3-1.01.47L-1.26 1.21a.48.48 0 0 0-.73.35l-.26 1.55c-.3.23-.58.48-.85.75L-4.67 3.34a.48.48 0 0 0-.62.51l.08 1.57c-.22.32-.43.67-.62 1.03L-7.4 6.37a.48.48 0 0 0-.51.62l.5 1.57',
  go: 'M3 3l1.78-.02.02 1.78-1.78.02L3 3zm4 0h9v2H7V3zm0 4h9v2H7V7zm-4 4h16v2H3v-2zm0 4h16v2H3v-2zm0 4h9v2H3v-2z',
  markdown: 'M2 4h20v16H2V4zm3 12V8l3 4 3-4v8h2V8h2l3 4 3-4v8',
  image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  database: 'M12 3C7 3 3 4.79 3 7v10c0 2.21 4 4 9 4s9-1.79 9-4V7c0-2.21-4-4-9-4zm0 2c4.42 0 7 1.4 7 2s-2.58 2-7 2-7-1.4-7-2 2.58-2 7-2z',
  settings: 'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z',
}

export function getFileIconSVG(
  iconId: string,
  color: string,
  size: number = 16
): string {
  const path = FILE_SVG_PATHS[iconId] || FILE_SVG_PATHS.file
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="${color}" stroke-width="0"><path d="${path}"/></svg>`
}

/* ── Get all available extensions ────────────────────── */

export function getAllSupportedExtensions(): string[] {
  return Object.keys(EXTENSION_ICONS)
}

export function getAllSpecialFilenames(): string[] {
  return Object.keys(FILENAME_ICONS)
}

export function getAllFolderNames(): string[] {
  return Object.keys(FOLDER_ICONS)
}
