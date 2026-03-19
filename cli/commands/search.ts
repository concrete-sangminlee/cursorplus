/**
 * Orion CLI - Codebase Search + AI Analysis Command
 * Search project files for a pattern, then ask AI to analyze the matches.
 * Inspired by Aider /search and Claude Code's codebase awareness.
 *
 * Usage:
 *   orion search "authentication"           # Search codebase + AI analysis
 *   orion search "TODO" --type comment      # Find TODOs and get AI analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import { askAI } from '../ai-client.js';
import {
  colors,
  startSpinner,
  getCurrentDirectoryContext,
  loadProjectContext,
  detectLanguage,
} from '../utils.js';
import { createStreamHandler, printCommandError } from '../shared.js';
import { commandHeader, box, statusLine, divider, palette, table as uiTable } from '../ui.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.cache', 'coverage', '.nyc_output', '.turbo',
  '.svelte-kit', '.output', 'target', 'vendor', '.venv', 'venv',
  'env', '.tox', '.eggs', '*.egg-info', '.orion',
]);

const SEARCHABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw',
  '.rs', '.go', '.java', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.rb', '.php', '.swift', '.kt', '.scala', '.r',
  '.sql', '.sh', '.bash', '.zsh', '.ps1',
  '.html', '.css', '.scss', '.less', '.sass',
  '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.cfg',
  '.md', '.txt', '.env', '.dockerfile',
  '.vue', '.svelte', '.astro',
  '.lua', '.dart', '.ex', '.exs', '.erl', '.hs', '.ml',
  '.clj', '.lisp', '.elm', '.zig', '.nim',
]);

const MAX_FILE_SIZE = 512 * 1024; // 512 KB
const MAX_FILES = 5000;
const MAX_MATCHES = 100;
const CONTEXT_LINES = 2;

const SEARCH_SYSTEM_PROMPT = `You are Orion, an expert AI coding assistant.
The user searched their codebase for a pattern. Below are the matching results.
Analyze the matches and provide:

1. **Summary**: What the pattern is used for across the codebase
2. **Key Findings**: Notable patterns, potential issues, or interesting usage
3. **Suggestions**: Improvements, refactoring opportunities, or potential bugs

Be concise and actionable. Reference specific files and line numbers.`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
  context: string[];
}

export interface SearchOptions {
  type?: string;       // 'comment', 'code', 'all' (default: 'all')
  maxResults?: number;
  noAi?: boolean;      // Skip AI analysis, just show results
}

// ─── File Discovery ─────────────────────────────────────────────────────────

function discoverFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(currentDir: string, depth: number): void {
    if (depth > 8 || files.length >= MAX_FILES) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) break;

      const name = entry.name;

      // Skip hidden files/dirs (except common config files)
      if (name.startsWith('.') && !name.startsWith('.env')) {
        if (IGNORE_DIRS.has(name)) continue;
      }

      const fullPath = path.join(currentDir, name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(name)) {
          walk(fullPath, depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(name).toLowerCase();
        if (SEARCHABLE_EXTENSIONS.has(ext) || name === 'Dockerfile' || name === 'Makefile') {
          try {
            const stat = fs.statSync(fullPath);
            if (stat.size <= MAX_FILE_SIZE) {
              files.push(fullPath);
            }
          } catch { /* skip */ }
        }
      }
    }
  }

  walk(dir, 0);
  return files;
}

// ─── Search Engine ──────────────────────────────────────────────────────────

function isCommentLine(line: string, ext: string): boolean {
  const trimmed = line.trim();

  // C-style single-line comments
  if (['.ts', '.tsx', '.js', '.jsx', '.java', '.c', '.cpp', '.cs', '.go', '.rs', '.swift', '.kt', '.scala', '.dart'].some(e => ext === e)) {
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return true;
  }
  // Python / Ruby / Shell comments
  if (['.py', '.rb', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.r'].some(e => ext === e)) {
    if (trimmed.startsWith('#')) return true;
  }
  // HTML / XML comments
  if (['.html', '.xml', '.vue', '.svelte'].some(e => ext === e)) {
    if (trimmed.startsWith('<!--')) return true;
  }
  // Lua / SQL comments
  if (ext === '.lua' && trimmed.startsWith('--')) return true;
  if (ext === '.sql' && (trimmed.startsWith('--') || trimmed.startsWith('/*'))) return true;

  return false;
}

function searchFiles(
  files: string[],
  pattern: string,
  options: SearchOptions
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const regex = new RegExp(escapeRegExp(pattern), 'gi');
  const typeFilter = options.type || 'all';

  for (const file of files) {
    if (matches.length >= (options.maxResults || MAX_MATCHES)) break;

    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split(/\r?\n/);
    const ext = path.extname(file).toLowerCase();

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= (options.maxResults || MAX_MATCHES)) break;

      const line = lines[i];
      if (!regex.test(line)) {
        regex.lastIndex = 0;
        continue;
      }
      regex.lastIndex = 0;

      // Apply type filter
      if (typeFilter === 'comment' && !isCommentLine(line, ext)) continue;
      if (typeFilter === 'code' && isCommentLine(line, ext)) continue;

      // Gather context lines
      const contextStart = Math.max(0, i - CONTEXT_LINES);
      const contextEnd = Math.min(lines.length - 1, i + CONTEXT_LINES);
      const context: string[] = [];
      for (let j = contextStart; j <= contextEnd; j++) {
        const prefix = j === i ? '>' : ' ';
        context.push(`${prefix} ${String(j + 1).padStart(4)} | ${lines[j]}`);
      }

      matches.push({
        file,
        line: i + 1,
        content: line.trim(),
        context,
      });
    }
  }

  return matches;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Display ────────────────────────────────────────────────────────────────

function displayMatches(matches: SearchMatch[], pattern: string): void {
  // Group matches by file
  const byFile = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const existing = byFile.get(match.file) || [];
    existing.push(match);
    byFile.set(match.file, existing);
  }

  const cwd = process.cwd();

  for (const [file, fileMatches] of byFile) {
    const relPath = path.relative(cwd, file);
    const lang = detectLanguage(file);

    console.log(`  ${colors.file(relPath)} ${palette.dim(`(${lang}, ${fileMatches.length} match${fileMatches.length > 1 ? 'es' : ''})`)}`);

    for (const match of fileMatches) {
      for (const ctxLine of match.context) {
        const isMatchLine = ctxLine.startsWith('>');
        if (isMatchLine) {
          // Highlight the matching text
          const highlighted = ctxLine.replace(
            new RegExp(escapeRegExp(pattern), 'gi'),
            (m) => palette.yellow.bold(m)
          );
          console.log(`    ${palette.green(highlighted)}`);
        } else {
          console.log(`    ${palette.dim(ctxLine)}`);
        }
      }
      console.log();
    }
  }
}

function buildMatchSummary(matches: SearchMatch[], pattern: string): string {
  const cwd = process.cwd();
  const lines: string[] = [];

  lines.push(`Search pattern: "${pattern}"`);
  lines.push(`Total matches: ${matches.length}`);
  lines.push('');

  // Group by file for the summary
  const byFile = new Map<string, SearchMatch[]>();
  for (const match of matches) {
    const existing = byFile.get(match.file) || [];
    existing.push(match);
    byFile.set(match.file, existing);
  }

  lines.push('Matches by file:');
  for (const [file, fileMatches] of byFile) {
    const relPath = path.relative(cwd, file);
    lines.push(`\n--- ${relPath} ---`);
    for (const match of fileMatches) {
      lines.push(`Line ${match.line}: ${match.content}`);
    }
  }

  return lines.join('\n');
}

// ─── Command Entry Point ────────────────────────────────────────────────────

export async function searchCommand(pattern: string, options: SearchOptions = {}): Promise<void> {
  if (!pattern || !pattern.trim()) {
    console.log();
    console.log(`  ${colors.error('Please provide a search pattern.')}`);
    console.log(`  ${colors.dim('Usage: orion search "authentication"')}`);
    console.log(`  ${colors.dim('       orion search "TODO" --type comment')}`);
    console.log();
    process.exit(1);
  }

  const typeLabel = options.type && options.type !== 'all' ? ` (${options.type} only)` : '';

  console.log(commandHeader('Orion Codebase Search', [
    ['Pattern', `"${pattern}"${typeLabel}`],
    ['Directory', process.cwd()],
  ]));

  // Discover files
  const fileSpinner = startSpinner('Scanning project files...');
  const cwd = process.cwd();
  const files = discoverFiles(cwd);
  fileSpinner.succeed(palette.green(`Found ${files.length} searchable files`));

  // Search
  const searchSpinner = startSpinner(`Searching for "${pattern}"...`);
  const matches = searchFiles(files, pattern, options);

  if (matches.length === 0) {
    searchSpinner.fail(palette.red('No matches found'));
    console.log();
    console.log(`  ${palette.dim('Try a different search term or check your --type filter.')}`);
    console.log();
    return;
  }

  searchSpinner.succeed(
    palette.green(`${matches.length} match${matches.length > 1 ? 'es' : ''} across ${new Set(matches.map(m => m.file)).size} file${new Set(matches.map(m => m.file)).size > 1 ? 's' : ''}`)
  );
  console.log();

  // Display matches
  displayMatches(matches, pattern);
  console.log(divider('Results'));
  console.log();

  // Skip AI analysis if --no-ai flag
  if (options.noAi) {
    return;
  }

  // AI analysis of search results
  const aiSpinner = startSpinner('Analyzing matches with AI...');

  const matchSummary = buildMatchSummary(matches, pattern);
  const context = getCurrentDirectoryContext();
  const projectContext = loadProjectContext();

  const fullSystemPrompt = projectContext
    ? SEARCH_SYSTEM_PROMPT + '\n\nWorkspace context:\n' + context + '\n\nProject context:\n' + projectContext
    : SEARCH_SYSTEM_PROMPT + '\n\nWorkspace context:\n' + context;

  const { callbacks } = createStreamHandler(aiSpinner, {
    label: 'AI Analysis:',
    markdown: true,
  });

  try {
    await askAI(fullSystemPrompt, matchSummary, callbacks);
    console.log();
  } catch (err: any) {
    printCommandError(err, 'search', 'Run `orion config` to check your AI provider settings.');
    process.exit(1);
  }
}
