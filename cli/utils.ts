/**
 * Orion CLI - Shared Utilities
 * Config management, formatting helpers, git runner, file utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync, exec } from 'child_process';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

// ─── Config Management ──────────────────────────────────────────────────────

const CONFIG_DIR = path.join(os.homedir(), '.orion');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export interface OrionConfig {
  provider?: 'anthropic' | 'openai' | 'ollama';
  model?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ollamaHost?: string;
  theme?: 'dark' | 'light';
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_CONFIG: OrionConfig = {
  provider: 'ollama',
  model: 'llama3.2',
  ollamaHost: 'http://localhost:11434',
  theme: 'dark',
  maxTokens: 4096,
  temperature: 0.7,
};

export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function readConfig(): OrionConfig {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
  return { ...DEFAULT_CONFIG };
}

export function writeConfig(config: OrionConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

// ─── Spinner Management ─────────────────────────────────────────────────────

let activeSpinner: Ora | null = null;

export function startSpinner(text: string): Ora {
  if (activeSpinner) {
    activeSpinner.stop();
  }
  activeSpinner = ora({
    text: chalk.dim(text),
    spinner: 'dots12',
    color: 'cyan',
  }).start();
  return activeSpinner;
}

export function stopSpinner(spinner?: Ora, text?: string, success = true): void {
  const s = spinner || activeSpinner;
  if (s) {
    if (text) {
      success ? s.succeed(chalk.green(text)) : s.fail(chalk.red(text));
    } else {
      s.stop();
    }
    if (s === activeSpinner) activeSpinner = null;
  }
}

// ─── Color Formatting Helpers ────────────────────────────────────────────────

export const colors = {
  // Semantic colors
  primary: chalk.hex('#7C5CFC'),
  secondary: chalk.hex('#38BDF8'),
  success: chalk.hex('#22C55E'),
  warning: chalk.hex('#F59E0B'),
  error: chalk.hex('#EF4444'),
  info: chalk.hex('#3B82F6'),
  dim: chalk.dim,

  // Text roles
  user: chalk.cyan.bold,
  ai: chalk.green,
  code: chalk.yellow,
  file: chalk.hex('#38BDF8').underline,
  command: chalk.hex('#C084FC'),
  label: chalk.hex('#7C5CFC').bold,
  muted: chalk.gray,

  // Severity
  severityError: chalk.bgRed.white.bold,
  severityWarning: chalk.bgYellow.black.bold,
  severityInfo: chalk.bgBlue.white.bold,
};

export function printHeader(text: string): void {
  const line = colors.primary('─'.repeat(60));
  console.log(line);
  console.log(colors.primary.bold(`  ${text}`));
  console.log(line);
}

export function printDivider(): void {
  console.log(colors.dim('─'.repeat(60)));
}

export function printKeyValue(key: string, value: string): void {
  console.log(`  ${colors.label(key + ':')} ${value}`);
}

export function printSuccess(text: string): void {
  console.log(`  ${chalk.green('+')} ${text}`);
}

export function printError(text: string): void {
  console.log(`  ${chalk.red('x')} ${text}`);
}

export function printWarning(text: string): void {
  console.log(`  ${chalk.yellow('!')} ${text}`);
}

export function printInfo(text: string): void {
  console.log(`  ${chalk.blue('i')} ${text}`);
}

// ─── ASCII Art Banner ────────────────────────────────────────────────────────

export function printBanner(): void {
  const banner = `
${chalk.hex('#7C5CFC').bold(`   ____       _             `)}
${chalk.hex('#7C5CFC').bold(`  / __ \\     (_)            `)}
${chalk.hex('#8B6FFC').bold(`  | |  | |_ __ _  ___  _ __  `)}
${chalk.hex('#9B82FC').bold(`  | |  | | '__| |/ _ \\| '_ \\ `)}
${chalk.hex('#AA95FC').bold(`  | |__| | |  | | (_) | | | |`)}
${chalk.hex('#B9A8FC').bold(`   \\____/|_|  |_|\\___/|_| |_|`)}
${chalk.hex('#C8BBFC').bold(`                              `)}
${colors.dim('  AI-Powered Coding Assistant')}
${colors.dim(`  v2.0.0 | ${chalk.underline('https://orion-ide.dev')}`)}
`;
  console.log(banner);
}

// ─── Git Command Runner ──────────────────────────────────────────────────────

export function runGitCommand(args: string): string {
  try {
    return execSync(`git ${args}`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      cwd: process.cwd(),
    }).trim();
  } catch (err: any) {
    if (err.stderr) {
      throw new Error(`Git error: ${err.stderr.toString().trim()}`);
    }
    throw err;
  }
}

export function isGitRepo(): boolean {
  try {
    runGitCommand('rev-parse --is-inside-work-tree');
    return true;
  } catch {
    return false;
  }
}

export function getStagedDiff(): string {
  return runGitCommand('diff --cached');
}

export function getStagedFiles(): string[] {
  const output = runGitCommand('diff --cached --name-only');
  return output ? output.split('\n').filter(Boolean) : [];
}

export function commitWithMessage(message: string): string {
  return runGitCommand(`commit -m "${message.replace(/"/g, '\\"')}"`);
}

// ─── File Utilities ──────────────────────────────────────────────────────────

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.r': 'r',
  '.sql': 'sql',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'zsh',
  '.ps1': 'powershell',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.xml': 'xml',
  '.md': 'markdown',
  '.toml': 'toml',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.env': 'env',
  '.dockerfile': 'dockerfile',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.lua': 'lua',
  '.dart': 'dart',
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',
  '.hs': 'haskell',
  '.ml': 'ocaml',
  '.clj': 'clojure',
  '.lisp': 'lisp',
};

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];

  const basename = path.basename(filePath).toLowerCase();
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  if (basename === '.gitignore') return 'gitignore';

  return 'text';
}

export function readFileContent(filePath: string): { content: string; language: string } {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.size > 1024 * 1024) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 1MB.`);
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const language = detectLanguage(resolvedPath);
  return { content, language };
}

export function writeFileContent(filePath: string, content: string): void {
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(resolvedPath, content, 'utf-8');
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(path.resolve(filePath));
}

// ─── Diff Formatting ─────────────────────────────────────────────────────────

export function formatDiff(original: string, modified: string): string {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const output: string[] = [];

  const maxLines = Math.max(origLines.length, modLines.length);

  for (let i = 0; i < maxLines; i++) {
    const origLine = origLines[i];
    const modLine = modLines[i];

    if (origLine === undefined && modLine !== undefined) {
      output.push(chalk.green(`+ ${modLine}`));
    } else if (origLine !== undefined && modLine === undefined) {
      output.push(chalk.red(`- ${origLine}`));
    } else if (origLine !== modLine) {
      output.push(chalk.red(`- ${origLine}`));
      output.push(chalk.green(`+ ${modLine}`));
    } else {
      output.push(chalk.dim(`  ${origLine}`));
    }
  }

  return output.join('\n');
}

// ─── Prompt Helpers ──────────────────────────────────────────────────────────

export function getCurrentDirectoryContext(): string {
  const cwd = process.cwd();
  const projectName = path.basename(cwd);
  let context = `Current directory: ${cwd}\nProject: ${projectName}\n`;

  // Check for package.json
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      context += `Package: ${pkg.name || 'unknown'} v${pkg.version || '0.0.0'}\n`;
      if (pkg.description) context += `Description: ${pkg.description}\n`;
    } catch { /* ignore */ }
  }

  // Check for common config files
  const configs = ['tsconfig.json', '.eslintrc', 'vite.config.ts', 'webpack.config.js', 'Cargo.toml', 'go.mod', 'requirements.txt'];
  const found = configs.filter(c => fs.existsSync(path.join(cwd, c)));
  if (found.length > 0) {
    context += `Config files: ${found.join(', ')}\n`;
  }

  return context;
}

export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}
